// scripts/action-hud.js v3.1.0 - 2026-04-23
// v3.1.0: Right-click per-button context menu (Hide, Reorder, Reset, Settings).
//         Header cog opens in-HUD settings popover — retires UI-layer
//         settings from Foundry Configure Settings panel. New actionHudHidden
//         setting replaces actionHudShowDefenses/Effects group toggles with
//         per-button hide. Shortcuts surfaced via title tooltip, control
//         labels, context menu, and popover Help section. Reset uses DialogV2.
// v3.0.0: Migrate localStorage to game.settings. Add configurable columns,
//         display style, lock position, show/hide defense & effect buttons.
//         Ctrl+Wheel zoom writes to game.settings.

import { ActionDispatcher } from "./modules/actions/action-dispatcher.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

const SCOPE = "msh-faserip";
const ICON_PATH = "systems/msh-faserip/assets/icons/actions";

const ACTIONS = [
  { id:"blunt-attack",   label:"BA",  full:"Blunt Attack",   ability:"fighting",  color:"#FF6B00", textColor:"#FFF", icon:`${ICON_PATH}/blunt.png` },
  { id:"edged-attack",   label:"EA",  full:"Edged Attack",   ability:"fighting",  color:"#DC143C", textColor:"#FFF", icon:`${ICON_PATH}/edged.png` },
  { id:"shooting",       label:"Sh",  full:"Shooting",       ability:"agility",   color:"#8B0000", textColor:"#FFF", icon:`${ICON_PATH}/shooting.png` },
  { id:"throwing-edged", label:"TE",  full:"Throwing Edged", ability:"agility",   color:"#DC143C", textColor:"#FFF", icon:`${ICON_PATH}/thrown.png` },
  { id:"throwing-blunt", label:"TB",  full:"Throwing Blunt", ability:"agility",   color:"#FF8C00", textColor:"#000", icon:`${ICON_PATH}/thrown_blunt.png` },
  { id:"energy",         label:"En",  full:"Energy",         ability:"agility",   color:"#8B0000", textColor:"#FFF", icon:`${ICON_PATH}/energy.png` },
  { id:"force",          label:"Fo",  full:"Force",          ability:"agility",   color:"#FF6B00", textColor:"#FFF", icon:`${ICON_PATH}/force.png` },
  { id:"grappling",      label:"Gp",  full:"Grappling",      ability:"strength",  color:"#1E90FF", textColor:"#FFF", icon:`${ICON_PATH}/grapple.png` },
  { id:"grabbing",       label:"Gb",  full:"Grabbing",       ability:"strength",  color:"#4169E1", textColor:"#FFF", icon:`${ICON_PATH}/grab.png` },
  { id:"escaping",       label:"Es",  full:"Escaping",       ability:"strength",  color:"#4682B4", textColor:"#FFF", icon:`${ICON_PATH}/escape.png` },
  { id:"charging",       label:"Ch",  full:"Charging",       ability:"endurance", color:"#FF8C00", textColor:"#000", icon:`${ICON_PATH}/charge.png` },
  { id:"dodging",        label:"Do",  full:"Dodging",        ability:"agility",   color:"#32CD32", textColor:"#000", icon:`${ICON_PATH}/dodge.png` },
  { id:"evading",        label:"Ev",  full:"Evading",        ability:"fighting",  color:"#228B22", textColor:"#FFF", icon:`${ICON_PATH}/evade.png` },
  { id:"blocking",       label:"Bl",  full:"Blocking",       ability:"strength",  color:"#228B22", textColor:"#FFF", icon:`${ICON_PATH}/block.png` },
  { id:"catching",       label:"Ca",  full:"Catching",       ability:"agility",   color:"#32CD32", textColor:"#000", icon:`${ICON_PATH}/catch.png` },
  { id:"stun",           label:"St",  full:"Stun",           ability:"endurance", color:"#9932CC", textColor:"#FFF", icon:`${ICON_PATH}/stun.png` },
  { id:"slam",           label:"Sl",  full:"Slam",           ability:"endurance", color:"#9932CC", textColor:"#FFF", icon:`${ICON_PATH}/slam.png` },
  { id:"kill",           label:"Kl",  full:"Kill",           ability:"endurance", color:"#8B008B", textColor:"#FFF", icon:`${ICON_PATH}/kill.png` }
];

