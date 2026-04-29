# 设计文档: 游戏平台壳子 + 熔炉融合互动

**日期**: 2026-04-29
**作者**: Claude (与 amwtke 共同 brainstorm)
**适用项目**: math-adventure(7岁孩子的进位加法练习游戏)

## 1. 目标 & 不做的事

### 要做的事

1. **平台首页**: 把 `/` 从直接进游戏改成网格式游戏目录,首屏看到所有游戏卡片(已上线 + 锁定占位)。
2. **游戏注册机制**: 一个集中清单 (`games-manifest.js`) 描述所有可用游戏。每个游戏暴露 `start(host)` / `exit()` 接口。
3. **凑十熔炉互动**: 在「凑十大冒险」游戏里,点 💡 提示按钮进入熔炉模态。孩子用拖拽或点击把小方块放入熔炉,满 10 自动融合成长条;长条还可以二级融合成「N0」大方块(可选,孩子可跳过)。
4. **手机 Chrome 缓存修复**: 后端给静态文件加 `Cache-Control: no-store, must-revalidate`,以后改前端用户刷一次就拿到新版。

### 不做的事(YAGNI)

- 多用户/账号系统 — 仍然是单玩家(player_id=1)
- 真正的多游戏后端 — `/api/state`、`/api/answer` 等保持现状,**没有 game_id 字段**。等真做第二个游戏再加
- 游戏自注册/插件 API — 集中清单足够,不引入运行期注册
- URL 路由(hash 路由或 history API) — 仍然是单 SPA,屏幕切换全在 JS 里
- 平台级金币聚合 — 当前 player_state 表的 total_coins 已经是全局的,1 个游戏的项目下不算「跨游戏聚合」,等真有第二个游戏再讨论

## 2. 用户视角

```
打开 http://192.168.110.126:8000/
  ↓
平台首页(网格): [⛏ 凑十大冒险] [🔒 敬请期待] [🔒 敬请期待]
  ↓ 点凑十大冒险卡
凑十大冒险:菜单 → 教学/直接开始 → 游戏屏(出题、键盘)
  ↓ 在游戏屏点 💡 提示
熔炉模态:
  step1 看零件 → step2 拖8绿入炉 → step3 拖2红入炉 → step4 凑成1条钻石条
  step4 显示总览,有 [🧠懂了] 和 [✨再融一次] 两个按钮
  → (可选) step5 把所有条拖入炉 → step6 融成「40」大方块
  → [🧠懂了] 关闭模态,回答题屏(用户已知道答案)
  ↓ 填答案 → ✓
继续答题 / 通关 → 🏠 回平台首页
  ↓ (在首页能看)
[👨‍👩‍👧 家长仪表盘] 链接 → /dashboard(不变)
```

## 3. 文件结构

```
backend/
  main.py                  # 改:用 NoCacheStaticFiles
  static_no_cache.py       # 新:StaticFiles 子类,响应加 no-store

frontend/
  index.html               # 改:精简成平台壳子,只有 #app + script 列表
  css/
    pixel.css              # 改:抽出 cou-shi 专属规则
    platform.css           # 新:首页网格、卡片、topbar 样式
  js/
    platform.js            # 新:首页 + 游戏挂载/卸载 + topbar 管理
    games-manifest.js      # 新:游戏注册数组
    drag.js                # 新:熔炉 widget 模块
    api.js                 # 不动
    audio.js               # 不动
    render.js              # 不动
  games/
    cou-shi/
      game.js              # 从 frontend/js/game.js 移入,改成 window.CouShi = {start, exit}
      cou-shi.css          # 新:游戏屏、键盘、积木、勋章等样式从 pixel.css 抽出来
```

**前端脚本加载顺序** (index.html 的 `<script>` 标签):

```html
<script src="/js/api.js"></script>
<script src="/js/audio.js"></script>
<script src="/js/render.js"></script>
<script src="/js/drag.js"></script>
<script src="/games/cou-shi/game.js"></script>
<script src="/js/games-manifest.js"></script>
<script src="/js/platform.js"></script>
```

`games-manifest.js` 必须在 `game.js` 之后(因为需要 `window.CouShi` 已存在),`platform.js` 最后(它读 manifest)。

## 4. 平台层(platform.js)

### 4.1 全局对象

```js
window.Platform = {
  init(): void,                        // 启动入口,index.html 末尾调
  enterGame(gameId): void,             // 切到指定游戏
  exit(): void,                        // 当前游戏退出,回首页
  refreshTopbar(): Promise<void>,      // 重拉 /api/state,重画 topbar,顺便更新 playerState
  playerState: object | null,          // 游戏可以直接读这个,拿到最新的 player 数据
};
```

### 4.2 状态

