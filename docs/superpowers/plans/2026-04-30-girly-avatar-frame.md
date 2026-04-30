# 主页角色相框 — 蕾丝粉花边版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把首页角色当前的木头方框换成"粉色蕾丝双线 + 像素蝴蝶结 + 珍珠角"风格相框,稍大一点,适合女孩子。

**Architecture:** 纯前端改动。CSS 替换 `.avatar-home-tile` 的边框/背景规则、扩大网格左列、新增 `.avatar-frame-pearl` 和 `.avatar-frame-ribbon` 规则;JS 在 `home-tile.js` 中给 tile 多 append 5 个装饰节点(1 个蝴蝶结 + 4 个珍珠)。商店预览、idle 浮动动画、点击跳商店逻辑都不动。

**Tech Stack:** 原生 HTML/CSS/JS(无构建工具)。验证通过浏览器人眼对照。

**Spec:** `docs/superpowers/specs/2026-04-30-girly-avatar-frame-design.md`

---

## Pre-flight

工作区当前 (master) 有两个 uncommitted 改动来自上一轮迭代:
- `frontend/css/platform.css` — `.platform-screen` 加了 `justify-content: center`(让主页内容垂直居中,填满草地空白)
- `frontend/css/avatar.css` — 木头边框(本计划要替换掉的)

**Step 0a:** 先把 `platform.css` 的垂直居中独立提交,免得跟相框改动混在一起:

```bash
git add frontend/css/platform.css
git commit -m "Vertically center home content to fill the page"
```

**Step 0b:** `frontend/css/avatar.css` 的木头边框等下要被替换,**不要**单独提交它。直接进 Task 1。

---

## File Structure

| 文件 | 责任 | 改动类型 |
|---|---|---|
| `frontend/css/avatar.css` | 主页角色相框 + 商店样式 | Modify(替换 `.avatar-home-tile` 块,新增装饰规则,改列宽) |
| `frontend/js/avatar/home-tile.js` | 渲染主页角色 tile | Modify(在 tile 内多 append 5 个装饰节点) |

无新建文件,无新依赖。

---

## Task 1: 替换 `.avatar-home-tile` 的边框/背景为粉色蕾丝双线

**Files:**
- Modify: `frontend/css/avatar.css`(`.avatar-home-tile` 规则块 + `.platform-home.with-avatar` grid 列宽)

- [ ] **Step 1.1: 改 grid 列宽 260px → 300px**

打开 `frontend/css/avatar.css`,定位 `.platform-home.with-avatar` 规则。把 `grid-template-columns: 260px 1fr;` 改成 `grid-template-columns: 300px 1fr;`。

修改后的规则块:

```css
.platform-home.with-avatar {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 32px;
  align-items: center;
  max-width: 960px;
}
```

- [ ] **Step 1.2: 替换 `.avatar-home-tile` 的视觉规则**

定位 `.avatar-home-tile` 块。当前内容(本计划要丢掉的):

```css
.avatar-home-tile {
  cursor: pointer;
  transition: transform 0.2s ease;
  background: linear-gradient(180deg, rgba(176, 224, 230, 0.45), rgba(176, 224, 230, 0.15));
  padding: 8px;
  border-top: 8px solid #B4886B;
  border-left: 8px solid #B4886B;
  border-right: 8px solid #5A3A1F;
  border-bottom: 8px solid #5A3A1F;
  box-shadow:
    inset 0 0 0 3px #4A2C1A,
    6px 6px 0 rgba(0, 0, 0, 0.35);
}
```

整块替换为:

```css
.avatar-home-tile {
  cursor: pointer;
  transition: transform 0.2s ease;
  position: relative;
  padding: 36px 32px;
  background: linear-gradient(180deg, #ffe7ef, #ffd0e0);
  border: 10px double #c97f96;
  border-radius: 12px;
  box-shadow: 0 6px 0 rgba(0, 0, 0, 0.12);
}
```

注:`position: relative` 是新增的,装饰节点用 `position: absolute` 相对它定位。

- [ ] **Step 1.3: `.avatar-home-tile:hover` 不动**

确认下面这行还在(它原本就在 hover 缩放规则,不需要改):

```css
.avatar-home-tile:hover { transform: scale(1.05); }
```

