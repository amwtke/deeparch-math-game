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
