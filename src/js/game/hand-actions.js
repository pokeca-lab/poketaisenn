/* 【ゲーム】手札・場のカード操作ヘルパー */

// =============================================================================
// 手札・場のカード操作ヘルパー
// =============================================================================
function toggleSelectHandCard(idx) {
  if (state.selectedHandIndices.has(idx)) {
    state.selectedHandIndices.delete(idx);
  } else {
    state.selectedHandIndices.add(idx);
  }
  if (state.selectedHandIndices.size === 1) {
    state.selectedHandIndex = Array.from(state.selectedHandIndices)[0];
  } else {
    state.selectedHandIndex = -1;
  }
  renderHand();
  updateSheetUI();
}

function selectHandCard(idx) {
  toggleSelectHandCard(idx);
}

function clearHandSelection() {
  state.selectedHandIndices.clear();
  state.selectedHandIndex = -1;
  renderHand();
  updateSheetUI();
}

function placeSelectedHandToActive() {
  const selectedCards = getSelectedHandCards();
  if (selectedCards.length === 0) {
    if (state.selectedHandIndex >= 0 && state.selectedHandIndex < state.myHand.length) {
      placeHandCardToActive(state.selectedHandIndex);
      return;
    }
    return alert("手札のカードをタップ/クリックして選択してください");
  }

  // 既にバトル場にポケモンがいる場合は、選択されたカードをつける（進化／エネルギー付与／どうぐ）
  if (state.myActive) {
    attachHandCardToPokemon(selectedCards[0].index, "active");
    return;
  }

  // 選択されたカードの中からポケモンカード（対戦準備フェーズ時はたね優先）を探す
  let target = selectedCards.find(c => {
    const isPoke = (c.card.type || "").toLowerCase() === "pokemon" || c.card.category === "たね" || c.card.category === "ポケモン" || !!c.card.hp;
    if (state.isSetupPhase) {
      return isPoke && (c.card.category === "たね" || c.card.category === "Basic" || !c.card.category?.includes("進化"));
    }
    return isPoke;
  });

  // 見つからなければ最初のポケモンを探す
  if (!target) {
    target = selectedCards.find(c => (c.card.type || "").toLowerCase() === "pokemon" || c.card.category === "たね" || c.card.category === "ポケモン" || !!c.card.hp);
  }

  if (!target) {
    showToast("選択された手札の中にバトル場に出せるポケモンがありません");
    return;
  }

  placeHandCardToActive(target.index);
}

function placeHandCardToActive(handIdx) {
  if (handIdx < 0 || handIdx >= state.myHand.length) return;
  if (state.isSetupPhase && state.myMulliganStep) {
    alert("現在「たねポケモンなし（マリガン）」の待機中です。引き直しが完了するまで場に出すことはできません。");
    return;
  }
  const card = state.myHand[handIdx];
  if (!card) return;

  if (state.myActive) {
    attachHandCardToPokemon(handIdx, "active");
    return;
  }

  const isPoke = (card.type || "").toLowerCase() === "pokemon" || card.category === "たね" || card.category === "ポケモン" || !!card.hp;
  if (state.isSetupPhase && !isPoke) {
    alert("対戦準備フェーズではバトル場にポケモンカードのみ出すことができます。");
    return;
  }

  if (typeof pushHistorySnapshot === "function") {
    pushHistorySnapshot("バトル場へ配置");
  }

  state.myHand.splice(handIdx, 1);
  state.selectedHandIndices.clear();
  state.selectedHandIndex = -1;
  state.myActive = createFieldPokemon(card, 0, [], null);
  if (window.SoundEffects) {
    SoundEffects.playPokemonPlace();
  }
  addLog(`「${card.name}」をバトル場に出しました`, {
    oppText: state.isSetupPhase
      ? `バトル場にポケモンを伏せて置きました`
      : `「${card.name}」をバトル場に出しました`,
    cards: state.isSetupPhase ? [] : [card],
    badge: "⚔️ バトル場へ配置"
  });
  showToast(`【バトル場へ】${card.name}`);
  renderAll();
}

