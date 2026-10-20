/* 【UI】盤面描画（相手・自分・手札・使用エリア・スタジアム・スマホシート） */

// =============================================================================
// 描画関数群 (Render)
// =============================================================================
function renderAll() {
  const turnInfo = (typeof getTurnInfo === "function")
    ? getTurnInfo(state.turnStep || 1)
    : { label: `ターン ${state.turn}`, isMyTurn: true, activePlayerName: state.myName };

  document.getElementById("g-room").textContent = state.roomNo;
  document.getElementById("g-my-name").textContent = state.myName;
  document.getElementById("g-opp-name").textContent = state.oppName;
  document.getElementById("g-turn").textContent = turnInfo.label;

  // １）どちらのプレイヤーのターンかを明確にするため、ターン中プレイヤー名の左側に赤い丸を表示
  const dotOpp = document.getElementById("turn-dot-opp");
  const dotMe = document.getElementById("turn-dot-me");
  if (dotOpp && dotMe) {
    if (turnInfo.isMyTurn) {
      dotMe.className = "turn-dot active";
      dotOpp.className = "turn-dot hidden";
    } else {
      dotMe.className = "turn-dot hidden";
      dotOpp.className = "turn-dot active";
    }
  }

  // ２）プレイヤー名の右側に「先攻」と「後攻」を表示
  const badgeOpp = document.getElementById("g-opp-order");
  const badgeMe = document.getElementById("g-my-order");
  if (badgeOpp && badgeMe) {
    const firstRole = state.firstPlayer || "me";
    const isMeFirst = (firstRole === "me");
    if (isMeFirst) {
      badgeMe.textContent = "【先攻】";
      badgeMe.className = "order-badge first";
      badgeOpp.textContent = "【後攻】";
      badgeOpp.className = "order-badge second";
    } else {
      badgeMe.textContent = "【後攻】";
      badgeMe.className = "order-badge second";
      badgeOpp.textContent = "【先攻】";
      badgeOpp.className = "order-badge first";
    }
  }

  // ４）ベンチ枠拡張ボタンの表示テキスト切り替え
  const btnBenchToggle = document.getElementById("btn-bench-toggle");
  if (btnBenchToggle) {
    if ((state.myBenchLimit || 5) > 5) {
      btnBenchToggle.textContent = "🏟️ ベンチ枠を5にする";
      btnBenchToggle.classList.add("limit-8-active");
    } else {
      btnBenchToggle.textContent = "🏟️ ベンチ枠を8にする";
      btnBenchToggle.classList.remove("limit-8-active");
    }
  }

  // ターン終了ボタンの状態制御
  const btnEndTurn = document.getElementById("btn-end-turn");
  if (btnEndTurn) {
    if (state.isSetupPhase) {
      btnEndTurn.disabled = true;
      btnEndTurn.style.display = "none";
      btnEndTurn.classList.remove("my-turn-glow");
    } else {
      btnEndTurn.style.display = "";
      if (state.mustPromoteToActive) {
        btnEndTurn.disabled = true;
        btnEndTurn.textContent = "出撃待ち";
        btnEndTurn.classList.add("disabled-turn");
        btnEndTurn.classList.remove("my-turn-glow");
      } else if (state.isSoloTemporarySwap) {
        btnEndTurn.disabled = true;
        btnEndTurn.textContent = "相手側操作中";
        btnEndTurn.classList.add("disabled-turn");
        btnEndTurn.classList.remove("my-turn-glow");
      } else if (turnInfo.isMyTurn || state.isSoloMode) {
        btnEndTurn.disabled = false;
        btnEndTurn.textContent = "ターン終了";
        btnEndTurn.classList.remove("disabled-turn");
        btnEndTurn.classList.add("my-turn-glow");
      } else {
        btnEndTurn.disabled = true;
        btnEndTurn.textContent = "相手の手番中";
        btnEndTurn.classList.add("disabled-turn");
        btnEndTurn.classList.remove("my-turn-glow");
      }
    }
  }

  // 対戦画面ヘッダーでの接続・相手情報表示
  const connBadge = document.getElementById("g-conn-badge");
  const btnVoice = document.getElementById("btn-top-voice");
  const btnChat = document.querySelector(".btn-chat-trigger");
  if (btnVoice) {
    btnVoice.style.display = state.isSoloMode ? "none" : "";
  }
  if (btnChat) {
    btnChat.style.display = state.isSoloMode ? "none" : "";
  }

  if (connBadge) {
    if (state.oppExited) {
      connBadge.className = "conn-badge offline";
      connBadge.innerHTML = `🔴 相手が退室しました: <b>${escapeHtml(state.oppName)}</b>`;
    } else if (typeof P2P !== "undefined" && P2P.connected) {
      connBadge.className = "conn-badge online";
      connBadge.innerHTML = `🟢 通信対戦中: <b>${escapeHtml(state.oppName)}</b>`;
    } else if (state.isSoloMode) {
      connBadge.className = "conn-badge solo";
      connBadge.innerHTML = `🎬 一人回し: <b>${escapeHtml(state.oppName)}</b>`;
    } else {
      connBadge.className = "conn-badge offline";
      connBadge.innerHTML = `⚪ オフライン`;
    }
  }

  renderOpponent();
  renderMyField();
  renderHand();
  renderTemp();
  renderPlayArea();
  renderStadium();
  renderPlaymats();
  renderSoloTemporaryBanner();
  updateSheetUI();
  renderSetupBanner();
  if (typeof P2P !== "undefined") P2P.syncSoon();
  if (state.isSoloMode && typeof debouncedSaveSoloSession === "function") {
    debouncedSaveSoloSession();
  }
}

function renderSoloTemporaryBanner() {
  const banner = document.getElementById("solo-temp-banner");
  if (!banner) return;
  if (state.isSoloMode && state.isSoloTemporarySwap) {
    banner.classList.remove("hidden");
    const msg = document.getElementById("solo-temp-msg");
    if (msg) {
      msg.textContent = `⚠️ 【${escapeHtml(state.myName)}（相手側）を手動操作中】`;
    }
  } else {
    banner.classList.add("hidden");
  }
}

