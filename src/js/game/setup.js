/* 【ゲーム】対戦・一人回しセットアップ ＆ 対戦準備フェーズ */

function hasBasicPokemon(cards) {
  if (!Array.isArray(cards)) return false;
  return cards.some(c => c && (c.category === "たね" || c.category === "Basic" || (c.type === "pokemon" && !c.category?.includes("進化") && !c.name?.includes("VSTAR") && !c.name?.includes("VMAX"))));
}

function startBattleSetup() {
  document.getElementById("lobby").classList.add("hidden");
  document.getElementById("game").classList.remove("hidden");
  if (typeof SoundEffects !== "undefined") SoundEffects.updateVolumeUI();

  // デッキ初期化（ユーザーが読み込んだデッキを使用）
  const sourceDeck = state.myLoadedDeck || SAMPLE_DECK;
  state.myDeck = shuffleArray([...sourceDeck].map((c, i) => ({ ...c, uid: "c_" + i })));
  state.myHand = [];
  state.myPrizes = [];
  state.myTrash = [];
  state.myLost = [];
  state.tempCards = [];
  state.playCard = null;
  state.selectedHandIndices.clear();
  state.turn = 1;
  state.turnStep = 1;
  state.logs = [];

  // 対戦準備フェーズを有効化
  state.isSetupPhase = true;
  state.setupStep = "coin";
  state.coinResult = null;
  state.coinChooser = null;
  state.firstPlayer = null;
  state.mySetupReady = false;
  state.oppSetupReady = false;
  state.mulliganCount = 0;
  state.oppMulliganCount = 0;
  state.myMulliganStep = null;
  state.oppMulliganDeclared = false;
  state.pendingOppMulliganQueue = [];

  // 初期セットアップ: 手札7枚ドロー（サイド6枚は「対戦準備完了」を押した時にセット）
  for (let i = 0; i < 7; i++) {
    state.myHand.push(state.myDeck.shift());
  }

  // ★ バトル場は空にしてユーザーが手動でたねポケモンを出す
  state.myActive = null;
  state.myBench = [null, null, null, null, null, null, null, null];

  // ★ 通信対戦開始時はダミーBOTデータ（フシギバナex）を完全に破棄
  if (typeof resetOpponentCards === "function") {
    resetOpponentCards();
  }

  state.isSoloMode = false;
  addLog(`対戦準備フェーズを開始しました（手札7枚ドロー・準備完了時にサイド6枚がセットされます）`, { suppressSync: true });
  showToast("対戦準備フェーズ: たねポケモンをバトル場に出してください（ない場合はマリガン宣言）");

  // ホストの場合、コイントスによる先攻後攻決定を開始
  if (P2P.connected) {
    if (P2P.role === "host") {
      setTimeout(() => startSetupCoinToss(), 400);
    }
  } else {
    // ローカル単体プレイ時はランダムまたは選択
    state.setupStep = "place";
  }

  renderAll();
}