function placeHandCardToBenchIndex(handIdx, benchIdx) {
  if (handIdx < 0 || handIdx >= state.myHand.length) return;
  const limit = state.myBenchLimit || 5;
  if (benchIdx < 0 || benchIdx >= limit) return;
  if (state.isSetupPhase && state.myMulliganStep) {
    alert("現在「たねポケモンなし（マリガン）」の待機中です。引き直しが完了するまで場に出すことはできません。");
    return;
  }
  const card = state.myHand[handIdx];
  if (!card) return;

  if (state.myBench[benchIdx]) {
    attachHandCardToPokemon(handIdx, `bench_${benchIdx}`);
    return;
  }

  if (state.isSetupPhase && card.type !== "pokemon") {
    alert("対戦準備フェーズではベンチにポケモンカードのみ出すことができます。");
    return;
  }

  if (typeof pushHistorySnapshot === "function") {
    pushHistorySnapshot("ベンチへ配置");
  }

  state.myHand.splice(handIdx, 1);
  state.selectedHandIndices.clear();
  state.selectedHandIndex = -1;
  state.myBench[benchIdx] = createFieldPokemon(card, 0, [], null);
  if (window.SoundEffects) {
    SoundEffects.playPokemonPlace();
  }
  addLog(`「${card.name}」をベンチに出しました`, {
    oppText: state.isSetupPhase
      ? `ベンチにポケモンを伏せて置きました`
      : `「${card.name}」をベンチに出しました`,
    cards: state.isSetupPhase ? [] : [card],
    badge: "🪑 ベンチへ配置"
  });
  showToast(`【ベンチへ】${card.name}`);
  renderAll();
}

function placeHandCardToFirstEmptyBench(handIdx) {
  const limit = state.myBenchLimit || 5;
  let emptyIdx = -1;
  for (let i = 0; i < limit; i++) {
    if (!state.myBench[i]) {
      emptyIdx = i;
      break;
    }
  }
  if (emptyIdx === -1) {
    return alert(`ベンチに空きがありません（最大${limit}匹）`);
  }
  placeHandCardToBenchIndex(handIdx, emptyIdx);
}

function placeHandCardToStadium(handIdx) {
  if (handIdx < 0 || handIdx >= state.myHand.length) return;
  const card = state.myHand.splice(handIdx, 1)[0];
  state.selectedHandIndices.clear();
  state.selectedHandIndex = -1;

  if (typeof discardAndReplaceStadium === "function") {
    discardAndReplaceStadium(card, "手札");
  } else {
    state.stadium = card;
    state.stadiumTs = Date.now();
    addLog(`手札からスタジアム「${card.name}」を場に出しました`, {
      cards: [card],
      badge: "🏟️ スタジアム配置"
    });
    showToast(`スタジアム: ${card.name}`);
    renderAll();
  }
}

