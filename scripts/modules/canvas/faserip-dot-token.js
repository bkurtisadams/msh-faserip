// scripts/modules/canvas/faserip-dot-token.js v1.7.0 - 2026-03-11
// v1.7.0: Ctrl+click dot HUD button toggles token size between 1x1 and 0.5x0.5.
// v1.6.1: Thicker facing tick (5px outline / 3px white) for better visibility on green dots.
// v1.6.0: Facing tick (notch line at token rotation), plain hover portrait (48px, no Ctrl),
//         fix top-of-screen clipping. Tick drawn at 0° with cheap pivot rotation sync.
// v1.3.0: Per-scene dot mode — scene flag overrides world setting, injected into scene config
// v1.2.0: Smaller dots (12%), Ctrl+hover for portrait (64px), vehicles draw as rectangles
// v1.1.0: Add hover portrait popup — hovering a dot for 500ms shows token artwork
// v1.0.0: Dot-mode token rendering for FASERIP area-based play.
// Priority: per-token flag > per-scene flag > world setting.
// In dot mode: token artwork hidden, colored shape drawn; snap disabled (free placement).
// Vehicles render as rounded rectangles. Characters render as circles.

const SCOPE = "msh-faserip";
const DOT_FLAG = "dotMode";
const HOVER_DELAY = 400; // ms before portrait appears
const DOT_RATIO = 0.12;  // dot radius as fraction of smaller token dimension

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _isDotMode(token) {
  // 1. Per-token override (highest priority)
  const perToken = token.document.getFlag(SCOPE, DOT_FLAG);
  if (perToken !== null && perToken !== undefined) return Boolean(perToken);
  // 2. Per-scene flag
  const sceneFlag = canvas.scene?.getFlag(SCOPE, DOT_FLAG);
  if (sceneFlag !== null && sceneFlag !== undefined) return Boolean(sceneFlag);
  // 3. World setting fallback
  try {
    return game.settings.get(SCOPE, DOT_FLAG);
  } catch {
    return false;
  }
}

function _isVehicle(token) {
  return token.actor?.type === "vehicle";
}

function _getDotColor(token) {
  switch (token.document.disposition) {
    case CONST.TOKEN_DISPOSITIONS.FRIENDLY: return 0x00CC00;
    case CONST.TOKEN_DISPOSITIONS.NEUTRAL:  return 0xCCCC00;
    case CONST.TOKEN_DISPOSITIONS.HOSTILE:  return 0xCC0000;
    case CONST.TOKEN_DISPOSITIONS.SECRET:   return 0x555555;
    default: return 0x888888;
  }
}

// ---------------------------------------------------------------------------
// Hover portrait — hovering a dot shows token art in a floating popup
// ---------------------------------------------------------------------------

let _hoverTimer = null;
let _hoverPopup = null;
let _hoverToken = null;

function _showPortraitPopup(token) {
  _hidePortraitPopup();
  const img = token.document.texture?.src || token.actor?.img;
  if (!img || img.includes("mystery-man")) return;

  const popup = document.createElement("div");
  popup.classList.add("faserip-dot-portrait");
  popup.innerHTML = `
    <img src="${img}" alt="${token.document.name}">
    <div class="faserip-dot-portrait-name">${token.document.name}</div>
  `;

  // Position near the token's screen location, clamped to viewport
  const pos = token.getGlobalPosition();
  const rect = canvas.app.view.getBoundingClientRect();
  const popupW = 54; // 48 img + padding + border
  const popupH = 68; // img + name + padding
  let left = rect.left + pos.x + 20;
  let top = rect.top + pos.y - popupH - 4;

  // Clamp: don't let it go above or off-right of viewport
  if (top < 4) top = rect.top + pos.y + 20;
  if (left + popupW > window.innerWidth - 4) left = window.innerWidth - popupW - 4;

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;

  document.body.appendChild(popup);
  _hoverPopup = popup;
  _hoverToken = token;
}

function _hidePortraitPopup() {
  if (_hoverTimer) {
    clearTimeout(_hoverTimer);
    _hoverTimer = null;
  }
  if (_hoverPopup) {
    _hoverPopup.remove();
    _hoverPopup = null;
  }
  _hoverToken = null;
}

function _onDotPointerEnter(event) {
  const token = event.currentTarget._parentToken;
  if (!token || !_isDotMode(token)) return;
  _hoverTimer = setTimeout(() => {
    _showPortraitPopup(token);
  }, HOVER_DELAY);
}

