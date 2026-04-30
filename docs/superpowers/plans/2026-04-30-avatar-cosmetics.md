# Avatar Cosmetics 装扮系统 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在主页左侧加一个 Alex 风格的可点击女孩角色,孩子用答题攒来的金币购买/装备 4 槽位 (head/top/hand/legs) 共 20 件装扮。

**Architecture:** 后端 SQLite 持久化 `owned_cosmetics`/`equipped_cosmetics`,通过 `BEGIN IMMEDIATE` 原子地完成购买。前端用 SVG(viewBox 192x384)分层渲染:基底层(裸 Alex 皮肤+头发)→ DEFAULT_TOP/LEGS(无装扮时)→ 装扮层(top → legs → hand → head 顺序,head 最后画保证在最上)。装扮目录在前端定义(双 SVG:icon + onAvatar),后端用一份白名单(只含 id/slot/price)校验。

**Tech Stack:** Python 3.11 / FastAPI / SQLite / 原生 JS / SVG / pytest

**Spec 参考:** `docs/superpowers/specs/2026-04-30-avatar-cosmetics-design.md`

---

## File Structure

**新建**:
- `backend/cosmetics.py` — 装扮白名单 (id → slot, price)
- `frontend/js/avatar/catalog.js` — 装扮目录(SVG 渲染函数 + 元数据)
- `frontend/js/avatar/avatar.js` — Alex 主渲染 + 默认套装 SVG
- `frontend/js/avatar/home-tile.js` — 主页角色展示位 (可点击)
- `frontend/js/avatar/shop.js` — 装扮商店屏 + 试穿/购买/装备状态机
- `frontend/css/avatar.css` — 角色 + 商店样式
- `tests/test_cosmetics.py` — 后端单测

**修改**:
- `backend/db.py` — schema 迁移 + 新数据访问函数 + 扩展 `get_player_state`
- `backend/api.py` — 新增 2 个 endpoint
- `backend/models.py` — 新增/扩展 Pydantic 模型
- `frontend/index.html` — 引入新文件
- `frontend/js/platform.js` — 主页布局(左侧角色位)+ `enterShop()` 入口

---

## Render Order (重要)

`avatar.js` 的 `Avatar.render(equipped)` 必须按以下顺序输出 SVG 元素:

1. **BASE** — 头/发/脸/裸皮肤躯干、四肢、手、脚 (永远画)
2. **DEFAULT_TOP** — 绿 T 恤 + 短袖 (仅当 `equipped.top == null` 时画)
3. **DEFAULT_LEGS** — 棕裤 + 灰鞋 (仅当 `equipped.legs == null` 时画)
4. **top cosmetic** (如果有)
5. **legs cosmetic** (如果有)
6. **hand cosmetic** (如果有)
7. **head cosmetic** (如果有,最后画 → 永远在最上,保证王冠盖头发)

## 槽位锚点约定 (cosmetic onAvatar SVG 内坐标系)

父 SVG viewBox = `0 0 192 384`。每个 cosmetic 的 `renderOnAvatar()` 直接用这个坐标系画。

| Slot | 矩形锚点 | 说明 |
|------|----------|------|
| head | x=24-168, y=-30 to y=24 | 允许超出 viewBox 上沿(高皇冠/兔耳) |
| top | x=12-180, y=108-240 | 覆盖默认 T 恤;含袖子区域(若 cosmetic 想画长袖,可延伸到 y=228) |
| hand | x=12-200, y=180-260 | 主要在右手位置(x=144-180);也可覆盖到左手 |
| legs | x=36-156, y=240-372 | 含脚部 |

**约束**:cosmetic 必须留在自己 slot 的锚点区域内,不要跨槽位画(否则 z-order 不稳)。

---

## Tasks

### Task 1: 后端装扮白名单 (cosmetics.py)

**Files:**
- Create: `backend/cosmetics.py`
- Test: `tests/test_cosmetics.py`

**Why:** 后端校验购买/装备请求合法性的权威表;前端 catalog.js 是这份表的"上层视图"(加了 SVG 函数和名字)。

- [ ] **Step 1: 创建测试文件**

```python
# tests/test_cosmetics.py
"""装扮系统单测。

运行: uv run pytest tests/test_cosmetics.py -v
"""
from __future__ import annotations

import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


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
```

- [ ] **Step 2: 跑测试看失败**

Run: `uv run pytest tests/test_cosmetics.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'backend.cosmetics'`

- [ ] **Step 3: 创建 cosmetics.py**

```python
# backend/cosmetics.py
"""装扮白名单。前端 catalog.js 必须保持 id/slot/price 同步。"""
from __future__ import annotations

SLOTS = ("head", "top", "hand", "legs")

COSMETICS: dict[str, dict] = {
    # head
    "bunny_ears":         {"slot": "head", "price": 50},
    "straw_hat_flower":   {"slot": "head", "price": 60},
    "butterfly_bow":      {"slot": "head", "price": 70},
    "miner_helmet":       {"slot": "head", "price": 80},
    "princess_crown":     {"slot": "head", "price": 120},
    # top
    "explorer_vest":      {"slot": "top", "price": 100},
    "pirate_coat":        {"slot": "top", "price": 180},
    "pink_princess_dress":{"slot": "top", "price": 200},
    "mage_robe":          {"slot": "top", "price": 250},
    "diamond_armor":      {"slot": "top", "price": 350},
    # hand
    "flower":             {"slot": "hand", "price": 30},
    "apple":              {"slot": "hand", "price": 30},
    "diamond_pickaxe":    {"slot": "hand", "price": 220},
    "magic_wand":         {"slot": "hand", "price": 280},
    "diamond_sword":      {"slot": "hand", "price": 300},
    # legs
    "denim_boots":        {"slot": "legs", "price": 80},
    "rainbow_socks":      {"slot": "legs", "price": 100},
    "snow_boots":         {"slot": "legs", "price": 120},
    "glass_slippers":     {"slot": "legs", "price": 200},
    "knight_legs":        {"slot": "legs", "price": 250},
}
```

- [ ] **Step 4: 跑测试**

Run: `uv run pytest tests/test_cosmetics.py::test_cosmetics_registry_structure -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/cosmetics.py tests/test_cosmetics.py
git commit -m "Add cosmetics whitelist with 20 items across 4 slots"
```

---

### Task 2: 数据库 schema 迁移

**Files:**
- Modify: `backend/db.py` (`init_db()` 加幂等 ALTER TABLE)
- Test: `tests/test_cosmetics.py`

**Why:** 给已有 `player_state` 加两个 JSON 列,老 game.db 不丢数据。

- [ ] **Step 1: 加迁移测试**

Append to `tests/test_cosmetics.py`:

```python
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
```

- [ ] **Step 2: 跑测试看失败**

Run: `uv run pytest tests/test_cosmetics.py::test_schema_migration_fresh_db tests/test_cosmetics.py::test_schema_migration_legacy_db -v`
Expected: FAIL (新字段不存在)

- [ ] **Step 3: 改 db.py 加迁移函数**

In `backend/db.py`, add helper before `init_db()`:

```python
def _ensure_player_state_columns(conn: sqlite3.Connection) -> None:
    """给老的 player_state 表加新字段,幂等。"""
    cols = {row[1] for row in conn.execute("PRAGMA table_info(player_state)")}
    if "owned_cosmetics" not in cols:
        conn.execute(
            "ALTER TABLE player_state ADD COLUMN owned_cosmetics TEXT DEFAULT '[]'"
        )
    if "equipped_cosmetics" not in cols:
        conn.execute(
            "ALTER TABLE player_state ADD COLUMN equipped_cosmetics TEXT DEFAULT '{}'"
        )
```

In `init_db()`, after `c.execute("INSERT OR IGNORE INTO player_state ...")`, add:

```python
        _ensure_player_state_columns(conn)
```

- [ ] **Step 4: 跑测试**

Run: `uv run pytest tests/test_cosmetics.py -v`
Expected: 所有测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/db.py tests/test_cosmetics.py
git commit -m "Add schema migration for owned/equipped cosmetics columns"
```

---

### Task 3: 扩展 PlayerState (model + db.get_player_state + API /state 测试)

**Files:**
- Modify: `backend/models.py` (`PlayerState` 加 2 字段)
- Modify: `backend/db.py` (`get_player_state` 返回新字段并归一化)
- Test: `tests/test_cosmetics.py`

**Why:** 前端启动时拉一次 `/api/state` 拿全量装扮状态,用于初始化主页角色 + 商店。

- [ ] **Step 1: 加测试**

Append to `tests/test_cosmetics.py`:

```python
@pytest.fixture
def client(monkeypatch, tmp_path):
    tmp_db = tmp_path / "test.db"
    from backend import db
    monkeypatch.setattr(db, "DB_PATH", tmp_db)
    db.init_db()
    from backend.main import app
    return TestClient(app)


def test_state_returns_cosmetics_fields(client):
    """新建玩家 GET /api/state 返回 owned_cosmetics 和 equipped_cosmetics。"""
    r = client.get("/api/state")
    assert r.status_code == 200
    data = r.json()
    assert data["owned_cosmetics"] == []
    assert data["equipped_cosmetics"] == {
        "head": None, "top": None, "hand": None, "legs": None
    }
```

- [ ] **Step 2: 跑测试看失败**

Run: `uv run pytest tests/test_cosmetics.py::test_state_returns_cosmetics_fields -v`
Expected: FAIL (字段缺失或 PlayerState 校验报错)

- [ ] **Step 3: 改 PlayerState model**

In `backend/models.py`, change `PlayerState`:

```python
class PlayerState(BaseModel):
    """完整玩家状态,前端启动/返主菜单时拉取。"""
    total_coins: int
    total_correct: int
    total_answered: int
    best_combo: int
    badges: dict[str, bool]
    today_done: int
    today_correct: int
    days_played: int
    today_date: str
    owned_cosmetics: list[str]
    equipped_cosmetics: dict[str, str | None]
```

- [ ] **Step 4: 改 db.get_player_state 返回新字段**

In `backend/db.py`, modify `get_player_state()` to also read the new columns and normalize:

```python
        equipped_raw = json.loads(row["equipped_cosmetics"] or "{}")
        # 归一化:确保 4 个槽位都存在
        equipped = {
            "head": equipped_raw.get("head"),
            "top":  equipped_raw.get("top"),
            "hand": equipped_raw.get("hand"),
            "legs": equipped_raw.get("legs"),
        }

        return {
            "total_coins": row["total_coins"],
            "total_correct": row["total_correct"],
            "total_answered": row["total_answered"],
            "best_combo": row["best_combo"],
            "badges": json.loads(row["badges"] or "{}"),
            "today_done": today_done,
            "today_correct": today_correct,
            "days_played": days_played,
            "today_date": today,
            "owned_cosmetics": json.loads(row["owned_cosmetics"] or "[]"),
            "equipped_cosmetics": equipped,
        }
