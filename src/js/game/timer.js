/**
 * timer.js - 対戦タイマー管理モジュール
 *
 * 【機能】
 * 1. カウントアップ（00:00〜：デフォルトの経過時間計測）
 * 2. カウントダウン（公式大会用 25:00〜、15分、30分、カスタム）
 * 3. 視覚的アラート（残り5分で黄色ハイライト、残り1分で赤色点滅、0秒でタイムアップ通知音）
 * 4. トップメニューでのコンパクト表示（⏱️ 25:00 ⚙️）
 * 5. クリックで一時停止/再開、⚙️アイコンで詳細設定モーダル表示
 */

const BattleTimer = (() => {
  let seconds = 0; // カウントアップ時は経過秒数、カウントダウン時は残り秒数
  let isRunning = false;
  let timerId = null;
  let mode = "countup"; // "countup" | "countdown"
  let initialCountdownMinutes = 25; // デフォルト25分
  let initialCountdownSeconds = 25 * 60;

  const WARN_SECONDS = 5 * 60; // 5分以下で警告
  const DANGER_SECONDS = 1 * 60; // 1分以下で緊急

  /** 秒数を "MM:SS" または "HH:MM:SS" にフォーマット */
  function formatTime(totalSec) {
    const s = Math.max(0, Math.floor(totalSec));
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const remSeconds = s % 60;

    const pad = (num) => String(num).padStart(2, "0");

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(remSeconds)}`;
    }
    return `${pad(minutes)}:${pad(remSeconds)}`;
  }

  /** 表示を更新 */
  function updateDisplay() {
    const displayEl = document.getElementById("battle-timer-display");
    const widgetEl = document.getElementById("battle-timer-widget");
    if (!displayEl || !widgetEl) return;

    displayEl.textContent = formatTime(seconds);

    // クラス切り替え
    widgetEl.classList.remove("is-running", "is-paused", "is-warning", "is-danger");

    if (isRunning) {
      widgetEl.classList.add("is-running");
    } else {
      widgetEl.classList.add("is-paused");
    }

    if (mode === "countdown") {
      if (seconds <= DANGER_SECONDS) {
        widgetEl.classList.add("is-danger");
      } else if (seconds <= WARN_SECONDS) {
        widgetEl.classList.add("is-warning");
      }
    }
  }

  /** 1秒ごとの更新ティック */
  function tick() {
    if (!isRunning) return;

    if (mode === "countup") {
      seconds++;
      updateDisplay();
    } else {
      if (seconds > 0) {
        seconds--;
        updateDisplay();
        if (seconds === 0) {
          pause();
          if (typeof showToast === "function") {
            showToast("⏱️ 【タイムアップ！】制限時間に達しました", 6000);
          }
          if (window.SoundEffects && typeof SoundEffects.playTimerAlert === "function") {
            SoundEffects.playTimerAlert();
          }
        }
      } else {
        pause();
      }
    }
  }

  /** タイマー開始 */
  function start() {
    if (isRunning) return;
    isRunning = true;
    if (!timerId) {
      timerId = setInterval(tick, 1000);
    }
    updateDisplay();
  }

  /** タイマー一時停止 */
  function pause() {
    isRunning = false;
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    updateDisplay();
  }

  /** 再開 / 一時停止のトグル */
  function toggle() {
    if (isRunning) {
      pause();
      if (typeof showToast === "function") {
        showToast("⏸️ 対戦タイマーを一時停止しました");
      }
    } else {
      start();
      if (typeof showToast === "function") {
        showToast("▶️ 対戦タイマーを再開しました");
      }
    }
  }

  /** タイマーのリセット */
  function reset(newMode = mode, customSeconds = null) {
    pause();
    mode = newMode;
    if (mode === "countup") {
      seconds = 0;
    } else {
      if (customSeconds !== null) {
        initialCountdownSeconds = customSeconds;
      } else {
        initialCountdownSeconds = initialCountdownMinutes * 60;
      }
      seconds = initialCountdownSeconds;
    }
    updateDisplay();
  }

  /** モードの設定 */
  function setMode(newMode, minutes = 25) {
    initialCountdownMinutes = minutes;
    reset(newMode, minutes * 60);
  }

  /** 設定モーダルを開く */
  function openSettings() {
    const modal = document.getElementById("timer-settings-modal");
    if (!modal) return;

    // 現在の状態をフォームに反映
    const radioCountup = document.getElementById("timer-opt-countup");
    const radioCountdown = document.getElementById("timer-opt-countdown");
    const countdownOptions = document.getElementById("timer-countdown-options");

    if (mode === "countdown") {
      if (radioCountdown) radioCountdown.checked = true;
      if (countdownOptions) countdownOptions.style.display = "block";
    } else {
      if (radioCountup) radioCountup.checked = true;
      if (countdownOptions) countdownOptions.style.display = "none";
    }

    const selectPreset = document.getElementById("timer-preset-select");
    if (selectPreset) {
      const matchOpt = Array.from(selectPreset.options).find(o => o.value === String(initialCountdownMinutes));
      if (matchOpt) {
        selectPreset.value = String(initialCountdownMinutes);
      } else {
        selectPreset.value = "custom";
        const customInput = document.getElementById("timer-custom-minutes");
        if (customInput) customInput.value = initialCountdownMinutes;
      }
      updateCustomInputVisibility();
    }

    modal.classList.remove("hidden");
  }

  /** 設定モーダルを閉じる */
  function closeSettings() {
    const modal = document.getElementById("timer-settings-modal");
    if (modal) modal.classList.add("hidden");
  }

  /** カスタム入力の表示/非表示 */
  function updateCustomInputVisibility() {
    const selectPreset = document.getElementById("timer-preset-select");
    const customWrap = document.getElementById("timer-custom-wrap");
    if (selectPreset && customWrap) {
      customWrap.style.display = selectPreset.value === "custom" ? "block" : "none";
    }
  }

  /** モーダルで「適用して開始 / リセット」 */
  function applySettings(autoStart = false) {
    const radioCountdown = document.getElementById("timer-opt-countdown");
    const isCountdown = radioCountdown && radioCountdown.checked;

    if (isCountdown) {
      const selectPreset = document.getElementById("timer-preset-select");
      let mins = 25;
      if (selectPreset) {
        if (selectPreset.value === "custom") {
          const customInput = document.getElementById("timer-custom-minutes");
          mins = customInput ? Math.max(1, parseInt(customInput.value, 10) || 25) : 25;
        } else {
          mins = parseInt(selectPreset.value, 10) || 25;
        }
      }
      setMode("countdown", mins);
    } else {
      setMode("countup");
    }

    closeSettings();
    if (autoStart) {
      start();
    }
    if (typeof showToast === "function") {
      showToast(isCountdown ? `⏱️ カウントダウンタイマー（${initialCountdownMinutes}分）を設定しました` : "⏱️ カウントアップタイマー（00:00〜）を設定しました");
    }
  }

  /** 初期化 */
  function init() {
    updateDisplay();
  }

  return {
    init,
    start,
    pause,
    toggle,
    reset,
    setMode,
    openSettings,
    closeSettings,
    updateCustomInputVisibility,
    applySettings,
    formatTime,
    get isRunning() { return isRunning; },
    get seconds() { return seconds; },
    get mode() { return mode; }
  };
})();

if (typeof window !== "undefined") {
  window.BattleTimer = BattleTimer;
  document.addEventListener("DOMContentLoaded", () => {
    BattleTimer.init();
  });
}
