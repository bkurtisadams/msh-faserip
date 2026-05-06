// scripts/modules/canvas/faserip-dot-token.js v1.10.0 - 2026-05-06
// v1.10.0: Robustness — _isDotMode honors only strict boolean flag values;
//          non-booleans (e.g. stale "off"/"on"/"default" strings from older
//          scene saves) fall through as "no override". preUpdateScene now
//          handles both expanded and flattened change shapes so the
//          string-to-boolean translation always runs. Adds
//          game.msh.scrubDotFlags() to clean stale string flags across all
//          scenes + tokens in one shot.
// v1.9.0: Auto-resize tokens to 0.5x0.5 on dot-mode entry, restore original size on exit.
//         Stashes original dimensions in dotOrigSize flag. Removed Ctrl+click resize.
//         New world setting "dotSize" (Small/Medium/Large) controls dot radius for all tokens.
// v1.8.0: DOM portrait in #hud overlay, positioned via canvas.clientCoordinatesFromCanvas()
//         (v13 API). Constant screen size, no rotation, tracks token drag/pan/zoom.
//         No name label, 36px thumbnail. Hit area = full token bounds (hoverToken hook).
//         "V" hotkey toggles persistent portraits.
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
const SIZE_FLAG = "dotOrigSize"; // stashed {w,h} before dot-mode shrink
const DOT_SIZE_SETTING = "dotSize"; // world setting: "small" | "medium" | "large"
const HOVER_DELAY = 300; // ms before portrait appears
const PORTRAIT_SIZE = 36; // px — rendered portrait thumbnail size

// Dot radius as fraction of smaller token dimension, keyed by setting
const DOT_RATIOS = { small: 0.12, medium: 0.20, large: 0.30 };

