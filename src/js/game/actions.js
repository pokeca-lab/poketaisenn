/* 【ゲーム】山札・使用カード・ダメカン・ターン終了・一人回しスワップ */

let _isUndoing = false;
const MAX_HISTORY_STEPS = 15;

/** 盤面操作スナップショットの保存（1手順巻き戻し用） */
function pushHistorySnapshot(actionDesc = "") {
  if (_isUndoing) return;
  if (!Array.isArray(state.historyStack)) {
    state.historyStack = [];
  }
  try {
    const snap = {
      actionDesc,
      ts: Date.now(),
      myDeck: JSON.parse(JSON.stringify(state.myDeck)),
      myHand: JSON.parse(JSON.stringify(state.myHand)),
      myPrizes: JSON.parse(JSON.stringify(state.myPrizes)),
      myActive: JSON.parse(JSON.stringify(state.myActive)),
      myBench: JSON.parse(JSON.stringify(state.myBench)),
      myTrash: JSON.parse(JSON.stringify(state.myTrash)),
      myLost: JSON.parse(JSON.stringify(state.myLost)),
      tempCards: JSON.parse(JSON.stringify(state.tempCards)),
      playCard: JSON.parse(JSON.stringify(state.playCard)),
      stadium: JSON.parse(JSON.stringify(state.stadium)),
      turn: state.turn,
      turnStep: state.turnStep
    };
    state.historyStack.push(snap);
    if (state.historyStack.length > MAX_HISTORY_STEPS) {
      state.historyStack.shift();
    }
  } catch (err) {
    console.warn("Failed to push history snapshot", err);
  }
}

/** 1手順巻き戻す（Undo実行） */
function undoAction() {
  if (!Array.isArray(state.historyStack) || state.historyStack.length === 0) {
    showToast("巻き戻せる履歴がありません");
    return;
  }
  _isUndoing = true;
  try {
    const snap = state.historyStack.pop();
    state.myDeck = snap.myDeck || [];
    state.myHand = snap.myHand || [];
    state.myPrizes = snap.myPrizes || [];
    state.myActive = snap.myActive || null;
    state.myBench = snap.myBench || [null, null, null, null, null, null, null, null];
    state.myTrash = snap.myTrash || [];
    state.myLost = snap.myLost || [];
    state.tempCards = snap.tempCards || [];
    state.playCard = snap.playCard || null;
    state.stadium = snap.stadium || null;
    if (snap.turnStep !== undefined) state.turnStep = snap.turnStep;
    if (snap.turn !== undefined) state.turn = snap.turn;
    state.selectedHandIndices.clear();
    state.selectedHandIndex = -1;

    // カードの再登録
    const allCards = [
      ...state.myDeck, ...state.myHand, ...state.myPrizes,
      ...state.myTrash, ...state.myLost, ...state.tempCards
    ];
    if (state.myActive && state.myActive.card) allCards.push(state.myActive.card);
    if (state.playCard) allCards.push(state.playCard);
    allCards.forEach(c => { if (c) registerCard(c); });

    const detailText = snap.actionDesc ? `（直前操作: ${snap.actionDesc}）` : "";
    addLog(`直前の操作を1手順巻き戻しました${detailText}`, {
      oppText: `相手（${state.myName}）が直前の操作を1手順巻き戻しました`,
      badge: "↩️ 巻き戻し"
    });
    showToast("1手順巻き戻しました");

    if (typeof P2P !== "undefined" && P2P.connected) {
      P2P.syncNow();
    }
    renderAll();
  } finally {
    _isUndoing = false;
  }
}

/** ターン終了時・交代時：全ポケモンの特性使用済みフラグを一括リセット */
function resetAllAbilitiesUsed() {
  if (state.myActive) state.myActive.abilityUsed = false;
  if (Array.isArray(state.myBench)) {
    state.myBench.forEach(b => { if (b) b.abilityUsed = false; });
  }
  if (state.oppActive) state.oppActive.abilityUsed = false;
  if (Array.isArray(state.oppBench)) {
    state.oppBench.forEach(b => { if (b) b.abilityUsed = false; });
  }
}

window.pushHistorySnapshot = pushHistorySnapshot;
window.undoAction = undoAction;
window.resetAllAbilitiesUsed = resetAllAbilitiesUsed;

function drawCardToTemp() {
  if (state.mustPromoteToActive) {
    showToast("⚠️ バトル場に出すベンチポケモンを選択してください");
    return;
  }
  if (state.myDeck.length === 0) {
    return alert("山札がありません！");
  }
  pushHistorySnapshot("ドロー");
  const card = state.myDeck.shift();
  state.tempCards.push(card);
  if (window.SoundEffects) {
    SoundEffects.playDraw();
  }
  addLog(`山札からカードを1枚引きました（テンポラリエリアへ）`, {
    oppText: `山札からカードを1枚引きました`,
    badge: "🎴 ドロー"
  });
  showToast(`「${card.name}」を引きました`);
  renderAll();
}

function toggleSelectTempCard(index) {
  if (!state.selectedTempIndices) state.selectedTempIndices = new Set();
  if (state.selectedTempIndices.has(index)) {
    state.selectedTempIndices.delete(index);
  } else {
    state.selectedTempIndices.add(index);
  }
  renderTemp();
}

function clearTempSelection() {
  if (state.selectedTempIndices) state.selectedTempIndices.clear();
  renderTemp();
}

/** テンポラリエリアからカードを抽出（選択されている場合は選択分のみ、未選択の場合は全カード） */
function extractTempCards() {
  if (!state.tempCards || state.tempCards.length === 0) return [];
  if (!state.selectedTempIndices || state.selectedTempIndices.size === 0) {
    const all = state.tempCards.splice(0);
    return all;
  }
  const selected = [];
  const remaining = [];
  state.tempCards.forEach((c, idx) => {
    if (state.selectedTempIndices.has(idx)) {
      selected.push(c);
    } else {
      remaining.push(c);
    }
  });
  state.tempCards = remaining;
  state.selectedTempIndices.clear();
  return selected;
}

function moveTempToHand() {
  if (state.tempCards.length === 0) return;
  pushHistorySnapshot("テンポラリから手札へ");
  const isSelectedOnly = state.selectedTempIndices && state.selectedTempIndices.size > 0;
  const cards = extractTempCards();
  if (cards.length === 0) return;
  cards.forEach(c => state.myHand.push(c));
  const desc = isSelectedOnly ? `（選択した${cards.length}枚: ${cards.map(c=>c.name).join(", ")}）` : `（${cards.map(c=>c.name).join(", ")}）`;
  addLog(`テンポラリから手札に加えました${desc}`, {
    oppText: `テンポラリのカード（${cards.length}枚）を手札に加えました`,
    badge: "🖐️ 手札へ加える"
  });
  showToast(`手札に加えました (${cards.length}枚)`);
  renderAll();
}

function moveTempToTop() {
  if (state.tempCards.length === 0) return;
  pushHistorySnapshot("テンポラリから山札の上へ");
  const isSelectedOnly = state.selectedTempIndices && state.selectedTempIndices.size > 0;
  const cards = extractTempCards();
  if (cards.length === 0) return;
  cards.reverse().forEach(c => state.myDeck.unshift(c)); // 山札の上へ追加
  const desc = isSelectedOnly ? `（選択した${cards.length}枚: ${cards.map(c=>c.name).join(", ")}）` : `（${cards.map(c=>c.name).join(", ")}）`;
  addLog(`テンポラリからカードを山札の上に置きました${desc}`, {
    oppText: `テンポラリのカード（${cards.length}枚）を山札の上に置きました`,
    badge: "🔄 山札の上へ"
  });
  showToast(`山札の上に置きました (${cards.length}枚)`);
  renderAll();
}

function moveTempToBottom() {
  if (state.tempCards.length === 0) return;
  pushHistorySnapshot("テンポラリから山札の下へ");
  const isSelectedOnly = state.selectedTempIndices && state.selectedTempIndices.size > 0;
  const cards = extractTempCards();
  if (cards.length === 0) return;
  cards.forEach(c => state.myDeck.push(c)); // ボトムへ追加
  const desc = isSelectedOnly ? `（選択した${cards.length}枚: ${cards.map(c=>c.name).join(", ")}）` : `（${cards.map(c=>c.name).join(", ")}）`;
  addLog(`テンポラリからカードを山札の下へ送りました${desc}`, {
    oppText: `テンポラリのカード（${cards.length}枚）を山札の下へ送りました`,
    badge: "⬇️ 山札の下へ"
  });
  showToast(`山札の下へ送りました (${cards.length}枚)`);
  renderAll();
}

function moveTempToTrash() {
  if (state.tempCards.length === 0) return;
  pushHistorySnapshot("テンポラリからトラッシュへ");
  const isSelectedOnly = state.selectedTempIndices && state.selectedTempIndices.size > 0;
  const cards = extractTempCards();
  if (cards.length === 0) return;
  cards.forEach(c => state.myTrash.push(c));
  if (window.SoundEffects) {
    SoundEffects.playTrash();
  }
  const desc = isSelectedOnly ? `（選択した${cards.length}枚: ${cards.map(c=>c.name).join(", ")}）` : `（${cards.map(c=>c.name).join(", ")}）`;
  addLog(`テンポラリからカードをトラッシュしました${desc}`, {
    cards: cards,
    badge: "🗑️ トラッシュ"
  });
  showToast(`トラッシュしました (${cards.length}枚)`);
  renderAll();
}

function trashDeckTop() {
  if (state.myDeck.length === 0) return alert("山札がありません");
  pushHistorySnapshot("山札の上からトラッシュ");
  const card = state.myDeck.shift();
  state.myTrash.push(card);
  if (window.SoundEffects) {
    SoundEffects.playTrash();
  }
  addLog(`山札の上から1枚トラッシュしました: ${card.name}`, {
    cards: [card],
    badge: "🗑️ 山札からトラッシュ"
  });
  showToast(`山札からトラッシュ: ${card.name}`);
  renderAll();
}

function shuffleMyDeck() {
  pushHistorySnapshot("山札シャッフル");
  state.myDeck = shuffleArray(state.myDeck);
  if (window.SoundEffects) {
    SoundEffects.playShuffle();
  }
  addLog(`山札をシャッフルしました`, {
    badge: "🔀 シャッフル"
  });
  showToast("山札をシャッフルしました");
  renderAll();
  if (typeof triggerBoardEffect === "function") {
    triggerBoardEffect({ fxType: "shuffle" });
  }
}

function showPrizeMenu(e, idx) {
  if (e) {
    if (e.stopPropagation) e.stopPropagation();
    if (e.preventDefault) e.preventDefault();
  }
  if (state.mustPromoteToActive) {
    showToast("⚠️ バトル場に出すベンチポケモンを選択してください");
    return;
  }
  if (idx < 0 || idx >= state.myPrizes.length) return;
  const ctx = document.getElementById("ctx");
  if (!ctx) return;

  ctx.classList.add("ctx-wide");
  ctx.innerHTML = `
    <div style="font-size:12px; font-weight:bold; color:#fde047; padding:4px 8px; display:flex; align-items:center; gap:6px;">
      <span>🏆</span> サイド (${idx + 1}枚目 / 残り${state.myPrizes.length}枚)
    </div>
    <div class="divider"></div>
    <button onclick="handlePrizeAction(${idx}, 'hand')" style="color:#86efac; font-weight:bold;">🖐️ 手札に加える</button>
    <button onclick="handlePrizeAction(${idx}, 'peek')">👁️ 表を確認する（拡大表示）</button>
    <button onclick="handlePrizeAction(${idx}, 'deck')">🔀 山に戻す（シャッフル）</button>
    <button onclick="handlePrizeAction(${idx}, 'trash')" style="color:#fca5a5;">🗑️ トラッシュする</button>
    <button onclick="handlePrizeAction(${idx}, 'lost')" style="color:#c084fc;">🌀 ロストゾーンに送る</button>
  `;

  ctx.style.visibility = "hidden";
  ctx.classList.remove("hidden");
  const menuW = ctx.offsetWidth || 230;
  const menuH = ctx.offsetHeight || 220;
  let posX = (e && e.clientX !== undefined) ? e.clientX + 10 : window.innerWidth / 2 - 115;
  let posY = (e && e.clientY !== undefined) ? e.clientY + 10 : window.innerHeight / 2 - 110;

  if (posX + menuW > window.innerWidth - 10) {
    posX = Math.max(10, window.innerWidth - menuW - 10);
  }
  if (posY + menuH > window.innerHeight - 10) {
    posY = Math.max(10, (e ? e.clientY : posY) - menuH - 8);
  }

  ctx.style.left = `${posX}px`;
  ctx.style.top = `${posY}px`;
  ctx.style.visibility = "visible";
}

function handlePrizeAction(idx, destination = "hand") {
  hideCtx();
  if (idx < 0 || idx >= state.myPrizes.length) return;

  if (destination === "peek") {
    const card = state.myPrizes[idx];
    if (!card) return;
    addLog(`【サイド確認】サイド（${idx + 1}枚目）のカードを確認しました`, {
      oppText: `相手がサイドのカードを確認しました`,
      badge: "👁️ サイド確認"
    });
    showToast(`サイド確認: ${card.name}`);
    if (typeof openCardZoom === "function") {
      openCardZoom(card);
    }
    return;
  }

  // アニメーション用にクリックされたサイド要素の座標を取得
  let srcRect = null;
  const myPrizesEl = document.getElementById("my-prizes");
  if (myPrizesEl && myPrizesEl.children[idx]) {
    srcRect = myPrizesEl.children[idx].getBoundingClientRect();
  }

  const card = state.myPrizes.splice(idx, 1)[0];
  if (!card) return;

  if (destination === "hand") {
    state.myHand.push(card);
    addLog(`サイドを1枚取り、手札に加えました: ${card.name}`, {
      oppText: `サイドを1枚取り、手札に加えました（残りサイド: ${state.myPrizes.length}枚）`,
      badge: "🏆 サイド取得"
    });
    showToast(`サイド取得: ${card.name}`);
    renderAll();
    if (typeof triggerBoardEffect === "function") {
      triggerBoardEffect({
        fxType: "prize",
        prizeIdx: idx,
        destination: "hand",
        card: card,
        srcRect: srcRect
      });
    }
    if (state.myPrizes.length === 0) {
      setTimeout(() => {
        addLog(`【決着】${state.myName} がサイドをすべて取りきり勝利しました！`, {
          oppText: `【決着】${state.myName} がサイドをすべて取りきり勝利しました！`,
          badge: "🏆 勝利！"
        });
        if (typeof P2P !== "undefined" && P2P.connected) {
          P2P.send({
            t: "victory",
            winnerName: state.myName,
            reason: "すべてのサイドカードを取りきりました！"
          });
        }
        if (typeof playGrandVictoryEffect === "function") {
          playGrandVictoryEffect(state.myName, "すべてのサイドカードを取りきりました！", false);
        }
      }, 950);
    }
  } else if (destination === "deck") {
    state.myDeck.push(card);
    state.myDeck = shuffleArray(state.myDeck);
    addLog(`サイドを1枚山札に戻してシャッフルしました`, {
      oppText: `サイドを1枚山札に戻してシャッフルしました（残りサイド: ${state.myPrizes.length}枚）`,
      badge: "🔀 サイドを山札へ"
    });
    showToast(`サイドを山札に戻してシャッフルしました`);
    renderAll();
    if (typeof triggerBoardEffect === "function") {
      triggerBoardEffect({ fxType: "shuffle" });
    }
  } else if (destination === "trash") {
    state.myTrash.push(card);
    addLog(`サイドを1枚トラッシュしました: ${card.name}`, {
      oppText: `サイドを1枚トラッシュしました: ${card.name}（残りサイド: ${state.myPrizes.length}枚）`,
      cards: [card],
      badge: "🗑️ サイドをトラッシュ"
    });
    showToast(`サイドからトラッシュ: ${card.name}`);
    renderAll();
    if (typeof triggerBoardEffect === "function") {
      triggerBoardEffect({
        fxType: "prize",
        prizeIdx: idx,
        destination: "trash",
        card: card,
        srcRect: srcRect
      });
    }
  } else if (destination === "lost") {
    state.myLost.push(card);
    addLog(`サイドを1枚ロストゾーンに送りました: ${card.name}`, {
      oppText: `サイドを1枚ロストゾーンに送りました: ${card.name}（残りサイド: ${state.myPrizes.length}枚）`,
      cards: [card],
      badge: "🌀 サイドをロストへ"
    });
    showToast(`サイドからロスト: ${card.name}`);
    renderAll();
  }
}

function takePrize(idx) {
  handlePrizeAction(idx, "hand");
}

window.showPrizeMenu = showPrizeMenu;
window.handlePrizeAction = handlePrizeAction;

// 手札操作（複数選択対応）
function getSelectedCard() {
  const selectedCards = getSelectedHandCards();
  if (selectedCards.length === 0) {
    alert("手札のカードをタップ/クリックして選択してください");
    return null;
  }
  return selectedCards[0].card;
}

function moveSelectedHandToDeck() {
  const indices = getSelectedHandIndices();
  if (indices.length === 0) {
    if (!state.myHand || state.myHand.length === 0) {
      return alert("手札がありません");
    }
    const count = state.myHand.length;
    if (!confirm(`手札のカード（${count}枚）をすべて山札に戻してシャッフルしますか？`)) {
      return;
    }
    pushHistorySnapshot("手札全戻しシャッフル");
    const allHand = state.myHand.splice(0, state.myHand.length);
    allHand.forEach(card => state.myDeck.push(card));
    state.myDeck = shuffleArray(state.myDeck);
    state.selectedHandIndices.clear();
    state.selectedHandIndex = -1;
    addLog(`手札をすべて（${count}枚）山札に戻してシャッフルしました`, {
      oppText: `手札をすべて（${count}枚）山札に戻してシャッフルしました`,
      badge: "🔀 手札全戻し"
    });
    showToast(`手札をすべて山札に戻しました (${count}枚)`);
    renderAll();
    return;
  }
  pushHistorySnapshot("手札から山札へ戻す");
  const movedCards = [];
  indices.forEach(idx => {
    const card = state.myHand.splice(idx, 1)[0];
    movedCards.push(card);
    state.myDeck.push(card);
  });
  state.myDeck = shuffleArray(state.myDeck);
  state.selectedHandIndices.clear();
  state.selectedHandIndex = -1;
  const names = movedCards.map(c => c.name).join(", ");
  addLog(`手札から${movedCards.length}枚（${names}）を山札に戻してシャッフルしました`, {
    oppText: `手札から ${movedCards.length}枚 を山札に戻してシャッフルしました`,
    badge: "🔀 手札から山札へ"
  });
  showToast(`山札に戻しました (${movedCards.length}枚)`);
  renderAll();
}

function moveSelectedHandToBottom() {
  const indices = getSelectedHandIndices();
  if (indices.length === 0) {
    return alert("手札のカードをタップ/クリックして選択してください");
  }
  const movedCards = [];
  indices.forEach(idx => {
    const card = state.myHand.splice(idx, 1)[0];
    movedCards.push(card);
    state.myDeck.push(card);
  });
  state.selectedHandIndices.clear();
  const names = movedCards.map(c => c.name).join(", ");
  addLog(`手札から${movedCards.length}枚（${names}）を山札の下に戻しました`, {
    oppText: `手札から ${movedCards.length}枚 を山札の下に戻しました`,
    badge: "⬇️ 手札から山札の下へ"
  });
  showToast(`山札の下へ戻しました (${movedCards.length}枚)`);
  renderAll();
}

function trashSelectedHand() {
  const indices = getSelectedHandIndices();
  if (indices.length === 0) {
    if (!state.myHand || state.myHand.length === 0) {
      return alert("手札がありません");
    }
    const count = state.myHand.length;
    if (!confirm(`手札のカード（${count}枚）をすべてトラッシュしますか？`)) {
      return;
    }
    pushHistorySnapshot("手札全トラッシュ");
    const allHand = state.myHand.splice(0, state.myHand.length);
    allHand.forEach(card => state.myTrash.push(card));
    state.selectedHandIndices.clear();
    state.selectedHandIndex = -1;
    addLog(`手札をすべて（${count}枚）トラッシュしました`, {
      cards: allHand,
      badge: "🗑️ 手札全トラッシュ"
    });
    showToast(`手札をすべてトラッシュしました (${count}枚)`);
    renderAll();
    return;
  }
  pushHistorySnapshot("手札からトラッシュ");
  const movedCards = [];
  indices.forEach(idx => {
    const card = state.myHand.splice(idx, 1)[0];
    movedCards.push(card);
    state.myTrash.push(card);
  });
  state.selectedHandIndices.clear();
  const names = movedCards.map(c => c.name).join(", ");
  addLog(`手札から${movedCards.length}枚（${names}）をトラッシュしました`, {
    cards: movedCards,
    badge: "🗑️ 手札からトラッシュ"
  });
  showToast(`トラッシュ: ${names}`);
  renderAll();
}

function moveSelectedHandToLost() {
  const indices = getSelectedHandIndices();
  if (indices.length === 0) {
    return alert("手札のカードをタップ/クリックして選択してください");
  }
  const movedCards = [];
  indices.forEach(idx => {
    const card = state.myHand.splice(idx, 1)[0];
    movedCards.push(card);
    state.myLost.push(card);
  });
  state.selectedHandIndices.clear();
  const names = movedCards.map(c => c.name).join(", ");
  addLog(`手札から${movedCards.length}枚（${names}）をロストゾーンへ送りました`, {
    cards: movedCards,
    badge: "🌌 ロストゾーン"
  });
  showToast(`ロストへ送る: ${names}`);
  renderAll();
}

function placeSelectedHandToBench() {
  const indices = getSelectedHandIndices();
  if (indices.length === 0) {
    return alert("手札のカードをタップ/クリックして選択してください");
  }

  // 空きベンチ枠を探す
  const limit = state.myBenchLimit || 5;
  const emptySlots = [];
  for (let i = 0; i < limit; i++) {
    if (!state.myBench[i]) emptySlots.push(i);
  }

  if (emptySlots.length === 0) {
    return alert(`ベンチに空きがありません（最大${limit}匹）`);
  }

  // 選択順（元の手札順、昇順）で配置（対戦準備フェーズ時のみポケモンカードに限定）
  const ascIndices = Array.from(state.selectedHandIndices)
    .filter(i => i >= 0 && i < state.myHand.length && (!state.isSetupPhase || state.myHand[i]?.type === "pokemon"))
    .sort((a, b) => a - b);

  if (ascIndices.length === 0) {
    return alert("対戦準備フェーズではベンチにポケモンカードのみ出すことができます。");
  }

  const toPlaceCount = Math.min(ascIndices.length, emptySlots.length);
  const targetIndices = ascIndices.slice(0, toPlaceCount);
  const placedNames = [];
  const placedCards = [];

  targetIndices.forEach((handIdx, i) => {
    const benchSlot = emptySlots[i];
    const card = state.myHand[handIdx];
    state.myBench[benchSlot] = createFieldPokemon(card, 0, [], null);
    placedNames.push(card.name);
    placedCards.push(card);
  });

  // 削除は降順で行う
  targetIndices.sort((a, b) => b - a).forEach(idx => {
    state.myHand.splice(idx, 1);
  });

  state.selectedHandIndices.clear();
  addLog(`ベンチに${placedNames.length}匹（${placedNames.join(", ")}）を出しました`, {
    oppText: state.isSetupPhase
      ? `ベンチにポケモンを ${placedNames.length}匹 伏せて置きました`
      : `ベンチに${placedNames.length}匹（${placedNames.join(", ")}）を出しました`,
    cards: state.isSetupPhase ? [] : placedCards,
    badge: "🪑 ベンチへ配置"
  });
  showToast(`ベンチへ: ${placedNames.join(", ")}`);
  renderAll();
}

let _cardUsePopupTimer = null;
let _actionPopupHistory = [];
let _popupCloseCallbacks = [];

/**
 * アクション通知ポップアップが閉じた後にコールバックを実行する
 * （ポップアップが表示中でなければ即座に実行）
 */
function runAfterActionPopup(fn) {
  if (typeof fn !== "function") return;
  const popup = document.getElementById("card-use-popup");
  if (popup && !popup.classList.contains("hidden")) {
    _popupCloseCallbacks.push(fn);
  } else {
    fn();
  }
}

function _flushPopupCloseCallbacks() {
  if (_popupCloseCallbacks.length === 0) return;
  const callbacks = _popupCloseCallbacks.slice();
  _popupCloseCallbacks = [];
  setTimeout(() => {
    callbacks.forEach(cb => {
      try {
        cb();
      } catch (err) {
        console.warn("[PopupCloseCallback] error:", err);
      }
    });
  }, 80);
}

function renderPopupCardVisuals(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return "";
  return cards.slice(0, 6).map(c => {
    if (!c) return "";
    const safeName = escapeHtml(c.name || "カード");
    const safeSub = escapeHtml(c.category || c.sub || "");
    const isImgValid = typeof isCardImageValid === "function" ? isCardImageValid(c) : !!c.imageUrl;
    if (isImgValid) {
      return `<img src="${escapeHtml(c.imageUrl)}" alt="${safeName}" referrerpolicy="no-referrer" onerror="this.onerror=null; this.outerHTML='<div class=\\'card card-fallback-white popup-fallback-card\\'><div class=\\'card-top\\'><span class=\\'name\\'>${safeName}</span></div><div class=\\'card-btm\\'><span>${safeSub}</span></div></div>';">`;
    }
    return `
      <div class="card card-fallback-white popup-fallback-card">
        <div class="card-top"><span class="name">${safeName}</span></div>
        <div class="card-btm"><span>${safeSub}</span></div>
      </div>
    `;
  }).join("");
}

