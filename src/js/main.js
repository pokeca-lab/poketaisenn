/* 【エントリ】初期化・イベント登録・アクション定義 */

// =============================================================================
// 初期化 ＆ ロビー処理
// =============================================================================
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  initLobbyDefaults();
});

function initLobbyDefaults() {
  document.getElementById("in-name").value = "プレイヤーA";
  document.getElementById("in-deck").value = "DEMO-CHARIZARD-2026";
  // デッキ初期プレビュー
  state.myLoadedDeck = SAMPLE_DECK;
  state.soloDeckA = SAMPLE_DECK;
  state.soloDeckB = SAMPLE_DECK_B;
  renderDeckPreview(SAMPLE_DECK, "deck-preview");
  renderDeckPreview(SAMPLE_DECK, "deck-preview-a");
  renderDeckPreview(SAMPLE_DECK_B, "deck-preview-b");
  
  const btnStart = document.getElementById("btn-start");
  if (btnStart) {
    btnStart.disabled = true;
    btnStart.textContent = "相手の接続待ち...";
    btnStart.classList.remove("green");
    btnStart.classList.add("gold");
  }

  // プレイマット初期化＆描画
  initPlaymats();

  // スリーブ初期化＆描画
  if (typeof initSleeves === "function") {
    initSleeves();
    renderSleeves();
  }

  // 自動トラッシュ機能（デフォルトON、localStorage保存）
  try {
    const savedAutoTrash = localStorage.getItem("pokeca_auto_trash");
    if (savedAutoTrash !== null) {
      state.autoTrashEnabled = (savedAutoTrash === "1");
    } else {
      state.autoTrashEnabled = true; // デフォルトON
    }
  } catch (e) {
    state.autoTrashEnabled = true;
  }
  const chkOnline = document.getElementById("chk-auto-trash");
  if (chkOnline) chkOnline.checked = !!state.autoTrashEnabled;
  const chkSolo = document.getElementById("chk-auto-trash-solo");
  if (chkSolo) chkSolo.checked = !!state.autoTrashEnabled;

  // 一人回し再開データの確認
  checkSoloResumeBanner();

  if (location.hash.includes("solo")) {
    switchLobbyMode("solo");
    startSoloBattleSetup();
  } else if (location.hash.includes("battle")) {
    startBattleSetup();
    if (location.hash.includes("test-play")) {
      state.selectedHandIndex = 0;
      moveSelectedHandToPlayArea();
    } else if (location.hash.includes("test-zoom")) {
      openCardZoom(state.myActive.card);
    } else if (location.hash.includes("test-deck")) {
      showDeckModal();
    }
  } else {
    // 初回アクセス時の操作案内ポップアップ（ロビー初期表示時）
    openWelcomeGuideModal(false);
  }
}

