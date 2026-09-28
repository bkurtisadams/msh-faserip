// scripts/modules/canvas/faserip-dot-token.js v1.14.1 - 2026-09-27
// v1.14.1: Dot identity editor gets its own Token HUD button (palette icon) shown in
//          dot mode, replacing the hidden right-click on the dot toggle.
// v1.14.0: Dot identity. Signature fill color (flags.msh-faserip.dotColor) with the
//          disposition color kept as a ring, and 1-3 character initials drawn upright in
//          the dot (flags.msh-faserip.dotLabel, else auto from the token name when the
//          user may see the name). Token flag > actor flag. Right-click the HUD dot button
//          to edit (linked tokens write to the actor). World setting "Dot Labels".
// v1.13.0: Leaving dot mode no longer forces mesh.visible = true on every non-dot token
//          (only restores tokens this module hid). HUD toggle flips the effective state
//          in one update (flag null = inherit). Scene/world dot changes resize tokens
//          from the active GM only, batched. Dot drawn beneath bars/effects/nameplate.
//          Portraits: fix stale map entry blocking re-show, hide when token not
//          visible, clear on canvas teardown. "V" is now a rebindable keybinding.
// v1.12.0: Facing offset from the actor's Art Facing (flags.msh-faserip.artFacing: 0 Up,
//          90 Right, 180 Down, 270 Left; default Up = no offset). Token flag facingOffset
//          still overrides. Light/vision rebuilt when either changes.
// v1.11.0: Facing offset for vehicle light/vision cones and facing tick.
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
const LABEL_SETTING = "dotLabels"; // world setting: "auto" | "custom" | "off"
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
  const perToken = token.document.getFlag(SCOPE, DOT_FLAG);
  if (perToken === true || perToken === false) return perToken;
  return _inheritedDotMode();
}

function _inheritedDotMode() {
  const sceneFlag = canvas.scene?.getFlag(SCOPE, DOT_FLAG);
  if (sceneFlag === true || sceneFlag === false) return sceneFlag;
  try {
    return Boolean(game.settings.get(SCOPE, DOT_FLAG));
  } catch {
    return false;
  }
}

function _isActiveGM() {
  return game.user?.isGM && (game.users?.activeGM?.id ?? game.user.id) === game.user.id;
}

function _isVehicle(token) {
  return token.actor?.type === "vehicle";
}

function _facingOffset(token) {
  const tokFlag = token.document.getFlag(SCOPE, "facingOffset");
  if (tokFlag !== undefined && tokFlag !== null && tokFlag !== "" && Number.isFinite(Number(tokFlag))) return Number(tokFlag);
  const art = Number(token.actor?.getFlag(SCOPE, "artFacing"));
  return Number.isFinite(art) ? art : 0;
}

function _refreshFacing(token) {
  if (!token) return;
  token.initializeLightSource?.();
  token.initializeVisionSource?.();
  _syncDotRotation(token);
}

function _withFacing(token, data) {
  const off = _facingOffset(token);
  if (off && data && "rotation" in data) data.rotation = ((data.rotation ?? 0) + off) % 360;
  return data;
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
    if (_activePortraits.get(entry.id) === entry) _activePortraits.delete(entry.id);
    return;
  }
  el.style.display = token.visible ? "" : "none";
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
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  el.appendChild(img);
  document.body.appendChild(el);

  const entry = { el, token, id: token.id, raf: null };
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

function _shrinkChanges(tokenDoc) {
  const w = tokenDoc.width;
  const h = tokenDoc.height;
  if (w <= 0.5 && h <= 0.5) return {};
  return { width: 0.5, height: 0.5, [`flags.${SCOPE}.${SIZE_FLAG}`]: { w, h } };
}

function _restoreChanges(tokenDoc) {
  const orig = tokenDoc.getFlag(SCOPE, SIZE_FLAG);
  if (!orig) return {};
  return { width: orig.w, height: orig.h, [`flags.${SCOPE}.${SIZE_FLAG}`]: null };
}

async function _applyInheritedDotModeToScene() {
  if (!canvas.ready) return;
  if (_isActiveGM()) {
    const updates = [];
    for (const token of canvas.tokens?.placeables ?? []) {
      const perToken = token.document.getFlag(SCOPE, DOT_FLAG);
      if (perToken === true || perToken === false) continue;
      const changes = _inheritedDotMode() ? _shrinkChanges(token.document) : _restoreChanges(token.document);
      if (Object.keys(changes).length) updates.push({ _id: token.document.id, ...changes });
    }
    if (updates.length) await canvas.scene.updateEmbeddedDocuments("Token", updates);
  }
  for (const token of canvas.tokens?.placeables ?? []) token.renderFlags.set({ refreshMesh: true });
}