function _onDotPointerLeave(event) {
  _hidePortraitPopup();
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function _drawDot(g, token) {
  const cx = token.w / 2;
  const cy = token.h / 2;
  const r = Math.min(token.w, token.h) * DOT_RATIO;
  const fill = _getDotColor(token);

  // Dark outline ring
  g.beginFill(0x000000, 0.65);
  g.drawCircle(cx, cy, r + 2);
  g.endFill();

  // Filled dot
  g.beginFill(fill, 1.0);
  g.drawCircle(cx, cy, r);
  g.endFill();

  // Facing tick — drawn at 0°, PIXI rotation handles facing
  _drawFacingTick(g, cx, cy, r);

  // Hit area for hover
  g.hitArea = new PIXI.Circle(cx, cy, r + 6);
}

function _drawVehicleRect(g, token) {
  const cx = token.w / 2;
  const cy = token.h / 2;
  // Rectangle sized proportional to token, smaller than full size
  const hw = token.w * 0.18;
  const hh = token.h * 0.12;
  const fill = _getDotColor(token);
  const corner = 2;

  // Dark outline
  g.beginFill(0x000000, 0.65);
  g.drawRoundedRect(cx - hw - 1, cy - hh - 1, (hw + 1) * 2, (hh + 1) * 2, corner + 1);
  g.endFill();

  // Filled rect
  g.beginFill(fill, 1.0);
  g.drawRoundedRect(cx - hw, cy - hh, hw * 2, hh * 2, corner);
  g.endFill();

  // Facing tick — drawn at 0°, PIXI rotation handles facing
  _drawFacingTick(g, cx, cy, Math.max(hw, hh));

  // Hit area for hover
  g.hitArea = new PIXI.Rectangle(cx - hw - 4, cy - hh - 4, (hw + 4) * 2, (hh + 4) * 2);
}

/** Draw a short facing tick mark pointing straight up (0°) — rotation handled by _refreshRotation */
function _drawFacingTick(g, cx, cy, radius) {
  const innerR = radius * 0.5;
  const outerR = radius + 3;
  const x1 = cx;
  const y1 = cy + innerR;
  const x2 = cx;
  const y2 = cy + outerR;

  g.lineStyle(5, 0x000000, 0.8);
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.lineStyle(3, 0xFFFFFF, 0.95);
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.lineStyle(0);
}

/** Sync dot graphic rotation to token document — just 3 property sets, no redraw */
function _syncDotRotation(token) {
  const g = token._faseripDot;
  if (!g) return;
  const cx = token.w / 2;
  const cy = token.h / 2;
  const rad = (token.document.rotation ?? 0) * Math.PI / 180;
  if (g.pivot.x !== cx || g.pivot.y !== cy) {
    g.pivot.set(cx, cy);
    g.position.set(cx, cy);
  }
  if (g.rotation !== rad) g.rotation = rad;
}

// ---------------------------------------------------------------------------
// refreshToken hook — draw or remove dot overlay, sync rotation
// ---------------------------------------------------------------------------

function _refreshTokenDot(token) {
  if (!_isDotMode(token)) {
    if (token._faseripDot) {
      token._faseripDot.destroy({ children: true });
      token._faseripDot = null;
    }
    if (token.mesh) token.mesh.visible = true;
    return;
  }

  // Hide artwork — dot replaces it visually
  if (token.mesh) token.mesh.visible = false;

  // Only redraw if dot doesn't exist or size/disposition changed
  if (token._faseripDot) {
    const g = token._faseripDot;
    if (g._faseripW === token.w && g._faseripH === token.h
        && g._faseripDisp === token.document.disposition) {
      _syncDotRotation(token);
      return;
    }
    g.destroy({ children: true });
    token._faseripDot = null;
  }

  const g = new PIXI.Graphics();

  if (_isVehicle(token)) {
    _drawVehicleRect(g, token);
  } else {
    _drawDot(g, token);
  }

  // Make interactive for hover portrait
  g.eventMode = "static";
  g._parentToken = token;
  g.on("pointerenter", _onDotPointerEnter);
  g.on("pointerleave", _onDotPointerLeave);

  token.addChild(g);
  token._faseripDot = g;

  // Cache token dimensions/disposition so we know when a full redraw is needed
  g._faseripW = token.w;
  g._faseripH = token.h;
  g._faseripDisp = token.document.disposition;

  _syncDotRotation(token);
}

// ---------------------------------------------------------------------------
// destroyToken hook — clean up PIXI object
// ---------------------------------------------------------------------------

function _destroyTokenDot(token) {
  _hidePortraitPopup();
  if (token._faseripDot) {
    token._faseripDot.destroy({ children: true });
    token._faseripDot = null;
  }
}

// ---------------------------------------------------------------------------
// Token HUD button — V13 has no canvas token context menu hook.
// Instead, inject a dot-mode toggle button into the TokenHUD.
// ---------------------------------------------------------------------------

function _onRenderTokenHUD(app, html, data) {
  const token = app.object;
  if (!token) return;

  const el = html instanceof HTMLElement ? html : html[0] ?? html;
  const current = token.document.getFlag(SCOPE, DOT_FLAG);
  const isDot = _isDotMode(token);

  // Build the toggle button
  const btn = document.createElement("div");
  btn.classList.add("control-icon");
  if (isDot) btn.classList.add("active");
  btn.dataset.action = "faserip-dot-toggle";
  btn.title = isDot ? "Switch to Normal Token (Ctrl: resize)" : "Switch to Dot Display (Ctrl: resize)";
  btn.innerHTML = `<i class="fas ${isDot ? "fa-image" : "fa-circle"}"></i>`;

  btn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();

    // Ctrl+click: toggle token size between 1x1 and 0.5x0.5
    if (ev.ctrlKey) {
      const isSmall = token.document.width <= 0.5;
      const newSize = isSmall ? 1 : 0.5;
      await token.document.update({ width: newSize, height: newSize });
      app.render();
      return;
    }

    // Three-state cycle: unset → dot → normal → unset
    if (current === true) {
      // Currently forced dot → force normal
      await token.document.setFlag(SCOPE, DOT_FLAG, false);
    } else if (current === false) {
      // Currently forced normal → clear override (use scene/world)
      await token.document.unsetFlag(SCOPE, DOT_FLAG);
    } else {
      // No override → force dot
      await token.document.setFlag(SCOPE, DOT_FLAG, true);
    }
    token.renderFlags.set({ refreshMesh: true });
    app.render();
  });

  // Insert into the right column of the HUD
  const col = el.querySelector?.(".col.right") || el.querySelector?.(".right");
  if (col) {
    col.appendChild(btn);
  }
}

