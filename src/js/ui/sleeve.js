/* 【UI】スリーブ（カード裏面）選択・自作登録（localStorage） */

// =============================================================================
// スリーブ管理＆描画 (Sleeve Manager)
// =============================================================================
const STORAGE_KEY_SLEEVES = "pokeca_custom_sleeves_v1";
const STORAGE_KEY_SELECTED_SLEEVE = "pokeca_selected_sleeve_id";

function loadCustomSleeves() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SLEEVES);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.warn("Failed to load custom sleeves from localStorage", e);
    return [];
  }
}

function saveCustomSleeve(sleeveObj) {
  try {
    const list = loadCustomSleeves();
    list.unshift(sleeveObj);
    localStorage.setItem(STORAGE_KEY_SLEEVES, JSON.stringify(list));
    return true;
  } catch (e) {
    console.error("Failed to save sleeve to localStorage", e);
    alert("画像の保存に失敗しました。画像サイズが大きすぎる可能性があります（数MB以内の画像を推奨します）。");
    return false;
  }
}

function deleteCustomSleeve(sleeveId) {
  if (!confirm("この登録スリーブを削除しますか？")) return;
  try {
    const list = loadCustomSleeves().filter(s => s.id !== sleeveId);
    localStorage.setItem(STORAGE_KEY_SLEEVES, JSON.stringify(list));
    if (state.mySleeveId === sleeveId) {
      state.mySleeveId = "sleeve_01";
      state.mySleeveDataUrl = null;
      try { localStorage.setItem(STORAGE_KEY_SELECTED_SLEEVE, "sleeve_01"); } catch (e) {}
    }
    if (state.oppSleeveId === sleeveId) state.oppSleeveId = "sleeve_01";
    initSleeves();
    renderSleeves();
    showToast("登録スリーブを削除しました");
  } catch (e) {
    console.error(e);
  }
}

function getAllSleeves() {
  const customs = loadCustomSleeves();
  return [...customs, ...DEFAULT_SLEEVES];
}

function getSleeveById(id) {
  const all = getAllSleeves();
  return all.find(s => s.id === id) || DEFAULT_SLEEVES[0];
}

function initSleeves() {
  try {
    const savedSleeveId = localStorage.getItem(STORAGE_KEY_SELECTED_SLEEVE);
    if (savedSleeveId) {
      const all = getAllSleeves();
      const found = all.find(s => s.id === savedSleeveId);
      if (found) {
        state.mySleeveId = found.id;
        state.mySleeveDataUrl = found.dataUrl || null;
      }
    }
  } catch (e) {}
  renderSleeveSelector();
}

function renderSleeveSelector() {
  const containers = [
    document.getElementById("sleeve-preview-row"),
    document.getElementById("sleeve-preview-row-solo")
  ].filter(Boolean);

  if (containers.length === 0) return;

  const allSleeves = getAllSleeves();

  containers.forEach(container => {
    container.innerHTML = "";
    allSleeves.forEach(sleeve => {
      const isSelected = (state.mySleeveId === sleeve.id);
      const isCustom = sleeve.id.startsWith("custom_sleeve_");
      const card = document.createElement("div");
      card.className = `playmat-card ${isSelected ? 'selected' : ''} ${isCustom ? 'custom' : ''}`;
      card.title = sleeve.name;

      const bgStyle = sleeve.url
        ? `background: #1e293b url('${sleeve.url}') center center / cover no-repeat;`
        : (sleeve.dataUrl
            ? `background: #1e293b url('${sleeve.dataUrl}') center center / cover no-repeat;`
            : `background: ${sleeve.bg};`);

      card.innerHTML = `
        ${isCustom ? `<button class="playmat-del-btn" onclick="event.stopPropagation(); deleteCustomSleeve('${sleeve.id}')" title="削除">×</button>` : ''}
        <div class="playmat-card-thumb" style="${bgStyle} border: 1.5px solid ${sleeve.border || '#d4af37'}; border-radius: 4px;">
          ${isCustom ? `<span class="playmat-badge-tag">自作</span>` : ''}
        </div>
        <div class="playmat-card-title">${escapeHtml(sleeve.name)}</div>
      `;

      card.onclick = () => selectSleeve(sleeve.id);
      container.appendChild(card);
    });
  });
}