// ---------------------------------------------------------------------------
// Dot identity: signature color + initials
// ---------------------------------------------------------------------------

function _identityOwner(token) {
  return (token.document.actorLink && token.actor) ? token.actor : token.document;
}

function _parseColor(value) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(value ?? "").trim());
  return m ? Number.parseInt(m[1], 16) : null;
}

function _canSeeName(token) {
  if (game.user.isGM || token.isOwner) return true;
  const M = CONST.TOKEN_DISPLAY_MODES;
  return token.document.displayName === M.HOVER || token.document.displayName === M.ALWAYS;
}

function _autoInitials(name) {
  const words = String(name ?? "").split(/[\s\-_.]+/).filter(Boolean);
  if (!words.length) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function _dotIdentity(token) {
  const td = token.document;
  const color = td.getFlag(SCOPE, "dotColor") || token.actor?.getFlag(SCOPE, "dotColor") || "";
  const custom = String(td.getFlag(SCOPE, "dotLabel") || token.actor?.getFlag(SCOPE, "dotLabel") || "").trim().slice(0, 3);
  let mode = "auto";
  try { mode = game.settings.get(SCOPE, LABEL_SETTING); } catch {}
  let label = "";
  if (mode !== "off") {
    if (custom) label = custom;
    else if (mode === "auto" && _canSeeName(token)) label = _autoInitials(td.name);
  }
  return { color: _parseColor(color), label };
}

function _drawDotLabel(token, label, fill, radius) {
  if (!label) return null;
  const r = (fill >> 16) & 0xFF;
  const gC = (fill >> 8) & 0xFF;
  const b = fill & 0xFF;
  const dark = (0.299 * r) + (0.587 * gC) + (0.114 * b) < 150;
  const fontSize = Math.max(6, radius * (label.length >= 3 ? 0.85 : 1.1));
  const style = new PIXI.TextStyle({
    fontFamily: CONFIG.canvasTextStyle?.fontFamily ?? "Signika",
    fontWeight: "bold",
    fontSize,
    fill: dark ? 0xFFFFFF : 0x000000,
    stroke: dark ? 0x000000 : 0xFFFFFF,
    strokeThickness: Math.max(1, fontSize * 0.12),
    align: "center"
  });
  const TextCls = foundry.canvas?.containers?.PreciseText ?? globalThis.PreciseText ?? PIXI.Text;
  const t = new TextCls(label, style);
  if (TextCls === PIXI.Text) t.resolution = Math.max(2, (window.devicePixelRatio ?? 1) * 2);
  t.anchor.set(0.5, 0.5);
  t.position.set(token.w / 2, token.h / 2);
  t.eventMode = "none";
  return t;
}

function _clearDot(token) {
  if (token._faseripDot) {
    token._faseripDot.destroy({ children: true });
    token._faseripDot = null;
  }
  if (token._faseripDotLabel) {
    token._faseripDotLabel.destroy();
    token._faseripDotLabel = null;
  }
}

function _escapeAttr(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

async function _editDotIdentity(token) {
  const owner = _identityOwner(token);
  const color = owner.getFlag(SCOPE, "dotColor") || "";
  const label = owner.getFlag(SCOPE, "dotLabel") || "";
  const auto = _autoInitials(token.document.name);
  const content = `
    <div class="form-group">
      <label>Dot Color</label>
      <div class="form-fields"><color-picker name="dotColor" value="${_escapeAttr(color)}"></color-picker></div>
      <p class="hint">Signature fill color. Blank = disposition color. Disposition stays as the ring.</p>
    </div>
    <div class="form-group">
      <label>Initials</label>
      <div class="form-fields"><input type="text" name="dotLabel" maxlength="3" value="${_escapeAttr(label)}" placeholder="${_escapeAttr(auto)}"></div>
      <p class="hint">Up to 3 characters. Blank = automatic from the token name.</p>
    </div>
    <p class="hint">${owner === token.actor ? "Saved to the actor (all its tokens)." : "Saved to this token."}</p>`;
  const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: `Dot Identity: ${token.document.name}` },
    content,
    ok: { label: "Save", icon: "fas fa-save", callback: (event, button) => new FDE(button.form).object },
    rejectClose: false
  });
  if (!result) return;
  const hex = _parseColor(result.dotColor);
  await owner.update({
    [`flags.${SCOPE}.dotColor`]: hex === null ? null : `#${hex.toString(16).padStart(6, "0")}`,
    [`flags.${SCOPE}.dotLabel`]: String(result.dotLabel ?? "").trim().slice(0, 3) || null
  });
}