function setupEventListeners() {
  // バトル場不在による出撃選択中の操作ロック（モーダル外の全クリック・右クリックを抑止）
  document.addEventListener("click", (e) => {
    if (state.mustPromoteToActive) {
      if (e.target.closest("#modal") || e.target.closest("[data-action='exit']")) return;
      e.stopPropagation();
      e.preventDefault();
      showToast("⚠️ バトル場に出すベンチポケモンを選択してください");
    }
  }, true);

  document.addEventListener("contextmenu", (e) => {
    if (state.mustPromoteToActive) {
      if (e.target.closest("#modal")) return;
      e.stopPropagation();
      e.preventDefault();
      showToast("⚠️ バトル場に出すベンチポケモンを選択してください");
    }
  }, true);

  // data-action 属性によるイベント委任
  document.body.addEventListener("click", (e) => {
    const target = e.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    const arg = target.dataset.arg;
    const shouldClose = target.dataset.close;

    if (state.mustPromoteToActive && action !== "exit") {
      showToast("⚠️ バトル場に出すベンチポケモンを選択してください");
      return;
    }

    if (shouldClose) {
      closeMenu();
    }

    if (typeof actions[action] === "function") {
      actions[action](arg, target);
    }
  });

  // モーダル背景クリックで閉じる（必須ダイアログ指定時は背景クリックで閉じない）
  document.getElementById("modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") {
      if (e.target.dataset.noBackdropClose === "true") return;
      closeModal();
    }
  });

  // ブラウザがアクティブ（フォーカス）に復帰した際、相手のマリガン確認待ちがあれば自動で再表示
  window.addEventListener("focus", () => {
    if (Array.isArray(state.pendingOppMulliganQueue) && state.pendingOppMulliganQueue.length > 0) {
      const modalEl = document.getElementById("modal");
      if (modalEl && modalEl.classList.contains("hidden")) {
        if (typeof showNextOpponentMulliganModal === "function") {
          showNextOpponentMulliganModal();
        }
      }
    }
  });

  // コンテキストメニュー外クリックで閉じる
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#ctx") && !e.target.closest(".card") && !e.target.closest("#my-prizes")) {
      hideCtx();
    }
  });

  // 手札カードの範囲ドラッグ選択を初期化
  initMarqueeSelection();

  // スマホ・タッチ操作用ドラッグ＆ドロップを初期化
  initTouchDragEngine();

  // CSVインポート用ファイル選択イベント
  const fileInput = document.getElementById("csv-file-input");
  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        importMatchCsv(file);
      }
      fileInput.value = "";
    });
  }

  // プレイマット自作画像アップロードイベント
  const matFileInput = document.getElementById("mat-file-input");
  if (matFileInput) {
    matFileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        handleCustomPlaymatUpload(file);
      }
      matFileInput.value = "";
    });
  }

  // スリーブ自作画像アップロードイベント
  const sleeveFileInput = document.getElementById("sleeve-file-input");
  if (sleeveFileInput) {
    sleeveFileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        handleSleeveFileUpload(file);
      }
      sleeveFileInput.value = "";
    });
  }

  // 自動トラッシュ機能のON/OFF切り替えイベント（オンライン・一人回しで連動）
  const syncAutoTrashToggle = (checked) => {
    state.autoTrashEnabled = !!checked;
    try {
      localStorage.setItem("pokeca_auto_trash", state.autoTrashEnabled ? "1" : "0");
    } catch (err) {}
    const c1 = document.getElementById("chk-auto-trash");
    const c2 = document.getElementById("chk-auto-trash-solo");
    if (c1) c1.checked = state.autoTrashEnabled;
    if (c2) c2.checked = state.autoTrashEnabled;
  };

  const chk1 = document.getElementById("chk-auto-trash");
  if (chk1) {
    chk1.addEventListener("change", (e) => syncAutoTrashToggle(e.target.checked));
  }
  const chk2 = document.getElementById("chk-auto-trash-solo");
  if (chk2) {
    chk2.addEventListener("change", (e) => syncAutoTrashToggle(e.target.checked));
  }

  // リプレイスライダー
  const replaySlider = document.getElementById("replay-slider");
  if (replaySlider) {
    replaySlider.addEventListener("input", (e) => {
      jumpToReplayStep(parseInt(e.target.value, 10));
    });
  }

  // ルーム番号入力欄でEnterキー押下時の参加
  const inRoom = document.getElementById("in-room");
  if (inRoom) {
    inRoom.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        actions.joinRoom();
      }
    });
  }

  // P2Pテストメッセージ入力欄でEnterキー押下時の送信
  const inTestMsg = document.getElementById("in-test-msg");
  if (inTestMsg) {
    inTestMsg.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        actions.sendTestMsg();
      }
    });
  }

  // デッキコード入力欄でEnterキー押下時の自動読込
  [
    { id: "in-deck", fn: () => actions.loadDeck() },
    { id: "in-deck-a", fn: () => actions.loadSoloDeckA() },
    { id: "in-deck-b", fn: () => actions.loadSoloDeckB() }
  ].forEach(item => {
    const el = document.getElementById(item.id);
    if (el) {
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          item.fn();
        }
      });
    }
  });

  // 対戦中のページ離脱（F5・閉じる・戻る）防止アラート
  window.addEventListener("beforeunload", (e) => {
    const isGameActive = document.getElementById("game") && !document.getElementById("game").classList.contains("hidden");
    if (isGameActive && !window._isExitingToLobby) {
      e.preventDefault();
      e.returnValue = "";
      return "";
    }
  });

  // キーボードショートカット（F5、Ctrl+R、Cmd+R）誤打防止
  window.addEventListener("keydown", (e) => {
    const isReloadKey = e.key === "F5" || ((e.ctrlKey || e.metaKey) && (e.key === "r" || e.key === "R"));
    if (isReloadKey) {
      const isGameActive = document.getElementById("game") && !document.getElementById("game").classList.contains("hidden");
      if (isGameActive) {
        e.preventDefault();
        const msg = state.isSoloMode
          ? "⚠️ 画面を更新すると対戦が中断されます（セーブデータから再開は可能です）。\n本当にページを再読み込みしますか？"
          : "⚠️ 画面を更新するとオンライン対戦が切断されます。\n本当にページを再読み込みしますか？";
        if (confirm(msg)) {
          window._isExitingToLobby = true;
          location.reload();
        }
      }
    }
  });
}

