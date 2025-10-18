// scripts/action-hud.js

const ACTIONS = [
  { id:"blunt-attack",   label:"BA",  full:"Blunt Attack",   ability:"fighting",  color:"#FF6B00", textColor:"#FFF" },
  { id:"edged-attack",   label:"EA",  full:"Edged Attack",   ability:"fighting",  color:"#DC143C", textColor:"#FFF" },
  { id:"shooting",       label:"Sh",  full:"Shooting",       ability:"agility",   color:"#8B0000", textColor:"#FFF" },
  { id:"throwing-edged", label:"TE",  full:"Throwing Edged", ability:"agility",   color:"#DC143C", textColor:"#FFF" },
  { id:"throwing-blunt", label:"TB",  full:"Throwing Blunt", ability:"agility",   color:"#FF8C00", textColor:"#000" },
  { id:"energy",         label:"En",  full:"Energy",         ability:"agility",   color:"#8B0000", textColor:"#FFF" },
  { id:"force",          label:"Fo",  full:"Force",          ability:"agility",   color:"#FF6B00", textColor:"#FFF" },
  { id:"grappling",      label:"Gp",  full:"Grappling",      ability:"strength",  color:"#1E90FF", textColor:"#FFF" },
  { id:"grabbing",       label:"Gb",  full:"Grabbing",       ability:"strength",  color:"#4169E1", textColor:"#FFF" },
  { id:"escaping",       label:"Es",  full:"Escaping",       ability:"strength",  color:"#4682B4", textColor:"#FFF" },
  { id:"charging",       label:"Ch",  full:"Charging",       ability:"endurance", color:"#FF8C00", textColor:"#000" },
  { id:"dodging",        label:"Do",  full:"Dodging",        ability:"agility",   color:"#32CD32", textColor:"#000" },
  { id:"evading",        label:"Ev",  full:"Evading",        ability:"fighting",  color:"#228B22", textColor:"#FFF" },
  { id:"blocking",       label:"Bl",  full:"Blocking",       ability:"strength",  color:"#228B22", textColor:"#FFF" },
  { id:"catching",       label:"Ca",  full:"Catching",       ability:"agility",   color:"#32CD32", textColor:"#000" },
  { id:"stun",           label:"St",  full:"Stun",           ability:"endurance", color:"#9932CC", textColor:"#FFF" },
  { id:"slam",           label:"Sl",  full:"Slam",           ability:"endurance", color:"#9932CC", textColor:"#FFF" },
  { id:"kill",           label:"Kl",  full:"Kill",           ability:"endurance", color:"#8B008B", textColor:"#FFF" }
];

const WORLD_ID = game?.world?.id ?? "world";
const USER_ID  = game?.user?.id ?? "user";
const STORAGE_KEY = `faserip-hud-layout:${WORLD_ID}:${USER_ID}`;

function loadLayout() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch { return null; }
}

