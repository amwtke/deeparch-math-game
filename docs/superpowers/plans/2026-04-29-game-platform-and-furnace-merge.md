# Game Platform + Furnace Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lightweight game platform shell (homepage with game grid + manifest registration), refactor 凑十大冒险 into a registered game module, build interactive furnace merge widget (5+5 → 10-bar → "40" mega-tile) for the hint flow, and fix mobile Chrome static-file caching.

**Architecture:** Frontend stays as classic-script SPA (no framework, no build step). New `platform.js` owns the topbar and homepage; each game exposes `window.<Module> = { start(host), exit() }` and is listed in `games-manifest.js`. New `drag.js` implements the furnace widget as a self-contained modal called from cou-shi's hint button. Backend gains a `NoCacheStaticFiles` subclass to ensure mobile browsers don't cache stale JS.

**Tech Stack:** Python 3.11+, FastAPI, Starlette, vanilla JS/CSS/HTML.

**Source spec:** [`docs/superpowers/specs/2026-04-29-game-platform-and-furnace-merge-design.md`](../specs/2026-04-29-game-platform-and-furnace-merge-design.md)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/static_no_cache.py` | NEW | StaticFiles subclass adding `Cache-Control: no-store, must-revalidate` |
| `backend/main.py` | MODIFY | Use `NoCacheStaticFiles`; mount `/games` |
| `tests/test_api.py` | MODIFY | Add `test_static_files_have_no_cache_header` |
| `frontend/index.html` | MODIFY | Slim platform shell: `#topbar`, `#app`, all script tags |
| `frontend/css/pixel.css` | MODIFY | Strip cou-shi-only rules; add `.cube-label`/`.bar-label` |
| `frontend/css/platform.css` | NEW | Homepage game grid + cards |
| `frontend/css/drag.css` | NEW | Furnace overlay + modal + animations |
| `frontend/js/render.js` | MODIFY | `renderBar`/`renderSingles` inject "10"/"1" labels |
| `frontend/js/platform.js` | NEW | `window.Platform` — init, enterGame, exit, refreshTopbar |
| `frontend/js/games-manifest.js` | NEW | `window.Games` — array of game manifests |
| `frontend/js/drag.js` | NEW | `window.Drag.openFurnace({a, b, onClose})` |
| `frontend/games/cou-shi/game.js` | NEW (moved) | Was `frontend/js/game.js`; wrapped as `window.CouShi` |
| `frontend/games/cou-shi/cou-shi.css` | NEW | Cou-shi-specific rules extracted from `pixel.css` |
| `frontend/js/game.js` | DELETE | Moved into `games/cou-shi/game.js` |

---

## Task 1: Backend NoCacheStaticFiles + /games mount

**Files:**
- Create: `backend/static_no_cache.py`
- Modify: `backend/main.py` (lines 10, 57-58)
- Modify: `tests/test_api.py` (append new test)

- [ ] **Step 1.1: Write the failing test**

Append this test to `tests/test_api.py`:

```python
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
```

- [ ] **Step 1.2: Run tests, confirm new tests fail**

```bash
uv run pytest tests/test_api.py -v
```

Expected: `test_static_files_have_no_cache_header` FAILS (no `no-store` header). `test_games_static_directory_is_mounted` FAILS (404 from mounted-but-empty dir is OK actually — confirm the response is 404 not 500).

Note: the second test may PASS already if the mount call doesn't error. Adjust expectation: it must NOT 500. Re-read the failure carefully.

- [ ] **Step 1.3: Create `backend/static_no_cache.py`**

```python
"""Static file server that always sets Cache-Control: no-store.

Why: mobile Chrome aggressively caches /js/*.js, so incremental fixes
don't reach the kid's device until a manual cache clear. This makes
every fetch revalidate.
"""
from __future__ import annotations

from starlette.staticfiles import StaticFiles


class NoCacheStaticFiles(StaticFiles):
    """StaticFiles + Cache-Control: no-store on every response."""

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-store, must-revalidate"
        return response
```

- [ ] **Step 1.4: Modify `backend/main.py`**

Replace lines 10 (`from fastapi.staticfiles import StaticFiles`) — keep, but add new import below.

Replace lines 56-58 (the two existing mounts):

```python
# 静态资源 (CSS / JS / 游戏)。挂在最后,/css/* /js/* /games/* 走这里。
# NoCacheStaticFiles 加 Cache-Control: no-store,避免移动端缓存老 JS。
app.mount("/css", NoCacheStaticFiles(directory=FRONTEND_DIR / "css"), name="css")
app.mount("/js", NoCacheStaticFiles(directory=FRONTEND_DIR / "js"), name="js")
app.mount("/games", NoCacheStaticFiles(directory=FRONTEND_DIR / "games"), name="games")
```

And add the import near the top, after `from fastapi.staticfiles import StaticFiles`:

```python
from .static_no_cache import NoCacheStaticFiles
```

The plain `StaticFiles` import can be removed (we only use the subclass), but leave it for now — harmless.

Note: `frontend/games/` doesn't exist yet. Create it as an empty directory so the mount has a valid target:

```bash
mkdir -p /Users/xiaojin/workshop/math-adventure/frontend/games
touch /Users/xiaojin/workshop/math-adventure/frontend/games/.keep
```

- [ ] **Step 1.5: Run tests, confirm pass**

```bash
uv run pytest tests/test_api.py -v
```

Expected: all tests PASS, including the two new ones.

- [ ] **Step 1.6: Manual smoke test**

Make sure the dev server is running (`./run.sh`). Then:

```bash
curl -sI http://localhost:8000/js/api.js | grep -i cache-control
```

Expected: `cache-control: no-store, must-revalidate`

If server was already running, restart it (`pkill -f uvicorn`, then `./run.sh` in background) so the new code is loaded.

- [ ] **Step 1.7: Commit**

```bash
git add backend/static_no_cache.py backend/main.py tests/test_api.py frontend/games/.keep
git commit -m "$(cat <<'EOF'
Add NoCacheStaticFiles for static assets

Mobile Chrome aggressively caches /js/*.js, so incremental frontend
fixes weren't reaching the device. Every static asset now responds
with Cache-Control: no-store, must-revalidate. Also pre-mounts /games
for the upcoming game-platform restructure.
EOF
)"
```

---

## Task 2: Add labels (1, 10) to bars and cubes in render.js

**Files:**
- Modify: `frontend/js/render.js` (lines 35-52)
- Modify: `frontend/css/pixel.css` (append label styles, modify `.bar-cell` / `.single-cube`)

- [ ] **Step 2.1: Modify `renderBar` in `frontend/js/render.js`**

Replace lines 35-41 (the `renderBar` function) with:

```js
/**
 * 渲染一条10格的长方块 (1个十)
 * @param {string} color - '' (绿/草) | 'red' (红石) | 'diamond' (钻石,带闪光)
 * @param {number} count - 默认10 (用于教学时局部展示,游戏内永远是10)
 * @param {string} label - 中央文字,默认 '10';传 '' 则不显示
 */
function renderBar(color, count = 10, label = '10') {
  const bar = el('div', { class: 'bar-block ' + (color || '') });
  for (let i = 0; i < count; i++) {
    bar.appendChild(el('div', { class: 'bar-cell' }));
  }
  if (label) {
    bar.appendChild(el('div', { class: 'bar-label' }, label));
  }
  return bar;
}
```

- [ ] **Step 2.2: Modify `renderSingles` in `frontend/js/render.js`**

Replace lines 46-52 (the `renderSingles` function) with:

```js
/**
 * 渲染散块 (1个一×N),每块中央写"1"
 */
function renderSingles(color, count) {
  const wrap = el('div', { style: 'display:flex;flex-wrap:wrap;justify-content:center;max-width:120px;' });
  for (let i = 0; i < count; i++) {
    const cube = el('div', { class: 'single-cube ' + (color || '') });
    cube.appendChild(el('div', { class: 'cube-label' }, '1'));
    wrap.appendChild(cube);
  }
  return wrap;
}
```