function attachHandCardToPokemon(handIdx, location) {
  if (handIdx < 0 || handIdx >= state.myHand.length) return;
  const dst = getPokemonByLocation(location);
  if (!dst) return;
  const card = state.myHand[handIdx];
  if (!card) return;

  // 1. エネルギーカード → エネルギーとして付与
  if (card.type === "energy") {
    if (typeof pushHistorySnapshot === "function") {
      pushHistorySnapshot("エネルギー付与");
    }
    state.myHand.splice(handIdx, 1);
    state.selectedHandIndices.clear();
    state.selectedHandIndex = -1;
    if (!dst.energies) dst.energies = [];
    dst.energies.push(card);
    if (window.SoundEffects) {
      SoundEffects.playAttach();
    }
    const eInfo = getEnergyInfo(card);
    addLog(`「${dst.card.name}」に「${card.name}」をつけました`, {
      oppText: state.isSetupPhase
        ? `場のポケモンに「${card.name}」をつけました`
        : `「${dst.card.name}」に「${card.name}」をつけました`,
      cards: state.isSetupPhase ? [card] : [card, dst.card],
      badge: "⚡ エネルギー付与"
    });
    showToast(`【エネ付与】${dst.card.name} ← ${card.name}`);
    renderAll();
    if (typeof triggerBoardEffect === "function") {
      triggerBoardEffect({
        fxType: "attach",
        location: location,
        attachType: "energy",
        colorType: eInfo.type,
        icon: eInfo.icon,
        label: card.name
      });
    }
    return;
  }

  // 2. ポケモンカード → 重ねて進化として処理（進化時に特殊状態はすべて自動回復）
  if (card.type === "pokemon") {
    const prevName = dst.card.name;

    // 進化確認ポップアップ
    if (!confirm(`「${prevName}」を「${card.name}」に進化させますか？`)) {
      return;
    }

    if (typeof pushHistorySnapshot === "function") {
      pushHistorySnapshot("ポケモンの進化");
    }

    const curedNames = (typeof getPokemonConditionNames === "function") ? getPokemonConditionNames(dst) : [];
    if (typeof clearPokemonConditions === "function") {
      clearPokemonConditions(dst);
    }
    // 進化前カードを進化スタックへ保存
    dst.previousStages = Array.isArray(dst.previousStages) ? dst.previousStages : [];
    dst.previousStages.push(dst.card);
    dst.card = card;
    dst.abilityUsed = false;
    state.myHand.splice(handIdx, 1);
    state.selectedHandIndices.clear();
    state.selectedHandIndex = -1;
    if (window.SoundEffects) {
      SoundEffects.playPokemonPlace();
    }
    const cureSuffix = curedNames.length > 0 ? `（特殊状態【${curedNames.join("・")}】が回復しました）` : "";
    addLog(`「${prevName}」が「${card.name}」に進化しました！${cureSuffix}`, {
      cards: [card],
      badge: "✨ 進化"
    });
    showToast(`【進化】${card.name}！${curedNames.length > 0 ? ' (状態異常回復)' : ''}`);
    renderAll();
    if (typeof triggerBoardEffect === "function") {
      triggerBoardEffect({
        fxType: "attach",
        location: location,
        attachType: "evolve",
        colorType: "evolve",
        icon: "✨",
        label: `進化！ ${card.name}`
      });
    }
    return;
  }

  // 3. トレーナーズカード → ポケモンのどうぐとして装備
  if (card.type === "trainer") {
    if (dst.tool) {
      if (!confirm(`「${dst.card.name}」には既に「${dst.tool.name}」がついています。付け替えますか？（前のどうぐはトラッシュされます）`)) {
        return;
      }
      if (typeof pushHistorySnapshot === "function") {
        pushHistorySnapshot("どうぐ付け替え");
      }
      const oldTool = dst.tool;
      state.myTrash.push(oldTool);
      if (window.SoundEffects) {
        SoundEffects.playTrash();
      }
      addLog(`前のどうぐ「${oldTool.name}」をトラッシュしました`, {
        cards: [oldTool],
        badge: "🗑️ どうぐ破棄"
      });
    } else {
      if (typeof pushHistorySnapshot === "function") {
        pushHistorySnapshot("どうぐ装備");
      }
    }
    state.myHand.splice(handIdx, 1);
    state.selectedHandIndices.clear();
    state.selectedHandIndex = -1;
    dst.tool = card;
    if (window.SoundEffects) {
      SoundEffects.playAttach();
    }
    addLog(`「${dst.card.name}」に「${card.name}」をつけました`, {
      oppText: state.isSetupPhase
        ? `場のポケモンにどうぐ「${card.name}」をつけました`
        : `「${dst.card.name}」に「${card.name}」をつけました`,
      cards: state.isSetupPhase ? [card] : [card, dst.card],
      badge: "🎒 ポケモンのどうぐ装備"
    });
    showToast(`【どうぐ装備】${dst.card.name} ← ${card.name}`);
    renderAll();
    if (typeof triggerBoardEffect === "function") {
      triggerBoardEffect({
        fxType: "attach",
        location: location,
        attachType: "tool",
        colorType: "tool",
        icon: "🎒",
        label: card.name
      });
    }
    return;
  }
}

function trashHandCardByIndex(handIdx) {
  if (handIdx < 0 || handIdx >= state.myHand.length) return;
  if (typeof pushHistorySnapshot === "function") {
    pushHistorySnapshot("手札からトラッシュ");
  }
  const card = state.myHand.splice(handIdx, 1)[0];
  state.selectedHandIndices.clear();
  state.selectedHandIndex = -1;
  state.myTrash.push(card);
  if (window.SoundEffects) {
    SoundEffects.playTrash();
  }
  addLog(`手札から「${card.name}」をトラッシュしました`, {
    cards: [card],
    badge: "🗑️ 手札からトラッシュ"
  });
  showToast(`トラッシュ: ${card.name}`);
  renderAll();
}

function lostHandCardByIndex(handIdx) {
  if (handIdx < 0 || handIdx >= state.myHand.length) return;
  if (typeof pushHistorySnapshot === "function") {
    pushHistorySnapshot("手札からロストへ");
  }
  const card = state.myHand.splice(handIdx, 1)[0];
  state.selectedHandIndices.clear();
  state.selectedHandIndex = -1;
  state.myLost.push(card);
  addLog(`手札から「${card.name}」をロストゾーンへ送りました`, {
    cards: [card],
    badge: "🌌 ロストゾーン"
  });
  showToast(`ロストへ: ${card.name}`);
  renderAll();
}

