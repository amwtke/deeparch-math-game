"""SQLite 数据访问层。

所有数据库操作集中在这里。其他模块通过 import 函数使用,不直接接触 sqlite3。
单玩家场景,player id 固定为 1。
"""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).parent.parent / "data" / "game.db"

# 所有可能的勋章 key,跟前端 BADGE_DEFS 保持同步
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


@contextmanager
def get_conn():
    """每次操作开一个连接,用完关掉。SQLite 在小负载下完全够用。"""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    """初始化 schema。幂等,可以重复调用。"""
    with get_conn() as conn:
        c = conn.cursor()
        c.executescript("""
        CREATE TABLE IF NOT EXISTS player_state (
            id INTEGER PRIMARY KEY,
            total_coins INTEGER DEFAULT 0,
            total_correct INTEGER DEFAULT 0,
            total_answered INTEGER DEFAULT 0,
            best_combo INTEGER DEFAULT 0,
            badges TEXT DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            a INTEGER NOT NULL,
            b INTEGER NOT NULL,
            user_answer INTEGER,
            correct INTEGER NOT NULL,
            elapsed_ms INTEGER,
            used_hint INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS daily_log (
            date TEXT PRIMARY KEY,
            questions_done INTEGER DEFAULT 0,
            correct_count INTEGER DEFAULT 0
        );

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

        CREATE INDEX IF NOT EXISTS idx_answers_created ON answers(created_at);
        CREATE INDEX IF NOT EXISTS idx_answers_correct ON answers(correct);
        """)

        # 确保有玩家记录
        c.execute("INSERT OR IGNORE INTO player_state (id) VALUES (1)")


def today_str() -> str:
    return datetime.now().strftime("%Y-%m-%d")


# ============== 玩家状态 ==============

def get_player_state() -> dict[str, Any]:
    """返回玩家当前状态,包含今日进度。"""
    with get_conn() as conn:
        c = conn.cursor()
        row = c.execute("SELECT * FROM player_state WHERE id = 1").fetchone()
        if row is None:
            # 兜底:正常 init_db 后不会发生
            c.execute("INSERT INTO player_state (id) VALUES (1)")
            row = c.execute("SELECT * FROM player_state WHERE id = 1").fetchone()

        # 今日进度
        today = today_str()
        daily = c.execute(
            "SELECT questions_done, correct_count FROM daily_log WHERE date = ?",
            (today,),
        ).fetchone()
        today_done = daily["questions_done"] if daily else 0
        today_correct = daily["correct_count"] if daily else 0

        # 玩了多少天
        days_played = c.execute("SELECT COUNT(*) FROM daily_log").fetchone()[0]

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
        }


def update_player_state(
    *,
    coins_delta: int = 0,
    correct_delta: int = 0,
    answered_delta: int = 1,
    new_best_combo: int | None = None,
    badges_update: dict[str, bool] | None = None,
) -> None:
    """增量更新玩家状态。"""
    with get_conn() as conn:
        c = conn.cursor()
        if badges_update:
            row = c.execute("SELECT badges FROM player_state WHERE id = 1").fetchone()
            badges = json.loads(row["badges"] or "{}")
            badges.update(badges_update)
            badges_json = json.dumps(badges)
        else:
            badges_json = None

        if new_best_combo is not None:
            c.execute(
                """UPDATE player_state SET
                   total_coins = total_coins + ?,
                   total_correct = total_correct + ?,
                   total_answered = total_answered + ?,
                   best_combo = MAX(best_combo, ?)
                   WHERE id = 1""",
                (coins_delta, correct_delta, answered_delta, new_best_combo),
            )
        else:
            c.execute(
                """UPDATE player_state SET
                   total_coins = total_coins + ?,
                   total_correct = total_correct + ?,
                   total_answered = total_answered + ?
                   WHERE id = 1""",
                (coins_delta, correct_delta, answered_delta),
            )

        if badges_json is not None:
            c.execute("UPDATE player_state SET badges = ? WHERE id = 1", (badges_json,))


# ============== 答题记录 ==============

def log_answer(
    a: int,
    b: int,
    user_answer: int,
    correct: bool,
    elapsed_ms: int,
    used_hint: bool,
) -> None:
    """记录一次答题,同时更新 daily_log。"""
    today = today_str()
    with get_conn() as conn:
        c = conn.cursor()
        c.execute(
            """INSERT INTO answers (a, b, user_answer, correct, elapsed_ms, used_hint)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (a, b, user_answer, int(correct), elapsed_ms, int(used_hint)),
        )
        # upsert daily_log
        c.execute(
            """INSERT INTO daily_log (date, questions_done, correct_count)
               VALUES (?, 1, ?)
               ON CONFLICT(date) DO UPDATE SET
                 questions_done = questions_done + 1,
                 correct_count = correct_count + ?""",
            (today, int(correct), int(correct)),
        )


# ============== 家长仪表盘统计 ==============

def get_stats(days: int = 30) -> dict[str, Any]:
    """给家长仪表盘用的聚合统计。"""
    with get_conn() as conn:
        c = conn.cursor()

        # 最近 N 天每天的答题数 + 正确数
        daily = c.execute(
            """SELECT date, questions_done, correct_count
               FROM daily_log
               ORDER BY date DESC
               LIMIT ?""",
            (days,),
        ).fetchall()
        daily_list = [
            {
                "date": r["date"],
                "done": r["questions_done"],
                "correct": r["correct_count"],
                "accuracy": round(r["correct_count"] / r["questions_done"] * 100)
                if r["questions_done"] > 0 else 0,
            }
            for r in daily
        ]
        daily_list.reverse()  # 时间正序方便画图

        # 错题 top 10 (按错误次数)
        wrong_top = c.execute(
            """SELECT a, b, (a + b) as answer, COUNT(*) as wrong_count
               FROM answers
               WHERE correct = 0
               GROUP BY a, b
               ORDER BY wrong_count DESC
               LIMIT 10"""
        ).fetchall()
        wrong_list = [dict(r) for r in wrong_top]

        # 总体统计
        total = c.execute(
            """SELECT
                 COUNT(*) as total,
                 SUM(correct) as correct,
                 AVG(elapsed_ms) as avg_ms,
                 SUM(used_hint) as hints_used
               FROM answers"""
        ).fetchone()

        return {
            "daily": daily_list,
            "wrong_top": wrong_list,
            "total_questions": total["total"] or 0,
            "total_correct": total["correct"] or 0,
            "avg_seconds": round((total["avg_ms"] or 0) / 1000, 1),
            "hints_used": total["hints_used"] or 0,
            "overall_accuracy": round((total["correct"] or 0) / total["total"] * 100)
            if total["total"] else 0,
        }


def reset_all() -> None:
    """清空所有数据 (开发/调试用)。生产环境别暴露这个端点。"""
    with get_conn() as conn:
        c = conn.cursor()
        c.execute("DELETE FROM answers")
        c.execute("DELETE FROM decompose_answers")
        c.execute("DELETE FROM daily_log")
        c.execute("UPDATE player_state SET total_coins=0, total_correct=0, "
                  "total_answered=0, best_combo=0, badges='{}' WHERE id=1")


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
