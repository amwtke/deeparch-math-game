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
