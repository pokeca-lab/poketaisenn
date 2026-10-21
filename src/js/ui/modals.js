/* 【UI】山札モーダル・カード一覧・ログ・トースト */

// =============================================================================
// モーダル表示群
// =============================================================================
let deckModalSelected = new Set();

function showDeckModal() {
  deckModalSelected.clear();
  addLog(`山札の中身を確認しています`, {
    badge: "🔍 山札確認",
    skipLocalPopup: true
  });
  renderDeckModalContent();
}

function renderDeckModalContent() {
  const selCount = deckModalSelected.size;
  const title = `山札を見る (残り ${state.myDeck.length} 枚)${selCount > 0 ? ` — <span style="color:#ffd84a;">${selCount}枚選択中</span>` : ''}`;
  let bodyHtml = `
    <div style="font-size:11px; color:#94a3b8; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
      <span>※カードをクリックして下部ボタンで操作、または右クリックで直接操作（🔍/ダブルクリックで拡大）</span>
      ${selCount > 0 ? `<button class="btn" style="padding:2px 8px; font-size:10px;" onclick="clearDeckModalSelection()">選択解除</button>` : ''}
    </div>
    <div class="card-grid deck-select-grid">
  `;
  state.myDeck.forEach((c, idx) => {
    const isSel = deckModalSelected.has(idx);
    const cardProps = getCardRenderProps(c, isSel);
    const zoomBtn = `<button class="deck-zoom-icon" onclick="event.stopPropagation(); window.openCardZoomByUid('${c.uid}')" title="カードを拡大表示">🔍</button>`;
    bodyHtml += `
      <div class="${cardProps.className}" 
           ${cardProps.imgStyle}
           onclick="toggleDeckModalCard(event, ${idx})"
           oncontextmenu="showDeckCardContextMenu(event, ${idx})"
           ondblclick="event.stopPropagation(); window.openCardZoomByUid('${c.uid}')" 
           title="クリックで選択 / 右クリックでメニュー / ダブルクリックで拡大">
        ${isSel ? `<div class="deck-sel-badge">✓ 選択中</div>` : ''}
        ${buildCardInnerHtml(c, zoomBtn)}
      </div>
    `;
  });
  bodyHtml += `</div>`;

  const disabledAttr = selCount === 0 ? 'disabled' : '';
  const footHtml = `
    <div class="deck-modal-foot-wrap">
      <div class="deck-modal-actions">
        <button class="btn green" ${disabledAttr} onclick="pickSelectedFromDeck('hand_reveal')">📢 相手に見せて手札に加える</button>
        <button class="btn blue" ${disabledAttr} onclick="pickSelectedFromDeck('hand_secret')">🤫 相手に見せずに手札に加える</button>
        <button class="btn gold" ${disabledAttr} onclick="pickSelectedFromDeck('bench_reveal')">🪑 相手に見せてベンチに出す</button>
        <button class="btn red" ${disabledAttr} onclick="pickSelectedFromDeck('trash')">🗑️ トラッシュ</button>
      </div>
      <div class="deck-modal-close-row">
        <span class="deck-sel-status">${selCount > 0 ? `${selCount}枚選択中` : 'カードを選択してください'}</span>
        <div style="display:flex; gap:6px;">
          <button class="btn purple" onclick="shuffleMyDeck(); closeModal();">シャッフルして閉じる</button>
          <button class="btn" onclick="closeModal()">閉じる</button>
        </div>
      </div>
    </div>
  `;

  showModal(title, bodyHtml, footHtml);
}

window.clearDeckModalSelection = function() {
  deckModalSelected.clear();
  renderDeckModalContent();
};

window.toggleDeckModalCard = function(e, idx) {
  if (e.target.closest("button")) return;
  if (deckModalSelected.has(idx)) {
    deckModalSelected.delete(idx);
  } else {
    deckModalSelected.add(idx);
  }
  renderDeckModalContent();
};

