// faserip-initiative.js v2.6.0 - 2026-08-21
// v2.6.0: Fix stale tracker DOM under v14 partial re-renders (bars/chips are now
//         rebuilt every render instead of skip-if-exists — root cause of round-2
//         DECLARATION showing round-1 initiative and Pre-Action controls).
//         Replace deprecated "-=" flag deletions with null writes (v14 warning).
//         Default undeclared combatants to Attack at initiative roll; declaration
//         is optional. Focus the winning side's lead combatant after initiative.
//         Add debugMode-gated tracker logging. Guard rolls before combat start.
// faserip-initiative.js v2.5.2 - 2026-08-21
// v2.5.2: Remove dead chat pre-action button wiring, dead _positionTurnToSide,
//         and duplicate _findFirstWinnerTurn (folded into _firstEligibleTurnIndexForSide).
// faserip-initiative.js v2.5.1 - 2026-08-21
// v2.5.1: Make Pre-Action close an atomic phase+cursor update and carry unchanged
//         declarations forward between rounds so Initiative itself confirms them.
// faserip-initiative.js v2.5.0 - 2026-08-21
// v2.5.0: Deterministic RAW combat state machine: explicit Pre-Action close,
//         phase/side-gated movement, consumed combat actions, clean initiative reset,
//         eligible cursor positioning, and bulk private NPC planning.
// faserip-initiative.js v2.4.0 - 2026-08-21
// v2.4.0: RAW declaration/pre-action workflow: declaration-gated initiative,
//         conditional MA-E/Weapon Specialist initiative, locked pre-action FEATs,
//         real Change Action Yellow Agility FEAT + -1CS effect, private NPC intent,
//         action-side positioning/back controls, and clearer tracker dashboard.
// faserip-initiative.js v2.3.2 - 2026-08-20
// v2.3.2: Initiative cursor positioning is marked mshNoTimeAdvance so CTT
//         Per Combatant Turn mode does not treat phase setup as elapsed time.
// faserip-initiative.js v2.3.1 - 2026-06-25
// v2.3.1: Set a speaker on all initiative chat cards (side/individual/tie). Speaker-less
//         messages left the header sender empty, collapsing the metadata column and
//         wrapping the timestamp/delete one char per line (malformed card header).

