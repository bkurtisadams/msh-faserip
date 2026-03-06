// combat-panel.js v1.7.0 - 2026-03-06
// v1.7.0: Separate active (gold) vs selected (cyan) pip states. Click selects/inspects
//         without changing turn. Turn buttons advance active. Context menu "Set as Active Turn".
//         Use combatant.name for numbered token names.
// v1.6.0: Fix defeated toggle (skull overlay via toggleStatusEffect), split hide into
//         tracker vs map, side-aware reroll initiative, add hide-token-on-map option.
// v1.5.0: Pip hover highlight, right-click context menu (ping/defeated/hidden/reroll/remove),
//         skip defeated on advance, end combat button, auto-scroll strip to active pip.
// v1.4.0: Thinner pip borders, init button, click-to-pan, Ctrl+Wheel zoom, name cap.
// v1.3.0: Add combatant portrait strip and turn/round controls.
// v1.2.0: Delegate ability FEAT rolls to shared ability-feat-dialog.js module.
// GM-only combat panel that follows the active combatant.

import { ActionDispatcher } from "./modules/actions/action-dispatcher.js";
import { showAbilityFeatDialog } from "./modules/actions/ability-feat-dialog.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const SCOPE = "msh-faserip";
const FLAG_KEY = "combatPanelActions";

const STANDARD_ACTIONS = [
  { id: "blunt-attack",   label: "Blunt",    type: "blunt-attack" },
  { id: "edged-attack",   label: "Edged",    type: "edged-attack" },
  { id: "shooting",       label: "Shooting", type: "shooting" },
  { id: "throwing-edged", label: "Thr Edg",  type: "throwing-edged" },
  { id: "throwing-blunt", label: "Thr Blnt", type: "throwing-blunt" },
  { id: "energy",         label: "Energy",   type: "energy" },
  { id: "force",          label: "Force",    type: "force" },
  { id: "grappling",      label: "Grapple",  type: "grappling" },
  { id: "grabbing",       label: "Grab",     type: "grabbing" },
  { id: "escaping",       label: "Escape",   type: "escaping" },
  { id: "charging",       label: "Charge",   type: "charging" },
  { id: "dodging",        label: "Dodge",    type: "dodging" },
  { id: "evading",        label: "Evade",    type: "evading" },
  { id: "blocking",       label: "Block",    type: "blocking" },
  { id: "catching",       label: "Catch",    type: "catching" },
];

const RANK_ABBREV = {
  "Shift-0": "Sh0", "Feeble": "Fb", "Poor": "Pr", "Typical": "Ty",
  "Good": "Gd", "Excellent": "Ex", "Remarkable": "Rm", "Incredible": "In",
  "Amazing": "Am", "Monstrous": "Mn", "Unearthly": "Un",
  "Shift-X": "ShX", "Shift X": "ShX", "Shift-Y": "ShY", "Shift Y": "ShY",
  "Shift-Z": "ShZ", "Shift Z": "ShZ",
  "Class 1000": "CL1", "Class 3000": "CL3", "Class 5000": "CL5", "Beyond": "Byd"
};
function abbrev(rank) { return RANK_ABBREV[rank] || rank; }

const ABILITY_KEYS = ["fighting","agility","strength","endurance","reason","intuition","psyche"];
const ABILITY_LETTERS = { fighting:"F", agility:"A", strength:"S", endurance:"E", reason:"R", intuition:"I", psyche:"P" };

function getActorActions(actor) {
  if (!actor) return [];
  const saved = actor.getFlag(SCOPE, FLAG_KEY);
  if (Array.isArray(saved) && saved.length) return saved;

  // Auto-generate defaults: Blunt + Dodge + all actor powers
  const defaults = [
    { id: "blunt-attack", label: "Blunt", type: "blunt-attack" },
    { id: "dodging", label: "Dodge", type: "dodging" },
  ];
  const powers = getPowerActions(actor);
  return [...defaults, ...powers];
}

