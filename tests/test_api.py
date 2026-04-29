"""基础 API 测试。

运行: uv run pytest

测试会用临时数据库,不会污染你的真实数据。
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    """每个测试用临时数据库。"""
    tmpdir = tempfile.mkdtemp()
    tmp_db = Path(tmpdir) / "test.db"

    # 替换 DB_PATH
    from backend import db
    monkeypatch.setattr(db, "DB_PATH", tmp_db)

    # 重新初始化
    db.init_db()

    # 导入 app (注意:app 启动时会调 init_db,但用的是替换后的 DB_PATH)
    from backend.main import app
    return TestClient(app)


def test_initial_state(client):
    r = client.get("/api/state")
    assert r.status_code == 200
    data = r.json()
    assert data["total_coins"] == 0
    assert data["total_correct"] == 0
    assert data["badges"] == {}


def test_correct_answer_gives_coins(client):
    r = client.post("/api/answer", json={
        "a": 28, "b": 15,
        "user_answer": 43,
        "elapsed_ms": 3000,
        "used_hint": False,
        "current_combo": 0,
    })
    assert r.status_code == 200
    data = r.json()
    assert data["correct"] is True
    assert data["expected"] == 43
    assert data["coins_earned"] == 10  # combo=1, 没加成
    assert data["new_combo"] == 1
    assert "first_correct" in data["new_badges"]
    assert data["today_done"] == 1


def test_wrong_answer_resets_combo(client):
    # 先答对一道建立 combo
    client.post("/api/answer", json={
        "a": 28, "b": 15, "user_answer": 43,
        "elapsed_ms": 3000, "used_hint": False, "current_combo": 0,
    })
    # 然后答错
    r = client.post("/api/answer", json={
        "a": 17, "b": 25, "user_answer": 41,  # 错的
        "elapsed_ms": 4000, "used_hint": False, "current_combo": 1,
    })
    data = r.json()
    assert data["correct"] is False
    assert data["expected"] == 42
    assert data["coins_earned"] == 0
    assert data["new_combo"] == 0


def test_combo_bonus(client):
    # 连答3题应有 +5 加成
    for i in range(3):
        r = client.post("/api/answer", json={
            "a": 28, "b": 15, "user_answer": 43,
            "elapsed_ms": 3000, "used_hint": False, "current_combo": i,
        })
        data = r.json()
    # 第3题: combo=3, coins = 10 + 5 = 15
    assert data["coins_earned"] == 15
    assert data["new_combo"] == 3


def test_speed_demon_badge(client):
    r = client.post("/api/answer", json={
        "a": 28, "b": 15, "user_answer": 43,
        "elapsed_ms": 2000,  # 2秒,小于5秒阈值
        "used_hint": False,
        "current_combo": 0,
    })
    data = r.json()
    assert "speed_demon" in data["new_badges"]


def test_stats_endpoint(client):
    # 先做几道题
    client.post("/api/answer", json={
        "a": 28, "b": 15, "user_answer": 43,
        "elapsed_ms": 3000, "used_hint": False, "current_combo": 0,
    })
    client.post("/api/answer", json={
        "a": 17, "b": 25, "user_answer": 50,  # 错的
        "elapsed_ms": 4000, "used_hint": False, "current_combo": 1,
    })

    r = client.get("/api/stats")
    assert r.status_code == 200
    data = r.json()
    assert data["total_questions"] == 2
    assert data["total_correct"] == 1
    assert data["overall_accuracy"] == 50
    assert len(data["wrong_top"]) == 1
    assert data["wrong_top"][0]["a"] == 17


def test_static_files_have_no_cache_header(client):
    """Mobile Chrome was caching stale JS, breaking incremental fixes.
    Every static asset must say no-store so browsers always re-fetch."""
    r = client.get("/js/api.js")
    assert r.status_code == 200
    assert "no-store" in r.headers.get("cache-control", "")


def test_games_static_directory_is_mounted(client):
    """/games/<id>/* must serve from frontend/games/."""
    # We don't have games/ files yet; this test will be enabled when
    # Task 3 creates frontend/games/cou-shi/game.js. For now, check
    # the mount returns 404 (not 500).
    r = client.get("/games/nope/missing.js")
    assert r.status_code == 404