window.showDeckCardContextMenu = function(e, idx) {
  if (e && e.preventDefault) e.preventDefault();
  if (e && e.stopPropagation) e.stopPropagation();

  const card = state.myDeck[idx];
  if (!card) return;

  // 既に複数枚選択されていて、その中のカードを右クリックした場合は選択状態を維持。
  // 未選択のカードを右クリックした場合はそのカード1枚のみを選択状態にして即操作可能にする。
  if (!deckModalSelected.has(idx)) {
    deckModalSelected.clear();
    deckModalSelected.add(idx);
    renderDeckModalContent();
  }

  const ctx = document.getElementById("ctx");
  if (!ctx) return;
  ctx.classList.add("ctx-wide");

  const selCount = deckModalSelected.size;
  const targetLabel = selCount > 1 ? `選択中のカード (${selCount}枚)` : escapeHtml(card.name);

  // ベンチに出せるか判定（選択された全カードがポケモンカードか）
  const selectedCards = Array.from(deckModalSelected).map(i => state.myDeck[i]).filter(Boolean);
  const canBench = selectedCards.length > 0 && selectedCards.every(c => c.type === "pokemon");

  ctx.innerHTML = `
    <div class="ctx-header-row">
      <span class="ctx-title-text">${targetLabel} <small>(${escapeHtml(card.category || card.sub || '')})</small></span>
      <button class="ctx-zoom-btn" onclick="hideCtx(); openCardZoomByUid('${card.uid}')">🔍 拡大</button>
    </div>
    <div class="divider"></div>
    <div class="ctx-grid-2col">
      <button class="ctx-span-2" style="background:#16a34a; color:#fff; font-weight:bold; font-size:12px; padding:7px 10px;" onclick="hideCtx(); pickSelectedFromDeck('hand_reveal');">📢 相手に見せて手札に加える</button>
      <button class="ctx-span-2" style="background:#2563eb; color:#fff; font-weight:bold; font-size:12px; padding:7px 10px;" onclick="hideCtx(); pickSelectedFromDeck('hand_secret');">🤫 相手に見せずに手札に加える</button>
      ${canBench ? `<button class="ctx-span-2" style="background:#d97706; color:#fff; font-weight:bold; font-size:12px; padding:7px 10px;" onclick="hideCtx(); pickSelectedFromDeck('bench_reveal');">🪑 相手に見せてベンチに出す</button>` : ''}
      <button class="ctx-span-2" style="background:#b91c1c; color:#fff; font-weight:bold; font-size:12px; padding:7px 10px;" onclick="hideCtx(); pickSelectedFromDeck('trash');">🗑️ トラッシュへ送る</button>
    </div>
  `;

  // 位置調整（画面端見切れ対策・下端オーバー時は上方向に反転展開）
  ctx.style.visibility = "hidden";
  ctx.classList.remove("hidden");
  const menuW = ctx.offsetWidth || 280;
  const menuH = ctx.offsetHeight || 220;
  let posX = (e && e.clientX !== undefined) ? e.clientX + 10 : window.innerWidth / 2 - 140;
  let posY = (e && e.clientY !== undefined) ? e.clientY + 10 : window.innerHeight / 2 - 110;

  if (posX + menuW > window.innerWidth - 10) {
    posX = Math.max(10, window.innerWidth - menuW - 10);
  }
  if (posY + menuH > window.innerHeight - 10) {
    posY = Math.max(10, e.clientY - menuH - 8);
  }
  if (posY < 10) posY = 10;
  ctx.style.left = `${posX}px`;
  ctx.style.top = `${posY}px`;
  ctx.style.visibility = "visible";
};