// =============================================================================
// アクション一覧 (data-action ハンドラー)
// =============================================================================
const actions = {
  // ロビー
  lobbyTab: (tab) => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelector(`[data-arg="${tab}"]`).classList.add("active");
    if (tab === "create") {
      document.getElementById("tab-create").classList.remove("hidden");
      document.getElementById("tab-join").classList.add("hidden");
    } else {
      document.getElementById("tab-create").classList.add("hidden");
      document.getElementById("tab-join").classList.remove("hidden");
    }
    const startBtn = document.getElementById("btn-start");
    if (startBtn && !P2P.connected) {
      startBtn.disabled = true;
      startBtn.textContent = "相手の接続待ち...";
      startBtn.classList.remove("green");
      startBtn.classList.add("gold");
    }
  },

  createRoom: () => {
    P2P.createRoom();
  },

  joinRoom: () => {
    const val = document.getElementById("in-room").value.trim();
    if (!val) {
      P2P._setState(P2P.STATES.CONNECTION_FAILED, "ルーム番号を入力してください");
      return;
    }
    P2P.join(val);
  },

  copyRoom: () => {
    if (!state.roomNo) return;
    navigator.clipboard.writeText(state.roomNo).then(() => {
      showToast("ルーム番号をコピーしました");
    });
  },

  sendTestMsg: () => {
    const input = document.getElementById("in-test-msg");
    const val = input ? input.value.trim() : "";
    if (P2P.sendTestMessage(val || "疎通確認テスト (Hello P2P!)")) {
      if (input) input.value = "";
    }
  },

  disconnectP2P: () => {
    P2P.disconnect();
  },

  refreshWebRTCStats: () => {
    P2P.updateWebRTCStatsUI();
  },

  loadDeck: () => {
    loadOnlineDeck();
  },

  startBattle: () => {
    // オンラインモードで相手と未接続の場合は開始を防止
    if (!P2P.connected && !state.isSoloMode) {
      alert("相手とまだ接続されていません。\nルームを作成するか入室して、接続完了（🟢）になってから対戦開始を押してください。\n※一人で練習したい場合は「一人回し」タブをご利用ください。");
      return;
    }

    const name = document.getElementById("in-name").value.trim() || "プレイヤーA";
    state.myName = name;
    startBattleSetup();
    if (P2P.connected) {
      if (typeof resetOpponentCards === "function") {
        resetOpponentCards();
      }
      // 通信対戦: 相手側へ対戦画面への遷移を通知（実デッキ・プレイマット情報を含む）
      const matSync = (typeof getMyPlaymatSyncData === "function")
        ? getMyPlaymatSyncData()
        : { matId: state.myMatId, matDataUrl: null };
      P2P.send({
        t: "start",
        name: state.myName,
        matId: matSync.matId,
        matDataUrl: matSync.matDataUrl,
        sleeveId: state.mySleeveId,
        sleeveDataUrl: state.mySleeveDataUrl,
        deck: state.myLoadedDeck || SAMPLE_DECK
      });
      renderAll();
      P2P.syncNow();
    }
  },

  exit: () => {
    if (confirm("対戦を終了してロビーに戻りますか？")) {
      window._isExitingToLobby = true;
      if (window.VoiceChat) {
        VoiceChat.endCall(false);
      }
      if (typeof P2P !== "undefined" && P2P.connected) {
        try {
          P2P.send({
            t: "player_exit",
            playerName: state.myName
          });
        } catch (e) {}
        P2P.disconnect();
      }
      state.oppExited = false;
      if (typeof BattleTimer !== "undefined") {
        BattleTimer.reset();
      }
      document.getElementById("game").classList.add("hidden");
      document.getElementById("lobby").classList.remove("hidden");
      if (typeof checkSoloResumeBanner === "function") {
        checkSoloResumeBanner();
      }
    }
  },

  // スマホメニュー開閉
  openMenu: () => {
    if (state.mustPromoteToActive) {
      showToast("⚠️ バトル場に出すベンチポケモンを選択してください");
      return;
    }
    document.body.classList.add("menu-open");
    updateSheetUI();
  },
  closeMenu: () => closeMenu(),

  // 技宣言 ＆ チャット ＆ ボイス通話
  declareAttack: () => {
    if (typeof openAttackModal === "function") openAttackModal();
  },
  openChat: () => {
    if (typeof openChatModal === "function") openChatModal();
  },
  startVoiceCall: () => {
    if (window.VoiceChat) VoiceChat.startCall();
  },

  // 山札アクション
  draw: () => {
    if (state.mustPromoteToActive) {
      showToast("⚠️ バトル場に出すベンチポケモンを選択してください");
      return;
    }
    drawCardToTemp();
  },
  viewDeck: () => showDeckModal(),
  trashTop: () => trashDeckTop(),
  shuffle: () => shuffleMyDeck(),

  // テンポラリアクション
  tempToHand: () => moveTempToHand(),
  tempRevealToHand: () => (typeof revealAndMoveTempToHand === "function" ? revealAndMoveTempToHand() : null),
  tempToTop: () => moveTempToTop(),
  tempToBottom: () => moveTempToBottom(),
  tempToTrash: () => moveTempToTrash(),

  // 手札アクション
  handToDeck: () => moveSelectedHandToDeck(),
  handToBottom: () => moveSelectedHandToBottom(),
  handTrash: () => trashSelectedHand(),
  handLost: () => moveSelectedHandToLost(),
  handActive: () => placeSelectedHandToActive(),
  handBench: () => placeSelectedHandToBench(),
  handStadium: () => (typeof placeSelectedHandToStadium === "function" ? placeSelectedHandToStadium() : null),
  handToPlayArea: () => moveSelectedHandToPlayArea(),

  // 使用カードエリア アクション
  playToTrash: () => movePlayCardToTrash(),
  playToHand: () => movePlayCardToHand(),
  playToDeckTop: () => movePlayCardToDeckTop(),
  playToDeckBottom: () => movePlayCardToDeckBottom(),
  playToStadium: () => movePlayCardToStadium(),
  playToLost: () => movePlayCardToLost(),

  // モード切替 & 一人回しアクション
  switchLobbyMode: (mode) => switchLobbyMode(mode),
  loadSoloDeckA: () => loadSoloDeckA(),
  loadSoloDeckB: () => loadSoloDeckB(),
  startSoloBattle: () => startSoloBattleSetup(),
  openDeckPasteModal: (target) => openDeckPasteModal(target || "online"),

  // 対戦準備フェーズ アクション
  setupCoinToss: () => startSetupCoinToss(),
  mulligan: () => executeMulligan(),
  setupReady: () => confirmSetupReady(),
  toggleSoloSetupSide: () => (typeof toggleSoloSetupSide === "function" ? toggleSoloSetupSide() : null),

  // 一人回し手札干渉・一時交代アクション
  showSoloOpponentHandMenu: () => (typeof showSoloOpponentHandMenu === "function" ? showSoloOpponentHandMenu() : null),
  revertSoloTemporarySwap: () => (typeof revertSoloTemporarySwap === "function" ? revertSoloTemporarySwap() : null),

  // サイド取得アクション
  finishPrizePicking: () => (typeof finishPrizePicking === "function" ? finishPrizePicking() : null),

  // その他
  undo: () => (typeof undoAction === "function" ? undoAction() : null),
  endTurn: () => endTurn(),
  coin: () => tossCoin(),
  declareVictory: () => (typeof declareVictory === "function" ? declareVictory() : null),
  showLog: () => showLogModal(),
  cancelTarget: () => cancelTargetMode(),

  // プレイマット・スリーブ選択アクション
  openMatUpload: () => openMatUpload(),
  openSleeveUpload: () => (typeof openSleeveUpload === "function" ? openSleeveUpload() : null),

  // CSVログ出力・試合再現（リプレイ）
  exportCsv: () => exportMatchCsv(),
  triggerCsvImport: () => {
    const input = document.getElementById("csv-file-input");
    if (input) input.click();
  },
  replayFirst: () => replayFirst(),
  replayPrev: () => replayPrev(),
  replayTogglePlay: () => replayTogglePlay(),
  replayNext: () => replayNext(),
  replayLast: () => replayLast(),
  exitReplay: () => exitReplayMode()
};

