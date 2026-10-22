/* 【UI】タッチ操作ドラッグ＆ドロップエンジン（スマホ対応） */

// =============================================================================
// タッチ操作用 ドラッグ＆ドロップ エンジン (スマホ対応)
// =============================================================================
const touchDrag = {
  active: false,
  isDragging: false,
  isLongPressed: false,
  longPressTimer: null,
  type: null,
  data: null,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
  avatarEl: null,
  currentHoverEl: null,
  sourceEl: null
};

function initTouchDragEngine() {
  const gameEl = document.getElementById("game");
  if (!gameEl) return;

  gameEl.addEventListener("touchstart", (e) => {
    if (state.isSetupPhase && state.setupStep !== "place") {
      return;
    }
    if (e.target.closest("button") || e.target.closest(".sp-sheet") || e.target.closest(".modal") || e.target.closest(".ctx-menu")) {
      return;
    }

    const energyBadge = e.target.closest(".energy-badge");
    if (energyBadge && energyBadge.dataset.location && energyBadge.dataset.energyIdx !== undefined) {
      const loc = energyBadge.dataset.location;
      const eIdx = parseInt(energyBadge.dataset.energyIdx, 10);
      initTouchDragStart(e, "energy", { location: loc, energyIndex: eIdx }, energyBadge);
      return;
    }

    const handCard = e.target.closest("#hand .card");
    if (handCard && handCard.dataset.index !== undefined) {
      const idx = parseInt(handCard.dataset.index, 10);
      if (!isNaN(idx)) {
        initTouchDragStart(e, "hand", { handIdx: idx }, handCard);
        return;
      }
    }

    const playCard = e.target.closest("#play-card-wrap .card");
    if (playCard && state.playCard) {
      initTouchDragStart(e, "playCard", {}, playCard);
      return;
    }

    const stadiumCard = e.target.closest("#stadium .card");
    if (stadiumCard && state.stadium) {
      initTouchDragStart(e, "stadium", {}, stadiumCard);
      return;
    }
  }, { passive: false });

  window.addEventListener("touchmove", handleTouchMove, { passive: false });
  window.addEventListener("touchend", handleTouchEnd, { passive: false });
  window.addEventListener("touchcancel", handleTouchCancel);
}

function initTouchDragStart(e, type, data, sourceEl) {
  if (!e.touches || e.touches.length === 0) return;
  const touch = e.touches[0];
  if (touchDrag.longPressTimer) {
    clearTimeout(touchDrag.longPressTimer);
    touchDrag.longPressTimer = null;
  }
  touchDrag.active = true;
  touchDrag.isDragging = false;
  touchDrag.isLongPressed = false;
  touchDrag.type = type;
  touchDrag.data = data;
  touchDrag.sourceEl = sourceEl;
  touchDrag.startX = touch.clientX;
  touchDrag.startY = touch.clientY;
  touchDrag.currentX = touch.clientX;
  touchDrag.currentY = touch.clientY;
  touchDrag.currentHoverEl = null;

  // 手札カード長押し検知 (450ms) → コンテキストメニューを開く
  if (type === "hand" && data && typeof data.handIdx === "number") {
    touchDrag.longPressTimer = setTimeout(() => {
      touchDrag.isLongPressed = true;
      window._suppressHandClickUntil = Date.now() + 500;
      if (navigator.vibrate) {
        try { navigator.vibrate(40); } catch (_) {}
      }
      if (typeof showHandContextMenu === "function") {
        const syntheticEvent = {
          clientX: touchDrag.currentX,
          clientY: touchDrag.currentY,
          preventDefault: () => {},
          stopPropagation: () => {}
        };
        showHandContextMenu(syntheticEvent, data.handIdx);
      }
    }, 450);
  }
}

function handleTouchMove(e) {
  if (!touchDrag.active || !e.touches || e.touches.length === 0) return;
  const touch = e.touches[0];
  touchDrag.currentX = touch.clientX;
  touchDrag.currentY = touch.clientY;
  const dx = touch.clientX - touchDrag.startX;
  const dy = touch.clientY - touchDrag.startY;

  if (touchDrag.longPressTimer && Math.hypot(dx, dy) >= 8) {
    clearTimeout(touchDrag.longPressTimer);
    touchDrag.longPressTimer = null;
  }

  if (touchDrag.isLongPressed) {
    // メニュー表示中はD&Dを開始しない
    return;
  }

  if (!touchDrag.isDragging) {
    if (Math.hypot(dx, dy) >= 8) {
      touchDrag.isDragging = true;
      createTouchAvatar();
      if (touchDrag.type === "hand" && touchDrag.data) {
        state.draggedHandIndex = touchDrag.data.handIdx;
      } else if (touchDrag.type === "energy" && touchDrag.data) {
        state.draggedEnergy = touchDrag.data;
      }
    } else {
      return;
    }
  }

  if (e.cancelable) {
    e.preventDefault();
  }

  if (touchDrag.avatarEl) {
    touchDrag.avatarEl.style.left = `${touch.clientX}px`;
    touchDrag.avatarEl.style.top = `${touch.clientY}px`;
  }

  updateTouchHover(touch.clientX, touch.clientY);
}