// 一人回しモードのセットアップ（2デッキ同時展開）
function startSoloBattleSetup() {
  state.isSoloMode = true;
  state.myName = "デッキ1 (プレイヤーA)";
  state.oppName = "デッキ2 (プレイヤーB)";
  state.roomNo = "SOLO-PRACTICE";

  document.getElementById("lobby").classList.add("hidden");
  document.getElementById("game").classList.remove("hidden");
  if (typeof SoundEffects !== "undefined") SoundEffects.updateVolumeUI();

  // デッキA（先攻）シャッフル＆初期化
  const deckSourceA = state.soloDeckA || SAMPLE_DECK;
  state.myDeck = shuffleArray([...deckSourceA].map((c, i) => ({ ...c, uid: "a_" + i })));
  state.myHand = [];
  state.myPrizes = [];
  state.myTrash = [];
  state.myLost = [];

  // デッキB（後攻）シャッフル＆初期化
  const deckSourceB = state.soloDeckB || SAMPLE_DECK_B;
  state.oppDeck = shuffleArray([...deckSourceB].map((c, i) => ({ ...c, uid: "b_" + i })));
  state.oppHand = [];
  state.oppPrizesList = [];
  state.oppTrash = [];
  state.oppLost = [];

  state.tempCards = [];
  state.playCard = null;
  state.stadium = null;
  state.selectedHandIndices.clear();
  state.turn = 1;
  state.turnStep = 1;
  state.logs = [];

  // 対戦準備フェーズ
  state.isSetupPhase = true;
  state.setupStep = "place";
  state.firstPlayer = "me";
  state.mySetupReady = false;
  state.oppSetupReady = false;
  state.mulliganCount = 0;
  state.oppMulliganCount = 0;
  state.myMulliganStep = null;
  state.oppMulliganDeclared = false;
  state.pendingOppMulliganQueue = [];

  // デッキA: 手札7枚ドロー（サイド6枚は準備完了ボタンを押した時にセット）
  for (let i = 0; i < 7; i++) state.myHand.push(state.myDeck.shift());

  // デッキB: 手札7枚ドロー（サイド6枚は準備完了ボタンを押した時にセット）
  for (let i = 0; i < 7; i++) state.oppHand.push(state.oppDeck.shift());
  state.oppDeckCount = state.oppDeck.length;
  state.oppHandCount = state.oppHand.length;
  state.oppPrizes = 0; // サイドは各デッキの準備完了時にセット

  state.myActive = null;
  state.myBench = [null, null, null, null, null, null, null, null];
  state.oppActive = null;
  state.oppBench = [null, null, null, null, null, null, null, null];

  addLog(`【一人回し対戦準備】まず【デッキ1】の手札からたねポケモンをバトル場に出してください（準備完了時にサイド6枚がセットされます）`, { suppressSync: true });
  showToast("一人回し対戦準備: まず【デッキ1】のたねポケモンをバトル場に出してください");

  renderAll();
}

/** 一人回し準備フェーズ: 操作するデッキ側（デッキ1 ⇔ デッキ2）を手動切り替え */
function toggleSoloSetupSide() {
  if (!state.isSoloMode || !state.isSetupPhase) return;
  swapSoloTurn();
  showToast(`操作側を切り替えました: 現在【${state.myName}】を準備中`);
  renderAll();
}

/** 7枚引き直し（マリガン）宣言・実行 */
function executeMulligan() {
  if (!state.isSetupPhase) return;
  if (state.myActive || state.mySetupReady || state.myBench.some(b => b !== null)) {
    alert("バトル場やベンチにポケモンを配置した後や、準備完了後は引き直し（マリガン）できません。");
    return;
  }
  // すでに相手の確認待ちの場合は手札の再公開（再送）を行う
  if (state.myMulliganStep === "waiting_opp_ack") {
    sendMulliganRevealToOpponent(true);
    return;
  }
  if (state.myMulliganStep) {
    return;
  }

  // 通信対戦中: 公式ルール手順（1.宣言 → 2.相手準備完了 → 3.手札公開＆相手確認OK → 4.引き直し）
  if (typeof P2P !== "undefined" && P2P.connected) {
    // すでに相手が準備完了している場合、または相手も「たねなし宣言」をしている場合は直ちに手札を公開
    if (state.oppSetupReady || state.oppMulliganDeclared) {
      sendMulliganRevealToOpponent(false);
    } else {
      // 手順1: まず「たねポケモンなし」だけを宣言し、相手がバトル場・サイドを置いて準備完了するのを待つ
      state.myMulliganStep = "waiting_opp_ready";
      P2P.send({ t: "mulligan_declare", name: state.myName });
      addLog(`「たねポケモンなし（マリガン）」を宣言しました（相手の対戦準備が完了した後に手札7枚を公開します）`, { suppressSync: true });
      showToast("たねなし宣言完了：相手の対戦準備完了を待っています");
      renderAll();
    }
    return;
  }

  // オフライン・一人回し時は即座に60枚でシャッフル＆7枚引き直し
  state.mulliganCount++;
  performMulliganRedraw();
}

/** 手順3: 相手の準備完了後（または双方たねなし宣言時）に自分の手札7枚を相手へ公開送信 */
function sendMulliganRevealToOpponent(isResend = false) {
  if (!state.isSetupPhase) return;
  if (!isResend) {
    state.mulliganCount++;
  }
  state.myMulliganStep = "waiting_opp_ack";

  if (typeof P2P !== "undefined" && P2P.connected) {
    P2P.send({
      t: "mulligan_reveal",
      count: state.mulliganCount,
      name: state.myName,
      hand: state.myHand
    });
  }

  const logText = isResend
    ? `相手（${state.oppName}）にマリガン確認手札を再送信しました（相手の確認待ち...）`
    : `相手（${state.oppName}）にマリガン確認のため手札7枚を公開しました（マリガン ${state.mulliganCount}回目・相手の確認待ち...）`;
  addLog(logText, { suppressSync: true });
  showToast(isResend ? `手札7枚を相手に再送信しました！` : `手札7枚を相手に公開中... 相手の「確認OK」を待っています`);
  renderAll();
}