function showActionPopup(playerName, actionText, cards = [], badge = "📢 プレイ行動", durationMs = 2800) {
  const popup = document.getElementById("card-use-popup");
  const imgEl = document.getElementById("card-use-popup-img");
  const textEl = document.getElementById("card-use-popup-text");
  if (!popup || !imgEl || !textEl) return;

  const now = Date.now();
  const isPopupVisible = !popup.classList.contains("hidden");
  const lastEntry = _actionPopupHistory[_actionPopupHistory.length - 1];

  // ポップアップが閉じていたか、直前の行動から2.4秒以上経過していたら履歴をリセット
  if (!isPopupVisible || !lastEntry || (now - lastEntry.ts > 2400)) {
    _actionPopupHistory = [];
  }

  _actionPopupHistory.push({
    playerName: playerName || "プレイヤー",
    actionText: actionText || "",
    cards: Array.isArray(cards) ? cards : [],
    badge: badge || "📢 プレイ行動",
    ts: now
  });

  if (_actionPopupHistory.length > 3) {
    _actionPopupHistory.shift();
  }

  const latest = _actionPopupHistory[_actionPopupHistory.length - 1];
  const prevItems = _actionPopupHistory.slice(0, -1);

  // 最新アクションのカード（なければ直前アクションのカード）を表示
  let activeCards = latest.cards;
  if ((!activeCards || activeCards.length === 0) && prevItems.length > 0) {
    for (let i = prevItems.length - 1; i >= 0; i--) {
      if (prevItems[i].cards && prevItems[i].cards.length > 0) {
        activeCards = prevItems[i].cards;
        break;
      }
    }
  }

  const visuals = renderPopupCardVisuals(activeCards);
  if (visuals) {
    imgEl.innerHTML = visuals;
    imgEl.classList.remove("hidden");
  } else {
    imgEl.innerHTML = "";
    imgEl.classList.add("hidden");
  }

  const prevHtml = prevItems.length > 0
    ? `<div class="popup-prev-list">${prevItems.map(it => {
        const p = escapeHtml(it.playerName);
        const t = escapeHtml(it.actionText);
        return `<div class="popup-prev-item">• ${t.startsWith(p) ? t : `${p}：${t}`}</div>`;
      }).join("")}</div>`
    : "";

  const safePlayer = escapeHtml(latest.playerName);
  const safeAction = escapeHtml(latest.actionText);
  const mainLine = safeAction.startsWith(safePlayer)
    ? safeAction
    : `${safePlayer}：${safeAction}`;

  textEl.innerHTML = `
    <span class="popup-player">${escapeHtml(latest.badge)}</span>
    ${prevHtml}
    <span class="popup-main">${mainLine}</span>
    <span class="popup-sub">（クリックで閉じる）</span>
  `;

  popup.classList.remove("hidden");
  clearTimeout(_cardUsePopupTimer);
  const effectiveDuration = (badge && badge.includes("交代")) ? Math.min(durationMs, 1750) : durationMs;
  _cardUsePopupTimer = setTimeout(() => {
    hideCardUsePopup();
  }, effectiveDuration);
}

function showCardUsePopup(playerName, card) {
  if (!card) return;
  if (window.SoundEffects) {
    SoundEffects.playCardUse();
  }
  showActionPopup(
    playerName,
    `「${card.name || "カード"}」を使用しました！`,
    [card],
    "📢 カード使用宣言",
    2800
  );
}

function hideCardUsePopup() {
  const popup = document.getElementById("card-use-popup");
  if (popup) popup.classList.add("hidden");
  _actionPopupHistory = [];
  clearTimeout(_cardUsePopupTimer);
  _flushPopupCloseCallbacks();
}

function showCardRevealPopup(playerName, cards, actionLabel) {
  if (!Array.isArray(cards) || cards.length === 0) return;
  const names = cards.map(c => `「${c.name || "カード"}」`).join("・");
  const action = actionLabel || "手札に加えた";
  showActionPopup(
    playerName,
    `${names} を${action}！`,
    cards,
    `🔍 山札からカード公開 (${cards.length}枚)`,
    3200
  );
}

window.showActionPopup = showActionPopup;
window.showCardUsePopup = showCardUsePopup;
window.showCardRevealPopup = showCardRevealPopup;
window.hideCardUsePopup = hideCardUsePopup;

function playHandCardByIndex(idx) {
  if (idx < 0 || idx >= state.myHand.length) return;

  if (state.playCard) {
    return alert("使用カードエリアにカードがあります。先に前のカードを処理してください。");
  }

  pushHistorySnapshot("カードを使用");
  const card = state.myHand.splice(idx, 1)[0];
  state.playCard = card;
  state.oppPlayCard = null;
  state.selectedHandIndices.clear();

  // 相手・全体への通知 ＆ 画面中央大型ポップアップ表示
  const msg = `${state.myName} が「${card.name}」を使用しました`;
  addLog(msg, { suppressSync: true });
  showToast(`【使用】${card.name}`);
  showCardUsePopup(state.myName, card);

  if (window.SoundEffects) {
    SoundEffects.playCardUse();
  }

  if (typeof P2P !== "undefined" && P2P.connected) {
    P2P.send({
      t: "card_used",
      playerName: state.myName,
      card: card
    });
    P2P.syncNow();
  }

  renderAll();

  if (state.autoTrashEnabled) {
    startAutoTrashTimer(card);
  }
}

let _autoTrashTimer = null;
let _autoTrashInterval = null;

function cancelAutoTrashTimer() {
  if (_autoTrashTimer) {
    clearTimeout(_autoTrashTimer);
    _autoTrashTimer = null;
  }
  if (_autoTrashInterval) {
    clearInterval(_autoTrashInterval);
    _autoTrashInterval = null;
  }
  const bar = document.getElementById("auto-trash-progress-bar");
  if (bar) bar.remove();
}

function startAutoTrashTimer(card) {
  cancelAutoTrashTimer();
  if (!state.autoTrashEnabled || !card) return;

  const playArea = document.getElementById("play-area");
  if (!playArea) return;

  const bar = document.createElement("div");
  bar.id = "auto-trash-progress-bar";
  bar.className = "auto-trash-progress-bar";
  bar.innerHTML = `
    <div class="auto-trash-fill"></div>
    <span class="auto-trash-label">⏱️ 5秒後に自動トラッシュ</span>
  `;
  playArea.appendChild(bar);

  const durationMs = 5000;
  const startTime = Date.now();

  _autoTrashInterval = setInterval(() => {
    if (!state.playCard || state.playCard !== card) {
      cancelAutoTrashTimer();
      return;
    }
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));
    const label = bar.querySelector(".auto-trash-label");
    if (label) {
      label.textContent = `⏱️ ${remaining}秒後に自動トラッシュ`;
    }
    if (elapsed >= durationMs) {
      clearInterval(_autoTrashInterval);
      _autoTrashInterval = null;
    }
  }, 200);

  _autoTrashTimer = setTimeout(() => {
    _autoTrashTimer = null;
    if (state.playCard === card) {
      executeDramaticAutoTrash(card);
    } else {
      cancelAutoTrashTimer();
    }
  }, durationMs);
}

function executeDramaticAutoTrash(card) {
  cancelAutoTrashTimer();
  if (!state.playCard || state.playCard !== card) return;

  const playWrap = document.getElementById("play-card-wrap");
  const trashEl = document.getElementById("my-trash");

  if (!playWrap || !trashEl) {
    movePlayCardToTrash();
    return;
  }

  const srcRect = playWrap.getBoundingClientRect();
  const dstRect = trashEl.getBoundingClientRect();

  const flyer = document.createElement("div");
  flyer.className = "flying-auto-trash-card";
  const cardProps = getCardRenderProps(card);
  flyer.innerHTML = `
    <div class="${cardProps.className}" ${cardProps.imgStyle}>
      ${buildCardInnerHtml(card)}
    </div>
  `;

  document.body.appendChild(flyer);
  if (playWrap) playWrap.style.opacity = "0";

  const startX = srcRect.left + srcRect.width / 2;
  const startY = srcRect.top + srcRect.height / 2;
  const endX = dstRect.left + dstRect.width / 2;
  const endY = dstRect.top + dstRect.height / 2;

  flyer.style.left = `${startX}px`;
  flyer.style.top = `${startY}px`;

  const anim = flyer.animate([
    {
      transform: "translate(-50%, -50%) scale(1) rotate(0deg)",
      boxShadow: "0 0 20px rgba(239, 68, 68, 0.8), 0 0 40px rgba(245, 158, 11, 0.6)",
      opacity: 1
    },
    {
      transform: `translate(${(endX - startX) * 0.45}px, ${(endY - startY) * 0.3 - 80}px) scale(1.2) rotate(15deg)`,
      boxShadow: "0 0 35px rgba(239, 68, 68, 1), 0 0 60px rgba(245, 158, 11, 0.9)",
      opacity: 1,
      offset: 0.45
    },
    {
      transform: `translate(${endX - startX}px, ${endY - startY}px) scale(0.85) rotate(-10deg)`,
      boxShadow: "0 0 25px rgba(239, 68, 68, 0.9), 0 0 45px rgba(220, 38, 38, 0.8)",
      opacity: 0.85,
      offset: 0.85
    },
    {
      transform: `translate(${endX - startX}px, ${endY - startY}px) scale(0.4) rotate(0deg)`,
      boxShadow: "0 0 50px rgba(239, 68, 68, 1)",
      opacity: 0
    }
  ], {
    duration: 750,
    easing: "cubic-bezier(0.25, 1, 0.5, 1)"
  });

  anim.onfinish = () => {
    flyer.remove();
    if (playWrap) playWrap.style.opacity = "";
    trashEl.classList.add("trash-hit-pulse");
    setTimeout(() => trashEl.classList.remove("trash-hit-pulse"), 600);

    if (state.playCard === card) {
      if (typeof pushHistorySnapshot === "function") {
        pushHistorySnapshot("使用カードの自動トラッシュ");
      }
      state.myTrash.push(card);
      state.playCard = null;
      if (window.SoundEffects) {
        SoundEffects.playTrash();
      }
      addLog(`【自動トラッシュ】使用した「${card.name}」をトラッシュへ送りました`, {
        cards: [card],
        badge: "🗑️ 自動トラッシュ"
      });
      showToast(`【自動トラッシュ】${card.name}`);
      renderAll();
      if (typeof P2P !== "undefined" && P2P.connected && !state.isSoloMode) {
        P2P.syncNow();
      }
    }
  };
}

window.cancelAutoTrashTimer = cancelAutoTrashTimer;
window.startAutoTrashTimer = startAutoTrashTimer;

function moveSelectedHandToPlayArea() {
  const indices = getSelectedHandIndices();
  if (indices.length === 0) return;
  // 複数選択されている場合は先頭の1枚を使用カードエリアへ
  playHandCardByIndex(indices[indices.length - 1]); // 昇順の先頭
}

function movePlayCardToTrash() {
  if (!state.playCard) return;
  cancelAutoTrashTimer();
  pushHistorySnapshot("使用カードをトラッシュ");
  const card = state.playCard;
  state.myTrash.push(card);
  state.playCard = null;
  if (window.SoundEffects) {
    SoundEffects.playTrash();
  }
  addLog(`使用した「${card.name}」をトラッシュへ送りました`, {
    cards: [card],
    badge: "🗑️ 使用カードをトラッシュ"
  });
  showToast(`トラッシュ: ${card.name}`);
  renderAll();
}

function movePlayCardToHand() {
  if (!state.playCard) return;
  cancelAutoTrashTimer();
  pushHistorySnapshot("使用カードを手札へ");
  const card = state.playCard;
  state.myHand.push(card);
  state.playCard = null;
  addLog(`「${card.name}」を使用エリアから手札に戻しました`, {
    cards: [card],
    badge: "🖐️ 使用カードを手札へ"
  });
  showToast(`手札へ戻す: ${card.name}`);
  renderAll();
}

function movePlayCardToDeckTop() {
  if (!state.playCard) return;
  cancelAutoTrashTimer();
  pushHistorySnapshot("使用カードを山札の上へ");
  const card = state.playCard;
  state.myDeck.unshift(card);
  state.playCard = null;
  addLog(`「${card.name}」を使用エリアから山札の上に置きました`, {
    cards: [card],
    badge: "🔄 使用カードを山札の上へ"
  });
  showToast(`山札の上へ: ${card.name}`);
  renderAll();
}

function movePlayCardToDeckBottom() {
  if (!state.playCard) return;
  cancelAutoTrashTimer();
  pushHistorySnapshot("使用カードを山札の下へ");
  const card = state.playCard;
  state.myDeck.push(card);
  state.playCard = null;
  addLog(`「${card.name}」を使用エリアから山札の下に送りました`, {
    cards: [card],
    badge: "⬇️ 使用カードを山札の下へ"
  });
  showToast(`山札の下へ: ${card.name}`);
  renderAll();
}

/**
 * スタジアムを場に出し、既存のスタジアムを持ち主側のトラッシュへ送る共通処理
 * @param {Object} newCard - 新しく出すスタジアムカード
 * @param {string} sourceLabel - 配置元の説明（"手札" または "使用枠" など）
 */
function discardAndReplaceStadium(newCard, sourceLabel = "手札") {
  if (typeof pushHistorySnapshot === "function") {
    pushHistorySnapshot("スタジアム配置");
  }

  // 1. 新カードの持ち主確定（一人回しの一時交代中なら相手側、それ以外は自分側）
  const isOppOperating = !!(state.isSoloMode && state.isSoloTemporarySwap);
  newCard.owner = isOppOperating ? "opp" : "me";

  // 2. 既存スタジアムがあれば、その持ち主のトラッシュへ送る
  if (state.stadium) {
    const old = state.stadium;
    const oldIsOpp = (old.owner === "opp") || (old.uid && String(old.uid).startsWith("opp:"));

    if (oldIsOpp) {
      state.oppTrash.push(old);
      addLog(`前のスタジアム「${old.name}」が相手（持ち主）のトラッシュに送られました`, {
        cards: [old],
        badge: "🗑️ スタジアム破棄"
      });
    } else {
      state.myTrash.push(old);
      addLog(`前のスタジアム「${old.name}」が自分（持ち主）のトラッシュに送られました`, {
        cards: [old],
        badge: "🗑️ スタジアム破棄"
      });
    }
    if (typeof SoundEffects !== "undefined") SoundEffects.playTrash();
  }

  // 3. 新スタジアムを配置
  state.stadium = newCard;
  state.stadiumTs = Date.now();

  addLog(`${sourceLabel}からスタジアム「${newCard.name}」を場に出しました`, {
    cards: [newCard],
    badge: "🏟️ スタジアム配置"
  });
  showToast(`スタジアム: ${newCard.name}`);

  if (typeof SoundEffects !== "undefined") SoundEffects.playPokemonPlace();

  renderAll();
}

function movePlayCardToStadium() {
  if (!state.playCard) return;
  cancelAutoTrashTimer();
  const card = state.playCard;
  state.playCard = null;
  discardAndReplaceStadium(card, "使用枠");
}

function movePlayCardToLost() {
  if (!state.playCard) return;
  cancelAutoTrashTimer();
  const card = state.playCard;
  state.myLost.push(card);
  state.playCard = null;
  addLog(`「${card.name}」をロストゾーンへ送りました`, {
    cards: [card],
    badge: "🌌 ロストゾーン"
  });
  showToast(`ロストへ: ${card.name}`);
  renderAll();
}