- [ ] **Step 2.3: Add label CSS to `frontend/css/pixel.css`**

The bar `.bar-block` needs `position: relative` so the absolutely-positioned label can center. Find the existing `.bar-block` rule (around line 296) and add `position: relative;`:

```css
/* 长条方块 (1个十) */
.bar-block {
  display: inline-flex;
  background: var(--grass-dark);
  padding: 2px;
  border: 2px solid black;
  margin: 2px;
  position: relative;  /* NEW: anchor for .bar-label */
}
```

Also add `position: relative` to `.single-cube` (around line 323):

```css
.single-cube {
  width: 22px;
  height: 22px;
  display: inline-block;
  background: var(--grass);
  border-top: 3px solid var(--grass-light);
  border-left: 2px solid var(--grass);
  border-right: 2px solid var(--grass-dark);
  border-bottom: 3px solid var(--grass-dark);
  margin: 1px;
  position: relative;  /* NEW: anchor for .cube-label */
}
```

Append at end of `pixel.css`:

```css
/* === 方块标号 (cube → "1", bar → "10", mega → "N0") === */
.cube-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Press Start 2P', monospace;
  font-size: 9px;
  color: white;
  text-shadow: 1px 1px 0 black;
  pointer-events: none;  /* 不挡 click/drag 事件 */
}
.bar-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Press Start 2P', monospace;
  font-size: 13px;
  color: white;
  text-shadow: 1px 1px 0 black, -1px -1px 0 black;
  pointer-events: none;
}
```

- [ ] **Step 2.4: Manual visual check**

Make sure server is running. Open `http://localhost:8000/` (or `http://192.168.110.126:8000/` from another device).

- Click 「⚔ 开始冒险」
- On the game screen, look at the block visualization for `a` and `b`
- Each green/red small cube should have a tiny "1" centered
- Each long bar (10-cube row) should have "10" centered

If labels look misaligned or invisible, tweak font-size or text-shadow. Don't ship if the kid can't read it cleanly at arm's length on a tablet.

- [ ] **Step 2.5: Commit**

```bash
git add frontend/js/render.js frontend/css/pixel.css
git commit -m "$(cat <<'EOF'
Add numeric labels to cubes (1) and bars (10)

Helps the kid build the "块 → 数字" intuition. Same primitives are
about to be reused in the furnace widget, where the labels matter even
more (4 bars become a "40" mega-tile).
EOF
)"
```

---

## Task 3: Move cou-shi into `frontend/games/cou-shi/`, extract its CSS

**Goal:** Pure structural refactor. Cou-shi still loads at `/`, still works exactly the same. After this task, `frontend/games/cou-shi/game.js` exists at its new home, and `frontend/css/pixel.css` only holds platform-shared rules.

**Files:**
- Move: `frontend/js/game.js` → `frontend/games/cou-shi/game.js`
- Create: `frontend/games/cou-shi/cou-shi.css` (rules extracted from pixel.css)
- Modify: `frontend/css/pixel.css` (delete cou-shi-only rules)
- Modify: `frontend/index.html` (update `<script>` and add `<link>`)

- [ ] **Step 3.1: Make the dir + move the file**

```bash
mkdir -p /Users/xiaojin/workshop/math-adventure/frontend/games/cou-shi
git mv /Users/xiaojin/workshop/math-adventure/frontend/js/game.js \
       /Users/xiaojin/workshop/math-adventure/frontend/games/cou-shi/game.js
```

Don't delete `frontend/games/.keep` — git may have already removed it on first non-empty commit, otherwise leave it.

- [ ] **Step 3.2: Update `frontend/index.html` script src**

Find this line:
```html
<script src="/js/game.js"></script>
```

Replace with:
```html
<script src="/games/cou-shi/game.js"></script>
```

- [ ] **Step 3.3: Create `frontend/games/cou-shi/cou-shi.css`**

Write this complete file (rules extracted from `pixel.css`):

```css
/* === 凑十大冒险 - 游戏专属样式 === */
/* 这些规则从 pixel.css 抽出来,只在凑十游戏屏内用到 */

/* === 主菜单 === */
.menu-screen {
  align-items: center;
  justify-content: center;
  text-align: center;
}
.game-title {
  font-family: 'Press Start 2P', monospace;
  font-size: 28px;
  color: white;
  text-shadow: 3px 3px 0 var(--dirt-dark), 6px 6px 0 rgba(0, 0, 0, 0.3);
  margin-bottom: 8px;
  line-height: 1.4;
  letter-spacing: 2px;
}
.game-subtitle {
  font-size: 18px;
  color: var(--text);
  background: rgba(255, 255, 255, 0.7);
  padding: 6px 16px;
  border: 3px solid var(--dirt-dark);
  margin-bottom: 24px;
}

/* === 史蒂夫像素头像 === */
.steve-avatar {
  width: 64px;
  height: 64px;
  margin: 16px auto;
  background:
    linear-gradient(to bottom,
      transparent 0%, transparent 12%,
      #6D4C41 12%, #6D4C41 35%,
      #F5DEB3 35%, #F5DEB3 75%,
      #2196F3 75%);
  border: 3px solid var(--dirt-dark);
  image-rendering: pixelated;
  position: relative;
}
.steve-avatar::before, .steve-avatar::after {
  content: '';
  position: absolute;
  width: 8px;
  height: 8px;
  background: white;
  top: 42%;
}
.steve-avatar::before { left: 22%; }
.steve-avatar::after { right: 22%; }

/* === 游戏题目卡片 === */
.equation-card {
  background: rgba(255, 255, 255, 0.95);
  border: 4px solid var(--dirt-dark);
  padding: 16px;
  text-align: center;
  box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.3);
}
.equation {
  font-family: 'Press Start 2P', monospace;
  font-size: 32px;
  color: var(--text);
  letter-spacing: 4px;
  margin: 8px 0;
}
.equation .qmark {
  color: var(--redstone);
  animation: pulse 1s infinite;
}
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.2); }
}

/* === 方块世界 (题目展示区) === */
.block-world {
  background: rgba(135, 206, 235, 0.4);
  border: 4px solid var(--dirt-dark);
  padding: 12px;
  min-height: 180px;
  display: flex;
  justify-content: space-around;
  gap: 12px;
  position: relative;
}
.block-zone {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.zone-label {
  font-size: 16px;
  color: white;
  background: var(--dirt-dark);
  padding: 4px 8px;
  border: 2px solid black;
}
.blocks-area {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-start;
  gap: 4px;
  min-height: 120px;
  padding: 4px;
}

/* === 数字键盘 === */
.keypad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 8px;
}
.keypad-btn {
  font-family: 'Press Start 2P', monospace;
  font-size: 22px;
  padding: 18px 0;
  background: var(--stone);
  color: white;
  border: none;
  border-top: 4px solid #BDBDBD;
  border-left: 4px solid #BDBDBD;
  border-right: 4px solid var(--stone-dark);
  border-bottom: 4px solid var(--stone-dark);
  cursor: pointer;
  text-shadow: 2px 2px 0 var(--stone-dark);
  transition: transform 0.05s;
}
.keypad-btn:active {
  transform: translate(2px, 2px);
  border-top-color: var(--stone-dark);
  border-left-color: var(--stone-dark);
  border-right-color: #BDBDBD;
  border-bottom-color: #BDBDBD;
}
.keypad-btn.delete {
  background: var(--redstone);
  border-top-color: #EF9A9A;
  border-left-color: #EF9A9A;
  border-right-color: var(--redstone-dark);
  border-bottom-color: var(--redstone-dark);
}
.keypad-btn.submit {
  background: var(--grass);
  border-top-color: var(--grass-light);
  border-left-color: var(--grass-light);
  border-right-color: var(--grass-dark);
  border-bottom-color: var(--grass-dark);
}

/* === 答案显示 === */
.answer-display {
  background: black;
  color: var(--gold);
  font-family: 'Press Start 2P', monospace;
  font-size: 28px;
  padding: 12px;
  text-align: center;
  border: 4px solid var(--dirt-dark);
  min-height: 56px;
  letter-spacing: 8px;
  box-shadow: inset 4px 4px 0 rgba(0, 0, 0, 0.5);
}
.answer-display.empty::after {
  content: '_';
  animation: blink 1s infinite;
}
@keyframes blink {
  50% { opacity: 0; }
}

/* === 通关画面 === */
.victory-screen {
  text-align: center;
  align-items: center;
}
.victory-title {
  font-family: 'Press Start 2P', monospace;
  font-size: 24px;
  color: var(--gold);
  text-shadow: 3px 3px 0 var(--dirt-dark);
  margin: 16px 0;
  animation: victoryBounce 1s infinite;
}
@keyframes victoryBounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

/* === 勋章墙 === */
.badge-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.badge {
  background: rgba(255, 255, 255, 0.9);
  border: 3px solid var(--dirt-dark);
  padding: 12px 6px;
  text-align: center;
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.badge.locked {
  background: rgba(100, 100, 100, 0.6);
  filter: grayscale(1);
  opacity: 0.6;
}
.badge.unlocked {
  background: linear-gradient(135deg, #FFF9C4, #FFD600);
  border-color: var(--gold-dark);
  animation: badgeShine 2s infinite;
}
@keyframes badgeShine {
  0%, 100% { box-shadow: 0 0 4px var(--gold); }
  50% { box-shadow: 0 0 16px var(--gold); }
}
.badge-icon {
  font-size: 32px;
  margin-bottom: 4px;
}
.badge-name {
  font-size: 12px;
  color: var(--text);
  line-height: 1.2;
}

/* === 教学界面 === */
.tutorial-step {
  background: rgba(255, 255, 255, 0.95);
  border: 4px solid var(--dirt-dark);
  padding: 12px;
  margin-bottom: 12px;
}
.tutorial-text {
  font-size: 18px;
  color: var(--text);
  text-align: center;
  margin-bottom: 8px;
  line-height: 1.4;
}
.demo-step {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
  font-size: 18px;
}
.demo-arrow {
  font-size: 24px;
  color: var(--grass-dark);
}
```

