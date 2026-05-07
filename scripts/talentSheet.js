// talentSheet.js v3.0.1 - 2026-05-06
// v3.0.1: Regression fix — talent template had a top-level <form> wrapper that nested
//         inside ItemSheetV2's auto-supplied <form>. Browsers break nested forms apart,
//         leaving the inputs outside the form V2 listens to, so submitOnChange never
//         fired and edits never persisted. Template now uses <div> at root; V2 supplies
//         the form. Fix lives in templates/talent-sheet.html, no JS change needed here.
// v3.0.0: Migrate to ApplicationV2 / ItemSheetV2 (v16 prep; v14 backward-compat shims gone in v16)
// v2.0.0: Add appliesTo (action types) and flags (special mechanics) fields.
//         Auto-fill from specialty, save via checkbox change handlers.

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const TALENT_SPECIALTIES = {
  "Weapon Skill": ["Guns", "Thrown Weapons", "Bows", "Blunt Weapons", "Sharp Weapons",
                  "Oriental Weapons", "Marksman", "Weapons Master", "Weapons Specialist"],
  "Fighting Skill": ["Martial Arts A", "Martial Arts B", "Martial Arts C", "Martial Arts D",
                    "Martial Arts E", "Wrestling", "Thrown Objects", "Acrobatics", "Tumbling"],
  "Professional Skill": ["Medicine", "Law", "Law Enforcement", "Pilot", "Military",
                        "Business/Finance", "Journalism", "Engineering", "Criminology",
                        "Psychiatry", "Detective/Espionage"],
  "Scientific Skill": ["Chemistry", "Biology", "Geology", "Genetics", "Archaeology",
                      "Physics", "Computers", "Electronics"],
  "Mystic/Mental Skill": ["Trance", "Mesmerism and Hypnosis", "Sleight of Hand",
                        "Resist Domination", "Occult Lore", "Mystic Background"],
  "Other": ["Artist", "Languages", "First Aid", "Repair/Tinkering", "Trivia",
            "Performer", "Animal Training", "Heir to Fortune", "Student", "Leadership"]
};