// カード拡大機能 (ダブルクリック - 表向きのすべてのカードが対象)
function openCardZoom(card) {
  if (!card) return;
  hideCtx();
  const modal = document.getElementById("card-zoom-modal");
  const content = document.getElementById("zoom-card-content");

  // このカードが場のポケモンか判定して、付加情報（どうぐ・エネルギー）を表示
  const fieldInfo = findPokemonByCardUid(card.uid);
  const pokemon = fieldInfo ? fieldInfo.pokemon : null;

  let attachmentHtml = "";
  if (pokemon) {
    const hasTool = !!pokemon.tool;
    const hasEnergies = pokemon.energies && pokemon.energies.length > 0;
    const condNames = (typeof getPokemonConditionNames === "function") ? getPokemonConditionNames(pokemon) : [];

    attachmentHtml = `
      <div class="zoom-attachments">
        ${condNames.length > 0 ? `
          <div class="zoom-section">
            <div class="zoom-section-title">🧪 特殊状態</div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; padding:4px 0;">
              ${condNames.map(n => `<span style="background:#581c87; border:1px solid #d8b4fe; color:#f3e8ff; padding:2px 10px; border-radius:999px; font-size:11px; font-weight:bold;">${n}</span>`).join("")}
            </div>
          </div>
        ` : ''}
        <!-- ポケモンのどうぐ -->
        <div class="zoom-section">
          <div class="zoom-section-title">🎒 ポケモンのどうぐ</div>
          ${hasTool ? `
            <div class="zoom-tool-row">
              <span class="zoom-tool-name">🎒 ${pokemon.tool.name}</span>
              <button class="btn blue" style="font-size:10px; padding:2px 8px;" onclick="openCardZoomByUid('${pokemon.tool.uid}')">どうぐを拡大</button>
            </div>
          ` : `
            <div class="zoom-empty">（ポケモンのどうぐはついていません）</div>
          `}
        </div>

        <!-- ついているエネルギー -->
        <div class="zoom-section">
          <div class="zoom-section-title">⚡ ついているエネルギー (${pokemon.energies ? pokemon.energies.length : 0} 個)</div>
          ${hasEnergies ? `
            <div class="zoom-energy-list">
              ${pokemon.energies.map((energy, eIdx) => {
                const info = getEnergyInfo(energy);
                return `
                  <div class="zoom-energy-item" style="background:${info.bg}; border-color:${info.border};">
                    <span>${info.icon}</span>
                    <span>${energy.name}</span>
                  </div>
                `;
              }).join("")}
            </div>
          ` : `
            <div class="zoom-empty">（エネルギーはついていません）</div>
          `}
        </div>

        <!-- 進化元カード -->
        ${pokemon.previousStages && pokemon.previousStages.length > 0 ? `
          <div class="zoom-section">
            <div class="zoom-section-title">✨ 進化元カード (${pokemon.previousStages.length} 枚)</div>
            <div style="display:flex; flex-direction:column; gap:6px; padding:4px 0;">
              ${pokemon.previousStages.map((prevCard, pIdx) => `
                <div class="zoom-tool-row">
                  <span class="zoom-tool-name">🪙 [${pIdx + 1}段目] ${escapeHtml(prevCard.name)}</span>
                  <button class="btn blue" style="font-size:10px; padding:2px 8px;" onclick="openCardZoomByUid('${prevCard.uid}')">拡大</button>
                </div>
              `).join("")}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  let cardVisualHtml = "";
  const isImgValid = typeof isCardImageValid === "function" ? isCardImageValid(card) : !!card.imageUrl;
  if (isImgValid) {
    cardVisualHtml = `
      <div class="zoom-card-img-wrap" style="display:flex; flex-direction:column; align-items:center; gap:8px;">
        <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" class="zoom-card-img" referrerpolicy="no-referrer"
             onerror="this.onerror=null; if(window.brokenImageUrls) window.brokenImageUrls.add('${escapeHtml(card.imageUrl)}'); const wrap=this.closest('.zoom-card-img-wrap'); if(wrap){ wrap.outerHTML = buildZoomFallbackCardHtml(findCardByUid('${card.uid}') || ${JSON.stringify(card).replace(/"/g, '&quot;')}); }" />
        <div style="font-size:13px; color:#cbd5e1; font-weight:bold; display:flex; align-items:center; gap:8px;">
          <span>${escapeHtml(card.name)}</span>
          ${card.hp ? `<span style="color:#f87171;">(HP${escapeHtml(card.hp)})</span>` : ''}
          <span style="font-size:11px; color:#94a3b8; font-weight:normal;">${escapeHtml(card.category || card.sub || '')}</span>
        </div>
      </div>
    `;
  } else {
    cardVisualHtml = buildZoomFallbackCardHtml(card);
  }

  content.innerHTML = `
    ${cardVisualHtml}
    ${attachmentHtml}
  `;
  modal.classList.remove("hidden");
}

window.openCardZoomByUid = function(uid) {
  const card = cardRegistry.get(uid) || findCardByUid(uid);
  if (card) {
    openCardZoom(card);
  }
};

window.closeCardZoom = function() {
  document.getElementById("card-zoom-modal").classList.add("hidden");
};

function findCardByUid(uid) {
  if (!uid) return null;
  if (state.playCard && state.playCard.uid === uid) return state.playCard;
  if (state.oppPlayCard && state.oppPlayCard.uid === uid) return state.oppPlayCard;
  if (state.myActive && state.myActive.card.uid === uid) return state.myActive.card;
  if (state.myActive && state.myActive.tool && state.myActive.tool.uid === uid) return state.myActive.tool;
  if (state.myActive && state.myActive.energies) {
    const e = state.myActive.energies.find(x => x.uid === uid);
    if (e) return e;
  }
  for (const b of state.myBench) {
    if (b) {
      if (b.card.uid === uid) return b.card;
      if (b.tool && b.tool.uid === uid) return b.tool;
      if (b.energies) {
        const e = b.energies.find(x => x.uid === uid);
        if (e) return e;
      }
    }
  }
  if (state.oppActive && state.oppActive.card.uid === uid) return state.oppActive.card;
  if (state.oppActive && state.oppActive.tool && state.oppActive.tool.uid === uid) return state.oppActive.tool;
  if (state.oppActive && state.oppActive.energies) {
    const e = state.oppActive.energies.find(x => x.uid === uid);
    if (e) return e;
  }
  for (const b of state.oppBench) {
    if (b) {
      if (b.card.uid === uid) return b.card;
      if (b.tool && b.tool.uid === uid) return b.tool;
      if (b.energies) {
        const e = b.energies.find(x => x.uid === uid);
        if (e) return e;
      }
    }
  }
  const handFound = state.myHand.find(c => c.uid === uid);
  if (handFound) return handFound;
  const tempFound = state.tempCards.find(c => c.uid === uid);
  if (tempFound) return tempFound;
  const trashFound = state.myTrash.find(c => c.uid === uid);
  if (trashFound) return trashFound;
  const deckFound = state.myDeck.find(c => c.uid === uid);
  if (deckFound) return deckFound;
  const lostFound = state.myLost.find(c => c.uid === uid);
  if (lostFound) return lostFound;
  const oppTrashFound = state.oppTrash ? state.oppTrash.find(c => c.uid === uid) : null;
  if (oppTrashFound) return oppTrashFound;
  if (state.stadium && state.stadium.uid === uid) return state.stadium;
  return null;
}

// ダブルクリック判定用タイムスタンプ管理（自分の場のカード用）
let _lastOwnFieldClick = { key: "", ts: 0 };

function openOwnPokemonZoom(location, index) {
  hideCtx();
  const target = location === "active" ? state.myActive : state.myBench[index];
  if (!target || !target.card) return;
  openCardZoom(target.card, target);
}

// スタジアムクリックメニュー（シングルクリックで操作メニュー、ダブルクリックで詳細拡大）
function showStadiumMenu(e) {
  e.stopPropagation();
  if (!state.stadium) return;

  const now = Date.now();
  if (_lastOwnFieldClick.key === "stadium" && (now - _lastOwnFieldClick.ts) < 380) {
    _lastOwnFieldClick = { key: "", ts: 0 };
    hideCtx();
    openCardZoom(state.stadium);
    return;
  }
  _lastOwnFieldClick = { key: "stadium", ts: now };

  const ctx = document.getElementById("ctx");
  if (!ctx) return;
  ctx.classList.remove("ctx-wide");
  ctx.innerHTML = `
    <div class="ctx-header-row">
      <span class="ctx-title-text">🏟️ ${escapeHtml(state.stadium.name)}</span>
    </div>
    <div class="divider"></div>
    <button onclick="hideCtx(); openCardZoom(state.stadium)">🔍 カード詳細（拡大）</button>
    <button onclick="hideCtx(); trashStadium()">🗑️ スタジアムをトラッシュ</button>
  `;

  const posX = Math.min(e.clientX + 12, window.innerWidth - 210);
  const posY = Math.min(e.clientY + 12, window.innerHeight - 160);
  ctx.style.left = `${Math.max(8, posX)}px`;
  ctx.style.top = `${Math.max(8, posY)}px`;
  ctx.classList.remove("hidden");
}

function trashStadium() {
  hideCtx();
  if (!state.stadium) return;
  if (typeof pushHistorySnapshot === "function") {
    pushHistorySnapshot("スタジアム破棄");
  }
  const oldStadium = state.stadium;
  const oldIsOpp = (oldStadium.owner === "opp") || (oldStadium.uid && String(oldStadium.uid).startsWith("opp:"));

  if (oldIsOpp) {
    state.oppTrash.push(oldStadium);
    addLog(`スタジアム「${oldStadium.name}」が相手（持ち主）のトラッシュに送られました`, {
      cards: [oldStadium],
      badge: "🗑️ スタジアム破棄"
    });
  } else {
    state.myTrash.push(oldStadium);
    addLog(`スタジアム「${oldStadium.name}」が自分（持ち主）のトラッシュに送られました`, {
      cards: [oldStadium],
      badge: "🗑️ スタジアム破棄"
    });
  }
  state.stadium = null;
  state.stadiumTs = Date.now();
  if (typeof SoundEffects !== "undefined") SoundEffects.playTrash();
  showToast(`スタジアム破棄: ${oldStadium.name}`);
  renderAll();
}

/**
 * 自分の場（バトル場＋ベンチ）にあるポケモンの表示名を取得する
 * ※同名ポケモンが複数存在する場合は「ピカチュウ①」「ピカチュウ②」とナンバリングする
 */
function getFieldPokemonDisplayName(location, index) {
  const target = location === "active" ? state.myActive : state.myBench[index];
  if (!target || !target.card) return "ポケモン";
  const rawName = target.card.name || "ポケモン";

  // 自分フィールド上のポケモン（バトル場→ベンチ0..4順）を収集
  const allField = [];
  if (state.myActive && state.myActive.card) {
    allField.push({ loc: "active", idx: 0, card: state.myActive.card });
  }
  state.myBench.forEach((b, bIdx) => {
    if (b && b.card) {
      allField.push({ loc: "bench", idx: bIdx, card: b.card });
    }
  });

  const sameNamed = allField.filter(p => p.card.name === rawName);
  if (sameNamed.length <= 1) {
    return rawName;
  }

  const numSymbols = ["①", "②", "③", "④", "⑤", "⑥"];
  const orderIdx = sameNamed.findIndex(p => p.loc === location && p.idx === index);
  const symbol = (orderIdx >= 0 && orderIdx < numSymbols.length) ? numSymbols[orderIdx] : `(${orderIdx + 1})`;
  return `${rawName}${symbol}`;
}

/**
 * 「特性を使う」実行処理（相手画面・ログ・ポップアップへ同名ナンバリング付きで通知 ＆ トグル解除対応）
 */
function usePokemonAbility(location, index) {
  hideCtx();
  const target = location === "active" ? state.myActive : state.myBench[index];
  if (!target || !target.card) return;

  pushHistorySnapshot("特性の使用 / 切り替え");
  target.abilityUsed = !target.abilityUsed;

  const displayName = getFieldPokemonDisplayName(location, index);
  const locId = location === "active" ? "active" : `bench_${index}`;

  if (target.abilityUsed) {
    addLog(`「${displayName}」が特性を使うことを宣言しました`, {
      oppText: `「${displayName}」が特性を使うことを宣言しました`,
      cards: [target.card],
      badge: "✨ 特性使用宣言"
    });

    showActionPopup(
      state.myName,
      `「${displayName}」が特性を使うことを宣言しました！`,
      [target.card],
      "✨ 特性使用宣言",
      2600
    );

    showToast(`【特性宣言】${displayName} の特性を使用`);

    if (typeof triggerBoardEffect === "function") {
      triggerBoardEffect({
        fxType: "attach",
        location: locId,
        attachType: "ability",
        colorType: "special",
        icon: "✨",
        label: "特性"
      });
    }
  } else {
    addLog(`「${displayName}」の特性使用済みマークを解除しました`, {
      oppText: `「${displayName}」の特性使用済みマークが解除されました`,
      cards: [target.card],
      badge: "🔄 特性リセット"
    });
    showToast(`【特性解除】${displayName}`);
  }

  if (typeof P2P !== "undefined" && P2P.connected) {
    P2P.syncNow();
  }
  renderAll();
}

// 場のポケモンコンテキストメニュー（右クリックで呼び出し、サブメニュー方式＆特性宣言対応）
function showPokemonMenu(e, location, index, menuView = "main") {
  if (e && e.stopPropagation) e.stopPropagation();
  if (state.mustPromoteToActive) {
    showToast("⚠️ バトル場に出すベンチポケモンを選択してください");
    return;
  }
  const ctx = document.getElementById("ctx");
  const target = location === "active" ? state.myActive : state.myBench[index];
  if (!target) return;

  const locId = location === "active" ? "active" : `bench_${index}`;
  const displayName = getFieldPokemonDisplayName(location, index);

  ctx.classList.add("ctx-wide");

  if (menuView === "damage") {
    // ==========================================
    // サブメニュー①: ダメカン操作（連打対応：メニューを開いたまま維持）
    // ==========================================
    ctx.innerHTML = `
      <div class="ctx-header-row">
        <button class="ctx-back-btn" onclick="showPokemonMenu(event, '${location}', ${index}, 'main')">◀ 戻る</button>
        <span class="ctx-title-text">💥 ダメカンを載せる <small>(現在: ${target.damage})</small></span>
        <button class="ctx-zoom-btn" onclick="hideCtx()" title="閉じる" style="padding:2px 8px;">✖</button>
      </div>
      <div class="divider"></div>
      <div class="ctx-grid-2col">
        <button onclick="modifyDamage('${location}', ${index}, 10, true)">ダメカン +10</button>
        <button onclick="modifyDamage('${location}', ${index}, -10, true)">ダメカン -10</button>
        <button onclick="modifyDamage('${location}', ${index}, 50, true)">ダメカン +50</button>
        <button onclick="modifyDamage('${location}', ${index}, 100, true)">ダメカン +100</button>
        <button class="ctx-span-2" onclick="modifyDamage('${location}', ${index}, -999, true)">✨ ダメカン リセット (0にする)</button>
        <button class="ctx-span-2" style="background:#334155; color:#f8fafc; margin-top:4px; font-weight:bold; padding:6px;" onclick="hideCtx()">✖ 完了（閉じる）</button>
      </div>
    `;
  } else if (menuView === "condition" && location === "active") {
    // ==========================================
    // サブメニュー②: 特殊状態（バトル場のみ）
    // ==========================================
    const cond = (typeof ensurePokemonConditions === "function")
      ? ensurePokemonConditions(target)
      : (target.conditions || { poison: false, burn: false, special: null });
    const hasAny = !!(cond.poison || cond.burn || cond.special);

    const isPoison = !!cond.poison;
    const isBurn = !!cond.burn;
    const isParalyzed = cond.special === "paralyzed";
    const isConfused = cond.special === "confused";
    const isAsleep = cond.special === "asleep";

    ctx.innerHTML = `
      <div class="ctx-header-row">
        <button class="ctx-back-btn" onclick="showPokemonMenu(event, '${location}', ${index}, 'main')">◀ 戻る</button>
        <span class="ctx-title-text">🧪 特殊状態 <small>(${escapeHtml(displayName)})</small></span>
      </div>
      <div class="divider"></div>
      <div class="ctx-grid-2col">
        <button class="ctx-cond-btn ${isPoison ? 'active poison' : ''}" onclick="togglePokemonCondition('poison')">
          ${isPoison ? '✨ どくを治す' : '☠️ どくにする'}
        </button>
        <button class="ctx-cond-btn ${isBurn ? 'active burn' : ''}" onclick="togglePokemonCondition('burn')">
          ${isBurn ? '✨ やけどを治す' : '🔥 やけどにする'}
        </button>
        <button class="ctx-cond-btn ${isParalyzed ? 'active paralyzed' : ''}" onclick="togglePokemonCondition('paralyzed')">
          ${isParalyzed ? '✨ まひを治す' : '⚡ まひにする'}
        </button>
        <button class="ctx-cond-btn ${isConfused ? 'active confused' : ''}" onclick="togglePokemonCondition('confused')">
          ${isConfused ? '✨ こんらんを治す' : '😵 こんらんにする'}
        </button>
        <button class="ctx-cond-btn ${isAsleep ? 'active asleep' : ''}" onclick="togglePokemonCondition('asleep')">
          ${isAsleep ? '✨ ねむりを治す' : '💤 ねむりにする'}
        </button>
        ${hasAny ? `<button class="ctx-cond-btn clear ctx-span-2" onclick="clearActivePokemonConditions()">✨ 特殊状態を全回復</button>` : ''}
      </div>
    `;
  } else if (menuView === "deck") {
    // ==========================================
    // サブメニュー③: 山札に戻す（案2: シャッフル / 山札の下）
    // ==========================================
    ctx.innerHTML = `
      <div class="ctx-header-row">
        <button class="ctx-back-btn" onclick="showPokemonMenu(event, '${location}', ${index}, 'main')">◀ 戻る</button>
        <span class="ctx-title-text">🎴 山札に戻す <small>(${escapeHtml(displayName)})</small></span>
      </div>
      <div class="divider"></div>
      <div style="display:flex; flex-direction:column; gap:6px; margin-top:4px;">
        <button class="ctx-deck-btn ctx-deck-shuffle" onclick="returnPokemonToDeck('${location}', ${index}, 'shuffle')">
          <span class="ctx-deck-btn-title">🔀 山札に戻してシャッフル</span>
          <span class="ctx-deck-btn-desc">ポケモン本体・どうぐ・エネルギーを山札へ戻しシャッフル</span>
        </button>
        <button class="ctx-deck-btn ctx-deck-bottom" onclick="returnPokemonToDeck('${location}', ${index}, 'bottom')">
          <span class="ctx-deck-btn-title">⬇️ 山札の下へ送る</span>
          <span class="ctx-deck-btn-desc">ポケモン本体・どうぐ・エネルギーを山札の底に送る</span>
        </button>
      </div>
    `;
  } else {
    // ==========================================
    // メインメニュー
    // ==========================================
    let extraBtns = "";

    // 手札選択中のカードがある場合、このポケモンにつける選択肢（2列ぶち抜き）
    if (state.selectedHandIndex >= 0 && state.myHand[state.selectedHandIndex]) {
      const handCard = state.myHand[state.selectedHandIndex];
      extraBtns += `<button class="ctx-span-2" style="color:#60a5fa; font-weight:bold;" onclick="attachSelectedHandCard('${location}', ${index})">➕ 手札「${escapeHtml(handCard.name)}」をつける</button>`;
    }

    // どうぐが付いている場合、破棄する選択肢
    if (target.tool) {
      extraBtns += `<button onclick="detachTool('${locId}', 'trash')">🎒 どうぐ破棄</button>`;
    }

    // エネルギーが付いている場合、全破棄する選択肢
    if (target.energies && target.energies.length > 0) {
      extraBtns += `<button onclick="detachAllEnergy('${locId}')">⚡ エネ全破棄 (${target.energies.length})</button>`;
    }

    // サブメニューランチャー（ダメカン操作 ＆ 特殊状態）
    let subLaunchersHtml = "";
    if (location === "active") {
      subLaunchersHtml = `
        <div class="ctx-grid-2col">
          <button class="ctx-submenu-nav" onclick="showPokemonMenu(event, '${location}', ${index}, 'damage')">💥 ダメカンを載せる ▶</button>
          <button class="ctx-submenu-nav" onclick="showPokemonMenu(event, '${location}', ${index}, 'condition')">🧪 特殊状態 ▶</button>
        </div>
      `;
    } else {
      subLaunchersHtml = `
        <div class="ctx-grid-2col">
          <button class="ctx-span-2 ctx-submenu-nav" onclick="showPokemonMenu(event, '${location}', ${index}, 'damage')">💥 ダメカンを載せる ▶</button>
        </div>
      `;
    }

    // ベンチポケモンの場合、一番押しやすい上部に「バトル場に出す / 交代」を優先配置
    const benchPromoteBtnHtml = location === "bench"
      ? (state.myActive
          ? `<button class="ctx-span-2" style="background:#2563eb; color:#fff; font-weight:bold; padding:7px 10px; margin-bottom:3px; font-size:12.5px;" onclick="swapActiveBench(${index})">🔄 バトル場と交代</button>`
          : `<button class="ctx-span-2" style="background:#16a34a; color:#fff; font-weight:bold; padding:7px 10px; margin-bottom:3px; font-size:12.5px;" onclick="swapActiveBench(${index})">⚔️ バトル場に出す</button>`)
      : "";

    const abilityBtnStyle = target.abilityUsed
      ? "background:#475569; color:#cbd5e1; border:1px solid #64748b;"
      : "";
    const abilityBtnText = target.abilityUsed
      ? "🔄 特性使用済み (クリックで解除)"
      : "✨ 特性を使う";

    ctx.innerHTML = `
      <div class="ctx-header-row">
        <span class="ctx-title-text">${escapeHtml(displayName)} <small>(ダメカン: ${target.damage})</small></span>
        <button class="ctx-zoom-btn" onclick="openOwnPokemonZoom('${location}', ${index})" title="ダブルクリックでも拡大できます">🔍 詳細</button>
      </div>
      <div class="divider"></div>
      ${benchPromoteBtnHtml}
      <button class="ctx-btn-ability ctx-span-2" style="${abilityBtnStyle}" onclick="usePokemonAbility('${location}', ${index})">${abilityBtnText}</button>
      ${subLaunchersHtml}
      <div class="ctx-grid-2col">
        ${extraBtns}
        <button onclick="removePokemonToTrash('${location}', ${index})">🗑️ トラッシュへ</button>
        <button onclick="removePokemonToHand('${location}', ${index})">🖐️ 手札に戻す</button>
        <button class="ctx-span-2" onclick="showPokemonMenu(event, '${location}', ${index}, 'deck')">🎴 山札に戻す ▶</button>
        <button class="ctx-span-2" style="background:#7f1d1d; color:#fecaca; font-weight:bold; border:1px solid #ef4444; margin-top:2px;" onclick="knockoutPokemon('${location}', ${index})">💀 このポケモンを気絶させる</button>
      </div>
    `;
  }

  // 位置の調整: 初回表示時（画面端見切れ対策・下端オーバー時は上方向に反転展開）
  if (e && e.clientX !== undefined && menuView === "main") {
    ctx.style.visibility = "hidden";
    ctx.classList.remove("hidden");
    const menuW = ctx.offsetWidth || 280;
    const menuH = ctx.offsetHeight || 260;
    let posX = e.clientX + 10;
    let posY = e.clientY + 10;

    if (posX + menuW > window.innerWidth - 10) {
      posX = Math.max(10, window.innerWidth - menuW - 10);
    }
    if (posY + menuH > window.innerHeight - 10) {
      posY = Math.max(10, e.clientY - menuH - 8);
    }

    ctx.style.left = `${posX}px`;
    ctx.style.top = `${posY}px`;
    ctx.style.visibility = "visible";
  } else {
    ctx.classList.remove("hidden");
  }
}

// 特殊状態（どく・やけど・まひ・こんらん・ねむり）のトグル処理
function togglePokemonCondition(condType) {
  hideCtx();
  if (!state.myActive) return;
  const pk = state.myActive;
  const cond = (typeof ensurePokemonConditions === "function")
    ? ensurePokemonConditions(pk)
    : (pk.conditions = pk.conditions || { poison: false, burn: false, special: null });

  const name = pk.card.name;
  const specialLabels = {
    paralyzed: "まひ",
    confused: "こんらん",
    asleep: "ねむり"
  };

  if (condType === "poison") {
    cond.poison = !cond.poison;
    if (cond.poison && typeof SoundEffects !== "undefined") SoundEffects.playCondition("poison");
    const msg = cond.poison
      ? `バトル場の「${name}」が【☠️どく】状態になりました`
      : `バトル場の「${name}」の【☠️どく】が回復しました`;
    addLog(msg, {
      cards: [pk.card],
      badge: cond.poison ? "☠️ どく状態" : "✨ どく回復"
    });
    showToast(msg);
  } else if (condType === "burn") {
    cond.burn = !cond.burn;
    if (cond.burn && typeof SoundEffects !== "undefined") SoundEffects.playCondition("burn");
    const msg = cond.burn
      ? `バトル場の「${name}」が【🔥やけど】状態になりました`
      : `バトル場の「${name}」の【🔥やけど】が回復しました`;
    addLog(msg, {
      cards: [pk.card],
      badge: cond.burn ? "🔥 やけど状態" : "✨ やけど回復"
    });
    showToast(msg);
  } else if (condType === "paralyzed" || condType === "confused" || condType === "asleep") {
    const label = specialLabels[condType];
    const icon = condType === "paralyzed" ? "⚡" : (condType === "confused" ? "😵" : "💤");
    if (cond.special === condType) {
      cond.special = null;
      const msg = `バトル場の「${name}」の【${icon}${label}】が回復しました`;
      addLog(msg, {
        cards: [pk.card],
        badge: `✨ ${label}回復`
      });
      showToast(msg);
    } else {
      const prevSpecial = cond.special;
      cond.special = condType;
      if (typeof SoundEffects !== "undefined") SoundEffects.playCondition(condType);
      const overwriteNote = prevSpecial ? `（※【${specialLabels[prevSpecial]}】から上書き）` : "";
      const msg = `バトル場の「${name}」が【${icon}${label}】状態になりました${overwriteNote}`;
      addLog(msg, {
        cards: [pk.card],
        badge: `${icon} ${label}状態`
      });
      showToast(msg);
    }
  }

  renderAll();
}

function clearActivePokemonConditions() {
  hideCtx();
  if (!state.myActive) return;
  const pk = state.myActive;
  const hadNames = (typeof getPokemonConditionNames === "function") ? getPokemonConditionNames(pk) : [];
  if (typeof clearPokemonConditions === "function") {
    clearPokemonConditions(pk);
  } else {
    pk.conditions = { poison: false, burn: false, special: null };
  }
  if (hadNames.length > 0) {
    const msg = `バトル場の「${pk.card.name}」の特殊状態（${hadNames.join("・")}）がすべて回復しました`;
    addLog(msg, {
      cards: [pk.card],
      badge: "✨ 特殊状態回復"
    });
    showToast(`✨ ${pk.card.name} の特殊状態がすべて回復しました`);
  }
  renderAll();
}

window.togglePokemonCondition = togglePokemonCondition;
window.clearActivePokemonConditions = clearActivePokemonConditions;

function attachSelectedHandCard(location, index) {
  hideCtx();
  if (state.selectedHandIndex < 0 || state.selectedHandIndex >= state.myHand.length) return;
  const targetLoc = location === "active" ? "active" : `bench_${index}`;
  window.handlePokemonDrop({
    preventDefault: () => {},
    stopPropagation: () => {},
    dataTransfer: { getData: () => state.selectedHandIndex.toString() },
    currentTarget: null
  }, targetLoc);
}

function detachAllEnergy(location) {
  hideCtx();
  const pokemon = getPokemonByLocation(location);
  if (!pokemon || !pokemon.energies || pokemon.energies.length === 0) return;
  const count = pokemon.energies.length;
  const trashedEnergies = [];
  while (pokemon.energies.length > 0) {
    const e = pokemon.energies.pop();
    trashedEnergies.push(e);
    state.myTrash.push(e);
  }
  addLog(`「${pokemon.card.name}」のエネルギー${count}枚をすべてトラッシュしました`, {
    cards: trashedEnergies,
    badge: "⚡ エネルギー全トラッシュ"
  });
  showToast(`エネルギー全トラッシュ: ${count}枚`);
  renderAll();
}

function hideCtx() {
  document.getElementById("ctx").classList.add("hidden");
}

function modifyDamage(location, index, delta, keepMenu = false) {
  if (!keepMenu) hideCtx();
  const target = location === "active" ? state.myActive : state.myBench[index];
  if (!target) return;
  pushHistorySnapshot("ダメカン変更");
  const prevDamage = target.damage || 0;
  if (delta === -999) {
    target.damage = 0;
  } else {
    target.damage = Math.max(0, target.damage + delta);
  }
  const actualDelta = target.damage - prevDamage;
  const locId = location === "active" ? "active" : `bench_${index}`;
  addLog(`「${target.card.name}」のダメカンを ${target.damage} に変更しました`, {
    cards: state.isSetupPhase ? [] : [target.card],
    badge: "💥 ダメカン変更"
  });
  renderAll();
  if (actualDelta !== 0 && typeof triggerBoardEffect === "function") {
    triggerBoardEffect({
      fxType: "damage",
      location: locId,
      delta: actualDelta
    });
  }
  if (keepMenu) {
    const titleSmall = document.querySelector("#ctx .ctx-title-text small");
    if (titleSmall) {
      titleSmall.textContent = `(現在: ${target.damage})`;
    }
  }
}

function swapActiveBench(benchIndex) {
  hideCtx();
  const benchTarget = state.myBench[benchIndex];
  if (!benchTarget) return;

  pushHistorySnapshot("バトル場とベンチの交代");
  const prevActive = state.myActive;

  // ポケカ公式ルール: バトル場からベンチに下がったポケモンの特殊状態はすべて自動回復する
  let curedNote = "";
  if (prevActive && typeof hasAnyPokemonCondition === "function" && hasAnyPokemonCondition(prevActive)) {
    const curedNames = getPokemonConditionNames(prevActive);
    clearPokemonConditions(prevActive);
    if (curedNames.length > 0) {
      curedNote = `（ベンチに下がった「${prevActive.card.name}」の特殊状態【${curedNames.join("・")}】が回復しました）`;
    }
  }
  // 念のため新しく出る側もベンチにいた間は状態異常なしを保証
  if (benchTarget && typeof clearPokemonConditions === "function") {
    clearPokemonConditions(benchTarget);
  }

  state.myActive = benchTarget;
  state.myBench[benchIndex] = prevActive;

  addLog(`バトル場とベンチを交代しました（新バトル場: ${state.myActive.card.name}）${curedNote}`, {
    oppText: state.isSetupPhase
      ? `バトル場とベンチのポケモンを入れ替えました`
      : `バトル場とベンチを交代しました（新バトル場: ${state.myActive.card.name}）${curedNote}`,
    cards: state.isSetupPhase ? [] : [state.myActive.card],
    badge: "🔄 バトル場交代"
  });
  showToast(`交代: ${state.myActive.card.name}${curedNote ? ' (状態異常回復)' : ''}`);
  renderAll();

  if (typeof triggerBoardEffect === "function") {
    triggerBoardEffect({
      fxType: "swap",
      benchIndex: benchIndex
    });
  }
}

/**
 * ポケモンスロットから本体カードおよびすべての進化元カードの配列を取得
 * @param {Object} slot { card, previousStages, tool, energies }
 * @returns {Array<Object>} [card, ...previousStages]
 */
function getPokemonCardsList(slot) {
  if (!slot || !slot.card) return [];
  const list = [slot.card];
  if (Array.isArray(slot.previousStages)) {
    list.push(...slot.previousStages);
  }
  return list;
}

function removePokemonToTrash(location, index) {
  hideCtx();
  const target = location === "active" ? state.myActive : state.myBench[index];
  if (!target) return;

  pushHistorySnapshot("ポケモンをトラッシュへ");
  const pokeCards = getPokemonCardsList(target);
  pokeCards.forEach(c => state.myTrash.push(c));
  if (target.tool) state.myTrash.push(target.tool);
  if (target.energies) target.energies.forEach(e => state.myTrash.push(e));

  if (location === "active") state.myActive = null;
  else state.myBench[index] = null;

  const prevCount = Array.isArray(target.previousStages) ? target.previousStages.length : 0;
  const extraNote = prevCount > 0 ? `（進化元${prevCount}枚含む計${pokeCards.length}枚）` : "";
  addLog(`「${target.card.name}」${extraNote}（および付随カード）をトラッシュへ送りました`, {
    cards: pokeCards,
    badge: "🗑️ ポケモンをトラッシュ"
  });
  showToast(`「${target.card.name}」${extraNote}をトラッシュへ送りました`);
  renderAll();
}

function removePokemonToHand(location, index) {
  hideCtx();
  const target = location === "active" ? state.myActive : state.myBench[index];
  if (!target) return;

  pushHistorySnapshot("ポケモンを手札に戻す");
  const pokeCards = getPokemonCardsList(target);
  pokeCards.forEach(c => state.myHand.push(c));
  if (target.tool) state.myTrash.push(target.tool);
  if (target.energies) target.energies.forEach(e => state.myTrash.push(e));

  if (location === "active") state.myActive = null;
  else state.myBench[index] = null;

  const prevCount = Array.isArray(target.previousStages) ? target.previousStages.length : 0;
  const extraNote = prevCount > 0 ? `（進化元${prevCount}枚含む計${pokeCards.length}枚）` : "";
  addLog(`「${target.card.name}」${extraNote}を手札に戻しました（どうぐ・エネルギーは破棄）`, {
    oppText: state.isSetupPhase
      ? `配置していたポケモンを手札に戻しました`
      : `「${target.card.name}」${extraNote}を手札に戻しました（どうぐ・エネルギーは破棄）`,
    cards: state.isSetupPhase ? [] : pokeCards,
    badge: "🖐️ ポケモンを手札へ"
  });
  showToast(`「${target.card.name}」${extraNote}を手札に戻しました`);
  renderAll();
}

/**
 * 自分のポケモンを山札に戻す（シャッフルまたは山札の底）
 * @param {"active" | "bench"} location
 * @param {number} index
 * @param {"shuffle" | "bottom"} mode
 */
function returnPokemonToDeck(location, index, mode = "shuffle") {
  hideCtx();
  const target = location === "active" ? state.myActive : state.myBench[index];
  if (!target || !target.card) return;

  pushHistorySnapshot(mode === "shuffle" ? "ポケモンを山札へ戻しシャッフル" : "ポケモンを山札の下へ送る");

  const cardsToDeck = getPokemonCardsList(target);
  if (target.tool) cardsToDeck.push(target.tool);
  if (target.energies && Array.isArray(target.energies)) {
    target.energies.forEach(e => cardsToDeck.push(e));
  }

  if (location === "active") {
    state.myActive = null;
    if (typeof clearPokemonConditions === "function") {
      clearPokemonConditions(target);
    }
  } else {
    state.myBench[index] = null;
  }

  const name = target.card.name;
  const count = cardsToDeck.length;

  if (mode === "bottom") {
    cardsToDeck.forEach(c => state.myDeck.push(c));
    const extraInfo = count > 1 ? `（どうぐ・エネルギー等含む計${count}枚）` : "";
    addLog(`「${name}」${extraInfo}を山札の下に戻しました`, {
      oppText: state.isSetupPhase
        ? `配置していたポケモン${extraInfo}を山札の下に戻しました`
        : `「${name}」${extraInfo}を山札の下に戻しました`,
      badge: "⬇️ 山札の下へ"
    });
    showToast(`「${name}」を山札の下に戻しました (${count}枚)`);
  } else {
    cardsToDeck.forEach(c => state.myDeck.push(c));
    state.myDeck = shuffleArray(state.myDeck);
    const extraInfo = count > 1 ? `（どうぐ・エネルギー等含む計${count}枚）` : "";
    addLog(`「${name}」${extraInfo}を山札に戻してシャッフルしました`, {
      oppText: state.isSetupPhase
        ? `配置していたポケモン${extraInfo}を山札に戻してシャッフルしました`
        : `「${name}」${extraInfo}を山札に戻してシャッフルしました`,
      badge: "🔀 山札戻しシャッフル"
    });
    showToast(`「${name}」を山札に戻してシャッフルしました (${count}枚)`);
  }

  renderAll();
}


// =============================================================================
// 気絶（Knockout）および サイド取得・相手待機演出
// =============================================================================

let _prizePickState = {
  active: false,
  forOpponent: false,
  victimName: "",
  pickedCount: 0,
  initialPrizes: []
};

/** 自分のポケモンを気絶させる（相手にサイド取得権を付与） */
function knockoutPokemon(location, index) {
  hideCtx();
  const target = location === "active" ? state.myActive : state.myBench[index];
  if (!target) return;

  pushHistorySnapshot("ポケモンを気絶させる");
  const pokemonName = target.card.name;

  const locId = location === "active" ? "active" : `bench_${index}`;
  if (typeof triggerBoardEffect === "function") {
    triggerBoardEffect({
      fxType: "knockout",
      location: locId
    });
  }

  const pokeCards = getPokemonCardsList(target);
  pokeCards.forEach(c => state.myTrash.push(c));
  if (target.tool) state.myTrash.push(target.tool);
  if (target.energies) target.energies.forEach(e => state.myTrash.push(e));

  if (location === "active") state.myActive = null;
  else state.myBench[index] = null;

  const prevCount = Array.isArray(target.previousStages) ? target.previousStages.length : 0;
  const extraNote = prevCount > 0 ? `（進化元${prevCount}枚含む計${pokeCards.length}枚トラッシュ）` : "";
  addLog(`【気絶】「${pokemonName}」${extraNote}が気絶しました！（相手がサイドを取得します）`, {
    oppText: `【気絶】相手の「${pokemonName}」${extraNote}が気絶しました！（サイドを取得してください）`,
    cards: pokeCards,
    badge: "💀 ポケモン気絶"
  });
  showToast(`💀 「${pokemonName}」が気絶しました`);
  renderAll();

  if (state.isSoloMode) {
    // 一人回しモード: デッキ2（相手側）のサイド取得画面を表示
    openPrizePickModal({ forOpponent: true, victimName: pokemonName });
  } else {
    // オンライン対戦: 相手にサイド取得モーダル起動を要求、自分は待機オーバーレイを表示
    showPrizeWaitOverlay(state.oppName || "相手プレイヤー");
    if (typeof P2P !== "undefined" && P2P.connected) {
      P2P.send({
        t: "opp_remote_action",
        action: "knockout_self_grant_prize",
        location: location === "active" ? "active" : "bench",
        index: index,
        victimName: pokemonName
      });
      P2P.syncNow();
    }
  }
}

/** 相手のポケモンを気絶させる（自分がサイドを取得） */
function knockoutOpponentPokemon(location, index) {
  hideCtx();
  const target = location === "opp-active" ? state.oppActive : state.oppBench[index];
  if (!target) return;

  const pokemonName = target.card.name;

  const locId = location === "opp-active" ? "opp-active" : `opp-bench_${index}`;
  if (typeof triggerBoardEffect === "function") {
    triggerBoardEffect({
      fxType: "knockout",
      location: locId
    });
  }

  const pokeCards = getPokemonCardsList(target);
  pokeCards.forEach(c => state.oppTrash.push(c));
  if (target.tool) state.oppTrash.push(target.tool);
  if (target.energies) target.energies.forEach(e => state.oppTrash.push(e));

  if (location === "opp-active") state.oppActive = null;
  else state.oppBench[index] = null;

  const prevCount = Array.isArray(target.previousStages) ? target.previousStages.length : 0;
  const extraNote = prevCount > 0 ? `（進化元${prevCount}枚含む計${pokeCards.length}枚トラッシュ）` : "";
  addLog(`【気絶】相手の「${pokemonName}」${extraNote}が気絶しました！（サイドを取得してください）`, {
    oppText: `【気絶】あなたの「${pokemonName}」${extraNote}が気絶しました！（相手がサイドを取得中）`,
    cards: pokeCards,
    badge: "💀 ポケモン気絶"
  });
  showToast(`💀 相手の「${pokemonName}」が気絶しました`);
  renderAll();

  if (state.isSoloMode) {
    // 一人回しモード: 自分（デッキ1）のサイド取得画面を表示
    openPrizePickModal({ forOpponent: false, victimName: pokemonName });
  } else {
    // オンライン対戦: 自分がサイド取得画面を開き、相手には待機オーバーレイを表示
    openPrizePickModal({ forOpponent: false, victimName: pokemonName });
    if (typeof P2P !== "undefined" && P2P.connected) {
      P2P.send({
        t: "opp_remote_action",
        action: "knockout_by_opponent",
        location: location === "opp-active" ? "active" : "bench",
        index: index,
        victimName: pokemonName
      });
      P2P.syncNow();
    }
  }
}

/** サイドカード取得用ポップアップを開く */
function openPrizePickModal({ forOpponent = false, victimName = "" }) {
  const prizesList = forOpponent ? state.oppPrizesList : state.myPrizes;
  if (!Array.isArray(prizesList) || prizesList.length === 0) {
    showToast("⚠️ 残りサイドカードがありません");
    return;
  }

  _prizePickState = {
    active: true,
    forOpponent: forOpponent,
    victimName: victimName,
    pickedCount: 0,
    initialPrizes: [...prizesList]
  };

  const modal = document.getElementById("prize-pick-modal");
  const title = document.getElementById("prize-pick-title");
  const desc = document.getElementById("prize-pick-desc");
  const cardsGrid = document.getElementById("prize-pick-cards");
  const remainCount = document.getElementById("prize-pick-remain-count");
  const pickedInfo = document.getElementById("prize-pick-picked-info");

  if (title) {
    title.textContent = forOpponent
      ? `【一人回し】${state.oppName} のサイド取得`
      : `🏆 「${victimName || 'ポケモン'}」気絶によるサイド取得`;
  }
  if (desc) {
    desc.innerHTML = `取得するサイドカードをクリックしてください（残りサイド: <b id="prize-pick-remain-count">${prizesList.length}</b>枚）`;
  }
  if (remainCount) remainCount.textContent = prizesList.length;
  if (pickedInfo) pickedInfo.textContent = `取得済み: 0枚`;

  cardsGrid.innerHTML = "";
  _prizePickState.initialPrizes.forEach((card, idx) => {
    registerCard(card);
    const wrap = document.createElement("div");
    wrap.className = "prize-slot-wrap";
    const hasImg = typeof isCardImageValid === "function" ? isCardImageValid(card) : !!card.imageUrl;
    const probe = (card.imageUrl && hasImg) ? `<img src="${escapeHtml(card.imageUrl)}" style="display:none;" referrerpolicy="no-referrer" onerror="window.onCardImageError(this, '${escapeHtml(card.imageUrl)}'); const pf = this.closest('.prize-front'); if(pf){ pf.classList.remove('has-img'); pf.classList.add('card-fallback-white'); pf.style.backgroundImage='none'; }">` : '';
    wrap.innerHTML = `
      <div class="prize-card-inner" id="prize-card-${idx}">
        <div class="prize-face prize-back">
          <span class="prize-back-number">サイド ${idx + 1}</span>
          <span class="prize-back-hint">タップでめくる</span>
        </div>
        <div class="prize-face prize-front ${hasImg ? 'has-img' : 'card-fallback-white'}" ${hasImg ? `style="background-image: url('${card.imageUrl}');"` : ''}>
          ${probe}
          <div class="prize-front-name">${escapeHtml(card.name)}</div>
          <div class="prize-front-sub">${escapeHtml(card.sub || card.category || '')}</div>
        </div>
      </div>
    `;
    const inner = wrap.querySelector(".prize-card-inner");
    inner.onclick = () => pickPrizeCard(idx, card, inner);
    cardsGrid.appendChild(wrap);
  });

  modal.classList.remove("hidden");
}

/** サイドカードをクリックしてめくり、手札へ取得 */
function pickPrizeCard(idx, card, inner) {
  if (!_prizePickState.active) return;
  if (inner.classList.contains("flipped")) return;

  inner.classList.add("flipped");
  inner.onclick = null;

  if (window.SoundEffects) {
    SoundEffects.playSideFlip();
  }

  const stamp = document.createElement("div");
  stamp.className = "prize-picked-stamp";
  stamp.textContent = "✔ 取得済";
  const frontFace = inner.querySelector(".prize-front") || inner;
  frontFace.appendChild(stamp);

  _prizePickState.pickedCount++;

  // カードを手札へ加える
  if (!_prizePickState.forOpponent) {
    const pIdx = state.myPrizes.indexOf(card);
    if (pIdx !== -1) {
      state.myPrizes.splice(pIdx, 1);
    }
    state.myHand.push(card);
    addLog(`【サイド取得】サイドから「${card.name}」を取得し手札に加えました（残り: ${state.myPrizes.length}枚）`, {
      oppText: `相手がサイドを1枚取得しました（残りサイド: ${state.myPrizes.length}枚）`,
      cards: [card],
      badge: "🏆 サイド取得"
    });
    showToast(`サイド取得: ${card.name}`);

    if (typeof P2P !== "undefined" && P2P.connected && !state.isSoloMode) {
      P2P.send({
        t: "opp_remote_action",
        action: "prize_taken_sync",
        remainPrizes: state.myPrizes.length
      });
      P2P.syncNow();
    }
  } else {
    // 一人回し相手側
    const pIdx = state.oppPrizesList.indexOf(card);
    if (pIdx !== -1) {
      state.oppPrizesList.splice(pIdx, 1);
    }
    state.oppPrizes = state.oppPrizesList.length;
    state.oppHand.push(card);
    state.oppHandCount = state.oppHand.length;
    addLog(`【一人回し・サイド取得】${state.oppName} がサイドから「${card.name}」を取得し手札に加えました（残り: ${state.oppPrizes}枚）`, {
      cards: [card],
      badge: "🏆 相手サイド取得"
    });
    showToast(`${state.oppName} がサイド取得: ${card.name}`);
  }

  const remain = _prizePickState.forOpponent ? state.oppPrizesList.length : state.myPrizes.length;
  const remainCount = document.getElementById("prize-pick-remain-count");
  const pickedInfo = document.getElementById("prize-pick-picked-info");
  if (remainCount) remainCount.textContent = remain;
  if (pickedInfo) pickedInfo.textContent = `取得済み: ${_prizePickState.pickedCount}枚 (残りサイド: ${remain}枚)`;

  if (typeof triggerBoardEffect === "function") {
    triggerBoardEffect({
      fxType: "prize",
      destination: "hand",
      card: card
    });
  }

  renderAll();

  // サイドを取り切った場合は自動勝利へ遷移！
  if (remain === 0) {
    setTimeout(() => {
      finishPrizePicking(true);
      const winnerName = _prizePickState.forOpponent ? state.oppName : state.myName;
      addLog(`【決着】${winnerName} がすべてのサイドカードを取りきり勝利しました！`, {
        oppText: `【決着】${winnerName} がすべてのサイドカードを取りきり勝利しました！`,
        badge: "🏆 勝利！"
      });
      if (typeof P2P !== "undefined" && P2P.connected && !state.isSoloMode) {
        P2P.send({
          t: "victory",
          winnerName: state.myName,
          reason: "すべてのサイドカードを取りきりました！"
        });
      }
      if (typeof playGrandVictoryEffect === "function") {
        playGrandVictoryEffect(winnerName, "すべてのサイドカードを取りきりました！", _prizePickState.forOpponent);
      }
    }, 750);
  }
}

/** サイド取得完了ボタン押下時 */
function finishPrizePicking(isAutoVictory = false) {
  const modal = document.getElementById("prize-pick-modal");
  if (modal) modal.classList.add("hidden");

  if (_prizePickState.active && !isAutoVictory) {
    if (typeof P2P !== "undefined" && P2P.connected && !state.isSoloMode) {
      P2P.send({
        t: "opp_remote_action",
        action: "finish_prize_pick"
      });
      P2P.syncNow();
    }
  }

  _prizePickState.active = false;

  if (!isAutoVictory) {
    if (!state.myActive && state.myBench.some(b => b !== null)) {
      if (typeof showPromoteActiveModal === "function") {
        showPromoteActiveModal();
      }
    }
  }

  renderAll();
}

/** 相手がサイド取得中の待機オーバーレイを表示 */
function showPrizeWaitOverlay(pickerName = "相手プレイヤー") {
  const overlay = document.getElementById("prize-wait-overlay");
  const title = document.getElementById("prize-wait-title");
  const desc = document.getElementById("prize-wait-desc");
  if (!overlay) return;
  if (title) title.textContent = `🏆 ${escapeHtml(pickerName)} がサイドを取得中...`;
  if (desc) desc.textContent = `${escapeHtml(pickerName)} がサイドカードを選んでいます。そのままお待ちください。`;
  overlay.classList.remove("hidden");
}

/** 待機オーバーレイを閉じる */
function hidePrizeWaitOverlay() {
  const overlay = document.getElementById("prize-wait-overlay");
  if (overlay) overlay.classList.add("hidden");
}

// =============================================================================
// ターン進行（先攻・後攻 Nターン目管理 ＆ バナー演出 ＆ 強制トップドロー）
// =============================================================================

/**
 * ターン情報取得
 * 「先攻」と「後攻」が終わって1ターン。
 * 例:
 * step=1 -> 先攻1ターン目
 * step=2 -> 後攻1ターン目
 * step=3 -> 先攻2ターン目
 * step=4 -> 後攻2ターン目
 */
function getTurnInfo(turnStep = (state.turnStep || 1)) {
  const step = Math.max(1, turnStep | 0);
  const round = Math.floor((step + 1) / 2);
  const isFirstSide = (step % 2 === 1);
  const sideName = isFirstSide ? "先攻" : "後攻";
  const label = `${sideName}${round}ターン目`;

  // 先攻プレイヤーの特定: state.firstPlayer ("me" または "opp")
  const firstRole = state.firstPlayer || "me";
  const isMeFirst = (firstRole === "me");

  let isMyTurn = false;
  let activePlayerName = "";
  let activeRole = "";

  if (state.isSoloMode) {
    // 一人回しモードではターンごとに上下がswapされるため、常に操作席（下側：state.myName）がアクティブ
    isMyTurn = true;
    activeRole = "me";
    activePlayerName = state.myName;
  } else {
    activeRole = isFirstSide
      ? (isMeFirst ? "me" : "opp")
      : (isMeFirst ? "opp" : "me");
    isMyTurn = (activeRole === "me");
    activePlayerName = isMyTurn ? state.myName : state.oppName;
  }

  return {
    step,
    round,
    isFirstSide,
    sideName,
    label,
    activeRole,
    activePlayerName,
    isMyTurn
  };
}

let _turnBannerTimer = null;
let _turnBannerCallback = null;

/**
 * ３）ターン切り替え演出バナー
 * かっこいい感じで右から流れてきて、中央で2秒止まって、左に流れていく
 */
function playTurnChangeBanner(turnInfo, onComplete = null) {
  const overlay = document.getElementById("turn-banner-overlay");
  const track = document.getElementById("turn-banner-track");
  const subEl = document.getElementById("turn-banner-sub");
  const mainEl = document.getElementById("turn-banner-main");
  if (!overlay || !track || !subEl || !mainEl) {
    if (typeof onComplete === "function") onComplete();
    return;
  }

  // 既存タイマーをクリア
  if (_turnBannerTimer) {
    clearTimeout(_turnBannerTimer);
    _turnBannerTimer = null;
  }
  _turnBannerCallback = onComplete;

  const info = turnInfo || getTurnInfo(state.turnStep || 1);
  const isMe = !!info.isMyTurn;

  subEl.textContent = `${info.isFirstSide ? '⚡' : '🛡️'} ${info.label}`;
  mainEl.textContent = `【${info.activePlayerName}】のターン！`;

  track.className = `turn-banner-track ${isMe ? 'is-me' : 'is-opp'}`;
  overlay.classList.remove("hidden");
  overlay.classList.add("clickable");

  // ターン開始効果音（turnstart.mp3）を再生
  if (window.SoundEffects) {
    SoundEffects.playTurnStart();
  }

  // アニメーションのリセットと再トリガー
  void track.offsetWidth;
  track.classList.add("animate-turn-slide");

  _turnBannerTimer = setTimeout(() => {
    dismissTurnBannerEarly();
  }, 2700);
}

/** ターン切り替えバナーを早期終了・スキップする */
function dismissTurnBannerEarly() {
  const overlay = document.getElementById("turn-banner-overlay");
  const track = document.getElementById("turn-banner-track");
  if (overlay) {
    overlay.classList.add("hidden");
    overlay.classList.remove("clickable");
  }
  if (track) {
    track.classList.remove("animate-turn-slide");
  }
  if (_turnBannerTimer) {
    clearTimeout(_turnBannerTimer);
    _turnBannerTimer = null;
  }
  const cb = _turnBannerCallback;
  _turnBannerCallback = null;
  if (typeof cb === "function") {
    setTimeout(cb, 60);
  }
}
window.dismissTurnBannerEarly = dismissTurnBannerEarly;

let _pendingPromoteCallback = null;

/**
 * ターン開始時のバトル場ポケモン存在チェック
 * １）ベンチにポケモンがいる場合は出撃モーダルを展開（出撃まで他操作を完全ロック）
 * ２）ベンチにもポケモンがいない場合は「負け」
 */
function checkTurnStartActiveCondition(onReady) {
  if (state.isSetupPhase) {
    if (typeof onReady === "function") onReady();
    return;
  }

  // バトル場にポケモンがいる場合はそのまま続行
  if (state.myActive) {
    state.mustPromoteToActive = false;
    if (typeof onReady === "function") onReady();
    return;
  }

  // バトル場が空の場合、ベンチポケモンを走査
  const benchIndices = [];
  state.myBench.forEach((b, idx) => {
    if (b && b.card) benchIndices.push(idx);
  });

  // ２）ベンチにポケモンがおらず、バトル場に出せない場合は「負け」
  if (benchIndices.length === 0) {
    state.mustPromoteToActive = false;
    handleNoPokemonDefeat();
    return;
  }

  // １）ベンチにポケモンがいる場合は出撃選出フェーズへ移行（出撃完了まで操作ロック）
  state.mustPromoteToActive = true;
  showPromoteActiveModal(benchIndices, onReady);
}

/** 場にポケモンがいなくなったプレイヤーの敗北処理（ポケカ公式ルール準拠） */
function handleNoPokemonDefeat() {
  const reason = "場にポケモンがいなくなったため、敗北となりました";
  addLog(`【対戦決着】場にポケモンがいなくなったため、【${state.myName}】の敗北となります。`, {
    oppText: `【対戦決着】相手の場にポケモンがいなくなったため、あなたの勝利となります！`,
    badge: "💀 敗北確定"
  });

  if (typeof P2P !== "undefined" && P2P.connected && !state.isSoloMode) {
    P2P.send({
      t: "victory",
      winnerName: state.oppName,
      reason: "相手の場にポケモンがいなくなりました！"
    });
    P2P.syncNow();
  }

  // 自分側画面で敗北/終了画面を表示
  if (typeof playGrandVictoryEffect === "function") {
    playGrandVictoryEffect(state.oppName, reason, false);
  } else {
    alert("【敗北】場にポケモンがいなくなったため、あなたの負けとなります。");
  }
}

/** バトル場不在時の出撃選出モーダル（操作ロック・背景クリックで閉じない） */
function showPromoteActiveModal(benchIndices, onComplete) {
  _pendingPromoteCallback = onComplete;

  addLog(`【出撃待ち】バトル場が空のため、ベンチからバトル場に出すポケモンを選択してください`, {
    oppText: `相手がバトル場に出すベンチポケモンを選択しています...`,
    badge: "⚠️ 出撃選択"
  });

  const title = `⚠️ バトル場にポケモンがいません！`;
  let bodyHtml = `
    <div style="font-size:13px; color:#fca5a5; font-weight:bold; margin-bottom:8px; line-height:1.6;">
      バトル場が空になっています。出撃させるベンチポケモンを選択してください。<br>
      <span style="color:#94a3b8; font-size:11px; font-weight:normal;">※ポケモンを出撃させるまで、他の操作はできません。出撃後にターン開始ドローが行われます。</span>
    </div>
    <div class="card-grid" style="grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap:12px; margin-top:8px;">
  `;

  benchIndices.forEach(bIdx => {
    const b = state.myBench[bIdx];
    if (!b || !b.card) return;
    registerCard(b.card);
    const cardProps = getCardRenderProps(b.card);
    const energyCount = (b.energies && b.energies.length) ? b.energies.length : 0;
    const dmg = b.damage || 0;

    bodyHtml += `
      <div style="display:flex; flex-direction:column; align-items:center; gap:6px; background:rgba(30,41,59,0.7); padding:8px; border-radius:8px; border:1.5px solid #3b82f6;">
        <span style="font-size:11px; font-weight:bold; color:#ffd84a;">🪑 ベンチ ${bIdx + 1}</span>
        <div class="${cardProps.className}" ${cardProps.imgStyle} style="width:100px; height:140px; cursor:default;">
          ${buildCardInnerHtml(b.card)}
          ${dmg > 0 ? `<div class="dmg">${dmg}</div>` : ''}
        </div>
        <div style="font-size:10px; color:#cbd5e1; display:flex; gap:6px;">
          <span>⚡エネ:${energyCount}</span>
          ${b.tool ? `<span>🎒どうぐ</span>` : ''}
        </div>
        <button class="btn green" style="width:100%; font-weight:bold; font-size:12px; padding:6px 4px;" onclick="window.promoteBenchToActive(${bIdx})">
          ⚔️ バトル場に出す
        </button>
      </div>
    `;
  });

  bodyHtml += `</div>`;

  const footHtml = `
    <div style="display:flex; align-items:center; justify-content:space-between; width:100%;">
      <span style="font-size:11.5px; color:#fde047; font-weight:bold;">⚠️ いずれかのポケモンを選んで「バトル場に出す」を押してください</span>
    </div>
  `;

  showModal(title, bodyHtml, footHtml, { dismissible: false });
}

function promoteBenchToActive(benchIndex) {
  state.mustPromoteToActive = false;
  closeModal();

  swapActiveBench(benchIndex);
  if (typeof P2P !== "undefined" && P2P.connected) {
    P2P.syncNow();
  }

  const cb = _pendingPromoteCallback;
  _pendingPromoteCallback = null;

  if (typeof cb === "function") {
    setTimeout(() => {
      cb();
    }, 380);
  }
}

window.checkTurnStartActiveCondition = checkTurnStartActiveCondition;
window.handleNoPokemonDefeat = handleNoPokemonDefeat;
window.showPromoteActiveModal = showPromoteActiveModal;
window.promoteBenchToActive = promoteBenchToActive;

/**
 * ４）自分のターンの最初の強制トップドロー処理
 * ３）のバナーエフェクトの後に実行され、山札からドローアニメーション ＆ 画面中央大型カード表示を行う
 */
function executeTurnStartDraw() {
  if (state.isSetupPhase) return;

  // バトル場が空の場合は強制的に選出または敗北処理へ転送
  if (!state.myActive) {
    checkTurnStartActiveCondition(() => {
      executeTurnStartDraw();
    });
    return;
  }

  if (!state.myDeck || state.myDeck.length === 0) {
    showToast("⚠️ 山札が0枚です！（引けるカードがありません）");
    addLog(`【ターン開始】山札が0枚のためカードを引けませんでした`, {
      badge: "⚠️ 山札切れ"
    });
    return;
  }

  const drawnCard = state.myDeck.shift();
  registerCard(drawnCard);
  state.myHand.push(drawnCard);

  addLog(`【ターン開始ドロー】山札からカードを1枚引きました`, {
    oppText: `【ターン開始ドロー】山札からカードを1枚引きました`,
    cards: [],
    badge: "🃏 ターン開始ドロー"
  });

  renderAll();

  // 1. 山札からカードが引かれるビジュアルエフェクトを再生
  playDeckDrawEffect(false, () => {
    // 2. 引いたカードを画面中央に大きく表示
    showTopDrawCardReveal(drawnCard);
  });

  if (typeof P2P !== "undefined" && P2P.connected && !state.isSoloMode) {
    P2P.send({
      t: "fx",
      fxType: "draw",
      isOpponent: false
    });
    P2P.syncNow();
  }
}

let _topDrawSpotlightTimer = null;

/** ターン開始ドローしたカードを画面中央に大きく表示 */
function showTopDrawCardReveal(card, onComplete = null) {
  const spotlight = document.getElementById("top-draw-spotlight");
  const visualEl = document.getElementById("top-draw-card-visual");
  const nameEl = document.getElementById("top-draw-card-name");
  const subEl = document.getElementById("top-draw-card-sub");
  if (!spotlight || !visualEl || !nameEl) {
    if (typeof onComplete === "function") onComplete();
    return;
  }

  if (_topDrawSpotlightTimer) {
    clearTimeout(_topDrawSpotlightTimer);
    _topDrawSpotlightTimer = null;
  }

  const safeName = card ? (card.name || "カード") : "カード";
  const safeSub = card ? (card.category || card.sub || "") : "";

  nameEl.textContent = `「${safeName}」`;
  if (subEl) subEl.textContent = safeSub ? `【${safeSub}】` : "";

  const isImgValid = card && typeof isCardImageValid === "function" ? isCardImageValid(card) : (card && !!card.imageUrl);
  if (card && card.imageUrl && isImgValid) {
    visualEl.innerHTML = `<img src="${escapeHtml(card.imageUrl)}" class="top-draw-big-img" alt="${escapeHtml(safeName)}" referrerpolicy="no-referrer" onerror="this.onerror=null; this.outerHTML = '<div class=\\'card card-fallback-white top-draw-big-card\\'><div class=\\'card-top\\'><span class=\\'name\\'>${escapeHtml(safeName)}</span></div><div class=\\'card-art\\'>${getCardTypeIcon(card)}</div><div class=\\'card-btm\\'><span>${escapeHtml(safeSub)}</span></div></div>';" />`;
  } else {
    visualEl.innerHTML = `
      <div class="card card-fallback-white top-draw-big-card">
        <div class="card-top"><span class="name">${escapeHtml(safeName)}</span></div>
        <div class="card-art">${getCardTypeIcon(card)}</div>
        <div class="card-btm"><span>${escapeHtml(safeSub)}</span></div>
      </div>
    `;
  }

  spotlight.classList.remove("hidden");
  spotlight.classList.add("show");

  _topDrawSpotlightTimer = setTimeout(() => {
    hideTopDrawSpotlight();
    if (typeof onComplete === "function") onComplete();
  }, 2200);
}

function hideTopDrawSpotlight() {
  const spotlight = document.getElementById("top-draw-spotlight");
  if (spotlight) {
    spotlight.classList.remove("show");
    spotlight.classList.add("hidden");
  }
  if (_topDrawSpotlightTimer) {
    clearTimeout(_topDrawSpotlightTimer);
    _topDrawSpotlightTimer = null;
  }
}
window.hideTopDrawSpotlight = hideTopDrawSpotlight;

/**
 * ターン終了ボタン押下処理
 */
function endTurn() {
  if (state.isSetupPhase) {
    showToast("対戦準備中です。準備完了してから対戦を開始してください");
    return;
  }

  if (state.mustPromoteToActive) {
    showToast("バトル場に出すベンチポケモンを選択してください");
    return;
  }

  if (state.isSoloMode && state.isSoloTemporarySwap) {
    alert("現在、相手側の手動操作（一時交代）モード中です。\n画面上の「元の手番側に戻る」を押して元の手番視点に戻してからターンを終了してください。");
    return;
  }

  const currentInfo = getTurnInfo(state.turnStep || 1);
  if (!currentInfo.isMyTurn && !state.isSoloMode) {
    showToast("相手のターン中です");
    return;
  }

  // ターンステップ進行（先攻1ターン目 → 後攻1ターン目 → 先攻2ターン目 → ...）
  state.turnStep = (state.turnStep || 1) + 1;
  const newTurnInfo = getTurnInfo(state.turnStep);
  state.turn = newTurnInfo.round;

  // 特性使用済みフラグをリセット
  resetAllAbilitiesUsed();

  addLog(`【ターン終了】${currentInfo.activePlayerName} がターンを終了しました（次は【${newTurnInfo.activePlayerName}】の番 / ${newTurnInfo.label}）`, {
    oppText: `【ターン終了】${currentInfo.activePlayerName} がターンを終了しました（次は【${newTurnInfo.activePlayerName}】の番 / ${newTurnInfo.label}）`,
    badge: "⏭️ ターン終了"
  });

  if (state.isSoloMode) {
    swapSoloTurn();
    renderAll();
    // 一人回し時は上下交代後にバナー演出 ＆ 新手番プレイヤーのバトル場判定 ＆ 強制トップドロー
    playTurnChangeBanner(newTurnInfo, () => {
      checkTurnStartActiveCondition(() => {
        executeTurnStartDraw();
      });
    });
  } else {
    if (typeof P2P !== "undefined" && P2P.connected) {
      P2P.send({
        t: "turn_change",
        turnStep: state.turnStep,
        playerName: state.myName
      });
      P2P.syncNow();
    }
    renderAll();
    // 自分画面でバナー演出を再生（次は相手の番なので自分はドローしない）
    playTurnChangeBanner(newTurnInfo, () => {
      // 相手のターン待ち
    });
  }
}

function swapSoloTurn() {
  // 一人回し用: ターン終了ごとに上下（自分側と相手側）を完全に反転・交代
  // 1. 名前・プレイマットを入れ替え
  const tmpName = state.myName;
  state.myName = state.oppName;
  state.oppName = tmpName;

  const tmpMat = state.myMatId;
  state.myMatId = state.oppMatId;
  state.oppMatId = tmpMat;

  // 2. 山札・手札・サイド・トラッシュ・ロストを入れ替え
  const tmpDeck = state.myDeck;
  state.myDeck = state.oppDeck;
  state.oppDeck = tmpDeck;
  state.oppDeckCount = state.oppDeck.length;

  const tmpHand = state.myHand;
  state.myHand = state.oppHand;
  state.oppHand = tmpHand;
  state.oppHandCount = state.oppHand.length;

  const tmpPrizes = state.myPrizes;
  state.myPrizes = state.oppPrizesList;
  state.oppPrizesList = tmpPrizes;
  state.oppPrizes = state.oppPrizesList.length;

  const tmpTrash = state.myTrash;
  state.myTrash = state.oppTrash;
  state.oppTrash = tmpTrash;

  const tmpLost = state.myLost;
  state.myLost = state.oppLost;
  state.oppLost = tmpLost;
  state.oppLostCount = state.oppLost.length;

  // 3. バトル場・ベンチを入れ替え
  const tmpActive = state.myActive;
  state.myActive = state.oppActive;
  state.oppActive = tmpActive;

  const tmpBench = state.myBench;
  state.myBench = state.oppBench;
  state.oppBench = tmpBench;

  const tmpBenchLimit = state.myBenchLimit || 5;
  state.myBenchLimit = state.oppBenchLimit || 5;
  state.oppBenchLimit = tmpBenchLimit;

  if (state.isSetupPhase) {
    const tmpReady = state.mySetupReady;
    state.mySetupReady = state.oppSetupReady;
    state.oppSetupReady = tmpReady;

    const tmpMull = state.mulliganCount;
    state.mulliganCount = state.oppMulliganCount;
    state.oppMulliganCount = tmpMull;
  }

  if (state.firstPlayer) {
    state.firstPlayer = (state.firstPlayer === "me" ? "opp" : "me");
  }

  // 4. 使用カード・選択状態をリセット
  state.playCard = null;
  state.tempCards = [];
  state.selectedHandIndices.clear();
  state.draggedHandIndex = -1;
  state.draggedEnergy = null;
  state.actionTargetMode = null;

  if (state.isSetupPhase) {
    addLog(`【一人回し対戦準備】操作側が交代しました（現在: 【${state.myName}】を準備中）`, {
      action: "SOLO_SETUP_SWAP",
      player: state.myName,
      suppressSync: true
    });
    showToast(`準備交代: 現在【${state.myName}】を操作中`);
  } else if (state.isSoloTemporarySwap) {
    addLog(`【一人回し】相手側（${state.myName}）の手動操作モードに切り替えました`, {
      suppressSync: true
    });
  } else {
    addLog(`【一人回し】手番が交代しました（現在の手番: ${state.myName}）`, {
      action: "SOLO_SWAP",
      player: state.myName,
      details: `手番交代: ${state.myName}`,
      suppressSync: true
    });
    showToast(`手番交代！ 現在: 【${state.myName}】の手番`);
  }
}

/** 一人回し用: 相手手札操作・手札干渉メニュー表示 */
function showSoloOpponentHandMenu() {
  if (!state.isSoloMode) return;
  const title = `🎴 相手手札操作・手札干渉（一人回し）`;
  const body = `
    <div style="font-size:13px; color:#94a3b8; margin-bottom:14px; line-height:1.6; background:rgba(0,0,0,0.25); padding:8px 12px; border-radius:6px;">
      相手（<b>${state.oppName}</b>）の手札：<b style="color:#fde047; font-size:15px;">${state.oppHand.length}枚</b> ／ 
      山札：<b style="color:#f8fafc;">${state.oppDeck.length}枚</b> ／ 
      サイド：<b style="color:#f8fafc;">${state.oppPrizes}枚</b>
    </div>

    <div style="display:flex; flex-direction:column; gap:8px;">
      <button class="btn blue" style="text-align:left; padding:9px 12px;" onclick="soloOpponentHandToDeck()">
        🔀 <b>相手手札をすべて山札に戻してシャッフル</b>
        <div style="font-size:11px; opacity:0.8; margin-top:2px;">相手手札（${state.oppHand.length}枚）を山札に混ぜてシャッフルします</div>
      </button>

      <button class="btn blue" style="text-align:left; padding:9px 12px;" onclick="soloOpponentHandToBottom()">
        ⬇️ <b>相手手札をすべて山札の下に戻す</b>
        <div style="font-size:11px; opacity:0.8; margin-top:2px;">相手手札（${state.oppHand.length}枚）をそのまま山札の一番下に戻します</div>
      </button>

      <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:6px; border:1px solid rgba(255,255,255,0.1);">
        <div style="font-weight:bold; font-size:12.5px; color:#fde047; margin-bottom:6px;">📥 相手山札からカードを引く（ドロー）</div>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">
          <button class="btn green" style="padding:5px 10px; font-size:11.5px;" onclick="soloOpponentDrawCards(1)">＋1枚引く</button>
          <button class="btn green" style="padding:5px 10px; font-size:11.5px;" onclick="soloOpponentDrawCards(${state.oppPrizes})">サイド枚数 (${state.oppPrizes}枚)</button>
          <button class="btn green" style="padding:5px 10px; font-size:11.5px;" onclick="soloOpponentDrawCards(4)">4枚引く</button>
          <button class="btn green" style="padding:5px 10px; font-size:11.5px;" onclick="soloOpponentDrawCards(2)">2枚引く</button>
          <button class="btn green" style="padding:5px 10px; font-size:11.5px;" onclick="promptSoloOpponentDraw()">任意枚数...</button>
        </div>
      </div>

      <button class="btn red" style="text-align:left; padding:8px 12px;" onclick="soloOpponentHandTrash()">
        🗑️ <b>相手手札をすべてトラッシュする</b>
      </button>

      <button class="btn purple" style="text-align:left; padding:10px 12px; margin-top:4px;" onclick="startSoloTemporarySwap()">
        🔄 <b>相手側と一時交代（手動操作モード）</b>
        <div style="font-size:11px; opacity:0.85; margin-top:2px;">手番を進めずに上下を反転し、相手手札を見ながら手動で1枚ずつ操作します</div>
      </button>
    </div>
  `;
  const foot = `
    <button class="btn" style="padding:6px 16px;" onclick="closeModal()">閉じる</button>
  `;
  showModal(title, body, foot);
}

/** 一人回し: 相手手札をすべて山札に戻してシャッフル */
function soloOpponentHandToDeck() {
  if (!state.isSoloMode) return;
  if (state.oppHand.length === 0) {
    return alert("相手の手札は0枚です。");
  }
  const count = state.oppHand.length;
  state.oppDeck.push(...state.oppHand);
  state.oppDeck = shuffleArray(state.oppDeck);
  state.oppHand = [];
  state.oppHandCount = 0;
  state.oppDeckCount = state.oppDeck.length;
  addLog(`【手札干渉】相手（${state.oppName}）の手札 ${count}枚 を山札に戻してシャッフルしました`, {
    suppressSync: true,
    badge: "🔀 相手手札シャッフル"
  });
  showToast(`相手の手札（${count}枚）を山札に戻してシャッフルしました`);
  renderAll();
  showSoloOpponentHandMenu();
}

/** 一人回し: 相手手札をすべて山札の下に戻す */
function soloOpponentHandToBottom() {
  if (!state.isSoloMode) return;
  if (state.oppHand.length === 0) {
    return alert("相手の手札は0枚です。");
  }
  const count = state.oppHand.length;
  state.oppDeck.push(...state.oppHand);
  state.oppHand = [];
  state.oppHandCount = 0;
  state.oppDeckCount = state.oppDeck.length;
  addLog(`【手札干渉】相手（${state.oppName}）の手札 ${count}枚 を山札の下に戻しました`, {
    suppressSync: true,
    badge: "⬇️ 相手手札山下へ"
  });
  showToast(`相手の手札（${count}枚）を山札の下に戻しました`);
  renderAll();
  showSoloOpponentHandMenu();
}

/** 一人回し: 相手手札をすべてトラッシュ */
function soloOpponentHandTrash() {
  if (!state.isSoloMode) return;
  if (state.oppHand.length === 0) {
    return alert("相手の手札は0枚です。");
  }
  const count = state.oppHand.length;
  state.oppTrash.push(...state.oppHand);
  state.oppHand = [];
  state.oppHandCount = 0;
  addLog(`【手札干渉】相手（${state.oppName}）の手札 ${count}枚 をトラッシュしました`, {
    suppressSync: true,
    badge: "🗑️ 相手手札トラッシュ"
  });
  showToast(`相手の手札（${count}枚）をトラッシュしました`);
  renderAll();
  showSoloOpponentHandMenu();
}

/** 一人回し: 相手山札からカードを引く */
function soloOpponentDrawCards(count) {
  if (!state.isSoloMode) return;
  const actualCount = Math.min(count, state.oppDeck.length);
  if (actualCount <= 0) {
    return alert("相手の山札にカードがありません。");
  }
  const drawn = [];
  for (let i = 0; i < actualCount; i++) {
    drawn.push(state.oppDeck.shift());
  }
  state.oppHand.push(...drawn);
  state.oppHandCount = state.oppHand.length;
  state.oppDeckCount = state.oppDeck.length;
  addLog(`【手札干渉】相手（${state.oppName}）の山札からカードを ${actualCount}枚 引きました`, {
    suppressSync: true,
    badge: "📥 相手ドロー"
  });
  showToast(`相手（${state.oppName}）が ${actualCount}枚 引きました`);
  renderAll();
  showSoloOpponentHandMenu();
}

/** 一人回し: 相手山札から任意枚数引くプロンプト */
function promptSoloOpponentDraw() {
  const input = prompt(`相手（${state.oppName}）の山札（残り${state.oppDeck.length}枚）から何枚引きますか？`, "1");
  if (input === null) return;
  const count = parseInt(input, 10);
  if (isNaN(count) || count <= 0) return alert("1以上の数値を入力してください");
  soloOpponentDrawCards(count);
}

/** 一人回し: 相手側視点への一時交代（手動操作モード開始） */
function startSoloTemporarySwap() {
  if (!state.isSoloMode) return;
  closeModal();
  state.isSoloTemporarySwap = true;
  swapSoloTurn();
  showToast(`【一時交代】相手側（${state.myName}）を手動操作中。終了時は画面上の「元の手番側に戻る」を押してください`);
  renderAll();
}

/** 一人回し: 一時交代から元の手番側へ復帰 */
function revertSoloTemporarySwap() {
  if (!state.isSoloMode || !state.isSoloTemporarySwap) return;
  state.isSoloTemporarySwap = false;
  swapSoloTurn();
  showToast(`手番プレイヤー（${state.myName}）の視点に戻りました`);
  renderAll();
}

window.showSoloOpponentHandMenu = showSoloOpponentHandMenu;
window.soloOpponentHandToDeck = soloOpponentHandToDeck;
window.soloOpponentHandToBottom = soloOpponentHandToBottom;
window.soloOpponentHandTrash = soloOpponentHandTrash;
window.soloOpponentDrawCards = soloOpponentDrawCards;
window.promptSoloOpponentDraw = promptSoloOpponentDraw;
window.startSoloTemporarySwap = startSoloTemporarySwap;
window.revertSoloTemporarySwap = revertSoloTemporarySwap;

function tossCoin() {
  const isHeads = Math.random() < 0.5;
  const result = isHeads ? "表（オモテ）◎" : "裏（ウラ）✕";

  if (typeof triggerBoardEffect === "function") {
    triggerBoardEffect({
      fxType: "coin",
      isHeads: isHeads,
      playerName: state.myName
    });
  }

  addLog(`コイントス結果: 【${result}】`, {
    badge: "🪙 コイントス",
    skipLocalPopup: true
  });
  showToast(`🪙 コイントス結果: 【${result}】`);
}

/** 対戦準備フェーズ: ルームオーナーによるコイントス案内モーダル表示 */
function startSetupCoinToss() {
  if (!state.isSetupPhase) return;
  state.setupStep = "coin";

  if (typeof P2P !== "undefined" && P2P.connected && P2P.role === "guest") {
    renderAll();
    return;
  }

  const bodyHtml = `
    <div style="text-align:center; padding:16px 10px; color:#f8fafc;">
      <div style="font-size:48px; margin-bottom:12px;">🪙</div>
      <p style="font-size:17px; font-weight:bold; color:#fef08a; margin-bottom:8px;">
        先攻・後攻を決めるコイントスを行います
      </p>
      <p style="font-size:13px; color:#cbd5e1; line-height:1.6; margin-bottom:20px;">
        ルームオーナーのあなたがコインを投げます。<br>
        <b style="color:#fde047;">【表（オモテ）】</b>なら<b>あなた（オーナー）</b>が先攻・後攻を決め、<br>
        <b style="color:#93c5fd;">【裏（ウラ）】</b>なら<b>相手（ゲスト）</b>が先攻・後攻を決めます。
      </p>
      <button class="btn gold big" style="font-size:16px; padding:12px 32px; font-weight:bold;" onclick="executeSetupCoinToss()">
        🪙 コイントスを行う！
      </button>
    </div>
  `;
  showModal("🪙 先攻・後攻決定コイントス", bodyHtml, "");
  renderAll();
}

/** ルームオーナーが「コイントスを行う！」を押したときの実行処理 */
function executeSetupCoinToss() {
  if (!state.isSetupPhase) return;
  closeModal();

  const isHeads = Math.random() < 0.5;
  state.coinResult = isHeads ? "heads" : "tails";
  const resultText = isHeads ? "表（オモテ）" : "裏（ウラ）";
  const chooserRole = isHeads ? "host" : "guest";
  state.coinChooser = chooserRole;

  addLog(`【対戦準備】ルームオーナーのコイントス結果: 【${resultText}】！ (${isHeads ? 'ルームオーナー' : '参加ゲスト'}が先攻・後攻を選択)`, {
    suppressSync: true
  });

  if (typeof P2P !== "undefined" && P2P.connected) {
    P2P.send({
      t: "coin_result",
      coin: state.coinResult,
      chooser: chooserRole,
      name: state.myName
    });
  }

  playCoinTossEffect(isHeads, state.myName, () => {
    showToast(`🪙 コイントス結果: 【${resultText}】！`);
    handleCoinResult(isHeads, chooserRole);
  });
}

/** コイントス結果の処理（選択権判定・モーダル表示） */
function handleCoinResult(isHeads, chooserRole) {
  const isMeChooser = (!P2P.connected) || (P2P.role === chooserRole);
  const resultText = isHeads ? "表（オモテ）◎" : "裏（ウラ）✕";

  if (isMeChooser) {
    state.setupStep = "choosing_order";
    openOrderSelectModal(resultText);
  } else {
    state.setupStep = "waiting_order";
    const bodyHtml = `
      <div style="text-align:center; padding:16px 10px; color:#f8fafc;">
        <div style="font-size:44px; margin-bottom:10px;">🪙</div>
        <p style="font-size:18px; font-weight:bold; color:#fef08a; margin-bottom:8px;">
          コイントス結果：【${resultText}】
        </p>
        <p style="font-size:14px; color:#cbd5e1; margin-bottom:6px;">
          相手（<b>${escapeHtml(state.oppName)}</b>）が先攻・後攻を選択しています...
        </p>
      </div>
    `;
    showModal("🪙 コイントス結果", bodyHtml, "");
  }
  renderAll();
}

/** 先攻・後攻選択モーダル */
function openOrderSelectModal(resultText = "") {
  const coinBanner = resultText
    ? `<div style="display:inline-block; background:rgba(250,204,21,0.18); border:1px solid #facc15; color:#fde047; padding:4px 14px; border-radius:20px; font-size:14px; font-weight:bold; margin-bottom:10px;">🪙 コイントス結果：【${resultText}】</div>`
    : "";
  const bodyHtml = `
    <div style="text-align:center; padding:14px 8px; color:#f8fafc;">
      <div style="font-size:40px; margin-bottom:8px;">🪙</div>
      ${coinBanner}
      <p style="font-size:16px; font-weight:bold; color:#ffffff; margin-bottom:6px;">
        あなたが先攻・後攻の選択権を獲得しました！
      </p>
      <p style="font-size:13px; color:#cbd5e1; margin-bottom:20px;">
        先攻・後攻のどちらでバトルを開始しますか？
      </p>
      <div style="display:flex; justify-content:center; gap:16px;">
        <button class="btn gold big" style="font-size:15px; padding:12px 26px; font-weight:bold;" onclick="chooseFirstPlayer('first')">
          ⚡ 先攻にする
        </button>
        <button class="btn blue big" style="font-size:15px; padding:12px 26px; font-weight:bold;" onclick="chooseFirstPlayer('second')">
          🛡️ 後攻にする
        </button>
      </div>
    </div>
  `;
  showModal("⚡ 先攻・後攻の選択", bodyHtml, "");
}

/** 先攻・後攻の決定処理 */
function chooseFirstPlayer(choice) {
  closeModal();
  const isMeFirst = (choice === "first");
  state.firstPlayer = isMeFirst ? "me" : "opp";
  state.setupStep = "place";

  const firstRole = isMeFirst ? (P2P.role || "host") : ((P2P.role === "host") ? "guest" : "host");
  const myOrderName = isMeFirst ? "先攻" : "後攻";

  addLog(`【対戦準備】あなたが【${myOrderName}】を選択しました。`, {
    suppressSync: true
  });
  showToast(`あなたは【${myOrderName}】です！ たねポケモンをバトル場に出してください`);

  if (typeof P2P !== "undefined" && P2P.connected) {
    P2P.send({
      t: "order_chosen",
      firstPlayerRole: firstRole,
      chooserName: state.myName
    });
    P2P.syncNow();
  }

  renderAll();
}

// =============================================================================
// 盤面ビジュアルエフェクトエンジン（自分＆相手P2P同期対応）
// =============================================================================
function ensureFxLayer() {
  let layer = document.getElementById("board-fx-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "board-fx-layer";
    layer.className = "board-fx-layer";
    document.body.appendChild(layer);
  }
  return layer;
}

function toOpponentLocation(loc) {
  if (!loc) return "opp-active";
  if (loc === "active" || loc === "my-active") return "opp-active";
  if (loc.startsWith("bench_") || loc.startsWith("my-bench_")) {
    const idx = loc.replace("bench_", "").replace("my-bench_", "");
    return `opp-bench_${idx}`;
  }
  return loc;
}

function findLocationElement(loc) {
  if (!loc) return null;
  const byData = document.querySelector(`.card[data-location="${loc}"]`);
  if (byData) return byData;
  if (loc === "active" || loc === "my-active") return document.getElementById("my-active");
  if (loc === "opp-active") return document.getElementById("opp-active");
  if (loc.startsWith("bench_") || loc.startsWith("my-bench_")) {
    const idx = parseInt(loc.replace("bench_", "").replace("my-bench_", ""), 10);
    const tray = document.getElementById("my-bench");
    return tray && tray.children[idx] ? tray.children[idx] : null;
  }
  if (loc.startsWith("opp-bench_")) {
    const idx = parseInt(loc.replace("opp-bench_", ""), 10);
    const tray = document.getElementById("opp-bench");
    return tray && tray.children[idx] ? tray.children[idx] : null;
  }
  return null;
}

/** 自分の画面でエフェクトを再生し、通信対戦中なら相手画面にも同期送信 */
function triggerBoardEffect(opts = {}) {
  playLocalBoardEffect(opts, false);

  if (typeof P2P !== "undefined" && P2P.connected && !state.isSoloMode) {
    const remoteOpts = { ...opts, t: "fx" };
    delete remoteOpts.srcRect;
    if (opts.location) {
      remoteOpts.location = toOpponentLocation(opts.location);
    }
    if (opts.fxType === "prize" && opts.destination === "hand") {
      // 手札に加えたサイドの中身は相手に秘密にする
      delete remoteOpts.card;
    }
    P2P.send(remoteOpts);
  }
}

function playLocalBoardEffect(opts = {}, isOpponent = false) {
  const fxType = opts.fxType;
  if (fxType === "coin") {
    playCoinTossEffect(!!opts.isHeads, opts.playerName || (isOpponent ? state.oppName : state.myName));
  } else if (fxType === "attach") {
    // 相手側では state スナップショット反映の直後にも確実に座標が取れるよう少し遅延許容
    setTimeout(() => {
      playAttachmentEffect(opts.location, opts.attachType, opts.colorType, opts.icon, opts.label);
    }, isOpponent ? 80 : 10);
  } else if (fxType === "prize") {
    playPrizeFlipEffect(opts.prizeIdx || 0, opts.card || null, opts.destination || "hand", isOpponent, opts.srcRect || null);
  } else if (fxType === "swap") {
    const bIdx = opts.benchIndex || 0;
    // ポップアップ表示中は交代前の位置で待機し、ポップアップが消えた直後に入れ替えスライド演出を再生する
    setTimeout(() => {
      const popup = document.getElementById("card-use-popup");
      if (popup && !popup.classList.contains("hidden")) {
        preStageSwapPositions(bIdx, isOpponent);
      }
      runAfterActionPopup(() => {
        playSwapEffect(bIdx, isOpponent);
      });
    }, isOpponent ? 90 : 15);
  } else if (fxType === "damage") {
    setTimeout(() => {
      playDamageEffect(opts.location, opts.delta || 0);
    }, isOpponent ? 80 : 10);
  } else if (fxType === "knockout") {
    setTimeout(() => {
      playKnockoutDissolveEffect(opts.location);
    }, isOpponent ? 80 : 10);
  } else if (fxType === "shuffle") {
    playDeckShuffleEffect(isOpponent);
  } else if (fxType === "draw") {
    playDeckDrawEffect(isOpponent);
  }
}

/** 6. 🃏 山札からカードを引くスライド・ドローエフェクト */
function playDeckDrawEffect(isOpponent = false, onComplete = null) {
  if (window.SoundEffects) {
    SoundEffects.playDraw();
  }
  const layer = ensureFxLayer();
  const deckEl = isOpponent
    ? document.getElementById("opp-deck")
    : (document.getElementById("my-deck") || document.querySelector(".band.me .pile-col"));

  let startX = isOpponent ? window.innerWidth * 0.18 : window.innerWidth * 0.82;
  let startY = isOpponent ? window.innerHeight * 0.22 : window.innerHeight * 0.72;

  if (deckEl) {
    const r = deckEl.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      startX = r.left + r.width / 2;
      startY = r.top + r.height / 2;
    }
  }

  const endX = window.innerWidth * 0.5;
  const endY = isOpponent ? window.innerHeight * 0.15 : window.innerHeight * 0.82;

  const wrap = document.createElement("div");
  wrap.className = `fx-draw-glide-card ${isOpponent ? 'is-opp' : 'is-me'}`;
  wrap.style.setProperty("--start-x", `${startX}px`);
  wrap.style.setProperty("--start-y", `${startY}px`);
  wrap.style.setProperty("--end-x", `${endX}px`);
  wrap.style.setProperty("--end-y", `${endY}px`);

  wrap.innerHTML = `
    <div class="card back fx-draw-card-back"></div>
    <div class="fx-draw-badge">🃏 ドロー！</div>
  `;

  layer.appendChild(wrap);

  setTimeout(() => {
    wrap.remove();
    if (typeof onComplete === "function") onComplete();
  }, 440);
}