const SHORTCUTS = [
  ["Alt+H",        "Toggle HUD"],
  ["E",            "Reorder (edit) mode"],
  ["Shift+R",      "Reset layout"],
  ["Ctrl+Wheel",   "Zoom buttons"],
  ["Right-click",  "Per-button menu"],
  ["Drag → bar",   "Create hotbar macro"],
];

// ── Settings helpers ──

function getSetting(key, fallback) {
  try { return game.settings.get(SCOPE, key); }
  catch { return fallback; }
}

function setSetting(key, value) {
  try { return game.settings.set(SCOPE, key, value); }
  catch (e) { console.warn("[FASERIP:HUD] Failed to save setting", key, e); }
}

function loadLayout() {
  const raw = getSetting("actionHudLayout", "");
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch { return null; }
}

function saveLayout(ids) { setSetting("actionHudLayout", JSON.stringify(ids)); }

function loadHidden() {
  const v = getSetting("actionHudHidden", []);
  return Array.isArray(v) ? new Set(v) : new Set();
}

function saveHidden(set) { setSetting("actionHudHidden", [...set]); }

function applyLayout(actions, order) {
  if (!order) return [...actions];
  const map = new Map(actions.map(a => [a.id, a]));
  const ordered = order.map(id => map.get(id)).filter(Boolean);
  const missing = actions.filter(a => !order.includes(a.id));
  return [...ordered, ...missing];
}

function filterActions(actions) {
  const hidden = loadHidden();
  return actions.filter(a => !hidden.has(a.id));
}

// ── CSS (injected once) ──
const CSS = `
.faserip-action-hud { --fah-bg: #1a1a2eee; }
.faserip-action-hud .window-content {
  padding: 4px; background: var(--fah-bg); overflow: visible;
}
.faserip-action-hud.fah-locked .window-header { cursor: default; }
.faserip-action-hud .window-title { cursor: help; }
.fah-wrap { display: flex; flex-direction: column; gap: 4px; }
.fah-grid { display: grid; gap: 3px; }
.fah-btn {
  position: relative; padding: 0; border: 1px solid rgba(0,0,0,.4);
  border-radius: 3px; cursor: pointer; overflow: hidden;
  aspect-ratio: 1; transition: all .1s;
  display: flex; align-items: center; justify-content: center;
}
.fah-btn:hover { filter: brightness(1.3); transform: translateY(-1px); box-shadow: 0 2px 6px rgba(0,0,0,.5); }
.fah-btn:active { transform: translateY(0); }
.fah-btn img { width: 100%; height: 100%; object-fit: cover; display: block; }
.fah-btn .fah-code {
  font-size: 14px; font-weight: 800; text-shadow: 0 1px 2px rgba(0,0,0,.6);
  position: absolute; z-index: 1;
}
.fah-btn.has-icon .fah-code { display: none; }
.fah-style-labels img { display: none !important; }
.fah-style-labels .fah-code,
.fah-style-labels.has-icon .fah-code { display: flex !important; }
.faserip-action-hud.editing .fah-btn { cursor: move; }
.fah-btn.dragging { opacity: .5; }
.fah-btn.drop-indicator { outline: 2px dashed #fff; outline-offset: -2px; }

/* Context menu */
.fah-ctx-menu {
  position: fixed; z-index: 10000; min-width: 180px;
  background: #1a1a2e; border: 1px solid #8b0000;
  border-radius: 4px; padding: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,.6);
  font-size: 12px;
}
.fah-ctx-menu .fah-ctx-label {
  padding: 4px 8px; font-size: 10px; color: #ffb;
  text-transform: uppercase; letter-spacing: .5px; font-weight: 700;
}
.fah-ctx-menu button {
  display: flex; align-items: center; gap: 6px;
  width: 100%; padding: 5px 8px; background: transparent;
  border: none; color: #eee; text-align: left; cursor: pointer;
  border-radius: 2px; font-size: 12px;
}
.fah-ctx-menu button:hover { background: #8b0000; }
.fah-ctx-menu button i { width: 14px; text-align: center; color: #ffb; }
.fah-ctx-menu .fah-ctx-sep { height: 1px; background: rgba(255,255,255,.15); margin: 4px 0; }

/* Settings popover */
.fah-popover {
  position: fixed; z-index: 10000; width: 280px;
  background: #1a1a2e; border: 1px solid #8b0000;
  border-radius: 4px; padding: 10px;
  box-shadow: 0 4px 12px rgba(0,0,0,.6);
  font-size: 12px; color: #eee;
  max-height: 80vh; overflow-y: auto;
}
.fah-popover h4 {
  margin: 0 0 6px; padding-bottom: 3px;
  border-bottom: 1px solid #8b0000;
  font-size: 11px; font-weight: 700; color: #ffb;
  text-transform: uppercase; letter-spacing: .5px;
}
.fah-popover section { margin-bottom: 10px; }
.fah-popover section:last-child { margin-bottom: 0; }
.fah-popover label {
  display: flex; align-items: center; gap: 6px;
  padding: 3px 0; font-size: 12px;
}
.fah-popover label.row { justify-content: space-between; }
.fah-popover input[type="checkbox"] { margin: 0; }
.fah-popover input[type="range"] { flex: 1; margin: 0; min-width: 0; }
.fah-popover select {
  background: #0a0a1a; color: #eee; border: 1px solid #555;
  border-radius: 2px; padding: 2px 4px; font-size: 12px;
}
.fah-popover .fah-zoom-val {
  min-width: 32px; text-align: right; font-variant-numeric: tabular-nums;
}
.fah-hidden-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 2px 0;
}
.fah-hidden-row button {
  background: #446; color: #eee; border: 1px solid #668;
  border-radius: 2px; padding: 1px 6px; font-size: 10px; cursor: pointer;
}
.fah-hidden-row button:hover { background: #8b0000; border-color: #8b0000; }
.fah-show-all {
  width: 100%; margin-top: 6px; padding: 4px;
  background: #446; color: #eee; border: 1px solid #668;
  border-radius: 2px; cursor: pointer; font-size: 11px;
}
.fah-show-all:hover { background: #8b0000; border-color: #8b0000; }
.fah-popover dl {
  margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 3px 10px;
  font-size: 11px;
}
.fah-popover dt { font-weight: 700; color: #ffb; font-family: "Courier New", monospace; }
.fah-popover dd { margin: 0; color: #ddd; }
.fah-popover .fah-empty { color: #888; font-style: italic; font-size: 11px; padding: 2px 0; }
`;