async function setActorActions(actor, actions) {
  if (!actor) return;
  await actor.setFlag(SCOPE, FLAG_KEY, actions);
}

function getPowerActions(actor) {
  if (!actor) return [];
  // Skip passive/defensive powers that aren't usable as actions
  const passivePatterns = /body armor|armou?r|resistance|invulner|life support|true (invulner|flight)|hyper.?breath/i;
  return actor.items
    .filter(i => i.type === "power" && i.system?.rank && !passivePatterns.test(i.name))
    .map(i => ({
      id: `power-${i.id}`,
      label: i.name.length > 12 ? i.name.slice(0, 11) + "…" : i.name,
      fullName: i.name,
      type: "power",
      powerId: i.id,
      rank: i.system.rank,
    }));
}

function getStatuses(actor) {
  if (!actor?.effects?.size) return [];
  const statuses = [];
  for (const ef of actor.effects) {
    if (ef.disabled) continue;
    const flags = ef.flags?.[SCOPE] || {};
    const name = ef.name || "";
    let cls = "generic";
    if (/stunned/i.test(name)) cls = "stunned";
    else if (/unconscious/i.test(name)) cls = "unconscious";
    else if (/impaired/i.test(name)) cls = "impaired";
    else if (/dying/i.test(name) || flags.isDying) cls = "dying";
    else if (/grappl|held|restrain/i.test(name)) cls = "grappled";
    let dur = "";
    const d = ef.duration;
    if (d?.rounds) {
      const elapsed = (game.combat?.round || 0) - (d.startRound || 0);
      const remaining = d.rounds - elapsed;
      if (remaining > 0) dur = ` ${remaining}`;
    }
    statuses.push({ name, cls, dur });
  }
  return statuses;
}

