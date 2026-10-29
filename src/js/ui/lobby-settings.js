/**
 * lobby-settings.js
 * ロビー設定モーダル ＆ 戦績モーダルのUI制御モジュール
 */

// =============================================================================
// 1. ロビー設定モーダル（自動トラッシュ・サウンド・データ引き継ぎ）
// =============================================================================

function openLobbySettingsModal() {
  const modal = document.getElementById("lobby-settings-modal");
  if (!modal) return;

  // 自動トラッシュの現在状態をチェックボックスに反映
  const chk = document.getElementById("chk-auto-trash-setting");
  if (chk && typeof state !== "undefined") {
    chk.checked = !!state.autoTrashEnabled;
  }

  // 引き継ぎコード発行エリアを初期状態に戻す
  const codeBox = document.getElementById("transfer-code-result-box");
  if (codeBox) codeBox.classList.add("hidden");
  const inCode = document.getElementById("in-transfer-code");
  if (inCode) inCode.value = "";
  const errEl = document.getElementById("transfer-import-error");
  if (errEl) {
    errEl.textContent = "";
    errEl.classList.add("hidden");
  }

  modal.classList.remove("hidden");
}

function closeLobbySettingsModal(event) {
  if (event && event.target && event.target !== event.currentTarget) return;
  const modal = document.getElementById("lobby-settings-modal");
  if (modal) modal.classList.add("hidden");
}

/** 設定モーダル内の自動トラッシュ切り替え */
function onSettingAutoTrashChange(checked) {
  if (typeof state !== "undefined") {
    state.autoTrashEnabled = !!checked;
  }
  try {
    localStorage.setItem("pokeca_auto_trash", checked ? "1" : "0");
  } catch (e) {}

  // 既存のチェックボックス要素も同期
  const c1 = document.getElementById("chk-auto-trash");
  const c2 = document.getElementById("chk-auto-trash-solo");
  if (c1) c1.checked = !!checked;
  if (c2) c2.checked = !!checked;
}

/** 引き継ぎコード発行ボタン押下時 */
async function onGenerateTransferCodeClick() {
  const btn = document.getElementById("btn-generate-transfer-code");
  const resultBox = document.getElementById("transfer-code-result-box");
  const codeDisplay = document.getElementById("transfer-code-display");
  const expireDisplay = document.getElementById("transfer-code-expire");

  if (!btn || !resultBox || !codeDisplay) return;

  try {
    btn.disabled = true;
    btn.textContent = "⏳ 発行中...";

    const { code, expiresAt } = await DataTransfer.createTransferCode();

    // 3桁-3桁のハイフン表示で見やすく
    const formattedCode = code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
    codeDisplay.textContent = formattedCode;
    codeDisplay.dataset.rawCode = code;

    const expireDate = new Date(expiresAt);
    const expireStr = `${expireDate.getMonth() + 1}/${expireDate.getDate()} ${String(expireDate.getHours()).padStart(2, "0")}:${String(expireDate.getMinutes()).padStart(2, "0")}`;
    if (expireDisplay) {
      expireDisplay.textContent = `有効期限: ${expireStr} まで（24時間有効）`;
    }

    resultBox.classList.remove("hidden");
    btn.textContent = "🔄 コードを再発行する";
  } catch (err) {
    alert("引き継ぎコードの発行に失敗しました: " + (err.message || err));
    btn.textContent = "📱 引き継ぎコードを発行する";
  } finally {
    btn.disabled = false;
  }
}

/** 引き継ぎコードのクリップボードコピー */
function copyTransferCodeToClipboard() {
  const codeDisplay = document.getElementById("transfer-code-display");
  if (!codeDisplay) return;
  const rawCode = codeDisplay.dataset.rawCode || codeDisplay.textContent.replace(/[^0-9]/g, "");
  if (!rawCode) return;

  navigator.clipboard.writeText(rawCode).then(() => {
    alert(`引き継ぎコード【${rawCode}】をコピーしました！\n新しい端末の「データ引き継ぎ」画面に入力してください。`);
  }).catch(() => {
    prompt("以下の引き継ぎコードをコピーしてください:", rawCode);
  });
}