// ---------------------------------------------------------------------------
// Export: call once from init hook, after CONFIG classes are set
// ---------------------------------------------------------------------------

export function initDotToken() {
  const BaseToken = CONFIG.Token.objectClass;

  class FaseripToken extends BaseToken {
    // Disable grid snap in dot mode so tokens can be placed freely within an area.
    _getSnappingModes() {
      if (_isDotMode(this)) return 0;
      return super._getSnappingModes();
    }
  }

  CONFIG.Token.objectClass = FaseripToken;

  Hooks.on("refreshToken", _refreshTokenDot);
  Hooks.on("destroyToken", _destroyTokenDot);

  // Token HUD: dot toggle button
  Hooks.on("renderTokenHUD", _onRenderTokenHUD);

  // Clean up portrait popup on canvas pan/zoom
  Hooks.on("canvasPan", _hidePortraitPopup);

  // Inject "Dot Mode" select into Scene Config → Grid tab (V13 AppV2)
  Hooks.on("renderSceneConfig", (app, html, context, options) => {
    const scene = app.document;
    const current = scene.getFlag(SCOPE, DOT_FLAG);
    const value = (current === true) ? "on" : (current === false) ? "off" : "default";
    let worldLabel = "Off";
    try { worldLabel = game.settings.get(SCOPE, DOT_FLAG) ? "On" : "Off"; } catch {}

    // V13: html is the FORM element directly
    const form = html instanceof HTMLElement ? html : html[0] ?? html;

    // Find the grid tab DIV (not the A nav link)
    const gridTab = form.querySelector('div.tab[data-tab="grid"]');
    if (!gridTab) {
      console.warn("[FASERIP] Could not find grid tab in SceneConfig");
      return;
    }

    // Build form group with raw HTML for maximum compatibility
    const group = document.createElement("div");
    group.classList.add("form-group");
    group.innerHTML = `
      <label>Dot Mode</label>
      <div class="form-fields">
        <select name="flags.${SCOPE}.${DOT_FLAG}">
          <option value="default" ${value === "default" ? "selected" : ""}>World Default (${worldLabel})</option>
          <option value="on" ${value === "on" ? "selected" : ""}>On</option>
          <option value="off" ${value === "off" ? "selected" : ""}>Off</option>
        </select>
      </div>
      <p class="hint">Replace tokens with colored dots on this scene. Per-token overrides still apply.</p>
    `;
    gridTab.appendChild(group);
  });

  // Intercept scene config submission to translate select values into flags
  Hooks.on("preUpdateScene", (scene, changes) => {
    const flagVal = changes?.flags?.[SCOPE]?.[DOT_FLAG];
    if (typeof flagVal === "string") {
      if (flagVal === "on") changes.flags[SCOPE][DOT_FLAG] = true;
      else if (flagVal === "off") changes.flags[SCOPE][DOT_FLAG] = false;
      else {
        // "default" — delete the flag
        changes.flags[SCOPE][`-=${DOT_FLAG}`] = null;
        delete changes.flags[SCOPE][DOT_FLAG];
      }
    }
  });

  // When the scene's dot flag changes, redraw all tokens on the current scene
  Hooks.on("updateScene", (scene, changes) => {
    if (scene.id !== canvas.scene?.id) return;
    if (changes?.flags?.[SCOPE]?.[DOT_FLAG] !== undefined
      || changes?.flags?.[SCOPE]?.[`-=${DOT_FLAG}`] !== undefined) {
      for (const token of canvas.tokens?.placeables ?? []) {
        token.renderFlags.set({ refreshMesh: true });
      }
    }
  });
}