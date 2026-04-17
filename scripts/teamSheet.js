// teamSheet.js v4.10.0 - 2026-04-17
// v4.10.0: Parser accepts inline KARMA: directive for raw module-text
//          award blocks. One KARMA: line can hold multiple "label:
//          ±amount" pairs which each become a BONUS with scope=split
//          and rule=custom. "-ALL" kill-penalty entries generate a
//          warning instructing the GM to add a Death event manually
//          rather than inventing a magic number. Supports the common
//          case of pasting module text verbatim without reformatting
//          into one-BONUS-per-line.
// v4.9.0: Multi-crime support per encounter. The single crimeType +
//         stopped/arrested trio is replaced with a crimes array, each
//         entry carrying its own type/stopped/arrested flags. UI gains
//         a repeatable crime-row list with Add Crime button matching
//         the existing Foe/Bonus pattern. Legacy encounters with a
//         single crimeType are lazily migrated to one-entry crimes
//         array on first read. Parser accepts multiple CRIME: lines
//         per encounter. Matches RAW Example 3 where a single fight
//         awards Stop+Arrest for multiple overlapping crimes
//         (theft, conspiracy, etc.).
// v4.8.0: Rule category dropdown on bonus line items. Each bonus now
//         carries a rule field tagging it as a RAW karma category
//         (Personal Commitment, Role-Play Award, Rescue, etc.) or
//         Custom for module-specific awards. Selecting a rule auto-sets
//         the amount to the RAW base value (if blank or matching the
//         previous rule's base) and filters scope choices to those RAW
//         allows for that category — forbidden scopes show as disabled
//         with a "RAW: no" annotation rather than being hidden. Parser
//         accepts an optional 5th field for rule (BONUS: label, amount,
//         scope, rule). Legacy bonuses without a rule default to
//         "custom". Rule catalog lives in karma-rules.js.
// v4.7.0: Import encounter from pasted text. GM clicks "Import" on the
//         Encounter tab, pastes a structured markdown-like block describing
//         a module chapter's karma awards, reviews the parsed preview, and
//         commits. Parser is forgiving — unrecognized lines are logged as
//         warnings rather than aborting. Designed so OCR'd module text can
//         be cleaned up by a human (or AI assistant) into the format and
//         imported in seconds. Format documented inline in the import
//         dialog. New static method TeamSheet._parseEncounterText.
// v4.6.0: Full-share groupAwardMode removed. Only "split" (RAW) and "pool"
//         remain. Worlds with legacy groupAwardMode="full" are silently
//         migrated to "split" via getGroupAwardMode. GMs who want the
//         full-share behavior should set karmaMultiplier to expected
//         party size (e.g. ×4 for a 4-hero table). Rationale: full share
//         was mathematically equivalent to Split + multiplier=party size,
//         and exposing both modes obscured what was actually happening.
//         Community convention is to tune generosity via multiplier, not
//         mode. _buildBreakdownText drops its now-unused mode parameter.
// v4.5.1: Editable date/time on expanded encounter view. GM can backdate
//         missed encounters, fix typos, or set dates for pre-loaded module
//         encounters. "Now" button snaps to current campaign date/time.
//         Plain text inputs — format-agnostic across Greyhawk, Gregorian,
//         and any other CTT preset.
// v4.5.0: Per-bonus scope (split | individual | per_hero) and per-encounter
//         lossScope (split | per_hero). Bonus rows expose a scope select and
//         a hero picker when scope=individual. Award math routes split
//         bonuses through the group pool, applies individual bonuses only to
//         the named hero, and applies per_hero bonuses at full amount to
//         every present hero. Property Damage losses can now be set per_hero
//         to match RAW (-5/area per participant). Legacy bonuses without a
//         scope field default to "split"; legacy losses default to "split"
//         lossScope. Migration is non-destructive (persisted on next write).
// v4.4.2: Encounter card preview strings (summaryLine / netLine) now built
//         in getData() based on groupAwardMode. Template no longer hardcodes
//         the division format.
// v4.4.1: Encounter row preview math in getData() now routes through
//         computeGroupAward/computeLossAmount so the inline per-hero totals
//         shown on each encounter row match the award that will actually
//         fire. Previously the preview always divided by hero count.
// v4.4.0: Encounter awards now route through karma-multipliers.js helper.
//         Respects groupAwardMode setting. Category multipliers apply per
//         event type. Losses only multiplied if penalty category multiplier > 1.
// v4.3.0: Tabbed UI (Team / Encounters / HQ). Tabs persist only for window
//         lifetime; default is Encounters for GMs, Team for players.
//         - Team tab: roster, karma pool (if enabled), team actions (Bio,
//           R+I+P if enabled, Close Session placeholder).
//         - Encounters tab: encounter list (existing workflow untouched).
//         - HQ tab: headquarters list (promoted from collapsible section).
//         - New teamName and teamBioJournalId settings seed future team-
//           profile work. _onOpenTeamBio creates/opens a structured journal.
//         Data model unchanged — existing settings and encounter format
//         preserved so this is a pure UI refactor.
// v4.2.0: Critical fixes.
//         - getHighestRank read wrong path (system.abilities.abilities) so
//           ability-only villains always registered as Shift-0(0) and awarded
//           zero karma. Path corrected to system.abilities.
//         - _captureDefeatedFromCombat captured ALL hostiles regardless of
//           outcome. Now only captures combatants flagged defeated or at 0 HP.
//         - Add Encounter dialog no longer auto-flags stopped:true on
//           crime type selection; GM confirms stop/arrest explicitly.
//         - R+I+P session bonus (house rule) gated behind new
//           sessionRIPBonus setting; button hidden when off.
// v4.1.0: Add Event type (foe-less karma events) alongside encounters.
//         GM Award field on both events and encounters. Missing karma types added.
import { computeGroupAward, computeLossAmount, getGroupAwardMode, getCategoryMultiplier } from "./karma-multipliers.js";
import { KARMA_RULES, getRuleOptionsGrouped, getScopeOptionsForRule, getBaseAmountForRule, getCapForRule, normalizeRuleKey } from "./karma-rules.js";

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

  // Returns normalized crimes array. Lazy migration from legacy
  // crimeType/stopped/arrested single-crime shape. Does not mutate
  // the encounter — caller must write back to persist migration.
  static _normalizeCrimes(enc) {
    if (Array.isArray(enc.crimes)) return enc.crimes;
    if (enc.crimeType) {
      return [{
        type: enc.crimeType,
        stopped: !!enc.stopped,
        arrested: !!enc.arrested
      }];
    }
    return [];
  }

  constructor(options = {}) {
    super(options);
    this._removeMode = false;
    this._expandedEncounters = new Set();
    this._activeTab = null; // "team" | "encounters" | "hq" — defaulted in getData
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
    context.sessionRIPBonus = game.settings.get("msh-faserip", "sessionRIPBonus") ?? false;

    // Tabs
    // Default encounters for GMs (primary workflow); Team for players (who
    // can't see encounters list anyway).
    if (!this._activeTab) this._activeTab = context.isGM ? "encounters" : "team";
    context.activeTab = this._activeTab;
    context.isTeamTab = context.activeTab === "team";
    context.isEncountersTab = context.activeTab === "encounters";
    context.isHqTab = context.activeTab === "hq";

    // Team identity (seed fields — filled in by later bio/profile work)
    context.teamName = game.settings.get("msh-faserip", "teamName") || "Team Tracker";
    context.teamBioJournalId = game.settings.get("msh-faserip", "teamBioJournalId") || "";
    context.hasTeamBio = !!context.teamBioJournalId && !!game.journal?.get(context.teamBioJournalId);

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
    const groupMode = getGroupAwardMode();
    context.groupAwardMode = groupMode;

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

      const crimesRaw = TeamSheet._normalizeCrimes(enc);
      let stopValue = 0, arrestValue = 0;
      const crimes = crimesRaw.map((c, ci) => {
        const cv = c.type ? TeamSheet.CRIME_VALUES[c.type] : null;
        const sv = cv && c.stopped ? cv.stop : 0;
        const av = cv && c.arrested ? cv.arrest : 0;
        stopValue += sv;
        arrestValue += av;
        return {
          ...c, ci,
          label: this._crimeLabel(c.type),
          stopValue: cv ? cv.stop : 0,
          arrestValue: cv ? cv.arrest : 0,
          typeOptions: [
            { value: "",                   label: "— None —",                 selected: !c.type },
            { value: "violent",            label: "Violent Crime (30/15)",    selected: c.type === "violent" },
            { value: "destructive",        label: "Destructive Crime (20/10)", selected: c.type === "destructive" },
            { value: "theft",              label: "Theft (10/5)",             selected: c.type === "theft" },
            { value: "robbery",            label: "Robbery (20/10)",          selected: c.type === "robbery" },
            { value: "misdemeanor",        label: "Misdemeanor (5/5)",        selected: c.type === "misdemeanor" },
            { value: "national",           label: "National Offense (20/10)", selected: c.type === "national" },
            { value: "localConspiracy",    label: "Local Conspiracy (30/15)", selected: c.type === "localConspiracy" },
            { value: "nationalConspiracy", label: "National Conspiracy (40/20)", selected: c.type === "nationalConspiracy" },
            { value: "globalConspiracy",   label: "Global Conspiracy (50/25)", selected: c.type === "globalConspiracy" },
            { value: "other",              label: "Other Crimes (15/5)",      selected: c.type === "other" }
          ]
        };
      });
      const rescueKarma = Math.min((enc.rescues || 0) * 20, 100);
      const gmAward = Math.max(0, enc.gmAward || 0);

      // Scope-aware totals
      const totals = this._calcEncounterTotals(enc);
      const {
        splitPositive, splitLoss,
        perHeroPositive, perHeroLoss,
        individualByHero,
        bonusPositive, bonusNegative,
        lossScope
      } = totals;

      const presentIds = (enc.presentHeroIds || []).filter(id => game.actors.get(id));
      const heroCount = Math.max(1, presentIds.length);

      const splitAward = computeGroupAward({
        eventType: "Encounter Award",
        baseAmount: splitPositive,
        heroCount,
        groupMode
      });
      const perHeroFromSplit = splitAward.perHero;
      const splitMultiplied = splitAward.groupTotal;
      const encMult = splitAward.multiplier;

      // Losses: split portion divides, per_hero portion applies at full
      const splitLossPerHero = splitLoss ? computeLossAmount(splitLoss, heroCount, groupMode) : 0;
      // perHeroLoss applies to every present hero at full; apply penalty mult if > 1
      const penMult = getCategoryMultiplier("penalty");
      const lossMult = penMult > 1 ? penMult : 1;
      const perHeroLossShown = perHeroLoss ? Math.ceil(perHeroLoss * lossMult) : 0;
      // Positive per-hero applies at full to each present hero
      const perHeroPosShown = perHeroPositive ? Math.floor(perHeroPositive * encMult) : 0;

      // Individual bonuses — lookup per hero
      const individualLines = [];
      for (const [hid, items] of Object.entries(individualByHero)) {
        const hero = game.actors.get(hid);
        if (!hero) continue;
        for (const it of items) {
          individualLines.push({
            heroId: hid, heroName: hero.name,
            label: it.label, amount: it.amount
          });
        }
      }

      const perHeroNet = perHeroFromSplit + perHeroPosShown + splitLossPerHero + perHeroLossShown;

      // Bonus rows with hero options for individual scope
      const presentHeroOpts = presentIds.map(id => {
        const a = game.actors.get(id);
        return a ? { id, name: a.name } : null;
      }).filter(Boolean);
      const bonusRows = (Array.isArray(enc.bonuses) ? enc.bonuses : []).map((b, bi) => {
        const scope = b.scope || "split";
        const rule = b.rule || "custom";
        const ruleBase = getBaseAmountForRule(rule);
        const cap = getCapForRule(rule);
        const overCap = cap !== null && Math.abs(b.amount || 0) > Math.abs(cap);
        return {
          ...b, bi, scope, rule,
          isSplit: scope === "split",
          isIndividual: scope === "individual",
          isPerHero: scope === "per_hero",
          ruleGroups: getRuleOptionsGrouped(rule),
          scopeOptions: getScopeOptionsForRule(rule, scope),
          ruleBase, cap, overCap,
          ruleIsCustom: rule === "custom",
          ruleLabel: KARMA_RULES[rule]?.label || "Custom",
          heroOptions: presentHeroOpts.map(o => ({ ...o, selected: o.id === b.heroId }))
        };
      });

      let summaryLine, netLine;
      summaryLine = `Split: +${splitPositive} ×${encMult} = +${splitMultiplied} ÷${heroCount} = <strong>+${perHeroFromSplit}/ea</strong>`;
      if (perHeroPosShown) summaryLine += ` &nbsp;|&nbsp; Per-hero: <strong>+${perHeroPosShown}/ea</strong>`;
      if (splitLossPerHero) summaryLine += ` &nbsp;|&nbsp; Loss: <strong>${splitLossPerHero}/ea</strong>`;
      if (perHeroLossShown) summaryLine += ` &nbsp;|&nbsp; Per-hero loss: <strong>${perHeroLossShown}/ea</strong>`;
      netLine = `Net: <strong>${perHeroNet}/ea</strong> to ${heroCount} hero${heroCount === 1 ? '' : 'es'}`;
      if (individualLines.length) {
        const indStr = individualLines.map(l =>
          `${l.heroName}: ${l.label || 'Award'} ${l.amount > 0 ? '+' : ''}${l.amount}`
        ).join('; ');
        netLine += ` &nbsp;|&nbsp; Individual: ${indStr}`;
      }

      const heroChecks = (context.teamMembers || []).map(tm => ({
        id: tm.id, name: tm.name, img: tm.img,
        present: (enc.presentHeroIds || []).includes(tm.id)
      }));

      const villainNames = villainRows.map(v => v.name).join(', ');
      const displayName = hasName ? enc.name : (villainNames || "Encounter");
      const dateDisplay = [enc.gameDate, enc.gameTime].filter(Boolean).join(' ');

      // Header pill: show net/ea when sensible; fall back to gross positive
      const headerKarma = perHeroNet !== 0 ? perHeroNet : (splitPositive + perHeroPositive + totals.individualPos);
      const hasPositive = headerKarma > 0 || splitPositive > 0 || perHeroPositive > 0 || totals.individualPos > 0;

      return {
        ...enc, expanded, hasFoes, hasName, villainRows, foeTotal,
        stopValue, arrestValue, rescueKarma, gmAward,
        lossKarma: splitLoss, losses: enc.losses || 0, lossScope,
        lossScopeSplit: lossScope === "split", lossScopePerHero: lossScope === "per_hero",
        bonuses: bonusRows, bonusPositive, bonusNegative: bonusNegative || 0,
        splitPositive, perHeroBonusRaw: perHeroPositive, perHeroBonusShown: perHeroPosShown,
        individualLines,
        positiveTotal: splitPositive, // legacy alias
        heroCount,
        perHeroFromSplit,
        perHeroLoss: splitLossPerHero, perHeroLossExtra: perHeroLossShown,
        perHeroNet, summaryLine, netLine, encMult,
        heroChecks, villainNames, displayName, dateDisplay,
        crimes, crimeType: enc.crimeType || "",
        headerKarma, hasPositive
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

    // Tabs
    html.find('.tt-tab').click(ev => {
      const tab = ev.currentTarget.dataset.tab;
      if (!tab || tab === this._activeTab) return;
      this._activeTab = tab;
      this.render(false);
    });

    // Team tab: bio + placeholder session actions
    html.find('.tt-open-bio').click(() => this._onOpenTeamBio());
    html.find('.tt-close-session').click(() => this._onCloseSessionPlaceholder());

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
    html.find('.crime-type-row').change(ev => this._onCrimeFieldChange(ev, 'type', ev.currentTarget.value));
    html.find('.crime-stopped-row').change(ev => this._onCrimeFieldChange(ev, 'stopped', ev.currentTarget.checked));
    html.find('.crime-arrested-row').change(ev => this._onCrimeFieldChange(ev, 'arrested', ev.currentTarget.checked));
    html.find('.add-crime').click(ev => this._onAddCrime(ev));
    html.find('.delete-crime').click(ev => this._onDeleteCrime(ev));
    html.find('.rescue-count').change(ev => this._onEncNumericChange(ev, 'rescues'));
    html.find('.loss-amount').change(ev => this._onEncNumericChange(ev, 'losses'));

    // Actions
    html.find('.add-encounter-manual').click(() => this._onAddEncounter());
    html.find('.import-encounter-text').click(() => this._onImportEncounterFromText());
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
    html.find('.bonus-scope-select').change(ev => this._onBonusScopeChange(ev));
    html.find('.bonus-hero-select').change(ev => this._onBonusFieldChange(ev, 'heroId'));
    html.find('.bonus-rule-select').change(ev => this._onBonusRuleChange(ev));
    html.find('.loss-scope-select').change(ev => this._onLossScopeChange(ev));
    html.find('.enc-name-input').change(ev => {
      const idx = Number(ev.currentTarget.dataset.encIdx);
      this._updateEncField(idx, 'name', ev.currentTarget.value.trim());
    });
    html.find('.enc-date-input').change(ev => {
      const idx = Number(ev.currentTarget.dataset.encIdx);
      this._updateEncField(idx, 'gameDate', ev.currentTarget.value.trim());
    });
    html.find('.enc-time-input').change(ev => {
      const idx = Number(ev.currentTarget.dataset.encIdx);
      this._updateEncField(idx, 'gameTime', ev.currentTarget.value.trim());
    });
    html.find('.enc-date-now').click(ev => this._onSetEncDateNow(ev));

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

  /**
   * Open or create the team's bio journal entry.
   * GM-only. Creates a blank journal with section-heading placeholders; the GM
   * fills in narrative prose. No auto-sync from tracker state into the journal.
   */
  async _onOpenTeamBio() {
    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can edit the team bio.");
      return;
    }
    const existingId = game.settings.get("msh-faserip", "teamBioJournalId");
    let journal = existingId ? game.journal?.get(existingId) : null;
    if (journal) return journal.sheet.render(true);

    const teamName = game.settings.get("msh-faserip", "teamName") || "The Team";
    const body = `<h2>Overview</h2><p></p>
<h2>Founding</h2><p><em>Date, location, founding members, and the event that brought them together.</em></p>
<h2>Members</h2><p><em>Current roster. Use @UUID[Actor.xxx]{Hero Name} to link to a hero.</em></p>
<h2>Former Members</h2><p></p>
<h2>History</h2><p></p>
<h2>Base of Operations</h2><p></p>
<h2>Allies &amp; Enemies</h2><p></p>`;

    journal = await JournalEntry.create({
      name: `${teamName} — Bio`,
      pages: [{ name: "Team Bio", type: "text", text: { content: body, format: 1 } }]
    });
    if (!journal) {
      ui.notifications.error("Failed to create team bio.");
      return;
    }
    await game.settings.set("msh-faserip", "teamBioJournalId", journal.id);
    journal.sheet.render(true);
    this.render(false);
  }

  /**
   * Placeholder for future "Close Session" action. The real implementation
   * needs session-boundary data (archived encounters, session metadata).
   */
  _onCloseSessionPlaceholder() {
    ui.notifications.info("Close Session: coming soon. Will archive awarded encounters into a session log.");
  }

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

  _onEncFieldChange(ev, field, value) {
    const idx = Number(ev.currentTarget.dataset.encIdx);
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
    encounters[idx].bonuses.push({ label: "", amount: 10, scope: "split", heroId: null, rule: "custom" });
    await game.settings.set("msh-faserip", "defeatedVillains", encounters);
    this.render(false);
  }

  async _onAddCrime(ev) {
    ev.stopPropagation();
    const idx = Number(ev.currentTarget.dataset.encIdx);
    const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
    if (!encounters[idx]) return;
    // Migrate legacy single-crime fields lazily
    if (!Array.isArray(encounters[idx].crimes)) {
      encounters[idx].crimes = TeamSheet._normalizeCrimes(encounters[idx]);
      delete encounters[idx].crimeType;
      delete encounters[idx].stopped;
      delete encounters[idx].arrested;
    }
    encounters[idx].crimes.push({ type: "", stopped: false, arrested: false });
    await game.settings.set("msh-faserip", "defeatedVillains", encounters);
    this.render(false);
  }

  async _onDeleteCrime(ev) {
    ev.stopPropagation();
    const encIdx = Number(ev.currentTarget.dataset.encIdx);
    const crimeIdx = Number(ev.currentTarget.dataset.crimeIdx);
    const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
    if (!Array.isArray(encounters[encIdx]?.crimes)) {
      encounters[encIdx].crimes = TeamSheet._normalizeCrimes(encounters[encIdx]);
      delete encounters[encIdx].crimeType;
      delete encounters[encIdx].stopped;
      delete encounters[encIdx].arrested;
    }
    encounters[encIdx].crimes.splice(crimeIdx, 1);
    await game.settings.set("msh-faserip", "defeatedVillains", encounters);
    this.render(false);
  }

  async _onCrimeFieldChange(ev, field, value) {
    const encIdx = Number(ev.currentTarget.dataset.encIdx);
    const crimeIdx = Number(ev.currentTarget.dataset.crimeIdx);
    const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
    if (!Array.isArray(encounters[encIdx]?.crimes)) {
      encounters[encIdx].crimes = TeamSheet._normalizeCrimes(encounters[encIdx]);
      delete encounters[encIdx].crimeType;
      delete encounters[encIdx].stopped;
      delete encounters[encIdx].arrested;
    }
    const c = encounters[encIdx].crimes[crimeIdx];
    if (!c) return;
    c[field] = value;
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
    let val;
    if (field === 'amount') val = Number(ev.currentTarget.value) || 0;
    else if (field === 'heroId') val = ev.currentTarget.value || null;
    else val = ev.currentTarget.value.trim();
    encounters[encIdx].bonuses[bonusIdx][field] = val;
    await game.settings.set("msh-faserip", "defeatedVillains", encounters);
    this.render(false);
  }

  async _onBonusScopeChange(ev) {
    const encIdx = Number(ev.currentTarget.dataset.encIdx);
    const bonusIdx = Number(ev.currentTarget.dataset.bonusIdx);
    const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
    const b = encounters[encIdx]?.bonuses?.[bonusIdx];
    if (!b) return;
    b.scope = ev.currentTarget.value || "split";
    // Auto-assign heroId when switching to individual if none set and present list has one
    if (b.scope === "individual" && !b.heroId) {
      const present = encounters[encIdx].presentHeroIds || [];
      if (present.length) b.heroId = present[0];
    }
    if (b.scope !== "individual") b.heroId = null;
    await game.settings.set("msh-faserip", "defeatedVillains", encounters);
    this.render(false);
  }

  async _onBonusRuleChange(ev) {
    const encIdx = Number(ev.currentTarget.dataset.encIdx);
    const bonusIdx = Number(ev.currentTarget.dataset.bonusIdx);
    const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
    const b = encounters[encIdx]?.bonuses?.[bonusIdx];
    if (!b) return;
    const prevRule = b.rule || "custom";
    const prevBase = getBaseAmountForRule(prevRule);
    const newRule = ev.currentTarget.value || "custom";
    const newBase = getBaseAmountForRule(newRule);

    b.rule = newRule;

    // Auto-set amount only if it's empty/zero or equals previous rule's base.
    // Never overwrite a number the GM explicitly tuned.
    const currentAmt = Number(b.amount) || 0;
    if (newBase !== null && (currentAmt === 0 || currentAmt === prevBase)) {
      b.amount = newBase;
    }

    // If current scope is no longer allowed by new rule, snap to first allowed
    const allowed = (KARMA_RULES[newRule]?.allowedScopes) || ["split", "individual", "per_hero"];
    if (!allowed.includes(b.scope || "split")) {
      b.scope = allowed[0];
      if (b.scope === "individual" && !b.heroId) {
        const present = encounters[encIdx].presentHeroIds || [];
        if (present.length) b.heroId = present[0];
      }
      if (b.scope !== "individual") b.heroId = null;
    }

    await game.settings.set("msh-faserip", "defeatedVillains", encounters);
    this.render(false);
  }

  async _onLossScopeChange(ev) {
    const idx = Number(ev.currentTarget.dataset.encIdx);
    const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
    if (!encounters[idx]) return;
    encounters[idx].lossScope = ev.currentTarget.value === "per_hero" ? "per_hero" : "split";
    await game.settings.set("msh-faserip", "defeatedVillains", encounters);
    this.render(false);
  }

  async _onSetEncDateNow(ev) {
    ev.stopPropagation();
    const idx = Number(ev.currentTarget.dataset.encIdx);
    const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
    if (!encounters[idx]) return;
    const { gameDate, gameTime } = TeamSheet._getGameDateTimeStatic();
    encounters[idx].gameDate = gameDate;
    encounters[idx].gameTime = gameTime;
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

  // ===== IMPORT FROM TEXT =====

  // Parses a structured text block into an encounter object.
  // Returns { encounter, warnings }. Forgiving — unrecognized lines
  // produce warnings rather than aborting.
  static _parseEncounterText(text) {
    const lines = (text || "").split(/\r?\n/);
    const enc = {
      id: `enc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: "",
      villains: [],
      presentHeroIds: [],
      crimes: [],
      rescues: 0, losses: 0, lossScope: "split",
      gmAward: 0,
      bonuses: [],
      awarded: false,
      gameDate: "", gameTime: "",
      timestamp: new Date().toISOString()
    };
    const warnings = [];

    const parseScope = (raw) => {
      if (!raw) return "split";
      const s = String(raw).toLowerCase().replace(/[-\s]/g, "_");
      if (s === "individual" || s === "ind") return "individual";
      if (s === "per_hero" || s === "perhero" || s === "ea" || s === "each") return "per_hero";
      return "split";
    };

    const crimeMap = {
      "violent": "violent", "destructive": "destructive",
      "theft": "theft", "robbery": "robbery",
      "misdemeanor": "misdemeanor", "national": "national",
      "national offense": "national",
      "local conspiracy": "localConspiracy", "localconspiracy": "localConspiracy",
      "national conspiracy": "nationalConspiracy", "nationalconspiracy": "nationalConspiracy",
      "global conspiracy": "globalConspiracy", "globalconspiracy": "globalConspiracy",
      "other": "other"
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith("#")) {
        const hashName = line.replace(/^#+\s*/, "").trim();
        if (hashName && !enc.name) enc.name = hashName;
        continue;
      }

      const colonIdx = line.indexOf(":");
      if (colonIdx < 0) {
        warnings.push(`Line ${i + 1}: no directive — skipped`);
        continue;
      }
      const key = line.slice(0, colonIdx).trim().toUpperCase();
      const val = line.slice(colonIdx + 1).trim();
      if (!val) continue;

      try {
        if (key === "NAME") {
          enc.name = val;
        } else if (key === "DATE") {
          enc.gameDate = val;
        } else if (key === "TIME") {
          enc.gameTime = val;
        } else if (key === "FOE") {
          const parts = val.split(",").map(s => s.trim());
          const name = parts[0];
          if (!name) { warnings.push(`Line ${i + 1}: FOE missing name`); continue; }
          const rankPart = parts[1] || "";
          const rankMatch = rankPart.match(/^([A-Za-z-]+)?\s*(-?\d+)?$/);
          let rankLabel = "Typical", rankValue = 6;
          if (rankMatch) {
            if (rankMatch[1]) rankLabel = rankMatch[1];
            if (rankMatch[2] !== undefined && rankMatch[2] !== "") rankValue = Number(rankMatch[2]);
          }
          const foe = { name, rankLabel, rankValue, count: 1, img: "icons/svg/mystery-man.svg", actorId: null };
          for (let p = 2; p < parts.length; p++) {
            const ext = parts[p].toLowerCase();
            const nMatch = ext.match(/^(?:count|x)\s*(\d+)$/);
            if (nMatch) foe.count = Math.max(1, parseInt(nMatch[1], 10));
            else if (ext === "teleported" || ext === "teleport") foe.teleported = true;
          }
          enc.villains.push(foe);
        } else if (key === "CRIME") {
          const parts = val.split(",").map(s => s.trim().toLowerCase());
          const type = parts[0];
          const mappedType = crimeMap[type] || type;
          enc.crimes.push({
            type: mappedType,
            stopped: parts.includes("stopped"),
            arrested: parts.includes("arrested")
          });
        } else if (key === "RESCUES") {
          const n = parseInt(val, 10);
          if (!isNaN(n) && n > 0) enc.rescues = Math.min(n, 99);
        } else if (key === "GM" || key === "GM AWARD") {
          const n = parseInt(val, 10);
          if (!isNaN(n) && n > 0) enc.gmAward = n;
        } else if (key === "BONUS") {
          const parts = val.split(",").map(s => s.trim());
          const label = parts[0] || "";
          const amt = parseInt(parts[1], 10);
          if (isNaN(amt)) { warnings.push(`Line ${i + 1}: BONUS amount not a number`); continue; }
          const scope = parseScope(parts[2]);
          const rule = normalizeRuleKey(parts[3]);
          enc.bonuses.push({ label, amount: amt, scope, heroId: null, rule });
        } else if (key === "LOSS" || key === "LOSSES") {
          const parts = val.split(",").map(s => s.trim());
          if (parts.length === 1 && /^-?\d+$/.test(parts[0])) {
            enc.losses = Math.abs(parseInt(parts[0], 10));
            continue;
          }
          const label = parts[0] || "";
          const amt = parseInt(parts[1], 10);
          if (isNaN(amt)) { warnings.push(`Line ${i + 1}: LOSS amount not a number`); continue; }
          const scope = parseScope(parts[2]);
          const rule = normalizeRuleKey(parts[3]);
          const finalAmt = amt > 0 ? -amt : amt;
          if (scope === "per_hero" && /property|damage|area/i.test(label)) {
            enc.losses = Math.abs(finalAmt);
            enc.lossScope = "per_hero";
          } else {
            enc.bonuses.push({ label, amount: finalAmt, scope, heroId: null, rule });
          }
        } else if (key === "KARMA") {
          // Inline block of "label: ±amount" pairs from raw module text.
          // Example: KARMA: Capturing Mongoose: +100 Letting him go: -40
          // Each pair becomes a BONUS with scope=split, rule=custom.
          // -ALL is noted as a warning rather than given a magic number.
          const pairs = [];
          const rx = /([^:]+?):\s*([+-]?(?:\d+|ALL))/gi;
          let m;
          while ((m = rx.exec(val)) !== null) {
            pairs.push({ label: m[1].trim().replace(/^[,;.\s]+|[,;.\s]+$/g, ""), raw: m[2].toUpperCase() });
          }
          if (!pairs.length) {
            warnings.push(`Line ${i + 1}: KARMA block had no recognizable "label: ±amount" pairs`);
            continue;
          }
          for (const p of pairs) {
            if (p.raw.includes("ALL")) {
              warnings.push(`Line ${i + 1}: "${p.label}" = -ALL (kill penalty) — add manually via a Death event; not imported`);
              continue;
            }
            const amt = parseInt(p.raw, 10);
            if (isNaN(amt) || amt === 0) continue;
            enc.bonuses.push({ label: p.label, amount: amt, scope: "split", heroId: null, rule: "custom" });
          }
        } else {
          warnings.push(`Line ${i + 1}: unknown directive "${key}"`);
        }
      } catch (err) {
        warnings.push(`Line ${i + 1}: parse error — ${err.message}`);
      }
    }

    if (!enc.name && enc.villains.length) {
      enc.name = enc.villains.map(v => v.name).join(", ");
    }

    return { encounter: enc, warnings };
  }

  _renderImportPreview(enc, warnings) {
    const foeRows = enc.villains.map(v =>
      `<li>${v.name} — ${v.rankLabel}(${v.rankValue})${v.count > 1 ? ` ×${v.count}` : ""}${v.teleported ? " [teleported, half karma]" : ""}</li>`
    ).join("");
    const bonusRows = enc.bonuses.map(b => {
      const sign = b.amount > 0 ? "+" : "";
      const scopeTag = b.scope === "individual" ? " [individual]" : b.scope === "per_hero" ? " [per hero]" : "";
      return `<li>${b.label || "(unlabeled)"}: ${sign}${b.amount}${scopeTag}</li>`;
    }).join("");
    const crimes = TeamSheet._normalizeCrimes(enc);
    const crimeStr = crimes.length
      ? crimes.map(c => `${c.type || '(no type)'}${c.stopped ? " stopped" : ""}${c.arrested ? " arrested" : ""}`).join("; ")
      : "—";
    const dateStr = [enc.gameDate, enc.gameTime].filter(Boolean).join(" ") || "—";
    const lossStr = enc.losses
      ? `${enc.losses}${enc.lossScope === "per_hero" ? " per hero" : " split"}`
      : "—";
    const warnBlock = warnings.length
      ? `<div style="background:#fff3cd;border:1px solid #e0a800;padding:6px 8px;border-radius:3px;margin-top:8px;font-size:12px;">
          <strong>${warnings.length} warning${warnings.length === 1 ? "" : "s"}:</strong>
          <ul style="margin:4px 0 0 18px;padding:0;">${warnings.map(w => `<li>${w}</li>`).join("")}</ul>
        </div>`
      : "";
    return `
      <div style="font-size:12px;line-height:1.5;">
        <div><strong>Name:</strong> ${enc.name || "(unnamed)"}</div>
        <div><strong>Date:</strong> ${dateStr}</div>
        <div><strong>Crime:</strong> ${crimeStr}</div>
        <div><strong>Rescues:</strong> ${enc.rescues || 0}</div>
        <div><strong>GM Award:</strong> ${enc.gmAward || 0}</div>
        <div><strong>Losses:</strong> ${lossStr}</div>
        <div style="margin-top:6px;"><strong>Foes (${enc.villains.length}):</strong></div>
        ${foeRows ? `<ul style="margin:2px 0 0 18px;padding:0;">${foeRows}</ul>` : "<div style='color:#888;margin-left:8px;'>none</div>"}
        <div style="margin-top:6px;"><strong>Bonuses (${enc.bonuses.length}):</strong></div>
        ${bonusRows ? `<ul style="margin:2px 0 0 18px;padding:0;">${bonusRows}</ul>` : "<div style='color:#888;margin-left:8px;'>none</div>"}
        ${warnBlock}
      </div>
    `;
  }

  _onImportEncounterFromText() {
    if (!game.user.isGM) return;

    const formatHelp = `Lines start with a directive followed by a colon. Blank lines and # comments are ignored.

# Encounter Name (or use NAME:)
DATE: Fireseek 11, 570 CY
TIME: 11:30 PM
FOE: Werewolf, Incredible 40, teleported
FOE: Batboys, Typical 6, count 4
CRIME: destructive, stopped
CRIME: violent, stopped, arrested    (CRIME is repeatable per encounter)
RESCUES: 3
GM AWARD: 20
BONUS: Keeping Werewolf from killing, +30, split
BONUS: Getting Johnny out of gang, +25, individual, role-play-award
BONUS: Clever plan, +15, split, stump-the-judge
LOSS: Property damage, -5, per_hero    (→ sets losses field)
LOSS: Allowing innocents to die, -15, split    (→ negative bonus)
LOSS: 20    (→ plain number goes to losses field, split by default)
KARMA: Capturing X: +100 Letting X escape: -40 Capturing thugs: +45
    (→ inline block; each "label: ±amount" pair becomes a BONUS.
       Use for pasting raw module karma text without reformatting.
       "-ALL" entries warn rather than import — add Death events
       manually.)

Scopes: split (default), individual, per_hero (or "ea")
Rules (optional 4th field on BONUS/LOSS): role-play-award, personal-
commitment, rescue, stump-the-judge, humor-award, etc. See karma-rules.js
for the full catalog. Defaults to "custom".
Unrecognized lines become warnings. Amounts can be positive or negative.`;

    const content = `
      <form class="enc-import-form">
        <div style="display:flex;gap:10px;align-items:flex-start;">
          <div style="flex:1;min-width:0;">
            <label style="font-weight:600;font-size:12px;">Paste encounter text:</label>
            <textarea class="enc-import-text" rows="14" style="width:100%;font-family:monospace;font-size:12px;margin-top:3px;" placeholder="# My Encounter&#10;FOE: Werewolf, Incredible 40&#10;BONUS: Heroic stand, +30, split"></textarea>
            <div style="margin-top:6px;">
              <button type="button" class="enc-import-parse" style="width:100%;padding:4px;">Parse & preview</button>
            </div>
          </div>
          <div style="flex:1;min-width:0;">
            <label style="font-weight:600;font-size:12px;">Preview:</label>
            <div class="enc-import-preview" style="margin-top:3px;padding:8px;background:#faf8f2;border:1px solid #ccc;border-radius:3px;min-height:260px;max-height:360px;overflow-y:auto;font-size:12px;color:#666;">
              <em>Paste text and click Parse to preview.</em>
            </div>
          </div>
        </div>
        <details style="margin-top:8px;">
          <summary style="cursor:pointer;font-size:12px;font-weight:600;">Format help</summary>
          <pre style="font-size:11px;background:#f5f5f0;padding:8px;border-radius:3px;margin-top:4px;white-space:pre-wrap;">${formatHelp}</pre>
        </details>
      </form>
    `;

    let parsedEnc = null;

    const dlg = new Dialog({
      title: "Import Encounter from Text",
      content,
      buttons: {
        create: {
          icon: '<i class="fas fa-check"></i>',
          label: "Create Encounter",
          callback: async (html) => {
            if (!parsedEnc) {
              ui.notifications.warn("Parse the text first before creating.");
              return false;
            }
            const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
            encounters.push(parsedEnc);
            await game.settings.set("msh-faserip", "defeatedVillains", encounters);
            // Auto-expand the new encounter so GM can review/edit
            const newIdx = encounters.length - 1;
            this._expandedEncounters.add(newIdx);
            ui.notifications.info(`Imported encounter: ${parsedEnc.name || "(unnamed)"}`);
            this.render(true);
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "create",
      render: (html) => {
        html.find(".enc-import-parse").click(() => {
          const text = html.find(".enc-import-text").val();
          if (!text || !text.trim()) {
            html.find(".enc-import-preview").html('<em style="color:#c00;">No text to parse.</em>');
            parsedEnc = null;
            return;
          }
          const { encounter, warnings } = TeamSheet._parseEncounterText(text);
          parsedEnc = encounter;
          html.find(".enc-import-preview").html(this._renderImportPreview(encounter, warnings));
        });
      }
    }, { width: 760, height: 560, resizable: true });

    dlg.render(true);
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
      content: `<form>
        <!-- Name -->
        <div class="form-group">
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;">Name</label>
          <input type="text" name="encName" placeholder="e.g., Ch2: Wideawake Ambush" style="font-size:13px;" />
        </div>

        <!-- Date / Time -->
        <div class="form-group">
          <label style="font-size:10px;color:#666;">Date</label>
          <input type="text" name="gameDate" value="${gameDate}" style="font-size:12px;" />
        </div>
        <div class="form-group">
          <label style="font-size:10px;color:#666;">Time</label>
          <input type="text" name="gameTime" value="${gameTime}" style="font-size:12px;" />
        </div>

        <!-- Award Line Items (primary section) -->
        <div style="border:2px solid #8b0000;border-radius:4px;padding:6px 8px;margin-bottom:8px;background:#fefefe;">
          <div style="font-size:12px;font-weight:700;color:#8b0000;text-transform:uppercase;letter-spacing:.3px;margin-bottom:4px;">Karma Awards</div>
          <div class="enc-bonus-list" style="min-height:24px;margin-bottom:6px;padding:3px;background:#fafafa;border:1px solid #ddd;border-radius:3px;">
            <div style="font-size:11px;color:#888;font-style:italic;padding:2px 4px;">No awards yet — add task rewards, milestone bonuses, or penalties below.</div>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label style="flex:0 0 auto;font-size:10px;color:#666;">Label</label>
            <input type="text" name="bonusLabel" placeholder="e.g., Protecting Hargrove" style="font-size:12px;" />
          </div>
          <div class="form-group" style="margin-bottom:4px;">
            <label style="flex:0 0 auto;font-size:10px;color:#666;">Amt</label>
            <div style="display:flex;gap:6px;align-items:center;flex:1;">
              <input type="number" name="bonusAmount" value="10" style="width:55px;font-size:12px;text-align:center;" />
              <button type="button" class="enc-add-bonus-btn" style="padding:4px 12px;font-size:11px;font-weight:700;color:#fff;background:#8b0000;border:0;border-radius:3px;cursor:pointer;white-space:nowrap;">+</button>
            </div>
          </div>
          <div style="font-size:10px;color:#888;font-style:italic;">Custom awards/penalties. Subject to multiplier &amp; hero split.</div>
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
              <div class="form-group" style="margin-bottom:4px;">
                <label style="font-size:10px;color:#666;">Pick actor</label>
                <select name="actorId" style="font-size:12px;"><option value="">— Manual entry —</option>${hostileOpts}</select>
              </div>
              <div class="form-group" style="margin-bottom:2px;">
                <label style="font-size:10px;color:#666;">Name</label>
                <input type="text" name="foeName" placeholder="e.g., Rhino" style="font-size:12px;" />
              </div>
              <div class="form-group" style="margin-bottom:0;">
                <label style="font-size:10px;color:#666;">Rank</label>
                <div style="display:flex;gap:6px;align-items:center;flex:1;">
                  <select name="rank" style="font-size:12px;flex:1;">${rankOpts}</select>
                  <button type="button" class="enc-add-foe-btn" style="padding:4px 8px;font-size:11px;font-weight:700;color:#fff;background:#8b0000;border:0;border-radius:3px;cursor:pointer;white-space:nowrap;">+ Foe</button>
                </div>
              </div>
            </div>

            <!-- Crime -->
            <div class="form-group">
              <label style="font-size:10px;font-weight:700;color:#666;text-transform:uppercase;">Crime</label>
              <select name="crimeType" style="font-size:12px;">${crimeOpts}</select>
            </div>

            <!-- Rescues / Losses / GM Award -->
            <div class="form-group" style="margin-bottom:2px;">
              <label style="font-size:10px;color:#666;">Rescues</label>
              <input type="number" name="rescues" value="0" min="0" max="99" style="width:55px;font-size:12px;text-align:center;" />
            </div>
            <div class="form-group" style="margin-bottom:2px;">
              <label style="font-size:10px;color:#666;">Losses</label>
              <input type="number" name="losses" value="0" min="0" max="9999" style="width:55px;font-size:12px;text-align:center;" />
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:10px;color:#666;">GM Award</label>
              <input type="number" name="gmAward" value="0" min="0" max="9999" style="width:55px;font-size:12px;text-align:center;" />
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
              // Default crime flags to false — GM confirms stop/arrest explicitly
              // in the encounter detail UI. Auto-true inflated karma on creation.
              crimes: crimeType ? [{ type: crimeType, stopped: false, arrested: false }] : [],
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
      crimes: [],
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

    const mode = getGroupAwardMode();
    if (mode === "pool") return this._onAwardEncounterToPool(ev);

    const heroes = (enc.presentHeroIds || []).map(id => game.actors.get(id)).filter(Boolean);
    if (!heroes.length) { ui.notifications.warn("No heroes marked as present"); return; }

    const t = this._calcEncounterTotals(enc);
    const {
      splitPositive, splitLoss,
      perHeroPositive, perHeroLoss,
      individualByHero
    } = t;

    // Split pool math
    const splitAward = computeGroupAward({
      eventType: "Encounter Award",
      baseAmount: splitPositive,
      heroCount: heroes.length,
      groupMode: mode
    });
    const perHeroFromSplit = splitAward.perHero;
    const multiplier = splitAward.multiplier;

    // Per-hero scope math (full amount to each present hero, mult applied)
    const penMult = getCategoryMultiplier("penalty");
    const lossMult = penMult > 1 ? penMult : 1;
    const perHeroPosShown = perHeroPositive ? Math.floor(perHeroPositive * multiplier) : 0;
    const perHeroLossShown = perHeroLoss ? Math.ceil(perHeroLoss * lossMult) : 0;
    const splitLossPerHero = splitLoss ? computeLossAmount(splitLoss, heroes.length, mode) : 0;

    const encLabel = enc.name || enc.villains.map(v => v.name).join(', ') || "Encounter";
    const gameDate = enc.gameDate || TeamSheet._getGameDateTimeStatic().gameDate;

    // Build breakdown + confirmation summary
    const breakdown = this._buildBreakdownText(enc, multiplier, heroes.length);
    const perHeroCommon = perHeroFromSplit + perHeroPosShown + splitLossPerHero + perHeroLossShown;
    const indLines = [];
    for (const h of heroes) {
      const items = individualByHero[h.id] || [];
      if (!items.length) continue;
      const sum = items.reduce((s, it) => s + it.amount, 0);
      indLines.push(`${h.name}: ${sum > 0 ? '+' : ''}${sum}`);
    }
    const confirmBody = [
      `<p>${breakdown}</p>`,
      `<p>Base per hero (shared + per-hero scope): <strong>${perHeroCommon}</strong></p>`,
      indLines.length ? `<p>Plus individual: ${indLines.join('; ')}</p>` : '',
      `<p>Apply to <strong>${heroes.length}</strong> hero${heroes.length === 1 ? '' : 'es'}?</p>`
    ].join('');
    if (!await Dialog.confirm({
      title: `Award — ${encLabel}`,
      content: confirmBody
    })) return;

    // Description parts (shared across hero entries)
    const foeNames = enc.villains.filter(v => v.rankValue >= 30).map(v => `${v.name}(${v.rankValue})`).join('+');
    const sharedDescParts = [];
    if (enc.name) sharedDescParts.push(enc.name);
    if (foeNames) sharedDescParts.push(`Foe: ${foeNames}`);
    for (const c of TeamSheet._normalizeCrimes(enc)) {
      if (!c.type) continue;
      if (c.stopped) sharedDescParts.push(`Stop ${this._crimeLabel(c.type)}`);
      if (c.arrested) sharedDescParts.push(`Arrest ${this._crimeLabel(c.type)}`);
    }
    if (enc.rescues > 0) sharedDescParts.push(`Rescue ×${enc.rescues}`);
    if (enc.gmAward > 0) sharedDescParts.push(`GM +${enc.gmAward}`);
    const splitBonuses = (enc.bonuses || []).filter(b => (b.scope || "split") === "split" && b.amount);
    for (const b of splitBonuses) {
      sharedDescParts.push(`${b.label || 'Award'} ${b.amount > 0 ? '+' : ''}${b.amount}`);
    }
    const perHeroBonuses = (enc.bonuses || []).filter(b => b.scope === "per_hero" && b.amount);
    const desc = sharedDescParts.join(', ');
    const baseNote = `(split base ${splitPositive} ×${multiplier} ÷${heroes.length})`;

    for (const hero of heroes) {
      // Shared split award
      if (perHeroFromSplit > 0) {
        await this._addHeroKarmaEvent(hero, {
          amount: perHeroFromSplit, type: "Encounter Award",
          description: `${desc} ${baseNote}`, gameDate, encounterId: enc.id
        });
      }
      // Per-hero scope positive
      if (perHeroPosShown > 0) {
        const phLabels = perHeroBonuses.filter(b => b.amount > 0).map(b => `${b.label || 'Award'} +${b.amount}`).join(', ');
        await this._addHeroKarmaEvent(hero, {
          amount: perHeroPosShown, type: "Encounter Award",
          description: `Per-hero: ${phLabels} (×${multiplier})`,
          gameDate, encounterId: enc.id
        });
      }
      // Split losses
      if (splitLossPerHero < 0) {
        await this._addHeroKarmaEvent(hero, {
          amount: splitLossPerHero, type: "Encounter Loss",
          description: `Shared losses — ${encLabel}`, gameDate, encounterId: enc.id
        });
      }
      // Per-hero scope losses (includes Property Damage when lossScope=per_hero)
      if (perHeroLossShown < 0) {
        const phLossLabels = perHeroBonuses.filter(b => b.amount < 0).map(b => `${b.label || 'Penalty'} ${b.amount}`).join(', ');
        const lossDesc = [
          t.lossScope === "per_hero" && enc.losses ? `Property Damage -${enc.losses}` : '',
          phLossLabels
        ].filter(Boolean).join(', ') || `Per-hero losses — ${encLabel}`;
        await this._addHeroKarmaEvent(hero, {
          amount: perHeroLossShown, type: "Encounter Loss",
          description: lossDesc, gameDate, encounterId: enc.id
        });
      }
      // Individual bonuses for this hero
      const items = individualByHero[hero.id] || [];
      for (const it of items) {
        if (!it.amount) continue;
        const indMult = it.amount > 0 ? multiplier : lossMult;
        const indAmt = it.amount > 0
          ? Math.floor(it.amount * indMult)
          : Math.ceil(it.amount * indMult);
        await this._addHeroKarmaEvent(hero, {
          amount: indAmt,
          type: it.amount > 0 ? "Encounter Award" : "Encounter Loss",
          description: `${it.label || 'Individual'} (×${indMult})`,
          gameDate, encounterId: enc.id
        });
      }
    }

    encounters[idx].awarded = true;
    await game.settings.set("msh-faserip", "defeatedVillains", encounters);
    ui.notifications.info(`${encLabel}: awarded to ${heroes.length} hero${heroes.length === 1 ? '' : 'es'}.`);
    this.render(true);
  }

  async _onAwardEncounterToPool(ev) {
    ev.stopPropagation();
    if (!game.user.isGM) return;
    const idx = Number(ev.currentTarget.dataset.encIdx);
    const encounters = game.settings.get("msh-faserip", "defeatedVillains") || [];
    const enc = encounters[idx];
    if (!enc || enc.awarded) return;

    const t = this._calcEncounterTotals(enc);
    const {
      splitPositive, splitLoss,
      perHeroPositive, perHeroLoss,
      individualByHero
    } = t;
    const presentIds = (enc.presentHeroIds || []).filter(id => game.actors.get(id));
    const heroCount = Math.max(1, presentIds.length);

    // Split pool: full gross to pool (no divide)
    const splitGross = computeGroupAward({
      eventType: "Encounter Award",
      baseAmount: splitPositive,
      heroCount: 1,
      groupMode: "pool"
    }).groupTotal;
    const penMult = getCategoryMultiplier("penalty");
    const lossMult = penMult > 1 ? penMult : 1;
    const splitLossGross = splitLoss ? Math.ceil(splitLoss * lossMult) : 0;
    // Per-hero scope: each present hero's share goes to pool (×heroCount at full)
    const multiplier = splitGross && splitPositive ? splitGross / splitPositive : getCategoryMultiplier("combat");
    const perHeroPosGross = perHeroPositive ? Math.floor(perHeroPositive * multiplier) * heroCount : 0;
    const perHeroLossGross = perHeroLoss ? Math.ceil(perHeroLoss * lossMult) * heroCount : 0;

    const poolDelta = splitGross + splitLossGross + perHeroPosGross + perHeroLossGross;
    const encLabel = enc.name || enc.villains.map(v => v.name).join(', ') || "Encounter";

    // Individual bonuses still go to the named hero even in pool mode
    const indSummary = [];
    for (const [hid, items] of Object.entries(individualByHero)) {
      const h = game.actors.get(hid);
      if (!h) continue;
      const sum = items.reduce((s, it) => s + it.amount, 0);
      indSummary.push(`${h.name}: ${sum > 0 ? '+' : ''}${sum}`);
    }

    if (!await Dialog.confirm({
      title: `Award to Pool — ${encLabel}`,
      content: `<p>Add <strong>${poolDelta}</strong> karma to team pool?</p>${
        indSummary.length ? `<p>Individual awards (to named heroes): ${indSummary.join('; ')}</p>` : ''
      }`
    })) return;

    const pool = game.settings.get("msh-faserip", "teamKarmaPoolTotal") || 0;
    await game.settings.set("msh-faserip", "teamKarmaPoolTotal", Math.max(0, pool + poolDelta));

    // Individual bonuses: apply directly to named heroes
    const gameDate = enc.gameDate || TeamSheet._getGameDateTimeStatic().gameDate;
    for (const [hid, items] of Object.entries(individualByHero)) {
      const h = game.actors.get(hid);
      if (!h) continue;
      for (const it of items) {
        if (!it.amount) continue;
        const indMult = it.amount > 0 ? multiplier : lossMult;
        const indAmt = it.amount > 0
          ? Math.floor(it.amount * indMult)
          : Math.ceil(it.amount * indMult);
        await this._addHeroKarmaEvent(h, {
          amount: indAmt,
          type: it.amount > 0 ? "Encounter Award" : "Encounter Loss",
          description: `${it.label || 'Individual'} (×${indMult})`,
          gameDate, encounterId: enc.id
        });
      }
    }

    encounters[idx].awarded = true;
    await game.settings.set("msh-faserip", "defeatedVillains", encounters);
    ui.notifications.info(`${poolDelta} karma added to pool for ${encLabel}.`);
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
    let stopValue = 0, arrestValue = 0;
    for (const c of TeamSheet._normalizeCrimes(enc)) {
      const cv = c.type ? TeamSheet.CRIME_VALUES[c.type] : null;
      if (!cv) continue;
      if (c.stopped) stopValue += cv.stop;
      if (c.arrested) arrestValue += cv.arrest;
    }
    const rescueKarma = Math.min((enc.rescues || 0) * 20, 100);
    const gmAward = Math.max(0, enc.gmAward || 0);
    const rawLoss = -Math.abs(enc.losses || 0);

    // Bucket bonuses by scope
    const bonuses = Array.isArray(enc.bonuses) ? enc.bonuses : [];
    const buckets = {
      splitPos: 0, splitNeg: 0,
      perHeroPos: 0, perHeroNeg: 0,
      individual: {} // { heroId: [{label, amount}] }
    };
    for (const b of bonuses) {
      const amt = Number(b.amount) || 0;
      if (!amt) continue;
      const scope = b.scope || "split";
      if (scope === "individual" && b.heroId) {
        if (!buckets.individual[b.heroId]) buckets.individual[b.heroId] = [];
        buckets.individual[b.heroId].push({ label: b.label || "", amount: amt });
      } else if (scope === "per_hero") {
        if (amt > 0) buckets.perHeroPos += amt; else buckets.perHeroNeg += amt;
      } else {
        if (amt > 0) buckets.splitPos += amt; else buckets.splitNeg += amt;
      }
    }

    // Per-hero individual totals (pos only used for display sums)
    let individualPos = 0, individualNeg = 0;
    for (const arr of Object.values(buckets.individual)) {
      for (const it of arr) {
        if (it.amount > 0) individualPos += it.amount;
        else individualNeg += it.amount;
      }
    }

    const splitPositive = foeTotal + stopValue + arrestValue + rescueKarma + gmAward + buckets.splitPos;
    const splitLoss = rawLoss + buckets.splitNeg; // RAW losses default to split
    const lossScope = enc.lossScope || "split";
    // If lossScope === "per_hero", move the raw `losses` field into perHero bucket
    const perHeroPositive = buckets.perHeroPos;
    const perHeroLoss = (lossScope === "per_hero" ? rawLoss : 0) + buckets.perHeroNeg;
    const splitLossFinal = lossScope === "per_hero" ? buckets.splitNeg : splitLoss;

    // Back-compat fields used by existing display code
    const bonusPositive = buckets.splitPos + buckets.perHeroPos + individualPos;
    const bonusNegative = buckets.splitNeg + buckets.perHeroNeg + individualNeg;
    const positiveTotal = splitPositive; // only the split pool is "positiveTotal" for group math
    const lossKarma = splitLossFinal;

    return {
      positiveTotal, lossKarma,
      foeTotal, gmAward, bonusPositive, bonusNegative,
      // New scope-aware fields
      splitPositive, splitLoss: splitLossFinal,
      perHeroPositive, perHeroLoss,
      individualByHero: buckets.individual,
      individualPos, individualNeg,
      lossScope
    };
  }

  _buildBreakdownText(enc, multiplier, heroCount) {
    const parts = [];
    const foeTotal = (enc.villains || []).reduce((sum, v) => {
      const count = Math.max(1, v.count || 1);
      return sum + (v.rankValue >= 30 ? v.rankValue * count : 0);
    }, 0);
    if (foeTotal > 0) parts.push(`Foe +${foeTotal}`);
    for (const c of TeamSheet._normalizeCrimes(enc)) {
      const cv = c.type ? TeamSheet.CRIME_VALUES[c.type] : null;
      if (!cv) continue;
      const label = this._crimeLabel(c.type);
      if (c.stopped) parts.push(`Stop ${label} +${cv.stop}`);
      if (c.arrested) parts.push(`Arrest ${label} +${cv.arrest}`);
    }
    if (enc.rescues > 0) parts.push(`Rescue +${Math.min(enc.rescues * 20, 100)}`);
    if (enc.gmAward > 0) parts.push(`GM +${enc.gmAward}`);

    const bonuses = Array.isArray(enc.bonuses) ? enc.bonuses : [];
    for (const b of bonuses) {
      if (!b.amount) continue;
      const scope = b.scope || "split";
      const tag = scope === "individual" ? ' [ind]' : scope === "per_hero" ? ' [ea]' : '';
      const sign = b.amount > 0 ? '+' : '';
      parts.push(`${b.label || (b.amount > 0 ? 'Award' : 'Penalty')} ${sign}${b.amount}${tag}`);
    }
    if (enc.losses > 0) {
      const lossScope = enc.lossScope || "split";
      parts.push(`Loss -${enc.losses}${lossScope === "per_hero" ? ' [ea]' : ''}`);
    }
    return parts.join(', ') + ` (×${multiplier} ÷${heroCount} on split pool)`;
  }

  _crimeLabel(crimeType) {
    return { violent: "Violent Crime", destructive: "Destructive Crime", theft: "Theft",
      robbery: "Robbery", misdemeanor: "Misdemeanor", national: "National Offense",
      localConspiracy: "Local Conspiracy", nationalConspiracy: "National Conspiracy",
      globalConspiracy: "Global Conspiracy", other: "Other Crime"
    }[crimeType] || crimeType;
  }

  // Session Bonus: award each hero their R+I+P as bonus karma (house rule, gated by setting)
  async _onAwardSessionBonus(event) {
    event.preventDefault();
    if (!game.user.isGM) return;
    if (!game.settings.get("msh-faserip", "sessionRIPBonus")) {
      ui.notifications.warn("R+I+P session bonus is disabled. Enable it in system settings.");
      return;
    }

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
    // Abilities live at system.abilities.<key>, not system.abilities.abilities.<key>.
    const abilities = actor.system?.abilities || {};
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
      console.log(`[FASERIP] Combatant: ${actor.name}, tokenDisp=${tokenDisp}, protoDisp=${protoDisp}, resolved=${disp}, type=${actor.type}, defeated=${c.defeated}`);

      if (teamMemberIds.includes(actor.id) || disp > 0) {
        heroCombatantIds.push(actor.id);
        continue;
      }

      const isHostile = disp < 0 || actor.type === "villain";
      if (!isHostile) {
        console.log(`[FASERIP] Skipping neutral: ${actor.name} (type=${actor.type}, disp=${disp})`);
        continue;
      }

      // Only capture hostiles that were actually defeated.
      // c.defeated is the Foundry "skull" flag. Fall back to HP<=0 for systems
      // that don't set it reliably.
      const hp = Number(actor.system?.attributes?.health?.value);
      const wasDefeated = c.defeated === true || (Number.isFinite(hp) && hp <= 0);
      if (!wasDefeated) {
        console.log(`[FASERIP] Skipping undefeated hostile: ${actor.name} (hp=${hp}, defeated=${c.defeated})`);
        continue;
      }

      villainActors.push(actor);
      console.log(`[FASERIP] Capturing defeated villain: ${actor.name} (type=${actor.type}, disp=${disp})`);
    }

    if (!villainActors.length) { console.log("[FASERIP] No defeated hostiles found"); return; }
    console.log(`[FASERIP] Found ${villainActors.length} defeated villains, ${heroCombatantIds.length} heroes`);

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
      crimes: [],
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