function moveHandCardToDeckTop(handIdx) {
  if (handIdx < 0 || handIdx >= state.myHand.length) return;
  if (typeof pushHistorySnapshot === "function") {
    pushHistorySnapshot("手札から山札の上へ");
  }
  const card = state.myHand.splice(handIdx, 1)[0];
  state.selectedHandIndices.clear();
  state.selectedHandIndex = -1;
  state.myDeck.unshift(card);
  addLog(`手札から「${card.name}」を山札の上に戻しました`, {
    oppText: `手札からカードを1枚山札の上に戻しました`,
    badge: "🔄 手札から山札の上へ"
  });
  showToast(`山の上に戻す: ${card.name}`);
  renderAll();
}

function moveHandCardToDeckBottom(handIdx) {
  if (handIdx < 0 || handIdx >= state.myHand.length) return;
  if (typeof pushHistorySnapshot === "function") {
    pushHistorySnapshot("手札から山札の下へ");
  }
  const card = state.myHand.splice(handIdx, 1)[0];
  state.selectedHandIndices.clear();
  state.selectedHandIndex = -1;
  state.myDeck.push(card);
  addLog(`手札から「${card.name}」を山札の下に戻しました`, {
    oppText: `手札からカードを1枚山札の下に戻しました`,
    badge: "⬇️ 手札から山札の下へ"
  });
  showToast(`山の下に戻す: ${card.name}`);
  renderAll();
}

function trashSelectedHandCards() {
  const indices = getSelectedHandIndices();
  if (indices.length === 0) return;
  if (typeof pushHistorySnapshot === "function") {
    pushHistorySnapshot(`選択手札(${indices.length}枚)をトラッシュ`);
  }
  const names = [];
  const trashedCards = [];
  indices.forEach(idx => {
    const c = state.myHand.splice(idx, 1)[0];
    state.myTrash.push(c);
    names.push(c.name);
    trashedCards.push(c);
  });
  state.selectedHandIndices.clear();
  state.selectedHandIndex = -1;
  if (window.SoundEffects) {
    SoundEffects.playTrash();
  }
  addLog(`手札から${names.length}枚（${names.join(", ")}）をトラッシュしました`, {
    cards: trashedCards,
    badge: "🗑️ 手札からトラッシュ"
  });
  showToast(`トラッシュ: ${names.length}枚`);
  renderAll();
}

function lostSelectedHandCards() {
  const indices = getSelectedHandIndices();
  if (indices.length === 0) return;
  if (typeof pushHistorySnapshot === "function") {
    pushHistorySnapshot(`選択手札(${indices.length}枚)をロストへ`);
  }
  const names = [];
  const lostCards = [];
  indices.forEach(idx => {
    const c = state.myHand.splice(idx, 1)[0];
    state.myLost.push(c);
    names.push(c.name);
    lostCards.push(c);
  });
  state.selectedHandIndices.clear();
  state.selectedHandIndex = -1;
  addLog(`手札から${names.length}枚（${names.join(", ")}）をロストゾーンへ送りました`, {
    cards: lostCards,
    badge: "🌌 ロストゾーン"
  });
  showToast(`ロストへ: ${names.length}枚`);
  renderAll();
}

function moveSelectedHandCardsToDeckTop() {
  const indices = getSelectedHandIndices();
  if (indices.length === 0) return;
  if (typeof pushHistorySnapshot === "function") {
    pushHistorySnapshot(`選択手札(${indices.length}枚)を山札の上へ`);
  }
  const cards = [];
  indices.forEach(idx => {
    cards.push(state.myHand.splice(idx, 1)[0]);
  });
  cards.reverse().forEach(c => state.myDeck.unshift(c));
  state.selectedHandIndices.clear();
  state.selectedHandIndex = -1;
  addLog(`手札から${cards.length}枚を山札の上に戻しました`, {
    oppText: `手札から ${cards.length}枚 を山札の上に戻しました`,
    badge: "🔄 手札から山札の上へ"
  });
  showToast(`山の上に戻す: ${cards.length}枚`);
  renderAll();
}