function selectSleeve(sleeveId) {
  state.mySleeveId = sleeveId;
  try { localStorage.setItem(STORAGE_KEY_SELECTED_SLEEVE, sleeveId); } catch (e) {}
  const sleeve = getSleeveById(sleeveId);
  state.mySleeveDataUrl = sleeve.dataUrl || null;

  renderSleeveSelector();
  renderSleeves();

  if (typeof P2P !== "undefined" && P2P.connected && !state.isSoloMode) {
    P2P.send({
      t: "sleeve_sync",
      sleeveId: state.mySleeveId,
      sleeveDataUrl: state.mySleeveDataUrl
    });
  }

  showToast(`スリーブ「${sleeve.name}」を選択しました`);
}

/** 盤面カード裏面へのスリーブスタイル適用 */
function renderSleeves() {
  const mySleeve = getSleeveById(state.mySleeveId);
  const oppSleeve = getSleeveById(state.oppSleeveId);

  const getStyleString = (sleeve, customDataUrl) => {
    const imgDataUrl = customDataUrl || sleeve.dataUrl || null;
    if (imgDataUrl) {
      return `background: #1e293b url('${imgDataUrl}') center center / cover no-repeat !important; border-color: ${sleeve.border || '#d4af37'} !important;`;
    }
    if (sleeve.url) {
      return `background: #1e293b url('${sleeve.url}') center center / cover no-repeat !important; border-color: ${sleeve.border || '#d4af37'} !important;`;
    }
    return `background: ${sleeve.bg} !important; border-color: ${sleeve.border || '#94a3b8'} !important;`;
  };

  const myStyle = getStyleString(mySleeve, state.mySleeveDataUrl);
  const oppStyle = getStyleString(oppSleeve, state.oppSleeveDataUrl);

  let styleTag = document.getElementById("dynamic-sleeve-style");
  if (!styleTag) {
    styleTag = document.createElement("style");
    styleTag.id = "dynamic-sleeve-style";
    document.head.appendChild(styleTag);
  }

  styleTag.textContent = `
    /* 自分サイド・山札・対戦準備裏向きカード・サイド取得モーダル */
    .band.me .back,
    #my-prizes .back,
    #my-deck .back,
    .prize-back {
      ${myStyle}
    }

    /* 相手手札・相手サイド・相手山札 */
    .opp-hand .back,
    .band.opp .back,
    #opp-prizes .back,
    #opp-deck .back {
      ${oppStyle}
    }
  `;
}

function openSleeveUpload() {
  const input = document.getElementById("sleeve-file-input");
  if (input) {
    input.value = "";
    input.click();
  }
}

function handleSleeveFileUpload(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    return alert("画像ファイル（PNG, JPEG, WebP等）を選択してください。");
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const rawDataUrl = e.target.result;
    compressSleeveImage(rawDataUrl, (compressedDataUrl) => {
      const newId = `custom_sleeve_${Date.now()}`;
      const defaultName = file.name.replace(/\.[^/.]+$/, "").slice(0, 15) || "自作スリーブ";
      const name = prompt("スリーブの名前を入力してください:", defaultName) || defaultName;

      const newSleeve = {
        id: newId,
        name: name.trim(),
        type: "custom",
        dataUrl: compressedDataUrl,
        border: "#d4af37"
      };

      if (saveCustomSleeve(newSleeve)) {
        selectSleeve(newId);
        showToast(`自作スリーブ「${name}」を登録しました！`);
      }
    });
  };
  reader.readAsDataURL(file);
}

function compressSleeveImage(dataUrl, callback) {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // ポケカ裏面比率 (縦長 63:88 ≒ 1:1.4) に合わせて最大400x560にリサイズ
    const maxW = 400;
    const maxH = 560;
    let w = img.width;
    let h = img.height;

    if (w > maxW || h > maxH) {
      const ratio = Math.min(maxW / w, maxH / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }

    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);

    const compressed = canvas.toDataURL("image/jpeg", 0.85);
    callback(compressed);
  };
  img.src = dataUrl;
}

window.initSleeves = initSleeves;
window.renderSleeveSelector = renderSleeveSelector;
window.selectSleeve = selectSleeve;
window.renderSleeves = renderSleeves;
window.openSleeveUpload = openSleeveUpload;
window.deleteCustomSleeve = deleteCustomSleeve;