```

- [ ] **Step 5: 跑测试**

Run: `uv run pytest tests/test_cosmetics.py -v` 和 `uv run pytest tests/test_api.py -v`
Expected: 全部 PASS(原有 test_api.py 不能因为新字段坏掉)

- [ ] **Step 6: Commit**

```bash
git add backend/models.py backend/db.py tests/test_cosmetics.py
git commit -m "Return cosmetics fields from /api/state with slot normalization"
```

---

### Task 4: db.set_equipped 函数

**Files:**
- Modify: `backend/db.py` (新增 `set_equipped`)
- Test: `tests/test_cosmetics.py`

- [ ] **Step 1: 加测试**

Append to `tests/test_cosmetics.py`:

```python
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
```

- [ ] **Step 2: 跑测试看失败**

Run: `uv run pytest tests/test_cosmetics.py::test_set_equipped_assigns_slot -v`
Expected: FAIL (`AttributeError: module 'backend.db' has no attribute 'set_equipped'`)

- [ ] **Step 3: 实现 set_equipped**

In `backend/db.py`, add at the end of the "玩家状态" section:

```python
def set_equipped(slot: str, cosmetic_id: str | None) -> None:
    """更新 player_state.equipped_cosmetics 的某个槽位。

    不校验所有权或 slot 归属,调用方(api 层)负责校验。
    """
    with get_conn() as conn:
        c = conn.cursor()
        row = c.execute(
            "SELECT equipped_cosmetics FROM player_state WHERE id = 1"
        ).fetchone()
        equipped = json.loads(row["equipped_cosmetics"] or "{}")
        equipped[slot] = cosmetic_id
        c.execute(
            "UPDATE player_state SET equipped_cosmetics = ? WHERE id = 1",
            (json.dumps(equipped),),
        )
```

- [ ] **Step 4: 跑测试**

Run: `uv run pytest tests/test_cosmetics.py::test_set_equipped_assigns_slot tests/test_cosmetics.py::test_set_equipped_clears_slot -v`
Expected: 两个都 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/db.py tests/test_cosmetics.py
git commit -m "Add db.set_equipped to write a single slot"
```

---

### Task 5: db.buy_cosmetic 原子函数

**Files:**
- Modify: `backend/db.py` (新增 `buy_cosmetic` + `BuyCosmeticError`)
- Test: `tests/test_cosmetics.py`

**Why:** 单事务原子完成扣金币 + 加 owned + 自动装备,避免双击重复扣钱。

- [ ] **Step 1: 加测试**

Append to `tests/test_cosmetics.py`:

```python
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
```

- [ ] **Step 2: 跑测试看失败**

Run: `uv run pytest tests/test_cosmetics.py -k buy_cosmetic -v`
Expected: FAIL

- [ ] **Step 3: 实现 buy_cosmetic + 异常类**

In `backend/db.py`, add (right after `set_equipped`):

```python
class BuyCosmeticError(Exception):
    """购买装扮失败。reason: 'insufficient_coins' | 'already_owned'。"""
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def buy_cosmetic(cosmetic_id: str, slot: str, price: int) -> dict[str, Any]:
    """原子购买装扮。抛 BuyCosmeticError 表示业务失败。

    成功:扣金币、加入 owned、装备到对应 slot,返回新 player_state。
    """
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT total_coins, owned_cosmetics, equipped_cosmetics FROM player_state WHERE id = 1"
        ).fetchone()
        owned = json.loads(row["owned_cosmetics"] or "[]")
        equipped = json.loads(row["equipped_cosmetics"] or "{}")

        if cosmetic_id in owned:
            conn.execute("ROLLBACK")
            raise BuyCosmeticError("already_owned")
        if row["total_coins"] < price:
            conn.execute("ROLLBACK")
            raise BuyCosmeticError("insufficient_coins")

        owned.append(cosmetic_id)
        equipped[slot] = cosmetic_id
        conn.execute(
            """UPDATE player_state
               SET total_coins = total_coins - ?,
                   owned_cosmetics = ?,
                   equipped_cosmetics = ?
               WHERE id = 1""",
            (price, json.dumps(owned), json.dumps(equipped)),
        )
        conn.execute("COMMIT")
    finally:
        conn.close()

    return get_player_state()
```

- [ ] **Step 4: 跑测试**

Run: `uv run pytest tests/test_cosmetics.py -v`
Expected: 全 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/db.py tests/test_cosmetics.py
git commit -m "Add atomic db.buy_cosmetic with BEGIN IMMEDIATE"
```

---

### Task 6: API /api/cosmetics/equip endpoint

**Files:**
- Modify: `backend/models.py` (新增 `EquipCosmeticRequest`)
- Modify: `backend/api.py` (新增 endpoint)
- Test: `tests/test_cosmetics.py`

- [ ] **Step 1: 加测试**

Append to `tests/test_cosmetics.py`:

```python
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
```

- [ ] **Step 2: 跑测试看失败**

Run: `uv run pytest tests/test_cosmetics.py -k equip -v`
Expected: FAIL (endpoint 不存在)

- [ ] **Step 3: 加 EquipCosmeticRequest model**

In `backend/models.py`, append:

```python
class EquipCosmeticRequest(BaseModel):
    slot: str = Field(..., pattern="^(head|top|hand|legs)$")
    cosmetic_id: str | None = None
```

- [ ] **Step 4: 加 endpoint**

In `backend/api.py`:

Add to imports:

```python
from fastapi import APIRouter, HTTPException
from .cosmetics import COSMETICS
from .models import (
    AnswerResult, AnswerSubmit, PlayerState, StatsResponse,
    DecomposeAnswerSubmit, DecomposeAnswerResult,
    EquipCosmeticRequest,
)
```

Append at end:

```python
@router.post("/cosmetics/equip", response_model=PlayerState)
def equip_cosmetic(payload: EquipCosmeticRequest) -> PlayerState:
    if payload.cosmetic_id is not None:
        meta = COSMETICS.get(payload.cosmetic_id)
        if meta is None:
            raise HTTPException(400, "Unknown cosmetic")
        if meta["slot"] != payload.slot:
            raise HTTPException(400, "Cosmetic does not match slot")
        owned = db.get_player_state()["owned_cosmetics"]
        if payload.cosmetic_id not in owned:
            raise HTTPException(400, "Cosmetic not owned")
    db.set_equipped(payload.slot, payload.cosmetic_id)
    return PlayerState(**db.get_player_state())
```

- [ ] **Step 5: 跑测试**

Run: `uv run pytest tests/test_cosmetics.py -k equip -v`
Expected: 全 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/api.py backend/models.py tests/test_cosmetics.py
git commit -m "Add POST /api/cosmetics/equip endpoint with slot validation"
```

---

### Task 7: API /api/cosmetics/buy endpoint

**Files:**
- Modify: `backend/models.py` (新增 `BuyCosmeticRequest`)
- Modify: `backend/api.py` (新增 endpoint)
- Test: `tests/test_cosmetics.py`

- [ ] **Step 1: 加测试**

Append to `tests/test_cosmetics.py`:

```python
def test_buy_endpoint_success(client):
    """金币足购买成功 → 返回更新后的 state。"""
    from backend import db
    with db.get_conn() as conn:
        conn.execute("UPDATE player_state SET total_coins = 200 WHERE id = 1")

    r = client.post("/api/cosmetics/buy", json={"cosmetic_id": "princess_crown"})
    assert r.status_code == 200
    data = r.json()
    assert data["total_coins"] == 80  # 200 - 120
    assert "princess_crown" in data["owned_cosmetics"]
    assert data["equipped_cosmetics"]["head"] == "princess_crown"


def test_buy_endpoint_insufficient_coins_400(client):
    from backend import db
    with db.get_conn() as conn:
        conn.execute("UPDATE player_state SET total_coins = 50 WHERE id = 1")

    r = client.post("/api/cosmetics/buy", json={"cosmetic_id": "princess_crown"})
    assert r.status_code == 400
    assert "insufficient" in r.json()["detail"].lower()


def test_buy_endpoint_already_owned_400(client):
    from backend import db
    with db.get_conn() as conn:
        conn.execute(
            "UPDATE player_state SET total_coins = 500, owned_cosmetics = ? WHERE id = 1",
            ('["princess_crown"]',)
        )
    r = client.post("/api/cosmetics/buy", json={"cosmetic_id": "princess_crown"})
    assert r.status_code == 400


def test_buy_endpoint_unknown_id_400(client):
    r = client.post("/api/cosmetics/buy", json={"cosmetic_id": "fake_id"})
    assert r.status_code == 400
```

- [ ] **Step 2: 跑测试看失败**

Run: `uv run pytest tests/test_cosmetics.py -k buy_endpoint -v`
Expected: FAIL

- [ ] **Step 3: 加 model**

In `backend/models.py`, append:

```python
class BuyCosmeticRequest(BaseModel):
    cosmetic_id: str
```

- [ ] **Step 4: 加 endpoint**

In `backend/api.py`:

Update imports:

```python
from .models import (
    AnswerResult, AnswerSubmit, PlayerState, StatsResponse,
    DecomposeAnswerSubmit, DecomposeAnswerResult,
    EquipCosmeticRequest, BuyCosmeticRequest,
)
```

Append:

```python
@router.post("/cosmetics/buy", response_model=PlayerState)
def buy_cosmetic_endpoint(payload: BuyCosmeticRequest) -> PlayerState:
    meta = COSMETICS.get(payload.cosmetic_id)
    if meta is None:
        raise HTTPException(400, "Unknown cosmetic")
    try:
        new_state = db.buy_cosmetic(payload.cosmetic_id, meta["slot"], meta["price"])
    except db.BuyCosmeticError as e:
        raise HTTPException(400, e.reason)
    return PlayerState(**new_state)
```

- [ ] **Step 5: 跑测试**

Run: `uv run pytest tests/test_cosmetics.py -v`
Expected: 全部 PASS

也跑现有 API 测试:`uv run pytest tests/test_api.py tests/test_decompose_api.py -v` — 不能因为 PlayerState 模型扩展破坏。

- [ ] **Step 6: Commit**

```bash
git add backend/api.py backend/models.py tests/test_cosmetics.py
git commit -m "Add POST /api/cosmetics/buy endpoint with atomic transaction"
```

---

### Task 8: 前端 Avatar SVG 渲染器 (avatar.js + 默认套装)

**Files:**
- Create: `frontend/js/avatar/avatar.js`

**Why:** 中央渲染函数,主页和商店都用它把 `equipped` 状态画成 SVG。

- [ ] **Step 1: 创建 avatar.js**

