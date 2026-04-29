// === 凑十熔炉 widget ===
// 公共 widget,可被任何游戏复用。当前由 cou-shi 的 💡 提示按钮触发。
// 接口: window.Drag.openFurnace({ a, b, onClose })

(function () {
  const { el } = window.Render || {};
  if (!el) throw new Error('drag.js: render.js 必须先加载');

  let isOpen = false;

  // 状态(per modal):
  let modalState = null;

  function openFurnace({ a, b, onClose }) {
    if (isOpen) return;
    isOpen = true;

    const aTens = Math.floor(a / 10);
    const aOnes = a % 10;
    const bTens = Math.floor(b / 10);
    const bOnes = b % 10;
    const totalBars = aTens + bTens + 1;  // 凑十后会多 1 条
    const remainingOnes = (aOnes + bOnes) - 10;  // 凑十后剩余的散块数

    modalState = {
      stage: 1,
      cubeFurnaceCount: 0,
      barFurnaceCount: 0,
      totalBars,
      remainingOnes,
      aTens, aOnes, bTens, bOnes,
      // DOM refs filled below
      overlay: null,
      modal: null,
      pileACubes: null, pileBCubes: null,
      pileATens: null, pileBTens: null,
      cubeFurnace: null, cubeFurnaceCounter: null, cubeFurnaceContent: null,
      barFurnace: null, barFurnaceCounter: null, barFurnaceContent: null,
      megaArea: null,
      gotItBtn: null, refuseBtn: null,
      stageBanner: null,
      onClose,
    };

    buildDom();
  }

  function buildDom() {
    const s = modalState;
    s.overlay = el('div', { class: 'furnace-overlay' });
    s.modal = el('div', { class: 'furnace-modal' });

    s.modal.appendChild(el('div', { class: 'furnace-header' }, '🔥 凑十秘籍'));
    s.stageBanner = el('div', { class: 'furnace-banner' }, '把小方块拖(或点)进熔炉,凑成 10');
    s.modal.appendChild(s.stageBanner);

    // === 史蒂夫一堆 ===
    const pileA = el('div', { class: 'furnace-pile pile-a' });
    pileA.appendChild(el('div', { class: 'pile-label' }, '史蒂夫 ' + (s.aTens * 10 + s.aOnes)));
    s.pileATens = el('div', { class: 'pile-tens' });
    for (let i = 0; i < s.aTens; i++) s.pileATens.appendChild(makeBar('green', '10', false));
    pileA.appendChild(s.pileATens);
    s.pileACubes = el('div', { class: 'pile-cubes' });
    for (let i = 0; i < s.aOnes; i++) s.pileACubes.appendChild(makeCube('green', true));
    pileA.appendChild(s.pileACubes);
    s.modal.appendChild(pileA);

    // === 爱丽克斯一堆 ===
    const pileB = el('div', { class: 'furnace-pile pile-b' });
    pileB.appendChild(el('div', { class: 'pile-label' }, '爱丽克斯 ' + (s.bTens * 10 + s.bOnes)));
    s.pileBTens = el('div', { class: 'pile-tens' });
    for (let i = 0; i < s.bTens; i++) s.pileBTens.appendChild(makeBar('red', '10', false));
    pileB.appendChild(s.pileBTens);
    s.pileBCubes = el('div', { class: 'pile-cubes' });
    for (let i = 0; i < s.bOnes; i++) s.pileBCubes.appendChild(makeCube('red', true));
    pileB.appendChild(s.pileBCubes);
    s.modal.appendChild(pileB);

    // === 熔炉 (cube 阶段) ===
    s.cubeFurnace = el('div', { class: 'furnace cube-furnace' });
    s.cubeFurnaceCounter = el('div', { class: 'furnace-counter' }, '🔥 [0/10]');
    s.cubeFurnaceContent = el('div', { class: 'furnace-content' });
    s.cubeFurnace.appendChild(s.cubeFurnaceCounter);
    s.cubeFurnace.appendChild(s.cubeFurnaceContent);
    s.modal.appendChild(s.cubeFurnace);

    // === 熔炉 (bar 阶段, 默认隐藏) ===
    s.barFurnace = el('div', { class: 'furnace bar-furnace', style: 'display:none;' });
    s.barFurnaceCounter = el('div', { class: 'furnace-counter' }, '🔥 [0/' + s.totalBars + ' 条]');
    s.barFurnaceContent = el('div', { class: 'furnace-content' });
    s.barFurnace.appendChild(s.barFurnaceCounter);
    s.barFurnace.appendChild(s.barFurnaceContent);
    s.modal.appendChild(s.barFurnace);

    // === 大方块区 (二级融合产出, 默认空) ===
    s.megaArea = el('div', { class: 'furnace-mega-area' });
    s.modal.appendChild(s.megaArea);

    // === 按钮 ===
    const btnRow = el('div', { class: 'furnace-buttons' });
    s.gotItBtn = el('button', {
      class: 'menu-btn gold',
      onclick: closeModal,
    }, '🧠 懂了!');
    s.refuseBtn = el('button', {
      class: 'menu-btn diamond',
      style: 'display:none;',
      onclick: enterStage2,
    }, '✨ 再融一次');
    btnRow.appendChild(s.gotItBtn);
    btnRow.appendChild(s.refuseBtn);
    s.modal.appendChild(btnRow);

    s.overlay.appendChild(s.modal);
    document.body.appendChild(s.overlay);

    // 阻止 overlay 上的滚动/选中
    s.overlay.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

    // furnace 接收 drop
    setupDropTarget(s.cubeFurnace, (elem) => addCubeToFurnace(elem));
    setupDropTarget(s.barFurnace, (elem) => addBarToFurnace(elem));
  }

  // ---- helpers: makeCube, makeBar ----

  function makeCube(color, draggable) {
    const c = el('div', { class: 'furnace-cube ' + color });
    c.appendChild(el('div', { class: 'cube-label' }, '1'));
    if (draggable) makeDraggable(c);
    return c;
  }

  function makeBar(color, label, draggable) {
    const b = el('div', { class: 'furnace-bar ' + color });
    for (let i = 0; i < 10; i++) b.appendChild(el('div', { class: 'bar-cell' }));
    b.appendChild(el('div', { class: 'bar-label' }, label));
    if (draggable) makeDraggable(b);
    return b;
  }

  // ---- drag & tap unified handler ----

  function makeDraggable(elem) {
    elem.classList.add('draggable');
    // tap
    elem.addEventListener('click', (e) => {
      e.stopPropagation();
      const stage = modalState.stage;
      if (elem.classList.contains('furnace-cube') && stage === 1) {
        if (elem.parentElement === modalState.cubeFurnaceContent) {
          removeCubeFromFurnace(elem);
        } else {
          addCubeToFurnace(elem);
        }
      } else if (elem.classList.contains('furnace-bar') && stage === 2) {
        if (elem.parentElement === modalState.barFurnaceContent) {
          removeBarFromFurnace(elem);
        } else {
          addBarToFurnace(elem);
        }
      }
    });
    // pointer drag
    elem.addEventListener('pointerdown', (e) => onPointerDown(e, elem));
  }

  let dragCtx = null;

  function onPointerDown(e, elem) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    elem.setPointerCapture && elem.setPointerCapture(e.pointerId);
    const rect = elem.getBoundingClientRect();
    dragCtx = {
      elem,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      origParent: elem.parentElement,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
    };
    elem.classList.add('dragging');
    elem.style.position = 'fixed';
    elem.style.left = (e.clientX - dragCtx.offsetX) + 'px';
    elem.style.top = (e.clientY - dragCtx.offsetY) + 'px';
    elem.style.zIndex = '10000';
    document.body.appendChild(elem);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerMove(e) {
    if (!dragCtx) return;
    const dx = e.clientX - dragCtx.startX;
    const dy = e.clientY - dragCtx.startY;
    if (!dragCtx.moved && Math.hypot(dx, dy) > 4) dragCtx.moved = true;
    dragCtx.elem.style.left = (e.clientX - dragCtx.offsetX) + 'px';
    dragCtx.elem.style.top = (e.clientY - dragCtx.offsetY) + 'px';
  }

  function onPointerUp(e) {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
    if (!dragCtx) return;
    const ctx = dragCtx;
    dragCtx = null;
    ctx.elem.classList.remove('dragging');
    ctx.elem.style.position = '';
    ctx.elem.style.left = '';
    ctx.elem.style.top = '';
    ctx.elem.style.zIndex = '';

    if (!ctx.moved) {
      ctx.origParent.appendChild(ctx.elem);
      return;
    }

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const dropZone = target ? target.closest('.furnace.drop-target') : null;
    if (dropZone && dropZone._onDrop) {
      dropZone._onDrop(ctx.elem);
    } else {
      ctx.origParent.appendChild(ctx.elem);
    }
  }

  function setupDropTarget(zone, handler) {
    zone.classList.add('drop-target');
    zone._onDrop = handler;
  }

  // ---- stage 1: cubes -> 10 -> bar ----

  function addCubeToFurnace(cube) {
    if (modalState.stage !== 1) return;
    if (modalState.cubeFurnaceCount >= 10) return;
    modalState.cubeFurnaceContent.appendChild(cube);
    modalState.cubeFurnaceCount++;
    updateCubeCounter();
    if (modalState.cubeFurnaceCount === 10) {
      fuseStage1();
    }
  }

  function removeCubeFromFurnace(cube) {
    const target = cube.classList.contains('red') ? modalState.pileBCubes : modalState.pileACubes;
    target.appendChild(cube);
    modalState.cubeFurnaceCount--;
    updateCubeCounter();
  }

  function updateCubeCounter() {
    modalState.cubeFurnaceCounter.textContent = '🔥 [' + modalState.cubeFurnaceCount + '/10]';
    if (modalState.cubeFurnaceCount === 10) {
      modalState.cubeFurnace.classList.add('full');
    } else {
      modalState.cubeFurnace.classList.remove('full');
    }
  }

  function fuseStage1() {
    Audio.levelUp();
    setTimeout(() => {
      if (!modalState) return;  // closed mid-animation
      modalState.cubeFurnaceContent.innerHTML = '';
      modalState.cubeFurnaceCounter.textContent = '✨ 化成了 1 条!';
      const newBar = makeBar('diamond', '10', false);
      modalState.pileATens.appendChild(newBar);
      modalState.stageBanner.textContent =
        '现在共有 ' + modalState.totalBars + ' 条 + ' +
        modalState.remainingOnes + ' 块 = ?';
      modalState.refuseBtn.style.display = '';
      modalState.cubeFurnace.classList.remove('drop-target');
    }, 600);
  }

  // ---- stage 2: bars -> N → mega tile ----

  function enterStage2() {
    modalState.stage = 2;
    modalState.refuseBtn.style.display = 'none';
    modalState.stageBanner.textContent =
      '把所有 ' + modalState.totalBars + ' 条都拖进熔炉,看变成多少';
    modalState.barFurnace.style.display = '';
    modalState.cubeFurnace.style.display = 'none';
    [...modalState.pileATens.children, ...modalState.pileBTens.children].forEach(bar => {
      makeDraggable(bar);
    });
    modalState.pileACubes.classList.add('locked');
    modalState.pileBCubes.classList.add('locked');
  }

  function addBarToFurnace(bar) {
    if (modalState.stage !== 2) return;
    if (modalState.barFurnaceCount >= modalState.totalBars) return;
    modalState.barFurnaceContent.appendChild(bar);
    modalState.barFurnaceCount++;
    updateBarCounter();
    if (modalState.barFurnaceCount === modalState.totalBars) {
      fuseStage2();
    }
  }

  function removeBarFromFurnace(bar) {
    modalState.pileATens.appendChild(bar);
    modalState.barFurnaceCount--;
    updateBarCounter();
  }

  function updateBarCounter() {
    modalState.barFurnaceCounter.textContent =
      '🔥 [' + modalState.barFurnaceCount + '/' + modalState.totalBars + ' 条]';
    if (modalState.barFurnaceCount === modalState.totalBars) {
      modalState.barFurnace.classList.add('full');
    } else {
      modalState.barFurnace.classList.remove('full');
    }
  }

  function fuseStage2() {
    Audio.levelUp();
    setTimeout(() => {
      if (!modalState) return;
      modalState.barFurnaceContent.innerHTML = '';
      modalState.barFurnaceCounter.textContent = '✨ 化成了一个大方块!';
      const sum = modalState.totalBars * 10;
      const mega = el('div', { class: 'mega-block' }, String(sum));
      modalState.megaArea.appendChild(mega);
      modalState.stageBanner.textContent =
        sum + ' + ' + modalState.remainingOnes + ' = ?';
      modalState.barFurnace.classList.remove('drop-target');
    }, 600);
  }

  // ---- close ----

  function closeModal() {
    if (!modalState) return;
    const cb = modalState.onClose;
    if (modalState.overlay && modalState.overlay.parentElement) {
      modalState.overlay.parentElement.removeChild(modalState.overlay);
    }
    modalState = null;
    isOpen = false;
    if (typeof cb === 'function') {
      try { cb(); } catch (e) { console.error('onClose error', e); }
    }
  }

  window.Drag = { openFurnace };
})();
