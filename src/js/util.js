/* 【共通】ユーティリティ */

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// =============================================================================
// カード画像フォールバック管理（画像欠損・読込失敗時に白背景カード＋名前を確実表示）
// =============================================================================

// 読込失敗が確認された画像URLのセット（次回以降の描画で即時フォールバック）
window.brokenImageUrls = window.brokenImageUrls || new Set();

/** カードが有効な画像を持っているか判定（破損確認済みURLは除外） */
function isCardImageValid(card) {
  if (!card || !card.imageUrl) return false;
  const url = String(card.imageUrl).trim();
  if (!url) return false;
  if (window.brokenImageUrls && window.brokenImageUrls.has(url)) return false;
  return true;
}

/** カード画像読込エラー時の即時フォールバック実行ハンドラー */
window.onCardImageError = function(imgEl, url) {
  if (url && window.brokenImageUrls) {
    window.brokenImageUrls.add(url);
  }
  const cardEl = imgEl ? imgEl.closest(".card") : null;
  if (cardEl) {
    cardEl.classList.remove("has-img");
    cardEl.classList.add("card-fallback-white");
    cardEl.style.backgroundImage = "none";
    const centerFallback = cardEl.querySelector(".card-fallback-center");
    if (centerFallback) {
      centerFallback.style.display = "flex";
    }
  }
};

/** カード属性・種別に応じたシンボル絵文字を取得 */
function getCardTypeIcon(card) {
  if (!card) return "🃏";
  const type = card.type || "";
  const color = card.color || "";
  const name = card.name || "";

  if (type === "energy" || name.includes("エネルギー")) {
    if (color === "grass") return "🌿";
    if (color === "fire") return "🔥";
    if (color === "water") return "💧";
    if (color === "lightning") return "⚡";
    if (color === "psychic") return "🔮";
    if (color === "fighting") return "👊";
    if (color === "darkness") return "🌙";
    if (color === "metal") return "⚙️";
    return "⚡";
  }

  if (type === "trainer" || card.category === "トレーナーズ") {
    if (card.sub === "グッズ" || name.includes("ボール") || name.includes("いれかえ") || name.includes("アメ")) return "🎒";
    if (card.sub === "サポート" || card.category === "サポート") return "👤";
    if (card.sub === "スタジアム" || type === "stadium" || card.category === "スタジアム") return "🏟️";
    if (card.sub === "ポケモンのどうぐ") return "🧰";
    return "📜";
  }

  // ポケモン
  if (color === "grass") return "🌿";
  if (color === "fire") return "🔥";
  if (color === "water") return "💧";
  if (color === "lightning") return "⚡";
  if (color === "psychic") return "🔮";
  if (color === "fighting") return "👊";
  if (color === "darkness") return "🌙";
  if (color === "metal") return "⚙️";
  if (color === "dragon") return "🐉";
  return "⚡";
}

// =============================================================================
// ポケモン公式アートワーク（全国図鑑No.1〜1025）検索＆透かし背景生成
// =============================================================================
const _pokemonNameToDexId = new Map();

function initPokemonDexMap() {
  if (_pokemonNameToDexId.size > 0) return;
  const list = window.POKEMON_SPECIES_NAMES;
  if (!Array.isArray(list)) return;
  for (let id = 1; id < list.length; id++) {
    const name = list[id];
    if (name) _pokemonNameToDexId.set(name, id);
  }
}

/** カード名からポケモンの公式イラストURLを取得 */
function getPokemonIllustrationUrl(cardName) {
  if (!cardName) return null;
  initPokemonDexMap();

  let clean = String(cardName).replace(/[\s　・\(\)（）\-_]/g, "");
  clean = clean.replace(/(?:ex|EX|vmax|VMAX|vstar|VSTAR|gx|GX|v|V|break|BREAK|lv\.\d+)$/i, "");
  clean = clean.replace(/^(?:かがやく|わるい|やさしい|ヒスイ|アローラ|ガラル|パルデア|オリジン)/, "");

  // 1. 完全一致
  if (_pokemonNameToDexId.has(clean)) {
    const id = _pokemonNameToDexId.get(clean);
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
  }

  // 2. 部分一致（図鑑を逆順＝新しい世代/長い名前から走査）
  const list = window.POKEMON_SPECIES_NAMES;
  if (Array.isArray(list)) {
    for (let id = list.length - 1; id >= 1; id--) {
      const pokeName = list[id];
      if (pokeName && pokeName.length >= 2 && clean.includes(pokeName)) {
        return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
      }
    }
  }

  return null;
}

/** カード内部のHTML構造（上部名前/HP、中央アイコン、下部カテゴリ、画像プローブ、透かしイラスト）を生成 */
function buildCardInnerHtml(card, extraTopHtml = "") {
  if (!card) return "";
  const icon = getCardTypeIcon(card);
  const hpBadge = card.hp ? `<span class="hp">HP${escapeHtml(card.hp)}</span>` : "";
  const subText = escapeHtml(card.sub || card.category || card.type || "");
  const isImgValid = isCardImageValid(card);

  // 画像URLがある場合は不可視プローブ画像を配置（エラー発生時に瞬時に白背景カードへ切り替え）
  const probeImg = (card.imageUrl && isImgValid)
    ? `<img src="${escapeHtml(card.imageUrl)}" class="card-img-probe" style="display:none;" referrerpolicy="no-referrer" onerror="window.onCardImageError(this, '${escapeHtml(card.imageUrl)}')">`
    : "";

  // ポケモンの公式イラスト背景（ウォーターマーク）
  const pokeArtUrl = (card.type === "pokemon" || card.category === "ポケモン" || card.hp)
    ? getPokemonIllustrationUrl(card.name)
    : null;

  const watermarkHtml = pokeArtUrl
    ? `<div class="card-fallback-watermark" style="background-image: url('${pokeArtUrl}');"></div>`
    : "";

  return `
    ${probeImg}
    ${watermarkHtml}
    <div class="card-top">
      <span class="name">${escapeHtml(card.name)}</span>
      ${extraTopHtml}
      ${hpBadge}
    </div>
    <div class="card-fallback-center ${pokeArtUrl ? 'has-watermark' : ''}">
      ${pokeArtUrl ? '' : `<span class="fallback-icon">${icon}</span>`}
      <span class="fallback-type-label">${subText || 'カード'}</span>
    </div>
    <div class="card-btm">
      <span>${subText}</span>
    </div>
  `;
}