/** 手順4: 相手の確認OK後（またはオフライン時）に手札をすべて山札（60枚）に戻してシャッフル＆7枚引き直す */
function performMulliganRedraw() {
  if (!state.isSetupPhase) return;

  // 万一サイドが置かれていた場合も山札に戻して60枚全体で引き直す
  if (state.myPrizes.length > 0) {
    state.myDeck.push(...state.myPrizes);
    state.myPrizes = [];
  }

  // 手札を山札に戻してシャッフル
  state.myDeck.push(...state.myHand);
  state.myHand = [];
  state.myDeck = shuffleArray(state.myDeck);

  // 新たに7枚引く
  for (let i = 0; i < 7; i++) {
    if (state.myDeck.length > 0) {
      state.myHand.push(state.myDeck.shift());
    }
  }

  state.myMulliganStep = null;
  addLog(`手札をすべて山札に戻してシャッフルし、7枚引き直しました（マリガン ${state.mulliganCount}回目）`, {
    badge: "🔄 マリガン引き直し"
  });
  showToast(`手札を7枚引き直しました！（マリガン ${state.mulliganCount}回目）`);

  if (typeof P2P !== "undefined" && P2P.connected) {
    P2P.syncNow();
  }

  renderAll();
}

/** 相手から公開されたマリガン手札をキューに追加し、確認モーダルを表示 */
function enqueueOpponentMulliganReveal(item) {
  if (!Array.isArray(state.pendingOppMulliganQueue)) {
    state.pendingOppMulliganQueue = [];
  }
  state.pendingOppMulliganQueue.push(item);
  showNextOpponentMulliganModal();
}

function showNextOpponentMulliganModal() {
  if (!Array.isArray(state.pendingOppMulliganQueue) || state.pendingOppMulliganQueue.length === 0) {
    return;
  }
  const item = state.pendingOppMulliganQueue[0];
  const oppName = escapeHtml(item.name || state.oppName);
  const count = item.count || 1;
  const hand = Array.isArray(item.hand) ? item.hand : [];

  const hasBasic = (typeof isBasicPokemonCard === "function")
    ? hand.some(c => isBasicPokemonCard(c))
    : (typeof hasBasicPokemon === "function" ? hasBasicPokemon(hand) : false);

  const basicCardNames = hand.filter(c => (typeof isBasicPokemonCard === "function" ? isBasicPokemonCard(c) : false)).map(c => c.name);

  let bannerHtml = "";
  if (hasBasic) {
    bannerHtml = `
      <div style="margin-bottom:10px; padding:10px 12px; background:rgba(239, 68, 68, 0.2); border:1.5px solid #ef4444; border-radius:8px; font-size:12.5px; color:#fecaca; line-height:1.6;">
        ⚠️ <b>注意：手札にたねポケモン（${escapeHtml(basicCardNames.join("、") || "たね")}）が含まれています！</b><br>
        相手がたねポケモンを見落としている可能性があります。<b>「❌ たねポケモンがいるため却下（マリガンを認めない）」</b>を押して相手に対戦準備へ戻るよう伝えてください。
      </div>
    `;
  } else {
    bannerHtml = `
      <div style="margin-bottom:10px; padding:8px 10px; background:rgba(250, 204, 21, 0.12); border:1px solid rgba(250, 204, 21, 0.4); border-radius:6px; font-size:12px; color:#fef08a;">
        📢 <b>${oppName}</b> さんが「たねポケモンなし（マリガン ${count}回目）」のため手札7枚を公開しました。<br>
        たねポケモンがいないことを確認して下の<b>「✅ たねポケモンなしを確認（引き直しを許可）」</b>を押してください。（カードはダブルクリックで拡大できます）
      </div>
    `;
  }

  let bodyHtml = bannerHtml + `<div class="card-grid">`;

  hand.forEach((c, i) => {
    const isBasicThis = (typeof isBasicPokemonCard === "function") && isBasicPokemonCard(c);
    const safeCard = { ...c, uid: `opp_mulligan_${count}_${i}` };
    registerCard(safeCard);
    const hasImg = !!safeCard.imageUrl;
    const bgImgStyle = hasImg ? `background-image: url('${safeCard.imageUrl}');` : '';
    const basicBorder = isBasicThis ? 'box-shadow: 0 0 12px #ef4444; border: 2.5px solid #ef4444 !important;' : '';
    bodyHtml += `
      <div class="card ${safeCard.color || 'pokemon'} ${hasImg ? 'has-img' : ''}"
           style="${bgImgStyle} ${basicBorder}"
           ondblclick="event.stopPropagation(); window.openCardZoomByUid('${safeCard.uid}')"
           title="${isBasicThis ? '⚠️ たねポケモンです！' : 'ダブルクリックで拡大'}">
        <div class="card-top">
          <span class="name">${escapeHtml(safeCard.name)}</span>
          ${isBasicThis ? '<span style="font-size:9px; background:#ef4444; color:#fff; padding:1px 4px; border-radius:3px; font-weight:bold;">たね</span>' : ''}
        </div>
        <div class="card-btm"><span>${escapeHtml(safeCard.sub || safeCard.category || '')}</span></div>
      </div>
    `;
  });
  bodyHtml += `</div>`;

  const footHtml = `
    <div style="display:flex; justify-content:flex-end; gap:8px; width:100%; flex-wrap:wrap;">
      <button class="btn red" onclick="rejectOpponentMulligan()">❌ たねポケモンがいるため却下（マリガンを認めない）</button>
      <button class="btn green" onclick="ackOpponentMulligan()">✅ たねポケモンなしを確認（引き直しを許可）</button>
    </div>
  `;

  showModal(`🔍 相手のマリガン手札確認 (${oppName} - ${count}回目)`, bodyHtml, footHtml, { dismissible: false });
}