function _refreshTokensForIdentity(tokens) {
  for (const t of tokens) {
    if (t && !t.destroyed) t.renderFlags.set({ refreshMesh: true });
  }
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function _drawDot(g, token, ident) {
  const cx = token.w / 2;
  const cy = token.h / 2;
  const r = Math.min(token.w, token.h) * _getDotRatio();
  const disp = _getDotColor(token);
  const fill = ident.color ?? disp;
  const ring = ident.color !== null;

  g.beginFill(0x000000, 0.65);
  g.drawCircle(cx, cy, r + (ring ? 4 : 2));
  g.endFill();

  if (ring) {
    g.beginFill(disp, 1.0);
    g.drawCircle(cx, cy, r + 2.5);
    g.endFill();
  }

  g.beginFill(fill, 1.0);
  g.drawCircle(cx, cy, r);
  g.endFill();

  _drawFacingTick(g, cx, cy, r, !!ident.label, ring);
  return { fill, radius: r };
}

function _drawVehicleRect(g, token, ident) {
  const cx = token.w / 2;
  const cy = token.h / 2;
  const hw = token.w * 0.18;
  const hh = token.h * 0.12;
  const disp = _getDotColor(token);
  const fill = ident.color ?? disp;
  const ring = ident.color !== null;
  const corner = 2;
  const o = ring ? 3 : 1;

  g.beginFill(0x000000, 0.65);
  g.drawRoundedRect(cx - hw - o, cy - hh - o, (hw + o) * 2, (hh + o) * 2, corner + o);
  g.endFill();

  if (ring) {
    g.beginFill(disp, 1.0);
    g.drawRoundedRect(cx - hw - 2, cy - hh - 2, (hw + 2) * 2, (hh + 2) * 2, corner + 2);
    g.endFill();
  }

  g.beginFill(fill, 1.0);
  g.drawRoundedRect(cx - hw, cy - hh, hw * 2, hh * 2, corner);
  g.endFill();

  _drawFacingTick(g, cx, cy, Math.max(hw, hh), !!ident.label, ring);
  return { fill, radius: hh * 1.1 };
}

/** Draw a short facing tick mark pointing straight up (0°) — rotation handled by _refreshRotation */
function _drawFacingTick(g, cx, cy, radius, hasLabel = false, hasRing = false) {
  const innerR = hasLabel ? radius : radius * 0.5;
  const outerR = radius + (hasRing ? 6 : 3);
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
  const rad = ((token.document.rotation ?? 0) + _facingOffset(token)) * Math.PI / 180;
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
    _clearDot(token);
    if (token._faseripHidMesh) {
      token._faseripHidMesh = false;
      if (token.mesh) token.mesh.visible = token.visible;
      token.renderFlags.set({ refreshVisibility: true });
    }
    return;
  }

  if (token.mesh) {
    token.mesh.visible = false;
    token._faseripHidMesh = true;
  }

  const curRatio = _getDotRatio();
  const ident = _dotIdentity(token);
  const identKey = `${ident.color}|${ident.label}`;
  if (token._faseripDot) {
    const g = token._faseripDot;
    if (g._faseripW === token.w && g._faseripH === token.h
        && g._faseripDisp === token.document.disposition
        && g._faseripRatio === curRatio
        && g._faseripIdent === identKey) {
      _syncDotRotation(token);
      return;
    }
    _clearDot(token);
  }

  const g = new PIXI.Graphics();
  const drawn = _isVehicle(token) ? _drawVehicleRect(g, token, ident) : _drawDot(g, token, ident);

  token.addChildAt(g, 0);
  token._faseripDot = g;

  const label = _drawDotLabel(token, ident.label, drawn.fill, drawn.radius);
  if (label) {
    token.addChildAt(label, 1);
    token._faseripDotLabel = label;
  }

  // Make dot interactive with full-token hit area so Foundry's hoverToken fires
  g.eventMode = "static";
  g.hitArea = new PIXI.Rectangle(0, 0, token.w, token.h);

  // Cache token dimensions/disposition/ratio so we know when a full redraw is needed
  g._faseripW = token.w;
  g._faseripH = token.h;
  g._faseripDisp = token.document.disposition;
  g._faseripRatio = curRatio;
  g._faseripIdent = identKey;

  _syncDotRotation(token);
}

// ---------------------------------------------------------------------------
// destroyToken hook — clean up PIXI object
// ---------------------------------------------------------------------------

function _destroyTokenDot(token) {
  _cancelHoverTimer();
  if (!_persistentPortraits) _hidePortrait(token);
  _clearDot(token);
}

