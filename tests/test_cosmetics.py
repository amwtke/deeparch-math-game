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
