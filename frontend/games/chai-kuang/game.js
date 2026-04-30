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

  // === 敲矿动画/计时常量 ===
  const HAMMER_DURATION_MS = 280;     // 锤子 strike 动画总时长(与 CSS 对齐)
  const HAMMER_HIT_DELAY_MS = 140;    // 锤子触底的瞬间(动画 50%)
  const FLY_TO_BIN_MS = 380;          // 方块从矿石飞到个位区
  const MERGE_GLOW_MS = 200;          // 凑十时金光闪
  const MERGE_FLY_MS = 400;           // 凑十时 10 个方块飞向十位区合体
  const STRIKE_MIN = 3;
  const STRIKE_MAX = 5;
  const FINISH_THRESHOLD = 7;         // 剩余 ≤ 这个值时一锤敲完

  let isHammering = false;
  let onOreFinished = null;           // 矿石被敲完后的回调(Task 11 注入)

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

  // 每个像素格的 px 大小,跟着 oreRemaining 线性变化:
  // 10 → 11px(矿石 ~176px),99 → 22px(矿石 ~352px)。
  function oreCellPx(n) {
    const t = Math.max(0, Math.min(1, (n - 10) / 89));
    return Math.round(11 + t * 11);
  }

  function renderOre() {
    // 一整块像素风钻石矿。`oreRemaining` 由 game logic 跟踪,
    // strike 时动态生成飞出的小方块(不再预渲染 N 个 cube)。
    const ore = el('div', { class: 'ck-ore', id: 'ck-ore', onclick: strikeOre });
    ore.style.setProperty('--cell', oreCellPx(oreRemaining) + 'px');
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

  // === 锤子像素图(12×16,Minecraft Mace 风格) ===
  // 头部 7 行(0-6)是大锤头,中间 1 行(7)过渡,下 9 行(8-15)是手柄。
  // 字符 → CSS class .ck-px-{char}:
  //   T=透明  K=描边  N=锤头深  M=锤头中  L=锤头浅  W=高光
  //   P=手柄浅紫  U=手柄深紫(绕缠纹)
  const HAMMER_PIXELS = [
    'TTTKKKKKKKTT',
    'TTKKWWLLNKKT',
    'TKKWWLLLNNKK',
    'KKWWLLLNNMNK',
    'KWWLLNNNMMNK',
    'KWLLNNMMMNKK',
    'KKLNNMMNKKKT',
    'TKKNMMKKKTTT',
    'TTKKKKKTTTTT',
    'TTTTKPPKTTTT',
    'TTTTKUPKTTTT',
    'TTTTKPUKTTTT',
    'TTTTKUPKTTTT',
    'TTTTKPUKTTTT',
    'TTTTKUPKTTTT',
    'TTTTKKKKTTTT',
  ];

  function renderHammer() {
    const hammer = el('div', { class: 'ck-hammer', id: 'ck-hammer' });
    const grid = el('div', { class: 'ck-hammer-grid' });
    for (const row of HAMMER_PIXELS) {
      for (const ch of row) {
        grid.appendChild(el('div', { class: 'ck-px ck-px-' + ch }));
      }
    }
    hammer.appendChild(grid);
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

  // ============== 敲矿核心交互 ==============

  function strikeOre() {
    if (isHammering) return;
    if (oreRemaining <= 0) return;
    isHammering = true;

    // 锤子动画 + 矿石抖动 + 音效
    const hammer = document.getElementById('ck-hammer');
    if (hammer) {
      hammer.classList.add('strike');
      setTimeout(() => hammer.classList.remove('strike'), HAMMER_DURATION_MS);
    }
    const ore = document.getElementById('ck-ore');
    if (ore) {
      ore.classList.add('shake');
      setTimeout(() => ore.classList.remove('shake'), 250);
    }
    Audio.hammer();

    // 算这一锤敲多少个方块
    const strikeCount = oreRemaining <= FINISH_THRESHOLD
      ? oreRemaining
      : Math.floor(Math.random() * (STRIKE_MAX - STRIKE_MIN + 1)) + STRIKE_MIN;

    // 等锤子触底再开始飞方块
    setTimeout(() => {
      flyCubesFromOre(strikeCount, () => {
        updateOreVisual();
        checkAutoMerge(() => {
          isHammering = false;
          if (oreRemaining <= 0 && onOreFinished) {
            const cb = onOreFinished;
            onOreFinished = null;
            cb();
          }
        });
      });
    }, HAMMER_HIT_DELAY_MS);
  }

  // 在矿石内部随机位置生成 count 个 .ck-ore-cube,沿弧线飞到个位区。
  // 矿石本身没有"内部小方块"DOM,这些 cube 是动态新建的。
  function flyCubesFromOre(count, done) {
    const ore = document.getElementById('ck-ore');
    const onesArea = document.getElementById('ck-ones-area');
    if (!ore || !onesArea) { oreRemaining -= count; if (done) done(); return; }

    const oreRect = ore.getBoundingClientRect();
    const targetRect = onesArea.getBoundingClientRect();

    let arrived = 0;
    if (count === 0) { if (done) done(); return; }

    for (let i = 0; i < count; i++) {
      // 起点:矿石内部随机一点
      const sx = oreRect.left + Math.random() * (oreRect.width - 24);
      const sy = oreRect.top + Math.random() * (oreRect.height - 24);

      const fly = el('div', { class: 'ck-fly ck-ore-cube' });
      fly.style.position = 'fixed';
      fly.style.left = sx + 'px';
      fly.style.top = sy + 'px';
      document.body.appendChild(fly);

      // 终点:个位区中心,带一点散开
      const tx = targetRect.left + targetRect.width / 2 - sx
                 + (Math.random() * 60 - 30);
      const ty = targetRect.top + targetRect.height / 2 - sy
                 + (Math.random() * 30 - 15);

      // 错峰起飞,看起来像一连串小爆炸
      const stagger = i * 30;

      // 计 oreRemaining:此次飞出后剩余
      oreRemaining--;

      requestAnimationFrame(() => {
        setTimeout(() => {
          fly.style.transition =
            'transform ' + FLY_TO_BIN_MS + 'ms cubic-bezier(.4,.0,.6,1.4)';
          fly.style.transform = 'translate(' + tx + 'px,' + ty + 'px)';
        }, stagger);
      });

      setTimeout(() => {
        fly.remove();
        onesCount++;
        onesArea.appendChild(makeOneBlock());
        arrived++;
        if (arrived === count && done) done();
      }, stagger + FLY_TO_BIN_MS);
    }
  }

  function updateOreVisual() {
    // 更新数字标签 + 矿石格大小
    const label = document.getElementById('ck-ore-label');
    if (label) label.textContent = String(oreRemaining);
    const ore = document.getElementById('ck-ore');
    if (ore) {
      ore.style.setProperty('--cell',
        oreCellPx(Math.max(oreRemaining, 1)) + 'px');
      if (oreRemaining <= 0) ore.classList.add('gone');
    }
  }

  // 检查个位区有没有 ≥10 个方块,凑足就闪光 + 飞向十位区合体为 1 长条。
  // 可能连续触发(例如一锤之后个位 12 个 → 合一次还剩 2)。
  function checkAutoMerge(done) {
    if (onesCount < 10) { if (done) done(); return; }
    const onesArea = document.getElementById('ck-ones-area');
    const tensArea = document.getElementById('ck-tens-area');
    if (!onesArea || !tensArea) { if (done) done(); return; }

    const cubes = Array.from(onesArea.querySelectorAll('.single-cube')).slice(0, 10);
    if (cubes.length < 10) { if (done) done(); return; }

    // Step 1: 整组金光闪
    cubes.forEach(c => c.classList.add('ck-merge-glow'));
    Audio.merge();

    setTimeout(() => {
      // Step 2: 把这 10 个移除,飞向十位区,合体为 1 根长条
      const targetRect = tensArea.getBoundingClientRect();
      const startRect = cubes[0].getBoundingClientRect();
      cubes.forEach(c => c.remove());
      onesCount -= 10;

      const flyBar = R.renderBar('', 10);
      flyBar.classList.add('ck-fly');
      flyBar.style.position = 'fixed';
      flyBar.style.left = startRect.left + 'px';
      flyBar.style.top = startRect.top + 'px';
      document.body.appendChild(flyBar);

      const tx = targetRect.left + targetRect.width / 2 - startRect.left - 60;
      const ty = targetRect.top + targetRect.height / 2 - startRect.top - 16;

      requestAnimationFrame(() => {
        flyBar.style.transition = 'transform ' + MERGE_FLY_MS + 'ms ease-in-out';
        flyBar.style.transform = 'translate(' + tx + 'px,' + ty + 'px)';
      });

      setTimeout(() => {
        flyBar.remove();
        tensCount++;
        tensArea.appendChild(R.renderBar('', 10));
        // 可能还有 ≥10 个剩,继续递归
        checkAutoMerge(done);
      }, MERGE_FLY_MS);
    }, MERGE_GLOW_MS);
  }

  function render() {
    const app = getHost();
    app.innerHTML = '';
    app.appendChild(renderGameScreen());
  }

  window.ChaiKuang = {
    start(host) {
      hostElement = host;
      // 重置游戏状态(无尽模式下 Task 10 起会真正生成新题)
      currentNumber = 47;
      oreRemaining = 47;
      tensCount = 0;
      onesCount = 0;
      isHammering = false;
      onOreFinished = null;
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
