// scripts/action-hud.js v2.0.0 - 2026-03-06
// v2.0.0: Rewrite as ApplicationV2 for Foundry v13. Compact single-line buttons.
//         Drag-to-reorder in edit mode. Drag-to-hotbar in normal mode.
//         Layout persisted per-user via localStorage.

import { ActionDispatcher } from "./modules/actions/action-dispatcher.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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

function storageKey() {
  const w = game?.world?.id ?? "world";
  const u = game?.user?.id ?? "user";
  return `faserip-hud-layout:${w}:${u}`;
}

function loadLayout() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch { return null; }
}

function saveLayout(ids) {
  localStorage.setItem(storageKey(), JSON.stringify(ids));
}

function applyLayout(actions, order) {
  if (!order) return [...actions];
  const map = new Map(actions.map(a => [a.id, a]));
  const ordered = order.map(id => map.get(id)).filter(Boolean);
  const missing = actions.filter(a => !order.includes(a.id));
  return [...ordered, ...missing];
}

// ── CSS (injected once) ──
const CSS = `
.faserip-action-hud { --fah-bg: #1a1a2eee; }
.faserip-action-hud .window-content {
  padding: 4px; background: var(--fah-bg); overflow-y: auto;
}
.fah-wrap { display: flex; flex-direction: column; gap: 4px; }
.fah-grid {
  display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px;
}
.fah-btn {
  position: relative; padding: 0; border: 1px solid rgba(0,0,0,.4);
  border-radius: 3px; cursor: pointer; overflow: hidden;
  aspect-ratio: 1; transition: all .1s;
  display: flex; align-items: center; justify-content: center;
}
.fah-btn:hover { filter: brightness(1.3); transform: translateY(-1px); box-shadow: 0 2px 6px rgba(0,0,0,.5); }
.fah-btn:active { transform: translateY(0); }
.fah-btn img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
/* Text fallback when no icon */
.fah-btn .fah-code {
  font-size: 14px; font-weight: 800; text-shadow: 0 1px 2px rgba(0,0,0,.6);
  position: absolute; z-index: 1;
}
/* Hide text code when icon is present (art has text baked in) */
.fah-btn.has-icon .fah-code { display: none; }

/* Edit mode */
.faserip-action-hud.editing .fah-btn { cursor: move; }
.fah-btn.dragging { opacity: .5; }
.fah-btn.drop-indicator { outline: 2px dashed #fff; outline-offset: -2px; }
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
        {
          icon: "fas fa-arrows-alt",
          label: "Edit",
          action: "toggleEdit",
        },
        {
          icon: "fas fa-undo-alt",
          label: "Reset",
          action: "resetLayout",
        },
      ],
    },
    position: {
      width: 240,
      height: "auto",
    },
    actions: {
      toggleEdit: FaseripActionPanel._onToggleEdit,
      resetLayout: FaseripActionPanel._onResetLayout,
    },
  };

  static PARTS = {
    main: {
      template: `systems/${SCOPE}/templates/action-hud.hbs`,
    }
  };

  constructor(options = {}) {
    super(options);
    this.editMode = false;
    this.actions = applyLayout(ACTIONS, loadLayout());
    this._zoom = parseFloat(localStorage.getItem(`${storageKey()}-zoom`)) || 1.0;
  }

  get actor() { return canvas.tokens?.controlled[0]?.actor || null; }

  // ── Static action handlers (called via DEFAULT_OPTIONS.actions) ──
  static _onToggleEdit(event, target) {
    const app = Object.values(ui.windows ?? {}).find(w => w instanceof FaseripActionPanel)
      ?? game.msh?.actionHUD ?? ui.faseripHUD;
    if (app) app._toggleEdit();
  }

  static _onResetLayout(event, target) {
    const app = Object.values(ui.windows ?? {}).find(w => w instanceof FaseripActionPanel)
      ?? game.msh?.actionHUD ?? ui.faseripHUD;
    if (app) app._confirmReset();
  }

  async _prepareContext(options = {}) {
    return {
      actions: this.actions,
      editMode: this.editMode,
      actorName: this.actor?.name ?? "No Actor Selected",
    };
  }

  _onRender(context, options) {
    injectCSS();

    // Register in ui.windows so Popout! module can find this app
    if (this._appId && ui.windows) {
      ui.windows[this._appId] = this;
    }

    const el = this.element;
    if (!el) return;

    const grid = el.querySelector(".fah-grid");
    if (!grid) return;

    // ── Prevent images from capturing drag events ──
    for (const img of grid.querySelectorAll(".fah-btn img")) {
      img.draggable = false;
      img.style.pointerEvents = "none";
    }

    // ── Drag: attach directly to each button (deferred to ensure DOM is settled) ──
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

    // ── Click: dispatch action ──
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
          console.error("[HUD] Action error:", e);
        }
      }
    });

    // ── Drag reorder (edit mode): grid-level handlers ──
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

    // ── Keyboard shortcuts ──
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

    // ── Ctrl+Wheel zoom ──
    grid.style.zoom = this._zoom;
    el.addEventListener("wheel", (ev) => {
      if (!ev.ctrlKey) return;
      ev.preventDefault();
      ev.stopPropagation();
      const delta = ev.deltaY > 0 ? -0.1 : 0.1;
      this._zoom = Math.max(0.5, Math.min(2.0, this._zoom + delta));
      grid.style.zoom = this._zoom;
      localStorage.setItem(`${storageKey()}-zoom`, this._zoom.toFixed(2));
    }, { passive: false });

    // Update title with actor name
    this._updateTitle();

    // Listen for token selection changes
    if (!this._controlHook) {
      this._controlHook = Hooks.on("controlToken", () => this._updateTitle());
    }
  }

  _toggleEdit() {
    const grid = this.element?.querySelector(".fah-grid");
    if (!grid) return;

    if (this.editMode) {
      // Save
      const ids = [...grid.querySelectorAll(".fah-btn")].map(b => b.dataset.action);
      saveLayout(ids);
      const map = new Map(ACTIONS.map(a => [a.id, a]));
      this.actions = ids.map(id => map.get(id)).filter(Boolean);
      this.editMode = false;
      ui.notifications?.info("Layout saved.");
    } else {
      this.editMode = true;
      ui.notifications?.info("Edit mode: drag to reorder, press E to exit.");
    }
    this.element?.classList.toggle("editing", this.editMode);
    // Update edit button label
    const btn = this.element?.querySelector(".fah-edit-btn");
    if (btn) btn.innerHTML = `<i class="fas fa-arrows-alt"></i> ${this.editMode ? "Done" : "Edit"}`;
  }

  _confirmReset() {
    Dialog.confirm({
      title: "Reset HUD Layout",
      content: "<p>Reset to the default button order and zoom?</p>",
      yes: () => {
        localStorage.removeItem(storageKey());
        localStorage.removeItem(`${storageKey()}-zoom`);
        this.actions = [...ACTIONS];
        this._zoom = 1.0;
        this.editMode = false;
        this.render(true);
        ui.notifications?.info("Layout reset.");
      }
    });
  }

  _updateTitle() {
    const name = this.actor?.name ?? "No Actor Selected";
    const titleEl = this.element?.querySelector(".window-title");
    if (titleEl) titleEl.textContent = `Action HUD — ${name}`;
  }

  async close(options = {}) {
    if (this._controlHook) {
      Hooks.off("controlToken", this._controlHook);
      this._controlHook = null;
    }
    if (this._appId && ui.windows) {
      delete ui.windows[this._appId];
    }
    return super.close(options);
  }
}
