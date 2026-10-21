/* 【データ/ロジック】デッキコード・公式デッキリスト解析エンジン (Deck Parser)
 *
 * 対応入力フォーマット:
 * 1. プリセットコード (例: DEMO-CHARIZARD-2026, DEMO-VENUSAUR-2026, blastoise, miraidon 等)
 * 2. 公式デッキコード (例: ppyypR-JwZ2WT-Up232S) または 公式デッキURL
 *    - プロキシ経由で公式ページの取得を試行
 *    - 取得成功時はカード名・枚数・公式画像URLを展開
 *    - CORS制限等で自動取得不可時はテキスト貼付モーダルへ誘導
 * 3. 公式サイト「テキストで表示」コピー / プレーンテキスト貼り付け
 *    - 「リザードンex 3」または「3 リザードンex」形式を自動判別
 *    - カード種別(ポケモン/トレーナーズ/エネルギー)および属性色、HPを自動推論
 */

// =============================================================================
// 追加プリセットデッキ定義 (計8種類)
// =============================================================================

// カメックスexデッキ (60枚)
const SAMPLE_DECK_BLASTOISE = [
  // ポケモン (14枚)
  { name: "ゼニガメ", type: "pokemon", color: "water", category: "ポケモン" },
  { name: "ゼニガメ", type: "pokemon", color: "water", category: "ポケモン" },
  { name: "ゼニガメ", type: "pokemon", color: "water", category: "ポケモン" },
  { name: "カメール", type: "pokemon", color: "water", category: "ポケモン" },
  { name: "カメール", type: "pokemon", color: "water", category: "ポケモン" },
  { name: "カメックスex", type: "pokemon", color: "water", category: "ポケモン" },
  { name: "カメックスex", type: "pokemon", color: "water", category: "ポケモン" },
  { name: "かがやくゲッコウガ", type: "pokemon", color: "water", category: "ポケモン" },
  { name: "パオジアンex", type: "pokemon", color: "water", category: "ポケモン" },
  { name: "セビエ", type: "pokemon", color: "water", category: "ポケモン" },
  { name: "セビエ", type: "pokemon", color: "water", category: "ポケモン" },
  { name: "セグレイブ", type: "pokemon", color: "water", category: "ポケモン" },
  { name: "セグレイブ", type: "pokemon", color: "water", category: "ポケモン" },
  { name: "マナフィ", type: "pokemon", color: "water", category: "ポケモン" },

  // トレーナーズ (35枚)
  { name: "ネストボール", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ネストボール", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ネストボール", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ネストボール", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ハイパーボール", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ハイパーボール", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ハイパーボール", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ふしぎなアメ", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ふしぎなアメ", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ふしぎなアメ", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ふしぎなアメ", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "大地の器", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "大地の器", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "すごいつりざお", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "すごいつりざお", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ポケモンいれかえ", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "キャンセルコロン", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "スーパーエネルギー回収", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "スーパーエネルギー回収", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "スーパーエネルギー回収", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "プライムキャッチャー", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "勇気のおまもり", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "勇気のおまもり", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "カイ", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "カイ", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "カイ", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "カイ", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ナンジャモ", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ナンジャモ", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ボスの指令", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ボスの指令", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "博士の研究", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ペパー", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ポケストップ", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ポケストップ", type: "trainer", color: "trainer", category: "トレーナーズ" },

  // エネルギー (11枚)
  { name: "基本水エネルギー", type: "energy", color: "water", category: "エネルギー" },
  { name: "基本水エネルギー", type: "energy", color: "water", category: "エネルギー" },
  { name: "基本水エネルギー", type: "energy", color: "water", category: "エネルギー" },
  { name: "基本水エネルギー", type: "energy", color: "water", category: "エネルギー" },
  { name: "基本水エネルギー", type: "energy", color: "water", category: "エネルギー" },
  { name: "基本水エネルギー", type: "energy", color: "water", category: "エネルギー" },
  { name: "基本水エネルギー", type: "energy", color: "water", category: "エネルギー" },
  { name: "基本水エネルギー", type: "energy", color: "water", category: "エネルギー" },
  { name: "基本水エネルギー", type: "energy", color: "water", category: "エネルギー" },
  { name: "基本水エネルギー", type: "energy", color: "water", category: "エネルギー" },
  { name: "基本水エネルギー", type: "energy", color: "water", category: "エネルギー" }
];

