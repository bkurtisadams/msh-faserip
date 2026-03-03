// teamSheet.js v4.0.0 - 2026-03-02
// v4.0.0: Encounter-grouped defeated villains. Crime/rescue/losses are per-encounter,
//         foe karma stacks per villain within encounter. Undo award support.
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
        const eligible = v.rankValue >= 30;
        return { ...v, eligible, subRemarkable: !eligible };
      });
      const foeTotal = villainRows.reduce((sum, v) => sum + (v.eligible ? v.rankValue : 0), 0);

      const crimeVals = enc.crimeType ? TeamSheet.CRIME_VALUES[enc.crimeType] : null;
      const stopValue = crimeVals && enc.stopped ? crimeVals.stop : 0;
      const arrestValue = crimeVals && enc.arrested ? crimeVals.arrest : 0;
      const rescueKarma = Math.min((enc.rescues || 0) * 20, 100);
      const lossKarma = -Math.abs(enc.losses || 0);

      const positiveTotal = foeTotal + stopValue + arrestValue + rescueKarma;
      const positiveMultiplied = positiveTotal * multiplier;
      const heroCount = Math.max(1, (enc.presentHeroIds || []).length);
      const perHeroPositive = Math.floor(positiveMultiplied / heroCount);
      const perHeroLoss = lossKarma ? Math.floor(lossKarma / heroCount) : 0;
      const perHeroNet = perHeroPositive + perHeroLoss;

      const heroChecks = (context.teamMembers || []).map(tm => ({
        id: tm.id, name: tm.name, img: tm.img,
        present: (enc.presentHeroIds || []).includes(tm.id)
      }));

      const villainNames = villainRows.map(v => v.name).join(', ');
      const dateDisplay = [enc.gameDate, enc.gameTime].filter(Boolean).join(' ');

      return {
        ...enc, expanded, villainRows, foeTotal,
        stopValue, arrestValue, rescueKarma, lossKarma,
        positiveTotal, positiveMultiplied, heroCount,
        perHeroPositive, perHeroLoss, perHeroNet,
        heroChecks, villainNames, dateDisplay,
        crimeType: enc.crimeType || "",
        hasPositive: positiveTotal > 0
      };
    });

    context.encounterCount = context.encounters.length;
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
    html.find('.add-encounter-manual').click(() => this._onAddEncounterManual());
    html.find('.add-foe-to-encounter').click(ev => this._onAddFoeToEncounter(ev));
    html.find('.delete-foe').click(ev => this._onDeleteFoe(ev));
    html.find('.delete-encounter').click(ev => this._onDeleteEncounter(ev));
    html.find('.award-encounter-heroes').click(ev => this._onAwardEncounterToHeroes(ev));
    html.find('.award-encounter-pool').click(ev => this._onAwardEncounterToPool(ev));
    html.find('.undo-award').click(ev => this._onUndoAward(ev));
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

  _onAddEncounterManual() {
    if (!game.user.isGM) return;
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
      title: "Add Encounter",
      content: `<form>
        <div class="form-group"><label>Pick from actors:</label>
          <select name="actorId" style="width:100%"><option value="">— Manual entry —</option>${hostileOpts}</select></div>
        <hr/>
        <div class="form-group"><label>Villain Name:</label>
          <input type="text" name="name" placeholder="e.g., Rhino" /></div>
        <div class="form-group"><label>Highest Rank:</label>
          <select name="rank" style="width:100%">${rankOpts}</select></div>
        <p class="notes" style="font-size:11px;color:#666;">Creates encounter with one foe. Add more after.</p>
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
            const teamIds = game.settings.get("msh-faserip", "teamMembers") || [];
            await this._addEncounter([{ name, img, actorId: actorId || null, rankValue, rankLabel }], [...teamIds]);
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
      rescues: 0, losses: 0,
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
    const names = (encounters[idx].villains || []).map(v => v.name).join(', ') || encounters[idx].name || 'Unknown';
    if (!await Dialog.confirm({ title: "Delete Encounter", content: `<p>Delete encounter (${names})?</p>` })) return;
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
    const villainNames = enc.villains.map(v => v.name).join(', ');
    if (!await Dialog.confirm({
      title: `Award — ${villainNames}`,
      content: `<p>${breakdown}</p><p>Award <strong>+${perHeroPos}</strong>${perHeroLoss ? ` / <strong>${perHeroLoss}</strong> loss` : ''} (net <strong>${net}</strong>) to each of <strong>${heroes.length}</strong> heroes?</p>`
    })) return;

    const gameDate = enc.gameDate || TeamSheet._getGameDateTimeStatic().gameDate;
    const foeNames = enc.villains.filter(v => v.rankValue >= 30).map(v => `${v.name}(${v.rankValue})`).join('+');
    const descParts = [];
    if (foeNames) descParts.push(`Foe: ${foeNames}`);
    if (enc.stopped) descParts.push(`Stop ${this._crimeLabel(enc.crimeType)}`);
    if (enc.arrested) descParts.push(`Arrest ${this._crimeLabel(enc.crimeType)}`);
    if (enc.rescues > 0) descParts.push(`Rescue ×${enc.rescues}`);
    const desc = descParts.join(', ');
    const baseNote = `(base ${positiveTotal} ×${multiplier} ÷${heroes.length})`;

    for (const hero of heroes) {
      if (perHeroPos > 0) {
        await this._addHeroKarmaEvent(hero, {
          amount: perHeroPos, type: "Encounter Award",
          description: `${desc} ${baseNote}`, gameDate, encounterId: enc.id
        });
      }
      if (perHeroLoss < 0) {
        await this._addHeroKarmaEvent(hero, {
          amount: perHeroLoss, type: "Encounter Loss",
          description: `Losses — ${villainNames}`, gameDate, encounterId: enc.id
        });
      }
    }

    encounters[idx].awarded = true;
    await game.settings.set("msh-faserip", "defeatedVillains", encounters);
    ui.notifications.info(`${villainNames}: ${net} net karma to each of ${heroes.length} heroes.`);
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
    const villainNames = enc.villains.map(v => v.name).join(', ');

    if (!await Dialog.confirm({
      title: `Award to Pool — ${villainNames}`,
      content: `<p>Add <strong>${total}</strong> karma to team pool?</p>`
    })) return;

    const pool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
    await game.settings.set("msh-faserip", "teamKarmaPoolTotal", Math.max(0, pool + total));
    encounters[idx].awarded = true;
    await game.settings.set("msh-faserip", "defeatedVillains", encounters);
    ui.notifications.info(`${total} karma added to pool for ${villainNames}.`);
    this.render(true);
  }

  async _onUndoAward(ev) {
    ev.stopPropagation();
    if (!game.user.isGM) return;
    const idx = Number(ev.currentTarget.dataset.encIdx);
    const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
    const enc = encounters[idx];
    if (!enc || !enc.awarded) return;

    const villainNames = enc.villains.map(v => v.name).join(', ');
    if (!await Dialog.confirm({
      title: `Undo Award — ${villainNames}`,
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
    ui.notifications.info(`Award undone for ${villainNames}.`);
    this.render(true);
  }

  // ===== KARMA HELPERS =====

  _calcEncounterTotals(enc) {
    const foeTotal = (enc.villains || []).reduce((sum, v) => sum + (v.rankValue >= 30 ? v.rankValue : 0), 0);
    const cv = enc.crimeType ? TeamSheet.CRIME_VALUES[enc.crimeType] : null;
    const stopValue = cv && enc.stopped ? cv.stop : 0;
    const arrestValue = cv && enc.arrested ? cv.arrest : 0;
    const rescueKarma = Math.min((enc.rescues || 0) * 20, 100);
    const lossKarma = -Math.abs(enc.losses || 0);
    const positiveTotal = foeTotal + stopValue + arrestValue + rescueKarma;
    return { positiveTotal, lossKarma, foeTotal };
  }

  _buildBreakdownText(enc, multiplier, heroCount) {
    const parts = [];
    const foeTotal = (enc.villains || []).reduce((sum, v) => sum + (v.rankValue >= 30 ? v.rankValue : 0), 0);
    if (foeTotal > 0) parts.push(`Foe +${foeTotal}`);
    const cv = enc.crimeType ? TeamSheet.CRIME_VALUES[enc.crimeType] : null;
    if (cv && enc.stopped) parts.push(`Stop +${cv.stop}`);
    if (cv && enc.arrested) parts.push(`Arrest +${cv.arrest}`);
    if (enc.rescues > 0) parts.push(`Rescue +${Math.min(enc.rescues * 20, 100)}`);
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