function renderSetupBanner() {
  const setupBanner = document.getElementById("setup-banner");
  if (!setupBanner) return;

  if (state.isSetupPhase) {
    setupBanner.classList.remove("hidden");
    const statusEl = document.getElementById("setup-order-status");
    const btnCoin = document.getElementById("btn-setup-coin");
    const btnMulligan = document.getElementById("btn-mulligan");
    const btnReady = document.getElementById("btn-setup-ready");
    const btnSoloSwapSetup = document.getElementById("btn-solo-swap-setup");

    const btnReopenMulligan = document.getElementById("btn-reopen-mulligan");
    if (btnReopenMulligan) {
      const hasPendingMulligan = Array.isArray(state.pendingOppMulliganQueue) && state.pendingOppMulliganQueue.length > 0;
      const needsApproval = hasPendingMulligan || (state.oppMulliganDeclared && state.mySetupReady);
      btnReopenMulligan.classList.toggle("hidden", !needsApproval);
      if (needsApproval) {
        if (hasPendingMulligan) {
          btnReopenMulligan.textContent = "⚠️ 相手のマリガン確認待ち (開く)";
          btnReopenMulligan.onclick = () => showNextOpponentMulliganModal();
        } else {
          btnReopenMulligan.textContent = "⚠️ 相手のマリガンを承認 (許可)";
          btnReopenMulligan.onclick = () => {
            if (typeof P2P !== "undefined" && P2P.connected) {
              P2P.send({ t: "mulligan_ack", name: state.myName });
            }
            state.oppMulliganDeclared = false;
            showToast("相手のマリガン（引き直し）を承認しました");
            renderAll();
          };
        }
      }
    }

    if (btnCoin) {
      const isHostOrOffline = (typeof P2P === "undefined" || !P2P.connected || P2P.role === "host");
      if (state.setupStep === "coin" && isHostOrOffline) {
        btnCoin.classList.remove("hidden");
      } else {
        btnCoin.classList.add("hidden");
      }
    }

    if (btnSoloSwapSetup) {
      if (state.isSoloMode) {
        btnSoloSwapSetup.classList.remove("hidden");
        btnSoloSwapSetup.textContent = `🔄 側を交代 (${state.oppName}へ)`;
        btnSoloSwapSetup.title = "対戦準備中にデッキ1とデッキ2を切り替えて配置・確認を行います";
      } else {
        btnSoloSwapSetup.classList.add("hidden");
      }
    }

    if (statusEl) {
      if (state.isSoloMode) {
        const readyCount = (state.mySetupReady ? 1 : 0) + (state.oppSetupReady ? 1 : 0);
        const mySideOrder = (state.firstPlayer === "me") ? "先攻" : "後攻";
        const readyStatusStr = state.mySetupReady ? "✅準備完了" : "未完了";
        statusEl.textContent = `【準備 ${readyCount}/2】現在: ${state.myName}（${mySideOrder}・${readyStatusStr}）たねポケモンをバトル場に出してください`;
      } else if (state.setupStep === "coin") {
        const isGuest = (typeof P2P !== "undefined" && P2P.connected && P2P.role === "guest");
        statusEl.textContent = isGuest
          ? "🪙 ルームオーナーが先攻・後攻を決めるコイントスを行っています..."
          : "🪙 コイントスで先攻・後攻を決定してください（表：オーナー ／ 裏：相手）";
      } else if (state.setupStep === "choosing_order") {
        statusEl.textContent = "🪙 あなたが先攻・後攻を選択中...";
      } else if (state.setupStep === "waiting_order") {
        statusEl.textContent = `🪙 相手（${state.oppName}）が先攻・後攻を選択中...`;
      } else if (state.myMulliganStep === "waiting_opp_ready") {
        statusEl.textContent = "⚠️ 「たねポケモンなし」を宣言中：相手が対戦準備を完了するまで待機しています...";
      } else if (state.myMulliganStep === "waiting_opp_ack") {
        statusEl.textContent = "🔍 相手に手札7枚を公開中：相手の確認（OK）を待っています...";
      } else if (state.mySetupReady) {
        statusEl.textContent = "準備完了（サイド6枚セット済）！ 相手の準備完了を待っています...";
      } else if (state.firstPlayer) {
        const orderStr = (state.firstPlayer === "me") ? "【先攻】" : "【後攻】";
        const oppDeclNote = state.oppMulliganDeclared ? " （⚠️相手が「たねなし」を宣言してあなたの準備完了を待っています）" : "";
        statusEl.textContent = `あなたは${orderStr}です。たねポケモンをバトル場に出してください。${oppDeclNote}`;
      } else {
        const oppDeclNote = state.oppMulliganDeclared ? " （⚠️相手が「たねなし」を宣言してあなたの準備完了を待っています）" : "";
        statusEl.textContent = `たねポケモンをバトル場に出してください。${oppDeclNote}`;
      }
    }

    // マリガンボタン制御
    if (btnMulligan) {
      const hasBench = state.myBench.some(b => b !== null);
      if (state.myMulliganStep === "waiting_opp_ready") {
        btnMulligan.disabled = true;
        btnMulligan.textContent = "⏳ 相手の準備完了待ち...";
        btnMulligan.title = "相手が準備完了するとあなたの手札7枚が公開されます";
      } else if (state.myMulliganStep === "waiting_opp_ack") {
        btnMulligan.disabled = false;
        btnMulligan.textContent = "🔄 手札を再公開 (再送)";
        btnMulligan.title = "相手に確認画面が表示されていない場合、クリックして手札7枚を再送信します";
      } else if (state.myActive || hasBench || state.mySetupReady) {
        btnMulligan.disabled = true;
        btnMulligan.textContent = "🔄 たねなし引き直し (マリガン)";
        btnMulligan.title = "場にポケモンを配置した後・準備完了後はマリガンできません";
      } else {
        btnMulligan.disabled = false;
        btnMulligan.textContent = (typeof P2P !== "undefined" && P2P.connected && !state.oppSetupReady)
          ? "🔄 たねなし宣言 (マリガン)"
          : "🔄 たねなし引き直し (マリガン)";
        btnMulligan.title = "手札にたねポケモンがいない場合、宣言して引き直すことができます";
      }
    }

    // 対戦準備完了ボタン制御: バトル場にポケモンがいる場合のみ有効化
    if (btnReady) {
      if (state.isSoloMode) {
        if (state.mySetupReady) {
          btnReady.disabled = false;
          btnReady.textContent = `↩️ ${state.myName} 準備完了を取り消す`;
          btnReady.classList.remove("green");
          btnReady.classList.add("gold");
          btnReady.title = "クリックして準備完了を取り消し、カードの再配置ができます";
        } else if (!state.myActive) {
          btnReady.disabled = true;
          btnReady.textContent = "バトル場に配置してください";
          btnReady.classList.remove("gold");
          btnReady.classList.remove("green");
          btnReady.title = "バトル場にたねポケモンを出してください";
        } else {
          btnReady.disabled = false;
          const nextSide = state.oppSetupReady ? "対戦開始" : `続けて ${state.oppName} の配置へ`;
          btnReady.textContent = `✅ ${state.myName} 準備完了 (${nextSide})`;
          btnReady.classList.remove("gold");
          btnReady.classList.add("green");
          btnReady.title = "サイドを6枚セットし、準備完了とします";
        }
      } else {
        if (state.mySetupReady) {
          btnReady.disabled = true;
          btnReady.textContent = "相手の準備待ち...";
          btnReady.classList.remove("green");
          btnReady.classList.add("gold");
        } else if (state.myMulliganStep === "waiting_opp_ack") {
          btnReady.disabled = false;
          btnReady.textContent = "⏩ 確認待ちスキップ (引き直し)";
          btnReady.classList.remove("green");
          btnReady.classList.add("gold");
          btnReady.title = "相手の確認画面が開かない場合、確認待ちをスキップして手札を引き直します";
        } else if (state.myMulliganStep) {
          btnReady.disabled = true;
          btnReady.textContent = "マリガン処理中...";
          btnReady.classList.remove("gold");
          btnReady.classList.remove("green");
        } else if (!state.myActive) {
          btnReady.disabled = true;
          btnReady.textContent = "バトル場に配置してください";
          btnReady.classList.remove("gold");
          btnReady.classList.remove("green");
        } else {
          btnReady.disabled = false;
          btnReady.textContent = "✅ 対戦準備完了 (サイド6枚セット)";
          btnReady.classList.remove("gold");
          btnReady.classList.add("green");
        }
      }
    }
  } else {
    setupBanner.classList.add("hidden");
  }
}

function renderOpponent() {
  // 相手手札
  const oppHandEl = document.getElementById("opp-hand-cards");
  oppHandEl.innerHTML = "";
  for (let i = 0; i < state.oppHandCount; i++) {
    const b = document.createElement("div");
    b.className = "back";
    oppHandEl.appendChild(b);
  }
  document.getElementById("opp-hand-count").textContent = state.oppHandCount;

  // 一人回しモード時の相手手札クリックで干渉メニュー表示
  const oppHandWrap = document.getElementById("opp-hand");
  if (state.isSoloMode && !state.isSetupPhase) {
    oppHandEl.classList.add("clickable");
    oppHandEl.title = "クリックして相手手札の干渉メニュー（山札戻し、ドロー、トラッシュ等）を開く";
    oppHandEl.onclick = () => {
      if (typeof showSoloOpponentHandMenu === "function") showSoloOpponentHandMenu();
    };
    if (oppHandWrap) {
      oppHandWrap.classList.add("clickable");
      oppHandWrap.title = "クリックして相手手札の干渉メニュー（山札戻し、ドロー、トラッシュ等）を開く";
      oppHandWrap.onclick = () => {
        if (typeof showSoloOpponentHandMenu === "function") showSoloOpponentHandMenu();
      };
    }
  } else {
    oppHandEl.classList.remove("clickable");
    oppHandEl.title = "";
    oppHandEl.onclick = null;
    if (oppHandWrap) {
      oppHandWrap.classList.remove("clickable");
      oppHandWrap.title = "";
      oppHandWrap.onclick = null;
    }
  }

  // 相手山札・トラッシュ
  document.getElementById("opp-deck").innerHTML = `
    <div class="back"></div>
    <span class="count-badge">${state.oppDeckCount}</span>
  `;
  const oppTrashEl = document.getElementById("opp-trash");
  if (state.oppTrash.length > 0) {
    const top = state.oppTrash[state.oppTrash.length - 1];
    registerCard(top);
    const hasImg = !!top.imageUrl;
    const imgStyle = hasImg ? `style="background-image: url('${top.imageUrl}');"` : '';
    oppTrashEl.innerHTML = `
      <div class="card ${top.color} ${hasImg ? 'has-img' : ''}" ${imgStyle} ondblclick="event.stopPropagation(); window.openCardZoomByUid('${top.uid}')">
        <div class="card-top"><span class="name">${top.name}</span></div>
      </div>
      <span class="count-badge">${state.oppTrash.length}</span>
    `;
    oppTrashEl.onclick = () => showCardListModal("相手のトラッシュ", state.oppTrash);
  } else {
    oppTrashEl.innerHTML = `<div class="slot">トラッシュ</div><span class="count-badge">0</span>`;
  }

  // 相手ロスト・サイド
  document.getElementById("opp-lost").innerHTML = `ロスト <b>${state.oppLostCount}</b>`;
  const oppPrizesEl = document.getElementById("opp-prizes");
  oppPrizesEl.innerHTML = "";
  for (let i = 0; i < state.oppPrizes; i++) {
    const b = document.createElement("div");
    b.className = "back";
    oppPrizesEl.appendChild(b);
  }

  // 相手バトル場（クリックでメニュー、ダブルクリックで拡大）
  const oppActiveEl = document.getElementById("opp-active");
  if (state.oppActive) {
    if (state.isSetupPhase) {
      oppActiveEl.innerHTML = `
        <div class="card back setup-facedown" title="相手のバトルポケモン（準備完了後に公開されます）">
          <div class="facedown-label">準備中...</div>
        </div>
      `;
    } else {
      oppActiveEl.innerHTML = renderPokemonCardHtml(state.oppActive, "opp-active");
      const cardEl = oppActiveEl.querySelector(".card");
      if (cardEl) {
        cardEl.onclick = (e) => {
          if (isMobileMode()) {
            if (typeof showOpponentPokemonMenu === "function") showOpponentPokemonMenu(e, "opp-active", 0);
          } else {
            selectFieldPokemon("opp-active", 0);
          }
        };
        cardEl.oncontextmenu = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof showOpponentPokemonMenu === "function") showOpponentPokemonMenu(e, "opp-active", 0);
        };
        cardEl.ondblclick = (e) => {
          e.stopPropagation();
          if (typeof hideCtx === "function") hideCtx();
          if (typeof openCardZoom === "function") openCardZoom(state.oppActive.card, state.oppActive);
        };
      }
    }
  } else {
    oppActiveEl.innerHTML = `<div class="slot">相手バトル場</div>`;
  }

  // 相手ベンチ（クリックで選択、右クリックでメニュー、ダブルクリックで拡大）
  const oppBenchEl = document.getElementById("opp-bench");
  oppBenchEl.innerHTML = "";
  const oppLimit = state.oppBenchLimit || 5;
  oppBenchEl.classList.toggle("limit-8", oppLimit > 5);

  for (let i = 0; i < oppLimit; i++) {
    const b = state.oppBench[i];
    if (b) {
      if (state.isSetupPhase) {
        const wrap = document.createElement("div");
        wrap.innerHTML = `
          <div class="card back setup-facedown" title="相手のベンチポケモン（準備完了後に公開されます）">
            <div class="facedown-label">準備中...</div>
          </div>
        `;
        oppBenchEl.appendChild(wrap.firstElementChild);
      } else {
        const wrap = document.createElement("div");
        wrap.innerHTML = renderPokemonCardHtml(b, `opp-bench_${i}`, "bench-spot");
        const cardEl = wrap.firstElementChild;
        const bIdx = i;
        cardEl.onclick = (e) => {
          if (isMobileMode()) {
            if (typeof showOpponentPokemonMenu === "function") showOpponentPokemonMenu(e, "opp-bench", bIdx);
          } else {
            selectFieldPokemon("opp-bench", bIdx);
          }
        };
        cardEl.oncontextmenu = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof showOpponentPokemonMenu === "function") showOpponentPokemonMenu(e, "opp-bench", bIdx);
        };
        cardEl.ondblclick = (e) => {
          e.stopPropagation();
          if (typeof hideCtx === "function") hideCtx();
          if (typeof openCardZoom === "function") openCardZoom(b.card, b);
        };
        oppBenchEl.appendChild(cardEl);
      }
    } else {
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.innerHTML = `ベンチ ${i + 1}`;
      oppBenchEl.appendChild(slot);
    }
  }
}

