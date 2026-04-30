# 矿石分解大师 (chai-kuang) 设计文档

**Date**: 2026-04-30
**Status**: Draft for review

## 背景与目标

现有平台已有一个游戏 `cou-shi`(凑十大冒险,练习进位加法)。这次要在同一平台上加第二个游戏 `chai-kuang`(矿石分解大师),教学目标是建立"两位数 = 十位数字 (长条) + 个位数字 (方块)" 的位值数感,为竖式进位加法打基础。

游戏沿用项目设计目标:7 岁孩子、像素风、无失败惩罚、强即时反馈、大按钮、饱和色、音效。

平台部分已支持多游戏架构 (`frontend/games/<id>/` 目录、`js/games-manifest.js` 注册、`window.<Module>.start/exit` 接口),所以新游戏直接挂上去即可,不动平台代码。

## 总体玩法

无尽模式,孩子点"🏠 我玩够了"按钮主动返回平台首页。每道题随机抽取以下三种题型之一:

### 题型 A — 看演示 (observe)
- 屏幕给出矿石(刻着数字,如 47),孩子敲完,矿石化作 4 长条 + 7 方块
- 大字弹出 "**47 = 4 个十 + 7 个一**"
- 没有对错,看完点"继续"获得 1 金币

### 题型 B — 敲完填答 (decompose)
- 给矿石(如 53),孩子敲完得到 5 长条 + 3 方块
- 屏幕问 "它有 ___ 个十,___ 个一",两个空都填对才算对
- 答错时长条/方块短暂闪一下作为提示,允许重答
- 再错就显示答案,不扣金币(无失败惩罚)

### 题型 C — 看图填数 (compose)
- **不出现矿石**,直接在物品栏显示 N 长条 + M 方块
- 屏幕问 "这是数字 ___",孩子填一个完整两位数
- 答错时再演示一遍 "4 长条 + 7 方块 = 47" 的合成动画,然后进下一题(教学补救)

数字范围:**10–99 全随机**(包含 10–19 这种十位为 1 的边界)。

## 核心交互:敲矿石

### 矿石本体
- 由 N 个 12×12px 的小方块"堆"出一个不规则像素堆(N = 当前剩余数字)
- 矿石中央叠一层半透明黑底 + 大白字数字(例如 "47"),醒目但不挡视线
- 矿石微微浮动 + 偶尔闪光,提示孩子点击

### 敲一下的流程(D 节奏:每锤掉一小堆,凑够 10 自动合成)
1. 孩子点矿石 → 锤子从右上角飞下,带轻微旋转动画(约 250ms)
2. "咚" 音效 + 矿石抖动 + 矿石上随机挑若干小方块"飞出"
   - 算法:`if 剩余 <= 7: 全部敲完; else: 随机 3~5 个`
   - 这样保证最后一锤干净结束,不会留下孤零零的 1~2 个让孩子还要单独点一下
3. 飞出的小方块沿弧线落进**右边"个位"区**,堆叠
4. 锤子飞回右上角
5. **检查个位区**:如果方块数 ≥ 10,挑前 10 个先**整组金光闪 200ms**,再**横向飞向左边"十位"区**,在飞行中合体为一根长条 → "嗡!" 音效。剩余的留在个位区
6. 矿石数字同步更新(显示剩余),矿石视觉上也变小

### 结束态
- 矿石被敲完(数字归零),矿石淡出
- 物品栏定格:左边 N 长条,右边 M 方块
- 根据题型走 A/B/C 的反馈流程

### 防连点
锤子动画期间忽略后续点击,用 `isHammering` flag 加锁。

## 物品栏布局

