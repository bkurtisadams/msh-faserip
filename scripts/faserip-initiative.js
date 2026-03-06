// faserip-initiative.js v2.0.0 - 2026-03-05

export class FaseripInitiative {
  static initialized = false;
  static isRolling = false;

  // Initiative mode constants
  static MODE_SIDE = "side";
  static MODE_INDIVIDUAL = "individual";
  static MODE_FOUNDRY = "foundry";

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

  // --- Talent bonus scanning ---

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

  // --- Intuition modifier table ---

  static _getModifierForIntuition(intuition) {
    if (intuition >= 76) return 6;
    if (intuition >= 51) return 5;
    if (intuition >= 41) return 4;
    if (intuition >= 31) return 3;
    if (intuition >= 21) return 2;
    if (intuition >= 11) return 1;
    return 0;
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
    for (const el of root.querySelectorAll(".combatant")) {
      const id = el.getAttribute("data-combatant-id");
      const c = combat.combatants.get(id);
      if (!c) continue;
      el.classList.add(`${this._getCombatantSide(c)}-side`);
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

        const intuition = c.actor.system?.abilities?.intuition?.value ?? 0;
        const intMod = this._getModifierForIntuition(intuition);
        const talent = this._getInitiativeTalentBonus(c);
        const roll = await (new Roll("1d10")).evaluate();

        if (game.dice3d) {
          await game.dice3d.showForRoll(roll, game.user, true);
        }

        const total = roll.total === 1 ? 1 : roll.total + intMod + talent.bonus;
        await combat.setInitiative(c.id, total);

        results.push({
          name: c.name,
          roll: roll.total,
          intMod,
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
    let best = { name: "None", intuition: 0 };
    for (const c of combatants) {
      const int = c.actor?.system?.abilities?.intuition?.value ?? 0;
      if (int > best.intuition) best = { name: c.name, intuition: int };
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

  static async _postSideInitiativeCard(combat, d) {
    const labels = this._getSideLabels();
    const roundInfo = combat.round ? `Round ${combat.round}` : "Combat Start";
    const showPhase = game.settings.get("msh-faserip", "showPhaseReminder");
    const winner = d.goesFirst === "pc" ? labels.pc : labels.npc;
    const loser = d.goesFirst === "pc" ? labels.npc : labels.pc;

    const pcLine = this._buildSideLine(labels.pc, d.pcRoll, d.pcMod, d.pcHighest.name, d.pcTalent, d.pcTotal, d.goesFirst === "pc");
    const npcLine = this._buildSideLine(labels.npc, d.npcRoll, d.npcMod, d.npcHighest.name, d.npcTalent, d.npcTotal, d.goesFirst === "npc");

    const phaseHtml = showPhase
      ? `<div class="faserip-phase-reminder">${winner} → ${loser}</div>`
      : "";

    const content = `
  <div class="faserip-initiative-result">
    <div class="faserip-init-header">${roundInfo}</div>
    <div class="faserip-init-rows">
      ${pcLine}
      ${npcLine}
    </div>
    ${phaseHtml}
  </div>`;

    await ChatMessage.create({
      user: game.user.id, content,
      flavor: `${roundInfo} — Initiative`,
      sound: CONFIG.sounds.dice
    });
  }

  static _buildSideLine(label, roll, intMod, intName, talent, total, isWinner) {
    const modParts = [];
    let hasMods = false;
    if (roll === 1) {
      if (intMod > 0 || talent.bonus > 0) {
        modParts.push(`<span class="mod-cancelled">${this._modStr(intMod, intName, talent)}</span> <em>nat 1</em>`);
        hasMods = true;
      }
    } else {
      const s = this._modStr(intMod, intName, talent);
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

  static _modStr(intMod, intName, talent) {
    const parts = [];
    if (intMod > 0) parts.push(`+${intMod} ${intName}`);
    if (talent.bonus > 0) parts.push(`+${talent.bonus} ${talent.source}`);
    return parts.join(" ");
  }

  static async _postIndividualInitiativeCard(combat, results) {
    const roundInfo = combat.round ? `Round ${combat.round}` : "Combat Start";
    const showPhase = game.settings.get("msh-faserip", "showPhaseReminder");

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
        if (r.intMod > 0) parts.push(`+${r.intMod} Int`);
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

    const phaseHtml = showPhase
      ? `<div class="faserip-phase-reminder">Actions in initiative order</div>`
      : "";

    const content = `
  <div class="faserip-initiative-result faserip-individual">
    <div class="faserip-init-header">${roundInfo}</div>
    <table class="faserip-init-table">
      <tbody>${rows}</tbody>
    </table>
    ${phaseHtml}
  </div>`;

    await ChatMessage.create({
      user: game.user.id, content,
      flavor: `${roundInfo} — Initiative`,
      sound: CONFIG.sounds.dice
    });
  }
}
