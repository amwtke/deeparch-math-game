// === 游戏主控制器 ===
// 屏幕状态机 + 题目流程

// el / renderBar / renderSingles / renderNumberAsBlocks /
// renderProgressBar / makeStatCard 由 render.js 以全局函数声明的形式提供,
// 不能再 `const` 解构(会和 var 类全局函数绑定冲突 → SyntaxError)。

// ============== 配置 ==============
const DAILY_TARGET = 10;
const SESSION_LENGTH = 10;  // 每局多少题

const BADGE_DEFS = [
  { key: 'first_correct', icon: '⭐', name: '初出茅庐' },
  { key: 'combo_5', icon: '🔥', name: '连击5' },
  { key: 'combo_10', icon: '⚡', name: '连击10' },
  { key: 'daily_done', icon: '📅', name: '完成每日' },
  { key: 'diamond_master', icon: '💎', name: '钻石大师' },
  { key: 'week_warrior', icon: '🏆', name: '一周勇士' },
  { key: 'no_hint', icon: '🧠', name: '独立思考' },
  { key: 'speed_demon', icon: '🚀', name: '闪电速答' },
];

// ============== 状态 ==============
let currentCombo = 0;
let currentSession = null;    // {correct, total, startTime}
let currentQuestion = null;   // {a, b}
let userAnswer = '';
let hintShown = false;
let questionStartTime = 0;

// ============== 题目生成 ==============
function generateQuestion() {
  let a, b, sumOnes;
  let attempts = 0;
  do {
    a = Math.floor(Math.random() * 70) + 10;
    b = Math.floor(Math.random() * 70) + 10;
    sumOnes = (a % 10) + (b % 10);
    attempts++;
  } while ((sumOnes < 10 || a + b > 99) && attempts < 100);

  if (sumOnes < 10 || a + b > 99) { a = 28; b = 15; }
  return { a, b };
}

// ============== 屏幕路由 ==============
async function render(screen) {
  const app = getHost();
  app.innerHTML = '';

  if (screen === 'menu') app.appendChild(renderMenu());
  else if (screen === 'tutorial') app.appendChild(renderTutorial());
  else if (screen === 'game') app.appendChild(renderGame());
  else if (screen === 'badges') app.appendChild(renderBadges());
  else if (screen === 'victory') app.appendChild(renderVictory());
}

// ============== 主菜单 ==============
function renderMenu() {
  const screen = el('div', { class: 'screen menu-screen' });
  screen.appendChild(el('div', { class: 'steve-avatar' }));
  screen.appendChild(el('div', { class: 'game-title' }, '凑十大冒险'));
  screen.appendChild(el('div', { class: 'game-subtitle' }, '⛏ 一起来挖方块学加法 ⛏'));

  // 每日进度
  const done = Platform.playerState?.today_done ?? 0;
  const pct = Math.min(100, Math.round(done / DAILY_TARGET * 100));
  const progressBox = el('div', { style: 'width:100%;max-width:320px;margin:8px 0 16px;' });
  progressBox.appendChild(el('div', {
    style: 'font-size:14px;color:white;text-shadow:1px 1px 0 black;margin-bottom:4px;',
  }, '📅 今日任务: ' + done + ' / ' + DAILY_TARGET));
  progressBox.appendChild(renderProgressBar(pct, pct + '%'));
  screen.appendChild(progressBox);

  screen.appendChild(el('button', {
    class: 'menu-btn', onclick: () => startGame(),
  }, '⚔ 开始冒险'));

  screen.appendChild(el('button', {
    class: 'menu-btn diamond', onclick: () => render('tutorial'),
  }, '📖 怎么玩'));

  screen.appendChild(el('button', {
    class: 'menu-btn gold', onclick: () => render('badges'),
  }, '🏆 勋章墙'));

  return screen;
}

