# 矿石分解大师 (chai-kuang) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已有平台上加入第二个游戏 `chai-kuang`,孩子点矿石、锤子飞下来敲碎,小方块凑够 10 自动合成长条,练习"两位数 = 十位数 + 个位数"。

**Architecture:** 沿用平台 `frontend/games/<id>/` 单游戏目录约定,挂 `window.ChaiKuang = { start, exit }`。后端新建 `decompose_answers` 表 + `POST /api/decompose/answer` 端点,与现有 `cou-shi` 共享 `player_state.total_coins` 与 `daily_log`。

**Tech Stack:** Python 3.11+ / FastAPI / SQLite (sqlite3)。前端原生 HTML/CSS/JS,Web Audio,无构建步骤。

**Spec:** `docs/superpowers/specs/2026-04-30-chai-kuang-decompose-game-design.md`

---

## File Structure

**Backend(改/创):**
- `backend/db.py` — 加 `decompose_answers` 表 schema,扩 `BADGE_KEYS`,加 `log_decompose_answer()`、`get_decompose_streak()`、`get_decompose_total_count()`、`get_compose_correct_count()` 函数
- `backend/models.py` — 加 `DecomposeAnswerSubmit`、`DecomposeAnswerResult`
- `backend/api.py` — 加 `POST /api/decompose/answer` 路由 + 判答 + 勋章逻辑
- `tests/test_decompose_api.py` — 端到端测试

**Frontend(改/创):**
- `frontend/games/chai-kuang/game.js` — 游戏主控制器(IIFE,挂 `window.ChaiKuang`)
- `frontend/games/chai-kuang/chai-kuang.css` — 矿石/锤子/长条/方块/动画
- `frontend/js/games-manifest.js` — 把第一个 placeholder 换成 `chai-kuang` 注册
- `frontend/js/api.js` — 加 `Api.submitDecomposeAnswer()`
- `frontend/js/audio.js` — 加 `Audio.hammer()` 和 `Audio.merge()`
- `frontend/index.html` — 加 css/js link

每个文件单一职责,游戏自身代码全在 `frontend/games/chai-kuang/` 下,不外溢。

---

## Task 1: 后端 schema —— 加 `decompose_answers` 表 + 新 badge keys

**Files:**
- Modify: `backend/db.py`(`init_db()`、`BADGE_KEYS`)

- [ ] **Step 1: 写失败测试 —— 表存在且字段对**

`tests/test_decompose_api.py`(新建):

```python
"""分解游戏(chai-kuang)API 测试。

运行: uv run pytest tests/test_decompose_api.py -v
"""
from __future__ import annotations

import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    tmpdir = tempfile.mkdtemp()
    tmp_db = Path(tmpdir) / "test.db"
    from backend import db
    monkeypatch.setattr(db, "DB_PATH", tmp_db)
    db.init_db()
    from backend.main import app
    return TestClient(app)


def test_decompose_answers_table_exists(client):
    """schema 应有 decompose_answers 表,字段齐全。"""
    from backend import db
    with db.get_conn() as conn:
        c = conn.cursor()
        cols = c.execute("PRAGMA table_info(decompose_answers)").fetchall()
        names = {r["name"] for r in cols}
    assert names == {
        "id", "number", "question_type",
        "user_tens", "user_ones", "user_number",
        "correct", "elapsed_ms", "created_at",
    }


def test_new_badge_keys_registered():
    """BADGE_KEYS 应包含 3 个分解游戏的 key。"""
    from backend import db
    assert "decompose_50" in db.BADGE_KEYS
    assert "decompose_streak_5" in db.BADGE_KEYS
    assert "compose_perfect_10" in db.BADGE_KEYS
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
uv run pytest tests/test_decompose_api.py -v
```

Expected: 两个测试都 FAIL(`no such table` / `decompose_50 not in BADGE_KEYS`)

- [ ] **Step 3: 改 `backend/db.py` 让测试通过**

在 `BADGE_KEYS` 列表末尾追加:

```python
BADGE_KEYS = [
    "first_correct",
    "combo_5",
    "combo_10",
    "daily_done",
    "diamond_master",
    "week_warrior",
    "no_hint",
    "speed_demon",
    "decompose_50",
    "decompose_streak_5",
    "compose_perfect_10",
]
```

在 `init_db()` 的 `executescript` 里追加(在 daily_log 之后、CREATE INDEX 之前):

```sql
CREATE TABLE IF NOT EXISTS decompose_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number INTEGER NOT NULL,
    question_type TEXT NOT NULL,
    user_tens INTEGER,
    user_ones INTEGER,
    user_number INTEGER,
    correct INTEGER NOT NULL,
    elapsed_ms INTEGER,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_decompose_created ON decompose_answers(created_at);
CREATE INDEX IF NOT EXISTS idx_decompose_type ON decompose_answers(question_type);
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
uv run pytest tests/test_decompose_api.py -v
```

Expected: PASS(2 passed)

- [ ] **Step 5: 提交**

```bash
git add backend/db.py tests/test_decompose_api.py
git commit -m "$(cat <<'EOF'
Add decompose_answers schema and badge keys

Adds a separate table for the chai-kuang game's question logs and
registers the three new badge keys (decompose_50, decompose_streak_5,
compose_perfect_10) alongside cou-shi's existing badges.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 后端 DB helpers —— `log_decompose_answer` 与统计函数

**Files:**
- Modify: `backend/db.py`(末尾追加新函数)
- Test: `tests/test_decompose_api.py`(扩展)

- [ ] **Step 1: 写失败测试**

把这些用例追加到 `tests/test_decompose_api.py`(在已有 import 之外不需要新 import):

```python
def test_log_decompose_answer_inserts_row(client):
    """log_decompose_answer 应该写一行到表里,字段值正确。"""
    from backend import db
    db.log_decompose_answer(
        number=47,
        question_type="decompose",
        user_tens=4,
        user_ones=7,
        user_number=None,
        correct=True,
        elapsed_ms=12000,
    )
    with db.get_conn() as conn:
        rows = conn.execute("SELECT * FROM decompose_answers").fetchall()
    assert len(rows) == 1
    assert rows[0]["number"] == 47
    assert rows[0]["question_type"] == "decompose"
    assert rows[0]["user_tens"] == 4
    assert rows[0]["user_ones"] == 7
    assert rows[0]["user_number"] is None
    assert rows[0]["correct"] == 1


def test_log_decompose_answer_updates_daily_log(client):
    """分解游戏也算入今日进度,写到共享的 daily_log。"""
    from backend import db
    db.log_decompose_answer(
        number=23, question_type="observe",
        user_tens=None, user_ones=None, user_number=None,
        correct=True, elapsed_ms=5000,
    )
    state = db.get_player_state()
    assert state["today_done"] == 1
    assert state["today_correct"] == 1


def test_get_decompose_total_count(client):
    """累计敲碎矿石的次数(每道题=1次,无论题型/对错)。"""
    from backend import db
    for _ in range(3):
        db.log_decompose_answer(
            number=15, question_type="observe",
            user_tens=None, user_ones=None, user_number=None,
            correct=True, elapsed_ms=2000,
        )
    assert db.get_decompose_total_count() == 3


def test_get_decompose_streak(client):
    """连续答对'decompose'题型的最长尾部连击。"""
    from backend import db

    def write(qtype, correct):
        db.log_decompose_answer(
            number=42, question_type=qtype,
            user_tens=4 if qtype == "decompose" else None,
            user_ones=2 if qtype == "decompose" else None,
            user_number=42 if qtype == "compose" else None,
            correct=correct, elapsed_ms=1000,
        )

    # 5 道 decompose 都对
    for _ in range(5):
        write("decompose", True)
    assert db.get_decompose_streak() == 5

    # 一道错,streak 归零
    write("decompose", False)
    assert db.get_decompose_streak() == 0

    # 其它题型不计入 streak,observe 不影响
    write("observe", True)
    assert db.get_decompose_streak() == 0

    # 再来 2 道 decompose 对
    write("decompose", True)
    write("decompose", True)
    assert db.get_decompose_streak() == 2


def test_get_compose_correct_count(client):
    """累计 compose 题答对的次数。"""
    from backend import db
    for correct in (True, True, False, True):
        db.log_decompose_answer(
            number=58, question_type="compose",
            user_tens=None, user_ones=None,
            user_number=58 if correct else 50,
            correct=correct, elapsed_ms=3000,
        )
    assert db.get_compose_correct_count() == 3
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
uv run pytest tests/test_decompose_api.py -v
```

Expected: 5 个新测试 FAIL(`module 'backend.db' has no attribute 'log_decompose_answer'`)

- [ ] **Step 3: 在 `backend/db.py` 末尾追加这些函数**

```python
# ============== 分解游戏 (chai-kuang) ==============

def log_decompose_answer(
    *,
    number: int,
    question_type: str,
    user_tens: int | None,
    user_ones: int | None,
    user_number: int | None,
    correct: bool,
    elapsed_ms: int,
) -> None:
    """记录分解游戏的一道答题,同时写入共享 daily_log。"""
    today = today_str()
    with get_conn() as conn:
        c = conn.cursor()
        c.execute(
            """INSERT INTO decompose_answers
               (number, question_type, user_tens, user_ones, user_number,
                correct, elapsed_ms)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (number, question_type, user_tens, user_ones, user_number,
             int(correct), elapsed_ms),
        )
        c.execute(
            """INSERT INTO daily_log (date, questions_done, correct_count)
               VALUES (?, 1, ?)
               ON CONFLICT(date) DO UPDATE SET
                 questions_done = questions_done + 1,
                 correct_count = correct_count + ?""",
            (today, int(correct), int(correct)),
        )


def get_decompose_total_count() -> int:
    """累计敲过多少颗矿石(=分解游戏总答题数,无论题型/对错)。"""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM decompose_answers"
        ).fetchone()
    return row["n"]


def get_decompose_streak() -> int:
    """最近一段连续答对的 'decompose' 题型数量(尾部连击)。

    其它题型不打断也不计入(只看 decompose)。
    """
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT correct FROM decompose_answers
               WHERE question_type = 'decompose'
               ORDER BY id DESC"""
        ).fetchall()
    streak = 0
    for r in rows:
        if r["correct"] == 1:
            streak += 1
        else:
            break
    return streak


