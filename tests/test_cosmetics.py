"""装扮系统单测。

运行: uv run pytest tests/test_cosmetics.py -v
"""
from __future__ import annotations


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
