// === 矿石分解大师(chai-kuang)主控制器 ===
// 屏幕状态机 + 题目流程。挂 window.ChaiKuang = { start, exit }

(function () {
  const R = window.Render;
  if (!R) throw new Error('chai-kuang/game.js: render.js 必须先加载');
  const { el } = R;

  let hostElement = null;
  let listenerCleanups = [];

  function getHost() {
    if (!hostElement) throw new Error('ChaiKuang 未初始化');
    return hostElement;
  }

  // 临时占位屏,后续 Task 替换
  function renderPlaceholder() {
    const screen = el('div', { class: 'screen' });
    screen.appendChild(el('div', { class: 'screen-title' }, '🔨 矿石分解大师'));
    screen.appendChild(el('div', {
      style: 'padding:20px;text-align:center;',
    }, '游戏开发中...'));
    screen.appendChild(el('button', {
      class: 'menu-btn', onclick: () => Platform.exit(),
    }, '🏠 我玩够了'));
    return screen;
  }

  function render() {
    const app = getHost();
    app.innerHTML = '';
    app.appendChild(renderPlaceholder());
  }

  window.ChaiKuang = {
    start(host) {
      hostElement = host;
      const unlock = () => {
        Audio.unlock();
        document.removeEventListener('click', unlock);
      };
      document.addEventListener('click', unlock, { once: true });
      listenerCleanups.push(() =>
        document.removeEventListener('click', unlock));
      render();
    },
    exit() {
      listenerCleanups.forEach(fn => fn());
      listenerCleanups = [];
      if (hostElement) hostElement.innerHTML = '';
      hostElement = null;
    },
  };
})();
