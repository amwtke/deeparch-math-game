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
  window.Cosmetics = {};
})();