function injectCSS() {
  if (document.getElementById("fah-styles")) return;
  const s = document.createElement("style");
  s.id = "fah-styles";
  s.textContent = CSS;
  document.head.appendChild(s);
}

// ── ApplicationV2 ──
export class FaseripActionPanel extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "faserip-action-hud",
    classes: ["faserip-action-hud"],
    tag: "div",
    window: {
      frame: true,
      positioned: true,
      title: "Action HUD",
      icon: "fas fa-bolt",
      minimizable: true,
      resizable: true,
      controls: [
        { icon: "fas fa-cog",         label: "Settings…",              action: "openSettings" },
        { icon: "fas fa-arrows-alt",  label: "Reorder (E)",            action: "toggleEdit" },
        { icon: "fas fa-undo-alt",    label: "Reset layout (Shift+R)", action: "resetLayout" },
      ],
    },
    position: { width: 240, height: "auto" },
    actions: {
      toggleEdit:    FaseripActionPanel._onToggleEdit,
      resetLayout:   FaseripActionPanel._onResetLayout,
      openSettings:  FaseripActionPanel._onOpenSettings,
    },
  };

  static PARTS = {
    main: { template: `systems/${SCOPE}/templates/action-hud.hbs` }
  };

  constructor(options = {}) {
    if (!options.position) {
      try {
        const remember = getSetting("actionHudRememberPosition", true);
        if (remember) {
          const pos = getSetting("actionHudPosition", {});
          if (pos.left != null && pos.top != null) {
            options.position = { left: pos.left, top: pos.top };
          }
        }
      } catch (_) {}
    }
    super(options);
    this.editMode = false;
    this.actions = applyLayout(ACTIONS, loadLayout());
    this._zoom = getSetting("actionHudZoom", 1.0);
  }

  get actor() { return canvas.tokens?.controlled[0]?.actor || null; }

  static _onToggleEdit()   { FaseripActionPanel._findInstance()?._toggleEdit(); }
  static _onResetLayout()  { FaseripActionPanel._findInstance()?._confirmReset(); }
  static _onOpenSettings(event, target) {
    FaseripActionPanel._findInstance()?._toggleSettingsPopover(target);
  }

  static _findInstance() {
    return Object.values(ui.windows ?? {}).find(w => w instanceof FaseripActionPanel)
      ?? game.msh?.actionHUD
      ?? ui.faseripHUD;
  }

  async _prepareContext(options = {}) {
    const columns = getSetting("actionHudColumns", 6);
    const style = getSetting("actionHudStyle", "icons");
    return {
      actions: filterActions(this.actions),
      editMode: this.editMode,
      actorName: this.actor?.name ?? "No Actor Selected",
      columns,
      style,
    };
  }

  _onRender(context, options) {
    injectCSS();

    if (this._appId && ui.windows) ui.windows[this._appId] = this;

    const el = this.element;
    if (!el) return;

    const grid = el.querySelector(".fah-grid");
    if (!grid) return;

    const columns = getSetting("actionHudColumns", 6);
    const style = getSetting("actionHudStyle", "icons");
    const locked = getSetting("actionHudLocked", false);

    grid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;

    for (const btn of grid.querySelectorAll(".fah-btn")) {
      btn.classList.add(`fah-style-${style}`);
    }

    if (this.editMode) el.classList.add("editing");

    el.classList.toggle("fah-locked", locked);
    if (locked) {
      const header = el.querySelector(".window-header");
      if (header) {
        header.addEventListener("pointerdown", (ev) => {
          if (!ev.target.closest("button") && !ev.target.closest("a")) {
            ev.stopPropagation();
          }
        }, true);
      }
    }

    for (const img of grid.querySelectorAll(".fah-btn img")) {
      img.draggable = false;
      img.style.pointerEvents = "none";
    }

    let dragSrc = null;
    requestAnimationFrame(() => {
      for (const btn of grid.querySelectorAll(".fah-btn")) {
        btn.addEventListener("dragstart", (ev) => {
          if (this.editMode) {
            dragSrc = btn;
            btn.classList.add("dragging");
            ev.dataTransfer.effectAllowed = "move";
          } else {
            const actor = this.actor;
            if (!actor) {
              ui.notifications.warn("Select a token first.");
              ev.preventDefault();
              return;
            }
            ev.dataTransfer.setData("text/plain", JSON.stringify({
              type: "UniversalAction",
              actionCode: btn.dataset.action,
              actionName: btn.dataset.full,
              actorId: actor.id,
              actorName: actor.name,
              iconName: btn.dataset.action
            }));
          }
        });

        btn.addEventListener("dragend", () => {
          btn.classList.remove("dragging");
          grid.querySelectorAll(".drop-indicator").forEach(c => c.classList.remove("drop-indicator"));
        });
      }
    });

    grid.addEventListener("click", async (ev) => {
      if (this.editMode) return;
      const btn = ev.target.closest(".fah-btn");
      if (!btn) return;
      const actor = this.actor;
      if (!actor) return ui.notifications.warn("Select a token first.");
      try {
        await ActionDispatcher.roll(btn.dataset.action, {
          actor,
          abilityName: btn.dataset.ability,
          opts: {}
        });
      } catch (e) {
        if (e.message && e.message !== "cancelled") {
          console.error("[FASERIP:HUD] Action error:", e);
        }
      }
    });

    // Right-click: per-button context menu
    grid.addEventListener("contextmenu", (ev) => {
      const btn = ev.target.closest(".fah-btn");
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      this._showContextMenu(btn, ev.clientX, ev.clientY);
    });

    grid.addEventListener("dragover", (ev) => {
      if (!this.editMode) return;
      ev.preventDefault();
      const over = ev.target.closest(".fah-btn");
      if (!over || over === dragSrc) return;
      over.classList.add("drop-indicator");
    });

    grid.addEventListener("dragleave", (ev) => {
      ev.target.closest(".fah-btn")?.classList.remove("drop-indicator");
    });

    grid.addEventListener("drop", (ev) => {
      if (!this.editMode) return;
      ev.preventDefault();
      const target = ev.target.closest(".fah-btn");
      if (!target || target === dragSrc || !dragSrc) return;
      target.classList.remove("drop-indicator");
      const rect = target.getBoundingClientRect();
      const before = (ev.clientY - rect.top) < rect.height / 2
                  || (ev.clientX - rect.left) < rect.width / 2;
      grid.insertBefore(dragSrc, before ? target : target.nextSibling);
    });

    el.addEventListener("keydown", (ev) => {
      if (ev.key?.toLowerCase() === "e" && !ev.shiftKey && !ev.ctrlKey && !ev.altKey) {
        ev.preventDefault();
        this._toggleEdit();
      }
      if (ev.key?.toLowerCase() === "r" && ev.shiftKey) {
        ev.preventDefault();
        this._confirmReset();
      }
    });
    el.tabIndex = -1;

    grid.style.zoom = this._zoom;
    el.addEventListener("wheel", (ev) => {
      if (!ev.ctrlKey) return;
      ev.preventDefault();
      ev.stopPropagation();
      const delta = ev.deltaY > 0 ? -0.1 : 0.1;
      this._zoom = Math.round(Math.max(0.5, Math.min(2.0, this._zoom + delta)) * 10) / 10;
      grid.style.zoom = this._zoom;
      setSetting("actionHudZoom", this._zoom);
    }, { passive: false });

    // Title tooltip lists all shortcuts
    const title = el.querySelector(".window-title");
    if (title) {
      title.dataset.tooltip = SHORTCUTS.map(([k, v]) => `${k}: ${v}`).join(" • ");
    }

    this._updateTitle();

    if (!this._controlHook) {
      this._controlHook = Hooks.on("controlToken", () => this._updateTitle());
    }

    if (!this._positionHook) {
      this._positionHook = true;
      const savePos = foundry.utils.debounce(() => {
        if (!getSetting("actionHudRememberPosition", true)) return;
        const pos = this.position;
        if (pos.left != null && pos.top != null) {
          setSetting("actionHudPosition", { left: pos.left, top: pos.top });
        }
      }, 500);
      const origSetPos = this.setPosition.bind(this);
      this.setPosition = (...args) => {
        const result = origSetPos(...args);
        savePos();
        return result;
      };
    }
  }

  _toggleEdit() {
    const grid = this.element?.querySelector(".fah-grid");
    if (!grid) return;

    if (this.editMode) {
      const visibleIds = [...grid.querySelectorAll(".fah-btn")].map(b => b.dataset.action);
      const visibleSet = new Set(visibleIds);
      const hiddenIds = this.actions.filter(a => !visibleSet.has(a.id)).map(a => a.id);
      const allIds = [...visibleIds, ...hiddenIds];
      saveLayout(allIds);
      const map = new Map(ACTIONS.map(a => [a.id, a]));
      this.actions = allIds.map(id => map.get(id)).filter(Boolean);
      this.editMode = false;
      ui.notifications?.info("Layout saved.");
    } else {
      this.editMode = true;
      ui.notifications?.info("Edit mode: drag to reorder. Press E to exit.");
    }
    this.element?.classList.toggle("editing", this.editMode);
  }

  async _confirmReset() {
    const ok = await DialogV2.confirm({
      window: { title: "Reset HUD Layout" },
      content: "<p>Reset to default button order, zoom, position, and un-hide all buttons?</p>",
      rejectClose: false,
      modal: true,
    });
    if (!ok) return;
    setSetting("actionHudLayout", "");
    setSetting("actionHudZoom", 1.0);
    setSetting("actionHudPosition", {});
    setSetting("actionHudHidden", []);
    this.actions = [...ACTIONS];
    this._zoom = 1.0;
    this.editMode = false;
    this.render(true);
    ui.notifications?.info("Layout reset.");
  }

  _updateTitle() {
    const name = this.actor?.name ?? "No Actor Selected";
    const titleEl = this.element?.querySelector(".window-title");
    if (titleEl) titleEl.textContent = `Action HUD — ${name}`;
  }

  // ── Context menu ──

  _showContextMenu(btn, x, y) {
    this._hideContextMenu();
    this._hideSettingsPopover();

    const actionId = btn.dataset.action;
    const actionName = btn.dataset.full;

    const menu = document.createElement("div");
    menu.className = "fah-ctx-menu";
    menu.innerHTML = `
      <div class="fah-ctx-label">${actionName}</div>
      <button data-ctx="hide"><i class="fas fa-eye-slash"></i> Hide this button</button>
      <div class="fah-ctx-sep"></div>
      <button data-ctx="edit"><i class="fas fa-arrows-alt"></i> Reorder (E)</button>
      <button data-ctx="reset"><i class="fas fa-undo-alt"></i> Reset layout (Shift+R)</button>
      <button data-ctx="settings"><i class="fas fa-cog"></i> Settings…</button>
    `;
    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    menu.style.left = `${Math.min(x, vw - rect.width - 4)}px`;
    menu.style.top  = `${Math.min(y, vh - rect.height - 4)}px`;

    menu.addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-ctx]");
      if (!b) return;
      const ctx = b.dataset.ctx;
      this._hideContextMenu();
      switch (ctx) {
        case "hide":      return this._hideButton(actionId);
        case "edit":      return this._toggleEdit();
        case "reset":     return this._confirmReset();
        case "settings":  return this._toggleSettingsPopover();
      }
    });

    this._ctxMenu = menu;
    setTimeout(() => {
      this._ctxDismiss = (ev) => {
        if (!menu.contains(ev.target)) this._hideContextMenu();
      };
      document.addEventListener("mousedown", this._ctxDismiss);
    }, 0);
  }

  _hideContextMenu() {
    if (this._ctxMenu) { this._ctxMenu.remove(); this._ctxMenu = null; }
    if (this._ctxDismiss) {
      document.removeEventListener("mousedown", this._ctxDismiss);
      this._ctxDismiss = null;
    }
  }

  _hideButton(actionId) {
    const hidden = loadHidden();
    hidden.add(actionId);
    saveHidden(hidden);
    this.render();
    ui.notifications?.info("Button hidden. Unhide from the ⚙ Settings menu.");
  }

  _unhideAll() {
    saveHidden(new Set());
    this.render();
    ui.notifications?.info("All buttons shown.");
  }

  _unhideOne(actionId) {
    const hidden = loadHidden();
    hidden.delete(actionId);
    saveHidden(hidden);
    this.render();
  }

  // ── Settings popover ──

  _toggleSettingsPopover(anchor = null) {
    if (this._settingsPopover) { this._hideSettingsPopover(); return; }
    this._hideContextMenu();
    this._showSettingsPopover(anchor);
  }

  _showSettingsPopover(anchor = null) {
    const columns  = getSetting("actionHudColumns", 6);
    const style    = getSetting("actionHudStyle", "icons");
    const zoom     = getSetting("actionHudZoom", 1.0);
    const locked   = getSetting("actionHudLocked", false);
    const remember = getSetting("actionHudRememberPosition", true);
    const onLogin  = getSetting("actionHudEnabled", false);
    const hidden   = loadHidden();

    const hiddenList = [...hidden]
      .map(id => ACTIONS.find(a => a.id === id))
      .filter(Boolean);

    const hiddenHTML = hiddenList.length
      ? hiddenList.map(a => `
          <div class="fah-hidden-row">
            <span>${a.full}</span>
            <button data-unhide="${a.id}">Show</button>
          </div>`).join("")
      : `<div class="fah-empty">None hidden.</div>`;

    const showAllBtn = hiddenList.length
      ? `<button class="fah-show-all" data-popaction="unhide-all">Show all</button>`
      : "";

    const colOptions = [3, 4, 5, 6, 8]
      .map(n => `<option value="${n}" ${n === columns ? "selected" : ""}>${n}</option>`)
      .join("");

    const pop = document.createElement("div");
    pop.className = "fah-popover";
    pop.innerHTML = `
      <section>
        <h4>Layout</h4>
        <label class="row">Columns
          <select name="columns">${colOptions}</select>
        </label>
        <label class="row">Display
          <select name="style">
            <option value="icons" ${style === "icons" ? "selected" : ""}>Icons</option>
            <option value="labels" ${style === "labels" ? "selected" : ""}>Labels</option>
          </select>
        </label>
        <label class="row">Zoom
          <input type="range" min="0.5" max="2.0" step="0.1" value="${zoom}" name="zoom">
          <span class="fah-zoom-val">${Number(zoom).toFixed(1)}×</span>
        </label>
      </section>
      <section>
        <h4>Window</h4>
        <label><input type="checkbox" name="locked" ${locked ? "checked" : ""}> Lock position</label>
        <label><input type="checkbox" name="remember" ${remember ? "checked" : ""}> Remember position</label>
        <label><input type="checkbox" name="onLogin" ${onLogin ? "checked" : ""}> Open on login</label>
      </section>
      <section>
        <h4>Hidden Buttons (${hiddenList.length})</h4>
        ${hiddenHTML}
        ${showAllBtn}
      </section>
      <section>
        <h4>Shortcuts</h4>
        <dl>${SHORTCUTS.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
      </section>
    `;

    document.body.appendChild(pop);

    const hudRect = this.element?.getBoundingClientRect();
    const anchorRect = anchor?.getBoundingClientRect?.();
    const popRect = pop.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = anchorRect
      ? (anchorRect.left + anchorRect.width / 2 - popRect.width / 2)
      : (hudRect ? hudRect.right + 6 : 100);
    let top = anchorRect
      ? (anchorRect.bottom + 4)
      : (hudRect ? hudRect.top : 100);
    left = Math.max(4, Math.min(left, vw - popRect.width - 4));
    top  = Math.max(4, Math.min(top,  vh - popRect.height - 4));
    pop.style.left = `${left}px`;
    pop.style.top  = `${top}px`;

    pop.addEventListener("change", (ev) => {
      const t = ev.target;
      if (!t.name) return;
      let reRender = false;
      switch (t.name) {
        case "columns":   setSetting("actionHudColumns", Number(t.value)); reRender = true; break;
        case "style":     setSetting("actionHudStyle", t.value); reRender = true; break;
        case "locked":    setSetting("actionHudLocked", t.checked); reRender = true; break;
        case "remember":  setSetting("actionHudRememberPosition", t.checked); break;
        case "onLogin":   setSetting("actionHudEnabled", t.checked); break;
      }
      if (reRender) this.render();
    });

    pop.addEventListener("input", (ev) => {
      if (ev.target.name !== "zoom") return;
      const z = Number(ev.target.value);
      this._zoom = Math.round(z * 10) / 10;
      const grid = this.element?.querySelector(".fah-grid");
      if (grid) grid.style.zoom = this._zoom;
      const val = pop.querySelector(".fah-zoom-val");
      if (val) val.textContent = `${this._zoom.toFixed(1)}×`;
      setSetting("actionHudZoom", this._zoom);
    });

    pop.addEventListener("click", (ev) => {
      const one = ev.target.closest("button[data-unhide]");
      if (one) { this._unhideOne(one.dataset.unhide); this._hideSettingsPopover(); return; }
      const all = ev.target.closest("[data-popaction='unhide-all']");
      if (all) { this._unhideAll(); this._hideSettingsPopover(); return; }
    });

    this._settingsPopover = pop;

    setTimeout(() => {
      this._popDismiss = (ev) => {
        if (pop.contains(ev.target)) return;
        if (ev.target.closest("[data-action='openSettings']")) return;
        this._hideSettingsPopover();
      };
      document.addEventListener("mousedown", this._popDismiss);
    }, 0);
  }

  _hideSettingsPopover() {
    if (this._settingsPopover) { this._settingsPopover.remove(); this._settingsPopover = null; }
    if (this._popDismiss) {
      document.removeEventListener("mousedown", this._popDismiss);
      this._popDismiss = null;
    }
  }

  async close(options = {}) {
    this._hideContextMenu();
    this._hideSettingsPopover();
    if (this._controlHook) {
      Hooks.off("controlToken", this._controlHook);
      this._controlHook = null;
    }
    if (this._appId && ui.windows) delete ui.windows[this._appId];
    return super.close(options);
  }
}
