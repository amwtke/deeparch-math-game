// frontend/js/avatar/shop.js
// === 装扮商店屏 ===
// 入口: AvatarShop.start(hostEl);  退出: AvatarShop.exit();
// 状态: savedEquipped (服务端权威) + previewSlot/previewCosmeticId (本地试穿)

(function () {
  if (!window.Render || !window.Avatar || !window.Cosmetics || !window.Api) {
    throw new Error('shop.js: required globals missing');
  }
  const { el } = window.Render;

  let hostEl = null;
  const state = {
    savedEquipped: null,           // {head, top, hand, legs}
    savedCoins: 0,
    savedOwned: [],
    previewSlot: null,             // null = no preview active
    previewCosmeticId: null,
  };

  function effectiveEquipped() {
    if (!state.previewSlot) return { ...state.savedEquipped };
    return { ...state.savedEquipped, [state.previewSlot]: state.previewCosmeticId };
  }

  function rerender() {
    if (!hostEl) return;
    hostEl.innerHTML = '';

    // topbar
    const top = el('div', { class: 'shop-topbar' });
    top.appendChild(el('button', {
      class: 'shop-back-btn',
      onclick: () => window.Platform?.exit?.(),
    }, '← 返回'));
    top.appendChild(el('div', { class: 'shop-title' }, '装扮衣橱'));
    top.appendChild(el('div', { class: 'shop-coins' },
      '💰 ' + state.savedCoins));
    hostEl.appendChild(top);

    // body grid
    const body = el('div', { class: 'shop-body' });

    // left preview
    const left = el('div', { class: 'shop-preview' });
    const eq = effectiveEquipped();
    const previewWrap = el('div', { class: 'shop-preview-avatar' });
    previewWrap.innerHTML = window.Avatar.render(eq);
    left.appendChild(previewWrap);
    if (state.previewSlot) {
      left.appendChild(el('div', { class: 'shop-preview-tag' }, '试穿中'));
    }
    // 4 slot summary
    const summary = el('div', { class: 'shop-summary' });
    window.CosmeticSlots.forEach(slot => {
      const id = eq[slot];
      const name = id ? window.Cosmetics[id]?.name : '(无)';
      summary.appendChild(el('div', { class: 'shop-summary-row' },
        `${window.CosmeticSlotNames[slot]}: ${name}`));
    });
    left.appendChild(summary);
    body.appendChild(left);

    // right shelves
    const shelves = el('div', { class: 'shop-shelves' });
    window.CosmeticSlots.forEach(slot => {
      shelves.appendChild(renderShelf(slot, eq));
    });
    body.appendChild(shelves);

    hostEl.appendChild(body);

    // bottom action bar (only when preview active and item is unowned)
    if (state.previewSlot && state.previewCosmeticId
        && !state.savedOwned.includes(state.previewCosmeticId)) {
      hostEl.appendChild(renderActionBar());
    }
  }

  function renderShelf(slot, eq) {
    const shelf = el('div', { class: 'shop-shelf' });
    shelf.appendChild(el('div', { class: 'shop-shelf-title' },
      window.CosmeticSlotNames[slot]));

    const ids = Object.keys(window.Cosmetics)
      .filter(id => window.Cosmetics[id].slot === slot)
      .sort((a, b) => window.Cosmetics[a].price - window.Cosmetics[b].price);

    const grid = el('div', { class: 'shop-shelf-grid' });
    ids.forEach(id => grid.appendChild(renderItemCard(id, slot, eq)));
    shelf.appendChild(grid);
    return shelf;
  }

  function renderItemCard(id, slot, eq) {
    const c = window.Cosmetics[id];
    const owned = state.savedOwned.includes(id);
    const isEquippedSaved = state.savedEquipped[slot] === id;
    const isPreviewing = state.previewSlot === slot && state.previewCosmeticId === id;

    let cls = 'shop-item';
    if (isEquippedSaved) cls += ' shop-item-equipped';
    else if (owned) cls += ' shop-item-owned';
    if (isPreviewing) cls += ' shop-item-previewing';

    const card = el('div', {
      class: cls,
      onclick: () => onClickItem(id),
    });
    const icon = el('div', { class: 'shop-item-icon' });
    icon.innerHTML = c.renderIcon();
    card.appendChild(icon);
    card.appendChild(el('div', { class: 'shop-item-name' }, c.name));

    if (isEquippedSaved) {
      card.appendChild(el('div', { class: 'shop-item-badge' }, '穿着中'));
    } else if (owned) {
      card.appendChild(el('div', { class: 'shop-item-badge' }, '已拥有'));
    } else {
      card.appendChild(el('div', { class: 'shop-item-price' }, '💰 ' + c.price));
    }
    return card;
  }

  function renderActionBar() {
    const id = state.previewCosmeticId;
    const c = window.Cosmetics[id];
    const canAfford = state.savedCoins >= c.price;

    const bar = el('div', { class: 'shop-action-bar' });
    bar.appendChild(el('div', { class: 'shop-action-name' },
      '试穿: ' + c.name));

    const buyBtn = el('button', {
      class: 'shop-action-buy' + (canAfford ? '' : ' disabled'),
      disabled: !canAfford,
      onclick: canAfford ? () => doBuy(id) : null,
    }, canAfford ? `购买 💰${c.price}` : `还差 💰${c.price - state.savedCoins}`);
    bar.appendChild(buyBtn);

    bar.appendChild(el('button', {
      class: 'shop-action-cancel',
      onclick: cancelPreview,
    }, '取消'));
    return bar;
  }

  // event handlers — implemented in Task 16
  function onClickItem(id) {
    console.log('TODO Task 16: onClickItem', id);
  }
  function doBuy(id) {
    console.log('TODO Task 16: doBuy', id);
  }
  function cancelPreview() {
    console.log('TODO Task 16: cancelPreview');
  }

  window.AvatarShop = {
    async start(host) {
      hostEl = host;
      // pull fresh state
      const ps = window.Platform?.playerState;
      if (!ps) return;
      state.savedEquipped = { ...ps.equipped_cosmetics };
      state.savedCoins = ps.total_coins;
      state.savedOwned = [...ps.owned_cosmetics];
      state.previewSlot = null;
      state.previewCosmeticId = null;
      rerender();
    },
    exit() {
      hostEl = null;
      state.previewSlot = null;
      state.previewCosmeticId = null;
    },
  };

  // expose for state machine in Task 16
  window.AvatarShop._state = state;
  window.AvatarShop._rerender = rerender;
})();
