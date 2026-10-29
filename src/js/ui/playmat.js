/* 【UI】プレイマット選択・自作登録（localStorage） */

// =============================================================================
// プレイマット管理＆描画 (Playmat Manager)
// =============================================================================
const STORAGE_KEY_PLAYMATS = "pokeca_custom_playmats_v1";
const STORAGE_KEY_SELECTED_MAT = "pokeca_selected_playmat_id";
let activeMatTab = "my"; // "my" | "opp"

function loadCustomPlaymats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PLAYMATS);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.warn("Failed to load custom playmats from localStorage", e);
    return [];
  }
}

function saveCustomPlaymat(matObj) {
  try {
    const list = loadCustomPlaymats();
    list.unshift(matObj);
    localStorage.setItem(STORAGE_KEY_PLAYMATS, JSON.stringify(list));
    return true;
  } catch (e) {
    console.error("Failed to save playmat to localStorage", e);
    alert("画像の保存に失敗しました。画像サイズが大きすぎる可能性があります（数MB以内の画像を推奨します）。");
    return false;
  }
}

function deleteCustomPlaymat(matId) {
  if (!confirm("この登録プレイマットを削除しますか？")) return;
  try {
    const list = loadCustomPlaymats().filter(m => m.id !== matId);
    localStorage.setItem(STORAGE_KEY_PLAYMATS, JSON.stringify(list));
    if (state.myMatId === matId) {
      state.myMatId = "mat_01";
      try { localStorage.setItem(STORAGE_KEY_SELECTED_MAT, "mat_01"); } catch (e) {}
    }
    if (state.oppMatId === matId) state.oppMatId = "mat_02";
    initPlaymats();
    renderPlaymats();
    showToast("登録プレイマットを削除しました");
  } catch (e) {
    console.error(e);
  }
}

function getAllPlaymats() {
  const customs = loadCustomPlaymats();
  return [...customs, ...DEFAULT_PLAYMATS];
}

function getPlaymatById(id) {
  const all = getAllPlaymats();
  return all.find(m => m.id === id) || DEFAULT_PLAYMATS[0];
}

function initPlaymats() {
  try {
    const savedMatId = localStorage.getItem(STORAGE_KEY_SELECTED_MAT);
    if (savedMatId) {
      const all = getAllPlaymats();
      if (all.some(m => m.id === savedMatId)) {
        state.myMatId = savedMatId;
      }
    }
  } catch (e) {}
  renderPlaymatSelector();
  renderPlaymats();
}

function renderPlaymatSelector() {
  const containers = [
    document.getElementById("playmat-preview-row"),
    document.getElementById("playmat-preview-row-solo")
  ].filter(Boolean);

  if (containers.length === 0) return;

  const allMats = getAllPlaymats();
  const selectedId = state.myMatId;

  const html = allMats.map(mat => {
    const isSelected = mat.id === selectedId;
    const isCustom = mat.isCustom === true;
    const bgStyle = mat.dataUrl ? `background-image: url('${mat.dataUrl}'); background-size: cover;` : `background: ${mat.bg};`;

    return `
      <div class="playmat-card ${isSelected ? 'selected' : ''} ${isCustom ? 'custom' : ''}"
           onclick="selectPlaymat('${mat.id}')"
           title="${mat.name}">
        ${isCustom ? `<button class="playmat-del-btn" onclick="event.stopPropagation(); deleteCustomPlaymat('${mat.id}')" title="削除">×</button>` : ''}
        <div class="playmat-card-thumb" style="${bgStyle}">
          ${isCustom ? `<span class="playmat-badge-tag">自作</span>` : ''}
        </div>
        <div class="playmat-card-title">${mat.name}</div>
      </div>
    `;
  }).join("");

  containers.forEach(c => { c.innerHTML = html; });
}

function getMyPlaymatSyncData() {
  const mat = getPlaymatById(state.myMatId);
  return {
    matId: state.myMatId,
    matDataUrl: (mat && mat.dataUrl) ? mat.dataUrl : null
  };
}

