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

    explorer_vest: {
      slot: 'top', name: '探险家背心', price: 100,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="12" y="9" width="24" height="33" fill="#a87838"/>
  <rect x="12" y="9" width="6" height="33" fill="#c89858"/>
  <rect x="30" y="9" width="6" height="33" fill="#785828"/>
  <rect x="20" y="15" width="8" height="3" fill="#ffd700"/>
  <rect x="22" y="21" width="4" height="4" fill="#3a3a3a"/>
  <rect x="22" y="30" width="4" height="4" fill="#3a3a3a"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-top">
  <!-- 背心(无袖,胳膊裸露) -->
  <rect x="48" y="108" width="96" height="132" fill="#a87838"/>
  <rect x="48" y="108" width="12" height="132" fill="#c89858"/>
  <rect x="132" y="108" width="12" height="132" fill="#785828"/>
  <!-- 金边领口 -->
  <rect x="78" y="108" width="36" height="6" fill="#ffd700"/>
  <!-- 三颗扣子 -->
  <rect x="92" y="138" width="8" height="4" fill="#ffd700"/>
  <rect x="92" y="170" width="8" height="4" fill="#ffd700"/>
  <rect x="92" y="202" width="8" height="4" fill="#ffd700"/>
  <!-- 口袋 -->
  <rect x="60" y="180" width="24" height="30" fill="#785828"/>
  <rect x="62" y="183" width="20" height="3" fill="#a87838"/>
</g>`,
    },

    pirate_coat: {
      slot: 'top', name: '海盗船长服', price: 180,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="9" y="9" width="30" height="33" fill="#3a2a4a"/>
  <rect x="9" y="9" width="6" height="33" fill="#5a4a6a"/>
  <rect x="33" y="9" width="6" height="33" fill="#1a0a2a"/>
  <rect x="22" y="15" width="4" height="20" fill="#ffd700"/>
  <rect x="18" y="9" width="12" height="6" fill="#fff"/>
  <rect x="6" y="9" width="36" height="3" fill="#5a3018"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-top">
  <!-- 长外套主体 -->
  <rect x="48" y="108" width="96" height="132" fill="#3a2a4a"/>
  <rect x="48" y="108" width="12" height="132" fill="#5a4a6a"/>
  <rect x="132" y="108" width="12" height="132" fill="#1a0a2a"/>
  <!-- 长袖 (覆盖胳膊全长) -->
  <rect x="12" y="108" width="36" height="120" fill="#3a2a4a"/>
  <rect x="12" y="108" width="6" height="120" fill="#5a4a6a"/>
  <rect x="42" y="108" width="6" height="120" fill="#1a0a2a"/>
  <rect x="144" y="108" width="36" height="120" fill="#3a2a4a"/>
  <rect x="144" y="108" width="6" height="120" fill="#5a4a6a"/>
  <rect x="174" y="108" width="6" height="120" fill="#1a0a2a"/>
  <!-- 白领巾 -->
  <rect x="78" y="108" width="36" height="12" fill="#fff"/>
  <!-- 棕领边 -->
  <rect x="48" y="108" width="96" height="6" fill="#5a3018"/>
  <!-- 金扣子 (中间一列) -->
  <rect x="92" y="135" width="8" height="6" fill="#ffd700"/>
  <rect x="92" y="159" width="8" height="6" fill="#ffd700"/>
  <rect x="92" y="183" width="8" height="6" fill="#ffd700"/>
  <rect x="92" y="207" width="8" height="6" fill="#ffd700"/>
  <!-- 袖口金边 -->
  <rect x="12" y="222" width="36" height="6" fill="#ffd700"/>
  <rect x="144" y="222" width="36" height="6" fill="#ffd700"/>
</g>`,
    },

    pink_princess_dress: {
      slot: 'top', name: '粉色公主裙', price: 200,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="12" y="9" width="24" height="9" fill="#ff80b0"/>
  <rect x="12" y="9" width="24" height="3" fill="#ffb0d0"/>
  <rect x="9" y="18" width="30" height="24" fill="#ff80b0"/>
  <rect x="9" y="18" width="6" height="24" fill="#ffb0d0"/>
  <rect x="33" y="18" width="6" height="24" fill="#d04080"/>
  <rect x="9" y="36" width="30" height="6" fill="#ffd700"/>
  <rect x="21" y="15" width="6" height="6" fill="#ffd700"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-top">
  <!-- 上身 -->
  <rect x="48" y="108" width="96" height="48" fill="#ff80b0"/>
  <rect x="48" y="108" width="12" height="48" fill="#ffb0d0"/>
  <rect x="132" y="108" width="12" height="48" fill="#d04080"/>
  <!-- 蓬蓬短袖 (左) -->
  <rect x="36" y="108" width="24" height="24" fill="#ff80b0"/>
  <rect x="36" y="108" width="6" height="24" fill="#ffb0d0"/>
  <!-- 蓬蓬短袖 (右) -->
  <rect x="132" y="108" width="24" height="24" fill="#ff80b0"/>
  <rect x="150" y="108" width="6" height="24" fill="#d04080"/>
  <!-- 裙摆 -->
  <rect x="36" y="156" width="120" height="84" fill="#ff80b0"/>
  <rect x="36" y="156" width="6" height="84" fill="#ffb0d0"/>
  <rect x="150" y="156" width="6" height="84" fill="#d04080"/>
  <!-- 金腰带 -->
  <rect x="36" y="156" width="120" height="6" fill="#ffd700"/>
  <!-- 胸前蝴蝶结 -->
  <rect x="84" y="120" width="24" height="9" fill="#ffd700"/>
  <rect x="93" y="123" width="6" height="6" fill="#c89000"/>
</g>`,
    },

    mage_robe: {
      slot: 'top', name: '法师紫袍', price: 250,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="12" y="9" width="24" height="33" fill="#7030c8"/>
  <rect x="12" y="9" width="6" height="33" fill="#9050e8"/>
  <rect x="30" y="9" width="6" height="33" fill="#5020a0"/>
  <rect x="18" y="18" width="3" height="3" fill="#ffd700"/>
  <rect x="27" y="18" width="3" height="3" fill="#ffd700"/>
  <rect x="22" y="27" width="4" height="4" fill="#ffd700"/>
  <rect x="20" y="9" width="8" height="3" fill="#ffd700"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-top">
  <!-- 长袍主体 -->
  <rect x="48" y="108" width="96" height="132" fill="#7030c8"/>
  <rect x="48" y="108" width="12" height="132" fill="#9050e8"/>
  <rect x="132" y="108" width="12" height="132" fill="#5020a0"/>
  <!-- 长袖 -->
  <rect x="12" y="108" width="36" height="120" fill="#7030c8"/>
  <rect x="12" y="108" width="6" height="120" fill="#9050e8"/>
  <rect x="42" y="108" width="6" height="120" fill="#5020a0"/>
  <rect x="144" y="108" width="36" height="120" fill="#7030c8"/>
  <rect x="144" y="108" width="6" height="120" fill="#9050e8"/>
  <rect x="174" y="108" width="6" height="120" fill="#5020a0"/>
  <!-- 金色领边 -->
  <rect x="78" y="108" width="36" height="9" fill="#ffd700"/>
  <!-- 金色星星点缀 -->
  <rect x="66" y="138" width="6" height="6" fill="#ffd700"/>
  <rect x="116" y="156" width="6" height="6" fill="#ffd700"/>
  <rect x="78" y="186" width="6" height="6" fill="#ffd700"/>
  <rect x="108" y="210" width="6" height="6" fill="#ffd700"/>
  <!-- 胸口大星 -->
  <rect x="90" y="168" width="12" height="12" fill="#ffd700"/>
  <rect x="93" y="171" width="6" height="6" fill="#fff080"/>
</g>`,
    },

    diamond_armor: {
      slot: 'top', name: '钻石盔甲', price: 350,
      renderIcon: () => `
<svg viewBox="0 0 48 48" shape-rendering="crispEdges">
  <rect x="12" y="9" width="24" height="33" fill="#80e0e8"/>
  <rect x="12" y="9" width="6" height="33" fill="#b0f0f8"/>
  <rect x="30" y="9" width="6" height="33" fill="#5098a0"/>
  <rect x="15" y="15" width="6" height="6" fill="#fff"/>
  <rect x="27" y="15" width="6" height="6" fill="#fff"/>
  <rect x="20" y="27" width="8" height="6" fill="#5098a0"/>
</svg>`,
      renderOnAvatar: () => `
<g class="cm-top">
  <!-- 胸甲 -->
  <rect x="48" y="108" width="96" height="132" fill="#80e0e8"/>
  <rect x="48" y="108" width="12" height="132" fill="#b0f0f8"/>
  <rect x="132" y="108" width="12" height="132" fill="#5098a0"/>
  <!-- 肩甲 (覆盖胳膊上半) -->
  <rect x="12" y="108" width="36" height="60" fill="#80e0e8"/>
  <rect x="12" y="108" width="6" height="60" fill="#b0f0f8"/>
  <rect x="42" y="108" width="6" height="60" fill="#5098a0"/>
  <rect x="144" y="108" width="36" height="60" fill="#80e0e8"/>
  <rect x="144" y="108" width="6" height="60" fill="#b0f0f8"/>
  <rect x="174" y="108" width="6" height="60" fill="#5098a0"/>
  <!-- 胸口高光 -->
  <rect x="60" y="120" width="12" height="12" fill="#fff"/>
  <rect x="120" y="120" width="12" height="12" fill="#fff"/>
  <!-- 胸前钻石装饰 -->
  <rect x="84" y="156" width="24" height="24" fill="#5098a0"/>
  <rect x="90" y="162" width="12" height="12" fill="#80e0e8"/>
  <rect x="93" y="165" width="6" height="6" fill="#fff"/>
  <!-- 腰甲分割线 -->
  <rect x="48" y="216" width="96" height="6" fill="#5098a0"/>
</g>`,
    },
  };
})();