/** 1. 🪙 3Dコイントス回転アニメーション */
function playCoinTossEffect(isHeads, playerName = "", onComplete = null) {
  const layer = ensureFxLayer();
  const prevCoin = layer.querySelector(".fx-coin-backdrop");
  if (prevCoin) prevCoin.remove();

  // コイントス効果音を再生
  if (window.SoundEffects) {
    SoundEffects.playCoinToss();
  }

  const backdrop = document.createElement("div");
  backdrop.className = "fx-coin-backdrop";

  const finalClass = isHeads ? "is-heads" : "is-tails";
  const resultTitle = isHeads ? "🌟 表（オモテ）◎" : "🌀 裏（ウラ）✕";
  const subTitle = playerName ? `${escapeHtml(playerName)} のコイントス` : "コイントス";

  // 表: キラキラ笑顔ピカチュウ（ウインク）
  const svgFront = `
    <svg viewBox="0 0 100 100" class="coin-svg-art" aria-label="ピカチュウ（オモテ）">
      <circle cx="50" cy="50" r="47" fill="none" stroke="#fef08a" stroke-width="2" stroke-dasharray="2.5,3"/>
      <!-- 耳 -->
      <polygon points="28,34 12,6 36,20" fill="#facc15"/>
      <polygon points="12,6 20,13 17,19 12,6" fill="#1e293b"/>
      <polygon points="72,34 88,6 64,20" fill="#facc15"/>
      <polygon points="88,6 80,13 83,19 88,6" fill="#1e293b"/>
      <!-- 顔 -->
      <circle cx="50" cy="52" r="30" fill="#facc15"/>
      <!-- ほっぺ -->
      <circle cx="27" cy="57" r="7" fill="#ef4444"/>
      <circle cx="73" cy="57" r="7" fill="#ef4444"/>
      <!-- 目（左目パッチリ、右目ウインク） -->
      <circle cx="37" cy="46" r="4.5" fill="#1e293b"/>
      <circle cx="38.5" cy="44" r="1.8" fill="#ffffff"/>
      <path d="M59,47 Q64,41 69,47" fill="none" stroke="#1e293b" stroke-width="3" stroke-linecap="round"/>
      <!-- 鼻・口 -->
      <polygon points="50,52 48.5,50.5 51.5,50.5" fill="#1e293b"/>
      <path d="M43,55 Q50,60 50,57 Q50,60 57,55" fill="none" stroke="#1e293b" stroke-width="2.2" stroke-linecap="round"/>
      <!-- キラキラ星 -->
      <polygon points="50,14 52,20 58,22 52,24 50,30 48,24 42,22 48,20" fill="#ffffff" opacity="0.95"/>
    </svg>
  `;

  // 裏: すやすや眠るピカチュウ ＆ モンスターボール
  const svgBack = `
    <svg viewBox="0 0 100 100" class="coin-svg-art" aria-label="ピカチュウ（ウラ）">
      <circle cx="50" cy="50" r="47" fill="none" stroke="#e2e8f0" stroke-width="2" stroke-dasharray="2.5,3"/>
      <!-- 垂れ耳 -->
      <polygon points="28,36 10,18 32,24" fill="#cbd5e1"/>
      <polygon points="10,18 17,21 15,26 10,18" fill="#475569"/>
      <polygon points="72,36 90,18 68,24" fill="#cbd5e1"/>
      <polygon points="90,18 83,21 85,26 90,18" fill="#475569"/>
      <!-- 顔 -->
      <circle cx="50" cy="52" r="30" fill="#e2e8f0"/>
      <!-- ほっぺ（ほんのりピンク） -->
      <circle cx="27" cy="57" r="6.5" fill="#f472b6" opacity="0.85"/>
      <circle cx="73" cy="57" r="6.5" fill="#f472b6" opacity="0.85"/>
      <!-- 閉じため（すやすや） -->
      <path d="M33,48 Q38,53 43,48" fill="none" stroke="#334155" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M57,48 Q62,53 67,48" fill="none" stroke="#334155" stroke-width="2.6" stroke-linecap="round"/>
      <!-- 鼻・口 -->
      <polygon points="50,52 48.5,50.5 51.5,50.5" fill="#334155"/>
      <path d="M46,56 Q50,59 54,56" fill="none" stroke="#334155" stroke-width="2" stroke-linecap="round"/>
      <!-- zzz 睡眠マーク -->
      <text x="64" y="26" font-size="12" font-weight="900" fill="#38bdf8" font-family="sans-serif">z</text>
      <text x="74" y="17" font-size="15" font-weight="900" fill="#38bdf8" font-family="sans-serif">Z</text>
    </svg>
  `;

  backdrop.innerHTML = `
    <div class="fx-coin-stage">
      <div class="fx-coin-thrower">${subTitle}</div>
      <div class="fx-coin-3d-wrap ${finalClass}">
        <div class="fx-coin-3d">
          <div class="fx-coin-face front">
            ${svgFront}
            <div class="coin-sub-label">★ HEADS ★</div>
          </div>
          <div class="fx-coin-face back">
            ${svgBack}
            <div class="coin-sub-label">★ TAILS ★</div>
          </div>
        </div>
        <div class="fx-coin-shadow"></div>
      </div>
      <div class="fx-coin-result-banner ${finalClass}">${resultTitle}</div>
    </div>
  `;

  backdrop.onclick = () => {
    backdrop.remove();
  };

  layer.appendChild(backdrop);

  setTimeout(() => {
    if (backdrop.parentNode) backdrop.classList.add("fade-out");
    setTimeout(() => {
      if (backdrop.parentNode) backdrop.remove();
      if (typeof onComplete === "function") onComplete();
    }, 320);
  }, 1900);
}