// ============== 教学 ==============
function renderTutorial() {
  const screen = el('div', { class: 'screen' });
  screen.appendChild(el('div', { class: 'screen-title' }, '凑十秘籍'));

  // 步骤1: 基本认识
  const s1 = el('div', { class: 'tutorial-step' });
  s1.appendChild(el('div', { class: 'tutorial-text' }, '🟩 1块 = 1个一'));
  s1.appendChild(el('div', { class: 'demo-step' }, [
    renderSingles('', 1),
    el('span', { class: 'demo-arrow' }, '='),
    el('span', { style: 'font-size:24px;font-weight:bold;' }, '1'),
  ]));
  s1.appendChild(el('div', { class: 'tutorial-text', style: 'margin-top:12px;' },
    '⛓ 10块连成一条 = 1个十'));
  const longRow = el('div', { class: 'demo-step' });
  longRow.appendChild(renderBar('', 10));
  longRow.appendChild(el('span', { class: 'demo-arrow' }, '='));
  longRow.appendChild(el('span', { style: 'font-size:24px;font-weight:bold;' }, '10'));
  s1.appendChild(longRow);
  screen.appendChild(s1);

  // 步骤2: 30 = 3个十
  const s2 = el('div', { class: 'tutorial-step' });
  s2.appendChild(el('div', { class: 'tutorial-text' }, '3条长方块 = 30 (不是3!)'));
  const row2 = el('div', { class: 'demo-step' });
  row2.appendChild(renderBar('', 10));
  row2.appendChild(renderBar('', 10));
  row2.appendChild(renderBar('', 10));
  row2.appendChild(el('span', { class: 'demo-arrow' }, '='));
  row2.appendChild(el('span', { style: 'font-size:28px;font-weight:bold;color:#558B2F;' }, '30'));
  s2.appendChild(row2);
  screen.appendChild(s2);

  // 步骤3: 凑十
  const s3 = el('div', { class: 'tutorial-step' });
  s3.appendChild(el('div', { class: 'tutorial-text' }, '✨ 凑十秘籍: 8 + 2 = 10块 → 合成1条!'));
  const row3 = el('div', { class: 'demo-step' });
  row3.appendChild(renderSingles('', 8));
  row3.appendChild(el('span', { class: 'demo-arrow' }, '+'));
  row3.appendChild(renderSingles('red', 2));
  row3.appendChild(el('span', { class: 'demo-arrow' }, '→'));
  row3.appendChild(renderBar('diamond', 10));
  s3.appendChild(row3);
  screen.appendChild(s3);

  screen.appendChild(el('div', { class: 'btn-row' }, [
    el('button', { class: 'menu-btn', onclick: () => render('menu') }, '🏠 返回'),
    el('button', { class: 'menu-btn diamond', onclick: () => startGame() }, '▶ 开始挑战'),
  ]));

  return screen;
}

// ============== 游戏屏幕 ==============
function renderGame() {
  const screen = el('div', { class: 'screen' });

  const done = Platform.playerState?.today_done ?? 0;
  const pct = Math.min(100, Math.round(done / DAILY_TARGET * 100));
  screen.appendChild(renderProgressBar(pct, '今日 ' + done + '/' + DAILY_TARGET));

  const q = currentQuestion;
  const eqCard = el('div', { class: 'equation-card' });
  const eq = el('div', { class: 'equation' });
  eq.appendChild(document.createTextNode(q.a + ' + ' + q.b + ' = '));
  eq.appendChild(el('span', { class: 'qmark' }, '?'));
  eqCard.appendChild(eq);
  screen.appendChild(eqCard);

  const world = el('div', { class: 'block-world', id: 'block-world' });
  world.appendChild(renderNumberAsBlocks(q.a, '', '史蒂夫'));
  world.appendChild(renderNumberAsBlocks(q.b, 'red', '爱丽克斯'));
  screen.appendChild(world);

  screen.appendChild(el('div', {
    class: 'answer-display' + (userAnswer === '' ? ' empty' : ''),
    id: 'answer-display',
  }, userAnswer));

  // 数字键盘
  const pad = el('div', { class: 'keypad' });
  ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(n => {
    pad.appendChild(el('button', { class: 'keypad-btn', onclick: () => onKey(n) }, n));
  });
  pad.appendChild(el('button', { class: 'keypad-btn delete', onclick: onDelete }, '⌫'));
  pad.appendChild(el('button', { class: 'keypad-btn', onclick: () => onKey('0') }, '0'));
  pad.appendChild(el('button', { class: 'keypad-btn submit', onclick: onSubmit }, '✓'));
  screen.appendChild(pad);

  screen.appendChild(el('div', { class: 'btn-row' }, [
    el('button', { class: 'hint-btn', onclick: showHint }, '💡 提示'),
    el('button', { class: 'back-btn', onclick: () => Platform.exit() }, '🏠 退出'),
  ]));

  return screen;
}