function renderMyField() {
  // 自分ロスト
  const myLostEl = document.getElementById("my-lost");
  myLostEl.innerHTML = `ロスト <b>${state.myLost.length}</b>`;
  myLostEl.onclick = () => showCardListModal("ロストゾーン", state.myLost);
  myLostEl.ondragover = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; myLostEl.classList.add("drag-over"); };
  myLostEl.ondragleave = (e) => { if (!myLostEl.contains(e.relatedTarget)) myLostEl.classList.remove("drag-over"); };
  myLostEl.ondrop = (e) => {
    e.preventDefault();
    myLostEl.classList.remove("drag-over");
    handleDropToLost(e);
  };

  // 自分サイド（PC左クリックで手札に加える、右クリックでコンテキストメニュー、スマホ時はタップでメニュー）
  const myPrizesEl = document.getElementById("my-prizes");
  myPrizesEl.innerHTML = "";
  state.myPrizes.forEach((p, idx) => {
    const el = document.createElement("div");
    el.className = "back clickable";
    el.title = `サイド ${idx + 1}枚目 (左クリック: 手札に加える / 右クリック: メニュー)`;
    el.onclick = (e) => {
      e.stopPropagation();
      if (typeof isMobileMode === "function" && isMobileMode()) {
        showPrizeMenu(e, idx);
      } else {
        handlePrizeAction(idx, "hand");
      }
    };
    el.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      showPrizeMenu(e, idx);
    };
    myPrizesEl.appendChild(el);
  });

  // 自分山札
  const myDeckEl = document.getElementById("my-deck");
  myDeckEl.innerHTML = `
    <div class="back clickable" title="山札をクリックで1枚引く" onclick="actions.draw()"></div>
    <span class="count-badge">${state.myDeck.length}</span>
  `;

  // 自分トラッシュ（一番上のカードはダブルクリックで拡大）
  const myTrashEl = document.getElementById("my-trash");
  if (state.myTrash.length > 0) {
    const top = state.myTrash[state.myTrash.length - 1];
    registerCard(top);
    const hasImg = !!top.imageUrl;
    const imgStyle = hasImg ? `style="background-image: url('${top.imageUrl}');"` : '';
    myTrashEl.innerHTML = `
      <div class="card ${top.color} ${hasImg ? 'has-img' : ''}" ${imgStyle} ondblclick="event.stopPropagation(); window.openCardZoomByUid('${top.uid}')">
        <div class="card-top"><span class="name">${top.name}</span></div>
      </div>
      <span class="count-badge">${state.myTrash.length}</span>
    `;
    myTrashEl.onclick = () => showCardListModal("トラッシュ", state.myTrash);
  } else {
    myTrashEl.innerHTML = `<div class="slot">トラッシュ</div><span class="count-badge">0</span>`;
    myTrashEl.onclick = null;
  }
  myTrashEl.ondragover = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; myTrashEl.classList.add("drag-over"); };
  myTrashEl.ondragleave = (e) => { if (!myTrashEl.contains(e.relatedTarget)) myTrashEl.classList.remove("drag-over"); };
  myTrashEl.ondrop = (e) => {
    e.preventDefault();
    myTrashEl.classList.remove("drag-over");
    handleDropToTrash(e);
  };

  // 自分バトル場（クリックで選択、右クリックでメニュー、ダブルクリックで拡大）
  const myActiveEl = document.getElementById("my-active");
  if (state.myActive) {
    myActiveEl.innerHTML = renderPokemonCardHtml(state.myActive, "active");
    const cardEl = myActiveEl.querySelector(".card");
    if (cardEl) {
      cardEl.onclick = (e) => {
        if (isMobileMode()) {
          showPokemonMenu(e, "active", 0);
        } else {
          selectFieldPokemon("active", 0);
        }
      };
      cardEl.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        showPokemonMenu(e, "active", 0);
      };
      cardEl.ondblclick = (e) => {
        e.stopPropagation();
        hideCtx();
        openCardZoom(state.myActive.card, state.myActive);
      };
    }
  } else {
    myActiveEl.innerHTML = `<div class="slot ${state.actionTargetMode === 'active' ? 'targetable' : ''}">バトル場に出す<br><small style="font-size:9px; opacity:0.8;">(ドラッグまたはタップ)</small></div>`;
    myActiveEl.onclick = () => {
      if (state.mustPromoteToActive) {
        showToast("⚠️ ダイアログから出撃させるベンチポケモンを選択してください");
        return;
      }
      const selectedCards = (typeof getSelectedHandCards === "function") ? getSelectedHandCards() : [];
      if (selectedCards.length > 0) {
        placeSelectedHandToActive();
      } else if (state.selectedHandIndex >= 0 && state.selectedHandIndex < state.myHand.length) {
        placeHandCardToActive(state.selectedHandIndex);
      } else {
        showToast("手札のカードを選択してからここをタップするか、直接ドラッグしてください");
      }
    };
    myActiveEl.ondragover = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; myActiveEl.classList.add("drag-over"); };
    myActiveEl.ondragleave = (e) => { if (!myActiveEl.contains(e.relatedTarget)) myActiveEl.classList.remove("drag-over"); };
    myActiveEl.ondrop = (e) => {
      e.preventDefault();
      myActiveEl.classList.remove("drag-over");
      if (state.mustPromoteToActive) {
        showToast("⚠️ ダイアログから出撃させるベンチポケモンを選択してください");
        return;
      }
      const handIdx = getDroppedHandIndex(e);
      if (handIdx !== null) placeHandCardToActive(handIdx);
    };
  }

  // 自分ベンチ（クリックで選択、右クリックでメニュー、ダブルクリックで拡大）
  const myBenchEl = document.getElementById("my-bench");
  myBenchEl.innerHTML = "";
  const myLimit = state.myBenchLimit || 5;
  myBenchEl.classList.toggle("limit-8", myLimit > 5);

  for (let i = 0; i < myLimit; i++) {
    const b = state.myBench[i];
    if (b) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = renderPokemonCardHtml(b, `bench_${i}`, "bench-spot");
      const cardEl = wrapper.firstElementChild;
      cardEl.dataset.benchIndex = i.toString();
      cardEl.onclick = (e) => {
        if (isMobileMode()) {
          showPokemonMenu(e, "bench", i);
        } else {
          selectFieldPokemon("bench", i);
        }
      };
      cardEl.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        showPokemonMenu(e, "bench", i);
      };
      cardEl.ondblclick = (e) => {
        e.stopPropagation();
        hideCtx();
        openCardZoom(b.card, b);
      };
      myBenchEl.appendChild(cardEl);
    } else {
      const slot = document.createElement("div");
      slot.className = `slot ${state.actionTargetMode === 'bench' ? 'targetable' : ''}`;
      slot.dataset.benchIndex = i.toString();
      slot.innerHTML = `ベンチ ${i + 1}<br><small style="font-size:8px; opacity:0.8;">(ドラッグ配置)</small>`;
      slot.onclick = () => {
        if (state.selectedHandIndex >= 0 && state.selectedHandIndex < state.myHand.length) {
          placeHandCardToBenchIndex(state.selectedHandIndex, i);
        } else {
          showToast(`手札のカードを選択してからベンチ${i + 1}をタップするか、直接ドラッグしてください`);
        }
      };
      slot.ondragover = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; slot.classList.add("drag-over"); };
      slot.ondragleave = (e) => { if (!slot.contains(e.relatedTarget)) slot.classList.remove("drag-over"); };
      slot.ondrop = (e) => {
        e.preventDefault();
        slot.classList.remove("drag-over");
        const handIdx = getDroppedHandIndex(e);
        if (handIdx !== null) placeHandCardToBenchIndex(handIdx, i);
      };
      myBenchEl.appendChild(slot);
    }
  }
}