function ackOpponentMulligan() {
  if (!Array.isArray(state.pendingOppMulliganQueue) || state.pendingOppMulliganQueue.length === 0) {
    closeModal();
    return;
  }
  const item = state.pendingOppMulliganQueue.shift();
  closeModal();

  if (typeof P2P !== "undefined" && P2P.connected) {
    P2P.send({
      t: "mulligan_ack",
      count: item.count,
      name: state.myName
    });
  }

  addLog(`相手（${item.name || state.oppName}）のマリガン手札（${item.count}回目）を確認し、引き直しを承認しました`, { suppressSync: true });
  showToast(`相手の手札を確認しました（相手が7枚引き直します）`);

  if (state.pendingOppMulliganQueue.length > 0) {
    setTimeout(() => showNextOpponentMulliganModal(), 150);
  }
  renderAll();
}

/** 相手の手札にたねポケモンがいるため、マリガンを却下（認めない）する */
function rejectOpponentMulligan() {
  if (!Array.isArray(state.pendingOppMulliganQueue) || state.pendingOppMulliganQueue.length === 0) {
    closeModal();
    return;
  }
  const item = state.pendingOppMulliganQueue.shift();
  closeModal();

  const oppName = item.name || state.oppName || "相手プレイヤー";
  const hand = Array.isArray(item.hand) ? item.hand : [];
  const basicNames = hand.filter(c => (typeof isBasicPokemonCard === "function" ? isBasicPokemonCard(c) : false)).map(c => c.name);
  const basicInfo = basicNames.length > 0 ? `（たねポケモン: ${basicNames.join(", ")}）` : "";

  if (typeof P2P !== "undefined" && P2P.connected) {
    P2P.send({
      t: "mulligan_reject",
      count: item.count,
      name: state.myName,
      reason: `手札にたねポケモン${basicInfo}が存在するため、マリガンは認められませんでした。`
    });
  }

  addLog(`相手（${oppName}）のマリガンを却下しました${basicInfo}。相手に対戦準備への復帰を求めました`, {
    suppressSync: true,
    badge: "❌ マリガン却下"
  });
  showToast(`相手のマリガンを却下しました（相手に通知送信）`);

  if (state.pendingOppMulliganQueue.length > 0) {
    setTimeout(() => showNextOpponentMulliganModal(), 150);
  }
  renderAll();
}