```
┌─────────────────────────────────────────────┐
│   [topbar: 金币 / 今日 / combo]              │   ← 平台 topbar (复用)
├─────────────────────────────────────────────┤
│   [🏠 我玩够了]                               │   ← 退出按钮
│            [矿石 47 + 锤子]                  │   ← 中央敲击区
│                                             │
├──────────────────┬──────────────────────────┤
│   十位 (长条)    │     个位 (方块)           │
│   ━━━━━           │     ▣ ▣ ▣ ▣ ▣            │   ← 物品栏
│   ━━━━━           │     ▣ ▣                  │
│   ━━━━━           │                          │
│   ━━━━━           │                          │
├──────────────────┴──────────────────────────┤
│           [题目区 / 输入框 / 按钮]            │   ← 题型 A/B/C 切换
└─────────────────────────────────────────────┘
```

- 左右各占一半屏幕,有粗黑像素边框分隔
- 左边大字标签 "**十位**" + 副标 "(长条)"
- 右边大字标签 "**个位**" + 副标 "(方块)"
- 个位方块凑到 10 个时,整组先金光闪 200ms,再横向飞过去合成长条 —— 这是教学高光瞬间
- 最下面是题目区,根据 A/B/C 题型显示不同内容

## 进入与退出

- 进入游戏后,顶部有 "🏠 我玩够了" 按钮 → 调用 `Platform.exit()` 返回首页
- 没有"局结束"概念(无尽模式)
- 第一次玩时走一次简短图解教程(类似 cou-shi 的 tutorial 屏),用 localStorage 标记已看过

## 反馈与奖励

### 三种题型反馈不同
- **类型 A**:观察任务,看完即"通关",直接给 1 金币 + 答对音
- **类型 B**:答错时长条/方块闪一下提示,允许重答;再错显示答案,不计错也不扣金币
- **类型 C**:答错时再演示一遍"长条 + 方块 = 数字"合成动画,然后进下一题

### 金币
- 答对一题给 1 金币(和 cou-shi 共享 `player_state.total_coins` 钱包)
- 类型 A 永远算"对",每次给 1 金币

### 新勋章(共 3 个,加到现有 8 个之外)
- 🔨 `decompose_50` —— 累计敲碎 50 个矿石
- 🎯 `decompose_streak_5` —— 连续 5 道分解题(类型 B)一次答对
- 💯 `compose_perfect_10` —— 看图填数(类型 C)累计答对 10 道

## 后端改动

### 新表 `decompose_answers`

```sql
CREATE TABLE IF NOT EXISTS decompose_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number INTEGER NOT NULL,          -- 题目里的两位数 (10~99)
    question_type TEXT NOT NULL,      -- 'observe' / 'decompose' / 'compose'
    user_tens INTEGER,                -- 类型 B 用,类型 A/C 留 NULL
    user_ones INTEGER,                -- 类型 B 用
    user_number INTEGER,              -- 类型 C 用,类型 A/B 留 NULL
    correct INTEGER NOT NULL,         -- 0/1;类型 A 永远 1
    elapsed_ms INTEGER,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
);
```

### 新 API 端点

`POST /api/decompose/answer`

请求:
```json
{
  "number": 47,
  "question_type": "decompose",
  "user_tens": 4,
  "user_ones": 7,
  "user_number": null,
  "elapsed_ms": 12340
}
```

响应:
```json
{
  "correct": true,
  "coins_earned": 1,
  "new_badges": ["decompose_streak_5"],
  "today_progress": { "done": 5, "target": 10 }
}
```

判定逻辑:
- `observe` → 后端写 `correct=1`,给 1 金币
- `decompose` → 比较 `(user_tens, user_ones)` 与 `(number // 10, number % 10)`,两个都对才算对
- `compose` → 比较 `user_number` 与 `number`

### 共享 `daily_log`
答对一道分解题也算"今日完成 1 题",写入同一张 `daily_log`,平台 topbar 的"今日 X/10"对两个游戏都成立。

### 迁移
- `db.py` 的 `init_db()` 加 `CREATE TABLE IF NOT EXISTS decompose_answers (...)`
- `BADGE_KEYS` 数组加 3 个新 key
- `player_state.badges` 是 JSON,默认 `{}`,新 key 不存在就当 false → 不需要 `ALTER TABLE`

## 前端代码组织

