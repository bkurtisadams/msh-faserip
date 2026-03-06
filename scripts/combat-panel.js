// combat-panel.js v1.1.0 - 2026-03-06
// v1.1.0: Rewrite as ApplicationV2 + HandlebarsApplicationMixin for Foundry v13.
// GM-only combat panel that follows the active combatant.

import { ActionDispatcher } from "./modules/actions/action-dispatcher.js";

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
  }

  get combatant() { return game.combat?.combatant ?? null; }
  get actor() {
    const c = this.combatant;
    if (!c) return null;
    // For linked tokens, c.actor is the world actor.
    // For unlinked tokens, c.token.actor gives the synthetic actor.
    return c.token?.actor ?? c.actor ?? null;
  }
  get token() { return this.combatant?.token ?? null; }

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

    const token = this.token;
    ctx.img = token?.texture?.src || actor.img || "icons/svg/mystery-man.svg";
    ctx.name = actor.name;
    ctx.actorId = actor.id;
    ctx.hp = actor.system.attributes?.health?.value ?? 0;
    ctx.hpMax = actor.system.attributes?.health?.max ?? 0;
    ctx.wounded = ctx.hp < ctx.hpMax * 0.5;
    ctx.karma = actor.system.attributes?.karma?.value ?? 0;
    ctx.round = combat.round || 0;
    ctx.turn = (combat.turn ?? 0) + 1;

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
    const ability = actor.system.abilities[abilityKey];
    if (!ability) return;
    const fullName = abilityKey.charAt(0).toUpperCase() + abilityKey.slice(1);
    const rank = ability.rank;
    const value = ability.value;
    const allRanks = [
      "None","Shift-0","Feeble","Poor","Typical","Good","Excellent",
      "Remarkable","Incredible","Amazing","Monstrous","Unearthly",
      "Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000","Beyond"
    ];
    new Dialog({
      title: `${fullName} FEAT — ${actor.name}`,
      content: `
        <div style="font-size:12px;">
          <div style="margin-bottom:6px;"><strong>${fullName}</strong> — ${rank} (${value})</div>
          <div style="margin-bottom:6px;">
            <label style="display:inline-block;width:80px;">Intensity:</label>
            <select id="fcp-intensity" style="width:120px;">
              ${allRanks.map(r => `<option value="${r}">${r}</option>`).join("")}
            </select>
          </div>
          <div style="margin-bottom:6px;">
            <label style="display:inline-block;width:80px;">Column Shift:</label>
            <input type="number" id="fcp-cs" value="0" style="width:50px;">
          </div>
        </div>`,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice-d20"></i>', label: "Roll",
          callback: async (html) => {
            const intensity = html.find("#fcp-intensity").val();
            const cs = parseInt(html.find("#fcp-cs").val()) || 0;
            const roll = new Roll("1d100");
            await roll.evaluate();
            const shifted = game.msh.applyColumnShift?.(rank, cs) || rank;
            const color = game.msh.rollUniversalTable(shifted, roll.total);
            const styles = { white:"background:#ddd;color:#333;", green:"background:#4caf50;color:#fff;", yellow:"background:#ffc107;color:#000;", red:"background:#f44336;color:#fff;" };
            const iStr = intensity && intensity !== "None" ? ` vs ${intensity}` : "";
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor }),
              content: `<div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;">
                <div style="padding:4px 8px;border-bottom:1px solid #c0c0c0;font-weight:bold;">${fullName} FEAT${iStr}</div>
                <div style="padding:6px 8px;font-size:12px;">
                  <div>Rank: <strong>${rank}</strong> (${value})${cs ? ` | CS: ${cs > 0 ? "+" : ""}${cs} → ${shifted}` : ""}</div>
                  <div>Roll: <strong>${roll.total}</strong></div>
                  <div style="margin-top:4px;padding:3px 8px;border-radius:3px;font-weight:bold;display:inline-block;${styles[color.toLowerCase()] || ""}">${color}</div>
                </div></div>`,
              rolls: [roll],
            });
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "roll"
    }).render(true);
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

  async close(options = {}) {
    this._unregisterHooks();
    if (this._appId && ui.windows) {
      delete ui.windows[this._appId];
    }
    return super.close(options);
  }
}
