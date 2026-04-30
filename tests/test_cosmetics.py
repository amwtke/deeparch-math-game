"""装扮系统单测。

运行: uv run pytest tests/test_cosmetics.py -v
"""
from __future__ import annotations

import pytest


def test_cosmetics_registry_structure():
    """COSMETICS 白名单结构校验。"""
    from backend.cosmetics import COSMETICS, SLOTS

    assert SLOTS == ("head", "top", "hand", "legs")

    # 每个 slot 5 件,共 20 件
    by_slot: dict[str, list[str]] = {s: [] for s in SLOTS}
    for cid, meta in COSMETICS.items():
        assert meta["slot"] in SLOTS, f"{cid} bad slot"
        assert isinstance(meta["price"], int) and meta["price"] > 0, f"{cid} bad price"
        by_slot[meta["slot"]].append(cid)

    for slot, ids in by_slot.items():
        assert len(ids) == 5, f"{slot} should have 5 cosmetics, has {len(ids)}"

    # ID 唯一(由 dict 保证),但价格区间合理
    prices = [m["price"] for m in COSMETICS.values()]
    assert min(prices) >= 30, "cheapest must be >= 30 coins"
    assert max(prices) <= 400, "most expensive must be <= 400 coins"


def test_schema_migration_fresh_db(tmp_path, monkeypatch):
    """新 db: init_db 后 player_state 含新字段。"""
    from backend import db as db_mod
    monkeypatch.setattr(db_mod, "DB_PATH", tmp_path / "fresh.db")
    db_mod.init_db()

    with db_mod.get_conn() as conn:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(player_state)")}
        assert "owned_cosmetics" in cols
        assert "equipped_cosmetics" in cols


def test_schema_migration_legacy_db(tmp_path, monkeypatch):
    """老 db (无新字段): init_db 自动 ALTER 加上,数据保留。"""
    import sqlite3
    legacy_db = tmp_path / "legacy.db"
    # 模拟老 schema (没有新字段)
    conn = sqlite3.connect(legacy_db)
    conn.executescript("""
        CREATE TABLE player_state (
            id INTEGER PRIMARY KEY,
            total_coins INTEGER DEFAULT 0,
            total_correct INTEGER DEFAULT 0,
            total_answered INTEGER DEFAULT 0,
            best_combo INTEGER DEFAULT 0,
            badges TEXT DEFAULT '{}'
        );
        INSERT INTO player_state (id, total_coins) VALUES (1, 99);
    """)
    conn.commit()
    conn.close()

    from backend import db as db_mod
    monkeypatch.setattr(db_mod, "DB_PATH", legacy_db)
    db_mod.init_db()

    with db_mod.get_conn() as conn:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(player_state)")}
        assert "owned_cosmetics" in cols
        assert "equipped_cosmetics" in cols
        # 老数据保留
        row = conn.execute("SELECT total_coins, owned_cosmetics, equipped_cosmetics FROM player_state WHERE id=1").fetchone()
        assert row[0] == 99
        assert row[1] == "[]"
        assert row[2] == "{}"


def test_state_returns_cosmetics_fields(client):
    """新建玩家 GET /api/state 返回 owned_cosmetics 和 equipped_cosmetics。"""
    r = client.get("/api/state")
    assert r.status_code == 200
    data = r.json()
    assert data["owned_cosmetics"] == []
    assert data["equipped_cosmetics"] == {
        "head": None, "top": None, "hand": None, "legs": None
    }


def test_set_equipped_assigns_slot(client):
    """set_equipped 设置槽位,get_player_state 读出。"""
    from backend import db
    # 先把 princess_crown 加进 owned (绕过 buy 直接构造状态)
    with db.get_conn() as conn:
        conn.execute(
            "UPDATE player_state SET owned_cosmetics = ? WHERE id = 1",
            ('["princess_crown"]',)
        )
    db.set_equipped("head", "princess_crown")
    state = db.get_player_state()
    assert state["equipped_cosmetics"]["head"] == "princess_crown"


def test_set_equipped_clears_slot(client):
    """set_equipped(slot, None) 清空槽位。"""
    from backend import db
    with db.get_conn() as conn:
        conn.execute(
            "UPDATE player_state SET owned_cosmetics = ?, equipped_cosmetics = ? WHERE id = 1",
            ('["princess_crown"]', '{"head": "princess_crown"}')
        )
    db.set_equipped("head", None)
    state = db.get_player_state()
    assert state["equipped_cosmetics"]["head"] is None


def test_buy_cosmetic_success(client):
    """金币足、未拥有 → 成功扣钱、加入 owned、自动装备。"""
    from backend import db
    # 先给玩家放 200 金币
    with db.get_conn() as conn:
        conn.execute("UPDATE player_state SET total_coins = 200 WHERE id = 1")

    state = db.buy_cosmetic("princess_crown", "head", 120)
    assert state is not None
    assert state["total_coins"] == 80
    assert "princess_crown" in state["owned_cosmetics"]
    assert state["equipped_cosmetics"]["head"] == "princess_crown"


