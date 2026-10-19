/* 【ゲーム】CSV棋譜出力・インポート・試合再現 */

// =============================================================================
// 対戦ログ & CSV出力・試合再現 (Match History & Replay)
// =============================================================================
let matchHistory = [];
let replayState = {
  isActive: false,
  records: [],
  currentIndex: -1,
  timerId: null,
  speedMs: 1200
};

function createSnapshot() {
  return {
    turn: state.turn,
    myName: state.myName,
    oppName: state.oppName,
    roomNo: state.roomNo,
    myDeck: JSON.parse(JSON.stringify(state.myDeck)),
    myHand: JSON.parse(JSON.stringify(state.myHand)),
    myPrizes: JSON.parse(JSON.stringify(state.myPrizes)),
    myTrash: JSON.parse(JSON.stringify(state.myTrash)),
    myLost: JSON.parse(JSON.stringify(state.myLost)),
    myActive: JSON.parse(JSON.stringify(state.myActive)),
    myBench: JSON.parse(JSON.stringify(state.myBench)),
    tempCards: JSON.parse(JSON.stringify(state.tempCards)),
    playCard: JSON.parse(JSON.stringify(state.playCard)),
    stadium: JSON.parse(JSON.stringify(state.stadium)),
    oppDeckCount: state.oppDeckCount,
    oppHandCount: state.oppHandCount,
    oppPrizes: state.oppPrizes,
    oppTrash: JSON.parse(JSON.stringify(state.oppTrash)),
    oppLostCount: state.oppLostCount,
    oppActive: JSON.parse(JSON.stringify(state.oppActive)),
    oppBench: JSON.parse(JSON.stringify(state.oppBench)),
    myMatId: state.myMatId,
    oppMatId: state.oppMatId
  };
}

function restoreSnapshot(snap) {
  if (!snap) return;
  state.turn = snap.turn ?? state.turn;
  state.myName = snap.myName || state.myName;
  state.oppName = snap.oppName || state.oppName;
  state.roomNo = snap.roomNo || state.roomNo;
  state.myMatId = snap.myMatId || state.myMatId || "mat_01";
  state.oppMatId = snap.oppMatId || state.oppMatId || "mat_02";
  state.myDeck = JSON.parse(JSON.stringify(snap.myDeck || []));
  state.myHand = JSON.parse(JSON.stringify(snap.myHand || []));
  state.myPrizes = JSON.parse(JSON.stringify(snap.myPrizes || []));
  state.myTrash = JSON.parse(JSON.stringify(snap.myTrash || []));
  state.myLost = JSON.parse(JSON.stringify(snap.myLost || []));
  state.myActive = snap.myActive ? JSON.parse(JSON.stringify(snap.myActive)) : null;
  state.myBench = (snap.myBench || []).map(b => b ? JSON.parse(JSON.stringify(b)) : null);
  state.tempCards = JSON.parse(JSON.stringify(snap.tempCards || []));
  state.playCard = snap.playCard ? JSON.parse(JSON.stringify(snap.playCard)) : null;
  state.stadium = snap.stadium ? JSON.parse(JSON.stringify(snap.stadium)) : null;
  state.oppDeckCount = snap.oppDeckCount ?? 0;
  state.oppHandCount = snap.oppHandCount ?? 0;
  state.oppPrizes = snap.oppPrizes ?? 0;
  state.oppTrash = JSON.parse(JSON.stringify(snap.oppTrash || []));
  state.oppLostCount = snap.oppLostCount ?? 0;
  state.oppActive = snap.oppActive ? JSON.parse(JSON.stringify(snap.oppActive)) : null;
  state.oppBench = (snap.oppBench || []).map(b => b ? JSON.parse(JSON.stringify(b)) : null);
  state.selectedHandIndices.clear();
  state.draggedHandIndex = -1;
  state.draggedEnergy = null;
  state.actionTargetMode = null;
}

function recordMatchStep(meta = {}) {
  const step = matchHistory.length + 1;
  const snap = createSnapshot();
  const record = {
    step: step,
    turn: state.turn,
    timestamp: new Date().toISOString(),
    player: meta.player || state.myName,
    action: meta.action || "ACTION",
    cardName: meta.cardName || "",
    fromZone: meta.fromZone || "",
    toZone: meta.toZone || "",
    details: meta.details || "",
    logMessage: meta.logMessage || "",
    snapshot: JSON.stringify(snap)
  };
  matchHistory.push(record);
}

