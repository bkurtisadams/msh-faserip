// talentSheet.js v1.0.0 - 2026-03-03
// Standalone talent item sheet extending ItemSheet directly (like headquartersSheet.js)

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

const TALENT_RULES = {
  "Guns":               { bonus: "+1CS", ability: "agility",  summary: "Fire handguns, rifles, submachine guns at +1CS", desc: "Includes laser, stun, and concussion varieties.", isWeapon: true },
  "Thrown Weapons":     { bonus: "+1CS", ability: "agility",  summary: "Toss designed throwing weapons at +1CS", desc: "Spears, daggers, shuriken, disks, and snowballs.", isWeapon: true },
  "Bows":               { bonus: "+1CS", ability: "agility",  summary: "+1CS with bows/crossbows; fire+reload same round", desc: "Those without this Talent fire bows at -1CS. May fire multiple arrows on Agility FEAT.", isWeapon: true },
  "Blunt Weapons":      { bonus: "+1CS", ability: "fighting", summary: "+1CS on Blunt Attacks column", desc: "Weapons that resolve on the Blunt Attacks column of the Battle Effects Table.", isWeapon: true },
  "Sharp Weapons":      { bonus: "+1CS", ability: "fighting", summary: "+1CS on Edged Attack column", desc: "Swords, daggers (unless thrown), spears. Excludes claws and natural extensions.", isWeapon: true },
  "Oriental Weapons":   { bonus: "+1CS", ability: "",         summary: "+1CS Fighting or Agility with oriental weapons", desc: "Shuriken, crossbows, sais (treat as swords), katana, kris.", isWeapon: true },
  "Marksman":           { bonus: "+1CS", ability: "agility",  summary: "+1CS line-of-sight distance weapons; no range penalties", desc: "Benefits with any weapon requiring line of sight. Not teleguided missiles.", isWeapon: true },
  "Weapons Master":     { bonus: "+1CS", ability: "fighting", summary: "+1CS with any weapon requiring Fighting FEAT", desc: "Any melee weapon that resolves on Fighting.", isWeapon: true },
  "Weapons Specialist": { bonus: "+2CS", ability: "",         summary: "+2CS with one chosen weapon; +1 initiative with it", desc: "Any type of weapon, missile or melee. Also increases initiative by 1 when using this weapon.", isWeapon: true },
  "Martial Arts A":     { bonus: "Special", ability: "",      summary: "Stun/Slam ignores comparative Str/End", desc: "Judo and karate style. Uses opponent's strength against him.", isCumulative: true },
  "Martial Arts B":     { bonus: "+1CS", ability: "fighting", summary: "+1CS Fighting in unarmed combat", desc: "Offense-focused, short quick bursts. Includes boxing.", isCumulative: true },
  "Martial Arts C":     { bonus: "+1CS", ability: "",         summary: "+1CS Str grapple/escape, +1CS Agi dodge", desc: "Concentrates on holds and escapes. +1CS Strength for Grappling attacks (including damage), +1CS Strength for Escaping, +1CS Agility for Dodging.", isCumulative: true },
  "Martial Arts D":     { bonus: "Special", ability: "",      summary: "Ignore body armor for Stun/Slam; 2-round study required", desc: "Meditative form. Does not need to inflict damage for Stun/Slam check. Must study target for 2 rounds. Does not bypass force fields.", isCumulative: true },
  "Martial Arts E":     { bonus: "Special", ability: "",      summary: "+1 initiative in unarmed combat", desc: "Quick striking to catch opponent off-guard.", isCumulative: true },
  "Wrestling":          { bonus: "+2CS", ability: "strength", summary: "+2CS Grappling attacks (no damage bonus)", desc: "Includes familiar wrestling and sumo forms. With MA-B: +3CS to hit in Grappling, +1CS damage.", isCumulative: true },
  "Thrown Objects":     { bonus: "+1CS", ability: "agility",  summary: "+1CS throwing (Edged and Blunt) and +1CS catching", desc: "Applies to both thrown weapons and normal items. With Thrown Weapons Talent: +2CS when using thrown weapons.", isCumulative: true },
  "Acrobatics":         { bonus: "+1CS", ability: "agility",  summary: "+1CS dodging, evading, and escaping", desc: "Very limber, gains advantages when under attack.", isCumulative: true },
  "Tumbling":           { bonus: "Special", ability: "agility", summary: "Agility FEAT to land feet-first after non-damaging fall", desc: "Knows how to fall and land without undue injury.", isCumulative: true },
  "Medicine":           { bonus: "+1CS", ability: "reason",   summary: "Revive Shift 0 (20 turns); +1 End rank/week; +1CS medical Reason FEATs", desc: "Can bring back characters at Shift 0 up to 20 turns. Restores one Endurance rank per week in addition to natural healing. +1CS on medications, poisons, surgery." },
  "Law":                { bonus: "+1CS", ability: "reason",   summary: "+1CS legal FEATs; can pass bar (Good Reason FEAT)", desc: "Extensive background in law (US Law assumed). Characters without Law gain no Reason FEAT bonus and must roll more often." },
  "Law Enforcement":    { bonus: "Special", ability: "",      summary: "Includes Gun + Law Talents; may carry gun and make arrests", desc: "Background with law-enforcement authorities. If still a member, may legally carry a gun." },
  "Pilot":              { bonus: "+1CS", ability: "",         summary: "+1CS aircraft Control/Agility/Reason FEATs", desc: "Working knowledge of most aircraft. May extend to spacecraft with appropriate background." },
  "Military":           { bonus: "+1CS", ability: "",         summary: "+1CS military matters; grants Military Contact", desc: "Dealings with armed services. +1CS all FEATs in military matters." },
  "Business/Finance":   { bonus: "+1CS", ability: "reason",   summary: "Min Good Resources; +1CS money FEATs; +1 Professional Contact", desc: "Familiar with corporate finance. Initial Resources minimum Good." },
  "Journalism":         { bonus: "Special", ability: "",      summary: "+2 Contacts in media", desc: "Contacts connected with media: newspapers, radio, TV, or sources in law enforcement, political circles, criminal underworld." },
  "Engineering":        { bonus: "+1CS", ability: "reason",   summary: "+1CS building/construction FEATs", desc: "Civil, chemical, mechanical engineering. Includes Resource FEAT for determining if an object can be built." },
  "Criminology":        { bonus: "+1CS", ability: "",         summary: "+1CS Reason and Intuition FEATs involving criminal behavior", desc: "Understanding of the criminal mind. Also grants a Contact in police or crime." },
  "Psychiatry":         { bonus: "+1CS", ability: "",         summary: "+1CS mind FEATs; +1CS Mental Control/Domination/Hypnosis/Emotion Control/Mental Probe", desc: "Background in studies of the mind. Popular with heroes and villains with Mental Powers." },
  "Detective/Espionage":{ bonus: "+1CS", ability: "",         summary: "+1CS discovering crime clues; Contact in crime/law/espionage", desc: "Trained to notice small clues in solving crimes." },
  "Chemistry":          { bonus: "+1CS", ability: "reason",   summary: "Formulas, inorganic poisons, chemical identification", desc: "+1CS on matters of chemistry including developing new formulas and identifying chemicals by smell, touch, or taste." },
  "Biology":            { bonus: "+1CS", ability: "reason",   summary: "Animal/plant ID, organic poisons, disease research", desc: "+1CS on matters of biology including finding cures for organic poisons." },
  "Geology":            { bonus: "+1CS", ability: "reason",   summary: "Volcanic activity, rock types, mineral identification", desc: "+1CS on matters involving the Earth." },
  "Genetics":           { bonus: "+1CS", ability: "reason",   summary: "New life forms, mutant research, disease research", desc: "+1CS on matters involving genes including understanding mutants." },
  "Archaeology":        { bonus: "+1CS", ability: "reason",   summary: "Paleontology, historical records, ancient myths", desc: "+1CS on matters involving the past." },
  "Physics":            { bonus: "+1CS", ability: "reason",   summary: "Motion, flight, astrophysics", desc: "+1CS on matters involving physics and astrophysics." },
  "Computers":          { bonus: "+1CS", ability: "reason",   summary: "Computer equipment and artificial intelligences", desc: "+1CS on matters involving computers and computer-controlled equipment." },
  "Electronics":        { bonus: "+1CS", ability: "reason",   summary: "Electronic device creation and repair", desc: "+1CS on matters involving electronic devices." },
  "Trance":             { bonus: "Special", ability: "",      summary: "Appear dead (Intuition FEAT to detect); regain 1 End rank/day", desc: "Slows body functions to minimal level. Reduces food and water needs." },
  "Mesmerism and Hypnosis": { bonus: "Special", ability: "reason", summary: "Mind Control at Reason rank#; post-hypnotic suggestion", desc: "Primitive Mind Control. Information gained as per Mental Probe. Forced actions break hypnotism. Fades in 1-10 hours." },
  "Sleight of Hand":    { bonus: "+1CS", ability: "agility",  summary: "Palm small items at Agility +1CS", desc: "Stage magician talent. Items appear and disappear by misdirection and swift gestures." },
  "Resist Domination":  { bonus: "+1CS", ability: "psyche",   summary: "Resist mental attacks at Psyche +1CS", desc: "Psi-Screen developed without the Power. Passive only. Mental Probe may discern where talent was gained." },
  "Occult Lore":        { bonus: "+1CS", ability: "reason",   summary: "+1CS Reason FEATs involving magical items/societies/runes", desc: "Knowledge of magical societies, antiquities, runes, and forgotten lore." },
  "Mystic Background":  { bonus: "Special", ability: "",      summary: "May have Magical Powers; initial powers can be spells", desc: "Background with magical forces. Powers may derive from Personal, Universal, or Dimensional energies. Requires Judge approval." },
  "Artist":             { bonus: "Special", ability: "",      summary: "1-10 weeks per work; earn 10\u00d7weeks Karma", desc: "Painting, sculpting, writing. Must allocate some time daily." },
  "Languages":          { bonus: "Special", ability: "",      summary: "+1 language at start; learn more at half cost (500 pts)", desc: "Natural understanding of languages. Required before learning other languages. May fill in language later." },
  "First Aid":          { bonus: "Special", ability: "",      summary: "Halt End loss; recover 1 rank immediately (once); stabilize Shift 0 (5 rounds)", desc: "Immediate halt to Endurance rank loss plus one rank recovery. Can stabilize dying character at Shift 0 up to 5 rounds." },
  "Repair/Tinkering":   { bonus: "+1CS", ability: "reason",   summary: "+1CS repair/modify existing items (stacks with other talents)", desc: "Not for building new items. +1CS may be added to bonuses from other Talents (e.g. Engineer with Tinkering = +2CS on repair)." },
  "Trivia":             { bonus: "+1CS", ability: "reason",   summary: "+1CS Reason FEATs on one specific subject", desc: "Specific subject (old movies, military history, sports, rock music). Should be specific, not general." },
  "Performer":          { bonus: "Special", ability: "",      summary: "10 Karma per week of performance", desc: "Acts, sings, dances, mimes. Identified directly with creation (unlike Artist)." },
  "Animal Training":    { bonus: "Special", ability: "reason", summary: "Teach animal tricks (Reason FEAT); +1CS if has Animal Powers", desc: "Does not grant Animal Empathy or Communications. If hero has those Powers, they are raised +1CS." },
  "Heir to Fortune":    { bonus: "Special", ability: "",      summary: "Min Remarkable Resources (chargen only)", desc: "Not a true Talent. May not be gained after character generation. Only for Excellent Resources or less characters." },
  "Student":            { bonus: "Special", ability: "",      summary: "No initial talents; learn at discount (chargen only)", desc: "No other initial Talents. New Talents cost 1000 Karma from PC, 800 from outside. May maintain Advancement Totals alongside other funds." },
  "Leadership":         { bonus: "Special", ability: "",      summary: "+50 to Karma Pool if recognized team leader", desc: "Benefit to team cohesion. Only one recognized leader per pool. 50 points deducted when leader leaves (not returned to leader)." }
};

export class FaseripTalentSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip", "sheet", "item", "talent"],
      width: 420,
      height: 480,
      resizable: true,
      submitOnChange: true
    });
  }

  get template() {
    return "systems/msh-faserip/templates/talent-sheet.html";
  }

  getData() {
    const context = super.getData();
    context.item = this.item;
    context.system = this.item.system;
    context.cssClass = "faserip-dialog talent-dialog";
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

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
      updateRuleSummary();
    };

    categorySelect.change(() => {
      updateSpecialtyDropdown();
      updateRuleSummary();
    });

    specialtySelect.change(() => {
      autoFillFromSpecialty();
    });

    updateSpecialtyDropdown();
    updateRuleSummary();

    // Activate Foundry tooltips for data-tooltip elements in this sheet
    html.find('[data-tooltip]').each((i, el) => {
      el.addEventListener('pointerenter', () => game.tooltip.activate(el));
      el.addEventListener('pointerleave', () => game.tooltip.deactivate());
    });
  }
}