/** カード要素のクラス名とスタイル文字列を一括生成 */
function getCardRenderProps(card, isSelected = false, extraClasses = "") {
  if (typeof registerCard === "function" && card) {
    registerCard(card);
  }
  const hasImg = isCardImageValid(card);
  const imgClass = hasImg ? "has-img" : "card-fallback-white";
  const imgStyle = hasImg ? `style="background-image: url('${escapeHtml(card.imageUrl)}');"` : "";
  const selClass = isSelected ? "selected" : "";
  const colorClass = card ? (card.color || "trainer") : "trainer";
  const className = `card ${colorClass} ${imgClass} ${selClass} ${extraClasses}`.trim().replace(/\s+/g, " ");

  return {
    className,
    imgStyle,
    hasImg,
    isFallback: !hasImg
  };
}

/** 拡大モーダル用の高精細フォールバック白カードHTML */
function buildZoomFallbackCardHtml(card) {
  if (!card) return "";
  const icon = getCardTypeIcon(card);
  const hpBadge = card.hp ? `<span class="hp" style="font-size:16px; background:#fee2e2; color:#b91c1c; border:1.5px solid #f87171; font-weight:800; padding:2px 8px; border-radius:6px;">HP${escapeHtml(card.hp)}</span>` : "";
  const subText = escapeHtml(card.category || card.sub || card.type || "カード");
  const pokeArtUrl = (card.type === "pokemon" || card.category === "ポケモン" || card.hp)
    ? getPokemonIllustrationUrl(card.name)
    : null;

  return `
    <div class="card card-fallback-white zoom-fallback-card" style="width:240px; height:336px; padding:16px; box-shadow:0 10px 25px rgba(0,0,0,0.6); border-radius:12px; position:relative; overflow:hidden;">
      ${pokeArtUrl ? `<div class="card-fallback-watermark" style="background-image: url('${pokeArtUrl}'); opacity: 0.35; background-size: 85% auto;"></div>` : ''}
      <div class="card-top" style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:flex-start; width:100%; position:relative; z-index:1;">
        <span class="name" style="font-size:19px; font-weight:900; color:#0f172a; line-height:1.25; word-break:break-word; max-width:72%;">${escapeHtml(card.name)}</span>
        ${hpBadge}
      </div>
      <div class="card-fallback-center" style="display:flex; flex-direction:column; align-items:center; justify-content:center; flex:1; gap:10px; position:relative; z-index:1;">
        ${pokeArtUrl ? '' : `<span style="font-size:56px; line-height:1;">${icon}</span>`}
        <span style="font-size:14px; font-weight:bold; color:#334155; background:#f1f5f9; border:1px solid #cbd5e1; padding:3px 12px; border-radius:999px;">${subText}</span>
        <span style="font-size:11px; color:#64748b; font-weight:bold; background:rgba(255,255,255,0.85); padding:2px 8px; border-radius:4px;">${pokeArtUrl ? '[公式イラスト背景合成]' : '[カード代替表示]'}</span>
      </div>
      <div class="card-btm" style="border-top:1px dashed #cbd5e1; padding-top:6px; display:flex; justify-content:space-between; color:#64748b; font-size:12px; font-weight:bold; position:relative; z-index:1;">
        <span>${subText}</span>
        <span>${escapeHtml(card.type || "")}</span>
      </div>
    </div>
  `;
}

/** デッキ内画像の事前検証（バックグラウンドで画像存在確認） */
function preloadAndVerifyDeckImages(deck) {
  if (!Array.isArray(deck)) return;
  const uniqueUrls = [...new Set(deck.map(c => c && c.imageUrl).filter(Boolean))];
  uniqueUrls.forEach(url => {
    if (window.brokenImageUrls && window.brokenImageUrls.has(url)) return;
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.onerror = () => {
      if (window.brokenImageUrls) {
        window.brokenImageUrls.add(url);
      }
      // 画面内に既に描画された対象カードがあれば白背景フォールバックへ変換
      document.querySelectorAll(`.card[style*="${url}"]`).forEach(cardEl => {
        cardEl.classList.remove("has-img");
        cardEl.classList.add("card-fallback-white");
        cardEl.style.backgroundImage = "none";
        const center = cardEl.querySelector(".card-fallback-center");
        if (center) center.style.display = "flex";
      });
    };
    img.src = url;
  });
}

window.isCardImageValid = isCardImageValid;
window.getCardTypeIcon = getCardTypeIcon;
window.getPokemonIllustrationUrl = getPokemonIllustrationUrl;
window.buildCardInnerHtml = buildCardInnerHtml;
window.getCardRenderProps = getCardRenderProps;
window.buildZoomFallbackCardHtml = buildZoomFallbackCardHtml;
window.preloadAndVerifyDeckImages = preloadAndVerifyDeckImages;