def get_compose_correct_count() -> int:
    """compose 题型累计答对次数。"""
    with get_conn() as conn:
        row = conn.execute(
            """SELECT COUNT(*) AS n FROM decompose_answers
               WHERE question_type = 'compose' AND correct = 1"""
        ).fetchone()
    return row["n"]
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
uv run pytest tests/test_decompose_api.py -v
```

Expected: 7 passed(2 旧 + 5 新)

- [ ] **Step 5: 提交**

```bash
git add backend/db.py tests/test_decompose_api.py
git commit -m "$(cat <<'EOF'
Add decompose answer logging and stat helpers

Adds log_decompose_answer() that shares daily_log with cou-shi, plus
read helpers (total count, decompose streak, compose correct count)
needed for the new badges.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 后端 Pydantic 模型

**Files:**
- Modify: `backend/models.py`(末尾追加)

- [ ] **Step 1: 在 `backend/models.py` 末尾追加**

```python
class DecomposeAnswerSubmit(BaseModel):
    """分解游戏提交一道题的答案。

    question_type:
      'observe'   - 看演示题,无需答案,后端永远判对
      'decompose' - 敲完填十位/个位,要 user_tens 和 user_ones
      'compose'   - 看图填完整两位数,要 user_number
    """
    number: int = Field(..., ge=10, le=99)
    question_type: str = Field(..., pattern="^(observe|decompose|compose)$")
    user_tens: int | None = Field(None, ge=0, le=9)
    user_ones: int | None = Field(None, ge=0, le=9)
    user_number: int | None = Field(None, ge=0, le=99)
    elapsed_ms: int = Field(..., ge=0)


class DecomposeAnswerResult(BaseModel):
    """分解游戏的判定结果 + 增量更新后的状态。"""
    correct: bool
    expected_tens: int      # 总是有,用于前端"答错时演示正确分解"
    expected_ones: int
    coins_earned: int
    new_badges: list[str]
    today_done: int
    daily_target_reached: bool
```

- [ ] **Step 2: 不需要单独跑测试**(本步只是定义类型,后续 Task 4 的测试会用到)

- [ ] **Step 3: 提交**

```bash
git add backend/models.py
git commit -m "$(cat <<'EOF'
Add Pydantic models for decompose game endpoint

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 后端 API 端点 + 判答 + 勋章

**Files:**
- Modify: `backend/api.py`(加 import + 路由 + 勋章逻辑)
- Test: `tests/test_decompose_api.py`(扩展)

- [ ] **Step 1: 写失败测试**

把这些用例追加到 `tests/test_decompose_api.py`:

```python
def test_observe_question_always_correct(client):
    """observe 题型不需要 user_*,永远判对,给 1 金币。"""
    r = client.post("/api/decompose/answer", json={
        "number": 47,
        "question_type": "observe",
        "elapsed_ms": 5000,
    })
    assert r.status_code == 200
    data = r.json()
    assert data["correct"] is True
    assert data["expected_tens"] == 4
    assert data["expected_ones"] == 7
    assert data["coins_earned"] == 1
    assert data["today_done"] == 1


def test_decompose_question_correct(client):
    r = client.post("/api/decompose/answer", json={
        "number": 53,
        "question_type": "decompose",
        "user_tens": 5,
        "user_ones": 3,
        "elapsed_ms": 8000,
    })
    data = r.json()
    assert data["correct"] is True
    assert data["expected_tens"] == 5
    assert data["expected_ones"] == 3
    assert data["coins_earned"] == 1


def test_decompose_question_wrong(client):
    r = client.post("/api/decompose/answer", json={
        "number": 53,
        "question_type": "decompose",
        "user_tens": 5,
        "user_ones": 4,           # 错
        "elapsed_ms": 8000,
    })
    data = r.json()
    assert data["correct"] is False
    assert data["expected_tens"] == 5
    assert data["expected_ones"] == 3
    assert data["coins_earned"] == 0


def test_compose_question_correct(client):
    r = client.post("/api/decompose/answer", json={
        "number": 36,
        "question_type": "compose",
        "user_number": 36,
        "elapsed_ms": 4000,
    })
    data = r.json()
    assert data["correct"] is True
    assert data["coins_earned"] == 1


def test_compose_question_wrong(client):
    r = client.post("/api/decompose/answer", json={
        "number": 36,
        "question_type": "compose",
        "user_number": 63,        # 错
        "elapsed_ms": 4000,
    })
    data = r.json()
    assert data["correct"] is False
    assert data["coins_earned"] == 0


def test_decompose_50_badge(client):
    """累计 50 道分解题(无论题型/对错)解锁 decompose_50。"""
    for i in range(49):
        r = client.post("/api/decompose/answer", json={
            "number": 23, "question_type": "observe", "elapsed_ms": 1000,
        })
    # 第 49 道还没解锁
    assert "decompose_50" not in r.json()["new_badges"]
    # 第 50 道解锁
    r = client.post("/api/decompose/answer", json={
        "number": 23, "question_type": "observe", "elapsed_ms": 1000,
    })
    assert "decompose_50" in r.json()["new_badges"]


def test_decompose_streak_5_badge(client):
    """连续答对 5 道 decompose 题,解锁 decompose_streak_5。"""
    last = None
    for _ in range(5):
        last = client.post("/api/decompose/answer", json={
            "number": 47, "question_type": "decompose",
            "user_tens": 4, "user_ones": 7,
            "elapsed_ms": 2000,
        })
    assert "decompose_streak_5" in last.json()["new_badges"]


def test_decompose_streak_resets_on_wrong(client):
    """答错重置 streak,但不扣金币不计错负面反馈。"""
    for _ in range(4):
        client.post("/api/decompose/answer", json={
            "number": 47, "question_type": "decompose",
            "user_tens": 4, "user_ones": 7, "elapsed_ms": 1000,
        })
    # 第 5 道答错
    r = client.post("/api/decompose/answer", json={
        "number": 47, "question_type": "decompose",
        "user_tens": 5, "user_ones": 7,           # 错
        "elapsed_ms": 1000,
    })
    assert r.json()["correct"] is False
    assert "decompose_streak_5" not in r.json()["new_badges"]


def test_compose_perfect_10_badge(client):
    """compose 累计答对 10 道,解锁 compose_perfect_10。"""
    last = None
    for _ in range(10):
        last = client.post("/api/decompose/answer", json={
            "number": 36, "question_type": "compose",
            "user_number": 36, "elapsed_ms": 2000,
        })
    assert "compose_perfect_10" in last.json()["new_badges"]


def test_compose_wrong_does_not_count_toward_perfect(client):
    """答错的 compose 题不算入 compose_perfect_10。"""
    for _ in range(9):
        client.post("/api/decompose/answer", json={
            "number": 36, "question_type": "compose",
            "user_number": 36, "elapsed_ms": 2000,
        })
    # 第 10 道答错,不解锁
    r = client.post("/api/decompose/answer", json={
        "number": 36, "question_type": "compose",
        "user_number": 63, "elapsed_ms": 2000,
    })
    assert "compose_perfect_10" not in r.json()["new_badges"]


def test_total_coins_shared_with_cou_shi(client):
    """金币池共享,分解游戏与 cou-shi 共用 player_state.total_coins。"""
    # 在 cou-shi 答对一道
    client.post("/api/answer", json={
        "a": 28, "b": 15, "user_answer": 43,
        "elapsed_ms": 3000, "used_hint": False, "current_combo": 0,
    })
    coins_after_cou_shi = client.get("/api/state").json()["total_coins"]
    # 在分解游戏答对一道
    client.post("/api/decompose/answer", json={
        "number": 47, "question_type": "observe", "elapsed_ms": 2000,
    })
    coins_after_chai_kuang = client.get("/api/state").json()["total_coins"]
    assert coins_after_chai_kuang == coins_after_cou_shi + 1
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
uv run pytest tests/test_decompose_api.py -v
```

Expected: 11 个新测试 FAIL(404 / endpoint not found)

- [ ] **Step 3: 改 `backend/api.py`**

加 import(改第 10 行附近):

```python
from .models import (
    AnswerResult, AnswerSubmit, PlayerState, StatsResponse,
    DecomposeAnswerSubmit, DecomposeAnswerResult,
)
```

在文件末尾追加:

```python
@router.post("/decompose/answer", response_model=DecomposeAnswerResult)
def submit_decompose_answer(payload: DecomposeAnswerSubmit) -> DecomposeAnswerResult:
    """提交分解游戏一道题。后端判对错并更新状态。"""
    expected_tens = payload.number // 10
    expected_ones = payload.number % 10

    if payload.question_type == "observe":
        correct = True
    elif payload.question_type == "decompose":
        correct = (payload.user_tens == expected_tens
                   and payload.user_ones == expected_ones)
    elif payload.question_type == "compose":
        correct = (payload.user_number == payload.number)
    else:
        # Pydantic pattern 已挡掉,兜底
        correct = False

    db.log_decompose_answer(
        number=payload.number,
        question_type=payload.question_type,
        user_tens=payload.user_tens,
        user_ones=payload.user_ones,
        user_number=payload.user_number,
        correct=correct,
        elapsed_ms=payload.elapsed_ms,
    )

    coins = 1 if correct else 0
    if coins:
        db.update_player_state(coins_delta=coins, correct_delta=1, answered_delta=1)
    else:
        db.update_player_state(answered_delta=1)

    state = db.get_player_state()
    new_badges = check_decompose_badges(state=state)
    if new_badges:
        update = {key: True for key in new_badges}
        db.update_player_state(answered_delta=0, badges_update=update)
        state = db.get_player_state()

    return DecomposeAnswerResult(
        correct=correct,
        expected_tens=expected_tens,
        expected_ones=expected_ones,
        coins_earned=coins,
        new_badges=new_badges,
        today_done=state["today_done"],
        daily_target_reached=state["today_done"] >= DAILY_TARGET,
    )


def check_decompose_badges(state: dict) -> list[str]:
    """返回这次答题新解锁的分解游戏勋章 key 列表。"""
    badges = state["badges"]
    newly = []

    def check(key: str, condition: bool):
        if condition and not badges.get(key, False):
            newly.append(key)

    check("decompose_50", db.get_decompose_total_count() >= 50)
    check("decompose_streak_5", db.get_decompose_streak() >= 5)
    check("compose_perfect_10", db.get_compose_correct_count() >= 10)
    return newly