function moveSelectedHandCardsToDeckBottom() {
  const indices = getSelectedHandIndices();
  if (indices.length === 0) return;
  if (typeof pushHistorySnapshot === "function") {
    pushHistorySnapshot(`選択手札(${indices.length}枚)を山札の下へ`);
  }
  const cards = [];
  indices.forEach(idx => {
    cards.push(state.myHand.splice(idx, 1)[0]);
  });
  cards.forEach(c => state.myDeck.push(c));
  state.selectedHandIndices.clear();
  state.selectedHandIndex = -1;
  addLog(`手札から${cards.length}枚を山札の下に戻しました`, {
    oppText: `手札から ${cards.length}枚 を山札の下に戻しました`,
    badge: "⬇️ 手札から山札の下へ"
  });
  showToast(`山の下に戻す: ${cards.length}枚`);
  renderAll();
}

function moveEnergyBetweenPokemon(srcLoc, energyIdx, dstLoc) {
  const src = getPokemonByLocation(srcLoc);
  const dst = getPokemonByLocation(dstLoc);
  if (!src || !dst || src === dst) return;
  if (!src.energies || energyIdx < 0 || energyIdx >= src.energies.length) return;
  if (typeof pushHistorySnapshot === "function") {
    pushHistorySnapshot("エネルギー付け替え");
  }
  const energy = src.energies.splice(energyIdx, 1)[0];
  if (energy) {
    if (!dst.energies) dst.energies = [];
    dst.energies.push(energy);
    const eInfo = getEnergyInfo(energy);
    addLog(`エネルギー「${energy.name}」を「${src.card.name}」から「${dst.card.name}」へ付け替えました`, {
      cards: [energy],
      badge: "⚡ エネルギー移動"
    });
    showToast(`【エネ移動】${dst.card.name} ← ${energy.name}`);
    renderAll();
    if (typeof triggerBoardEffect === "function") {
      triggerBoardEffect({
        fxType: "attach",
        location: dstLoc,
        attachType: "energy",
        colorType: eInfo.type,
        icon: eInfo.icon,
        label: energy.name
      });
    }
  }
}

function detachEnergyToTrash(loc, energyIdx) {
  const pk = getPokemonByLocation(loc);
  if (!pk || !pk.energies || energyIdx < 0 || energyIdx >= pk.energies.length) return;
  if (typeof pushHistorySnapshot === "function") {
    pushHistorySnapshot("エネルギートラッシュ");
  }
  const energy = pk.energies.splice(energyIdx, 1)[0];
  if (energy) {
    state.myTrash.push(energy);
    if (window.SoundEffects) {
      SoundEffects.playTrash();
    }
    addLog(`「${pk.card.name}」からエネルギー「${energy.name}」をトラッシュしました`, {
      cards: [energy],
      badge: "🗑️ エネルギートラッシュ"
    });
    showToast(`エネトラッシュ: ${energy.name}`);
    renderAll();
  }
}

function getDroppedHandIndex(e) {
  let handIdx = state.draggedHandIndex;
  if (e && e.dataTransfer) {
    const raw = e.dataTransfer.getData("text/plain");
    if (raw !== "" && !raw.startsWith("energy:") && raw !== "playCard" && !isNaN(parseInt(raw, 10))) {
      handIdx = parseInt(raw, 10);
    }
  }
  if (handIdx >= 0 && handIdx < state.myHand.length) {
    return handIdx;
  }
  return null;
}

function handleDropToTrash(e) {
  if (state.draggedEnergy) {
    detachEnergyToTrash(state.draggedEnergy.location, state.draggedEnergy.energyIndex);
    state.draggedEnergy = null;
    return;
  }
  if (e && e.dataTransfer && e.dataTransfer.getData("text/plain") === "playCard") {
    movePlayCardToTrash();
    return;
  }
  const handIdx = getDroppedHandIndex(e);
  if (handIdx !== null) {
    trashHandCardByIndex(handIdx);
  }
}

function handleDropToLost(e) {
  if (e && e.dataTransfer && e.dataTransfer.getData("text/plain") === "playCard") {
    movePlayCardToLost();
    return;
  }
  const handIdx = getDroppedHandIndex(e);
  if (handIdx !== null) {
    lostHandCardByIndex(handIdx);
  }
}
window.placeHandCardToActive = placeHandCardToActive;
window.placeSelectedHandToActive = placeSelectedHandToActive;
