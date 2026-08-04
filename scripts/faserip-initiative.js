// faserip-initiative.js v2.3.1 - 2026-06-25
// v2.3.1: Set a speaker on all initiative chat cards (side/individual/tie). Speaker-less
//         messages left the header sender empty, collapsing the metadata column and
//         wrapping the timestamp/delete one char per line (malformed card header).

import { ActionDispatcher } from "./modules/actions/action-dispatcher.js";
import { showAbilityFeatDialog } from "./modules/actions/ability-feat-dialog.js";
import { getInitiativeModifier } from "./rules/rules-reference.js";

export class FaseripInitiative {
  static initialized = false;
  static isRolling = false;

  // Initiative mode constants
  static MODE_SIDE = "side";
  static MODE_INDIVIDUAL = "individual";
  static MODE_FOUNDRY = "foundry";

  // Turn phase constants (RAW mode)
  static PHASE_DECLARE = "declare";
  static PHASE_PREACTION = "preaction";
  static PHASE_ACTIONS_WINNER = "actions-winner";
  static PHASE_ACTIONS_LOSER = "actions-loser";
  static PHASE_ACTIONS = "actions"; // legacy fallback

  static _getPhase(combat) {
    if (!game.settings.get("msh-faserip", "useRawTurnPhases")) return this.PHASE_ACTIONS;
    // Before encounter begins (round 0), no phase applies
    if (!combat?.round) return null;
    return combat?.getFlag("msh-faserip", "turnPhase") ?? this.PHASE_DECLARE;
  }

  static async _setPhase(combat, phase) {
    if (!combat) return;
    await combat.setFlag("msh-faserip", "turnPhase", phase);
    ui.combat?.render(true);
  }

  /**
   * Movement multiplier from RAW action declaration.
   * Returns null when no cap should be applied (RAW phases off, no combat,
   * token isn't an active combatant, or no declaration yet — full move).
   * Returns 1 for declared "charge" (RAW exemption from half-move rule).
   * Returns 0.5 for any other declared type (attack / defend / other / multi).
   */
  static getDeclaredMoveMultiplier(token) {
    if (!game.settings.get("msh-faserip", "useRawTurnPhases")) return null;
    const combat = game.combat;
    if (!combat?.started) return null;
    const tokenId = token?.id ?? token?.document?.id;
    if (!tokenId) return null;
    const combatant = combat.combatants.find(c => c.tokenId === tokenId);
    if (!combatant) return null;
    const decl = combatant.getFlag("msh-faserip", "declaredAction");
    if (!decl?.type) return null;
    return decl.type === "charge" ? 1 : 0.5;
  }

