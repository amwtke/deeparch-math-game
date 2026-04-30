// frontend/js/avatar/avatar.js
// === Alex 角色 SVG 渲染器 ===
// 统一在这里管:基底层(裸 Alex 皮肤+发) + 默认套装 + 装扮叠加。
// 所有 cosmetic.renderOnAvatar() 假设父 SVG viewBox 是 192x384,
// 各槽位锚点见 docs/superpowers/specs/2026-04-30-avatar-cosmetics-design.md。
//
// 渲染顺序: BASE → DEFAULT_TOP(若无 top cosmetic) → DEFAULT_LEGS(若无 legs)
//          → top → legs → hand → head (head 永远最后,在最上)

(function () {
  // 基底:头/发/脸/裸皮肤躯干、四肢、手、脚 (永远画)
  const BASE = `
    <!-- Hair top -->
    <rect x="36" y="0" width="120" height="24" fill="#9a3a18"/>
    <rect x="36" y="0" width="120" height="6" fill="#c75020"/>
    <!-- Face -->
    <rect x="60" y="24" width="72" height="72" fill="#e6b890"/>
    <!-- Side bangs -->
    <rect x="36" y="24" width="24" height="60" fill="#9a3a18"/>
    <rect x="132" y="24" width="24" height="60" fill="#9a3a18"/>
    <rect x="60" y="24" width="72" height="12" fill="#a84020"/>
    <!-- Eyebrows -->
    <rect x="66" y="42" width="18" height="6" fill="#7a2818"/>
    <rect x="108" y="42" width="18" height="6" fill="#7a2818"/>
    <!-- Eye whites -->
    <rect x="66" y="48" width="18" height="12" fill="#fff"/>
    <rect x="108" y="48" width="18" height="12" fill="#fff"/>
    <!-- Pupils (green) -->
    <rect x="72" y="48" width="6" height="12" fill="#3a8a3a"/>
    <rect x="114" y="48" width="6" height="12" fill="#3a8a3a"/>
    <!-- Nose -->
    <rect x="90" y="66" width="12" height="6" fill="#c89570"/>
    <!-- Mouth -->
    <rect x="78" y="78" width="36" height="6" fill="#a84030"/>
    <rect x="84" y="84" width="24" height="6" fill="#7a2820"/>
    <!-- Hair flowing -->
    <rect x="24" y="84" width="36" height="60" fill="#9a3a18"/>
    <rect x="132" y="84" width="36" height="60" fill="#9a3a18"/>
    <rect x="24" y="84" width="6" height="60" fill="#7a2818"/>
    <rect x="162" y="84" width="6" height="60" fill="#7a2818"/>
    <!-- Neck -->
    <rect x="78" y="96" width="36" height="12" fill="#c89570"/>
    <!-- Bare torso (skin, behind shirt) -->
    <rect x="48" y="108" width="96" height="132" fill="#e6b890"/>
    <!-- Bare arms (skin all the way) -->
    <rect x="12" y="108" width="36" height="120" fill="#e6b890"/>
    <rect x="12" y="108" width="6" height="120" fill="#f0c8a0"/>
    <rect x="42" y="108" width="6" height="120" fill="#c89570"/>
    <rect x="144" y="108" width="36" height="120" fill="#e6b890"/>
    <rect x="144" y="108" width="6" height="120" fill="#f0c8a0"/>
    <rect x="174" y="108" width="6" height="120" fill="#c89570"/>
    <!-- Hands -->
    <rect x="12" y="222" width="36" height="18" fill="#c89570"/>
    <rect x="144" y="222" width="36" height="18" fill="#c89570"/>
    <!-- Bare legs (skin, behind pants) -->
    <rect x="48" y="240" width="48" height="108" fill="#e6b890"/>
    <rect x="48" y="240" width="6" height="108" fill="#f0c8a0"/>
    <rect x="96" y="240" width="48" height="108" fill="#e6b890"/>
    <rect x="138" y="240" width="6" height="108" fill="#c89570"/>
    <!-- Bare feet -->
    <rect x="48" y="348" width="48" height="24" fill="#e6b890"/>
    <rect x="96" y="348" width="48" height="24" fill="#e6b890"/>
  `;

  // 默认 T 恤 + 短袖
  const DEFAULT_TOP = `
    <rect x="48" y="108" width="96" height="132" fill="#5a9c2a"/>
    <rect x="48" y="108" width="12" height="132" fill="#7ac850"/>
    <rect x="132" y="108" width="12" height="132" fill="#3a7820"/>
    <rect x="48" y="234" width="96" height="6" fill="#3a6a18"/>
    <rect x="12" y="108" width="36" height="60" fill="#5a9c2a"/>
    <rect x="12" y="108" width="6" height="60" fill="#7ac850"/>
    <rect x="42" y="108" width="6" height="60" fill="#3a7820"/>
    <rect x="144" y="108" width="36" height="60" fill="#5a9c2a"/>
    <rect x="144" y="108" width="6" height="60" fill="#7ac850"/>
    <rect x="174" y="108" width="6" height="60" fill="#3a7820"/>
  `;

  // 默认棕裤 + 灰鞋
  const DEFAULT_LEGS = `
    <rect x="48" y="240" width="48" height="108" fill="#7a4828"/>
    <rect x="48" y="240" width="6" height="108" fill="#a06038"/>
    <rect x="90" y="240" width="6" height="108" fill="#5a3018"/>
    <rect x="96" y="240" width="48" height="108" fill="#7a4828"/>
    <rect x="96" y="240" width="6" height="108" fill="#a06038"/>
    <rect x="138" y="240" width="6" height="108" fill="#5a3018"/>
    <rect x="48" y="348" width="48" height="24" fill="#3a3a3a"/>
    <rect x="96" y="348" width="48" height="24" fill="#3a3a3a"/>
    <rect x="48" y="348" width="6" height="24" fill="#5a5a5a"/>
    <rect x="96" y="348" width="6" height="24" fill="#5a5a5a"/>
  `;

  function renderCosmetic(slot, equipped) {
    const id = equipped[slot];
    if (!id) return '';
    const c = (window.Cosmetics || {})[id];
    if (!c) {
      console.warn('avatar: missing cosmetic in catalog', id);
      return '';
    }
    return c.renderOnAvatar();
  }

  window.Avatar = {
    /**
     * 返回完整的 SVG 字符串。equipped 是 {head, top, hand, legs} 对象。
     */
    render(equipped) {
      equipped = equipped || { head: null, top: null, hand: null, legs: null };
      return `
<svg viewBox="0 0 192 384" shape-rendering="crispEdges" class="avatar-svg" xmlns="http://www.w3.org/2000/svg">
  ${BASE}
  ${equipped.top ? '' : DEFAULT_TOP}
  ${equipped.legs ? '' : DEFAULT_LEGS}
  ${renderCosmetic('top', equipped)}
  ${renderCosmetic('legs', equipped)}
  ${renderCosmetic('hand', equipped)}
  ${renderCosmetic('head', equipped)}
</svg>`;
    },
  };
})();