function handleTouchEnd(e) {
  if (!touchDrag.active) return;

  if (touchDrag.longPressTimer) {
    clearTimeout(touchDrag.longPressTimer);
    touchDrag.longPressTimer = null;
  }

  if (touchDrag.isLongPressed) {
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    touchDrag.active = false;
    touchDrag.isDragging = false;
    touchDrag.isLongPressed = false;
    touchDrag.sourceEl = null;
    return;
  }

  const wasDragging = touchDrag.isDragging;
  const finalX = touchDrag.currentX;
  const finalY = touchDrag.currentY;
  const dragType = touchDrag.type;
  const dragData = touchDrag.data;

  cleanupTouchDrag();

  if (wasDragging) {
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();

    const hitEl = document.elementFromPoint(finalX, finalY);
    const dropTarget = resolveDropTarget(hitEl, dragType, dragData);
    if (dropTarget) {
      executeDropAction(dropTarget, dragType, dragData);
    }
  }

  touchDrag.active = false;
  touchDrag.isDragging = false;
  touchDrag.isLongPressed = false;
  touchDrag.type = null;
  touchDrag.data = null;
  touchDrag.sourceEl = null;
  state.draggedHandIndex = -1;
  state.draggedEnergy = null;
}

function handleTouchCancel() {
  cleanupTouchDrag();
  touchDrag.active = false;
  touchDrag.isDragging = false;
  touchDrag.type = null;
  touchDrag.data = null;
  state.draggedHandIndex = -1;
  state.draggedEnergy = null;
}

function createTouchAvatar() {
  if (touchDrag.avatarEl) touchDrag.avatarEl.remove();
  const avatar = document.createElement("div");
  avatar.className = "touch-drag-avatar";

  if (touchDrag.type === "hand" && touchDrag.data) {
    const card = state.myHand[touchDrag.data.handIdx];
    if (card) {
      avatar.innerHTML = `
        <div class="card ${card.color}" style="width:72px; height:98px; pointer-events:none; margin:0;">
          <div class="card-top"><span class="name" style="font-size:10px;">${card.name}</span></div>
          <div class="card-btm"><span style="font-size:9px;">${card.sub || card.category || ''}</span></div>
        </div>
      `;
    }
  } else if (touchDrag.type === "energy" && touchDrag.data) {
    const pk = getPokemonByLocation(touchDrag.data.location);
    const energy = pk && pk.energies ? pk.energies[touchDrag.data.energyIndex] : null;
    const info = energy ? getEnergyInfo(energy) : { bg: "#eab308", border: "#fde047", icon: "⚡" };
    avatar.innerHTML = `
      <div class="energy-badge" style="width:34px; height:34px; font-size:18px; background:${info.bg}; border-color:${info.border};">
        ${info.icon}
      </div>
    `;
  } else if (touchDrag.type === "playCard" && state.playCard) {
    avatar.innerHTML = `
      <div class="card ${state.playCard.color}" style="width:72px; height:98px; pointer-events:none; margin:0;">
        <div class="card-top"><span class="name" style="font-size:10px;">${state.playCard.name}</span></div>
      </div>
    `;
  } else if (touchDrag.type === "stadium" && state.stadium) {
    avatar.innerHTML = `
      <div class="card trainer" style="width:72px; height:98px; pointer-events:none; margin:0;">
        <div class="card-top"><span class="name" style="font-size:10px;">${state.stadium.name}</span></div>
      </div>
    `;
  }

  avatar.style.left = `${touchDrag.startX}px`;
  avatar.style.top = `${touchDrag.startY}px`;
  document.body.appendChild(avatar);
  touchDrag.avatarEl = avatar;
}