```

- [ ] **Step 4: 跑测试,确认通过**

```bash
uv run pytest tests/test_decompose_api.py -v
uv run pytest -v   # 跑全套确保没回归 cou-shi
```

Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add backend/api.py tests/test_decompose_api.py
git commit -m "$(cat <<'EOF'
Add POST /api/decompose/answer with three question types

Three judgment paths (observe / decompose / compose) feed a shared
coin pool and daily progress with cou-shi. Three new badges fire
based on cumulative ore count, decompose streak, and compose
perfect count.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 前端 API client

**Files:**
- Modify: `frontend/js/api.js`

- [ ] **Step 1: 在 `Api` 对象里追加 `submitDecomposeAnswer`**

把:

```js
const Api = {
  getState: () => apiGet('/api/state'),
  submitAnswer: (payload) => apiPost('/api/answer', payload),
  getStats: (days = 30) => apiGet(`/api/stats?days=${days}`),
  reset: () => apiPost('/api/reset'),
};
```

改成:

```js
const Api = {
  getState: () => apiGet('/api/state'),
  submitAnswer: (payload) => apiPost('/api/answer', payload),
  submitDecomposeAnswer: (payload) => apiPost('/api/decompose/answer', payload),
  getStats: (days = 30) => apiGet(`/api/stats?days=${days}`),
  reset: () => apiPost('/api/reset'),
};
```

- [ ] **Step 2: 手动 sanity check**

```bash
./run.sh &
sleep 2
curl -s http://localhost:8000/api/decompose/answer \
  -H 'Content-Type: application/json' \
  -d '{"number":47,"question_type":"observe","elapsed_ms":1000}'
kill %1
```

Expected:JSON `{"correct":true,"expected_tens":4,"expected_ones":7,"coins_earned":1,...}`

- [ ] **Step 3: 提交**

```bash
git add frontend/js/api.js
git commit -m "$(cat <<'EOF'
Wire frontend Api.submitDecomposeAnswer

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 新增 8-bit 音效 —— 锤击 / 凑十合成

**Files:**
- Modify: `frontend/js/audio.js`

- [ ] **Step 1: 在 `Audio` 对象里追加两个方法**

把现有的 `Audio` 对象(从 `const Audio = {` 开始那块)中,在 `combo(n)` 方法之后、`toggle()` 之前插入:

```js
  // 锤击矿石的"咚",低频方波带快速衰减
  hammer() {
    beep(140, 0.12, 'square', 0.12);
    setTimeout(() => beep(90, 0.18, 'sawtooth', 0.08), 30);
  },
  // 凑十合成长条的"嗡!",上滑 + 高频铃声
  merge() {
    beep(440, 0.08, 'square', 0.08);
    setTimeout(() => beep(660, 0.08, 'square', 0.08), 60);
    setTimeout(() => beep(880, 0.18, 'square', 0.1), 120);
  },
```

- [ ] **Step 2: 在浏览器手动验证**

```bash
./run.sh
```

打开 `http://localhost:8000/`,在浏览器 DevTools console 里:

```js
Audio.unlock();
Audio.hammer();   // 应该听到"咚"
Audio.merge();    // 应该听到上滑的"嗡!"
```

- [ ] **Step 3: 提交**

```bash
git add frontend/js/audio.js
git commit -m "$(cat <<'EOF'
Add hammer and merge sounds for chai-kuang

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 注册新游戏到平台 manifest + index.html + 空骨架

**Files:**
- Modify: `frontend/js/games-manifest.js`
- Modify: `frontend/index.html`
- Create: `frontend/games/chai-kuang/game.js`(只放最小骨架)
- Create: `frontend/games/chai-kuang/chai-kuang.css`(空文件,后续填)

- [ ] **Step 1: 创建 `frontend/games/chai-kuang/chai-kuang.css`**

写入:

```css
/* === 矿石分解大师 - 游戏专属样式 === */
/* 后续在 Task 9-12 里逐步填充 */
```

- [ ] **Step 2: 创建 `frontend/games/chai-kuang/game.js`**

写入(最小骨架,start 渲染一个临时屏 + 退出按钮):

```js
// === 矿石分解大师(chai-kuang)主控制器 ===
// 屏幕状态机 + 题目流程。挂 window.ChaiKuang = { start, exit }

(function () {
  const R = window.Render;
  if (!R) throw new Error('chai-kuang/game.js: render.js 必须先加载');
  const { el } = R;

  let hostElement = null;
  let listenerCleanups = [];

  function getHost() {
    if (!hostElement) throw new Error('ChaiKuang 未初始化');
    return hostElement;
  }

  // 临时占位屏,后续 Task 替换
  function renderPlaceholder() {
    const screen = el('div', { class: 'screen' });
    screen.appendChild(el('div', { class: 'screen-title' }, '🔨 矿石分解大师'));
    screen.appendChild(el('div', {
      style: 'padding:20px;text-align:center;',
    }, '游戏开发中...'));
    screen.appendChild(el('button', {
      class: 'menu-btn', onclick: () => Platform.exit(),
    }, '🏠 我玩够了'));
    return screen;
  }

  function render() {
    const app = getHost();
    app.innerHTML = '';
    app.appendChild(renderPlaceholder());
  }

  window.ChaiKuang = {
    start(host) {
      hostElement = host;
      const unlock = () => {
        Audio.unlock();
        document.removeEventListener('click', unlock);
      };
      document.addEventListener('click', unlock, { once: true });
      listenerCleanups.push(() =>
        document.removeEventListener('click', unlock));
      render();
    },
    exit() {
      listenerCleanups.forEach(fn => fn());
      listenerCleanups = [];
      if (hostElement) hostElement.innerHTML = '';
      hostElement = null;
    },
  };
})();
```

- [ ] **Step 3: 改 `frontend/js/games-manifest.js`**

把第一个 placeholder(`id: 'placeholder-1'`)替换为:

```js
{
  id: 'chai-kuang',
  name: '矿石分解大师',
  icon: '🔨',
  color: 'orange',
  module: 'ChaiKuang',
  enabled: true,
},
```

- [ ] **Step 4: 改 `frontend/index.html`**

在 `<link rel="stylesheet" href="/games/cou-shi/cou-shi.css">` 之后追加:

```html
<link rel="stylesheet" href="/games/chai-kuang/chai-kuang.css">
```

在 `<script src="/games/cou-shi/game.js"></script>` 之后追加:

```html
<script src="/games/chai-kuang/game.js"></script>
```

- [ ] **Step 5: 手动验证**

```bash
./run.sh
```

打开 `http://localhost:8000/`:
- 首页应看到 3 个卡片:绿色"凑十大冒险"、橙色"矿石分解大师"、灰色锁住的"敬请期待"
- 点橙色卡片 → 进入空白屏,显示"游戏开发中..."
- 点"🏠 我玩够了" → 返回首页
- 再点"凑十大冒险"应正常进入(确认未误伤)

注意:橙色卡片需要 `.game-card.orange` 样式。如果没有视觉特殊处理(就是普通 card 样式),先不管。如果颜色特别难看,在 `frontend/css/platform.css` 加:

```css
.game-card.orange {
  background: var(--gold, #FFA000);
  border-top-color: #FFD54F;
  border-left-color: #FFD54F;
  border-right-color: #FF8F00;
  border-bottom-color: #FF8F00;
}
```

- [ ] **Step 6: 提交**

```bash
git add frontend/games/chai-kuang/ frontend/js/games-manifest.js \
        frontend/index.html frontend/css/platform.css
git commit -m "$(cat <<'EOF'
Register chai-kuang game with platform skeleton

Adds the orange tile to the home grid; entering it shows a placeholder
screen with a working exit button. Real gameplay lands in subsequent
tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 矿石与物品栏的静态布局 + CSS

**Files:**
- Modify: `frontend/games/chai-kuang/chai-kuang.css`
- Modify: `frontend/games/chai-kuang/game.js`(替换 `renderPlaceholder` → `renderGame`)

目标:把游戏屏的 DOM 骨架渲染出来 —— 中央矿石(数字 47),左下"十位"区,右下"个位"区,顶部"我玩够了"按钮。先不接交互,只是静态画面好看。

- [ ] **Step 1: 在 `chai-kuang.css` 写样式**

```css
/* === 矿石分解大师 - 游戏专属样式 === */

.ck-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 12px;
  position: relative;
}

.ck-exit {
  align-self: flex-start;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  border: 2px solid white;
  font-size: 14px;
  padding: 4px 12px;
  cursor: pointer;
  font-family: inherit;
}

/* === 矿石区 === */
.ck-ore-area {
  flex: 1.4;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  min-height: 180px;
}

.ck-ore {
  position: relative;
  width: 200px;
  height: 200px;
  display: flex;
  flex-wrap: wrap;
  align-content: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.1s;
  user-select: none;
}
.ck-ore.shake { animation: ck-shake 0.25s; }
.ck-ore.gone { opacity: 0; pointer-events: none; transition: opacity 0.4s; }

@keyframes ck-shake {
  0%, 100% { transform: translate(0, 0); }
  25% { transform: translate(-3px, 2px); }
  50% { transform: translate(3px, -2px); }
  75% { transform: translate(-2px, -3px); }
}

.ck-ore-cube {
  width: 12px;
  height: 12px;
  background: #8D6E63;
  border-top: 2px solid #BCAAA4;
  border-left: 2px solid #BCAAA4;
  border-right: 2px solid #5D4037;
  border-bottom: 2px solid #5D4037;
  margin: 0;
  box-sizing: border-box;
}

.ck-ore-label {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.65);
  color: white;
  font-family: 'Press Start 2P', monospace;
  font-size: 36px;
  padding: 6px 14px;
  border: 3px solid #FFD54F;
  text-shadow: 2px 2px 0 #000;
  pointer-events: none;
}

