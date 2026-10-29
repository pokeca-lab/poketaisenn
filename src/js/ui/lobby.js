/* 【UI】ロビー（デッキプレビュー・モード切替・デッキ読込・プリセット選択） */

// =============================================================================
// デッキプレビュー描画 (ロビー画面用)
// =============================================================================
// デッキプレビュー描画 (ロビー画面用)
// =============================================================================
function renderDeckPreview(deck, elementId = "deck-preview") {
  const el = document.getElementById(elementId);
  if (!el || !Array.isArray(deck)) return;

  const pokemonCount = deck.filter(c => c.type === "pokemon").length;
  const trainerCount = deck.filter(c => c.type === "trainer" || c.type === "stadium").length;
  const energyCount = deck.filter(c => c.type === "energy").length;
  const imgCount = deck.filter(c => c.imageUrl).length;

  // 主力ポケモン上位2〜3体を抽出して表示
  const mainPokemons = deck.filter(c => c.type === "pokemon" && (c.name.includes("ex") || c.name.includes("V") || c.category === "2進化"));
  const previewNames = [...new Set(mainPokemons.map(p => p.name))].slice(0, 3).join(", ");

  // 画像付きカード（重複除外してサムネイル表示）
  const uniqueCards = [];
  const seenUrls = new Set();
  deck.forEach(c => {
    registerCard(c);
    if (c.imageUrl && !seenUrls.has(c.imageUrl)) {
      seenUrls.add(c.imageUrl);
      uniqueCards.push(c);
    }
  });

  let thumbsHtml = "";
  if (uniqueCards.length > 0) {
    thumbsHtml = `
      <div class="deck-preview-thumbs">
        ${uniqueCards.slice(0, 18).map(c => `
          <div class="deck-preview-thumb" onclick="openCardZoomByUid('${c.uid}')" title="${escapeHtml(c.name)} (タップで拡大)">
            <img src="${escapeHtml(c.imageUrl)}" alt="${escapeHtml(c.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null; this.closest('.deck-preview-thumb').innerHTML='<span style=\\'font-size:9.5px; font-weight:800; color:#0f172a; padding:2px; text-align:center; line-height:1.1; word-break:break-all;\\'>${escapeHtml(c.name)}</span>';" />
          </div>
        `).join("")}
        ${uniqueCards.length > 18 ? `<div style="display:flex; align-items:center; font-size:11px; color:#64748b; font-weight:bold; padding:0 6px; flex-shrink:0;">+他${uniqueCards.length - 18}種</div>` : ''}
      </div>
    `;
  }

  el.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; width:100%; flex-wrap:wrap; gap:4px;">
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <span>計 <b>${deck.length}</b> 枚</span>
        <span>ポケモン: <b>${pokemonCount}</b></span>
        <span>トレーナーズ: <b>${trainerCount}</b></span>
        <span>エネルギー: <b>${energyCount}</b></span>
        ${imgCount > 0 ? `<span style="color:#059669; font-weight:bold; font-size:11px;">🖼️ 公式画像 ${imgCount}枚取得済</span>` : ''}
      </div>
      ${previewNames ? `<div style="font-size:11px; color:#2563eb; font-weight:bold;">主力: ${previewNames}</div>` : ''}
    </div>
    ${thumbsHtml}
  `;
}

// =============================================================================
// モード切替（オンライン vs 一人回し）
// =============================================================================
function switchLobbyMode(mode) {
  const btnOnline = document.getElementById("btn-mode-online");
  const btnSolo = document.getElementById("btn-mode-solo");
  const panelOnline = document.getElementById("mode-panel-online");
  const panelSolo = document.getElementById("mode-panel-solo");

  if (mode === "solo") {
    btnOnline.classList.remove("active");
    btnSolo.classList.add("active");
    panelOnline.classList.add("hidden");
    panelSolo.classList.remove("hidden");
    // 一人回し用プレビュー更新
    renderDeckPreview(state.soloDeckA || SAMPLE_DECK, "deck-preview-a");
    renderDeckPreview(state.soloDeckB || SAMPLE_DECK_B, "deck-preview-b");
    renderPlaymatSelector();
    if (typeof renderSleeveSelector === "function") renderSleeveSelector();
    if (typeof checkSoloResumeBanner === "function") {
      checkSoloResumeBanner();
    }
  } else {
    btnOnline.classList.add("active");
    btnSolo.classList.remove("active");
    panelOnline.classList.remove("hidden");
    panelSolo.classList.add("hidden");
    renderDeckPreview(state.myLoadedDeck || SAMPLE_DECK, "deck-preview");
    renderPlaymatSelector();
    if (typeof renderSleeveSelector === "function") renderSleeveSelector();
  }
}

// =============================================================================
// デッキ読み込み処理 (オンライン / 一人回し)
// =============================================================================

/** オンライン対戦用デッキ読み込み */
async function loadOnlineDeck() {
  const inputEl = document.getElementById("in-deck");
  const btn = document.querySelector("[data-action='loadDeck']");
  const val = inputEl ? inputEl.value.trim() : "";
  if (!val) {
    showToast("デッキコードを入力してください");
    return;
  }

  const origText = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "取得中..."; }
  showToast("デッキを解析中...");

  try {
    const res = await resolveDeckInput(val);
    if (res.ok) {
      applyDeckToTarget("online", res.deck, res.name, res.code);
    } else {
      openDeckPasteModal("online", res.code || val, res.message);
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origText; }
  }
}

/** 一人回し用 デッキ1 (先攻) 読み込み */
async function loadSoloDeckA() {
  const inputEl = document.getElementById("in-deck-a");
  const btn = document.querySelector("[data-action='loadSoloDeckA']");
  const val = inputEl ? inputEl.value.trim() : "";
  if (!val) {
    showToast("デッキ1のコードを入力してください");
    return;
  }

  const origText = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "取得中..."; }
  showToast("デッキ1を解析中...");

  try {
    const res = await resolveDeckInput(val);
    if (res.ok) {
      applyDeckToTarget("solo-a", res.deck, res.name, res.code);
    } else {
      openDeckPasteModal("solo-a", res.code || val, res.message);
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origText; }
  }
}

/** 一人回し用 デッキ2 (後攻) 読み込み */
async function loadSoloDeckB() {
  const inputEl = document.getElementById("in-deck-b");
  const btn = document.querySelector("[data-action='loadSoloDeckB']");
  const val = inputEl ? inputEl.value.trim() : "";
  if (!val) {
    showToast("デッキ2のコードを入力してください");
    return;
  }

  const origText = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "取得中..."; }
  showToast("デッキ2を解析中...");

  try {
    const res = await resolveDeckInput(val);
    if (res.ok) {
      applyDeckToTarget("solo-b", res.deck, res.name, res.code);
    } else {
      openDeckPasteModal("solo-b", res.code || val, res.message);
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origText; }
  }
}

// =============================================================================
// デッキコード localStorage 保存 ＆ リスト管理
// =============================================================================
const STORAGE_KEY_SAVED_DECKS = "pokeca_saved_deck_codes";
const MAX_SAVED_DECKS = 20;

/** デッキリストの最初にあるポケモンカードの名称を取得 */
function getFirstPokemonName(deck) {
  if (!Array.isArray(deck) || deck.length === 0) return "";
  const first = deck.find(c => c && (c.type === "pokemon" || c.category === "たね" || c.category === "ポケモン" || !!c.hp));
  return first && first.name ? first.name : "";
}

/** 保存されたデッキコード一覧をlocalStorageから取得 */
function getSavedDeckList() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SAVED_DECKS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(item => {
        if (typeof item === "string") {
          const clean = item.replace(/[\(（【\[].*?[\)）】\]]/g, "").trim();
          const m = item.match(/[\(（](.*?)[\)）]/);
          return { code: clean, pokemon: m ? m[1] : "" };
        }
        if (item && typeof item === "object" && item.code) {
          return {
            code: String(item.code).replace(/[\(（【\[].*?[\)）】\]]/g, "").trim(),
            pokemon: String(item.pokemon || "").trim()
          };
        }
        return null;
      }).filter(d => d && d.code);
    }
  } catch (e) {
    console.warn("Failed to load saved decks from localStorage", e);
  }
  return [];
}

/** デッキコードをlocalStorageに保存し、リストを更新 */
function saveDeckToStorage(code, pokemonName = "") {
  if (!code || typeof code !== "string") return;
  const cleanCode = code.replace(/[\(（【\[].*?[\)）】\]]/g, "").trim();
  if (!cleanCode || cleanCode === "CUSTOM-PASTE" || cleanCode === "CUSTOM-TEXT") return;

  const list = getSavedDeckList().filter(d => d.code.toUpperCase() !== cleanCode.toUpperCase());
  list.unshift({
    code: cleanCode,
    pokemon: pokemonName || ""
  });
  if (list.length > MAX_SAVED_DECKS) {
    list.length = MAX_SAVED_DECKS;
  }

  try {
    localStorage.setItem(STORAGE_KEY_SAVED_DECKS, JSON.stringify(list));
    localStorage.setItem("pokeca_last_deck_code", cleanCode);
  } catch (e) {
    console.warn("Failed to save deck to localStorage", e);
  }

  renderSavedDeckSelectOptions();
}

/** ロビーのセレクトボックス内に保存したデッキを反映 */
function renderSavedDeckSelectOptions() {
  const savedList = getSavedDeckList();
  const selectIds = ["preset-select-online", "preset-select-a", "preset-select-b"];

  selectIds.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;

    // 既存の保存デッキoptgroupがあれば削除
    const oldGroup = sel.querySelector("optgroup[data-type='saved-decks']");
    if (oldGroup) oldGroup.remove();

    if (savedList.length === 0) return;

    const group = document.createElement("optgroup");
    group.label = "💾 保存したデッキ";
    group.dataset.type = "saved-decks";

    savedList.forEach(item => {
      const opt = document.createElement("option");
      opt.value = item.code;
      // リスト表示時のみ、ポケモンの名前をかっこ書きで表示
      const label = item.pokemon ? `${item.code}（${item.pokemon}）` : item.code;
      opt.textContent = `📁 ${label}`;
      group.appendChild(opt);
    });

    // 最初のoption (▼ サンプルデッキから選択) の直後に挿入
    const firstOpt = sel.querySelector("option");
    if (firstOpt && firstOpt.nextSibling) {
      sel.insertBefore(group, firstOpt.nextSibling);
    } else {
      sel.appendChild(group);
    }
  });

  // inputサジェスト用のdatalistも更新
  updateDeckDataList(savedList);
}

/** デッキコード入力欄のdatalist更新 */
function updateDeckDataList(savedList) {
  let dl = document.getElementById("saved-decks-datalist");
  if (!dl) {
    dl = document.createElement("datalist");
    dl.id = "saved-decks-datalist";
    document.body.appendChild(dl);
  }
  dl.innerHTML = savedList.map(item => {
    const label = item.pokemon ? `${item.code}（${item.pokemon}）` : item.code;
    return `<option value="${escapeHtml(item.code)}">${escapeHtml(label)}</option>`;
  }).join("");

  ["in-deck", "in-deck-a", "in-deck-b"].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.getAttribute("list")) {
      el.setAttribute("list", "saved-decks-datalist");
    }
  });
}

// =============================================================================
// プリセット選択ハンドラー (セレクトボックス変更時)
// =============================================================================
async function onPresetSelectChange(target, value) {
  if (!value) return;

  // 1. 既存プリセットデッキ判定
  const isPreset = PRESET_DECKS.some(p => p.id === value || p.code === value);
  if (isPreset) {
    applyPresetToTarget(target, value);
    return;
  }

  // 2. 保存されたデッキコードの場合: 入力欄に純粋なコードをセットして自動ロード
  const inputId = target === "online" ? "in-deck" : (target === "solo-a" ? "in-deck-a" : "in-deck-b");
  const input = document.getElementById(inputId);
  if (input) input.value = value;

  showToast(`デッキ「${value}」を読み込み中...`);
  try {
    const res = await resolveDeckInput(value);
    if (res.ok) {
      applyDeckToTarget(target, res.deck, res.name, res.code);
    } else {
      showToast(res.message || "デッキの読み込みに失敗しました");
    }
  } catch (e) {
    showToast("デッキの読み込みでエラーが発生しました");
  }
}

// =============================================================================
// デッキ貼り付けモーダル UI
// =============================================================================
function openDeckPasteModal(target = "online", initialCode = "", errorMsg = "") {
  const targetLabel = target === "online" 
    ? "オンライン対戦用デッキ" 
    : (target === "solo-a" ? "一人回し用 デッキ1（先攻）" : "一人回し用 デッキ2（後攻）");

  let noticeHtml = "";
  if (errorMsg) {
    noticeHtml = `
      <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:6px; padding:8px 10px; margin-bottom:10px; font-size:12px; color:#b91c1c; line-height:1.5;">
        ⚠️ ${errorMsg}
      </div>
    `;
  }

  const presetsButtons = PRESET_DECKS.map(p => `
    <button class="btn" style="font-size:11px; padding:5px 9px;" onclick="applyPresetToTarget('${target}', '${p.id}'); closeModal();">
      ${p.name.split('（')[0]}
    </button>
  `).join("");

  const bodyHtml = `
    ${noticeHtml}
    <div style="font-size:12px; color:#334155; margin-bottom:8px; line-height:1.6;">
      対象: <b>${targetLabel}</b><br>
      公式サイトのデッキ構築画面で<b>「テキストで表示」</b>または<b>「テキストをコピー」</b>した内容をそのまま貼り付けてください。<br>
      <span style="color:#64748b; font-size:11px;">※「リザードンex 3」「ネストボール 4」などの簡易行形式にも対応しています。</span>
    </div>
    <textarea id="deck-paste-textarea" style="width:100%; height:180px; font-family:Consolas, Monaco, monospace; font-size:12px; padding:8px; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box; resize:vertical; background:#f8fafc;" placeholder="ポケモン (14)\nヒトカゲ 3\nリザード 2\nリザードンex 2\n...\nグッズ (22)\nネストボール 4\nハイパーボール 4\n..."></textarea>
    
    <div style="margin-top:12px; padding-top:10px; border-top:1px dashed #cbd5e1;">
      <div style="font-size:11px; font-weight:bold; color:#475569; margin-bottom:6px;">またはプリセットデッキから選択:</div>
      <div style="display:flex; flex-wrap:wrap; gap:6px;">
        ${presetsButtons}
      </div>
    </div>
  `;

  const footHtml = `
    <button class="btn green big" onclick="submitPastedDeck('${target}')">読み込んで適用</button>
    <button class="btn" onclick="closeModal()">キャンセル</button>
  `;

  showModal("デッキリスト貼り付け・読込", bodyHtml, footHtml);
}

function submitPastedDeck(target) {
  const textarea = document.getElementById("deck-paste-textarea");
  if (!textarea) return;
  const raw = textarea.value.trim();
  if (!raw) {
    alert("デッキリストのテキストを入力してください");
    return;
  }
  const deck = parseDeckListText(raw);
  if (!deck || deck.length === 0) {
    alert("テキストからカード情報を解析できませんでした。フォーマットをご確認ください（例: リザードンex 3）");
    return;
  }
  applyDeckToTarget(target, deck, `カスタムデッキ（${deck.length}枚）`, "CUSTOM-PASTE");
  closeModal();
}

function applyPresetToTarget(target, presetId) {
  const preset = PRESET_DECKS.find(p => p.id === presetId) || PRESET_DECKS[0];
  const deck = preset.deck.map((c, i) => ({ ...c, uid: "c_" + i }));
  applyDeckToTarget(target, deck, preset.name, preset.code);
}

function applyDeckToTarget(target, deck, name, code) {
  if (typeof preloadAndVerifyDeckImages === "function") {
    preloadAndVerifyDeckImages(deck);
  }

  // デッキコードのlocalStorage保存 ＆ セレクトボックス更新
  const effectiveCode = code || (name && name.startsWith("公式デッキ") && typeof extractOfficialDeckCode === "function" ? extractOfficialDeckCode(name) : "");
  if (effectiveCode && effectiveCode !== "CUSTOM-PASTE" && effectiveCode !== "CUSTOM-TEXT") {
    const pokeName = getFirstPokemonName(deck);
    saveDeckToStorage(effectiveCode, pokeName);
  }

  if (target === "online") {
    state.myLoadedDeck = deck;
    state.myDeckCode = effectiveCode || code || name || "";
    const input = document.getElementById("in-deck");
    if (input) input.value = code || name;
    renderDeckPreview(deck, "deck-preview");
    const btn = document.getElementById("btn-start");
    if (btn) {
      if (typeof P2P !== "undefined" && P2P.connected) {
        btn.disabled = false;
        btn.textContent = "🟢 相手と接続しました！（対戦開始）";
        btn.classList.remove("gold");
        btn.classList.add("green");
      } else {
        btn.disabled = true;
        btn.textContent = "相手の接続待ち...";
        btn.classList.remove("green");
        btn.classList.add("gold");
      }
    }
    // 接続済みの場合は相手にも新しいデッキを送信して同期
    if (typeof P2P !== "undefined" && P2P.connected) {
      P2P.send({
        t: "deck_sync",
        name: state.myName,
        matId: state.myMatId,
        deck: state.myLoadedDeck
      });
    }
    showToast(`「${name}」（${deck.length}枚）を読み込みました！`);
  } else if (target === "solo-a") {
    state.soloDeckA = deck;
    const input = document.getElementById("in-deck-a");
    if (input) input.value = code || name;
    renderDeckPreview(deck, "deck-preview-a");
    showToast(`デッキ1: 「${name}」（${deck.length}枚）を読み込みました！`);
  } else if (target === "solo-b") {
    state.soloDeckB = deck;
    const input = document.getElementById("in-deck-b");
    if (input) input.value = code || name;
    renderDeckPreview(deck, "deck-preview-b");
    showToast(`デッキ2: 「${name}」（${deck.length}枚）を読み込みました！`);
  }
}

window.openDeckPasteModal = openDeckPasteModal;
window.submitPastedDeck = submitPastedDeck;
window.applyPresetToTarget = applyPresetToTarget;
window.onPresetSelectChange = onPresetSelectChange;
window.renderSavedDeckSelectOptions = renderSavedDeckSelectOptions;
window.getSavedDeckList = getSavedDeckList;
window.saveDeckToStorage = saveDeckToStorage;
