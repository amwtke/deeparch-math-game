"""装扮白名单。前端 catalog.js 必须保持 id/slot/price 同步。"""
from __future__ import annotations

SLOTS = ("head", "top", "hand", "legs")

COSMETICS: dict[str, dict] = {
    # head
    "bunny_ears":         {"slot": "head", "price": 50},
    "straw_hat_flower":   {"slot": "head", "price": 60},
    "butterfly_bow":      {"slot": "head", "price": 70},
    "miner_helmet":       {"slot": "head", "price": 80},
    "princess_crown":     {"slot": "head", "price": 120},
    # top
    "explorer_vest":      {"slot": "top", "price": 100},
    "pirate_coat":        {"slot": "top", "price": 180},
    "pink_princess_dress":{"slot": "top", "price": 200},
    "mage_robe":          {"slot": "top", "price": 250},
    "diamond_armor":      {"slot": "top", "price": 350},
    # hand
    "flower":             {"slot": "hand", "price": 30},
    "apple":              {"slot": "hand", "price": 30},
    "diamond_pickaxe":    {"slot": "hand", "price": 220},
    "magic_wand":         {"slot": "hand", "price": 280},
    "diamond_sword":      {"slot": "hand", "price": 300},
    # legs
    "denim_boots":        {"slot": "legs", "price": 80},
    "rainbow_socks":      {"slot": "legs", "price": 100},
    "snow_boots":         {"slot": "legs", "price": 120},
    "glass_slippers":     {"slot": "legs", "price": 200},
    "knight_legs":        {"slot": "legs", "price": 250},
}
