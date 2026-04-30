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

  // 当前题目状态(本 Task 仅用 currentNumber 演示静态画面,
  // Task 11 起会真正驱动题型与流程)
  let currentNumber = 47;
  let oreRemaining = 47;
  let tensCount = 0;
  let onesCount = 0;

  function renderOre() {
    const ore = el('div', { class: 'ck-ore', id: 'ck-ore' });
    for (let i = 0; i < oreRemaining; i++) {
      ore.appendChild(el('div', { class: 'ck-ore-cube' }));
    }
    ore.appendChild(el('div', { class: 'ck-ore-label', id: 'ck-ore-label' },
      String(oreRemaining)));
    return ore;
  }

  function renderInventory() {
    const inv = el('div', { class: 'ck-inventory' });

    const tensBin = el('div', { class: 'ck-bin' });
    tensBin.appendChild(el('div', { class: 'ck-bin-label', html:
      '十位<span class="sub">(长条)</span>' }));
    const tensArea = el('div', { class: 'ck-bin-area', id: 'ck-tens-area' });
    for (let i = 0; i < tensCount; i++) {
      tensArea.appendChild(R.renderBar('', 10));
    }
    tensBin.appendChild(tensArea);

    const onesBin = el('div', { class: 'ck-bin' });
    onesBin.appendChild(el('div', { class: 'ck-bin-label', html:
      '个位<span class="sub">(方块)</span>' }));
    const onesArea = el('div', { class: 'ck-bin-area', id: 'ck-ones-area' });
    for (let i = 0; i < onesCount; i++) {
      onesArea.appendChild(makeOneBlock());
    }
    onesBin.appendChild(onesArea);

    inv.appendChild(tensBin);
    inv.appendChild(onesBin);
    return inv;
  }

  function makeOneBlock() {
    // 复用 render.js renderSingles 的样式("single-cube")
    const cube = el('div', { class: 'single-cube' });
    cube.appendChild(el('div', { class: 'cube-label' }, '1'));
    return cube;
  }

  function renderGameScreen() {
    const screen = el('div', { class: 'ck-screen' });
    screen.appendChild(el('button', {
      class: 'ck-exit', onclick: () => Platform.exit(),
    }, '🏠 我玩够了'));

    const oreArea = el('div', { class: 'ck-ore-area' });
    oreArea.appendChild(el('div', { class: 'ck-hammer', id: 'ck-hammer' }, '🔨'));
    oreArea.appendChild(renderOre());
    screen.appendChild(oreArea);

    screen.appendChild(renderInventory());

    // 题目占位区(Task 11 接入)
    screen.appendChild(el('div', { class: 'ck-question' }, '点矿石试试看!'));

    return screen;
  }

  function render() {
    const app = getHost();
    app.innerHTML = '';
    app.appendChild(renderGameScreen());
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
