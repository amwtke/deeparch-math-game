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
from typing import Any, Literal

from .cosmetics import SLOTS

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

        _ensure_player_state_columns(conn)


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

        equipped_raw = json.loads(row["equipped_cosmetics"] or "{}")
        # 归一化:确保所有槽位都存在
        equipped = {slot: equipped_raw.get(slot) for slot in SLOTS}

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


def update_player_state(
    *,
    coins_delta: int = 0,
    correct_delta: int = 0,
    answered_delta: int = 0,
    new_best_combo: int | None = None,
    badges_update: dict[str, bool] | None = None,
) -> None:
    """增量更新玩家状态。所有 delta 默认 0,调用方必须显式传想增加的字段。

    历史上 answered_delta 默认 1 是个隐患:某次"只为写勋章"的更新如果忘了
    显式传 answered_delta=0,会被静默多记一次答题。改默认 0 之后,所有
    delta 一致,需要 +1 时调用方写明。
    """
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


BuyErrorReason = Literal["insufficient_coins", "already_owned"]


class BuyCosmeticError(Exception):
    """购买装扮失败。reason 是 wire 接口的稳定契约,不是 db 内部。"""
    def __init__(self, reason: BuyErrorReason):
        super().__init__(reason)
        self.reason: BuyErrorReason = reason


def buy_cosmetic(cosmetic_id: str, slot: str, price: int) -> dict[str, Any]:
    """原子购买装扮。抛 BuyCosmeticError 表示业务失败。

    成功:扣金币、加入 owned、装备到对应 slot,返回新 player_state。
    """
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    # 这里用裸 sqlite3 而不是 get_conn(),因为我们需要显式 BEGIN IMMEDIATE
    # 以保证 SELECT-then-UPDATE 的原子性(防双击重复购买)。
    # get_conn() 在退出时自动 commit,与显式事务管理冲突。
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
