// teamSheet.js v2.1.0 - 2026-02-28
// v2.1.0: Pending karma queue, pool gated by useKarmaPool setting, implement penalty
export class TeamSheet extends Application {
  constructor(options = {}) {
    super(options);
    this._timeUpdateHook = Hooks.on("msh-faserip.timeUpdated", () => {
      if (this.rendered) this.render(false);
    });
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip", "sheet", "team-tracker"],
      template: "systems/msh-faserip/templates/team-sheet.html",
      width: 580, height: 620, resizable: true, title: "Team Tracker"
    });
  }

  async close(options) {
    if (this._timeUpdateHook) Hooks.off("msh-faserip.timeUpdated", this._timeUpdateHook);
    return super.close(options);
  }

  getData() {
    const context = super.getData();
    context.isGM = game.user.isGM;
    context.useKarmaPool = game.settings.get("msh-faserip", "useKarmaPool") ?? false;

    const campaignTime = game.msh.getCampaignDateTime();
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
    context.poolShareValue = Math.floor(context.teamKarmaPool / context.teamSize);

    // Pending awards with calculated columns
    const multiplier = game.settings.get("msh-faserip", "karmaMultiplier") || 1;
    const pending = game.settings.get("msh-faserip", "pendingKarmaAwards") || [];
    let netPerHero = 0;
    context.pendingAwards = pending.map(p => {
      const isNeg = p.baseAmount < 0;
      const totalAmount = isNeg ? p.baseAmount : p.baseAmount * multiplier;
      const perHero = Math.floor(totalAmount / context.teamSize);
      netPerHero += perHero;
      return { ...p, totalAmount, perHero };
    });
    context.pendingNetPerHero = netPerHero;

    // Time
    const td = campaignTime.date;
    context.timeYear = td.getFullYear();
    context.timeMonth = td.getMonth() + 1;
    context.timeDay = td.getDate();
    context.timeHour = td.getHours();
    context.timeMinute = td.getMinutes();
    context.timeSecond = td.getSeconds();
    context.combatSyncEnabled = game.settings.get("msh-faserip", "combatSyncEnabled") ?? true;

    context.karmaMultiplier = multiplier;
    context.multiplierOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    context.combatLogs = game.settings.get("msh-faserip", "combatLogs") || [];
    context.autoLogCombat = game.settings.get("msh-faserip", "autoLogCombat") ?? false;

    return context;
  }

  _calculateAvailableKarma(actor) {
    const lifetime = actor.system.karma?.lifetime || 0;
    let spent = 0;
    (actor.system.karma?.history || []).forEach(e => { if (e.amount < 0) spent += Math.abs(e.amount); });
    return Math.max(0, lifetime - spent - (actor.system.karma?.advancement || 0));
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Roster
    html.find('.add-hero-to-team-btn').click(() => {
      const s = html.find('.add-hero-select'); const id = s.val();
      if (id) { this._onAddHeroToTeam(id); s.val(''); }
      else ui.notifications.warn("Select a character to add");
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

    // Pending queue
    html.find('.add-pending-villain').click(ev => this._onAddPendingVillain(ev));
    html.find('.add-pending-event').click(ev => this._onAddPendingEvent(ev));
    html.find('.edit-pending').click(ev => this._onEditPending(ev));
    html.find('.delete-pending').click(ev => this._onDeletePending(ev));
    html.find('.award-all-to-heroes').click(ev => this._onAwardAllToHeroes(ev));
    html.find('.award-all-to-pool').click(ev => this._onAwardAllToPool(ev));
    html.find('.clear-pending').click(ev => this._onClearPending(ev));

    // Immediate actions
    html.find('.award-individual-karma').click(ev => this._onAwardIndividualKarma(ev));
    html.find('.apply-karma-penalty').click(ev => this._onApplyKarmaPenalty(ev));
    html.find('.award-session-bonus').click(ev => this._onAwardSessionBonus(ev));
    html.find('.award-from-log').click(ev => this._onAwardFromLog(ev));

    // Multiplier
    html.find('.multiplier-select').change(async (ev) => {
      await game.settings.set("msh-faserip", "karmaMultiplier", Number(ev.target.value));
      this.render(true);
    });

    // Session log
    html.find('.add-log-entry').click(ev => this._onAddLogEntry(ev));
    html.find('.edit-log-btn').click(ev => this._onEditLogEntry(ev));
    html.find('.delete-log-btn').click(ev => this._onDeleteLogEntry(ev));
    html.find('.clear-all-logs').click(ev => this._onClearAllLogs(ev));
    html.find('.auto-log-toggle').change(async (ev) => {
      await game.settings.set("msh-faserip", "autoLogCombat", ev.target.checked);
    });

    // Time
    html.find('.time-inc-btn, .time-dec-btn').on('click', async (ev) => {
      if (!game.user.isGM) return; ev.preventDefault();
      await this._adjustTimeByUnit(ev.currentTarget.dataset.unit,
        ev.currentTarget.classList.contains('time-inc-btn') ? 1 : -1);
    });
    html.find('.time-input').on('change', async () => {
      if (!game.user.isGM) return; await this._setTimeFromInputs(html);
    });
    html.find('.time-adjust-btn').on('click', async (ev) => {
      if (!game.user.isGM) return; ev.preventDefault();
      const u = ev.currentTarget.dataset.unit;
      const d = parseInt(ev.currentTarget.dataset.direction) || 1;
      let s = 0;
      if (u === 'turn') s = 6*d; else if (u === '10min') s = 600*d;
      else if (u === 'minute') s = 60*d; else if (u === 'hour') s = 3600*d;
      else if (u === 'day') s = 86400*d;
      if (s !== 0) {
        const ctt = game.modules.get("calendar-time-tracker");
        const auth = game.settings.get("msh-faserip", "ctt.timeAuthority") ?? false;
        if (auth && ctt?.active && ctt.api) ctt.api.advanceTime(s, "second");
        else { await game.time.advance(s); Hooks.callAll("msh-faserip.timeUpdated"); }
        this.render(false);
      }
    });
    html.find('.time-set-btn').on('click', async (ev) => {
      if (!game.user.isGM) return; ev.preventDefault(); this._onTimeSettings(ev);
    });
    html.find('.combat-sync-toggle').change(async (ev) => {
      await game.settings.set("msh-faserip", "combatSyncEnabled", ev.target.checked);
    });
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
    const heroId = event.currentTarget.dataset.heroId;
    const hero = game.actors.get(heroId);
    if (!await Dialog.confirm({ title: "Remove from Team", content: `<p>Remove <strong>${hero.name}</strong>?</p>` })) return;
    const tm = game.settings.get("msh-faserip", "teamMembers") || [];
    const i = tm.indexOf(heroId);
    if (i > -1) {
      tm.splice(i, 1);
      await game.settings.set("msh-faserip", "teamMembers", tm);
      if (hero) await hero.update({ "system.karma.poolContribution": 0 });
      ui.notifications.info(`${hero.name} removed.`);
      this.render(true);
    }
  }

  // ===== SHARED KARMA HELPER =====

  async _addHeroKarmaEvent(hero, { amount, type, description }) {
    const history = foundry.utils.deepClone(hero.system.karma?.history || []);
    history.push({
      timestamp: new Date().toISOString(),
      realDate: new Date().toLocaleDateString(),
      gameDate: this._getGameDate(), amount, type, description
    });
    let earned = 0, spent = 0;
    history.forEach(e => { const a = Number(e.amount)||0; if (a>0) earned+=a; else spent+=Math.abs(a); });
    const adv = hero.system.karma?.advancement || 0;
    await hero.update({
      "system.karma.history": history,
      "system.karma.lifetime": earned,
      "system.attributes.karma.value": Math.max(0, earned - spent - adv)
    });
  }

  // ===== PENDING QUEUE =====

  async _addPending(entry) {
    const p = game.settings.get("msh-faserip", "pendingKarmaAwards") || [];
    p.push({ ...entry, id: foundry.utils.randomID() });
    await game.settings.set("msh-faserip", "pendingKarmaAwards", p);
    this.render(true);
  }

  _onAddPendingVillain(event) {
    if (!game.user.isGM) return;
    const ranks = [
      { rank: "Remarkable", value: 30 }, { rank: "Incredible", value: 40 },
      { rank: "Amazing", value: 50 }, { rank: "Monstrous", value: 75 },
      { rank: "Unearthly", value: 100 }, { rank: "Shift X", value: 150 },
      { rank: "Shift Y", value: 200 }, { rank: "Shift Z", value: 500 },
      { rank: "Class 1000", value: 1000 }, { rank: "Class 3000", value: 3000 },
      { rank: "Class 5000", value: 5000 }, { rank: "Custom", value: 0 }
    ];
    const opts = ranks.map(r => `<option value="${r.rank}" data-value="${r.value}">${r.rank}${r.value ? ` (${r.value})` : ''}</option>`).join('');

    new Dialog({
      title: "Add Defeated Villain",
      content: `<form>
        <div class="form-group"><label>Villain Name:</label>
          <input type="text" name="name" placeholder="e.g., Rhino" /></div>
        <div class="form-group"><label>Highest Rank (Rm+ per rules):</label>
          <select name="rank">${opts}</select></div>
        <div class="form-group" data-field="custom" style="display:none;">
          <label>Custom Rank Number:</label>
          <input type="number" name="customValue" value="30" min="1" /></div>
      </form>`,
      buttons: {
        add: { icon: '<i class="fas fa-skull"></i>', label: "Add to Queue",
          callback: async (html) => {
            const name = html.find('[name="name"]').val().trim();
            if (!name) { ui.notifications.warn("Enter a villain name"); return; }
            const rank = html.find('[name="rank"]').val();
            let value = Number(html.find('[name="rank"] :selected').data('value'));
            if (rank === "Custom") value = Number(html.find('[name="customValue"]').val()) || 30;
            await this._addPending({
              label: `Defeated ${name} (${rank}/${value})`,
              baseAmount: value, type: `Defeated Foe - ${rank}`,
              description: `Defeated ${name}`
            });
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "add",
      render: (html) => {
        html.find('[name="rank"]').on('change', () => {
          html.find('[data-field="custom"]').toggle(html.find('[name="rank"]').val() === "Custom");
        });
      }
    }).render(true);
  }

  _onAddPendingEvent(event) {
    if (!game.user.isGM) return;
    const eventAmounts = {
      "Rescue": 20, "Multiple Rescues (5+)": 100,
      "Violent Crime (Stop)": 30, "Violent Crime (Arrest)": 15,
      "Destructive Crime (Stop)": 20, "Destructive Crime (Arrest)": 10,
      "Theft (Stop)": 10, "Theft (Arrest)": 5,
      "Robbery (Stop)": 20, "Robbery (Arrest)": 10,
      "Misdemeanor (Stop)": 5, "Misdemeanor (Arrest)": 5,
      "National Offense (Stop)": 20, "National Offense (Arrest)": 10,
      "Local Conspiracy (Stop)": 30, "Local Conspiracy (Arrest)": 15,
      "National Conspiracy (Stop)": 40, "National Conspiracy (Arrest)": 20,
      "Global Conspiracy (Stop)": 50, "Global Conspiracy (Arrest)": 25,
      "Property Damage": -5
    };

    new Dialog({
      title: "Add Karma Event to Queue",
      content: `<form>
        <div class="form-group"><label>Event Type:</label>
          <select name="eventType">
            <optgroup label="Rescue">
              <option value="Rescue">Rescue (+20, cap 100)</option>
              <option value="Multiple Rescues (5+)">Multiple Rescues 5+ (+100)</option>
            </optgroup>
            <optgroup label="Stop Crime">
              <option value="Violent Crime (Stop)">Violent Crime — Stop (+30)</option>
              <option value="Destructive Crime (Stop)">Destructive Crime — Stop (+20)</option>
              <option value="Theft (Stop)">Theft — Stop (+10)</option>
              <option value="Robbery (Stop)">Robbery — Stop (+20)</option>
              <option value="Misdemeanor (Stop)">Misdemeanor — Stop (+5)</option>
              <option value="National Offense (Stop)">National Offense — Stop (+20)</option>
              <option value="Local Conspiracy (Stop)">Local Conspiracy — Stop (+30)</option>
              <option value="National Conspiracy (Stop)">National Conspiracy — Stop (+40)</option>
              <option value="Global Conspiracy (Stop)">Global Conspiracy — Stop (+50)</option>
            </optgroup>
            <optgroup label="Arrest">
              <option value="Violent Crime (Arrest)">Violent Crime — Arrest (+15)</option>
              <option value="Destructive Crime (Arrest)">Destructive Crime — Arrest (+10)</option>
              <option value="Theft (Arrest)">Theft — Arrest (+5)</option>
              <option value="Robbery (Arrest)">Robbery — Arrest (+10)</option>
              <option value="Misdemeanor (Arrest)">Misdemeanor — Arrest (+5)</option>
              <option value="National Offense (Arrest)">National Offense — Arrest (+10)</option>
              <option value="Local Conspiracy (Arrest)">Local Conspiracy — Arrest (+15)</option>
              <option value="National Conspiracy (Arrest)">National Conspiracy — Arrest (+20)</option>
              <option value="Global Conspiracy (Arrest)">Global Conspiracy — Arrest (+25)</option>
            </optgroup>
            <optgroup label="Losses">
              <option value="Property Damage">Property Damage (−5/area)</option>
            </optgroup>
            <optgroup label="Custom">
              <option value="Custom">Custom (enter amount)</option>
            </optgroup>
          </select></div>
        <div class="form-group" data-field="areas" style="display:none;">
          <label>Areas Damaged:</label>
          <input type="number" name="areas" value="1" min="1" /></div>
        <div class="form-group"><label>Base Amount (auto-fills):</label>
          <input type="number" name="amount" value="20" /></div>
        <div class="form-group"><label>Description (optional):</label>
          <input type="text" name="description" placeholder="Details..." /></div>
      </form>`,
      buttons: {
        add: { icon: '<i class="fas fa-plus"></i>', label: "Add to Queue",
          callback: async (html) => {
            const type = html.find('[name="eventType"]').val();
            let amount = Number(html.find('[name="amount"]').val());
            const desc = html.find('[name="description"]').val();
            const areas = Number(html.find('[name="areas"]').val() || 1);
            if (type === "Property Damage") amount = -(areas * 5);
            if (type.startsWith("Rescue")) amount = Math.min(amount, 100);
            if (type.startsWith("Multiple Rescues")) amount = 100;
            const label = type === "Property Damage" ? `Property Damage (${areas} areas)`
              : type === "Custom" ? (desc || `Custom (+${amount})`) : type;
            await this._addPending({ label, baseAmount: amount, type, description: desc });
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "add",
      render: (html) => {
        html.find('[name="eventType"]').on('change', () => {
          const t = html.find('[name="eventType"]').val();
          const base = eventAmounts[t]; if (base !== undefined) html.find('[name="amount"]').val(base);
          html.find('[data-field="areas"]').toggle(t === "Property Damage");
        });
        html.find('[name="areas"]').on('input', () => {
          html.find('[name="amount"]').val(-(Number(html.find('[name="areas"]').val())||1) * 5);
        });
      }
    }).render(true);
  }

  _onEditPending(event) {
    if (!game.user.isGM) return;
    const idx = Number(event.currentTarget.dataset.index);
    const pending = game.settings.get("msh-faserip", "pendingKarmaAwards") || [];
    if (idx < 0 || idx >= pending.length) return;
    const award = pending[idx];
    new Dialog({
      title: "Edit Pending Award",
      content: `<form>
        <div class="form-group"><label>Label:</label>
          <input type="text" name="label" value="${award.label}" /></div>
        <div class="form-group"><label>Base Amount:</label>
          <input type="number" name="baseAmount" value="${award.baseAmount}" /></div>
        <div class="form-group"><label>Description:</label>
          <input type="text" name="description" value="${award.description || ''}" /></div>
      </form>`,
      buttons: {
        save: { icon: '<i class="fas fa-save"></i>', label: "Save",
          callback: async (html) => {
            award.label = html.find('[name="label"]').val();
            award.baseAmount = Number(html.find('[name="baseAmount"]').val());
            award.description = html.find('[name="description"]').val();
            pending[idx] = award;
            await game.settings.set("msh-faserip", "pendingKarmaAwards", pending);
            this.render(true);
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      }, default: "save"
    }).render(true);
  }

  async _onDeletePending(event) {
    const idx = Number(event.currentTarget.dataset.index);
    const p = game.settings.get("msh-faserip", "pendingKarmaAwards") || [];
    if (idx >= 0 && idx < p.length) {
      p.splice(idx, 1);
      await game.settings.set("msh-faserip", "pendingKarmaAwards", p);
      this.render(true);
    }
  }

  async _onClearPending() {
    if (!await Dialog.confirm({ title: "Clear Queue", content: "<p>Clear all pending awards?</p>" })) return;
    await game.settings.set("msh-faserip", "pendingKarmaAwards", []);
    this.render(true);
  }

  async _onAwardAllToHeroes() {
    if (!game.user.isGM) return;
    const mult = game.settings.get("msh-faserip", "karmaMultiplier") || 1;
    const heroes = game.actors.filter(a => (game.settings.get("msh-faserip", "teamMembers")||[]).includes(a.id));
    if (!heroes.length) { ui.notifications.warn("No team members"); return; }
    const pending = game.settings.get("msh-faserip", "pendingKarmaAwards") || [];
    if (!pending.length) { ui.notifications.warn("No pending awards"); return; }

    // Calculate net
    let netPerHero = 0;
    for (const a of pending) {
      const total = a.baseAmount < 0 ? a.baseAmount : a.baseAmount * mult;
      netPerHero += Math.floor(total / heroes.length);
    }

    if (!await Dialog.confirm({
      title: "Award All to Heroes",
      content: `<p>Award <strong>${netPerHero}</strong> net karma to each of <strong>${heroes.length}</strong> heroes?</p>
        <p style="font-size:0.9em;color:#666;">${pending.length} events, ×${mult} multiplier, ÷${heroes.length} heroes</p>`
    })) return;

    for (const award of pending) {
      const total = award.baseAmount < 0 ? award.baseAmount : award.baseAmount * mult;
      const perHero = Math.floor(total / heroes.length);
      for (const hero of heroes) {
        await this._addHeroKarmaEvent(hero, {
          amount: perHero, type: award.type,
          description: award.description || award.label
        });
      }
    }
    await game.settings.set("msh-faserip", "pendingKarmaAwards", []);
    ui.notifications.info(`${netPerHero} net karma awarded to each of ${heroes.length} heroes.`);
    this.render(true);
  }

  async _onAwardAllToPool() {
    if (!game.user.isGM) return;
    const mult = game.settings.get("msh-faserip", "karmaMultiplier") || 1;
    const pending = game.settings.get("msh-faserip", "pendingKarmaAwards") || [];
    if (!pending.length) { ui.notifications.warn("No pending awards"); return; }
    let total = 0;
    for (const a of pending) { total += a.baseAmount < 0 ? a.baseAmount : a.baseAmount * mult; }
    if (!await Dialog.confirm({ title: "Award to Pool", content: `<p>Add <strong>${total}</strong> karma to team pool?</p>` })) return;
    const pool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
    await game.settings.set("msh-faserip", "teamKarmaPoolTotal", pool + total);
    await game.settings.set("msh-faserip", "pendingKarmaAwards", []);
    ui.notifications.info(`${total} karma added to team pool.`);
    this.render(true);
  }

  // ===== INDIVIDUAL AWARD (immediate) =====

  _onAwardIndividualKarma(event) {
    if (!game.user.isGM) return;
    const heroes = game.actors.filter(a => (game.settings.get("msh-faserip","teamMembers")||[]).includes(a.id));
    if (!heroes.length) return ui.notifications.warn("No team members");
    const opts = heroes.map(h => `<option value="${h.id}">${h.name}</option>`).join('');
    const autoAmounts = {
      "Personal Commitment": 5, "Weekly Award": 10, "Role-Playing": 10,
      "Stump the Judge": 15, "Humor": 5,
      "Charity: Appearance": 20, "Charity: Act": 10, "Charity: Donation": 10
    };

    new Dialog({
      title: "Award Individual Karma",
      content: `<form>
        <div class="form-group"><label>Hero:</label><select name="heroId">${opts}</select></div>
        <div class="form-group"><label>Award Type:</label>
          <select name="awardType">
            <optgroup label="Personal">
              <option value="Personal Commitment">Personal Commitment (+5)</option>
              <option value="Weekly Award">Weekly Award (up to +10)</option>
            </optgroup>
            <optgroup label="Gaming Awards">
              <option value="Role-Playing">Role-Playing (up to +10)</option>
              <option value="Stump the Judge">Stump the Judge (up to +15)</option>
              <option value="Humor">Humor (+5)</option>
            </optgroup>
            <optgroup label="Charity">
              <option value="Charity: Appearance">Personal Appearance (Pop, max +20)</option>
              <option value="Charity: Act">Act of Charity (10/20/30/40)</option>
              <option value="Charity: Donation">Donation (rank # or +10)</option>
            </optgroup>
            <optgroup label="Custom">
              <option value="Custom">Custom</option>
            </optgroup>
          </select></div>
        <div class="form-group"><label>Amount:</label>
          <input type="number" name="amount" value="10" min="1" /></div>
        <div class="form-group"><label>Description:</label>
          <textarea name="description" rows="2" placeholder="Why?"></textarea></div>
      </form>`,
      buttons: {
        award: { icon: '<i class="fas fa-user-plus"></i>', label: "Award",
          callback: async (html) => {
            const hero = game.actors.get(html.find('[name="heroId"]').val());
            const type = html.find('[name="awardType"]').val();
            const amount = Number(html.find('[name="amount"]').val());
            const desc = html.find('[name="description"]').val();
            if (!hero || amount <= 0) return;
            await this._addHeroKarmaEvent(hero, { amount, type, description: desc || `Individual ${type}` });
            ui.notifications.info(`${amount} karma → ${hero.name}`);
            this.render(true);
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "award",
      render: (html) => {
        html.find('[name="awardType"]').on('change', () => {
          const t = html.find('[name="awardType"]').val();
          const hero = game.actors.get(html.find('[name="heroId"]').val());
          let a = autoAmounts[t] || 10;
          if (t === "Charity: Appearance" && hero)
            a = Math.min(Math.max(hero.system.attributes?.popularity?.hero?.value ?? 0, 0), 20);
          html.find('[name="amount"]').val(a);
        });
      }
    }).render(true);
  }

  // ===== SESSION BONUS (house rule: R+I+P to each hero) =====

  _onAwardSessionBonus(event) {
    if (!game.user.isGM) return;
    const heroes = game.actors.filter(a => (game.settings.get("msh-faserip","teamMembers")||[]).includes(a.id));
    if (!heroes.length) return ui.notifications.warn("No team members");

    const rows = heroes.map(h => {
      const r = h.system.abilities?.reason?.value || 0;
      const i = h.system.abilities?.intuition?.value || 0;
      const p = h.system.abilities?.psyche?.value || 0;
      return `<tr>
        <td><input type="checkbox" name="inc-${h.id}" checked /></td>
        <td>${h.name}</td>
        <td style="text-align:center">${r}</td>
        <td style="text-align:center">${i}</td>
        <td style="text-align:center">${p}</td>
        <td><input type="number" name="amt-${h.id}" value="${r+i+p}" min="0" style="width:55px;" /></td>
      </tr>`;
    }).join('');

    new Dialog({
      title: "Award Session Bonus (R+I+P)",
      content: `<form>
        <div class="form-group"><label>Session/Reason:</label>
          <input type="text" name="reason" placeholder="e.g., Session 12" style="width:100%;" /></div>
        <p style="font-size:0.9em;color:#666;margin:6px 0;">Each hero gets their R+I+P as bonus karma. Adjust individually.</p>
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
            const reason = html.find('[name="reason"]').val() || "Session Bonus";
            let count = 0, total = 0;
            for (const hero of heroes) {
              if (!html.find(`[name="inc-${hero.id}"]`).is(':checked')) continue;
              const amount = Number(html.find(`[name="amt-${hero.id}"]`).val()) || 0;
              if (amount <= 0) continue;
              await this._addHeroKarmaEvent(hero, {
                amount, type: "Session Bonus",
                description: reason
              });
              count++; total += amount;
            }
            if (count) ui.notifications.info(`Session bonus: ${total} total karma to ${count} heroes.`);
            this.render(true);
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "award"
    }, { width: 420 }).render(true);
  }

  // ===== PENALTY (immediate) =====

  _onApplyKarmaPenalty(event) {
    if (!game.user.isGM) return;
    const heroes = game.actors.filter(a => (game.settings.get("msh-faserip","teamMembers")||[]).includes(a.id));
    if (!heroes.length) return ui.notifications.warn("No team members");
    const opts = [`<option value="__ALL__">(All Team Members)</option>`,
      ...heroes.map(h => `<option value="${h.id}">${h.name}</option>`)].join('');
    const amounts = {
      "Public Defeat": -40, "Private Defeat": -20,
      "Permit Violent Crime": -15, "Permit Destructive Crime": -10,
      "Permit Theft": -5, "Permit Robbery": -10,
      "Permit Misdemeanor": -5, "Permit National Offense": -10, "Permit Other Crimes": -5,
      "Commit Violent Crime": -60, "Commit Destructive Crime": -40,
      "Commit Theft": -20, "Commit Misdemeanor": -10,
      "Commit National Offense": -40, "Commit Other Crimes": -20,
      "Noble/Mysterious/Self-Destruction": -50
    };

    new Dialog({
      title: "Apply Karma Penalty",
      content: `<form>
        <div class="form-group"><label>Target:</label><select name="targetId">${opts}</select></div>
        <div class="form-group"><label>Penalty Type:</label>
          <select name="penaltyType">
            <optgroup label="Defeats">
              <option value="Public Defeat">Public Defeat (−40)</option>
              <option value="Private Defeat">Private Defeat (−20)</option>
            </optgroup>
            <optgroup label="Permitted Crimes">
              <option value="Permit Violent Crime">Permit Violent Crime (−15)</option>
              <option value="Permit Destructive Crime">Permit Destructive Crime (−10)</option>
              <option value="Permit Theft">Permit Theft (−5)</option>
              <option value="Permit Robbery">Permit Robbery (−10)</option>
              <option value="Permit Misdemeanor">Permit Misdemeanor (−5)</option>
              <option value="Permit National Offense">Permit National Offense (−10)</option>
              <option value="Permit Other Crimes">Permit Other Crimes (−5)</option>
            </optgroup>
            <optgroup label="Committed Crimes">
              <option value="Commit Violent Crime">Commit Violent Crime (−60)</option>
              <option value="Commit Destructive Crime">Commit Destructive Crime (−40)</option>
              <option value="Commit Theft">Commit Theft (−20)</option>
              <option value="Commit Misdemeanor">Commit Misdemeanor (−10)</option>
              <option value="Commit National Offense">Commit National Offense (−40)</option>
              <option value="Commit Other Crimes">Commit Other Crimes (−20)</option>
            </optgroup>
            <optgroup label="Property / Death">
              <option value="Property Damage">Property Damage (−5/area)</option>
              <option value="Death/Kill">Death / Kill — ALL karma to 0</option>
              <option value="Noble/Mysterious/Self-Destruction">Noble/Mysterious Death (−50)</option>
            </optgroup>
            <optgroup label="Custom">
              <option value="Custom Loss">Custom Loss</option>
            </optgroup>
          </select></div>
        <div class="form-group" data-field="areas" style="display:none;">
          <label>Areas Damaged:</label>
          <input type="number" name="areas" value="1" min="1" /></div>
        <div class="form-group" data-field="custom" style="display:none;">
          <label>Custom Loss Amount (positive number, will be negated):</label>
          <input type="number" name="customLoss" value="10" min="1" /></div>
        <div class="form-group"><label>Description:</label>
          <textarea name="description" rows="2" placeholder="What happened?"></textarea></div>
      </form>`,
      buttons: {
        apply: { icon: '<i class="fas fa-exclamation-triangle"></i>', label: "Apply",
          callback: async (html) => {
            const targetId = html.find('[name="targetId"]').val();
            const type = html.find('[name="penaltyType"]').val();
            const areas = Number(html.find('[name="areas"]').val() || 1);
            const customLoss = Number(html.find('[name="customLoss"]').val() || 10);
            const desc = html.find('[name="description"]').val();
            const targets = targetId === "__ALL__" ? heroes : [game.actors.get(targetId)].filter(Boolean);

            for (const hero of targets) {
              if (type === "Death/Kill") {
                const cur = this._calculateAvailableKarma(hero);
                if (cur > 0) await this._addHeroKarmaEvent(hero, { amount: -cur, type: "Death - Kill", description: desc || "Kill — all karma lost" });
                ui.notifications.warn(`${hero.name}: ALL karma zeroed.`);
              } else if (type === "Property Damage") {
                await this._addHeroKarmaEvent(hero, { amount: -(areas*5), type: "Property Damage", description: desc || `${areas} area(s)` });
              } else if (type === "Custom Loss") {
                await this._addHeroKarmaEvent(hero, { amount: -customLoss, type: "Custom Loss", description: desc || "Custom penalty" });
              } else {
                await this._addHeroKarmaEvent(hero, { amount: amounts[type] || -10, type, description: desc || type });
              }
            }

            if (type === "Death/Kill") {
              const pool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
              if (pool > 0) {
                await game.settings.set("msh-faserip", "teamKarmaPoolTotal", 0);
                ui.notifications.warn("Team pool zeroed (Kill rule).");
              }
            } else {
              ui.notifications.info(`Penalty applied to ${targets.length} hero(es).`);
            }
            this.render(true);
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "apply",
      render: (html) => {
        html.find('[name="penaltyType"]').on('change', () => {
          const t = html.find('[name="penaltyType"]').val();
          html.find('[data-field="areas"]').toggle(t === "Property Damage");
          html.find('[data-field="custom"]').toggle(t === "Custom Loss");
        });
      }
    }).render(true);
  }

  // ===== AWARD FROM LOG =====

  _onAwardFromLog(event) {
    if (!game.user.isGM) return;
    const logText = event.currentTarget.dataset.logText || "";
    // Add a custom event to pending with the log text as description
    this._addPending({
      label: logText.length > 40 ? logText.substring(0, 40) + "..." : logText,
      baseAmount: 20, type: "Custom",
      description: logText
    });
  }

  // ===== SESSION LOG =====

  async _onAddLogEntry() {
    new Dialog({
      title: "Add Session Log Entry",
      content: `<textarea id="log-text" rows="3" style="width:100%;padding:4px;" placeholder="What happened..."></textarea>`,
      buttons: {
        add: { label: "Add", callback: async (html) => {
          const t = html.find('#log-text').val().trim();
          if (t) { const logs = game.settings.get("msh-faserip","combatLogs")||[];
            logs.unshift({ id: foundry.utils.randomID(), timestamp: this._formatDateTime(), text: t });
            await game.settings.set("msh-faserip","combatLogs",logs); this.render(true); }
        }},
        cancel: { label: "Cancel" }
      }, default: "add",
      render: (html) => html.find('#log-text').focus()
    }).render(true);
  }

  async _onEditLogEntry(event) {
    const logId = event.currentTarget.dataset.logId;
    const logs = game.settings.get("msh-faserip","combatLogs")||[];
    const log = logs.find(l => l.id === logId);
    if (!log) return;
    new Dialog({
      title: "Edit Log Entry",
      content: `<textarea id="log-text" rows="3" style="width:100%;padding:4px;">${log.text}</textarea>`,
      buttons: {
        save: { label: "Save", callback: async (html) => {
          log.text = html.find('#log-text').val().trim();
          await game.settings.set("msh-faserip","combatLogs",logs); this.render(true);
        }},
        cancel: { label: "Cancel" }
      }, default: "save"
    }).render(true);
  }

  async _onDeleteLogEntry(event) {
    const logId = event.currentTarget.dataset.logId;
    const logs = game.settings.get("msh-faserip","combatLogs")||[];
    const log = logs.find(l => l.id === logId);
    if (!log) return;
    if (await Dialog.confirm({ title: "Delete", content: `<p>Delete: "${log.text}"?</p>` })) {
      await game.settings.set("msh-faserip","combatLogs",logs.filter(l=>l.id!==logId)); this.render(true);
    }
  }

  async _onClearAllLogs() {
    if (await Dialog.confirm({ title: "Clear Logs", content: "<p>Delete all log entries?</p>" })) {
      await game.settings.set("msh-faserip","combatLogs",[]); this.render(true);
    }
  }

  _formatDateTime() {
    try { return game.msh.getCampaignDateTime().formatted; }
    catch { return "Time unavailable"; }
  }

  _getGameDate() {
    try {
      const d = game.msh.getCampaignDateTime().date;
      return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
    } catch { return ""; }
  }

  // ===== TIME METHODS =====

  async _adjustTimeByUnit(unit, direction) {
    const ctt = game.modules.get("calendar-time-tracker");
    const auth = game.settings.get("msh-faserip", "ctt.timeAuthority") ?? false;
    if (auth && ctt?.active && ctt.api) { ctt.api.advanceTime(direction, unit); return; }
    const d = new Date(game.msh.getCampaignDateTime().date);
    switch(unit) {
      case 'year': d.setFullYear(d.getFullYear()+direction); break;
      case 'month': d.setMonth(d.getMonth()+direction); break;
      case 'day': d.setDate(d.getDate()+direction); break;
      case 'hour': d.setHours(d.getHours()+direction); break;
      case 'minute': d.setMinutes(d.getMinutes()+direction); break;
      case 'second': d.setSeconds(d.getSeconds()+direction); break;
    }
    await this._setCampaignTimeTo(d);
  }

  async _setTimeFromInputs(html) {
    const y=parseInt(html.find('.time-input[data-field="year"]').val())||1976;
    const mo=parseInt(html.find('.time-input[data-field="month"]').val())||1;
    const dy=parseInt(html.find('.time-input[data-field="day"]').val())||1;
    const h=parseInt(html.find('.time-input[data-field="hour"]').val())||0;
    const mi=parseInt(html.find('.time-input[data-field="minute"]').val())||0;
    const s=parseInt(html.find('.time-input[data-field="second"]').val())||0;
    const ctt=game.modules.get("calendar-time-tracker");
    const auth=game.settings.get("msh-faserip","ctt.timeAuthority")??false;
    if (auth&&ctt?.active&&ctt.api) { ctt.api.setDateTime({year:y,month:mo-1,day:dy,hour:h,minute:mi,second:s}); return; }
    await this._setCampaignTimeTo(new Date(y,mo-1,dy,h,mi,s));
  }

  async _setCampaignTimeTo(targetDate) {
    const ctt=game.modules.get("calendar-time-tracker");
    const auth=game.settings.get("msh-faserip","ctt.timeAuthority")??false;
    if (auth&&ctt?.active&&ctt.api) {
      ctt.api.setDateTime({ year:targetDate.getFullYear(),month:targetDate.getMonth(),
        day:targetDate.getDate(),hour:targetDate.getHours(),
        minute:targetDate.getMinutes(),second:targetDate.getSeconds() });
      return;
    }
    const start=new Date(game.settings.get("msh-faserip","campaignStartDate"));
    const elapsed=Math.floor((targetDate-start)/1000);
    await game.settings.set("msh-faserip","campaignStartWorldTime",game.time.worldTime-elapsed);
    Hooks.callAll("msh-faserip.timeUpdated");
    this.render(false);
  }

  async _onTimeSettings(event) {
    event.preventDefault();
    const ct=game.msh.getCampaignDateTime();
    const startDate=game.settings.get("msh-faserip","campaignStartDate");
    new Dialog({
      title: "Time Settings",
      content: `<form>
        <div class="form-group"><label>Campaign Start</label>
          <input type="datetime-local" name="startDateTime" value="${startDate.slice(0,16)}" style="width:100%;padding:5px;"></div>
        <div class="form-group"><label>Current Time</label>
          <input type="datetime-local" name="currentDateTime" value="${ct.date.toISOString().slice(0,16)}" style="width:100%;padding:5px;">
          <p class="notes">Elapsed: ${Math.floor(ct.elapsedSeconds/86400)}d ${Math.floor((ct.elapsedSeconds%86400)/3600)}h</p></div>
        <div class="form-group"><label><input type="checkbox" name="combatSync" ${game.settings.get("msh-faserip","combatSyncEnabled")?"checked":""}> Auto-sync combat (6s/round)</label></div>
      </form>`,
      buttons: {
        save: { icon:'<i class="fas fa-save"></i>', label:"Save",
          callback: async (html) => {
            const ns=html.find('[name="startDateTime"]').val()+":00";
            const nc=html.find('[name="currentDateTime"]').val()+":00";
            const cs=html.find('[name="combatSync"]').prop('checked');
            const sd=new Date(ns), cd=new Date(nc);
            const ctt=game.modules.get("calendar-time-tracker");
            const auth=game.settings.get("msh-faserip","ctt.timeAuthority")??false;
            if (auth&&ctt?.active&&ctt.api) {
              await game.settings.set("msh-faserip","campaignStartDate",ns);
              await game.settings.set("msh-faserip","combatSyncEnabled",cs);
              ctt.api.setDateTime({year:cd.getFullYear(),month:cd.getMonth(),day:cd.getDate(),
                hour:cd.getHours(),minute:cd.getMinutes(),second:cd.getSeconds()});
            } else {
              const el=Math.floor((cd-sd)/1000);
              await game.settings.set("msh-faserip","campaignStartDate",ns);
              await game.settings.set("msh-faserip","campaignStartWorldTime",game.time.worldTime-el);
              await game.settings.set("msh-faserip","combatSyncEnabled",cs);
            }
            ui.notifications.info("Time settings updated");
            this.render(false); Hooks.callAll("msh-faserip.timeUpdated");
          }
        },
        cancel: { icon:'<i class="fas fa-times"></i>', label:"Cancel" }
      }, default:"save"
    }).render(true);
  }

} // end of class TeamSheet