/** 2. ⚡🎒✨ ポケモンへのエネルギー・どうぐ付与＆進化＆特性宣言エフェクト */
function playAttachmentEffect(location, attachType = "energy", colorType = "special", icon = "⚡", label = "") {
  const targetEl = findLocationElement(location);
  if (!targetEl) return;

  const rect = targetEl.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;

  // 特性・進化の専用効果音再生
  if (attachType === "ability") {
    if (window.SoundEffects && typeof SoundEffects.playAbilitySound === "function") {
      SoundEffects.playAbilitySound();
    }
    targetEl.classList.add("fx-card-ability-glow");
  } else if (attachType === "evolve") {
    if (window.SoundEffects && typeof SoundEffects.playEvolveSound === "function") {
      SoundEffects.playEvolveSound();
    }
    targetEl.classList.add("fx-card-evolve-glow");
  }

  const layer = ensureFxLayer();
  const fxEl = document.createElement("div");
  fxEl.className = `fx-attach-container fx-type-${attachType} fx-color-${colorType}`;
  fxEl.style.left = `${rect.left + rect.width / 2}px`;
  fxEl.style.top = `${rect.top + rect.height / 2}px`;
  fxEl.style.width = `${Math.max(rect.width, 90)}px`;
  fxEl.style.height = `${Math.max(rect.height, 120)}px`;

  const badgeText = attachType === "evolve"
    ? `✨ 進化！`
    : (attachType === "ability"
      ? `✨ 特性宣言！`
      : (attachType === "tool" ? `🎒 ${escapeHtml(label || "どうぐ装備")}` : `${escapeHtml(icon || "⚡")} ${escapeHtml(label || "エネルギー付与")}`));

  // 特性時のサイバー魔方陣オーラ、進化時の光の収束フレア
  const extraDecor = attachType === "ability"
    ? `<div class="fx-magic-circle"></div><div class="fx-magic-aura"></div>`
    : (attachType === "evolve"
      ? `<div class="fx-evolve-sunburst"></div><div class="fx-evolve-flares"></div>`
      : "");

  fxEl.innerHTML = `
    ${extraDecor}
    <div class="fx-ring ring-1"></div>
    <div class="fx-ring ring-2"></div>
    <div class="fx-particles">
      <span class="fx-p p1">${escapeHtml(icon || "✨")}</span>
      <span class="fx-p p2">${escapeHtml(icon || "✨")}</span>
      <span class="fx-p p3">${escapeHtml(icon || "✨")}</span>
      <span class="fx-p p4">${escapeHtml(icon || "✨")}</span>
    </div>
    <div class="fx-attach-float-label">${badgeText}</div>
  `;

  layer.appendChild(fxEl);
  targetEl.classList.add("fx-card-pop");

  setTimeout(() => {
    targetEl.classList.remove("fx-card-pop", "fx-card-ability-glow", "fx-card-evolve-glow");
    fxEl.remove();
  }, 1250);
}

