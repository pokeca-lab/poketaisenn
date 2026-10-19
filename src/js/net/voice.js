/**
 * PokéCa Lab Arena - Voice Chat Module (SkyWay Powered by NTT Com / docomo business)
 * 国産高品質WebRTCインフラによる超低遅延・プロキシ/NAT越え100%保証のボイスチャット
 */

const VoiceChat = {
  _context: null,
  _room: null,
  _me: null,
  _audioStream: null,
  _publication: null,

  // ---- SkyWay 認証トークン生成 ----
  _generateToken() {
    if (typeof skyway_token === "undefined" || !skyway_token.SkyWayAuthToken) {
      console.error("[VoiceChat] SkyWay Token SDK is not loaded.");
      return null;
    }
    const appId = window.SKYWAY_CONFIG?.appId;
    const secretKey = window.SKYWAY_CONFIG?.secretKey;
    if (!appId || !secretKey) {
      console.error("[VoiceChat] SkyWay Config is missing.");
      return null;
    }

    const token = new skyway_token.SkyWayAuthToken({
      jti: skyway_token.uuidV4(),
      iat: skyway_token.nowInSec(),
      exp: skyway_token.nowInSec() + 86400, // 24時間有効
      version: 3,
      scope: {
        appId: appId,
        rooms: [
          {
            name: "*",
            methods: ["create", "close", "updateMetadata"],
            member: {
              name: "*",
              methods: ["publish", "subscribe", "updateMetadata"]
            }
          }
        ]
      }
    });

    return token.encode(secretKey);
  },

  // ---- SkyWay Context 取得（シングルトン） ----
  async _getContext() {
    if (this._context) return this._context;
    if (typeof skyway_room === "undefined" || !skyway_room.SkyWayContext) {
      throw new Error("SkyWay Room SDK が読み込まれていません");
    }

    const tokenString = this._generateToken();
    if (!tokenString) {
      throw new Error("SkyWay 認証トークンの生成に失敗しました");
    }

    this._context = await skyway_room.SkyWayContext.Create(tokenString);
    console.log("[VoiceChat] SkyWay Context created successfully.");
    return this._context;
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
      // マイクの事前許可確認
      const testStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      testStream.getTracks().forEach(t => t.stop());

      state.voiceCall.status = "calling";
      state.voiceCall.isMuted = false;

      // 相手へ通話リクエスト送信 (Firebase)
      P2P.send({
        t: "voice_call_request",
        callerName: state.myName || "プレイヤーA"
      });

      // 発信中モーダル表示
      this._showCallingModal();

    } catch (err) {
      console.warn("[VoiceChat] getUserMedia check error:", err);
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
      state.voiceCall.status = "incoming_accepted";
      state.voiceCall.isMuted = false;

      // 相手に通話受諾を通知 (Firebase)
      P2P.send({ t: "voice_call_accept" });

      if (typeof showToast === "function") {
        showToast("通話に接続しています...");
      }

      // SkyWay ルームへ接続
      await this._joinSkyWayRoom();

    } catch (err) {
      console.warn("[VoiceChat] acceptCall failed:", err);
      if (typeof showToast === "function") {
        showToast("⚠️ 通話接続に失敗しました: " + (err.message || ""));
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

  // ---- 相手が受諾した（発信側） ----
  async handleCallAccepted() {
    if (typeof closeModal === "function") closeModal();

    try {
      if (typeof showToast === "function") {
        showToast("通話に接続しています...");
      }
      // 発信側も SkyWay ルームへ接続
      await this._joinSkyWayRoom();

    } catch (err) {
      console.error("[VoiceChat] handleCallAccepted failed:", err);
      if (typeof showToast === "function") showToast("通話接続に失敗しました");
      this.resetVoiceCallState();
    }
  },

  // ---- SkyWay P2PRoom への参加 ＆ 音声 Publish/Subscribe ----
  async _joinSkyWayRoom() {
    this._leaveSkyWayRoom();

    const context = await this._getContext();
    const cleanRoomNo = String(state.roomNo || "arena").replace(/[^a-zA-Z0-9\-_]/g, "");
    const roomName = `poke-call-${cleanRoomNo || "default"}`.slice(0, 128);
    console.log(`[VoiceChat] Joining SkyWay room: ${roomName}`);

    // P2PRoom の取得または作成 (SkyWay TURNサーバー自動併用)
    const room = await skyway_room.SkyWayRoom.FindOrCreate(context, {
      type: "p2p",
      name: roomName
    });
    this._room = room;

    // ルームに参加 (nameを省略することでSkyWayがUUIDを自動採番。全角日本語など不正文字によるinvalidRequestParameterエラーを防止)
    const me = await room.join();
    this._me = me;
    console.log(`[VoiceChat] Joined SkyWay room as member: ${me.id}`);

    // マイクストリーム取得 (エコーキャンセラー・ノイズサプレッサー有効)
    const audioStream = await skyway_room.SkyWayStreamFactory.createMicrophoneAudioStream({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    });
    this._audioStream = audioStream;
    state.voiceCall.localStream = audioStream;

    // 音声を Publish
    const publication = await me.publish(audioStream);
    this._publication = publication;
    console.log(`[VoiceChat] Published audio stream: ${publication.id}`);

    // 音声 Subscribe 処理
    const subscribeToPub = async (pub) => {
      if (pub.contentType === "audio" && pub.publisher.id !== me.id) {
        console.log(`[VoiceChat] Subscribing to audio: ${pub.id} from ${pub.publisher.id}`);
        try {
          const { stream } = await me.subscribe(pub.id);
          this._onRemoteStream(stream);
        } catch (subErr) {
          console.warn("[VoiceChat] subscribe failed:", subErr);
        }
      }
    };

    // 既に入室しているメンバーの音声を購読
    room.publications.forEach(subscribeToPub);

    // 新たに相手が音声を公開したときに自動購読
    room.onStreamPublished.add((e) => subscribeToPub(e.publication));

    // 相手が退出したときの監視
    room.onMemberLeft.add((e) => {
      if (e.member.id !== me.id) {
        console.log(`[VoiceChat] Peer left the room: ${e.member.id}`);
        if (state.voiceCall.active) {
          this.endCall(false);
        }
      }
    });

    // 通話接続完了
    this._onConnected();
  },

  // ---- リモート音声ストリームの再生 ----
  _onRemoteStream(skywayStream) {
    state.voiceCall.remoteStream = skywayStream;

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
      if (typeof skywayStream.attach === "function") {
        skywayStream.attach(audioEl);
      } else if (skywayStream.track) {
        audioEl.srcObject = new MediaStream([skywayStream.track]);
      }

      const playPromise = audioEl.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.log("[VoiceChat] autoplay blocked, will play on user interaction:", err);
          const resumeAudio = () => {
            if (audioEl && state.voiceCall.active) {
              audioEl.play().catch(() => {});
            }
            window.removeEventListener("pointerdown", resumeAudio);
            window.removeEventListener("keydown", resumeAudio);
          };
          window.addEventListener("pointerdown", resumeAudio);
          window.addEventListener("keydown", resumeAudio);
        });
      }
    } catch (err) {
      console.error("[VoiceChat] audio attach failed:", err);
    }
  },

  // ---- SkyWay ルーム退出 ＆ リソース解放 ----
  async _leaveSkyWayRoom() {
    if (this._publication) {
      try { await this._me?.unpublish(this._publication.id); } catch (e) {}
      this._publication = null;
    }
    if (this._audioStream) {
      try {
        if (this._audioStream.track) this._audioStream.track.stop();
        if (typeof this._audioStream.release === "function") this._audioStream.release();
      } catch (e) {}
      this._audioStream = null;
    }
    if (this._room && this._me) {
      try { await this._me.leave(); } catch (e) {}
    }
    this._me = null;
    this._room = null;
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
      addLog(state.myName, "voice", `🎙️ [ボイス通話] ${state.myName} と ${oppName} の通話が接続されました（SkyWay）`);
    }
    if (typeof showToast === "function") {
      showToast("🟢 ボイス通話が接続されました♪");
    }

    this.updateAllVoiceButtons();
  },

  // ---- ミュート切替 ----
  toggleMute() {
    state.voiceCall.isMuted = !state.voiceCall.isMuted;

    if (this._audioStream && this._audioStream.track) {
      this._audioStream.track.enabled = !state.voiceCall.isMuted;
    }

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

    this._leaveSkyWayRoom();

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
    state.voiceCall.localStream = null;
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
