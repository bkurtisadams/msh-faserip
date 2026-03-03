// teamSheet.js v3.0.0 - 2026-03-02
// v3.0.0: Compact layout, defeated villains with expand/collapse per-villain award,
//         auto-capture from combat tracker, stripped pending queue/session log
export class TeamSheet extends Application {

  // Rank thresholds for karma eligibility (Remarkable+ = 30+)
  static RANK_TABLE = [
    { rank: "Shift-0", value: 0 }, { rank: "Feeble", value: 2 },
    { rank: "Poor", value: 4 }, { rank: "Typical", value: 6 },
    { rank: "Good", value: 10 }, { rank: "Excellent", value: 20 },
    { rank: "Remarkable", value: 30 }, { rank: "Incredible", value: 40 },
    { rank: "Amazing", value: 50 }, { rank: "Monstrous", value: 75 },
    { rank: "Unearthly", value: 100 }, { rank: "Shift-X", value: 150 },
    { rank: "Shift-Y", value: 200 }, { rank: "Shift-Z", value: 500 },
    { rank: "Class 1000", value: 1000 }, { rank: "Class 3000", value: 3000 },
    { rank: "Class 5000", value: 5000 }, { rank: "Beyond", value: 10000 }
  ];

  // Crime type stop/arrest karma values
  static CRIME_VALUES = {
    violent:              { stop: 30, arrest: 15 },
    destructive:          { stop: 20, arrest: 10 },
    theft:                { stop: 10, arrest: 5 },
    robbery:              { stop: 20, arrest: 10 },
    misdemeanor:          { stop: 5,  arrest: 5 },
    national:             { stop: 20, arrest: 10 },
    localConspiracy:      { stop: 30, arrest: 15 },
    nationalConspiracy:   { stop: 40, arrest: 20 },
    globalConspiracy:     { stop: 50, arrest: 25 },
    other:                { stop: 15, arrest: 5 }
  };