// ── ApplicationV2 ──
export class FaseripCombatPanel extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "faserip-combat-panel",
    classes: ["faserip-combat-panel"],
    tag: "div",
    window: {
      frame: true,
      positioned: true,
      title: "Combat Panel",
      icon: "fas fa-fist-raised",
      minimizable: true,
      resizable: true,
    },
    position: {
      width: 300,
      height: "auto",
    },
  };

  static PARTS = {
    main: {
      template: `systems/${SCOPE}/templates/combat-panel.hbs`,
    }
  };

  constructor(options = {}) {
    super(options);
    this.editMode = false;
    this._hooksRegistered = false;
    this._zoom = parseFloat(localStorage.getItem("fcp-zoom")) || 1.0;
    this._selectedIdx = null; // null = follow active turn
  }

  get combatant() {
    const combat = game.combat;
    if (!combat) return null;
    // If a specific combatant is selected, show them; otherwise follow active turn
    if (this._selectedIdx != null && combat.turns[this._selectedIdx]) {
      return combat.turns[this._selectedIdx];
    }
    return combat.combatant ?? null;
  }
  get actor() {
    const c = this.combatant;
    if (!c) return null;
    return c.token?.actor ?? c.actor ?? null;
  }
  get token() { return this.combatant?.token ?? null; }

  // The selected idx, falling back to the active turn
  get selectedIdx() {
    return this._selectedIdx ?? game.combat?.turn ?? 0;
  }

  // Stable ID for hook comparisons (works for both linked and synthetic actors)
  get _actorId() {
    const a = this.actor;
    return a?.id ?? null;
  }

  async _prepareContext(options = {}) {
    const ctx = {};
    const combat = game.combat;
    ctx.hasCombat = !!combat?.started;
    if (!ctx.hasCombat) return ctx;

    const actor = this.actor;
    ctx.hasActor = !!actor;
    if (!actor) return ctx;

    // Use the selected combatant (which may differ from active turn)
    const viewedCombatant = this.combatant;
    const token = this.token;
    ctx.img = token?.texture?.src || actor.img || "icons/svg/mystery-man.svg";
    ctx.name = viewedCombatant?.name || actor.name; // combatant.name includes (1), (2) etc.
    ctx.actorId = actor.id;
    ctx.hp = actor.system.attributes?.health?.value ?? 0;
    ctx.hpMax = actor.system.attributes?.health?.max ?? 0;
    ctx.wounded = ctx.hp < ctx.hpMax * 0.5;
    ctx.karma = actor.system.attributes?.karma?.value ?? 0;
    ctx.round = combat.round || 0;
    ctx.turn = (combat.turn ?? 0) + 1;
    ctx.isViewingActive = this._selectedIdx == null || this._selectedIdx === combat.turn;

    const abilities = actor.system.abilities || {};
    ctx.abilities = ABILITY_KEYS.map(key => {
      const ab = abilities[key];
      if (!ab) return null;
      const rank = ab.rank || "Ty";
      const val = ab.value ?? CONFIG.FASERIP?.rankValues?.[rank] ?? "?";
      return {
        key, letter: ABILITY_LETTERS[key], abbr: abbrev(rank),
        rank, value: val,
        tooltip: `${key.charAt(0).toUpperCase() + key.slice(1)}: ${rank} (${val})`,
      };
    }).filter(Boolean);

    ctx.statuses = getStatuses(actor);
    const targets = game.user.targets;
    ctx.targetName = targets.size ? targets.first()?.name || "" : "";
    ctx.hasStatusOrTarget = (ctx.statuses.length > 0) || !!ctx.targetName;
    ctx.actions = getActorActions(actor);
    ctx.editMode = this.editMode;

    // Combatant strip — all combatants in initiative order
    const selIdx = this.selectedIdx;
    ctx.combatants = combat.turns.map((c, idx) => {
      const a = c.token?.actor ?? c.actor;
      const img = c.token?.texture?.src || a?.img || "icons/svg/mystery-man.svg";
      const isActive = combat.turn === idx;
      const isSelected = selIdx === idx && !isActive;
      const defeated = c.isDefeated;
      const hidden = c.hidden;
      const hp = a?.system?.attributes?.health?.value ?? 0;
      const hpMax = a?.system?.attributes?.health?.max ?? 1;
      const hpPct = Math.round((hp / hpMax) * 100);
      const disposition = c.token?.disposition ?? 0;
      return {
        id: c.id,
        idx,
        name: c.name || a?.name || "?", // combatant.name has the (1), (2) suffix
        img,
        isActive,
        isSelected,
        defeated,
        hidden,
        hpPct,
        hostile: disposition === -1,
        friendly: disposition >= 0,
        initiative: c.initiative ?? "—",
        tokenId: c.token?.id || "",
      };
    });

    // Turn controls
    ctx.canPrev = (combat.turn ?? 0) > 0 || combat.round > 1;
    ctx.canNext = true;

    if (this.editMode) {
      const assignedIds = new Set(ctx.actions.map(a => a.id));
      ctx.availableStandard = STANDARD_ACTIONS.filter(a => !assignedIds.has(a.id));
      ctx.availablePowers = getPowerActions(actor).filter(p => !assignedIds.has(p.id));
    }
    return ctx;
  }

  // ── Hooks ──
  _registerHooks() {
    if (this._hooksRegistered) return;
    this._hooksRegistered = true;
    this._hookIds = [
      Hooks.on("updateCombat", () => this.render(false)),
      Hooks.on("combatTurn", () => this.render(false)),
      Hooks.on("combatRound", () => this.render(false)),
      Hooks.on("deleteCombat", () => this.render(false)),
      Hooks.on("createCombat", () => this.render(false)),
      Hooks.on("updateActor", (a) => {
        const id = this._actorId;
        if (id && (a.id === id || a.token?.id === this.token?.id)) this.render(false);
      }),
      Hooks.on("createActiveEffect", (e) => {
        const parent = e.parent;
        const id = this._actorId;
        if (id && (parent?.id === id || parent?.actor?.id === id)) this.render(false);
      }),
      Hooks.on("deleteActiveEffect", (e) => {
        const parent = e.parent;
        const id = this._actorId;
        if (id && (parent?.id === id || parent?.actor?.id === id)) this.render(false);
      }),
      Hooks.on("targetToken", () => this.render(false)),
      Hooks.on("updateToken", () => this.render(false)),
      Hooks.on("updateCombatant", () => this.render(false)),
    ];
  }

  _unregisterHooks() {
    if (!this._hooksRegistered) return;
    for (const id of this._hookIds || []) Hooks.off(id);
    this._hookIds = [];
    this._hooksRegistered = false;
  }

  // ── Post-render event binding ──
  _onRender(context, options) {
    this._registerHooks();
    this._injectCSS();

    // Register in ui.windows for Popout! module compatibility
    if (this._appId && ui.windows) {
      ui.windows[this._appId] = this;
    }

    const el = this.element;
    if (!el) return;

    el.querySelector(".fcp-portrait")?.addEventListener("click", () => {
      this.actor?.sheet?.render(true);
    });

    // Combatant strip — click to select/inspect, double-click opens sheet
    for (const pip of el.querySelectorAll(".fcp-combatant")) {
      pip.addEventListener("click", (ev) => {
        const idx = Number(pip.dataset.idx);
        const combat = game.combat;
        if (!combat || isNaN(idx)) return;
        const combatant = combat.turns[idx];
        if (!combatant) return;

        // Select this combatant for viewing (does NOT change active turn)
        this._selectedIdx = idx;
        this.render(false);

        // Pan canvas to token
        const tok = combatant.token?.object;
        if (tok) canvas.animatePan({ x: tok.center.x, y: tok.center.y, duration: 250 });
      });

      pip.addEventListener("dblclick", (ev) => {
        const idx = Number(pip.dataset.idx);
        const combatant = game.combat?.turns[idx];
        if (!combatant) return;
        const a = combatant.token?.actor ?? combatant.actor;
        a?.sheet?.render(true);
      });

      // Hover: highlight token on canvas
      pip.addEventListener("mouseenter", () => {
        const idx = Number(pip.dataset.idx);
        const tok = game.combat?.turns[idx]?.token?.object;
        if (tok) tok._onHoverIn(new Event("mouseenter"), { hoverOutOthers: true });
      });
      pip.addEventListener("mouseleave", () => {
        const idx = Number(pip.dataset.idx);
        const tok = game.combat?.turns[idx]?.token?.object;
        if (tok) tok._onHoverOut(new Event("mouseleave"));
      });

      // Right-click: context menu
      pip.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        this._showPipContextMenu(ev, Number(pip.dataset.idx));
      });
    }

    // Roll initiative button
    el.querySelector(".fcp-roll-init")?.addEventListener("click", () => {
      if (game.msh?.rollFaseripInitiative) game.msh.rollFaseripInitiative();
      else game.combat?.rollAll();
    });

    // Turn controls — advance active turn and reset selection to follow
    el.querySelector(".fcp-prev-turn")?.addEventListener("click", async () => {
      const combat = game.combat;
      if (!combat) return;
      this._selectedIdx = null;
      if ((combat.turn ?? 0) > 0) await combat.previousTurn();
      else if (combat.round > 1) await combat.previousRound();
    });
    el.querySelector(".fcp-next-turn")?.addEventListener("click", async () => {
      const combat = game.combat;
      if (!combat) return;
      this._selectedIdx = null;
      await combat.nextTurn();
      this._skipDefeated();
    });
    el.querySelector(".fcp-next-round")?.addEventListener("click", async () => {
      const combat = game.combat;
      if (!combat) return;
      this._selectedIdx = null;
      await combat.nextRound();
      this._skipDefeated();
    });

    // End combat button
    el.querySelector(".fcp-end-combat")?.addEventListener("click", () => {
      const combat = game.combat;
      if (!combat) return;
      Dialog.confirm({
        title: "End Combat",
        content: "<p>End this combat encounter and clear the tracker?</p>",
        yes: () => combat.endCombat(),
        defaultYes: false,
      });
    });

    // Auto-scroll strip to center selected (or active) pip
    const scrollTarget = el.querySelector(".fcp-combatant.selected") || el.querySelector(".fcp-combatant.active");
    if (scrollTarget) {
      const strip = el.querySelector(".fcp-strip");
      if (strip) {
        const offset = scrollTarget.offsetLeft - (strip.clientWidth / 2) + (scrollTarget.offsetWidth / 2);
        strip.scrollLeft = Math.max(0, offset);
      }
    }

    for (const abilEl of el.querySelectorAll(".fcp-ability")) {
      abilEl.addEventListener("click", () => {
        const key = abilEl.dataset.ability;
        if (key && this.actor) this._rollAbilityFeat(this.actor, key);
      });
    }

    for (const btn of el.querySelectorAll(".fcp-actions .fcp-action-btn")) {
      btn.addEventListener("click", () => {
        const type = btn.dataset.type;
        const powerId = btn.dataset.powerId;
        if (type === "power" && powerId) this._rollPower(this.actor, powerId);
        else ActionDispatcher.roll(type, { actor: this.actor });
      });
    }

    el.querySelector(".fcp-gear-btn")?.addEventListener("click", () => {
      this.editMode = true;
      this.render(false);
    });

    for (const btn of el.querySelectorAll(".fcp-remove-btn")) {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const current = getActorActions(this.actor);
        await setActorActions(this.actor, current.filter(a => a.id !== btn.dataset.removeId));
        this.render(false);
      });
    }

    el.querySelector(".fcp-add-btn")?.addEventListener("click", async () => {
      const select = el.querySelector(".fcp-add-select");
      if (!select) return;
      const val = select.value;
      const opt = select.selectedOptions[0];
      if (!val) return;
      const current = getActorActions(this.actor);
      if (current.some(a => a.id === val)) return;
      let newAction;
      if (opt.dataset.source === "power") {
        const fullName = opt.textContent;
        newAction = { id: val, label: fullName.length > 12 ? fullName.slice(0, 11) + "…" : fullName, fullName, type: "power", powerId: opt.dataset.powerId, rank: opt.dataset.rank };
      } else {
        const std = STANDARD_ACTIONS.find(a => a.id === val);
        if (!std) return;
        newAction = { ...std };
      }
      current.push(newAction);
      await setActorActions(this.actor, current);
      this.render(false);
    });

    el.querySelector(".fcp-edit-done")?.addEventListener("click", () => {
      this.editMode = false;
      this.render(false);
    });

    // Ctrl+Wheel zoom on the panel body
    const body = el.querySelector(".fcp-body");
    if (body) {
      body.style.transformOrigin = "top left";
      body.style.transform = `scale(${this._zoom})`;
      el.addEventListener("wheel", (ev) => {
        if (!ev.ctrlKey) return;
        ev.preventDefault();
        ev.stopPropagation();
        const delta = ev.deltaY > 0 ? -0.05 : 0.05;
        this._zoom = Math.round(Math.max(0.6, Math.min(1.8, this._zoom + delta)) * 100) / 100;
        body.style.transform = `scale(${this._zoom})`;
        localStorage.setItem("fcp-zoom", this._zoom.toFixed(2));
      }, { passive: false });
    }
  }

  _injectCSS() {
    if (document.getElementById("fcp-styles")) return;
    const link = document.createElement("link");
    link.id = "fcp-styles";
    link.rel = "stylesheet";
    link.href = `systems/${SCOPE}/styles/combat-panel.css`;
    document.head.appendChild(link);
  }

  async _rollAbilityFeat(actor, abilityKey) {
    showAbilityFeatDialog(actor, abilityKey);
  }

  async _rollPower(actor, powerId) {
    const power = actor.items.get(powerId);
    if (!power) return;
    try {
      const { FaseripRolls } = await import("./rolls.js");
      FaseripRolls.rollPower(actor, power);
    } catch {
      const name = (power.name || "").toLowerCase();
      ActionDispatcher.roll(name.includes("force") ? "force" : "energy", { actor, opts: { powerName: power.name, powerRank: power.system.rank } });
    }
  }

  // ── Context menu on right-click pip ──
  _showPipContextMenu(ev, idx) {
    const combat = game.combat;
    if (!combat) return;
    const combatant = combat.turns[idx];
    if (!combatant) return;

    // Remove any existing context menu
    document.querySelector(".fcp-context-menu")?.remove();

    const menu = document.createElement("div");
    menu.className = "fcp-context-menu";
    menu.style.cssText = `position:fixed;left:${ev.clientX}px;top:${ev.clientY}px;z-index:10000;`;

    // Detect initiative mode for reroll label
    const isSideMode = game.settings.get("msh-faserip", "initiativeMode") === "side";

    const items = [
      { icon: "fa-crosshairs", label: "Set as Active Turn",
        action: async () => { this._selectedIdx = null; await combat.update({ turn: idx }); }},
      { icon: "fa-bullseye", label: "Ping Token", action: () => this._pingToken(combatant) },
      { icon: "fa-skull", label: combatant.isDefeated ? "Unmark Defeated" : "Mark Defeated",
        action: () => this._toggleDefeated(combatant) },
      { icon: "fa-eye-slash", label: combatant.hidden ? "Show in Tracker" : "Hide in Tracker",
        action: () => combatant.update({ hidden: !combatant.hidden }) },
      { icon: "fa-ghost", label: (combatant.token?.hidden ? "Show" : "Hide") + " Token on Map",
        action: () => {
          const td = combatant.token;
          if (td) td.update({ hidden: !td.hidden });
        }},
      { icon: "fa-redo",
        label: isSideMode ? "Reroll Side Initiative" : "Reroll Initiative",
        action: () => {
          if (isSideMode) {
            if (game.msh?.rollFaseripInitiative) game.msh.rollFaseripInitiative();
            else combat.rollAll();
          } else {
            combat.rollInitiative([combatant.id]);
          }
        }},
      { icon: "fa-eraser", label: "Clear Initiative",
        action: () => combatant.update({ initiative: null }) },
      { icon: "fa-user-minus", label: "Remove from Combat",
        action: () => combatant.delete() },
    ];

    for (const item of items) {
      const row = document.createElement("div");
      row.className = "fcp-ctx-item";
      row.innerHTML = `<i class="fas ${item.icon}"></i> ${item.label}`;
      row.addEventListener("click", () => { menu.remove(); item.action(); });
      menu.appendChild(row);
    }

    document.body.appendChild(menu);

    // Close on any click outside
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("mousedown", closeMenu); }
    };
    setTimeout(() => document.addEventListener("mousedown", closeMenu), 0);
  }

  // ── Toggle defeated: apply/remove skull overlay status effect ──
  async _toggleDefeated(combatant) {
    const actor = combatant.token?.actor ?? combatant.actor;
    if (actor) {
      const status = CONFIG.specialStatusEffects.DEFEATED;
      await actor.toggleStatusEffect(status, { overlay: true, active: !combatant.isDefeated });
    }
    await combatant.update({ defeated: !combatant.isDefeated });
  }

  // ── Ping token for all players ──
  _pingToken(combatant) {
    const tok = combatant.token?.object;
    if (!tok) return;
    canvas.ping(tok.center, { style: CONFIG.Canvas.pings.types.ALERT, duration: 3000 });
  }

  // ── Skip defeated combatants after advancing ──
  async _skipDefeated() {
    const combat = game.combat;
    if (!combat) return;
    let safety = combat.turns.length;
    while (safety-- > 0) {
      const current = combat.turns[combat.turn];
      if (!current?.isDefeated) break;
      await combat.nextTurn();
    }
  }

  async close(options = {}) {
    this._unregisterHooks();
    if (this._appId && ui.windows) {
      delete ui.windows[this._appId];
    }
    return super.close(options);
  }
}