window.pickSelectedFromDeck = function(destination) {
  if (deckModalSelected.size === 0) {
    return alert("山札からカードをクリック（タップ）して選択してください");
  }

  // ベンチに出す場合の事前バリデーション（山札から抜く前にチェック）
  const indicesAsc = Array.from(deckModalSelected).sort((a, b) => a - b);
  if (destination === "bench_reveal") {
    const nonPokemon = indicesAsc.map(i => state.myDeck[i]).find(c => c && c.type !== "pokemon");
    if (nonPokemon) {
      return alert(`「${nonPokemon.name}」はポケモンではないためベンチに出せません。`);
    }
    const emptySlots = [];
    for (let i = 0; i < 5; i++) {
      if (!state.myBench[i]) emptySlots.push(i);
    }
    if (indicesAsc.length > emptySlots.length) {
      return alert(`ベンチの空き枠が足りません（選択: ${indicesAsc.length}枚 / 空き枠: ${emptySlots.length}枠）。`);
    }
  }

  // インデックス降順で山札から取り出し、元の順序に戻す
  const indicesDesc = Array.from(deckModalSelected).sort((a, b) => b - a);
  const moved = [];
  indicesDesc.forEach(idx => {
    const c = state.myDeck.splice(idx, 1)[0];
    if (c) moved.push(c);
  });
  moved.reverse();
  deckModalSelected.clear();

  const names = moved.map(c => c.name).join(", ");
  closeModal();

  if (destination === "hand_reveal") {
    moved.forEach(c => state.myHand.push(c));
    addLog(`山札から${moved.length}枚（${names}）を相手に見せて手札に加えました`, { suppressSync: true });
    showToast(`見せて手札へ: ${names}`);
    if (typeof showCardRevealPopup === "function") {
      showCardRevealPopup(state.myName, moved, "相手に見せて手札に加えた");
    }
    if (typeof P2P !== "undefined" && P2P.connected) {
      P2P.send({
        t: "deck_cards_revealed",
        playerName: state.myName,
        cards: moved,
        actionLabel: "山札から手札に加えた"
      });
    }
  } else if (destination === "hand_secret") {
    moved.forEach(c => state.myHand.push(c));
    addLog(`山札から${moved.length}枚を相手に見せずに手札に加えました（${names}）`, { suppressSync: true });
    showToast(`見せずに手札へ: ${moved.length}枚`);
    if (typeof showActionPopup === "function") {
      showActionPopup(state.myName, `山札からカードを ${moved.length}枚（見せずに）手札に加えました`, [], "🤫 山札から非公開取得");
    }
    if (typeof P2P !== "undefined" && P2P.connected) {
      P2P.send({
        t: "deck_cards_secret_hand",
        playerName: state.myName,
        count: moved.length
      });
    }
  } else if (destination === "bench_reveal") {
    const emptySlots = [];
    for (let i = 0; i < 5; i++) {
      if (!state.myBench[i]) emptySlots.push(i);
    }
    moved.forEach((c, i) => {
      const slotIdx = emptySlots[i];
      if (slotIdx !== undefined) {
        state.myBench[slotIdx] = createFieldPokemon(c, 0, [], null);
      }
    });
    addLog(`山札から${moved.length}匹（${names}）を相手に見せてベンチに出しました`, { suppressSync: true });
    showToast(`ベンチへ: ${names}`);
    if (typeof showCardRevealPopup === "function") {
      showCardRevealPopup(state.myName, moved, "山札からベンチに出した");
    }
    if (typeof P2P !== "undefined" && P2P.connected) {
      P2P.send({
        t: "deck_cards_revealed",
        playerName: state.myName,
        cards: moved,
        actionLabel: "山札からベンチに出した"
      });
    }
  } else if (destination === "trash") {
    moved.forEach(c => state.myTrash.push(c));
    addLog(`山札から${moved.length}枚（${names}）をトラッシュしました`, { suppressSync: true });
    showToast(`トラッシュ: ${names}`);
    if (typeof showCardRevealPopup === "function") {
      showCardRevealPopup(state.myName, moved, "山札からトラッシュした");
    }
    if (typeof P2P !== "undefined" && P2P.connected) {
      P2P.send({
        t: "deck_cards_revealed",
        playerName: state.myName,
        cards: moved,
        actionLabel: "山札からトラッシュした"
      });
    }
  }

  renderAll();
};

window._modalSelectedIndices = new Set();