// ミライドンex / ピカチュウex 雷速攻デッキ (60枚)
const SAMPLE_DECK_MIRAIDON = [
  // ポケモン (14枚)
  { name: "ミライドンex", type: "pokemon", color: "lightning", category: "ポケモン" },
  { name: "ミライドンex", type: "pokemon", color: "lightning", category: "ポケモン" },
  { name: "ピカチュウex", type: "pokemon", color: "lightning", category: "ポケモン" },
  { name: "ピカチュウex", type: "pokemon", color: "lightning", category: "ポケモン" },
  { name: "テツノカイナex", type: "pokemon", color: "lightning", category: "ポケモン" },
  { name: "テツノカイナex", type: "pokemon", color: "lightning", category: "ポケモン" },
  { name: "ライコウV", type: "pokemon", color: "lightning", category: "ポケモン" },
  { name: "サンダー", type: "pokemon", color: "lightning", category: "ポケモン" },
  { name: "ミュウex", type: "pokemon", color: "psychic", category: "ポケモン" },
  { name: "メリープ", type: "pokemon", color: "lightning", category: "ポケモン" },
  { name: "メリープ", type: "pokemon", color: "lightning", category: "ポケモン" },
  { name: "モココ", type: "pokemon", color: "lightning", category: "ポケモン" },
  { name: "モココ", type: "pokemon", color: "lightning", category: "ポケモン" },
  { name: "かがやくゲッコウガ", type: "pokemon", color: "water", category: "ポケモン" },

  // トレーナーズ (32枚)
  { name: "エレキジェネレーター", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "エレキジェネレーター", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "エレキジェネレーター", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "エレキジェネレーター", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ハイパーボール", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ハイパーボール", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ハイパーボール", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ハイパーボール", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ネストボール", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ネストボール", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "テクノレーダー", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "テクノレーダー", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "すごいつりざお", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ポケモンいれかえ", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "あなぬけのヒモ", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "プライムキャッチャー", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "森の封印石", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "勇気のおまもり", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ヘビーバトン", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ヘビーバトン", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "博士の研究", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "博士の研究", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "博士の研究", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "博士の研究", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ボスの指令", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ボスの指令", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ボスの指令", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ナンジャモ", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ナンジャモ", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ペパー", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ビーチコート", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ビーチコート", type: "trainer", color: "trainer", category: "トレーナーズ" },

  // エネルギー (14枚)
  { name: "基本雷エネルギー", type: "energy", color: "lightning", category: "エネルギー" },
  { name: "基本雷エネルギー", type: "energy", color: "lightning", category: "エネルギー" },
  { name: "基本雷エネルギー", type: "energy", color: "lightning", category: "エネルギー" },
  { name: "基本雷エネルギー", type: "energy", color: "lightning", category: "エネルギー" },
  { name: "基本雷エネルギー", type: "energy", color: "lightning", category: "エネルギー" },
  { name: "基本雷エネルギー", type: "energy", color: "lightning", category: "エネルギー" },
  { name: "基本雷エネルギー", type: "energy", color: "lightning", category: "エネルギー" },
  { name: "基本雷エネルギー", type: "energy", color: "lightning", category: "エネルギー" },
  { name: "基本雷エネルギー", type: "energy", color: "lightning", category: "エネルギー" },
  { name: "基本雷エネルギー", type: "energy", color: "lightning", category: "エネルギー" },
  { name: "基本雷エネルギー", type: "energy", color: "lightning", category: "エネルギー" },
  { name: "基本雷エネルギー", type: "energy", color: "lightning", category: "エネルギー" },
  { name: "基本雷エネルギー", type: "energy", color: "lightning", category: "エネルギー" },
  { name: "ダブルターボエネルギー", type: "energy", color: "pokemon", category: "エネルギー" }
];

// ドラパルトexデッキ (60枚)
const SAMPLE_DECK_DRAGAPULT = [
  // ポケモン (16枚)
  { name: "ドラメシヤ", type: "pokemon", color: "psychic", category: "ポケモン" },
  { name: "ドラメシヤ", type: "pokemon", color: "psychic", category: "ポケモン" },
  { name: "ドラメシヤ", type: "pokemon", color: "psychic", category: "ポケモン" },
  { name: "ドラメシヤ", type: "pokemon", color: "psychic", category: "ポケモン" },
  { name: "ドロンチ", type: "pokemon", color: "psychic", category: "ポケモン" },
  { name: "ドロンチ", type: "pokemon", color: "psychic", category: "ポケモン" },
  { name: "ドロンチ", type: "pokemon", color: "psychic", category: "ポケモン" },
  { name: "ドロンチ", type: "pokemon", color: "psychic", category: "ポケモン" },
  { name: "ドラパルトex", type: "pokemon", color: "psychic", category: "ポケモン" },
  { name: "ドラパルトex", type: "pokemon", color: "psychic", category: "ポケモン" },
  { name: "ドラパルトex", type: "pokemon", color: "psychic", category: "ポケモン" },
  { name: "ロトムV", type: "pokemon", color: "pokemon", category: "ポケモン" },
  { name: "ネオラントV", type: "pokemon", color: "water", category: "ポケモン" },
  { name: "マナフィ", type: "pokemon", color: "water", category: "ポケモン" },
  { name: "かがやくフーディン", type: "pokemon", color: "psychic", category: "ポケモン" },
  { name: "ピィ", type: "pokemon", color: "pokemon", category: "ポケモン" },

  // トレーナーズ (34枚)
  { name: "なかよしポフィン", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "なかよしポフィン", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "なかよしポフィン", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "なかよしポフィン", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ハイパーボール", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ハイパーボール", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ハイパーボール", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ネストボール", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ネストボール", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ふしぎなアメ", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ふしぎなアメ", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "大地の器", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "大地の器", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "すごいつりざお", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "すごいつりざお", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "カウンターキャッチャー", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "改造ハンマー", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "プライムキャッチャー", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "森の封印石", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ワザマシン エヴォリューション", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ナンジャモ", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ナンジャモ", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ナンジャモ", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ボスの指令", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ボスの指令", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ボスの指令", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ペパー", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ペパー", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ペパー", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "博士の研究", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "フトゥー博士のシナリオ", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "スグリ", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "ボウルタウン", type: "trainer", color: "trainer", category: "トレーナーズ" },
  { name: "崩れたスタジアム", type: "trainer", color: "trainer", category: "トレーナーズ" },

  // エネルギー (10枚)
  { name: "基本炎エネルギー", type: "energy", color: "fire", category: "エネルギー" },
  { name: "基本炎エネルギー", type: "energy", color: "fire", category: "エネルギー" },
  { name: "基本炎エネルギー", type: "energy", color: "fire", category: "エネルギー" },
  { name: "基本超エネルギー", type: "energy", color: "psychic", category: "エネルギー" },
  { name: "基本超エネルギー", type: "energy", color: "psychic", category: "エネルギー" },
  { name: "基本超エネルギー", type: "energy", color: "psychic", category: "エネルギー" },
  { name: "基本超エネルギー", type: "energy", color: "psychic", category: "エネルギー" },
  { name: "きらめく結晶", type: "energy", color: "pokemon", category: "エネルギー" },
  { name: "ネオアッパーエネルギー", type: "energy", color: "pokemon", category: "エネルギー" },
  { name: "基本超エネルギー", type: "energy", color: "psychic", category: "エネルギー" }
];

// =============================================================================
// プリセットカタログ
// =============================================================================
const PRESET_DECKS = [
  {
    id: "charizard",
    code: "DEMO-CHARIZARD-2026",
    name: "悪リザードンex（ピジョット型）",
    deck: SAMPLE_DECK
  },
  {
    id: "venusaur",
    code: "DEMO-VENUSAUR-2026",
    name: "フシギバナex（草回復・ビーダル型）",
    deck: SAMPLE_DECK_B
  },
  {
    id: "blastoise",
    code: "DEMO-BLASTOISE-2026",
    name: "カメックスex（激流ポンプ・セグレイブ型）",
    deck: SAMPLE_DECK_BLASTOISE
  },
  {
    id: "miraidon",
    code: "DEMO-MIRAIDON-2026",
    name: "ミライドンex ＆ ピカチュウex（雷速攻型）",
    deck: SAMPLE_DECK_MIRAIDON
  },
  {
    id: "dragapult",
    code: "DEMO-DRAGAPULT-2026",
    name: "ドラパルトex（ファントムダイブ型）",
    deck: SAMPLE_DECK_DRAGAPULT
  }
];

// =============================================================================
// カード情報自動推論ヘルパー（パターンA: 画像ファイル名 _P_ / _T_ / _E_ による確定分類）
// =============================================================================
function inferCardTypeAndCategory(name, explicitSection = "", imageUrl = "") {
  name = (name || "").trim();
  const lower = name.toLowerCase();
  const urlStr = imageUrl || "";

  // ファイル名規則 ({id}_{P|T|E}_{NAME}.jpg) による3大分類の確定判定
  const isUrlEnergy  = /_E_[A-Z0-9_]+\./i.test(urlStr);
  const isUrlTrainer = /_T_[A-Z0-9_]+\./i.test(urlStr);
  const isUrlPokemon = /_P_[A-Z0-9_]+\./i.test(urlStr);

  // 1. エネルギー判定 (_E_ または明示セクション・カード名)
  if (isUrlEnergy || explicitSection.includes("エネルギー") || (!isUrlPokemon && !isUrlTrainer && (name.includes("エネルギー") || lower.includes("energy")))) {
    let color = "pokemon";
    if (name.includes("炎") || lower.includes("fire")) color = "fire";
    else if (name.includes("水") || lower.includes("water")) color = "water";
    else if (name.includes("草") || lower.includes("grass")) color = "grass";
    else if (name.includes("雷") || lower.includes("lightning")) color = "lightning";
    else if (name.includes("超") || lower.includes("psychic")) color = "psychic";
    else if (name.includes("闘") || lower.includes("fighting")) color = "fighting";
    else if (name.includes("悪") || lower.includes("darkness")) color = "darkness";
    else if (name.includes("鋼") || lower.includes("metal")) color = "metal";
    return {
      type: "energy",
      color: color,
      category: "エネルギー"
    };
  }

  // 2. トレーナーズ判定 (_T_ または明示セクション)
  if (
    isUrlTrainer ||
    explicitSection.includes("トレーナー") ||
    explicitSection.includes("グッズ") ||
    explicitSection.includes("サポート") ||
    explicitSection.includes("どうぐ") ||
    explicitSection.includes("スタジアム") ||
    explicitSection.includes("Trainer") ||
    explicitSection.includes("Item") ||
    explicitSection.includes("Supporter") ||
    explicitSection.includes("Stadium")
  ) {
    return {
      type: "trainer",
      color: "trainer",
      category: "トレーナーズ"
    };
  }

  // 3. ポケモン判定 (_P_ または上記以外)
  let color = "pokemon";
  if (/リザ|炎|ホゲータ|エンテイ|ヒードラン|ウインディ|ブースター|ガオガエン/.test(name)) color = "fire";
  else if (/フシギ|草|ニャオハ|ゲッコウガ|マスカーニャ|オーガポン|アマージョ/.test(name)) color = "grass";
  else if (/カメ|水|パオジアン|セビエ|セグレイブ|ウェーニバル|カイオーガ|シャワーズ/.test(name)) color = "water";
  else if (/ピカ|ミライドン|雷|カイナ|ライコ|サンダー|サンダース|モココ/.test(name)) color = "lightning";
  else if (/ドラパ|サーナイト|超|ミュウ|フーディン|キルリア|ラルトス|クレセリア/.test(name)) color = "psychic";
  else if (/ルカリオ|闘|コライドン|ウーラオス|ガチグマ/.test(name)) color = "fighting";
  else if (/ダーク|悪|トドロクツキ|イベルタル|ブラッキー/.test(name)) color = "darkness";
  else if (/鋼|サーフゴー|ディアルガ|ギルガルド/.test(name)) color = "metal";

  return {
    type: "pokemon",
    color: color,
    category: "ポケモン"
  };
}

// =============================================================================
// テキストデッキリスト解析 (公式「テキストで表示」など)
// =============================================================================
function parseDeckListText(rawText) {
  if (!rawText || typeof rawText !== "string") return null;

  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  let currentSection = "";
  const cardItems = [];

  for (const line of lines) {
    // セクション見出し (例: "ポケモン (14)", "グッズ (22)", "Pokémon: 8")
    const sectionMatch = line.match(/^(?:ポケモン|ポケモンのどうぐ|グッズ|サポート|スタジアム|エネルギー|Pokémon|Trainer|Item|Supporter|Stadium|Energy)[\s:（(]/i);
    if (sectionMatch) {
      currentSection = line;
      continue;
    }

    // 行からカード名と枚数を抽出
    // パターン1: "リザードンex 3" または "リザードンex x3"
    // パターン2: "3 リザードンex" または "3x リザードンex"
    let name = "";
    let count = 1;

    const trailingNumMatch = line.match(/^(.+?)\s+[x×]?(\d+)\s*$/);
    const leadingNumMatch = line.match(/^(\d+)[x×]?\s+(.+)$/);

    if (trailingNumMatch) {
      name = trailingNumMatch[1].trim();
      count = parseInt(trailingNumMatch[2], 10);
    } else if (leadingNumMatch) {
      count = parseInt(leadingNumMatch[1], 10);
      name = leadingNumMatch[2].trim();
    } else {
      // 枚数指定がない場合は1枚
      name = line.replace(/^[・\-\*\s]+/, "").trim();
      count = 1;
    }

    // エキスパンション記号・型番の除去 (例: "リザードンex (SV4a 115/190)" -> "リザードンex")
    name = name.replace(/\([A-Z0-9a-z\s\/-]+\)$/, "").trim();
    name = name.replace(/\s+[A-Z]{2,4}\s+\d+.*$/, "").trim(); // PTCGL形式 "OBF 125"

    if (!name) continue;
    if (count <= 0 || count > 60) count = 1;

    const inferred = inferCardTypeAndCategory(name, currentSection);
    cardItems.push({
      name: name,
      count: count,
      ...inferred
    });
  }

  if (cardItems.length === 0) return null;

  // 60枚のフラット配列に展開
  const flatDeck = [];
  cardItems.forEach(item => {
    for (let i = 0; i < item.count; i++) {
      flatDeck.push({
        name: item.name,
        type: item.type,
        color: item.color,
        category: item.category,
        sub: item.sub,
        hp: item.hp,
        uid: "card_" + Math.random().toString(36).substring(2, 9)
      });
    }
  });

  return flatDeck;
}

// =============================================================================
// 公式デッキコード (6桁-6桁-6桁) の正規化 & 取得
// =============================================================================
function extractOfficialDeckCode(input) {
  if (!input) return null;
  const str = input.trim();
  // URLからの抽出 (deckID/XXXXXX-XXXXXX-XXXXXX または XXXXXX-XXXXXX)
  const urlMatch = str.match(/deckID\/([a-zA-Z0-9]{6}-[a-zA-Z0-9]{6}-[a-zA-Z0-9]{6}|[a-zA-Z0-9]{6}-[a-zA-Z0-9]{6})/i);
  if (urlMatch) return urlMatch[1];

  // 文字列内のコードパターン抽出 (6桁-6桁-6桁 または 6桁-6桁)
  const codeMatch = str.match(/([a-zA-Z0-9]{6}-[a-zA-Z0-9]{6}-[a-zA-Z0-9]{6})/i) || str.match(/([a-zA-Z0-9]{6}-[a-zA-Z0-9]{6})/i);
  if (codeMatch) return codeMatch[1];

  return null;
}

/** 公式サイト・ふなむしAPIからのデッキデータ・画像取得 */
async function fetchOfficialDeckByCode(code) {
  // 1. ふなむしAPI経由（CORS対応・全60枚カード名および公式カード画像URL取得）
  try {
    const res = await fetch(`https://api.funamushi.net/ajax/get3?id=${encodeURIComponent(code)}`, {
      signal: AbortSignal.timeout(6000)
    });
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list) && list.length > 0) {
        return list.map((item, i) => {
          let imgUrl = (item.url && typeof item.url === "string") ? item.url.trim() : null;
          if (imgUrl) {
            if (imgUrl.startsWith("http://")) imgUrl = imgUrl.replace("http://", "https://");
            else if (imgUrl.startsWith("//")) imgUrl = "https:" + imgUrl;
          }
          const inferred = inferCardTypeAndCategory(item.name, "", imgUrl);
          return {
            name: item.name,
            imageUrl: imgUrl || null,
            type: inferred.type,
            color: inferred.color,
            category: inferred.category,
            sub: inferred.sub,
            hp: inferred.hp,
            uid: "c_" + i + "_" + Math.random().toString(36).substring(2, 7)
          };
        });
      }
    }
  } catch (e) {
    console.warn("funamushi API fetch failed, trying official scraping fallback...", e);
  }

  // 2. 公式デッキresult.htmlの直接 / プロキシ取得フォールバック
  const targetUrl = `https://www.pokemon-card.com/deck/result.html/deckID/${encodeURIComponent(code)}`;
  const candidateUrls = [
    targetUrl,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`
  ];

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const html = await res.text();
      if (!html || !html.includes("deck_pke")) continue;

      // 公式HTMLのパース
      const parsedDeck = parseOfficialDeckHtml(html);
      if (parsedDeck && parsedDeck.length > 0) {
        return parsedDeck;
      }
    } catch (e) {
      // タイムアウトまたはCORSエラー、次へ
    }
  }
  return null;
}

/** 公式確認ページのHTMLから60枚のカードを復元 */
function parseOfficialDeckHtml(html) {
  try {
    const cardMap = {}; // id -> { name, pict }
    const nameMatches = [...html.matchAll(/PCGDECK\.searchItemNameAlt\[(\d+)\]='([^']+)';/g)];
    const pictMatches = [...html.matchAll(/PCGDECK\.searchItemCardPict\[(\d+)\]='([^']+)';/g)];

    nameMatches.forEach(m => {
      const id = m[1];
      cardMap[id] = cardMap[id] || {};
      cardMap[id].name = m[2];
    });

    pictMatches.forEach(m => {
      const id = m[1];
      cardMap[id] = cardMap[id] || {};
      let p = m[2];
      if (p) {
        if (p.startsWith("//")) p = "https:" + p;
        else if (p.startsWith("http://")) p = p.replace("http://", "https://");
        else if (!p.startsWith("http")) p = `https://www.pokemon-card.com${p}`;
      }
      cardMap[id].pict = p || null;
    });

    const categories = [
      { key: "deck_pke", sec: "ポケモン" },
      { key: "deck_gds", sec: "グッズ" },
      { key: "deck_tool", sec: "ポケモンのどうぐ" },
      { key: "deck_sup", sec: "サポート" },
      { key: "deck_sta", sec: "スタジアム" },
      { key: "deck_ene", sec: "エネルギー" }
    ];

    const flatCards = [];
    categories.forEach(cat => {
      const re = new RegExp(`name="${cat.key}"[^>]+value="([^"]*)"`);
      const m = html.match(re);
      if (m && m[1]) {
        // "43701_4_1-44549_2_1" 形式
        const items = m[1].split("-").filter(Boolean);
        items.forEach(it => {
          const parts = it.split("_");
          const cardId = parts[0];
          const count = parseInt(parts[1], 10) || 1;
          const info = cardMap[cardId] || { name: `カード_${cardId}`, pict: null };
          const inferred = inferCardTypeAndCategory(info.name, cat.sec, info.pict);

          for (let i = 0; i < count; i++) {
            flatCards.push({
              name: info.name,
              imageUrl: info.pict || null,
              type: inferred.type,
              color: inferred.color,
              category: inferred.category,
              sub: inferred.sub,
              hp: inferred.hp,
              uid: "c_" + Math.random().toString(36).substring(2, 9)
            });
          }
        });
      }
    });

    return flatCards.length > 0 ? flatCards : null;
  } catch (e) {
    console.error("Failed to parse official deck HTML:", e);
    return null;
  }
}

