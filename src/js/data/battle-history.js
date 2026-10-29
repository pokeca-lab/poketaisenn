/**
 * battle-history.js
 * ポケカ対戦ツールの戦績記録・集計・表示管理モジュール
 */

const BattleHistory = (function () {
  const STORAGE_KEY = "pokeca_battle_records";
  let _hasRecordedCurrentMatch = false;

  /**
   * ローカルストレージから戦績データを取得
   * @returns {{ version: number, records: Array<{ id: string, timestamp: number, date: string, myDeckCode: string, myPokemonName: string, oppDeckCode: string, oppPokemonName: string, result: 'win'|'lose', reason: string }> }}
   */
  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.records)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("[BattleHistory] loadData parse error:", e);
    }
    return { version: 1, records: [] };
  }

  /**
   * ローカルストレージへ戦績データを保存
   */
  function saveData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error("[BattleHistory] saveData error:", e);
    }
  }

  /**
   * 1試合で重複記録されないようフラグをリセット（新試合開始時）
   */
  function resetMatchRecordFlag() {
    _hasRecordedCurrentMatch = false;
  }

  /**
   * 試合結果を記録する
   * @param {Object} params
   * @param {string} params.myDeckCode - 自分のデッキコード
   * @param {string} [params.myPokemonName] - 自分の先頭ポケモン名
   * @param {string} [params.oppDeckCode] - 相手のデッキコード
   * @param {string} [params.oppPokemonName] - 相手の先頭ポケモン名
   * @param {'win'|'lose'} params.result - 勝敗
   * @param {string} [params.reason] - 決着理由
   */
  function recordResult({ myDeckCode, myPokemonName = "", oppDeckCode = "", oppPokemonName = "", result, reason = "" }) {
    if (_hasRecordedCurrentMatch) {
      console.log("[BattleHistory] この試合の結果は既に記録済みです。スキップします。");
      return;
    }
    _hasRecordedCurrentMatch = true;

    const cleanMyCode = (myDeckCode || "").trim();
    const cleanOppCode = (oppDeckCode || "").trim();
    if (!cleanMyCode) {
      console.warn("[BattleHistory] 自分のデッキコードが不明なため記録をスキップします。");
      return;
    }

    const data = loadData();
    const now = new Date();
    const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const record = {
      id: "rec_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      timestamp: Date.now(),
      date: dateStr,
      myDeckCode: cleanMyCode,
      myPokemonName: myPokemonName || "",
      oppDeckCode: cleanOppCode || "",
      oppPokemonName: oppPokemonName || "",
      result: result === "win" ? "win" : "lose",
      reason: reason || ""
    };

    data.records.unshift(record); // 最新が先頭
    saveData(data);
    console.log("[BattleHistory] 戦績を記録しました:", record);
  }

  /**
   * 通算成績を集計
   * @param {Array} records
   */
  function calculateStats(records) {
    const total = records.length;
    const wins = records.filter(r => r.result === "win").length;
    const losses = total - wins;
    const rate = total > 0 ? ((wins / total) * 100).toFixed(1) : "0.0";
    return { total, wins, losses, rate };
  }

  /**
   * 記録済みの自分のユニークなデッキコード一覧を取得（直近対戦順）
   * @returns {Array<{ code: string, pokemonName: string, lastUsed: number, count: number }>}
   */
  function getUniqueMyDecks() {
    const { records } = loadData();
    const deckMap = new Map();

    records.forEach(r => {
      const code = r.myDeckCode;
      if (!deckMap.has(code)) {
        deckMap.set(code, {
          code: code,
          pokemonName: r.myPokemonName || "",
          lastUsed: r.timestamp,
          count: 1
        });
      } else {
        const item = deckMap.get(code);
        item.count += 1;
        if (r.timestamp > item.lastUsed) {
          item.lastUsed = r.timestamp;
          if (r.myPokemonName && !item.pokemonName) {
            item.pokemonName = r.myPokemonName;
          }
        }
      }
    });

    // 直近対戦日時が新しい順にソート
    return Array.from(deckMap.values()).sort((a, b) => b.lastUsed - a.lastUsed);
  }

  /**
   * 指定デッキ（またはすべて）の対戦相手別集計を取得
   * @param {string} [filterMyDeckCode] - "ALL" またはデッキコード
   */
  function getOpponentStats(filterMyDeckCode = "ALL") {
    const { records } = loadData();
    const filtered = (filterMyDeckCode === "ALL")
      ? records
      : records.filter(r => r.myDeckCode === filterMyDeckCode);

    const oppMap = new Map();
    filtered.forEach(r => {
      const pokeName = (r.oppPokemonName && r.oppPokemonName !== "不明") ? r.oppPokemonName : "相手デッキ";
      if (!oppMap.has(pokeName)) {
        oppMap.set(pokeName, {
          oppPokemonName: pokeName,
          oppDeckCode: (r.oppDeckCode && r.oppDeckCode !== "（相手コード不明）") ? r.oppDeckCode : "",
          wins: 0,
          losses: 0,
          total: 0,
          lastMatch: r.timestamp
        });
      }
      const item = oppMap.get(pokeName);
      item.total += 1;
      if (r.result === "win") item.wins += 1;
      else item.losses += 1;
      if (r.timestamp > item.lastMatch) item.lastMatch = r.timestamp;
    });

    return Array.from(oppMap.values()).sort((a, b) => b.lastMatch - a.lastMatch);
  }

  /**
   * 指定デッキ（またはすべて）の戦績をリセット
   * @param {string} targetCode - "ALL" またはデッキコード
   */
  function resetRecords(targetCode = "ALL") {
    const data = loadData();
    if (targetCode === "ALL") {
      data.records = [];
    } else {
      data.records = data.records.filter(r => r.myDeckCode !== targetCode);
    }
    saveData(data);
  }

  return {
    STORAGE_KEY,
    loadData,
    saveData,
    resetMatchRecordFlag,
    recordResult,
    calculateStats,
    getUniqueMyDecks,
    getOpponentStats,
    resetRecords
  };
})();

// グローバル公開
window.BattleHistory = BattleHistory;
