/**
 * PokéCa Lab Arena - Voice Chat Module (WebRTC Native Audio)
 * ブラウザ標準 RTCPeerConnection ＆ Firebase リアルタイムシグナリングによる超低遅延ボイスチャット
 */

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

const VoiceChat = {
  _iceCandidateQueue: [],

  // ---- RTCPeerConnection 生成 & イベントバインド ----
  _createPeerConnection() {
    this._closePeerConnection();

    const pc = new RTCPeerConnection(RTC_CONFIG);
    state.voiceCall.peerConnection = pc;

    // ICE Candidate 探索イベント
    pc.onicecandidate = (event) => {
      if (event.candidate && P2P.connected) {
        P2P.send({
          t: "voice_ice",
          candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate
        });
      }
    };

    // リモート音声ストリーム受信イベント
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this._onRemoteStream(event.streams[0]);
      }
    };

    // 接続状態監視
    pc.onconnectionstatechange = () => {
      console.log("[VoiceChat ConnectionState]", pc.connectionState);
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
        if (state.voiceCall.active) {
          this.endCall(false);
        }
      }
    };

    // ローカル音声トラックの追加
    if (state.voiceCall.localStream) {
      state.voiceCall.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, state.voiceCall.localStream);
      });
    }

    return pc;
  },

  _closePeerConnection() {
    if (state.voiceCall && state.voiceCall.peerConnection) {
      try {
        state.voiceCall.peerConnection.close();
      } catch (e) {}
      state.voiceCall.peerConnection = null;
    }
    this._iceCandidateQueue = [];
  },

  // ---- 通話開始リクエスト（発信側） ----
  async startCall() {
    if (state.isSoloMode) {
      if (typeof showToast === "function") showToast("一人回しモードではボイス通話は利用できません");
      return;
    }
    if (!P2P.connected) {
      if (typeof showToast === "function") showToast("対戦相手と接続されていません");
      return;
    }
    if (state.voiceCall && state.voiceCall.active) {
      if (typeof showToast === "function") showToast("既にボイス通話中です");
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (typeof showModal === "function") {
        showModal(
          "⚠️ マイク機能を利用できません",
          `<div style="text-align:center; padding:16px 10px; color:#cbd5e1;">
            <p style="margin-bottom:8px;">お使いのブラウザまたは接続環境（非HTTPS等）ではマイクがサポートされていません。</p>
            <p style="font-size:12px; color:#94a3b8;">※ HTTPS環境またはlocalhostでアクセスしてください。</p>
          </div>`,
          `<button class="btn" onclick="closeModal()">閉じる</button>`
        );
      }
      return;
    }

    try {
      // マイク取得（オプトイン許可）
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      state.voiceCall.localStream = stream;
      state.voiceCall.status = "calling";
      state.voiceCall.isMuted = false;

      // 相手へリクエスト送信
      P2P.send({
        t: "voice_call_request",
        callerName: state.myName || "プレイヤーA"
      });

      // 発信中モーダル表示
      this._showCallingModal();

    } catch (err) {
      console.warn("[VoiceChat] getUserMedia error:", err);
      let errMsg = "マイクへのアクセスが拒否されたか、マイク機器が見つかりませんでした。";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        errMsg = "ブラウザのマイク権限が許可されていません。アドレスバー横のアイコンからマイクの利用を許可してください。";
      }
      if (typeof showToast === "function") showToast(`⚠️ ${errMsg}`);
      this.resetVoiceCallState();
    }
  },

  // ---- 発信中モーダル ----
  _showCallingModal() {
    const oppName = state.oppName || "対戦相手";
    const bodyHtml = `
      <div style="text-align:center; padding:20px 10px; color:#f8fafc;">
        <div class="voice-calling-anim" style="font-size:48px; margin-bottom:12px;">📞</div>
        <p style="font-size:16px; font-weight:800; color:#38bdf8; margin-bottom:6px;">
          ${escapeHtml(oppName)} さんを呼び出しています...
        </p>
        <p style="font-size:12px; color:#94a3b8; margin:0;">
          相手が「通話を受ける」を押すのをお待ちください♪
        </p>
      </div>
    `;
    const footHtml = `
      <div style="display:flex; justify-content:center; gap:8px;">
        <button class="btn red" onclick="VoiceChat.cancelCall()">呼び出しをキャンセル</button>
      </div>
    `;
    if (typeof showModal === "function") {
      showModal("🎙️ ボイス通話の呼び出し中", bodyHtml, footHtml);
    }
  },

  cancelCall() {
    if (typeof closeModal === "function") closeModal();
    if (P2P.connected) {
      P2P.send({ t: "voice_call_cancel" });
    }
    if (typeof showToast === "function") showToast("通話の呼び出しをキャンセルしました");
    this.resetVoiceCallState();
  },

  // ---- 着信リクエスト受信（着信側） ----
  handleIncomingCallRequest(callerName) {
    if (state.voiceCall && state.voiceCall.active) {
      P2P.send({ t: "voice_call_reject", reason: "busy" });
      return;
    }

    state.voiceCall.status = "incoming";
    state.voiceCall.callerName = callerName || state.oppName || "対戦相手";

    if (navigator.vibrate) {
      try { navigator.vibrate([100, 100, 100, 100, 200]); } catch (e) {}
    }

    const bodyHtml = `
      <div style="text-align:center; padding:18px 10px; color:#f8fafc;">
        <div class="voice-incoming-anim" style="font-size:52px; margin-bottom:12px;">📲</div>
        <p style="font-size:17px; font-weight:800; color:#f472b6; margin-bottom:6px;">
          <b>${escapeHtml(state.voiceCall.callerName)}</b> さんから<br>ボイス通話のリクエストが届きました♪
        </p>
        <p style="font-size:12px; color:#cbd5e1; margin-top:8px; line-height:1.5;">
          直接声で会話しながら快適に対戦できます。<br>
          <span style="color:#fbbf24; font-size:11px;">※ ハウリング防止のためイヤホンのご使用を推奨します</span>
        </p>
      </div>
    `;

    const footHtml = `
      <div style="display:flex; justify-content:center; gap:12px; width:100%;">
        <button class="btn" style="padding:10px 18px; font-size:13px;" onclick="VoiceChat.rejectCall()">✕ いまは無理</button>
        <button class="btn green" style="padding:10px 24px; font-size:14px; font-weight:800;" onclick="VoiceChat.acceptCall()">🟢 通話を受ける</button>
      </div>
    `;

    if (typeof showModal === "function") {
      showModal("🎙️ ボイス通話の着信", bodyHtml, footHtml);
    }
  },

  // ---- 通話を受ける（着信側） ----
  async acceptCall() {
    if (typeof closeModal === "function") closeModal();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      state.voiceCall.localStream = stream;
      state.voiceCall.status = "incoming_accepted";
      state.voiceCall.isMuted = false;

      // 相手に通話受諾を通知（相手側が createOffer を発行する）
      P2P.send({ t: "voice_call_accept" });

      if (typeof showToast === "function") {
        showToast("通話に接続しています...");
      }
    } catch (err) {
      console.warn("[VoiceChat] acceptCall getUserMedia failed:", err);
      if (typeof showToast === "function") {
        showToast("⚠️ マイクへのアクセスが許可されなかったため通話をキャンセルしました");
      }
      this.rejectCall();
    }
  },

  // ---- 通話を断る ----
  rejectCall() {
    if (typeof closeModal === "function") closeModal();
    if (P2P.connected) {
      P2P.send({ t: "voice_call_reject", reason: "declined" });
    }
    this.resetVoiceCallState();
  },

  // ---- 相手が受諾した（発信側: Offer生成） ----
  async handleCallAccepted() {
    if (typeof closeModal === "function") closeModal();

    if (!P2P.connected || !state.voiceCall.localStream) {
      console.warn("[VoiceChat] Cannot start call: missing stream");
      this.resetVoiceCallState();
      return;
    }

    try {
      const pc = this._createPeerConnection();
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);

      P2P.send({
        t: "voice_offer",
        offer: {
          type: offer.type,
          sdp: offer.sdp
        }
      });
    } catch (err) {
      console.error("[VoiceChat] createOffer failed:", err);
      if (typeof showToast === "function") showToast("通話接続の確立に失敗しました");
      this.resetVoiceCallState();
    }
  },

  // ---- 着信側: Offer受信 ＆ Answer送信 ----
  async handleRemoteOffer(offerData) {
    if (!offerData || !offerData.sdp) return;

    try {
      const pc = this._createPeerConnection();
      await pc.setRemoteDescription(new RTCSessionDescription(offerData));

      // 溜まっていた ICE Candidate があれば適用
      while (this._iceCandidateQueue.length > 0) {
        const cand = this._iceCandidateQueue.shift();
        try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      P2P.send({
        t: "voice_answer",
        answer: {
          type: answer.type,
          sdp: answer.sdp
        }
      });

      this._onConnected();
    } catch (err) {
      console.error("[VoiceChat] handleRemoteOffer failed:", err);
      this.resetVoiceCallState();
    }
  },

  // ---- 発信側: Answer受信 ----
  async handleRemoteAnswer(answerData) {
    if (!answerData || !answerData.sdp) return;
    const pc = state.voiceCall.peerConnection;
    if (!pc) return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answerData));

      // 溜まっていた ICE Candidate があれば適用
      while (this._iceCandidateQueue.length > 0) {
        const cand = this._iceCandidateQueue.shift();
        try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
      }

      this._onConnected();
    } catch (err) {
      console.error("[VoiceChat] handleRemoteAnswer failed:", err);
      this.resetVoiceCallState();
    }
  },

  // ---- ICE Candidate 受信 ----
  async handleRemoteIceCandidate(candidateData) {
    if (!candidateData) return;
    const pc = state.voiceCall.peerConnection;
    if (!pc || !pc.remoteDescription) {
      // remoteDescription 未設定時はキューに保存
      this._iceCandidateQueue.push(candidateData);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidateData));
    } catch (err) {
      console.warn("[VoiceChat] addIceCandidate error:", err);
    }
  },

  // ---- リモート音声ストリームの再生 ----
  _onRemoteStream(remoteStream) {
    state.voiceCall.remoteStream = remoteStream;

    let audioEl = document.getElementById("remote-voice-audio");
    if (!audioEl) {
      audioEl = document.createElement("audio");
      audioEl.id = "remote-voice-audio";
      audioEl.autoplay = true;
      audioEl.playsInline = true;
      audioEl.style.display = "none";
      document.body.appendChild(audioEl);
    }

    try {
      audioEl.srcObject = remoteStream;
      const playPromise = audioEl.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.log("[VoiceChat] autoplay blocked, will play on user interaction:", err);
        });
      }
    } catch (err) {
      console.error("[VoiceChat] audio attach failed:", err);
    }
  },

  // ---- 通話接続完了 ----
  _onConnected() {
    state.voiceCall.status = "connected";
    state.voiceCall.active = true;
    state.voiceCall.durationSec = 0;

    if (state.voiceCall.durationTimer) {
      clearInterval(state.voiceCall.durationTimer);
    }
    state.voiceCall.durationTimer = setInterval(() => {
      state.voiceCall.durationSec++;
      this._updateDurationUI();
    }, 1000);

    this.showVoiceCallBar();

    const oppName = state.oppName || "対戦相手";
    if (typeof addLog === "function") {
      addLog(state.myName, "voice", `🎙️ [ボイス通話] ${state.myName} と ${oppName} の通話が接続されました`);
    }
    if (typeof showToast === "function") {
      showToast("🟢 ボイス通話が接続されました♪");
    }

    this.updateAllVoiceButtons();
  },

  // ---- ミュート切替 ----
  toggleMute() {
    if (!state.voiceCall.localStream) return;
    const tracks = state.voiceCall.localStream.getAudioTracks();
    if (!tracks || tracks.length === 0) return;

    state.voiceCall.isMuted = !state.voiceCall.isMuted;
    tracks.forEach(track => {
      track.enabled = !state.voiceCall.isMuted;
    });

    const muteBtn = document.getElementById("voice-bar-mute-btn");
    if (muteBtn) {
      if (state.voiceCall.isMuted) {
        muteBtn.innerHTML = `<span>🔇</span><span>ミュート中</span>`;
        muteBtn.classList.add("muted");
      } else {
        muteBtn.innerHTML = `<span>🎙️</span><span>ミュート</span>`;
        muteBtn.classList.remove("muted");
      }
    }

    this.updateCallControlModal();

    if (typeof showToast === "function") {
      showToast(state.voiceCall.isMuted ? "🔇 マイクをミュートしました" : "🎙️ マイクのミュートを解除しました");
    }
  },

  // ---- 通話終了 ----
  endCall(notify = true) {
    if (notify && P2P.connected && state.voiceCall.active) {
      P2P.send({ t: "voice_call_end" });
    }

    if (state.voiceCall.active) {
      if (typeof addLog === "function") {
        addLog(state.myName, "voice", `🎙️ [ボイス通話] 通話が終了しました（通話時間: ${this.formatDuration(state.voiceCall.durationSec)}）`);
      }
      if (typeof showToast === "function") {
        showToast("📞 ボイス通話を終了しました");
      }
    }

    this.hideVoiceCallBar();
    this.resetVoiceCallState();
    this.updateAllVoiceButtons();
  },

  // ---- 状態リセット＆トラック解放 ----
  resetVoiceCallState() {
    if (state.voiceCall.durationTimer) {
      clearInterval(state.voiceCall.durationTimer);
      state.voiceCall.durationTimer = null;
    }

    if (state.voiceCall.localStream) {
      try {
        state.voiceCall.localStream.getTracks().forEach(t => t.stop());
      } catch (e) {}
      state.voiceCall.localStream = null;
    }

    this._closePeerConnection();

    const audioEl = document.getElementById("remote-voice-audio");
    if (audioEl) {
      try {
        audioEl.pause();
        audioEl.srcObject = null;
      } catch (e) {}
    }

    state.voiceCall.active = false;
    state.voiceCall.status = "idle";
    state.voiceCall.isMuted = false;
    state.voiceCall.remoteStream = null;
    state.voiceCall.durationSec = 0;

    this.hideVoiceCallBar();
    this.updateAllVoiceButtons();
  },

  // ---- 画面上端の通話バー表示 ----
  showVoiceCallBar() {
    let bar = document.getElementById("voice-call-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "voice-call-bar";
      bar.className = "voice-call-bar";
      document.body.appendChild(bar);
      this._makeBarDraggable(bar);
    }

    const oppName = state.oppName || "対戦相手";

    bar.innerHTML = `
      <div class="voice-bar-left">
        <div class="voice-pulse-avatar">
          <span class="voice-avatar-icon">🎧</span>
          <span class="voice-pulse-ring"></span>
        </div>
        <div class="voice-info">
          <div class="voice-peer-name">${escapeHtml(oppName)} と通話中</div>
          <div class="voice-timer" id="voice-bar-timer">${this.formatDuration(state.voiceCall.durationSec || 0)}</div>
        </div>
      </div>
      <div class="voice-bar-actions">
        <button class="voice-btn voice-mute-btn" id="voice-bar-mute-btn" onclick="VoiceChat.toggleMute()" title="マイクの消音切替">
          <span>${state.voiceCall.isMuted ? "🔇" : "🎙️"}</span>
          <span>${state.voiceCall.isMuted ? "ミュート中" : "ミュート"}</span>
        </button>
        <button class="voice-btn voice-end-btn" onclick="VoiceChat.endCall(true)" title="通話を終了">
          <span>🔴</span>
          <span>終了</span>
        </button>
      </div>
    `;

    if (state.voiceCall.isMuted) {
      const muteBtn = bar.querySelector("#voice-bar-mute-btn");
      if (muteBtn) muteBtn.classList.add("muted");
    }

    bar.classList.remove("hidden");
    bar.classList.add("show");
  },

  // ---- 通話バーのドラッグ移動機能 ----
  _makeBarDraggable(bar) {
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    const onPointerDown = (e) => {
      // ボタン自体のクリック時はドラッグしない
      if (e.target.closest("button")) return;
      isDragging = true;
      startX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      startY = e.clientY || (e.touches && e.touches[0].clientY) || 0;

      const rect = bar.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      bar.style.transition = "none";
      bar.style.cursor = "grabbing";

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      const clientY = e.clientY || (e.touches && e.touches[0].clientY) || 0;

      const dx = clientX - startX;
      const dy = clientY - startY;

      let newLeft = initialLeft + dx;
      let newTop = initialTop + dy;

      const maxLeft = window.innerWidth - bar.offsetWidth - 8;
      const maxTop = window.innerHeight - bar.offsetHeight - 8;

      newLeft = Math.max(8, Math.min(newLeft, maxLeft));
      newTop = Math.max(8, Math.min(newTop, maxTop));

      bar.style.left = `${newLeft}px`;
      bar.style.top = `${newTop}px`;
      bar.style.transform = "none";
    };

    const onPointerUp = () => {
      if (!isDragging) return;
      isDragging = false;
      bar.style.cursor = "grab";
      bar.style.transition = "";
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    bar.addEventListener("pointerdown", onPointerDown);
  },

  hideVoiceCallBar() {
    const bar = document.getElementById("voice-call-bar");
    if (bar) {
      bar.classList.remove("show");
      bar.classList.add("hidden");
    }
  },

  _updateDurationUI() {
    const formatted = this.formatDuration(state.voiceCall.durationSec);
    const timerEl = document.getElementById("voice-bar-timer");
    if (timerEl) {
      timerEl.textContent = formatted;
    }

    const modalTimer = document.getElementById("voice-modal-timer");
    if (modalTimer) {
      modalTimer.textContent = formatted;
    }

    this.updateAllVoiceButtons();
  },

  formatDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  },

  // ---- 通話ボタン押下時の振り分け ----
  handleVoiceButtonClick() {
    if (state.voiceCall && state.voiceCall.active) {
      this.showCallControlModal();
    } else {
      this.startCall();
    }
  },

  // ---- 通話管理モーダル（スマホ版など通話バーがない時・ボタン押下時用） ----
  showCallControlModal() {
    const oppName = state.oppName || "対戦相手";
    const durStr = this.formatDuration(state.voiceCall.durationSec || 0);
    const isMuted = !!state.voiceCall.isMuted;

    const bodyHtml = `
      <div style="text-align:center; padding:16px 10px; color:#f8fafc;">
        <div style="font-size:42px; margin-bottom:8px; animation: voiceLivePulse 1.2s infinite ease-in-out;">🎙️</div>
        <div style="font-size:16px; font-weight:800; color:#4ade80; margin-bottom:4px;">
          ${escapeHtml(oppName)} さんと通話中
        </div>
        <div id="voice-modal-timer" style="font-size:22px; font-weight:900; font-family:monospace; color:#38bdf8; margin-bottom:18px;">
          ${durStr}
        </div>
        <div style="display:flex; flex-direction:column; gap:10px; max-width:260px; margin:0 auto;">
          <button id="modal-voice-mute-btn" class="btn ${isMuted ? 'gold' : ''}" style="padding:10px; font-size:14px; font-weight:700;" onclick="VoiceChat.toggleMute(); VoiceChat.updateCallControlModal();">
            ${isMuted ? '🔇 マイクをミュート中 (タップで解除)' : '🎙️ マイクをミュートする'}
          </button>
          <button class="btn red" style="padding:10px; font-size:14px; font-weight:700;" onclick="closeModal(); VoiceChat.endCall(true);">
            🔴 通話を終了する
          </button>
        </div>
      </div>
    `;

    const footHtml = `
      <div style="display:flex; justify-content:center; width:100%;">
        <button class="btn" style="min-width:100px;" onclick="closeModal()">閉じる</button>
      </div>
    `;

    if (typeof showModal === "function") {
      showModal("🎙️ ボイス通話の管理", bodyHtml, footHtml);
    }
  },

  updateCallControlModal() {
    const muteBtn = document.getElementById("modal-voice-mute-btn");
    if (!muteBtn) return;
    const isMuted = !!state.voiceCall.isMuted;
    if (isMuted) {
      muteBtn.className = "btn gold";
      muteBtn.innerHTML = "🔇 マイクをミュート中 (タップで解除)";
    } else {
      muteBtn.className = "btn";
      muteBtn.innerHTML = "🎙️ マイクをミュートする";
    }
  },

  // ---- 全通話ボタンの表示更新（赤い丸インジケーター & 通話状態） ----
  updateAllVoiceButtons() {
    const isInCall = !!(state.voiceCall && state.voiceCall.active);
    const durStr = isInCall ? this.formatDuration(state.voiceCall.durationSec || 0) : "";

    // 1. PC上部ヘッダー通話ボタン
    const topBtn = document.getElementById("btn-top-voice");
    if (topBtn) {
      if (isInCall) {
        topBtn.classList.add("in-call");
        topBtn.innerHTML = `🎙️ 通話中 (${durStr})<span class="voice-live-dot"></span>`;
        topBtn.title = "通話中（クリックで通話管理メニューを開く）";
      } else {
        topBtn.classList.remove("in-call");
        topBtn.innerHTML = `🎙️ 通話`;
        topBtn.title = "P2Pボイス通話を開始";
      }
    }

    // 2. スマホメニュー内通話ボタン
    const spBtn = document.getElementById("btn-sp-voice");
    if (spBtn) {
      if (isInCall) {
        spBtn.classList.add("in-call");
        spBtn.innerHTML = `🎙️ 通話中<span class="voice-live-dot"></span>`;
        spBtn.title = "通話中（タップで通話管理メニューを開く）";
      } else {
        spBtn.classList.remove("in-call");
        spBtn.innerHTML = `🎙️ 通話`;
        spBtn.title = "P2Pボイス通話を開始";
      }
    }

    // 3. ポケチャットモーダル内通話ボタン
    this.updateChatVoiceButton();
  },

  // ---- ポケチャットモーダル内の通話ボタン表示更新 ----
  updateChatVoiceButton() {
    const btn = document.getElementById("cute-chat-voice-btn");
    if (!btn) return;

    if (state.voiceCall && state.voiceCall.active) {
      btn.innerHTML = `<span>🔴 通話中</span><span class="voice-live-dot"></span>`;
      btn.className = "cute-chat-voice-btn active in-call";
      btn.onclick = () => VoiceChat.handleVoiceButtonClick();
      btn.title = "ボイス通話を管理";
    } else {
      btn.innerHTML = `<span>🎙️ 通話</span>`;
      btn.className = "cute-chat-voice-btn";
      btn.onclick = () => VoiceChat.startCall();
      btn.title = "ボイス通話を開始";
    }
  }
};

window.VoiceChat = VoiceChat;