function showCardListModal(titleText, cardList) {
  window._modalSelectedIndices = new Set();
  const isOpponentList = titleText.includes("相手");
  const isTrash = titleText.includes("トラッシュ");

  let bodyHtml = `<div class="card-grid modal-card-grid" id="modal-card-grid">`;
  cardList.forEach((c, idx) => {
    const cardProps = getCardRenderProps(c);
    const safeTitle = titleText.replace(/'/g, "\\'");
    bodyHtml += `
      <div class="${cardProps.className}" 
           id="modal-card-${idx}"
           ${cardProps.imgStyle}
           onclick="${!isOpponentList ? `toggleModalCardSelection(${idx})` : ''}"
           oncontextmenu="${!isOpponentList ? `showTrashCardContextMenu(event, ${idx}, '${safeTitle}')` : ''}"
           ondblclick="event.stopPropagation(); window.openCardZoomByUid('${c.uid}')" 
           title="タップで選択 / 右クリックでメニュー / ダブルクリックで拡大">
        ${buildCardInnerHtml(c)}
      </div>
    `;
  });
  bodyHtml += `</div>`;

  let footHtml = "";
  if (isOpponentList) {
    footHtml = `<button class="btn" onclick="closeModal()">閉じる</button>`;
  } else if (isTrash) {
    footHtml = `
      <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:8px; flex-wrap:wrap;">
        <span id="modal-sel-status" style="font-size:12px; color:#cbd5e1; font-weight:bold;">カードをタップして選択</span>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn green" onclick="executeTrashSelectedToHand('${titleText}')">🖐️ 手札に戻す</button>
          <button class="btn blue" onclick="executeTrashSelectedToDeck('${titleText}')">🔀 山札に戻す</button>
          <button class="btn gold" onclick="executeTrashSelectedAttach('${titleText}')">⚡/🎒 ポケモンにつける</button>
          <button class="btn" onclick="closeModal()">閉じる</button>
        </div>
      </div>
    `;
  } else {
    footHtml = `
      <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:8px; flex-wrap:wrap;">
        <span id="modal-sel-status" style="font-size:12px; color:#cbd5e1; font-weight:bold;">カードをタップして選択</span>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn green" onclick="executeTrashSelectedToHand('${titleText}')">🖐️ 手札に戻す</button>
          <button class="btn" onclick="closeModal()">閉じる</button>
        </div>
      </div>
    `;
  }

  showModal(`${titleText} (${cardList.length} 枚)`, bodyHtml, footHtml);
}

window.toggleModalCardSelection = function(idx) {
  const cardEl = document.getElementById(`modal-card-${idx}`);
  if (!cardEl) return;
  if (window._modalSelectedIndices.has(idx)) {
    window._modalSelectedIndices.delete(idx);
    cardEl.classList.remove("selected");
  } else {
    window._modalSelectedIndices.add(idx);
    cardEl.classList.add("selected");
  }
  const statusEl = document.getElementById("modal-sel-status");
  if (statusEl) {
    const count = window._modalSelectedIndices.size;
    statusEl.textContent = count > 0 ? `選択中: ${count}枚` : "カードをタップして選択";
  }
};

window.showTrashCardContextMenu = function(e, idx, listType) {
  if (e && e.preventDefault) e.preventDefault();
  if (e && e.stopPropagation) e.stopPropagation();

  let list = listType.includes("ロスト") ? state.myLost : state.myTrash;
  const card = list[idx];
  if (!card) return;

  // 既に複数枚選択されていて、その中のカードを右クリックした場合は選択状態を維持。
  // 未選択のカードを右クリックした場合はそのカード1枚のみを選択状態にして即操作可能にする。
  if (!window._modalSelectedIndices.has(idx)) {
    window._modalSelectedIndices.clear();
    const grid = document.getElementById("modal-card-grid");
    if (grid) {
      grid.querySelectorAll(".card").forEach(el => el.classList.remove("selected"));
    }
    window._modalSelectedIndices.add(idx);
    const targetCardEl = document.getElementById(`modal-card-${idx}`);
    if (targetCardEl) targetCardEl.classList.add("selected");

    const statusEl = document.getElementById("modal-sel-status");
    if (statusEl) statusEl.textContent = `選択中: 1枚`;
  }

  const ctx = document.getElementById("ctx");
  if (!ctx) return;
  ctx.classList.add("ctx-wide");

  const selCount = window._modalSelectedIndices.size;
  const targetLabel = selCount > 1 ? `選択中のカード (${selCount}枚)` : escapeHtml(card.name);
  const isTrash = listType.includes("トラッシュ");

  let actionsHtml = "";
  if (isTrash) {
    actionsHtml = `
      <button class="ctx-span-2" style="background:#16a34a; color:#fff; font-weight:bold; font-size:12px; padding:7px 10px;" onclick="hideCtx(); executeTrashSelectedToHand('${listType}');">🖐️ 手札に戻す</button>
      <button class="ctx-span-2" style="background:#2563eb; color:#fff; font-weight:bold; font-size:12px; padding:7px 10px;" onclick="hideCtx(); executeTrashSelectedToDeck('${listType}');">🔀 山札に戻す（シャッフル）</button>
      <button class="ctx-span-2" style="background:#d97706; color:#fff; font-weight:bold; font-size:12px; padding:7px 10px;" onclick="hideCtx(); executeTrashSelectedAttach('${listType}');">⚡/🎒 ポケモンにつける</button>
    `;
  } else {
    // ロストゾーン等の場合
    actionsHtml = `
      <button class="ctx-span-2" style="background:#16a34a; color:#fff; font-weight:bold; font-size:12px; padding:7px 10px;" onclick="hideCtx(); executeTrashSelectedToHand('${listType}');">🖐️ 手札に戻す</button>
    `;
  }

  ctx.innerHTML = `
    <div class="ctx-header-row">
      <span class="ctx-title-text">${targetLabel} <small>(${escapeHtml(card.category || card.sub || '')})</small></span>
      <button class="ctx-zoom-btn" onclick="hideCtx(); openCardZoomByUid('${card.uid}')">🔍 拡大</button>
    </div>
    <div class="divider"></div>
    <div class="ctx-grid-2col">
      ${actionsHtml}
    </div>
  `;

  // 位置調整（画面端見切れ対策・下端オーバー時は上方向に反転展開）
  ctx.style.visibility = "hidden";
  ctx.classList.remove("hidden");
  const menuW = ctx.offsetWidth || 280;
  const menuH = ctx.offsetHeight || 200;
  let posX = (e && e.clientX !== undefined) ? e.clientX + 10 : window.innerWidth / 2 - 140;
  let posY = (e && e.clientY !== undefined) ? e.clientY + 10 : window.innerHeight / 2 - 100;

  if (posX + menuW > window.innerWidth - 10) {
    posX = Math.max(10, window.innerWidth - menuW - 10);
  }
  if (posY + menuH > window.innerHeight - 10) {
    posY = Math.max(10, e.clientY - menuH - 8);
  }
  if (posY < 10) posY = 10;
  ctx.style.left = `${posX}px`;
  ctx.style.top = `${posY}px`;
  ctx.style.visibility = "visible";
};

window.executeTrashSelectedToHand = function(listType) {
  let list = listType.includes("ロスト") ? state.myLost : state.myTrash;
  const indices = Array.from(window._modalSelectedIndices).sort((a, b) => b - a);
  if (indices.length === 0) {
    return alert("対象のカードをタップして選択してください");
  }
  if (typeof pushHistorySnapshot === "function") {
    pushHistorySnapshot(`${listType}から手札へ戻す`);
  }
  const moved = [];
  indices.forEach(idx => {
    if (idx >= 0 && idx < list.length) {
      const c = list.splice(idx, 1)[0];
      moved.push(c);
      state.myHand.push(c);
    }
  });
  window._modalSelectedIndices.clear();
  closeModal();
  const names = moved.map(c => c.name).join(", ");
  addLog(`【回収】${listType} から「${names}」（${moved.length}枚）を手札に戻しました`, {
    cards: moved,
    badge: `🖐️ ${listType}から手札へ`
  });
  showToast(`手札へ: ${names}`);
  renderAll();
  if (typeof P2P !== "undefined" && P2P.connected && !state.isSoloMode) {
    P2P.syncNow();
  }
};

window.executeTrashSelectedToDeck = function(listType) {
  let list = listType.includes("ロスト") ? state.myLost : state.myTrash;
  const indices = Array.from(window._modalSelectedIndices).sort((a, b) => b - a);
  if (indices.length === 0) {
    return alert("対象のカードをタップして選択してください");
  }
  if (typeof pushHistorySnapshot === "function") {
    pushHistorySnapshot(`${listType}から山札へ戻す`);
  }
  const moved = [];
  indices.forEach(idx => {
    if (idx >= 0 && idx < list.length) {
      const c = list.splice(idx, 1)[0];
      moved.push(c);
      state.myDeck.push(c);
    }
  });
  state.myDeck = shuffleArray(state.myDeck);
  window._modalSelectedIndices.clear();
  closeModal();
  const names = moved.map(c => c.name).join(", ");
  addLog(`【山札戻し】${listType} から「${names}」（${moved.length}枚）を山札に戻してシャッフルしました`, {
    cards: moved,
    badge: `🔀 ${listType}から山札へ`
  });
  showToast(`山札に戻しました: ${moved.length}枚`);
  renderAll();
  if (typeof P2P !== "undefined" && P2P.connected && !state.isSoloMode) {
    P2P.syncNow();
  }
};

window.executeTrashSelectedAttach = function(listType) {
  let list = listType.includes("ロスト") ? state.myLost : state.myTrash;
  const indices = Array.from(window._modalSelectedIndices);
  if (indices.length === 0) {
    return alert("ポケモンにつけるカードを1枚タップして選択してください");
  }
  if (indices.length > 1) {
    return alert("ポケモンにつけるカードは1枚ずつ選択してください");
  }
  const cardIdx = indices[0];
  const card = list[cardIdx];
  if (!card) return;

  const targets = [];
  if (state.myActive) {
    targets.push({ location: "active", name: `⚔️ バトル場: ${state.myActive.card.name}` });
  }
  state.myBench.forEach((b, bIdx) => {
    if (b) {
      targets.push({ location: `bench_${bIdx}`, name: `🪑 ベンチ${bIdx + 1}: ${b.card.name}` });
    }
  });

  if (targets.length === 0) {
    return alert("場につける対象のポケモンがいません");
  }

  let buttonsHtml = targets.map(t => `
    <button class="btn gold wide" style="margin-bottom:8px; text-align:left; padding:10px 14px; font-weight:bold; font-size:13px;" onclick="applyTrashCardToPokemon('${listType}', ${cardIdx}, '${t.location}')">
      ${escapeHtml(t.name)}
    </button>
  `).join("");

  showModal(
    `「${escapeHtml(card.name)}」をつける対象を選択`,
    `<div style="padding:12px;">
       <p style="font-size:13px; color:#cbd5e1; margin-bottom:14px; line-height:1.5;">
         トラッシュの「<b>${escapeHtml(card.name)}</b>」をどのポケモンにつけますか？<br>
         <small style="color:#94a3b8;">（エネルギー付与・ポケモンのどうぐ装備・重ねて進化に対応）</small>
       </p>
       <div style="display:flex; flex-direction:column; gap:4px;">${buttonsHtml}</div>
     </div>`,
    `<button class="btn" onclick="showCardListModal('${listType}', state.myTrash)">← トラッシュ一覧に戻る</button>`
  );
};

window.applyTrashCardToPokemon = function(listType, cardIdx, location) {
  let list = listType.includes("ロスト") ? state.myLost : state.myTrash;
  if (cardIdx < 0 || cardIdx >= list.length) return;
  const dst = (typeof getPokemonByLocation === "function") ? getPokemonByLocation(location) : null;
  if (!dst) return alert("指定された位置にポケモンがいません");

  const card = list.splice(cardIdx, 1)[0];
  if (typeof pushHistorySnapshot === "function") {
    pushHistorySnapshot(`トラッシュからポケモンにカード付与`);
  }

  // 1. エネルギー
  if (card.type === "energy") {
    if (!dst.energies) dst.energies = [];
    dst.energies.push(card);
    addLog(`【トラッシュから付与】「${dst.card.name}」に「${card.name}」をつけました`, {
      cards: [card, dst.card],
      badge: "⚡ エネルギー付与"
    });
    showToast(`【エネ付与】${dst.card.name} ← ${card.name}`);
    if (typeof triggerBoardEffect === "function") {
      triggerBoardEffect({ fxType: "attach", location, attachType: "energy", colorType: card.color || "colorless", icon: "⚡", label: card.name });
    }
  }
  // 2. ポケモン（進化）
  else if (card.type === "pokemon") {
    const prevName = dst.card.name;
    const curedNames = (typeof getPokemonConditionNames === "function") ? getPokemonConditionNames(dst) : [];
    if (typeof clearPokemonConditions === "function") clearPokemonConditions(dst);
    // 進化前カードを進化スタックへ保存
    dst.previousStages = Array.isArray(dst.previousStages) ? dst.previousStages : [];
    dst.previousStages.push(dst.card);
    dst.card = card;
    dst.abilityUsed = false;
    const cureSuffix = curedNames.length > 0 ? `（特殊状態【${curedNames.join("・")}】が回復）` : "";
    addLog(`【トラッシュから進化】「${prevName}」が「${card.name}」に進化しました！${cureSuffix}`, {
      cards: [card],
      badge: "✨ 進化"
    });
    showToast(`【進化】${card.name}！`);
    if (typeof triggerBoardEffect === "function") {
      triggerBoardEffect({ fxType: "attach", location, attachType: "evolve", colorType: "evolve", icon: "✨", label: `進化！ ${card.name}` });
    }
  }
  // 3. トレーナーズ（どうぐ）
  else {
    if (dst.tool) {
      state.myTrash.push(dst.tool);
    }
    dst.tool = card;
    addLog(`【トラッシュから装備】「${dst.card.name}」にどうぐ「${card.name}」をつけました`, {
      cards: [card, dst.card],
      badge: "🎒 どうぐ装備"
    });
    showToast(`【どうぐ装備】${dst.card.name} ← ${card.name}`);
    if (typeof triggerBoardEffect === "function") {
      triggerBoardEffect({ fxType: "attach", location, attachType: "tool", colorType: "tool", icon: "🎒", label: card.name });
    }
  }

  closeModal();
  renderAll();
  if (typeof P2P !== "undefined" && P2P.connected && !state.isSoloMode) {
    P2P.syncNow();
  }
};


function showLogModal() {
  const bodyHtml = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; gap:8px;">
      <span style="font-size:12px; color:#94a3b8;">現在の試合の進行履歴（全 ${state.logs.length} 件）</span>
      <div style="display:flex; gap:6px;">
        <button class="btn btn-primary" style="padding:4px 10px; font-size:11px;" data-action="exportCsv">📥 CSVファイルに出力</button>
        <button class="btn btn-secondary" style="padding:4px 10px; font-size:11px;" data-action="triggerCsvImport">📂 CSV読込で再現</button>
      </div>
    </div>
    <div style="background:#0b0f19; padding:10px; border-radius:6px; font-size:12px; line-height:1.8; max-height:360px; overflow-y:auto; border:1px solid #1e293b;">
      ${state.logs.map(l => `<div>• ${l}</div>`).reverse().join("") || "ログはありません"}
    </div>
  `;
  showModal("対戦ログ / 試合出力・再現", bodyHtml, `<button class="btn" onclick="closeModal()">閉じる</button>`);
}

function showModal(title, body, foot, options = {}) {
  const modalEl = document.getElementById("modal");
  document.getElementById("modal-title").innerHTML = title;
  document.getElementById("modal-body").innerHTML = body;
  document.getElementById("modal-foot").innerHTML = foot;
  if (options && options.dismissible === false) {
    modalEl.dataset.noBackdropClose = "true";
  } else {
    delete modalEl.dataset.noBackdropClose;
  }
  modalEl.classList.remove("hidden");
}

function closeModal() {
  if (typeof hideCtx === "function") hideCtx();
  const modalEl = document.getElementById("modal");
  delete modalEl.dataset.noBackdropClose;
  modalEl.classList.add("hidden");
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2000);
}

// デッキプレビュー描画 (ロビー画面用)