/** 3. 🏆 サイドカードをペラッとめくる 3D フリップエフェクト */
function playPrizeFlipEffect(prizeIdx, card, destination = "hand", isOpponent = false, customSrcRect = null) {
  const layer = ensureFxLayer();
  const prizesContainer = document.getElementById(isOpponent ? "opp-prizes" : "my-prizes");

  let startX = window.innerWidth * 0.82;
  let startY = isOpponent ? window.innerHeight * 0.22 : window.innerHeight * 0.68;

  if (customSrcRect && customSrcRect.width > 0) {
    startX = customSrcRect.left + customSrcRect.width / 2;
    startY = customSrcRect.top + customSrcRect.height / 2;
  } else if (prizesContainer) {
    const r = prizesContainer.getBoundingClientRect();
    if (r.width > 0) {
      startX = r.left + r.width / 2;
      startY = r.top + r.height / 2;
    }
  }

  let endX = window.innerWidth * 0.5;
  let endY = isOpponent ? window.innerHeight * 0.08 : window.innerHeight * 0.88;
  if (destination === "trash") {
    const trashEl = document.getElementById(isOpponent ? "opp-trash" : "my-trash");
    if (trashEl) {
      const tr = trashEl.getBoundingClientRect();
      if (tr.width > 0) {
        endX = tr.left + tr.width / 2;
        endY = tr.top + tr.height / 2;
      }
    }
  }

  const canRevealFace = !!card && (!isOpponent || destination === "trash");
  const cardProps = (canRevealFace && card) ? getCardRenderProps(card, false, "fx-prize-card-front") : null;

  const frontContent = (canRevealFace && cardProps)
    ? `
      <div class="${cardProps.className}" ${cardProps.imgStyle}>
        ${buildCardInnerHtml(card)}
      </div>
    `
    : `<div class="back fx-prize-card-front"></div>`;

  const actionTag = destination === "trash" ? "🗑️ サイドからトラッシュ！" : "🏆 サイド取得！";

  const wrap = document.createElement("div");
  wrap.className = `fx-prize-flip-wrap ${canRevealFace ? 'reveal-face' : 'secret-face'}`;
  wrap.style.setProperty("--start-x", `${startX}px`);
  wrap.style.setProperty("--start-y", `${startY}px`);
  wrap.style.setProperty("--end-x", `${endX}px`);
  wrap.style.setProperty("--end-y", `${endY}px`);

  wrap.innerHTML = `
    <div class="fx-prize-3d-inner">
      <div class="fx-prize-side back-side"><div class="back"></div></div>
      <div class="fx-prize-side front-side">${frontContent}</div>
    </div>
    <div class="fx-prize-tag">${actionTag}</div>
  `;

  layer.appendChild(wrap);
  setTimeout(() => {
    wrap.remove();
  }, 1350);
}

/** ポップアップ表示中、入れ替え前の座標にカードを保持しておく補助関数 */
function preStageSwapPositions(benchIndex = 0, isOpponent = false) {
  const activeLoc = isOpponent ? "opp-active" : "active";
  const benchLoc = isOpponent ? `opp-bench_${benchIndex}` : `bench_${benchIndex}`;
  const activeEl = findLocationElement(activeLoc);
  const benchEl = findLocationElement(benchLoc);
  if (!activeEl || !benchEl) return;

  activeEl.style.transition = "none";
  activeEl.style.transform = "";
  benchEl.style.transition = "none";
  benchEl.style.transform = "";

  const rectA = activeEl.getBoundingClientRect();
  const rectB = benchEl.getBoundingClientRect();
  if (rectA.width === 0 || rectB.width === 0) return;

  const dx = (rectB.left + rectB.width / 2) - (rectA.left + rectA.width / 2);
  const dy = (rectB.top + rectB.height / 2) - (rectA.top + rectA.height / 2);

  activeEl.style.transform = `translate(${dx}px, ${dy}px) scale(0.92)`;
  benchEl.style.transform = `translate(${-dx}px, ${-dy}px) scale(1.06)`;
}

/** 4. 🔄 バトル場 ⇔ ベンチ入れ替えスライドエフェクト（ポップアップ消去後に再生） */
function playSwapEffect(benchIndex = 0, isOpponent = false) {
  const activeLoc = isOpponent ? "opp-active" : "active";
  const benchLoc = isOpponent ? `opp-bench_${benchIndex}` : `bench_${benchIndex}`;

  const activeEl = findLocationElement(activeLoc);
  const benchEl = findLocationElement(benchLoc);
  if (!activeEl || !benchEl) return;

  // 一旦transformを解除して本来のスロット座標を正確に計測する
  activeEl.style.transition = "none";
  activeEl.style.transform = "";
  benchEl.style.transition = "none";
  benchEl.style.transform = "";

  const rectA = activeEl.getBoundingClientRect();
  const rectB = benchEl.getBoundingClientRect();
  if (rectA.width === 0 || rectB.width === 0) return;

  const dx = (rectB.left + rectB.width / 2) - (rectA.left + rectA.width / 2);
  const dy = (rectB.top + rectB.height / 2) - (rectA.top + rectA.height / 2);

  // 入れ替え後の新バトル場カードは「ベンチ位置 → バトル場位置」へ滑り込み
  activeEl.style.transform = `translate(${dx}px, ${dy}px) scale(0.92)`;
  activeEl.style.zIndex = "50";

  // 入れ替え後の新ベンチカードは「バトル場位置 → ベンチ位置」へ滑り込み
  benchEl.style.transform = `translate(${-dx}px, ${-dy}px) scale(1.06)`;
  benchEl.style.zIndex = "49";

  // 中間地点に 🔄 スワップリング演出を表示
  const layer = ensureFxLayer();
  const midIcon = document.createElement("div");
  midIcon.className = "fx-swap-badge";
  midIcon.style.left = `${(rectA.left + rectB.left + rectA.width) / 2}px`;
  midIcon.style.top = `${(rectA.top + rectB.top + rectA.height) / 2}px`;
  midIcon.innerHTML = `<span>🔄 交代！</span>`;
  layer.appendChild(midIcon);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      activeEl.style.transition = "transform 0.65s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.65s ease";
      activeEl.style.transform = "translate(0, 0) scale(1)";
      activeEl.style.boxShadow = "0 0 28px rgba(56, 189, 248, 0.9)";

      benchEl.style.transition = "transform 0.65s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.65s ease";
      benchEl.style.transform = "translate(0, 0) scale(1)";
      benchEl.style.boxShadow = "0 0 22px rgba(148, 163, 184, 0.75)";
    });
  });

  setTimeout(() => {
    if (activeEl) {
      activeEl.style.transition = "";
      activeEl.style.transform = "";
      activeEl.style.boxShadow = "";
      activeEl.style.zIndex = "";
    }
    if (benchEl) {
      benchEl.style.transition = "";
      benchEl.style.transform = "";
      benchEl.style.boxShadow = "";
      benchEl.style.zIndex = "";
    }
    midIcon.remove();
  }, 720);
}

/**
 * 📳 ダメージ量連動スクリーンシェイク
 * ダメージ量に応じて画面全体の振動幅と持続時間がスケール
 * - +10〜40: 軽度の揺れ（.screen-shake-light, 200ms）
 * - +50〜90: 中程度の揺れ（.screen-shake-medium, 340ms）
 * - +100以上: 激しい重撃揺れ（.screen-shake-heavy, 500ms）
 */
function triggerScreenShake(delta = 10) {
  const boardEl = document.querySelector(".board") || document.body;
  if (!boardEl) return;

  const absDelta = Math.abs(delta);
  let shakeClass = "screen-shake-light";
  let duration = 200;

  if (absDelta >= 100) {
    shakeClass = "screen-shake-heavy";
    duration = 500;
  } else if (absDelta >= 50) {
    shakeClass = "screen-shake-medium";
    duration = 340;
  }

  boardEl.classList.remove("screen-shake-light", "screen-shake-medium", "screen-shake-heavy");
  void boardEl.offsetWidth; // 強制リフロー
  boardEl.classList.add(shakeClass);

  setTimeout(() => {
    boardEl.classList.remove(shakeClass);
  }, duration);
}

/** 5. 💥 ダメカン増減（被ダメージ揺れ＆数値ポップアップ＆画面シェイク）エフェクト */
function playDamageEffect(location, delta = 10) {
  const targetEl = findLocationElement(location);
  if (!targetEl) return;
  const rect = targetEl.getBoundingClientRect();
  if (rect.width === 0) return;

  const isHeal = delta < 0;
  const layer = ensureFxLayer();
  const pop = document.createElement("div");
  pop.className = `fx-dmg-popup ${isHeal ? 'heal' : 'hit'}`;
  pop.style.left = `${rect.left + rect.width / 2}px`;
  pop.style.top = `${rect.top + rect.height * 0.35}px`;
  pop.textContent = isHeal ? `✨ ${delta}` : `💥 +${delta}`;
  layer.appendChild(pop);

  if (!isHeal) {
    targetEl.classList.add("fx-hit-shake");
    triggerScreenShake(delta);
    if (window.SoundEffects && typeof SoundEffects.playDamagePunch === "function") {
      SoundEffects.playDamagePunch(delta);
    }
  } else {
    targetEl.classList.add("fx-heal-glow");
  }

  setTimeout(() => {
    targetEl.classList.remove("fx-hit-shake", "fx-heal-glow");
    pop.remove();
  }, 850);
}

/** 5.5 💀 ポケモン気絶・ノックアウト消滅エフェクト */
function playKnockoutDissolveEffect(location) {
  const targetEl = findLocationElement(location);
  if (!targetEl) return;

  const rect = targetEl.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;

  if (window.SoundEffects && typeof SoundEffects.playKnockout === "function") {
    SoundEffects.playKnockout();
  }

  const layer = ensureFxLayer();
  const fxEl = document.createElement("div");
  fxEl.className = "fx-knockout-container";
  fxEl.style.left = `${rect.left + rect.width / 2}px`;
  fxEl.style.top = `${rect.top + rect.height / 2}px`;
  fxEl.style.width = `${Math.max(rect.width, 80)}px`;
  fxEl.style.height = `${Math.max(rect.height, 110)}px`;

  fxEl.innerHTML = `
    <div class="fx-knockout-shockwave"></div>
    <div class="fx-knockout-dark-pulse"></div>
    <div class="fx-knockout-particles">
      <span class="fx-kp kp1">💀</span>
      <span class="fx-kp kp2">💥</span>
      <span class="fx-kp kp3">💨</span>
      <span class="fx-kp kp4">✨</span>
    </div>
    <div class="fx-knockout-badge">💀 KNOCK OUT!</div>
  `;

  layer.appendChild(fxEl);

  setTimeout(() => {
    fxEl.remove();
  }, 950);
}

/** 6. 🔀 ド派手な山札シャッフルエフェクト（大げさな空中3Dリッフル＆フラッシュ演出） */
function playDeckShuffleEffect(isOpponent = false) {
  const deckEl = document.getElementById(isOpponent ? "opp-deck" : "my-deck");
  if (!deckEl) return;
  
  // 1. デッキ自体の揺れ＆発光
  deckEl.classList.remove("fx-deck-shuffling");
  void deckEl.offsetWidth; // リフロー
  deckEl.classList.add("fx-deck-shuffling");
  setTimeout(() => {
    deckEl.classList.remove("fx-deck-shuffling");
  }, 1100);

  // 2. 空中での大げさな3Dリッフルシャッフルオーバーレイ
  const layer = ensureFxLayer();
  const rect = deckEl.getBoundingClientRect();
  const centerX = (rect.width > 0) ? (rect.left + rect.width / 2) : (isOpponent ? window.innerWidth * 0.2 : window.innerWidth * 0.8);
  const centerY = (rect.height > 0) ? (rect.top + rect.height / 2) : (isOpponent ? window.innerHeight * 0.25 : window.innerHeight * 0.75);

  const container = document.createElement("div");
  container.className = `fx-grand-shuffle-overlay ${isOpponent ? 'is-opp' : 'is-me'}`;
  container.style.left = `${centerX}px`;
  container.style.top = `${centerY}px`;

  container.innerHTML = `
    <div class="fx-shuffle-pack pack-left">
      <div class="fx-shuffle-card c1"></div>
      <div class="fx-shuffle-card c2"></div>
      <div class="fx-shuffle-card c3"></div>
    </div>
    <div class="fx-shuffle-pack pack-right">
      <div class="fx-shuffle-card c1"></div>
      <div class="fx-shuffle-card c2"></div>
      <div class="fx-shuffle-card c3"></div>
    </div>
    <div class="fx-shuffle-flash"></div>
    <div class="fx-shuffle-badge">
      <span class="icon">🔀</span>
      <span class="text">SHUFFLE!!</span>
    </div>
  `;

  layer.appendChild(container);

  setTimeout(() => {
    container.remove();
  }, 1150);
}

window.startSetupCoinToss = startSetupCoinToss;
window.executeSetupCoinToss = executeSetupCoinToss;
window.handleCoinResult = handleCoinResult;
window.openOrderSelectModal = openOrderSelectModal;
window.chooseFirstPlayer = chooseFirstPlayer;
window.triggerBoardEffect = triggerBoardEffect;
window.playLocalBoardEffect = playLocalBoardEffect;
window.playCoinTossEffect = playCoinTossEffect;

// =============================================================================
// ド派手な勝利演出 ＆ 勝利宣言
// =============================================================================
let _confettiAnimId = null;

function declareVictory() {
  if (!confirm("勝利宣言を行いますか？\n（相手にも勝利画面が表示され、対戦ログに記録されます）")) return;
  addLog(`【勝利宣言】${state.myName} が勝利を宣言しました！`, {
    oppText: `【勝利宣言】${state.myName} が勝利を宣言しました！`,
    badge: "🏆 勝利宣言"
  });
  if (typeof P2P !== "undefined" && P2P.connected) {
    P2P.send({
      t: "victory",
      winnerName: state.myName,
      reason: "勝利宣言により対戦が決着しました！"
    });
  }
  playGrandVictoryEffect(state.myName, "勝利宣言により対戦が決着しました！", false);
}

function playGrandVictoryEffect(winnerName, reasonText = "すべてのサイドカードを取りきりました！", isRemote = false) {
  const overlay = document.getElementById("victory-overlay");
  const titleEl = document.getElementById("victory-title-text");
  const subBannerEl = document.getElementById("victory-sub-banner");
  const nameEl = document.getElementById("victory-winner-name");
  const descEl = document.getElementById("victory-winner-desc");
  if (!overlay) return;

  if (typeof SoundEffects !== "undefined") SoundEffects.playVictoryFanfare();

  const isMeWinner = (winnerName === state.myName);

  if (titleEl) {
    titleEl.textContent = isMeWinner ? "VICTORY!!" : "MATCH FINISHED";
  }
  if (subBannerEl) {
    subBannerEl.textContent = isMeWinner ? "🎉 勝利 🎉" : "⚔️ 対戦終了 ⚔️";
  }
  if (nameEl) {
    nameEl.textContent = winnerName || "プレイヤー";
  }
  if (descEl) {
    descEl.textContent = reasonText;
  }

  overlay.classList.remove("hidden");
  startConfettiAnimation();
}

function closeVictoryOverlay() {
  const overlay = document.getElementById("victory-overlay");
  if (overlay) overlay.classList.add("hidden");
  stopConfettiAnimation();
}

function startConfettiAnimation() {
  const canvas = document.getElementById("victory-confetti-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const confettiCount = 140;
  const colors = ["#f59e0b", "#fbbf24", "#ef4444", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899", "#ffffff", "#f43f5e"];
  const particles = [];

  for (let i = 0; i < confettiCount; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: Math.random() * 14 + 6,
      h: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 5,
      vy: Math.random() * 4 + 3.5,
      rot: Math.random() * 360,
      vrot: (Math.random() - 0.5) * 8
    });
  }

  if (_confettiAnimId) cancelAnimationFrame(_confettiAnimId);

  function renderFrame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;

      if (p.y > canvas.height) {
        p.y = -20;
        p.x = Math.random() * canvas.width;
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    _confettiAnimId = requestAnimationFrame(renderFrame);
  }

  _confettiAnimId = requestAnimationFrame(renderFrame);
}

function stopConfettiAnimation() {
  if (_confettiAnimId) {
    cancelAnimationFrame(_confettiAnimId);
    _confettiAnimId = null;
  }
}

// =============================================================================
// ベンチ枠拡張 (5 ⇔ 8) ＆ 縮小時トラッシュ処理
// =============================================================================
function toggleBenchCapacity() {
  if ((state.myBenchLimit || 5) === 5) {
    // 5 -> 8 に拡張
    state.myBenchLimit = 8;
    addLog(`【ベンチ枠拡張】ベンチ枠を8匹に増やしました`, {
      oppText: `【ベンチ枠拡張】ベンチ枠を8匹に増やしました`,
      badge: "🏟️ ベンチ枠8拡張"
    });
    showToast("ベンチ枠を8匹に拡張しました");
    renderAll();
    if (typeof P2P !== "undefined" && P2P.connected) P2P.syncNow();
  } else {
    // 8 -> 5 に縮小
    const benchCards = [];
    state.myBench.forEach((p, idx) => {
      if (p !== null) {
        benchCards.push({ pokemon: p, index: idx });
      }
    });

    if (benchCards.length <= 5) {
      // 5匹以下のためトラッシュ不要。空きスロットを詰めて0..4に並べる
      const remainingPokemons = benchCards.map(item => item.pokemon);
      state.myBench = [null, null, null, null, null, null, null, null];
      remainingPokemons.forEach((p, idx) => {
        state.myBench[idx] = p;
      });
      state.myBenchLimit = 5;
      addLog(`【ベンチ枠縮小】ベンチ枠を5匹に戻しました`, {
        oppText: `【ベンチ枠縮小】ベンチ枠を5匹に戻しました`,
        badge: "🏟️ ベンチ枠5戻し"
      });
      showToast("ベンチ枠を5匹に戻しました");
      renderAll();
      if (typeof P2P !== "undefined" && P2P.connected) P2P.syncNow();
    } else {
      // 6匹以上出ている場合はトラッシュが必要
      const needTrashCount = benchCards.length - 5;
      showBenchShrinkTrashModal(benchCards, needTrashCount);
    }
  }
}