  constructor(options = {}) {
    super(options);
    this._removeMode = false;
    this._expandedVillains = new Set();
    this._timeUpdateHook = Hooks.on("msh-faserip.timeUpdated", () => {
      if (this.rendered) this.render(false);
    });
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip", "sheet", "team-tracker"],
      template: "systems/msh-faserip/templates/team-sheet.html",
      width: 480, height: 520, resizable: true, title: "Team Tracker"
    });
  }

  async close(options) {
    if (this._timeUpdateHook) Hooks.off("msh-faserip.timeUpdated", this._timeUpdateHook);
    return super.close(options);
  }

  // ===== DATA =====

  getData() {
    const context = super.getData();
    context.isGM = game.user.isGM;
    context.removeMode = this._removeMode;
    context.useKarmaPool = game.settings.get("msh-faserip", "useKarmaPool") ?? false;

    const teamMemberIds = game.settings.get("msh-faserip", "teamMembers") || [];
    context.teamMembers = teamMemberIds.map(id => {
      const hero = game.actors.get(id);
      if (!hero) return null;
      const health = hero.system.attributes?.health?.value || 0;
      const healthMax = hero.system.attributes?.health?.max || 0;
      return {
        id: hero.id, name: hero.name,
        img: hero.img || "icons/svg/mystery-man.svg",
        health, healthMax,
        healthLow: healthMax > 0 && health < healthMax * 0.25,
        availableKarma: this._calculateAvailableKarma(hero),
        popularity: hero.system.attributes?.popularity?.hero?.value || 0
      };
    }).filter(m => m !== null);

    context.teamSize = context.teamMembers.length || 1;

    context.availableHeroes = game.actors.filter(a =>
      (a.type === "hero" || a.type === "npc") &&
      a.prototypeToken.disposition >= 0 &&
      !teamMemberIds.includes(a.id)
    ).map(a => ({ id: a.id, name: a.name, type: a.type }))
     .sort((a, b) => a.name.localeCompare(b.name));

    // Pool
    context.teamKarmaPool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;

    // Multiplier
    const multiplier = game.settings.get("msh-faserip", "karmaMultiplier") || 1;
    context.karmaMultiplier = multiplier;
    context.multiplierOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    // Defeated villains with computed fields
    const villains = game.settings.get("msh-faserip", "defeatedVillains") || [];
    context.defeatedVillains = villains.map((v, idx) => {
      const expanded = this._expandedVillains.has(idx);
      const karmaEligible = v.defeated !== false && v.rankValue >= 30;
      const subRemarkable = v.rankValue < 30;
      const crimeVals = v.crimeType ? TeamSheet.CRIME_VALUES[v.crimeType] : null;
      const stopValue = crimeVals && v.stopped ? crimeVals.stop : 0;
      const arrestValue = crimeVals && v.arrested ? crimeVals.arrest : 0;
      const rescueKarma = Math.min((v.rescues || 0) * 20, 100);
      const penaltyKarma = (v.propertyDamage || 0) * -5;
      const positiveTotal = (karmaEligible ? v.rankValue : 0) + stopValue + arrestValue + rescueKarma;
      const positiveMultiplied = positiveTotal * multiplier;
      const heroCount = Math.max(1, (v.presentHeroIds || []).length);
      const perHeroPositive = Math.floor(positiveMultiplied / heroCount);
      const perHeroPenalty = penaltyKarma ? Math.floor(penaltyKarma / heroCount) : 0;

      // Build hero check data for expanded view
      const heroChecks = (context.teamMembers || []).map(tm => ({
        id: tm.id, name: tm.name, img: tm.img,
        present: (v.presentHeroIds || []).includes(tm.id)
      }));

      return {
        ...v, expanded, karmaEligible, subRemarkable,
        stopValue, arrestValue, rescueKarma, penaltyKarma,
        positiveTotal, positiveMultiplied, heroCount,
        perHeroPositive, perHeroPenalty, heroChecks,
        crimeType: v.crimeType || ""
      };
    });

    return context;
  }

  _calculateAvailableKarma(actor) {
    const lifetime = actor.system.karma?.lifetime || 0;
    let spent = 0;
    (actor.system.karma?.history || []).forEach(e => { if (e.amount < 0) spent += Math.abs(e.amount); });
    return Math.max(0, lifetime - spent - (actor.system.karma?.advancement || 0));
  }

  // ===== LISTENERS =====

  activateListeners(html) {
    super.activateListeners(html);

    // Roster
    html.find('.add-hero-to-team-btn').click(() => {
      const s = html.find('.add-hero-select'); const id = s.val();
      if (id) { this._onAddHeroToTeam(id); s.val(''); }
      else ui.notifications.warn("Select a character to add");
    });
    html.find('.remove-member-toggle').click(() => {
      this._removeMode = !this._removeMode;
      this.render(false);
    });
    html.find('.remove-hero-from-team').click(ev => this._onRemoveHeroFromTeam(ev));
    html.find('.hero-portrait').click(ev => {
      const h = game.actors.get(ev.currentTarget.dataset.heroId); if (h) h.sheet.render(true);
    });
    html.find('.open-karma-sheet').click(ev => {
      const h = game.actors.get(ev.currentTarget.dataset.heroId);
      if (h) import('./karma.js').then(m => new m.KarmaSheet(h).render(true));
    });
    html.find('.open-pool-manager').click(() => {
      import('./karmaPool.js').then(m => {
        const a = game.actors.find(a => game.user.character?.id === a.id) ||
                  game.actors.find(a => a.type === "hero" && a.hasPlayerOwner);
        if (a) new m.KarmaPoolSheet(a).render(true);
      });
    });

    // Multiplier
    html.find('.multiplier-select').change(async (ev) => {
      await game.settings.set("msh-faserip", "karmaMultiplier", Number(ev.target.value));
      this.render(true);
    });

    // Time settings
    html.find('.time-settings-btn').click(ev => this._onTimeSettings(ev));

    // Villain rows
    html.find('.villain-row').click(ev => {
      // Don't toggle if clicking a button/link inside the row
      if (ev.target.closest('button, a')) return;
      const idx = Number(ev.currentTarget.dataset.villainIdx);
      if (this._expandedVillains.has(idx)) this._expandedVillains.delete(idx);
      else this._expandedVillains.add(idx);
      this.render(false);
    });

    // Villain detail controls
    html.find('.hero-present-toggle').change(ev => this._onToggleHeroPresent(ev));
    html.find('.crime-type-select').change(ev => this._onCrimeTypeChange(ev));
    html.find('.crime-stopped-toggle').change(ev => this._onCrimeFlagChange(ev, 'stopped'));
    html.find('.crime-arrested-toggle').change(ev => this._onCrimeFlagChange(ev, 'arrested'));
    html.find('.rescue-count').change(ev => this._onNumericFieldChange(ev, 'rescues'));
    html.find('.prop-damage').change(ev => this._onNumericFieldChange(ev, 'propertyDamage'));

    // Villain actions
    html.find('.add-villain-manual').click(() => this._onAddVillainManual());
    html.find('.delete-villain').click(ev => this._onDeleteVillain(ev));
    html.find('.award-villain-heroes').click(ev => this._onAwardVillainToHeroes(ev));
    html.find('.award-villain-pool').click(ev => this._onAwardVillainToPool(ev));
  }

  // ===== TEAM MANAGEMENT =====

  async _onAddHeroToTeam(heroId) {
    const tm = game.settings.get("msh-faserip", "teamMembers") || [];
    if (!tm.includes(heroId)) {
      tm.push(heroId);
      await game.settings.set("msh-faserip", "teamMembers", tm);
      ui.notifications.info(`${game.actors.get(heroId)?.name} added to team.`);
      this.render(true);
    }
  }

  async _onRemoveHeroFromTeam(event) {
    event.stopPropagation();
    const heroId = event.currentTarget.dataset.heroId;
    const hero = game.actors.get(heroId);
    if (!await Dialog.confirm({ title: "Remove", content: `<p>Remove <strong>${hero?.name}</strong>?</p>` })) return;
    const tm = game.settings.get("msh-faserip", "teamMembers") || [];
    const i = tm.indexOf(heroId);
    if (i > -1) {
      tm.splice(i, 1);
      await game.settings.set("msh-faserip", "teamMembers", tm);
      ui.notifications.info(`${hero?.name} removed.`);
      this.render(true);
    }
  }

  // ===== VILLAIN FIELD UPDATES =====

  async _updateVillainField(idx, field, value) {
    const villains = game.settings.get("msh-faserip", "defeatedVillains") || [];
    if (idx < 0 || idx >= villains.length) return;
    villains[idx][field] = value;
    await game.settings.set("msh-faserip", "defeatedVillains", villains);
    this.render(false);
  }

  _onToggleHeroPresent(ev) {
    const idx = Number(ev.currentTarget.dataset.villainIdx);
    const heroId = ev.currentTarget.dataset.heroId;
    const villains = game.settings.get("msh-faserip", "defeatedVillains") || [];
    if (!villains[idx]) return;
    const ids = new Set(villains[idx].presentHeroIds || []);
    if (ev.currentTarget.checked) ids.add(heroId);
    else ids.delete(heroId);
    this._updateVillainField(idx, 'presentHeroIds', [...ids]);
  }

  _onCrimeTypeChange(ev) {
    const idx = Number(ev.currentTarget.dataset.villainIdx);
    const val = ev.currentTarget.value;
    const villains = game.settings.get("msh-faserip", "defeatedVillains") || [];
    if (!villains[idx]) return;
    villains[idx].crimeType = val;
    if (!val) { villains[idx].stopped = false; villains[idx].arrested = false; }
    game.settings.set("msh-faserip", "defeatedVillains", villains).then(() => this.render(false));
  }

  _onCrimeFlagChange(ev, flag) {
    const idx = Number(ev.currentTarget.dataset.villainIdx);
    this._updateVillainField(idx, flag, ev.currentTarget.checked);
  }

  _onNumericFieldChange(ev, field) {
    const idx = Number(ev.currentTarget.dataset.villainIdx);
    this._updateVillainField(idx, field, Math.max(0, Number(ev.currentTarget.value) || 0));
  }

  // ===== ADD / DELETE VILLAINS =====

  _onAddVillainManual() {
    if (!game.user.isGM) return;
    // Build list of hostile NPCs for quick-pick
    const hostiles = game.actors.filter(a =>
      (a.type === "npc" || a.type === "hero") &&
      a.prototypeToken.disposition < 0
    ).sort((a, b) => a.name.localeCompare(b.name));

    const hostileOpts = hostiles.map(a => {
      const { rankValue, rankLabel } = TeamSheet.getHighestRank(a);
      return `<option value="${a.id}" data-rank="${rankValue}" data-label="${rankLabel}">${a.name} — ${rankLabel}(${rankValue})</option>`;
    }).join('');

    const rankOpts = TeamSheet.RANK_TABLE.filter(r => r.value >= 30).map(r =>
      `<option value="${r.value}" data-label="${r.rank}">${r.rank} (${r.value})</option>`
    ).join('');

    new Dialog({
      title: "Add Defeated Villain",
      content: `<form>
        <div class="form-group"><label>Pick from actors:</label>
          <select name="actorId" style="width:100%">
            <option value="">— Manual entry —</option>
            ${hostileOpts}
          </select></div>
        <hr/>
        <div class="form-group"><label>Villain Name:</label>
          <input type="text" name="name" placeholder="e.g., Rhino" /></div>
        <div class="form-group"><label>Highest Rank:</label>
          <select name="rank" style="width:100%">
            <option value="0" data-label="Below Rm">Below Remarkable (no foe karma)</option>
            ${rankOpts}
          </select></div>
      </form>`,
      buttons: {
        add: { icon: '<i class="fas fa-skull"></i>', label: "Add",
          callback: async (html) => {
            const actorId = html.find('[name="actorId"]').val();
            let name, img, rankValue, rankLabel;
            if (actorId) {
              const actor = game.actors.get(actorId);
              if (!actor) return;
              name = actor.name;
              img = actor.img || "icons/svg/mystery-man.svg";
              const highest = TeamSheet.getHighestRank(actor);
              rankValue = highest.rankValue;
              rankLabel = highest.rankLabel;
            } else {
              name = html.find('[name="name"]').val()?.trim();
              if (!name) { ui.notifications.warn("Enter a villain name"); return; }
              img = "icons/svg/mystery-man.svg";
              rankValue = Number(html.find('[name="rank"]').val()) || 0;
              rankLabel = html.find('[name="rank"] option:selected').data('label') || "Unknown";
            }
            const teamIds = game.settings.get("msh-faserip", "teamMembers") || [];
            await this._addVillainEntry({ name, img, rankValue, rankLabel, presentHeroIds: [...teamIds] });
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "add",
      render: (html) => {
        html.find('[name="actorId"]').on('change', () => {
          const sel = html.find('[name="actorId"]');
          if (sel.val()) {
            const opt = sel.find(':selected');
            html.find('[name="name"]').val(opt.text().split(' — ')[0]);
            // Find matching rank
            const rv = Number(opt.data('rank'));
            html.find('[name="rank"]').val(rv >= 30 ? rv : 0);
          }
        });
      }
    }).render(true);
  }

  async _addVillainEntry(data) {
    const villains = game.settings.get("msh-faserip", "defeatedVillains") || [];
    villains.push({
      name: data.name,
      img: data.img || "icons/svg/mystery-man.svg",
      rankValue: data.rankValue || 0,
      rankLabel: data.rankLabel || "Unknown",
      defeated: true,
      presentHeroIds: data.presentHeroIds || [],
      crimeType: "",
      stopped: false,
      arrested: false,
      rescues: 0,
      propertyDamage: 0,
      awarded: false,
      gameDate: this._getGameDate(),
      timestamp: new Date().toISOString()
    });
    await game.settings.set("msh-faserip", "defeatedVillains", villains);
    // Auto-expand the new entry
    this._expandedVillains.add(villains.length - 1);
    this.render(true);
  }

  async _onDeleteVillain(ev) {
    ev.stopPropagation();
    const idx = Number(ev.currentTarget.dataset.villainIdx);
    const villains = game.settings.get("msh-faserip", "defeatedVillains") || [];
    if (idx < 0 || idx >= villains.length) return;
    const name = villains[idx].name;
    if (!await Dialog.confirm({ title: "Remove", content: `<p>Remove <strong>${name}</strong>?</p>` })) return;
    villains.splice(idx, 1);
    this._expandedVillains.delete(idx);
    // Re-index expanded set
    const newExpanded = new Set();
    for (const i of this._expandedVillains) {
      if (i > idx) newExpanded.add(i - 1);
      else if (i < idx) newExpanded.add(i);
    }
    this._expandedVillains = newExpanded;
    await game.settings.set("msh-faserip", "defeatedVillains", villains);
    this.render(true);
  }

  // ===== AWARD PER VILLAIN =====

  async _onAwardVillainToHeroes(ev) {
    ev.stopPropagation();
    if (!game.user.isGM) return;
    const idx = Number(ev.currentTarget.dataset.villainIdx);
    const villains = game.settings.get("msh-faserip", "defeatedVillains") || [];
    const v = villains[idx];
    if (!v || v.awarded) return;

    const multiplier = game.settings.get("msh-faserip", "karmaMultiplier") || 1;
    const heroIds = v.presentHeroIds || [];
    const heroes = heroIds.map(id => game.actors.get(id)).filter(Boolean);
    if (!heroes.length) { ui.notifications.warn("No heroes marked as present"); return; }

    const { positiveTotal, penaltyKarma } = this._calcVillainTotals(v);
    const positiveMultiplied = positiveTotal * multiplier;
    const perHeroPos = Math.floor(positiveMultiplied / heroes.length);
    const perHeroPen = penaltyKarma ? Math.floor(penaltyKarma / heroes.length) : 0;
    const netPerHero = perHeroPos + perHeroPen;

    const breakdown = this._buildBreakdownText(v, multiplier, heroes.length);
    if (!await Dialog.confirm({
      title: `Award — ${v.name}`,
      content: `<p>${breakdown}</p>
        <p>Award <strong>+${perHeroPos}</strong>${perHeroPen ? ` / <strong>${perHeroPen}</strong> penalty` : ''} (net <strong>${netPerHero}</strong>) to each of <strong>${heroes.length}</strong> heroes?</p>`
    })) return;

    const gameDate = v.gameDate || this._getGameDate();
    const descParts = [`Defeated ${v.name} (${v.rankLabel} ${v.rankValue})`];
    if (v.stopped) descParts.push(`Stop ${this._crimeLabel(v.crimeType)}`);
    if (v.arrested) descParts.push(`Arrest ${this._crimeLabel(v.crimeType)}`);
    if (v.rescues > 0) descParts.push(`Rescue ×${v.rescues}`);
    const desc = descParts.join(', ');
    const baseNote = `(base ${positiveTotal} ×${multiplier} ÷${heroes.length})`;

    for (const hero of heroes) {
      if (perHeroPos > 0) {
        await this._addHeroKarmaEvent(hero, {
          amount: perHeroPos, type: "Defeated Foe",
          description: `${desc} ${baseNote}`, gameDate
        });
      }
      if (perHeroPen < 0) {
        await this._addHeroKarmaEvent(hero, {
          amount: perHeroPen, type: "Property Damage",
          description: `${v.propertyDamage} area(s) — ${v.name}`, gameDate
        });
      }
    }

    villains[idx].awarded = true;
    await game.settings.set("msh-faserip", "defeatedVillains", villains);
    ui.notifications.info(`${v.name}: ${netPerHero} net karma to each of ${heroes.length} heroes.`);
    this.render(true);
  }

  async _onAwardVillainToPool(ev) {
    ev.stopPropagation();
    if (!game.user.isGM) return;
    const idx = Number(ev.currentTarget.dataset.villainIdx);
    const villains = game.settings.get("msh-faserip", "defeatedVillains") || [];
    const v = villains[idx];
    if (!v || v.awarded) return;

    const multiplier = game.settings.get("msh-faserip", "karmaMultiplier") || 1;
    const { positiveTotal, penaltyKarma } = this._calcVillainTotals(v);
    const total = (positiveTotal * multiplier) + penaltyKarma;

    if (!await Dialog.confirm({
      title: `Award to Pool — ${v.name}`,
      content: `<p>Add <strong>${total}</strong> karma to team pool?</p>`
    })) return;

    const pool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
    await game.settings.set("msh-faserip", "teamKarmaPoolTotal", Math.max(0, pool + total));
    villains[idx].awarded = true;
    await game.settings.set("msh-faserip", "defeatedVillains", villains);
    ui.notifications.info(`${total} karma added to team pool for ${v.name}.`);
    this.render(true);
  }

  // ===== KARMA HELPERS =====

  _calcVillainTotals(v) {
    const karmaEligible = v.defeated !== false && v.rankValue >= 30;
    const crimeVals = v.crimeType ? TeamSheet.CRIME_VALUES[v.crimeType] : null;
    const stopValue = crimeVals && v.stopped ? crimeVals.stop : 0;
    const arrestValue = crimeVals && v.arrested ? crimeVals.arrest : 0;
    const rescueKarma = Math.min((v.rescues || 0) * 20, 100);
    const penaltyKarma = (v.propertyDamage || 0) * -5;
    const positiveTotal = (karmaEligible ? v.rankValue : 0) + stopValue + arrestValue + rescueKarma;
    return { positiveTotal, penaltyKarma, karmaEligible };
  }

  _buildBreakdownText(v, multiplier, heroCount) {
    const parts = [];
    if (v.rankValue >= 30) parts.push(`Foe +${v.rankValue}`);
    const cv = v.crimeType ? TeamSheet.CRIME_VALUES[v.crimeType] : null;
    if (cv && v.stopped) parts.push(`Stop +${cv.stop}`);
    if (cv && v.arrested) parts.push(`Arrest +${cv.arrest}`);
    if (v.rescues > 0) parts.push(`Rescue +${Math.min(v.rescues * 20, 100)}`);
    if (v.propertyDamage > 0) parts.push(`Dmg -${v.propertyDamage * 5}`);
    return parts.join(', ') + ` (×${multiplier} ÷${heroCount})`;
  }

  _crimeLabel(crimeType) {
    const labels = {
      violent: "Violent Crime", destructive: "Destructive Crime",
      theft: "Theft", robbery: "Robbery", misdemeanor: "Misdemeanor",
      national: "National Offense", localConspiracy: "Local Conspiracy",
      nationalConspiracy: "National Conspiracy", globalConspiracy: "Global Conspiracy",
      other: "Other Crime"
    };
    return labels[crimeType] || crimeType;
  }

  async _addHeroKarmaEvent(hero, { amount, type, description, gameDate }) {
    const history = foundry.utils.deepClone(hero.system.karma?.history || []);
    history.push({
      timestamp: new Date().toISOString(),
      realDate: new Date().toLocaleDateString(),
      gameDate: gameDate || this._getGameDate(),
      amount, type, description
    });
    let earned = 0, spent = 0;
    history.forEach(e => { const a = Number(e.amount) || 0; if (a > 0) earned += a; else spent += Math.abs(a); });
    const adv = hero.system.karma?.advancement || 0;
    await hero.update({
      "system.karma.history": history,
      "system.karma.lifetime": earned,
      "system.attributes.karma.value": Math.max(0, earned - spent - adv)
    });
  }

  // ===== RANK UTILITY =====

  static getHighestRank(actor) {
    let highest = 0;
    let highLabel = "Shift-0";

    // Check FASERIP abilities
    const abilities = actor.system.abilities?.abilities || {};
    for (const key of Object.keys(abilities)) {
      const val = abilities[key]?.value || 0;
      if (val > highest) {
        highest = val;
        highLabel = abilities[key]?.rank || TeamSheet._rankLabelFromValue(val);
      }
    }

    // Check powers (items of type "power")
    for (const item of actor.items) {
      if (item.type === "power") {
        const val = item.system?.value || 0;
        if (val > highest) {
          highest = val;
          highLabel = item.system?.rank || TeamSheet._rankLabelFromValue(val);
        }
      }
    }

    return { rankValue: highest, rankLabel: highLabel };
  }

  static _rankLabelFromValue(val) {
    for (let i = TeamSheet.RANK_TABLE.length - 1; i >= 0; i--) {
      if (TeamSheet.RANK_TABLE[i].value <= val) return TeamSheet.RANK_TABLE[i].rank;
    }
    return "Shift-0";
  }

  // ===== AUTO-CAPTURE FROM COMBAT =====

  static registerCombatHook() {
    Hooks.on("deleteCombat", (combat) => {
      if (!game.user.isGM) return;
      console.log("[FASERIP] deleteCombat hook fired, combatants:", combat.combatants?.size);
      TeamSheet._captureDefeatedFromCombat(combat);
    });
    console.log("[FASERIP] Team tracker deleteCombat hook registered");
  }

  static async _captureDefeatedFromCombat(combat) {
    const teamMemberIds = game.settings.get("msh-faserip", "teamMembers") || [];
    if (!teamMemberIds.length) {
      console.log("[FASERIP] No team members set, skipping villain capture");
      return;
    }

    const heroCombatantIds = [];
    const villainCombatants = [];

    for (const c of combat.combatants) {
      const actor = c.actor;
      if (!actor) {
        console.log("[FASERIP] Combatant has no actor:", c.name);
        continue;
      }
      // Check disposition from multiple sources: token document, actor prototype, or actor type
      const tokenDisp = c.token?.disposition;
      const protoDisp = actor.prototypeToken?.disposition;
      const disp = tokenDisp ?? protoDisp ?? (actor.type === "villain" ? -1 : 0);
      console.log(`[FASERIP] Combatant: ${actor.name}, tokenDisp=${tokenDisp}, protoDisp=${protoDisp}, resolved=${disp}, type=${actor.type}`);

      if (teamMemberIds.includes(actor.id) || disp >= 0) {
        heroCombatantIds.push(actor.id);
      } else if (disp < 0) {
        villainCombatants.push(actor);
      }
    }

    if (!villainCombatants.length) {
      console.log("[FASERIP] No hostile combatants found in combat");
      return;
    }

    console.log(`[FASERIP] Found ${villainCombatants.length} villains, ${heroCombatantIds.length} heroes`);

    // Filter to unique actors, get highest rank
    const seen = new Set();
    const newVillains = [];
    for (const actor of villainCombatants) {
      if (seen.has(actor.id)) continue;
      seen.add(actor.id);
      const { rankValue, rankLabel } = TeamSheet.getHighestRank(actor);
      newVillains.push({
        name: actor.name,
        img: actor.img || "icons/svg/mystery-man.svg",
        actorId: actor.id,
        rankValue, rankLabel,
        defeated: true,
        presentHeroIds: [...heroCombatantIds],
        crimeType: "",
        stopped: false,
        arrested: false,
        rescues: 0,
        propertyDamage: 0,
        awarded: false,
        gameDate: TeamSheet._getGameDateStatic(),
        timestamp: new Date().toISOString()
      });
    }

    if (!newVillains.length) return;

    const villains = game.settings.get("msh-faserip", "defeatedVillains") || [];
    villains.push(...newVillains);
    await game.settings.set("msh-faserip", "defeatedVillains", villains);

    const names = newVillains.map(v => `${v.name} (${v.rankLabel})`).join(', ');
    ui.notifications.info(`[FASERIP] Combat ended — captured: ${names}`);

    // Re-render if open
    for (const w of Object.values(ui.windows)) {
      if (w instanceof TeamSheet) w.render(true);
    }
  }

  static _getGameDateStatic() {
    try {
      const d = game.msh.getCampaignDateTime().date;
      return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    } catch { return ""; }
  }

  // ===== TIME SETTINGS =====

  _getGameDate() {
    try {
      const d = game.msh.getCampaignDateTime().date;
      return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    } catch { return ""; }
  }

  _onTimeSettings(event) {
    event.preventDefault();
    let ct, startDate;
    try {
      ct = game.msh.getCampaignDateTime();
      startDate = game.settings.get("msh-faserip", "campaignStartDate");
    } catch {
      ui.notifications.warn("Campaign time not available.");
      return;
    }
    new Dialog({
      title: "Time Settings",
      content: `<form>
        <div class="form-group"><label>Campaign Start</label>
          <input type="datetime-local" name="startDateTime" value="${startDate.slice(0, 16)}" style="width:100%;padding:5px;"></div>
        <div class="form-group"><label>Current Time</label>
          <input type="datetime-local" name="currentDateTime" value="${ct.date.toISOString().slice(0, 16)}" style="width:100%;padding:5px;">
          <p class="notes">Elapsed: ${Math.floor(ct.elapsedSeconds / 86400)}d ${Math.floor((ct.elapsedSeconds % 86400) / 3600)}h</p></div>
        <div class="form-group"><label><input type="checkbox" name="combatSync" ${game.settings.get("msh-faserip", "combatSyncEnabled") ? "checked" : ""}> Auto-sync combat (6s/round)</label></div>
      </form>`,
      buttons: {
        save: { icon: '<i class="fas fa-save"></i>', label: "Save",
          callback: async (html) => {
            const ns = html.find('[name="startDateTime"]').val() + ":00";
            const nc = html.find('[name="currentDateTime"]').val() + ":00";
            const cs = html.find('[name="combatSync"]').prop('checked');
            const sd = new Date(ns), cd = new Date(nc);
            const ctt = game.modules.get("calendar-time-tracker");
            const auth = game.settings.get("msh-faserip", "ctt.timeAuthority") ?? false;
            if (auth && ctt?.active && ctt.api) {
              await game.settings.set("msh-faserip", "campaignStartDate", ns);
              await game.settings.set("msh-faserip", "combatSyncEnabled", cs);
              ctt.api.setDateTime({ year: cd.getFullYear(), month: cd.getMonth(), day: cd.getDate(),
                hour: cd.getHours(), minute: cd.getMinutes(), second: cd.getSeconds() });
            } else {
              const el = Math.floor((cd - sd) / 1000);
              await game.settings.set("msh-faserip", "campaignStartDate", ns);
              await game.settings.set("msh-faserip", "campaignStartWorldTime", game.time.worldTime - el);
              await game.settings.set("msh-faserip", "combatSyncEnabled", cs);
            }
            ui.notifications.info("Time settings updated");
            this.render(false);
            Hooks.callAll("msh-faserip.timeUpdated");
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      }, default: "save"
    }).render(true);
  }

} // end TeamSheet