// =============================================================================
// 統合デッキ入力リゾルバー (Main Parser Function)
// =============================================================================
async function resolveDeckInput(inputStr) {
  if (!inputStr) {
    return { ok: false, message: "デッキコードまたはデッキ名を入力してください" };
  }

  const clean = inputStr.trim();

  // 1. プリセットデッキ完全・部分一致
  const upper = clean.toUpperCase();
  for (const preset of PRESET_DECKS) {
    if (
      preset.code.toUpperCase() === upper ||
      preset.id.toUpperCase() === upper ||
      preset.name.includes(clean) ||
      clean.includes(preset.id)
    ) {
      return {
        ok: true,
        name: preset.name,
        code: preset.code,
        deck: preset.deck.map((c, i) => ({ ...c, uid: "c_" + i }))
      };
    }
  }

  // 2. 複数行テキスト貼付の検出
  if (clean.includes("\n") || clean.includes("\r") || clean.split(" ").length >= 4) {
    const parsed = parseDeckListText(clean);
    if (parsed && parsed.length > 0) {
      return {
        ok: true,
        name: "カスタムデッキ（" + parsed.length + "枚）",
        code: "CUSTOM-TEXT",
        deck: parsed
      };
    }
  }

  // 3. 公式デッキコード判定 (6桁-6桁-6桁)
  const officialCode = extractOfficialDeckCode(clean);
  if (officialCode) {
    showToast(`公式デッキコード「${officialCode}」の読込を試行中...`);
    const fetchedDeck = await fetchOfficialDeckByCode(officialCode);
    if (fetchedDeck && fetchedDeck.length > 0) {
      return {
        ok: true,
        name: `公式デッキ [${officialCode}]`,
        code: officialCode,
        deck: fetchedDeck
      };
    }

    // 自動取得が失敗した場合
    return {
      ok: false,
      isOfficialBlocked: true,
      code: officialCode,
      message: `公式コード「${officialCode}」のカード情報を取得できませんでした。コードが正しいかご確認ください。`
    };
  }

  // 4. 不明な入力
  return {
    ok: false,
    message: `「${clean}」に一致するデッキが見つかりません。プリセットを選択するか、テキスト貼り付けをご利用ください。`
  };
}