```js
let playerState = null;     // 缓存的 /api/state 结果
let currentGameId = null;   // 当前进入的游戏,null = 在首页
let hostDiv = null;         // 游戏内容挂载点(#app 内的子 div)
```

### 4.3 init() 流程

1. `playerState = await Api.getState()`
2. 渲染顶部 `#topbar` (金币/今日/连击)。topbar 永远存在,首页和游戏屏都可见
3. 渲染 `#home`(网格游戏卡 + 家长仪表盘链接)
4. 网络出错:topbar 显示「— —」,首页照常渲染,游戏卡可点

### 4.4 enterGame(gameId)

1. 从 `window.Games` 查 manifest,若 `enabled=false` 或找不到 → 不做事(可选 toast)
2. 找 `window[manifest.module]`,若不存在 → console.error,不进入
3. 隐藏首页,创建 `hostDiv`,调 `module.start(hostDiv)`
4. 设 `currentGameId = gameId`

### 4.5 exit()

1. 调 `window[manifest.module].exit()` — 让游戏清自己的 timer/listener
2. 清空 `hostDiv`
3. `await refreshTopbar()`(游戏可能改了金币)
4. 重渲染首页
5. `currentGameId = null`

### 4.6 refreshTopbar()

`playerState = await Api.getState()` → 重画 topbar DOM。游戏在 `Api.submitAnswer()` 之后调一下即可。

## 5. 游戏注册(games-manifest.js)

```js
window.Games = [
  {
    id: 'cou-shi',
    name: '凑十大冒险',
    icon: '⛏',
    color: 'green',          // CSS 类前缀,用 .game-card.green
    module: 'CouShi',         // window.CouShi = { start, exit }
    enabled: true,
  },
  {
    id: 'placeholder-1',
    name: '敬请期待',
    icon: '🔒',
    color: 'gray',
    module: null,
    enabled: false,
  },
  {
    id: 'placeholder-2',
    name: '敬请期待',
    icon: '🔒',
    color: 'gray',
    module: null,
    enabled: false,
  },
];
```

manifest 字段约定:

| 字段 | 含义 |
|---|---|
| `id` | 唯一,用于路由(虽然现在没真路由,但日志/事件可用) |
| `name` | 卡片显示名 |
| `icon` | emoji 或文字符号,卡片中央 |
| `color` | 卡片色调,对应 CSS 类(green/red/diamond/gold/gray) |
| `module` | 全局对象名,平台用 `window[module].start/.exit` 调用。`null` 表示占位 |
| `enabled` | `false` 时卡片灰显、不可点 |

## 6. 凑十大冒险改造(games/cou-shi/game.js)

### 6.1 接口

```js
window.CouShi = {
  start(host) { ... },   // host 是平台分配的 div
  exit() { ... },        // 清自己的状态
};
```

### 6.2 主要改动(对比现 game.js)

1. **不再 `getElementById('app')` 直接操作根**。所有 DOM 渲染目标改为传入的 `host`。
2. **不再画 topbar**。`renderTopbar()` 函数删除,topbar 由 platform.js 管。
3. **🏠 按钮**: 从「内部 render('menu')」改成 `window.Platform.exit()`。
4. **答题后状态同步**: `onSubmit()` 里的 `playerState = await Api.getState()` 改成 `await Platform.refreshTopbar()`。游戏需要读 player 数据(victory 屏的 best_combo / total_coins / badges 等)时,直接读 `Platform.playerState`。游戏内部不再维护 `playerState` 模块变量。
5. **start(host) 内部**:重置模块作用域变量(`currentCombo=0`、`currentSession=null` 等),然后渲染菜单到 `host`。
6. **exit()**: 当前实现不需要做啥(没有定时器/全局监听器)。留空函数,以后加了再说。

### 6.3 新增:点 💡 提示走 drag.js

```js
function showHint() {
  if (hintShown) return;
  hintShown = true;
  Drag.openFurnace({
    a: currentQuestion.a,
    b: currentQuestion.b,
    onClose: () => {
      // 不需要做任何事,hintShown 已置 true,孩子继续填答案
    },
  });
}
```

原来 `showHint()` 那一坨自己拼的文字提示 DOM **删除**,完全替换为 drag 模态。

## 7. 熔炉 widget(drag.js)

### 7.1 接口

```js
window.Drag = {
  openFurnace({ a, b, onClose }) { ... }  // 打开模态,onClose 在孩子点「懂了」时调
};
```

### 7.2 模态结构(DOM)