import { ActionDispatcher } from "./modules/actions/action-dispatcher.js";
import { showAbilityFeatDialog } from "./modules/actions/ability-feat-dialog.js";
import { getInitiativeModifier } from "./rules/rules-reference.js";
import { authorizeRawMovement, getPreActionRequirement, canClosePreAction } from "./rules/raw-combat-state.js";

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

  static _dbg(...args) {
    try { if (!game.settings.get("msh-faserip", "debugMode")) return; } catch { return; }
    console.log("[FASERIP:TRACKER]", ...args);
  }

  static _getPhase(combat) {
    if (!game.settings.get("msh-faserip", "useRawTurnPhases")) return this.PHASE_ACTIONS;
    // Before encounter begins (round 0), no phase applies
    if (!combat?.round) return null;
    return combat?.getFlag("msh-faserip", "turnPhase") ?? this.PHASE_DECLARE;
  }

  static async _setPhase(combat, phase) {
    if (!combat) return false;
    await combat.update({ "flags.msh-faserip.turnPhase": phase }, { mshNoTimeAdvance: true });
    ui.combat?.render(true);
    return this._getPhase(combat) === phase;
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
    if (game.settings.get("msh-faserip", "initiativeMode") === this.MODE_FOUNDRY) return null;
    const combat = game.combat;
    if (!combat?.started) return null;
    const tokenId = token?.id ?? token?.document?.id;
    if (!tokenId) return null;
    const combatant = this._findTrackedCombatantForToken(combat, token?.document ?? token);
    if (!combatant) return null;
    const decl = combatant.getFlag("msh-faserip", "declaredAction");
    const type = decl?.type || "attack"; // declarations are optional; Attack is the default

    // Move Only and Charge permit full movement. Other actions taken while
    // moving cap movement at half speed. A successfully rolled Dodge already
    // supplies movementMult=0.5 via its Active Effect, so do not multiply the
    // same RAW half-speed cap a second time (the old quarter-speed bug).
    if (type === "move" || type === "charge") return 1;
    if (type === "dodge") {
      const hasDodgeEffect = combatant.actor?.effects?.some(e => !e.disabled && e.getFlag?.("msh-faserip", "isDodging"));
      return hasDodgeEffect ? null : 0.5;
    }
    return 0.5;
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
      hint: "Automatically reroll initiative at the start of each new round when RAW Turn Phases are off. With RAW phases on, the next round waits for declarations before initiative is rolled.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register("msh-faserip", "showPhaseReminder", {
      name: "Show Turn Phase Reminder",
      hint: "Show the turn sequence (Declaration → Initiative → Pre-Action → Actions) on initiative chat cards.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register("msh-faserip", "useTalentInitBonuses", {
      name: "Apply Talent Initiative Bonuses",
      hint: "Include Martial Arts E (+1 when unarmed) and Weapons Specialist (+1 with the specialty weapon). With RAW declarations enabled, the declared attack context controls whether the bonus applies.",
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
      hint: "When enabled, intended actions are declared before initiative. Dodge, Block, Evade, and 2/3 Multiple Attacks generate locked Pre-Action FEATs; changing a declaration requires a Yellow Agility FEAT and applies -1CS to subsequent FEATs. When disabled, actions use the legacy on-demand workflow.",
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

      this._dbg("renderCombatTracker", {
        round: combat.round, turn: combat.turn, started: combat.started,
        phase: this._getPhase(combat), goesFirst: combat.getFlag("msh-faserip", "goesFirst"),
        combatants: combat.turns?.length ?? 0
      });

      // Side coloring on combatant rows (both modes)
      this._modifyCombatantDisplay_native(root, combat);

      // Initiative bar (side mode only). v14 partial re-renders can leave a
      // previously injected bar in place; always rebuild from current flags so
      // the bar can never display a prior round's rolls.
      if (this._isSideMode()) {
        root.querySelector(".faserip-initiative-bar")?.remove();
        const data = this._getFlagData(combat);
        if (this._hasCompleteData(data)) {
          this._dbg("initiative bar", data);
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
        this._dbg("combatRound: RAW reset to Declaration", { round: combat.round });
        await this._setPhase(combat, this.PHASE_DECLARE);
        // Clear only state that is truly scoped to the completed round. The
        // intended action is deliberately retained. At the table, an unchanged
        // declaration need not be re-entered every six seconds; clicking Initiative
        // confirms the carried-forward plans. Any combatant may still edit the plan
        // during Declaration, and Change Action remains the RAW route after Initiative.
        // Round-scoped flags are written as null (not "-=" deletions, which v14
        // deprecates); every reader already treats null as absent.
        const clearOps = this._trackedCombatants(combat).map(c => ({
          _id: c.id,
          initiative: null,
          "flags.msh-faserip.preActionResolved": null,
          "flags.msh-faserip.changeActionAttempted": null,
          "flags.msh-faserip.actionState": null
        }));
        if (clearOps.length) await combat.updateEmbeddedDocuments("Combatant", clearOps);
        await combat.update({
          "flags.msh-faserip.pcInitiative": null,
          "flags.msh-faserip.npcInitiative": null,
          "flags.msh-faserip.pcModifier": null,
          "flags.msh-faserip.npcModifier": null,
          "flags.msh-faserip.pcRoll": null,
          "flags.msh-faserip.npcRoll": null,
          "flags.msh-faserip.goesFirst": null,
          "flags.msh-faserip.pcHighestName": null,
          "flags.msh-faserip.npcHighestName": null,
          "flags.msh-faserip.pcTalentBonus": null,
          "flags.msh-faserip.npcTalentBonus": null,
          "flags.msh-faserip.pcTalentSource": null,
          "flags.msh-faserip.npcTalentSource": null
        }, { mshNoTimeAdvance: true });
        this._dbg("combatRound: cleared", { combatants: clearOps.length });
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

    // RAW phases govern movement as well as attack dialogs. Normal token drags
    // are denied until the correct action phase/side is active. System/GM code
    // may opt out explicitly with {mshRawMovementBypass:true} for forced/admin moves.
    Hooks.on("preMoveToken", (tokenDoc, _movement, operation = {}) => {
      if (operation?.mshRawMovementBypass) return;
      const verdict = this.authorizeTokenMovement(tokenDoc);
      if (verdict.ok) return;
      ui.notifications?.warn?.(verdict.message);
      return false;
    });

    // Chat card handlers
    Hooks.on("renderChatMessageHTML", (msg, html) => {
      const root = html instanceof HTMLElement ? html : html[0] ?? html;
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
    return data.pcInit != null && data.npcInit != null &&
      data.goesFirst != null && data.pcRoll != null &&
      data.npcRoll != null;
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

    const talents = actor.items.filter(i => i.type === "talent");
    const hasMAE = talents.some(t => /martial arts\s*[- ]?e/i.test(`${t.name} ${t.system?.specialty || ""}`));
    const hasWpnSpec = talents.some(t => /weapons? specialist/i.test(`${t.name} ${t.system?.specialty || ""}`));
    if (!hasMAE && !hasWpnSpec) return { bonus: 0, source: "" };

    const rawPhases = game.settings.get("msh-faserip", "useRawTurnPhases");
    if (!rawPhases) {
      // Legacy/non-declaration mode cannot know the chosen attack context. Keep
      // the historical +1 benefit, but never stack MA-E and Weapon Specialist.
      const source = [hasMAE ? "MA-E" : "", hasWpnSpec ? "Wpn Spec" : ""].filter(Boolean).join("/");
      return { bonus: 1, source: `${source} (assumed)` };
    }

    const decl = combatant.getFlag("msh-faserip", "declaredAction");
    const q = decl?.qualifiers || {};
    const sources = [];
    if (hasMAE && q.unarmed === true) sources.push("MA-E");
    if (hasWpnSpec && q.weaponSpecialist === true) sources.push("Wpn Spec");

    // Both talents grant +1 initiative, but they describe mutually exclusive
    // contexts (unarmed vs specialist weapon). Never manufacture a +2 stack.
    return sources.length ? { bonus: 1, source: sources.join("/") } : { bonus: 0, source: "" };
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

    // Power-based initiative substitutions are independent of the Talent
    // Initiative Bonuses setting. Turning off talent bonuses must not disable
    // Combat Sense / Enhanced Senses.
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


  static _getHealthStatusBadgeData(actor) {
    if (!actor) return null;
    if (actor.system?.details?.isDead) return { label: "DEAD", cls: "dead", title: "Dead" };

    const effects = Array.from(actor.effects ?? []);
    const dying = effects.find(e => !e.disabled && (
      e.getFlag?.("msh-faserip", "isDying") ||
      e.flags?.["msh-faserip"]?.ongoingId === "dying" ||
      e.statuses?.has?.("dying")
    ));
    if (dying) {
      const rank = actor.system?.abilities?.endurance?.rank || "?";
      const original = dying.getFlag?.("msh-faserip", "originalEndurance") || actor.getFlag?.("msh-faserip", "originalEndurance") || rank;
      return {
        label: `DYING · ${rank}`,
        cls: rank === "Shift-0" ? "shift0" : "dying",
        title: `Dying: Endurance ${rank}${original !== rank ? ` of ${original}` : ""}. Loses another rank next FASERIP round unless stabilized.`
      };
    }

    const unconscious = effects.find(e => {
      if (e.disabled) return false;
      const n = (e.name || "").toLowerCase();
      return n.includes("unconscious") || n.includes("stunned") || e.statuses?.has?.("unconscious");
    });
    if (unconscious) {
      const d = unconscious.duration ?? {};
      let remain = null;
      if (Number.isFinite(d.remaining)) {
        const units = String(d.units || "").toLowerCase();
        remain = units === "seconds" ? Math.max(0, Math.ceil(d.remaining / 6)) : Math.max(0, Math.ceil(d.remaining));
      }
      return {
        label: remain != null ? `KO · ${remain}r` : "KO",
        cls: "unconscious",
        title: remain != null ? `Unconscious: ${remain} FASERIP round(s) remaining` : unconscious.name
      };
    }

    const hp = actor.system?.attributes?.health?.value ?? 1;
    if (hp <= 0) return { label: "STABLE · 0 HP", cls: "stable", title: "At 0 Health but not currently dying" };
    return null;
  }

  static _isInitiativeEligible(combatant) {
    const actor = combatant?.actor;
    if (!actor || combatant.defeated) return false;
    if (actor.system?.details?.isDead) return false;
    const hp = Number(actor.system?.attributes?.health?.value ?? 1);
    if (hp <= 0) return false;
    if (actor.system?.combatMods?.canAct === false) return false;
    const blocked = actor.effects?.some(e => {
      if (e.disabled) return false;
      const n = String(e.name || "").toLowerCase();
      if (n.includes("unconscious")) return true;
      if (e.statuses?.has?.("unconscious") || e.statuses?.has?.("dead")) return true;
      return (e.changes || []).some(ch => ch.key === "system.combatMods.canAct" && String(ch.value) === "false");
    });
    return !blocked;
  }

  // Combat.turns is the authoritative roster represented by Foundry's combat
  // tracker. Combat.combatants may transiently contain stale/non-turn documents
  // (for example after token/scene changes), which must never gate declarations
  // or contribute initiative.
  static _trackedCombatants(combat) {
    if (!combat) return [];
    const turns = Array.from(combat.turns ?? []);
    if (turns.length || combat.started) return turns.filter(c => c?.id && c?.actor);
    // Before a combat has started Foundry may not have built turns yet. Keep the
    // fallback conservative: only documents with a usable actor/token identity.
    return Array.from(combat.combatants ?? []).filter(c => c?.id && c?.actor && (!c.tokenId || c.token));
  }

  static _eligibleCombatants(combat) {
    return this._trackedCombatants(combat).filter(c => this._isInitiativeEligible(c));
  }

  static _findTrackedCombatantForToken(combat, tokenDoc) {
    if (!combat || !tokenDoc) return null;
    const tokenId = tokenDoc.id ?? tokenDoc.document?.id;
    if (!tokenId) return null;
    return this._trackedCombatants(combat).find(c => c.tokenId === tokenId) ?? null;
  }

  static authorizeTokenMovement(tokenDoc) {
    if (!game.settings.get("msh-faserip", "useRawTurnPhases")) return { ok: true };
    const initiativeMode = game.settings.get("msh-faserip", "initiativeMode");
    if (initiativeMode === this.MODE_FOUNDRY) return { ok: true };
    const combat = game.combat;
    if (!combat?.started) return { ok: true };
    const combatant = this._findTrackedCombatantForToken(combat, tokenDoc);
    if (!combatant) return { ok: true };
    if (!this._isInitiativeEligible(combatant)) return { ok: false, message: `${combatant.name} cannot currently act.` };
    return authorizeRawMovement({
      phase: this._getPhase(combat),
      initiativeMode,
      side: this._getCombatantSide(combatant),
      goesFirst: combat.getFlag("msh-faserip", "goesFirst"),
      declaration: combatant.getFlag("msh-faserip", "declaredAction"),
      actorName: combatant.name
    });
  }

  static _resolveCombatForCombatant(combatantId) {
    if (!combatantId) return game.combat ?? null;
    const viewed = ui.combat?.viewed;
    if (viewed?.combatants?.has?.(combatantId)) return viewed;
    if (game.combat?.combatants?.has?.(combatantId)) return game.combat;
    return game.combats?.find?.(c => c.combatants?.has?.(combatantId)) ?? null;
  }

  static _getPlayerDeclarationProgress(combat) {
    const all = this._eligibleCombatants(combat);
    const eligible = all.filter(c => c.actor?.hasPlayerOwner);
    const declared = eligible.filter(c => c.getFlag("msh-faserip", "declaredAction"));
    const npc = all.filter(c => !c.actor?.hasPlayerOwner);
    const npcDeclared = npc.filter(c => c.getFlag("msh-faserip", "declaredAction"));
    const missing = eligible.filter(c => !c.getFlag("msh-faserip", "declaredAction"));
    const npcMissing = npc.filter(c => !c.getFlag("msh-faserip", "declaredAction"));
    return {
      total: eligible.length,
      declared: declared.length,
      complete: declared.length >= eligible.length,
      missing,
      npcTotal: npc.length,
      npcDeclared: npcDeclared.length,
      npcMissing,
      allComplete: declared.length >= eligible.length && npcDeclared.length >= npc.length
    };
  }

  static _declarationMeta(type, data = {}) {
    const count = Number(data.attackCount || 2);
    const map = {
      move:   { label: "Move Only", short: "Move", icon: "fa-running" },
      attack: { label: "Attack", short: "Attack", icon: "fa-fist-raised" },
      charge: { label: "Charge", short: "Charge", icon: "fa-bolt" },
      dodge:  { label: "Dodge", short: "Dodge", icon: "fa-running" },
      block:  { label: "Block", short: "Block", icon: "fa-shield-alt" },
      evade:  { label: "Evade", short: "Evade", icon: "fa-eye-slash" },
      multi:  { label: `${count} Attacks`, short: `×${count} Attacks`, icon: "fa-burst" },
      other:  { label: "Other Action", short: "Other", icon: "fa-ellipsis-h" },
      defend: { label: "Defend (legacy)", short: "Defend", icon: "fa-shield-alt" }
    };
    return map[type] || { label: type || "Unknown", short: type || "?", icon: "fa-question" };
  }

  static _getPreActionRequirement(combatant) {
    const decl = combatant?.getFlag?.("msh-faserip", "declaredAction");
    const req = getPreActionRequirement(decl);
    if (!req) return null;
    const icons = { dodging: "fa-running", blocking: "fa-shield-alt", evading: "fa-eye-slash", multiattack: "fa-burst" };
    return { ...req, icon: icons[req.action] || "fa-dice" };
  }

  static _getPendingPreActions(combat) {
    return this._eligibleCombatants(combat).filter(c => {
      const req = this._getPreActionRequirement(c);
      if (!req) return false;
      const resolved = c.getFlag("msh-faserip", "preActionResolved");
      return !(resolved?.round === combat.round && resolved.action === req.action);
    });
  }

  static _esc(value) {
    try { return foundry.utils.escapeHTML(String(value ?? "")); }
    catch { return String(value ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
  }

  static async _setCombatantFlags(combatant, flags) {
    if (!combatant) return false;
    if (game.user.isGM) {
      const update = { _id: combatant.id };
      for (const [key, value] of Object.entries(flags)) update[`flags.msh-faserip.${key}`] = value;
      await combatant.parent.updateEmbeddedDocuments("Combatant", [update]);
      return true;
    }
    if (game.msh?.runAsGM) {
      await game.msh.runAsGM({ operation: "setCombatantFlags", combatId: combatant.parent?.id, combatantId: combatant.id, flags });
      return true;
    }
    ui.notifications.warn("Cannot update combat declaration — no GM connection available.");
    return false;
  }

  static async _clearCombatantFlag(combatant, flag) {
    if (!combatant) return;
    if (game.user.isGM) return combatant.unsetFlag("msh-faserip", flag);
    if (game.msh?.runAsGM) {
      return game.msh.runAsGM({ operation: "setCombatantFlags", combatId: combatant.parent?.id, combatantId: combatant.id, flags: { [flag]: null } });
    }
  }

  static _firstEligibleTurnIndexForSide(combat, side) {
    if (!combat?.turns?.length) return -1;
    return combat.turns.findIndex(t => {
      const c = combat.combatants.get(t.id) ?? t;
      return c && this._getCombatantSide(c) === side && this._isInitiativeEligible(c);
    });
  }

  static _firstEligibleTurnIndex(combat) {
    if (!combat?.turns?.length) return -1;
    return combat.turns.findIndex(t => this._isInitiativeEligible(combat.combatants.get(t.id) ?? t));
  }

  static async _setPhaseAndPosition(combat, phase) {
    if (!combat) return false;
    const goesFirst = combat.getFlag("msh-faserip", "goesFirst");
    const update = { "flags.msh-faserip.turnPhase": phase };

    let idx = -1;
    if (phase === this.PHASE_ACTIONS_WINNER && goesFirst) idx = this._firstEligibleTurnIndexForSide(combat, goesFirst);
    if (phase === this.PHASE_ACTIONS_LOSER && goesFirst) idx = this._firstEligibleTurnIndexForSide(combat, goesFirst === "pc" ? "npc" : "pc");
    if (phase === this.PHASE_ACTIONS) idx = this._firstEligibleTurnIndex(combat);
    if (idx >= 0) update.turn = idx;
    this._dbg("setPhaseAndPosition", { phase, goesFirst, turn: idx });

    // One atomic document update is important here. Calling setFlag() first can
    // rerender/destroy the live tracker button before the cursor write finishes.
    await combat.update(update, { mshNoTimeAdvance: true });
    ui.combat?.render(true);
    return this._getPhase(combat) === phase;
  }

  static async _advanceFromPreAction(combat) {
    if (!game.user.isGM || !combat) return false;
    const pending = this._getPendingPreActions(combat);
    const goesFirst = combat.getFlag("msh-faserip", "goesFirst");
    const verdict = canClosePreAction({
      phase: this._getPhase(combat),
      pendingCount: pending.length,
      initiativeMode: game.settings.get("msh-faserip", "initiativeMode"),
      goesFirst
    });
    if (!verdict.ok) {
      ui.notifications.warn(verdict.message);
      return false;
    }

    const target = this._isSideMode() ? this.PHASE_ACTIONS_WINNER : this.PHASE_ACTIONS;
    try {
      const changed = await this._setPhaseAndPosition(combat, target);
      if (!changed) throw new Error(`Combat phase remained ${this._getPhase(combat)} instead of ${target}`);
      return true;
    } catch (err) {
      console.error("[FASERIP ERROR] Could not close Pre-Action:", err);
      ui.notifications.error("Could not end Pre-Action. Check the console for details.");
      return false;
    }
  }

  static _hasTalent(actor, regex) {
    return !!actor?.items?.some(i => i.type === "talent" && regex.test(`${i.name} ${i.system?.specialty || ""}`));
  }

  static _modifyCombatantDisplay_native(root, combat) {
    const rawPhases = game.settings.get("msh-faserip", "useRawTurnPhases");
    const phase = this._getPhase(combat);
    const sideMode = this._isSideMode();
    const goesFirst = combat.getFlag("msh-faserip", "goesFirst");
    const labels = this._getSideLabels();
    const winnerLabel = goesFirst === "pc" ? labels.pc : labels.npc;
    const loserLabel = goesFirst === "pc" ? labels.npc : labels.pc;
    root.classList.toggle("faserip-raw-nonaction", !!(rawPhases && [this.PHASE_DECLARE, this.PHASE_PREACTION].includes(phase)));

    // RAW round dashboard. The phase bar is intentionally the primary control
    // surface so the GM does not need Foundry's individual-turn semantics to
    // run a side-based FASERIP round. Always rebuilt: v14 partial re-renders
    // can leave a stale bar (wrong phase, dead buttons) in the DOM.
    root.querySelector(".faserip-phase-bar")?.remove();
    if (rawPhases && phase) {
      this._dbg("phase bar", { phase, goesFirst, sideMode });
      const phaseLabels = {
        [this.PHASE_DECLARE]: "Declaration",
        [this.PHASE_PREACTION]: "Pre-Action",
        [this.PHASE_ACTIONS_WINNER]: `${winnerLabel} Act`,
        [this.PHASE_ACTIONS_LOSER]: `${loserLabel} Act`,
        [this.PHASE_ACTIONS]: "Actions"
      };
      const phaseColors = {
        [this.PHASE_DECLARE]: "#1E90FF",
        [this.PHASE_PREACTION]: "#9a7412",
        [this.PHASE_ACTIONS_WINNER]: "#006400",
        [this.PHASE_ACTIONS_LOSER]: "#8B4513",
        [this.PHASE_ACTIONS]: "#006400"
      };

      const bar = document.createElement("div");
      bar.className = "faserip-phase-bar";
      bar.style.cssText = `background:${phaseColors[phase] || "#006400"}; color:#fff;`;
      const labelWrap = document.createElement("div");
      labelWrap.className = "faserip-phase-label";
      labelWrap.innerHTML = `<strong>${phaseLabels[phase] || "Actions"}</strong>`;

      if (phase === this.PHASE_DECLARE) {
        const prog = this._getPlayerDeclarationProgress(combat);
        const progress = document.createElement("span");
        progress.className = `faserip-declare-progress ${prog.complete ? "complete" : "pending"}`;
        const playerText = prog.total ? `${prog.declared}/${prog.total} player declarations` : "No player declarations required";
        progress.textContent = game.user.isGM && prog.npcTotal ? `${playerText} · NPC ${prog.npcDeclared}/${prog.npcTotal}` : playerText;
        const tips = ["Declarations are optional — anyone without one defaults to Attack when Initiative is rolled."];
        if (prog.missing.length) tips.push(`Defaulting to Attack: ${prog.missing.map(c => c.name).join(", ")}`);
        if (game.user.isGM && prog.npcMissing.length) tips.push(`NPCs defaulting to Attack: ${prog.npcMissing.map(c => c.name).join(", ")}`);
        progress.title = tips.join("\n");
        labelWrap.appendChild(progress);
      }
      bar.appendChild(labelWrap);

      const controls = document.createElement("div");
      controls.className = "faserip-phase-controls";

      if (game.user.isGM && phase === this.PHASE_DECLARE) {
        const prog = this._getPlayerDeclarationProgress(combat);
        if (prog.npcTotal) {
          const npcPlanBtn = document.createElement("button");
          npcPlanBtn.type = "button";
          npcPlanBtn.className = "faserip-phase-secondary-btn faserip-npc-plan-btn";
          npcPlanBtn.innerHTML = `<i class="fas fa-users-cog"></i> NPCs`;
          npcPlanBtn.title = prog.npcMissing.length ? `Plan ${prog.npcMissing.length} undeclared NPC(s) in bulk` : "Review/change private NPC plans";
          npcPlanBtn.addEventListener("click", async () => {
            const live = game.combats.get(combat.id) ?? game.combat;
            if (live) await this._showNpcPlanDialog(live);
          });
          controls.appendChild(npcPlanBtn);
        }

        const rollBtn = document.createElement("button");
        rollBtn.type = "button";
        rollBtn.className = "faserip-phase-advance-btn";
        rollBtn.innerHTML = `<i class="fas fa-dice"></i> Initiative`;
        rollBtn.title = prog.allComplete ? "Roll initiative" : "Roll initiative — undeclared combatants default to Attack";
        rollBtn.addEventListener("click", async () => {
          const live = game.combats.get(combat.id) ?? game.combat;
          if (!live) return ui.notifications.warn("No active combat.");
          if (this._isSideMode()) await this.rollSideInitiative(live);
          else await this.rollIndividualInitiative(live);
        });
        controls.appendChild(rollBtn);
      }

      if (game.user.isGM && phase === this.PHASE_PREACTION) {
        const pending = this._getPendingPreActions(combat);
        {
          const status = document.createElement("span");
          status.className = `faserip-preaction-progress ${pending.length ? "pending" : "complete"}`;
          status.textContent = pending.length ? `${pending.length} required roll${pending.length === 1 ? "" : "s"} pending` : "Required rolls complete · Change Action/Judge window remains open";
          status.title = pending.length ? pending.map(c => c.name).join(", ") : "The GM deliberately closes Pre-Action when optional Change Actions and Judge events are finished.";
          labelWrap.appendChild(status);
        }
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "faserip-phase-advance-btn";
        const beginLabel = sideMode ? winnerLabel : "Begin Actions";
        btn.innerHTML = `<i class="fas fa-play"></i> ${beginLabel}`;
        btn.title = pending.length ? "Resolve required Pre-Action FEATs first" : (sideMode ? `End Pre-Action and begin ${winnerLabel} actions` : "End Pre-Action and begin individual initiative order");
        btn.disabled = pending.length > 0;
        btn.addEventListener("click", async ev => {
          ev.preventDefault();
          ev.stopPropagation();
          const live = game.combats.get(combat.id) ?? game.combat;
          if (!live) return ui.notifications.warn("No active combat.");
          btn.disabled = true;
          const ok = await this._advanceFromPreAction(live);
          if (!ok && btn.isConnected) btn.disabled = false;
        });
        controls.appendChild(btn);
      }

      if (game.user.isGM && sideMode && phase === this.PHASE_ACTIONS_WINNER) {
        const back = document.createElement("button");
        back.type = "button";
        back.className = "faserip-phase-secondary-btn";
        back.innerHTML = `<i class="fas fa-arrow-left"></i>`;
        back.title = "Back to Pre-Action";
        back.addEventListener("click", async () => {
          const live = game.combats.get(combat.id) ?? game.combat;
          if (live) await this._setPhase(live, this.PHASE_PREACTION);
        });
        controls.appendChild(back);

        const btn = document.createElement("button");
        btn.className = "faserip-phase-advance-btn";
        btn.innerHTML = `<i class="fas fa-forward"></i> ${loserLabel}`;
        btn.title = `${winnerLabel} done; begin ${loserLabel} actions`;
        btn.addEventListener("click", async () => {
          const live = game.combats.get(combat.id) ?? game.combat;
          if (live) await this._setPhaseAndPosition(live, this.PHASE_ACTIONS_LOSER);
        });
        controls.appendChild(btn);
      }

      if (game.user.isGM && sideMode && phase === this.PHASE_ACTIONS_LOSER) {
        const back = document.createElement("button");
        back.type = "button";
        back.className = "faserip-phase-secondary-btn";
        back.innerHTML = `<i class="fas fa-arrow-left"></i>`;
        back.title = `Back to ${winnerLabel} actions`;
        back.addEventListener("click", async () => {
          const live = game.combats.get(combat.id) ?? game.combat;
          if (live) await this._setPhaseAndPosition(live, this.PHASE_ACTIONS_WINNER);
        });
        controls.appendChild(back);

        const endBtn = document.createElement("button");
        endBtn.type = "button";
        endBtn.className = "faserip-phase-advance-btn";
        endBtn.innerHTML = `<i class="fas fa-step-forward"></i> End Round`;
        endBtn.title = "Complete this FASERIP round and begin the next Declaration phase";
        endBtn.addEventListener("click", async () => {
          const live = game.combats.get(combat.id) ?? game.combat;
          if (live) await live.nextRound();
        });
        controls.appendChild(endBtn);
      }

      if (game.user.isGM && !sideMode && phase === this.PHASE_ACTIONS) {
        const back = document.createElement("button");
        back.type = "button";
        back.className = "faserip-phase-secondary-btn";
        back.innerHTML = `<i class="fas fa-arrow-left"></i>`;
        back.title = "Back to Pre-Action";
        back.addEventListener("click", async () => {
          const live = game.combats.get(combat.id) ?? game.combat;
          if (live) await this._setPhase(live, this.PHASE_PREACTION);
        });
        controls.appendChild(back);

        const endBtn = document.createElement("button");
        endBtn.type = "button";
        endBtn.className = "faserip-phase-advance-btn";
        endBtn.innerHTML = `<i class="fas fa-step-forward"></i> End Round`;
        endBtn.title = "Complete this round and begin the next Declaration phase";
        endBtn.addEventListener("click", async () => {
          const live = game.combats.get(combat.id) ?? game.combat;
          if (live) await live.nextRound();
        });
        controls.appendChild(endBtn);
      }

      if (controls.childElementCount) bar.appendChild(controls);
      const anchor = root.querySelector(".faserip-initiative-bar") || root.querySelector(".combat-sidebar-header") || root.querySelector(".directory-header") || root.querySelector("header");
      if (anchor?.parentElement) anchor.parentElement.insertBefore(bar, anchor.nextSibling);
    }

    for (const el of root.querySelectorAll(".combatant")) {
      const id = el.getAttribute("data-combatant-id");
      const c = combat.combatants.get(id);
      if (!c) continue;
      const side = this._getCombatantSide(c);
      el.classList.add(`${side}-side`);

      if (rawPhases && sideMode && (phase === this.PHASE_ACTIONS_WINNER || phase === this.PHASE_ACTIONS_LOSER) && goesFirst) {
        const activeSide = phase === this.PHASE_ACTIONS_WINNER ? goesFirst : (goesFirst === "pc" ? "npc" : "pc");
        if (side !== activeSide) el.classList.add("faserip-side-inactive");
      }

      // Always rebuild injected row content; stale chips from a prior phase
      // (e.g. Pre-Action Roll buttons surviving into Declaration) were caused
      // by skip-if-exists guards under v14 partial re-renders.
      el.querySelector(".faserip-health-status")?.remove();
      el.querySelector(".faserip-tracker-actions")?.remove();

      const healthStatus = this._getHealthStatusBadgeData(c.actor);
      if (healthStatus) {
        const badge = document.createElement("span");
        badge.className = `faserip-health-status ${healthStatus.cls}`;
        badge.textContent = healthStatus.label;
        badge.title = healthStatus.title;
        const statusAnchor = el.querySelector(".token-name") || el.querySelector(".combatant-name");
        if (statusAnchor) statusAnchor.after(badge); else el.appendChild(badge);
      }

      if (!rawPhases || !phase || !c.actor?.id) continue;
      const eligible = this._isInitiativeEligible(c);
      const canControl = game.user.isGM || c.actor.isOwner;
      const declared = c.getFlag("msh-faserip", "declaredAction");
      const meta = declared ? this._declarationMeta(declared.type, declared) : null;
      const container = document.createElement("div");
      container.className = "faserip-tracker-actions";

      const declarationChip = () => {
        if (!declared) return "";
        const isPrivateNPC = !game.user.isGM && !c.actor.hasPlayerOwner;
        if (isPrivateNPC) return `<span class="faserip-declaration-chip private" title="NPC action recorded privately"><i class="fas fa-lock"></i> Declared</span>`;
        const detail = declared.note ? `: ${this._esc(declared.note)}` : "";
        const carried = Number(declared.round ?? combat.round) < Number(combat.round ?? 0);
        const carryText = carried ? " · carried from prior round; edit only if the plan changes" : "";
        const defaultText = declared.defaulted ? " · default action (nothing was declared)" : "";
        const carryClass = carried ? " carried" : "";
        const shortLabel = declared.defaulted ? `${this._esc(meta.short)}*` : this._esc(meta.short);
        return `<span class="faserip-declaration-chip faserip-decl-${declared.type}${carryClass}" title="${this._esc(meta.label + detail + carryText + defaultText)}"><i class="fas ${meta.icon}"></i> ${shortLabel}</span>`;
      };

      if (!eligible) {
        container.innerHTML = `<span class="faserip-declaration-chip ineligible" title="Cannot currently act">No Action</span>`;
      } else if (phase === this.PHASE_DECLARE) {
        if (declared) {
          container.innerHTML = declarationChip();
          if (canControl) container.innerHTML += `<button class="faserip-tracker-ctrl faserip-edit-declare" data-action="declare" data-actor-id="${c.actor.id}" data-combatant-id="${c.id}" title="Edit declaration before initiative"><i class="fas fa-pen"></i></button>`;
        } else {
          container.innerHTML = `<span class="faserip-declaration-chip faserip-decl-attack defaulted" title="No declaration recorded — defaults to Attack when Initiative is rolled"><i class="fas fa-fist-raised"></i> Attack*</span>`;
          if (canControl) container.innerHTML += `<button class="faserip-tracker-ctrl faserip-declare-btn" data-action="declare" data-actor-id="${c.actor.id}" data-combatant-id="${c.id}" title="Declare a different action (optional; Attack is assumed)"><i class="fas fa-pen"></i></button>`;
        }
      } else if (phase === this.PHASE_PREACTION) {
        container.innerHTML = declarationChip();
        const requirement = this._getPreActionRequirement(c);
        const resolved = c.getFlag("msh-faserip", "preActionResolved");
        const resolvedThisRound = resolved?.round === combat.round && (!requirement || resolved.action === requirement.action);
        if (requirement && canControl) {
          if (resolvedThisRound) {
            const result = String(resolved.result || "done").toUpperCase();
            container.innerHTML += `<span class="faserip-preaction-result ${resolved.success === false ? "failed" : "success"}" title="Pre-Action FEAT resolved">${this._esc(requirement.label)}: ${this._esc(result)}</span>`;
          } else {
            container.innerHTML += `<button class="faserip-tracker-ctrl faserip-required-roll" data-action="${requirement.action}" data-actor-id="${c.actor.id}" data-combatant-id="${c.id}" title="Required Pre-Action: ${this._esc(requirement.label)}"><i class="fas ${requirement.icon}"></i> <span>Roll</span></button>`;
          }
        } else if (!requirement && declared) {
          container.innerHTML += `<span class="faserip-preaction-none">No required roll</span>`;
        }

        const change = c.getFlag("msh-faserip", "changeActionAttempted");
        const changedThisRound = change?.round === combat.round;
        if (canControl && declared && !resolvedThisRound) {
          if (changedThisRound) {
            container.innerHTML += `<span class="faserip-change-result ${change.success ? "success" : "failed"}">Change: ${change.success ? "✓" : "✕"}</span>`;
          } else {
            container.innerHTML += `<button class="faserip-tracker-ctrl faserip-change-ctrl" data-action="change-action" data-actor-id="${c.actor.id}" data-combatant-id="${c.id}" title="Change Action: Yellow Agility FEAT; success applies -1CS to subsequent FEATs"><i class="fas fa-exchange-alt"></i></button>`;
          }
        }
      } else if (declared) {
        container.innerHTML = declarationChip();
        const actionState = c.getFlag("msh-faserip", "actionState");
        if (actionState?.round === combat.round && actionState.combatActionUsed) {
          container.innerHTML += `<span class="faserip-action-used" title="Declared combat action already used this round"><i class="fas fa-check"></i> Done</span>`;
        }
      }

      if (container.innerHTML.trim()) {
        for (const btn of container.querySelectorAll(".faserip-tracker-ctrl")) btn.addEventListener("click", ev => this._onTrackerActionButton(ev));
        const nameEl = el.querySelector(".token-name") || el.querySelector(".combatant-name");
        if (nameEl) nameEl.after(container); else el.appendChild(container);
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
    const rawPhases = game.settings.get("msh-faserip", "useRawTurnPhases");
    if (rawPhases) {
      if (!combat.started) {
        ui.notifications.warn("Begin combat before rolling RAW initiative.");
        return;
      }
      const phase = this._getPhase(combat);
      if (phase !== this.PHASE_DECLARE) {
        this._dbg("rollSideInitiative blocked", { phase });
        ui.notifications.warn("RAW initiative may only be rolled from the Declaration phase.");
        return;
      }
      // Anyone without a recorded intention defaults to Attack; declaring is
      // only needed when the plan differs.
      const defaulted = await this._applyDefaultDeclarations(combat);
      this._dbg("rollSideInitiative", { round: combat.round, defaulted });
    }

    this.isRolling = true;

    try {
      // Categorize only combatants who can actually act this round. KO, dead,
      // defeated, and otherwise action-blocked characters do not contribute
      // Intuition or Talent initiative bonuses.
      const pcCombatants = [];
      const npcCombatants = [];
      for (const c of this._trackedCombatants(combat)) {
        if (!this._isInitiativeEligible(c)) continue;
        const side = this._getCombatantSide(c);
        (side === "pc" ? pcCombatants : npcCombatants).push(c);
      }
      if (!pcCombatants.length || !npcCombatants.length) {
        ui.notifications.warn("Side initiative requires at least one eligible combatant on each side.");
        return;
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

      // Clear stale tracker initiative first so ineligible/KO combatants never
      // retain a prior-round number beside the current result.
      const trackedInitiativeReset = this._trackedCombatants(combat).map(c => ({ _id: c.id, initiative: null }));
      if (trackedInitiativeReset.length) await combat.updateEmbeddedDocuments("Combatant", trackedInitiativeReset);

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

      this._dbg("side initiative result", {
        pcRoll: pcRoll.total, pcMod, pcTalent: pcTalent.bonus, pcTotal,
        npcRoll: npcRoll.total, npcMod, npcTalent: npcTalent.bonus, npcTotal,
        goesFirst
      });

      // RAW: initiative determines the side order, but nobody acts yet until
      // the GM explicitly closes Pre-Action. Still focus the tracker cursor on
      // the winning side's lead combatant so the table sees who acts first.
      const rawPhases = game.settings.get("msh-faserip", "useRawTurnPhases");
      await combat.setupTurns();
      const turnIndex = this._firstEligibleTurnIndexForSide(combat, goesFirst);
      this._dbg("post-roll cursor", { turnIndex, rawPhases });
      if (rawPhases) {
        const update = { "flags.msh-faserip.turnPhase": this.PHASE_PREACTION };
        if (turnIndex >= 0) update.turn = turnIndex;
        await combat.update(update, { mshNoTimeAdvance: true });
      } else {
        if (turnIndex >= 0) await combat.update({ turn: turnIndex }, { mshNoTimeAdvance: true });
      }

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
    const rawPhases = game.settings.get("msh-faserip", "useRawTurnPhases");
    if (rawPhases) {
      if (!combat.started) {
        ui.notifications.warn("Begin combat before rolling RAW initiative.");
        return;
      }
      const phase = this._getPhase(combat);
      if (phase !== this.PHASE_DECLARE) {
        this._dbg("rollIndividualInitiative blocked", { phase });
        ui.notifications.warn("RAW initiative may only be rolled from the Declaration phase.");
        return;
      }
      const defaulted = await this._applyDefaultDeclarations(combat);
      this._dbg("rollIndividualInitiative", { round: combat.round, defaulted });
    }
    this.isRolling = true;

    try {
      // If no ids specified, roll for all combatants
      const trackedIds = new Set(this._trackedCombatants(combat).map(c => c.id));
      const combatantIds = (ids?.length ? ids.filter(id => trackedIds.has(id)) : Array.from(trackedIds))
        .filter(id => this._isInitiativeEligible(combat.combatants.get(id)));
      const results = [];
      const trackedInitiativeReset = this._trackedCombatants(combat).map(c => ({ _id: c.id, initiative: null }));
      if (trackedInitiativeReset.length) await combat.updateEmbeddedDocuments("Combatant", trackedInitiativeReset);

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

      // RAW: initiative is known, but actions wait until the GM closes
      // Pre-Action. Still focus the top-initiative combatant immediately.
      const rawPhases = game.settings.get("msh-faserip", "useRawTurnPhases");
      await combat.setupTurns();
      const turnIndex = this._firstEligibleTurnIndex(combat);
      this._dbg("post-roll cursor", { turnIndex, rawPhases });
      if (rawPhases) {
        const update = { "flags.msh-faserip.turnPhase": this.PHASE_PREACTION };
        if (turnIndex >= 0) update.turn = turnIndex;
        await combat.update(update, { mshNoTimeAdvance: true });
      } else {
        if (turnIndex >= 0) await combat.update({ turn: turnIndex }, { mshNoTimeAdvance: true });
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

  // Default RAW intention: Attack. Declaring is optional; combatants without a
  // recorded plan are stamped with a defaulted Attack when initiative rolls so
  // gates, chips, and talent-context checks all see a real declaration.
  static async _applyDefaultDeclarations(combat) {
    const updates = [];
    for (const c of this._eligibleCombatants(combat)) {
      if (c.getFlag("msh-faserip", "declaredAction")?.type) continue;
      const meta = this._declarationMeta("attack");
      updates.push({
        _id: c.id,
        "flags.msh-faserip.declaredAction": {
          type: "attack", attackCount: null, note: "", target: "",
          qualifiers: { unarmed: false, weaponSpecialist: false },
          label: meta.label, round: combat.round, defaulted: true
        }
      });
    }
    if (updates.length) await combat.updateEmbeddedDocuments("Combatant", updates);
    return updates.length;
  }

  static async _ensureSideFlags(combat) {
    const updates = [];
    for (const c of this._trackedCombatants(combat)) {
      const correct = this._determineSide(c);
      if (c.getFlag("msh-faserip", "side") !== correct) {
        updates.push({ _id: c.id, "flags.msh-faserip.side": correct });
      }
    }
    if (updates.length) await combat.updateEmbeddedDocuments("Combatant", updates);
  }

  // --- Chat Cards ---

  // Handle tracker pre-action/declaration controls.
  static async _onTrackerActionButton(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    const btn = ev.currentTarget;
    const action = btn.dataset.action;
    const actorId = btn.dataset.actorId;
    const combatantId = btn.dataset.combatantId;
    const combat = this._resolveCombatForCombatant(combatantId);
    const combatant = combat?.combatants?.get(combatantId);
    const actor = combatant?.actor ?? game.actors.get(actorId);
    if (!actor || !combatant) return ui.notifications.warn("Combatant not found");
    if (!actor.isOwner && !game.user.isGM) return ui.notifications.warn("You don't have permission to act for this character");

    const phase = this._getPhase(combat);
    this._dbg("tracker action", { action, actor: actor.name, phase, round: combat?.round });
    if (action === "declare") {
      if (phase !== this.PHASE_DECLARE) return ui.notifications.warn("Declarations are locked after initiative. Use Change Action during Pre-Action.");
      await this._showDeclarationDialog(actor, combatantId);
      return;
    }

    if (phase !== this.PHASE_PREACTION) return ui.notifications.warn("Pre-Action rolls may only be made during the Pre-Action phase.");

    if (action === "change-action") {
      await this._rollChangeAction(actor, combatantId);
      return;
    }

    const requirement = this._getPreActionRequirement(combatant);
    if (!requirement || requirement.action !== action) {
      return ui.notifications.warn(`${actor.name} did not declare this Pre-Action maneuver.`);
    }
    const prior = combatant.getFlag("msh-faserip", "preActionResolved");
    if (prior?.round === combat.round && prior.action === action) {
      return ui.notifications.warn(`${requirement.label} has already been resolved this round.`);
    }

    if (action === "multiattack") {
      await this._rollMultipleAttacksPreAction(actor, combatant, requirement);
      return;
    }

    const result = await ActionDispatcher.roll(action, {
      actor,
      abilityName: requirement.ability,
      opts: {
        actionType: action,
        rawPreAction: true,
        evadeTarget: combatant.getFlag("msh-faserip", "declaredAction")?.target || ""
      }
    });
    if (!result) return; // cancelled dialog
    await this._setCombatantFlags(combatant, {
      preActionResolved: {
        round: combat.round,
        action,
        result: result.resultColor || result.color || "done",
        success: action === "evading" ? result.resultColor !== "white" : true
      }
    });
    ui.combat?.render(true);
  }

  static async _rollMultipleAttacksPreAction(actor, combatant, requirement) {
    await new Promise(resolve => {
      showAbilityFeatDialog(actor, "fighting", {
        title: `Pre-Action: ${requirement.attackCount} Attacks — ${actor.name}`,
        featType: "multiattack",
        multiAttackCount: requirement.attackCount,
        lockFeatType: true,
        transient: true,
        onCancel: () => resolve(),
        onResult: async result => {
          await this._setCombatantFlags(combatant, {
            preActionResolved: {
              round: combatant.parent?.round ?? this._resolveCombatForCombatant(combatant.id)?.round ?? null,
              action: "multiattack",
              result: result.resultColor,
              success: !!result.success,
              attackCount: requirement.attackCount,
              consequenceCS: result.success ? -1 : -3,
              attacksAllowed: result.success ? requirement.attackCount : 1
            }
          });
          ui.combat?.render(true);
          resolve();
        }
      });
    });
  }

  // Declaration dialog. RAW declarations are represented in the combat tracker,
  // not posted as public chat spam. NPC details are rendered GM-only.
  static async _showDeclarationDialog(actor, combatantId, { isChange = false } = {}) {
    const combat = this._resolveCombatForCombatant(combatantId);
    if (!combat) return null;
    const combatant = combat.combatants.get(combatantId);
    if (!combatant) return null;

    const current = combatant.getFlag("msh-faserip", "declaredAction") || {};
    const lastType = current.type || combatant.getFlag("msh-faserip", "lastDeclaredType") || "attack";
    const lastNote = current.note ?? combatant.getFlag("msh-faserip", "lastDeclaredNote") ?? "";
    const selectedTargets = Array.from(game.user?.targets ?? []);
    const selectedTargetName = selectedTargets.length === 1 ? (selectedTargets[0]?.name || selectedTargets[0]?.actor?.name || "") : "";
    const lastTarget = current.target ?? selectedTargetName;
    const lastCount = Number(current.attackCount || 2) >= 3 ? 3 : 2;
    const hasMAE = this._hasTalent(actor, /martial arts\s*[- ]?e/i);
    const hasWpnSpec = this._hasTalent(actor, /weapons? specialist/i);
    const chk = v => v === lastType ? "checked" : "";
    const q = current.qualifiers || {};

    const choice = await new Promise(resolve => {
      new Dialog({
        title: `${isChange ? "New Action" : "Declare Action"}: ${actor.name}`,
        content: `
          <div class="faserip-declare-dialog">
            <div class="faserip-declare-grid">
              <label><input type="radio" name="declaration" value="move" ${chk("move")}> <i class="fas fa-running"></i> <strong>Move Only</strong><small>full movement</small></label>
              <label><input type="radio" name="declaration" value="attack" ${chk("attack")}> <i class="fas fa-fist-raised"></i> <strong>Attack</strong><small>half move if moving</small></label>
              <label><input type="radio" name="declaration" value="charge" ${chk("charge")}> <i class="fas fa-bolt"></i> <strong>Charge</strong><small>full move + attack</small></label>
              <label><input type="radio" name="declaration" value="dodge" ${chk("dodge")}> <i class="fas fa-running"></i> <strong>Dodge</strong><small>Agility in Pre-Action</small></label>
              <label><input type="radio" name="declaration" value="block" ${chk("block")}> <i class="fas fa-shield-alt"></i> <strong>Block</strong><small>Strength in Pre-Action</small></label>
              <label><input type="radio" name="declaration" value="evade" ${chk("evade")}> <i class="fas fa-eye-slash"></i> <strong>Evade</strong><small>Fighting in Pre-Action</small></label>
              <label><input type="radio" name="declaration" value="multi" ${chk("multi")}> <i class="fas fa-burst"></i> <strong>Multiple Attacks</strong><small>Fighting FEAT in Pre-Action</small></label>
              <label><input type="radio" name="declaration" value="other" ${chk("other")}> <i class="fas fa-ellipsis-h"></i> <strong>Other</strong><small>item, power stunt, talk, etc.</small></label>
            </div>
            <div class="faserip-declare-sub" data-section="multi">
              <span>Attacks:</span>
              <label><input type="radio" name="attackCount" value="2" ${lastCount === 2 ? "checked" : ""}> 2 (RM intensity)</label>
              <label><input type="radio" name="attackCount" value="3" ${lastCount === 3 ? "checked" : ""}> 3 (AM intensity)</label>
            </div>
            ${(hasMAE || hasWpnSpec) ? `<div class="faserip-declare-sub" data-section="initiative-context">
              <span>Initiative talent:</span>
              ${hasMAE ? `<label><input type="checkbox" name="unarmed" ${q.unarmed ? "checked" : ""}> Unarmed combat (MA-E)</label>` : ""}
              ${hasWpnSpec ? `<label><input type="checkbox" name="weaponSpecialist" ${q.weaponSpecialist ? "checked" : ""}> Using specialist weapon</label>` : ""}
            </div>` : ""}
            <label class="faserip-declare-field"><span>Target / opponent</span><input type="text" name="target" value="${this._esc(lastTarget)}" placeholder="optional, but recommended for Evade"></label>
            <label class="faserip-declare-field"><span>Notes</span><input type="text" name="note" value="${this._esc(lastNote)}" placeholder="punch MODOK, grab console, fly to gantry..."></label>
          </div>
        `,
        buttons: {
          declare: {
            icon: '<i class="fas fa-check"></i>',
            label: isChange ? "Use New Action" : "Declare",
            callback: html => {
              const type = String(html.find('[name="declaration"]:checked').val() || "attack");
              const attackCount = Number(html.find('[name="attackCount"]:checked').val() || 2);
              const note = String(html.find('[name="note"]').val() || "").trim();
              const target = String(html.find('[name="target"]').val() || "").trim();
              resolve({
                type, attackCount: type === "multi" ? (attackCount >= 3 ? 3 : 2) : null,
                note, target,
                qualifiers: {
                  unarmed: !!html.find('[name="unarmed"]').is(':checked'),
                  weaponSpecialist: !!html.find('[name="weaponSpecialist"]').is(':checked')
                }
              });
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "declare",
        render: html => {
          const update = () => {
            const type = String(html.find('[name="declaration"]:checked').val() || "attack");
            html.find('[data-section="multi"]').toggle(type === "multi");
            html.find('[data-section="initiative-context"]').toggle(["attack", "charge", "multi"].includes(type));
          };
          html.find('[name="declaration"]').on("change", update);
          update();
        }
      }).render(true);
    });
    if (!choice) return null;

    // Mutually exclusive initiative contexts: MA-E is unarmed; Weapon
    // Specialist requires the specialist weapon. If both are checked, prefer
    // the explicit specialist weapon declaration and turn off unarmed.
    if (choice.qualifiers.weaponSpecialist) choice.qualifiers.unarmed = false;
    const meta = this._declarationMeta(choice.type, choice);
    const declaredAction = { ...choice, label: meta.label, round: combat.round };
    const ok = await this._setCombatantFlags(combatant, {
      lastDeclaredType: choice.type,
      lastDeclaredNote: choice.note,
      declaredAction
    });
    if (!ok) return null;
    ui.combat?.render(true);
    return declaredAction;
  }

  // Private bulk NPC planning keeps RAW Judge-first declarations practical when
  // a scene contains many minions. Only the GM sees or edits these intentions.
  static async _showNpcPlanDialog(combat) {
    if (!game.user.isGM || !combat) return;
    if (this._getPhase(combat) !== this.PHASE_DECLARE) return ui.notifications.warn("NPC plans are recorded during Declaration.");
    const npcs = this._eligibleCombatants(combat).filter(c => !c.actor?.hasPlayerOwner);
    if (!npcs.length) return ui.notifications.info("No eligible NPC combatants need plans.");

    const undeclared = new Set(npcs.filter(c => !c.getFlag("msh-faserip", "declaredAction")).map(c => c.id));
    const rows = npcs.map(c => {
      const current = c.getFlag("msh-faserip", "declaredAction");
      const checked = undeclared.size ? undeclared.has(c.id) : true;
      const status = current?.label || (current?.type ? this._declarationMeta(current.type, current).label : "Not declared");
      return `<label class="faserip-npc-plan-row"><input type="checkbox" name="npc" value="${c.id}" ${checked ? "checked" : ""}> <strong>${this._esc(c.name)}</strong><small>${this._esc(status)}</small></label>`;
    }).join("");

    const choice = await new Promise(resolve => {
      new Dialog({
        title: "Private NPC Plans",
        content: `<div class="faserip-npc-plan-dialog">
          <p class="hint">Select NPCs, then assign one intended action to them. Players only see that an NPC has declared, not the details.</p>
          <div class="faserip-npc-plan-list">${rows}</div>
          <div class="faserip-npc-plan-fields">
            <label>Action <select name="type">
              <option value="attack">Attack</option>
              <option value="charge">Charge</option>
              <option value="move">Move Only</option>
              <option value="dodge">Dodge</option>
              <option value="block">Block</option>
              <option value="evade">Evade</option>
              <option value="multi">Multiple Attacks</option>
              <option value="other">Other</option>
            </select></label>
            <label>Multi attacks <select name="attackCount"><option value="2">2 (RM)</option><option value="3">3 (AM)</option></select></label>
            <label>Shared target/note <input type="text" name="note" placeholder="e.g. nearest hero, guard MODOK"></label>
            <label class="faserip-npc-plan-check"><span>Initiative context</span><span><input type="checkbox" name="unarmed"> Unarmed (MA-E) &nbsp; <input type="checkbox" name="weaponSpecialist"> Specialist weapon</span></label>
          </div>
        </div>`,
        buttons: {
          apply: {
            icon: '<i class="fas fa-check"></i>', label: "Apply Plans",
            callback: html => {
              const ids = html.find('[name="npc"]:checked').map((_, el) => el.value).get();
              const type = String(html.find('[name="type"]').val() || "attack");
              const attackCount = Number(html.find('[name="attackCount"]').val() || 2) >= 3 ? 3 : 2;
              const note = String(html.find('[name="note"]').val() || "").trim();
              const weaponSpecialist = !!html.find('[name="weaponSpecialist"]').is(':checked');
              const unarmed = weaponSpecialist ? false : !!html.find('[name="unarmed"]').is(':checked');
              resolve({ ids, type, attackCount, note, qualifiers: { unarmed, weaponSpecialist } });
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "apply"
      }).render(true);
    });
    if (!choice?.ids?.length) return;

    const updates = [];
    for (const id of choice.ids) {
      const c = combat.combatants.get(id);
      if (!c || c.actor?.hasPlayerOwner || !this._isInitiativeEligible(c)) continue;
      const data = { type: choice.type, attackCount: choice.type === "multi" ? choice.attackCount : null, note: choice.note, target: "", qualifiers: choice.qualifiers || { unarmed: false, weaponSpecialist: false } };
      const meta = this._declarationMeta(data.type, data);
      updates.push({
        _id: c.id,
        "flags.msh-faserip.lastDeclaredType": data.type,
        "flags.msh-faserip.lastDeclaredNote": data.note,
        "flags.msh-faserip.declaredAction": { ...data, label: meta.label, round: combat.round }
      });
    }
    if (updates.length) await combat.updateEmbeddedDocuments("Combatant", updates);
    ui.combat?.render(true);
  }

  static async _createChangeActionPenalty(actor, combat) {
    const existing = actor.effects?.filter(e => !e.disabled && e.getFlag?.("msh-faserip", "isChangeActionPenalty")) || [];
    if (existing.length) await actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(e => e.id));
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: "Changed Action (-1CS)",
      icon: "icons/svg/daze.svg",
      origin: actor.uuid,
      disabled: false,
      duration: { value: 1, units: "rounds", expiry: "roundEnd" },
      changes: [{ key: "system.combatMods.selfPenaltyCS", mode: "add", value: "-1", priority: 30 }],
      flags: { "msh-faserip": { isChangeActionPenalty: true, createdRound: combat?.round ?? null, notes: "RAW Change Action: -1CS on subsequent FEATs this round." } }
    }]);
  }

  // RAW Change Action: Yellow Agility FEAT. Success permits a replacement
  // declaration and applies -1CS to every subsequent FEAT this round.
  static async _rollChangeAction(actor, combatantId) {
    const combat = this._resolveCombatForCombatant(combatantId);
    const combatant = combat?.combatants?.get(combatantId);
    if (!combatant || this._getPhase(combat) !== this.PHASE_PREACTION) return;
    const attempted = combatant.getFlag("msh-faserip", "changeActionAttempted");
    if (attempted?.round === combat.round) return ui.notifications.warn("Change Action has already been attempted this round.");
    const resolved = combatant.getFlag("msh-faserip", "preActionResolved");
    if (resolved?.round === combat.round) return ui.notifications.warn("The declared Pre-Action FEAT has already been resolved; the action is locked.");

    const featResult = await new Promise(resolve => {
      showAbilityFeatDialog(actor, "agility", {
        title: `Change Action (Yellow Agility): ${actor.name}`,
        featType: "standard",
        lockFeatType: true,
        requiredColor: "Yellow",
        transient: true,
        onCancel: () => resolve(null),
        onResult: result => resolve(result)
      });
    });
    if (!featResult) return;

    if (!featResult.success) {
      await this._setCombatantFlags(combatant, { changeActionAttempted: { round: combat.round, success: false, result: featResult.resultColor } });
      ui.notifications.info(`${actor.name} fails to change action; the original declaration stands.`);
      ui.combat?.render(true);
      return;
    }

    const replacement = await this._showDeclarationDialog(actor, combatantId, { isChange: true });
    if (!replacement) {
      await this._setCombatantFlags(combatant, { changeActionAttempted: { round: combat.round, success: true, result: featResult.resultColor, changed: false } });
      ui.combat?.render(true);
      return;
    }

    await this._createChangeActionPenalty(actor, combat);
    await this._setCombatantFlags(combatant, {
      changeActionAttempted: { round: combat.round, success: true, result: featResult.resultColor, changed: true },
      preActionResolved: null
    });
    ui.notifications.info(`${actor.name} changes action; subsequent FEATs this round are -1CS.`);
    ui.combat?.render(true);
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
        "Players declare actions (Move / Attack / Charge / Dodge / Block / Evade / Multiple Attacks / Other)",
        "Roll Initiative",
        "Pre-Action — resolve declared defenses / Multiple Attacks; Change Action if needed",
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
        "Players declare actions (Move / Attack / Charge / Dodge / Block / Evade / Multiple Attacks / Other)",
        "Roll Initiative",
        "Pre-Action — resolve declared defenses / Multiple Attacks; Change Action if needed",
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