```js
// frontend/js/avatar/avatar.js
// === Alex 角色 SVG 渲染器 ===
// 统一在这里管:基底层(裸 Alex 皮肤+发) + 默认套装 + 装扮叠加。
// 所有 cosmetic.renderOnAvatar() 假设父 SVG viewBox 是 192x384,
// 各槽位锚点见 docs/superpowers/specs/2026-04-30-avatar-cosmetics-design.md。
//
// 渲染顺序: BASE → DEFAULT_TOP(若无 top cosmetic) → DEFAULT_LEGS(若无 legs)
//          → top → legs → hand → head (head 永远最后,在最上)

(function () {
  // 基底:头/发/脸/裸皮肤躯干、四肢、手、脚 (永远画)
  const BASE = `
    <!-- Hair top -->
    <rect x="36" y="0" width="120" height="24" fill="#9a3a18"/>
    <rect x="36" y="0" width="120" height="6" fill="#c75020"/>
    <!-- Face -->
    <rect x="60" y="24" width="72" height="72" fill="#e6b890"/>
    <!-- Side bangs -->
    <rect x="36" y="24" width="24" height="60" fill="#9a3a18"/>
    <rect x="132" y="24" width="24" height="60" fill="#9a3a18"/>
    <rect x="60" y="24" width="72" height="12" fill="#a84020"/>
    <!-- Eyebrows -->
    <rect x="66" y="42" width="18" height="6" fill="#7a2818"/>
    <rect x="108" y="42" width="18" height="6" fill="#7a2818"/>
    <!-- Eye whites -->
    <rect x="66" y="48" width="18" height="12" fill="#fff"/>
    <rect x="108" y="48" width="18" height="12" fill="#fff"/>
    <!-- Pupils (green) -->
    <rect x="72" y="48" width="6" height="12" fill="#3a8a3a"/>
    <rect x="114" y="48" width="6" height="12" fill="#3a8a3a"/>
    <!-- Nose -->
    <rect x="90" y="66" width="12" height="6" fill="#c89570"/>
    <!-- Mouth -->
    <rect x="78" y="78" width="36" height="6" fill="#a84030"/>
    <rect x="84" y="84" width="24" height="6" fill="#7a2820"/>
    <!-- Hair flowing -->
    <rect x="24" y="84" width="36" height="60" fill="#9a3a18"/>
    <rect x="132" y="84" width="36" height="60" fill="#9a3a18"/>
    <rect x="24" y="84" width="6" height="60" fill="#7a2818"/>
    <rect x="162" y="84" width="6" height="60" fill="#7a2818"/>
    <!-- Neck -->
    <rect x="78" y="96" width="36" height="12" fill="#c89570"/>
    <!-- Bare torso (skin, behind shirt) -->
    <rect x="48" y="108" width="96" height="132" fill="#e6b890"/>
    <!-- Bare arms (skin all the way) -->
    <rect x="12" y="108" width="36" height="120" fill="#e6b890"/>
    <rect x="12" y="108" width="6" height="120" fill="#f0c8a0"/>
    <rect x="42" y="108" width="6" height="120" fill="#c89570"/>
    <rect x="144" y="108" width="36" height="120" fill="#e6b890"/>
    <rect x="144" y="108" width="6" height="120" fill="#f0c8a0"/>
    <rect x="174" y="108" width="6" height="120" fill="#c89570"/>
    <!-- Hands -->
    <rect x="12" y="222" width="36" height="18" fill="#c89570"/>
    <rect x="144" y="222" width="36" height="18" fill="#c89570"/>
    <!-- Bare legs (skin, behind pants) -->
    <rect x="48" y="240" width="48" height="108" fill="#e6b890"/>
    <rect x="48" y="240" width="6" height="108" fill="#f0c8a0"/>
    <rect x="96" y="240" width="48" height="108" fill="#e6b890"/>
    <rect x="138" y="240" width="6" height="108" fill="#c89570"/>
    <!-- Bare feet -->
    <rect x="48" y="348" width="48" height="24" fill="#e6b890"/>
    <rect x="96" y="348" width="48" height="24" fill="#e6b890"/>
  `;

  // 默认 T 恤 + 短袖
  const DEFAULT_TOP = `
    <rect x="48" y="108" width="96" height="132" fill="#5a9c2a"/>
    <rect x="48" y="108" width="12" height="132" fill="#7ac850"/>
    <rect x="132" y="108" width="12" height="132" fill="#3a7820"/>
    <rect x="48" y="234" width="96" height="6" fill="#3a6a18"/>
    <rect x="12" y="108" width="36" height="60" fill="#5a9c2a"/>
    <rect x="12" y="108" width="6" height="60" fill="#7ac850"/>
    <rect x="42" y="108" width="6" height="60" fill="#3a7820"/>
    <rect x="144" y="108" width="36" height="60" fill="#5a9c2a"/>
    <rect x="144" y="108" width="6" height="60" fill="#7ac850"/>
    <rect x="174" y="108" width="6" height="60" fill="#3a7820"/>
  `;

  // 默认棕裤 + 灰鞋
  const DEFAULT_LEGS = `
    <rect x="48" y="240" width="48" height="108" fill="#7a4828"/>
    <rect x="48" y="240" width="6" height="108" fill="#a06038"/>
    <rect x="90" y="240" width="6" height="108" fill="#5a3018"/>
    <rect x="96" y="240" width="48" height="108" fill="#7a4828"/>
    <rect x="96" y="240" width="6" height="108" fill="#a06038"/>
    <rect x="138" y="240" width="6" height="108" fill="#5a3018"/>
    <rect x="48" y="348" width="48" height="24" fill="#3a3a3a"/>
    <rect x="96" y="348" width="48" height="24" fill="#3a3a3a"/>
    <rect x="48" y="348" width="6" height="24" fill="#5a5a5a"/>
    <rect x="96" y="348" width="6" height="24" fill="#5a5a5a"/>
  `;

  function renderCosmetic(slot, equipped) {
    const id = equipped[slot];
    if (!id) return '';
    const c = (window.Cosmetics || {})[id];
    if (!c) {
      console.warn('avatar: missing cosmetic in catalog', id);
      return '';
    }
    return c.renderOnAvatar();
  }

  window.Avatar = {
    /**
     * 返回完整的 SVG 字符串。equipped 是 {head, top, hand, legs} 对象。
     */
    render(equipped) {
      equipped = equipped || { head: null, top: null, hand: null, legs: null };
      return `
<svg viewBox="0 0 192 384" shape-rendering="crispEdges" class="avatar-svg" xmlns="http://www.w3.org/2000/svg">
  ${BASE}
  ${equipped.top ? '' : DEFAULT_TOP}
  ${equipped.legs ? '' : DEFAULT_LEGS}
  ${renderCosmetic('top', equipped)}
  ${renderCosmetic('legs', equipped)}
  ${renderCosmetic('hand', equipped)}
  ${renderCosmetic('head', equipped)}
</svg>`;
    },
  };
})();
```

- [ ] **Step 2: 手测渲染** (没有自动化测试,临时在浏览器跑)

为了快速验证,临时在 `frontend/index.html` 末尾加一行 console 测试:

```html
<script>
  // Temporary smoke test, remove after Task 17
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      console.log('avatar smoke:',
        window.Avatar?.render({ head: null, top: null, hand: null, legs: null }).substring(0, 200));
    }, 1000);
  });
</script>
```

但记得 Task 17 时删掉,或者 Step 2 改成只看是否 `window.Avatar` 注册:打开 DevTools console 输入 `Avatar.render({})` 看是否返回 SVG 字符串。

实际验证方式:启动后端,打开 http://localhost:8000,在 console 跑:
```js
document.body.insertAdjacentHTML('afterbegin',
  '<div style="width:200px">' + Avatar.render({head:null,top:null,hand:null,legs:null}) + '</div>');
```
应看到默认 Alex(绿 T 棕裤灰鞋)渲染出来。

- [ ] **Step 3: Commit**

```bash
git add frontend/js/avatar/avatar.js
git commit -m "Add Avatar SVG renderer with base, default outfit, layered cosmetics"
```

---

### Task 9: 前端目录骨架 (catalog.js)

**Files:**
- Create: `frontend/js/avatar/catalog.js`

- [ ] **Step 1: 创建空骨架**

```js
// frontend/js/avatar/catalog.js
// === 装扮目录 ===
// 每件装扮:slot/name/price + renderIcon (48x48 独立 SVG) + renderOnAvatar (192x384 内的 <g>)
// 后端 backend/cosmetics.py 必须保持 id/slot/price 同步。

(function () {
  window.CosmeticSlots = ['head', 'top', 'hand', 'legs'];
  window.CosmeticSlotNames = {
    head: '头',
    top: '上衣',
    hand: '手持',
    legs: '裤鞋',
  };

  // Tasks 10-13 will populate this object
  window.Cosmetics = {};
})();
```

- [ ] **Step 2: Commit**

```bash
git add frontend/js/avatar/catalog.js
git commit -m "Scaffold cosmetics catalog with slot constants"
```

---

### Task 10: 添加 head 槽位 5 件

**Files:**
- Modify: `frontend/js/avatar/catalog.js`

**Why:** head 槽位最直观,先做完整 5 件,作为后续 slot 的参考。

槽位锚点(已记 spec):x=24-168, y=-30 to 24。

- [ ] **Step 1: 在 catalog.js 的 IIFE 内、`window.Cosmetics = {};` 之后,改为完整赋值:**

```js
  window.Cosmetics = {
    bunny_ears: {
      slot: 'head', name: '兔耳头箍', price: 50,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="6" y="30" width="36" height="6" fill="#ff80a0"/>
  <rect x="6" y="30" width="36" height="3" fill="#ffb0c8"/>
  <rect x="6" y="0" width="9" height="33" fill="#fff"/>
  <rect x="33" y="0" width="9" height="33" fill="#fff"/>
  <rect x="9" y="6" width="3" height="21" fill="#ffb0c8"/>
  <rect x="36" y="6" width="3" height="21" fill="#ffb0c8"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-head">
  <rect x="48" y="0" width="96" height="6" fill="#ff80a0"/>
  <rect x="54" y="-30" width="12" height="30" fill="#fff"/>
  <rect x="57" y="-21" width="6" height="18" fill="#ffb0c8"/>
  <rect x="126" y="-30" width="12" height="30" fill="#fff"/>
  <rect x="129" y="-21" width="6" height="18" fill="#ffb0c8"/>
</g>`,
    },

    straw_hat_flower: {
      slot: 'head', name: '草帽 + 花', price: 60,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="3" y="24" width="42" height="9" fill="#e8c068"/>
  <rect x="3" y="24" width="42" height="3" fill="#f0d088"/>
  <rect x="3" y="30" width="42" height="3" fill="#a88838"/>
  <rect x="12" y="6" width="24" height="21" fill="#e8c068"/>
  <rect x="12" y="6" width="24" height="3" fill="#f0d088"/>
  <rect x="12" y="21" width="24" height="6" fill="#c8a050"/>
  <rect x="18" y="18" width="12" height="3" fill="#ff80a0"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-head">
  <rect x="24" y="0" width="144" height="9" fill="#e8c068"/>
  <rect x="24" y="0" width="144" height="3" fill="#f0d088"/>
  <rect x="24" y="6" width="144" height="3" fill="#a88838"/>
  <rect x="60" y="-24" width="72" height="24" fill="#e8c068"/>
  <rect x="60" y="-24" width="72" height="6" fill="#f0d088"/>
  <rect x="60" y="-6" width="72" height="6" fill="#c8a050"/>
  <rect x="84" y="-12" width="24" height="6" fill="#ff80a0"/>
  <rect x="90" y="-15" width="12" height="3" fill="#ffd700"/>
</g>`,
    },

    butterfly_bow: {
      slot: 'head', name: '蝴蝶结', price: 70,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="6" y="33" width="36" height="3" fill="#a04060"/>
  <rect x="3" y="15" width="18" height="18" fill="#ff60a0"/>
  <rect x="3" y="15" width="18" height="6" fill="#ffa0c8"/>
  <rect x="27" y="15" width="18" height="18" fill="#ff60a0"/>
  <rect x="27" y="15" width="18" height="6" fill="#ffa0c8"/>
  <rect x="18" y="18" width="12" height="15" fill="#c84080"/>
  <rect x="18" y="18" width="12" height="3" fill="#e060a0"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-head">
  <rect x="48" y="0" width="96" height="3" fill="#a04060"/>
  <rect x="48" y="-15" width="30" height="18" fill="#ff60a0"/>
  <rect x="48" y="-15" width="30" height="6" fill="#ffa0c8"/>
  <rect x="114" y="-15" width="30" height="18" fill="#ff60a0"/>
  <rect x="114" y="-15" width="30" height="6" fill="#ffa0c8"/>
  <rect x="84" y="-12" width="24" height="15" fill="#c84080"/>
  <rect x="84" y="-12" width="24" height="3" fill="#e060a0"/>
</g>`,
    },

    miner_helmet: {
      slot: 'head', name: '矿工头灯', price: 80,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="6" y="12" width="36" height="24" fill="#ffd040"/>
  <rect x="6" y="12" width="36" height="6" fill="#fff080"/>
  <rect x="6" y="30" width="36" height="6" fill="#a88010"/>
  <rect x="18" y="6" width="12" height="9" fill="#fff"/>
  <rect x="18" y="6" width="12" height="3" fill="#ffe080"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-head">
  <rect x="48" y="-12" width="96" height="24" fill="#ffd040"/>
  <rect x="48" y="-12" width="96" height="6" fill="#fff080"/>
  <rect x="48" y="6" width="96" height="6" fill="#a88010"/>
  <rect x="84" y="-21" width="24" height="12" fill="#fff"/>
  <rect x="84" y="-21" width="24" height="3" fill="#ffe080"/>
  <rect x="48" y="12" width="96" height="3" fill="#a08000"/>
</g>`,
    },

    princess_crown: {
      slot: 'head', name: '公主王冠', price: 120,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="6" y="18" width="36" height="6" fill="#ffd700"/>
  <rect x="6" y="18" width="36" height="3" fill="#fff080"/>
  <rect x="6" y="6" width="6" height="18" fill="#ffd700"/>
  <rect x="21" y="0" width="6" height="24" fill="#ffd700"/>
  <rect x="36" y="6" width="6" height="18" fill="#ffd700"/>
  <rect x="21" y="0" width="3" height="6" fill="#fff080"/>
  <rect x="9" y="12" width="6" height="6" fill="#ff4080"/>
  <rect x="33" y="12" width="6" height="6" fill="#ff4080"/>
  <rect x="22" y="6" width="4" height="4" fill="#3aa0ff"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-head">
  <rect x="48" y="-6" width="96" height="12" fill="#ffd700"/>
  <rect x="48" y="-6" width="96" height="3" fill="#fff080"/>
  <rect x="60" y="-18" width="6" height="12" fill="#ffd700"/>
  <rect x="93" y="-24" width="6" height="18" fill="#ffd700"/>
  <rect x="126" y="-18" width="6" height="12" fill="#ffd700"/>
  <rect x="63" y="-3" width="6" height="6" fill="#ff4080"/>
  <rect x="123" y="-3" width="6" height="6" fill="#ff4080"/>
  <rect x="93" y="-12" width="6" height="6" fill="#3aa0ff"/>
</g>`,
    },
  };