```
.furnace-overlay
  .furnace-modal
    .furnace-header  「凑十秘籍」
    .furnace-stage-1   ← step 1-4
      .pile.pile-a    a 的条 + a 的散块(散块 draggable)
      .pile.pile-b    b 的条 + b 的散块(散块 draggable)
      .furnace.furnace-cubes
        .furnace-counter "[0/10]"
        .furnace-content (动态填进去的 cube)
    .furnace-stage-2 (初始隐藏,step 5 显示)
      .pile.pile-tens-source  所有条(包括钻石条)draggable
      .furnace.furnace-bars
        .furnace-counter "[0/N 条]"
        .furnace-content
      (个位 3 块灰显,不可拖)
    .furnace-result   显示 4 条 + 3 块 / 40 块 + 3 块
    .furnace-buttons
      [🧠懂了]
      [✨再融一次]    (step 4 完成后显示;step 5/6 不显示)
```

### 7.3 状态机

```
opened
  ↓
stage-1-active (拖散块凑10)
  ↓ 满 10 自动融合
stage-1-fused (4 条 + 3 块,显示「懂了」+「再融一次」)
  ↓ 点「再融一次」
stage-2-active (拖条入炉)
  ↓ 满 N 条自动融合
stage-2-fused (「40」+ 3 块,显示「懂了」)
  ↓ 点「懂了」(任何 fused 状态下都能点)
closed (调 onClose,移除 overlay)
```

### 7.4 拖 + 点都支持

每个可拖元素 (`.cube`, `.bar` 在 stage-2):

- **桌面**: `draggable="true"` + `dragstart`/`dragend` + 熔炉 `dragover`/`drop`
- **移动**: `touchstart` 记录 startX/startY,`touchmove` 跟手挪动 transform,`touchend` 检测落点
- **点击**: `click` 直接调 `addToFurnace(elem)`(也是上面 dragend/touchend 的最终目标)

代码上让 `addToFurnace(elem)`、`removeFromFurnace(elem)` 是单一入口,三种交互都路由到这两个函数。

### 7.5 方块标号(全局视觉规约)

为了帮孩子建立「数字 = 多少个一」的直觉,熔炉里所有方块都带数字标记:

- **散块(.cube)**: 中央显示「1」,白色加粗小字
- **长条(.bar)**: 中央显示「10」,白色加粗中号字
- **二级融合产物(.mega-block)**: 中央显示「N0」(20/30/40/...),白色加粗大字

字体约束:用现有 `pixel.css` 的像素风字体,数字颜色 white + 1px 黑色描边,任何颜色背景上都看清。

**这个规约只用在 drag.js 模态内**。游戏屏的题目展示区(`renderNumberAsBlocks`)是否也加标号?**也加,统一观感**。改动落在 `frontend/js/render.js` 的 `renderBar` / `renderSingles`(在 cell DOM 内嵌一个数字 span)。

### 7.6 融合判定

- **stage 1**: cube 进炉时,`furnaceCubeCount++`。等于 10 时:
  1. 0.6 秒 pulse 动画
  2. 移除 10 个 cube DOM
  3. 在 a 的条区追加 1 个 `.bar.diamond`(钻石长条)
  4. 显示 stage-1 结果("4 条 + 3 块"),按钮亮
  5. `Audio.levelUp()`

- **stage 2**: bar 进炉时,`furnaceBarCount++`。等于 stage-2 启动时记录的 `totalBarCount` 时:
  1. 同样 pulse 动画
  2. 移除所有 bar DOM
  3. 显示 1 个 `.mega-block` 写着 `totalBarCount * 10`(本例 40)
  4. 个位仍显示在右边
  5. `Audio.levelUp()`

### 7.7 撤回

- cube/bar 进炉后再点 → 飞回原堆,counter 减 1
- 已融合的钻石条/40方块**不能再拆**
- 「懂了」始终显示(stage-1-active 也能点直接退出),「再融一次」只在 stage-1-fused 显示

### 7.8 锁定

- stage-1 期间:bar 不可拖
- stage-2 期间:个位散块不可拖(灰显)
- fused 状态:已融合的产物不可拖

## 8. 后端改动(很小)

### 8.1 NoCacheStaticFiles

新文件 `backend/static_no_cache.py`:

```python
from starlette.staticfiles import StaticFiles
from starlette.responses import Response

class NoCacheStaticFiles(StaticFiles):
    async def get_response(self, path, scope):
        response: Response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-store, must-revalidate"
        return response
```

`backend/main.py` 把现有 `app.mount("/", StaticFiles(...))` 换成 `NoCacheStaticFiles(...)`。

**没改 API**。`/api/state`、`/api/answer`、`/api/stats`、`/api/reset` 全保留,数据库 schema 不动。

## 9. 数据流

### 9.1 答题(平台介入后)

```
孩子按 ✓
  → CouShi.onSubmit()
  → Api.submitAnswer({a, b, user_answer, elapsed_ms, used_hint, current_combo})
  → Platform.refreshTopbar()        ← 改:之前是 game 自己拉 state 重画
  → game 显示 feedback overlay
  → 下一题 / victory 屏
```

