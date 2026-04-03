// teamSheet.js v4.1.0 - 2026-03-21
// v4.1.0: Add Event type (foe-less karma events) alongside encounters.
//         GM Award field on both events and encounters. Missing karma types added.
export class TeamSheet extends Application {

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
    this._expandedEncounters = new Set();
    this._timeUpdateHook = Hooks.on("msh-faserip.timeUpdated", () => {
      if (this.rendered) this.render(false);
    });
    // Re-render when team HQ actor items change
    this._itemHook = Hooks.on("updateItem", (item) => {
      const hqActorId = game.settings.get("msh-faserip", "teamHQActorId");
      if (hqActorId && item.parent?.id === hqActorId && this.rendered) this.render(false);
    });
    this._createItemHook = Hooks.on("createItem", (item) => {
      const hqActorId = game.settings.get("msh-faserip", "teamHQActorId");
      if (hqActorId && item.parent?.id === hqActorId && this.rendered) this.render(false);
    });
    this._deleteItemHook = Hooks.on("deleteItem", (item) => {
      const hqActorId = game.settings.get("msh-faserip", "teamHQActorId");
      if (hqActorId && item.parent?.id === hqActorId && this.rendered) this.render(false);
    });
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip", "sheet", "team-tracker"],
      template: "systems/msh-faserip/templates/team-sheet.html",
      width: 500, height: 560, resizable: true, title: "Team Tracker",
      scrollY: [".tracker-body"]
    });
  }

  async close(options) {
    if (this._timeUpdateHook) Hooks.off("msh-faserip.timeUpdated", this._timeUpdateHook);
    if (this._itemHook) Hooks.off("updateItem", this._itemHook);
    if (this._createItemHook) Hooks.off("createItem", this._createItemHook);
    if (this._deleteItemHook) Hooks.off("deleteItem", this._deleteItemHook);
    return super.close(options);
  }

  // ===== DATA =====

  getData() {
    const context = super.getData();
    context.isGM = game.user.isGM;
    context.removeMode = this._removeMode;
    context.hqExpanded = this._hqExpanded ?? false;
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

    context.teamKarmaPool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;

    // Campaign date/time for header
    const { gameDate, gameTime } = TeamSheet._getGameDateTimeStatic();
    context.campaignDateTime = [gameDate, gameTime].filter(Boolean).join(' ') || "";

    const multiplier = game.settings.get("msh-faserip", "karmaMultiplier") || 1;
    context.karmaMultiplier = multiplier;
    context.multiplierOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    // Encounters — migrate v3 flat villains to v4 encounter format
    let encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
    let needsMigration = false;
    encounters = encounters.map(entry => {
      if (entry.villains) return entry; // already v4
      needsMigration = true;
      return {
        id: entry.id || `enc_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
        villains: [{ name: entry.name, img: entry.img, actorId: entry.actorId || null,
                     rankValue: entry.rankValue || 0, rankLabel: entry.rankLabel || "Unknown" }],
        presentHeroIds: entry.presentHeroIds || [],
        crimeType: entry.crimeType || "", stopped: entry.stopped || false, arrested: entry.arrested || false,
        rescues: entry.rescues || 0, losses: entry.propertyDamage ? entry.propertyDamage * 5 : 0,
        awarded: entry.awarded || false,
        gameDate: entry.gameDate || "", gameTime: entry.gameTime || "",
        timestamp: entry.timestamp || new Date().toISOString()
      };
    });
    if (needsMigration) {
      game.settings.set("msh-faserip", "defeatedVillains", encounters);
      console.log("[FASERIP] Migrated defeated villains from v3 to v4 encounter format");
    }
    context.encounters = encounters.map((enc, idx) => {
      const expanded = this._expandedEncounters.has(idx);
      const villainRows = (enc.villains || []).map(v => {
        const count = Math.max(1, v.count || 1);
        const eligible = v.rankValue >= 30;
        const foeKarma = eligible ? v.rankValue * count : 0;
        return { ...v, count, eligible, subRemarkable: !eligible, foeKarma };
      });
      const hasFoes = villainRows.length > 0;
      const hasName = !!(enc.name && enc.name.trim());
      const foeTotal = villainRows.reduce((sum, v) => sum + v.foeKarma, 0);

      const crimeVals = enc.crimeType ? TeamSheet.CRIME_VALUES[enc.crimeType] : null;
      const stopValue = crimeVals && enc.stopped ? crimeVals.stop : 0;
      const arrestValue = crimeVals && enc.arrested ? crimeVals.arrest : 0;
      const rescueKarma = Math.min((enc.rescues || 0) * 20, 100);
      const gmAward = Math.max(0, enc.gmAward || 0);
      const lossKarma = -Math.abs(enc.losses || 0);

      // Custom award line items
      const bonuses = Array.isArray(enc.bonuses) ? enc.bonuses : [];
      const bonusPositive = bonuses.reduce((sum, b) => sum + Math.max(0, b.amount || 0), 0);
      const bonusNegative = bonuses.reduce((sum, b) => sum + Math.min(0, b.amount || 0), 0);

      const positiveTotal = foeTotal + stopValue + arrestValue + rescueKarma + gmAward + bonusPositive;
      const totalLoss = lossKarma + bonusNegative;
      const positiveMultiplied = positiveTotal * multiplier;
      const presentIds = (enc.presentHeroIds || []).filter(id => game.actors.get(id));
      const heroCount = Math.max(1, presentIds.length);
      const perHeroPositive = Math.floor(positiveMultiplied / heroCount);
      const perHeroLoss = totalLoss ? Math.floor(totalLoss / heroCount) : 0;
      const perHeroNet = perHeroPositive + perHeroLoss;

      const heroChecks = (context.teamMembers || []).map(tm => ({
        id: tm.id, name: tm.name, img: tm.img,
        present: (enc.presentHeroIds || []).includes(tm.id)
      }));

      const villainNames = villainRows.map(v => v.name).join(', ');
      const displayName = hasName ? enc.name : (villainNames || "Encounter");
      const dateDisplay = [enc.gameDate, enc.gameTime].filter(Boolean).join(' ');

      return {
        ...enc, expanded, hasFoes, hasName, villainRows, foeTotal,
        stopValue, arrestValue, rescueKarma, gmAward, lossKarma,
        bonuses, bonusPositive, bonusNegative: bonusNegative || 0,
        positiveTotal, positiveMultiplied, heroCount,
        perHeroPositive, perHeroLoss, perHeroNet,
        heroChecks, villainNames, displayName, dateDisplay,
        crimeType: enc.crimeType || "",
        hasPositive: positiveTotal > 0
      };
    });

    context.encounterCount = context.encounters.length;

    // Team Headquarters
    const hqActorId = game.settings.get("msh-faserip", "teamHQActorId");
    const hqActor = hqActorId ? game.actors.get(hqActorId) : null;
    context.teamHQs = hqActor ? hqActor.items.filter(i => i.type === "headquarters").map(i => ({ id: i.id, name: i.name, img: i.img, location: i.system.location, size: i.system.size, materialStrength: i.system.materialStrength, ownership: i.system.ownership, purchaseCost: i.system.purchaseCost, rentCost: i.system.rentCost })) : [];

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
      this._removeMode = !this._removeMode; this.render(false);
    });
    html.find('.remove-hero-from-team').click(ev => this._onRemoveHeroFromTeam(ev));
    html.find('.award-session-bonus').click(ev => this._onAwardSessionBonus(ev));
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

    html.find('.multiplier-select').change(async (ev) => {
      await game.settings.set("msh-faserip", "karmaMultiplier", Number(ev.target.value));
      this.render(true);
    });
    html.find('.time-settings-btn').click(ev => this._onTimeSettings(ev));

    // Encounter expand/collapse
    html.find('.encounter-header').click(ev => {
      if (ev.target.closest('button, a, input, select')) return;
      const idx = Number(ev.currentTarget.dataset.encIdx);
      if (this._expandedEncounters.has(idx)) this._expandedEncounters.delete(idx);
      else this._expandedEncounters.add(idx);
      this.render(false);
    });

    // Encounter controls
    html.find('.hero-present-toggle').change(ev => this._onToggleHeroPresent(ev));
    html.find('.crime-type-select').change(ev => this._onEncFieldChange(ev, 'crimeType', ev.currentTarget.value, true));
    html.find('.crime-stopped-toggle').change(ev => this._onEncFieldChange(ev, 'stopped', ev.currentTarget.checked));
    html.find('.crime-arrested-toggle').change(ev => this._onEncFieldChange(ev, 'arrested', ev.currentTarget.checked));
    html.find('.rescue-count').change(ev => this._onEncNumericChange(ev, 'rescues'));
    html.find('.loss-amount').change(ev => this._onEncNumericChange(ev, 'losses'));

    // Actions
    html.find('.add-encounter-manual').click(() => this._onAddEncounter());
    html.find('.add-foe-to-encounter').click(ev => this._onAddFoeToEncounter(ev));
    html.find('.delete-foe').click(ev => this._onDeleteFoe(ev));
    html.find('.delete-encounter').click(ev => this._onDeleteEncounter(ev));
    html.find('.award-encounter-heroes').click(ev => this._onAwardEncounterToHeroes(ev));
    html.find('.award-encounter-pool').click(ev => this._onAwardEncounterToPool(ev));
    html.find('.undo-award').click(ev => this._onUndoAward(ev));
    html.find('.gm-award-amount').change(ev => this._onEncNumericChange(ev, 'gmAward'));
    html.find('.add-bonus-item').click(ev => this._onAddBonusItem(ev));
    html.find('.delete-bonus').click(ev => this._onDeleteBonusItem(ev));
    html.find('.bonus-label-input').change(ev => this._onBonusFieldChange(ev, 'label'));
    html.find('.bonus-amount-input').change(ev => this._onBonusFieldChange(ev, 'amount'));
    html.find('.enc-name-input').change(ev => {
      const idx = Number(ev.currentTarget.dataset.encIdx);
      this._updateEncField(idx, 'name', ev.currentTarget.value.trim());
    });

    // Team HQ
    html.find('.hq-toggle').click(ev => {
      if ($(ev.target).closest('.section-btns').length) return;
      this._hqExpanded = !this._hqExpanded;
      html.find('.team-hq-body').slideToggle(150);
      html.find('.hq-toggle-icon').toggleClass('fa-chevron-right fa-chevron-down');
    });
    html.find('.add-team-hq').click(() => this._onAddTeamHQ());
    html.find('.edit-team-hq').click(ev => this._onEditTeamHQ(ev.currentTarget.dataset.hqId));
    html.find('.delete-team-hq').click(ev => this._onDeleteTeamHQ(ev.currentTarget.dataset.hqId));
    html.find('.process-rent-btn').click(() => this._onProcessRent());
    html.find('.team-hq-img').click(ev => this._onViewTeamHQ(ev.currentTarget.dataset.hqId));
  }

  // ===== TEAM =====

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

  // ===== ENCOUNTER FIELDS =====

  async _updateEncField(idx, field, value) {
    const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
    if (idx < 0 || idx >= encounters.length) return;
    encounters[idx][field] = value;
    await game.settings.set("msh-faserip", "defeatedVillains", encounters);
    this.render(false);
  }

  _onEncFieldChange(ev, field, value, resetFlags) {
    const idx = Number(ev.currentTarget.dataset.encIdx);
    if (resetFlags && field === 'crimeType' && !value) {
      const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
      if (encounters[idx]) {
        encounters[idx].crimeType = "";
        encounters[idx].stopped = false;
        encounters[idx].arrested = false;
        game.settings.set("msh-faserip", "defeatedVillains", encounters).then(() => this.render(false));
      }
      return;
    }
    this._updateEncField(idx, field, value);
  }

  _onEncNumericChange(ev, field) {
    const idx = Number(ev.currentTarget.dataset.encIdx);
    this._updateEncField(idx, field, Math.max(0, Number(ev.currentTarget.value) || 0));
  }

  async _onAddBonusItem(ev) {
    ev.stopPropagation();
    const idx = Number(ev.currentTarget.dataset.encIdx);
    const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
    if (!encounters[idx]) return;
    if (!Array.isArray(encounters[idx].bonuses)) encounters[idx].bonuses = [];
    encounters[idx].bonuses.push({ label: "", amount: 10 });
    await game.settings.set("msh-faserip", "defeatedVillains", encounters);
    this.render(false);
  }

  async _onDeleteBonusItem(ev) {
    ev.stopPropagation();
    const encIdx = Number(ev.currentTarget.dataset.encIdx);
    const bonusIdx = Number(ev.currentTarget.dataset.bonusIdx);
    const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
    if (!encounters[encIdx]?.bonuses) return;
    encounters[encIdx].bonuses.splice(bonusIdx, 1);
    await game.settings.set("msh-faserip", "defeatedVillains", encounters);
    this.render(false);
  }

  async _onBonusFieldChange(ev, field) {
    const encIdx = Number(ev.currentTarget.dataset.encIdx);
    const bonusIdx = Number(ev.currentTarget.dataset.bonusIdx);
    const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
    if (!encounters[encIdx]?.bonuses?.[bonusIdx]) return;
    const val = field === 'amount' ? (Number(ev.currentTarget.value) || 0) : ev.currentTarget.value.trim();
    encounters[encIdx].bonuses[bonusIdx][field] = val;
    await game.settings.set("msh-faserip", "defeatedVillains", encounters);
    this.render(false);
  }

  _onToggleHeroPresent(ev) {
    const idx = Number(ev.currentTarget.dataset.encIdx);
    const heroId = ev.currentTarget.dataset.heroId;
    const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
    if (!encounters[idx]) return;
    const ids = new Set(encounters[idx].presentHeroIds || []);
    if (ev.currentTarget.checked) ids.add(heroId); else ids.delete(heroId);
    this._updateEncField(idx, 'presentHeroIds', [...ids]);
  }

  // ===== ADD / DELETE =====

  _onAddEncounter() {
    if (!game.user.isGM) return;
    const { gameDate, gameTime } = TeamSheet._getGameDateTimeStatic();
    const foeList = [];

    const hostiles = game.actors.filter(a =>
      (a.type === "npc" || a.type === "villain" || a.type === "hero") &&
      a.prototypeToken.disposition < 0
    ).sort((a, b) => a.name.localeCompare(b.name));

    const hostileOpts = hostiles.map(a => {
      const { rankValue, rankLabel } = TeamSheet.getHighestRank(a);
      return `<option value="${a.id}" data-rank="${rankValue}" data-label="${rankLabel}">${a.name} — ${rankLabel}(${rankValue})</option>`;
    }).join('');
    const rankOpts = TeamSheet.RANK_TABLE.map(r =>
      `<option value="${r.value}" data-label="${r.rank}">${r.rank} (${r.value})</option>`
    ).join('');
    const crimeOpts = Object.entries({
      "": "— None —",
      violent: "Violent Crime (30/15)", destructive: "Destructive Crime (20/10)",
      theft: "Theft (10/5)", robbery: "Robbery (20/10)",
      misdemeanor: "Misdemeanor (5/5)", national: "National Offense (20/10)",
      localConspiracy: "Local Conspiracy (30/15)", nationalConspiracy: "National Conspiracy (40/20)",
      globalConspiracy: "Global Conspiracy (50/25)", other: "Other Crimes (15/5)"
    }).map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

    const renderFoeList = (html) => {
      const container = html.find('.enc-foe-list');
      if (!foeList.length) {
        container.html('<div style="font-size:11px;color:#888;font-style:italic;padding:2px 4px;">No foes added.</div>');
        return;
      }
      container.html(foeList.map((f, i) =>
        `<div style="display:flex;align-items:center;gap:4px;padding:3px 4px;${i ? 'border-top:1px solid #eee;' : ''}">
          <i class="fas fa-skull" style="color:#8b0000;font-size:10px;flex-shrink:0;"></i>
          <span style="flex:1;font-weight:600;font-size:12px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.name}</span>
          <span style="font-size:11px;color:#666;white-space:nowrap;">${f.rankLabel}(${f.rankValue})</span>
          <button type="button" class="enc-foe-dec" data-idx="${i}" style="width:18px;height:18px;padding:0;font-size:10px;border:1px solid #aaa;border-radius:2px;background:#f5f5f5;cursor:pointer;line-height:1;">−</button>
          <span style="font-size:12px;font-weight:700;min-width:16px;text-align:center;">×${f.count}</span>
          <button type="button" class="enc-foe-inc" data-idx="${i}" style="width:18px;height:18px;padding:0;font-size:10px;border:1px solid #aaa;border-radius:2px;background:#f5f5f5;cursor:pointer;line-height:1;">+</button>
          <a class="enc-remove-foe" data-idx="${i}" style="color:#999;cursor:pointer;font-size:10px;flex-shrink:0;" title="Remove"><i class="fas fa-times"></i></a>
        </div>`
      ).join(''));
      container.find('.enc-foe-inc').on('click', (ev) => {
        foeList[Number(ev.currentTarget.dataset.idx)].count++;
        renderFoeList(html);
      });
      container.find('.enc-foe-dec').on('click', (ev) => {
        const idx = Number(ev.currentTarget.dataset.idx);
        if (foeList[idx].count > 1) foeList[idx].count--;
        renderFoeList(html);
      });
      container.find('.enc-remove-foe').on('click', (ev) => {
        foeList.splice(Number(ev.currentTarget.dataset.idx), 1);
        renderFoeList(html);
      });
    };

    const bonusList = [];

    const renderBonusList = (html) => {
      const container = html.find('.enc-bonus-list');
      if (!bonusList.length) {
        container.html('<div style="font-size:11px;color:#888;font-style:italic;padding:2px 4px;">No awards added.</div>');
        return;
      }
      container.html(bonusList.map((b, i) =>
        `<div style="display:flex;align-items:center;gap:4px;padding:3px 4px;${i ? 'border-top:1px solid #eee;' : ''}">
          <span style="flex:1;font-size:12px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${b.label || '(unnamed)'}</span>
          <span style="font-size:12px;font-weight:700;color:${b.amount >= 0 ? '#1b5e20' : '#b71c1c'};white-space:nowrap;">${b.amount >= 0 ? '+' : ''}${b.amount}</span>
          <a class="enc-remove-bonus" data-idx="${i}" style="color:#999;cursor:pointer;font-size:10px;flex-shrink:0;" title="Remove"><i class="fas fa-times"></i></a>
        </div>`
      ).join(''));
      container.find('.enc-remove-bonus').on('click', (ev) => {
        bonusList.splice(Number(ev.currentTarget.dataset.idx), 1);
        renderBonusList(html);
      });
    };

    new Dialog({
      title: "Add Encounter",
      content: `<form style="display:flex;flex-direction:column;gap:0;">
        <!-- Name -->
        <div style="margin-bottom:6px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;margin-bottom:2px;">Name</div>
          <input type="text" name="encName" placeholder="e.g., Ch2: Wideawake Ambush" style="width:100%;box-sizing:border-box;padding:4px 6px;font-size:13px;" />
        </div>

        <!-- Date / Time compact row -->
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <div style="flex:1;">
            <div style="font-size:10px;color:#666;margin-bottom:1px;">Date</div>
            <input type="text" name="gameDate" value="${gameDate}" style="width:100%;box-sizing:border-box;padding:3px 5px;font-size:12px;" />
          </div>
          <div style="flex:1;">
            <div style="font-size:10px;color:#666;margin-bottom:1px;">Time</div>
            <input type="text" name="gameTime" value="${gameTime}" style="width:100%;box-sizing:border-box;padding:3px 5px;font-size:12px;" />
          </div>
        </div>

        <!-- Award Line Items (primary section) -->
        <div style="border:2px solid #8b0000;border-radius:4px;padding:6px 8px;margin-bottom:8px;background:#fefefe;">
          <div style="font-size:12px;font-weight:700;color:#8b0000;text-transform:uppercase;letter-spacing:.3px;margin-bottom:4px;">Karma Awards</div>
          <div class="enc-bonus-list" style="min-height:24px;margin-bottom:6px;padding:3px;background:#fafafa;border:1px solid #ddd;border-radius:3px;">
            <div style="font-size:11px;color:#888;font-style:italic;padding:2px 4px;">No awards yet — add task rewards, milestone bonuses, or penalties below.</div>
          </div>
          <div style="display:flex;gap:6px;align-items:flex-end;">
            <div style="flex:1;min-width:0;">
              <div style="font-size:10px;color:#666;margin-bottom:1px;">Label</div>
              <input type="text" name="bonusLabel" placeholder="e.g., Protecting Hargrove" style="width:100%;box-sizing:border-box;padding:3px 5px;font-size:12px;" />
            </div>
            <div style="width:55px;">
              <div style="font-size:10px;color:#666;margin-bottom:1px;">Amt</div>
              <input type="number" name="bonusAmount" value="10" style="width:100%;box-sizing:border-box;padding:3px 4px;font-size:12px;text-align:center;" />
            </div>
            <button type="button" class="enc-add-bonus-btn" style="padding:4px 8px;font-size:11px;font-weight:700;color:#fff;background:#8b0000;border:0;border-radius:3px;cursor:pointer;white-space:nowrap;">+</button>
          </div>
        </div>

        <!-- Collapsible: Standard FASERIP Awards -->
        <details class="enc-standard-section" style="margin-bottom:4px;border:1px solid #ccc;border-radius:3px;background:#f9f9f6;">
          <summary style="padding:5px 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:#555;cursor:pointer;user-select:none;">
            Standard Awards (foes, crime, rescues…)
          </summary>
          <div style="padding:6px 8px;display:flex;flex-direction:column;gap:6px;">

            <!-- Foes -->
            <div>
              <div style="font-size:10px;font-weight:700;color:#666;text-transform:uppercase;margin-bottom:2px;">Foes</div>
              <div class="enc-foe-list" style="min-height:20px;padding:2px;background:#fff;border:1px solid #ddd;border-radius:3px;margin-bottom:4px;">
                <div style="font-size:11px;color:#888;font-style:italic;padding:2px 4px;">No foes added.</div>
              </div>
              <div style="margin-bottom:2px;">
                <div style="font-size:10px;color:#666;margin-bottom:1px;">Pick actor</div>
                <select name="actorId" style="width:100%;font-size:12px;padding:2px 4px;margin-bottom:4px;"><option value="">— Manual entry —</option>${hostileOpts}</select>
              </div>
              <div style="display:flex;gap:6px;align-items:flex-end;">
                <div style="flex:1;min-width:0;">
                  <div style="font-size:10px;color:#666;margin-bottom:1px;">Name</div>
                  <input type="text" name="foeName" placeholder="e.g., Rhino" style="width:100%;box-sizing:border-box;padding:3px 5px;font-size:12px;" />
                </div>
                <div style="width:110px;">
                  <div style="font-size:10px;color:#666;margin-bottom:1px;">Rank</div>
                  <select name="rank" style="width:100%;font-size:12px;padding:2px 4px;">${rankOpts}</select>
                </div>
                <button type="button" class="enc-add-foe-btn" style="padding:4px 8px;font-size:11px;font-weight:700;color:#fff;background:#8b0000;border:0;border-radius:3px;cursor:pointer;white-space:nowrap;">+ Foe</button>
              </div>
            </div>

            <!-- Crime -->
            <div>
              <div style="font-size:10px;font-weight:700;color:#666;text-transform:uppercase;margin-bottom:2px;">Crime</div>
              <select name="crimeType" style="width:100%;font-size:12px;padding:2px 4px;">${crimeOpts}</select>
            </div>

            <!-- Rescues / Losses / GM Award -->
            <div style="display:flex;gap:8px;">
              <div style="flex:1;">
                <div style="font-size:10px;color:#666;margin-bottom:1px;">Rescues</div>
                <input type="number" name="rescues" value="0" min="0" max="99" style="width:100%;box-sizing:border-box;padding:3px 4px;font-size:12px;text-align:center;" />
              </div>
              <div style="flex:1;">
                <div style="font-size:10px;color:#666;margin-bottom:1px;">Losses</div>
                <input type="number" name="losses" value="0" min="0" max="9999" style="width:100%;box-sizing:border-box;padding:3px 4px;font-size:12px;text-align:center;" />
              </div>
              <div style="flex:1;">
                <div style="font-size:10px;color:#666;margin-bottom:1px;">GM Award</div>
                <input type="number" name="gmAward" value="0" min="0" max="9999" style="width:100%;box-sizing:border-box;padding:3px 4px;font-size:12px;text-align:center;" />
              </div>
            </div>

          </div>
        </details>
      </form>`,
      buttons: {
        add: { icon: '<i class="fas fa-plus"></i>', label: "Create",
          callback: async (html) => {
            const encName = html.find('[name="encName"]').val()?.trim() || "";
            const evtDate = html.find('[name="gameDate"]').val()?.trim() || gameDate;
            const evtTime = html.find('[name="gameTime"]').val()?.trim() || gameTime;
            const crimeType = html.find('[name="crimeType"]').val() || "";
            const rescues = Math.max(0, Number(html.find('[name="rescues"]').val()) || 0);
            const losses = Math.max(0, Number(html.find('[name="losses"]').val()) || 0);
            const gmAward = Math.max(0, Number(html.find('[name="gmAward"]').val()) || 0);
            const teamIds = game.settings.get("msh-faserip", "teamMembers") || [];

            const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
            encounters.push({
              id: `enc_${Date.now()}`,
              name: encName,
              villains: [...foeList],
              presentHeroIds: [...teamIds],
              crimeType, stopped: !!crimeType, arrested: false,
              rescues, losses, gmAward, bonuses: [...bonusList],
              awarded: false,
              gameDate: evtDate, gameTime: evtTime,
              timestamp: new Date().toISOString()
            });
            await game.settings.set("msh-faserip", "defeatedVillains", encounters);
            this._expandedEncounters.add(encounters.length - 1);
            this.render(true);
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "add",
      render: (html) => {
        // Actor picker auto-fills foe name/rank
        html.find('[name="actorId"]').on('change', () => {
          const sel = html.find('[name="actorId"]');
          if (sel.val()) {
            html.find('[name="foeName"]').val(sel.find(':selected').text().split(' — ')[0]);
            html.find('[name="rank"]').val(Number(sel.find(':selected').data('rank')));
          } else {
            html.find('[name="foeName"]').val('');
          }
        });
        // Add foe
        html.find('.enc-add-foe-btn').on('click', () => {
          const actorId = html.find('[name="actorId"]').val();
          let name, img, rankValue, rankLabel;
          if (actorId) {
            const actor = game.actors.get(actorId);
            if (!actor) return;
            name = actor.name;
            img = actor.img || "icons/svg/mystery-man.svg";
            ({ rankValue, rankLabel } = TeamSheet.getHighestRank(actor));
          } else {
            name = html.find('[name="foeName"]').val()?.trim();
            if (!name) { ui.notifications.warn("Enter a villain name or pick an actor"); return; }
            img = "icons/svg/mystery-man.svg";
            rankValue = Number(html.find('[name="rank"]').val()) || 0;
            rankLabel = html.find('[name="rank"] option:selected').data('label') || "Unknown";
          }
          foeList.push({ name, img, actorId: actorId || null, rankValue, rankLabel, count: 1 });
          html.find('[name="actorId"]').val('');
          html.find('[name="foeName"]').val('');
          renderFoeList(html);
        });
        // Add bonus line item
        html.find('.enc-add-bonus-btn').on('click', () => {
          const label = html.find('[name="bonusLabel"]').val()?.trim();
          if (!label) { ui.notifications.warn("Enter an award label"); return; }
          const amount = Number(html.find('[name="bonusAmount"]').val()) || 0;
          if (amount === 0) { ui.notifications.warn("Amount cannot be 0"); return; }
          bonusList.push({ label, amount });
          html.find('[name="bonusLabel"]').val('');
          html.find('[name="bonusAmount"]').val('10');
          renderBonusList(html);
        });
      }
    }).render(true);
  }

  _onAddFoeToEncounter(ev) {
    ev.stopPropagation();
    if (!game.user.isGM) return;
    const encIdx = Number(ev.currentTarget.dataset.encIdx);

    const hostiles = game.actors.filter(a =>
      (a.type === "npc" || a.type === "villain" || a.type === "hero") &&
      a.prototypeToken.disposition < 0
    ).sort((a, b) => a.name.localeCompare(b.name));

    const hostileOpts = hostiles.map(a => {
      const { rankValue, rankLabel } = TeamSheet.getHighestRank(a);
      return `<option value="${a.id}" data-rank="${rankValue}" data-label="${rankLabel}">${a.name} — ${rankLabel}(${rankValue})</option>`;
    }).join('');
    const rankOpts = TeamSheet.RANK_TABLE.map(r =>
      `<option value="${r.value}" data-label="${r.rank}">${r.rank} (${r.value})</option>`
    ).join('');

    new Dialog({
      title: "Add Foe to Encounter",
      content: `<form>
        <div class="form-group"><label>Pick from actors:</label>
          <select name="actorId" style="width:100%"><option value="">— Manual entry —</option>${hostileOpts}</select></div>
        <hr/>
        <div class="form-group"><label>Villain Name:</label>
          <input type="text" name="name" placeholder="e.g., Rhino" /></div>
        <div class="form-group"><label>Highest Rank:</label>
          <select name="rank" style="width:100%">${rankOpts}</select></div>
      </form>`,
      buttons: {
        add: { icon: '<i class="fas fa-skull"></i>', label: "Add",
          callback: async (html) => {
            const actorId = html.find('[name="actorId"]').val();
            let name, img, rankValue, rankLabel;
            if (actorId) {
              const actor = game.actors.get(actorId);
              if (!actor) return;
              name = actor.name; img = actor.img || "icons/svg/mystery-man.svg";
              ({ rankValue, rankLabel } = TeamSheet.getHighestRank(actor));
            } else {
              name = html.find('[name="name"]').val()?.trim();
              if (!name) { ui.notifications.warn("Enter a villain name"); return; }
              img = "icons/svg/mystery-man.svg";
              rankValue = Number(html.find('[name="rank"]').val()) || 0;
              rankLabel = html.find('[name="rank"] option:selected').data('label') || "Unknown";
            }
            const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
            if (!encounters[encIdx]) return;
            encounters[encIdx].villains.push({ name, img, actorId: actorId || null, rankValue, rankLabel });
            await game.settings.set("msh-faserip", "defeatedVillains", encounters);
            this.render(true);
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "add",
      render: (html) => {
        html.find('[name="actorId"]').on('change', () => {
          const sel = html.find('[name="actorId"]');
          if (sel.val()) {
            html.find('[name="name"]').val(sel.find(':selected').text().split(' — ')[0]);
            html.find('[name="rank"]').val(Number(sel.find(':selected').data('rank')));
          }
        });
      }
    }).render(true);
  }

  async _addEncounter(villains, presentHeroIds) {
    const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
    const { gameDate, gameTime } = TeamSheet._getGameDateTimeStatic();
    encounters.push({
      id: `enc_${Date.now()}`,
      villains,
      presentHeroIds: presentHeroIds || [],
      crimeType: "", stopped: false, arrested: false,
      rescues: 0, losses: 0, bonuses: [],
      awarded: false,
      gameDate, gameTime,
      timestamp: new Date().toISOString()
    });
    await game.settings.set("msh-faserip", "defeatedVillains", encounters);
    this._expandedEncounters.add(encounters.length - 1);
    this.render(true);
  }

  async _onDeleteFoe(ev) {
    ev.stopPropagation();
    const encIdx = Number(ev.currentTarget.dataset.encIdx);
    const foeIdx = Number(ev.currentTarget.dataset.foeIdx);
    const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
    if (!encounters[encIdx]?.villains?.[foeIdx]) return;
    const name = encounters[encIdx].villains[foeIdx].name;
    if (!await Dialog.confirm({ title: "Remove Foe", content: `<p>Remove <strong>${name}</strong>?</p>` })) return;
    encounters[encIdx].villains.splice(foeIdx, 1);
    if (!encounters[encIdx].villains.length) {
      encounters.splice(encIdx, 1);
      this._rebuildExpandedSet(encIdx);
    }
    await game.settings.set("msh-faserip", "defeatedVillains", encounters);
    this.render(true);
  }

  async _onDeleteEncounter(ev) {
    ev.stopPropagation();
    const idx = Number(ev.currentTarget.dataset.encIdx);
    const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
    if (!encounters[idx]) return;
    const entry = encounters[idx];
    const names = entry.type === "event" ? (entry.name || "Event") : (entry.villains || []).map(v => v.name).join(', ') || 'Unknown';
    if (!await Dialog.confirm({ title: "Delete Encounter", content: `<p>Delete ${entry.type === "event" ? "event" : "encounter"} (${names})?</p>` })) return;
    encounters.splice(idx, 1);
    this._rebuildExpandedSet(idx);
    await game.settings.set("msh-faserip", "defeatedVillains", encounters);
    this.render(true);
  }

  _rebuildExpandedSet(removedIdx) {
    this._expandedEncounters.delete(removedIdx);
    const s = new Set();
    for (const i of this._expandedEncounters) {
      if (i > removedIdx) s.add(i - 1); else if (i < removedIdx) s.add(i);
    }
    this._expandedEncounters = s;
  }

  // ===== AWARD =====

  async _onAwardEncounterToHeroes(ev) {
    ev.stopPropagation();
    if (!game.user.isGM) return;
    const idx = Number(ev.currentTarget.dataset.encIdx);
    const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
    const enc = encounters[idx];
    if (!enc || enc.awarded) return;

    const multiplier = game.settings.get("msh-faserip", "karmaMultiplier") || 1;
    const heroes = (enc.presentHeroIds || []).map(id => game.actors.get(id)).filter(Boolean);
    if (!heroes.length) { ui.notifications.warn("No heroes marked as present"); return; }

    const { positiveTotal, lossKarma } = this._calcEncounterTotals(enc);
    const perHeroPos = Math.floor((positiveTotal * multiplier) / heroes.length);
    const perHeroLoss = lossKarma ? Math.floor(lossKarma / heroes.length) : 0;
    const net = perHeroPos + perHeroLoss;

    const breakdown = this._buildBreakdownText(enc, multiplier, heroes.length);
    const encLabel = enc.name || enc.villains.map(v => v.name).join(', ') || "Encounter";
    if (!await Dialog.confirm({
      title: `Award — ${encLabel}`,
      content: `<p>${breakdown}</p><p>Award <strong>+${perHeroPos}</strong>${perHeroLoss ? ` / <strong>${perHeroLoss}</strong> loss` : ''} (net <strong>${net}</strong>) to each of <strong>${heroes.length}</strong> heroes?</p>`
    })) return;

    const gameDate = enc.gameDate || TeamSheet._getGameDateTimeStatic().gameDate;
    const foeNames = enc.villains.filter(v => v.rankValue >= 30).map(v => `${v.name}(${v.rankValue})`).join('+');
    const descParts = [];
    if (enc.name) descParts.push(enc.name);
    if (foeNames) descParts.push(`Foe: ${foeNames}`);
    if (enc.stopped) descParts.push(`Stop ${this._crimeLabel(enc.crimeType)}`);
    if (enc.arrested) descParts.push(`Arrest ${this._crimeLabel(enc.crimeType)}`);
    if (enc.rescues > 0) descParts.push(`Rescue ×${enc.rescues}`);
    if (enc.gmAward > 0) descParts.push(`GM +${enc.gmAward}`);
    const bonuses = Array.isArray(enc.bonuses) ? enc.bonuses : [];
    for (const b of bonuses) {
      if (b.amount && b.label) descParts.push(`${b.label} ${b.amount > 0 ? '+' : ''}${b.amount}`);
    }
    const desc = descParts.join(', ');
    const baseNote = `(base ${positiveTotal} ×${multiplier} ÷${heroes.length})`;

    const awardType = "Encounter Award";
    const lossType = "Encounter Loss";

    for (const hero of heroes) {
      if (perHeroPos > 0) {
        await this._addHeroKarmaEvent(hero, {
          amount: perHeroPos, type: awardType,
          description: `${desc} ${baseNote}`, gameDate, encounterId: enc.id
        });
      }
      if (perHeroLoss < 0) {
        await this._addHeroKarmaEvent(hero, {
          amount: perHeroLoss, type: lossType,
          description: `Losses — ${encLabel}`, gameDate, encounterId: enc.id
        });
      }
    }

    encounters[idx].awarded = true;
    await game.settings.set("msh-faserip", "defeatedVillains", encounters);
    ui.notifications.info(`${encLabel}: ${net} net karma to each of ${heroes.length} heroes.`);
    this.render(true);
  }

  async _onAwardEncounterToPool(ev) {
    ev.stopPropagation();
    if (!game.user.isGM) return;
    const idx = Number(ev.currentTarget.dataset.encIdx);
    const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
    const enc = encounters[idx];
    if (!enc || enc.awarded) return;

    const multiplier = game.settings.get("msh-faserip", "karmaMultiplier") || 1;
    const { positiveTotal, lossKarma } = this._calcEncounterTotals(enc);
    const total = (positiveTotal * multiplier) + lossKarma;
    const encLabel = enc.name || enc.villains.map(v => v.name).join(', ') || "Encounter";

    if (!await Dialog.confirm({
      title: `Award to Pool — ${encLabel}`,
      content: `<p>Add <strong>${total}</strong> karma to team pool?</p>`
    })) return;

    const pool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
    await game.settings.set("msh-faserip", "teamKarmaPoolTotal", Math.max(0, pool + total));
    encounters[idx].awarded = true;
    await game.settings.set("msh-faserip", "defeatedVillains", encounters);
    ui.notifications.info(`${total} karma added to pool for ${encLabel}.`);
    this.render(true);
  }

  async _onUndoAward(ev) {
    ev.stopPropagation();
    if (!game.user.isGM) return;
    const idx = Number(ev.currentTarget.dataset.encIdx);
    const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
    const enc = encounters[idx];
    if (!enc || !enc.awarded) return;

    const encLabel = enc.name || enc.villains.map(v => v.name).join(', ') || "Encounter";
    if (!await Dialog.confirm({
      title: `Undo Award — ${encLabel}`,
      content: `<p>Remove karma history entries for this encounter from all participating heroes?</p>`
    })) return;

    for (const heroId of (enc.presentHeroIds || [])) {
      const hero = game.actors.get(heroId);
      if (!hero) continue;
      const history = foundry.utils.deepClone(hero.system.karma?.history || []);
      const filtered = history.filter(e => e.encounterId !== enc.id);
      if (filtered.length !== history.length) {
        let earned = 0, spent = 0;
        filtered.forEach(e => { const a = Number(e.amount) || 0; if (a > 0) earned += a; else spent += Math.abs(a); });
        const adv = hero.system.karma?.advancement || 0;
        await hero.update({
          "system.karma.history": filtered,
          "system.karma.lifetime": earned,
          "system.attributes.karma.value": Math.max(0, earned - spent - adv)
        });
      }
    }

    encounters[idx].awarded = false;
    await game.settings.set("msh-faserip", "defeatedVillains", encounters);
    ui.notifications.info(`Award undone for ${encLabel}.`);
    this.render(true);
  }

  // ===== KARMA HELPERS =====

  _calcEncounterTotals(enc) {
    const foeTotal = (enc.villains || []).reduce((sum, v) => {
      const count = Math.max(1, v.count || 1);
      return sum + (v.rankValue >= 30 ? v.rankValue * count : 0);
    }, 0);
    const cv = enc.crimeType ? TeamSheet.CRIME_VALUES[enc.crimeType] : null;
    const stopValue = cv && enc.stopped ? cv.stop : 0;
    const arrestValue = cv && enc.arrested ? cv.arrest : 0;
    const rescueKarma = Math.min((enc.rescues || 0) * 20, 100);
    const gmAward = Math.max(0, enc.gmAward || 0);
    const lossKarma = -Math.abs(enc.losses || 0);
    const bonuses = Array.isArray(enc.bonuses) ? enc.bonuses : [];
    const bonusPositive = bonuses.reduce((sum, b) => sum + Math.max(0, b.amount || 0), 0);
    const bonusNegative = bonuses.reduce((sum, b) => sum + Math.min(0, b.amount || 0), 0);
    const positiveTotal = foeTotal + stopValue + arrestValue + rescueKarma + gmAward + bonusPositive;
    const totalLoss = lossKarma + bonusNegative;
    return { positiveTotal, lossKarma: totalLoss, foeTotal, gmAward, bonusPositive, bonusNegative };
  }

  _buildBreakdownText(enc, multiplier, heroCount) {
    const parts = [];
    const foeTotal = (enc.villains || []).reduce((sum, v) => {
      const count = Math.max(1, v.count || 1);
      return sum + (v.rankValue >= 30 ? v.rankValue * count : 0);
    }, 0);
    if (foeTotal > 0) parts.push(`Foe +${foeTotal}`);
    const cv = enc.crimeType ? TeamSheet.CRIME_VALUES[enc.crimeType] : null;
    if (cv && enc.stopped) parts.push(`Stop +${cv.stop}`);
    if (cv && enc.arrested) parts.push(`Arrest +${cv.arrest}`);
    if (enc.rescues > 0) parts.push(`Rescue +${Math.min(enc.rescues * 20, 100)}`);
    if (enc.gmAward > 0) parts.push(`GM +${enc.gmAward}`);
    const bonuses = Array.isArray(enc.bonuses) ? enc.bonuses : [];
    for (const b of bonuses) {
      if (b.amount > 0) parts.push(`${b.label || 'Award'} +${b.amount}`);
      else if (b.amount < 0) parts.push(`${b.label || 'Penalty'} ${b.amount}`);
    }
    if (enc.losses > 0) parts.push(`Loss -${enc.losses}`);
    return parts.join(', ') + ` (×${multiplier} ÷${heroCount})`;
  }

  _crimeLabel(crimeType) {
    return { violent: "Violent Crime", destructive: "Destructive Crime", theft: "Theft",
      robbery: "Robbery", misdemeanor: "Misdemeanor", national: "National Offense",
      localConspiracy: "Local Conspiracy", nationalConspiracy: "National Conspiracy",
      globalConspiracy: "Global Conspiracy", other: "Other Crime"
    }[crimeType] || crimeType;
  }

  // Session Bonus: award each hero their R+I+P as bonus karma
  async _onAwardSessionBonus(event) {
    event.preventDefault();
    if (!game.user.isGM) return;

    const teamMemberIds = game.settings.get("msh-faserip", "teamMembers") || [];
    const heroes = game.actors.filter(a => teamMemberIds.includes(a.id));
    if (!heroes.length) return ui.notifications.warn("No team members to award.");

    const rows = heroes.map(h => {
      const r = h.system.abilities?.reason?.value || 0;
      const i = h.system.abilities?.intuition?.value || 0;
      const p = h.system.abilities?.psyche?.value || 0;
      const total = r + i + p;
      return `<tr>
        <td><input type="checkbox" name="inc-${h.id}" checked /></td>
        <td>${h.name}</td>
        <td style="text-align:center">${r}</td>
        <td style="text-align:center">${i}</td>
        <td style="text-align:center">${p}</td>
        <td><input type="number" name="amt-${h.id}" value="${total}" min="0" style="width:55px;text-align:center;" /></td>
      </tr>`;
    }).join("");

    new Dialog({
      title: "Session Bonus (R+I+P)",
      content: `<form>
        <div style="margin-bottom:8px;">
          <label style="font-weight:600;">Session Name:</label>
          <input type="text" name="reason" value="Session Award" style="width:100%;margin-top:2px;" />
        </div>
        <p style="font-size:.85em;color:#666;">Each hero receives their Reason + Intuition + Psyche as bonus karma. Adjust individually.</p>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#f5f5f5;">
            <th style="width:30px"></th><th style="text-align:left">Hero</th>
            <th style="width:35px;text-align:center">R</th>
            <th style="width:35px;text-align:center">I</th>
            <th style="width:35px;text-align:center">P</th>
            <th style="width:60px">Award</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </form>`,
      buttons: {
        award: { icon: '<i class="fas fa-star"></i>', label: "Award",
          callback: async (html) => {
            const reason = html.find('[name="reason"]').val() || "Session Award";
            let count = 0, total = 0;
            for (const hero of heroes) {
              if (!html.find(`[name="inc-${hero.id}"]`).is(':checked')) continue;
              const amount = Number(html.find(`[name="amt-${hero.id}"]`).val()) || 0;
              if (amount <= 0) continue;
              await this._addHeroKarmaEvent(hero, {
                amount, type: "Session Award",
                description: reason
              });
              count++; total += amount;
            }
            if (count) ui.notifications.info(`Session bonus: +${total} total karma to ${count} heroes.`);
            this.render(true);
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "award"
    }, { width: 420 }).render(true);
  }

  async _addHeroKarmaEvent(hero, { amount, type, description, gameDate, encounterId }) {
    const history = foundry.utils.deepClone(hero.system.karma?.history || []);
    history.push({
      timestamp: new Date().toISOString(),
      realDate: new Date().toLocaleDateString(),
      gameDate: gameDate || TeamSheet._getGameDateTimeStatic().gameDate,
      amount, type, description,
      encounterId: encounterId || null
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


  // ===== TEAM HQ =====

  // Get or create the hidden team HQ actor
  static async getTeamHQActor() {
    const actorId = game.settings.get("msh-faserip", "teamHQActorId");
    let actor = actorId ? game.actors.get(actorId) : null;
    if (actor) return actor;

    // Create hidden team HQ actor
    actor = await Actor.create({
      name: "Team Headquarters",
      type: "hero",
      img: "icons/svg/house.svg",
      prototypeToken: { disposition: 0, actorLink: false },
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }
    });
    await game.settings.set("msh-faserip", "teamHQActorId", actor.id);
    console.log("[FASERIP] Created Team HQ actor:", actor.id);
    return actor;
  }

  async _onAddTeamHQ() {
    if (!game.user.isGM) return;
    const actor = await TeamSheet.getTeamHQActor();
    const items = await actor.createEmbeddedDocuments("Item", [{
      name: "New Headquarters",
      type: "headquarters",
      system: {
        description: "", buildingType: "", location: "", size: "",
        materialStrength: "Typical", ownership: "owned",
        purchaseCost: "", rentCost: "", rentalCost: "",
        isRichArea: false, packages: [], staff: [], features: "", notes: ""
      }
    }]);
    if (items?.[0]) items[0].sheet.render(true);
    this.render(true);
  }

  _onEditTeamHQ(itemId) {
    if (!game.user.isGM) return;
    const actorId = game.settings.get("msh-faserip", "teamHQActorId");
    const actor = actorId ? game.actors.get(actorId) : null;
    if (!actor) return;
    const item = actor.items.get(itemId);
    if (item) item.sheet.render(true);
  }

  async _onDeleteTeamHQ(itemId) {
    if (!game.user.isGM) return;
    const actor = await TeamSheet.getTeamHQActor();
    const item = actor.items.get(itemId);
    if (!item) return;
    if (!await Dialog.confirm({
      title: "Delete Headquarters",
      content: `<p>Delete <strong>${item.name}</strong>?</p>`
    })) return;
    await actor.deleteEmbeddedDocuments("Item", [itemId]);
    this.render(true);
  }

  async _onProcessRent() {
    if (!game.user.isGM) return;
    const { FaseripHeadquartersSheet } = await import('./headquartersSheet.js');
    const teamIds = game.settings.get("msh-faserip", "teamMembers") || [];

    // Collect all rented HQs: team HQs + personal HQs on team members
    const rentedHQs = [];

    // Team HQs (from the shared team HQ actor)
    const hqActorId = game.settings.get("msh-faserip", "teamHQActorId");
    const hqActor = hqActorId ? game.actors.get(hqActorId) : null;
    if (hqActor) {
      for (const item of hqActor.items) {
        if (item.type === "headquarters" && item.system.ownership === "rented") {
          rentedHQs.push({ item, ownerActorIds: [...teamIds] });
        }
      }
    }

    // Personal HQs on each team member
    for (const actorId of teamIds) {
      const actor = game.actors.get(actorId);
      if (!actor) continue;
      for (const item of actor.items) {
        if (item.type === "headquarters" && item.system.ownership === "rented") {
          rentedHQs.push({ item, ownerActorIds: [actorId] });
        }
      }
    }

    if (!rentedHQs.length) {
      ui.notifications.info("No rented headquarters found.");
      return;
    }

    let count = 0;
    for (const { item, ownerActorIds } of rentedHQs) {
      await FaseripHeadquartersSheet.sendRentDueChatCard(item, ownerActorIds);
      count++;
    }

    // Also process loan payments due
    // (loans on owned properties from bank loan purchases)
    let loanCount = 0;
    if (hqActor) {
      for (const item of hqActor.items) {
        if (item.type === "headquarters" && (item.system.loanPaymentsRemaining || 0) > 0) {
          loanCount++;
        }
      }
    }
    for (const actorId of teamIds) {
      const actor = game.actors.get(actorId);
      if (!actor) continue;
      for (const item of actor.items) {
        if (item.type === "headquarters" && (item.system.loanPaymentsRemaining || 0) > 0) {
          loanCount++;
        }
      }
    }

    const loanNote = loanCount > 0 ? ` (${loanCount} loan payments also pending)` : '';
    ui.notifications.info(`Sent ${count} rent due notice${count !== 1 ? 's' : ''}${loanNote}.`);
  }

  async _onViewTeamHQ(itemId) {
    const actorId = game.settings.get("msh-faserip", "teamHQActorId");
    const actor = actorId ? game.actors.get(actorId) : null;
    if (!actor) return;
    const item = actor.items.get(itemId);
    if (!item) return;

    const { ROOM_PACKAGES, STAFF_ROLES } = await import('./hq-constants.js');
    const packages = (item.system.packages || []).map(p => {
      const def = ROOM_PACKAGES[p.type];
      if (!def) return null;
      const tier = def.tiers[p.tier] || def.tiers[0];
      const qty = (p.quantity || 1) > 1 ? ` &times;${p.quantity}` : '';
      return `<li><strong>${def.name}${qty}</strong> (${tier.label}, ${tier.cost}) — ${tier.desc}</li>`;
    }).filter(Boolean).join('');

    const staff = (item.system.staff || []).map(s => {
      const def = STAFF_ROLES[s.role];
      if (!def) return null;
      const qty = (s.quantity || 1) > 1 ? ` &times;${s.quantity}` : '';
      const nameStr = s.name ? ` (${s.name})` : '';
      return `<li><strong>${def.name}${nameStr}${qty}</strong> (${def.cost}/mo)</li>`;
    }).filter(Boolean).join('');

    const hasCustomImg = item.img && !item.img.includes("mystery-man") && !item.img.includes("default");
    new Dialog({
      title: item.name,
      content: `
        ${hasCustomImg ? `<img src="${item.img}" style="width:100%;border-radius:4px;margin-bottom:8px;" />` : ''}
        <h2>${item.name}</h2>
        <div class="headquarters-details">
          <p><strong>Location:</strong> ${item.system.location || 'Unknown'}</p>
          <p><strong>Size:</strong> ${item.system.size || 'Unknown'}</p>
          <p><strong>Material Strength:</strong> ${item.system.materialStrength || 'Typical'}</p>
          <p><strong>Ownership:</strong> ${item.system.ownership === 'rented' ? 'Rented' : 'Owned'}</p>
          ${item.system.purchaseCost ? `<p><strong>Buy Cost:</strong> ${item.system.purchaseCost}</p>` : ''}
          ${item.system.rentCost ? `<p><strong>Rent Cost:</strong> ${item.system.rentCost}</p>` : ''}
          ${item.system.isRichArea ? `<p><strong>Rich Area:</strong> +1CS cost</p>` : ''}
          ${packages ? `<h3>Room Packages</h3><ul>${packages}</ul>` : ''}
          ${staff ? `<h3>Staff</h3><ul>${staff}</ul>` : ''}
        </div>
        ${item.system.notes ? `<div class="description">${item.system.notes}</div>` : ''}
      `,
      buttons: { close: { label: "Close" } },
      width: 500
    }).render(true);
  }

  // ===== RANK =====

  static getHighestRank(actor) {
    let highest = 0, highLabel = "Shift-0";
    const abilities = actor.system.abilities?.abilities || {};
    for (const key of Object.keys(abilities)) {
      const val = abilities[key]?.value || 0;
      if (val > highest) { highest = val; highLabel = abilities[key]?.rank || TeamSheet._rankLabelFromValue(val); }
    }
    for (const item of actor.items) {
      if (item.type === "power") {
        const val = item.system?.value || 0;
        if (val > highest) { highest = val; highLabel = item.system?.rank || TeamSheet._rankLabelFromValue(val); }
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

  // ===== COMBAT HOOK =====

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
      console.log("[FASERIP] No team members set, skipping capture");
      return;
    }

    const heroCombatantIds = [];
    const villainActors = [];

    for (const c of combat.combatants) {
      const actor = c.actor;
      if (!actor) { console.log("[FASERIP] Combatant has no actor:", c.name); continue; }
      const tokenDisp = c.token?.disposition;
      const protoDisp = actor.prototypeToken?.disposition;
      const disp = tokenDisp ?? protoDisp ?? (actor.type === "villain" ? -1 : 0);
      console.log(`[FASERIP] Combatant: ${actor.name}, tokenDisp=${tokenDisp}, protoDisp=${protoDisp}, resolved=${disp}, type=${actor.type}`);

      if (teamMemberIds.includes(actor.id) || disp > 0) {
        heroCombatantIds.push(actor.id);
      } else if (disp < 0 || actor.type === "villain") {
        villainActors.push(actor);
        console.log(`[FASERIP] Capturing villain: ${actor.name} (type=${actor.type}, disp=${disp})`);
      } else {
        console.log(`[FASERIP] Skipping neutral: ${actor.name} (type=${actor.type}, disp=${disp})`);
      }
    }

    if (!villainActors.length) { console.log("[FASERIP] No hostile combatants found"); return; }
    console.log(`[FASERIP] Found ${villainActors.length} villains, ${heroCombatantIds.length} heroes`);

    const seen = new Set();
    const villains = [];
    for (const actor of villainActors) {
      if (seen.has(actor.id)) continue;
      seen.add(actor.id);
      const { rankValue, rankLabel } = TeamSheet.getHighestRank(actor);
      villains.push({ name: actor.name, img: actor.img || "icons/svg/mystery-man.svg", actorId: actor.id, rankValue, rankLabel });
    }
    if (!villains.length) return;

    const { gameDate, gameTime } = TeamSheet._getGameDateTimeStatic();
    const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
    encounters.push({
      id: `enc_${Date.now()}`,
      villains,
      presentHeroIds: [...heroCombatantIds],
      crimeType: "", stopped: false, arrested: false,
      rescues: 0, losses: 0,
      awarded: false,
      gameDate, gameTime,
      timestamp: new Date().toISOString()
    });
    await game.settings.set("msh-faserip", "defeatedVillains", encounters);

    const names = villains.map(v => `${v.name} (${v.rankLabel})`).join(', ');
    ui.notifications.info(`[FASERIP] Combat ended — captured: ${names}`);
    for (const w of Object.values(ui.windows)) {
      if (w instanceof TeamSheet) w.render(true);
    }
  }

  // ===== TIME =====

  static _getGameDateTimeStatic() {
    try {
      const d = game.msh.getCampaignDateTime().date;
      const gameDate = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
      const h = d.getHours(), m = d.getMinutes();
      const gameTime = `${h % 12 || 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`;
      return { gameDate, gameTime };
    } catch { return { gameDate: "", gameTime: "" }; }
  }

  _getGameDate() { return TeamSheet._getGameDateTimeStatic().gameDate; }

  _onTimeSettings(event) {
    event.preventDefault();
    let ct, startDate;
    try {
      ct = game.msh.getCampaignDateTime();
      startDate = game.settings.get("msh-faserip", "campaignStartDate");
    } catch { ui.notifications.warn("Campaign time not available."); return; }
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