- [ ] **Step 3.4: Strip those same rules from `frontend/css/pixel.css`**

Open `pixel.css`. Delete every block that matches one of the selectors moved into `cou-shi.css` above. Specifically the sections labeled:

- `/* === 主菜单 === */` and `.menu-screen`, `.game-title`, `.game-subtitle`
- `/* === 史蒂夫像素头像 === */` and `.steve-avatar` + pseudo-elements
- `/* === 游戏题目卡片 === */` and `.equation-card`, `.equation`, `.qmark`, `@keyframes pulse`
- `/* === 方块世界 === */` and `.block-world`, `.block-zone`, `.zone-label`, `.blocks-area`
- `/* === 数字键盘 === */` and `.keypad`, `.keypad-btn` (and variants)
- `/* === 答案显示 === */` and `.answer-display`, `@keyframes blink`
- `/* === 通关画面 === */` and `.victory-screen`, `.victory-title`, `@keyframes victoryBounce`
- `/* === 勋章墙 === */` and `.badge-grid`, `.badge` (and variants), `@keyframes badgeShine`, `.badge-icon`, `.badge-name`
- `/* === 教学界面 === */` and `.tutorial-step`, `.tutorial-text`, `.demo-step`, `.demo-arrow`

But **leave alone** these (they're shared/platform):
- `*`, `:root`, `html`/`body`
- `.cloud` and `@keyframes cloudMove`
- `#app`
- `.topbar`, `.stat`, `.stat-icon`, `.coin-icon`
- `.screen` (the generic screen container)
- `.menu-btn` (used by platform homepage too)
- `.progress-bar`, `.progress-fill`, `.progress-text`
- `.feedback-overlay`, `.feedback-card`, `.feedback-icon`, `.feedback-title`, `.feedback-detail`, `.reward-row`, `.reward-pill`
- `.bar-block`, `.bar-cell`, `.single-cube` (primitives, used by furnace too)
- `.cube-label`, `.bar-label` (just added in Task 2)
- `.stats-grid`, `.stat-card`
- `.screen-title`
- `.hint-btn`, `.back-btn`, `.btn-row`
- `.shake`, `@keyframes shake`
- `.loading`

Hmm — `.screen-title`, `.stats-grid`, `.stat-card` are used by both cou-shi (badge wall, victory screen) AND potentially the platform homepage. Keep them in pixel.css.

After deletion, save `pixel.css`. It should be roughly half the size.

- [ ] **Step 3.5: Add `<link>` for `cou-shi.css` in `frontend/index.html`**

Find:
```html
<link rel="stylesheet" href="/css/pixel.css">
```

Replace with:
```html
<link rel="stylesheet" href="/css/pixel.css">
<link rel="stylesheet" href="/games/cou-shi/cou-shi.css">
```

- [ ] **Step 3.6: Manual visual check — game still works**

Hard-refresh the browser (Cmd+Shift+R or open in incognito). Walk through:

- Main menu — title, "开始冒险", "怎么玩", "勋章墙" all render
- Click 「怎么玩」 — tutorial steps display with cubes/bars (with new labels)
- Click 「⚔ 开始冒险」 — equation card, block world, keypad, answer display all render
- Answer one question — feedback overlay shows correctly
- Win 10 questions — victory screen renders
- Open 「🏆 勋章墙」 — badges grid renders

If anything looks broken, you missed a CSS rule during extraction. Use DevTools to find which class is unstyled.

- [ ] **Step 3.7: Commit**

```bash
git add frontend/index.html frontend/css/pixel.css frontend/games/cou-shi/
git rm frontend/games/.keep 2>/dev/null || true
git commit -m "$(cat <<'EOF'
Move cou-shi to frontend/games/cou-shi/, extract its CSS

Pure refactor: cou-shi still loads at /, still works the same. The
file move sets up Task 4 (where cou-shi gets wrapped as a registered
game module) and Task 5 (where the platform shell mounts games via
manifest). pixel.css now only contains platform-shared rules and
shared primitives (cube, bar, topbar, buttons).
EOF
)"
```

---

## Task 4: Wrap cou-shi as `window.CouShi` + build platform shell

**Goal:** After this task, `/` loads the platform homepage with 3 game cards (1 active + 2 locked placeholders); clicking the active card enters cou-shi (which now mounts inside a `host` div instead of `#app` directly); clicking 🏠 returns to the homepage; topbar always visible and platform-managed.

**Files:**
- Modify: `frontend/games/cou-shi/game.js` (wrap as module, swap `#app` → `host`, drop topbar render)
- Create: `frontend/js/games-manifest.js`
- Create: `frontend/js/platform.js`
- Create: `frontend/css/platform.css`
- Modify: `frontend/index.html` (slim shell + script order)

- [ ] **Step 4.1: Wrap `frontend/games/cou-shi/game.js` as `window.CouShi`**

Open `frontend/games/cou-shi/game.js`. Make these changes:

**(a)** Change the bottom of the file. Currently it ends with `init();`. Replace the bottom block (from `// ============== 启动 ==============` through `init();`) with:

```js
// ============== 模块入口 ==============
let hostElement = null;  // platform 分配的 div
let listenerCleanups = [];

function getHost() {
  if (!hostElement) throw new Error('CouShi 未初始化');
  return hostElement;
}

window.CouShi = {
  start(host) {
    hostElement = host;
    // 重置模块状态
    currentCombo = 0;
    currentSession = null;
    currentQuestion = null;
    userAnswer = '';
    hintShown = false;
    questionStartTime = 0;
    // 全局监听器:点击解锁 audio
    const unlock = () => {
      Audio.unlock();
      document.removeEventListener('click', unlock);
    };
    document.addEventListener('click', unlock, { once: true });
    listenerCleanups.push(() => document.removeEventListener('click', unlock));
    // 触摸:阻止按钮的 touchend 默认行为
    const touchHandler = (e) => {
      if (e.target.tagName === 'BUTTON') e.preventDefault();
    };
    document.addEventListener('touchend', touchHandler, { passive: false });
    listenerCleanups.push(() => document.removeEventListener('touchend', touchHandler));
    // 渲染主菜单
    render('menu');
  },
  exit() {
    listenerCleanups.forEach(fn => fn());
    listenerCleanups = [];
    if (hostElement) hostElement.innerHTML = '';
    hostElement = null;
  },
};
```

**(b)** Replace every reference to `app` (the module-level variable from `const app = document.getElementById('app');` near the top) with calls to `getHost()`.

Specifically:

- Find this line near the top: `const app = document.getElementById('app');`
- DELETE it.
- In the `render(screen)` function (around line 49 after Task 3 might have shifted lines), the function body starts with:
  ```js
  app.innerHTML = '';
  app.appendChild(renderTopbar());
  ```
  Replace those two lines with:
  ```js
  const app = getHost();
  app.innerHTML = '';
  ```
  **Drop the `app.appendChild(renderTopbar())` line** — topbar is now platform-owned.

  (The other 5 lines `if (screen === 'menu') app.appendChild(...)` etc. now refer to the local `app` variable, which is `getHost()`. Keep those unchanged.)

- Search for any other `app.` reference in the file. There shouldn't be any after the above; if there is, change it to use `getHost()`.

**(c)** Delete the `renderTopbar()` function entirely. Find it (around lines 60-73) and remove the whole function block from `function renderTopbar()` to its closing `}`.

**(d)** Replace `playerState` reads with `Platform.playerState`.

Find every read like `playerState?.total_coins`, `playerState?.today_done`, `playerState.badges`, etc. Replace each with `Platform.playerState?.<field>` (keep the optional chaining).

Search/replace plan: search for `playerState` (case-sensitive). Every read should become `Platform.playerState`. The one ASSIGNMENT — `playerState = await Api.getState();` inside `onSubmit` — is handled in step (e) below.

Also find this line near top:
```js
let playerState = null;       // 从后端拉的玩家状态
```
DELETE it. The module no longer holds player state; it reads through `Platform`.

**(e)** Replace post-submit state refresh in `onSubmit()`.

Find this line in `onSubmit()`:
```js
playerState = await Api.getState();
```
Replace with:
```js
await Platform.refreshTopbar();
```

**(f)** Make 🏠 buttons call `Platform.exit()`.

Search for `onclick: () => render('menu')` patterns. There are several. The intent matters:

- 「返回」 / 「主菜单」 buttons that previously took the kid back to the cou-shi main menu — those should STILL render `'menu'` (in-game navigation). Keep them.
- The 🏠 button in the game screen (`renderGame` function, look for `🏠 返回` text) — change `onclick` to `() => Platform.exit()`.
- The 🏠 button in the badges screen (`renderBadges`, look for `🏠 返回主菜单`) — keep as `render('menu')` (this means cou-shi's menu, which makes sense).
- The buttons in `renderVictory` are about replaying or checking badges — keep as-is.

The key insight: the EXIT-from-cou-shi-back-to-platform happens from the in-game 🏠 button. From other in-cou-shi screens, the kid goes back to cou-shi's main menu first.

For clarity, the only change in this step is the in-game `🏠 返回` button in `renderGame`. Find this line:

```js
el('button', { class: 'back-btn', onclick: () => render('menu') }, '🏠 返回'),
```

Change the text to make it clear it returns to platform:

```js
el('button', { class: 'back-btn', onclick: () => Platform.exit() }, '🏠 退出'),
```

- [ ] **Step 4.2: Create `frontend/js/games-manifest.js`**

Write this complete file:

```js
// === 游戏注册清单 ===
// 加新游戏:在这里加一行,然后在 index.html 里 <script> 引入对应 game.js,
// 该游戏代码自己挂 window.<module> = { start(host), exit() }。

window.Games = [
  {
    id: 'cou-shi',
    name: '凑十大冒险',
    icon: '⛏',
    color: 'green',
    module: 'CouShi',
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

- [ ] **Step 4.3: Create `frontend/js/platform.js`**

Write this complete file:

```js
// === 游戏平台 ===
// 管 topbar、首页游戏网格、游戏挂载/卸载。
// 全局对象:window.Platform = { init, enterGame, exit, refreshTopbar, playerState }

(function () {
  const { el } = window.Render || {};
  if (!el) throw new Error('platform.js: render.js 必须先加载');

  const DAILY_TARGET = 10;
  let topbarEl = null;
  let homeEl = null;
  let gameHostEl = null;
  let currentGameId = null;

  // ---- topbar ----
  function renderTopbar() {
    const ps = window.Platform.playerState || {};
    topbarEl.innerHTML = '';
    topbarEl.appendChild(el('div', { class: 'stat' }, [
      el('span', { class: 'stat-icon coin-icon' }),
      el('span', null, String(ps.total_coins ?? '—')),
    ]));
    topbarEl.appendChild(el('div', { class: 'stat', style: 'flex:1;justify-content:center;' }, [
      el('span', null, '今日 ' + (ps.today_done ?? '—') + '/' + DAILY_TARGET),
    ]));
    topbarEl.appendChild(el('div', { class: 'stat' }, [
      el('span', null, '🔥0'),  // 平台不知道当前 game 的 combo,先显示 0
    ]));
  }

  // ---- home ----
  function renderHome() {
    homeEl.innerHTML = '';
    const wrap = el('div', { class: 'platform-home' });
    wrap.appendChild(el('div', { class: 'platform-title' }, '⛏ 数学历险 ⛏'));
    wrap.appendChild(el('div', { class: 'platform-subtitle' }, '挑一个游戏开始冒险'));

    const grid = el('div', { class: 'game-grid' });
    (window.Games || []).forEach(g => {
      const card = el('div', {
        class: 'game-card ' + (g.color || 'green') + (g.enabled ? '' : ' locked'),
        onclick: g.enabled ? () => window.Platform.enterGame(g.id) : null,
      });
      card.appendChild(el('div', { class: 'game-card-icon' }, g.icon || '🎮'));
      card.appendChild(el('div', { class: 'game-card-name' }, g.name));
      grid.appendChild(card);
    });
    wrap.appendChild(grid);

    wrap.appendChild(el('a', {
      class: 'parent-link',
      href: '/dashboard',
    }, '👨‍👩‍👧 家长仪表盘'));

    homeEl.appendChild(wrap);
  }

  // ---- public API ----
  window.Platform = {
    playerState: null,

    async init() {
      const root = document.getElementById('app');
      root.innerHTML = '';
      topbarEl = el('div', { class: 'topbar', id: 'topbar' });
      homeEl = el('div', { class: 'platform-screen', id: 'home' });
      gameHostEl = el('div', { class: 'game-host', id: 'game-host' });
      root.appendChild(topbarEl);
      root.appendChild(homeEl);
      root.appendChild(gameHostEl);

      try {
        window.Platform.playerState = await Api.getState();
      } catch (e) {
        console.error('getState failed', e);
        window.Platform.playerState = null;
      }
      renderTopbar();
      renderHome();
    },

    enterGame(gameId) {
      const manifest = (window.Games || []).find(g => g.id === gameId);
      if (!manifest) { console.error('game not found:', gameId); return; }
      if (!manifest.enabled) return;
      const mod = window[manifest.module];
      if (!mod || typeof mod.start !== 'function') {
        console.error('game module missing or invalid:', manifest.module);
        return;
      }
      currentGameId = gameId;
      homeEl.classList.add('hidden');
      gameHostEl.classList.add('active');
      gameHostEl.innerHTML = '';
      mod.start(gameHostEl);
    },

    async exit() {
      if (!currentGameId) return;
      const manifest = (window.Games || []).find(g => g.id === currentGameId);
      const mod = manifest ? window[manifest.module] : null;
      if (mod && typeof mod.exit === 'function') {
        try { mod.exit(); } catch (e) { console.error('game exit error', e); }
      }
      currentGameId = null;
      gameHostEl.innerHTML = '';
      gameHostEl.classList.remove('active');
      homeEl.classList.remove('hidden');
      await this.refreshTopbar();
    },

    async refreshTopbar() {
      try {
        window.Platform.playerState = await Api.getState();
      } catch (e) {
        console.error('refreshTopbar failed', e);
      }
      renderTopbar();
    },
  };

  // 启动
  document.addEventListener('DOMContentLoaded', () => {
    window.Platform.init();
  });
})();
```

- [ ] **Step 4.4: Create `frontend/css/platform.css`**

Write this complete file:

```css
/* === 平台首页 === */
.platform-screen {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.platform-home {
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.platform-title {
  font-family: 'Press Start 2P', monospace;
  font-size: 24px;
  color: white;
  text-shadow: 3px 3px 0 var(--dirt-dark);
  margin: 16px 0 8px;
  letter-spacing: 2px;
}
.platform-subtitle {
  font-size: 16px;
  color: var(--text);
  background: rgba(255, 255, 255, 0.7);
  padding: 6px 16px;
  border: 3px solid var(--dirt-dark);
  margin-bottom: 24px;
}

.game-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
  width: 100%;
  margin-bottom: 24px;
}
.game-card {
  aspect-ratio: 1;
  background: var(--grass);
  border-top: 4px solid var(--grass-light);
  border-left: 4px solid var(--grass-light);
  border-right: 4px solid var(--grass-dark);
  border-bottom: 4px solid var(--grass-dark);
  color: white;
  text-shadow: 2px 2px 0 var(--grass-dark);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.1s;
  padding: 8px;
}
.game-card:not(.locked):active {
  transform: translate(2px, 2px);
}
.game-card.gray, .game-card.locked {
  background: var(--stone);
  border-top-color: #BDBDBD;
  border-left-color: #BDBDBD;
  border-right-color: var(--stone-dark);
  border-bottom-color: var(--stone-dark);
  cursor: not-allowed;
  opacity: 0.7;
}
.game-card-icon {
  font-size: 36px;
  margin-bottom: 6px;
}
.game-card-name {
  font-family: 'ZCOOL KuaiLe', sans-serif;
  font-size: 14px;
  line-height: 1.2;
}

.parent-link {
  display: inline-block;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  text-decoration: none;
  padding: 8px 16px;
  border: 2px dashed white;
  font-size: 14px;
  margin-top: 8px;
}

/* === 游戏挂载点 === */
.platform-screen.hidden { display: none; }
.game-host {
  flex: 1;
  display: none;
  flex-direction: column;
  overflow: hidden;
}
.game-host.active {
  display: flex;
}
.game-host > .screen {
  flex: 1;
}
```

- [ ] **Step 4.5: Slim down `frontend/index.html`**

Replace the entire file with:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>⛏ 数学历险 ⛏</title>
<link rel="stylesheet" href="/css/pixel.css">
<link rel="stylesheet" href="/css/platform.css">
<link rel="stylesheet" href="/games/cou-shi/cou-shi.css">
</head>
<body>

<div class="cloud c1"></div>
<div class="cloud c2"></div>
<div class="cloud c3"></div>

<div id="app">
  <div class="loading">⛏ 加载中... ⛏</div>
</div>

<script src="/js/api.js"></script>
<script src="/js/audio.js"></script>
<script src="/js/render.js"></script>
<script src="/games/cou-shi/game.js"></script>
<script src="/js/games-manifest.js"></script>
<script src="/js/platform.js"></script>

</body>
</html>
```

Note: `drag.js` is NOT loaded yet — that's Task 5. Cou-shi's `showHint()` still uses the old text-only hint until then.

- [ ] **Step 4.6: Manual visual check — full platform flow**

Hard-refresh the browser. Walk through:

- `/` shows platform homepage: title "数学历险", subtitle, 3 game cards (1 green ⛏ active + 2 gray 🔒 locked), parent dashboard link
- topbar at top shows coin count / 今日 0/10 / 🔥0
- Click a 🔒 card: nothing happens (no error in console)
- Click ⛏ 凑十大冒险 card: enters game, sees cou-shi main menu
- topbar still visible (platform-owned)
- Click 「⚔ 开始冒险」 → game screen
- Answer one question correctly → topbar updates with new coin count
- Click 「🏠 退出」 in game screen → returns to platform homepage; coin count reflects what was earned
- Click ⛏ card again → cou-shi menu, 🔥 combo back to 0
- Visit `/dashboard` directly: dashboard renders (unchanged behavior)

If any step breaks, check browser console for errors. Most likely issues:
- `window.Platform is undefined` → script load order in index.html
- `getHost is not defined` → cou-shi/game.js wrapping not complete
- Topbar not updating after answer → `Platform.refreshTopbar()` not being awaited

- [ ] **Step 4.7: Commit**

```bash
git add frontend/index.html \
        frontend/css/platform.css \
        frontend/js/games-manifest.js \
        frontend/js/platform.js \
        frontend/games/cou-shi/game.js
git commit -m "$(cat <<'EOF'
Add game platform shell + register cou-shi

Platform.init() owns the topbar and home grid. Cou-shi is now wrapped
as window.CouShi = { start(host), exit() }, registered in
games-manifest.js. The 🏠 button in-game calls Platform.exit() to
return to the homepage. Two locked placeholder cards reserve room for
future games.

The drag.js furnace widget (Task 5) is not yet loaded; the hint flow
still shows the old text overlay.
EOF
)"
```

---

## Task 5: Build `drag.js` furnace widget + wire `showHint()`

**Goal:** Clicking 💡 提示 in-game opens an interactive furnace modal. Stage 1: drag/tap individual cubes from a/b's piles into a furnace; once the furnace holds 10, animate fusion into a diamond bar (added to a's tens area). Stage 2 (optional): kid clicks "再融一次", drags all bars into the furnace; when full, fuse into a single mega-tile labeled `<count>0` (e.g. "40"). Throughout, kid can click 「懂了」 to close.

**Files:**
- Create: `frontend/js/drag.js`
- Create: `frontend/css/drag.css`
- Modify: `frontend/index.html` (load drag.js + drag.css)
- Modify: `frontend/games/cou-shi/game.js` (`showHint()` body)

- [ ] **Step 5.1: Create `frontend/js/drag.js`**

Write this complete file:

```js
// === 凑十熔炉 widget ===
// 公共 widget,可被任何游戏复用。当前由 cou-shi 的 💡 提示按钮触发。
// 接口: window.Drag.openFurnace({ a, b, onClose })

(function () {
  const { el } = window.Render || {};
  if (!el) throw new Error('drag.js: render.js 必须先加载');

  let isOpen = false;

  // 状态(per modal):
  let modalState = null;

  function openFurnace({ a, b, onClose }) {
    if (isOpen) return;
    isOpen = true;

    const aTens = Math.floor(a / 10);
    const aOnes = a % 10;
    const bTens = Math.floor(b / 10);
    const bOnes = b % 10;
    const totalBars = aTens + bTens + 1;  // 凑十后会多 1 条
    const remainingOnes = (aOnes + bOnes) - 10;  // 凑十后剩余的散块数

    modalState = {
      stage: 1,
      cubeFurnaceCount: 0,
      barFurnaceCount: 0,
      totalBars,
      remainingOnes,
      aTens, aOnes, bTens, bOnes,
      // DOM refs filled below
      overlay: null,
      modal: null,
      pileACubes: null, pileBCubes: null,
      pileATens: null, pileBTens: null,
      cubeFurnace: null, cubeFurnaceCounter: null, cubeFurnaceContent: null,
      barFurnace: null, barFurnaceCounter: null, barFurnaceContent: null,
      megaArea: null,
      gotItBtn: null, refuseBtn: null,
      stageBanner: null,
      onClose,
    };

    buildDom();
  }

  function buildDom() {
    const s = modalState;
    s.overlay = el('div', { class: 'furnace-overlay' });
    s.modal = el('div', { class: 'furnace-modal' });

    s.modal.appendChild(el('div', { class: 'furnace-header' }, '🔥 凑十秘籍'));
    s.stageBanner = el('div', { class: 'furnace-banner' }, '把小方块拖(或点)进熔炉,凑成 10');
    s.modal.appendChild(s.stageBanner);

    // === 史蒂夫一堆 ===
    const pileA = el('div', { class: 'furnace-pile pile-a' });
    pileA.appendChild(el('div', { class: 'pile-label' }, '史蒂夫 ' + (s.aTens * 10 + s.aOnes)));
    s.pileATens = el('div', { class: 'pile-tens' });
    for (let i = 0; i < s.aTens; i++) s.pileATens.appendChild(makeBar('green', '10', false));
    pileA.appendChild(s.pileATens);
    s.pileACubes = el('div', { class: 'pile-cubes' });
    for (let i = 0; i < s.aOnes; i++) s.pileACubes.appendChild(makeCube('green', true));
    pileA.appendChild(s.pileACubes);
    s.modal.appendChild(pileA);

    // === 爱丽克斯一堆 ===
    const pileB = el('div', { class: 'furnace-pile pile-b' });
    pileB.appendChild(el('div', { class: 'pile-label' }, '爱丽克斯 ' + (s.bTens * 10 + s.bOnes)));
    s.pileBTens = el('div', { class: 'pile-tens' });
    for (let i = 0; i < s.bTens; i++) s.pileBTens.appendChild(makeBar('red', '10', false));
    pileB.appendChild(s.pileBTens);
    s.pileBCubes = el('div', { class: 'pile-cubes' });
    for (let i = 0; i < s.bOnes; i++) s.pileBCubes.appendChild(makeCube('red', true));
    pileB.appendChild(s.pileBCubes);
    s.modal.appendChild(pileB);

    // === 熔炉 (cube 阶段) ===
    s.cubeFurnace = el('div', { class: 'furnace cube-furnace' });
    s.cubeFurnaceCounter = el('div', { class: 'furnace-counter' }, '🔥 [0/10]');
    s.cubeFurnaceContent = el('div', { class: 'furnace-content' });
    s.cubeFurnace.appendChild(s.cubeFurnaceCounter);
    s.cubeFurnace.appendChild(s.cubeFurnaceContent);
    s.modal.appendChild(s.cubeFurnace);

    // === 熔炉 (bar 阶段, 默认隐藏) ===
    s.barFurnace = el('div', { class: 'furnace bar-furnace', style: 'display:none;' });
    s.barFurnaceCounter = el('div', { class: 'furnace-counter' }, '🔥 [0/' + s.totalBars + ' 条]');
    s.barFurnaceContent = el('div', { class: 'furnace-content' });
    s.barFurnace.appendChild(s.barFurnaceCounter);
    s.barFurnace.appendChild(s.barFurnaceContent);
    s.modal.appendChild(s.barFurnace);

    // === 大方块区 (二级融合产出, 默认空) ===
    s.megaArea = el('div', { class: 'furnace-mega-area' });
    s.modal.appendChild(s.megaArea);

    // === 按钮 ===
    const btnRow = el('div', { class: 'furnace-buttons' });
    s.gotItBtn = el('button', {
      class: 'menu-btn gold',
      onclick: closeModal,
    }, '🧠 懂了!');
    s.refuseBtn = el('button', {
      class: 'menu-btn diamond',
      style: 'display:none;',
      onclick: enterStage2,
    }, '✨ 再融一次');
    btnRow.appendChild(s.gotItBtn);
    btnRow.appendChild(s.refuseBtn);
    s.modal.appendChild(btnRow);

    s.overlay.appendChild(s.modal);
    document.body.appendChild(s.overlay);

    // 阻止 overlay 上的滚动/选中
    s.overlay.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

    // furnace 接收 drop
    setupDropTarget(s.cubeFurnace, (elem) => addCubeToFurnace(elem));
    setupDropTarget(s.barFurnace, (elem) => addBarToFurnace(elem));
  }

  // ---- helpers: makeCube, makeBar ----

  function makeCube(color, draggable) {
    const c = el('div', { class: 'furnace-cube ' + color });
    c.appendChild(el('div', { class: 'cube-label' }, '1'));
    if (draggable) makeDraggable(c);
    return c;
  }

  function makeBar(color, label, draggable) {
    const b = el('div', { class: 'furnace-bar ' + color });
    for (let i = 0; i < 10; i++) b.appendChild(el('div', { class: 'bar-cell' }));
    b.appendChild(el('div', { class: 'bar-label' }, label));
    if (draggable) makeDraggable(b);
    return b;
  }

  // ---- drag & tap unified handler ----

  function makeDraggable(elem) {
    elem.classList.add('draggable');
    // tap
    elem.addEventListener('click', (e) => {
      e.stopPropagation();
      const stage = modalState.stage;
      if (elem.classList.contains('furnace-cube') && stage === 1) {
        // 在堆里 → 进炉; 在炉里 → 出炉
        if (elem.parentElement === modalState.cubeFurnaceContent) {
          removeCubeFromFurnace(elem);
        } else {
          addCubeToFurnace(elem);
        }
      } else if (elem.classList.contains('furnace-bar') && stage === 2) {
        if (elem.parentElement === modalState.barFurnaceContent) {
          removeBarFromFurnace(elem);
        } else {
          addBarToFurnace(elem);
        }
      }
    });
    // pointer drag
    elem.addEventListener('pointerdown', (e) => onPointerDown(e, elem));
  }

  let dragCtx = null;

  function onPointerDown(e, elem) {
    if (e.button !== undefined && e.button !== 0) return;  // only left/primary
    e.preventDefault();
    elem.setPointerCapture && elem.setPointerCapture(e.pointerId);
    const rect = elem.getBoundingClientRect();
    dragCtx = {
      elem,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      origParent: elem.parentElement,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
    };
    elem.classList.add('dragging');
    elem.style.position = 'fixed';
    elem.style.left = (e.clientX - dragCtx.offsetX) + 'px';
    elem.style.top = (e.clientY - dragCtx.offsetY) + 'px';
    elem.style.zIndex = '10000';
    document.body.appendChild(elem);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerMove(e) {
    if (!dragCtx) return;
    const dx = e.clientX - dragCtx.startX;
    const dy = e.clientY - dragCtx.startY;
    if (!dragCtx.moved && Math.hypot(dx, dy) > 4) dragCtx.moved = true;
    dragCtx.elem.style.left = (e.clientX - dragCtx.offsetX) + 'px';
    dragCtx.elem.style.top = (e.clientY - dragCtx.offsetY) + 'px';
  }

  function onPointerUp(e) {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
    if (!dragCtx) return;
    const ctx = dragCtx;
    dragCtx = null;
    ctx.elem.classList.remove('dragging');
    ctx.elem.style.position = '';
    ctx.elem.style.left = '';
    ctx.elem.style.top = '';
    ctx.elem.style.zIndex = '';

    if (!ctx.moved) {
      // 没真拖,当 click 处理。先把元素插回原位,让 click 事件流自己跑
      ctx.origParent.appendChild(ctx.elem);
      return;
    }

    // 拖完了:看落点
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const dropZone = target ? target.closest('.furnace.drop-target') : null;
    if (dropZone && dropZone._onDrop) {
      dropZone._onDrop(ctx.elem);
    } else {
      // 弹回原位
      ctx.origParent.appendChild(ctx.elem);
    }
  }

  function setupDropTarget(zone, handler) {
    zone.classList.add('drop-target');
    zone._onDrop = handler;
  }

  // ---- stage 1: cubes -> 10 -> bar ----

  function addCubeToFurnace(cube) {
    if (modalState.stage !== 1) return;
    if (modalState.cubeFurnaceCount >= 10) return;
    modalState.cubeFurnaceContent.appendChild(cube);
    modalState.cubeFurnaceCount++;
    updateCubeCounter();
    if (modalState.cubeFurnaceCount === 10) {
      fuseStage1();
    }
  }

  function removeCubeFromFurnace(cube) {
    // 决定回 a 还是 b 堆,根据 color
    const target = cube.classList.contains('red') ? modalState.pileBCubes : modalState.pileACubes;
    target.appendChild(cube);
    modalState.cubeFurnaceCount--;
    updateCubeCounter();
  }

  function updateCubeCounter() {
    modalState.cubeFurnaceCounter.textContent = '🔥 [' + modalState.cubeFurnaceCount + '/10]';
    if (modalState.cubeFurnaceCount === 10) {
      modalState.cubeFurnace.classList.add('full');
    } else {
      modalState.cubeFurnace.classList.remove('full');
    }
  }

  function fuseStage1() {
    Audio.levelUp();
    setTimeout(() => {
      // 清空 cube furnace 内容
      modalState.cubeFurnaceContent.innerHTML = '';
      modalState.cubeFurnaceCounter.textContent = '✨ 化成了 1 条!';
      // 在 a 的条区追加钻石条
      const newBar = makeBar('diamond', '10', false);
      modalState.pileATens.appendChild(newBar);
      // 显示 step-4 banner + refuse 按钮
      modalState.stageBanner.textContent =
        '现在共有 ' + modalState.totalBars + ' 条 + ' +
        modalState.remainingOnes + ' 块 = ?';
      modalState.refuseBtn.style.display = '';
      // 锁掉 cube furnace 不让继续往里放
      modalState.cubeFurnace.classList.remove('drop-target');
      // a 的散块区现在为空,b 还有 remainingOnes 个,自然
    }, 600);
  }

  // ---- stage 2: bars -> N → mega tile ----

  function enterStage2() {
    modalState.stage = 2;
    modalState.refuseBtn.style.display = 'none';
    modalState.stageBanner.textContent =
      '把所有 ' + modalState.totalBars + ' 条都拖进熔炉,看变成多少';
    modalState.barFurnace.style.display = '';
    modalState.cubeFurnace.style.display = 'none';
    // 让条变可拖
    [...modalState.pileATens.children, ...modalState.pileBTens.children].forEach(bar => {
      makeDraggable(bar);
    });
    // 个位锁定 (灰显)
    modalState.pileACubes.classList.add('locked');
    modalState.pileBCubes.classList.add('locked');
  }

  function addBarToFurnace(bar) {
    if (modalState.stage !== 2) return;
    if (modalState.barFurnaceCount >= modalState.totalBars) return;
    modalState.barFurnaceContent.appendChild(bar);
    modalState.barFurnaceCount++;
    updateBarCounter();
    if (modalState.barFurnaceCount === modalState.totalBars) {
      fuseStage2();
    }
  }

  function removeBarFromFurnace(bar) {
    // 简化:回到 a 的条区
    modalState.pileATens.appendChild(bar);
    modalState.barFurnaceCount--;
    updateBarCounter();
  }

  function updateBarCounter() {
    modalState.barFurnaceCounter.textContent =
      '🔥 [' + modalState.barFurnaceCount + '/' + modalState.totalBars + ' 条]';
    if (modalState.barFurnaceCount === modalState.totalBars) {
      modalState.barFurnace.classList.add('full');
    } else {
      modalState.barFurnace.classList.remove('full');
    }
  }

  function fuseStage2() {
    Audio.levelUp();
    setTimeout(() => {
      modalState.barFurnaceContent.innerHTML = '';
      modalState.barFurnaceCounter.textContent = '✨ 化成了一个大方块!';
      const sum = modalState.totalBars * 10;
      const mega = el('div', { class: 'mega-block' }, String(sum));
      modalState.megaArea.appendChild(mega);
      modalState.stageBanner.textContent =
        sum + ' + ' + modalState.remainingOnes + ' = ?';
      modalState.barFurnace.classList.remove('drop-target');
    }, 600);
  }

  // ---- close ----

  function closeModal() {
    if (!modalState) return;
    const cb = modalState.onClose;
    if (modalState.overlay && modalState.overlay.parentElement) {
      modalState.overlay.parentElement.removeChild(modalState.overlay);
    }
    modalState = null;
    isOpen = false;
    if (typeof cb === 'function') {
      try { cb(); } catch (e) { console.error('onClose error', e); }
    }
  }

  window.Drag = { openFurnace };
})();
```

- [ ] **Step 5.2: Create `frontend/css/drag.css`**

Write this complete file:

```css
/* === 熔炉 widget === */
.furnace-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: 200;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow-y: auto;
  padding: 12px;
}
.furnace-modal {
  width: 100%;
  max-width: 540px;
  background: #2C3E50;
  color: white;
  border: 4px solid white;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.furnace-header {
  font-family: 'Press Start 2P', monospace;
  font-size: 14px;
  color: var(--gold);
  text-align: center;
  text-shadow: 2px 2px 0 black;
}
.furnace-banner {
  background: rgba(255, 255, 255, 0.1);
  padding: 8px;
  text-align: center;
  font-size: 14px;
  color: var(--gold);
  border: 2px dashed var(--gold);
}

/* 一堆 */
.furnace-pile {
  background: rgba(255, 255, 255, 0.08);
  padding: 8px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pile-label {
  font-size: 12px;
  color: white;
  font-family: 'Press Start 2P', monospace;
  text-shadow: 1px 1px 0 black;
}
.pile-tens, .pile-cubes {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  align-items: center;
}
.pile-cubes.locked .furnace-cube {
  filter: grayscale(0.8);
  opacity: 0.5;
  cursor: not-allowed;
}
.pile-cubes.locked .furnace-cube.draggable {
  pointer-events: none;
}

/* 单块 */
.furnace-cube {
  width: 28px;
  height: 28px;
  background: var(--grass);
  border: 2px solid var(--grass-dark);
  position: relative;
  display: inline-block;
  flex-shrink: 0;
}
.furnace-cube.red {
  background: var(--redstone);
  border-color: var(--redstone-dark);
}
.furnace-cube.draggable {
  cursor: grab;
  touch-action: none;
}
.furnace-cube.dragging {
  cursor: grabbing;
  opacity: 0.85;
  transform: scale(1.1);
}

/* 长条 */
.furnace-bar {
  display: inline-flex;
  background: var(--grass-dark);
  padding: 2px;
  border: 2px solid black;
  position: relative;
  width: 220px;
  flex-shrink: 0;
}
.furnace-bar.red { background: var(--redstone-dark); }
.furnace-bar.diamond {
  background: var(--diamond-dark);
  animation: shimmer 1.5s infinite;
}
.furnace-bar .bar-cell {
  width: 18px;
  height: 22px;
  background: var(--grass);
  border-top: 2px solid var(--grass-light);
  border-bottom: 1px solid var(--grass-dark);
  flex: 1;
}
.furnace-bar.red .bar-cell { background: var(--redstone); border-top-color: #FFCDD2; }
.furnace-bar.diamond .bar-cell { background: var(--diamond); border-top-color: #B3E5FC; }
.furnace-bar.draggable {
  cursor: grab;
  touch-action: none;
}
.furnace-bar.dragging {
  cursor: grabbing;
  opacity: 0.85;
  transform: scale(1.05);
}

/* 熔炉本体 */
.furnace {
  background: #5D4037;
  border: 4px dashed #FFB74D;
  padding: 12px;
  min-height: 70px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  justify-content: center;
}
.furnace.full {
  background: #FF6F00;
  border-color: white;
  animation: furnace-pulse 0.5s ease-in-out infinite alternate;
}
@keyframes furnace-pulse {
  from { transform: scale(1); }
  to { transform: scale(1.04); box-shadow: 0 0 16px gold; }
}
.furnace-counter {
  color: var(--gold);
  font-family: 'Press Start 2P', monospace;
  font-size: 12px;
  text-shadow: 1px 1px 0 black;
}
.furnace-content {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  justify-content: center;
  min-height: 30px;
}

/* 二级融合产物 */
.furnace-mega-area {
  display: flex;
  justify-content: center;
}
.mega-block {
  width: 240px;
  height: 60px;
  line-height: 60px;
  background: linear-gradient(135deg, #FFD54F, #FF8F00);
  border: 4px solid #FF6F00;
  color: white;
  font-family: 'Press Start 2P', monospace;
  font-size: 30px;
  font-weight: bold;
  text-align: center;
  text-shadow: 2px 2px 0 black;
  box-shadow: 0 0 20px gold;
}

.furnace-buttons {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 8px 0 4px;
}
.furnace-buttons .menu-btn {
  font-size: 16px;
  padding: 10px 20px;
  min-width: 0;
}
```

- [ ] **Step 5.3: Add `<script>` and `<link>` for drag in `frontend/index.html`**

Add a `<link rel="stylesheet" href="/css/drag.css">` line in `<head>` after the `cou-shi.css` link:

```html
<link rel="stylesheet" href="/css/drag.css">
```

Add a `<script src="/js/drag.js"></script>` line BEFORE `cou-shi/game.js` (since cou-shi calls `Drag.openFurnace`):

```html
<script src="/js/drag.js"></script>
<script src="/games/cou-shi/game.js"></script>
```

The full `<head>` and `<script>` block now look like:

```html
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>⛏ 数学历险 ⛏</title>
<link rel="stylesheet" href="/css/pixel.css">
<link rel="stylesheet" href="/css/platform.css">
<link rel="stylesheet" href="/css/drag.css">
<link rel="stylesheet" href="/games/cou-shi/cou-shi.css">
</head>
```

```html
<script src="/js/api.js"></script>
<script src="/js/audio.js"></script>
<script src="/js/render.js"></script>
<script src="/js/drag.js"></script>
<script src="/games/cou-shi/game.js"></script>
<script src="/js/games-manifest.js"></script>
<script src="/js/platform.js"></script>
```

- [ ] **Step 5.4: Replace `showHint()` body in `frontend/games/cou-shi/game.js`**

Find the existing `showHint()` function. Its current body builds a custom DOM overlay with text. Replace the **entire function** with:

```js
function showHint() {
  if (hintShown) return;
  hintShown = true;
  Drag.openFurnace({
    a: currentQuestion.a,
    b: currentQuestion.b,
    onClose: () => {
      // 关掉模态后,孩子继续在键盘填答案;hintShown=true 已记录,
      // 提交答案时通过 used_hint 字段告诉后端。
    },
  });
}
```

- [ ] **Step 5.5: Manual visual check — full furnace flow**

Hard-refresh the browser. From homepage → cou-shi → 「⚔ 开始冒险」 → in-game.

Run through this sub-checklist:

- Click 💡 提示: modal appears, dark overlay. Header "🔥 凑十秘籍". Two piles labeled with "史蒂夫 X" and "爱丽克斯 Y". Cubes have "1" labels, bars have "10" labels.
- The cube furnace shows "🔥 [0/10]".
- **Tap a green cube**: it flies into the furnace; counter "🔥 [1/10]".
- **Tap a furnace cube**: it returns to its original pile; counter back to "[0/10]".
- **Drag a green cube** to the furnace (mouse or finger): cube follows cursor/finger; on release over the furnace, lands inside; counter increments. (If release is outside, cube snaps back.)
- **Fill the furnace with 10 cubes** (mix of green and red): when count hits 10, brief pulse animation, all 10 disappear, a diamond-colored bar appears in 史蒂夫's bar row, banner updates to "现在共有 X 条 + Y 块 = ?".
- The "✨ 再融一次" button now visible.
- Click 「🧠 懂了!」: modal closes, kid back at game screen with hintShown=true. Click ✓ to submit answer (typing the correct answer); confirm `used_hint` flag goes through (no UI difference, but it should).
- Open hint again with a NEW question (kid answered the previous one or 🏠 + new game). Confirm hint opens again from the new state.
- This time, after stage-1 fuse, click 「✨ 再融一次」: cube furnace hides, bar furnace appears with counter "🔥 [0/N 条]". 个位 cubes turn gray (locked).
- Drag/tap each bar (including the new diamond one) into the bar furnace one by one. When count hits N (totalBars), pulse, mega-tile appears showing "<N0>" e.g. "40", banner updates to "40 + Y = ?".
- Click 「🧠 懂了!」: modal closes.
- Mobile test (Chrome on Android, Safari on iOS): repeat the tap and drag scenarios. Drag on iOS may feel less reliable — that's why tap is the primary mechanism. Make sure the page doesn't scroll while dragging (overlay should suppress).

If anything is broken or feels janky:
- Cube doesn't follow finger smoothly → check `touch-action: none` on `.furnace-cube.draggable`
- Page scrolls while dragging → ensure overlay's `touchmove` `preventDefault()`
- Bar in stage-2 doesn't move → check `makeDraggable(bar)` was actually called in `enterStage2()`
- Mega-tile shows wrong number → check `totalBars * 10` calc

- [ ] **Step 5.6: Commit**

```bash
git add frontend/index.html \
        frontend/css/drag.css \
        frontend/js/drag.js \
        frontend/games/cou-shi/game.js
git commit -m "$(cat <<'EOF'
Add furnace merge widget for cou-shi hint flow

drag.js exposes Drag.openFurnace({a, b, onClose}). Cou-shi's 💡 button
now opens the modal: kid drags or taps cubes from a/b's piles into
the furnace. At 10, a diamond bar fuses out. Optional second stage
fuses all bars into a single "N0" mega-tile.

Pointer events power the drag (works on iOS Safari + Chrome). Tap
remains the most reliable input on touch screens. Click vs. drag is
detected by movement threshold (4px).
EOF
)"
```

---

## Self-Review Checklist (run before declaring plan done)

1. **Spec coverage** — every section in the spec has a task implementing it:
   - Spec §1 goals → Tasks 1-5 collectively
   - Spec §3 file structure → Tasks 1, 3, 4, 5
   - Spec §4 platform.js → Task 4
   - Spec §5 manifest → Task 4
   - Spec §6 cou-shi changes → Tasks 3, 4, 5
   - Spec §7 drag.js (incl. labels in §7.5) → Tasks 2, 5
   - Spec §8 NoCacheStaticFiles → Task 1
   - Spec §11 testing → built into each task's manual verify step + automated test in Task 1

2. **Placeholder scan** — no "TBD" / "TODO" / "appropriate handling" / vague verbs. Every code block is real code.

3. **Type consistency**:
   - `Platform.playerState` (object) — used as read-only field in cou-shi
   - `Platform.refreshTopbar()` (returns Promise) — awaited everywhere
   - `Platform.exit()` (returns Promise) — not awaited at call site, OK since fire-and-forget
   - `window.CouShi.start(host)`, `window.CouShi.exit()` — match spec §6.1
   - `Drag.openFurnace({ a, b, onClose })` — match spec §7.1
   - `window.Games[].module` — string, used as `window[manifest.module]` lookup

4. **Risks not blocking**:
   - The platform.js init() builds DOM inside a try/catch only for state fetch; if `getElementById('app')` returns null (shouldn't), it'll throw. Not handled — acceptable for kid's local app.
   - Bar `removeBarFromFurnace` always returns to pileATens regardless of original color. Slight UX wart (red bar comes back as part of A's row), but functionally correct. Documented in §11.2 risks if it becomes a problem.

If self-review passes, proceed to execution choice below.

---

## Execution

Plan complete. Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, with review between tasks. Best for catching mistakes and keeping each task self-contained.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batched with checkpoints.

Tell me which to use.