function _getDotRatio() {
  try {
    const size = game.settings.get(SCOPE, DOT_SIZE_SETTING);
    return DOT_RATIOS[size] ?? DOT_RATIOS.small;
  } catch {
    return DOT_RATIOS.small;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _isDotMode(token) {
  // 1. Per-token override (highest priority) — strict boolean only.
  //    Non-booleans (stale strings, objects, etc.) are treated as "no
  //    override" and fall through.
  const perToken = token.document.getFlag(SCOPE, DOT_FLAG);
  if (perToken === true || perToken === false) return perToken;
  // 2. Per-scene flag — strict boolean only.
  const sceneFlag = canvas.scene?.getFlag(SCOPE, DOT_FLAG);
  if (sceneFlag === true || sceneFlag === false) return sceneFlag;
  // 3. World setting fallback
  try {
    return Boolean(game.settings.get(SCOPE, DOT_FLAG));
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
// Hover portrait — fixed-position DOM element on document.body.
// Positioned via canvas.clientCoordinatesFromCanvas() (v13 API) which returns
// viewport pixel coords directly. Tracked each frame via rAF.
// NOTE: #hud has its own scale/offset transform matching canvas zoom, so we
// cannot use it — appending to body with position:fixed is zoom-independent.
// ---------------------------------------------------------------------------

let _hoverTimer = null;
let _persistentPortraits = false; // "V" hotkey toggle
let _activePortraits = new Map(); // token.id → { el, token, raf }

function _updatePortraitPosition(entry) {
  const { el, token } = entry;
  if (!token || token.destroyed || !el.isConnected) {
    _removePortraitEntry(entry);
    return;
  }
  // Use token.x/y (live PIXI position) not token.document.x/y (only updates on drop)
  const pt = canvas.clientCoordinatesFromCanvas({
    x: token.x + (token.w / 2),
    y: token.y
  });
  el.style.left = `${pt.x}px`;
  el.style.top = `${pt.y - 4}px`;
  entry.raf = requestAnimationFrame(() => _updatePortraitPosition(entry));
}

function _removePortraitEntry(entry) {
  if (entry.raf) cancelAnimationFrame(entry.raf);
  entry.raf = null;
  if (entry.el?.isConnected) entry.el.remove();
}

function _showPortrait(token) {
  if (_activePortraits.has(token.id)) return;
  const src = token.document.texture?.src || token.actor?.img;
  if (!src || src.includes("mystery-man")) return;

  const el = document.createElement("div");
  el.classList.add("faserip-dot-portrait");
  el.innerHTML = `<img src="${src}" alt="">`;
  document.body.appendChild(el);

  const entry = { el, token, raf: null };
  _activePortraits.set(token.id, entry);
  entry.raf = requestAnimationFrame(() => _updatePortraitPosition(entry));
}

function _hidePortrait(token) {
  const entry = _activePortraits.get(token?.id);
  if (!entry) return;
  _removePortraitEntry(entry);
  _activePortraits.delete(token.id);
}

function _hideAllPortraits() {
  for (const entry of _activePortraits.values()) {
    _removePortraitEntry(entry);
  }
  _activePortraits.clear();
}

function _cancelHoverTimer() {
  if (_hoverTimer) {
    clearTimeout(_hoverTimer);
    _hoverTimer = null;
  }
}

function _onTokenPointerEnter(token) {
  if (!_isDotMode(token)) return;
  _cancelHoverTimer();
  _hoverTimer = setTimeout(() => {
    _showPortrait(token);
  }, HOVER_DELAY);
}

function _onTokenPointerLeave(token) {
  _cancelHoverTimer();
  if (!_persistentPortraits) {
    _hidePortrait(token);
  }
}

// ---------------------------------------------------------------------------
// Auto-resize: shrink to 0.5×0.5 on dot-mode entry, restore on exit
// ---------------------------------------------------------------------------

async function _shrinkForDotMode(tokenDoc) {
  const w = tokenDoc.width;
  const h = tokenDoc.height;
  if (w <= 0.5 && h <= 0.5) return; // already small
  await tokenDoc.setFlag(SCOPE, SIZE_FLAG, { w, h });
  await tokenDoc.update({ width: 0.5, height: 0.5 });
}

async function _restoreFromDotMode(tokenDoc) {
  const orig = tokenDoc.getFlag(SCOPE, SIZE_FLAG);
  if (!orig) return;
  await tokenDoc.unsetFlag(SCOPE, SIZE_FLAG);
  await tokenDoc.update({ width: orig.w, height: orig.h });
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function _drawDot(g, token) {
  const cx = token.w / 2;
  const cy = token.h / 2;
  const r = Math.min(token.w, token.h) * _getDotRatio();
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
    if (!_persistentPortraits) _hidePortrait(token);
    if (token._faseripDot) {
      token._faseripDot.destroy({ children: true });
      token._faseripDot = null;
    }
    if (token.mesh) token.mesh.visible = true;
    return;
  }

  // Hide artwork — dot replaces it visually
  if (token.mesh) token.mesh.visible = false;

  // Only redraw if dot doesn't exist or size/disposition/dotRatio changed
  const curRatio = _getDotRatio();
  if (token._faseripDot) {
    const g = token._faseripDot;
    if (g._faseripW === token.w && g._faseripH === token.h
        && g._faseripDisp === token.document.disposition
        && g._faseripRatio === curRatio) {
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

  token.addChild(g);
  token._faseripDot = g;

  // Make dot interactive with full-token hit area so Foundry's hoverToken fires
  g.eventMode = "static";
  g.hitArea = new PIXI.Rectangle(0, 0, token.w, token.h);

  // Cache token dimensions/disposition/ratio so we know when a full redraw is needed
  g._faseripW = token.w;
  g._faseripH = token.h;
  g._faseripDisp = token.document.disposition;
  g._faseripRatio = curRatio;

  _syncDotRotation(token);
}

// ---------------------------------------------------------------------------
// destroyToken hook — clean up PIXI object
// ---------------------------------------------------------------------------

function _destroyTokenDot(token) {
  _cancelHoverTimer();
  if (!_persistentPortraits) _hidePortrait(token);
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
  btn.title = isDot ? "Switch to Normal Token" : "Switch to Dot Display";
  btn.innerHTML = `<i class="fas ${isDot ? "fa-image" : "fa-circle"}"></i>`;

  btn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();

    // Three-state cycle: unset → dot → normal → unset
    if (current === true) {
      await token.document.setFlag(SCOPE, DOT_FLAG, false);
      await _restoreFromDotMode(token.document);
    } else if (current === false) {
      await token.document.unsetFlag(SCOPE, DOT_FLAG);
      if (_isDotMode(token)) await _shrinkForDotMode(token.document);
    } else {
      await token.document.setFlag(SCOPE, DOT_FLAG, true);
      await _shrinkForDotMode(token.document);
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
  // Register dot size setting
  game.settings.register(SCOPE, DOT_SIZE_SETTING, {
    name: "Dot Size",
    hint: "Controls the visual size of dots in dot mode. Affects all dot-mode tokens.",
    scope: "world",
    config: true,
    type: String,
    default: "small",
    choices: { small: "Small", medium: "Medium", large: "Large" },
    onChange: () => {
      for (const token of canvas.tokens?.placeables ?? []) {
        if (_isDotMode(token) && token._faseripDot) {
          token._faseripDot.destroy({ children: true });
          token._faseripDot = null;
          token.renderFlags.set({ refreshMesh: true });
        }
      }
    }
  });

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

  // Token-level hover for portrait (full token bounds, not just dot graphic)
  Hooks.on("hoverToken", (token, hovering) => {
    if (hovering) {
      _onTokenPointerEnter(token);
    } else {
      _onTokenPointerLeave(token);
    }
  });

  // Cancel pending hover timer on pan/zoom
  Hooks.on("canvasPan", _cancelHoverTimer);

  // "V" hotkey: toggle persistent portrait mode
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "v" && ev.key !== "V") return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return;

    _persistentPortraits = !_persistentPortraits;
    if (!_persistentPortraits) {
      _hideAllPortraits();
    }
    ui.notifications?.info(`Dot portraits: ${_persistentPortraits ? "persistent (hover to pin)" : "hover only"}`);
  });

  // Expose a one-shot cleanup for stale string flags. Run from console:
  //   game.msh.scrubDotFlags()
  // Removes any non-boolean dotMode flag from every scene and every token
  // doc in every scene. Safe to run repeatedly. Returns counts.
  Hooks.once("ready", () => {
    if (!game.msh) game.msh = {};
    game.msh.scrubDotFlags = async () => {
      let scenesFixed = 0;
      let tokensFixed = 0;
      for (const scene of game.scenes ?? []) {
        const sf = scene.getFlag(SCOPE, DOT_FLAG);
        if (sf !== undefined && sf !== null && sf !== true && sf !== false) {
          await scene.unsetFlag(SCOPE, DOT_FLAG);
          scenesFixed++;
        }
        for (const tokenDoc of scene.tokens ?? []) {
          const tf = tokenDoc.getFlag(SCOPE, DOT_FLAG);
          if (tf !== undefined && tf !== null && tf !== true && tf !== false) {
            await tokenDoc.unsetFlag(SCOPE, DOT_FLAG);
            tokensFixed++;
          }
        }
      }
      const msg = `Dot-mode flag scrub complete: ${scenesFixed} scene(s), ${tokensFixed} token(s).`;
      console.log(`[FASERIP] ${msg}`);
      ui.notifications?.info(msg);
      return { scenesFixed, tokensFixed };
    };
  });

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

  // Intercept scene config submission to translate select values into flags.
  // V13 may pass changes in expanded shape (changes.flags[SCOPE][DOT_FLAG])
  // or flattened ("flags.msh-faserip.dotMode" as a top-level key); handle
  // both so the string never reaches storage.
  Hooks.on("preUpdateScene", (scene, changes) => {
    const flatKey = `flags.${SCOPE}.${DOT_FLAG}`;
    const flatUnsetKey = `flags.${SCOPE}.-=${DOT_FLAG}`;
    let flagVal;
    let isFlat = false;
    if (changes && Object.prototype.hasOwnProperty.call(changes, flatKey)) {
      flagVal = changes[flatKey];
      isFlat = true;
    } else {
      flagVal = changes?.flags?.[SCOPE]?.[DOT_FLAG];
    }
    if (typeof flagVal !== "string") return;

    if (flagVal === "on") {
      if (isFlat) changes[flatKey] = true;
      else changes.flags[SCOPE][DOT_FLAG] = true;
    } else if (flagVal === "off") {
      if (isFlat) changes[flatKey] = false;
      else changes.flags[SCOPE][DOT_FLAG] = false;
    } else {
      // "default" or any other string — unset the flag
      if (isFlat) {
        delete changes[flatKey];
        changes[flatUnsetKey] = null;
      } else {
        changes.flags[SCOPE][`-=${DOT_FLAG}`] = null;
        delete changes.flags[SCOPE][DOT_FLAG];
      }
    }
  });

  // When the scene's dot flag changes, redraw and auto-resize all tokens
  Hooks.on("updateScene", (scene, changes) => {
    if (scene.id !== canvas.scene?.id) return;
    if (changes?.flags?.[SCOPE]?.[DOT_FLAG] !== undefined
      || changes?.flags?.[SCOPE]?.[`-=${DOT_FLAG}`] !== undefined) {
      for (const token of canvas.tokens?.placeables ?? []) {
        const perToken = token.document.getFlag(SCOPE, DOT_FLAG);
        if (perToken === null || perToken === undefined) {
          if (_isDotMode(token)) _shrinkForDotMode(token.document);
          else _restoreFromDotMode(token.document);
        }
        token.renderFlags.set({ refreshMesh: true });
      }
    }
  });
}