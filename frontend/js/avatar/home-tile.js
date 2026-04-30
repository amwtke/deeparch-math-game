// frontend/js/avatar/home-tile.js
// === 主页角色展示位 ===
// 把 Avatar.render(equipped) 塞进容器,整个容器可点击进商店。

(function () {
  if (!window.Render || !window.Avatar) {
    console.error('home-tile.js: Render and Avatar must load first');
    window.AvatarHomeTile = {
      render(parentEl) {
        if (parentEl) {
          parentEl.innerHTML = '<div style="padding:16px;color:#888">角色加载中...</div>';
        }
      },
    };
    return;
  }
  const { el } = window.Render;

  window.AvatarHomeTile = {
    /**
     * 把角色展示位渲染到 parentEl 内。会清空 parentEl 现有内容。
     */
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
  };
})();
