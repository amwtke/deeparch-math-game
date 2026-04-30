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
    const wrap = el('div', { class: 'platform-home with-avatar' });

    // 左侧角色位
    const avatarSlot = el('div', { class: 'platform-avatar-slot' });
    if (window.AvatarHomeTile) {
      window.AvatarHomeTile.render(avatarSlot);
    }
    wrap.appendChild(avatarSlot);

    // 右侧:原有标题 + 游戏网格 + 家长链接
    const right = el('div', { class: 'platform-home-right' });
    right.appendChild(el('div', { class: 'platform-title' }, '⛏ 数学历险 ⛏'));
    right.appendChild(el('div', { class: 'platform-subtitle' }, '挑一个游戏开始冒险'));
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
    right.appendChild(grid);
    right.appendChild(el('a', { class: 'parent-link', href: '/dashboard' },
      '👨‍👩‍👧 家长仪表盘'));

    wrap.appendChild(right);
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
      if (currentGameId) {
        console.error('enterGame called while another game is active:', currentGameId);
        return;
      }
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

    enterShop() {
      if (currentGameId) {
        console.error('enterShop: a game is already active');
        return;
      }
      if (!window.AvatarShop) {
        console.error('enterShop: AvatarShop missing');
        return;
      }
      currentGameId = '__shop__';
      homeEl.classList.add('hidden');
      gameHostEl.classList.add('active');
      gameHostEl.innerHTML = '';
      window.AvatarShop.start(gameHostEl);
    },

    async exit() {
      if (!currentGameId) return;
      if (currentGameId === '__shop__') {
        try { window.AvatarShop?.exit(); } catch (e) { console.error('shop exit error', e); }
      } else {
        const manifest = (window.Games || []).find(g => g.id === currentGameId);
        const mod = manifest ? window[manifest.module] : null;
        if (mod && typeof mod.exit === 'function') {
          try { mod.exit(); } catch (e) { console.error('game exit error', e); }
        }
      }
      currentGameId = null;
      gameHostEl.innerHTML = '';
      gameHostEl.classList.remove('active');
      homeEl.classList.remove('hidden');
      await this.refreshTopbar();
      // 同时把主页角色重新画一遍(装备可能变了)
      renderHome();
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