/** 対戦準備完了ボタン処理（このタイミングでサイド6枚を山札からセット） */
function confirmSetupReady() {
  if (!state.isSetupPhase) return;

  // 一人回しモードで、すでに準備完了している場合は取り消し可能
  if (state.isSoloMode && state.mySetupReady) {
    state.mySetupReady = false;
    // サイド6枚を山札の先頭に戻す
    if (state.myPrizes.length > 0) {
      state.myDeck.unshift(...state.myPrizes);
      state.myPrizes = [];
    }
    addLog(`【${state.myName}】対戦準備完了を取り消しました`, { suppressSync: true });
    showToast(`【${state.myName}】の準備完了を取り消しました。カードを再配置できます`);
    renderAll();
    return;
  }

  if (state.myMulliganStep === "waiting_opp_ack") {
    const ok = confirm("相手側の確認画面が開かない場合や通信が途切れた場合、確認をスキップして手札を引き直しますか？");
    if (ok) {
      performMulliganRedraw();
    }
    return;
  }
  if (state.myMulliganStep) {
    alert("現在マリガン処理中です。引き直しが完了してから準備完了を押してください。");
    return;
  }
  if (!state.myActive) {
    alert("バトル場にたねポケモンを配置してください。");
    return;
  }

  // ★ 対戦準備完了時に山札からサイド6枚をセット
  if (state.myPrizes.length === 0) {
    for (let i = 0; i < 6; i++) {
      if (state.myDeck.length > 0) {
        state.myPrizes.push(state.myDeck.shift());
      }
    }
  }

  state.mySetupReady = true;
  addLog(`【${state.myName}】バトル場の配置とサイド6枚のセットを完了しました`, { suppressSync: true });

  if (P2P.connected) {
    P2P.send({ t: "setup_ready", name: state.myName });
    P2P.syncNow();
    if (state.oppSetupReady) {
      handlePreMatchMulliganPenalty();
    }
  } else if (state.isSoloMode) {
    if (state.oppSetupReady) {
      // 双方とも準備完了！
      showToast("双方の対戦準備が完了しました！");
      renderAll();
      setTimeout(() => {
        handlePreMatchMulliganPenalty();
      }, 350);
    } else {
      // もう一方のデッキが未完了 -> 自動で上下を交代して続けて準備
      showToast(`【${state.myName}】準備完了！ 続けて【${state.oppName}】の準備を行います`);
      swapSoloTurn();
    }
  } else {
    handlePreMatchMulliganPenalty();
  }

  renderAll();
}

/**
 * 対戦準備完了後・対戦開始前のマリガンペナルティ（差分ドロー）判定
 */
function handlePreMatchMulliganPenalty() {
  const myMulligans = state.mulliganCount || 0;
  const oppMulligans = state.oppMulliganCount || 0;
  const diff = oppMulligans - myMulligans;

  if (diff > 0) {
    // 自分に追加ドローの権利がある（相手の方が多くマリガンした）
    showMulliganPenaltyModal(diff);
  } else if (myMulligans > oppMulligans) {
    // 相手に追加ドローの権利がある（自分の方が多くマリガンした）
    if (typeof P2P !== "undefined" && P2P.connected && !state.isSoloMode) {
      showMulliganWaitingNotice(myMulligans - oppMulligans);
    } else if (state.isSoloMode) {
      showSoloDeckBMulliganPenaltyModal(myMulligans - oppMulligans);
    } else {
      finishSetupPhaseAndStartBattle();
    }
  } else {
    // 差分なし（0枚）: マリガン同数または0回
    finishSetupPhaseAndStartBattle();
  }
}

function showMulliganPenaltyModal(diff) {
  const title = `🎴 マリガンペナルティ（追加ドロー）`;
  const body = `
    <div style="font-size:13.5px; line-height:1.7; color:#e2e8f0; margin-bottom:8px;">
      相手のマリガン回数が <b>${state.oppMulliganCount}回</b>、あなたのマリガン回数が <b>${state.mulliganCount}回</b> でした。<br>
      公式ルールに基づき、マリガンの差分として山札から <span style="font-size:16px; font-weight:bold; color:#fde047;">${diff}枚</span> カードを引くことができます。<br>
      <div style="margin-top:12px; font-weight:bold; color:#f8fafc; font-size:14px;">カードを引きますか？</div>
    </div>
  `;
  const foot = `
    <div style="display:flex; justify-content:flex-end; gap:10px; width:100%;">
      <button class="btn" style="background:#475569; color:#f1f5f9; padding:6px 14px;" onclick="resolveMulliganPenalty(false, 0)">引かない</button>
      <button class="btn green" style="font-weight:bold; padding:6px 16px;" onclick="resolveMulliganPenalty(true, ${diff})">はい、引きます（${diff}枚）</button>
    </div>
  `;
  showModal(title, body, foot, { dismissible: false });
}

