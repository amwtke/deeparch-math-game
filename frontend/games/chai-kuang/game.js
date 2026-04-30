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

  // === 当前题目状态 ===
  // currentQuestion = { number: 10..99, type: 'observe' | 'decompose' | 'compose' }
  const QUESTION_TYPES = ['observe', 'decompose', 'compose'];
  let currentQuestion = null;
  let questionStartTime = 0;
  // === decompose 题输入态 ===
  let decomposeInput = { tens: '', ones: '', activeSlot: 'tens' };
  let decomposeAttempt = 0;          // 0 = 还没答过;1 = 错过一次;2 = 错两次,显示答案
  // === compose 题输入态(Task 13 用到) ===
  let composeInput = '';
  // oreRemaining/tensCount/onesCount 由 nextQuestion 根据 currentQuestion.number 重置。
  // 保留导出以便 strikeOre/flyCubes/checkAutoMerge 直接读写。
  let oreRemaining = 0;
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
      '十位 <span class="ck-bin-count" id="ck-tens-count">× ' + tensCount + '</span>' +
      '<span class="sub">(长条)</span>' }));
    const tensArea = el('div', { class: 'ck-bin-area', id: 'ck-tens-area' });
    for (let i = 0; i < tensCount; i++) {
      tensArea.appendChild(R.renderBar('', 10));
    }
    tensBin.appendChild(tensArea);

    const onesBin = el('div', { class: 'ck-bin' });
    onesBin.appendChild(el('div', { class: 'ck-bin-label', html:
      '个位 <span class="ck-bin-count" id="ck-ones-count">× ' + onesCount + '</span>' +
      '<span class="sub">(方块)</span>' }));
    const onesArea = el('div', { class: 'ck-bin-area', id: 'ck-ones-area' });
    for (let i = 0; i < onesCount; i++) {
      onesArea.appendChild(makeOneBlock());
    }
    onesBin.appendChild(onesArea);

    inv.appendChild(tensBin);
    inv.appendChild(onesBin);
    return inv;
  }

  function updateBinCounts() {
    const tc = document.getElementById('ck-tens-count');
    if (tc) tc.textContent = '× ' + tensCount;
    const oc = document.getElementById('ck-ones-count');
    if (oc) oc.textContent = '× ' + onesCount;
  }

  // 敲一下在矿石上方浮出 "+N" 像素字,像扣血飘字
  function spawnDamagePop(amount) {
    const ore = document.getElementById('ck-ore');
    if (!ore) return;
    const r = ore.getBoundingClientRect();
    const pop = el('div', { class: 'ck-damage-pop' }, '+' + amount);
    pop.style.left = (r.left + r.width / 2 - 36) + 'px';
    pop.style.top = (r.top - 8) + 'px';
    document.body.appendChild(pop);
    setTimeout(() => pop.remove(), 900);
  }

  function makeOneBlock() {
    // 复用 render.js renderSingles 的样式("single-cube")
    const cube = el('div', { class: 'single-cube' });
    cube.appendChild(el('div', { class: 'cube-label' }, '1'));
    return cube;
  }

  function renderStrikeScreen() {
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

    screen.appendChild(renderQuestionPanel());

    return screen;
  }

  function renderQuestionPanel() {
    const panel = el('div', { class: 'ck-question', id: 'ck-question' });
    if (!currentQuestion) {
      panel.appendChild(el('div', null, '点矿石试试看!'));
      return panel;
    }
    if (currentQuestion.type === 'observe') {
      if (oreRemaining > 0) {
        panel.appendChild(el('div', null,
          '🔨 把矿石敲完,看看 ' + currentQuestion.number + ' 是怎么组成的'));
      } else {
        // observe 完成态:Task 11 接 finalize
        panel.appendChild(el('div', null, '看!分解完成 ✨'));
      }
    } else if (currentQuestion.type === 'decompose') {
      if (oreRemaining > 0) {
        panel.appendChild(el('div', null,
          '🔨 把矿石敲完,然后填出它有几个十、几个一'));
      } else {
        const row = el('div', { class: 'ck-input-row' });
        row.appendChild(el('span', null, '它有'));
        row.appendChild(makeSlot('tens'));
        row.appendChild(el('span', null, '个十,'));
        row.appendChild(makeSlot('ones'));
        row.appendChild(el('span', null, '个一'));
        panel.appendChild(row);
        panel.appendChild(renderKeypad('decompose'));
      }
    }
    return panel;
  }

  function makeSlot(name) {
    const v = decomposeInput[name];
    return el('div', {
      class: 'ck-input-slot ' + (v === '' ? 'empty' : '')
              + (decomposeInput.activeSlot === name ? ' active' : ''),
      id: 'ck-slot-' + name,
      onclick: () => {
        decomposeInput.activeSlot = name;
        refreshSlots();
      },
    }, v === '' ? '?' : v);
  }

  function refreshSlots() {
    ['tens', 'ones'].forEach(name => {
      const e = document.getElementById('ck-slot-' + name);
      if (!e) return;
      const v = decomposeInput[name];
      e.textContent = v === '' ? '?' : v;
      e.classList.toggle('empty', v === '');
      e.classList.toggle('active', decomposeInput.activeSlot === name);
    });
  }

  function renderKeypad(mode) {
    // mode: 'decompose'(单数字填十位/个位) 或 'compose'(两位数)
    const pad = el('div', { class: 'ck-keypad' });
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].forEach(n => {
      pad.appendChild(el('button', { onclick: () => onKey(mode, n) }, n));
    });
    pad.appendChild(el('button', { class: 'delete', onclick: () => onDel(mode) }, '⌫'));
    pad.appendChild(el('button', { class: 'submit', onclick: () => onKeyPadSubmit(mode) }, '✓'));
    return pad;
  }

  function onKey(mode, n) {
    Audio.key();
    if (mode === 'decompose') {
      const slot = decomposeInput.activeSlot;
      decomposeInput[slot] = n;
      // 自动跳到下一格
      if (slot === 'tens') decomposeInput.activeSlot = 'ones';
      refreshSlots();
    } else if (mode === 'compose') {
      if (composeInput.length >= 2) return;
      composeInput += n;
      refreshComposeDisplay();
    }
  }

  function onDel(mode) {
    Audio.key();
    if (mode === 'decompose') {
      const slot = decomposeInput.activeSlot;
      if (decomposeInput[slot] !== '') {
        decomposeInput[slot] = '';
      } else if (slot === 'ones') {
        decomposeInput.activeSlot = 'tens';
      }
      refreshSlots();
    } else if (mode === 'compose') {
      composeInput = composeInput.slice(0, -1);
      refreshComposeDisplay();
    }
  }

  async function onKeyPadSubmit(mode) {
    if (mode === 'decompose') {
      if (decomposeInput.tens === '' || decomposeInput.ones === '') return;
      await submitDecomposeAttempt();
    } else if (mode === 'compose') {
      if (composeInput.length < 1) return;
      await submitComposeAttempt();
    }
  }

  // Task 13 占位 - compose 题输入提交
  function refreshComposeDisplay() {
    const e = document.getElementById('ck-compose-display');
    if (e) e.textContent = composeInput === '' ? '?' : composeInput;
  }
  async function submitComposeAttempt() {
    const result = await submitCurrentAnswer({
      user_number: parseInt(composeInput, 10),
    });
    if (!result) return;

    if (result.correct) {
      Audio.correct();
      if (result.new_badges && result.new_badges.length > 0) Audio.levelUp();
      showCelebration(result, () => nextQuestion());
    } else {
      Audio.wrong();
      // 答错就演示一遍"长条 + 方块 = 数字",看完进下一题
      composeRevealAnimation(result, () => nextQuestion());
    }
  }

  // compose 答错时演示完整合成:长条 + 方块 = 数字
  function composeRevealAnimation(result, done) {
    const overlay = el('div', { class: 'ck-celebrate-overlay' });
    overlay.style.flexDirection = 'column';

    overlay.appendChild(el('div', {
      style:
        'font-family:"ZCOOL KuaiLe",sans-serif;font-size:24px;color:white;' +
        'text-shadow:2px 2px 0 #5D4037;margin-bottom:12px;',
    }, '看一下:'));

    const tens = result.expected_tens;
    const ones = result.expected_ones;
    const num = currentQuestion.number;

    const row = el('div', {
      style:
        'display:flex;align-items:center;gap:12px;background:white;padding:16px;' +
        'border-top:4px solid #FFD54F;border-left:4px solid #FFD54F;' +
        'border-right:4px solid #FF6F00;border-bottom:4px solid #FF6F00;' +
        'color:#5D4037;flex-wrap:wrap;justify-content:center;max-width:90vw;',
    });
    const tensWrap = el('div', { style: 'display:flex;flex-direction:column;gap:2px;' });
    for (let i = 0; i < tens; i++) tensWrap.appendChild(R.renderBar('', 10));
    row.appendChild(tensWrap);
    row.appendChild(el('span', { style: 'font-size:28px;font-weight:bold;' }, '+'));
    row.appendChild(R.renderSingles('', ones));
    row.appendChild(el('span', { style: 'font-size:28px;font-weight:bold;' }, '='));
    row.appendChild(el('span', {
      style:
        'font-family:"Press Start 2P",monospace;font-size:36px;color:#2E7D32;' +
        'text-shadow:2px 2px 0 #C8E6C9;',
    }, String(num)));
    overlay.appendChild(row);

    const btn = el('button', {
      class: 'ck-celebrate-btn',
      style: 'margin-top:20px;',
      onclick: () => { overlay.remove(); if (done) done(); },
    }, '▶ 我懂了');
    overlay.appendChild(btn);

    document.body.appendChild(overlay);
    listenerCleanups.push(() => overlay.remove());
  }

  // === decompose 提交 + 反馈逻辑 ===

  async function submitDecomposeAttempt() {
    const result = await submitCurrentAnswer({
      user_tens: parseInt(decomposeInput.tens, 10),
      user_ones: parseInt(decomposeInput.ones, 10),
    });
    if (!result) return;

    if (result.correct) {
      Audio.correct();
      if (result.new_badges && result.new_badges.length > 0) Audio.levelUp();
      showCelebration(result, () => nextQuestion());
      return;
    }

    // 答错
    Audio.wrong();
    decomposeAttempt++;
    flashHintBars();

    if (decomposeAttempt >= 2) {
      // 第二次错:显示正确答案,然后下一题(不再发请求)
      showRevealAndNext(result);
    } else {
      // 第一次错:清空输入让孩子重答
      decomposeInput = { tens: '', ones: '', activeSlot: 'tens' };
      refreshSlots();
    }
  }

  function flashHintBars() {
    // 让物品栏的长条/方块短暂闪一下作为提示
    document.querySelectorAll(
      '#ck-tens-area .bar-block, #ck-ones-area .single-cube'
    ).forEach(e => {
      e.classList.add('ck-merge-glow');
      setTimeout(() => e.classList.remove('ck-merge-glow'), 240);
    });
  }

  function showRevealAndNext(result) {
    const overlay = el('div', { class: 'ck-celebrate-overlay' });
    const card = el('div', { class: 'ck-celebrate-card', style:
      'background:#FFD54F;color:#5D4037;text-shadow:none;' +
      'border-top-color:#FFE082;border-left-color:#FFE082;' +
      'border-right-color:#FFA000;border-bottom-color:#FFA000;'
    });
    card.appendChild(el('div', { class: 'ck-celebrate-emoji' }, '👀'));
    card.appendChild(el('div', { class: 'ck-celebrate-eq' },
      '正确答案是: ' + result.expected_tens + ' 个十,' +
      result.expected_ones + ' 个一'));
    card.appendChild(el('div', {
      style: 'font-size:16px;color:#5D4037;margin-top:6px;',
    }, '没关系,下一道继续'));
    const btn = el('button', {
      class: 'ck-celebrate-btn',
      onclick: () => { overlay.remove(); nextQuestion(); },
    }, '▶ 继续');
    card.appendChild(btn);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    listenerCleanups.push(() => overlay.remove());
  }

  // === 教程屏:第一次进游戏时显示一次,用 localStorage 标记 ===
  const TUTORIAL_KEY = 'chai-kuang-tutorial-seen';

  function tutorialSeen() {
    try { return localStorage.getItem(TUTORIAL_KEY) === '1'; }
    catch (e) { return false; }
  }

  function markTutorialSeen() {
    try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch (e) {}
  }

  function renderTutorialScreen() {
    const screen = el('div', { class: 'ck-screen' });

    screen.appendChild(el('div', {
      style:
        'font-family:"Press Start 2P",monospace;font-size:22px;color:white;' +
        'text-shadow:3px 3px 0 #5D4037;text-align:center;margin:8px 0 16px;' +
        'letter-spacing:2px;',
    }, '怎么玩'));

    const wrap = el('div', {
      style:
        'background:rgba(255,255,255,0.92);padding:18px;' +
        'border-top:4px solid #FFD54F;border-left:4px solid #FFD54F;' +
        'border-right:4px solid #FFA000;border-bottom:4px solid #FFA000;' +
        'font-family:"ZCOOL KuaiLe",sans-serif;color:#5D4037;' +
        'max-width:520px;margin:0 auto;',
    });

    // 1️⃣ 点矿石,锤子来
    const s1 = el('div', { style: 'margin:8px 0 16px;font-size:17px;line-height:1.5;' });
    s1.appendChild(el('div', null, '1️⃣ 矿石中央写着数字。点它,像素锤子就来啦!'));
    wrap.appendChild(s1);

    // 2️⃣ 10 个方块凑齐 → 1 长条
    const s2 = el('div', { style: 'margin:14px 0;font-size:17px;line-height:1.5;' });
    s2.appendChild(el('div', null, '2️⃣ 小方块凑齐 10 个,会自动合成 1 根长条!'));
    const demo = el('div', {
      style: 'display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap;justify-content:center;',
    });
    demo.appendChild(R.renderSingles('', 10));
    demo.appendChild(el('span', {
      style: 'font-family:"Press Start 2P",monospace;font-size:24px;color:#FFA000;',
    }, '→'));
    demo.appendChild(R.renderBar('', 10));
    s2.appendChild(demo);
    wrap.appendChild(s2);

    // 3️⃣ 长条 = 10,方块 = 1
    const s3 = el('div', { style: 'margin:14px 0 8px;font-size:17px;line-height:1.5;' });
    s3.appendChild(el('div', null,
      '3️⃣ 长条 = 1 个十,方块 = 1 个一。3 长条 + 5 方块 = 35'));
    const demo3 = el('div', {
      style: 'display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap;justify-content:center;',
    });
    const tens3 = el('div', { style: 'display:flex;flex-direction:column;gap:2px;' });
    for (let i = 0; i < 3; i++) tens3.appendChild(R.renderBar('', 10));
    demo3.appendChild(tens3);
    demo3.appendChild(el('span', {
      style: 'font-family:"Press Start 2P",monospace;font-size:24px;color:#FFA000;',
    }, '+'));
    demo3.appendChild(R.renderSingles('', 5));
    demo3.appendChild(el('span', {
      style: 'font-family:"Press Start 2P",monospace;font-size:24px;color:#FFA000;',
    }, '='));
    demo3.appendChild(el('span', {
      style:
        'font-family:"Press Start 2P",monospace;font-size:32px;color:#2E7D32;' +
        'text-shadow:2px 2px 0 #C8E6C9;',
    }, '35'));
    s3.appendChild(demo3);
    wrap.appendChild(s3);

    screen.appendChild(wrap);

    const btn = el('button', {
      style:
        'margin:20px auto 8px;display:block;' +
        'font-family:"ZCOOL KuaiLe",sans-serif;font-size:22px;padding:12px 28px;' +
        'background:#2E7D32;color:white;cursor:pointer;' +
        'border-top:4px solid #66BB6A;border-left:4px solid #66BB6A;' +
        'border-right:4px solid #1B5E20;border-bottom:4px solid #1B5E20;' +
        'text-shadow:2px 2px 0 #1B5E20;',
      onclick: () => {
        markTutorialSeen();
        nextQuestion();
      },
    }, '▶ 开始挖矿');
    screen.appendChild(btn);

    screen.appendChild(el('div', {
      style: 'text-align:center;margin-top:8px;',
    }, el('button', {
      class: 'ck-exit',
      onclick: () => Platform.exit(),
    }, '🏠 我玩够了')));

    return screen;
  }

  function renderComposeScreen() {
    const screen = el('div', { class: 'ck-screen' });
    screen.appendChild(el('button', {
      class: 'ck-exit', onclick: () => Platform.exit(),
    }, '🏠 我玩够了'));

    // 无矿石,直接展示已分解好的物品栏
    const tens = (currentQuestion.number / 10) | 0;
    const ones = currentQuestion.number % 10;

    const inv = el('div', { class: 'ck-inventory', style: 'margin-top:24px;' });

    const tensBin = el('div', { class: 'ck-bin' });
    tensBin.appendChild(el('div', { class: 'ck-bin-label', html:
      '十位 <span class="ck-bin-count" id="ck-tens-count">× ' + tens + '</span>' +
      '<span class="sub">(长条)</span>' }));
    const tensArea = el('div', { class: 'ck-bin-area', id: 'ck-tens-area' });
    for (let i = 0; i < tens; i++) tensArea.appendChild(R.renderBar('', 10));
    tensBin.appendChild(tensArea);

    const onesBin = el('div', { class: 'ck-bin' });
    onesBin.appendChild(el('div', { class: 'ck-bin-label', html:
      '个位 <span class="ck-bin-count" id="ck-ones-count">× ' + ones + '</span>' +
      '<span class="sub">(方块)</span>' }));
    const onesArea = el('div', { class: 'ck-bin-area', id: 'ck-ones-area' });
    for (let i = 0; i < ones; i++) onesArea.appendChild(makeOneBlock());
    onesBin.appendChild(onesArea);

    inv.appendChild(tensBin);
    inv.appendChild(onesBin);
    screen.appendChild(inv);

    // 题目区:单个填空槽 + 键盘
    const panel = el('div', { class: 'ck-question' });
    panel.appendChild(el('div', null, '看!这是数字几?'));
    const row = el('div', { class: 'ck-input-row' });
    row.appendChild(el('div', {
      class: 'ck-input-slot active' + (composeInput === '' ? ' empty' : ''),
      id: 'ck-compose-display',
    }, composeInput === '' ? '?' : composeInput));
    panel.appendChild(row);
    panel.appendChild(renderKeypad('compose'));
    screen.appendChild(panel);

    return screen;
  }

  // ============== 题目流程 ==============

  function generateQuestion() {
    const number = Math.floor(Math.random() * 90) + 10;  // 10..99
    const type = QUESTION_TYPES[Math.floor(Math.random() * QUESTION_TYPES.length)];
    return { number, type };
  }

  function nextQuestion() {
    currentQuestion = generateQuestion();
    questionStartTime = Date.now();
    // 重置矿石 + 物品栏
    oreRemaining = currentQuestion.number;
    tensCount = 0;
    onesCount = 0;
    isHammering = false;
    onOreFinished = null;
    // 重置题型输入态
    decomposeInput = { tens: '', ones: '', activeSlot: 'tens' };
    decomposeAttempt = 0;
    composeInput = '';
    // 按题型挂上"敲完矿石"回调
    if (currentQuestion.type === 'observe') {
      onOreFinished = finalizeObserve;
    } else if (currentQuestion.type === 'decompose') {
      onOreFinished = () => render();   // 敲完后重渲染,renderQuestionPanel 自然切换到输入区
    }
    // compose 不走敲矿流程
    render();
  }

  async function submitCurrentAnswer(extra) {
    if (!currentQuestion) return null;
    let result;
    try {
      result = await Api.submitDecomposeAnswer(Object.assign({
        number: currentQuestion.number,
        question_type: currentQuestion.type,
        elapsed_ms: Date.now() - questionStartTime,
        user_tens: null,
        user_ones: null,
        user_number: null,
      }, extra || {}));
    } catch (e) {
      showToast('存档没成功,再试一次?');
      return null;
    }
    try { await Platform.refreshTopbar(); } catch (e) {}
    return result;
  }

  function showToast(text) {
    const t = el('div', {
      style:
        'position:fixed;left:50%;top:30%;transform:translateX(-50%);' +
        'background:#212121;color:white;padding:10px 18px;border:3px solid #FFD54F;' +
        'font-family:"ZCOOL KuaiLe",sans-serif;font-size:18px;z-index:1000;',
    }, text);
    document.body.appendChild(t);
    const cleanup = () => t.remove();
    listenerCleanups.push(cleanup);
    setTimeout(cleanup, 2200);
  }

  async function finalizeObserve() {
    const result = await submitCurrentAnswer({});  // observe 不需要 user_*
    if (!result) return;
    Audio.correct();
    if (result.new_badges && result.new_badges.length > 0) Audio.levelUp();
    showCelebration(result, () => nextQuestion());
  }

  // 三种题型答对/完成时共用的胜利浮层。
  // 显示数字分解 + 金币奖励 + 新勋章(若有) + "▶ 继续"按钮。
  function showCelebration(result, done) {
    const tens = (result.expected_tens != null)
      ? result.expected_tens
      : ((currentQuestion.number / 10) | 0);
    const ones = (result.expected_ones != null)
      ? result.expected_ones
      : (currentQuestion.number % 10);

    const overlay = el('div', { class: 'ck-celebrate-overlay' });
    const card = el('div', { class: 'ck-celebrate-card' });
    card.appendChild(el('div', { class: 'ck-celebrate-emoji' }, '🎉'));
    card.appendChild(el('div', { class: 'ck-celebrate-eq' },
      currentQuestion.number + ' = ' + tens + ' 个十 + ' + ones + ' 个一'));
    card.appendChild(el('div', { class: 'ck-celebrate-coins' },
      '+' + (result.coins_earned || 0) + ' 💰'));

    if (result.new_badges && result.new_badges.length > 0) {
      const bRow = el('div', { class: 'ck-celebrate-badges' });
      bRow.appendChild(el('div', { class: 'ck-celebrate-badges-title' },
        '🏆 解锁新勋章!'));
      result.new_badges.forEach(k => {
        bRow.appendChild(el('div', { class: 'ck-celebrate-badge-name' }, k));
      });
      card.appendChild(bRow);
    }

    const btn = el('button', {
      class: 'ck-celebrate-btn',
      onclick: () => { overlay.remove(); if (done) done(); },
    }, '▶ 继续');
    card.appendChild(btn);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    listenerCleanups.push(() => overlay.remove());
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

    // 在矿石上方浮出 "+N" 像素飘字(像扣血)
    spawnDamagePop(strikeCount);

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
        updateBinCounts();
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

  // 凑十的"教学慢动作"。四阶段:
  //   A) 数数:10 个 cube 一个个脉冲高亮,上方浮出 1, 2, ..., 10!
  //   B) 凝聚定格:全部点亮,等一下让孩子看清"有 10 个"
  //   C) 合体白闪:全部白光闪一下
  //   D) 飞走变长条:从个位区飞到十位区,落地为一根新长条
  // 个位 ≥10 时触发,可能连续(例如刚敲完一锤 12 个 → 合一次还剩 2)。
  const COUNT_STEP_MS = 130;          // A 阶段:每个 cube 间隔
  const COUNT_HOLD_MS = 280;          // B 阶段:数完后停留
  const MERGE_FLASH_MS = 250;         // C 阶段:白闪持续

  function checkAutoMerge(done) {
    if (onesCount < 10) { if (done) done(); return; }
    const onesArea = document.getElementById('ck-ones-area');
    const tensArea = document.getElementById('ck-tens-area');
    if (!onesArea || !tensArea) { if (done) done(); return; }

    const cubes = Array.from(onesArea.querySelectorAll('.single-cube')).slice(0, 10);
    if (cubes.length < 10) { if (done) done(); return; }

    // Phase A:每隔 COUNT_STEP_MS 点亮一个 cube,上方浮出数字
    cubes.forEach((cube, i) => {
      setTimeout(() => {
        cube.classList.add('ck-merge-count');
        // 一过 pulse 动画就标"已点亮"(留个金边)
        setTimeout(() => {
          cube.classList.remove('ck-merge-count');
          cube.classList.add('ck-merge-counted');
        }, 320);

        // 浮字 1..9 用普通字号,10 用 final 大字号 + 加感叹号
        const isFinal = (i === 9);
        const r = cube.getBoundingClientRect();
        const popClass = 'ck-count-pop' + (isFinal ? ' final' : '');
        const pop = el('div', { class: popClass }, isFinal ? '10!' : String(i + 1));
        const popOffset = isFinal ? 18 : 10;
        pop.style.left = (r.left + r.width / 2 - popOffset) + 'px';
        pop.style.top = (r.top - 14) + 'px';
        document.body.appendChild(pop);
        setTimeout(() => pop.remove(), 900);

        // 音效:数到 1-9 用 key("嗒"),数到 10 用 merge("嗡!")
        if (isFinal) Audio.merge();
        else Audio.key();
      }, i * COUNT_STEP_MS);
    });

    // Phase B/C/D:数完 → 定格 → 白闪 → 暂停等用户点"收集整10"
    const phaseAEnd = 10 * COUNT_STEP_MS;
    setTimeout(() => {
      // Phase C: 全部白光闪一下
      cubes.forEach(c => c.classList.add('ck-merge-flash'));

      setTimeout(() => {
        // Phase D: 把 10 个 cube 替换为高亮长条 + 等用户点按钮
        const startRect = cubes[0].getBoundingClientRect();
        cubes.forEach(c => c.remove());
        onesCount -= 10;
        updateBinCounts();

        // 高亮脉冲长条放在原位
        const bar = R.renderBar('', 10);
        bar.classList.add('ck-collect-bar');
        bar.style.left = startRect.left + 'px';
        bar.style.top = startRect.top + 'px';
        document.body.appendChild(bar);

        // "收集整 10" 按钮浮在长条上方
        const btn = el('button', { class: 'ck-collect-btn' }, '📦 收集整 10');
        btn.style.left = (startRect.left - 18) + 'px';
        btn.style.top = (startRect.top - 64) + 'px';
        document.body.appendChild(btn);

        // 退出游戏时(中途按"我玩够了")也要清理掉这两个浮窗
        let collected = false;
        const cleanup = () => {
          bar.remove();
          btn.remove();
        };
        listenerCleanups.push(cleanup);

        btn.onclick = () => {
          if (collected) return;
          collected = true;
          Audio.correct();
          btn.remove();

          // 长条不再脉冲,改为飞行
          bar.classList.remove('ck-collect-bar');
          bar.classList.add('ck-fly');

          const tensAreaNow = document.getElementById('ck-tens-area');
          if (!tensAreaNow) {
            // host 已经被卸载(用户中途退出),直接结束
            bar.remove();
            checkAutoMerge(done);
            return;
          }
          const targetRect = tensAreaNow.getBoundingClientRect();
          const tx = targetRect.left + targetRect.width / 2 - startRect.left - 60;
          const ty = targetRect.top + targetRect.height / 2 - startRect.top - 16;

          requestAnimationFrame(() => {
            bar.style.transition = 'transform ' + MERGE_FLY_MS + 'ms ease-in-out';
            bar.style.transform = 'translate(' + tx + 'px,' + ty + 'px)';
          });

          // 在长条原位浮出 "+1 个十!" 奖励飘字
          const reward = el('div', { class: 'ck-reward-pop' }, '+1 个十!');
          reward.style.left = (startRect.left + 10) + 'px';
          reward.style.top = startRect.top + 'px';
          document.body.appendChild(reward);
          setTimeout(() => reward.remove(), 1300);

          setTimeout(() => {
            bar.remove();
            tensCount++;
            const tensAreaLater = document.getElementById('ck-tens-area');
            if (tensAreaLater) tensAreaLater.appendChild(R.renderBar('', 10));
            updateBinCounts();
            // 个位还有 ≥10 时继续(罕见,但 Phase D 期间没新方块进来,
            // 只可能是合体前就已经超过 10 的情况)
            checkAutoMerge(done);
          }, MERGE_FLY_MS);
        };
      }, MERGE_FLASH_MS);
    }, phaseAEnd + COUNT_HOLD_MS);
  }

  function render() {
    const app = getHost();
    app.innerHTML = '';
    if (!currentQuestion) {
      // 兜底:正常不会走到这里(start 会先 nextQuestion)
      app.appendChild(renderStrikeScreen());
      return;
    }
    if (currentQuestion.type === 'compose') {
      app.appendChild(renderComposeScreen());
    } else {
      app.appendChild(renderStrikeScreen());
    }
  }

  window.ChaiKuang = {
    start(host) {
      hostElement = host;
      // 重置全部状态;nextQuestion 会再生成第一道题并 render
      currentQuestion = null;
      questionStartTime = 0;
      oreRemaining = 0;
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
      if (tutorialSeen()) {
        nextQuestion();
      } else {
        // 第一次进游戏:渲染教程屏,点"开始挖矿"才进真正第一题
        currentQuestion = null;
        const app = getHost();
        app.innerHTML = '';
        app.appendChild(renderTutorialScreen());
      }
    },
    exit() {
      listenerCleanups.forEach(fn => fn());
      listenerCleanups = [];
      if (hostElement) hostElement.innerHTML = '';
      hostElement = null;
    },
  };
})();