- [ ] **Step 1.4: `.avatar-home-tile .avatar-svg` + `@keyframes avatar-idle` 不动**

确认这两块仍然在:

```css
.avatar-home-tile .avatar-svg {
  width: 200px; height: 400px; display: block;
  animation: avatar-idle 2.4s ease-in-out infinite;
}
@keyframes avatar-idle {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
```

- [ ] **Step 1.5: 浏览器人工验证**

如果 uvicorn 还在跑(`./run.sh` 的进程),刷新 `http://localhost:8000/`(或 LAN URL)。预期看到:

- 角色被粉色双线圆角相框框住
- 没有蝴蝶结/珍珠(下个 Task 加)
- 角色仍然 idle 上下浮动
- hover 整框 scale 1.05
- 点角色仍能跳进商店

如果 uvicorn 没跑,在另一个终端启动:

```bash
./run.sh
```

- [ ] **Step 1.6: 暂不提交**

Task 2 也改 `avatar.css`,合并成一个 commit。直接进 Task 2。

---

## Task 2: 加珍珠 + 像素蝴蝶结的 CSS

**Files:**
- Modify: `frontend/css/avatar.css`(在文件中合适位置追加)

- [ ] **Step 2.1: 追加 `.avatar-frame-pearl` 规则**

在 `avatar.css` 的 `@keyframes avatar-idle { ... }` 之后、`/* === 商店 === */` 注释之前,插入:

```css
.avatar-frame-pearl {
  position: absolute;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #fff, #e8c8d4 70%, #b07a8c);
}
.avatar-frame-pearl.p1 { top: -6px; left: -6px; }
.avatar-frame-pearl.p2 { top: -6px; right: -6px; }
.avatar-frame-pearl.p3 { bottom: -6px; left: -6px; }
.avatar-frame-pearl.p4 { bottom: -6px; right: -6px; }
```

- [ ] **Step 2.2: 追加 `.avatar-frame-ribbon` 规则**

紧跟珍珠规则之后:

```css
.avatar-frame-ribbon {
  position: absolute;
  top: -28px;
  left: 50%; transform: translateX(-50%);
  width: 56px; height: 32px;
}
.avatar-frame-ribbon::before,
.avatar-frame-ribbon::after {
  content: '';
  position: absolute; top: 4px;
  width: 22px; height: 22px;
  background: #ff7aa8;
  border: 3px solid #b04068;
  box-shadow: inset -3px -3px 0 #d6588a;
}
.avatar-frame-ribbon::before {
  left: 0;
  clip-path: polygon(0 0, 100% 25%, 100% 75%, 0 100%);
}
.avatar-frame-ribbon::after {
  right: 0;
  clip-path: polygon(0 25%, 100% 0, 100% 100%, 0 75%);
}
.avatar-frame-ribbon .knot {
  position: absolute;
  left: 50%; top: 8px;
  transform: translateX(-50%);
  width: 14px; height: 14px;
  background: #ff7aa8;
  border: 3px solid #b04068;
  box-shadow: inset -2px -2px 0 #d6588a;
  z-index: 2;
}
```

- [ ] **Step 2.3: 浏览器人工预检**

刷新页面。CSS 已经就位,但 DOM 还没有 `.avatar-frame-pearl` / `.avatar-frame-ribbon` 节点(Task 3 才加),所以暂时**只能看到粉相框,看不到珍珠和蝴蝶结**。这是预期。

- [ ] **Step 2.4: 暂不提交**

Task 3 改 JS 后一次性 commit。

---

## Task 3: `home-tile.js` 给 tile 加上装饰节点

**Files:**
- Modify: `frontend/js/avatar/home-tile.js`

- [ ] **Step 3.1: 改 `render` 函数**

打开 `frontend/js/avatar/home-tile.js`。当前 `render` 函数:

```js
render(parentEl) {
  parentEl.innerHTML = '';
  const equipped = window.Platform?.playerState?.equipped_cosmetics
    || { head: null, top: null, hand: null, legs: null };
  const tile = el('div', {
    class: 'avatar-home-tile',
    onclick: () => window.Platform?.enterShop?.(),
  });
  tile.innerHTML = window.Avatar.render(equipped);
  const hint = el('div', { class: 'avatar-home-hint' }, '点我换装');
  const wrap = el('div', { class: 'avatar-home-wrap' });
  wrap.appendChild(tile);
  wrap.appendChild(hint);
  parentEl.appendChild(wrap);
},
```