function resolveDropTarget(hitEl, dragType, dragData) {
  if (!hitEl) return null;

  if (dragType === "hand") {
    if (hitEl.closest("#play-area")) return { type: "play-area" };
    if (hitEl.closest("#stadium") || hitEl.closest(".stadium-spot")) return { type: "stadium" };

    const activeSpot = hitEl.closest("#my-active");
    if (activeSpot) {
      if (state.myActive) return { type: "pokemon", location: "active" };
      return { type: "empty-active" };
    }

    const benchContainer = hitEl.closest("#my-bench");
    if (benchContainer) {
      const limit = state.myBenchLimit || 5;
      const benchItem = hitEl.closest("[data-bench-index]");
      if (benchItem && benchItem.dataset.benchIndex !== undefined) {
        const bIdx = parseInt(benchItem.dataset.benchIndex, 10);
        if (bIdx >= 0 && bIdx < limit) {
          if (state.myBench[bIdx]) {
            return { type: "pokemon", location: `bench_${bIdx}` };
          } else {
            return { type: "empty-bench", benchIndex: bIdx };
          }
        }
      }
      let firstEmpty = -1;
      for (let i = 0; i < limit; i++) {
        if (!state.myBench[i]) {
          firstEmpty = i;
          break;
        }
      }
      if (firstEmpty !== -1) return { type: "empty-bench", benchIndex: firstEmpty };
    }

    if (hitEl.closest("#my-trash")) return { type: "trash" };
    if (hitEl.closest("#my-lost")) return { type: "lost" };
    if (hitEl.closest("#my-deck")) return { type: "deck" };
  }

  if (dragType === "energy") {
    const activeSpot = hitEl.closest("#my-active");
    if (activeSpot && state.myActive) return { type: "pokemon-energy", location: "active" };

    const benchItem = hitEl.closest("#my-bench [data-bench-index]");
    if (benchItem && benchItem.dataset.benchIndex !== undefined) {
      const bIdx = parseInt(benchItem.dataset.benchIndex, 10);
      const limit = state.myBenchLimit || 5;
      if (bIdx >= 0 && bIdx < limit && state.myBench[bIdx]) return { type: "pokemon-energy", location: `bench_${bIdx}` };
    }

    if (hitEl.closest("#my-trash")) return { type: "trash-energy" };
  }

  if (dragType === "playCard") {
    if (hitEl.closest("#my-trash")) return { type: "play-trash" };
    if (hitEl.closest(".hand-area") || hitEl.closest("#hand")) return { type: "play-hand" };
    if (hitEl.closest("#stadium") || hitEl.closest(".stadium-spot")) return { type: "play-stadium" };
    if (hitEl.closest("#my-lost")) return { type: "play-lost" };
  }

  if (dragType === "stadium") {
    if (hitEl.closest("#my-trash")) return { type: "stadium-trash" };
  }

  return null;
}

function updateTouchHover(x, y) {
  if (touchDrag.avatarEl) touchDrag.avatarEl.style.display = "none";
  const hitEl = document.elementFromPoint(x, y);
  if (touchDrag.avatarEl) touchDrag.avatarEl.style.display = "block";

  const dropTarget = resolveDropTarget(hitEl, touchDrag.type, touchDrag.data);
  let targetEl = null;

  if (dropTarget) {
    if (dropTarget.type === "play-area") targetEl = document.getElementById("play-area");
    else if (dropTarget.type === "stadium") targetEl = document.getElementById("stadium");
    else if (dropTarget.type === "empty-active" || dropTarget.location === "active") targetEl = document.getElementById("my-active");
    else if (dropTarget.type === "empty-bench") {
      targetEl = document.querySelector(`#my-bench [data-bench-index="${dropTarget.benchIndex}"]`) || document.getElementById("my-bench");
    } else if (dropTarget.location && dropTarget.location.startsWith("bench_")) {
      const bIdx = dropTarget.location.replace("bench_", "");
      targetEl = document.querySelector(`#my-bench [data-bench-index="${bIdx}"]`) || document.getElementById("my-bench");
    } else if (dropTarget.type === "trash" || dropTarget.type === "trash-energy" || dropTarget.type === "play-trash" || dropTarget.type === "stadium-trash") {
      targetEl = document.getElementById("my-trash");
    } else if (dropTarget.type === "lost" || dropTarget.type === "play-lost") {
      targetEl = document.getElementById("my-lost");
    } else if (dropTarget.type === "deck") {
      targetEl = document.getElementById("my-deck");
    } else if (dropTarget.type === "play-hand") {
      targetEl = document.getElementById("hand");
    }
  }

  if (targetEl !== touchDrag.currentHoverEl) {
    if (touchDrag.currentHoverEl) {
      touchDrag.currentHoverEl.classList.remove("touch-drop-hover", "drag-target", "drag-over");
    }
    if (targetEl) {
      targetEl.classList.add("touch-drop-hover");
    }
    touchDrag.currentHoverEl = targetEl;
  }
}