/** 引き継ぎ実行ボタン押下時 */
async function onExecuteTransferImportClick() {
  const inCode = document.getElementById("in-transfer-code");
  const btn = document.getElementById("btn-execute-transfer-import");
  const errEl = document.getElementById("transfer-import-error");
  if (!inCode || !btn) return;

  const code = inCode.value.trim();
  if (!code) {
    alert("6桁の引き継ぎコードを入力してください。");
    inCode.focus();
    return;
  }

  if (errEl) {
    errEl.textContent = "";
    errEl.classList.add("hidden");
  }

  if (!confirm(`引き継ぎコード【${code}】でデータを復元しますか？\n※現在の端末の設定・デッキ・戦績データは上書きされます。`)) {
    return;
  }

  try {
    btn.disabled = true;
    btn.textContent = "⏳ 復元中...";

    const result = await DataTransfer.importTransferData(code);
    alert(`🎉 データの引き継ぎが正常に完了しました！（${result.count} 項目を復元）\n設定を反映するためページを再読み込みします。`);
    location.reload();
  } catch (err) {
    if (errEl) {
      errEl.textContent = "⚠️ " + (err.message || err);
      errEl.classList.remove("hidden");
    } else {
      alert("引き継ぎエラー: " + (err.message || err));
    }
  } finally {
    btn.disabled = false;
    btn.textContent = "📥 データを引き継ぐ";
  }
}


// =============================================================================
// 2. 戦績モーダル（通算成績・デッキ別詳細・リセット）
// =============================================================================

function openBattleHistoryModal() {
  const modal = document.getElementById("battle-history-modal");
  if (!modal) return;

  modal.classList.remove("hidden");
  renderBattleHistoryView();
}

function closeBattleHistoryModal(event) {
  if (event && event.target && event.target !== event.currentTarget) return;
  const modal = document.getElementById("battle-history-modal");
  if (modal) modal.classList.add("hidden");
}

/** 戦績画面全体の描画・更新 */
function renderBattleHistoryView() {
  if (typeof BattleHistory === "undefined") return;

  const data = BattleHistory.loadData();
  const allStats = BattleHistory.calculateStats(data.records);

  // 1. 通算成績（上部に大きめ表示）
  const totalStatsEl = document.getElementById("battle-history-total-stats");
  if (totalStatsEl) {
    totalStatsEl.innerHTML = `
      <div style="font-size:12px; color:#64748b; font-weight:bold; margin-bottom:4px;">🏆 全デッキ通算成績</div>
      <div style="display:flex; align-items:baseline; justify-content:center; gap:12px;">
        <span style="font-size:26px; font-weight:900; color:#1e293b;">${allStats.wins}<span style="font-size:15px; font-weight:bold; color:#64748b; margin-left:2px;">勝</span></span>
        <span style="font-size:26px; font-weight:900; color:#dc2626;">${allStats.losses}<span style="font-size:15px; font-weight:bold; color:#64748b; margin-left:2px;">敗</span></span>
        <span style="font-size:18px; font-weight:bold; color:#2563eb; background:#eff6ff; padding:3px 10px; border-radius:20px; border:1px solid #bfdbfe;">
          勝率 ${allStats.rate}%
        </span>
      </div>
      <div style="font-size:11px; color:#94a3b8; margin-top:4px;">総対戦数: ${allStats.total} 試合</div>
    `;
  }

  // 2. セレクトボックスの選択肢構築
  renderDeckFilterSelect();

  // 3. 選択中デッキの詳細描画
  renderSelectedDeckDetail();
}

