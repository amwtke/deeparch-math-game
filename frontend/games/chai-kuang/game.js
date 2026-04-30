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
        // decompose 完成态:Task 12 接输入区
        panel.appendChild(el('div', null, '敲完啦!Task 12 会在这里加输入框'));
      }
    }
    return panel;
  }

  // compose 题屏占位(Task 13 实装真正 UI)
  function renderComposeScreen() {
    const screen = el('div', { class: 'ck-screen' });
    screen.appendChild(el('button', {
      class: 'ck-exit', onclick: () => Platform.exit(),
    }, '🏠 我玩够了'));
    screen.appendChild(el('div', { class: 'ck-question' },
      'compose 题(待 Task 13 实装):number=' + currentQuestion.number));
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
      nextQuestion();
    },
    exit() {
      listenerCleanups.forEach(fn => fn());
      listenerCleanups = [];
      if (hostElement) hostElement.innerHTML = '';
      hostElement = null;
    },
  };
})();