// ============== 勋章墙 ==============
function renderBadges() {
  const screen = el('div', { class: 'screen' });
  screen.appendChild(el('div', { class: 'screen-title' }, '🏆 勋章墙'));

  const grid = el('div', { class: 'badge-grid' });
  BADGE_DEFS.forEach(b => {
    const unlocked = Platform.playerState?.badges?.[b.key] === true;
    const badge = el('div', { class: 'badge ' + (unlocked ? 'unlocked' : 'locked') });
    badge.appendChild(el('div', { class: 'badge-icon' }, b.icon));
    badge.appendChild(el('div', { class: 'badge-name' }, unlocked ? b.name : '???'));
    grid.appendChild(badge);
  });
  screen.appendChild(grid);

  const stats = el('div', { class: 'stats-grid', style: 'margin-top:24px;' });
  stats.appendChild(makeStatCard('💰 总金币', Platform.playerState?.total_coins ?? 0));
  stats.appendChild(makeStatCard('✓ 总答对', Platform.playerState?.total_correct ?? 0));
  stats.appendChild(makeStatCard('🔥 最高连击', Platform.playerState?.best_combo ?? 0));
  stats.appendChild(makeStatCard('📅 玩了天数', Platform.playerState?.days_played ?? 0));
  screen.appendChild(stats);

  screen.appendChild(el('button', {
    class: 'menu-btn', style: 'margin-top:16px;',
    onclick: () => render('menu'),
  }, '🏠 返回主菜单'));

  return screen;
}

// ============== 通关画面 ==============
function renderVictory() {
  const screen = el('div', { class: 'screen victory-screen' });
  screen.appendChild(el('div', { class: 'victory-title' }, '🎉 通关! 🎉'));

  const accuracy = currentSession.total > 0
    ? Math.round(currentSession.correct / currentSession.total * 100) : 0;

  const stats = el('div', { class: 'stats-grid' });
  stats.appendChild(makeStatCard('答对', currentSession.correct + '/' + currentSession.total));
  stats.appendChild(makeStatCard('正确率', accuracy + '%'));
  stats.appendChild(makeStatCard('🔥 最高连击', Platform.playerState?.best_combo ?? 0));
  stats.appendChild(makeStatCard('💰 当前金币', Platform.playerState?.total_coins ?? 0));
  screen.appendChild(stats);

  if ((Platform.playerState?.today_done ?? 0) >= DAILY_TARGET) {
    screen.appendChild(el('div', {
      style: 'background:var(--gold);color:var(--text);padding:8px 16px;border:3px solid var(--gold-dark);margin:16px 0;font-size:18px;',
    }, '✨ 今日任务已完成! ✨'));
  }

  screen.appendChild(el('button', { class: 'menu-btn diamond', onclick: () => startGame() }, '⚔ 再玩一次'));
  screen.appendChild(el('button', { class: 'menu-btn gold', onclick: () => render('badges') }, '🏆 看勋章'));
  screen.appendChild(el('button', { class: 'menu-btn', onclick: () => render('menu') }, '🏠 主菜单'));

  return screen;
}