window.actions = actions;

function closeMenu() {
  document.body.classList.remove("menu-open");
}

// =============================================================================
// 一人回しセッションの自動セーブ ＆ 復元（F5リロード対策）
// =============================================================================

let _saveSoloTimer = null;
function debouncedSaveSoloSession() {
  if (!state.isSoloMode) return;
  const gameSec = document.getElementById("game");
  if (!gameSec || gameSec.classList.contains("hidden")) return;

  if (_saveSoloTimer) clearTimeout(_saveSoloTimer);
  _saveSoloTimer = setTimeout(() => {
    try {
      const now = new Date();
      const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const data = {
        timestamp: Date.now(),
        dateStr: timeStr,
        isSoloMode: true,
        isSetupPhase: !!state.isSetupPhase,
        setupReadyMy: !!state.setupReadyMy,
        setupReadyOpp: !!state.setupReadyOpp,
        turn: state.turn,
        turnNumber: state.turnNumber,
        firstPlayer: state.firstPlayer,
        mustPromoteToActive: !!state.mustPromoteToActive,
        limitBench8: !!state.limitBench8,
        oppLimitBench8: !!state.oppLimitBench8,
        isSoloTemporarySwap: !!state.isSoloTemporarySwap,
        myName: state.myName,
        oppName: state.oppName,
        myActive: state.myActive,
        myBench: state.myBench,
        myHand: state.myHand,
        myDeck: state.myDeck,
        myTrash: state.myTrash,
        myLost: state.myLost,
        myPrizes: state.myPrizes,
        oppActive: state.oppActive,
        oppBench: state.oppBench,
        oppHand: state.oppHand,
        oppDeck: state.oppDeck,
        oppTrash: state.oppTrash,
        oppLost: state.oppLost,
        oppPrizes: state.oppPrizes,
        stadium: state.stadium,
        playCard: state.playCard,
        tempCards: state.tempCards,
        logs: state.logs || []
      };
      sessionStorage.setItem("pokeca_solo_save", JSON.stringify(data));
    } catch (e) {
      console.warn("[SoloSave] Failed to save session:", e);
    }
  }, 250);
}