  static registerSettings() {
    game.settings.register("msh-faserip", "initiativeMode", {
      name: "Initiative Mode",
      hint: "Side-Based (RAW): one roll per side + Intuition modifier. Individual FASERIP: each character rolls 1d10 + their own Intuition modifier. Standard Foundry: default Foundry individual initiative (no FASERIP modifiers).",
      scope: "world",
      config: true,
      type: String,
      default: this.MODE_SIDE,
      choices: {
        [this.MODE_SIDE]: "FASERIP Side-Based (RAW)",
        [this.MODE_INDIVIDUAL]: "FASERIP Individual",
        [this.MODE_FOUNDRY]: "Standard Foundry"
      },
      onChange: () => ui.combat?.render()
    });

    game.settings.register("msh-faserip", "autoRerollInitiative", {
      name: "Auto Reroll Initiative Each Round",
      hint: "Automatically reroll initiative at the start of each new round (side-based and individual modes).",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register("msh-faserip", "showPhaseReminder", {
      name: "Show Turn Phase Reminder",
      hint: "Show the RAW turn sequence (Pre-Action → Winning Side → Losing Side) on initiative chat cards.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register("msh-faserip", "useTalentInitBonuses", {
      name: "Apply Talent Initiative Bonuses",
      hint: "Include Martial Arts E (+1) and Weapon Specialist (+1) when calculating initiative modifiers.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register("msh-faserip", "sideLabels", {
      name: "Side Labels",
      hint: "How to label the two sides in side-based initiative.",
      scope: "world",
      config: true,
      type: String,
      default: "heroes_villains",
      choices: {
        "heroes_villains": "Heroes / Villains",
        "side_ab": "Side A / Side B",
        "players_gm": "Players / GM"
      }
    });

    game.settings.register("msh-faserip", "useRawTurnPhases", {
      name: "Use RAW Turn Phases",
      hint: "When enabled, players declare actions before initiative is rolled. Adds Pre-Action phase for Dodge/Block/Evade and Change Action (Yellow Agility FEAT, -1CS). When disabled, players decide actions on their turn.",
      scope: "world",
      config: true,
      type: Boolean,
      default: false
    });

    game.settings.register("msh-faserip", "panToCombatant", {
      name: "Pan to Active Combatant",
      hint: "Automatically pan the canvas to the active combatant's token when the turn advances.",
      scope: "client",
      config: true,
      type: Boolean,
      default: true
    });

    // Migrate old boolean setting to new mode
    this._migrateOldSettings();
  }

  static _migrateOldSettings() {
    try {
      const old = game.settings.storage.get("world")?.getItem("msh-faserip.useCustomInitiative");
      if (old !== null && old !== undefined) {
        const wasCustom = old === "true" || old === true;
        const currentMode = game.settings.get("msh-faserip", "initiativeMode");
        // Only migrate if the new setting is still default
        if (currentMode === this.MODE_SIDE && !wasCustom) {
          game.settings.set("msh-faserip", "initiativeMode", this.MODE_FOUNDRY);
        }
        console.log("[FASERIP] Migrated old useCustomInitiative setting");
      }
    } catch (e) { /* no old setting to migrate */ }
  }

  static _isFaseripMode() {
    const mode = game.settings.get("msh-faserip", "initiativeMode");
    return mode === this.MODE_SIDE || mode === this.MODE_INDIVIDUAL;
  }

  static _isSideMode() {
    return game.settings.get("msh-faserip", "initiativeMode") === this.MODE_SIDE;
  }

  static _isIndividualMode() {
    return game.settings.get("msh-faserip", "initiativeMode") === this.MODE_INDIVIDUAL;
  }

  static _getSideLabels() {
    const key = game.settings.get("msh-faserip", "sideLabels");
    switch (key) {
      case "side_ab": return { pc: "Side A", npc: "Side B" };
      case "players_gm": return { pc: "Players", npc: "GM" };
      default: return { pc: "Heroes", npc: "Villains" };
    }
  }

  // --- Init & Hooks ---

  static init() {
    if (this.initialized) return;
    this.initialized = true;
    console.log("[FASERIP] Initiative: Initializing");
    this.registerSettings();
    this._registerHooks();
  }

  static _registerHooks() {
    CONFIG.Combat.initiative = { formula: "1d10", decimals: 0 };

    const originalRollInitiative = Combat.prototype.rollInitiative;
    Combat.prototype.rollInitiative = async function (ids, options = {}) {
      const mode = game.settings.get("msh-faserip", "initiativeMode");
      if (mode === FaseripInitiative.MODE_SIDE) {
        await FaseripInitiative.rollSideInitiative(this);
        return this;
      }
      if (mode === FaseripInitiative.MODE_INDIVIDUAL) {
        await FaseripInitiative.rollIndividualInitiative(this, ids);
        return this;
      }
      return originalRollInitiative.call(this, ids, options);
    };

    Hooks.on("renderCombatTracker", (app, html) => {
      if (!this._isFaseripMode()) return;
      const root = html instanceof HTMLElement ? html : html[0];
      const combat = app.viewed;
      if (!combat) return;

      // Side coloring on combatant rows (both modes)
      this._modifyCombatantDisplay_native(root, combat);

      // Initiative bar (side mode only)
      if (this._isSideMode()) {
        const data = this._getFlagData(combat);
        if (this._hasCompleteData(data) && !root.querySelector(".faserip-initiative-bar")) {
          this._addInitiativeBar_native(root, data);
        }
      }
    });

    Hooks.on("combatRound", async (combat) => {
      if (!game.user.isGM) return;
      if (!this._isFaseripMode()) return;

      const rawPhases = game.settings.get("msh-faserip", "useRawTurnPhases");

      // Reset to declaration phase on new round (RAW mode)
      if (rawPhases) {
        await this._setPhase(combat, this.PHASE_DECLARE);
        // Clear previous declarations
        const clearOps = [];
        for (const c of combat.combatants) {
          if (c.getFlag("msh-faserip", "declaredAction")) {
            clearOps.push({ _id: c.id, "flags.msh-faserip.-=declaredAction": null });
          }
        }
        if (clearOps.length) await combat.updateEmbeddedDocuments("Combatant", clearOps);
        // RAW: declarations must happen before initiative roll.
        // Don't auto-roll here — GM advances from declaration phase to trigger the roll.
        ui.combat?.render(true);
        return;
      }

      if (!game.settings.get("msh-faserip", "autoRerollInitiative")) return;
      try {
        if (this._isSideMode()) {
          await this.rollSideInitiative(combat);
        } else {
          await this.rollIndividualInitiative(combat);
        }
        ui.combat?.render(true);
      } catch (err) {
        console.error("[FASERIP ERROR] combatRound reroll failed", err);
      }
    });

    Hooks.on("createCombatant", this._onCreateCombatant.bind(this));

    // Chat card button handlers
    Hooks.on("renderChatMessageHTML", (msg, html) => {
      const root = html instanceof HTMLElement ? html : html[0] ?? html;
      const buttons = root.querySelectorAll(".faserip-preaction-btn, .faserip-change-action-btn");
      for (const btn of buttons) {
        btn.addEventListener("click", (ev) => this._onPreActionButton(ev));
      }
      // Collapsible step list toggle
      const toggle = root.querySelector(".faserip-steps-toggle");
      if (toggle) {
        toggle.addEventListener("click", (ev) => {
          const list = ev.currentTarget.nextElementSibling;
          const arrow = ev.currentTarget.querySelector(".faserip-steps-arrow");
          if (list) {
            const collapsed = list.style.display === "none";
            list.style.display = collapsed ? "block" : "none";
            if (arrow) arrow.textContent = collapsed ? "▾" : "▸";
          }
        });
      }
    });
  }

  // --- Flag helpers ---

  static _getFlagData(combat) {
    return {
      pcInit: combat.getFlag("msh-faserip", "pcInitiative"),
      npcInit: combat.getFlag("msh-faserip", "npcInitiative"),
      pcRoll: combat.getFlag("msh-faserip", "pcRoll"),
      npcRoll: combat.getFlag("msh-faserip", "npcRoll"),
      pcMod: combat.getFlag("msh-faserip", "pcModifier") ?? 0,
      npcMod: combat.getFlag("msh-faserip", "npcModifier") ?? 0,
      goesFirst: combat.getFlag("msh-faserip", "goesFirst"),
      pcHighestName: combat.getFlag("msh-faserip", "pcHighestName") ?? "",
      npcHighestName: combat.getFlag("msh-faserip", "npcHighestName") ?? "",
      pcTalentBonus: combat.getFlag("msh-faserip", "pcTalentBonus") ?? 0,
      npcTalentBonus: combat.getFlag("msh-faserip", "npcTalentBonus") ?? 0,
      pcTalentSource: combat.getFlag("msh-faserip", "pcTalentSource") ?? "",
      npcTalentSource: combat.getFlag("msh-faserip", "npcTalentSource") ?? ""
    };
  }

  static _hasCompleteData(data) {
    return data.pcInit !== undefined && data.npcInit !== undefined &&
      data.goesFirst !== undefined && data.pcRoll !== undefined &&
      data.npcRoll !== undefined;
  }

  // --- Combatant side assignment ---

  static _determineSide(combatant) {
    if (combatant.actor?.type === "hero") return "pc";
    if (combatant.actor?.type === "villain") return "npc";
    const disp = combatant.token?.disposition ?? combatant.actor?.prototypeToken?.disposition;
    if (disp === CONST.TOKEN_DISPOSITIONS.FRIENDLY) return "pc";
    if (disp === CONST.TOKEN_DISPOSITIONS.HOSTILE) return "npc";
    return combatant.actor?.hasPlayerOwner ? "pc" : "npc";
  }

  static _getCombatantSide(combatant) {
    return combatant.getFlag("msh-faserip", "side") ?? this._determineSide(combatant);
  }

  static async _onCreateCombatant(combatant) {
    if (!game.user.isGM || !this._isFaseripMode()) return;
    const side = this._determineSide(combatant);
    await combatant.setFlag("msh-faserip", "side", side);
  }

  // --- Talent & Power bonus scanning ---

  static _getInitiativeTalentBonus(combatant) {
    if (!game.settings.get("msh-faserip", "useTalentInitBonuses")) return { bonus: 0, source: "" };
    const actor = combatant.actor;
    if (!actor) return { bonus: 0, source: "" };

    let bonus = 0;
    const sources = [];
    const talents = actor.items.filter(i => i.type === "talent");

    for (const t of talents) {
      const name = t.name.toLowerCase();
      if (name.includes("martial arts e") || name.includes("martial arts-e") ||
        (name.includes("martial arts") && name.includes("(e)"))) {
        bonus += 1;
        sources.push("MA-E");
      }
      if (name.includes("weapon specialist") || name.includes("weapons specialist")) {
        bonus += 1;
        sources.push("Wpn Spec");
      }
    }
    return { bonus, source: sources.join(", ") };
  }

  // Get effective Intuition for initiative, considering powers that replace it
  // Enhanced Senses (hearing): use power rank instead of Intuition
  // Combat Sense: use power rank instead of Intuition (for surprise/initiative)
  static _getEffectiveIntuition(combatant) {
    const actor = combatant.actor;
    if (!actor) return { value: 0, source: "Intuition", name: combatant.name };

    const baseInt = actor.system?.abilities?.intuition?.value ?? 0;
    let best = baseInt;
    let source = "Int";

    if (!game.settings.get("msh-faserip", "useTalentInitBonuses")) {
      return { value: best, source, name: combatant.name };
    }

    const powers = actor.items.filter(i => i.type === "power");
    for (const p of powers) {
      const name = p.name.toLowerCase();
      const pVal = p.system?.value ?? 0;

      // Combat Sense: replaces Intuition for surprise (initiative)
      if (name.includes("combat sense")) {
        if (pVal > best) {
          best = pVal;
          source = "Combat Sense";
        }
      }
      // Enhanced Senses: replaces Intuition for initiative (hearing variant)
      if (name.includes("enhanced sense")) {
        if (pVal > best) {
          best = pVal;
          source = "Enh Senses";
        }
      }
    }
    return { value: best, source, name: combatant.name };
  }

  // --- Intuition modifier table ---

  static _getModifierForIntuition(intuition) {
    return getInitiativeModifier(Number(intuition) || 0);
  }

  // --- UI: Combat Tracker bar & coloring ---

  static _addInitiativeBar_native(root, data) {
    const labels = this._getSideLabels();
    const pcModStr = (data.pcMod || data.pcTalentBonus) && data.pcRoll !== 1
      ? `+${data.pcMod + data.pcTalentBonus}` : "";
    const npcModStr = (data.npcMod || data.npcTalentBonus) && data.npcRoll !== 1
      ? `+${data.npcMod + data.npcTalentBonus}` : "";

    const bar = document.createElement("div");
    bar.className = "faserip-initiative-bar";
    bar.innerHTML = `
      <span class="${data.goesFirst === 'pc' ? 'goes-first' : ''}">${labels.pc} ${data.pcRoll}${pcModStr}=${data.pcInit}</span>
      &nbsp;—&nbsp;
      <span class="${data.goesFirst === 'npc' ? 'goes-first' : ''}">${labels.npc} ${data.npcRoll}${npcModStr}=${data.npcInit}</span>
    `;

    const anchor =
      root.querySelector(".combat-sidebar-header") ||
      root.querySelector(".directory-header") ||
      root.querySelector("header");
    if (anchor?.parentElement) {
      anchor.parentElement.insertBefore(bar, anchor.nextSibling);
    }
  }

  static _modifyCombatantDisplay_native(root, combat) {
    const rawPhases = game.settings.get("msh-faserip", "useRawTurnPhases");
    const phase = this._getPhase(combat);
    const goesFirst = combat.getFlag("msh-faserip", "goesFirst");

    // Phase indicator bar (RAW mode only, after combat has started)
    if (rawPhases && phase && !root.querySelector(".faserip-phase-bar")) {
      const labels = this._getSideLabels();
      const winnerLabel = goesFirst === "pc" ? labels.pc : labels.npc;
      const loserLabel = goesFirst === "pc" ? labels.npc : labels.pc;

      const phaseLabels = {
        [this.PHASE_DECLARE]: "Declaration Phase",
        [this.PHASE_PREACTION]: "Pre-Action Phase",
        [this.PHASE_ACTIONS_WINNER]: `${winnerLabel} Act (Winner)`,
        [this.PHASE_ACTIONS_LOSER]: `${loserLabel} Act (Loser)`,
        [this.PHASE_ACTIONS]: "Actions"
      };
      const phaseColors = {
        [this.PHASE_DECLARE]: "#1E90FF",
        [this.PHASE_PREACTION]: "#DAA520",
        [this.PHASE_ACTIONS_WINNER]: "#006400",
        [this.PHASE_ACTIONS_LOSER]: "#8B4513",
        [this.PHASE_ACTIONS]: "#006400"
      };

      const bar = document.createElement("div");
      bar.className = "faserip-phase-bar";
      bar.style.cssText = `background:${phaseColors[phase] || "#006400"}; color:#fff;`;
      bar.innerHTML = `<span class="faserip-phase-label">${phaseLabels[phase] || "Actions"}</span>`;

      // GM-only phase advance buttons
      if (game.user.isGM && phase === this.PHASE_DECLARE) {
        const btn = document.createElement("button");
        btn.className = "faserip-phase-advance-btn";
        btn.innerHTML = `<i class="fas fa-dice"></i> Roll Initiative`;
        btn.title = "End declarations and roll initiative";
        btn.addEventListener("click", async () => {
          const live = game.combats.get(combat.id) ?? game.combat;
          if (!live) return ui.notifications.warn("No active combat.");
          if (this._isSideMode()) {
            await this.rollSideInitiative(live);
          } else {
            await this.rollIndividualInitiative(live);
          }
        });
        bar.appendChild(btn);
      }

      if (game.user.isGM && phase === this.PHASE_PREACTION) {
        const btn = document.createElement("button");
        btn.className = "faserip-phase-advance-btn";
        btn.innerHTML = `<i class="fas fa-play"></i> ${winnerLabel} Act`;
        btn.title = `End Pre-Action phase — ${winnerLabel} (initiative winner) act first`;
        btn.addEventListener("click", async () => {
          const live = game.combats.get(combat.id) ?? game.combat;
          if (!live) return ui.notifications.warn("No active combat.");
          await this._setPhase(live, this.PHASE_ACTIONS_WINNER);
        });
        bar.appendChild(btn);
      }

      if (game.user.isGM && phase === this.PHASE_ACTIONS_WINNER) {
        const btn = document.createElement("button");
        btn.className = "faserip-phase-advance-btn";
        btn.innerHTML = `<i class="fas fa-forward"></i> ${loserLabel} Act`;
        btn.title = `${winnerLabel} done — ${loserLabel} (initiative loser) act now`;
        btn.addEventListener("click", async () => {
          const live = game.combats.get(combat.id) ?? game.combat;
          if (!live) return ui.notifications.warn("No active combat.");
          await this._setPhase(live, this.PHASE_ACTIONS_LOSER);
        });
        bar.appendChild(btn);
      }

      // Insert after initiative bar or header
      const anchor =
        root.querySelector(".faserip-initiative-bar") ||
        root.querySelector(".combat-sidebar-header") ||
        root.querySelector(".directory-header") ||
        root.querySelector("header");
      if (anchor?.parentElement) {
        anchor.parentElement.insertBefore(bar, anchor.nextSibling);
      }
    }

    for (const el of root.querySelectorAll(".combatant")) {
      const id = el.getAttribute("data-combatant-id");
      const c = combat.combatants.get(id);
      if (!c) continue;

      const side = this._getCombatantSide(c);
      el.classList.add(`${side}-side`);

      // Skip button injection if not RAW, no active phase, or already injected
      if (!rawPhases || !phase || !c.actor?.id || el.querySelector(".faserip-tracker-actions")) continue;

      const container = document.createElement("div");
      container.className = "faserip-tracker-actions";

      if (phase === this.PHASE_DECLARE) {
        // Declaration phase: compact icon badge or declare button
        const declared = c.getFlag("msh-faserip", "declaredAction");
        const declIcons = { attack: "fa-fist-raised", defend: "fa-shield-alt", other: "fa-ellipsis-h", multi: "fa-burst", charge: "fa-bolt" };
        const declTips = { attack: "Attack", defend: "Defend", other: "Other", multi: "Multi-Action", charge: "Charge" };
        if (declared) {
          const icon = declIcons[declared.type] || "fa-question";
          const tip = (declTips[declared.type] || declared.type) + (declared.note ? `: ${declared.note}` : "") + " — Right-click to change";
          container.innerHTML = `<span class="faserip-declared-icon faserip-decl-${declared.type}" title="${tip}"><i class="fas ${icon}"></i></span>`;
        } else {
          container.innerHTML = `
            <button class="faserip-tracker-ctrl faserip-declare-btn" data-action="declare" data-actor-id="${c.actor.id}" data-combatant-id="${c.id}" title="Declare Action"><i class="fas fa-bullhorn"></i></button>
          `;
        }
      } else if (phase === this.PHASE_PREACTION) {
        // Pre-action phase: dodge/block/evade + change action (either side per RAW)
        const declared = c.getFlag("msh-faserip", "declaredAction");
        const declIcons = { attack: "fa-fist-raised", defend: "fa-shield-alt", other: "fa-ellipsis-h", multi: "fa-burst", charge: "fa-bolt" };
        const declTips = { attack: "Attack", defend: "Defend", other: "Other", multi: "Multi-Action", charge: "Charge" };
        let buttons = `
          <button class="faserip-tracker-ctrl" data-action="dodging" data-actor-id="${c.actor.id}" title="Dodge (Agility)"><i class="fas fa-running"></i></button>
          <button class="faserip-tracker-ctrl" data-action="blocking" data-actor-id="${c.actor.id}" title="Block (Strength)"><i class="fas fa-shield-alt"></i></button>
          <button class="faserip-tracker-ctrl" data-action="evading" data-actor-id="${c.actor.id}" title="Evade (Fighting)"><i class="fas fa-eye-slash"></i></button>
          <button class="faserip-tracker-ctrl faserip-change-ctrl" data-action="change-action" data-actor-id="${c.actor.id}" title="Change Action (Yellow Agility, -1CS)"><i class="fas fa-exchange-alt"></i></button>
        `;
        // Show current declaration as a compact icon
        if (declared) {
          const icon = declIcons[declared.type] || "fa-question";
          const tip = (declTips[declared.type] || declared.type) + (declared.note ? `: ${declared.note}` : "") + " — Right-click to change";
          buttons = `<span class="faserip-declared-icon faserip-decl-${declared.type}" title="${tip}"><i class="fas ${icon}"></i></span>` + buttons;
        }
        container.innerHTML = buttons;
      }
      // PHASE_ACTIONS: no buttons

      if (container.innerHTML.trim()) {
        // Wire click handlers
        for (const btn of container.querySelectorAll(".faserip-tracker-ctrl")) {
          btn.addEventListener("click", (ev) => this._onTrackerActionButton(ev));
        }

        // Right-click on declaration icon to change declaration
        for (const badge of container.querySelectorAll(".faserip-declared-icon")) {
          badge.addEventListener("contextmenu", (ev) => {
            ev.preventDefault();
            if (c.actor?.id) this._showDeclarationDialog(c.actor, c.id);
          });
        }

        const nameEl = el.querySelector(".token-name") || el.querySelector(".combatant-name");
        if (nameEl) {
          nameEl.after(container);
        } else {
          el.appendChild(container);
        }
      }
    }
  }

  // --- Side-Based Initiative (RAW) ---

  static async rollSideInitiative(combat) {
    if (!game.user.isGM || !combat || this.isRolling) return;
    if (!combat.id || !combat.combatants) {
      console.warn("[FASERIP WARN] Invalid combat state");
      return;
    }
    this.isRolling = true;

    try {
      // Categorize combatants
      const pcCombatants = [];
      const npcCombatants = [];
      for (const c of combat.combatants) {
        const side = this._getCombatantSide(c);
        (side === "pc" ? pcCombatants : npcCombatants).push(c);
      }

      // Highest Intuition per side
      const pcHighest = this._getHighestIntuition(pcCombatants);
      const npcHighest = this._getHighestIntuition(npcCombatants);

      // Intuition modifiers
      const pcMod = this._getModifierForIntuition(pcHighest.intuition);
      const npcMod = this._getModifierForIntuition(npcHighest.intuition);

      // Talent bonuses (highest on each side)
      const pcTalent = this._getHighestTalentBonus(pcCombatants);
      const npcTalent = this._getHighestTalentBonus(npcCombatants);

      // Roll
      const pcRoll = await (new Roll("1d10")).evaluate();
      const npcRoll = await (new Roll("1d10")).evaluate();

      // Totals: roll of 1 is always 1
      const pcTotal = pcRoll.total === 1 ? 1 : pcRoll.total + pcMod + pcTalent.bonus;
      const npcTotal = npcRoll.total === 1 ? 1 : npcRoll.total + npcMod + npcTalent.bonus;

      // Determine winner
      let goesFirst;
      if (pcTotal > npcTotal) goesFirst = "pc";
      else if (npcTotal > pcTotal) goesFirst = "npc";
      else {
        // Tie — reroll
        ChatMessage.create({
          user: game.user.id,
          speaker: ChatMessage.getSpeaker({ alias: "Initiative" }),
          content: `<div class="faserip-initiative-tie">Initiative Tie (${pcTotal} vs ${npcTotal})! Rerolling...</div>`,
          flavor: "Initiative Tie"
        });
        this.isRolling = false;
        setTimeout(() => this.rollSideInitiative(combat), 1000);
        return;
      }

      // Store flags
      await combat.update({
        "flags.msh-faserip.pcInitiative": pcTotal,
        "flags.msh-faserip.npcInitiative": npcTotal,
        "flags.msh-faserip.pcModifier": pcMod,
        "flags.msh-faserip.npcModifier": npcMod,
        "flags.msh-faserip.pcRoll": pcRoll.total,
        "flags.msh-faserip.npcRoll": npcRoll.total,
        "flags.msh-faserip.goesFirst": goesFirst,
        "flags.msh-faserip.pcHighestName": pcHighest.name,
        "flags.msh-faserip.npcHighestName": npcHighest.name,
        "flags.msh-faserip.pcTalentBonus": pcTalent.bonus,
        "flags.msh-faserip.npcTalentBonus": npcTalent.bonus,
        "flags.msh-faserip.pcTalentSource": pcTalent.source,
        "flags.msh-faserip.npcTalentSource": npcTalent.source
      });

      // 3D dice
      if (game.dice3d) {
        await game.dice3d.showForRoll(pcRoll, game.user, true);
        await game.dice3d.showForRoll(npcRoll, game.user, true);
      }

      // Assign tracker initiative values
      const winnerInit = goesFirst === "pc" ? pcTotal : npcTotal;
      const loserInit = goesFirst === "pc" ? npcTotal : pcTotal;
      const winningSide = goesFirst === "pc" ? pcCombatants : npcCombatants;
      const losingSide = goesFirst === "pc" ? npcCombatants : pcCombatants;

      const ops = [];
      for (const c of winningSide) ops.push(combat.setInitiative(c.id, winnerInit));
      for (const c of losingSide) ops.push(combat.setInitiative(c.id, loserInit));
      await Promise.all(ops);

      // Ensure side flags
      await this._ensureSideFlags(combat);

      // Chat card
      await this._postSideInitiativeCard(combat, {
        pcRoll: pcRoll.total, npcRoll: npcRoll.total,
        pcMod, npcMod, pcTotal, npcTotal, goesFirst,
        pcHighest, npcHighest, pcTalent, npcTalent
      });

      // Transition to pre-action phase (RAW mode)
      if (game.settings.get("msh-faserip", "useRawTurnPhases")) {
        await this._setPhase(combat, this.PHASE_PREACTION);
      }

      // Set turn to first winner
      await combat.setupTurns();
      const turnIndex = this._findFirstWinnerTurn(combat, goesFirst);
      await combat.update({ turn: turnIndex });

      // Highlight
      setTimeout(() => {
        try {
          ui.combat?.scrollToTurn?.();
          const firstId = combat.turns[turnIndex]?.id;
          const root = ui.combat?.element;
          if (root && firstId) {
            const target = (root.find ? root.find(`[data-combatant-id="${firstId}"]`)?.[0] : root.querySelector(`[data-combatant-id="${firstId}"]`));
            if (target) {
              target.classList.add("faserip-highlight");
              setTimeout(() => target.classList.remove("faserip-highlight"), 1000);
            }
          }
        } catch (e) { /* noop */ }
      }, 100);

      ui.combat?.render(true);

    } catch (error) {
      console.error("[FASERIP ERROR] Initiative:", error);
      ui.notifications.error("Failed to roll FASERIP initiative. Check console.");
    } finally {
      this.isRolling = false;
    }
  }

  // --- Individual FASERIP Initiative ---

  static async rollIndividualInitiative(combat, ids) {
    if (!game.user.isGM || !combat || this.isRolling) return;
    this.isRolling = true;

    try {
      // If no ids specified, roll for all combatants
      const combatantIds = ids?.length ? ids : combat.combatants.map(c => c.id);
      const results = [];

      for (const id of combatantIds) {
        const c = combat.combatants.get(id);
        if (!c?.actor) continue;

        const eff = this._getEffectiveIntuition(c);
        const intMod = this._getModifierForIntuition(eff.value);
        const talent = this._getInitiativeTalentBonus(c);
        const roll = await (new Roll("1d10")).evaluate();

        if (game.dice3d) {
          await game.dice3d.showForRoll(roll, game.user, true);
        }

        const total = roll.total === 1 ? 1 : roll.total + intMod + talent.bonus;
        await combat.setInitiative(c.id, total);

        results.push({
          name: c.name,
          actorId: c.actor?.id,
          roll: roll.total,
          intMod,
          intSource: eff.source,
          talentBonus: talent.bonus,
          talentSource: talent.source,
          total,
          side: this._getCombatantSide(c)
        });
      }

      // Ensure side flags
      await this._ensureSideFlags(combat);

      // Chat card
      await this._postIndividualInitiativeCard(combat, results);

      // Transition to pre-action phase (RAW mode)
      if (game.settings.get("msh-faserip", "useRawTurnPhases")) {
        await this._setPhase(combat, this.PHASE_PREACTION);
      }

      // Set turn to highest initiative combatant
      await combat.setupTurns();
      const turnIndex = combat.turns.length ? 0 : -1;
      if (turnIndex >= 0) {
        await combat.update({ turn: turnIndex });
        setTimeout(() => {
          try {
            ui.combat?.scrollToTurn?.();
            const firstId = combat.turns[turnIndex]?.id;
            const root = ui.combat?.element;
            if (root && firstId) {
              const target = (root.find ? root.find(`[data-combatant-id="${firstId}"]`)?.[0] : root.querySelector(`[data-combatant-id="${firstId}"]`));
              if (target) {
                target.classList.add("faserip-highlight");
                setTimeout(() => target.classList.remove("faserip-highlight"), 1000);
              }
            }
          } catch (e) { /* noop */ }
        }, 100);
      }
      ui.combat?.render(true);

    } catch (error) {
      console.error("[FASERIP ERROR] Individual initiative:", error);
      ui.notifications.error("Failed to roll individual initiative. Check console.");
    } finally {
      this.isRolling = false;
    }
  }

  // --- Helpers ---

  static _getHighestIntuition(combatants) {
    let best = { name: "None", intuition: 0, source: "Int" };
    for (const c of combatants) {
      const eff = this._getEffectiveIntuition(c);
      if (eff.value > best.intuition) {
        best = { name: c.name, intuition: eff.value, source: eff.source };
      }
    }
    return best;
  }

  static _getHighestTalentBonus(combatants) {
    let best = { bonus: 0, source: "" };
    for (const c of combatants) {
      const t = this._getInitiativeTalentBonus(c);
      if (t.bonus > best.bonus) best = t;
    }
    return best;
  }

  static _findFirstWinnerTurn(combat, goesFirst) {
    const toNum = v => Number(v ?? -1);
    const maxInit = Math.max(...combat.turns.map(t => toNum(t.initiative)));
    let idx = combat.turns.findIndex(t => {
      const c = combat.combatants.get(t.id);
      return c && this._getCombatantSide(c) === goesFirst && toNum(t.initiative) === maxInit;
    });
    return idx < 0 ? 0 : idx;
  }

  static async _ensureSideFlags(combat) {
    const updates = [];
    for (const c of combat.combatants) {
      const correct = this._determineSide(c);
      if (c.getFlag("msh-faserip", "side") !== correct) {
        updates.push({ _id: c.id, "flags.msh-faserip.side": correct });
      }
    }
    if (updates.length) await combat.updateEmbeddedDocuments("Combatant", updates);
  }

  // --- Chat Cards ---

  // Handle tracker and chat card pre-action button clicks
  static async _onTrackerActionButton(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    const btn = ev.currentTarget;
    const action = btn.dataset.action;
    const actorId = btn.dataset.actorId;
    const combatantId = btn.dataset.combatantId;

    const actor = game.actors.get(actorId);
    if (!actor) return ui.notifications.warn("Actor not found");

    if (!actor.isOwner && !game.user.isGM) {
      return ui.notifications.warn("You don't have permission to act for this character");
    }

    if (action === "declare") {
      await this._showDeclarationDialog(actor, combatantId);
    } else if (action === "change-action") {
      await this._rollChangeAction(actor);
    } else {
      // Defensive pre-action: dodging, evading, blocking
      await ActionDispatcher.roll(action, {
        actor,
        abilityName: action === "dodging" ? "agility" : action === "blocking" ? "strength" : "fighting",
        opts: { actionType: action }
      });
    }
  }

  // Legacy chat card handler — delegates to tracker handler
  static async _onPreActionButton(ev) {
    return this._onTrackerActionButton(ev);
  }

  // Declaration dialog: Attack, Defend, Other, Multi-Action
  static async _showDeclarationDialog(actor, combatantId) {
    const combat = game.combat;
    if (!combat) return;
    const combatant = combat.combatants.get(combatantId);
    if (!combatant) return;

    // Recall last declaration type and note for auto-fill
    const lastType = combatant.getFlag("msh-faserip", "lastDeclaredType") || "attack";
    const lastNote = combatant.getFlag("msh-faserip", "lastDeclaredNote") || "";
    const chk = (v) => v === lastType ? "checked" : "";

    const choice = await new Promise(resolve => {
      new Dialog({
        title: `Declare Action: ${actor.name}`,
        content: `
          <div style="padding:4px 0;">
            <div style="display:flex;flex-direction:column;gap:6px;">
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="radio" name="declaration" value="attack" ${chk("attack")}/>
                <i class="fas fa-fist-raised" style="width:16px;"></i> <strong>Attack</strong>
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="radio" name="declaration" value="defend" ${chk("defend")}/>
                <i class="fas fa-shield-alt" style="width:16px;"></i> <strong>Defend</strong>
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="radio" name="declaration" value="other" ${chk("other")}/>
                <i class="fas fa-ellipsis-h" style="width:16px;"></i> <strong>Other</strong>
                <span style="color:#666;font-size:0.85em;">(move, talk, item, etc.)</span>
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="radio" name="declaration" value="multi" ${chk("multi")}/>
                <i class="fas fa-burst" style="width:16px;color:#1E90FF;"></i> <strong>Multi-Action</strong>
                <span style="color:#666;font-size:0.85em;">(Fighting FEAT required)</span>
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="radio" name="declaration" value="charge" ${chk("charge")}/>
                <i class="fas fa-bolt" style="width:16px;color:#cc7a00;"></i> <strong>Charge</strong>
                <span style="color:#666;font-size:0.85em;">(full move; no half-move penalty)</span>
              </label>
            </div>
            <div style="margin-top:8px;">
              <label style="font-size:0.85em;color:#666;">Notes (optional):</label>
              <input type="text" name="note" value="${lastNote.replace(/"/g, '&quot;')}" placeholder="e.g. punch Rhino, web to rooftop..." style="width:100%;padding:3px 6px;box-sizing:border-box;"/>
            </div>
          </div>
        `,
        buttons: {
          declare: {
            icon: '<i class="fas fa-check"></i>',
            label: "Declare",
            callback: (html) => {
              const type = html.find('[name="declaration"]:checked').val();
              const note = html.find('[name="note"]').val()?.trim() || "";
              resolve({ type, note });
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "declare"
      }).render(true);
    });
    if (!choice) return;

    const labels = { attack: "⚔ Attack", defend: "🛡 Defend", other: "… Other", multi: "⚔×2 Multi", charge: "⚡ Charge" };
    const label = labels[choice.type] || choice.type;

    // Save declaration on combatant — players can't modify Combatant docs directly
    const flagData = {
      lastDeclaredType: choice.type,
      lastDeclaredNote: choice.note,
      declaredAction: { type: choice.type, label, note: choice.note }
    };
    if (game.user.isGM) {
      await combatant.setFlag("msh-faserip", "lastDeclaredType", choice.type);
      await combatant.setFlag("msh-faserip", "lastDeclaredNote", choice.note);
      await combatant.setFlag("msh-faserip", "declaredAction", { type: choice.type, label, note: choice.note });
    } else if (game.msh?.runAsGM) {
      await game.msh.runAsGM({
        operation: "setCombatantFlags",
        combatantId: combatant.id,
        flags: flagData
      });
    } else {
      ui.notifications.warn("Cannot save declaration — no GM connection available.");
    }

    // Post to chat
    const noteStr = choice.note ? ` — <em>${choice.note}</em>` : "";
    await ChatMessage.create({
      user: game.user.id,
      content: `<div class="faserip-declaration-card">
        <strong>${actor.name}</strong> declares: ${label}${noteStr}
        ${choice.type === "multi" ? `<div style="font-size:0.85em;color:#666;margin-top:2px;">Fighting FEAT will be rolled when attack is executed.</div>` : ""}
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor })
    });

    ui.combat?.render(true);
  }

  // Change Action: Yellow Agility FEAT, -1CS on subsequent actions this turn
  // RAW: requires Yellow result on Agility FEAT. Resolved in pre-action phase.
  static async _rollChangeAction(actor) {
    await ChatMessage.create({
      user: game.user.id,
      content: `<div class="faserip-change-action-result">
        <strong>${actor.name}</strong> attempts to change action.
        <em>Requires Yellow Agility FEAT. If successful, all subsequent FEATs this turn are at -1CS.</em>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor })
    });
    // Open proper Agility FEAT dialog — player sets intensity to match the Yellow requirement
    await showAbilityFeatDialog(actor, "agility");
  }

  // Build collapsible turn phase step list
  static _buildStepList(combat, goesFirst) {
    const showPhase = game.settings.get("msh-faserip", "showPhaseReminder");
    if (!showPhase) return "";

    const rawPhases = game.settings.get("msh-faserip", "useRawTurnPhases");
    const labels = this._getSideLabels();
    const winner = goesFirst === "pc" ? labels.pc : labels.npc;
    const loser = goesFirst === "pc" ? labels.npc : labels.pc;

    let steps;
    if (rawPhases) {
      steps = [
        "Judge plans NPC actions",
        "Players declare actions (Attack / Defend / Other / Multi-Action)",
        "Roll Initiative",
        "Pre-Action — Dodge / Block / Evade / Change Action",
        `${winner} act`,
        `${loser} act`
      ];
    } else {
      steps = [
        "Initiative (above)",
        `${winner} act`,
        `${loser} act`
      ];
    }

    const stepHtml = steps.map((s, i) => `<div class="faserip-step">${i + 1}. ${s}</div>`).join("");
    return `
    <div class="faserip-steps-section">
      <div class="faserip-steps-toggle"><span class="faserip-steps-arrow">▸</span> Turn Sequence</div>
      <div class="faserip-steps-list" style="display:none;">${stepHtml}</div>
    </div>`;
  }

  // Build individual mode step list (no sides)
  static _buildIndividualStepList() {
    const showPhase = game.settings.get("msh-faserip", "showPhaseReminder");
    if (!showPhase) return "";

    const rawPhases = game.settings.get("msh-faserip", "useRawTurnPhases");

    let steps;
    if (rawPhases) {
      steps = [
        "Judge plans NPC actions",
        "Players declare actions (Attack / Defend / Other / Multi-Action)",
        "Roll Initiative",
        "Pre-Action — Dodge / Block / Evade / Change Action",
        "Actions in initiative order"
      ];
    } else {
      steps = [
        "Initiative (above)",
        "Actions in initiative order"
      ];
    }

    const stepHtml = steps.map((s, i) => `<div class="faserip-step">${i + 1}. ${s}</div>`).join("");
    return `
    <div class="faserip-steps-section">
      <div class="faserip-steps-toggle"><span class="faserip-steps-arrow">▸</span> Turn Sequence</div>
      <div class="faserip-steps-list" style="display:none;">${stepHtml}</div>
    </div>`;
  }

  static async _postSideInitiativeCard(combat, d) {
    const labels = this._getSideLabels();
    const roundInfo = combat.round ? `Round ${combat.round}` : "Combat Start";

    const pcLine = this._buildSideLine(labels.pc, d.pcRoll, d.pcMod, d.pcHighest.name, d.pcHighest.source, d.pcTalent, d.pcTotal, d.goesFirst === "pc");
    const npcLine = this._buildSideLine(labels.npc, d.npcRoll, d.npcMod, d.npcHighest.name, d.npcHighest.source, d.npcTalent, d.npcTotal, d.goesFirst === "npc");
    const stepsHtml = this._buildStepList(combat, d.goesFirst);

    const content = `
  <div class="faserip-initiative-result">
    <div class="faserip-init-header">${roundInfo}</div>
    <div class="faserip-init-rows">
      ${pcLine}
      ${npcLine}
    </div>
    ${stepsHtml}
  </div>`;

    await ChatMessage.create({
      user: game.user.id, content,
      speaker: ChatMessage.getSpeaker({ alias: "Initiative" }),
      flavor: `${roundInfo} — Initiative`,
      sound: CONFIG.sounds.dice
    });
  }

  static _buildSideLine(label, roll, intMod, intName, intSource, talent, total, isWinner) {
    const modParts = [];
    let hasMods = false;
    if (roll === 1) {
      if (intMod > 0 || talent.bonus > 0) {
        modParts.push(`<span class="mod-cancelled">${this._modStr(intMod, intName, intSource, talent)}</span> <em>nat 1</em>`);
        hasMods = true;
      }
    } else {
      const s = this._modStr(intMod, intName, intSource, talent);
      if (s) { modParts.push(s); hasMods = true; }
    }
    const modHtml = modParts.length ? `<span class="init-mods">${modParts.join(" ")}</span>` : "";
    const formula = hasMods
      ? `${roll} ${modHtml} = <strong>${total}</strong>`
      : `<strong>${total}</strong>`;
    const star = isWinner ? `<span class="init-winner" title="Acts First">★</span>` : "";
    return `<div class="init-row ${isWinner ? 'winner' : 'loser'}">
      <span class="init-label">${label}</span>
      <span class="init-formula">${formula}</span>
      ${star}
    </div>`;
  }

  static _modStr(intMod, intName, intSource, talent) {
    const parts = [];
    if (intMod > 0) {
      const sourceTag = intSource && intSource !== "Int" ? ` [${intSource}]` : "";
      parts.push(`+${intMod} ${intName}${sourceTag}`);
    }
    if (talent.bonus > 0) parts.push(`+${talent.bonus} ${talent.source}`);
    return parts.join(" ");
  }

  static async _postIndividualInitiativeCard(combat, results) {
    const roundInfo = combat.round ? `Round ${combat.round}` : "Combat Start";

    results.sort((a, b) => b.total - a.total);

    let rows = "";
    for (const r of results) {
      let modHtml = "";
      let hasMods = false;
      if (r.roll === 1 && (r.intMod > 0 || r.talentBonus > 0)) {
        const parts = [];
        if (r.intMod > 0) parts.push(`+${r.intMod}`);
        if (r.talentBonus > 0) parts.push(`+${r.talentBonus}`);
        modHtml = `<span class="mod-cancelled">${parts.join(" ")}</span> <em>nat 1</em>`;
        hasMods = true;
      } else {
        const parts = [];
        if (r.intMod > 0) {
          const srcLabel = r.intSource && r.intSource !== "Int" ? r.intSource : "Int";
          parts.push(`+${r.intMod} ${srcLabel}`);
        }
        if (r.talentBonus > 0) parts.push(`+${r.talentBonus} ${r.talentSource}`);
        if (parts.length) { modHtml = parts.join(" "); hasMods = true; }
      }
      const formula = hasMods
        ? `${r.roll} <span class="init-mods">${modHtml}</span> = <strong>${r.total}</strong>`
        : `<strong>${r.total}</strong>`;

      rows += `<tr class="${r.side}-side-row">
        <td class="init-name">${r.name}</td>
        <td class="init-formula">${formula}</td>
      </tr>`;
    }

    const stepsHtml = this._buildIndividualStepList();

    const content = `
  <div class="faserip-initiative-result faserip-individual">
    <div class="faserip-init-header">${roundInfo}</div>
    <table class="faserip-init-table">
      <tbody>${rows}</tbody>
    </table>
    ${stepsHtml}
  </div>`;

    await ChatMessage.create({
      user: game.user.id, content,
      speaker: ChatMessage.getSpeaker({ alias: "Initiative" }),
      flavor: `${roundInfo} — Initiative`,
      sound: CONFIG.sounds.dice
    });
  }
}