// === 勋章定义(全局共享)===
// 跨游戏复用,index.html 在每个游戏 game.js 之前加载。
// 后端 backend/db.py 的 BADGE_KEYS 必须与这里的 key 列表保持同步。

window.BadgeDefs = [
  // cou-shi 凑十大冒险用
  { key: 'first_correct',     icon: '⭐', name: '初出茅庐' },
  { key: 'combo_5',           icon: '🔥', name: '连击5' },
  { key: 'combo_10',          icon: '⚡', name: '连击10' },
  { key: 'daily_done',        icon: '📅', name: '完成每日' },
  { key: 'diamond_master',    icon: '💎', name: '钻石大师' },
  { key: 'week_warrior',      icon: '🏆', name: '一周勇士' },
  { key: 'no_hint',           icon: '🧠', name: '独立思考' },
  { key: 'speed_demon',       icon: '🚀', name: '闪电速答' },
  // chai-kuang 矿石分解大师用
  { key: 'decompose_50',      icon: '🔨', name: '矿工大师' },
  { key: 'decompose_streak_5', icon: '🎯', name: '分解连击' },
  { key: 'compose_perfect_10', icon: '💯', name: '看图小神童' },
];

window.BadgeDefs.byKey = function (k) {
  return window.BadgeDefs.find(b => b.key === k);
};
