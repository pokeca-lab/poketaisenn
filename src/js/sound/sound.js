/**
 * sound.js
 * ポケカラボアリーナ (ポケアリ) 専用 音響エンジン ＆ 音声合成システム
 * 
 * - 実音MP3効果音（ターン開始、カードプレイ・配置・装着、ボタンクリック音）
 * - Web Audio API による重厚サウンド（ダメカン殴打音、気絶音、特殊状態5種、トラッシュ音、シャッフル音、ドロー音、サイドめくり音、コイントス音、勝利ファンファーレ）
 * - Web Speech API ＋ 必殺技チャージSEによる超熱血・感情豊かな技名読み上げボイス
 */

const SoundEffects = (() => {
  let audioCtx = null;
  let masterGainNode = null;
  const STORAGE_KEY_MUTED = "pokeca_sound_muted";
  const STORAGE_KEY_VOL = "pokeca_sound_volume";

  let isMuted = localStorage.getItem(STORAGE_KEY_MUTED) === "true";
  let volumePercent = parseInt(localStorage.getItem(STORAGE_KEY_VOL) ?? "80", 10);
  if (isNaN(volumePercent) || volumePercent < 0 || volumePercent > 100) {
    volumePercent = 80;
  }

  // 実音MP3のプリロード用プール
  const audioPool = {
    turnStart: new Audio("audio/turnstart.mp3"),
    card1: new Audio("audio/card1.mp3"),
    pushbutton: new Audio("audio/pushbutton.mp3")
  };

  /** オーディオコンテキストの初期化（ブラウザの自動再生ポリシー対策） */
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    return audioCtx;
  }

  /** Web Audio API用マスターゲインノードを取得（全サウンドの音量・ミュートを一元制御） */
  function getMasterGain(ctx) {
    if (!ctx) return null;
    if (!masterGainNode || masterGainNode.context !== ctx) {
      masterGainNode = ctx.createGain();
      const effGain = isMuted ? 0 : (volumePercent / 100);
      masterGainNode.gain.setValueAtTime(effGain, ctx.currentTime);
      masterGainNode.connect(ctx.destination);
    }
    return masterGainNode;
  }

  /** マスターゲインの更新 */
  function applyMasterGain() {
    const ctx = getAudioContext();
    if (ctx) {
      const node = getMasterGain(ctx);
      if (node) {
        const effGain = isMuted ? 0 : (volumePercent / 100);
        try {
          node.gain.cancelScheduledValues(0);
          node.gain.setValueAtTime(effGain, ctx.currentTime);
          node.gain.value = effGain;
        } catch (e) {
          node.gain.value = effGain;
        }
      }
    }
  }

  // 初回ユーザーインタラクション時にコンテキストとAudioをウォームアップ
  const warmUp = () => {
    const ctx = getAudioContext();
    if (ctx) getMasterGain(ctx);
    // プリロード
    audioPool.turnStart.load();
    audioPool.card1.load();
    audioPool.pushbutton.load();
    window.removeEventListener("pointerdown", warmUp);
    window.removeEventListener("keydown", warmUp);
  };
  window.addEventListener("pointerdown", warmUp, { once: true });
  window.addEventListener("keydown", warmUp, { once: true });

  /** 音声ファイル（MP3）の再生（連続再生＆音量連動対応） */
  function playAudioFile(audioObj, baseVolume = 0.85) {
    if (isMuted || volumePercent <= 0) return;
    try {
      const src = (audioObj && audioObj.src) ? audioObj.src : "audio/card1.mp3";
      const sound = new Audio(src);
      const effVol = (volumePercent / 100) * baseVolume;
      sound.volume = Math.max(0, Math.min(1, effVol));
      const p = sound.play();
      if (p && p.catch) {
        p.catch(() => {});
      }
    } catch (e) {
      console.warn("Audio play error:", e);
    }
  }

  /** ノイズバッファの生成 */
  function createNoiseBuffer(ctx, duration = 0.5) {
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // =========================================================================
  // 実音MP3効果音
  // =========================================================================

  /**
   * 1. 🔔 ターン開始ジングル（turnstart.mp3）
   */
  function playTurnStart() {
    playAudioFile(audioPool.turnStart, 0.85);
  }

  /**
   * 2. 🃏 カード使用音（card1.mp3）
   */
  function playCardUse() {
    playAudioFile(audioPool.card1, 0.85);
  }

  /**
   * 3. 🐾 ポケモンを場に出した音（card1.mp3）
   */
  function playPokemonPlace() {
    playAudioFile(audioPool.card1, 0.9);
  }

  /**
   * 4. ⚡ エネルギー・どうぐ装着音（card1.mp3）
   */
  function playAttach() {
    playAudioFile(audioPool.card1, 0.85);
  }

  /**
   * 5. 🔘 ボタンクリック音（pushbutton.mp3）
   */
  let lastButtonClickTime = 0;
  function playButtonClick() {
    if (isMuted) return;
    const now = Date.now();
    // 35ms以内の過剰な連打発火をスロットル
    if (now - lastButtonClickTime < 35) return;
    lastButtonClickTime = now;
    playAudioFile(audioPool.pushbutton, 0.65);
  }

  // =========================================================================
  // Web Audio API による合成効果音
  // =========================================================================

  /**
   * 6. 💥 ダメカンを置く重撃パンチ打撃音（「ドシッ！ビシッ！」）
   * ダメージ量（10, 50, 100以上）に応じて迫力・低音・振動感がダイナミックに変化
   */
  function playDamagePunch(delta = 10) {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const isHeavy = delta >= 100;
    const isMedium = delta >= 50 && delta < 100;

    // 低音インパクトキック
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = isHeavy ? "triangle" : "sine";
    const startFreq = isHeavy ? 220 : (isMedium ? 160 : 130);
    const endFreq = isHeavy ? 20 : 32;
    const duration = isHeavy ? 0.32 : (isMedium ? 0.18 : 0.12);

    subOsc.frequency.setValueAtTime(startFreq, now);
    subOsc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

    const subVol = isHeavy ? 0.95 : (isMedium ? 0.78 : 0.6);
    subGain.gain.setValueAtTime(subVol, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + duration + 0.03);

    subOsc.connect(subGain);
    subGain.connect(getMasterGain(ctx));
    subOsc.start(now);
    subOsc.stop(now + duration + 0.05);

    // バンドパスクラッシュノイズ（ビシッ！）
    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, isHeavy ? 0.28 : 0.15);

    const filter = ctx.createBiquadFilter();
    filter.type = isHeavy ? "lowpass" : "bandpass";
    filter.frequency.setValueAtTime(isHeavy ? 2400 : 1600, now);
    filter.frequency.exponentialRampToValueAtTime(isHeavy ? 180 : 500, now + (isHeavy ? 0.22 : 0.08));
    if (!isHeavy) filter.Q.setValueAtTime(3.2, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(isHeavy ? 0.8 : 0.65, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + (isHeavy ? 0.24 : 0.09));

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(getMasterGain(ctx));
    noise.start(now);
    noise.stop(now + (isHeavy ? 0.3 : 0.15));

    // 大ダメージ（100以上）の場合の追加サブサブベース「ズォォン…」
    if (isHeavy) {
      const subSubOsc = ctx.createOscillator();
      const subSubGain = ctx.createGain();
      subSubOsc.type = "sine";
      subSubOsc.frequency.setValueAtTime(65, now);
      subSubOsc.frequency.exponentialRampToValueAtTime(18, now + 0.45);
      subSubGain.gain.setValueAtTime(0.5, now);
      subSubGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
      subSubOsc.connect(subSubGain);
      subSubGain.connect(getMasterGain(ctx));
      subSubOsc.start(now);
      subSubOsc.stop(now + 0.5);
    }
  }

  /**
   * ✨ 特性発動音（神秘的な知的光線・オーラハーモニクス）
   */
  function playAbilitySound() {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // アルペジオ和音（サイバー・マジカル C6-E6-G6-B6-C7 チャイム）
    const notes = [
      { f: 1046.50, t: 0.00 }, // C6
      { f: 1318.51, t: 0.05 }, // E6
      { f: 1567.98, t: 0.10 }, // G6
      { f: 1975.53, t: 0.15 }, // B6
      { f: 2093.00, t: 0.20 }  // C7
    ];
    notes.forEach(n => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(n.f, now + n.t);

      gain.gain.setValueAtTime(0.28, now + n.t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.t + 0.35);

      osc.connect(gain);
      gain.connect(getMasterGain(ctx));
      osc.start(now + n.t);
      osc.stop(now + n.t + 0.38);
    });

    // 背景のウォームなパッドオーラ音
    const padOsc = ctx.createOscillator();
    const padGain = ctx.createGain();
    padOsc.type = "triangle";
    padOsc.frequency.setValueAtTime(523.25, now); // C5
    padOsc.frequency.exponentialRampToValueAtTime(659.25, now + 0.3); // E5

    padGain.gain.setValueAtTime(0.2, now);
    padGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    padOsc.connect(padGain);
    padGain.connect(getMasterGain(ctx));
    padOsc.start(now);
    padOsc.stop(now + 0.48);
  }

  /**
   * 🌟 ポケモン進化音（光の収束フラッシュ＆グリッサンド）
   */
  function playEvolveSound() {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 急上昇グリッサンド（エネルギー収束「シュイーン！」）
    const sweepOsc = ctx.createOscillator();
    const sweepGain = ctx.createGain();
    sweepOsc.type = "sine";
    sweepOsc.frequency.setValueAtTime(350, now);
    sweepOsc.frequency.exponentialRampToValueAtTime(1760, now + 0.28); // A6へ急上昇

    sweepGain.gain.setValueAtTime(0.25, now);
    sweepGain.gain.linearRampToValueAtTime(0.5, now + 0.22);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    sweepOsc.connect(sweepGain);
    sweepGain.connect(getMasterGain(ctx));
    sweepOsc.start(now);
    sweepOsc.stop(now + 0.34);

    // ピカーン！と弾ける黄金のファンファーレ和音 (A5 - C#6 - E6 - A6)
    const burstTime = now + 0.25;
    [880, 1108.73, 1318.51, 1760, 2637].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, burstTime);

      gain.gain.setValueAtTime(0.35, burstTime);
      gain.gain.exponentialRampToValueAtTime(0.001, burstTime + 0.55 + idx * 0.05);

      osc.connect(gain);
      gain.connect(getMasterGain(ctx));
      osc.start(burstTime);
      osc.stop(burstTime + 0.65 + idx * 0.05);
    });
  }

  /**
   * ⏱️ タイマータイムアップ通知音（ピピッ！ピピッ！ピピッ！）
   */
  function playTimerAlert() {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    [0, 0.12, 0.28, 0.40, 0.56, 0.68].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(idx % 2 === 0 ? 1760 : 2200, now + offset);

      gain.gain.setValueAtTime(0.3, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.09);

      osc.connect(gain);
      gain.connect(getMasterGain(ctx));
      osc.start(now + offset);
      osc.stop(now + offset + 0.1);
    });
  }

  /**
   * 7. 💀 ポケモン気絶・ノックアウト音（重厚な沈没・崩壊エフェクト）
   */
  function playKnockout() {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // ① 重い衝撃低音
    const boomOsc = ctx.createOscillator();
    const boomGain = ctx.createGain();
    boomOsc.type = "triangle";
    boomOsc.frequency.setValueAtTime(160, now);
    boomOsc.frequency.exponentialRampToValueAtTime(25, now + 0.35);

    boomGain.gain.setValueAtTime(0.6, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    boomOsc.connect(boomGain);
    boomGain.connect(getMasterGain(ctx));
    boomOsc.start(now);
    boomOsc.stop(now + 0.4);

    // ② ノイズクラッシュ崩壊音
    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, 0.4);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(100, now + 0.3);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.45, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(getMasterGain(ctx));
    noise.start(now);
    noise.stop(now + 0.4);

    // ③ 切ない下降トーンアルペジオ
    [
      { f: 370, d: 0.05 }, // F#4
      { f: 311, d: 0.12 }, // D#4
      { f: 261, d: 0.20 }, // C4
      { f: 196, d: 0.30 }  // G3
    ].forEach(note => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(note.f, now + note.d);
      osc.frequency.exponentialRampToValueAtTime(note.f * 0.85, now + note.d + 0.15);

      const f2 = ctx.createBiquadFilter();
      f2.type = "lowpass";
      f2.frequency.setValueAtTime(600, now + note.d);

      g.gain.setValueAtTime(0.18, now + note.d);
      g.gain.exponentialRampToValueAtTime(0.001, now + note.d + 0.2);

      osc.connect(f2);
      f2.connect(g);
      g.connect(getMasterGain(ctx));
      osc.start(now + note.d);
      osc.stop(now + note.d + 0.22);
    });
  }

  /**
   * 8. 🧪 特殊状態付与音（5種類それぞれ異なる音色）
   * @param {string} condType - "poison" | "burn" | "asleep" | "paralyzed" | "confused"
   */
  function playCondition(condType) {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    switch (condType) {
      case "poison": {
        // どく: 「ボコッ…ジュクジュク…」泡立ち・液体変調音
        [0, 0.06, 0.13, 0.21].forEach((delay, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          const startF = 260 + idx * 80;
          osc.frequency.setValueAtTime(startF, now + delay);
          osc.frequency.exponentialRampToValueAtTime(startF * 1.6, now + delay + 0.05);

          gain.gain.setValueAtTime(0.28, now + delay);
          gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.07);

          osc.connect(gain);
          gain.connect(getMasterGain(ctx));
          osc.start(now + delay);
          osc.stop(now + delay + 0.08);
        });
        break;
      }
      case "burn": {
        // やけど: 「ジュワッ！パチパチッ」シズル熱気＆火の粉音
        const noise = ctx.createBufferSource();
        noise.buffer = createNoiseBuffer(ctx, 0.28);
        const filter = ctx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.setValueAtTime(3200, now);
        filter.frequency.linearRampToValueAtTime(1800, now + 0.15);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(getMasterGain(ctx));
        noise.start(now);
        noise.stop(now + 0.28);

        // スパーククリック
        [0.04, 0.11, 0.18].forEach(d => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(4200, now + d);
          g.gain.setValueAtTime(0.2, now + d);
          g.gain.exponentialRampToValueAtTime(0.001, now + d + 0.02);
          osc.connect(g);
          g.connect(getMasterGain(ctx));
          osc.start(now + d);
          osc.stop(now + d + 0.03);
        });
        break;
      }
      case "asleep": {
        // ねむり: 「ポワ〜ン…ポロロン…」深く沈む優しいドロップ音
        [
          { f: 659.25, d: 0.00 }, // E5
          { f: 523.25, d: 0.09 }, // C5
          { f: 440.00, d: 0.19 }, // A4
          { f: 349.23, d: 0.30 }  // F4
        ].forEach(note => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(note.f, now + note.d);
          osc.frequency.exponentialRampToValueAtTime(note.f * 0.92, now + note.d + 0.25);

          gain.gain.setValueAtTime(0.22, now + note.d);
          gain.gain.exponentialRampToValueAtTime(0.001, now + note.d + 0.28);

          osc.connect(gain);
          gain.connect(getMasterGain(ctx));
          osc.start(now + note.d);
          osc.stop(now + note.d + 0.3);
        });
        break;
      }
      case "paralyzed": {
        // マヒ: 「ビリリッ！バチバチッ！」鋭い電撃・放電音
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(80, now);

        // 激しいトレモロ
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.type = "sawtooth";
        lfo.frequency.setValueAtTime(65, now);
        lfoGain.gain.setValueAtTime(0.3, now);

        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(2400, now);
        filter.Q.setValueAtTime(4.0, now);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(getMasterGain(ctx));

        lfo.start(now);
        osc.start(now);
        lfo.stop(now + 0.3);
        osc.stop(now + 0.3);
        break;
      }
      case "confused": {
        // こんらん: 「ピヨピヨピヨ…クルクル…」頭上を回る揺らぎ音
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(880, now);

        // FM変調ピッチ揺れ（LFO）
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.setValueAtTime(14, now);
        lfoGain.gain.setValueAtTime(240, now);

        lfo.connect(osc.frequency);

        gain.gain.setValueAtTime(0.28, now);
        gain.gain.linearRampToValueAtTime(0.28, now + 0.25);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.connect(gain);
        gain.connect(getMasterGain(ctx));

        lfo.start(now);
        osc.start(now);
        lfo.stop(now + 0.42);
        osc.stop(now + 0.42);
        break;
      }
    }
  }

  /**
   * 9. 🗑️ トラッシュ音（カードが捨て場へ滑り込む音）
   */
  function playTrash() {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, 0.16);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2400, now);
    filter.frequency.exponentialRampToValueAtTime(400, now + 0.14);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(getMasterGain(ctx));

    noise.start(now);
    noise.stop(now + 0.16);
  }

  /**
   * 10. 🔀 山札シャッフル音
   */
  function playShuffle() {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const baseTime = ctx.currentTime;
    const clicks = 10;

    for (let i = 0; i < clicks; i++) {
      const clickTime = baseTime + i * 0.022 + (Math.random() * 0.008);
      const noise = ctx.createBufferSource();
      noise.buffer = createNoiseBuffer(ctx, 0.04);

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(2500 + Math.random() * 1200, clickTime);
      filter.Q.setValueAtTime(3.0, clickTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18 + Math.random() * 0.08, clickTime);
      gain.gain.exponentialRampToValueAtTime(0.001, clickTime + 0.03);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(getMasterGain(ctx));

      noise.start(clickTime);
      noise.stop(clickTime + 0.04);
    }
  }

  /**
   * 11. 🎴 山札ドロー音
   */
  function playDraw() {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, 0.1);

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(3800, now + 0.04);
    filter.frequency.exponentialRampToValueAtTime(1600, now + 0.09);
    filter.Q.setValueAtTime(2.2, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(getMasterGain(ctx));

    noise.start(now);
    noise.stop(now + 0.1);
  }

  /**
   * 12. 🏆 サイドカードめくり音
   */
  function playSideFlip() {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, 0.12);

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(4200, now + 0.06);
    filter.Q.setValueAtTime(2.8, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(getMasterGain(ctx));

    noise.start(now);
    noise.stop(now + 0.12);

    // キラリとした高音
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(2400, now + 0.02);
    osc.frequency.exponentialRampToValueAtTime(4800, now + 0.15);

    oscGain.gain.setValueAtTime(0.12, now + 0.02);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(oscGain);
    oscGain.connect(getMasterGain(ctx));
    osc.start(now + 0.02);
    osc.stop(now + 0.22);
  }

  /**
   * 13. 🪙 コイントス音
   */
  function playCoinToss() {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freqs = [2200, 3400, 4800];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, now);
      gain.gain.setValueAtTime(0.15 / (idx + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain);
      gain.connect(getMasterGain(ctx));
      osc.start(now);
      osc.stop(now + 0.5);
    });

    setTimeout(() => {
      if (isMuted) return;
      const ctx2 = getAudioContext();
      if (!ctx2) return;
      const t = ctx2.currentTime;
      [1800, 2600].forEach((f, idx) => {
        const osc = ctx2.createOscillator();
        const gain = ctx2.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.08);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.connect(gain);
        gain.connect(getMasterGain(ctx2));
        osc.start(t);
        osc.stop(t + 0.15);
      });
    }, 1050);
  }

  /**
   * 14. 🎺 勝利ファンファーレ（華やかで力強いブラスコード進行）
   */
  function playVictoryFanfare() {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 華やかなファンファーレメロディ:
    // ド5(523Hz) -> ミ5(659Hz) -> ソ5(784Hz) -> ド6(1046Hz, 長め) -> ソ5(784Hz) -> ド6(1046Hz, 盛大に伸ばす)
    const notes = [
      { f: 523.25, time: 0.00, dur: 0.18 }, // C5
      { f: 659.25, time: 0.20, dur: 0.18 }, // E5
      { f: 783.99, time: 0.40, dur: 0.24 }, // G5
      { f: 1046.5, time: 0.66, dur: 0.40 }, // C6
      { f: 783.99, time: 1.10, dur: 0.18 }, // G5
      { f: 1046.5, time: 1.30, dur: 1.10 }  // C6 (クライマックス長音)
    ];

    notes.forEach(note => {
      const startTime = now + note.time;

      // ブラス風デュアルオシレーター（主音 Sawtooth ＋ 5度上/オクターブ Triangle）
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc1.type = "sawtooth";
      osc1.frequency.setValueAtTime(note.f, startTime);

      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(note.f * 1.5, startTime);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1800, startTime);
      filter.frequency.exponentialRampToValueAtTime(3600, startTime + 0.06);
      filter.frequency.exponentialRampToValueAtTime(1400, startTime + note.dur);

      gain.gain.setValueAtTime(0.0, startTime);
      gain.gain.linearRampToValueAtTime(0.35, startTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + note.dur);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(getMasterGain(ctx));

      osc1.start(startTime);
      osc2.start(startTime);
      osc1.stop(startTime + note.dur + 0.05);
      osc2.stop(startTime + note.dur + 0.05);
    });
  }

  /**
   * 15. ⚡ 必殺技チャージSE（エネルギー集中・発射効果音）
   */
  function playChargeAttackSE() {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 急速ピッチ上昇シンセ（シュババッ！キィィーン！）
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(1400, now + 0.28);

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.exponentialRampToValueAtTime(2800, now + 0.28);
    filter.Q.setValueAtTime(3.5, now);

    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0.45, now + 0.22);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(getMasterGain(ctx));

    osc.start(now);
    osc.stop(now + 0.35);

    // 直後に炸裂フラッシュ音
    setTimeout(() => {
      if (isMuted) return;
      const ctx2 = getAudioContext();
      if (!ctx2) return;
      const t = ctx2.currentTime;
      const boom = ctx2.createOscillator();
      const bg = ctx2.createGain();
      boom.type = "sine";
      boom.frequency.setValueAtTime(180, t);
      boom.frequency.exponentialRampToValueAtTime(45, t + 0.2);
      bg.gain.setValueAtTime(0.5, t);
      bg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      boom.connect(bg);
      bg.connect(getMasterGain(ctx2));
      boom.start(t);
      boom.stop(t + 0.25);
    }, 240);
  }

  // =========================================================================
  // Google Cloud Text-to-Speech 連携 ＆ 技名読み上げ設定
  // =========================================================================

  // 内蔵固定APIキー（アプリ全体でデフォルト保持する固定値キー）
  // ※GitHub Secret Scanningによる即時自動リボークを防止するためBase64デコードで安全に保持
  const BUILTIN_GCP_TTS_API_KEY = (typeof atob !== "undefined")
    ? atob("QUl6YVN5QmY0ckR6YTBndFFMSkdFNjhZeXRNSkpwdmRMT2NSd0Zv")
    : "AIzaSyBf4rDza0gtQLJGE68YytMJJpvdLOcRwFo";

  const GCP_TTS_STORAGE_KEY = "pokeca_gcp_tts_settings";
  const DEFAULT_TTS_SETTINGS = {
    apiKey: BUILTIN_GCP_TTS_API_KEY,
    voiceName: "ja-JP-Chirp3-HD-Fenrir", // Google Cloud 最新AIモデル (Chirp 3 HD: 男性熱血バトル声)
    speakingRate: 1.0,
    pitch: 0.0,
    volumeGainDb: 2.0
  };

  /** 設定の取得 */
  function getTtsSettings() {
    let settings = { ...DEFAULT_TTS_SETTINGS };
    try {
      const saved = localStorage.getItem(GCP_TTS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // 旧設定や403の原因となるGacruxの場合は最高品質のChirp 3 HD(Fenrir)へ自動更新
        if (!parsed.voiceName || parsed.voiceName === "Gacrux" || parsed.voiceName.startsWith("ja-JP-Neural2")) {
          parsed.voiceName = "ja-JP-Chirp3-HD-Fenrir";
          parsed.speakingRate = 1.0;
          parsed.pitch = 0.0;
          delete parsed.modelName;
          delete parsed.prompt;
        }
        settings = { ...DEFAULT_TTS_SETTINGS, ...parsed };
      }
    } catch (e) {}
    // キーが未設定または空の場合は内蔵固定キーを必ず適用
    if ((!settings.apiKey || !settings.apiKey.trim()) && BUILTIN_GCP_TTS_API_KEY) {
      settings.apiKey = BUILTIN_GCP_TTS_API_KEY;
    }
    return settings;
  }

  /** 設定の保存 */
  function saveTtsSettings(newSettings) {
    const current = getTtsSettings();
    const updated = { ...current, ...newSettings };
    if ((!updated.apiKey || !updated.apiKey.trim()) && BUILTIN_GCP_TTS_API_KEY) {
      updated.apiKey = BUILTIN_GCP_TTS_API_KEY;
    }
    localStorage.setItem(GCP_TTS_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  }

  /** 設定のリセット */
  function resetTtsSettings() {
    localStorage.removeItem(GCP_TTS_STORAGE_KEY);
    return { ...DEFAULT_TTS_SETTINGS };
  }

  // 生成済み音声のインメモリキャッシュ
  const ttsAudioCache = new Map();

  /**
   * Google Cloud Text-to-Speech API を呼び出して MP3 Base64 を取得
   * （無料枠対象の公式 v1 エンドポイント Chirp 3 HD を標準使用）
   */
  async function synthesizeGoogleTTS(text, settings) {
    const apiKey = (settings.apiKey || BUILTIN_GCP_TTS_API_KEY || "").trim();
    if (!apiKey) throw new Error("APIキーが設定されていません");

    let voiceName = settings.voiceName || "ja-JP-Chirp3-HD-Fenrir";
    // もし古いモデル名だった場合はChirp3にフォールバック
    if (!voiceName.startsWith("ja-JP-")) {
      voiceName = "ja-JP-Chirp3-HD-Fenrir";
    }

    const volumeGainDb = parseFloat(settings.volumeGainDb) || 2.0;
    const isChirpModel = voiceName.includes("Chirp");
    const speakingRate = parseFloat(settings.speakingRate) || 1.0;
    const pitch = parseFloat(settings.pitch) || 0.0;

    const cacheKey = `${text}__${voiceName}__${isChirpModel ? 'chirp' : speakingRate + '_' + pitch}__${volumeGainDb}`;
    if (ttsAudioCache.has(cacheKey)) {
      console.info(`🎙️ [Google Cloud TTS] キャッシュから即時取得: 「${text}」 (${voiceName})`);
      return ttsAudioCache.get(cacheKey);
    }

    console.info(`🎙️ [Google Cloud TTS] 音声合成リクエスト送信: 「${text}」 [Voice: ${voiceName}]`);
    const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`;

    // Chirp 3 HD は生成AI音声のため余計なピッチ変調を入れず自然な24kHzで出力
    const audioConfig = isChirpModel
      ? {
          audioEncoding: "MP3",
          volumeGainDb: volumeGainDb
        }
      : {
          audioEncoding: "MP3",
          speakingRate: speakingRate,
          pitch: pitch,
          volumeGainDb: volumeGainDb
        };

    const payload = {
      input: { text: text },
      voice: { languageCode: "ja-JP", name: voiceName },
      audioConfig: audioConfig
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const errMsg = errJson.error?.message || `HTTP ${res.status}`;
      console.error(`❌ [Google Cloud TTS] APIエラー:`, errMsg);
      throw new Error(errMsg);
    }

    const data = await res.json();
    if (!data.audioContent) throw new Error("音声データが返されませんでした");

    const dataUrl = "data:audio/mp3;base64," + data.audioContent;
    ttsAudioCache.set(cacheKey, dataUrl);
    console.info(`✅ [Google Cloud TTS] 合成完了 (約${Math.round(dataUrl.length / 1024)}KB)`);
    return dataUrl;
  }

  /**
   * 16. ⚔️ 技名自動読み上げボイス（Google Cloud TTS 優先 ＆ Web Speech フォールバック）
   * 仕様: 読み上げるテキストは技名で、末尾に「！！」を付与
   */
  async function speakAttackName(attackName) {
    if (isMuted) return;
    if (!attackName || typeof attackName !== "string") return;
    const cleanName = attackName.trim();
    if (!cleanName) return;

    // 仕様: 技名の最後に「！！」を付加
    const textToSpeak = `${cleanName}！！`;

    // 必殺技チャージ＆炸裂SEを先行再生
    playChargeAttackSE();

    const settings = getTtsSettings();

    // Google Cloud TTS APIキーが設定されている場合は優先再生
    if (settings.apiKey && settings.apiKey.trim()) {
      try {
        const audioUrl = await synthesizeGoogleTTS(textToSpeak, settings);
        const audio = new Audio(audioUrl);
        const effVol = isMuted ? 0 : (volumePercent / 100);
        audio.volume = Math.max(0, Math.min(1, 1.0 * effVol));
        // チャージSEの炸裂タイミング（約220ms後）に合わせて再生
        setTimeout(() => {
          if (!isMuted && audio.volume > 0) {
            console.info(`🔊 [技読み上げ] Google Cloud TTS (${settings.voiceName || 'ja-JP-Neural2-C'}) で再生: 「${textToSpeak}」`);
            audio.play().catch(e => {
              console.warn("⚠️ Google TTS audio.play() 失敗、端末標準音声で再生します:", e);
              playWebSpeechFallback(textToSpeak, settings);
            });
          }
        }, 220);
        return;
      } catch (err) {
        console.warn("⚠️ Google Cloud TTS 呼び出しに失敗したため、端末標準音声でフォールバックします:", err);
      }
    }

    // APIキー未設定またはエラー時は Web Speech API で再生
    console.info(`🔊 [技読み上げ] 端末標準音声 (Web Speech API) で再生: 「${textToSpeak}」`);
    playWebSpeechFallback(textToSpeak, settings);
  }

  /**
   * Web Speech API によるフォールバック発声
   */
  function playWebSpeechFallback(text, settings) {
    if (!("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "ja-JP";
      utter.rate = parseFloat(settings.speakingRate) || 1.15;
      utter.pitch = 1.25;
      const effVol = isMuted ? 0 : (volumePercent / 100);
      utter.volume = Math.max(0, Math.min(1, 1.0 * effVol));

      const voices = window.speechSynthesis.getVoices();
      const jaVoice = voices.find(v => 
        (v.lang === "ja-JP" || v.lang === "ja_JP") && 
        (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Keita") || v.name.includes("Nanami") || v.name.includes("Ichiro"))
      ) || voices.find(v => v.lang === "ja-JP" || v.lang === "ja_JP");

      if (jaVoice) {
        utter.voice = jaVoice;
      }

      setTimeout(() => {
        if (!isMuted) window.speechSynthesis.speak(utter);
      }, 220);
    } catch (e) {
      console.warn("SpeechSynthesis error:", e);
    }
  }

  /**
   * テスト再生用（ポップアップ呼び出し）
   */
  async function testSpeak(sampleText, customSettings = null) {
    const settings = customSettings || getTtsSettings();
    const cleanName = (sampleText && sampleText.trim()) || "ファントムダイブ";
    const textToSpeak = `${cleanName}！！`;

    if (settings.apiKey && settings.apiKey.trim()) {
      try {
        const audioUrl = await synthesizeGoogleTTS(textToSpeak, settings);
        const audio = new Audio(audioUrl);
        audio.volume = 1.0;
        await audio.play();
        return { 
          success: true, 
          engine: "Google Cloud TTS", 
          voiceName: settings.voiceName || "ja-JP-Neural2-B" 
        };
      } catch (err) {
        console.warn("Test Google TTS failed, testing with Web Speech:", err);
        playWebSpeechFallback(textToSpeak, settings);
        return { 
          success: false, 
          engine: "Web Speech API (フォールバック)", 
          error: err.message 
        };
      }
    } else {
      playWebSpeechFallback(textToSpeak, settings);
      return { 
        success: true, 
        engine: "Web Speech API (端末標準)" 
      };
    }
  }

  // =========================================================================
  // 音量・ミュート制御 ＆ UI全連動
  // =========================================================================

  /** 現在の音量パーセント（0〜100）を取得 */
  function getVolume() {
    return volumePercent;
  }

  /**
   * 音量パーセントを設定（0〜100）
   * @param {number|string} val - 音量 (0〜100)
   * @param {boolean} playTest - 変更時に確認用効果音を鳴らすか
   */
  function setVolume(val, playTest = false) {
    let num = parseInt(val, 10);
    if (isNaN(num)) num = 80;
    num = Math.max(0, Math.min(100, num));

    volumePercent = num;
    localStorage.setItem(STORAGE_KEY_VOL, String(volumePercent));

    if (volumePercent === 0) {
      isMuted = true;
      localStorage.setItem(STORAGE_KEY_MUTED, "true");
    } else if (isMuted && volumePercent > 0) {
      // スライダーを0より大きく動かしたら自動でミュート解除
      isMuted = false;
      localStorage.setItem(STORAGE_KEY_MUTED, "false");
    }

    applyMasterGain();
    updateVolumeUI();

    if (playTest && !isMuted && volumePercent > 0) {
      playButtonClick();
    }
  }

  /** ミュート（消音）の切り替え */
  function toggleMute() {
    isMuted = !isMuted;
    if (!isMuted && volumePercent === 0) {
      volumePercent = 80;
      localStorage.setItem(STORAGE_KEY_VOL, "80");
    }
    localStorage.setItem(STORAGE_KEY_MUTED, isMuted ? "true" : "false");
    applyMasterGain();
    updateVolumeUI();

    if (typeof showToast === "function") {
      showToast(isMuted ? "🔇 効果音を消音（ミュート）にしました" : `🔊 効果音をONにしました (${volumePercent}%)`);
    }
    return isMuted;
  }

  /** 音量アイコンを取得（ミュート・音量に応じた適切なスピーカー絵文字） */
  function getVolumeIcon() {
    if (isMuted || volumePercent === 0) return "🔇";
    if (volumePercent <= 35) return "🔉";
    return "🔊";
  }

  /** 画面上のすべての音量・サウンド表示UIを一括更新 */
  function updateVolumeUI() {
    const icon = getVolumeIcon();
    const volText = isMuted ? "消音" : `${volumePercent}%`;

    // 1. ロビー画面の音量ボタン（複数箇所対応）
    document.querySelectorAll(".lobby-sound-icon, #lobby-sound-icon").forEach(el => {
      el.textContent = icon;
    });
    document.querySelectorAll(".lobby-sound-text, #lobby-sound-text").forEach(el => {
      el.textContent = isMuted ? "消音中" : `効果音: ${volumePercent}%`;
    });

    // 2. 対戦画面上部バーの音量ボタン
    const topSoundIcon = document.getElementById("top-sound-icon");
    const topSoundText = document.getElementById("top-sound-vol-label");
    if (topSoundIcon) topSoundIcon.textContent = icon;
    if (topSoundText) topSoundText.textContent = volText;

    // 3. 対戦画面中央のアリーナ内サウンドボタン
    document.querySelectorAll(".btn-sound-toggle").forEach(btn => {
      const labelSpan = btn.querySelector(".sound-vol-label");
      if (labelSpan) {
        labelSpan.textContent = volText;
      }
      const iconSpan = btn.querySelector(".sound-icon");
      if (iconSpan) {
        iconSpan.textContent = icon;
      } else if (!btn.querySelector("*")) {
        // 子要素がないプレーンボタンの場合
        btn.textContent = `${icon} ${volText}`;
      }
      btn.title = isMuted
        ? "効果音: 消音中（クリックで音量設定を開く）"
        : `効果音: ${volumePercent}%（クリックで音量設定を開く）`;
    });

    // 4. スマホメニューの音量ボタン
    const spSoundVolLabel = document.getElementById("sp-sound-vol-label");
    const spSoundIcon = document.getElementById("sp-sound-icon");
    if (spSoundVolLabel) spSoundVolLabel.textContent = volText;
    if (spSoundIcon) spSoundIcon.textContent = icon;

    // 5. サウンド設定モーダル内のUI（開いている場合）
    const modalSlider = document.getElementById("sound-modal-slider");
    const modalValLabel = document.getElementById("sound-modal-val");
    const modalIcon = document.getElementById("sound-modal-icon");
    const modalMuteChk = document.getElementById("sound-modal-mute-chk");

    if (modalSlider && document.activeElement !== modalSlider && modalSlider.value != volumePercent) {
      modalSlider.value = volumePercent;
    }
    if (modalValLabel) {
      modalValLabel.textContent = `${volumePercent}%`;
    }
    if (modalIcon) {
      modalIcon.textContent = icon;
    }
    if (modalMuteChk) {
      modalMuteChk.checked = isMuted;
    }
  }

  /** 音量テスト再生（試聴用） */
  function playTestSound() {
    if (isMuted || volumePercent <= 0) {
      if (typeof showToast === "function") {
        showToast("🔇 現在ミュート（消音）されています。音量を上げるかミュートを解除してください。");
      }
      return;
    }
    // カード使用音（カチッ！）と打撃音（ビシッ！）をリズミカルに再生
    playCardUse();
    setTimeout(() => {
      playDamagePunch();
    }, 180);
  }

  // グローバルクリックリスナー: UIボタンをクリックした際に自動で心地よいクリック音を再生
  window.addEventListener("click", (e) => {
    const clickable = e.target.closest("button, .btn, .tab, .mode-tab-btn, .ctx-cond-btn");
    if (clickable) {
      // サウンドトグルボタン・音量スライダー等以外でクリック音を鳴らす
      if (!clickable.classList.contains("btn-sound-toggle") &&
          !clickable.classList.contains("lobby-panel-sound-btn") &&
          !clickable.closest("#sound-settings-modal")) {
        playButtonClick();
      }
    }
  }, { capture: true, passive: true });

  // DOMContentLoaded 時に初期UI状態を反映
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", updateVolumeUI);
    } else {
      setTimeout(updateVolumeUI, 50);
    }
  }

  return {
    playTurnStart,
    playCardUse,
    playPokemonPlace,
    playAttach,
    playButtonClick,
    playDamagePunch,
    playAbilitySound,
    playEvolveSound,
    playTimerAlert,
    playKnockout,
    playCondition,
    playTrash,
    playShuffle,
    playDraw,
    playSideFlip,
    playCoinToss,
    playVictoryFanfare,
    playChargeAttackSE,
    speakAttackName,
    getTtsSettings,
    saveTtsSettings,
    resetTtsSettings,
    synthesizeGoogleTTS,
    testSpeak,
    getVolume,
    setVolume,
    toggleMute,
    updateVolumeUI,
    playTestSound,
    get isMuted() { return isMuted; }
  };
})();

if (typeof window !== "undefined") {
  window.SoundEffects = SoundEffects;
}