function showBenchShrinkTrashModal(benchCards, needTrashCount) {
  const selectedIndices = new Set();

  function buildListHtml() {
    return benchCards.map(item => {
      const p = item.pokemon;
      const isChecked = selectedIndices.has(item.index);
      const toolText = p.tool ? ` [どうぐ: ${p.tool.name}]` : "";
      const energyCount = p.energies ? p.energies.length : 0;
      const energyText = energyCount > 0 ? ` [エネ: ${energyCount}枚]` : "";
      const dmgText = p.damage > 0 ? ` [ダメカン: ${p.damage}]` : "";
      return `
        <label class="bench-trash-item ${isChecked ? 'selected' : ''}" style="display:flex; align-items:center; gap:10px; padding:10px 14px; margin-bottom:8px; background:rgba(30,41,59,0.7); border:1px solid ${isChecked ? '#ef4444' : 'rgba(255,255,255,0.1)'}; border-radius:8px; cursor:pointer; transition:all 0.15s;">
          <input type="checkbox" data-idx="${item.index}" ${isChecked ? 'checked' : ''} style="width:20px; height:20px; accent-color:#ef4444; cursor:pointer;">
          <div style="flex:1;">
            <div style="font-weight:bold; font-size:15px; color:${isChecked ? '#fca5a5' : '#f8fafc'};">
              ベンチ${item.index + 1}: ${escapeHtml(p.card.name)}
            </div>
            <div style="font-size:12px; color:#94a3b8; margin-top:2px;">
              ${escapeHtml(dmgText)}${escapeHtml(energyText)}${escapeHtml(toolText)}
            </div>
          </div>
        </label>
      `;
    }).join("");
  }

  function renderModalContent() {
    const listHtml = buildListHtml();
    const remainNeed = needTrashCount - selectedIndices.size;
    const isExact = (selectedIndices.size === needTrashCount);

    const bodyHtml = `
      <div style="padding:10px 4px; color:#f8fafc;">
        <div style="background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3); border-radius:8px; padding:12px 14px; margin-bottom:14px; line-height:1.5; font-size:14px;">
          ⚠️ <b>ベンチ枠を5匹にするため、トラッシュするポケモンを選択してください。</b><br>
          現在ベンチに <b>${benchCards.length}匹</b> 出ているため、<b>${needTrashCount}匹</b> をトラッシュする必要があります（残り5匹になります）。
        </div>
        <div style="font-weight:bold; font-size:14px; margin-bottom:10px; color:#e2e8f0; display:flex; justify-content:space-between; align-items:center;">
          <span>トラッシュするポケモンを選択:</span>
          <span style="color:${isExact ? '#86efac' : '#fca5a5'}; font-size:15px;">
            選択中: <b>${selectedIndices.size} / ${needTrashCount}</b> 匹
          </span>
        </div>
        <div id="bench-trash-list-container" style="max-height:280px; overflow-y:auto; padding-right:4px;">
          ${listHtml}
        </div>
      </div>
    `;

    const footerHtml = `
      <div style="display:flex; justify-content:flex-end; gap:10px; width:100%;">
        <button class="btn" onclick="closeModal()">キャンセル (枠8のまま)</button>
        <button id="btn-confirm-bench-trash" class="btn red big" ${!isExact ? 'disabled' : ''} onclick="confirmBenchShrinkTrash()">
          ${isExact ? `🗑️ ${needTrashCount}匹をトラッシュして枠を5にする` : `あと ${remainNeed > 0 ? remainNeed : 0} 匹選択してください`}
        </button>
      </div>
    `;

    showModal("🏟️ ベンチ枠縮小：ポケモンをトラッシュ", bodyHtml, footerHtml);

    const container = document.getElementById("bench-trash-list-container");
    if (container) {
      container.querySelectorAll("input[type=checkbox]").forEach(cb => {
        cb.onchange = () => {
          const idx = parseInt(cb.dataset.idx, 10);
          if (cb.checked) {
            if (selectedIndices.size >= needTrashCount) {
              cb.checked = false;
              showToast(`トラッシュできるのは ${needTrashCount} 匹までです`);
              return;
            }
            selectedIndices.add(idx);
          } else {
            selectedIndices.delete(idx);
          }
          renderModalContent();
        };
      });
    }
  }

  window.confirmBenchShrinkTrash = function() {
    if (selectedIndices.size !== needTrashCount) {
      return alert(`${needTrashCount}匹選択してください`);
    }

    const trashedNames = [];
    const trashedCards = [];

    selectedIndices.forEach(idx => {
      const p = state.myBench[idx];
      if (p) {
        trashedNames.push(p.card.name);
        const pokeCards = getPokemonCardsList(p);
        trashedCards.push(...pokeCards);
        pokeCards.forEach(c => state.myTrash.push(c));
        if (p.tool) state.myTrash.push(p.tool);
        if (p.energies) p.energies.forEach(e => state.myTrash.push(e));
        state.myBench[idx] = null;
      }
    });

    // 残りのポケモンを詰める
    const remaining = state.myBench.filter(p => p !== null);
    state.myBench = [null, null, null, null, null, null, null, null];
    remaining.forEach((p, idx) => {
      state.myBench[idx] = p;
    });

    state.myBenchLimit = 5;

    addLog(`【ベンチ枠縮小】ベンチ枠を5匹に戻し、ポケモン（${trashedNames.join(", ")}）をトラッシュしました`, {
      oppText: `【ベンチ枠縮小】ベンチ枠を5匹に戻し、ベンチから ${needTrashCount}匹（${trashedNames.join(", ")}）をトラッシュしました`,
      cards: trashedCards,
      badge: "🗑️ ベンチ縮小トラッシュ"
    });

    showToast(`ベンチ枠を5匹に戻しました (${needTrashCount}匹トラッシュ)`);
    closeModal();
    renderAll();
    if (typeof P2P !== "undefined" && P2P.connected) P2P.syncNow();
  };

  renderModalContent();
}

// =============================================================================
// 相手ポケモン コンテキストメニュー（ダメカン・特殊状態・呼び出し・トラッシュ）
// =============================================================================
let _lastOppFieldClick = { key: "", ts: 0 };

function getOpponentPokemonDisplayName(location, index) {
  const target = location === "opp-active" ? state.oppActive : state.oppBench[index];
  if (!target || !target.card) return "相手のポケモン";
  const rawName = target.card.name || "相手のポケモン";

  const allField = [];
  if (state.oppActive && state.oppActive.card) {
    allField.push({ loc: "opp-active", idx: 0, card: state.oppActive.card });
  }
  state.oppBench.forEach((b, bIdx) => {
    if (b && b.card) {
      allField.push({ loc: "opp-bench", idx: bIdx, card: b.card });
    }
  });

  const sameNamed = allField.filter(p => p.card.name === rawName);
  if (sameNamed.length <= 1) return rawName;

  const numSymbols = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];
  const orderIdx = sameNamed.findIndex(p => p.loc === location && p.idx === index);
  const symbol = (orderIdx >= 0 && orderIdx < numSymbols.length) ? numSymbols[orderIdx] : `(${orderIdx + 1})`;
  return `${rawName}${symbol}`;
}

function showOpponentPokemonMenu(e, location, index, menuView = "main") {
  if (e && e.stopPropagation) e.stopPropagation();
  if (state.mustPromoteToActive) {
    showToast("⚠️ バトル場に出すベンチポケモンを選択してください");
    return;
  }
  const ctx = document.getElementById("ctx");
  const target = location === "opp-active" ? state.oppActive : state.oppBench[index];
  if (!target || !target.card) return;

  const displayName = getOpponentPokemonDisplayName(location, index);
  ctx.classList.add("ctx-wide");

  if (menuView === "damage") {
    // サブメニュー①: ダメカン操作（連打対応：メニューを開いたまま維持）
    ctx.innerHTML = `
      <div class="ctx-header-row">
        <button class="ctx-back-btn" onclick="showOpponentPokemonMenu(event, '${location}', ${index}, 'main')">◀ 戻る</button>
        <span class="ctx-title-text">💥 相手のダメカン操作 <small>(現在: ${target.damage})</small></span>
        <button class="ctx-zoom-btn" onclick="hideCtx()" title="閉じる" style="padding:2px 8px;">✖</button>
      </div>
      <div class="divider"></div>
      <div class="ctx-grid-2col">
        <button onclick="modifyOpponentDamage('${location}', ${index}, 10, true)">ダメカン +10</button>
        <button onclick="modifyOpponentDamage('${location}', ${index}, -10, true)">ダメカン -10</button>
        <button onclick="modifyOpponentDamage('${location}', ${index}, 50, true)">ダメカン +50</button>
        <button onclick="modifyOpponentDamage('${location}', ${index}, 100, true)">ダメカン +100</button>
        <button class="ctx-span-2" onclick="modifyOpponentDamage('${location}', ${index}, -999, true)">✨ ダメカン リセット (0にする)</button>
        <button class="ctx-span-2" style="background:#334155; color:#f8fafc; margin-top:4px; font-weight:bold; padding:6px;" onclick="hideCtx()">✖ 完了（閉じる）</button>
      </div>
    `;
  } else if (menuView === "condition" && location === "opp-active") {
    // サブメニュー②: 特殊状態（相手バトル場）
    const cond = (typeof ensurePokemonConditions === "function")
      ? ensurePokemonConditions(target)
      : (target.conditions || { poison: false, burn: false, special: null });
    const hasAny = !!(cond.poison || cond.burn || cond.special);

    const isPoison = !!cond.poison;
    const isBurn = !!cond.burn;
    const isParalyzed = cond.special === "paralyzed";
    const isConfused = cond.special === "confused";
    const isAsleep = cond.special === "asleep";

    ctx.innerHTML = `
      <div class="ctx-header-row">
        <button class="ctx-back-btn" onclick="showOpponentPokemonMenu(event, '${location}', ${index}, 'main')">◀ 戻る</button>
        <span class="ctx-title-text">🧪 特殊状態 <small>(相手: ${escapeHtml(displayName)})</small></span>
      </div>
      <div class="divider"></div>
      <div class="ctx-grid-2col">
        <button class="ctx-cond-btn ${isPoison ? 'active poison' : ''}" onclick="toggleOpponentCondition('poison')">
          ${isPoison ? '✨ どくを治す' : '☠️ どくにする'}
        </button>
        <button class="ctx-cond-btn ${isBurn ? 'active burn' : ''}" onclick="toggleOpponentCondition('burn')">
          ${isBurn ? '✨ やけどを治す' : '🔥 やけどにする'}
        </button>
        <button class="ctx-cond-btn ${isParalyzed ? 'active paralyzed' : ''}" onclick="toggleOpponentCondition('paralyzed')">
          ${isParalyzed ? '✨ まひを治す' : '⚡ まひにする'}
        </button>
        <button class="ctx-cond-btn ${isConfused ? 'active confused' : ''}" onclick="toggleOpponentCondition('confused')">
          ${isConfused ? '✨ こんらんを治す' : '😵 こんらんにする'}
        </button>
        <button class="ctx-cond-btn ${isAsleep ? 'active asleep' : ''}" onclick="toggleOpponentCondition('asleep')">
          ${isAsleep ? '✨ ねむりを治す' : '💤 ねむりにする'}
        </button>
        ${hasAny ? `<button class="ctx-cond-btn clear ctx-span-2" onclick="clearOpponentConditions()">✨ 特殊状態を全回復</button>` : ''}
      </div>
    `;
  } else if (menuView === "deck") {
    // ==========================================
    // サブメニュー③: 相手の山札に戻す（案2: シャッフル / 山札の下）
    // ==========================================
    ctx.innerHTML = `
      <div class="ctx-header-row">
        <button class="ctx-back-btn" onclick="showOpponentPokemonMenu(event, '${location}', ${index}, 'main')">◀ 戻る</button>
        <span class="ctx-title-text">🎴 相手の山札に戻す <small>(${escapeHtml(displayName)})</small></span>
      </div>
      <div class="divider"></div>
      <div style="display:flex; flex-direction:column; gap:6px; margin-top:4px;">
        <button class="ctx-deck-btn ctx-deck-shuffle" onclick="returnOpponentPokemonToDeck('${location}', ${index}, 'shuffle')">
          <span class="ctx-deck-btn-title">🔀 相手の山札に戻してシャッフル</span>
          <span class="ctx-deck-btn-desc">ポケモン本体・どうぐ・エネルギーを相手の山札へ戻しシャッフル</span>
        </button>
        <button class="ctx-deck-btn ctx-deck-bottom" onclick="returnOpponentPokemonToDeck('${location}', ${index}, 'bottom')">
          <span class="ctx-deck-btn-title">⬇️ 相手の山札の下へ送る</span>
          <span class="ctx-deck-btn-desc">ポケモン本体・どうぐ・エネルギーを相手の山札の底に送る</span>
        </button>
      </div>
    `;
  } else {
    // メインメニュー（※特性を使うボタンは相手には含めない）
    let subLaunchersHtml = "";
    if (location === "opp-active") {
      subLaunchersHtml = `
        <div class="ctx-grid-2col">
          <button class="ctx-submenu-nav" onclick="showOpponentPokemonMenu(event, '${location}', ${index}, 'damage')">💥 ダメカンを載せる ▶</button>
          <button class="ctx-submenu-nav" onclick="showOpponentPokemonMenu(event, '${location}', ${index}, 'condition')">🧪 特殊状態 ▶</button>
        </div>
      `;
    } else {
      subLaunchersHtml = `
        <div class="ctx-grid-2col">
          <button class="ctx-span-2 ctx-submenu-nav" onclick="showOpponentPokemonMenu(event, '${location}', ${index}, 'damage')">💥 ダメカンを載せる ▶</button>
        </div>
      `;
    }

    let swapActionHtml = "";
    if (location === "opp-bench") {
      swapActionHtml = state.oppActive
        ? `<button class="ctx-span-2" style="color:#60a5fa; font-weight:bold;" onclick="swapOpponentBenchToActive(${index})">🔄 バトル場へ呼び出す (ボスの指令等)</button>`
        : `<button class="ctx-span-2" style="background:#2563eb; color:#fff; font-weight:bold;" onclick="swapOpponentBenchToActive(${index})">⚔️ バトル場に出す</button>`;
    } else if (location === "opp-active") {
      const hasBench = state.oppBench.some(b => b !== null);
      if (hasBench) {
        swapActionHtml = `<button class="ctx-span-2" onclick="showOpponentActiveSwapMenu()">🔄 ベンチポケモンと交代 ▶</button>`;
      }
    }

    ctx.innerHTML = `
      <div class="ctx-header-row">
        <span class="ctx-title-text">相手：${escapeHtml(displayName)} <small>(ダメカン: ${target.damage})</small></span>
        <button class="ctx-zoom-btn" onclick="openOpponentPokemonZoom('${location}', ${index})">🔍 詳細</button>
      </div>
      <div class="divider"></div>
      ${subLaunchersHtml}
      <div class="ctx-grid-2col">
        ${swapActionHtml}
        <button onclick="removeOpponentPokemonToTrash('${location}', ${index})">🗑️ トラッシュへ</button>
        <button onclick="removeOpponentPokemonToHand('${location}', ${index})">🖐️ 手札に戻す</button>
        <button class="ctx-span-2" onclick="showOpponentPokemonMenu(event, '${location}', ${index}, 'deck')">🎴 山札に戻す ▶</button>
        <button class="ctx-span-2" style="background:#7f1d1d; color:#fecaca; font-weight:bold; border:1px solid #ef4444; margin-top:2px;" onclick="knockoutOpponentPokemon('${location}', ${index})">💀 このポケモンを気絶させる</button>
      </div>
    `;
  }

  const clientX = (e && e.clientX) ? e.clientX : window.innerWidth / 2;
  const clientY = (e && e.clientY) ? e.clientY : window.innerHeight / 2;
  ctx.style.left = `${Math.min(clientX, window.innerWidth - 300)}px`;
  ctx.style.top = `${Math.min(clientY, window.innerHeight - 260)}px`;
  ctx.classList.remove("hidden");
}

function openOpponentPokemonZoom(location, index) {
  hideCtx();
  const target = location === "opp-active" ? state.oppActive : state.oppBench[index];
  if (!target || !target.card) return;
  openCardZoom(target.card, target);
}

function modifyOpponentDamage(location, index, delta, keepMenu = false) {
  if (!keepMenu) hideCtx();
  const target = location === "opp-active" ? state.oppActive : state.oppBench[index];
  if (!target) return;
  const prevDamage = target.damage || 0;
  if (delta === -999) {
    target.damage = 0;
  } else {
    target.damage = Math.max(0, target.damage + delta);
  }
  const actualDelta = target.damage - prevDamage;
  const locId = location === "opp-active" ? "opp-active" : `opp-bench_${index}`;
  const displayName = getOpponentPokemonDisplayName(location, index);

  addLog(`相手の「${displayName}」のダメカンを ${target.damage} に変更しました`, {
    oppText: `あなたの「${displayName}」のダメカンが ${target.damage} に変更されました`,
    cards: [target.card],
    badge: "💥 相手ダメカン変更"
  });

  renderAll();

  if (actualDelta !== 0 && typeof triggerBoardEffect === "function") {
    triggerBoardEffect({
      fxType: "damage",
      location: locId,
      delta: actualDelta
    });
  }

  if (keepMenu) {
    const titleSmall = document.querySelector("#ctx .ctx-title-text small");
    if (titleSmall) {
      titleSmall.textContent = `(現在: ${target.damage})`;
    }
  }

  if (typeof P2P !== "undefined" && P2P.connected) {
    P2P.send({
      t: "opp_remote_action",
      action: "modify_damage",
      location: location === "opp-active" ? "active" : "bench",
      index: index,
      damage: target.damage,
      delta: actualDelta
    });
    P2P.syncNow();
  }
}

function toggleOpponentCondition(condType) {
  hideCtx();
  if (!state.oppActive) return;
  const cond = (typeof ensurePokemonConditions === "function")
    ? ensurePokemonConditions(state.oppActive)
    : (state.oppActive.conditions = state.oppActive.conditions || { poison: false, burn: false, special: null });

  let newStatus = false;
  let label = "";

  if (condType === "poison") {
    cond.poison = !cond.poison;
    newStatus = cond.poison;
    label = newStatus ? "どく" : "どく回復";
  } else if (condType === "burn") {
    cond.burn = !cond.burn;
    newStatus = cond.burn;
    label = newStatus ? "やけど" : "やけど回復";
  } else if (condType === "paralyzed" || condType === "confused" || condType === "asleep") {
    const specialLabels = { paralyzed: "まひ", confused: "こんらん", asleep: "ねむり" };
    if (cond.special === condType) {
      cond.special = null;
      newStatus = false;
      label = `${specialLabels[condType]}回復`;
    } else {
      cond.special = condType;
      newStatus = true;
      label = specialLabels[condType];
    }
  }

  addLog(`相手のバトル場（${state.oppActive.card.name}）を【${label}】にしました`, {
    oppText: `あなたのバトル場（${state.oppActive.card.name}）が【${label}】になりました`,
    cards: [state.oppActive.card],
    badge: "🧪 特殊状態"
  });

  if (newStatus && typeof SoundEffects !== "undefined") {
    SoundEffects.playCondition(condType);
  }

  if (newStatus && typeof triggerBoardEffect === "function") {
    triggerBoardEffect({
      fxType: "condition",
      location: "opp-active",
      condType: condType
    });
  }

  if (typeof P2P !== "undefined" && P2P.connected) {
    P2P.send({
      t: "opp_remote_action",
      action: "set_conditions",
      conditions: cond
    });
    P2P.syncNow();
  }
}

function clearOpponentConditions() {
  hideCtx();
  if (!state.oppActive) return;
  if (typeof clearPokemonConditions === "function") {
    clearPokemonConditions(state.oppActive);
  } else {
    state.oppActive.conditions = { poison: false, burn: false, special: null };
  }

  addLog(`相手のバトル場（${state.oppActive.card.name}）の特殊状態を全回復しました`, {
    oppText: `あなたのバトル場（${state.oppActive.card.name}）の特殊状態が全回復しました`,
    cards: [state.oppActive.card],
    badge: "✨ 特殊状態回復"
  });

  renderAll();

  if (typeof P2P !== "undefined" && P2P.connected) {
    P2P.send({
      t: "opp_remote_action",
      action: "clear_conditions"
    });
    P2P.syncNow();
  }
}

function swapOpponentBenchToActive(benchIndex) {
  hideCtx();
  const benchTarget = state.oppBench[benchIndex];
  if (!benchTarget) return;

  const prevActive = state.oppActive;

  if (prevActive && typeof clearPokemonConditions === "function") {
    clearPokemonConditions(prevActive);
  }
  if (benchTarget && typeof clearPokemonConditions === "function") {
    clearPokemonConditions(benchTarget);
  }

  state.oppActive = benchTarget;
  state.oppBench[benchIndex] = prevActive;

  addLog(`【ボスの指令等】相手のベンチ「${benchTarget.card.name}」をバトル場へ呼び出しました`, {
    oppText: `【呼び出し】相手の操作により、ベンチの「${benchTarget.card.name}」がバトル場に呼び出されました`,
    cards: [benchTarget.card],
    badge: "🔄 相手ポケモン呼び出し"
  });

  showToast(`相手の「${benchTarget.card.name}」をバトル場へ呼び出しました`);
  renderAll();

  if (typeof triggerBoardEffect === "function") {
    triggerBoardEffect({
      fxType: "swap",
      location: "opp-active",
      benchIndex: benchIndex
    });
  }

  if (typeof P2P !== "undefined" && P2P.connected) {
    P2P.send({
      t: "opp_remote_action",
      action: "swap_active_bench",
      benchIndex: benchIndex
    });
    P2P.syncNow();
  }
}

function showOpponentActiveSwapMenu() {
  const benchList = [];
  state.oppBench.forEach((b, idx) => {
    if (b) benchList.push({ b, idx });
  });

  if (benchList.length === 0) return;
  const ctx = document.getElementById("ctx");
  ctx.innerHTML = `
    <div class="ctx-header-row">
      <button class="ctx-back-btn" onclick="showOpponentPokemonMenu(event, 'opp-active', 0, 'main')">◀ 戻る</button>
      <span class="ctx-title-text">🔄 呼び出すベンチを選択</span>
    </div>
    <div class="divider"></div>
    <div style="display:flex; flex-direction:column; gap:6px;">
      ${benchList.map(item => `
        <button style="padding:8px 12px; font-weight:bold; text-align:left;" onclick="swapOpponentBenchToActive(${item.idx})">
          ベンチ${item.idx + 1}: ${escapeHtml(item.b.card.name)} (ダメカン: ${item.b.damage})
        </button>
      `).join("")}
    </div>
  `;
}

function removeOpponentPokemonToTrash(location, index) {
  hideCtx();
  const target = location === "opp-active" ? state.oppActive : state.oppBench[index];
  if (!target) return;

  const pokeCards = getPokemonCardsList(target);
  pokeCards.forEach(c => state.oppTrash.push(c));
  if (target.tool) state.oppTrash.push(target.tool);
  if (target.energies) target.energies.forEach(e => state.oppTrash.push(e));

  if (location === "opp-active") state.oppActive = null;
  else state.oppBench[index] = null;

  const prevCount = Array.isArray(target.previousStages) ? target.previousStages.length : 0;
  const extraNote = prevCount > 0 ? `（進化元${prevCount}枚含む計${pokeCards.length}枚）` : "";
  addLog(`相手の「${target.card.name}」${extraNote}をトラッシュへ送りました`, {
    oppText: `あなたの「${target.card.name}」${extraNote}がトラッシュへ送られました`,
    cards: pokeCards,
    badge: "🗑️ 相手ポケモン破棄"
  });
  renderAll();

  if (typeof P2P !== "undefined" && P2P.connected) {
    P2P.send({
      t: "opp_remote_action",
      action: "remove_to_trash",
      location: location === "opp-active" ? "active" : "bench",
      index: index
    });
    P2P.syncNow();
  }
}

function removeOpponentPokemonToHand(location, index) {
  hideCtx();
  const target = location === "opp-active" ? state.oppActive : state.oppBench[index];
  if (!target) return;

  const pokeCards = getPokemonCardsList(target);
  if (target.tool) state.oppTrash.push(target.tool);
  if (target.energies) target.energies.forEach(e => state.oppTrash.push(e));

  if (location === "opp-active") state.oppActive = null;
  else state.oppBench[index] = null;

  state.oppHandCount = (state.oppHandCount || 0) + pokeCards.length;

  const prevCount = Array.isArray(target.previousStages) ? target.previousStages.length : 0;
  const extraNote = prevCount > 0 ? `（進化元${prevCount}枚含む計${pokeCards.length}枚）` : "";
  addLog(`相手の「${target.card.name}」${extraNote}を手札へ戻しました`, {
    oppText: `あなたの「${target.card.name}」${extraNote}が手札へ戻されました`,
    cards: pokeCards,
    badge: "🖐️ 相手ポケモン手札へ"
  });
  renderAll();

  if (typeof P2P !== "undefined" && P2P.connected) {
    P2P.send({
      t: "opp_remote_action",
      action: "remove_to_hand",
      location: location === "opp-active" ? "active" : "bench",
      index: index
    });
    P2P.syncNow();
  }
}

