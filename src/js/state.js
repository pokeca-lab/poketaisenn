/* 【状態】グローバル状態オブジェクト */

// =============================================================================
// アプリケーション状態 (State)
// =============================================================================
let state = {
  // プレイヤー情報
  myName: "プレイヤーA",
  oppName: "プレイヤーB（BOT）",
  roomNo: "482913",
  turn: 1,
  turnStep: 1, // 1: 先攻1ターン目, 2: 後攻1ターン目, 3: 先攻2ターン目, 4: 後攻2ターン目...

  // 対戦準備フェーズ状態
  isSetupPhase: false,
  setupStep: "coin", // "coin" | "order" | "place" | "ready" | "done"
  coinResult: null,   // "heads" (表) | "tails" (裏)
  coinChooser: null,  // "host" | "guest"
  firstPlayer: null,  // "host" | "guest"
  mySetupReady: false,
  oppSetupReady: false,
  mulliganCount: 0,
  oppMulliganCount: 0,
  myMulliganStep: null,         // null | "waiting_opp_ready" | "waiting_opp_ack"
  oppMulliganDeclared: false,   // 相手が「たねなし宣言」をしてこちらの準備完了を待っているか
  pendingOppMulliganQueue: [],  // 相手から公開されたマリガン手札の確認キュー

  // 自分のカードゾーン
  myDeck: [],
  myHand: [],
  myPrizes: [],
  myTrash: [],
  myLost: [],
  myActive: null,       // { card, damage, energies, tool }
  myBench: [null, null, null, null, null, null, null, null],
  myBenchLimit: 5,      // 通常5匹、スタジアムや特性等で8匹に拡張可能

  // テンポラリエリア
  tempCards: [],
  selectedTempIndices: new Set(),

  // 選択中のフィールドポケモン { location, index }
  selectedFieldPokemon: null,

  // バトル場不在によるベンチ出撃待ちフェーズ
  mustPromoteToActive: false,

  // 操作履歴スタック（1手順巻き戻し用）
  historyStack: [],

  // 使用カードエリア
  playCard: null,
  oppPlayCard: null,    // 相手が使用カードエリアに置いているカード

  // 共有ゾーン
  stadium: null,
  stadiumTs: 0,         // P2P同期用: スタジアム最終変更時刻

  // 相手のカードゾーン (デモ用ダミー)
  oppDeckCount: 47,
  oppHandCount: 5,
  oppPrizes: 6,
  oppTrash: [
    { name: "博士の研究", type: "trainer", color: "trainer", uid: "opp_t0" },
    { name: "ハイパーボール", type: "trainer", color: "trainer", uid: "opp_t1" },
    { name: "基本草エネルギー", type: "energy", color: "grass", uid: "opp_t2" }
  ],
  oppLostCount: 0,
  oppActive: createFieldPokemon(OPPONENT_DECK[2], 60, [
    { name: "基本草エネルギー", type: "energy", color: "grass", uid: "opp_e0" },
    { name: "基本草エネルギー", type: "energy", color: "grass", uid: "opp_e1" }
  ], { name: "森の封印石", type: "trainer", color: "trainer", sub: "ポケモンのどうぐ", uid: "opp_tool0" }),
  oppBench: [
    createFieldPokemon(OPPONENT_DECK[0], 0, [{ name: "基本草エネルギー", type: "energy", color: "grass", uid: "opp_be0" }]),
    createFieldPokemon(OPPONENT_DECK[1], 0),
    null, null, null, null, null, null
  ],
  oppBenchLimit: 5,

  // UI選択・ドラッグ状態
  _selectedHandIndex: -1,
  selectedHandIndices: new Set(),
  get selectedHandIndex() {
    if (this.selectedHandIndices && this.selectedHandIndices.size === 1) {
      return this.selectedHandIndices.values().next().value;
    }
    return this._selectedHandIndex !== undefined ? this._selectedHandIndex : -1;
  },
  set selectedHandIndex(val) {
    this._selectedHandIndex = val;
    if (val >= 0) {
      if (!this.selectedHandIndices) this.selectedHandIndices = new Set();
      if (this.selectedHandIndices.size <= 1) {
        this.selectedHandIndices.clear();
        this.selectedHandIndices.add(val);
      }
    }
  },
  draggedHandIndex: -1,
  draggedEnergy: null, // { location, energyIndex }
  actionTargetMode: null, // "bench" | "active" など配置先選択待ち
  myMatId: "mat_01",
  oppMatId: "mat_02",
  oppMatDataUrl: null,  // 相手が自作プレイマット画像を選択している場合のDataURL
  mySleeveId: "sleeve_01",
  mySleeveDataUrl: null,
  oppSleeveId: "sleeve_01",
  oppSleeveDataUrl: null,
  autoTrashEnabled: localStorage.getItem("pokeca_auto_trash") !== "false",
  autoTrashTimer: null,
  isSoloMode: false,
  isSoloTemporarySwap: false, // 一人回し中、手番を進めずに相手側視点に一時交代しているか
  oppDeck: [],          // 一人回し用の完全な相手デッキ
  oppHand: [],          // 一人回し用の完全な相手手札
  oppPrizesList: [],    // 一人回し用の完全な相手サイドカード
  oppLost: [],          // 一人回し用の完全な相手ロストカード
  soloDeckA: SAMPLE_DECK,
  soloDeckB: SAMPLE_DECK_B,
  myLoadedDeck: SAMPLE_DECK,
  oppLoadedDeck: null,
  myDeckCode: "",
  oppDeckCode: "",
  oppExited: false,
  logs: [],

  // 技宣言機能
  lastDeclaredAttackName: "",

  // 対戦チャット機能
  chatMessages: [],
  chatUnreadCount: 0,

  // P2Pボイスチャット機能
  voiceCall: {
    active: false,
    status: "idle", // "idle" | "calling" | "incoming" | "connected"
    isMuted: false,
    localStream: null,
    remoteStream: null,
    mediaConnection: null,
    callerName: "",
    durationTimer: null,
    durationSec: 0
  }
};

/** 通信対戦開始時: ダミーBOTデータ（フシギバナex等）を完全に破棄して初期化 */
function resetOpponentCards() {
  state.oppActive = null;
  state.oppBench = [null, null, null, null, null, null, null, null];
  state.oppBenchLimit = 5;
  state.oppTrash = [];
  state.oppLost = [];
  state.oppLostCount = 0;
  state.oppDeckCount = 53;
  state.oppHandCount = 7;
  state.oppPrizes = 0;
  state.oppPlayCard = null;
  state.oppExited = false;
  state.historyStack = [];
  if (state.selectedTempIndices) state.selectedTempIndices.clear();
  state.selectedFieldPokemon = null;
  state.mustPromoteToActive = false;
}

window.resetOpponentCards = resetOpponentCards;
window.state = state;