function addLog(text, meta = {}) {
  // 3引数で呼ばれた場合の互換性対応: addLog(player, category, text)
  if (arguments.length >= 3 && typeof arguments[2] === "string") {
    text = arguments[2];
    meta = { category: arguments[1], player: arguments[0] };
  } else if (typeof meta === "string") {
    meta = { category: meta };
  }

  const time = new Date().toLocaleTimeString();
  state.logs.push(`[${time}] ${text}`);
  if (!replayState.isActive) {
    recordMatchStep({
      ...meta,
      logMessage: text
    });
  }

  // チャットやボイス通話、システム通知などの非カードプレイ行動はポップアップ・同期通知を抑制
  const isNonPlay = meta.category === "chat" ||
                    meta.category === "voice" ||
                    meta.category === "system" ||
                    meta.noPopup === true ||
                    meta.badge === false;

  // リモート受信ログ・同期抑制指定・非プレイ行動・リプレイ再生中は送信/ポップアップしない
  if (meta.isRemote || meta.suppressSync || isNonPlay || replayState.isActive) {
    return;
  }

  const oppText = meta.oppText || text;
  const cards = Array.isArray(meta.cards) ? meta.cards : [];
  const badge = meta.badge || "📢 プレイ行動";

  // 自分の画面にも行動ポップアップを表示（モーダルが開いていない場合）
  if (!meta.skipLocalPopup && typeof showActionPopup === "function") {
    const modalEl = document.getElementById("modal");
    const zoomEl = document.getElementById("card-zoom-modal");
    const isModalOpen = (modalEl && !modalEl.classList.contains("hidden")) ||
                        (zoomEl && !zoomEl.classList.contains("hidden"));
    if (!isModalOpen) {
      showActionPopup(state.myName, text, cards, badge);
    }
  }

  // 通信対戦時は相手へ行動ログ＆ポップアップ通知を送信
  if (!state.isSoloMode && typeof P2P !== "undefined" && P2P.connected) {
    P2P.send({
      t: "action_log",
      playerName: state.myName,
      text: oppText,
      cards: cards,
      badge: badge
    });
  }
}

