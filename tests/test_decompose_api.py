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
