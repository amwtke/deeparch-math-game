"""REST API 路由 + 业务逻辑。

判对错、算金币、查徽章,都在后端做。前端只负责显示和发请求。
"""
from __future__ import annotations

from fastapi import APIRouter

from . import db
from .models import (
    AnswerResult, AnswerSubmit, PlayerState, StatsResponse,
    DecomposeAnswerSubmit, DecomposeAnswerResult,
)

router = APIRouter(prefix="/api")

DAILY_TARGET = 10  # 每日任务目标题数


@router.get("/state", response_model=PlayerState)
def get_state() -> PlayerState:
    """前端启动 / 回主菜单时调用。"""
    return PlayerState(**db.get_player_state())


@router.post("/answer", response_model=AnswerResult)
def submit_answer(payload: AnswerSubmit) -> AnswerResult:
    """提交一道题的答案。后端判对错并更新所有状态。"""
    expected = payload.a + payload.b
    correct = payload.user_answer == expected

    # 1. 记录这次答题
    db.log_answer(
        a=payload.a,
        b=payload.b,
        user_answer=payload.user_answer,
        correct=correct,
        elapsed_ms=payload.elapsed_ms,
        used_hint=payload.used_hint,
    )

    if not correct:
        # 答错:连击清零,不发金币,不查徽章
        db.update_player_state(answered_delta=1)
        state = db.get_player_state()
        return AnswerResult(
            correct=False,
            expected=expected,
            coins_earned=0,
            new_combo=0,
            new_badges=[],
            today_done=state["today_done"],
            daily_target_reached=state["today_done"] >= DAILY_TARGET,
        )

    # 答对:算连击、金币、徽章
    new_combo = payload.current_combo + 1
    coins = 10
    if new_combo >= 3:
        coins += 5
    if new_combo >= 5:
        coins += 5

    # 先更新状态 (这样查徽章时数据是最新的)
    db.update_player_state(
        coins_delta=coins,
        correct_delta=1,
        answered_delta=1,
        new_best_combo=new_combo,
    )

    # 查徽章 (此时 state 已经是更新后的)
    state = db.get_player_state()
    new_badges = check_new_badges(
        state=state,
        new_combo=new_combo,
        elapsed_ms=payload.elapsed_ms,
        used_hint=payload.used_hint,
    )

    if new_badges:
        update = {key: True for key in new_badges}
        db.update_player_state(answered_delta=0, badges_update=update)
        # 重新读取以包含新解锁
        state = db.get_player_state()

    return AnswerResult(
        correct=True,
        expected=expected,
        coins_earned=coins,
        new_combo=new_combo,
        new_badges=new_badges,
        today_done=state["today_done"],
        daily_target_reached=state["today_done"] >= DAILY_TARGET,
    )


def check_new_badges(
    state: dict,
    new_combo: int,
    elapsed_ms: int,
    used_hint: bool,
) -> list[str]:
    """返回这次答题新解锁的徽章 key 列表。"""
    badges = state["badges"]
    newly = []

    def check(key: str, condition: bool):
        if condition and not badges.get(key, False):
            newly.append(key)

    check("first_correct", state["total_correct"] >= 1)
    check("combo_5", new_combo >= 5)
    check("combo_10", new_combo >= 10)
    check("daily_done", state["today_done"] >= DAILY_TARGET)
    check("diamond_master", state["total_correct"] >= 100)
    check("week_warrior", state["days_played"] >= 7)
    check("speed_demon", elapsed_ms <= 5000 and not used_hint)
    # no_hint 这个比较难单题判定,留给后续按"一关不用提示"统计

    return newly


@router.get("/stats", response_model=StatsResponse)
def get_stats(days: int = 30) -> StatsResponse:
    """家长仪表盘的聚合数据。"""
    return StatsResponse(**db.get_stats(days=days))


@router.post("/reset")
def reset() -> dict:
    """开发用:清空所有数据。"""
    db.reset_all()
    return {"ok": True, "message": "数据已清空"}


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