function saveLayoutFromDOM(gridEl) {
  const ids = [...gridEl.querySelectorAll(".hud-btn")].map(b => b.dataset.action);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

function applyLayout(actions, order) {
  if (!order) return actions;
  const map = new Map(actions.map(a => [a.id, a]));
  const ordered = order.map(id => map.get(id)).filter(Boolean);
  const missing = actions.filter(a => !order.includes(a.id));
  return [...ordered, ...missing];
}

export class FaseripActionHUD extends Application {
    static get defaultOptions() {
    const savedPos = game.user?.getFlag("msh-faserip", "faserip-action-hud.position") || {};
    
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "faserip-action-hud",
      classes:["faserip-action-hud","faserip-action-hud--responsive"],
      popOut:true, resizable:true, minimizable:true,
      width: savedPos.width || 262,
      height: savedPos.height || 210,
      left: savedPos.left || 100,
      top: savedPos.top || 100,
      title:"Action HUD", template:null
    });
  }

  constructor(){
    super();
    this.opacity = 0.95;
    this.editMode = false;
    this.actions = applyLayout(ACTIONS, loadLayout());
    this.gridEl = null;
  }

  async setPosition(options = {}) {
    const position = await super.setPosition(options);
    
    // Save the position after any change
    if (this.options.id) {
      await this.savePosition();
    }
    
    return position;
  }

  async savePosition() {
    const position = this.position;
    await game.user.setFlag("msh-faserip", `${this.options.id}.position`, {
      width: position.width,
      height: position.height,
      left: position.left,
      top: position.top
    });
  }

  get actor(){ return canvas.tokens?.controlled[0]?.actor || null; }
  getData(){ return { actorName: this.actor?.name ?? "No Actor Selected", actions: this.actions }; }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    buttons.unshift({
      label: "Reset",
      class: "faserip-hud-reset",
      icon: "fas fa-undo-alt",
      onclick: () => this._confirmReset(this.gridEl, this.setEditMode.bind(this))
    });
    buttons.unshift({
      label: this.editMode ? "Done" : "Edit",
      class: "faserip-hud-edit",
      icon: "fas fa-arrows-alt",
      onclick: () => this.setEditMode(!this.editMode)
    });
    return buttons;
  }

  setEditMode(on) {
    this.editMode = !!on;
    const root = this.element?.[0];
    const grid = this.gridEl;
    if (!root || !grid) return;

    root.classList.toggle("editing", this.editMode);
    [...grid.querySelectorAll(".hud-btn")].forEach(b => { b.draggable = this.editMode; });

    if (!this.editMode) {
      saveLayoutFromDOM(grid);
      const ids = [...grid.querySelectorAll(".hud-btn")].map(b => b.dataset.action);
      const map = new Map(ACTIONS.map(a => [a.id, a]));
      this.actions = ids.map(id => map.get(id)).filter(Boolean);
      ui?.notifications?.info("Layout saved.");
    } else {
      ui?.notifications?.info("Layout edit ON (drag to reorder, press E to exit)");
    }

    this.render(false);
  }

  async _renderInner(){
    return `
    <style>
      .faserip-action-hud .window-content{ padding:6px; background:#1F293766; overflow-y:auto; height:100%; position:relative; }
      .faserip-hud-wrap{ display:flex; flex-direction:column; gap:6px; height:100%; }
      .hud-grid{
        display:grid; grid-template-columns:repeat(auto-fill, minmax(45px,1fr));
        gap:3px; flex:1; align-content:start;
      }
      .hud-btn{
        padding:clamp(4px, 1.2vw, 5px) clamp(2px, 0.6vw, 3px);
        font-size:clamp(10px, 2.5vw, 13px);
        font-weight:600; line-height:1.1;
        border:1px solid rgba(0,0,0,0.3); border-radius:3px; cursor:pointer; text-align:center;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-shadow:0 1px 2px rgba(0,0,0,0.4);
        transition: all .12s ease; box-shadow:0 1px 3px rgba(0,0,0,0.2); 
        min-height:clamp(32px, 8vw, 42px);
        display:flex; flex-direction:column; justify-content:center; align-items:center; gap:1px;
      }
      .hud-btn:hover{ filter:brightness(1.5); transform:translateY(-2px); box-shadow:0 4px 8px rgba(0,0,0,0.4); }
      .hud-btn:active{ transform:translateY(0); box-shadow:0 1px 2px rgba(0,0,0,0.2); }
      .btn-label{ font-size:clamp(11px, 2.8vw, 14px); font-weight:bold; letter-spacing:.3px; }
      .btn-name{ font-size:clamp(8px, 2vw, 10px); font-weight:500; opacity:.9; }

      .editing .hud-btn{ cursor:move; }
      .hud-btn.dragging{ opacity:.6; transform:scale(0.98); }
      .drop-indicator{ outline:2px dashed rgba(0,0,0,0.6); outline-offset:-4px; }
    </style>
    <div class="faserip-hud-wrap">
      <div class="hud-grid"></div>
    </div>`;
  }

  async _render(...args){
    await super._render(...args);
    const root = this.element[0];
    root.style.opacity = `${this.opacity}`;
    this._updateTitle();

    const grid = root.querySelector(".hud-grid");
    this.gridEl = grid;

    const makeBtn = a => {
      const el = document.createElement("button");
      el.type="button";
      el.className="hud-btn";
      el.dataset.action=a.id;
      el.dataset.ability=a.ability;
      el.title = `${a.full} (${a.ability})`;
      el.style.backgroundColor = a.color;
      el.style.color = a.textColor;
      el.innerHTML = `<span class="btn-label">${a.label}</span><span class="btn-name">${a.full.split(" ")[0]}</span>`;
      return el;
    };
    grid.replaceChildren(...this.actions.map(makeBtn));

    [...grid.querySelectorAll(".hud-btn")].forEach(b => { b.draggable = this.editMode; });
    root.classList.toggle("editing", this.editMode);

    let dragSrc = null;
    grid.addEventListener("dragstart", (ev) => {
      if (!this.editMode) return;
      const btn = ev.target.closest(".hud-btn"); if (!btn) return;
      dragSrc = btn;
      btn.classList.add("dragging");
      ev.dataTransfer.effectAllowed = "move";
    });
    grid.addEventListener("dragend", () => {
      const d = grid.querySelector(".dragging"); if (d) d.classList.remove("dragging");
      [...grid.children].forEach(c => c.classList.remove("drop-indicator"));
    });
    grid.addEventListener("dragover", (ev) => {
      if (!this.editMode) return;
      ev.preventDefault();
      const over = ev.target.closest(".hud-btn");
      if (!over || over === dragSrc) return;
      over.classList.add("drop-indicator");
    });
    grid.addEventListener("dragleave", (ev) => {
      const over = ev.target.closest(".hud-btn");
      if (over) over.classList.remove("drop-indicator");
    });
    grid.addEventListener("drop", (ev) => {
      if (!this.editMode) return;
      ev.preventDefault();
      const target = ev.target.closest(".hud-btn");
      if (!target || target === dragSrc) return;
      target.classList.remove("drop-indicator");
      const rect = target.getBoundingClientRect();
      const before = (ev.clientY - rect.top) < rect.height / 2;
      grid.insertBefore(dragSrc, before ? target : target.nextSibling);
    });

    grid.addEventListener("click", async (ev) => {
      if (this.editMode) return;
      const btn = ev.target.closest(".hud-btn"); if (!btn) return;
      const actor = this.actor;
      if (!actor) return ui.notifications.warn("Select a token first.");
      const actionType = btn.dataset.action;
      const abilityName = btn.dataset.ability;
      const sheet = actor.sheet;
      if (sheet && typeof sheet._rollAction === "function") {
        try { await sheet._rollAction(actionType, abilityName); }
        catch(e){ console.error("[HUD] _rollAction error:", e); ui.notifications.error(e.message ?? "Roll failed."); }
      } else {
        ui.notifications.error("Open the actor sheet at least once so its methods are available.");
      }
    });

    root.addEventListener("keydown", (ev) => {
      if (ev.key?.toLowerCase() === "e" && !ev.shiftKey && !ev.ctrlKey && !ev.altKey) {
        ev.preventDefault(); this.setEditMode(!this.editMode);
      }
      if (ev.key?.toLowerCase() === "r" && ev.shiftKey) {
        ev.preventDefault(); this._confirmReset(this.gridEl, this.setEditMode.bind(this));
      }
    });

    root.tabIndex = -1;
    root.focus();

    this.element.find(".window-title").off("dblclick.faserip").on("dblclick.faserip", () => this.setEditMode(!this.editMode));
  }

  _confirmReset(grid, setEditMode){
    Dialog.confirm({
      title: "Reset HUD Layout",
      content: "<p>Reset to the default button order?</p>",
      yes: () => {
        localStorage.removeItem(STORAGE_KEY);
        this.actions = [...ACTIONS];
        const makeBtn = a => {
          const el = document.createElement("button");
          el.type="button"; el.className="hud-btn";
          el.dataset.action=a.id; el.dataset.ability=a.ability;
          el.title = `${a.full} (${a.ability})`;
          el.style.backgroundColor = a.color; el.style.color = a.textColor;
          el.innerHTML = `<span class="btn-label">${a.label}</span><span class="btn-name">${a.full.split(" ")[0]}</span>`;
          return el;
        };
        grid.replaceChildren(...this.actions.map(makeBtn));
        setEditMode(false);
        ui.notifications?.info("Layout reset.");
      }
    });
  }

  _updateTitle(){
    const actorName = this.actor?.name ?? "No Actor Selected";
    const t = this.element.find(".window-title");
    if (t.length) t.text(`Action HUD - ${actorName}`);
  }
}