/** セレクトボックスの選択肢を構築 */
function renderDeckFilterSelect() {
  const select = document.getElementById("battle-history-deck-select");
  if (!select) return;

  const prevValue = select.value || "ALL";
  select.innerHTML = "";

  // デフォルト: すべて
  const optAll = document.createElement("option");
  optAll.value = "ALL";
  optAll.textContent = "すべて（総合戦績）";
  select.appendChild(optAll);

  // 記録のある自分のユニークデッキ（直近対戦順）
  const uniqueDecks = BattleHistory.getUniqueMyDecks();

  if (uniqueDecks.length > 0) {
    // 件数が多い（10件以上）ならグループ分け、少なければそのままフラットに
    if (uniqueDecks.length >= 10) {
      const recentGroup = document.createElement("optgroup");
      recentGroup.label = "🕒 最近使ったデッキ（直近5件）";
      uniqueDecks.slice(0, 5).forEach(d => {
        const opt = document.createElement("option");
        opt.value = d.code;
        opt.textContent = d.pokemonName ? `${d.code}（${d.pokemonName}）` : d.code;
        recentGroup.appendChild(opt);
      });
      select.appendChild(recentGroup);

      const pastGroup = document.createElement("optgroup");
      pastGroup.label = "📁 過去のデッキ";
      uniqueDecks.slice(5).forEach(d => {
        const opt = document.createElement("option");
        opt.value = d.code;
        opt.textContent = d.pokemonName ? `${d.code}（${d.pokemonName}）` : d.code;
        pastGroup.appendChild(opt);
      });
      select.appendChild(pastGroup);
    } else {
      uniqueDecks.forEach(d => {
        const opt = document.createElement("option");
        opt.value = d.code;
        opt.textContent = d.pokemonName ? `${d.code}（${d.pokemonName}）` : d.code;
        select.appendChild(opt);
      });
    }
  }

  // 直前の選択を復元（なければALL）
  const optionExists = Array.from(select.options).some(o => o.value === prevValue);
  select.value = optionExists ? prevValue : "ALL";
}

/** セレクトボックス変更時イベント */
function onBattleHistoryDeckChange() {
  renderSelectedDeckDetail();
}

