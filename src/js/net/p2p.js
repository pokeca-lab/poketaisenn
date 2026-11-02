/* 【通信】Firebase Realtime Database による安定したオンライン対戦モジュール
 *
 * 接続仕様:
 *   - ルーム番号形式: 6桁のランダム数字 (100000〜999999)
 *   - 通信方式: Firebase Realtime Database (WebSocket / HTTPS標準ポート443)
 *   - メリット: Symmetric NAT、キャリアグレードNAT(CGNAT)、企業・大学Wi-Fiでも100%接続可能
 *   - 接続定員: 最大2名 (オーナー1名 + 参加者1名、3人目の接続要求は拒否)
 *   - 切断検知: onDisconnect() によりタブ離脱や通信遮断を自動検知
 */

const P2P_STATES = Object.freeze({
  UNCONNECTED: "未接続",
  CREATING_ROOM: "ルーム作成中",
  WAITING_FOR_PEER: "参加者待機中",
  CONNECTING: "接続中",
  CONNECTED: "オンライン接続確立",
  CONNECTION_FAILED: "接続失敗",
  DISCONNECTED: "切断"
});

const P2P = {
  PREFIX: "room-",
  STATES: P2P_STATES,
  MAX_RETRY_COUNT: 5,
  CONNECT_TIMEOUT_MS: 15000,

  peer: null,                 // 互換性維持用
  conn: null,                 // 互換性維持用 ({ open: boolean })
  role: null,                 // "host" | "guest" | null
  roomCode: null,             // 6桁のルーム番号文字列
  connected: false,
  connectionState: P2P_STATES.UNCONNECTED,
  lastError: null,

  _roomRef: null,
  _actionsRef: null,
  _listeners: [],
  _timer: null,
  _connectTimeoutTimer: null,
  _retryCount: 0,
  _closingIntentionally: false,
  _lastStadiumUid: null,

  // ---- 公開API (既存プログラムからの状態判定・互換用) ----
  isConnected() {
    return Boolean(this.connected);
  },

  getConnection() {
    return this.conn;
  },

  getState() {
    return this.connectionState;
  },

  generateRoomCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  },

  toPeerId(code) {
    const clean = String(code || "").trim();
    return clean.startsWith(this.PREFIX) ? clean : `${this.PREFIX}${clean}`;
  },

  // ---- 接続状態の管理・画面表示更新 ----
  _setState(newState, detailText = "", lamp = null) {
    this.connectionState = newState;

    if (!lamp) {
      switch (newState) {
        case P2P_STATES.CONNECTED:
          lamp = "green";
          break;
        case P2P_STATES.CREATING_ROOM:
        case P2P_STATES.WAITING_FOR_PEER:
        case P2P_STATES.CONNECTING:
          lamp = "yellow";
          break;
        case P2P_STATES.CONNECTION_FAILED:
        case P2P_STATES.DISCONNECTED:
          lamp = "red";
          break;
        default:
          lamp = "gray";
          break;
      }
    }

    const displayMessage = detailText ? `${newState}（${detailText}）` : newState;
    this._status(displayMessage, lamp);
    this._updateLobbyControls();
  },

  _escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  _status(text, lamp = "gray") {
    const el = document.getElementById("conn-status");
    const safeText = this._escapeHtml(text);
    if (el) {
      if (lamp === "green") {
        el.innerHTML = `<span class="status-lamp">🟢</span> ${safeText}`;
        el.style.color = "#059669";
        el.style.fontWeight = "bold";
      } else if (lamp === "yellow") {
        el.innerHTML = `<span class="status-lamp">🟡</span> ${safeText}`;
        el.style.color = "#d97706";
        el.style.fontWeight = "bold";
      } else if (lamp === "red") {
        el.innerHTML = `<span class="status-lamp">🔴</span> ${safeText}`;
        el.style.color = "#dc2626";
        el.style.fontWeight = "bold";
      } else {
        el.innerHTML = `<span class="status-lamp">⚪</span> ${safeText}`;
        el.style.color = "#64748b";
        el.style.fontWeight = "normal";
      }
    }
  },

  _updateLobbyControls() {
    const startBtn = document.getElementById("btn-start");
    if (startBtn) {
      if (this.connected) {
        startBtn.disabled = false;
        startBtn.textContent = "🟢 相手と接続しました！（対戦開始）";
        startBtn.classList.remove("gold");
        startBtn.classList.add("green");
      } else {
        startBtn.disabled = true;
        startBtn.classList.remove("green");
        startBtn.classList.add("gold");
        if (this.connectionState === P2P_STATES.CREATING_ROOM) {
          startBtn.textContent = "ルーム作成中...";
        } else if (this.connectionState === P2P_STATES.CONNECTING) {
          startBtn.textContent = "オーナーへ接続中...";
        } else {
          startBtn.textContent = "相手の接続待ち...";
        }
      }
    }

    const testPanel = document.getElementById("p2p-test-panel");
    if (testPanel) {
      if (this.connected) {
        testPanel.classList.remove("hidden");
      } else {
        testPanel.classList.add("hidden");
      }
    }
  },

  _clearTimeoutTimer() {
    if (this._connectTimeoutTimer) {
      clearTimeout(this._connectTimeoutTimer);
      this._connectTimeoutTimer = null;
    }
  },

  _startTimeoutTimer(onTimeout) {
    this._clearTimeoutTimer();
    this._connectTimeoutTimer = setTimeout(() => {
      this._connectTimeoutTimer = null;
      onTimeout();
    }, this.CONNECT_TIMEOUT_MS);
  },

  _destroy() {
    this._clearTimeoutTimer();
    this._closingIntentionally = true;

    if (window.VoiceChat) {
      VoiceChat.resetVoiceCallState();
    }

    // Firebase リスナーの解除
    if (this._listeners && this._listeners.length > 0) {
      this._listeners.forEach(({ ref, event, fn }) => {
        try { ref.off(event, fn); } catch (e) {}
      });
      this._listeners = [];
    }

    // 退室フラグの反映
    if (this._roomRef) {
      try {
        if (this.role === "host") {
          this._roomRef.child("host/online").set(false);
          this._roomRef.child("status").set("closed");
        } else if (this.role === "guest") {
          this._roomRef.child("guest/online").set(false);
        } else if (this.role === "spectator" && this._spectatorId) {
          this._roomRef.child(`spectators/${this._spectatorId}`).remove();
        }
      } catch (e) {}
    }

    if (this.role === "spectator" || state.isSpectator) {
      state.isSpectator = false;
      state.spectatorId = null;
      const barEl = document.getElementById("spectator-bar");
      if (barEl) barEl.style.display = "none";
    }
    this._spectatorId = null;
    this._spectatorRef = null;
    this._pendingSpectatorModalId = null;

    this._roomRef = null;
    this._actionsRef = null;
    this.conn = null;
    this.peer = null;
    this.connected = false;
    this._closingIntentionally = false;
    this._lastSentSnapshotJson = null;
    this._isApplyingSnapshot = false;
  },

  available() {
    if (typeof firebase === "undefined" || !firebase.database) {
      this.lastError = "firebase-not-loaded";
      this._setState(
        P2P_STATES.CONNECTION_FAILED,
        "通信環境の初期化に失敗しました。ネットワーク接続を確認してください"
      );
      return false;
    }
    return true;
  },

  _addListener(ref, event, fn) {
    ref.on(event, fn);
    this._listeners.push({ ref, event, fn });
  },

  // ---- オーナー側: ルーム作成 ＆ 待機 ----
  createRoom() {
    this._retryCount = 0;
    const roomBox = document.getElementById("room-box");
    const roomNoEl = document.getElementById("room-no");
    if (roomBox) roomBox.classList.add("hidden");
    if (roomNoEl) roomNoEl.textContent = "";

    const code = this.generateRoomCode();
    return this.host(code);
  },

  async host(code) {
    if (!this.available()) return false;
    this._destroy();
    this.role = "host";
    this.lastError = null;

    const cleanCode = String(code || this.generateRoomCode()).trim();
    this.roomCode = cleanCode;

    // 登録成功まではルーム番号ボックスを表示しない
    const roomBox = document.getElementById("room-box");
    if (roomBox) roomBox.classList.add("hidden");

    this._setState(P2P_STATES.CREATING_ROOM, "サーバーにルームを作成しています...");

    const db = firebase.database();
    const roomRef = db.ref(`rooms/${cleanCode}`);
    this._roomRef = roomRef;
    this._actionsRef = roomRef.child("actions");

    // 既存ルームとの重複チェック (onlineなホストがいるか)
    try {
      const snap = await roomRef.child("host").once("value");
      const existingHost = snap.val();
      if (existingHost && existingHost.online) {
        if (this._retryCount < this.MAX_RETRY_COUNT) {
          this._retryCount++;
          const nextCode = this.generateRoomCode();
          console.log(`[Firebase] ルーム番号重複のため再試行 (${this._retryCount}/${this.MAX_RETRY_COUNT}): ${nextCode}`);
          return this.host(nextCode);
        }
        this._setState(P2P_STATES.CONNECTION_FAILED, "ルーム番号が重複しました。再度作成してください");
        return false;
      }
    } catch (err) {
      console.warn("[Firebase Host Check Warning]", err);
    }

    const myName = (document.getElementById("in-name")?.value.trim()) || state.myName || "プレイヤーA";

    try {
      // ルームの新規初期化
      await roomRef.set({
        status: "waiting",
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        host: {
          name: myName,
          joinedAt: firebase.database.ServerValue.TIMESTAMP,
          online: true
        },
        guest: null,
        actions: null,
        voice: null
      });

      // 切断時の自動後始末（ブラウザ閉じ等）
      roomRef.child("host/online").onDisconnect().set(false);
      roomRef.child("status").onDisconnect().set("closed");

      state.roomNo = cleanCode;

      // 画面にルーム番号を表示
      const roomNoEl = document.getElementById("room-no");
      const boxEl = document.getElementById("room-box");
      if (roomNoEl) roomNoEl.textContent = cleanCode;
      if (boxEl) boxEl.classList.remove("hidden");

      this._setState(P2P_STATES.WAITING_FOR_PEER, `ルーム番号: ${cleanCode}`);
      if (typeof showToast === "function") {
        showToast(`ルーム ${cleanCode} を作成しました`);
      }

      // ゲストの入室監視
      this._addListener(roomRef.child("guest"), "value", (snap) => {
        const guest = snap.val();
        if (guest && guest.online && !this.connected) {
          this._onPeerJoined(guest.name || "参加者");
        } else if (guest && guest.online === false && this.connected && !this._closingIntentionally) {
          this._onPeerDisconnected(guest.name || "参加者");
        }
      });

      // アクション受信監視
      this._startActionsListener();

      // 観戦リクエスト監視（オーナー側）
      this._startSpectatorRequestsListener();

      return true;
    } catch (err) {
      this.lastError = err;
      console.error("[Firebase Host Error]", err);
      this._setState(P2P_STATES.CONNECTION_FAILED, "ルーム作成に失敗しました: " + (err.message || ""));
      return false;
    }
  },

  // ---- 参加者側: ルーム参加 ----
  async join(code) {
    if (!this.available()) return false;

    const cleanCode = String(code || "").trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      this.lastError = "invalid-room-code";
      this._setState(P2P_STATES.CONNECTION_FAILED, "6桁の数字のルーム番号を入力してください");
      return false;
    }

    this._destroy();
    this.role = "guest";
    this.roomCode = cleanCode;
    this.lastError = null;
    state.roomNo = cleanCode;

    this._setState(P2P_STATES.CONNECTING, `ルーム ${cleanCode} へ接続中...`);

    const db = firebase.database();
    const roomRef = db.ref(`rooms/${cleanCode}`);
    this._roomRef = roomRef;
    this._actionsRef = roomRef.child("actions");

    try {
      const snap = await roomRef.once("value");
      if (!snap.exists()) {
        this._setState(P2P_STATES.CONNECTION_FAILED, `存在しないルーム番号です（${cleanCode}）`);
        return false;
      }

      const roomData = snap.val();
      if (!roomData.host || !roomData.host.online) {
        this._setState(P2P_STATES.CONNECTION_FAILED, `オーナーが退室しているか、無効なルームです（${cleanCode}）`);
        return false;
      }

      // 満員チェック（既に有効なゲストがいる場合は観戦モードへ誘導）
      if (roomData.guest && roomData.guest.online) {
        return await this._handleRoomFullForSpectator(cleanCode, roomData);
      }

      const myName = (document.getElementById("in-name")?.value.trim()) || state.myName || "プレイヤーB";

      // ゲストとして登録
      await roomRef.child("guest").set({
        name: myName,
        joinedAt: firebase.database.ServerValue.TIMESTAMP,
        online: true
      });
      await roomRef.child("status").set("connected");

      // 切断時の自動反映
      roomRef.child("guest/online").onDisconnect().set(false);

      // ホストの切断監視
      this._addListener(roomRef.child("host"), "value", (hostSnap) => {
        const host = hostSnap.val();
        if ((!host || !host.online) && this.connected && !this._closingIntentionally) {
          this._onPeerDisconnected(host?.name || "ルームオーナー");
        }
      });

      // アクション受信監視
      this._startActionsListener();

      // 接続完了処理
      this._onPeerJoined(roomData.host.name || "オーナー");

      return true;
    } catch (err) {
      this.lastError = err;
      console.error("[Firebase Join Error]", err);
      this._setState(P2P_STATES.CONNECTION_FAILED, "ルームへの参加に失敗しました: " + (err.message || ""));
      return false;
    }
  },

  _startActionsListener() {
    if (!this._actionsRef) return;
    this._addListener(this._actionsRef, "child_added", (snap) => {
      const item = snap.val();
      if (!item) return;
      // 自分が送信したものは無視
      if (item.sender === this.role) return;
      this._onData(item.data, item.sender);
    });
  },

  // ==========================================
  // 👁️ 観戦者モード (Spectator Mode) 関連処理
  // ==========================================

  /** 満員時に観戦確認ダイアログを表示 */
  async _handleRoomFullForSpectator(cleanCode, roomData) {
    const doSpectate = confirm(
      "このルームIDはすでにマッチング済みです。観戦しますか？\n（ルームオーナーに観戦リクエストを送信します）"
    );
    if (!doSpectate) {
      this._setState(P2P_STATES.CONNECTION_FAILED, "観戦をキャンセルしました（対戦満員）");
      return false;
    }
    return await this.requestSpectate(cleanCode, roomData);
  },

  /** 観戦リクエスト送信とオーナーの承認待機 */
  async requestSpectate(cleanCode, roomData) {
    this.role = "spectator";
    state.isSpectator = true;
    state.roomNo = cleanCode;

    const hostName = roomData.host?.name || "ホスト";
    const guestName = roomData.guest?.name || "ゲスト";
    state.spectatorHostName = hostName;
    state.spectatorGuestName = guestName;

    const specId = "spec_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();
    this._spectatorId = specId;
    state.spectatorId = specId;

    const myName = (document.getElementById("in-name")?.value.trim()) || state.myName || "観戦者";
    state.myName = myName;

    this._setState(P2P_STATES.CONNECTING, `オーナー（${hostName}）へ観戦リクエスト中...`);

    const specRef = this._roomRef.child(`spectators/${specId}`);
    this._spectatorRef = specRef;

    try {
      await specRef.set({
        id: specId,
        name: myName,
        status: "pending",
        online: true,
        requestedAt: firebase.database.ServerValue.TIMESTAMP
      });
      specRef.onDisconnect().remove();

      // 承認待ちモーダル表示
      if (typeof showModal === "function") {
        showModal(
          "👁️ 観戦リクエスト送信中",
          `<div style="text-align:center; padding:18px 10px; color:#f8fafc;">
            <div style="font-size:44px; margin-bottom:12px;">⏳</div>
            <p style="font-size:16px; font-weight:bold; color:#38bdf8; margin-bottom:8px;">
              オーナー（${this._escapeHtml(hostName)} さん）の承認を待っています...
            </p>
            <p style="font-size:13px; color:#94a3b8; line-height:1.6;">
              オーナーが承認すると、自動的に観戦画面へ移動します。
            </p>
          </div>`,
          `<div style="display:flex; justify-content:center;">
            <button class="btn red" onclick="P2P.cancelSpectateRequest('${cleanCode}', '${specId}')">リクエストを取り消す</button>
          </div>`
        );
      }

      // 承認/拒否の監視
      this._addListener(specRef.child("status"), "value", async (snap) => {
        const status = snap.val();
        if (status === "approved") {
          if (typeof closeModal === "function") closeModal();
          if (typeof showToast === "function") {
            showToast("🎉 オーナーから観戦が許可されました！");
          }
          await this._startSpectating(cleanCode, roomData);
        } else if (status === "rejected") {
          if (typeof closeModal === "function") closeModal();
          alert("オーナーにより観戦リクエストが拒否されました。");
          this.leaveSpectating(false);
        }
      });

      return true;
    } catch (err) {
      console.error("[Spectate Request Error]", err);
      this._setState(P2P_STATES.CONNECTION_FAILED, "観戦リクエストに失敗しました: " + (err.message || ""));
      return false;
    }
  },

  /** 観戦リクエストのキャンセル */
  cancelSpectateRequest(cleanCode, specId) {
    if (typeof closeModal === "function") closeModal();
    if (this._spectatorRef) {
      try { this._spectatorRef.remove(); } catch (e) {}
    }
    this._destroy();
    this._setState(P2P_STATES.DISCONNECTED, "観戦リクエストをキャンセルしました");
  },

  /** 観戦開始（ゲーム画面表示＆盤面同期開始） */
  async _startSpectating(cleanCode, roomData) {
    this.connected = true;
    this.role = "spectator";
    state.isSpectator = true;
    state.roomNo = cleanCode;
    state.oppName = state.spectatorGuestName;

    // 画面切り替え（ロビー非表示、ゲーム画面表示）
    const lobbyEl = document.getElementById("lobby");
    const gameEl = document.getElementById("game");
    if (lobbyEl) lobbyEl.classList.add("hidden");
    if (gameEl) gameEl.classList.remove("hidden");

    // 観戦者フローティングバー表示
    const bar = document.getElementById("spectator-bar");
    const label = document.getElementById("spectator-matchup-label");
    if (bar) bar.style.display = "flex";
    if (label) label.textContent = `【${state.spectatorHostName}】 vs 【${state.spectatorGuestName}】`;

    // ホスト・ゲストの退室監視
    this._addListener(this._roomRef.child("host"), "value", (hSnap) => {
      const host = hSnap.val();
      if ((!host || !host.online) && this.connected) {
        if (typeof showToast === "function") showToast("【対戦終了】オーナーが退室しました");
        addLog(`【対戦終了】オーナー（${state.spectatorHostName}）が退室しました`, { suppressSync: true });
      }
    });
    this._addListener(this._roomRef.child("guest"), "value", (gSnap) => {
      const guest = gSnap.val();
      if ((!guest || !guest.online) && this.connected) {
        if (typeof showToast === "function") showToast("【対戦終了】参加者が退室しました");
        addLog(`【対戦終了】参加者（${state.spectatorGuestName}）が退室しました`, { suppressSync: true });
      }
    });

    // アクションリスナー開始
    this._startActionsListener();

    // 過去の直近スナップショットを反映して盤面を即時復元
    try {
      const actionsSnap = await this._actionsRef.limitToLast(40).once("value");
      if (actionsSnap.exists()) {
        let lastHostState = null;
        let lastGuestState = null;
        actionsSnap.forEach((child) => {
          const item = child.val();
          if (!item || !item.data) return;
          if (item.data.t === "state") {
            if (item.sender === "host") lastHostState = item.data;
            if (item.sender === "guest") lastGuestState = item.data;
          }
        });
        if (lastHostState) this._applySpectatorSnapshot(lastHostState, "host");
        if (lastGuestState) this._applySpectatorSnapshot(lastGuestState, "guest");
      }
    } catch (e) {
      console.warn("[Spectator history sync error]", e);
    }

    // 参加通知を送信（対戦者双方から最新スナップショットを再送してもらう）
    this.send({
      t: "spectator_joined",
      spectatorName: state.myName,
      spectatorId: this._spectatorId
    });

    this._setState(P2P_STATES.CONNECTED, `観戦中: ${cleanCode}`);
    if (typeof renderAll === "function") renderAll();
  },

  /** 観戦終了してロビーへ戻る */
  leaveSpectating(confirmFirst = true) {
    if (confirmFirst && !confirm("観戦を終了してロビーに戻りますか？")) {
      return;
    }
    if (this._spectatorRef) {
      try { this._spectatorRef.remove(); } catch (e) {}
    }
    this._destroy();
    state.isSpectator = false;
    state.spectatorId = null;

    const bar = document.getElementById("spectator-bar");
    if (bar) bar.style.display = "none";

    const gameEl = document.getElementById("game");
    const lobbyEl = document.getElementById("lobby");
    if (gameEl) gameEl.classList.add("hidden");
    if (lobbyEl) lobbyEl.classList.remove("hidden");

    this._setState(P2P_STATES.DISCONNECTED, "観戦を終了しました");
    if (typeof showToast === "function") {
      showToast("観戦を終了しました");
    }
    if (typeof renderAll === "function") renderAll();
  },

  /** オーナー（ホスト）側: 観戦リクエストの監視 */
  _startSpectatorRequestsListener() {
    if (!this._roomRef || this.role !== "host") return;
    const specListRef = this._roomRef.child("spectators");
    const onSpecChange = (snap) => {
      const spec = snap.val();
      if (!spec || spec.status !== "pending") return;
      this._showSpectatorRequestModal(spec);
    };
    this._addListener(specListRef, "child_added", onSpecChange);
    this._addListener(specListRef, "child_changed", onSpecChange);
  },

  /** オーナー側: 観戦承認モーダル表示 */
  _showSpectatorRequestModal(spec) {
    if (this._pendingSpectatorModalId === spec.id) return;
    this._pendingSpectatorModalId = spec.id;

    const safeName = this._escapeHtml(spec.name || "観戦希望者");
    if (typeof showModal === "function") {
      showModal(
        "👁️ 観戦リクエスト",
        `<div style="text-align:center; padding:18px 10px; color:#f8fafc;">
          <div style="font-size:44px; margin-bottom:12px;">👀</div>
          <p style="font-size:16px; font-weight:bold; color:#38bdf8; margin-bottom:8px;">
            <b>${safeName}</b> さんが観戦しようとしています。<br>許可しますか？
          </p>
          <p style="font-size:13px; color:#94a3b8; line-height:1.6;">
            許可すると、盤面がリアルタイムに共有されます。<br>
            （※手札は観戦者には見えません）
          </p>
        </div>`,
        `<div style="display:flex; gap:12px; justify-content:center;">
          <button class="btn" style="background:#e11d48; border-color:#fda4af; color:#fff;" onclick="P2P.resolveSpectatorRequest('${spec.id}', false, '${safeName}')">❌ 拒否する</button>
          <button class="btn" style="background:#10b981; border-color:#6ee7b7; color:#fff;" onclick="P2P.resolveSpectatorRequest('${spec.id}', true, '${safeName}')">⭕ 許可する</button>
        </div>`
      );
    } else {
      const ok = confirm(`${spec.name || "観戦希望者"} さんが観戦しようとしています。許可しますか？`);
      this.resolveSpectatorRequest(spec.id, ok, spec.name);
    }
  },

  /** オーナー側: 観戦リクエストの承認/拒否処理 */
  resolveSpectatorRequest(specId, isApproved, specName) {
    if (typeof closeModal === "function") closeModal();
    this._pendingSpectatorModalId = null;
    if (!this._roomRef) return;

    const specRef = this._roomRef.child(`spectators/${specId}`);
    if (isApproved) {
      specRef.update({
        status: "approved",
        approvedAt: firebase.database.ServerValue.TIMESTAMP
      });
      if (typeof showToast === "function") {
        showToast(`👁️ ${specName || "観戦者"} の観戦を許可しました`);
      }
      addLog(`【観戦】${specName || "観戦者"} さんの観戦を許可しました`, { suppressSync: true });
      this.syncNow();
    } else {
      specRef.update({
        status: "rejected",
        rejectedAt: firebase.database.ServerValue.TIMESTAMP
      });
      if (typeof showToast === "function") {
        showToast(`❌ ${specName || "観戦者"} の観戦を拒否しました`);
      }
      addLog(`【観戦】${specName || "観戦者"} さんの観戦リクエストを拒否しました`, { suppressSync: true });
    }
  },

  /** 観戦者側: ホスト・ゲストのスナップショットを盤面に振り分け反映 */
  _applySpectatorSnapshot(s, sender) {
    if (!s || typeof s !== "object") return;
    this._isApplyingSnapshot = true;
    try {
      const pre = (c) => c ? { ...c, uid: (sender === "guest" ? "opp:" : "") + String(c.uid).replace(/^(opp:)+/, "") } : c;
      const prePk = (p) => p ? {
        ...p,
        card: pre(p.card),
        energies: (p.energies || []).map(pre),
        tool: pre(p.tool),
        previousStages: (p.previousStages || []).map(pre)
      } : null;

      if (sender === "host") {
        // ホストの盤面 → 手前側（state.my...）にセット
        state.spectatorHostName = s.name || state.spectatorHostName;
        state.myMatId = s.matId || state.myMatId;
        if (s.sleeveId) state.mySleeveId = s.sleeveId;
        if ("sleeveDataUrl" in s) state.mySleeveDataUrl = s.sleeveDataUrl || null;
        state.myHandCount = s.handCount | 0;
        state.myHand = Array(state.myHandCount).fill(null).map((_, i) => ({ uid: `spec_host_hand_${i}`, isBlank: true, name: "手札" }));
        state.myDeckCount = s.deckCount | 0;
        state.myDeck = Array(state.myDeckCount).fill(null);
        state.myPrizes = Array(s.prizes | 0).fill(null);
        state.myTrash = (s.trash || []).map(pre);
        state.myLost = Array(s.lostCount | 0).fill(null);
        state.myActive = prePk(s.active);
        state.myBenchLimit = s.benchLimit || 5;
        const rawBench = s.bench || {};
        state.myBench = [0, 1, 2, 3, 4, 5, 6, 7].map(i => prePk(rawBench[i] || null));
        state.playCard = s.playCard ? pre(s.playCard) : null;
      } else if (sender === "guest") {
        // ゲストの盤面 → 奥側（state.opp...）にセット
        state.spectatorGuestName = s.name || state.spectatorGuestName;
        state.oppName = state.spectatorGuestName;
        state.oppMatId = s.matId || state.oppMatId;
        if (s.sleeveId) state.oppSleeveId = s.sleeveId;
        if ("sleeveDataUrl" in s) state.oppSleeveDataUrl = s.sleeveDataUrl || null;
        state.oppHandCount = s.handCount | 0;
        state.oppDeckCount = s.deckCount | 0;
        state.oppPrizes = s.prizes | 0;
        state.oppTrash = (s.trash || []).map(pre);
        state.oppLostCount = s.lostCount | 0;
        state.oppActive = prePk(s.active);
        state.oppBenchLimit = s.benchLimit || 5;
        const rawBench = s.bench || {};
        state.oppBench = [0, 1, 2, 3, 4, 5, 6, 7].map(i => prePk(rawBench[i] || null));
        state.oppPlayCard = s.playCard ? pre(s.playCard) : null;
      }

      // スタジアム・ターン情報の更新
      if (s.stadium) state.stadium = s.stadium;
      if (s.stadiumTs) state.stadiumTs = Number(s.stadiumTs) || 0;
      if (s.turn) state.turn = s.turn;
      if (s.turnStep) state.turnStep = s.turnStep;

      // 観戦者ラベルの更新
      const matchupLabel = document.getElementById("spectator-matchup-label");
      if (matchupLabel) {
        matchupLabel.textContent = `【${state.spectatorHostName}】 vs 【${state.spectatorGuestName}】`;
      }

      if (typeof renderSleeves === "function") renderSleeves();
      if (typeof renderPlaymats === "function") renderPlaymats();
      if (typeof renderAll === "function") renderAll();
    } finally {
      this._isApplyingSnapshot = false;
    }
  },

  _onPeerJoined(peerName) {
    this._clearTimeoutTimer();
    this.connected = true;
    this.lastError = null;
    this.conn = { open: true, close: () => this.disconnect() }; // 互換性維持

    this._setState(P2P_STATES.CONNECTED, `ルーム: ${this.roomCode}`);

    if (typeof showToast === "function") {
      showToast("対戦相手と接続しました！");
    }

    this._sendHello();
    this.send({
      t: "conn_check",
      phase: "syn",
      from: this.role,
      ts: Date.now()
    });
    this.syncNow();
    this.updateWebRTCStatsUI();
    if (typeof renderAll === "function") renderAll();
  },

  _onPeerDisconnected(peerName) {
    this._clearTimeoutTimer();
    const wasConnected = this.connected;
    this.connected = false;

    if (wasConnected || !this._closingIntentionally) {
      this._setState(P2P_STATES.DISCONNECTED, `${peerName} との接続が切断されました`);
      if (typeof showToast === "function") {
        showToast("対戦相手との接続が切断されました");
      }
    }
    if (typeof renderAll === "function") renderAll();
  },

  // ---- 明示的な切断処理 ----
  disconnect() {
    if (this.connected) {
      this.send({ t: "peer_disconnect", reason: "user_disconnect" });
    }
    this._destroy();
    const roomBox = document.getElementById("room-box");
    if (roomBox) roomBox.classList.add("hidden");
    this._setState(P2P_STATES.DISCONNECTED, "接続を切断しました");
    if (typeof showToast === "function") {
      showToast("対戦ルームから切断しました");
    }
    if (typeof renderAll === "function") renderAll();
  },

  // ---- 双方向テストメッセージ送信 ----
  sendTestMessage(text) {
    if (!this.isConnected()) {
      if (typeof showToast === "function") showToast("オンライン接続が確立されていません");
      return false;
    }
    const cleanText = String(text || "").trim() || "テストメッセージ (Ping)";
    const payload = {
      t: "test_message",
      sender: this.role === "host" ? "オーナー" : "参加者",
      name: (document.getElementById("in-name")?.value.trim()) || state.myName,
      text: cleanText,
      ts: Date.now()
    };
    this.send(payload);
    this._appendTestLog(`📤 送信: ${cleanText}`);
    return true;
  },

  _appendTestLog(line) {
    const logEl = document.getElementById("p2p-test-log");
    if (!logEl) return;
    const timeStr = new Date().toLocaleTimeString("ja-JP", { hour12: false });
    const item = document.createElement("div");
    item.className = "p2p-test-log-item";
    item.textContent = `[${timeStr}] ${line}`;
    logEl.appendChild(item);
    logEl.scrollTop = logEl.scrollHeight;
  },

  // ---- 通信経路・接続情報UI表示（セキュリティ保護のため内部技術名は非表示） ----
  async getWebRTCStats() {
    return {
      state: "connected"
    };
  },

  async updateWebRTCStatsUI() {
    const infoEl = document.getElementById("p2p-webrtc-info");
    if (infoEl) {
      infoEl.textContent = "";
    }
  },

  // ---- 送信 ----
  send(msg) {
    if (this.connected && this._actionsRef) {
      console.log("[Firebase SEND]", msg?.t);
      try {
        // Firebase RTDB はプロパティ値に undefined が含まれるとエラーを投げるため、
        // JSON.stringify / JSON.parse を通して undefined を安全に除去して送信
        const cleanData = JSON.parse(JSON.stringify(msg));
        this._actionsRef.push({
          sender: this.role,
          data: cleanData,
          ts: Date.now()
        });
      } catch (err) {
        console.error("[Firebase SEND Error]", err);
      }
    }
  },

  _sendHello() {
    const nameEl = document.getElementById("in-name");
    const name = (nameEl && nameEl.value.trim()) || state.myName;
    const matSync = (typeof getMyPlaymatSyncData === "function")
      ? getMyPlaymatSyncData()
      : { matId: state.myMatId, matDataUrl: null };
    this.send({
      t: "hello",
      name,
      deckCode: state.myDeckCode || "",
      matId: matSync.matId,
      matDataUrl: matSync.matDataUrl,
      deck: state.myLoadedDeck || SAMPLE_DECK
    });
  },

  _canSync() {
    return this.connected && !state.isSoloMode && !(typeof replayState !== "undefined" && replayState.isActive);
  },

  publicSnapshot() {
    return {
      t: "state",
      name: state.myName,
      matId: state.myMatId,
      sleeveId: state.mySleeveId,
      sleeveDataUrl: state.mySleeveDataUrl,
      handCount: state.myHand.length,
      deckCount: state.myDeck.length,
      prizes: state.myPrizes.length,
      trash: state.myTrash,
      lostCount: state.myLost.length,
      active: state.myActive,
      bench: state.myBench,
      playCard: state.playCard,
      stadium: state.stadium,
      stadiumTs: Number(state.stadiumTs) || 0,
      benchLimit: state.myBenchLimit || 5,
      turn: state.turn,
      turnStep: state.turnStep || 1
    };
  },

  _isApplyingSnapshot: false,
  _lastSentSnapshotJson: null,

  /** 描画のたびに呼ばれる（連続呼び出しは間引く） */
  syncSoon() {
    if (!this._canSync() || this._isApplyingSnapshot) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.syncNow(), 60);
  },

  syncNow() {
    if (!this._canSync() || this._isApplyingSnapshot) return;
    const snap = this.publicSnapshot();
    const snapJson = JSON.stringify(snap);
    if (snapJson === this._lastSentSnapshotJson) return;
    this._lastSentSnapshotJson = snapJson;
    this.send(snap);
  },

  // ---- 受信 ----
  _onData(msg, sender) {
    if (!msg || typeof msg !== "object") return;
    console.log("[Firebase RECV]", msg.t, sender);

    // 観戦者参加通知の受信（対戦者双方が最新盤面を再送）
    if (msg.t === "spectator_joined") {
      const specName = msg.spectatorName || "観戦者";
      addLog(`【観戦】${specName} さんが観戦に参加しました`, { suppressSync: true });
      if (typeof showToast === "function") {
        showToast(`👁️ ${specName} さんが観戦に参加しました`);
      }
      if (this.role === "host" || this.role === "guest") {
        this.syncNow();
      }
      return;
    }

    // 👁️ 観戦者モード時のスナップショット・プレイヤー情報振り分け
    if (this.role === "spectator" || state.isSpectator) {
      if (msg.t === "state") {
        this._applySpectatorSnapshot(msg, sender);
        return;
      }
      if (msg.t === "hello" || msg.t === "deck_sync") {
        if (sender === "host") {
          state.spectatorHostName = msg.name || state.spectatorHostName;
          if (msg.matId) state.myMatId = msg.matId;
          if (msg.sleeveId) state.mySleeveId = msg.sleeveId;
          if ("sleeveDataUrl" in msg) state.mySleeveDataUrl = msg.sleeveDataUrl || null;
        } else if (sender === "guest") {
          state.spectatorGuestName = msg.name || state.spectatorGuestName;
          state.oppName = state.spectatorGuestName;
          if (msg.matId) state.oppMatId = msg.matId;
          if (msg.sleeveId) state.oppSleeveId = msg.sleeveId;
          if ("sleeveDataUrl" in msg) state.oppSleeveDataUrl = msg.sleeveDataUrl || null;
        }
        if (typeof renderSleeves === "function") renderSleeves();
        if (typeof renderPlaymats === "function") renderPlaymats();
        if (typeof renderAll === "function") renderAll();
        return;
      }
    }

    if (msg.t === "error" && msg.code === "room_full") {
      this._clearTimeoutTimer();
      this.connected = false;
      this.lastError = "room_full";
      this._setState(
        P2P_STATES.CONNECTION_FAILED,
        msg.message || "このルームは既に2人対戦中のため参加できません"
      );
      if (typeof showToast === "function") {
        showToast("ルームが満員のため参加できませんでした");
      }
      return;
    }

    if (msg.t === "player_exit" || msg.t === "peer_disconnect") {
      this._clearTimeoutTimer();
      this.connected = false;
      const pName = msg.playerName || state.oppName || "相手プレイヤー";
      const isExit = (msg.t === "player_exit");
      state.oppExited = true;

      this._setState(
        P2P_STATES.DISCONNECTED,
        isExit ? `${pName} さんが対戦から退室しました` : "相手が接続を切断しました"
      );

      const gameEl = document.getElementById("game");
      const inGame = gameEl && !gameEl.classList.contains("hidden");
      if (inGame) {
        addLog(`【退室】${pName} さんが対戦ルームから退室しました`, { isRemote: true });
        if (typeof showActionPopup === "function") {
          showActionPopup(pName, "対戦ルームから退室しました", [], "🚪 相手が退室");
        }
        if (typeof showModal === "function") {
          showModal(
            "🚪 対戦相手が退室しました",
            `<div style="text-align:center; padding:18px 10px; color:#f8fafc;">
              <div style="font-size:44px; margin-bottom:10px;">🚪</div>
              <p style="font-size:17px; font-weight:bold; color:#fca5a5; margin-bottom:8px;">
                <b>${this._escapeHtml(pName)}</b> さんが対戦から退室しました
              </p>
              <p style="font-size:13px; color:#cbd5e1; line-height:1.6;">
                このまま盤面や対戦ログを確認するか、ロビーに戻ることができます。
              </p>
            </div>`,
            `<div style="display:flex; gap:8px; justify-content:flex-end;">
              <button class="btn" onclick="closeModal()">このまま盤面を見る</button>
              <button class="btn red" onclick="closeModal(); document.getElementById('game').classList.add('hidden'); document.getElementById('lobby').classList.remove('hidden');">ロビーに戻る</button>
            </div>`
          );
        }
      } else if (typeof showToast === "function") {
        showToast(isExit ? `${pName} さんが退室しました` : "相手が接続を切断しました");
      }

      if (typeof renderAll === "function") renderAll();
      return;
    }

    if (msg.t === "fx") {
      if (typeof playLocalBoardEffect === "function") {
        playLocalBoardEffect(msg, true);
      }
      return;
    }

    if (msg.t === "opp_remote_action") {
      if (typeof handleOpponentRemoteAction === "function") {
        handleOpponentRemoteAction(msg);
      }
      return;
    }

    if (msg.t === "victory") {
      const winnerName = msg.winnerName || state.oppName || "相手プレイヤー";
      addLog(`【決着】${winnerName} の勝利となりました！`, { isRemote: true });
      if (typeof playGrandVictoryEffect === "function") {
        playGrandVictoryEffect(winnerName, msg.reason || "勝利宣言", true);
      }
      return;
    }

    if (msg.t === "declare_attack") {
      const pName = msg.playerName || state.oppName || "相手プレイヤー";
      if (typeof showAttackCutin === "function") {
        showAttackCutin(pName, msg.pokemonName, msg.attackName);
      }
      return;
    }

    if (msg.t === "chat_message") {
      if (typeof handleIncomingChatMessage === "function") {
        handleIncomingChatMessage(msg);
      }
      return;
    }

    // ---- ボイス通話電文 (WebRTCシグナリング) ----
    if (msg.t === "voice_call_request") {
      if (window.VoiceChat) {
        VoiceChat.handleIncomingCallRequest(msg.callerName);
      }
      return;
    }

    if (msg.t === "voice_call_accept") {
      if (window.VoiceChat) {
        VoiceChat.handleCallAccepted();
      }
      return;
    }

    if (msg.t === "voice_call_reject") {
      if (typeof closeModal === "function") closeModal();
      if (typeof showToast === "function") {
        showToast(msg.reason === "busy" ? "⚠️ 相手は通話中のため接続できませんでした" : "📞 相手が通話リクエストに応答しませんでした");
      }
      if (window.VoiceChat) {
        VoiceChat.resetVoiceCallState();
      }
      return;
    }

    if (msg.t === "voice_call_cancel") {
      if (typeof closeModal === "function") closeModal();
      if (typeof showToast === "function") {
        showToast("📞 相手が通話の呼び出しをキャンセルしました");
      }
      if (window.VoiceChat) {
        VoiceChat.resetVoiceCallState();
      }
      return;
    }

    if (msg.t === "voice_call_end") {
      if (window.VoiceChat) {
        VoiceChat.endCall(false);
      }
      return;
    }

    if (msg.t === "voice_offer") {
      if (window.VoiceChat) {
        VoiceChat.handleRemoteOffer(msg.offer);
      }
      return;
    }

    if (msg.t === "voice_answer") {
      if (window.VoiceChat) {
        VoiceChat.handleRemoteAnswer(msg.answer);
      }
      return;
    }

    if (msg.t === "voice_ice") {
      if (window.VoiceChat) {
        VoiceChat.handleRemoteIceCandidate(msg.candidate);
      }
      return;
    }

    if (msg.t === "conn_check") {
      if (msg.phase === "syn") {
        this.send({
          t: "conn_check",
          phase: "ack",
          from: this.role,
          ts: Date.now()
        });
      } else if (msg.phase === "ack") {
        this._appendTestLog("✅ 双方向通信(SYN/ACK)を確認しました");
        this.updateWebRTCStatsUI();
      }
      return;
    }

    if (msg.t === "test_message") {
      const senderLabel = msg.name ? `${msg.sender || "相手"}(${msg.name})` : (msg.sender || "相手");
      this._appendTestLog(`📥 受信 [${senderLabel}]: ${msg.text}`);
      if (typeof showToast === "function") {
        showToast(`📩 受信: ${msg.text}`);
      }
      // 受信確認(ACK)を返す
      this.send({
        t: "test_message_ack",
        text: msg.text,
        ts: Date.now()
      });
      return;
    }

    if (msg.t === "test_message_ack") {
      this._appendTestLog(`✓ 相手がメッセージを受信しました（「${msg.text}」）`);
      return;
    }

    if (msg.t === "hello") {
      state.oppName = msg.name || "相手プレイヤー";
      if (msg.deckCode) state.oppDeckCode = msg.deckCode;
      state.oppMatId = msg.matId || state.oppMatId;
      state.oppExited = false;
      if ("matDataUrl" in msg) state.oppMatDataUrl = msg.matDataUrl || null;
      if (msg.sleeveId) state.oppSleeveId = msg.sleeveId;
      if ("sleeveDataUrl" in msg) state.oppSleeveDataUrl = msg.sleeveDataUrl || null;
      if (typeof renderSleeves === "function") renderSleeves();
      if (Array.isArray(msg.deck)) {
        state.oppLoadedDeck = msg.deck;
      }
      this._setState(P2P_STATES.CONNECTED, `相手: ${state.oppName} / ルーム: ${this.roomCode}`);
      this.updateWebRTCStatsUI();
      renderAll();
    } else if (msg.t === "start" || msg.t === "match_start") {
      state.oppName = msg.name || state.oppName;
      state.oppDeckCode = msg.deckCode || state.oppDeckCode || "";
      state.oppExited = false;
      if (msg.matId) state.oppMatId = msg.matId;
      if ("matDataUrl" in msg) state.oppMatDataUrl = msg.matDataUrl || null;
      if (msg.sleeveId) state.oppSleeveId = msg.sleeveId;
      if ("sleeveDataUrl" in msg) state.oppSleeveDataUrl = msg.sleeveDataUrl || null;
      if (typeof renderSleeves === "function") renderSleeves();
      if (Array.isArray(msg.deck)) {
        state.oppLoadedDeck = msg.deck;
      }
      if (typeof resetOpponentCards === "function") {
        resetOpponentCards();
      }

      const game = document.getElementById("game");
      if (game && game.classList.contains("hidden")) {
        const nameEl = document.getElementById("in-name");
        state.myName = (nameEl && nameEl.value.trim()) || "プレイヤーB";
        if (!state.myDeckCode) {
          const inDeckEl = document.getElementById("in-deck");
          const rawIn = inDeckEl ? inDeckEl.value.trim() : "";
          if (rawIn) {
            state.myDeckCode = (typeof extractOfficialDeckCode === "function" && extractOfficialDeckCode(rawIn)) || rawIn.replace(/[\(（【\[].*?[\)）】\]]/g, "").trim();
          }
        }
        startBattleSetup();
        const matSync = (typeof getMyPlaymatSyncData === "function")
          ? getMyPlaymatSyncData()
          : { matId: state.myMatId, matDataUrl: null };
        this.send({
          t: "deck_sync",
          name: state.myName,
          deckCode: state.myDeckCode || "",
          matId: matSync.matId,
          matDataUrl: matSync.matDataUrl,
          sleeveId: state.mySleeveId,
          sleeveDataUrl: state.mySleeveDataUrl,
          deck: state.myLoadedDeck || SAMPLE_DECK
        });
        this.syncNow();
      }
      renderAll();
    } else if (msg.t === "deck_sync") {
      state.oppName = msg.name || state.oppName;
      if (msg.deckCode) state.oppDeckCode = msg.deckCode;
      if (msg.matId) state.oppMatId = msg.matId;
      if ("matDataUrl" in msg) state.oppMatDataUrl = msg.matDataUrl || null;
      if (msg.sleeveId) state.oppSleeveId = msg.sleeveId;
      if ("sleeveDataUrl" in msg) state.oppSleeveDataUrl = msg.sleeveDataUrl || null;
      if (typeof renderSleeves === "function") renderSleeves();
      if (Array.isArray(msg.deck)) {
        state.oppLoadedDeck = msg.deck;
      }
      renderAll();
    } else if (msg.t === "playmat_sync") {
      if (msg.matId) state.oppMatId = msg.matId;
      state.oppMatDataUrl = msg.matDataUrl || null;
      if (typeof renderPlaymats === "function") renderPlaymats();
    } else if (msg.t === "sleeve_sync") {
      if (msg.sleeveId) state.oppSleeveId = msg.sleeveId;
      state.oppSleeveDataUrl = msg.sleeveDataUrl || null;
      if (typeof renderSleeves === "function") renderSleeves();
    } else if (msg.t === "action_log") {
      const pName = msg.playerName || state.oppName || "相手プレイヤー";
      const text = msg.text || "";
      const cards = Array.isArray(msg.cards) ? msg.cards : [];
      const badge = msg.badge || "📢 相手の行動";
      if (text) {
        addLog(`【${pName}】${text}`, { isRemote: true });
        if (typeof showActionPopup === "function") {
          showActionPopup(pName, text, cards, badge);
        }
      }
      renderAll();
    } else if (msg.t === "card_used") {
      const pre = (c) => c ? { ...c, uid: "opp:" + String(c.uid).replace(/^(opp:)+/, "") } : null;
      state.oppPlayCard = pre(msg.card);
      const pName = msg.playerName || state.oppName || "相手プレイヤー";
      if (msg.card) {
        addLog(`【使用】${pName} が「${msg.card.name}」を使用しました`, { isRemote: true });
        if (typeof showCardUsePopup === "function") {
          showCardUsePopup(pName, state.oppPlayCard);
        }
      }
      renderAll();
    } else if (msg.t === "deck_cards_revealed") {
      const pName = msg.playerName || state.oppName || "相手プレイヤー";
      const cards = Array.isArray(msg.cards) ? msg.cards : [];
      const names = cards.map(c => c.name).join(", ");
      const actionLabel = msg.actionLabel || "山札から手札に加えた";
      if (cards.length > 0) {
        addLog(`【公開】${pName} が「${names}」（${cards.length}枚）を${actionLabel}！`, { isRemote: true });
        if (typeof showCardRevealPopup === "function") {
          showCardRevealPopup(pName, cards, actionLabel);
        }
      }
      renderAll();
    } else if (msg.t === "deck_cards_secret_hand") {
      const pName = msg.playerName || state.oppName || "相手プレイヤー";
      const count = msg.count || 1;
      const text = `山札からカードを ${count}枚（相手に見せずに）手札に加えました`;
      addLog(`【${pName}】${text}`, { isRemote: true });
      if (typeof showActionPopup === "function") {
        showActionPopup(pName, text, [], "🤫 山札から手札へ（非公開）");
      }
      renderAll();
    } else if (msg.t === "coin_result") {
      state.coinResult = msg.coin;
      state.coinChooser = msg.chooser;
      const isHeads = (msg.coin === "heads");
      const resultText = isHeads ? "表（オモテ）" : "裏（ウラ）";
      addLog(`【対戦準備】ルームオーナーのコイントス: 【${resultText}】！ (${msg.chooser === 'host' ? 'ルームオーナー' : '相手（ゲスト）'}が先攻・後攻を選択)`, { isRemote: true });
      if (typeof playCoinTossEffect === "function") {
        playCoinTossEffect(isHeads, msg.name || state.oppName, () => {
          showToast(`コイントス: 【${resultText}】！`);
          if (typeof handleCoinResult === "function") {
            handleCoinResult(isHeads, msg.chooser);
          }
        });
      } else {
        showToast(`コイントス: 【${resultText}】！`);
        if (typeof handleCoinResult === "function") {
          handleCoinResult(isHeads, msg.chooser);
        }
      }
    } else if (msg.t === "order_chosen") {
      if (typeof closeModal === "function") closeModal();
      const isMeFirst = (msg.firstPlayerRole === this.role);
      state.firstPlayer = isMeFirst ? "me" : "opp";
      state.setupStep = "place";
      const myOrderName = isMeFirst ? "先攻" : "後攻";
      addLog(`【対戦準備】相手の選択により、あなたは【${myOrderName}】になりました。`, { isRemote: true });
      if (typeof showActionPopup === "function") {
        showActionPopup(
          state.oppName || "相手プレイヤー",
          `先攻・後攻を選択！ あなたは【${myOrderName}】です`,
          [],
          "🎲 先攻・後攻決定"
        );
      }
      showToast(`あなたは【${myOrderName}】です！ たねポケモンをバトル場に出してください`);
      renderAll();
    } else if (msg.t === "mulligan_declare") {
      state.oppMulliganDeclared = true;
      const pName = msg.name || state.oppName || "相手プレイヤー";
      addLog(`【対戦準備】相手（${pName}）が「たねポケモンなし（マリガン）」を宣言しました（あなたの準備完了後に手札が公開されます）`, { isRemote: true });
      if (typeof showActionPopup === "function") {
        showActionPopup(pName, "「たねポケモンなし（マリガン）」を宣言しました", [], "⚠️ マリガン宣言");
      }
      showToast(`⚠️ 相手が「たねなし」を宣言しました。先にバトル場・サイドを準備完了してください`);
      if (state.myMulliganStep === "waiting_opp_ready" && typeof sendMulliganRevealToOpponent === "function") {
        sendMulliganRevealToOpponent();
      } else if (state.mySetupReady) {
        this.send({ t: "setup_ready", name: state.myName });
        renderAll();
      } else {
        renderAll();
      }
    } else if (msg.t === "mulligan_reveal") {
      state.oppMulliganDeclared = false;
      state.oppMulliganCount = msg.count || (state.oppMulliganCount + 1);
      addLog(`【対戦準備】相手（${msg.name || state.oppName}）がマリガン確認のため手札7枚を公開しました（${state.oppMulliganCount}回目）`, { isRemote: true });
      const rawHand = msg.hand;
      const handCards = Array.isArray(rawHand)
        ? rawHand.filter(Boolean)
        : Object.values(rawHand || {}).filter(Boolean);
      if (typeof enqueueOpponentMulliganReveal === "function") {
        enqueueOpponentMulliganReveal({
          count: state.oppMulliganCount,
          name: msg.name || state.oppName,
          hand: handCards
        });
      }
      renderAll();
    } else if (msg.t === "mulligan_ack") {
      addLog(`【対戦準備】相手（${msg.name || state.oppName}）が手札を確認しました。山札に戻して7枚引き直します`, { isRemote: true });
      if (typeof performMulliganRedraw === "function") {
        performMulliganRedraw();
      }
    } else if (msg.t === "mulligan_reject") {
      const pName = msg.name || state.oppName || "相手プレイヤー";
      const reason = msg.reason || "手札にたねポケモンが存在するため、マリガンは認められませんでした。";
      addLog(`【対戦準備】相手（${pName}）からマリガンが却下されました: ${reason}`, { isRemote: true });
      if (typeof handleMulliganRejected === "function") {
        handleMulliganRejected(reason, pName);
      }
    } else if (msg.t === "mulligan") {
      state.oppMulliganCount = msg.count || (state.oppMulliganCount + 1);
      addLog(`【対戦準備】相手（${msg.name || state.oppName}）がマリガンを行いました（${state.oppMulliganCount}回目）`, { isRemote: true });
      showToast(`相手が手札を引き直しました (マリガン ${state.oppMulliganCount}回目)`);
      renderAll();
    } else if (msg.t === "setup_ready") {
      state.oppSetupReady = true;
      const pName = msg.name || state.oppName || "相手プレイヤー";
      addLog(`【対戦準備】相手（${pName}）が対戦準備（バトル場・サイドセット）を完了しました`, { isRemote: true });
      if (state.myMulliganStep === "waiting_opp_ready" && typeof sendMulliganRevealToOpponent === "function") {
        showToast("相手が準備完了しました！あなたの手札7枚を相手に公開します");
        sendMulliganRevealToOpponent();
      } else if (state.mySetupReady && typeof handlePreMatchMulliganPenalty === "function") {
        handlePreMatchMulliganPenalty();
      } else if (state.mySetupReady && typeof finishSetupPhaseAndStartBattle === "function") {
        finishSetupPhaseAndStartBattle();
      } else {
        if (typeof showActionPopup === "function") {
          showActionPopup(pName, "バトル場とサイド6枚のセットを完了しました！", [], "✅ 対戦準備完了");
        }
        showToast("相手が対戦準備を完了しました！");
        renderAll();
      }
    } else if (msg.t === "mulligan_penalty_done") {
      if (typeof closeModal === "function") closeModal();
      if (msg.drawn && msg.count > 0) {
        addLog(`【対戦準備】相手（${msg.name || state.oppName}）がマリガンペナルティによりカードを${msg.count}枚引きました`, {
          isRemote: true,
          badge: "🎴 ペナルティドロー"
        });
        showToast(`相手がマリガンペナルティで${msg.count}枚引きました`);
      } else {
        addLog(`【対戦準備】相手（${msg.name || state.oppName}）はマリガンペナルティの追加ドローを行いませんでした`, {
          isRemote: true,
          badge: "▶️ ドロー辞退"
        });
      }
      renderAll();
      if (typeof finishSetupPhaseAndStartBattle === "function") {
        finishSetupPhaseAndStartBattle();
      }
    } else if (msg.t === "turn_change") {
      state.turnStep = msg.turnStep || ((state.turnStep || 1) + 1);
      const newTurnInfo = (typeof getTurnInfo === "function")
        ? getTurnInfo(state.turnStep)
        : { label: `ターン ${state.turn}`, isMyTurn: false, activePlayerName: state.oppName };
      state.turn = newTurnInfo.round;
      if (typeof resetAllAbilitiesUsed === "function") {
        resetAllAbilitiesUsed();
      }

      addLog(`【ターン交代】次は【${newTurnInfo.activePlayerName}】の番です（${newTurnInfo.label}）`, { isRemote: true });
      renderAll();

      if (typeof playTurnChangeBanner === "function") {
        playTurnChangeBanner(newTurnInfo, () => {
          if (newTurnInfo.isMyTurn) {
            if (typeof checkTurnStartActiveCondition === "function") {
              checkTurnStartActiveCondition(() => {
                if (typeof executeTurnStartDraw === "function") {
                  executeTurnStartDraw();
                }
              });
            } else if (typeof executeTurnStartDraw === "function") {
              executeTurnStartDraw();
            }
          }
        });
      }
    } else if (msg.t === "match_open") {
      state.isSetupPhase = false;
      state.setupStep = "done";
      state.mySetupReady = true;
      state.oppSetupReady = true;
      state.myMulliganStep = null;
      state.oppMulliganDeclared = false;
      state.turnStep = 1;
      state.turn = 1;

      showToast("🎉 せーの、オープン！ バトル開始！");
      const mulliganNote = state.oppMulliganCount > 0 ? `（※相手のマリガン ${state.oppMulliganCount}回分、必要に応じて山札から引いてください）` : "";
      const initialTurnInfo = (typeof getTurnInfo === "function")
        ? getTurnInfo(1)
        : { label: "先攻1ターン目", isMyTurn: (state.firstPlayer !== "opp"), activePlayerName: (state.firstPlayer === "opp" ? state.oppName : state.myName) };

      addLog(`お互いのバトル場を公開し、対戦を開始しました！ (${initialTurnInfo.label}: 【${initialTurnInfo.activePlayerName}】の番) ${mulliganNote}`, { isRemote: true });
      renderAll();

      if (typeof playTurnChangeBanner === "function") {
        playTurnChangeBanner(initialTurnInfo, () => {
          if (initialTurnInfo.isMyTurn && typeof executeTurnStartDraw === "function") {
            executeTurnStartDraw();
          }
        });
      }
    } else if (msg.t === "state") {
      this._applySnapshot(msg);
    }
  },

  _applySnapshot(s) {
    this._isApplyingSnapshot = true;
    try {
      this._lastSnap = s;
      const pre = (c) => c ? { ...c, uid: "opp:" + String(c.uid).replace(/^(opp:)+/, "") } : c;
      const prePk = (p) => p ? {
        ...p,
        card: pre(p.card),
        energies: (p.energies || []).map(pre),
        tool: pre(p.tool),
        previousStages: (p.previousStages || []).map(pre)
      } : null;

      state.oppName = s.name || state.oppName;
      state.oppMatId = s.matId || state.oppMatId;
      if (s.sleeveId) state.oppSleeveId = s.sleeveId;
      if ("sleeveDataUrl" in s) state.oppSleeveDataUrl = s.sleeveDataUrl || null;
      if (typeof renderSleeves === "function") renderSleeves();
      state.oppHandCount = s.handCount | 0;
      state.oppDeckCount = s.deckCount | 0;
      state.oppPrizes = s.prizes | 0;
      state.oppTrash = (s.trash || []).map(pre);
      state.oppLostCount = s.lostCount | 0;
      state.oppActive = prePk(s.active);
      state.oppBenchLimit = s.benchLimit || 5;
      const rawBench = s.bench || {};
      state.oppBench = [0, 1, 2, 3, 4, 5, 6, 7].map(i => prePk(rawBench[i] || null));
      state.oppPlayCard = s.playCard ? pre(s.playCard) : null;

      const incomingStadiumTs = Number(s.stadiumTs) || 0;
      const currentStadiumTs = Number(state.stadiumTs) || 0;

      if (incomingStadiumTs > currentStadiumTs) {
        if (s.stadium) {
          // 相手が新しいスタジアムを出した場合 (要件2-2)
          if (state.stadium) {
            const old = state.stadium;
            const oldIsMine = (!old.owner || old.owner === "me") && (!old.uid || !String(old.uid).startsWith("opp:"));
            if (oldIsMine) {
              state.myTrash.push(old);
              addLog(`相手がスタジアムを出したため、自分のスタジアム「${old.name}」がトラッシュされました`, {
                cards: [old],
                badge: "🗑️ スタジアム破棄"
              });
              if (typeof SoundEffects !== "undefined") SoundEffects.playTrash();
            }
          }
          state.stadium = { ...pre(s.stadium), owner: "opp" };
          state.stadiumTs = incomingStadiumTs;
        } else {
          // 相手がスタジアムをトラッシュ/破棄した場合 (要件2-1の相手操作)
          if (state.stadium) {
            const old = state.stadium;
            const oldIsMine = (!old.owner || old.owner === "me") && (!old.uid || !String(old.uid).startsWith("opp:"));
            if (oldIsMine) {
              state.myTrash.push(old);
              addLog(`スタジアム「${old.name}」がトラッシュされました`, {
                cards: [old],
                badge: "🗑️ スタジアム破棄"
              });
              if (typeof SoundEffects !== "undefined") SoundEffects.playTrash();
            }
          }
          state.stadium = null;
          state.stadiumTs = incomingStadiumTs;
        }
      }
      if ((s.turnStep | 0) > (state.turnStep | 0)) {
        state.turnStep = s.turnStep | 0;
        state.turn = Math.floor(((state.turnStep | 0) + 1) / 2);
      } else if ((s.turn | 0) > state.turn) {
        state.turn = s.turn | 0;
      }

      const game = document.getElementById("game");
      if (game && !game.classList.contains("hidden")) {
        if (typeof renderAll === "function") {
          renderAll();
        } else {
          document.getElementById("g-opp-name").textContent = state.oppName;
          renderOpponent();
          renderPlayArea();
          renderStadium();
          renderPlaymats();
        }
      }
    } finally {
      this._isApplyingSnapshot = false;
    }
  },

  /** 対戦開始時: デモ用ダミー相手を消して通信相手の情報を待つ */
  resetOpponentForOnlineMatch() {
    state.oppHandCount = 0;
    state.oppDeckCount = 0;
    state.oppPrizes = 0;
    state.oppTrash = [];
    state.oppLostCount = 0;
    state.oppActive = null;
    state.oppBench = [null, null, null, null, null, null, null, null];
    state.oppBenchLimit = 5;
    state.oppPlayCard = null;
  }
};
