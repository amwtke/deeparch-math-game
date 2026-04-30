# 主页角色相框 — 蕾丝粉花边版

**Date:** 2026-04-30
**Files affected:**
- `frontend/css/avatar.css`
- `frontend/js/avatar/home-tile.js`

## 目标

把首页角色当前的木头方框换成更柔软、更大、更适合女孩子的"蕾丝双线 + 像素蝴蝶结 + 珍珠角"风格相框。

**不变**:角色 SVG (200×400)、点击进商店逻辑、"点我换装"提示文字、idle 上下浮动动画、商店预览样式。

## 视觉设计

| 元素 | 设定 |
|---|---|
| 底色 | 线性渐变 `#ffe7ef → #ffd0e0`(从上到下) |
| 边框 | 10px 玫瑰色双线 `#c97f96`,圆角 12px |
| 阴影 | `0 6px 0 rgba(0, 0, 0, 0.12)` (像素风落地阴影) |
| 顶部蝴蝶结 | CSS 像素风,主色 `#ff7aa8`,描边 `#b04068`,内阴影 `#d6588a`,居中,悬出相框上沿 28px |
| 四角珍珠 | 12px 圆,珠光渐变 `#fff → #e8c8d4 → #b07a8c`,定位在框四角外侧 -6px |
| hover | 整框 `transform: scale(1.05)`(沿用现有规则) |

## 尺寸

| 部分 | 尺寸 |
|---|---|
| 角色 SVG | 200 × 400 (不变) |
| 内边距 | 上下 36px、左右 32px |
| 边框 | 10px 双线 |
| 相框总宽 | 200 + 32×2 + 10×2 = **284px** (原 232px) |
| 相框总高 | 400 + 36×2 + 10×2 = **492px** |

为容纳更宽的相框 + 蝴蝶结悬出空间,左侧角色列从 `260px` 扩到 **`300px`**。

## DOM 改动 (home-tile.js)

当前 `home-tile.js` 把 `Avatar.render(equipped)` 直接 `tile.innerHTML = ...`。改成:先 set innerHTML(SVG),再 append 5 个装饰节点。

最终 DOM:

```html
<div class="avatar-home-tile">
  <svg class="avatar-svg" ...>...</svg>
  <div class="avatar-frame-ribbon"><span class="knot"></span></div>
  <span class="avatar-frame-pearl p1"></span>
  <span class="avatar-frame-pearl p2"></span>
  <span class="avatar-frame-pearl p3"></span>
  <span class="avatar-frame-pearl p4"></span>
</div>
```

注意:装饰元素 z-index/绝对定位,不会遮挡角色 SVG 主体(SVG 是相框内的正常文档流元素,装饰是 `position: absolute` 相对相框定位)。

## CSS 改动 (avatar.css)

**1. 列宽** — 修改现有 `.platform-home.with-avatar`:

```css
.platform-home.with-avatar {
  grid-template-columns: 300px 1fr;  /* was: 260px 1fr */
}
```

**2. 相框** — 替换现有 `.avatar-home-tile` 规则块:

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
.avatar-home-tile:hover { transform: scale(1.05); }
```

**3. 珍珠** — 新增:

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

**4. 蝴蝶结** — 新增:

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

**保留不动**:
- `.avatar-home-tile .avatar-svg { width:200px; height:400px; ... animation: avatar-idle 2.4s ... }`
- `@keyframes avatar-idle { ... }`

**删除**:
- 旧木头边 4 行 (`border-top/left/right/bottom: 8px solid ...`)
- 旧的 `padding: 8px`、旧 `background: linear-gradient(...rgba(176,224,230...))`、旧 `box-shadow: inset 0 0 0 3px ..., 6px 6px 0 ...`

## 验证清单

1. 浏览器打开 `/`,角色被粉花边相框框住
2. 顶部蝴蝶结居中悬在相框上沿之上
3. 四角珍珠位置贴在相框四个外角
4. 角色 SVG 仍 idle 上下浮动 (2.4s 周期)
5. hover 整框 scale 1.05
6. 点角色仍跳进商店 (`window.Platform.enterShop()`)
7. 商店预览页 (`shop-preview-avatar`) 不受影响,样式不变
8. 窄屏 (<600px) 不破布局:列改成单列,相框居中

## 风险 / 边角情况

- **窄屏 (<600px)**: 现有 `@media (max-width: 600px) { .platform-home.with-avatar { grid-template-columns: 1fr; } }` 不变。粉相框比原来宽 52px,在 1fr 单列下仍然 fits(屏幕宽 > 284 即可,iPhone SE 约 320 也 OK)。
- **shop.js 的 `.avatar-svg`**: 商店预览选择器是 `.shop-preview-avatar .avatar-svg`,跟 `.avatar-home-tile .avatar-svg` 不冲突,idle 动画只作用主页 tile。
- **clip-path 浏览器支持**: 现代浏览器都支持。如果未来要在很老旧设备运行,蝴蝶结的两瓣会变成正方形(降级,不致命)。

## 不在范围

- 不动其他屏幕(商店、家长仪表盘、子游戏)的视觉
- 不改 `Avatar.render` SVG 内容本身
- 不加新装饰元素的可配置(只一种风格)
- 不做"换相框"功能(后续若要可单独立项)