```

- [ ] **Step 2: 手测**

打开浏览器 console:
```js
Object.keys(Cosmetics).filter(id => Cosmetics[id].slot === 'head').forEach(id =>
  document.body.insertAdjacentHTML('afterbegin', Cosmetics[id].renderIcon())
);
```
应该看到 5 个 head 图标。

```js
document.body.insertAdjacentHTML('afterbegin',
  `<div style="width:200px">${Avatar.render({head:'princess_crown', top:null, hand:null, legs:null})}</div>`);
```
应看到默认 Alex 戴上王冠。

- [ ] **Step 3: Commit**

```bash
git add frontend/js/avatar/catalog.js
git commit -m "Add 5 head cosmetics to catalog"
```

---

### Task 11: 添加 top 槽位 5 件

**Files:**
- Modify: `frontend/js/avatar/catalog.js`

槽位锚点:x=12-180, y=108-240。

- [ ] **Step 1: 在 catalog.js 的 `window.Cosmetics = { ... }` 内,在 head 项之后追加 top 项:**

```js
    explorer_vest: {
      slot: 'top', name: '探险家背心', price: 100,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="12" y="9" width="24" height="33" fill="#a87838"/>
  <rect x="12" y="9" width="6" height="33" fill="#c89858"/>
  <rect x="30" y="9" width="6" height="33" fill="#785828"/>
  <rect x="20" y="15" width="8" height="3" fill="#ffd700"/>
  <rect x="22" y="21" width="4" height="4" fill="#3a3a3a"/>
  <rect x="22" y="30" width="4" height="4" fill="#3a3a3a"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-top">
  <!-- 背心(无袖,胳膊裸露) -->
  <rect x="48" y="108" width="96" height="132" fill="#a87838"/>
  <rect x="48" y="108" width="12" height="132" fill="#c89858"/>
  <rect x="132" y="108" width="12" height="132" fill="#785828"/>
  <!-- 金边领口 -->
  <rect x="78" y="108" width="36" height="6" fill="#ffd700"/>
  <!-- 三颗扣子 -->
  <rect x="92" y="138" width="8" height="4" fill="#ffd700"/>
  <rect x="92" y="170" width="8" height="4" fill="#ffd700"/>
  <rect x="92" y="202" width="8" height="4" fill="#ffd700"/>
  <!-- 口袋 -->
  <rect x="60" y="180" width="24" height="30" fill="#785828"/>
  <rect x="62" y="183" width="20" height="3" fill="#a87838"/>
</g>`,
    },

    pirate_coat: {
      slot: 'top', name: '海盗船长服', price: 180,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="9" y="9" width="30" height="33" fill="#3a2a4a"/>
  <rect x="9" y="9" width="6" height="33" fill="#5a4a6a"/>
  <rect x="33" y="9" width="6" height="33" fill="#1a0a2a"/>
  <rect x="22" y="15" width="4" height="20" fill="#ffd700"/>
  <rect x="18" y="9" width="12" height="6" fill="#fff"/>
  <rect x="6" y="9" width="36" height="3" fill="#5a3018"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-top">
  <!-- 长外套主体 -->
  <rect x="48" y="108" width="96" height="132" fill="#3a2a4a"/>
  <rect x="48" y="108" width="12" height="132" fill="#5a4a6a"/>
  <rect x="132" y="108" width="12" height="132" fill="#1a0a2a"/>
  <!-- 长袖 (覆盖胳膊全长) -->
  <rect x="12" y="108" width="36" height="120" fill="#3a2a4a"/>
  <rect x="12" y="108" width="6" height="120" fill="#5a4a6a"/>
  <rect x="42" y="108" width="6" height="120" fill="#1a0a2a"/>
  <rect x="144" y="108" width="36" height="120" fill="#3a2a4a"/>
  <rect x="144" y="108" width="6" height="120" fill="#5a4a6a"/>
  <rect x="174" y="108" width="6" height="120" fill="#1a0a2a"/>
  <!-- 白领巾 -->
  <rect x="78" y="108" width="36" height="12" fill="#fff"/>
  <!-- 棕领边 -->
  <rect x="48" y="108" width="96" height="6" fill="#5a3018"/>
  <!-- 金扣子 (中间一列) -->
  <rect x="92" y="135" width="8" height="6" fill="#ffd700"/>
  <rect x="92" y="159" width="8" height="6" fill="#ffd700"/>
  <rect x="92" y="183" width="8" height="6" fill="#ffd700"/>
  <rect x="92" y="207" width="8" height="6" fill="#ffd700"/>
  <!-- 袖口金边 -->
  <rect x="12" y="222" width="36" height="6" fill="#ffd700"/>
  <rect x="144" y="222" width="36" height="6" fill="#ffd700"/>
</g>`,
    },

    pink_princess_dress: {
      slot: 'top', name: '粉色公主裙', price: 200,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="12" y="9" width="24" height="9" fill="#ff80b0"/>
  <rect x="12" y="9" width="24" height="3" fill="#ffb0d0"/>
  <rect x="9" y="18" width="30" height="24" fill="#ff80b0"/>
  <rect x="9" y="18" width="6" height="24" fill="#ffb0d0"/>
  <rect x="33" y="18" width="6" height="24" fill="#d04080"/>
  <rect x="9" y="36" width="30" height="6" fill="#ffd700"/>
  <rect x="21" y="15" width="6" height="6" fill="#ffd700"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-top">
  <!-- 上身 -->
  <rect x="48" y="108" width="96" height="48" fill="#ff80b0"/>
  <rect x="48" y="108" width="12" height="48" fill="#ffb0d0"/>
  <rect x="132" y="108" width="12" height="48" fill="#d04080"/>
  <!-- 蓬蓬短袖 (左) -->
  <rect x="36" y="108" width="24" height="24" fill="#ff80b0"/>
  <rect x="36" y="108" width="6" height="24" fill="#ffb0d0"/>
  <!-- 蓬蓬短袖 (右) -->
  <rect x="132" y="108" width="24" height="24" fill="#ff80b0"/>
  <rect x="150" y="108" width="6" height="24" fill="#d04080"/>
  <!-- 裙摆 -->
  <rect x="36" y="156" width="120" height="84" fill="#ff80b0"/>
  <rect x="36" y="156" width="6" height="84" fill="#ffb0d0"/>
  <rect x="150" y="156" width="6" height="84" fill="#d04080"/>
  <!-- 金腰带 -->
  <rect x="36" y="156" width="120" height="6" fill="#ffd700"/>
  <!-- 胸前蝴蝶结 -->
  <rect x="84" y="120" width="24" height="9" fill="#ffd700"/>
  <rect x="93" y="123" width="6" height="6" fill="#c89000"/>
</g>`,
    },

    mage_robe: {
      slot: 'top', name: '法师紫袍', price: 250,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="12" y="9" width="24" height="33" fill="#7030c8"/>
  <rect x="12" y="9" width="6" height="33" fill="#9050e8"/>
  <rect x="30" y="9" width="6" height="33" fill="#5020a0"/>
  <rect x="18" y="18" width="3" height="3" fill="#ffd700"/>
  <rect x="27" y="18" width="3" height="3" fill="#ffd700"/>
  <rect x="22" y="27" width="4" height="4" fill="#ffd700"/>
  <rect x="20" y="9" width="8" height="3" fill="#ffd700"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-top">
  <!-- 长袍主体 -->
  <rect x="48" y="108" width="96" height="132" fill="#7030c8"/>
  <rect x="48" y="108" width="12" height="132" fill="#9050e8"/>
  <rect x="132" y="108" width="12" height="132" fill="#5020a0"/>
  <!-- 长袖 -->
  <rect x="12" y="108" width="36" height="120" fill="#7030c8"/>
  <rect x="12" y="108" width="6" height="120" fill="#9050e8"/>
  <rect x="42" y="108" width="6" height="120" fill="#5020a0"/>
  <rect x="144" y="108" width="36" height="120" fill="#7030c8"/>
  <rect x="144" y="108" width="6" height="120" fill="#9050e8"/>
  <rect x="174" y="108" width="6" height="120" fill="#5020a0"/>
  <!-- 金色领边 -->
  <rect x="78" y="108" width="36" height="9" fill="#ffd700"/>
  <!-- 金色星星点缀 -->
  <rect x="66" y="138" width="6" height="6" fill="#ffd700"/>
  <rect x="116" y="156" width="6" height="6" fill="#ffd700"/>
  <rect x="78" y="186" width="6" height="6" fill="#ffd700"/>
  <rect x="108" y="210" width="6" height="6" fill="#ffd700"/>
  <!-- 胸口大星 -->
  <rect x="90" y="168" width="12" height="12" fill="#ffd700"/>
  <rect x="93" y="171" width="6" height="6" fill="#fff080"/>
</g>`,
    },

    diamond_armor: {
      slot: 'top', name: '钻石盔甲', price: 350,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="12" y="9" width="24" height="33" fill="#80e0e8"/>
  <rect x="12" y="9" width="6" height="33" fill="#b0f0f8"/>
  <rect x="30" y="9" width="6" height="33" fill="#5098a0"/>
  <rect x="15" y="15" width="6" height="6" fill="#fff"/>
  <rect x="27" y="15" width="6" height="6" fill="#fff"/>
  <rect x="20" y="27" width="8" height="6" fill="#5098a0"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-top">
  <!-- 胸甲 -->
  <rect x="48" y="108" width="96" height="132" fill="#80e0e8"/>
  <rect x="48" y="108" width="12" height="132" fill="#b0f0f8"/>
  <rect x="132" y="108" width="12" height="132" fill="#5098a0"/>
  <!-- 肩甲 (覆盖胳膊上半) -->
  <rect x="12" y="108" width="36" height="60" fill="#80e0e8"/>
  <rect x="12" y="108" width="6" height="60" fill="#b0f0f8"/>
  <rect x="42" y="108" width="6" height="60" fill="#5098a0"/>
  <rect x="144" y="108" width="36" height="60" fill="#80e0e8"/>
  <rect x="144" y="108" width="6" height="60" fill="#b0f0f8"/>
  <rect x="174" y="108" width="6" height="60" fill="#5098a0"/>
  <!-- 胸口高光 -->
  <rect x="60" y="120" width="12" height="12" fill="#fff"/>
  <rect x="120" y="120" width="12" height="12" fill="#fff"/>
  <!-- 胸前钻石装饰 -->
  <rect x="84" y="156" width="24" height="24" fill="#5098a0"/>
  <rect x="90" y="162" width="12" height="12" fill="#80e0e8"/>
  <rect x="93" y="165" width="6" height="6" fill="#fff"/>
  <!-- 腰甲分割线 -->
  <rect x="48" y="216" width="96" height="6" fill="#5098a0"/>
</g>`,
    },
```

- [ ] **Step 2: 手测**

```js
['explorer_vest','pirate_coat','pink_princess_dress','mage_robe','diamond_armor'].forEach(id =>
  document.body.insertAdjacentHTML('afterbegin',
    `<div style="display:inline-block;width:120px">${Avatar.render({head:null,top:id,hand:null,legs:null})}</div>`));
```
应看到 5 个 Alex 各穿一件上衣。

- [ ] **Step 3: Commit**

```bash
git add frontend/js/avatar/catalog.js
git commit -m "Add 5 top cosmetics (vest, coat, dress, robe, armor)"
```

---

### Task 12: 添加 hand 槽位 5 件

**Files:**
- Modify: `frontend/js/avatar/catalog.js`

槽位锚点:x=12-200, y=180-260,主要在右手位置。

- [ ] **Step 1: 在 top 项之后追加 hand 项:**

```js
    flower: {
      slot: 'hand', name: '鲜花', price: 30,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="21" y="6" width="6" height="6" fill="#ffd700"/>
  <rect x="15" y="9" width="6" height="6" fill="#ff4080"/>
  <rect x="27" y="9" width="6" height="6" fill="#ff4080"/>
  <rect x="15" y="15" width="6" height="6" fill="#ff80b0"/>
  <rect x="27" y="15" width="6" height="6" fill="#ff80b0"/>
  <rect x="22" y="18" width="4" height="24" fill="#3a8a3a"/>
  <rect x="18" y="24" width="4" height="6" fill="#5aa830"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-hand">
  <!-- 茎(右手向下) -->
  <rect x="156" y="216" width="4" height="36" fill="#3a8a3a"/>
  <!-- 叶子 -->
  <rect x="146" y="228" width="8" height="4" fill="#5aa830"/>
  <!-- 花朵 (粉) -->
  <rect x="150" y="198" width="6" height="6" fill="#ff4080"/>
  <rect x="160" y="198" width="6" height="6" fill="#ff4080"/>
  <rect x="150" y="204" width="6" height="6" fill="#ff80b0"/>
  <rect x="160" y="204" width="6" height="6" fill="#ff80b0"/>
  <rect x="156" y="192" width="4" height="6" fill="#ffd700"/>
</g>`,
    },

    apple: {
      slot: 'hand', name: '苹果', price: 30,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="12" y="15" width="24" height="24" fill="#e03020"/>
  <rect x="12" y="15" width="6" height="24" fill="#ff5040"/>
  <rect x="30" y="15" width="6" height="24" fill="#a01010"/>
  <rect x="22" y="9" width="4" height="9" fill="#3a2010"/>
  <rect x="26" y="9" width="6" height="3" fill="#5aa830"/>
  <rect x="18" y="20" width="4" height="4" fill="#ff8060"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-hand">
  <!-- 苹果 -->
  <rect x="144" y="222" width="24" height="24" fill="#e03020"/>
  <rect x="144" y="222" width="6" height="24" fill="#ff5040"/>
  <rect x="162" y="222" width="6" height="24" fill="#a01010"/>
  <!-- 茎 -->
  <rect x="154" y="216" width="4" height="6" fill="#3a2010"/>
  <!-- 叶子 -->
  <rect x="158" y="216" width="6" height="3" fill="#5aa830"/>
  <!-- 高光 -->
  <rect x="150" y="227" width="4" height="4" fill="#ff8060"/>
</g>`,
    },

    diamond_pickaxe: {
      slot: 'hand', name: '钻石镐', price: 220,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="9" y="6" width="30" height="6" fill="#80e0e8"/>
  <rect x="9" y="6" width="30" height="3" fill="#b0f0f8"/>
  <rect x="21" y="12" width="6" height="30" fill="#7a3818"/>
  <rect x="21" y="12" width="3" height="30" fill="#a05828"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-hand">
  <!-- 镐头 (横置) -->
  <rect x="138" y="186" width="42" height="9" fill="#80e0e8"/>
  <rect x="138" y="186" width="42" height="3" fill="#b0f0f8"/>
  <!-- 木柄 -->
  <rect x="156" y="195" width="6" height="60" fill="#7a3818"/>
  <rect x="156" y="195" width="3" height="60" fill="#a05828"/>
</g>`,
    },

    magic_wand: {
      slot: 'hand', name: '魔法杖', price: 280,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="18" y="3" width="12" height="12" fill="#ff80f0"/>
  <rect x="18" y="3" width="12" height="3" fill="#ffc0ff"/>
  <rect x="21" y="6" width="6" height="6" fill="#fff"/>
  <rect x="22" y="15" width="4" height="27" fill="#a05028"/>
  <rect x="15" y="6" width="3" height="3" fill="#ffd700"/>
  <rect x="30" y="6" width="3" height="3" fill="#ffd700"/>
  <rect x="15" y="12" width="3" height="3" fill="#ffd700"/>
  <rect x="30" y="12" width="3" height="3" fill="#ffd700"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-hand">
  <!-- 杖身 -->
  <rect x="156" y="216" width="4" height="36" fill="#a05028"/>
  <!-- 杖头水晶 -->
  <rect x="148" y="186" width="20" height="20" fill="#ff80f0"/>
  <rect x="148" y="186" width="20" height="6" fill="#ffc0ff"/>
  <rect x="153" y="190" width="10" height="10" fill="#fff"/>
  <!-- 闪烁星点 -->
  <rect x="138" y="192" width="3" height="3" fill="#ffd700"/>
  <rect x="172" y="192" width="3" height="3" fill="#ffd700"/>
  <rect x="138" y="204" width="3" height="3" fill="#ffd700"/>
  <rect x="172" y="204" width="3" height="3" fill="#ffd700"/>
</g>`,
    },

    diamond_sword: {
      slot: 'hand', name: '钻石剑', price: 300,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="21" y="3" width="6" height="27" fill="#80e0e8"/>
  <rect x="21" y="3" width="3" height="27" fill="#b0f0f8"/>
  <rect x="15" y="30" width="18" height="3" fill="#ffd700"/>
  <rect x="21" y="33" width="6" height="9" fill="#7a3818"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-hand">
  <!-- 剑刃 -->
  <rect x="153" y="180" width="9" height="48" fill="#80e0e8"/>
  <rect x="153" y="180" width="3" height="48" fill="#b0f0f8"/>
  <!-- 护手 -->
  <rect x="144" y="228" width="27" height="6" fill="#ffd700"/>
  <!-- 剑柄 -->
  <rect x="153" y="234" width="9" height="18" fill="#7a3818"/>
  <rect x="153" y="234" width="3" height="18" fill="#a05828"/>
</g>`,
    },