/* === 锤子 === */
.ck-hammer {
  position: absolute;
  top: 0; right: 8px;
  font-size: 48px;
  transform-origin: bottom left;
  transform: translate(0, -120%) rotate(-30deg);
  pointer-events: none;
}
.ck-hammer.strike {
  animation: ck-hammer-strike 0.25s ease-in-out;
}
@keyframes ck-hammer-strike {
  0%   { transform: translate(0, -120%) rotate(-30deg); }
  50%  { transform: translate(-40%, -10%) rotate(40deg); }
  100% { transform: translate(0, -120%) rotate(-30deg); }
}

/* === 物品栏 === */
.ck-inventory {
  display: flex;
  border-top: 4px solid #5D4037;
  background: rgba(255, 255, 255, 0.85);
  min-height: 180px;
}
.ck-bin {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 8px;
}
.ck-bin + .ck-bin {
  border-left: 4px solid #5D4037;
}
.ck-bin-label {
  font-family: 'ZCOOL KuaiLe', sans-serif;
  font-size: 22px;
  color: #5D4037;
  text-align: center;
  margin-bottom: 8px;
}
.ck-bin-label .sub {
  display: block;
  font-size: 13px;
  color: #8D6E63;
}
.ck-bin-area {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  justify-content: center;
  gap: 4px;
  position: relative;
}

/* 长条样式复用 .bar-block,但分解游戏里色调与 cou-shi 不同,加修饰类 */
.ck-bin-area .bar-block { margin: 2px; }

/* === 飞行中的方块/长条 === */
.ck-fly {
  position: absolute;
  z-index: 10;
  pointer-events: none;
  transition: transform 0.4s ease-in, opacity 0.4s;
}

.ck-merge-glow {
  animation: ck-glow 0.2s ease-out;
}
@keyframes ck-glow {
  0%   { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); }
  50%  { box-shadow: 0 0 16px 8px rgba(255, 215, 0, 0.9); }
  100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.0); }
}

/* === 题目区 === */
.ck-question {
  background: rgba(255, 255, 255, 0.9);
  border: 3px solid #5D4037;
  padding: 10px;
  margin-top: 8px;
  text-align: center;
  font-family: 'ZCOOL KuaiLe', sans-serif;
  font-size: 18px;
  color: #5D4037;
}

