// === DOM 渲染辅助函数 ===
// 公共工具箱。新功能渲染先看这里有没有可复用的。

/**
 * 创建 DOM 元素的简易封装
 * @param {string} tag
 * @param {object|null} attrs - {class, onclick, html, style, id, ...}
 * @param {string|Element|Element[]|null} children
 */
function el(tag, attrs, children) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null) continue;
      if (k === 'class') e.className = v;
      else if (k === 'onclick') e.onclick = v;
      else if (k === 'html') e.innerHTML = v;
      else e.setAttribute(k, v);
    }
  }
  if (children != null) {
    if (typeof children === 'string') e.textContent = children;
    else if (Array.isArray(children)) children.forEach(c => c && e.appendChild(c));
    else e.appendChild(children);
  }
  return e;
}

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

/**
 * 渲染一个数字对应的方块阵 (例如 28 = 2条 + 8块)
 */
function renderNumberAsBlocks(num, color, label) {
  const zone = el('div', { class: 'block-zone' });
  if (label) zone.appendChild(el('div', { class: 'zone-label' }, label + ' ' + num));
  const tens = Math.floor(num / 10);
  const ones = num % 10;
  const blocks = el('div', { class: 'blocks-area' });
  for (let i = 0; i < tens; i++) blocks.appendChild(renderBar(color, 10));
  if (ones > 0) {
    if (tens > 0) blocks.appendChild(el('div', { style: 'width:100%;height:4px;' }));
    blocks.appendChild(renderSingles(color, ones));
  }
  zone.appendChild(blocks);
  return zone;
}

/**
 * 进度条 (绿色填充 + 居中文字)
 */
function renderProgressBar(percent, text) {
  const bar = el('div', { class: 'progress-bar' });
  const fill = el('div', { class: 'progress-fill' });
  fill.style.width = Math.min(100, percent) + '%';
  bar.appendChild(fill);
  if (text) bar.appendChild(el('div', { class: 'progress-text' }, text));
  return bar;
}

/**
 * 统计卡片 (用于通关画面、勋章墙)
 */
function makeStatCard(label, value) {
  const c = el('div', { class: 'stat-card' });
  c.appendChild(el('div', { class: 'label' }, label));
  c.appendChild(el('div', { class: 'value' }, String(value)));
  return c;
}

window.Render = {
  el, renderBar, renderSingles, renderNumberAsBlocks,
  renderProgressBar, makeStatCard,
};