// ============== 游戏逻辑 ==============
function startGame() {
  currentSession = { correct: 0, total: 0 };
  currentCombo = 0;
  nextQuestion();
  render('game');
}

function nextQuestion() {
  currentQuestion = generateQuestion();
  userAnswer = '';
  hintShown = false;
  questionStartTime = Date.now();
}

function onKey(n) {
  if (userAnswer.length >= 3) return;
  userAnswer += n;
  Audio.key();
  updateAnswerDisplay();
}

function onDelete() {
  if (userAnswer.length === 0) return;
  userAnswer = userAnswer.slice(0, -1);
  Audio.key();
  updateAnswerDisplay();
}

function updateAnswerDisplay() {
  const ans = document.getElementById('answer-display');
  if (!ans) return;
  ans.textContent = userAnswer;
  ans.classList.toggle('empty', userAnswer === '');
}

async function onSubmit() {
  if (userAnswer === '') return;
  const elapsed = Date.now() - questionStartTime;

  let result;
  try {
    result = await Api.submitAnswer({
      a: currentQuestion.a,
      b: currentQuestion.b,
      user_answer: parseInt(userAnswer, 10),
      elapsed_ms: elapsed,
      used_hint: hintShown,
      current_combo: currentCombo,
    });
  } catch (e) {
    alert('网络出错: ' + e.message);
    return;
  }

  currentSession.total++;
  currentCombo = result.new_combo;

  // 重新拉状态以更新顶栏
  await Platform.refreshTopbar();

  if (result.correct) {
    currentSession.correct++;
    Audio.correct();
    if (currentCombo > 1) Audio.combo(currentCombo);
    if (result.new_badges.length > 0) Audio.levelUp();
    showFeedback(true, result);
  } else {
    Audio.wrong();
    const world = document.getElementById('block-world');
    if (world) {
      world.classList.add('shake');
      setTimeout(() => world.classList.remove('shake'), 400);
    }
    showFeedback(false, result);
  }
}

function showFeedback(correct, result) {
  const overlay = el('div', { class: 'feedback-overlay show' });
  const card = el('div', { class: 'feedback-card ' + (correct ? 'correct' : 'wrong') });

  if (correct) {
    card.appendChild(el('div', { class: 'feedback-icon' }, '🎉'));
    card.appendChild(el('div', { class: 'feedback-title' }, '答对啦!'));
    card.appendChild(el('div', { class: 'feedback-detail' },
      currentQuestion.a + ' + ' + currentQuestion.b + ' = ' + result.expected));

    const rewards = el('div', { class: 'reward-row' });
    rewards.appendChild(el('div', { class: 'reward-pill' }, '+' + result.coins_earned + ' 💰'));
    if (currentCombo > 1) rewards.appendChild(el('div', { class: 'reward-pill' }, '🔥 ' + currentCombo + ' 连击'));
    card.appendChild(rewards);

    if (result.new_badges.length > 0) {
      const bRow = el('div', { style: 'margin-top:12px;' });
      bRow.appendChild(el('div', {
        style: 'font-size:14px;color:var(--gold-dark);font-weight:bold;',
      }, '🏆 解锁新勋章!'));
      result.new_badges.forEach(k => {
        const def = BADGE_DEFS.find(b => b.key === k);
        if (def) {
          bRow.appendChild(el('div', { style: 'font-size:18px;margin-top:4px;' },
            def.icon + ' ' + def.name));
        }
      });
      card.appendChild(bRow);
    }
  } else {
    card.appendChild(el('div', { class: 'feedback-icon' }, '💥'));
    card.appendChild(el('div', { class: 'feedback-title' }, '再想想!'));
    card.appendChild(el('div', { class: 'feedback-detail' }, '你写的是 ' + userAnswer));
    card.appendChild(el('div', { style: 'font-size:14px;color:#666;margin-top:8px;' },
      '看看下面的方块,数一数 🤔'));
  }

  overlay.appendChild(card);
  document.body.appendChild(overlay);
  const overlayCleanup = () => overlay.remove();
  listenerCleanups.push(overlayCleanup);

  setTimeout(() => {
    overlay.remove();
    const idx = listenerCleanups.indexOf(overlayCleanup);
    if (idx >= 0) listenerCleanups.splice(idx, 1);
    if (!hostElement) return;  // exited while timer was pending
    if (correct) {
      if (currentSession.total >= SESSION_LENGTH) {
        render('victory');
      } else {
        nextQuestion();
        render('game');
      }
    } else {
      userAnswer = '';
      updateAnswerDisplay();
    }
  }, correct ? 1800 : 1500);
}

