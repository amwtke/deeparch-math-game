// frontend/js/avatar/catalog.js
// === 装扮目录 ===
// 每件装扮:slot/name/price + renderIcon (48x48 独立 SVG) + renderOnAvatar (192x384 内的 <g>)
// 后端 backend/cosmetics.py 必须保持 id/slot/price 同步。

(function () {
  window.CosmeticSlots = ['head', 'top', 'hand', 'legs'];
  window.CosmeticSlotNames = {
    head: '头',
    top: '上衣',
    hand: '手持',
    legs: '裤鞋',
  };

  // Tasks 10-13 will populate this object
  window.Cosmetics = {
    bunny_ears: {
      slot: 'head', name: '兔耳头箍', price: 50,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="6" y="30" width="36" height="6" fill="#ff80a0"/>
  <rect x="6" y="30" width="36" height="3" fill="#ffb0c8"/>
  <rect x="6" y="0" width="9" height="33" fill="#fff"/>
  <rect x="33" y="0" width="9" height="33" fill="#fff"/>
  <rect x="9" y="6" width="3" height="21" fill="#ffb0c8"/>
  <rect x="36" y="6" width="3" height="21" fill="#ffb0c8"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-head">
  <rect x="48" y="0" width="96" height="6" fill="#ff80a0"/>
  <rect x="54" y="-30" width="12" height="30" fill="#fff"/>
  <rect x="57" y="-21" width="6" height="18" fill="#ffb0c8"/>
  <rect x="126" y="-30" width="12" height="30" fill="#fff"/>
  <rect x="129" y="-21" width="6" height="18" fill="#ffb0c8"/>
</g>`,
    },

    straw_hat_flower: {
      slot: 'head', name: '草帽 + 花', price: 60,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="3" y="24" width="42" height="9" fill="#e8c068"/>
  <rect x="3" y="24" width="42" height="3" fill="#f0d088"/>
  <rect x="3" y="30" width="42" height="3" fill="#a88838"/>
  <rect x="12" y="6" width="24" height="21" fill="#e8c068"/>
  <rect x="12" y="6" width="24" height="3" fill="#f0d088"/>
  <rect x="12" y="21" width="24" height="6" fill="#c8a050"/>
  <rect x="18" y="18" width="12" height="3" fill="#ff80a0"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-head">
  <rect x="24" y="0" width="144" height="9" fill="#e8c068"/>
  <rect x="24" y="0" width="144" height="3" fill="#f0d088"/>
  <rect x="24" y="6" width="144" height="3" fill="#a88838"/>
  <rect x="60" y="-24" width="72" height="24" fill="#e8c068"/>
  <rect x="60" y="-24" width="72" height="6" fill="#f0d088"/>
  <rect x="60" y="-6" width="72" height="6" fill="#c8a050"/>
  <rect x="84" y="-12" width="24" height="6" fill="#ff80a0"/>
  <rect x="90" y="-15" width="12" height="3" fill="#ffd700"/>
</g>`,
    },

    butterfly_bow: {
      slot: 'head', name: '蝴蝶结', price: 70,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="6" y="33" width="36" height="3" fill="#a04060"/>
  <rect x="3" y="15" width="18" height="18" fill="#ff60a0"/>
  <rect x="3" y="15" width="18" height="6" fill="#ffa0c8"/>
  <rect x="27" y="15" width="18" height="18" fill="#ff60a0"/>
  <rect x="27" y="15" width="18" height="6" fill="#ffa0c8"/>
  <rect x="18" y="18" width="12" height="15" fill="#c84080"/>
  <rect x="18" y="18" width="12" height="3" fill="#e060a0"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-head">
  <rect x="48" y="0" width="96" height="3" fill="#a04060"/>
  <rect x="48" y="-15" width="30" height="18" fill="#ff60a0"/>
  <rect x="48" y="-15" width="30" height="6" fill="#ffa0c8"/>
  <rect x="114" y="-15" width="30" height="18" fill="#ff60a0"/>
  <rect x="114" y="-15" width="30" height="6" fill="#ffa0c8"/>
  <rect x="84" y="-12" width="24" height="15" fill="#c84080"/>
  <rect x="84" y="-12" width="24" height="3" fill="#e060a0"/>
</g>`,
    },

    miner_helmet: {
      slot: 'head', name: '矿工头灯', price: 80,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="6" y="12" width="36" height="24" fill="#ffd040"/>
  <rect x="6" y="12" width="36" height="6" fill="#fff080"/>
  <rect x="6" y="30" width="36" height="6" fill="#a88010"/>
  <rect x="18" y="6" width="12" height="9" fill="#fff"/>
  <rect x="18" y="6" width="12" height="3" fill="#ffe080"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-head">
  <rect x="48" y="-12" width="96" height="24" fill="#ffd040"/>
  <rect x="48" y="-12" width="96" height="6" fill="#fff080"/>
  <rect x="48" y="6" width="96" height="6" fill="#a88010"/>
  <rect x="84" y="-21" width="24" height="12" fill="#fff"/>
  <rect x="84" y="-21" width="24" height="3" fill="#ffe080"/>
  <rect x="48" y="12" width="96" height="3" fill="#a08000"/>
</g>`,
    },

    princess_crown: {
      slot: 'head', name: '公主王冠', price: 120,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="6" y="18" width="36" height="6" fill="#ffd700"/>
  <rect x="6" y="18" width="36" height="3" fill="#fff080"/>
  <rect x="6" y="6" width="6" height="18" fill="#ffd700"/>
  <rect x="21" y="0" width="6" height="24" fill="#ffd700"/>
  <rect x="36" y="6" width="6" height="18" fill="#ffd700"/>
  <rect x="21" y="0" width="3" height="6" fill="#fff080"/>
  <rect x="9" y="12" width="6" height="6" fill="#ff4080"/>
  <rect x="33" y="12" width="6" height="6" fill="#ff4080"/>
  <rect x="22" y="6" width="4" height="4" fill="#3aa0ff"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-head">
  <rect x="48" y="-6" width="96" height="12" fill="#ffd700"/>
  <rect x="48" y="-6" width="96" height="3" fill="#fff080"/>
  <rect x="60" y="-18" width="6" height="12" fill="#ffd700"/>
  <rect x="93" y="-24" width="6" height="18" fill="#ffd700"/>
  <rect x="126" y="-18" width="6" height="12" fill="#ffd700"/>
  <rect x="63" y="-3" width="6" height="6" fill="#ff4080"/>
  <rect x="123" y="-3" width="6" height="6" fill="#ff4080"/>
  <rect x="93" y="-12" width="6" height="6" fill="#3aa0ff"/>
</g>`,
    },
  };
})();