.ck-input-row {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.ck-input-slot {
  display: inline-block;
  min-width: 48px;
  height: 48px;
  line-height: 48px;
  background: white;
  border: 3px solid #5D4037;
  font-family: 'Press Start 2P', monospace;
  font-size: 28px;
  color: #2E7D32;
  cursor: pointer;
  text-align: center;
  padding: 0 8px;
}
.ck-input-slot.active {
  border-color: #FFD54F;
  box-shadow: 0 0 0 3px rgba(255, 213, 79, 0.5) inset;
}
.ck-input-slot.empty { color: #BDBDBD; }
.ck-input-slot.flash { animation: ck-flash 0.3s; }
@keyframes ck-flash {
  0%, 100% { background: white; }
  50% { background: #FFE082; }
}

.ck-keypad {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  margin-top: 8px;
}
.ck-keypad button {
  font-family: 'Press Start 2P', monospace;
  font-size: 18px;
  padding: 12px 0;
  background: #FFA000;
  color: white;
  border-top: 3px solid #FFD54F;
  border-left: 3px solid #FFD54F;
  border-right: 3px solid #FF8F00;
  border-bottom: 3px solid #FF8F00;
  cursor: pointer;
}
.ck-keypad button:active { transform: translate(2px, 2px); }
.ck-keypad button.delete { background: #757575; border-color: #BDBDBD #BDBDBD #424242 #424242; }
.ck-keypad button.submit { background: #2E7D32; border-color: #66BB6A #66BB6A #1B5E20 #1B5E20; }
```

(注:`.bar-block` 已由 `frontend/css/pixel.css` 提供 —— `render.js` 的 `renderBar()` 用的就是这个类,我们直接复用,不重写。)

- [ ] **Step 2: 改 `game.js` —— 用真正的游戏屏代替占位**

替换 IIFE 内的 `renderPlaceholder` 与 `render` 函数为下面的代码。

把:
```js
  function renderPlaceholder() {
    const screen = el('div', { class: 'screen' });
    screen.appendChild(el('div', { class: 'screen-title' }, '🔨 矿石分解大师'));
    screen.appendChild(el('div', {
      style: 'padding:20px;text-align:center;',
    }, '游戏开发中...'));
    screen.appendChild(el('button', {
      class: 'menu-btn', onclick: () => Platform.exit(),
    }, '🏠 我玩够了'));
    return screen;
  }

  function render() {
    const app = getHost();
    app.innerHTML = '';
    app.appendChild(renderPlaceholder());
  }
```

替换为:
```js
  // 当前题目状态(本 Task 仅用 currentNumber 演示静态画面,
  // Task 11 起会真正驱动题型与流程)
  let currentNumber = 47;
  let oreRemaining = 47;
  let tensCount = 0;
  let onesCount = 0;

  function renderOre() {
    const ore = el('div', { class: 'ck-ore', id: 'ck-ore' });
    for (let i = 0; i < oreRemaining; i++) {
      ore.appendChild(el('div', { class: 'ck-ore-cube' }));
    }
    ore.appendChild(el('div', { class: 'ck-ore-label', id: 'ck-ore-label' },
      String(oreRemaining)));
    return ore;
  }

  function renderInventory() {
    const inv = el('div', { class: 'ck-inventory' });

    const tensBin = el('div', { class: 'ck-bin' });
    tensBin.appendChild(el('div', { class: 'ck-bin-label', html:
      '十位<span class="sub">(长条)</span>' }));
    const tensArea = el('div', { class: 'ck-bin-area', id: 'ck-tens-area' });
    for (let i = 0; i < tensCount; i++) {
      tensArea.appendChild(R.renderBar('', 10));
    }
    tensBin.appendChild(tensArea);

    const onesBin = el('div', { class: 'ck-bin' });
    onesBin.appendChild(el('div', { class: 'ck-bin-label', html:
      '个位<span class="sub">(方块)</span>' }));
    const onesArea = el('div', { class: 'ck-bin-area', id: 'ck-ones-area' });
    for (let i = 0; i < onesCount; i++) {
      onesArea.appendChild(makeOneBlock());
    }
    onesBin.appendChild(onesArea);

    inv.appendChild(tensBin);
    inv.appendChild(onesBin);
    return inv;
  }

  function makeOneBlock() {
    // 复用 render.js renderSingles 的样式("single-cube")
    const cube = el('div', { class: 'single-cube' });
    cube.appendChild(el('div', { class: 'cube-label' }, '1'));
    return cube;
  }

  function renderGameScreen() {
    const screen = el('div', { class: 'ck-screen' });
    screen.appendChild(el('button', {
      class: 'ck-exit', onclick: () => Platform.exit(),
    }, '🏠 我玩够了'));

    const oreArea = el('div', { class: 'ck-ore-area' });
    oreArea.appendChild(el('div', { class: 'ck-hammer', id: 'ck-hammer' }, '🔨'));
    oreArea.appendChild(renderOre());
    screen.appendChild(oreArea);

    screen.appendChild(renderInventory());

    // 题目占位区(Task 11 接入)
    screen.appendChild(el('div', { class: 'ck-question' }, '点矿石试试看!'));

    return screen;
  }

  function render() {
    const app = getHost();
    app.innerHTML = '';
    app.appendChild(renderGameScreen());
  }
```

- [ ] **Step 3: 手动验证**

```bash
./run.sh
```

打开 `http://localhost:8000/` → 点橙色卡片。应看到:
- 顶部"🏠 我玩够了"按钮(点击能返回首页)
- 中央 200×200 区,47 个棕色像素方块堆出一片不规则形状,中央叠"47"金边大字
- 矿石右上角的锤子(暂时不会动)
- 下面物品栏:左"十位 (长条)" 区空着,右"个位 (方块)" 区空着
- 题目区:占位文字"点矿石试试看!"

矿石点击暂时没反应(下个 task 接交互)。

- [ ] **Step 4: 提交**

```bash
git add frontend/games/chai-kuang/
git commit -m "$(cat <<'EOF'
Render chai-kuang game screen layout

Static ore + hammer + tens/ones bins. No interaction yet — clicking
the ore does nothing, that ships in the next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: 敲矿核心交互 —— 锤击 / 飞落 / 自动凑十合成

**Files:**
- Modify: `frontend/games/chai-kuang/game.js`

目标:点矿石 → 锤子动 + 音效 + 一波小方块从矿石飞进个位区 + 矿石数字下降 → 个位区 ≥10 时,前 10 个金光闪 + 飞向十位区合成长条。最后一锤把剩余敲完。

- [ ] **Step 1: 在 IIFE 顶部加状态/常量**

在 `let currentNumber = 47;` 这一行之前插入:

```js
  const HAMMER_DURATION_MS = 250;     // 锤子飞下→飞回总时长
  const FLY_TO_BIN_MS = 350;          // 方块从矿石飞到个位区
  const MERGE_GLOW_MS = 200;          // 凑十时金光闪
  const MERGE_FLY_MS = 400;           // 凑十时方块飞向十位区
  const STRIKE_MIN = 3;
  const STRIKE_MAX = 5;
  const FINISH_THRESHOLD = 7;         // 剩余 ≤ 这个值时一锤敲完

  let isHammering = false;
  let onOreFinished = null;           // 矿石被敲完后回调(Task 11 注入)
```

把:
```js
  let currentNumber = 47;
  let oreRemaining = 47;
  let tensCount = 0;
  let onesCount = 0;
```

改为(改名 `currentNumber` → `currentOreNumber` 让语义更清晰):
```js
  let currentOreNumber = 47;
  let oreRemaining = 47;
  let tensCount = 0;
  let onesCount = 0;
```

(同步把 `renderOre` 里的逻辑保持只用 `oreRemaining`,不依赖 `currentOreNumber`。)

- [ ] **Step 2: 加敲矿与凑十函数**

在 `renderGameScreen` 函数之后插入:

```js
  // ============== 敲矿 ==============

  function strikeOre() {
    if (isHammering) return;
    if (oreRemaining <= 0) return;
    isHammering = true;

    // 锤子动画 + 矿石抖动 + 音效
    const hammer = document.getElementById('ck-hammer');
    if (hammer) {
      hammer.classList.add('strike');
      setTimeout(() => hammer.classList.remove('strike'), HAMMER_DURATION_MS);
    }
    const ore = document.getElementById('ck-ore');
    if (ore) {
      ore.classList.add('shake');
      setTimeout(() => ore.classList.remove('shake'), 250);
    }
    Audio.hammer();

    // 算这一锤敲多少个
    const strikeCount = oreRemaining <= FINISH_THRESHOLD
      ? oreRemaining
      : Math.floor(Math.random() * (STRIKE_MAX - STRIKE_MIN + 1)) + STRIKE_MIN;

    // 等锤子触底再开始飞方块(锤子动画 50% = 125ms 处)
    setTimeout(() => {
      flyCubesFromOre(strikeCount, () => {
        // 飞完之后:更新矿石计数,检查凑十,解锁下次点击
        updateOreVisual();
        checkAutoMerge(() => {
          isHammering = false;
          if (oreRemaining <= 0 && onOreFinished) {
            const cb = onOreFinished;
            onOreFinished = null;
            cb();
          }
        });
      });
    }, HAMMER_DURATION_MS / 2);
  }

  function flyCubesFromOre(count, done) {
    // 把矿石上随机 count 个 cube 标记移除,在屏幕坐标系上加 count 个
    // .ck-fly 元素从矿石原位飞到个位区。
    const ore = document.getElementById('ck-ore');
    const onesArea = document.getElementById('ck-ones-area');
    if (!ore || !onesArea) { done && done(); return; }

    const cubes = Array.from(ore.querySelectorAll('.ck-ore-cube'));
    const picked = [];
    for (let i = 0; i < count && cubes.length > 0; i++) {
      const idx = Math.floor(Math.random() * cubes.length);
      picked.push(cubes.splice(idx, 1)[0]);
    }

    const targetRect = onesArea.getBoundingClientRect();
    let arrived = 0;
    const total = picked.length;
    if (total === 0) { done && done(); return; }

    picked.forEach((cube, i) => {
      const r = cube.getBoundingClientRect();
      cube.remove();
      oreRemaining--;

      const fly = el('div', { class: 'ck-fly ck-ore-cube' });
      fly.style.left = r.left + 'px';
      fly.style.top = r.top + 'px';
      fly.style.position = 'fixed';
      document.body.appendChild(fly);

      // 终点:个位区中心,带一点散开
      const tx = targetRect.left + targetRect.width / 2 - r.left
                 + (Math.random() * 60 - 30);
      const ty = targetRect.top + targetRect.height / 2 - r.top
                 + (Math.random() * 30 - 15);

      requestAnimationFrame(() => {
        fly.style.transition =
          `transform ${FLY_TO_BIN_MS}ms cubic-bezier(.4,.0,.6,1.4)`;
        fly.style.transform = `translate(${tx}px, ${ty}px)`;
      });

      setTimeout(() => {
        fly.remove();
        // 把方块"落"进个位区
        onesCount++;
        onesArea.appendChild(makeOneBlock());
        arrived++;
        if (arrived === total) done && done();
      }, FLY_TO_BIN_MS + i * 30);
    });
  }

  function updateOreVisual() {
    const label = document.getElementById('ck-ore-label');
    if (label) label.textContent = String(oreRemaining);
    const ore = document.getElementById('ck-ore');
    if (ore && oreRemaining <= 0) ore.classList.add('gone');
  }

  function checkAutoMerge(done) {
    if (onesCount < 10) { done && done(); return; }
    const onesArea = document.getElementById('ck-ones-area');
    const tensArea = document.getElementById('ck-tens-area');
    if (!onesArea || !tensArea) { done && done(); return; }

    // 取前 10 个 single-cube
    const cubes = Array.from(onesArea.querySelectorAll('.single-cube')).slice(0, 10);

    // Step 1: 整组金光闪
    cubes.forEach(c => c.classList.add('ck-merge-glow'));
    Audio.merge();

    setTimeout(() => {
      // Step 2: 把这 10 个移除,在 DOM 上从原位飞到十位区,合体为一根长条
      const targetRect = tensArea.getBoundingClientRect();
      const startRect = cubes[0].getBoundingClientRect();
      cubes.forEach(c => c.remove());
      onesCount -= 10;

      const flyBar = R.renderBar('', 10);
      flyBar.classList.add('ck-fly');
      flyBar.style.position = 'fixed';
      flyBar.style.left = startRect.left + 'px';
      flyBar.style.top = startRect.top + 'px';
      document.body.appendChild(flyBar);

      const tx = targetRect.left + targetRect.width / 2 - startRect.left - 60;
      const ty = targetRect.top + targetRect.height / 2 - startRect.top - 16;

      requestAnimationFrame(() => {
        flyBar.style.transition = `transform ${MERGE_FLY_MS}ms ease-in-out`;
        flyBar.style.transform = `translate(${tx}px, ${ty}px)`;
      });

      setTimeout(() => {
        flyBar.remove();
        tensCount++;
        tensArea.appendChild(R.renderBar('', 10));
        // 可能还有 ≥10 个剩,继续递归
        checkAutoMerge(done);
      }, MERGE_FLY_MS);
    }, MERGE_GLOW_MS);
  }
```

- [ ] **Step 3: 把矿石点击事件接上**

在 `renderOre` 里把:

```js
    const ore = el('div', { class: 'ck-ore', id: 'ck-ore' });
```

改为:

```js
    const ore = el('div', { class: 'ck-ore', id: 'ck-ore', onclick: strikeOre });
```

- [ ] **Step 4: 状态重置 —— `start()` 里清零**

把 `start(host)` 里的:

```js
    start(host) {
      hostElement = host;
      const unlock = () => { ... };
      ...
      render();
    },
```

改为(确保进入游戏时计数清零):

```js
    start(host) {
      hostElement = host;
      currentOreNumber = 47;
      oreRemaining = 47;
      tensCount = 0;
      onesCount = 0;
      isHammering = false;
      onOreFinished = null;
      const unlock = () => {
        Audio.unlock();
        document.removeEventListener('click', unlock);
      };
      document.addEventListener('click', unlock, { once: true });
      listenerCleanups.push(() =>
        document.removeEventListener('click', unlock));
      render();
    },
```

- [ ] **Step 5: 手动测试**

```bash
./run.sh
```

进入分解游戏:
- 点矿石 → 锤子飞下来砸 + "咚"音效 + 矿石抖动 + 3~5 个棕色方块从矿石飞向个位区
- 矿石中央数字同步减少(47 → 42/43/44 等)
- 多点几下,个位区方块攒到 ≥10 时:前 10 个金光闪 200ms → 飞向十位区合成长条 + "嗡!"音效 → 十位区多一根长条
- 继续敲 → 重复直到矿石数字归零、矿石淡出
- 最后看物品栏应该是 4 长条 + 7 方块

边界数字测试(用 console 改 `oreRemaining = 19; render();` 试):
- 19 → 应该 1 长条 + 9 方块
- 10 → 应该 1 长条 + 0 方块
- 99 → 应该 9 长条 + 9 方块

- [ ] **Step 6: 提交**

```bash
git add frontend/games/chai-kuang/game.js
git commit -m "$(cat <<'EOF'
Implement chai-kuang ore-strike + auto-merge

Click ore → hammer animates → 3-5 cubes fly to ones bin → when
ones >= 10, the front 10 glow then fly across to merge into a tens
bar. Last hammer auto-finishes the ore when remaining <= 7.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: 题目生成与三种题型的屏幕路由

**Files:**
- Modify: `frontend/games/chai-kuang/game.js`

目标:`start()` 不再自动渲染矿石,而是先生成题目(随机三种题型之一),根据题型分支到不同 render 函数。这一 task 只接 **题型 A(observe)** 走通端到端流程,B/C 在后续 task 接。

- [ ] **Step 1: 加题目生成与题型常量**

在文件顶部 IIFE 内的状态常量后(`let onOreFinished = null;` 之后)加:

```js
  const QUESTION_TYPES = ['observe', 'decompose', 'compose'];
  let currentQuestion = null;        // {number, type}
  let questionStartTime = 0;
```

加题目生成函数(在 `strikeOre` 之前):

```js
  function generateQuestion() {
    const number = Math.floor(Math.random() * 90) + 10;  // 10~99
    const type = QUESTION_TYPES[Math.floor(Math.random() * QUESTION_TYPES.length)];
    return { number, type };
  }

  function nextQuestion() {
    currentQuestion = generateQuestion();
    questionStartTime = Date.now();
    // 重置矿石/物品栏
    currentOreNumber = currentQuestion.number;
    oreRemaining = currentQuestion.number;
    tensCount = 0;
    onesCount = 0;
    isHammering = false;
    onOreFinished = null;
    render();
  }

  async function submitCurrentAnswer(payload) {
    let result;
    try {
      result = await Api.submitDecomposeAnswer({
        number: currentQuestion.number,
        question_type: currentQuestion.type,
        elapsed_ms: Date.now() - questionStartTime,
        ...payload,
      });
    } catch (e) {
      showToast('存档没成功,再试一次?');
      return null;
    }
    await Platform.refreshTopbar();
    return result;
  }

  function showToast(text) {
    const t = el('div', {
      style:
        'position:fixed;left:50%;top:30%;transform:translateX(-50%);' +
        'background:#212121;color:white;padding:10px 18px;border:3px solid #FFD54F;' +
        'font-family:"ZCOOL KuaiLe",sans-serif;font-size:18px;z-index:1000;',
    }, text);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }
```

- [ ] **Step 2: 把 `render()` 改成根据题型分发**

替换:

```js
  function render() {
    const app = getHost();
    app.innerHTML = '';
    app.appendChild(renderGameScreen());
  }
```

为:

```js
  function render() {
    const app = getHost();
    app.innerHTML = '';
    if (!currentQuestion) {
      app.appendChild(renderGameScreen());  // 兜底,正常不会走到
      return;
    }
    if (currentQuestion.type === 'compose') {
      app.appendChild(renderComposeScreen());
    } else {
      // observe / decompose 都要敲矿石
      app.appendChild(renderStrikeScreen());
    }
  }
```

把 `renderGameScreen` 改名为 `renderStrikeScreen`,并把它内部的"题目占位区"那段:

```js
    screen.appendChild(el('div', { class: 'ck-question' }, '点矿石试试看!'));
```

替换为:

```js
    screen.appendChild(renderQuestionPanel());
```

并加题目面板渲染(放在 `renderStrikeScreen` 之后):

```js
  function renderQuestionPanel() {
    const panel = el('div', { class: 'ck-question', id: 'ck-question' });
    if (currentQuestion.type === 'observe') {
      if (oreRemaining > 0) {
        panel.appendChild(el('div', null,
          '🔨 把矿石敲完,看看 ' + currentQuestion.number + ' 是怎么组成的'));
      } else {
        // observe 完成态(Task 11/13 接 finalize)
        panel.appendChild(el('div', null, '看!分解完成 ✨'));
      }
    } else if (currentQuestion.type === 'decompose') {
      panel.appendChild(el('div', null,
        '🔨 把矿石敲完,然后填出它有几个十、几个一'));
    }
    return panel;
  }

  // compose 题型暂时占位,Task 12 接
  function renderComposeScreen() {
    const screen = el('div', { class: 'ck-screen' });
    screen.appendChild(el('button', {
      class: 'ck-exit', onclick: () => Platform.exit(),
    }, '🏠 我玩够了'));
    screen.appendChild(el('div', { class: 'ck-question' },
      'compose 题(待 Task 12 实装)'));
    return screen;
  }
```

- [ ] **Step 3: `start()` 改为初始化第一道题**

把 `start(host)` 里的:

```js
      currentOreNumber = 47;
      oreRemaining = 47;
      tensCount = 0;
      onesCount = 0;
      isHammering = false;
      onOreFinished = null;
      ...
      render();
```

改为:

```js
      currentQuestion = null;
      ...
      nextQuestion();
```

(注意保留中间的 `unlock` 监听器注册,以及 `listenerCleanups` 推入。)

- [ ] **Step 4: 手动验证**

```bash
./run.sh
```

进入分解游戏多次:
- 看 console 没报错
- 题目区文案根据随机题型变(observe / decompose / compose)
- observe 和 decompose 显示矿石 + 物品栏 + 题目区文案;compose 显示占位文字

注意:此时 observe 敲完矿石后没"继续"按钮,会卡住 —— 这正常,Task 11 接 observe 完成流程。

- [ ] **Step 5: 提交**

```bash
git add frontend/games/chai-kuang/game.js
git commit -m "$(cat <<'EOF'
Add question generator and screen routing for three types

start() now generates a random question; observe/decompose render the
strike screen; compose screen is a placeholder until task 12.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: 题型 A (observe) —— 看演示流程

**Files:**
- Modify: `frontend/games/chai-kuang/game.js`

目标:observe 题型敲完后,题目区显示 "47 = 4 个十 + 7 个一" 大字 + "▶ 继续" 按钮 → 点继续走 `submitCurrentAnswer({})` 给金币 → 进下一题。

- [ ] **Step 1: 在 `nextQuestion()` 之后加 `finalizeObserve` 函数**

```js
  async function finalizeObserve() {
    const result = await submitCurrentAnswer({
      user_tens: null, user_ones: null, user_number: null,
    });
    if (!result) return;  // 网络失败,toast 已弹
    Audio.correct();
    if (result.new_badges.length > 0) Audio.levelUp();
    showCelebration(result, () => nextQuestion());
  }

  function showCelebration(result, done) {
    // 通用胜利气泡(observe / decompose / compose 共用)
    const overlay = el('div', {
      style:
        'position:fixed;left:0;top:0;right:0;bottom:0;' +
        'background:rgba(0,0,0,0.5);display:flex;align-items:center;' +
        'justify-content:center;z-index:500;',
    });
    const card = el('div', {
      style:
        'background:#FFA000;border:4px solid #5D4037;padding:24px;' +
        'text-align:center;font-family:"ZCOOL KuaiLe",sans-serif;' +
        'min-width:240px;color:white;',
    });
    card.appendChild(el('div', { style: 'font-size:48px;' }, '🎉'));
    const tens = currentQuestion.number / 10 | 0;
    const ones = currentQuestion.number % 10;
    card.appendChild(el('div', { style: 'font-size:22px;margin:8px 0;' },
      currentQuestion.number + ' = ' + tens + ' 个十 + ' + ones + ' 个一'));
    card.appendChild(el('div', { style: 'font-size:18px;' },
      '+' + result.coins_earned + ' 💰'));
    if (result.new_badges.length > 0) {
      card.appendChild(el('div', {
        style: 'margin-top:8px;font-size:16px;background:#FFD54F;color:#5D4037;padding:4px 8px;',
      }, '🏆 解锁勋章: ' + result.new_badges.join(', ')));
    }
    const btn = el('button', {
      style:
        'margin-top:16px;font-family:inherit;font-size:18px;padding:8px 20px;' +
        'background:#2E7D32;color:white;border:3px solid #1B5E20;cursor:pointer;',
      onclick: () => { overlay.remove(); done && done(); },
    }, '▶ 继续');
    card.appendChild(btn);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    listenerCleanups.push(() => overlay.remove());
  }
```

- [ ] **Step 2: 矿石敲完时触发 finalize**

在 `nextQuestion()` 末尾(`render();` 之前)注入回调:

```js
    if (currentQuestion.type === 'observe') {
      onOreFinished = finalizeObserve;
    }
```

(注意要在 `render();` **之前**赋值。)

- [ ] **Step 3: 手动验证**

```bash
./run.sh
```

反复进入分解游戏直到抽到 observe 题型(约 1/3 概率):
- 把矿石敲完 → 弹胜利浮层 "47 = 4 个十 + 7 个一" + "+1 💰"
- 听到答对音
- 点"▶ 继续" → 进下一题
- 看 topbar 金币 +1、今日 +1
- 答完 50 道(累计)应弹 🏆 解锁 decompose_50 勋章

- [ ] **Step 4: 提交**

```bash
git add frontend/games/chai-kuang/game.js
git commit -m "$(cat <<'EOF'
Wire chai-kuang observe (type A) flow end-to-end

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: 题型 B (decompose) —— 敲完填十位/个位

**Files:**
- Modify: `frontend/games/chai-kuang/game.js`

目标:敲完矿石后,题目区出现两个空槽 "它有 [_] 个十,[_] 个一" + 数字键盘。两槽都填对 → 答对反馈;错则闪一下提示重答;再错显示答案进下一题。

- [ ] **Step 1: 加状态变量**

在 `let questionStartTime = 0;` 之后追加:

```js
  let decomposeInput = { tens: '', ones: '', activeSlot: 'tens' };
  let decomposeAttempt = 0;
```

- [ ] **Step 2: 改 `renderQuestionPanel`**

把现有的 decompose 分支:

```js
    } else if (currentQuestion.type === 'decompose') {
      panel.appendChild(el('div', null,
        '🔨 把矿石敲完,然后填出它有几个十、几个一'));
    }
```

替换为:

```js
    } else if (currentQuestion.type === 'decompose') {
      if (oreRemaining > 0) {
        panel.appendChild(el('div', null,
          '🔨 把矿石敲完,然后填出它有几个十、几个一'));
      } else {
        const row = el('div', { class: 'ck-input-row' });
        row.appendChild(el('span', null, '它有'));
        row.appendChild(slot('tens'));
        row.appendChild(el('span', null, '个十,'));
        row.appendChild(slot('ones'));
        row.appendChild(el('span', null, '个一'));
        panel.appendChild(row);
        panel.appendChild(renderKeypad('decompose'));
      }
    }
```

- [ ] **Step 3: 加输入槽 / 键盘 / 提交逻辑**

在 `renderQuestionPanel` 之后追加:

```js
  function slot(name) {
    const v = decomposeInput[name];
    return el('div', {
      class: 'ck-input-slot ' + (v === '' ? 'empty' : '')
              + (decomposeInput.activeSlot === name ? ' active' : ''),
      id: 'ck-slot-' + name,
      onclick: () => {
        decomposeInput.activeSlot = name;
        refreshSlots();
      },
    }, v === '' ? '?' : v);
  }

  function refreshSlots() {
    ['tens', 'ones'].forEach(name => {
      const e = document.getElementById('ck-slot-' + name);
      if (!e) return;
      const v = decomposeInput[name];
      e.textContent = v === '' ? '?' : v;
      e.classList.toggle('empty', v === '');
      e.classList.toggle('active', decomposeInput.activeSlot === name);
    });
  }

  function renderKeypad(mode) {
    // mode: 'decompose' (单数字) | 'compose' (两位数)
    const pad = el('div', { class: 'ck-keypad' });
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].forEach(n => {
      pad.appendChild(el('button', { onclick: () => onKey(mode, n) }, n));
    });
    pad.appendChild(el('button', { class: 'delete', onclick: () => onDel(mode) }, '⌫'));
    pad.appendChild(el('button', { class: 'submit', onclick: () => onSubmit(mode) }, '✓'));
    return pad;
  }

  function onKey(mode, n) {
    Audio.key();
    if (mode === 'decompose') {
      const slot = decomposeInput.activeSlot;
      decomposeInput[slot] = n;
      // 自动跳到下一格
      if (slot === 'tens') decomposeInput.activeSlot = 'ones';
      refreshSlots();
    } else if (mode === 'compose') {
      if (composeInput.length >= 2) return;
      composeInput += n;
      refreshComposeDisplay();
    }
  }

  function onDel(mode) {
    Audio.key();
    if (mode === 'decompose') {
      const slot = decomposeInput.activeSlot;
      if (decomposeInput[slot] !== '') {
        decomposeInput[slot] = '';
      } else if (slot === 'ones') {
        decomposeInput.activeSlot = 'tens';
      }
      refreshSlots();
    } else if (mode === 'compose') {
      composeInput = composeInput.slice(0, -1);
      refreshComposeDisplay();
    }
  }

  async function onSubmit(mode) {
    if (mode === 'decompose') {
      if (decomposeInput.tens === '' || decomposeInput.ones === '') return;
      await submitDecomposeAttempt();
    } else if (mode === 'compose') {
      if (composeInput.length < 1) return;
      await submitComposeAttempt();
    }
  }

  async function submitDecomposeAttempt() {
    const result = await submitCurrentAnswer({
      user_tens: parseInt(decomposeInput.tens, 10),
      user_ones: parseInt(decomposeInput.ones, 10),
      user_number: null,
    });
    if (!result) return;

    if (result.correct) {
      Audio.correct();
      if (result.new_badges.length > 0) Audio.levelUp();
      showCelebration(result, () => nextQuestion());
      return;
    }

    // 答错
    Audio.wrong();
    decomposeAttempt++;
    flashHintBars();
    if (decomposeAttempt >= 2) {
      // 第二次错:显示答案,然后下一题(不计入金币;后端已记录这次的错,
      // 我们这里要再发一次"正确答案"以更新 streak/勋章数据。但这可能让
      // streak 错乱。最简单的处理:第二次错就直接进下一题,不再发请求。)
      showRevealAndNext(result);
    } else {
      // 第一次错:清空输入让孩子重答(注意:已发请求,后端已经记一次错)
      decomposeInput = { tens: '', ones: '', activeSlot: 'tens' };
      refreshSlots();
    }
  }

  function flashHintBars() {
    // 让物品栏的长条/方块短暂闪一下提示数量
    document.querySelectorAll('#ck-tens-area .bar-block, #ck-ones-area .single-cube')
      .forEach(e => {
        e.classList.add('ck-merge-glow');
        setTimeout(() => e.classList.remove('ck-merge-glow'), 220);
      });
  }

  function showRevealAndNext(result) {
    const overlay = el('div', {
      style:
        'position:fixed;left:0;top:0;right:0;bottom:0;' +
        'background:rgba(0,0,0,0.5);display:flex;align-items:center;' +
        'justify-content:center;z-index:500;',
    });
    const card = el('div', {
      style:
        'background:#FFD54F;border:4px solid #5D4037;padding:24px;' +
        'text-align:center;font-family:"ZCOOL KuaiLe",sans-serif;' +
        'min-width:240px;color:#5D4037;',
    });
    card.appendChild(el('div', { style: 'font-size:36px;' }, '👀'));
    card.appendChild(el('div', { style: 'font-size:20px;margin:8px 0;' },
      '正确答案是: ' + result.expected_tens + ' 个十,' +
      result.expected_ones + ' 个一'));
    card.appendChild(el('div', { style: 'font-size:14px;' }, '没关系,下一道继续'));
    const btn = el('button', {
      style:
        'margin-top:16px;font-family:inherit;font-size:18px;padding:8px 20px;' +
        'background:#2E7D32;color:white;border:3px solid #1B5E20;cursor:pointer;',
      onclick: () => { overlay.remove(); nextQuestion(); },
    }, '▶ 继续');
    card.appendChild(btn);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    listenerCleanups.push(() => overlay.remove());
  }
```

- [ ] **Step 4: 在 `nextQuestion` 里重置 decompose 输入态**

把 `nextQuestion()` 里:

```js
    isHammering = false;
    onOreFinished = null;
```

替换为:

```js
    isHammering = false;
    onOreFinished = null;
    decomposeInput = { tens: '', ones: '', activeSlot: 'tens' };
    decomposeAttempt = 0;
    composeInput = '';
```

并在题型 observe 设置 `onOreFinished` 之后追加:

```js
    if (currentQuestion.type === 'decompose') {
      onOreFinished = () => render();   // 敲完后重渲染,显示输入区
    }
```

- [ ] **Step 5: 加 compose 状态占位变量**

在 `let decomposeAttempt = 0;` 之后追加:

```js
  let composeInput = '';
  function refreshComposeDisplay() {
    const e = document.getElementById('ck-compose-display');
    if (e) e.textContent = composeInput === '' ? '?' : composeInput;
  }
  async function submitComposeAttempt() {}  // Task 13 实现
```

- [ ] **Step 6: 手动验证**

```bash
./run.sh
```

反复进游戏直到抽到 decompose 题:
- 敲完矿石后,题目区出现两个空槽 + 数字键盘
- 第一次自动光标在"十位"槽,按一个数字 → 自动跳到"个位"槽
- 也能点槽切换
- 答对 → 胜利浮层、+1 金币、下一题
- 故意答错 → 物品栏闪一下,槽清空,可重答
- 第二次再错 → 显示正确答案 + "继续",不卡死
- 连续答对 5 道(decompose)应解锁 decompose_streak_5

- [ ] **Step 7: 提交**

```bash
git add frontend/games/chai-kuang/game.js
git commit -m "$(cat <<'EOF'
Wire chai-kuang decompose (type B) with two-slot input + retry

Tens/ones slots auto-advance, wrong answer flashes the bins as a hint
and lets the child retry once; second wrong reveals the answer and
moves on without further penalty.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: 题型 C (compose) —— 看图填整数

**Files:**
- Modify: `frontend/games/chai-kuang/game.js`

目标:不出矿石,直接在物品栏渲染 N 长条 + M 方块,孩子填两位数。答错时演示一次"长条+方块=数字"合成动画再进下一题。

- [ ] **Step 1: 重写 `renderComposeScreen`**

替换:

```js
  function renderComposeScreen() {
    const screen = el('div', { class: 'ck-screen' });
    screen.appendChild(el('button', {
      class: 'ck-exit', onclick: () => Platform.exit(),
    }, '🏠 我玩够了'));
    screen.appendChild(el('div', { class: 'ck-question' },
      'compose 题(待 Task 12 实装)'));
    return screen;
  }
```

为:

```js
  function renderComposeScreen() {
    const screen = el('div', { class: 'ck-screen' });
    screen.appendChild(el('button', {
      class: 'ck-exit', onclick: () => Platform.exit(),
    }, '🏠 我玩够了'));

    // 直接展示已分解好的物品栏(无矿石)
    const tens = currentQuestion.number / 10 | 0;
    const ones = currentQuestion.number % 10;

    const inv = el('div', { class: 'ck-inventory', style: 'margin-top:24px;' });
    const tensBin = el('div', { class: 'ck-bin' });
    tensBin.appendChild(el('div', { class: 'ck-bin-label', html:
      '十位<span class="sub">(长条)</span>' }));
    const tensArea = el('div', { class: 'ck-bin-area', id: 'ck-tens-area' });
    for (let i = 0; i < tens; i++) tensArea.appendChild(R.renderBar('', 10));
    tensBin.appendChild(tensArea);

    const onesBin = el('div', { class: 'ck-bin' });
    onesBin.appendChild(el('div', { class: 'ck-bin-label', html:
      '个位<span class="sub">(方块)</span>' }));
    const onesArea = el('div', { class: 'ck-bin-area', id: 'ck-ones-area' });
    for (let i = 0; i < ones; i++) onesArea.appendChild(makeOneBlock());
    onesBin.appendChild(onesArea);

    inv.appendChild(tensBin);
    inv.appendChild(onesBin);
    screen.appendChild(inv);

    // 题目区
    const panel = el('div', { class: 'ck-question' });
    panel.appendChild(el('div', null, '看!这是数字几?'));
    const row = el('div', { class: 'ck-input-row' });
    row.appendChild(el('div', {
      class: 'ck-input-slot active',
      id: 'ck-compose-display',
    }, composeInput === '' ? '?' : composeInput));
    row.appendChild(el('span', null, ''));
    panel.appendChild(row);
    panel.appendChild(renderKeypad('compose'));
    screen.appendChild(panel);

    return screen;
  }
```

- [ ] **Step 2: 实装 `submitComposeAttempt`**

替换占位:

```js
  async function submitComposeAttempt() {}
```

为:

```js
  async function submitComposeAttempt() {
    const result = await submitCurrentAnswer({
      user_tens: null, user_ones: null,
      user_number: parseInt(composeInput, 10),
    });
    if (!result) return;

    if (result.correct) {
      Audio.correct();
      if (result.new_badges.length > 0) Audio.levelUp();
      showCelebration(result, () => nextQuestion());
    } else {
      Audio.wrong();
      // 演示一次"长条+方块=数字"
      composeRevealAnimation(result, () => nextQuestion());
    }
  }

  function composeRevealAnimation(result, done) {
    const overlay = el('div', {
      style:
        'position:fixed;left:0;top:0;right:0;bottom:0;' +
        'background:rgba(0,0,0,0.7);display:flex;flex-direction:column;' +
        'align-items:center;justify-content:center;z-index:500;color:white;',
    });
    overlay.appendChild(el('div', {
      style: 'font-family:"ZCOOL KuaiLe",sans-serif;font-size:24px;margin-bottom:12px;',
    }, '看一下:'));

    const tens = result.expected_tens;
    const ones = result.expected_ones;
    const row = el('div', {
      style: 'display:flex;align-items:center;gap:12px;background:white;padding:16px;color:#5D4037;',
    });
    const tensWrap = el('div');
    for (let i = 0; i < tens; i++) tensWrap.appendChild(R.renderBar('', 10));
    row.appendChild(tensWrap);
    row.appendChild(el('span', { style: 'font-size:28px;font-weight:bold;' }, '+'));
    row.appendChild(R.renderSingles('', ones));
    row.appendChild(el('span', { style: 'font-size:28px;font-weight:bold;' }, '='));
    row.appendChild(el('span', {
      style: 'font-family:"Press Start 2P",monospace;font-size:36px;color:#2E7D32;',
    }, String(currentQuestion.number)));
    overlay.appendChild(row);

    const btn = el('button', {
      style:
        'margin-top:20px;font-family:"ZCOOL KuaiLe",sans-serif;font-size:18px;' +
        'padding:8px 20px;background:#2E7D32;color:white;border:3px solid #1B5E20;cursor:pointer;',
      onclick: () => { overlay.remove(); done && done(); },
    }, '▶ 我懂了');
    overlay.appendChild(btn);

    document.body.appendChild(overlay);
    listenerCleanups.push(() => overlay.remove());
  }
```

- [ ] **Step 3: 手动验证**

```bash
./run.sh
```

进游戏直到抽到 compose 题:
- 没有矿石,直接展示 N 长条 + M 方块
- 题目"看!这是数字几?" + 单格输入 + 数字键盘
- 输入两位数,点 ✓
- 答对 → 胜利浮层、+1 金币、下一题
- 故意答错 → 演示"长条 + 方块 = 数字"动画 → 点"我懂了"进下一题
- 累计答对 10 道 compose → 解锁 🏆 compose_perfect_10

- [ ] **Step 4: 提交**

```bash
git add frontend/games/chai-kuang/game.js
git commit -m "$(cat <<'EOF'
Wire chai-kuang compose (type C) with reveal animation

No ore on this type — bars and blocks are pre-rendered. Wrong answers
play a 'bars + blocks = number' demonstration before moving on.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: 教程屏 + 首次进入引导

**Files:**
- Modify: `frontend/games/chai-kuang/game.js`

目标:第一次进游戏时显示一个简短图解教程(3 步),用 localStorage 标记已看过。也能从主入口手动调起。

- [ ] **Step 1: 加教程屏渲染**

在 `renderStrikeScreen` 之前加:

```js
  const TUTORIAL_KEY = 'chai-kuang-tutorial-seen';

  function renderTutorialScreen() {
    const screen = el('div', { class: 'ck-screen' });
    screen.appendChild(el('div', {
      style: 'font-family:"Press Start 2P",monospace;font-size:20px;color:white;' +
             'text-shadow:2px 2px 0 #5D4037;text-align:center;margin:12px 0;',
    }, '怎么玩'));

    const wrap = el('div', { style: 'background:rgba(255,255,255,0.9);padding:16px;border:3px solid #5D4037;font-family:"ZCOOL KuaiLe",sans-serif;color:#5D4037;' });

    const s1 = el('div', { style: 'margin:8px 0;font-size:16px;' });
    s1.appendChild(el('div', null, '1️⃣ 矿石中央写着数字。点它,锤子就来啦!'));
    wrap.appendChild(s1);

    const s2 = el('div', { style: 'margin:12px 0;font-size:16px;' });
    s2.appendChild(el('div', null, '2️⃣ 小方块凑齐 10 个,会自动合成 1 根长条!'));
    const demo = el('div', { style: 'display:flex;align-items:center;gap:8px;margin-top:6px;' });
    demo.appendChild(R.renderSingles('', 10));
    demo.appendChild(el('span', { style: 'font-size:24px;' }, '→'));
    demo.appendChild(R.renderBar('', 10));
    s2.appendChild(demo);
    wrap.appendChild(s2);

    const s3 = el('div', { style: 'margin:12px 0;font-size:16px;' });
    s3.appendChild(el('div', null,
      '3️⃣ 长条 = 1 个十,方块 = 1 个一。例如 3 长条 + 5 方块 = 35'));
    wrap.appendChild(s3);

    screen.appendChild(wrap);

    screen.appendChild(el('button', {
      style:
        'margin-top:16px;font-family:"ZCOOL KuaiLe",sans-serif;font-size:18px;' +
        'padding:10px 24px;background:#2E7D32;color:white;border:3px solid #1B5E20;cursor:pointer;align-self:center;',
      onclick: () => {
        try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch (e) {}
        nextQuestion();
      },
    }, '▶ 开始挖矿'));

    return screen;
  }
```

- [ ] **Step 2: 在 `start()` 里判断是否走教程**

把 `start(host)` 里 `nextQuestion();` 改为:

```js
      let seen = false;
      try { seen = localStorage.getItem(TUTORIAL_KEY) === '1'; } catch (e) {}
      if (seen) {
        nextQuestion();
      } else {
        currentQuestion = null;
        const app = getHost();
        app.innerHTML = '';
        app.appendChild(renderTutorialScreen());
      }
```

- [ ] **Step 3: 手动验证**

```bash
./run.sh
# 在 DevTools console: localStorage.removeItem('chai-kuang-tutorial-seen')
```

进入分解游戏第一次:
- 看到教程屏(3 步图解 + "▶ 开始挖矿")
- 点开始 → 进入第一道题
- 退出再进 → 直接进题(不再显示教程)
- console 清掉 localStorage 再进 → 又出现教程

- [ ] **Step 4: 提交**

```bash
git add frontend/games/chai-kuang/game.js
git commit -m "$(cat <<'EOF'
Add chai-kuang first-time tutorial

Shows 3-step guide on first entry; localStorage flag avoids repeats.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: 抛光与边界场景手测

**Files:**
- 视情况 Modify: `frontend/games/chai-kuang/game.js`、`frontend/games/chai-kuang/chai-kuang.css`

- [ ] **Step 1: 跑全套后端测试**

```bash
uv run pytest -v
```

Expected:全部 PASS

- [ ] **Step 2: 边界数字手测**

```bash
./run.sh
```

DevTools console 把 `oreRemaining` 改成下面值各试一遍(顺序:在 observe / decompose 题里,把 console 里 `oreRemaining = N; render();` 之前先把 `currentQuestion.number = N` 同步设上):

| number | 期待结果 |
|--------|----------|
| 10     | 1 长条 + 0 方块 |
| 11     | 1 长条 + 1 方块 |
| 19     | 1 长条 + 9 方块 |
| 20     | 2 长条 + 0 方块 |
| 99     | 9 长条 + 9 方块 |

每个数字都能正常敲完、正确显示。

- [ ] **Step 3: 网络断开手测**

```bash
./run.sh
# 进入分解游戏后,在 DevTools 把 Network 切到 Offline
```

- 答完一题点 ✓ → 应弹"存档没成功,再试一次?" toast
- 把 Network 切回 Online,再点 ✓ → 正常进下一题

- [ ] **Step 4: 平台切换手测**

- 进 chai-kuang → 退出 → 进 cou-shi:cou-shi 状态正常,不串数据
- 进 cou-shi 答两题 → 退出 → 进 chai-kuang:topbar 金币延续显示正确数

- [ ] **Step 5: 快速连点手测**

- 在矿石上快速点 10 次,锤子应只挥舞一次后才接受下一次点击,不会出现锤子叠加 / 矿石数字突然减很多

- [ ] **Step 6: 移动端手测**(如果手头有平板)

- 在平板浏览器打开
- 矿石点击响应正常
- 物品栏布局没溢出
- 数字键盘按钮够大,容易按

发现问题就回到对应 Task 的代码修。修完一处提交一次。例如:

```bash
git add frontend/games/chai-kuang/chai-kuang.css
git commit -m "$(cat <<'EOF'
Polish chai-kuang: fix <fixed-issue>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: 跑一次完整 e2e 流程**

进入游戏 → 看教程 → 玩 15 道(混合三种题型) → 退出 → 看 dashboard 进度有没有跑通(`/dashboard` 页面读 `/api/stats`,目前 cou-shi 的 stats 不会包含 decompose_answers,如发现 dashboard 数字没动是预期的——decompose 数据暂时不上家长仪表盘,这是 spec 里 YAGNI 的部分)。

如果一切顺,任务完成。最后一次确认用:

```bash
git log --oneline -25
```

看到从 Task 1 到 Task 15 的提交,且无未提交改动:

```bash
git status
```

Expected:`nothing to commit, working tree clean`

---

## Self-Review

### Spec coverage check

- [x] 三种题型(observe / decompose / compose) → Task 10/11/12/13
- [x] 矿石外观 = N 个小方块堆 + 数字 → Task 8 `renderOre`
- [x] 锤子从右上飞下 → Task 8 CSS + Task 9 `strikeOre`
- [x] 每锤敲 3~5 个,剩余 ≤7 一锤完成 → Task 9 `strikeOre`
- [x] 个位 ≥10 自动合成,前 10 个金光闪 → 飞向十位 → "嗡" → Task 9 `checkAutoMerge`
- [x] 物品栏左十位右个位 + 标签 → Task 8 `renderInventory`
- [x] 数字范围 10–99 全随机 → Task 10 `generateQuestion`
- [x] 三种题型反馈不同(observe 直给金币,decompose 错了闪提示重答,compose 错了演示)→ Task 11/12/13
- [x] 共享金币 + daily_log → Task 2 `log_decompose_answer`、Task 4 `submit_decompose_answer`
- [x] 三个新勋章 + 现有勋章共存 → Task 1 `BADGE_KEYS`、Task 4 `check_decompose_badges`
- [x] 后端新表 `decompose_answers` → Task 1
- [x] `POST /api/decompose/answer` → Task 4
- [x] 前端目录 `frontend/games/chai-kuang/` 独立 → Task 7
- [x] 注册 manifest + index.html 引用 → Task 7
- [x] 复用 `el` / `renderBar` / `renderSingles` → Task 8/12/13
- [x] 加 2 种新音效(hammer / merge) → Task 6
- [x] `Api.submitDecomposeAnswer` → Task 5
- [x] 错误处理(网络失败 toast、连点锁、退出清理) → Task 9 `isHammering`、Task 10 `showToast`、Task 7 `exit()` 已沿用
- [x] 退出按钮 → Task 7/8 `ck-exit`
- [x] 教程屏(localStorage 标记) → Task 14
- [x] 边界数字 10–19 测试 → Task 15

### 一致性 / 命名审查

- 后端函数名:`log_decompose_answer`、`get_decompose_total_count`、`get_decompose_streak`、`get_compose_correct_count`、`check_decompose_badges`、`submit_decompose_answer`(贯穿 Task 1-4 一致)
- 模型名:`DecomposeAnswerSubmit`、`DecomposeAnswerResult`(Task 3-4 一致)
- 前端模块:`window.ChaiKuang = { start, exit }`(Task 7 起一致)
- 题型字符串:`'observe' / 'decompose' / 'compose'`(后端 pattern + 前端常量 Task 10 一致)
- DOM ID:`ck-ore`、`ck-ore-label`、`ck-hammer`、`ck-tens-area`、`ck-ones-area`、`ck-question`、`ck-slot-tens`、`ck-slot-ones`、`ck-compose-display`(贯穿一致)
- CSS 类前缀:`ck-`(全部专属类一致)

### 潜在风险点(已在计划内说明)

1. **decompose 第二次答错的数据语义**:Task 12 step 3 注释里说明 —— 第一次错时已发请求(后端记 1 次错,streak 已断);第二次错只显示答案不再发请求,避免重复入库。这导致第二次错不计入 today_done —— 接受,因为孩子已经看到正确答案,不该重复扣"今日进度"。
2. **compose 错答只发一次请求**:类似策略,Task 13 答错直接演示后进下一题,不重发。
3. **observe 题型对统计 streak 的影响**:`get_decompose_streak` 只看 `question_type='decompose'` 的尾部连击,observe / compose 不打断也不计入 —— Task 2 测试已覆盖。