function renderHand() {
  const handEl = document.getElementById("hand");
  handEl.innerHTML = "";
  document.getElementById("hand-count").textContent = state.myHand.length;

  const btnSoloHand = document.getElementById("btn-solo-hand-interfere");
  if (btnSoloHand) {
    if (state.isSoloMode && !state.isSetupPhase) {
      btnSoloHand.classList.remove("hidden");
    } else {
      btnSoloHand.classList.add("hidden");
    }
  }

  const selNameEl = document.getElementById("hand-sel");
  const selectedCards = getSelectedHandCards();
  if (selectedCards.length === 1) {
    selNameEl.textContent = `選択中: ${selectedCards[0].card.name}`;
  } else if (selectedCards.length > 1) {
    const names = selectedCards.map(s => s.card.name).slice(0, 3).join(", ");
    const more = selectedCards.length > 3 ? "..." : "";
    selNameEl.textContent = `選択中: ${selectedCards.length}枚 (${names}${more})`;
  } else {
    selNameEl.textContent = "ドラッグで使用 / 複数選択可能";
  }

  state.myHand.forEach((card, idx) => {
    registerCard(card);
    const isSelected = state.selectedHandIndices.has(idx);
    const hasImg = !!card.imageUrl;
    const el = document.createElement("div");
    el.className = `card ${card.color} ${hasImg ? 'has-img' : ''} ${isSelected ? 'selected' : ''}`;
    if (hasImg) {
      el.setAttribute("style", `background-image: url('${card.imageUrl}');`);
    }
    el.dataset.index = idx;
    el.draggable = true;
    el.innerHTML = `
      <div class="card-top">
        <span class="name">${card.name}</span>
        ${card.hp ? `<span class="hp">HP${card.hp}</span>` : ''}
      </div>
      <div class="card-btm">
        <span>${card.sub || card.category || ''}</span>
      </div>
    `;

    // クリック・タップで選択（スマホモード時は即座に操作メニューを表示）
    el.onclick = () => {
      if (marqueeState.justFinished) return;
      if (Date.now() < (window._suppressHandClickUntil || 0)) return;
      if (isMobileMode()) {
        selectHandCardAndOpenMenu(idx);
      } else {
        toggleSelectHandCard(idx);
      }
    };

    el.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      showHandContextMenu(e, idx);
    };

    // ダブルクリック拡大表示（手札）
    el.ondblclick = (e) => {
      e.stopPropagation();
      openCardZoom(card);
    };

    // ドラッグ＆ドロップ（使用カードエリア・バトル場・ベンチへドラッグ）
    el.ondragstart = (e) => {
      // もし未選択ならこのカードを選択（DOM再描画するとドラッグがブラウザにより中断されるため、クラスのみ直接更新）
      if (!state.selectedHandIndices.has(idx)) {
        state.selectedHandIndices.clear();
        state.selectedHandIndices.add(idx);
        state.selectedHandIndex = idx;
        handEl.querySelectorAll(".card").forEach((cEl, cIdx) => {
          cEl.classList.toggle("selected", cIdx === idx);
        });
        updateSheetUI();
      }
      e.dataTransfer.setData("text/plain", idx.toString());
      e.dataTransfer.effectAllowed = "move";
      el.classList.add("dragging");
      state.draggedHandIndex = idx;
    };
    el.ondragend = () => {
      el.classList.remove("dragging");
      state.draggedHandIndex = -1;
    };

    handEl.appendChild(el);
  });
}