function executeDropAction(dropTarget, dragType, dragData) {
  if (dragType === "hand") {
    const handIdx = dragData.handIdx;
    if (handIdx < 0 || handIdx >= state.myHand.length) return;

    if (dropTarget.type === "play-area") {
      playHandCardByIndex(handIdx);
    } else if (dropTarget.type === "stadium") {
      placeHandCardToStadium(handIdx);
    } else if (dropTarget.type === "empty-active") {
      placeHandCardToActive(handIdx);
    } else if (dropTarget.type === "empty-bench") {
      placeHandCardToBenchIndex(handIdx, dropTarget.benchIndex);
    } else if (dropTarget.type === "pokemon") {
      attachHandCardToPokemon(handIdx, dropTarget.location);
    } else if (dropTarget.type === "trash") {
      trashHandCardByIndex(handIdx);
    } else if (dropTarget.type === "lost") {
      lostHandCardByIndex(handIdx);
    } else if (dropTarget.type === "deck") {
      moveHandCardToDeckBottom(handIdx);
    }
  } else if (dragType === "energy") {
    const srcLoc = dragData.location;
    const eIdx = dragData.energyIndex;
    if (dropTarget.type === "pokemon-energy") {
      moveEnergyBetweenPokemon(srcLoc, eIdx, dropTarget.location);
    } else if (dropTarget.type === "trash-energy") {
      detachEnergyToTrash(srcLoc, eIdx);
    }
  } else if (dragType === "playCard") {
    if (dropTarget.type === "play-trash") movePlayCardToTrash();
    else if (dropTarget.type === "play-hand") movePlayCardToHand();
    else if (dropTarget.type === "play-stadium") movePlayCardToStadium();
    else if (dropTarget.type === "play-lost") movePlayCardToLost();
  } else if (dragType === "stadium") {
    if (dropTarget.type === "stadium-trash") {
      if (typeof trashStadium === "function") {
        trashStadium();
      } else if (state.stadium) {
        state.myTrash.push(state.stadium);
        state.stadium = null;
        renderAll();
      }
    }
  }
}

function cleanupTouchDrag() {
  if (touchDrag.avatarEl) {
    touchDrag.avatarEl.remove();
    touchDrag.avatarEl = null;
  }
  if (touchDrag.currentHoverEl) {
    touchDrag.currentHoverEl.classList.remove("touch-drop-hover", "drag-target", "drag-over");
    touchDrag.currentHoverEl = null;
  }
  document.querySelectorAll(".touch-drop-hover, .drag-target, .drag-over").forEach(el => {
    el.classList.remove("touch-drop-hover", "drag-target", "drag-over");
  });
}

// グローバル参照エクスポート（インライン onclick 等から安全に呼び出し可能にする）
if (typeof isMobileMode !== "undefined") window.isMobileMode = isMobileMode;
if (typeof selectHandCardAndOpenMenu !== "undefined") window.selectHandCardAndOpenMenu = selectHandCardAndOpenMenu;
if (typeof placeHandCardToActive !== "undefined") window.placeHandCardToActive = placeHandCardToActive;
if (typeof placeHandCardToBenchIndex !== "undefined") window.placeHandCardToBenchIndex = placeHandCardToBenchIndex;
if (typeof placeHandCardToFirstEmptyBench !== "undefined") window.placeHandCardToFirstEmptyBench = placeHandCardToFirstEmptyBench;
if (typeof placeHandCardToStadium !== "undefined") window.placeHandCardToStadium = placeHandCardToStadium;
if (typeof attachHandCardToPokemon !== "undefined") window.attachHandCardToPokemon = attachHandCardToPokemon;
if (typeof trashHandCardByIndex !== "undefined") window.trashHandCardByIndex = trashHandCardByIndex;
if (typeof lostHandCardByIndex !== "undefined") window.lostHandCardByIndex = lostHandCardByIndex;
if (typeof moveHandCardToDeckTop !== "undefined") window.moveHandCardToDeckTop = moveHandCardToDeckTop;
if (typeof moveHandCardToDeckBottom !== "undefined") window.moveHandCardToDeckBottom = moveHandCardToDeckBottom;
if (typeof trashSelectedHandCards !== "undefined") window.trashSelectedHandCards = trashSelectedHandCards;
if (typeof lostSelectedHandCards !== "undefined") window.lostSelectedHandCards = lostSelectedHandCards;
if (typeof moveSelectedHandCardsToDeckTop !== "undefined") window.moveSelectedHandCardsToDeckTop = moveSelectedHandCardsToDeckTop;
if (typeof moveSelectedHandCardsToDeckBottom !== "undefined") window.moveSelectedHandCardsToDeckBottom = moveSelectedHandCardsToDeckBottom;
if (typeof clearHandSelection !== "undefined") window.clearHandSelection = clearHandSelection;
if (typeof moveEnergyBetweenPokemon !== "undefined") window.moveEnergyBetweenPokemon = moveEnergyBetweenPokemon;
if (typeof detachEnergyToTrash !== "undefined") window.detachEnergyToTrash = detachEnergyToTrash;
window.openMenu = () => typeof actions !== "undefined" && actions.openMenu && actions.openMenu();
window.closeMenu = () => typeof closeMenu === "function" && closeMenu();


