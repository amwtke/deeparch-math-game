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

  // === 钻石矿纹理 (16×16 像素图案) ===
  // 字符 → CSS class .ck-px-{char}:
  //   1/2/3/4 = 灰石阶梯(暗→亮);A/B/C = 钻石青绿(暗→亮);D = 白色高光
  // 每行严格 16 字符,共 16 行。
  // 5 个钻石簇分布:上中、右中、左中、右下、下中,加几个零星亮点。
  const ORE_PIXELS = [
    '2321234322122312',
    '3212344432123221',
    '2231422B21321232',
    '132231BCB1223212',
    '2212121B12122132',
    '3221D21212DB1211',
    '1231421221BC2112',
    '21BB212422131213',
    '31BC421421212121',
    '124B1221232D2212',
    '2311212322222231',
    '1223D212BCC22122',
    '212441212B222321',
    '321212BC22212123',
    '12321BB2212D4212',
    '2123244312124121',
  ];

  function renderOre() {
    // 一整块像素风钻石矿。`oreRemaining` 由 game logic 跟踪,
    // strike 时动态生成飞出的小方块(不再预渲染 N 个 cube)。
    const ore = el('div', { class: 'ck-ore', id: 'ck-ore' });
    const grid = el('div', { class: 'ck-ore-grid' });
    for (const row of ORE_PIXELS) {
      for (const ch of row) {
        grid.appendChild(el('div', { class: 'ck-px ck-px-' + ch }));
      }
    }
    ore.appendChild(grid);
    ore.appendChild(el('div', { class: 'ck-ore-label', id: 'ck-ore-label' },
      String(oreRemaining)));
    return ore;
  }

  function renderHammer() {
    // 像素风锤子:头(石) + 柄(木),两个 div 拼出来,不用 emoji。
    const hammer = el('div', { class: 'ck-hammer', id: 'ck-hammer' });
    hammer.appendChild(el('div', { class: 'ck-hammer-head' }));
    hammer.appendChild(el('div', { class: 'ck-hammer-handle' }));
    return hammer;
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
    const oreWrap = el('div', { style: 'position:relative;' });
    oreWrap.appendChild(renderOre());
    oreWrap.appendChild(renderHammer());
    oreArea.appendChild(oreWrap);
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
