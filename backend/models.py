"""请求/响应的 Pydantic 模型。

保持窄而清晰。前端代码也会拿这些字段名做事,改名要同步改前端。
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class AnswerSubmit(BaseModel):
    """前端提交一道题的答案。"""
    a: int = Field(..., ge=0, le=99)
    b: int = Field(..., ge=0, le=99)
    user_answer: int = Field(..., ge=0, le=999)
    elapsed_ms: int = Field(..., ge=0)
    used_hint: bool = False
    current_combo: int = Field(..., ge=0)


class AnswerResult(BaseModel):
    """后端判定结果 + 增量更新后的状态。"""
    correct: bool
    expected: int
    coins_earned: int
    new_combo: int
    new_badges: list[str]
    today_done: int
    daily_target_reached: bool


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


class DailyStat(BaseModel):
    date: str
    done: int
    correct: int
    accuracy: int


class WrongQuestion(BaseModel):
    a: int
    b: int
    answer: int
    wrong_count: int


class StatsResponse(BaseModel):
    daily: list[DailyStat]
    wrong_top: list[WrongQuestion]
    total_questions: int
    total_correct: int
    avg_seconds: float
    hints_used: int
    overall_accuracy: int


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


class EquipCosmeticRequest(BaseModel):
    slot: str = Field(..., pattern="^(head|top|hand|legs)$")
    cosmetic_id: str | None = None


class BuyCosmeticRequest(BaseModel):
    cosmetic_id: str
