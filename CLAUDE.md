# Claude Code 项目说明

这是一个给 7 岁孩子用的进位加法练习游戏。看 `README.md` 了解如何运行。

## 设计目标 (重要,改代码前先看)

- **目标用户**: 7 岁孩子,中国小学一年级,认字不多
- **核心教学**: 通过《我的世界》方块视觉化,让孩子理解"10 个一 = 1 个十",为竖式进位打基础
- **不能做**: 别加复杂菜单、别用难字、别有失败惩罚 (例如扣分会打击孩子积极性)
- **必须做**: 大按钮、饱和色、即时正反馈、音效、动画

## 架构总览

```
浏览器 (平板/手机)              服务器 (家用电脑)
┌─────────────────┐            ┌──────────────────┐
│ index.html      │  HTTP      │ FastAPI          │
│  └ js/game.js   │ ◄────────► │  ├ 静态文件服务  │
│  └ js/api.js    │            │  ├ /api/* 端点   │
└─────────────────┘            │  └ SQLite (data/)│
                               └──────────────────┘
```

**前端是单页应用 (SPA),没有路由**。所有"屏幕切换"都是 `game.js` 内部的 `render()` 函数在切换 DOM,不是真的换 URL。

## 后端 (`backend/`)

技术栈: **Python 3.11+, FastAPI, SQLite (标准库 sqlite3), uv**

- `main.py` —— FastAPI 应用入口,挂载静态文件和路由
- `db.py` —— SQLite 连接管理 + schema + CRUD 函数。**所有数据库操作都在这里**,其他文件不直接 import sqlite3
- `models.py` —— Pydantic 模型 (请求/响应)
- `api.py` —— REST 端点定义,从 `db.py` 调函数

### 数据库 schema

```sql
-- 玩家状态 (单玩家,id 固定为 1)
CREATE TABLE player_state (
    id INTEGER PRIMARY KEY,
    total_coins INTEGER DEFAULT 0,
    total_correct INTEGER DEFAULT 0,
    total_answered INTEGER DEFAULT 0,
    best_combo INTEGER DEFAULT 0,
    badges TEXT DEFAULT '{}'  -- JSON: {"first_correct": true, ...}
);

-- 每道题的答题记录 (做错题分析、进度曲线用)
CREATE TABLE answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    a INTEGER NOT NULL,           -- 加数1
    b INTEGER NOT NULL,           -- 加数2
    user_answer INTEGER,          -- 用户填的答案
    correct INTEGER NOT NULL,     -- 0/1
    elapsed_ms INTEGER,           -- 答题耗时
    used_hint INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 每日打卡 (用 created_at 的 date 部分聚合也行,但单独存查询更快)
CREATE TABLE daily_log (
    date TEXT PRIMARY KEY,        -- yyyy-mm-dd
    questions_done INTEGER DEFAULT 0,
    correct_count INTEGER DEFAULT 0
);
```

### API 端点

- `GET  /api/state` —— 拿当前玩家状态 (金币、勋章、今日进度)
- `POST /api/answer` —— 提交一道题的答案,后端判对错 + 更新所有相关表 + 返回 `{correct, coins_earned, new_badges, today_progress}`
- `GET  /api/stats` —— 给家长仪表盘用,返回最近 30 天的答题汇总、错题 top 10、正确率曲线

**注意**: 答案判定在后端做,前端只发 `{a, b, user_answer, elapsed_ms, used_hint}`。这样以后改算法 (例如允许多种正确写法) 只改一处。

## 前端 (`frontend/`)

技术栈: **原生 HTML/CSS/JS,无框架**。理由: 项目小、孩子设备性能可能不高、避免构建步骤。

- `index.html` —— 游戏主页,只有最小骨架,内容由 `game.js` 渲染
- `dashboard.html` —— 家长仪表盘,用 Chart.js (CDN 加载) 画进度曲线
- `css/pixel.css` —— 像素风样式
- `js/game.js` —— **主控制器**,管理屏幕切换 (menu/tutorial/game/badges/victory) 和题目流程
- `js/api.js` —— `fetch` 封装,所有后端调用走这里
- `js/audio.js` —— Web Audio 现场合成 8-bit 音效 (无音频文件,体积小)
- `js/render.js` —— DOM 创建辅助函数 (`el()`, `renderBar()`, `renderSingles()` 等)
- `js/dashboard.js` —— 仪表盘逻辑

### 屏幕状态机

```
   menu ──┬─► tutorial ──┐
          │              │
          ├─► game ◄─────┘
          │    │
          │    └─► victory ──► menu
          │
          └─► badges ──► menu
```

`game.js` 里有个 `render(screenName)` 函数,所有切换走它。

## 开发规则

1. **改后端 schema 必须给迁移路径**。`db.py` 的 `init_db()` 用 `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` 加新字段。别让用户丢数据。
2. **前端不存业务数据**。所有金币/勋章/进度都从后端 `/api/state` 拿。前端 localStorage 只存 UI 偏好 (例如音量)。
3. **音效要可关**。有些孩子在课堂或公共场合玩,默认开,但要留个静音按钮。
4. **题目生成在前端做没关系**,但提交答案时 `correct` 由后端判定。
5. **不要引入构建工具** (webpack/vite/npm)。前端就是浏览器直接能跑的原生代码。
6. **CSS 类名用 kebab-case**, JS 变量用 camelCase, Python 用 snake_case。
7. **写新功能前**: 先看 `frontend/js/game.js` 里有没有可复用的渲染函数。`render.js` 是公共工具箱。

## 常见任务

### 加新题型 (例如退位减法)
1. `frontend/js/game.js` 的 `generateQuestion()` 加分支,接受难度参数
2. `backend/api.py` 的 `/api/answer` 不需要改,后端只看 `a, b, user_answer` 算总和判对错——但如果是减法要加 `op` 字段
3. 主菜单加难度选择按钮

### 加新勋章
1. `backend/db.py` 的 `BADGE_KEYS` 加新 key
2. `backend/api.py` 的 `check_badges()` 加判定逻辑
3. `frontend/js/game.js` 的 `BADGE_DEFS` 加图标和名字

### 调试
- 后端日志: uvicorn 直接打到 stdout
- 前端: Chrome DevTools, 手机连 USB 用远程调试
- 数据库: `sqlite3 data/game.db`,然后 `.tables` `.schema`

## 已知限制

- 单玩家 (player id 固定为 1)。多孩子需要加用户系统。
- 没有认证,假设家庭局域网内可信。**不要部署到公网**。
- 没做服务器端时区,`datetime('now', 'localtime')` 用服务器本地时间。