function showHint() {
  if (hintShown) return;
  hintShown = true;

  const q = currentQuestion;
  const aOnes = q.a % 10;
  const bOnes = q.b % 10;
  const need = 10 - aOnes;
  const remaining = bOnes - need;
  const newTens = Math.floor(q.a / 10) + Math.floor(q.b / 10) + 1;

  const overlay = el('div', { class: 'feedback-overlay show' });
  const card = el('div', { class: 'feedback-card', style: 'border-color:var(--gold-dark);' });
  card.appendChild(el('div', { class: 'feedback-icon' }, '💡'));
  card.appendChild(el('div', { class: 'feedback-title', style: 'color:var(--gold-dark);' },
    '凑十秘籍'));

  const detail = el('div', {
    style: 'text-align:left;font-size:18px;line-height:1.8;color:var(--text);margin-top:8px;',
  });
  detail.innerHTML =
    '① 看 <b>' + aOnes + '</b> 差几凑10? <b style="color:var(--redstone);">差 ' + need + '</b><br>' +
    '② 从 <b>' + bOnes + '</b> 借 <b style="color:var(--redstone);">' + need + '</b> 个 → 还剩 <b>' + remaining + '</b><br>' +
    '③ 多了一条长方块! 现在有 <b style="color:var(--diamond-dark);">' + newTens + '</b> 条<br>' +
    '④ ' + (newTens * 10) + ' + ' + remaining + ' = ?';
  card.appendChild(detail);

  const overlayCleanup = () => overlay.remove();
  listenerCleanups.push(overlayCleanup);
  card.appendChild(el('button', {
    class: 'menu-btn',
    style: 'margin-top:16px;font-size:16px;padding:8px 24px;',
    onclick: () => {
      overlay.remove();
      const idx = listenerCleanups.indexOf(overlayCleanup);
      if (idx >= 0) listenerCleanups.splice(idx, 1);
    },
  }, '我懂了!'));

  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

// ============== 模块入口 ==============
let hostElement = null;  // platform 分配的 div
let listenerCleanups = [];

function getHost() {
  if (!hostElement) throw new Error('CouShi 未初始化');
  return hostElement;
}

window.CouShi = {
  start(host) {
    hostElement = host;
    // 重置模块状态
    currentCombo = 0;
    currentSession = null;
    currentQuestion = null;
    userAnswer = '';
    hintShown = false;
    questionStartTime = 0;
    // 全局监听器:点击解锁 audio
    const unlock = () => {
      Audio.unlock();
      document.removeEventListener('click', unlock);
    };
    document.addEventListener('click', unlock, { once: true });
    listenerCleanups.push(() => document.removeEventListener('click', unlock));
    // 触摸:阻止按钮的 touchend 默认行为
    const touchHandler = (e) => {
      if (e.target.tagName === 'BUTTON') e.preventDefault();
    };
    document.addEventListener('touchend', touchHandler, { passive: false });
    listenerCleanups.push(() => document.removeEventListener('touchend', touchHandler));
    // 渲染主菜单
    render('menu');
  },
  exit() {
    listenerCleanups.forEach(fn => fn());
    listenerCleanups = [];
    if (hostElement) hostElement.innerHTML = '';
    hostElement = null;
  },
};