function syncMyPlaymatToPeer() {
  if (typeof P2P !== "undefined" && P2P.connected) {
    const syncData = getMyPlaymatSyncData();
    P2P.send({
      t: "playmat_sync",
      matId: syncData.matId,
      matDataUrl: syncData.matDataUrl
    });
  }
}

window.selectPlaymat = function(matId) {
  state.myMatId = matId;
  try { localStorage.setItem(STORAGE_KEY_SELECTED_MAT, matId); } catch (e) {}
  renderPlaymatSelector();
  renderPlaymats();
  syncMyPlaymatToPeer();
  const mat = getPlaymatById(matId);
  showToast(`プレイマット: 「${mat.name}」を選択しました`);
};

window.deleteCustomPlaymat = deleteCustomPlaymat;
window.getMyPlaymatSyncData = getMyPlaymatSyncData;

function openMatUpload() {
  const input = document.getElementById("mat-file-input");
  if (input) input.click();
}

function handleCustomPlaymatUpload(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    alert("画像ファイル（PNG, JPEG, WebP等）を選択してください。");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const rawDataUrl = e.target.result;
    const matName = prompt("登録するプレイマットの名前を入力してください:", file.name.replace(/\.[^/.]+$/, "").slice(0, 16)) || "自作マット";

    // P2P通信およびlocalStorage保存用に画像を適切なサイズ（最大幅1280px）に軽量化
    const img = new Image();
    img.onload = () => {
      let finalDataUrl = rawDataUrl;
      try {
        const maxW = 1280;
        const maxH = 800;
        let w = img.width || 1280;
        let h = img.height || 720;
        if (w > maxW || h > maxH) {
          const ratio = Math.min(maxW / w, maxH / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        finalDataUrl = canvas.toDataURL("image/jpeg", 0.82);
      } catch (err) {
        console.warn("Canvas resize skipped, using original dataUrl", err);
      }

      const newMat = {
        id: "custom_" + Date.now(),
        name: matName.trim() || "自作マット",
        isCustom: true,
        dataUrl: finalDataUrl
      };

      if (saveCustomPlaymat(newMat)) {
        state.myMatId = newMat.id;
        try { localStorage.setItem(STORAGE_KEY_SELECTED_MAT, newMat.id); } catch (e) {}
        initPlaymats();
        renderPlaymats();
        syncMyPlaymatToPeer();
        showToast(`自作プレイマット「${newMat.name}」を登録し、選択しました！`);
      }
    };
    img.src = rawDataUrl;
  };
  reader.readAsDataURL(file);
}

function renderPlaymats() {
  const myMatEl = document.getElementById("board-mat-me");
  const oppMatEl = document.getElementById("board-mat-opp");
  if (!myMatEl || !oppMatEl) return;

  const myMat = getPlaymatById(state.myMatId);
  const oppMat = getPlaymatById(state.oppMatId);

  // 自分のマット適用 (画面下半分)
  if (myMat.dataUrl) {
    myMatEl.style.backgroundImage = `url("${myMat.dataUrl}")`;
    myMatEl.style.backgroundSize = "cover";
    myMatEl.style.backgroundPosition = "center";
    myMatEl.style.backgroundColor = "#1e293b";
  } else {
    myMatEl.style.backgroundImage = "";
    myMatEl.style.background = myMat.bg;
  }

  // 相手側のマット適用 (画面上半分・相手が自作画像を使用している場合は oppMatDataUrl を優先表示)
  const oppImgUrl = state.oppMatDataUrl || oppMat.dataUrl || null;
  if (oppImgUrl) {
    oppMatEl.style.backgroundImage = `url("${oppImgUrl}")`;
    oppMatEl.style.backgroundSize = "cover";
    oppMatEl.style.backgroundPosition = "center";
    oppMatEl.style.backgroundColor = "#1e293b";
  } else {
    oppMatEl.style.backgroundImage = "";
    oppMatEl.style.background = oppMat.bg;
  }
}