function renderPlayArea() {
  const areaEl = document.getElementById("play-area");
  const wrapEl = document.getElementById("play-card-wrap");
  const actionsEl = document.getElementById("play-actions");
  const btnStadium = document.getElementById("btn-play-stadium");

  // ドラッグ＆ドロップ イベント登録（常に受け入れ可能）
  areaEl.ondragover = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    areaEl.classList.add("drag-over");
  };
  areaEl.ondragleave = (e) => {
    if (!areaEl.contains(e.relatedTarget)) {
      areaEl.classList.remove("drag-over");
    }
  };
  areaEl.ondrop = (e) => {
    e.preventDefault();
    areaEl.classList.remove("drag-over");
    let handIdx = state.draggedHandIndex;
    const dataIdx = e.dataTransfer.getData("text/plain");
    if (dataIdx !== "" && !isNaN(parseInt(dataIdx, 10))) {
      handIdx = parseInt(dataIdx, 10);
    }
    if (handIdx >= 0 && handIdx < state.myHand.length) {
      playHandCardByIndex(handIdx);
    }
  };

  if (!state.playCard && !state.oppPlayCard) {
    // 空の状態：常時表示し、空枠を表示
    areaEl.classList.add("empty");
    areaEl.classList.remove("opp-playing");
    actionsEl.classList.add("hidden");
    wrapEl.innerHTML = `
      <div class="slot play-slot" title="手札からドラッグ＆ドロップしてカードを使用">
        手札使用枠<br><small style="font-size:10px; opacity:0.85;">(手札をドラッグ)</small>
      </div>
    `;
    // クリック・タップ操作対応（スマホ等のフォールバック）
    const slotEl = wrapEl.querySelector(".play-slot");
    if (slotEl) {
      slotEl.onclick = () => {
        if (state.selectedHandIndex >= 0 && state.selectedHandIndex < state.myHand.length) {
          playHandCardByIndex(state.selectedHandIndex);
        } else {
          showToast("手札カードをドラッグするか、選択してからここをクリックしてください");
        }
      };
    }
    return;
  }

  // 相手が使用したカードを表示中の場合（自分の使用カードがないとき）
  if (!state.playCard && state.oppPlayCard) {
    areaEl.classList.remove("empty");
    areaEl.classList.add("opp-playing");
    actionsEl.classList.add("hidden");
    registerCard(state.oppPlayCard);
    wrapEl.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
        <span style="font-size:10px; font-weight:bold; color:#fca5a5; background:rgba(127,29,29,0.85); padding:1px 8px; border-radius:10px; border:1px solid #f87171;">
          📢 ${escapeHtml(state.oppName)} が使用中
        </span>
        ${createCardHtml(state.oppPlayCard)}
      </div>
    `;
    const cardEl = wrapEl.querySelector(".card");
    if (cardEl) {
      cardEl.ondblclick = (e) => {
        e.stopPropagation();
        openCardZoom(state.oppPlayCard);
      };
    }
    return;
  }

  // 自分のカードがある状態：枠線確定・アクションボタン表示
  areaEl.classList.remove("empty");
  areaEl.classList.remove("opp-playing");
  actionsEl.classList.remove("hidden");
  registerCard(state.playCard);
  wrapEl.innerHTML = createCardHtml(state.playCard);
  const cardEl = wrapEl.querySelector(".card");
  if (cardEl) {
    cardEl.draggable = true;
    cardEl.ondragstart = (e) => {
      e.dataTransfer.setData("text/plain", "playCard");
      e.dataTransfer.effectAllowed = "move";
      cardEl.classList.add("dragging");
    };
    cardEl.ondragend = () => {
      cardEl.classList.remove("dragging");
    };
    cardEl.ondblclick = (e) => {
      e.stopPropagation();
      openCardZoom(state.playCard);
    };
  }

  // トレーナーズカードの場合に「スタジアムへ」ボタンを表示（3分類のため全トレーナーズで選択可能）
  if (state.playCard.type === "trainer" || state.playCard.type === "stadium") {
    btnStadium.classList.remove("hidden");
  } else {
    btnStadium.classList.add("hidden");
  }
}

function renderTemp() {
  const tempEl = document.getElementById("temp");
  const tempCardsEl = document.getElementById("temp-cards");
  if (state.tempCards.length === 0) {
    tempEl.classList.add("hidden");
    if (state.selectedTempIndices) state.selectedTempIndices.clear();
    return;
  }
  tempEl.classList.remove("hidden");
  tempCardsEl.innerHTML = "";

  if (!state.selectedTempIndices) state.selectedTempIndices = new Set();
  for (const idx of Array.from(state.selectedTempIndices)) {
    if (idx < 0 || idx >= state.tempCards.length) {
      state.selectedTempIndices.delete(idx);
    }
  }

  const selectedCount = state.selectedTempIndices.size;
  const isSelectedAny = selectedCount > 0;

  state.tempCards.forEach((c, idx) => {
    registerCard(c);
    const wrapper = document.createElement("div");
    const hasImg = !!c.imageUrl;
    const imgStyle = hasImg ? `style="background-image: url('${c.imageUrl}');"` : '';
    const isSelected = state.selectedTempIndices.has(idx);
    wrapper.innerHTML = `
      <div class="card ${c.color} ${hasImg ? 'has-img' : ''} ${isSelected ? 'selected' : ''}" ${imgStyle} title="クリックで選択/解除、ダブルクリックで拡大">
        ${isSelected ? '<div class="temp-selected-badge">✔ 選択中</div>' : ''}
        <div class="card-top"><span class="name">${escapeHtml(c.name)}</span></div>
        <div class="card-btm"><span>${escapeHtml(c.sub || c.category || '')}</span></div>
      </div>
    `;
    const cardEl = wrapper.firstElementChild;
    cardEl.onclick = (e) => {
      e.stopPropagation();
      if (typeof toggleSelectTempCard === "function") {
        toggleSelectTempCard(idx);
      }
    };
    cardEl.ondblclick = (e) => {
      e.stopPropagation();
      openCardZoom(c);
    };
    tempCardsEl.appendChild(cardEl);
  });

  const btnHand = tempEl.querySelector("[data-action='tempToHand']");
  const btnTop = tempEl.querySelector("[data-action='tempToTop']");
  const btnBottom = tempEl.querySelector("[data-action='tempToBottom']");
  const btnTrash = tempEl.querySelector("[data-action='tempToTrash']");

  const labelSuffix = isSelectedAny ? ` (${selectedCount}枚選択)` : ` (すべて)`;
  if (btnHand) btnHand.textContent = `手札に加える${labelSuffix}`;
  if (btnTop) btnTop.textContent = `山札の上に置く${labelSuffix}`;
  if (btnBottom) btnBottom.textContent = `山札の下に送る${labelSuffix}`;
  if (btnTrash) btnTrash.textContent = `トラッシュ${labelSuffix}`;

  const titleEl = tempEl.querySelector(".temp-side .title");
  if (titleEl) {
    titleEl.innerHTML = `テンポラリ <small style="font-size:9.5px; opacity:0.85; font-weight:normal;">(${state.tempCards.length}枚中${selectedCount}枚選択)</small>`;
  }
}

function updateStadiumAmbient(hasStadium) {
  const layer = document.getElementById("stadium-ambient-layer");
  const stadiumEl = document.getElementById("stadium");
  if (stadiumEl) {
    if (hasStadium) {
      stadiumEl.classList.add("has-stadium-glow");
    } else {
      stadiumEl.classList.remove("has-stadium-glow");
    }
  }

  if (!layer) return;

  if (hasStadium) {
    if (layer.classList.contains("hidden") || layer.children.length === 0) {
      layer.classList.remove("hidden");
      layer.innerHTML = "";
      // 生成する環境パーティクル（星屑・クリスタル光粒子）14個
      const count = 14;
      for (let i = 0; i < count; i++) {
        const p = document.createElement("div");
        p.className = "stadium-ambient-particle";
        p.style.left = `${Math.floor(Math.random() * 92) + 4}%`;
        p.style.top = `${Math.floor(Math.random() * 85) + 8}%`;
        p.style.animationDelay = `${(Math.random() * 3.5).toFixed(2)}s`;
        p.style.animationDuration = `${(3.5 + Math.random() * 2.5).toFixed(2)}s`;
        const size = Math.floor(Math.random() * 6) + 4;
        p.style.width = `${size}px`;
        p.style.height = `${size}px`;
        layer.appendChild(p);
      }
    }
  } else {
    layer.classList.add("hidden");
    layer.innerHTML = "";
  }
}

function renderStadium() {
  const el = document.getElementById("stadium");
  updateStadiumAmbient(!!state.stadium);

  // ドラッグ＆ドロップ受け入れ設定（手札カードおよび使用カードエリアからのドロップに対応）
  el.ondragover = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    el.classList.add("drag-over");
  };
  el.ondragleave = (e) => {
    if (!el.contains(e.relatedTarget)) {
      el.classList.remove("drag-over");
    }
  };
  el.ondrop = (e) => {
    e.preventDefault();
    el.classList.remove("drag-over");

    // 1. 使用中カードエリアからのドロップ
    const rawData = e.dataTransfer.getData("text/plain");
    if (rawData === "playCard" && state.playCard) {
      const card = state.playCard;
      state.playCard = null;
      if (typeof discardAndReplaceStadium === "function") {
        discardAndReplaceStadium(card, "使用枠");
      }
      return;
    }

    // 2. 手札からのドロップ
    let handIdx = state.draggedHandIndex;
    if (rawData !== "" && !isNaN(parseInt(rawData, 10))) {
      handIdx = parseInt(rawData, 10);
    }
    if (handIdx >= 0 && handIdx < state.myHand.length) {
      const card = state.myHand.splice(handIdx, 1)[0];
      state.selectedHandIndices.clear();
      state.draggedHandIndex = -1;
      if (typeof discardAndReplaceStadium === "function") {
        discardAndReplaceStadium(card, "手札");
      }
      return;
    }
  };

  if (state.stadium) {
    registerCard(state.stadium);
    const hasImg = !!state.stadium.imageUrl;
    const imgStyle = hasImg ? `style="background-image: url('${state.stadium.imageUrl}');"` : '';
    el.innerHTML = `
      <div class="card trainer ${hasImg ? 'has-img' : ''} clickable" ${imgStyle} title="クリックで操作メニュー / ダブルクリックで拡大">
        <div class="card-top"><span class="name">${state.stadium.name}</span></div>
        <div class="card-btm"><span>スタジアム</span></div>
      </div>
    `;
    const cardEl = el.querySelector(".card");
    if (cardEl) {
      cardEl.ondblclick = (e) => {
        e.stopPropagation();
        hideCtx();
        openCardZoom(state.stadium);
      };
    }
    el.onclick = (e) => {
      if (typeof showStadiumMenu === "function") {
        showStadiumMenu(e);
      }
    };
  } else {
    el.innerHTML = `<div class="slot" title="手札や使用中カードをドラッグ＆ドロップして配置">スタジアム<br><small style="font-size:9px; opacity:0.8;">(ドラッグ配置)</small></div>`;
    el.onclick = null;
  }
}

function getPokemonByLocation(loc) {
  if (loc === "active" || loc === "my-active") return state.myActive;
  if (loc.startsWith("bench_") || loc.startsWith("my-bench_")) {
    const idx = parseInt(loc.replace("bench_", "").replace("my-bench_", ""), 10);
    return state.myBench[idx];
  }
  if (loc === "opp-active") return state.oppActive;
  if (loc.startsWith("opp-bench_")) {
    const idx = parseInt(loc.replace("opp-bench_", ""), 10);
    return state.oppBench[idx];
  }
  return null;
}

function findPokemonByCardUid(uid) {
  if (!uid) return null;
  const matchesSlot = (slot) => {
    if (!slot || !slot.card) return false;
    if (slot.card.uid === uid) return true;
    if (Array.isArray(slot.previousStages) && slot.previousStages.some(c => c && c.uid === uid)) return true;
    return false;
  };

  if (matchesSlot(state.myActive)) return { pokemon: state.myActive, loc: "active" };
  for (let i = 0; i < state.myBench.length; i++) {
    const b = state.myBench[i];
    if (matchesSlot(b)) return { pokemon: b, loc: `bench_${i}` };
  }
  if (matchesSlot(state.oppActive)) return { pokemon: state.oppActive, loc: "opp-active" };
  for (let i = 0; i < state.oppBench.length; i++) {
    const b = state.oppBench[i];
    if (matchesSlot(b)) return { pokemon: b, loc: `opp-bench_${i}` };
  }
  return null;
}

function selectFieldPokemon(location, index) {
  if (state.selectedFieldPokemon && 
      state.selectedFieldPokemon.location === location && 
      state.selectedFieldPokemon.index === index) {
    state.selectedFieldPokemon = null; // 選択解除
  } else {
    state.selectedFieldPokemon = { location, index };
  }
  updateFieldSelectionUi();
}

function updateFieldSelectionUi() {
  document.querySelectorAll(".card.field-selected").forEach(el => el.classList.remove("field-selected"));
  if (!state.selectedFieldPokemon) return;
  const { location, index } = state.selectedFieldPokemon;
  let targetEl = null;
  if (location === "active") {
    targetEl = document.querySelector("#my-active .card");
  } else if (location === "bench") {
    const benchCards = document.querySelectorAll("#my-bench .card");
    targetEl = benchCards[index] || null;
  } else if (location === "opp-active") {
    targetEl = document.querySelector("#opp-active .card");
  } else if (location === "opp-bench") {
    const oppBenchCards = document.querySelectorAll("#opp-bench .card");
    targetEl = oppBenchCards[index] || null;
  }
  if (targetEl) {
    targetEl.classList.add("field-selected");
  }
}

window.selectFieldPokemon = selectFieldPokemon;
window.updateFieldSelectionUi = updateFieldSelectionUi;

function renderPokemonCardHtml(pokemon, location, extraClass = "") {
  if (!pokemon || !pokemon.card) return "";
  registerCard(pokemon.card);
  const card = pokemon.card;
  const damage = pokemon.damage || 0;

  let isFieldSelected = false;
  if (state.selectedFieldPokemon) {
    if (location === "active" && state.selectedFieldPokemon.location === "active") isFieldSelected = true;
    else if (location.startsWith("bench_") && state.selectedFieldPokemon.location === "bench" && state.selectedFieldPokemon.index === parseInt(location.replace("bench_", ""), 10)) isFieldSelected = true;
    else if (location === "opp-active" && state.selectedFieldPokemon.location === "opp-active") isFieldSelected = true;
    else if (location.startsWith("opp-bench_") && state.selectedFieldPokemon.location === "opp-bench" && state.selectedFieldPokemon.index === parseInt(location.replace("opp-bench_", ""), 10)) isFieldSelected = true;
  }
  const selClass = isFieldSelected ? " field-selected" : "";

  // ポケモンのどうぐ（カード上部に少しはみ出る）
  let toolHtml = "";
  if (pokemon.tool) {
    registerCard(pokemon.tool);
    toolHtml = `
      <div class="pokemon-tool-tab"
           title="ポケモンのどうぐ: ${pokemon.tool.name} (クリックでメニュー / ダブルクリックで拡大)"
           onclick="event.stopPropagation(); showToolMenu(event, '${location}')"
           ondblclick="event.stopPropagation(); window.openCardZoomByUid('${pokemon.tool.uid}')">
        <span class="tool-icon">🎒</span>
        <span class="tool-name">${pokemon.tool.name}</span>
      </div>
    `;
  }

  // ついているエネルギー（下部に小さな丸・色分け・ドラッグ移動・クリックメニュー）
  let energiesHtml = "";
  if (pokemon.energies && pokemon.energies.length > 0) {
    const badges = pokemon.energies.map((energy, eIdx) => {
      registerCard(energy);
      const info = getEnergyInfo(energy);
      return `
        <div class="energy-badge"
             data-location="${location}"
             data-energy-idx="${eIdx}"
             style="background:${info.bg}; border-color:${info.border};"
             title="${energy.name} (ドラッグで移動 / クリックでメニュー)"
             draggable="true"
             ondragstart="window.handleEnergyDragStart(event, '${location}', ${eIdx})"
             ondragend="window.handleEnergyDragEnd(event)"
             onclick="event.stopPropagation(); showEnergyMenu(event, '${location}', ${eIdx})">
          ${info.icon}
        </div>
      `;
    }).join("");
    energiesHtml = `<div class="card-energies">${badges}</div>`;
  }

  // バトル場ポケモンの特殊状態エフェクト＆バッジ描画
  let conditionFxHtml = "";
  let conditionBadgesHtml = "";
  let conditionCardClasses = "";
  const isActiveSpot = (location === "active" || location === "opp-active");
  if (isActiveSpot && pokemon.conditions) {
    const cond = pokemon.conditions;
    const badgeItems = [];
    const fxLayers = [];

    if (cond.poison) {
      conditionCardClasses += " is-poisoned";
      badgeItems.push(`<span class="cond-badge poison" title="どく状態">☠️どく</span>`);
      fxLayers.push(`
        <div class="cond-fx-layer cond-fx-poison">
          <span class="poison-bubble b1"></span>
          <span class="poison-bubble b2"></span>
          <span class="poison-bubble b3"></span>
          <span class="poison-bubble b4"></span>
          <span class="poison-bubble b5"></span>
        </div>
      `);
    }
    if (cond.burn) {
      conditionCardClasses += " is-burned";
      badgeItems.push(`<span class="cond-badge burn" title="やけど状態">🔥やけど</span>`);
      fxLayers.push(`
        <div class="cond-fx-layer cond-fx-burn">
          <span class="burn-flame f1">🔥</span>
          <span class="burn-flame f2">🔥</span>
          <span class="burn-flame f3">🔥</span>
        </div>
      `);
    }
    if (cond.special === "paralyzed") {
      conditionCardClasses += " is-paralyzed";
      badgeItems.push(`<span class="cond-badge paralyzed" title="まひ状態">⚡まひ</span>`);
      fxLayers.push(`
        <div class="cond-fx-layer cond-fx-paralyzed">
          <span class="paralyze-spark s1">⚡</span>
          <span class="paralyze-spark s2">⚡</span>
          <span class="paralyze-spark s3">⚡</span>
        </div>
      `);
    } else if (cond.special === "confused") {
      conditionCardClasses += " is-confused";
      badgeItems.push(`<span class="cond-badge confused" title="こんらん状態">😵こんらん</span>`);
      fxLayers.push(`
        <div class="cond-fx-layer cond-fx-confused">
          <div class="confuse-orbit">
            <span class="orbit-item o1">💫</span>
            <span class="orbit-item o2">🌀</span>
            <span class="orbit-item o3">⭐</span>
          </div>
        </div>
      `);
    } else if (cond.special === "asleep") {
      conditionCardClasses += " is-asleep";
      badgeItems.push(`<span class="cond-badge asleep" title="ねむり状態">💤ねむり</span>`);
      fxLayers.push(`
        <div class="cond-fx-layer cond-fx-asleep">
          <span class="sleep-z z1">Z</span>
          <span class="sleep-z z2">z</span>
          <span class="sleep-z z3">z</span>
        </div>
      `);
    }

    if (fxLayers.length > 0) {
      conditionFxHtml = fxLayers.join("");
    }
    if (badgeItems.length > 0) {
      conditionBadgesHtml = `<div class="card-conditions">${badgeItems.join("")}</div>`;
    }
  }

  const hasImg = !!card.imageUrl;
  const imgStyle = hasImg ? `style="background-image: url('${card.imageUrl}');"` : '';
  const imgClass = hasImg ? 'has-img' : '';

  return `
    <div class="card ${card.color} ${imgClass} ${extraClass}${conditionCardClasses}${selClass}"
         ${imgStyle}
         data-location="${location}"
         ondragover="window.handlePokemonDragOver(event)"
         ondragleave="window.handlePokemonDragLeave(event)"
         ondrop="window.handlePokemonDrop(event, '${location}')"
         ondblclick="event.stopPropagation(); hideCtx(); openCardZoomByUid('${card.uid}')">
      ${toolHtml}
      ${conditionFxHtml}
      ${conditionBadgesHtml}
      ${pokemon.abilityUsed ? '<div class="ability-used-badge" title="特性使用済">済</div>' : ''}
      <div class="card-top">
        <span class="name">${card.name}</span>
        ${card.hp ? `<span class="hp">HP${card.hp}</span>` : ''}
      </div>
      <div class="card-btm">
        <span>${card.category || card.sub || ''}</span>
      </div>
      ${damage > 0 ? `<div class="dmg">${damage}</div>` : ''}
      ${energiesHtml}
    </div>
  `;
}

window.handleEnergyDragStart = function(e, location, energyIdx) {
  e.stopPropagation();
  state.draggedEnergy = { location: location, energyIndex: energyIdx };
  state.draggedHandIndex = -1;
  e.dataTransfer.setData("text/plain", `energy:${location}:${energyIdx}`);
  e.dataTransfer.effectAllowed = "move";
  if (e.target) e.target.classList.add("dragging");
};

window.handleEnergyDragEnd = function(e) {
  if (e.target) e.target.classList.remove("dragging");
  state.draggedEnergy = null;
  document.querySelectorAll(".drag-target").forEach(el => el.classList.remove("drag-target"));
};

window.handlePokemonDragOver = function(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const el = e.currentTarget;
  if (el && !el.classList.contains("drag-target")) {
    el.classList.add("drag-target");
  }
};

window.handlePokemonDragLeave = function(e) {
  if (e.currentTarget && !e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove("drag-target");
  }
};

window.handlePokemonDrop = function(e, location) {
  if (e) {
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    if (e.currentTarget) e.currentTarget.classList.remove("drag-target");
  }

  const dst = getPokemonByLocation(location);
  if (!dst) return;

  // 1. エネルギー移動
  if (state.draggedEnergy) {
    moveEnergyBetweenPokemon(state.draggedEnergy.location, state.draggedEnergy.energyIndex, location);
    state.draggedEnergy = null;
    return;
  }

  // 2. 手札カードからのドロップ
  let handIdx = state.draggedHandIndex;
  if (e && e.dataTransfer) {
    const rawData = e.dataTransfer.getData("text/plain");
    if (rawData && !rawData.startsWith("energy:") && !isNaN(parseInt(rawData, 10))) {
      handIdx = parseInt(rawData, 10);
    }
  }

  if (handIdx >= 0 && handIdx < state.myHand.length) {
    attachHandCardToPokemon(handIdx, location);
  }
};

window.showEnergyMenu = function(e, location, energyIndex) {
  e.stopPropagation();
  hideCtx();
  const pokemon = getPokemonByLocation(location);
  if (!pokemon || !pokemon.energies[energyIndex]) return;
  const energy = pokemon.energies[energyIndex];
  const info = getEnergyInfo(energy);

  const ctx = document.getElementById("ctx");
  ctx.innerHTML = `
    <div style="font-size:12px; font-weight:bold; color:#facc15; padding:4px 8px; display:flex; align-items:center; gap:6px;">
      <span style="font-size:14px;">${info.icon}</span> ${energy.name}
    </div>
    <div style="font-size:10px; color:#94a3b8; padding:0 8px 4px;">対象: ${pokemon.card.name}</div>
    <div class="divider"></div>
    <button onclick="detachEnergy('${location}', ${energyIndex}, 'trash')">🗑️ トラッシュする</button>
    <button onclick="detachEnergy('${location}', ${energyIndex}, 'hand')">🖐️ 手札に戻す</button>
    <button onclick="detachEnergy('${location}', ${energyIndex}, 'deck')">📦 山に戻す</button>
  `;
  ctx.style.left = `${Math.min(e.clientX, window.innerWidth - 180)}px`;
  ctx.style.top = `${Math.min(e.clientY, window.innerHeight - 200)}px`;
  ctx.classList.remove("hidden");
};

window.detachEnergy = function(location, energyIndex, destination) {
  hideCtx();
  const pokemon = getPokemonByLocation(location);
  if (!pokemon || !pokemon.energies[energyIndex]) return;
  const energy = pokemon.energies.splice(energyIndex, 1)[0];

  if (destination === "trash") {
    state.myTrash.push(energy);
    addLog(`「${pokemon.card.name}」から「${energy.name}」をトラッシュしました`, {
      cards: [energy],
      badge: "🗑️ エネルギートラッシュ"
    });
    showToast(`トラッシュ: ${energy.name}`);
  } else if (destination === "hand") {
    state.myHand.push(energy);
    addLog(`「${pokemon.card.name}」から「${energy.name}」を手札に戻しました`, {
      cards: [energy],
      badge: "🖐️ エネルギーを手札へ"
    });
    showToast(`手札へ: ${energy.name}`);
  } else if (destination === "deck") {
    state.myDeck.push(energy);
    addLog(`「${pokemon.card.name}」から「${energy.name}」を山札の下に戻しました`, {
      cards: [energy],
      badge: "⬇️ エネルギーを山札へ"
    });
    showToast(`山札へ: ${energy.name}`);
  }
  renderAll();
};

window.showToolMenu = function(e, location) {
  e.stopPropagation();
  hideCtx();
  const pokemon = getPokemonByLocation(location);
  if (!pokemon || !pokemon.tool) return;
  const tool = pokemon.tool;

  const ctx = document.getElementById("ctx");
  ctx.innerHTML = `
    <div style="font-size:12px; font-weight:bold; color:#38bdf8; padding:4px 8px; display:flex; align-items:center; gap:6px;">
      <span style="font-size:14px;">🎒</span> ${tool.name}
    </div>
    <div style="font-size:10px; color:#94a3b8; padding:0 8px 4px;">対象: ${pokemon.card.name}</div>
    <div class="divider"></div>
    <button onclick="openCardZoomByUid('${tool.uid}')">🔍 どうぐを拡大表示</button>
    <button onclick="detachTool('${location}', 'trash')">🗑️ トラッシュする</button>
    <button onclick="detachTool('${location}', 'hand')">🖐️ 手札に戻す</button>
    <button onclick="detachTool('${location}', 'lost')">🌀 ロストゾーンへ</button>
  `;
  ctx.style.left = `${Math.min(e.clientX, window.innerWidth - 180)}px`;
  ctx.style.top = `${Math.min(e.clientY, window.innerHeight - 220)}px`;
  ctx.classList.remove("hidden");
};

window.detachTool = function(location, destination) {
  hideCtx();
  const pokemon = getPokemonByLocation(location);
  if (!pokemon || !pokemon.tool) return;
  const tool = pokemon.tool;
  pokemon.tool = null;

  if (destination === "trash") {
    state.myTrash.push(tool);
    addLog(`「${pokemon.card.name}」から「${tool.name}」をトラッシュしました`, {
      cards: [tool],
      badge: "🗑️ どうぐトラッシュ"
    });
    showToast(`トラッシュ: ${tool.name}`);
  } else if (destination === "hand") {
    state.myHand.push(tool);
    addLog(`「${pokemon.card.name}」から「${tool.name}」を手札に戻しました`, {
      cards: [tool],
      badge: "🖐️ どうぐを手札へ"
    });
    showToast(`手札へ: ${tool.name}`);
  } else if (destination === "lost") {
    state.myLost.push(tool);
    addLog(`「${pokemon.card.name}」から「${tool.name}」をロストゾーンへ送りました`, {
      cards: [tool],
      badge: "🌀 どうぐをロストへ"
    });
    showToast(`ロストへ: ${tool.name}`);
  }
  renderAll();
};

function createCardHtml(card, damage = 0, extraClass = "") {
  registerCard(card);
  const hasImg = !!card.imageUrl;
  const imgStyle = hasImg ? `style="background-image: url('${card.imageUrl}');"` : '';
  const imgClass = hasImg ? 'has-img' : '';
  return `
    <div class="card ${card.color} ${imgClass} ${extraClass}" ${imgStyle} ondblclick="event.stopPropagation(); window.openCardZoomByUid('${card.uid || ''}')">
      <div class="card-top">
        <span class="name">${card.name}</span>
        ${card.hp ? `<span class="hp">HP${card.hp}</span>` : ''}
      </div>
      <div class="card-btm">
        <span>${card.category || card.sub || ''}</span>
      </div>
      ${damage > 0 ? `<div class="dmg">${damage}</div>` : ''}
    </div>
  `;
}

// スマホ（縦画面・小画面・タッチデバイス）判定ヘルパー
function isMobileMode() {
  return window.innerWidth <= 768 || 
         window.matchMedia("(orientation: portrait)").matches ||
         ('ontouchstart' in window && window.innerWidth <= 1024);
}

// スマホモード：手札タップ時に選択して即座に操作シートを開く
function selectHandCardAndOpenMenu(idx) {
  if (idx < 0 || idx >= state.myHand.length) return;
  state.selectedHandIndices.clear();
  state.selectedHandIndices.add(idx);
  state.selectedHandIndex = idx;
  renderHand();
  actions.openMenu();
}

function updateSheetUI() {
  const selEl = document.getElementById("sheet-sel");
  const deckEl = document.getElementById("sheet-deck");
  const handBodyEl = document.getElementById("sheet-hand-body");

  const selectedCards = getSelectedHandCards();

  if (selEl) {
    if (selectedCards.length === 1) {
      selEl.textContent = `選択中: ${selectedCards[0].card.name}`;
    } else if (selectedCards.length > 1) {
      selEl.textContent = `選択中: ${selectedCards.length}枚`;
    } else {
      selEl.textContent = "未選択";
    }
  }

  if (deckEl) {
    deckEl.textContent = `残り ${state.myDeck.length} 枚`;
  }

  if (!handBodyEl) return;

  // 1. 単一カード選択中：カードに応じた専用アクションメニュー（3分類: ポケモン / トレーナーズ / エネルギー）
  if (selectedCards.length === 1) {
    const { index: handIdx, card } = selectedCards[0];
    const isPokemon = card.type === "pokemon";
    const isEnergy = card.type === "energy";
    const isTrainer = card.type === "trainer" || card.type === "stadium";

    // エネルギー付与先ボタン（バトル場 ＆ ベンチ）
    let targetButtons = "";
    if (state.myActive) {
      targetButtons += `<button class="btn gold sub-target" onclick="attachHandCardToPokemon(${handIdx}, 'active'); closeMenu();">⚡ バトル場へ (${state.myActive.card.name})</button>`;
    }
    state.myBench.forEach((b, bIdx) => {
      if (b) {
        targetButtons += `<button class="btn gold sub-target" onclick="attachHandCardToPokemon(${handIdx}, 'bench_${bIdx}'); closeMenu();">⚡ ベンチ${bIdx + 1}へ (${b.card.name})</button>`;
      }
    });

    // どうぐ装備先ボタン（トレーナーズはポケモンのどうぐとしてポケモンにつけることも可能）
    let toolButtons = "";
    if (state.myActive) {
      toolButtons += `<button class="btn blue sub-target" onclick="attachHandCardToPokemon(${handIdx}, 'active'); closeMenu();">🎒 バトル場へ (${state.myActive.card.name})</button>`;
    }
    state.myBench.forEach((b, bIdx) => {
      if (b) {
        toolButtons += `<button class="btn blue sub-target" onclick="attachHandCardToPokemon(${handIdx}, 'bench_${bIdx}'); closeMenu();">🎒 ベンチ${bIdx + 1}へ (${b.card.name})</button>`;
      }
    });

    handBodyEl.innerHTML = `
      <div class="sheet-card-preview selected-banner ${card.color}">
        <div>
          <span class="sheet-card-name">${card.name}</span>
          <span class="sheet-card-sub">${card.category || card.sub || ''}</span>
        </div>
      </div>

      <div class="grid">
        <button class="btn green wide" onclick="playHandCardByIndex(${handIdx}); closeMenu();">🃏 使用カードエリアへ (使う)</button>
        ${!state.myActive && isPokemon ? `<button class="btn blue wide" onclick="placeHandCardToActive(${handIdx}); closeMenu();">⚔️ バトル場に出す</button>` : ''}
        ${isPokemon ? `<button class="btn blue wide" onclick="placeHandCardToFirstEmptyBench(${handIdx}); closeMenu();">🪑 ベンチに出す</button>` : ''}
        ${isTrainer ? `<button class="btn purple wide" onclick="placeHandCardToStadium(${handIdx}); closeMenu();">🏟️ スタジアムとして場に出す</button>` : ''}
        ${isEnergy && targetButtons ? `<div style="grid-column:span 2; margin-top:4px;"><small style="color:#ffd84a; font-weight:bold;">⚡ エネルギーをつける対象:</small><div class="grid" style="margin-top:4px;">${targetButtons}</div></div>` : ''}
        ${isTrainer && toolButtons ? `<div style="grid-column:span 2; margin-top:4px;"><small style="color:#60a5fa; font-weight:bold;">🎒 ポケモンのどうぐとしてつける対象:</small><div class="grid" style="margin-top:4px;">${toolButtons}</div></div>` : ''}
        ${isPokemon && targetButtons ? `<div style="grid-column:span 2; margin-top:4px;"><small style="color:#94a3b8;">🔄 重ねて進化させる対象:</small><div class="grid" style="margin-top:4px;">${targetButtons}</div></div>` : ''}
        <button class="btn red" onclick="trashHandCardByIndex(${handIdx}); closeMenu();">🗑️ トラッシュする</button>
        <button class="btn purple" onclick="lostHandCardByIndex(${handIdx}); closeMenu();">🌌 ロストへ送る</button>
        <button class="btn" onclick="moveHandCardToDeckTop(${handIdx}); closeMenu();">🔄 山札の上に戻す</button>
        <button class="btn" onclick="moveHandCardToDeckBottom(${handIdx}); closeMenu();">⬇️ 山札の下に戻す</button>
        <button class="btn wide" onclick="closeMenu(); openCardZoomByUid('${card.uid}');">🔍 カードを拡大表示</button>
        <button class="btn wide" onclick="clearHandSelection(); closeMenu();">✖️ 選択解除して閉じる</button>
      </div>
    `;
  }
  // 2. 複数カード選択中：一括アクションメニュー
  else if (selectedCards.length > 1) {
    const count = selectedCards.length;
    handBodyEl.innerHTML = `
      <div class="sheet-card-preview selected-banner">
        <div>
          <span class="sheet-card-name">複数選択: ${count}枚</span>
          <span class="sheet-card-sub">${selectedCards.map(s => s.card.name).slice(0, 3).join(", ")}${count > 3 ? '...' : ''}</span>
        </div>
      </div>
      <div class="grid">
        ${!state.myActive ? `<button class="btn blue wide" onclick="placeSelectedHandToActive(); closeMenu();">⚔️ 選択したポケモンをバトル場に出す</button>` : ''}
        <button class="btn blue wide" onclick="placeSelectedHandToBench(); closeMenu();">🪑 選択したポケモンをベンチに出す</button>
        <button class="btn red" onclick="trashSelectedHandCards(); closeMenu();">🗑️ ${count}枚トラッシュ</button>
        <button class="btn purple" onclick="lostSelectedHandCards(); closeMenu();">🌌 ${count}枚ロストへ</button>
        <button class="btn" onclick="moveSelectedHandCardsToDeckTop(); closeMenu();">🔄 ${count}枚山札の上に戻す</button>
        <button class="btn" onclick="moveSelectedHandCardsToDeckBottom(); closeMenu();">⬇️ ${count}枚山札の下に戻す</button>
        <button class="btn wide" onclick="clearHandSelection(); closeMenu();">✖️ 選択解除して閉じる</button>
      </div>
    `;
  }
  // 3. 未選択状態：案内と基本手札操作
  else {
    let soloHandBtn = "";
    if (state.isSoloMode && !state.isSetupPhase) {
      soloHandBtn = `<button class="btn purple wide" onclick="closeMenu(); showSoloOpponentHandMenu();">🎴 相手手札干渉メニュー</button>`;
    }
    handBodyEl.innerHTML = `
      <div class="sheet-empty-hint">
        💡 手札のカードをタップすると、カードに応じたアクション（使う・場に出す・エネルギー付与など）がここに表示されます。
      </div>
    `;
  }

  const handCountEl = document.getElementById("sheet-hand-count");
  if (handCountEl) handCountEl.textContent = `${state.myHand.length}枚`;
  const trashCountEl = document.getElementById("sheet-trash-count");
  if (trashCountEl) trashCountEl.textContent = `${state.myTrash.length}枚`;
  const sideCountEl = document.getElementById("sheet-side-count");
  if (sideCountEl) sideCountEl.textContent = `残り${state.myPrizes.length}枚`;
  const btnSoloHand = document.getElementById("btn-sp-solo-hand");
  if (btnSoloHand) {
    btnSoloHand.classList.toggle("hidden", !(state.isSoloMode && !state.isSetupPhase));
  }
}

/**
 * 手札カードのPC用右クリックコンテキストメニュー（見切れ対策＆種判定なしで配置可能）
 */
function showHandContextMenu(e, handIdx) {
  if (e && e.preventDefault) e.preventDefault();
  if (e && e.stopPropagation) e.stopPropagation();

  if (state.mustPromoteToActive) {
    showToast("⚠️ バトル場に出すベンチポケモンを選択してください");
    return;
  }

  const card = state.myHand[handIdx];
  if (!card) return;

  // 選択状態の更新（該当カードを選択）
  if (!state.selectedHandIndices.has(handIdx)) {
    state.selectedHandIndices.clear();
    state.selectedHandIndices.add(handIdx);
    state.selectedHandIndex = handIdx;
  }
  const handEl = document.getElementById("hand");
  if (handEl) {
    handEl.querySelectorAll(".card").forEach((cEl, i) => {
      cEl.classList.toggle("selected", state.selectedHandIndices.has(i));
    });
  }
  updateSheetUI();

  const ctx = document.getElementById("ctx");
  if (!ctx) return;
  ctx.classList.add("ctx-wide");

  const isPokemon = card.type === "pokemon";
  const isEnergy = card.type === "energy";
  const isTrainer = card.type === "trainer" || card.type === "stadium";

  // 付与先ボタン（エネルギーまたはポケモンのどうぐ）
  let attachButtons = "";
  if (state.myActive) {
    const actName = state.myActive.card.name;
    const actFullName = `バトル場: ${actName} (HP${state.myActive.card.hp || '-'})`;
    attachButtons += `<button class="ctx-sub-target" data-fullname="${escapeHtml(actFullName)}" title="${escapeHtml(actFullName)}" onclick="hideCtx(); attachHandCardToPokemon(${handIdx}, 'active');"><span class="target-tag">⚡/🎒 バトル場:</span> <span class="target-name">${escapeHtml(actName)}</span></button>`;
  }
  state.myBench.forEach((b, bIdx) => {
    if (b) {
      const bName = b.card.name;
      const bFullName = `ベンチ${bIdx + 1}: ${bName} (HP${b.card.hp || '-'})`;
      attachButtons += `<button class="ctx-sub-target" data-fullname="${escapeHtml(bFullName)}" title="${escapeHtml(bFullName)}" onclick="hideCtx(); attachHandCardToPokemon(${handIdx}, 'bench_${bIdx}');"><span class="target-tag">⚡/🎒 ベンチ${bIdx + 1}:</span> <span class="target-name">${escapeHtml(bName)}</span></button>`;
    }
  });

  // 進化先ボタン（ポケモンの場合）
  let evolveButtons = "";
  if (isPokemon) {
    if (state.myActive) {
      const actName = state.myActive.card.name;
      const actFullName = `バトル場: ${actName} (HP${state.myActive.card.hp || '-'})`;
      evolveButtons += `<button class="ctx-sub-target" data-fullname="${escapeHtml(actFullName)}" title="${escapeHtml(actFullName)}" onclick="hideCtx(); attachHandCardToPokemon(${handIdx}, 'active');"><span class="target-tag">✨ バトル場:</span> <span class="target-name">${escapeHtml(actName)}</span></button>`;
    }
    state.myBench.forEach((b, bIdx) => {
      if (b) {
        const bName = b.card.name;
        const bFullName = `ベンチ${bIdx + 1}: ${bName} (HP${b.card.hp || '-'})`;
        evolveButtons += `<button class="ctx-sub-target" data-fullname="${escapeHtml(bFullName)}" title="${escapeHtml(bFullName)}" onclick="hideCtx(); attachHandCardToPokemon(${handIdx}, 'bench_${bIdx}');"><span class="target-tag">✨ ベンチ${bIdx + 1}:</span> <span class="target-name">${escapeHtml(bName)}</span></button>`;
      }
    });
  }

  ctx.innerHTML = `
    <div class="ctx-header-row">
      <span class="ctx-title-text">${escapeHtml(card.name)} <small>(${escapeHtml(card.category || card.sub || '')})</small></span>
      <button class="ctx-zoom-btn" onclick="hideCtx(); openCardZoomByUid('${card.uid}')">🔍 拡大</button>
    </div>
    <div class="divider"></div>
    <div class="ctx-grid-2col">
      <button class="ctx-span-2" style="background:#16a34a; color:#fff; font-weight:bold; font-size:13px; padding:7px 10px;" onclick="hideCtx(); playHandCardByIndex(${handIdx});">📢 使用する</button>
      <button onclick="hideCtx(); placeHandCardToActive(${handIdx});">⚔️ バトル場に出す</button>
      <button onclick="hideCtx(); placeHandCardToFirstEmptyBench(${handIdx});">🪑 ベンチに出す</button>
      ${isTrainer ? `<button class="ctx-span-2" onclick="hideCtx(); placeHandCardToStadium(${handIdx});">🏟️ スタジアムとして場に出す</button>` : ''}
    </div>
    ${evolveButtons ? `
      <div class="divider"></div>
      <div style="font-size:11px; color:#cbd5e1; margin-bottom:4px; font-weight:bold;">✨ 重ねて進化させる対象:</div>
      <div class="ctx-grid-targets">${evolveButtons}</div>
    ` : ''}
    ${(isEnergy || isTrainer) && attachButtons ? `
      <div class="divider"></div>
      <div style="font-size:11px; color:#cbd5e1; margin-bottom:4px; font-weight:bold;">⚡/🎒 ポケモンにつける対象:</div>
      <div class="ctx-grid-targets">${attachButtons}</div>
    ` : ''}
    <div class="divider"></div>
    <div class="ctx-grid-2col">
      <button onclick="hideCtx(); trashHandCardByIndex(${handIdx});">🗑️ トラッシュ</button>
      <button onclick="hideCtx(); lostHandCardByIndex(${handIdx});">🌌 ロストゾーン</button>
      <button onclick="hideCtx(); moveHandCardToDeckTop(${handIdx});">🔄 山札の上</button>
      <button onclick="hideCtx(); moveHandCardToDeckBottom(${handIdx});">⬇️ 山札の下</button>
    </div>
  `;

  // 位置調整（画面端見切れ対策・下端オーバー時は上方向に反転展開）
  ctx.style.visibility = "hidden";
  ctx.classList.remove("hidden");
  const menuW = ctx.offsetWidth || 280;
  const menuH = ctx.offsetHeight || 280;
  let posX = (e && e.clientX !== undefined) ? e.clientX + 10 : window.innerWidth / 2 - 140;
  let posY = (e && e.clientY !== undefined) ? e.clientY + 10 : window.innerHeight - 300;

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

window.showHandContextMenu = showHandContextMenu;