function checkSoloResumeBanner() {
  const banner = document.getElementById("solo-resume-banner");
  if (!banner) return;
  try {
    const raw = sessionStorage.getItem("pokeca_solo_save");
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.isSoloMode) {
        const infoEl = document.getElementById("solo-resume-info");
        if (infoEl) {
          const tText = data.isSetupPhase ? "対戦準備中" : `${data.turn === "me" ? "先攻側" : "後攻側"} (${data.turnNumber || 1}ターン目)`;
          infoEl.textContent = `中断時刻: ${data.dateStr || "直前"} | 状況: ${tText} | 手札: ${data.myHand ? data.myHand.length : 0}枚 / 相手手札: ${data.oppHand ? data.oppHand.length : 0}枚`;
        }
        banner.style.display = "flex";
        banner.classList.remove("hidden");
        return;
      }
    }
  } catch (e) {}
  banner.style.display = "none";
  banner.classList.add("hidden");
}

function resumeSoloSession() {
  try {
    const raw = sessionStorage.getItem("pokeca_solo_save");
    if (!raw) return alert("保存データが見つかりませんでした");
    const data = JSON.parse(raw);
    
    // stateに復元
    Object.assign(state, data);
    
    // UIを対戦画面に切り替え
    document.getElementById("lobby").classList.add("hidden");
    document.getElementById("game").classList.remove("hidden");
    window._isExitingToLobby = false;

    // 対戦準備バナーの表示制御
    const setupBanner = document.getElementById("setup-banner");
    if (setupBanner) {
      if (state.isSetupPhase) {
        setupBanner.classList.remove("hidden");
        const btnSoloSwap = document.getElementById("btn-solo-swap-setup");
        if (btnSoloSwap) btnSoloSwap.classList.remove("hidden");
      } else {
        setupBanner.classList.add("hidden");
      }
    }

    renderAll();
    showToast("✨ 前回の対戦データを復元しました！");
  } catch (e) {
    console.error("Resume failed:", e);
    alert("データの復元に失敗しました");
  }
}