### 9.2 熔炉互动(纯前端,不调后端)

熔炉是教学辅助,不上报使用次数。`hintShown` 仍然由前端记录,在下一次 `Api.submitAnswer()` 时通过 `used_hint` 字段告诉后端(已有逻辑)。

### 9.3 平台 ↔ 游戏

- `Platform.enterGame('cou-shi')` → `CouShi.start(host)`
- `CouShi` 在内部某个按钮上调 `Platform.exit()` → 触发 `CouShi.exit()` → 平台回首页
- 答题后 `CouShi` 调 `Platform.refreshTopbar()`

## 10. 错误处理

| 场景 | 处理 |
|---|---|
| `Api.getState()` 网络挂 | topbar 显示「— —」,首页照常,游戏卡仍可点 |
| manifest module 不存在 | `console.error('Game module CouShi not found')`,卡片点击无响应,不弹丑提示 |
| 熔炉拖错 | 没有「错」的概念,孩子怎么搞都行,允许撤回 |
| 拖中途松手到非熔炉区域 | DOM 弹回原位置 |
| `Drag.openFurnace` 在已开模态时再次调 | 第二次直接忽略,以保护状态 |

## 11. 测试

### 11.1 后端

现有 6 个 pytest 用例(`/api/state`、`/api/answer` 行为)足够。**不加新测试**。理由:本次后端只加 `NoCacheStaticFiles`,逻辑层无变化。

### 11.2 前端人工测试清单

平台壳子:

- [ ] 打开 `/` 看到 3 个游戏卡(凑十 + 2 个 🔒 占位)
- [ ] topbar 显示金币/今日/连击,初始 0/0/🔥0
- [ ] 点 🔒 卡:无任何反应或视觉提示(不可崩)
- [ ] 点凑十卡:进入凑十主菜单
- [ ] 凑十内点 🏠:回平台首页,topbar 数据保留

凑十改造后回归:

- [ ] 主菜单 / 怎么玩 / 勋章墙 / 通关画面 全部正常
- [ ] 答对一题:金币 +1,topbar 立即更新
- [ ] 通关一局:victory 屏正常,可继续下一局或回主菜单

熔炉:

- [ ] 题目展示区里:每个 cube 中央显「1」,每个 bar 中央显「10」
- [ ] 任意题点 💡:打开模态,显示对应 a/b 的零件,所有 cube 标「1」、bar 标「10」
- [ ] 二级融合产生的 mega-block 中央显「N0」(对应总和)
- [ ] 桌面拖一个 cube 到炉子 → cube 移动到炉子内,counter +1
- [ ] 桌面点 cube → 同样移到炉子(不用拖)
- [ ] 移动端手指拖 cube → 跟手 + 落到炉子,counter +1
- [ ] 移动端点 cube → 移到炉子
- [ ] cube 装满 10:动画 + 消失 + 钻石条出现
- [ ] 点炉子里的 cube:回到原堆
- [ ] 点「懂了」:模态关闭,回答题屏,`hintShown=true`
- [ ] 一级融合后点「再融一次」:进入 stage-2,bar 变可拖,个位灰显
- [ ] stage-2 拖完所有条:融出「40」大方块,个位 3 块还在
- [ ] stage-2 完成后点「懂了」也能退

手机缓存修复:

- [ ] iOS Chrome:第一次访问,看到首页;改一个前端文件,刷新,立即拿到新版
- [ ] iOS Safari:同上

### 11.3 不打算自动化的部分

drag/touch 交互在 headless 浏览器里很难还原 7 岁孩子真手指的体验。这种 UI 互动**靠人工测试**。后端 API 自动化测够了。

## 12. 已知风险

1. **触摸拖在 iOS Safari 上偶尔会丢事件**(浏览器自带的滚动手势抢)。缓解:模态 overlay 监听 `touchmove` 时 `e.preventDefault()`。如果还有问题,孩子可以改用点击。
2. **8 条以上拖入 stage-2 体力消耗大**(比如 49+38=87,1+1+1+4+3=8 条,加上一级融合和拖块,任务总长可能超 1 分钟)。缓解:**接受**。这种题本来就罕见(题目生成倾向 < 60),且二级融合是可选的。
3. **manifest 顺序错**(games-manifest.js 在 game.js 之前加载) → 报 reference 错。**缓解**:在 spec 里写死 script 顺序;init() 里防御性检查 `window[module]` 存在性。

## 13. 后续工作(本次不做)

- 第二个游戏(退位减法/找规律/...)真上场时,把 `/api/state` 拆成「全局」+「按 game_id」两层
- platform.js 加 hash 路由,孩子用浏览器后退键能回首页
- drag.js 抽得更通用一点(让其他游戏也能用),比如做个「分类游戏」时也能复用