export const TALENT_RULES = {
  "Guns":               { bonus: "+1CS", ability: "agility",  summary: "Fire handguns, rifles, submachine guns at +1CS", desc: "Includes laser, stun, and concussion varieties.", isWeapon: true, appliesTo: ["shooting"], flags: [] },
  "Thrown Weapons":     { bonus: "+1CS", ability: "agility",  summary: "Toss designed throwing weapons at +1CS", desc: "Spears, daggers, shuriken, disks, and snowballs.", isWeapon: true, appliesTo: ["throwing-blunt", "throwing-edged"], flags: [] },
  "Bows":               { bonus: "+1CS", ability: "agility",  summary: "+1CS with bows/crossbows; fire+reload same round", desc: "Those without this Talent fire bows at -1CS. May fire multiple arrows on Agility FEAT.", isWeapon: true, appliesTo: ["shooting"], flags: [] },
  "Blunt Weapons":      { bonus: "+1CS", ability: "fighting", summary: "+1CS on Blunt Attacks column", desc: "Weapons that resolve on the Blunt Attacks column of the Battle Effects Table.", isWeapon: true, appliesTo: ["blunt-attack"], flags: [] },
  "Sharp Weapons":      { bonus: "+1CS", ability: "fighting", summary: "+1CS on Edged Attack column", desc: "Swords, daggers (unless thrown), spears. Excludes claws and natural extensions.", isWeapon: true, appliesTo: ["edged-attack", "throwing-edged"], flags: [] },
  "Oriental Weapons":   { bonus: "+1CS", ability: "",         summary: "+1CS Fighting or Agility with oriental weapons", desc: "Shuriken, crossbows, sais (treat as swords), katana, kris.", isWeapon: true, appliesTo: ["shooting", "blunt-attack", "edged-attack"], flags: [] },
  "Marksman":           { bonus: "+1CS", ability: "agility",  summary: "+1CS line-of-sight distance weapons; no range penalties", desc: "Benefits with any weapon requiring line of sight. Not teleguided missiles.", isWeapon: true, appliesTo: ["shooting", "energy", "force"], flags: ["no-range-penalty"] },
  "Weapons Master":     { bonus: "+1CS", ability: "fighting", summary: "+1CS with any weapon requiring Fighting FEAT", desc: "Any melee weapon that resolves on Fighting.", isWeapon: true, appliesTo: ["blunt-attack", "edged-attack"], flags: [] },
  "Weapons Specialist": { bonus: "+2CS", ability: "",         summary: "+2CS with one chosen weapon; +1 initiative with it", desc: "Any type of weapon, missile or melee. Also increases initiative by 1 when using this weapon.", isWeapon: true, appliesTo: ["shooting", "blunt-attack", "edged-attack", "throwing-blunt", "throwing-edged"], flags: ["initiative"] },
  "Martial Arts A":     { bonus: "Special", ability: "",      summary: "Stun/Slam ignores comparative Str/End", desc: "Judo and karate style. Uses opponent's strength against him.", isCumulative: true, appliesTo: ["blunt-attack"], flags: ["ignore-str-end"] },
  "Martial Arts B":     { bonus: "+1CS", ability: "fighting", summary: "+1CS Fighting in unarmed combat", desc: "Offense-focused, short quick bursts. Includes boxing.", isCumulative: true, appliesTo: ["blunt-attack", "edged-attack", "grappling"], flags: [] },
  "Martial Arts C":     { bonus: "+1CS", ability: "",         summary: "+1CS Str grapple/escape, +1CS Agi dodge", desc: "Concentrates on holds and escapes. +1CS Strength for Grappling attacks (including damage), +1CS Strength for Escaping, +1CS Agility for Dodging.", isCumulative: true, appliesTo: ["grappling", "escaping", "dodging"], flags: [] },
  "Martial Arts D":     { bonus: "Special", ability: "",      summary: "Ignore body armor for Stun/Slam; 2-round study required", desc: "Meditative form. Does not need to inflict damage for Stun/Slam check. Must study target for 2 rounds. Does not bypass force fields.", isCumulative: true, appliesTo: ["blunt-attack", "edged-attack"], flags: ["ignore-armor-fx", "no-damage-needed", "study-required"] },
  "Martial Arts E":     { bonus: "Special", ability: "",      summary: "+1 initiative in unarmed combat", desc: "Quick striking to catch opponent off-guard.", isCumulative: true, appliesTo: ["blunt-attack", "edged-attack", "shooting", "energy", "force", "throwing-blunt", "throwing-edged", "grappling", "charging"], flags: ["initiative"] },
  "Wrestling":          { bonus: "+2CS", ability: "strength", summary: "+2CS Grappling attacks (no damage bonus)", desc: "Includes familiar wrestling and sumo forms. With MA-B: +3CS to hit in Grappling, +1CS damage.", isCumulative: true, appliesTo: ["grappling"], flags: [] },
  "Thrown Objects":     { bonus: "+1CS", ability: "agility",  summary: "+1CS throwing (Edged and Blunt) and +1CS catching", desc: "Applies to both thrown weapons and normal items. With Thrown Weapons Talent: +2CS when using thrown weapons.", isCumulative: true, appliesTo: ["throwing-blunt", "throwing-edged"], flags: [] },
  "Acrobatics":         { bonus: "+1CS", ability: "agility",  summary: "+1CS dodging, evading, and escaping", desc: "Very limber, gains advantages when under attack.", isCumulative: true, appliesTo: ["dodging", "escaping"], flags: [] },
  "Tumbling":           { bonus: "Special", ability: "agility", summary: "Agility FEAT to land feet-first after non-damaging fall", desc: "Knows how to fall and land without undue injury.", isCumulative: true, appliesTo: [], flags: ["tumbling-land"] },
  "Medicine":           { bonus: "+1CS", ability: "reason",   summary: "Revive Shift 0 (20 turns); +1 End rank/week; +1CS medical Reason FEATs", desc: "Can bring back characters at Shift 0 up to 20 turns. Restores one Endurance rank per week in addition to natural healing. +1CS on medications, poisons, surgery.", appliesTo: [], flags: [] },
  "Law":                { bonus: "+1CS", ability: "reason",   summary: "+1CS legal FEATs; can pass bar (Good Reason FEAT)", desc: "Extensive background in law (US Law assumed). Characters without Law gain no Reason FEAT bonus and must roll more often.", appliesTo: [], flags: [] },
  "Law Enforcement":    { bonus: "Special", ability: "",      summary: "Includes Gun + Law Talents; may carry gun and make arrests", desc: "Background with law-enforcement authorities. If still a member, may legally carry a gun.", isWeapon: true, appliesTo: ["shooting"], flags: [] },
  "Pilot":              { bonus: "+1CS", ability: "",         summary: "+1CS aircraft Control/Agility/Reason FEATs", desc: "Working knowledge of most aircraft. May extend to spacecraft with appropriate background.", appliesTo: [], flags: [] },
  "Military":           { bonus: "+1CS", ability: "",         summary: "+1CS military matters; grants Military Contact", desc: "Dealings with armed services. +1CS all FEATs in military matters.", appliesTo: ["shooting"], flags: [] },
  "Business/Finance":   { bonus: "+1CS", ability: "reason",   summary: "Min Good Resources; +1CS money FEATs; +1 Professional Contact", desc: "Familiar with corporate finance. Initial Resources minimum Good.", appliesTo: [], flags: [] },
  "Journalism":         { bonus: "Special", ability: "",      summary: "+2 Contacts in media", desc: "Contacts connected with media: newspapers, radio, TV, or sources in law enforcement, political circles, criminal underworld.", appliesTo: [], flags: [] },
  "Engineering":        { bonus: "+1CS", ability: "reason",   summary: "+1CS building/construction FEATs", desc: "Civil, chemical, mechanical engineering. Includes Resource FEAT for determining if an object can be built.", appliesTo: [], flags: [] },
  "Criminology":        { bonus: "+1CS", ability: "",         summary: "+1CS Reason and Intuition FEATs involving criminal behavior", desc: "Understanding of the criminal mind. Also grants a Contact in police or crime.", appliesTo: [], flags: [] },
  "Psychiatry":         { bonus: "+1CS", ability: "",         summary: "+1CS mind FEATs; +1CS Mental Control/Domination/Hypnosis/Emotion Control/Mental Probe", desc: "Background in studies of the mind. Popular with heroes and villains with Mental Powers.", appliesTo: [], flags: [] },
  "Detective/Espionage":{ bonus: "+1CS", ability: "",         summary: "+1CS discovering crime clues; Contact in crime/law/espionage", desc: "Trained to notice small clues in solving crimes.", appliesTo: [], flags: [] },
  "Chemistry":          { bonus: "+1CS", ability: "reason",   summary: "Formulas, inorganic poisons, chemical identification", desc: "+1CS on matters of chemistry including developing new formulas and identifying chemicals by smell, touch, or taste.", appliesTo: [], flags: [] },
  "Biology":            { bonus: "+1CS", ability: "reason",   summary: "Animal/plant ID, organic poisons, disease research", desc: "+1CS on matters of biology including finding cures for organic poisons.", appliesTo: [], flags: [] },
  "Geology":            { bonus: "+1CS", ability: "reason",   summary: "Volcanic activity, rock types, mineral identification", desc: "+1CS on matters involving the Earth.", appliesTo: [], flags: [] },
  "Genetics":           { bonus: "+1CS", ability: "reason",   summary: "New life forms, mutant research, disease research", desc: "+1CS on matters involving genes including understanding mutants.", appliesTo: [], flags: [] },
  "Archaeology":        { bonus: "+1CS", ability: "reason",   summary: "Paleontology, historical records, ancient myths", desc: "+1CS on matters involving the past.", appliesTo: [], flags: [] },
  "Physics":            { bonus: "+1CS", ability: "reason",   summary: "Motion, flight, astrophysics", desc: "+1CS on matters involving physics and astrophysics.", appliesTo: [], flags: [] },
  "Computers":          { bonus: "+1CS", ability: "reason",   summary: "Computer equipment and artificial intelligences", desc: "+1CS on matters involving computers and computer-controlled equipment.", appliesTo: [], flags: [] },
  "Electronics":        { bonus: "+1CS", ability: "reason",   summary: "Electronic device creation and repair", desc: "+1CS on matters involving electronic devices.", appliesTo: [], flags: [] },
  "Trance":             { bonus: "Special", ability: "",      summary: "Appear dead (Intuition FEAT to detect); regain 1 End rank/day", desc: "Slows body functions to minimal level. Reduces food and water needs.", appliesTo: [], flags: [] },
  "Mesmerism and Hypnosis": { bonus: "Special", ability: "reason", summary: "Mind Control at Reason rank#; post-hypnotic suggestion", desc: "Primitive Mind Control. Information gained as per Mental Probe. Forced actions break hypnotism. Fades in 1-10 hours.", appliesTo: [], flags: [] },
  "Sleight of Hand":    { bonus: "+1CS", ability: "agility",  summary: "Palm small items at Agility +1CS", desc: "Stage magician talent. Items appear and disappear by misdirection and swift gestures.", appliesTo: [], flags: [] },
  "Resist Domination":  { bonus: "+1CS", ability: "psyche",   summary: "Resist mental attacks at Psyche +1CS", desc: "Psi-Screen developed without the Power. Passive only. Mental Probe may discern where talent was gained.", appliesTo: [], flags: [] },
  "Occult Lore":        { bonus: "+1CS", ability: "reason",   summary: "+1CS Reason FEATs involving magical items/societies/runes", desc: "Knowledge of magical societies, antiquities, runes, and forgotten lore.", appliesTo: [], flags: [] },
  "Mystic Background":  { bonus: "Special", ability: "",      summary: "May have Magical Powers; initial powers can be spells", desc: "Background with magical forces. Powers may derive from Personal, Universal, or Dimensional energies. Requires Judge approval.", appliesTo: [], flags: [] },
  "Artist":             { bonus: "Special", ability: "",      summary: "1-10 weeks per work; earn 10\u00d7weeks Karma", desc: "Painting, sculpting, writing. Must allocate some time daily.", appliesTo: [], flags: [] },
  "Languages":          { bonus: "Special", ability: "",      summary: "+1 language at start; learn more at half cost (500 pts)", desc: "Natural understanding of languages. Required before learning other languages. May fill in language later.", appliesTo: [], flags: [] },
  "First Aid":          { bonus: "Special", ability: "",      summary: "Halt End loss; recover 1 rank immediately (once); stabilize Shift 0 (5 rounds)", desc: "Immediate halt to Endurance rank loss plus one rank recovery. Can stabilize dying character at Shift 0 up to 5 rounds.", appliesTo: [], flags: [] },
  "Repair/Tinkering":   { bonus: "+1CS", ability: "reason",   summary: "+1CS repair/modify existing items (stacks with other talents)", desc: "Not for building new items. +1CS may be added to bonuses from other Talents (e.g. Engineer with Tinkering = +2CS on repair).", appliesTo: [], flags: [] },
  "Trivia":             { bonus: "+1CS", ability: "reason",   summary: "+1CS Reason FEATs on one specific subject", desc: "Specific subject (old movies, military history, sports, rock music). Should be specific, not general.", appliesTo: [], flags: [] },
  "Performer":          { bonus: "Special", ability: "",      summary: "10 Karma per week of performance", desc: "Acts, sings, dances, mimes. Identified directly with creation (unlike Artist).", appliesTo: [], flags: [] },
  "Animal Training":    { bonus: "Special", ability: "reason", summary: "Teach animal tricks (Reason FEAT); +1CS if has Animal Powers", desc: "Does not grant Animal Empathy or Communications. If hero has those Powers, they are raised +1CS.", appliesTo: [], flags: [] },
  "Heir to Fortune":    { bonus: "Special", ability: "",      summary: "Min Remarkable Resources (chargen only)", desc: "Not a true Talent. May not be gained after character generation. Only for Excellent Resources or less characters.", appliesTo: [], flags: [] },
  "Student":            { bonus: "Special", ability: "",      summary: "No initial talents; learn at discount (chargen only)", desc: "No other initial Talents. New Talents cost 1000 Karma from PC, 800 from outside. May maintain Advancement Totals alongside other funds.", appliesTo: [], flags: [] },
  "Leadership":         { bonus: "Special", ability: "",      summary: "+50 to Karma Pool if recognized team leader", desc: "Benefit to team cohesion. Only one recognized leader per pool. 50 points deducted when leader leaves (not returned to leader).", appliesTo: [], flags: [] }
};

