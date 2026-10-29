/**
 * transfer.js
 * 端末間データ引き継ぎ（6桁コード一時中継・24時間有効期限・非同期お掃除）モジュール
 */

const DataTransfer = (function () {
  const TRANSFER_PATH = "transfers";
  const TTL_HOURS = 24;
  const LOCK_KEY = "pokeca_transfer_lock";
  const MAX_FAIL_COUNT = 5;
  const LOCK_DURATION_MS = 3 * 60 * 1000; // 3分間ロック

  const TRANSFER_STORAGE_KEYS = [
    "pokeca_saved_deck_codes",
    "pokeca_last_deck_code",
    "pokeca_custom_playmats",
    "pokeca_custom_sleeves",
    "pokeca_auto_trash",
    "pokeca_sound_volume",
    "pokeca_sound_muted",
    "pokeca_gcp_tts_config",
    "pokeca_battle_records"
  ];

  /**
   * Firebase Realtime Database インスタンスを取得
   */
  function getDb() {
    if (typeof firebase === "undefined" || !firebase.database) {
      throw new Error("Firebase SDKが読み込まれていません。通信環境をご確認ください。");
    }
    return firebase.database();
  }

  /**
   * 6桁の数字コードを生成
   */
  function generate6DigitCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * 現在の端末のローカルストレージデータを収集・パッケージ化
   */
  function collectLocalData() {
    const payload = {};
    TRANSFER_STORAGE_KEYS.forEach(key => {
      const val = localStorage.getItem(key);
      if (val !== null) {
        payload[key] = val;
      }
    });
    return payload;
  }

  /**
   * 引き継ぎコードを発行してFirebaseに登録（有効期限24時間）
   * @returns {Promise<{ code: string, expiresAt: number }>}
   */
  async function createTransferCode() {
    const db = getDb();
    const payload = collectLocalData();
    const now = Date.now();
    const expiresAt = now + TTL_HOURS * 60 * 60 * 1000;

    // 重複チェックを行いながらコードを決定
    let code = "";
    let attempts = 0;
    while (attempts < 5) {
      code = generate6DigitCode();
      const snap = await db.ref(`${TRANSFER_PATH}/${code}`).once("value");
      if (!snap.exists()) {
        break;
      }
      attempts++;
    }

    const transferData = {
      code: code,
      createdAt: now,
      expiresAt: expiresAt,
      payload: payload
    };

    await db.ref(`${TRANSFER_PATH}/${code}`).set(transferData);
    console.log(`[DataTransfer] 引き継ぎコードを発行しました: ${code} (有効期限: 24時間)`);
    return { code, expiresAt };
  }

  /**
   * ロック状態をチェック
   */
  function checkLockStatus() {
    try {
      const lockRaw = sessionStorage.getItem(LOCK_KEY);
      if (lockRaw) {
        const lockInfo = JSON.parse(lockRaw);
        if (lockInfo.lockedUntil && Date.now() < lockInfo.lockedUntil) {
          const remainSec = Math.ceil((lockInfo.lockedUntil - Date.now()) / 1000);
          return { isLocked: true, remainSec };
        }
      }
    } catch (e) {}
    return { isLocked: false, remainSec: 0 };
  }

  /**
   * 失敗回数をカウント＆必要に応じてロック
   */
  function recordFailure() {
    try {
      const lockRaw = sessionStorage.getItem(LOCK_KEY);
      let lockInfo = lockRaw ? JSON.parse(lockRaw) : { failCount: 0, lockedUntil: 0 };
      lockInfo.failCount = (lockInfo.failCount || 0) + 1;
      if (lockInfo.failCount >= MAX_FAIL_COUNT) {
        lockInfo.lockedUntil = Date.now() + LOCK_DURATION_MS;
      }
      sessionStorage.setItem(LOCK_KEY, JSON.stringify(lockInfo));
    } catch (e) {}
  }

  /**
   * 成功時にロック解除
   */
  function clearLock() {
    try {
      sessionStorage.removeItem(LOCK_KEY);
    } catch (e) {}
  }

  /**
   * 引き継ぎコードを指定してデータを復元
   * @param {string} rawCode - 入力された6桁コード
   * @returns {Promise<{ success: boolean, count: number }>}
   */
  async function importTransferData(rawCode) {
    const lock = checkLockStatus();
    if (lock.isLocked) {
      throw new Error(`連続して入力ミスが発生したため、安全のため一時的にロックされています。あと約${lock.remainSec}秒後にお試しください。`);
    }

    const cleanCode = (rawCode || "").replace(/[^0-9]/g, "").trim();
    if (cleanCode.length !== 6) {
      throw new Error("引き継ぎコードは6桁の数字です。正しく入力してください。");
    }

    const db = getDb();
    const ref = db.ref(`${TRANSFER_PATH}/${cleanCode}`);
    const snap = await ref.once("value");

    if (!snap.exists()) {
      recordFailure();
      throw new Error("指定された引き継ぎコードが見つかりません。番号が正しいかご確認ください。");
    }

    const data = snap.val();
    const now = Date.now();

    // 24時間の有効期限切れチェック
    if (data.expiresAt && now > data.expiresAt) {
      // 期限切れなのでサーバーから即座にお掃除
      try { await ref.remove(); } catch (e) {}
      recordFailure();
      throw new Error("この引き継ぎコードの有効期限（24時間）が切れています。お手数ですが、もう一度元の端末でコードを発行してください。");
    }

    const payload = data.payload || {};
    let restoredCount = 0;

    // ローカルストレージに書き込み
    Object.keys(payload).forEach(key => {
      if (TRANSFER_STORAGE_KEYS.includes(key)) {
        localStorage.setItem(key, payload[key]);
        restoredCount++;
      }
    });

    // 使い切りなのでサーバーから即座に削除
    try {
      await ref.remove();
    } catch (e) {
      console.warn("[DataTransfer] 復元後のサーバーデータ削除警告:", e);
    }

    clearLock();
    console.log(`[DataTransfer] データの引き継ぎが完了しました (${restoredCount} 項目復元)`);
    return { success: true, count: restoredCount };
  }

  /**
   * 期限切れの古い引き継ぎデータを非同期・低負荷で自動お掃除（ガベージコレクション）
   * アプリ起動の妨げにならないよう、ブラウザのアイドル時または遅延で静かに実行
   */
  function scheduleBackgroundCleanup() {
    const runCleanup = async () => {
      try {
        if (typeof firebase === "undefined" || !firebase.database) return;
        const db = firebase.database();
        const now = Date.now();

        // expiresAt が現在時刻以下のものを取得して削除
        const snap = await db.ref(TRANSFER_PATH).orderByChild("expiresAt").endAt(now).once("value");
        if (snap.exists()) {
          const updates = {};
          snap.forEach(child => {
            updates[child.key] = null;
          });
          await db.ref(TRANSFER_PATH).update(updates);
          console.log(`[DataTransfer] 期限切れの一時引き継ぎデータをクリーンアップしました (${Object.keys(updates).length} 件)`);
        }
      } catch (err) {
        // バックグラウンド処理のエラーは握りつぶしてアプリ本体に絶対に影響を与えない
        console.warn("[DataTransfer] バックグラウンドお掃除スキップ:", err.message || err);
      }
    };

    // 起動後5秒待ってから実行（ブラウザが暇なときに実行）
    if (typeof window !== "undefined") {
      setTimeout(() => {
        if ("requestIdleCallback" in window) {
          window.requestIdleCallback(() => runCleanup(), { timeout: 10000 });
        } else {
          runCleanup();
        }
      }, 5000);
    }
  }

  return {
    TRANSFER_STORAGE_KEYS,
    createTransferCode,
    importTransferData,
    scheduleBackgroundCleanup
  };
})();

// グローバル公開 & アプリ起動後の非同期お掃除を予約
window.DataTransfer = DataTransfer;
DataTransfer.scheduleBackgroundCleanup();