### 目录结构
```
frontend/games/chai-kuang/
├── chai-kuang.css      # 矿石、锤子、长条、方块、动画 keyframes
└── game.js             # 游戏主控制器,挂 window.ChaiKuang = { start, exit }
```

### `game.js` 模块结构(IIFE)
```js
(function () {
  // 状态:currentNumber, currentType, oreFragments, tensBin, onesBin, ...
  // 题目生成:generateQuestion() → {number, type}
  // 屏幕路由:render('menu' | 'tutorial' | 'game' | 'result')
  // 敲矿循环:hammerStrike() → 飞落动画 → checkAutoMerge()
  // 判答:submit(answer) → POST /api/decompose/answer
  // 暴露:window.ChaiKuang = { start(host), exit() }
})();
```

### 注册到平台
`frontend/js/games-manifest.js` 把第一个 placeholder 替换:
```js
{ id: 'chai-kuang', name: '矿石分解大师', icon: '🔨', color: 'orange', module: 'ChaiKuang', enabled: true }
```

### `index.html` 加两行
```html
<link rel="stylesheet" href="/games/chai-kuang/chai-kuang.css">
<script src="/games/chai-kuang/game.js"></script>
```

### 复用的工具
- `js/render.js` 的 `el()`、`renderProgressBar()` 等通用函数
- `js/audio.js` 的 8-bit 音效合成(加 2 个新音效:"嗡!" 凑十合成、"咚" 锤击)
- `js/api.js` 加 `Api.submitDecomposeAnswer(payload)`

### 不复用的(分解游戏专属)
- 矿石 / 锤子 / 长条 / 方块的 DOM 渲染
- 题型生成与切换

## 错误处理与边界情况

- **网络失败**:`Api.submitDecomposeAnswer` 失败时显示像素风 toast "存档没成功,再试一次?",流程暂停在结果画面
- **快速连点矿石**:`isHammering` flag 加锁,动画期间忽略点击
- **孩子中途退出**:`exit()` 清理定时器、解绑事件、清空 host DOM。当前题目不入库(没答完不算)
- **音效开关**:走 `audio.js` 现有静音机制
- **类型 A 的"对错"**:后端永远写 `correct=1` 但 `user_*` 都为 NULL —— 仪表盘统计正确率时按题型分组,避免观察题污染正确率
- **数字 10–19**:十位是 1,矿石只有 1 个长条,要测试视觉效果(长条孤零零放在十位区也要显眼)

## 测试策略

### 后端
`tests/` 加 `test_decompose_api.py`,覆盖:
- 三种题型的判对错
- 入库字段正确性(NULL 字段处理)
- 勋章触发逻辑(`decompose_50`、`decompose_streak_5`、`compose_perfect_10`)
- `daily_log` 共享

### 前端
项目惯例没有自动化测试,手动测:
- 三种题型各跑几道
- 数字 10、19、20、99 边界
- 答错 → 提示 → 重答 → 再错 → 显示答案 路径
- 网络断开时的 toast
- 退出 / 重进 / 切回 cou-shi 不串数据

## 实现顺序(分阶段提交,方便回退)

1. **后端**:加表 + API + 单元测试 → curl 测通
2. **前端骨架**:建目录 + 注册 manifest + 空白屏 + 退出按钮 → 跑通平台挂载/卸载
3. **核心交互**:矿石渲染 + 敲击 + 方块掉落 + 自动凑十合成 → 纯交互体验调爽,不接题目
4. **三种题型**:题目生成 + 判答 + 反馈 → 先 A,再 B,再 C
5. **音效 + 勋章**:补 2 种新音效 + 3 个新勋章
6. **教程屏 + 抛光**:tutorial 屏、动画时长微调、边界数字测试

## 不做的事(YAGNI)

- 关卡制 / 难度选择 —— 全 10–99 随机,够用
- 独立金币池 —— 共享 `total_coins`,概念简单
- 家长仪表盘的分解游戏专属 tab —— 后续如果要看,基于 `decompose_answers` 表再加
- 复用 `answers` 表 —— 语义不同,新表更干净
- 多玩家 —— 项目本身就是单玩家