function showMulliganWaitingNotice(diff) {
  const title = `⏳ 相手の追加ドロー待ち`;
  const body = `
    <div style="font-size:13.5px; line-height:1.7; color:#e2e8f0; text-align:center; padding:12px 0;">
      あなたが相手よりマリガンが多いため、<br>
      相手（${state.oppName}）がマリガンペナルティの追加ドロー（最大 <b>${diff}枚</b>）を選択しています。<br>
      <span style="font-size:12px; color:#94a3b8; display:inline-block; margin-top:8px;">相手の選択が完了すると自動的に対戦が開始されます...</span>
    </div>
  `;
  const foot = `
    <div style="text-align:center; width:100%; color:#fde047; font-size:12px; font-weight:bold;">
      相手の操作を待っています...
    </div>
  `;
  showModal(title, body, foot, { dismissible: false });
}

function showSoloDeckBMulliganPenaltyModal(diff) {
  const title = `🎴 一人回し: 相手側（デッキB）マリガンペナルティ`;
  const body = `
    <div style="font-size:13.5px; line-height:1.7; color:#e2e8f0;">
      自分（デッキA）のマリガンが多いため、相手側（デッキB）がマリガン差分の <b>${diff}枚</b> 引くことができます。<br>
      デッキBの手札に追加しますか？
    </div>
  `;
  const foot = `
    <div style="display:flex; justify-content:flex-end; gap:10px; width:100%;">
      <button class="btn" style="background:#475569; color:#f1f5f9;" onclick="resolveSoloDeckBMulliganPenalty(false, 0)">引かない</button>
      <button class="btn green" style="font-weight:bold;" onclick="resolveSoloDeckBMulliganPenalty(true, ${diff})">デッキBに${diff}枚引く</button>
    </div>
  `;
  showModal(title, body, foot, { dismissible: false });
}

function resolveSoloDeckBMulliganPenalty(shouldDraw, count) {
  closeModal();
  if (shouldDraw && count > 0) {
    for (let i = 0; i < count; i++) {
      if (state.oppDeck.length > 0) {
        state.oppHand.push(state.oppDeck.shift());
      }
    }
    state.oppDeckCount = state.oppDeck.length;
    state.oppHandCount = state.oppHand.length;
    addLog(`【対戦準備】マリガンペナルティにより、相手側（デッキB）がカードを${count}枚引きました`, {
      suppressSync: true,
      badge: "🎴 ペナルティドロー"
    });
    showToast(`デッキBがペナルティで${count}枚引きました`);
  } else {
    addLog(`【対戦準備】相手側（デッキB）はマリガンペナルティの追加ドローを行いませんでした`, {
      suppressSync: true,
      badge: "▶️ ドロー辞退"
    });
  }
  renderAll();
  setTimeout(() => {
    finishSetupPhaseAndStartBattle();
  }, 350);
}

function resolveMulliganPenalty(shouldDraw, count) {
  closeModal();
  if (shouldDraw && count > 0) {
    const drawnCards = [];
    for (let i = 0; i < count; i++) {
      if (state.myDeck.length > 0) {
        drawnCards.push(state.myDeck.shift());
      }
    }
    drawnCards.forEach(c => state.myHand.push(c));
    addLog(`【対戦準備】相手のマリガンペナルティにより、山札からカードを${drawnCards.length}枚引きました`, {
      oppText: `相手がマリガンペナルティによりカードを${drawnCards.length}枚引きました`,
      badge: "🎴 ペナルティドロー"
    });
    showToast(`マリガンペナルティ: ${drawnCards.length}枚引きました`);
    renderAll();
  } else {
    addLog(`【対戦準備】相手のマリガンペナルティによる追加ドローを行わずに開始します`, {
      oppText: `相手はマリガンペナルティの追加ドローを行いませんでした`,
      badge: "▶️ ドロー辞退"
    });
  }

  if (typeof P2P !== "undefined" && P2P.connected && !state.isSoloMode) {
    P2P.send({
      t: "mulligan_penalty_done",
      drawn: shouldDraw,
      count: shouldDraw ? count : 0,
      name: state.myName
    });
    P2P.syncNow();
  }

  setTimeout(() => {
    finishSetupPhaseAndStartBattle();
  }, 400);
}