function escapeCsvCell(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

function exportMatchCsv() {
  if (!matchHistory || matchHistory.length === 0) {
    // 履歴が空の場合は現在のスナップショットで初期レコード作成
    recordMatchStep({ action: "CURRENT_STATE", logMessage: "対戦の現在状態" });
  }

  const headers = [
    "Step", "Turn", "Timestamp", "Player", "Action",
    "CardName", "FromZone", "ToZone", "Details", "LogMessage", "Snapshot"
  ];

  const rows = [headers.join(",")];
  matchHistory.forEach(r => {
    const row = [
      escapeCsvCell(r.step),
      escapeCsvCell(r.turn),
      escapeCsvCell(r.timestamp),
      escapeCsvCell(r.player),
      escapeCsvCell(r.action),
      escapeCsvCell(r.cardName),
      escapeCsvCell(r.fromZone),
      escapeCsvCell(r.toZone),
      escapeCsvCell(r.details),
      escapeCsvCell(r.logMessage),
      escapeCsvCell(r.snapshot)
    ];
    rows.push(row.join(","));
  });

  const csvContent = "\uFEFF" + rows.join("\r\n"); // UTF-8 BOM
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const nowStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  a.href = url;
  a.download = `pokeca_match_${state.roomNo}_${nowStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("CSVファイルを出力しました");
}

function parseCsv(text) {
  // RFC 4180 対応の CSV パーサー（改行やクォートエスケープを含むセルに対応）
  const cleanText = text.replace(/^\uFEFF/, "");
  const rows = [];
  let currentRow = [];
  let currentCell = "";
  let inQuotes = false;
  let i = 0;

  while (i < cleanText.length) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentCell += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentCell += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentCell);
        currentCell = "";
        i++;
        continue;
      } else if (char === '\r') {
        if (nextChar === '\n') i++;
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = "";
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = "";
        i++;
        continue;
      } else {
        currentCell += char;
        i++;
        continue;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

function importMatchCsv(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      const rows = parseCsv(text);
      if (rows.length < 2) {
        alert("有効な対戦ログCSVではありません（データ行がありません）");
        return;
      }

      const headers = rows[0].map(h => h.trim());
      const snapshotIdx = headers.indexOf("Snapshot");
      const actionIdx = headers.indexOf("Action");
      const logIdx = headers.indexOf("LogMessage");
      const turnIdx = headers.indexOf("Turn");
      const stepIdx = headers.indexOf("Step");

      if (snapshotIdx === -1) {
        alert("CSVに対戦状態（Snapshot）列が含まれていません。正しい対戦ログCSVを指定してください。");
        return;
      }

      const records = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length <= snapshotIdx) continue;
        const snapRaw = row[snapshotIdx];
        if (!snapRaw) continue;
        try {
          const snapObj = JSON.parse(snapRaw);
          records.push({
            step: parseInt(row[stepIdx]) || r,
            turn: parseInt(row[turnIdx]) || snapObj.turn || 1,
            action: actionIdx >= 0 ? row[actionIdx] : "",
            logMessage: logIdx >= 0 ? row[logIdx] : "",
            snapshot: snapObj
          });
        } catch (err) {
          console.warn("Snapshot parse failed at row", r, err);
        }
      }

      if (records.length === 0) {
        alert("有効な対戦ステップを読み込めませんでした。");
        return;
      }

      startReplayMode(records);
    } catch (err) {
      console.error(err);
      alert("CSVファイルの読み込みに失敗しました: " + err.message);
    }
  };
  reader.readAsText(file, "UTF-8");
}

function startReplayMode(records) {
  replayState.isActive = true;
  replayState.records = records;
  replayState.currentIndex = 0;
  if (replayState.timerId) {
    clearInterval(replayState.timerId);
    replayState.timerId = null;
  }

  // 画面遷移
  document.getElementById("lobby").classList.add("hidden");
  document.getElementById("game").classList.remove("hidden");
  const replayBar = document.getElementById("replay-bar");
  if (replayBar) replayBar.classList.remove("hidden");

  // スライダー初期化
  const slider = document.getElementById("replay-slider");
  if (slider) {
    slider.min = "0";
    slider.max = String(records.length - 1);
    slider.value = "0";
  }

  jumpToReplayStep(0);
  closeModal();
  showToast(`試合ログを読込完了（全 ${records.length} ステップ）。再現を開始します。`);
}

function jumpToReplayStep(idx) {
  if (!replayState.records || idx < 0 || idx >= replayState.records.length) return;
  replayState.currentIndex = idx;
  const rec = replayState.records[idx];

  // 状態復元
  restoreSnapshot(rec.snapshot);
  renderAll();

  // リプレイUI更新
  const slider = document.getElementById("replay-slider");
  if (slider) slider.value = String(idx);

  const stepInfo = document.getElementById("replay-step-info") || document.getElementById("replay-step-text");
  if (stepInfo) stepInfo.textContent = `${idx + 1} / ${replayState.records.length}`;

  const msgText = document.getElementById("replay-msg") || document.getElementById("replay-msg-text");
  if (msgText) msgText.textContent = `[ターン${rec.turn}] ${rec.logMessage || rec.action || "手順実行"}`;
}

function replayNext() {
  if (replayState.currentIndex < replayState.records.length - 1) {
    jumpToReplayStep(replayState.currentIndex + 1);
  } else {
    if (replayState.timerId) {
      replayTogglePlay();
    }
    showToast("試合再現の最終ステップに到達しました");
  }
}

function replayPrev() {
  if (replayState.currentIndex > 0) {
    jumpToReplayStep(replayState.currentIndex - 1);
  }
}

function replayFirst() {
  jumpToReplayStep(0);
}

function replayLast() {
  jumpToReplayStep(replayState.records.length - 1);
}

function replayTogglePlay() {
  const playBtn = document.getElementById("btn-replay-play") || document.getElementById("replay-btn-play");
  if (replayState.timerId) {
    clearInterval(replayState.timerId);
    replayState.timerId = null;
    if (playBtn) playBtn.textContent = "▶ 再生";
    showToast("自動再生を一時停止しました");
  } else {
    if (replayState.currentIndex >= replayState.records.length - 1) {
      jumpToReplayStep(0);
    }
    if (playBtn) playBtn.textContent = "⏸ 一時停止";
    showToast("自動再生中...");
    replayState.timerId = setInterval(() => {
      if (replayState.currentIndex < replayState.records.length - 1) {
        replayNext();
      } else {
        replayTogglePlay();
      }
    }, replayState.speedMs);
  }
}

function exitReplayMode() {
  if (replayState.timerId) {
    clearInterval(replayState.timerId);
    replayState.timerId = null;
  }
  replayState.isActive = false;
  replayState.records = [];
  const replayBar = document.getElementById("replay-bar");
  if (replayBar) replayBar.classList.add("hidden");

  showToast("試合再現モードを終了しました");
}