// ---------------------------------------------------------------------------
// Token HUD button — V13 has no canvas token context menu hook.
// Instead, inject a dot-mode toggle button into the TokenHUD.
// ---------------------------------------------------------------------------

function _onRenderTokenHUD(app, html, data) {
  const token = app.object;
  if (!token) return;

  const el = html instanceof HTMLElement ? html : html[0] ?? html;
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

    const doc = token.document;
    const wantDot = !_isDotMode(token);
    const update = {
      [`flags.${SCOPE}.${DOT_FLAG}`]: wantDot === _inheritedDotMode() ? null : wantDot,
      ...(wantDot ? _shrinkChanges(doc) : _restoreChanges(doc))
    };
    await doc.update(update);
    token.renderFlags.set({ refreshMesh: true });
    app.render();
  });

  const idBtn = document.createElement("div");
  idBtn.classList.add("control-icon");
  idBtn.dataset.action = "faserip-dot-identity";
  idBtn.title = "Dot Color & Initials";
  idBtn.innerHTML = `<i class="fas fa-palette"></i>`;
  idBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    _editDotIdentity(token);
  });

  const col = el.querySelector?.(".col.right") || el.querySelector?.(".right");
  if (col) {
    col.appendChild(btn);
    if (isDot) col.appendChild(idBtn);
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
          _clearDot(token);
          token.renderFlags.set({ refreshMesh: true });
        }
      }
    }
  });

  game.settings.register(SCOPE, LABEL_SETTING, {
    name: "Dot Labels",
    hint: "Initials drawn inside dots. Automatic uses a custom label if set, otherwise initials from the token name (only for users allowed to see the name).",
    scope: "world",
    config: true,
    type: String,
    default: "auto",
    choices: { auto: "Automatic (custom or name initials)", custom: "Custom labels only", off: "Off" },
    onChange: () => _refreshTokensForIdentity(canvas.tokens?.placeables ?? [])
  });

  Hooks.on("updateToken", (doc, changes) => {
    const f = changes?.flags?.[SCOPE];
    if (!f) return;
    if (["dotColor", "dotLabel", "-=dotColor", "-=dotLabel"].some(k => k in f)) _refreshTokensForIdentity([doc.object]);
  });
  Hooks.on("updateActor", (actor, changes) => {
    const f = changes?.flags?.[SCOPE];
    if (!f) return;
    if (!["dotColor", "dotLabel", "-=dotColor", "-=dotLabel"].some(k => k in f)) return;
    _refreshTokensForIdentity((canvas.tokens?.placeables ?? []).filter(t => t.document.actorId === actor.id));
  });

  const BaseToken = CONFIG.Token.objectClass;

  class FaseripToken extends BaseToken {
    // Disable grid snap in dot mode so tokens can be placed freely within an area.
    _getSnappingModes() {
      if (_isDotMode(this)) return 0;
      return super._getSnappingModes();
    }

    _getLightSourceData() {
      return _withFacing(this, super._getLightSourceData());
    }

    _getVisionSourceData() {
      return _withFacing(this, super._getVisionSourceData());
    }
  }

  CONFIG.Token.objectClass = FaseripToken;

  Hooks.on("updateToken", (doc, changes) => {
    const has = foundry.utils.hasProperty;
    if (has(changes, `flags.${SCOPE}.facingOffset`) || has(changes, `flags.${SCOPE}.-=facingOffset`)
        || has(changes, `delta.flags.${SCOPE}.artFacing`)) {
      _refreshFacing(doc.object);
    }
  });
  Hooks.on("updateActor", (actor, changes) => {
    if (!foundry.utils.hasProperty(changes, `flags.${SCOPE}.artFacing`)) return;
    for (const t of actor.getActiveTokens?.() ?? []) _refreshFacing(t);
  });

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
  Hooks.on("canvasTearDown", () => {
    _cancelHoverTimer();
    _hideAllPortraits();
  });

  game.keybindings.register(SCOPE, "toggleDotPortraits", {
    name: "Toggle Persistent Dot Portraits",
    hint: "Dot mode: keep hovered token portraits pinned until toggled off.",
    editable: [{ key: "KeyV" }],
    onDown: () => {
      _persistentPortraits = !_persistentPortraits;
      if (!_persistentPortraits) _hideAllPortraits();
      ui.notifications?.info(`Dot portraits: ${_persistentPortraits ? "persistent (hover to pin)" : "hover only"}`);
      return true;
    }
  });

  Hooks.on("updateSetting", (setting) => {
    if (setting.key === `${SCOPE}.${DOT_FLAG}`) _applyInheritedDotModeToScene();
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
      _applyInheritedDotModeToScene();
    }
  });
}