/** 選択されているデッキの詳細エリアを描画 */
function renderSelectedDeckDetail() {
  const select = document.getElementById("battle-history-deck-select");
  const detailWrap = document.getElementById("battle-history-detail-wrap");
  if (!select || !detailWrap) return;

  const targetCode = select.value || "ALL";
  const data = BattleHistory.loadData();
  const filteredRecords = (targetCode === "ALL")
    ? data.records
    : data.records.filter(r => r.myDeckCode === targetCode);

  const stats = BattleHistory.calculateStats(filteredRecords);
  const oppStats = BattleHistory.getOpponentStats(targetCode);

  // デッキプレビュー画像のHTML（ALLの場合は非表示、個別デッキ選択時は公式画像URLを表示）
  let deckImageHtml = "";
  if (targetCode !== "ALL") {
    const cleanCode = targetCode.replace(/[^a-zA-Z0-9-]/g, "");
    const imgUrl = `https://www.pokemon-card.com/deck/deckView.php/deckID/${cleanCode}.png`;
    deckImageHtml = `
      <div style="text-align:center; margin-bottom:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px;">
        <div style="font-size:11px; font-weight:bold; color:#64748b; margin-bottom:4px;">🃏 デッキ登録画像</div>
        <a href="${imgUrl}" target="_blank" rel="noopener noreferrer" title="クリックで公式画像を拡大">
          <img src="${imgUrl}" alt="Deck ${cleanCode}" style="max-width:100%; max-height:160px; object-fit:contain; border-radius:6px; box-shadow:0 1px 3px rgba(0,0,0,0.1);" onerror="this.onerror=null; this.parentElement.innerHTML='<span style=\'font-size:11px; color:#94a3b8;\'>（公式デッキ画像を取得できませんでした）</span>';">
        </a>
      </div>
    `;
  }

  // 相手別戦績テーブル/リスト
  let oppRowsHtml = "";
  if (oppStats.length === 0) {
    oppRowsHtml = `<div style="text-align:center; padding:16px; color:#94a3b8; font-size:12px;">対戦相手の記録はまだありません</div>`;
  } else {
    oppRowsHtml = oppStats.map(opp => {
      const oppRate = opp.total > 0 ? ((opp.wins / opp.total) * 100).toFixed(0) : "0";
      const oppLabel = opp.oppPokemonName
        ? `<b style="color:#1e293b;">${opp.oppDeckCode}</b> <span style="color:#2563eb; font-size:11px;">（${opp.oppPokemonName}）</span>`
        : `<b style="color:#1e293b;">${opp.oppDeckCode}</b>`;
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:8px 12px; margin-bottom:6px; font-size:12px;">
          <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:60%;">
            <span style="color:#64748b; font-size:11px;">vs</span> ${oppLabel}
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-weight:bold; color:#1e293b;">${opp.wins}勝 ${opp.losses}敗</span>
            <span style="font-size:11px; font-weight:bold; color:#2563eb; background:#f1f5f9; padding:2px 6px; border-radius:4px;">${oppRate}%</span>
          </div>
        </div>
      `;
    }).join("");
  }

  detailWrap.innerHTML = `
    ${deckImageHtml}

    <!-- 選択デッキの成績概要カード -->
    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:12px; font-weight:bold; color:#475569;">
          ${targetCode === "ALL" ? "📊 総合成績内訳" : "📊 このデッキの戦績"}
        </span>
        <span style="font-size:14px; font-weight:bold; color:#1e293b;">
          ${stats.wins}勝 ${stats.losses}敗 <span style="color:#2563eb; margin-left:4px;">(勝率 ${stats.rate}%)</span>
        </span>
      </div>
    </div>

    <!-- 対戦相手ごとの内訳 -->
    <div>
      <div style="font-size:12px; font-weight:bold; color:#475569; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
        <span>⚔️ 対戦相手のデッキ別勝敗</span>
        <span style="font-size:11px; color:#94a3b8;">${oppStats.length} デッキと対戦</span>
      </div>
      <div style="max-height:220px; overflow-y:auto; padding-right:2px;">
        ${oppRowsHtml}
      </div>
    </div>
  `;
}

/** 戦績リセットボタン押下時 */
function onResetBattleHistoryClick() {
  const select = document.getElementById("battle-history-deck-select");
  if (!select) return;

  const targetCode = select.value || "ALL";
  let confirmMsg = "";

  if (targetCode === "ALL") {
    confirmMsg = "⚠️ 【警告】すべての戦績データを完全に削除しますか？\n（この操作は元に戻せません）";
  } else {
    const selectedText = select.options[select.selectedIndex]?.textContent || targetCode;
    confirmMsg = `⚠️ 選択中のデッキ『${selectedText}』の戦績を削除しますか？\n（この操作は元に戻せません）`;
  }

  if (!confirm(confirmMsg)) return;

  BattleHistory.resetRecords(targetCode);
  alert("戦績をクリアしました。");
  renderBattleHistoryView();
}

// グローバル公開
window.openLobbySettingsModal = openLobbySettingsModal;
window.closeLobbySettingsModal = closeLobbySettingsModal;
window.onSettingAutoTrashChange = onSettingAutoTrashChange;
window.onGenerateTransferCodeClick = onGenerateTransferCodeClick;
window.copyTransferCodeToClipboard = copyTransferCodeToClipboard;
window.onExecuteTransferImportClick = onExecuteTransferImportClick;

window.openBattleHistoryModal = openBattleHistoryModal;
window.closeBattleHistoryModal = closeBattleHistoryModal;
window.onBattleHistoryDeckChange = onBattleHistoryDeckChange;
window.onResetBattleHistoryClick = onResetBattleHistoryClick;