```

- [ ] **Step 2: 手测**

```js
['flower','apple','diamond_pickaxe','magic_wand','diamond_sword'].forEach(id =>
  document.body.insertAdjacentHTML('afterbegin',
    `<div style="display:inline-block;width:120px">${Avatar.render({head:null,top:null,hand:id,legs:null})}</div>`));
```

- [ ] **Step 3: Commit**

```bash
git add frontend/js/avatar/catalog.js
git commit -m "Add 5 hand cosmetics (flower, apple, pickaxe, wand, sword)"
```

---

### Task 13: 添加 legs 槽位 5 件

**Files:**
- Modify: `frontend/js/avatar/catalog.js`

槽位锚点:x=36-156, y=240-372 (含脚)。

- [ ] **Step 1: 在 hand 项之后追加 legs 项:**

```js
    denim_boots: {
      slot: 'legs', name: '牛仔靴', price: 80,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="12" y="3" width="9" height="30" fill="#3a70b8"/>
  <rect x="27" y="3" width="9" height="30" fill="#3a70b8"/>
  <rect x="12" y="3" width="3" height="30" fill="#5a90d8"/>
  <rect x="27" y="3" width="3" height="30" fill="#5a90d8"/>
  <rect x="9" y="33" width="15" height="9" fill="#5a3818"/>
  <rect x="24" y="33" width="15" height="9" fill="#5a3818"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-legs">
  <!-- 牛仔裤 (左腿) -->
  <rect x="48" y="240" width="48" height="108" fill="#3a70b8"/>
  <rect x="48" y="240" width="6" height="108" fill="#5a90d8"/>
  <rect x="90" y="240" width="6" height="108" fill="#1a4080"/>
  <!-- 牛仔裤 (右腿) -->
  <rect x="96" y="240" width="48" height="108" fill="#3a70b8"/>
  <rect x="96" y="240" width="6" height="108" fill="#5a90d8"/>
  <rect x="138" y="240" width="6" height="108" fill="#1a4080"/>
  <!-- 牛仔接缝 -->
  <rect x="68" y="240" width="2" height="108" fill="#1a4080"/>
  <rect x="120" y="240" width="2" height="108" fill="#1a4080"/>
  <!-- 棕靴 -->
  <rect x="48" y="348" width="48" height="24" fill="#5a3818"/>
  <rect x="96" y="348" width="48" height="24" fill="#5a3818"/>
  <rect x="48" y="348" width="6" height="24" fill="#7a5828"/>
  <rect x="96" y="348" width="6" height="24" fill="#7a5828"/>
</g>`,
    },

    rainbow_socks: {
      slot: 'legs', name: '彩虹长袜', price: 100,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="12" y="3" width="9" height="6" fill="#ff4040"/>
  <rect x="12" y="9" width="9" height="6" fill="#ffa040"/>
  <rect x="12" y="15" width="9" height="6" fill="#ffd040"/>
  <rect x="12" y="21" width="9" height="6" fill="#40c060"/>
  <rect x="12" y="27" width="9" height="6" fill="#4080e0"/>
  <rect x="27" y="3" width="9" height="6" fill="#ff4040"/>
  <rect x="27" y="9" width="9" height="6" fill="#ffa040"/>
  <rect x="27" y="15" width="9" height="6" fill="#ffd040"/>
  <rect x="27" y="21" width="9" height="6" fill="#40c060"/>
  <rect x="27" y="27" width="9" height="6" fill="#4080e0"/>
  <rect x="9" y="33" width="15" height="9" fill="#fff"/>
  <rect x="24" y="33" width="15" height="9" fill="#fff"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-legs">
  <!-- 左腿 5 色条纹 -->
  <rect x="48" y="240" width="48" height="22" fill="#ff4040"/>
  <rect x="48" y="262" width="48" height="22" fill="#ffa040"/>
  <rect x="48" y="284" width="48" height="22" fill="#ffd040"/>
  <rect x="48" y="306" width="48" height="22" fill="#40c060"/>
  <rect x="48" y="328" width="48" height="20" fill="#4080e0"/>
  <!-- 右腿 5 色条纹 -->
  <rect x="96" y="240" width="48" height="22" fill="#ff4040"/>
  <rect x="96" y="262" width="48" height="22" fill="#ffa040"/>
  <rect x="96" y="284" width="48" height="22" fill="#ffd040"/>
  <rect x="96" y="306" width="48" height="22" fill="#40c060"/>
  <rect x="96" y="328" width="48" height="20" fill="#4080e0"/>
  <!-- 白色运动鞋 -->
  <rect x="48" y="348" width="48" height="24" fill="#fff"/>
  <rect x="96" y="348" width="48" height="24" fill="#fff"/>
  <rect x="48" y="348" width="48" height="6" fill="#d0d0d0"/>
  <rect x="96" y="348" width="48" height="6" fill="#d0d0d0"/>
</g>`,
    },

    snow_boots: {
      slot: 'legs', name: '雪地靴', price: 120,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="12" y="3" width="9" height="24" fill="#a8d0e8"/>
  <rect x="27" y="3" width="9" height="24" fill="#a8d0e8"/>
  <rect x="9" y="27" width="15" height="15" fill="#fff"/>
  <rect x="24" y="27" width="15" height="15" fill="#fff"/>
  <rect x="9" y="27" width="15" height="3" fill="#d0e8f8"/>
  <rect x="24" y="27" width="15" height="3" fill="#d0e8f8"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-legs">
  <!-- 蓝色裤 -->
  <rect x="48" y="240" width="48" height="84" fill="#a8d0e8"/>
  <rect x="48" y="240" width="6" height="84" fill="#d0e8f8"/>
  <rect x="90" y="240" width="6" height="84" fill="#7898b0"/>
  <rect x="96" y="240" width="48" height="84" fill="#a8d0e8"/>
  <rect x="96" y="240" width="6" height="84" fill="#d0e8f8"/>
  <rect x="138" y="240" width="6" height="84" fill="#7898b0"/>
  <!-- 雪地靴(白毛领+靴) -->
  <rect x="36" y="324" width="60" height="12" fill="#fff"/>
  <rect x="96" y="324" width="60" height="12" fill="#fff"/>
  <rect x="48" y="336" width="48" height="36" fill="#fff"/>
  <rect x="96" y="336" width="48" height="36" fill="#fff"/>
  <rect x="48" y="336" width="6" height="36" fill="#d0d0d0"/>
  <rect x="96" y="336" width="6" height="36" fill="#d0d0d0"/>
</g>`,
    },

    glass_slippers: {
      slot: 'legs', name: '玻璃鞋', price: 200,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="12" y="3" width="9" height="24" fill="#fff"/>
  <rect x="27" y="3" width="9" height="24" fill="#fff"/>
  <rect x="12" y="3" width="3" height="24" fill="#ffd0e0"/>
  <rect x="27" y="3" width="3" height="24" fill="#ffd0e0"/>
  <rect x="9" y="27" width="30" height="6" fill="#ffd0e0"/>
  <rect x="9" y="33" width="15" height="9" fill="#ff80b0"/>
  <rect x="24" y="33" width="15" height="9" fill="#ff80b0"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-legs">
  <!-- 白色长袜 (左腿) -->
  <rect x="48" y="240" width="48" height="108" fill="#fff"/>
  <rect x="48" y="240" width="6" height="108" fill="#ffd0e0"/>
  <rect x="90" y="240" width="6" height="108" fill="#d0a0b0"/>
  <!-- 白色长袜 (右腿) -->
  <rect x="96" y="240" width="48" height="108" fill="#fff"/>
  <rect x="96" y="240" width="6" height="108" fill="#ffd0e0"/>
  <rect x="138" y="240" width="6" height="108" fill="#d0a0b0"/>
  <!-- 粉色玻璃鞋 -->
  <rect x="48" y="348" width="48" height="24" fill="#ff80b0"/>
  <rect x="96" y="348" width="48" height="24" fill="#ff80b0"/>
  <rect x="48" y="348" width="48" height="6" fill="#ffb0d0"/>
  <rect x="96" y="348" width="48" height="6" fill="#ffb0d0"/>
  <!-- 鞋面亮点 -->
  <rect x="60" y="354" width="6" height="6" fill="#fff"/>
  <rect x="108" y="354" width="6" height="6" fill="#fff"/>
</g>`,
    },

    knight_legs: {
      slot: 'legs', name: '骑士护腿', price: 250,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="12" y="3" width="9" height="33" fill="#a0a0c8"/>
  <rect x="27" y="3" width="9" height="33" fill="#a0a0c8"/>
  <rect x="12" y="3" width="3" height="33" fill="#d0d0e8"/>
  <rect x="27" y="3" width="3" height="33" fill="#d0d0e8"/>
  <rect x="12" y="12" width="9" height="3" fill="#7878a0"/>
  <rect x="27" y="12" width="9" height="3" fill="#7878a0"/>
  <rect x="12" y="24" width="9" height="3" fill="#7878a0"/>
  <rect x="27" y="24" width="9" height="3" fill="#7878a0"/>
  <rect x="9" y="36" width="15" height="6" fill="#3a3a3a"/>
  <rect x="24" y="36" width="15" height="6" fill="#3a3a3a"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-legs">
  <!-- 钢护腿 (左) -->
  <rect x="48" y="240" width="48" height="108" fill="#a0a0c8"/>
  <rect x="48" y="240" width="6" height="108" fill="#d0d0e8"/>
  <rect x="90" y="240" width="6" height="108" fill="#7878a0"/>
  <!-- 钢护腿 (右) -->
  <rect x="96" y="240" width="48" height="108" fill="#a0a0c8"/>
  <rect x="96" y="240" width="6" height="108" fill="#d0d0e8"/>
  <rect x="138" y="240" width="6" height="108" fill="#7878a0"/>
  <!-- 关节横纹 (3 道) -->
  <rect x="48" y="270" width="48" height="6" fill="#7878a0"/>
  <rect x="96" y="270" width="48" height="6" fill="#7878a0"/>
  <rect x="48" y="300" width="48" height="6" fill="#7878a0"/>
  <rect x="96" y="300" width="48" height="6" fill="#7878a0"/>
  <rect x="48" y="330" width="48" height="6" fill="#7878a0"/>
  <rect x="96" y="330" width="48" height="6" fill="#7878a0"/>
  <!-- 黑色靴子 -->
  <rect x="48" y="348" width="48" height="24" fill="#3a3a3a"/>
  <rect x="96" y="348" width="48" height="24" fill="#3a3a3a"/>
  <rect x="48" y="348" width="6" height="24" fill="#5a5a5a"/>
  <rect x="96" y="348" width="6" height="24" fill="#5a5a5a"/>
</g>`,
    },
```

- [ ] **Step 2: 手测**

```js
['denim_boots','rainbow_socks','snow_boots','glass_slippers','knight_legs'].forEach(id =>
  document.body.insertAdjacentHTML('afterbegin',
    `<div style="display:inline-block;width:120px">${Avatar.render({head:null,top:null,hand:null,legs:id})}</div>`));
```
应看到 5 个 Alex 各穿不同裤鞋。

- [ ] **Step 3: 验证目录完整 (20 件)**

```js
console.assert(Object.keys(Cosmetics).length === 20, 'expected 20 cosmetics');
```

- [ ] **Step 4: Commit**

```bash
git add frontend/js/avatar/catalog.js
git commit -m "Add 5 legs cosmetics (boots, socks, snow, slippers, knight)"
```

---

### Task 14: 主页角色展示位 (home-tile.js)

**Files:**
- Create: `frontend/js/avatar/home-tile.js`

**Why:** 主页左侧的可点击 Alex,反映当前装备状态。

- [ ] **Step 1: 创建 home-tile.js**

```js
// frontend/js/avatar/home-tile.js
// === 主页角色展示位 ===
// 把 Avatar.render(equipped) 塞进容器,整个容器可点击进商店。

(function () {
  if (!window.Render || !window.Avatar) {
    throw new Error('home-tile.js: Render and Avatar must load first');
  }
  const { el } = window.Render;

  window.AvatarHomeTile = {
    /**
     * 把角色展示位渲染到 parentEl 内。会清空 parentEl 现有内容。
     */
    render(parentEl) {
      parentEl.innerHTML = '';
      const equipped = window.Platform?.playerState?.equipped_cosmetics
        || { head: null, top: null, hand: null, legs: null };
      const tile = el('div', {
        class: 'avatar-home-tile',
        onclick: () => window.Platform?.enterShop?.(),
      });
      tile.innerHTML = window.Avatar.render(equipped);
      const hint = el('div', { class: 'avatar-home-hint' }, '点我换装');
      const wrap = el('div', { class: 'avatar-home-wrap' });
      wrap.appendChild(tile);
      wrap.appendChild(hint);
      parentEl.appendChild(wrap);
    },
  };
})();
```

- [ ] **Step 2: Commit**

```bash
git add frontend/js/avatar/home-tile.js
git commit -m "Add clickable avatar home tile"
```

---

### Task 15: 商店 UI shell + 货架 (shop.js Part 1)

**Files:**
- Create: `frontend/js/avatar/shop.js`

**Why:** 先把视觉骨架做出来(顶部栏 + 左角色 + 右货架),不接业务。

- [ ] **Step 1: 创建 shop.js (Part 1: shell + shelves rendering)**

```js
// frontend/js/avatar/shop.js
// === 装扮商店屏 ===
// 入口: AvatarShop.start(hostEl);  退出: AvatarShop.exit();
// 状态: savedEquipped (服务端权威) + previewSlot/previewCosmeticId (本地试穿)

(function () {
  if (!window.Render || !window.Avatar || !window.Cosmetics || !window.Api) {
    throw new Error('shop.js: required globals missing');
  }
  const { el } = window.Render;

  let hostEl = null;
  const state = {
    savedEquipped: null,           // {head, top, hand, legs}
    savedCoins: 0,
    savedOwned: [],
    previewSlot: null,             // null = no preview active
    previewCosmeticId: null,
  };

  function effectiveEquipped() {
    if (!state.previewSlot) return { ...state.savedEquipped };
    return { ...state.savedEquipped, [state.previewSlot]: state.previewCosmeticId };
  }

  function rerender() {
    if (!hostEl) return;
    hostEl.innerHTML = '';

    // topbar
    const top = el('div', { class: 'shop-topbar' });
    top.appendChild(el('button', {
      class: 'shop-back-btn',
      onclick: () => window.Platform?.exit?.(),
    }, '← 返回'));
    top.appendChild(el('div', { class: 'shop-title' }, '装扮衣橱'));
    top.appendChild(el('div', { class: 'shop-coins' },
      '💰 ' + state.savedCoins));
    hostEl.appendChild(top);

    // body grid
    const body = el('div', { class: 'shop-body' });

    // left preview
    const left = el('div', { class: 'shop-preview' });
    const eq = effectiveEquipped();
    const previewWrap = el('div', { class: 'shop-preview-avatar' });
    previewWrap.innerHTML = window.Avatar.render(eq);
    left.appendChild(previewWrap);
    if (state.previewSlot) {
      left.appendChild(el('div', { class: 'shop-preview-tag' }, '试穿中'));
    }
    // 4 slot summary
    const summary = el('div', { class: 'shop-summary' });
    window.CosmeticSlots.forEach(slot => {
      const id = eq[slot];
      const name = id ? window.Cosmetics[id]?.name : '(无)';
      summary.appendChild(el('div', { class: 'shop-summary-row' },
        `${window.CosmeticSlotNames[slot]}: ${name}`));
    });
    left.appendChild(summary);
    body.appendChild(left);

    // right shelves
    const shelves = el('div', { class: 'shop-shelves' });
    window.CosmeticSlots.forEach(slot => {
      shelves.appendChild(renderShelf(slot, eq));
    });
    body.appendChild(shelves);

    hostEl.appendChild(body);

    // bottom action bar (only when preview active and item is unowned)
    if (state.previewSlot && state.previewCosmeticId
        && !state.savedOwned.includes(state.previewCosmeticId)) {
      hostEl.appendChild(renderActionBar());
    }
  }

  function renderShelf(slot, eq) {
    const shelf = el('div', { class: 'shop-shelf' });
    shelf.appendChild(el('div', { class: 'shop-shelf-title' },
      window.CosmeticSlotNames[slot]));

    const ids = Object.keys(window.Cosmetics)
      .filter(id => window.Cosmetics[id].slot === slot)
      .sort((a, b) => window.Cosmetics[a].price - window.Cosmetics[b].price);

    const grid = el('div', { class: 'shop-shelf-grid' });
    ids.forEach(id => grid.appendChild(renderItemCard(id, slot, eq)));
    shelf.appendChild(grid);
    return shelf;
  }

  function renderItemCard(id, slot, eq) {
    const c = window.Cosmetics[id];
    const owned = state.savedOwned.includes(id);
    const isEquippedSaved = state.savedEquipped[slot] === id;
    const isPreviewing = state.previewSlot === slot && state.previewCosmeticId === id;

    let cls = 'shop-item';
    if (isEquippedSaved) cls += ' shop-item-equipped';
    else if (owned) cls += ' shop-item-owned';
    if (isPreviewing) cls += ' shop-item-previewing';

    const card = el('div', {
      class: cls,
      onclick: () => onClickItem(id),
    });
    const icon = el('div', { class: 'shop-item-icon' });
    icon.innerHTML = c.renderIcon();
    card.appendChild(icon);
    card.appendChild(el('div', { class: 'shop-item-name' }, c.name));

    if (isEquippedSaved) {
      card.appendChild(el('div', { class: 'shop-item-badge' }, '穿着中'));
    } else if (owned) {
      card.appendChild(el('div', { class: 'shop-item-badge' }, '已拥有'));
    } else {
      card.appendChild(el('div', { class: 'shop-item-price' }, '💰 ' + c.price));
    }
    return card;
  }

  function renderActionBar() {
    const id = state.previewCosmeticId;
    const c = window.Cosmetics[id];
    const canAfford = state.savedCoins >= c.price;

    const bar = el('div', { class: 'shop-action-bar' });
    bar.appendChild(el('div', { class: 'shop-action-name' },
      '试穿: ' + c.name));

    const buyBtn = el('button', {
      class: 'shop-action-buy' + (canAfford ? '' : ' disabled'),
      disabled: !canAfford,
      onclick: canAfford ? () => doBuy(id) : null,
    }, canAfford ? `购买 💰${c.price}` : `还差 💰${c.price - state.savedCoins}`);
    bar.appendChild(buyBtn);

    bar.appendChild(el('button', {
      class: 'shop-action-cancel',
      onclick: cancelPreview,
    }, '取消'));
    return bar;
  }

  // event handlers — implemented in Task 16
  function onClickItem(id) {
    console.log('TODO Task 16: onClickItem', id);
  }
  function doBuy(id) {
    console.log('TODO Task 16: doBuy', id);
  }
  function cancelPreview() {
    console.log('TODO Task 16: cancelPreview');
  }

  window.AvatarShop = {
    async start(host) {
      hostEl = host;
      // pull fresh state
      const ps = window.Platform?.playerState;
      if (!ps) return;
      state.savedEquipped = { ...ps.equipped_cosmetics };
      state.savedCoins = ps.total_coins;
      state.savedOwned = [...ps.owned_cosmetics];
      state.previewSlot = null;
      state.previewCosmeticId = null;
      rerender();
    },
    exit() {
      hostEl = null;
      state.previewSlot = null;
      state.previewCosmeticId = null;
    },
  };

  // expose for state machine in Task 16
  window.AvatarShop._state = state;
  window.AvatarShop._rerender = rerender;
})();
```

- [ ] **Step 2: 没有自动测试,先确认文件加载不报错(Task 18 会接入)**

- [ ] **Step 3: Commit**

```bash
git add frontend/js/avatar/shop.js
git commit -m "Add shop UI shell with topbar, preview, shelves (no business logic)"
```

---

### Task 16: 商店状态机 + 后端调用 (shop.js Part 2)

**Files:**
- Modify: `frontend/js/avatar/shop.js` (替换 stub handlers)
- Modify: `frontend/js/api.js` (新增 `Api.equipCosmetic` 和 `Api.buyCosmetic`)

- [ ] **Step 1: 加 API 封装**

In `frontend/js/api.js`,新增两个方法 (放在合适位置):

```js
window.Api = window.Api || {};

window.Api.equipCosmetic = async function (slot, cosmeticId) {
  const r = await fetch('/api/cosmetics/equip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slot, cosmetic_id: cosmeticId }),
  });
  if (!r.ok) {
    const detail = (await r.json().catch(() => ({}))).detail || 'equip failed';
    throw new Error(detail);
  }
  return r.json();
};

window.Api.buyCosmetic = async function (cosmeticId) {
  const r = await fetch('/api/cosmetics/buy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cosmetic_id: cosmeticId }),
  });
  if (!r.ok) {
    const detail = (await r.json().catch(() => ({}))).detail || 'buy failed';
    throw new Error(detail);
  }
  return r.json();
};
```

(如果 `api.js` 的现有结构不是这种 namespace 风格,匹配项目现有写法。本步骤的关键是导出这两个函数。)

- [ ] **Step 2: 替换 shop.js 的 stub handlers**

In `frontend/js/avatar/shop.js`, 把这三段:

```js
  function onClickItem(id) {
    console.log('TODO Task 16: onClickItem', id);
  }
  function doBuy(id) {
    console.log('TODO Task 16: doBuy', id);
  }
  function cancelPreview() {
    console.log('TODO Task 16: cancelPreview');
  }
```

替换为:

```js
  function onClickItem(id) {
    const c = window.Cosmetics[id];
    if (!c) return;
    const owned = state.savedOwned.includes(id);
    if (owned) {
      // 直接换装,或取消装备
      const cur = state.savedEquipped[c.slot];
      const next = cur === id ? null : id;
      doEquip(c.slot, next);
    } else {
      // 试穿
      state.previewSlot = c.slot;
      state.previewCosmeticId = id;
      rerender();
    }
  }

  async function doEquip(slot, cosmeticId) {
    try {
      const newState = await window.Api.equipCosmetic(slot, cosmeticId);
      // 同步本地 + Platform.playerState
      state.savedEquipped = { ...newState.equipped_cosmetics };
      state.savedCoins = newState.total_coins;
      state.savedOwned = [...newState.owned_cosmetics];
      if (window.Platform) window.Platform.playerState = newState;
      state.previewSlot = null;
      state.previewCosmeticId = null;
      rerender();
    } catch (e) {
      console.error('equip failed', e);
      showToast('Oops 没穿上,再试试');
    }
  }

  async function doBuy(id) {
    try {
      const newState = await window.Api.buyCosmetic(id);
      state.savedEquipped = { ...newState.equipped_cosmetics };
      state.savedCoins = newState.total_coins;
      state.savedOwned = [...newState.owned_cosmetics];
      if (window.Platform) window.Platform.playerState = newState;
      state.previewSlot = null;
      state.previewCosmeticId = null;
      // 飘字 + 音效
      flyCoinDeduction(window.Cosmetics[id].price);
      window.Audio?.levelUp?.();
      rerender();
    } catch (e) {
      console.error('buy failed', e);
      const msg = String(e.message || '');
      if (msg.includes('insufficient')) showToast('金币不够');
      else if (msg.includes('already_owned')) showToast('已经有了');
      else showToast('Oops 没买上,再试试');
    }
  }

  function cancelPreview() {
    state.previewSlot = null;
    state.previewCosmeticId = null;
    rerender();
  }

  function showToast(msg) {
    if (!hostEl) return;
    const t = el('div', { class: 'shop-toast' }, msg);
    hostEl.appendChild(t);
    setTimeout(() => { try { hostEl.removeChild(t); } catch {} }, 2400);
  }

  function flyCoinDeduction(amount) {
    if (!hostEl) return;
    const f = el('div', { class: 'shop-coin-fly' }, '-' + amount + ' 💰');
    hostEl.appendChild(f);
    setTimeout(() => { try { hostEl.removeChild(f); } catch {} }, 1200);
  }
```

注意:`window.Audio.levelUp()` 是已存在的 4 音上行音效(凑十胜利、勋章解锁用),复用作"购买成功"的奖励音。如果想要专属"金币"音,可以后续在 `audio.js` 里加 `coin()` 方法,本期 levelUp 够用。

- [ ] **Step 3: Commit**

```bash
git add frontend/js/avatar/shop.js frontend/js/api.js
git commit -m "Wire shop preview/buy/equip state machine to backend API"
```

---

### Task 17: 主页布局 + enterShop (platform.js)

**Files:**
- Modify: `frontend/js/platform.js`

**Why:** 把红框区域填上角色;实现 `enterShop()` 切屏。

- [ ] **Step 1: 改 renderHome 在左侧加角色位**

In `frontend/js/platform.js`, modify `renderHome()`:

```js
  function renderHome() {
    homeEl.innerHTML = '';
    const wrap = el('div', { class: 'platform-home with-avatar' });

    // 左侧角色位
    const avatarSlot = el('div', { class: 'platform-avatar-slot' });
    if (window.AvatarHomeTile) {
      window.AvatarHomeTile.render(avatarSlot);
    }
    wrap.appendChild(avatarSlot);

    // 右侧:原有标题 + 游戏网格 + 家长链接
    const right = el('div', { class: 'platform-home-right' });
    right.appendChild(el('div', { class: 'platform-title' }, '⛏ 数学历险 ⛏'));
    right.appendChild(el('div', { class: 'platform-subtitle' }, '挑一个游戏开始冒险'));
    const grid = el('div', { class: 'game-grid' });
    (window.Games || []).forEach(g => {
      const card = el('div', {
        class: 'game-card ' + (g.color || 'green') + (g.enabled ? '' : ' locked'),
        onclick: g.enabled ? () => window.Platform.enterGame(g.id) : null,
      });
      card.appendChild(el('div', { class: 'game-card-icon' }, g.icon || '🎮'));
      card.appendChild(el('div', { class: 'game-card-name' }, g.name));
      grid.appendChild(card);
    });
    right.appendChild(grid);
    right.appendChild(el('a', { class: 'parent-link', href: '/dashboard' },
      '👨‍👩‍👧 家长仪表盘'));

    wrap.appendChild(right);
    homeEl.appendChild(wrap);
  }
```

- [ ] **Step 2: 加 enterShop**

In `frontend/js/platform.js`, after the `enterGame` method in `window.Platform`,加新方法:

```js
    enterShop() {
      if (currentGameId) {
        console.error('enterShop: a game is already active');
        return;
      }
      if (!window.AvatarShop) {
        console.error('enterShop: AvatarShop missing');
        return;
      }
      currentGameId = '__shop__';
      homeEl.classList.add('hidden');
      gameHostEl.classList.add('active');
      gameHostEl.innerHTML = '';
      window.AvatarShop.start(gameHostEl);
    },
```

修改现有的 `exit()` 方法,商店退出时也要走相同清理 + refresh,但调 `AvatarShop.exit()` 而不是游戏 module 的 exit:

```js
    async exit() {
      if (!currentGameId) return;
      if (currentGameId === '__shop__') {
        try { window.AvatarShop?.exit(); } catch (e) { console.error('shop exit error', e); }
      } else {
        const manifest = (window.Games || []).find(g => g.id === currentGameId);
        const mod = manifest ? window[manifest.module] : null;
        if (mod && typeof mod.exit === 'function') {
          try { mod.exit(); } catch (e) { console.error('game exit error', e); }
        }
      }
      currentGameId = null;
      gameHostEl.innerHTML = '';
      gameHostEl.classList.remove('active');
      homeEl.classList.remove('hidden');
      await this.refreshTopbar();
      // 同时把主页角色重新画一遍(装备可能变了)
      renderHome();
    },
```

- [ ] **Step 3: Commit**

```bash
git add frontend/js/platform.js
git commit -m "Wire home avatar slot and enterShop in platform.js"
```

---

### Task 18: avatar.css + index.html 引入

**Files:**
- Create: `frontend/css/avatar.css`
- Modify: `frontend/index.html`

- [ ] **Step 1: 写 avatar.css**

```css
/* === 主页角色位 === */
.platform-home.with-avatar {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 24px;
  align-items: center;
}
.platform-avatar-slot {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  min-height: 360px;
}
.avatar-home-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.avatar-home-tile {
  cursor: pointer;
  transition: transform 0.2s ease;
}
.avatar-home-tile:hover { transform: scale(1.05); }
.avatar-home-tile .avatar-svg {
  width: 200px; height: 400px; display: block;
}
.avatar-home-hint {
  background: rgba(0, 0, 0, 0.6);
  color: #ffd700;
  padding: 4px 12px;
  font-size: 14px;
  font-weight: bold;
  border: 2px solid #ffd700;
  font-family: inherit;
}

/* === 商店 === */
.shop-topbar {
  background: rgba(0, 0, 0, 0.7);
  color: #ffd700;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 16px;
  font-weight: bold;
  font-family: inherit;
}
.shop-back-btn,
.shop-action-buy,
.shop-action-cancel {
  background: #ffd700;
  color: #5a3a00;
  border: 2px solid #5a3a00;
  padding: 6px 14px;
  font-weight: bold;
  cursor: pointer;
  font-family: inherit;
}
.shop-back-btn:hover,
.shop-action-buy:hover { background: #fff080; }
.shop-action-buy.disabled,
.shop-action-buy:disabled {
  background: #888;
  color: #444;
  cursor: not-allowed;
}
.shop-action-cancel { background: #ccc; }
.shop-title { flex: 1; text-align: center; font-size: 16px; }
.shop-coins { font-size: 16px; }

.shop-body {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 16px;
  padding: 16px;
  background: linear-gradient(180deg, #87ceeb 0%, #87ceeb 50%, #6abe30 50%, #5a9c2a 100%);
  min-height: calc(100vh - 80px);
}
.shop-preview {
  background: rgba(255, 255, 255, 0.85);
  border: 3px solid #2a4a1a;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.shop-preview-avatar { position: relative; }
.shop-preview-avatar .avatar-svg {
  width: 200px; height: 400px;
}
.shop-preview-tag {
  display: inline-block;
  margin-top: 8px;
  background: #ff8000;
  color: #fff;
  padding: 4px 12px;
  font-weight: bold;
  border: 2px solid #ffd700;
}
.shop-summary {
  margin-top: 12px;
  width: 100%;
  background: #fff8e0;
  border: 2px solid #5a3a00;
  padding: 8px;
  font-size: 13px;
}
.shop-summary-row { padding: 2px 0; }

.shop-shelves {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}
.shop-shelf {
  background: rgba(255, 255, 255, 0.85);
  border: 3px solid #2a4a1a;
  padding: 8px 12px;
}
.shop-shelf-title {
  display: inline-block;
  background: #ffd700;
  color: #5a3a00;
  padding: 4px 12px;
  font-weight: bold;
  margin-bottom: 8px;
  border: 2px solid #5a3a00;
}
.shop-shelf-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}
.shop-item {
  background: #fff;
  border: 2px solid #5a3a00;
  padding: 8px;
  text-align: center;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: transform 0.1s;
}
.shop-item:hover { transform: scale(1.04); }
.shop-item-icon { width: 60px; height: 60px; }
.shop-item-icon svg { width: 60px; height: 60px; display: block; }
.shop-item-name { font-size: 11px; color: #5a3a00; line-height: 1.2; }
.shop-item-price {
  background: #2a4a1a;
  color: #ffd700;
  padding: 2px 6px;
  font-size: 11px;
  border: 1px solid #ffd700;
}
.shop-item-badge {
  font-size: 10px;
  color: #2a6a1a;
  font-weight: bold;
}
.shop-item-owned { background: #c8f0a0; }
.shop-item-equipped {
  background: #ffd700;
  border-color: #5a3a00;
  border-width: 3px;
}
.shop-item-previewing {
  outline: 3px solid #ff8000;
  outline-offset: 2px;
}

.shop-action-bar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 3px solid #ffd700;
  z-index: 100;
}
.shop-action-name { font-weight: bold; }

.shop-toast {
  position: fixed;
  top: 40%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  padding: 12px 20px;
  font-weight: bold;
  border: 3px solid #ff8000;
  z-index: 200;
}
.shop-coin-fly {
  position: fixed;
  top: 30%;
  left: 50%;
  transform: translate(-50%, 0);
  background: #ffd700;
  color: #5a3a00;
  padding: 8px 16px;
  font-size: 18px;
  font-weight: bold;
  border: 3px solid #5a3a00;
  z-index: 150;
  animation: coin-fly 1s ease-out;
  pointer-events: none;
}
@keyframes coin-fly {
  0% { transform: translate(-50%, 0); opacity: 1; }
  100% { transform: translate(-50%, -120px); opacity: 0; }
}

/* 让宽度超过 600 时左右排,窄屏改为竖排 */
@media (max-width: 600px) {
  .platform-home.with-avatar { grid-template-columns: 1fr; }
  .shop-body { grid-template-columns: 1fr; }
  .shop-shelf-grid { grid-template-columns: repeat(3, 1fr); }
}
```

- [ ] **Step 2: 改 index.html 引入新文件**

In `frontend/index.html`, add to the `<head>`:

```html
<link rel="stylesheet" href="/css/avatar.css">
```

In `<body>` 的 script 块,在 `platform.js` 之前加(顺序很关键):

```html
<script src="/js/avatar/avatar.js"></script>
<script src="/js/avatar/catalog.js"></script>
<script src="/js/avatar/home-tile.js"></script>
<script src="/js/avatar/shop.js"></script>
```

最终 script 顺序应该是:
```html
<script src="/js/api.js"></script>
<script src="/js/audio.js"></script>
<script src="/js/render.js"></script>
<script src="/js/badges.js"></script>
<script src="/js/drag.js"></script>
<script src="/js/avatar/avatar.js"></script>
<script src="/js/avatar/catalog.js"></script>
<script src="/js/avatar/home-tile.js"></script>
<script src="/js/avatar/shop.js"></script>
<script src="/games/cou-shi/game.js"></script>
<script src="/games/chai-kuang/game.js"></script>
<script src="/js/games-manifest.js"></script>
<script src="/js/platform.js"></script>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/css/avatar.css frontend/index.html
git commit -m "Add avatar.css and load avatar/shop modules in index.html"
```

---

### Task 19: E2E 手测 + 验收

**Why:** 没有自动化前端测试,逐项验证功能。

- [ ] **Step 1: 启动开发服务器**

```bash
./run.sh
```
(如果跑测试覆盖跑完 spec/plan 路径,先 `uv run pytest tests/test_cosmetics.py tests/test_api.py tests/test_decompose_api.py -v` 确认全绿。)

- [ ] **Step 2: 打开浏览器 http://localhost:8000 (或局域网 IP),逐项跑验收清单**

| # | 测试项 | 通过标准 |
|---|--------|---------|
| 1 | 主页左侧出现 Alex,默认装(绿 T、棕裤、灰鞋,橘红长发,绿眼睛) | ☐ |
| 2 | hover Alex 有微缩放 | ☐ |
| 3 | 点击 Alex 进商店,看到 4 槽位货架 + 角色预览 | ☐ |
| 4 | 货架上每件装扮显示图标 + 价格(未购)/名字 + 已拥有(已购)/穿着中(装备) | ☐ |
| 5 | 点未购的"鲜花" (30 金币),角色右手出现花,弹底部"购买💰30 / 取消" | ☐ |
| 6 | 同槽位再点未购的"苹果",角色右手切到苹果,购买栏更新为 30 金币 | ☐ |
| 7 | 点"取消" → 角色回原状,购买栏消失 | ☐ |
| 8 | 金币不够时(给账户设少钱模拟),购买按钮变灰显示"还差 N 金币" | ☐ |
| 9 | 金币足够时点购买 → 飘字"-30💰"、音效、卡片变金色"穿着中"、关闭购买栏 | ☐ |
| 10 | 已购的"鲜花"再点 → 直接换装,无确认 | ☐ |
| 11 | 点正在装备的"鲜花" → 取消装备(角色右手空) | ☐ |
| 12 | 点"返回"退出商店,主页 Alex 显示最新装扮 | ☐ |
| 13 | 刷新页面(F5),装扮持久(后端)正常显示 | ☐ |
| 14 | `kill` 后端进程后重启,装扮还在 | ☐ |
| 15 | 旧 game.db(没有新字段)启动后端,功能正常,默认全空 | ☐ |
| 16 | 平板横屏(>=900px宽)左角色右货架并排;窄屏(<600px)竖排 | ☐ |
| 17 | 玩一轮"凑十"游戏挣金币,回主菜单查到金币数变化 | ☐ |
| 18 | 后端按钮:`curl -X POST localhost:8000/api/cosmetics/buy -H 'Content-Type: application/json' -d '{"cosmetic_id":"fake"}'` 返回 400 | ☐ |

- [ ] **Step 3: 模拟旧 db (验收点 15)**

```bash
# 备份
cp data/game.db data/game.db.backup
# 删除新字段(模拟老 db)
sqlite3 data/game.db <<'SQL'
CREATE TABLE player_state_old (id INTEGER PRIMARY KEY, total_coins INTEGER DEFAULT 0,
  total_correct INTEGER DEFAULT 0, total_answered INTEGER DEFAULT 0,
  best_combo INTEGER DEFAULT 0, badges TEXT DEFAULT '{}');
INSERT INTO player_state_old SELECT id, total_coins, total_correct, total_answered,
  best_combo, badges FROM player_state;
DROP TABLE player_state;
ALTER TABLE player_state_old RENAME TO player_state;
SQL
# 重启后端 → 应自动迁移,装扮字段为空
./run.sh
# 测完恢复
mv data/game.db.backup data/game.db
```

- [ ] **Step 4: 修复发现的问题**

任何不通过的项立刻修。修完重跑相关项。

- [ ] **Step 5: 最终提交**

如果有微调,commit 一次:
```bash
git add -u
git commit -m "Polish avatar cosmetics after manual E2E testing"
```

---

## 完工后状态

- 主页左侧站立 Alex,展示当前装扮,可点击进商店
- 装扮商店全屏:左侧实时角色预览,右侧 4 个货架共 20 件装扮
- 试穿(未购)→ 购买/取消;已购点击=换装/取消装备
- 后端 SQLite 持久化,刷新/重启不丢
- 9 个后端单测覆盖核心场景,18 项前端验收清单跑过
- 旧 db 自动迁移,老用户无感升级