window.handlePreMatchMulliganPenalty = handlePreMatchMulliganPenalty;
window.showMulliganPenaltyModal = showMulliganPenaltyModal;
window.resolveMulliganPenalty = resolveMulliganPenalty;
window.resolveSoloDeckBMulliganPenalty = resolveSoloDeckBMulliganPenalty;

/** 双方準備完了後のオープン・バトル開始 */
function finishSetupPhaseAndStartBattle() {
  // 一人回しモード時、先攻（デッキ1）が下側（操作側）に来るように整える
  if (state.isSoloMode && state.myName && state.myName.includes("デッキ2")) {
    swapSoloTurn();
  }

  state.isSetupPhase = false;
  state.setupStep = "done";
  state.mySetupReady = true;
  state.oppSetupReady = true;
  state.myMulliganStep = null;
  state.oppMulliganDeclared = false;
  state.turnStep = 1;
  state.turn = 1;

  if (P2P.connected) {
    P2P.send({ t: "match_open", turnStep: 1 });
    P2P.syncNow();
  }

  showToast("🎉 せーの、オープン！ バトル開始！");
  const mulliganNote = state.oppMulliganCount > 0 ? `（※相手のマリガン ${state.oppMulliganCount}回分、必要に応じて山札から引いてください）` : "";
  const initialTurnInfo = (typeof getTurnInfo === "function") ? getTurnInfo(1) : { label: "先攻1ターン目", isMyTurn: (state.firstPlayer !== "opp"), activePlayerName: (state.firstPlayer === "opp" ? state.oppName : state.myName) };

  addLog(`お互いのバトル場を公開し、対戦を開始しました！ (${initialTurnInfo.label}: 【${initialTurnInfo.activePlayerName}】の番) ${mulliganNote}`, { suppressSync: true });

  renderAll();

  // ★ ３）バトル開始時のバナー演出 ＆ ４）先攻プレイヤーの強制トップドロー
  if (typeof playTurnChangeBanner === "function") {
    playTurnChangeBanner(initialTurnInfo, () => {
      if (initialTurnInfo.isMyTurn && typeof executeTurnStartDraw === "function") {
        executeTurnStartDraw();
      }
    });
  }
}

/** 相手からマリガンを却下（認めない）された場合の受信処理 */
function handleMulliganRejected(reason, rejectorName) {
  state.myMulliganStep = null;
  const name = rejectorName || state.oppName || "相手プレイヤー";
  const reasonText = reason || "手札にたねポケモンが存在するため、マリガンは認められませんでした。";

  addLog(`【対戦準備】相手（${name}）からマリガンが却下されました: ${reasonText}`, {
    badge: "⚠️ マリガン却下通知"
  });

  if (typeof showActionPopup === "function") {
    showActionPopup(name, "「手札にたねポケモンがいるためマリガンできません」", [], "❌ マリガン却下");
  }

  alert(`【マリガンが却下されました】\n相手（${name}）より:\n${reasonText}\n\n手札のたねポケモンを確認し、バトル場に配置して対戦準備を完了してください。`);

  renderAll();
}

window.hasBasicPokemon = hasBasicPokemon;
window.executeMulligan = executeMulligan;
window.toggleSoloSetupSide = toggleSoloSetupSide;
window.sendMulliganRevealToOpponent = sendMulliganRevealToOpponent;
window.performMulliganRedraw = performMulliganRedraw;
window.enqueueOpponentMulliganReveal = enqueueOpponentMulliganReveal;
window.showNextOpponentMulliganModal = showNextOpponentMulliganModal;
window.ackOpponentMulligan = ackOpponentMulligan;
window.rejectOpponentMulligan = rejectOpponentMulligan;
window.handleMulliganRejected = handleMulliganRejected;
window.confirmSetupReady = confirmSetupReady;
window.finishSetupPhaseAndStartBattle = finishSetupPhaseAndStartBattle;