function discardSoloSession() {
  sessionStorage.removeItem("pokeca_solo_save");
  const banner = document.getElementById("solo-resume-banner");
  if (banner) {
    banner.style.display = "none";
    banner.classList.add("hidden");
  }
  showToast("セーブデータを破棄しました");
}

// =============================================================================
// 初回操作案内ポップアップ（初めに見てください）
// =============================================================================
function openWelcomeGuideModal(forceOpen = false) {
  try {
    const isHidden = localStorage.getItem("pokeca_hide_welcome_guide") === "1";
    if (isHidden && !forceOpen) return;
  } catch (e) {}

  const modal = document.getElementById("welcome-guide-modal");
  if (!modal) return;

  const chk = document.getElementById("chk-hide-welcome-guide");
  if (chk) {
    try {
      chk.checked = localStorage.getItem("pokeca_hide_welcome_guide") === "1";
    } catch (e) {
      chk.checked = false;
    }
  }

  modal.classList.remove("hidden");
  const video = document.getElementById("welcome-demo-video");
  if (video) {
    try {
      video.currentTime = 0;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    } catch (e) {}
  }
}

function closeWelcomeGuideModal() {
  const modal = document.getElementById("welcome-guide-modal");
  if (!modal) return;

  const chk = document.getElementById("chk-hide-welcome-guide");
  if (chk) {
    try {
      if (chk.checked) {
        localStorage.setItem("pokeca_hide_welcome_guide", "1");
      } else {
        localStorage.removeItem("pokeca_hide_welcome_guide");
      }
    } catch (e) {}
  }

  const video = document.getElementById("welcome-demo-video");
  if (video) {
    try {
      video.pause();
    } catch (e) {}
  }

  modal.classList.add("hidden");
}

window.openWelcomeGuideModal = openWelcomeGuideModal;
window.closeWelcomeGuideModal = closeWelcomeGuideModal;
window.debouncedSaveSoloSession = debouncedSaveSoloSession;
window.checkSoloResumeBanner = checkSoloResumeBanner;
window.resumeSoloSession = resumeSoloSession;
window.discardSoloSession = discardSoloSession;