export class FaseripTalentSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["faserip", "sheet", "item", "talent"],
    position: { width: 420, height: 640 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false }
  };

  static PARTS = {
    main: { template: "systems/msh-faserip/templates/talent-sheet.html" }
  };

  /** Use item name alone as window title (drops V2's "TYPES.Item.talent:" prefix) */
  get title() { return this.item?.name ?? super.title; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.item = this.item;
    context.system = this.item.system;
    context.cssClass = "faserip-dialog talent-dialog";
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (!this.isEditable) return;
    const html = $(this.element);

    const categorySelect = html.find('.talent-category-select');
    const specialtySelect = html.find('.talent-specialty-select');
    const bonusSelect = html.find('.talent-bonus-select');
    const abilitySelect = html.find('.talent-ability-select');
    const ruleSummaryEl = html.find('.talent-rule-summary');

    const updateSpecialtyDropdown = () => {
      const category = categorySelect.val();
      specialtySelect.empty();
      specialtySelect.append($('<option></option>').val('').text('-- Select --'));
      if (category && TALENT_SPECIALTIES[category]) {
        TALENT_SPECIALTIES[category].forEach(s => {
          const opt = $('<option></option>').val(s).text(s);
          if (s === this.item.system.specialty) opt.attr('selected', 'selected');
          specialtySelect.append(opt);
        });
      }
    };

    const updateRuleSummary = () => {
      const specialty = specialtySelect.val();
      const rule = specialty ? TALENT_RULES[specialty] : null;
      if (!rule) {
        ruleSummaryEl.html('<div class="talent-rule-empty">Select a specialty to see rule summary</div>');
        return;
      }
      const badges = [];
      if (rule.bonus && rule.bonus !== "Special") {
        badges.push(`<span class="talent-badge">${rule.bonus}</span>`);
      }
      if (rule.ability) {
        const cap = rule.ability.charAt(0).toUpperCase() + rule.ability.slice(1);
        badges.push(`<span class="talent-badge">${cap}</span>`);
      }
      const badgeStr = badges.length ? badges.join(' ') + ' ' : '';
      ruleSummaryEl.html(
        `<div class="talent-rule-line">${badgeStr}${rule.summary}</div>` +
        `<div class="talent-rule-desc">${rule.desc}</div>`
      );
    };

    const autoFillFromSpecialty = () => {
      const specialty = specialtySelect.val();
      const rule = specialty ? TALENT_RULES[specialty] : null;
      if (!rule) return;
      if (rule.bonus === "Special") {
        bonusSelect.val("Special");
      } else {
        bonusSelect.val(rule.bonus);
      }
      if (rule.ability) {
        abilitySelect.val(rule.ability);
      } else {
        abilitySelect.val("");
      }
      if (rule.isWeapon !== undefined) {
        html.find('input[name="system.isWeaponTalent"]').prop('checked', !!rule.isWeapon);
      }
      if (rule.isCumulative !== undefined) {
        html.find('input[name="system.isCumulative"]').prop('checked', !!rule.isCumulative);
      }
      // Auto-fill appliesTo checkboxes
      html.find('.talent-applies-check').prop('checked', false);
      if (rule.appliesTo) {
        for (const at of rule.appliesTo) {
          html.find(`.talent-applies-check[value="${at}"]`).prop('checked', true);
        }
      }
      // Auto-fill flags checkboxes
      html.find('.talent-flag-check').prop('checked', false);
      if (rule.flags) {
        for (const f of rule.flags) {
          html.find(`.talent-flag-check[value="${f}"]`).prop('checked', true);
        }
      }
      updateRuleSummary();
    };

    categorySelect.change(() => {
      updateSpecialtyDropdown();
      updateRuleSummary();
    });

    specialtySelect.change(() => {
      autoFillFromSpecialty();
    });

    // appliesTo/flags checkboxes — collect and save on change
    const saveCheckboxArray = (selector, fieldName) => {
      html.find(selector).on('change', () => {
        const vals = [];
        html.find(`${selector}:checked`).each(function() { vals.push(this.value); });
        this.item.update({ [fieldName]: vals });
      });
    };
    saveCheckboxArray('.talent-applies-check', 'system.appliesTo');
    saveCheckboxArray('.talent-flag-check', 'system.flags');

    updateSpecialtyDropdown();
    updateRuleSummary();

    // Activate Foundry tooltips for data-tooltip elements in this sheet
    html.find('[data-tooltip]').each((i, el) => {
      el.addEventListener('pointerenter', () => game.tooltip.activate(el));
      el.addEventListener('pointerleave', () => game.tooltip.deactivate());
    });
  }
}