def test_buy_cosmetic_insufficient_coins_raises(client):
    """金币不够 → 抛 BuyCosmeticError('insufficient_coins')。"""
    from backend import db
    with db.get_conn() as conn:
        conn.execute("UPDATE player_state SET total_coins = 50 WHERE id = 1")

    with pytest.raises(db.BuyCosmeticError) as exc:
        db.buy_cosmetic("princess_crown", "head", 120)
    assert exc.value.reason == "insufficient_coins"

    state = db.get_player_state()
    assert state["total_coins"] == 50
    assert state["owned_cosmetics"] == []


def test_buy_cosmetic_already_owned_raises(client):
    """已拥有再买 → 抛 BuyCosmeticError('already_owned'),不扣钱。"""
    from backend import db
    with db.get_conn() as conn:
        conn.execute(
            "UPDATE player_state SET total_coins = 500, owned_cosmetics = ? WHERE id = 1",
            ('["princess_crown"]',)
        )

    with pytest.raises(db.BuyCosmeticError) as exc:
        db.buy_cosmetic("princess_crown", "head", 120)
    assert exc.value.reason == "already_owned"

    state = db.get_player_state()
    assert state["total_coins"] == 500


def test_buy_cosmetic_concurrent_double_click(client):
    """两个线程同时买同一件,刚好一份钱:
    一个成功 (拿到 owned + 扣钱),另一个收 BuyCosmeticError('already_owned')。
    BEGIN IMMEDIATE 是这个测试唯一能防住的方案。
    """
    import threading
    from backend import db

    with db.get_conn() as conn:
        conn.execute("UPDATE player_state SET total_coins = 120 WHERE id = 1")

    results: list[tuple[str, object]] = []

    def attempt() -> None:
        try:
            r = db.buy_cosmetic("princess_crown", "head", 120)
            results.append(("ok", r))
        except db.BuyCosmeticError as e:
            results.append(("err", e.reason))

    t1 = threading.Thread(target=attempt)
    t2 = threading.Thread(target=attempt)
    t1.start(); t2.start(); t1.join(); t2.join()

    oks = [r for r in results if r[0] == "ok"]
    errs = [r for r in results if r[0] == "err"]
    assert len(oks) == 1, f"expected exactly 1 success, got {results}"
    assert len(errs) == 1, f"expected exactly 1 error, got {results}"
    # 第二个失败:可能是 already_owned (慢线程跑到 owned 检查时第一个已 commit)
    # 也可能是 insufficient_coins (慢线程跑到 coin 检查时金币已扣到 0)
    # 两种都是正确的,因为它们都意味着第一个已经成功
    assert errs[0][1] in ("already_owned", "insufficient_coins")

    state = db.get_player_state()
    assert state["total_coins"] == 0
    assert state["owned_cosmetics"] == ["princess_crown"]
    assert state["equipped_cosmetics"]["head"] == "princess_crown"


def test_equip_owned_cosmetic(client):
    """拥有的装扮可以装备到正确槽位。"""
    from backend import db
    with db.get_conn() as conn:
        conn.execute(
            "UPDATE player_state SET owned_cosmetics = ? WHERE id = 1",
            ('["princess_crown"]',)
        )

    r = client.post("/api/cosmetics/equip",
                    json={"slot": "head", "cosmetic_id": "princess_crown"})
    assert r.status_code == 200
    assert r.json()["equipped_cosmetics"]["head"] == "princess_crown"


def test_equip_null_clears_slot(client):
    """cosmetic_id=None 清空槽位。"""
    from backend import db
    with db.get_conn() as conn:
        conn.execute(
            "UPDATE player_state SET owned_cosmetics = ?, equipped_cosmetics = ? WHERE id = 1",
            ('["princess_crown"]', '{"head": "princess_crown"}')
        )
    r = client.post("/api/cosmetics/equip",
                    json={"slot": "head", "cosmetic_id": None})
    assert r.status_code == 200
    assert r.json()["equipped_cosmetics"]["head"] is None


def test_equip_unknown_cosmetic_400(client):
    r = client.post("/api/cosmetics/equip",
                    json={"slot": "head", "cosmetic_id": "fake_id"})
    assert r.status_code == 400


def test_equip_wrong_slot_400(client):
    """princess_crown 是 head,不能装到 top。"""
    from backend import db
    with db.get_conn() as conn:
        conn.execute(
            "UPDATE player_state SET owned_cosmetics = ? WHERE id = 1",
            ('["princess_crown"]',)
        )
    r = client.post("/api/cosmetics/equip",
                    json={"slot": "top", "cosmetic_id": "princess_crown"})
    assert r.status_code == 400


def test_equip_not_owned_400(client):
    """没买过的装扮不能装备。"""
    r = client.post("/api/cosmetics/equip",
                    json={"slot": "head", "cosmetic_id": "princess_crown"})
    assert r.status_code == 400


def test_equip_invalid_slot_400(client):
    r = client.post("/api/cosmetics/equip",
                    json={"slot": "bad_slot", "cosmetic_id": None})
    assert r.status_code in (400, 422)  # 422 也行 (pydantic)