/**
 * 相手のポケモンを相手の山札に戻す（一人回し・手動操作用）
 * @param {"opp-active" | "opp-bench"} location
 * @param {number} index
 * @param {"shuffle" | "bottom"} mode
 */
function returnOpponentPokemonToDeck(location, index, mode = "shuffle") {
  hideCtx();
  const target = location === "opp-active" ? state.oppActive : state.oppBench[index];
  if (!target || !target.card) return;

  pushHistorySnapshot(mode === "shuffle" ? "相手ポケモンを山札へ戻しシャッフル" : "相手ポケモンを山札の下へ送る");

  const cardsToDeck = [target.card];
  if (target.tool) cardsToDeck.push(target.tool);
  if (target.energies && Array.isArray(target.energies)) {
    target.energies.forEach(e => cardsToDeck.push(e));
  }

  if (location === "opp-active") {
    state.oppActive = null;
    if (typeof clearOpponentConditions === "function") {
      clearOpponentConditions();
    }
  } else {
    state.oppBench[index] = null;
  }

  const name = target.card.name;
  const count = cardsToDeck.length;

  if (mode === "bottom") {
    cardsToDeck.forEach(c => state.oppDeck.push(c));
    const extraInfo = count > 1 ? `（どうぐ・エネルギー等含む計${count}枚）` : "";
    addLog(`相手の「${name}」${extraInfo}を山札の下に戻しました`, {
      oppText: `あなたの「${name}」${extraInfo}が山札の下に戻されました`,
      badge: "⬇️ 相手ポケモン山札の下へ"
    });
    showToast(`相手の「${name}」を山札の下に戻しました (${count}枚)`);
  } else {
    cardsToDeck.forEach(c => state.oppDeck.push(c));
    state.oppDeck = shuffleArray(state.oppDeck);
    const extraInfo = count > 1 ? `（どうぐ・エネルギー等含む計${count}枚）` : "";
    addLog(`相手の「${name}」${extraInfo}を山札に戻してシャッフルしました`, {
      oppText: `あなたの「${name}」${extraInfo}が山札に戻されシャッフルされました`,
      badge: "🔀 相手ポケモン山札戻し"
    });
    showToast(`相手の「${name}」を山札に戻してシャッフルしました (${count}枚)`);
  }

  renderAll();

  if (typeof P2P !== "undefined" && P2P.connected) {
    P2P.send({
      t: "opp_remote_action",
      action: "remove_to_deck",
      mode: mode,
      location: location === "opp-active" ? "active" : "bench",
      index: index
    });
    P2P.syncNow();
  }
}

function handleOpponentRemoteAction(msg) {
  if (!msg) return;
  if (msg.action === "modify_damage") {
    const target = msg.location === "active" ? state.myActive : state.myBench[msg.index];
    if (target) {
      target.damage = msg.damage;
      addLog(`【相手の操作】「${target.card.name}」のダメカンが ${target.damage} に変更されました`, { isRemote: true });
      if (typeof triggerBoardEffect === "function" && msg.delta) {
        triggerBoardEffect({
          fxType: "damage",
          location: msg.location === "active" ? "active" : `bench_${msg.index}`,
          delta: msg.delta
        });
      }
      renderAll();
      if (typeof P2P !== "undefined") P2P.syncNow();
    }
  } else if (msg.action === "set_conditions") {
    if (state.myActive) {
      state.myActive.conditions = msg.conditions;
      addLog(`【相手の操作】バトル場（${state.myActive.card.name}）の特殊状態が変更されました`, { isRemote: true });
      renderAll();
      if (typeof P2P !== "undefined") P2P.syncNow();
    }
  } else if (msg.action === "clear_conditions") {
    if (state.myActive) {
      clearPokemonConditions(state.myActive);
      addLog(`【相手の操作】バトル場（${state.myActive.card.name}）の特殊状態が全回復しました`, { isRemote: true });
      renderAll();
      if (typeof P2P !== "undefined") P2P.syncNow();
    }
  } else if (msg.action === "swap_active_bench") {
    if (typeof swapActiveBench === "function") {
      swapActiveBench(msg.benchIndex);
    }
  } else if (msg.action === "remove_to_trash") {
    const target = msg.location === "active" ? state.myActive : state.myBench[msg.index];
    if (target) {
      const pokeCards = getPokemonCardsList(target);
      pokeCards.forEach(c => state.myTrash.push(c));
      if (target.tool) state.myTrash.push(target.tool);
      if (target.energies) target.energies.forEach(e => state.myTrash.push(e));
      if (msg.location === "active") state.myActive = null;
      else state.myBench[msg.index] = null;
      addLog(`【相手の操作】「${target.card.name}」がトラッシュされました`, { isRemote: true });
      renderAll();
      if (typeof P2P !== "undefined") P2P.syncNow();
    }
  } else if (msg.action === "remove_to_hand") {
    const target = msg.location === "active" ? state.myActive : state.myBench[msg.index];
    if (target) {
      const pokeCards = getPokemonCardsList(target);
      pokeCards.forEach(c => state.myHand.push(c));
      if (target.tool) state.myTrash.push(target.tool);
      if (target.energies) target.energies.forEach(e => state.myTrash.push(e));
      if (msg.location === "active") state.myActive = null;
      else state.myBench[msg.index] = null;
      addLog(`【相手の操作】「${target.card.name}」が手札に戻されました`, { isRemote: true });
      renderAll();
      if (typeof P2P !== "undefined") P2P.syncNow();
    }
  } else if (msg.action === "remove_to_deck") {
    const target = msg.location === "active" ? state.myActive : state.myBench[msg.index];
    if (target) {
      const cardsToDeck = getPokemonCardsList(target);
      if (target.tool) cardsToDeck.push(target.tool);
      if (target.energies) target.energies.forEach(e => cardsToDeck.push(e));
      if (msg.location === "active") state.myActive = null;
      else state.myBench[msg.index] = null;

      if (msg.mode === "bottom") {
        cardsToDeck.forEach(c => state.myDeck.push(c));
        addLog(`【相手の操作】「${target.card.name}」が山札の下に戻されました`, { isRemote: true });
      } else {
        cardsToDeck.forEach(c => state.myDeck.push(c));
        state.myDeck = shuffleArray(state.myDeck);
        addLog(`【相手の操作】「${target.card.name}」が山札に戻されシャッフルされました`, { isRemote: true });
      }
      renderAll();
      if (typeof P2P !== "undefined") P2P.syncNow();
    }
  } else if (msg.action === "knockout_by_opponent") {
    if (typeof SoundEffects !== "undefined") SoundEffects.playKnockout();
    const target = msg.location === "active" ? state.myActive : state.myBench[msg.index];
    if (target) {
      const pokeCards = getPokemonCardsList(target);
      pokeCards.forEach(c => state.myTrash.push(c));
      if (target.tool) state.myTrash.push(target.tool);
      if (target.energies) target.energies.forEach(e => state.myTrash.push(e));
      if (msg.location === "active") state.myActive = null;
      else state.myBench[msg.index] = null;
      addLog(`【気絶】「${target.card.name}」が気絶しました！（相手がサイドを取得中）`, {
        cards: pokeCards,
        badge: "💀 ポケモン気絶"
      });
      showToast(`💀 「${target.card.name}」が気絶しました`);
    }
    renderAll();
    showPrizeWaitOverlay(state.oppName || "相手プレイヤー");
  } else if (msg.action === "knockout_self_grant_prize") {
    if (typeof SoundEffects !== "undefined") SoundEffects.playKnockout();
    const target = msg.location === "active" ? state.oppActive : state.oppBench[msg.index];
    if (target) {
      const pokeCards = getPokemonCardsList(target);
      pokeCards.forEach(c => state.oppTrash.push(c));
      if (target.tool) state.oppTrash.push(target.tool);
      if (target.energies) target.energies.forEach(e => state.oppTrash.push(e));
      if (msg.location === "active") state.oppActive = null;
      else state.oppBench[msg.index] = null;
      addLog(`【気絶】相手が「${target.card.name}」を気絶させました！（サイドを取得してください）`, {
        cards: pokeCards,
        badge: "💀 ポケモン気絶"
      });
      showToast(`💀 相手の「${target.card.name}」が気絶しました`);
    }
    renderAll();
    openPrizePickModal({ forOpponent: false, victimName: msg.victimName });
  } else if (msg.action === "prize_taken_sync") {
    state.oppPrizes = msg.remainPrizes;
    renderAll();
    if (typeof triggerBoardEffect === "function") {
      triggerBoardEffect({ fxType: "prize", destination: "hand" });
    }
  } else if (msg.action === "finish_prize_pick") {
    hidePrizeWaitOverlay();
    if (!state.myActive && state.myBench.some(b => b !== null)) {
      if (typeof showPromoteActiveModal === "function") {
        showPromoteActiveModal();
      }
    }
  }
}

window.declareVictory = declareVictory;
window.playGrandVictoryEffect = playGrandVictoryEffect;
window.closeVictoryOverlay = closeVictoryOverlay;
window.toggleBenchCapacity = toggleBenchCapacity;
window.showBenchShrinkTrashModal = showBenchShrinkTrashModal;
window.showOpponentPokemonMenu = showOpponentPokemonMenu;
window.openOpponentPokemonZoom = openOpponentPokemonZoom;
window.modifyOpponentDamage = modifyOpponentDamage;
window.toggleOpponentCondition = toggleOpponentCondition;
window.clearOpponentConditions = clearOpponentConditions;
window.swapOpponentBenchToActive = swapOpponentBenchToActive;
window.showOpponentActiveSwapMenu = showOpponentActiveSwapMenu;
window.removeOpponentPokemonToTrash = removeOpponentPokemonToTrash;
window.removeOpponentPokemonToHand = removeOpponentPokemonToHand;
window.handleOpponentRemoteAction = handleOpponentRemoteAction;
window.toggleSelectTempCard = toggleSelectTempCard;
window.clearTempSelection = clearTempSelection;
window.showSoloOpponentHandMenu = showSoloOpponentHandMenu;
window.soloOpponentHandToDeck = soloOpponentHandToDeck;
window.soloOpponentHandToBottom = soloOpponentHandToBottom;
window.soloOpponentHandTrash = soloOpponentHandTrash;
window.soloOpponentDrawCards = soloOpponentDrawCards;
window.promptSoloOpponentDraw = promptSoloOpponentDraw;
window.startSoloTemporarySwap = startSoloTemporarySwap;
window.revertSoloTemporarySwap = revertSoloTemporarySwap;
window.knockoutPokemon = knockoutPokemon;
window.knockoutOpponentPokemon = knockoutOpponentPokemon;
window.returnPokemonToDeck = returnPokemonToDeck;
window.returnOpponentPokemonToDeck = returnOpponentPokemonToDeck;
window.openPrizePickModal = openPrizePickModal;
window.pickPrizeCard = pickPrizeCard;
window.finishPrizePicking = finishPrizePicking;
window.showPrizeWaitOverlay = showPrizeWaitOverlay;
window.hidePrizeWaitOverlay = hidePrizeWaitOverlay;

// =============================================================================
// ⚔️ 技宣言機能 (Attack Declaration)
// =============================================================================

function openAttackModal() {
  const isOppActiveTurn = (state.isSoloMode && state.turn === "opp");
  const targetSpot = isOppActiveTurn ? state.oppActive : state.myActive;
  const pokemonName = (targetSpot && targetSpot.card) ? targetSpot.card.name : "バトル場のポケモン";
  const actorName = isOppActiveTurn ? (state.oppName || "プレイヤーB") : state.myName;
  const lastAttack = state.lastDeclaredAttackName || "";

  const bodyHtml = `
    <div style="text-align:center; padding:6px 0;">
      <div style="font-size:13px; color:#64748b; margin-bottom:4px;">宣言するポケモン:</div>
      <div style="font-size:18px; font-weight:bold; color:#1e293b; margin-bottom:12px; display:flex; align-items:center; justify-content:center; gap:8px;">
        <span style="font-size:20px;">⚔️</span>
        <span>【${escapeHtml(pokemonName)}】</span>
      </div>

      <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:8px 12px; margin-bottom:14px; font-size:12px; color:#b91c1c; font-weight:bold; line-height:1.5;">
        ※ 技名の入力は任意です（空欄のままでも技を宣言できます）。<br>
        <span style="font-size:11px; font-weight:normal; color:#475569;">※ 技宣言を行ってもターンは自動終了しません（ダメカン等は手動で操作してください）。</span>
      </div>

      <div style="text-align:left; margin-bottom:6px;">
        <label for="in-attack-name" style="font-size:12px; font-weight:bold; color:#334155;">技名（省略可）:</label>
      </div>
      <input type="text" id="in-attack-name" maxlength="30" placeholder="例: バーニングダーク" value="${escapeHtml(lastAttack)}"
        style="width:100%; font-size:15px; font-weight:bold; padding:10px 14px; border:2px solid #f87171; border-radius:8px; box-sizing:border-box; outline:none; background:#fff;"
        onkeydown="if(event.key==='Enter'){ event.preventDefault(); submitAttackDeclaration('${escapeHtml(pokemonName)}', '${escapeHtml(actorName)}'); }"
      >
      <div style="font-size:11px; color:#94a3b8; text-align:left; margin-top:4px;">
        前回入力した技名が残っています。同じ技ならそのままOKを押してください。
      </div>
    </div>
  `;

  const footHtml = `
    <button class="btn red big" style="font-size:14px; padding:10px 22px; font-weight:bold;" onclick="submitAttackDeclaration('${escapeHtml(pokemonName)}', '${escapeHtml(actorName)}')">⚔️ 技を使う（決定）</button>
    <button class="btn" style="font-size:13px; padding:10px 16px;" onclick="closeModal()">キャンセル</button>
  `;

  showModal("⚔️ ワザの宣言", bodyHtml, footHtml);

  // フォーカスを当ててテキストを選択状態に（そのままEnterでも、キー入力ですぐ上書きも可能）
  setTimeout(() => {
    const input = document.getElementById("in-attack-name");
    if (input) {
      input.focus();
      input.select();
    }
  }, 100);
}

function submitAttackDeclaration(pokemonName, actorName) {
  const input = document.getElementById("in-attack-name");
  const rawAttack = input ? input.value.trim() : "";
  state.lastDeclaredAttackName = rawAttack; // 次回のために記憶

  closeModal();

  // 宣言の実行
  executeAttackDeclaration(actorName, pokemonName, rawAttack);
}

function executeAttackDeclaration(playerName, pokemonName, attackName) {
  const isAttackSpecified = !!(attackName && attackName.length > 0);
  const logText = isAttackSpecified
    ? `⚔️ ${playerName} の【${pokemonName}】が『${attackName}』を宣言！`
    : `⚔️ ${playerName} の【${pokemonName}】が技を宣言！`;

  // 技宣言ログ（カットイン演出が別途表示されるため、二重の行動ポップアップはスキップ）
  addLog(logText, { category: "attack", suppressSync: true, skipLocalPopup: true });

  // カットイン演出を画面に表示
  showAttackCutin(playerName, pokemonName, attackName);

  // P2P通信で相手画面にも技宣言を同期
  if (typeof P2P !== "undefined" && P2P.connected && !state.isSoloMode) {
    P2P.send({
      t: "declare_attack",
      playerName: playerName,
      pokemonName: pokemonName,
      attackName: attackName
    });
  }
}

/** 画面中央に大迫力カットインバナーを表示（3.5秒で自動消滅） */
function showAttackCutin(playerName, pokemonName, attackName) {
  let cutin = document.getElementById("attack-cutin-overlay");
  if (!cutin) {
    cutin = document.createElement("div");
    cutin.id = "attack-cutin-overlay";
    cutin.className = "attack-cutin-overlay hidden";
    document.body.appendChild(cutin);
  }

  const isSpecified = !!(attackName && attackName.length > 0);

  cutin.innerHTML = `
    <div class="attack-cutin-box ${isSpecified ? '' : 'no-name'}">
      <div class="attack-cutin-flame">🔥 ⚔️ ⚡</div>
      <div class="attack-cutin-user">${escapeHtml(playerName)} の【${escapeHtml(pokemonName)}】</div>
      <div class="attack-cutin-title">
        ${isSpecified ? `ワザ宣言！` : `ワザを使った！`}
      </div>
      ${isSpecified ? `
        <div class="attack-cutin-name">『${escapeHtml(attackName)}』</div>
        <div style="font-size:11px; color:#fde047; margin-top:5px; font-weight:bold; letter-spacing:0.5px; opacity:0.95; text-shadow:0 0 8px rgba(250,204,21,0.6);">
          🎙️ Google Cloud AI Voice 読み上げ中
        </div>
      ` : ''}
      <div class="attack-cutin-tip">（タップでスキップ）</div>
    </div>
  `;

  cutin.classList.remove("hidden");
  cutin.classList.add("show");

  // 技名自動読み上げボイス（音声合成）
  if (isSpecified && window.SoundEffects) {
    SoundEffects.speakAttackName(attackName);
  }

  // 効果音・バイブレーション
  if (navigator.vibrate) {
    try { navigator.vibrate([60, 40, 60]); } catch (e) {}
  }

  const hideCutin = () => {
    cutin.classList.remove("show");
    cutin.classList.add("hidden");
    cutin.onclick = null;
  };

  cutin.onclick = hideCutin;

  if (window._attackCutinTimer) clearTimeout(window._attackCutinTimer);
  window._attackCutinTimer = setTimeout(hideCutin, 3500);
}

// =============================================================================
// 💬 思いっきりかわいい対戦チャット機能 (Cute Pokeca Chat)
// =============================================================================

function openChatModal() {
  state.chatUnreadCount = 0;
  updateChatUnreadBadge();

  let modal = document.getElementById("cute-chat-modal");
  if (!modal) {
    createCuteChatModalElement();
    modal = document.getElementById("cute-chat-modal");
  }

  modal.classList.remove("hidden");
  renderChatMessages();

  if (window.VoiceChat) {
    VoiceChat.updateChatVoiceButton();
  }

  setTimeout(() => {
    const input = document.getElementById("cute-chat-input");
    if (input) input.focus();
  }, 150);
}

function closeChatModal() {
  const modal = document.getElementById("cute-chat-modal");
  if (modal) modal.classList.add("hidden");
}

function createCuteChatModalElement() {
  const modal = document.createElement("div");
  modal.id = "cute-chat-modal";
  modal.className = "cute-chat-modal hidden";

  modal.innerHTML = `
    <div class="cute-chat-backdrop" onclick="closeChatModal()"></div>
    <div class="cute-chat-container">
      <!-- ヘッダー -->
      <div class="cute-chat-header">
        <div class="cute-chat-title">
          <span class="cute-chat-icon">💬</span>
          <span>ポケチャット♪</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <button class="cute-chat-voice-btn" id="cute-chat-voice-btn" onclick="VoiceChat.startCall()" title="ボイス通話を開始">
            <span>🎙️ 通話</span>
          </button>
          <button class="cute-chat-close-btn" onclick="closeChatModal()" title="閉じる">✕</button>
        </div>
      </div>

      <!-- かわいい定型文クイックチップ -->
      <div class="cute-chat-chips">
        <button class="cute-chip" onclick="sendQuickChatMessage('🌟 よろしくお願いします！')">🌟 よろしく！</button>
        <button class="cute-chip" onclick="sendQuickChatMessage('⚔️ ワザを使います！')">⚔️ ワザ使います！</button>
        <button class="cute-chip" onclick="sendQuickChatMessage('⏳ ターン終了です')">⏳ ターン終了</button>
        <button class="cute-chip" onclick="sendQuickChatMessage('💭 少し考え中...お待ちください')">💭 考え中...</button>
        <button class="cute-chip" onclick="sendQuickChatMessage('✨ ナイスプレイ！')">✨ ナイス！</button>
        <button class="cute-chip" onclick="sendQuickChatMessage('💖 ありがとうございました！')">💖 ありがとう！</button>
      </div>

      <!-- メッセージタイムライン -->
      <div class="cute-chat-messages" id="cute-chat-messages">
        <!-- JSで動的生成 -->
      </div>

      <!-- 入力バー -->
      <div class="cute-chat-input-bar">
        <input type="text" id="cute-chat-input" maxlength="80" placeholder="メッセージを入力... (Enterで送信)" autocomplete="off"
          onkeydown="if(event.key==='Enter'){ event.preventDefault(); sendChatMessageFromInput(); }">
        <button class="cute-chat-send-btn" onclick="sendChatMessageFromInput()" title="送信">
          <span>送信</span>
          <span style="font-size:14px;">💌</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

function sendChatMessageFromInput() {
  const input = document.getElementById("cute-chat-input");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  sendChatMessage(text);
  input.value = "";
}

function sendQuickChatMessage(text) {
  sendChatMessage(text);
}

function sendChatMessage(text) {
  if (!text) return;

  const now = new Date();
  const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
  const msgObj = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    sender: state.myName || "プレイヤーA",
    text: text,
    time: timeStr,
    isMe: true
  };

  state.chatMessages.push(msgObj);
  renderChatMessages();

  // 対戦ログにも記録（チャットはカードプレイではないため、画面ポップアップ・相手への行動通知は行わない）
  addLog(`💬 [チャット] ${state.myName}: ${text}`, { category: "chat", suppressSync: true, skipLocalPopup: true });

  // P2P送信
  if (typeof P2P !== "undefined" && P2P.connected && !state.isSoloMode) {
    P2P.send({
      t: "chat_message",
      id: msgObj.id,
      sender: msgObj.sender,
      text: msgObj.text,
      time: msgObj.time
    });
  }
}

function handleIncomingChatMessage(msg) {
  const msgObj = {
    id: msg.id,
    sender: msg.sender || "対戦相手",
    text: msg.text || "",
    time: msg.time || "",
    isMe: false
  };

  state.chatMessages.push(msgObj);

  const modal = document.getElementById("cute-chat-modal");
  const isModalOpen = modal && !modal.classList.contains("hidden");

  if (isModalOpen) {
    renderChatMessages();
  } else {
    // 未読件数増加
    state.chatUnreadCount = (state.chatUnreadCount || 0) + 1;
    updateChatUnreadBadge();

    // かわいいフキダシ風トースト通知を画面上端に表示
    showChatBubbleToast(msgObj.sender, msgObj.text);
  }

  // ログにも追加（プレイ行動ポップアップはスキップ）
  addLog(`💬 [チャット] ${msgObj.sender}: ${msgObj.text}`, { category: "chat", isRemote: true, suppressSync: true, skipLocalPopup: true });

  // 軽い通知バイブ
  if (navigator.vibrate) {
    try { navigator.vibrate(30); } catch (e) {}
  }
}

function renderChatMessages() {
  const container = document.getElementById("cute-chat-messages");
  if (!container) return;

  if (state.chatMessages.length === 0) {
    container.innerHTML = `
      <div class="cute-chat-empty">
        <div style="font-size:32px; margin-bottom:6px;">🐣 💭</div>
        <div>まだメッセージはありません</div>
        <div style="font-size:11px; opacity:0.8; margin-top:2px;">上の定型文ボタンから気軽に挨拶してみよう！</div>
      </div>
    `;
    return;
  }

  container.innerHTML = state.chatMessages.map(m => {
    const isMe = m.isMe;
    return `
      <div class="cute-msg-row ${isMe ? 'me' : 'opp'}">
        <div class="cute-msg-avatar">${isMe ? '⚡' : '🎀'}</div>
        <div class="cute-msg-content">
          <div class="cute-msg-name">${escapeHtml(m.sender)} <span class="cute-msg-time">${m.time}</span></div>
          <div class="cute-msg-bubble">${escapeHtml(m.text)}</div>
        </div>
      </div>
    `;
  }).join("");

  // 最下部へスクロール
  container.scrollTop = container.scrollHeight;
}

function updateChatUnreadBadge() {
  const count = state.chatUnreadCount || 0;
  const badges = [
    document.getElementById("chat-badge"),
    document.getElementById("chat-badge-log"),
    document.getElementById("sp-chat-badge"),
    document.getElementById("float-chat-badge")
  ];

  badges.forEach(badge => {
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 9 ? "9+" : count;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  });
}

/** 画面上端にふわっと現れるかわいいフキダシ通知（3.5秒で自動消滅） */
function showChatBubbleToast(sender, text) {
  let toast = document.getElementById("cute-chat-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "cute-chat-toast";
    toast.className = "cute-chat-toast hidden";
    toast.onclick = () => {
      openChatModal();
      hideChatBubbleToast();
    };
    document.body.appendChild(toast);
  }

  toast.innerHTML = `
    <div class="cute-toast-icon">💌</div>
    <div class="cute-toast-body">
      <div class="cute-toast-sender">${escapeHtml(sender)}:</div>
      <div class="cute-toast-text">${escapeHtml(text)}</div>
    </div>
    <div class="cute-toast-arrow">▶</div>
  `;

  toast.classList.remove("hidden");
  toast.classList.add("show");

  const hide = () => {
    toast.classList.remove("show");
    toast.classList.add("hidden");
  };

  if (window._chatToastTimer) clearTimeout(window._chatToastTimer);
  window._chatToastTimer = setTimeout(hide, 3800);
}

function hideChatBubbleToast() {
  const toast = document.getElementById("cute-chat-toast");
  if (toast) {
    toast.classList.remove("show");
    toast.classList.add("hidden");
  }
}

window.getPokemonCardsList = getPokemonCardsList;
window.openAttackModal = openAttackModal;
window.submitAttackDeclaration = submitAttackDeclaration;
window.executeAttackDeclaration = executeAttackDeclaration;
window.showAttackCutin = showAttackCutin;

window.openChatModal = openChatModal;
window.closeChatModal = closeChatModal;
window.sendChatMessage = sendChatMessage;
window.sendChatMessageFromInput = sendChatMessageFromInput;
window.sendQuickChatMessage = sendQuickChatMessage;
window.handleIncomingChatMessage = handleIncomingChatMessage;
window.updateChatUnreadBadge = updateChatUnreadBadge;
window.showChatBubbleToast = showChatBubbleToast;