把 `tile.innerHTML = window.Avatar.render(equipped);` 这一行后面紧跟着追加装饰节点。改成:

```js
render(parentEl) {
  parentEl.innerHTML = '';
  const equipped = window.Platform?.playerState?.equipped_cosmetics
    || { head: null, top: null, hand: null, legs: null };
  const tile = el('div', {
    class: 'avatar-home-tile',
    onclick: () => window.Platform?.enterShop?.(),
  });
  tile.innerHTML = window.Avatar.render(equipped);
  // 装饰:像素蝴蝶结 + 四角珍珠
  const ribbon = el('div', { class: 'avatar-frame-ribbon' });
  ribbon.appendChild(el('span', { class: 'knot' }));
  tile.appendChild(ribbon);
  ['p1', 'p2', 'p3', 'p4'].forEach(pos => {
    tile.appendChild(el('span', { class: 'avatar-frame-pearl ' + pos }));
  });
  const hint = el('div', { class: 'avatar-home-hint' }, '点我换装');
  const wrap = el('div', { class: 'avatar-home-wrap' });
  wrap.appendChild(tile);
  wrap.appendChild(hint);
  parentEl.appendChild(wrap);
},
```

- [ ] **Step 3.2: 浏览器人工验证(全)**

强刷 `http://localhost:8000/`(Cmd+Shift+R / Ctrl+F5,绕开 JS/CSS 缓存)。逐项核对:

1. 角色被粉双线圆角相框框住 ✓
2. 顶部蝴蝶结居中,悬在相框上沿之上 ✓
3. 四角各有一颗白珠光小圆 ✓
4. 角色 SVG 仍然 idle 上下浮动(2.4 秒一周期)✓
5. hover 整框 scale 1.05,珍珠和蝴蝶结跟着放大 ✓
6. 点击角色跳进商店,从商店返回主页相框还在 ✓
7. 商店里的角色预览(`.shop-preview-avatar`)样式没变 — 没有粉相框、没有珍珠、不浮动 ✓
8. 缩窄浏览器到 < 600px,布局塌成单列,相框居中显示,没破损 ✓

如果其中任一不符,**停下来调试**,不要提交。

- [ ] **Step 3.3: 提交**

```bash
git add frontend/css/avatar.css frontend/js/avatar/home-tile.js
git commit -m "$(cat <<'EOF'
Replace avatar home frame with pink-lace + pearl + bow style

Spec: docs/superpowers/specs/2026-04-30-girly-avatar-frame-design.md
EOF
)"
```

---

## Task 4: 自动化回归 — catalog drift 测试还过

**Files:**
- 无改动,只是跑测试

- [ ] **Step 4.1: 跑 pytest**

```bash
uv run pytest -q
```

预期:全部通过(47 项或更多)。

如果有红的,**回头排查**(本计划没动后端,理论上不会跑红;若红是因为 frontend 改动撼到了 catalog drift 测试,补回去)。

---

## Self-Review (作者完成于写计划时)

**Spec coverage:**
- 视觉(底色、边框、阴影、蝴蝶结、珍珠) → Task 1.2 + 2.1 + 2.2 ✓
- 尺寸(列宽 300、padding 36×32、border 10 double) → Task 1.1 + 1.2 ✓
- DOM 改动(SVG 后追加 5 个装饰节点) → Task 3.1 ✓
- 验证清单 8 项 → Task 3.2 ✓
- 不动:商店预览/idle/click → 由"不动"的 CSS 选择器隔离保证,Task 3.2 第 6-7 项验证 ✓

**Placeholder scan:** 无 TBD/TODO/省略号。所有 CSS 和 JS 代码都给完整片段。

**Type/name consistency:**
- `.avatar-frame-ribbon` / `.avatar-frame-pearl` / `.knot` / `.p1..p4` 在 spec、Task 2 (CSS)、Task 3 (JS) 三处全部一致 ✓
- 颜色色值 `#ff7aa8` `#b04068` `#d6588a` `#c97f96` `#ffe7ef` `#ffd0e0` `#e8c8d4` `#b07a8c` 跟 spec 完全一致 ✓
