// chargen-data.js - Comprehensive MSH Advanced Set Power/Talent/Contact Data
// All data extracted from the Player's Book rules

export const POWER_DATA = {
  // === RESISTANCES ===
  "Resistance to Fire and Heat": {
    category: "Resistances",
    star: false,
    description: "Reduces fire/heat damage by Power rank number. Fire below Power rank has no effect.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },
  "Resistance to Cold": {
    category: "Resistances",
    star: false,
    description: "Reduces cold damage by Power rank number. Cold below Power rank may be ignored. Physical ice items may still affect hero.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },
  "Resistance to Electricity": {
    category: "Resistances",
    star: false,
    description: "Reduces electrical damage by Power rank number. Must choose conductive or non-conductive.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Choose: Conductive (passes through to touched) or Non-conductive (stops at contact)"
  },
  "Resistance to Radiation": {
    category: "Resistances",
    star: false,
    description: "Reduces radiation damage by Power rank number. Includes X-rays, alpha/beta/gamma rays, most non-concussive energy rays.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },
  "Resistance to Toxins": {
    category: "Resistances",
    star: false,
    description: "Used instead of Endurance for poison FEATs. Does not drop from poison effects.",
    bonusPower: null,
    stunts: [],
    minRank: "Endurance+1",
    maxRank: null,
    limitationRequired: false,
    notes: "Minimum rank is Endurance +1CS. If rolled lower, raise to this minimum."
  },
  "Resistance to Corrosives": {
    category: "Resistances",
    star: false,
    description: "Reduces damage from acids, rust, rot, caustic agents, destructive microbes. Ignore corrosives below Power rank Intensity.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },
  "Resistance to Emotion Attacks": {
    category: "Resistances",
    star: false,
    description: "Used instead of Intuition vs emotion attacks, illusions, emotion control, dominance.",
    bonusPower: null,
    stunts: [],
    minRank: "Intuition+1",
    maxRank: null,
    limitationRequired: false,
    notes: "Minimum rank is Intuition +1CS. If rolled lower, raise to this minimum."
  },
  "Resistance to Mental Attacks": {
    category: "Resistances",
    star: false,
    description: "Used instead of Psyche vs psionic (not magical) attacks.",
    bonusPower: null,
    stunts: [],
    minRank: "Psyche+1",
    maxRank: null,
    limitationRequired: false,
    notes: "Minimum rank is Psyche +1CS. If rolled lower, raise to this minimum."
  },
  "Resistance to Magical Attacks": {
    category: "Resistances",
    star: false,
    description: "Used vs magical and extra-dimensional attacks. Reduces magical damage by Power rank number.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Unlike Mental/Emotion resistance, may be lower than Psyche initially."
  },
  "Resistance to Disease": {
    category: "Resistances",
    star: false,
    description: "Less susceptible to disease. Includes common diseases, biological warfare, vampirism.",
    bonusPower: null,
    stunts: [],
    minRank: "Endurance+1",
    maxRank: null,
    limitationRequired: false,
    notes: "Minimum rank is Endurance +1CS. If rolled lower, raise to this minimum."
  },
  "Invulnerability": {
    category: "Resistances",
    star: true,
    description: "Class 1000 resistance to one attack form. Additional resistances may become invulnerabilities at no extra cost.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Choose attack form: Fire, Cold, Electricity, Radiation, Toxins, Corrosives, Emotion, Mental, Magical, Disease"
  },

  // === SENSES ===
  "Protected Senses": {
    category: "Senses",
    star: false,
    description: "One or more basic senses protected from attack. Ignore damaging attacks below Power rank Intensity.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Examples: polarized goggles vs bright light, ear protection vs sonic attacks"
  },
  "Enhanced Senses": {
    category: "Senses",
    star: false,
    description: "One or more normal senses increased to Power rank. Use instead of Intuition for clues, spotting, initiative (hearing).",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Enhanced senses are more vulnerable to attack: +1CS to attacks against them."
  },
  "Infravision": {
    category: "Senses",
    star: false,
    description: "See in the dark. Normal darkness: 5 area range. High-intensity darkness (Darkforce) may limit to 2 feet if Intensity exceeds Power rank.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },
  "Cosmic Awareness": {
    category: "Senses",
    star: true,
    description: "Perceive powerful entities (Class 1000+ abilities within 10 miles). Power rank FEAT grants +1CS vs opponent by finding weak points.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },
  "Combat Sense": {
    category: "Senses",
    star: true,
    description: "Use Power rank instead of: Intuition for surprise, Fighting for blocking, Agility for dodging, Strength for escaping.",
    bonusPower: null,
    stunts: [],
    minRank: "Intuition",
    maxRank: null,
    limitationRequired: false,
    notes: "Minimum level is character's Intuition rank."
  },
  "Computer Links": {
    category: "Senses",
    star: false,
    description: "Communicate with and retrieve information from computers. Compare Power rank vs Reason to break into new systems. Can reprogram simple robots.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Usually via implant. Does not affect PC robots under normal circumstances."
  },
  "Emotion Detection": {
    category: "Senses",
    star: false,
    description: "Detect emotions in others. Success indicates emotional state only, not cause. Target uses Intuition to conceal.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Detecting non-human emotions (robots, aliens) at higher shift."
  },
  "Energy Detection": {
    category: "Senses",
    star: false,
    description: "Identify specific energy types and track energy trails. Can identify general type and track with Power rank ability per hour.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Faint trails or confusing patterns may require yellow/red FEATs."
  },
  "Magic Detection": {
    category: "Senses",
    star: false,
    description: "Detect magic. White=failure, Green=magic present, Yellow=individuals involved, Red=type of spell/magic.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Masking spells may reduce chances."
  },
  "Magnetic Detection": {
    category: "Senses",
    star: false,
    description: "Detect Earth's magnetic field and aberrations (iron deposits, electromagnetic devices). Difficult to get lost.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },
  "Mutant Detection": {
    category: "Senses",
    star: false,
    description: "Attuned to mental radiation from mutants. Range depends on Power rank. Requires conscious will to detect.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },
  "Psionic Detection": {
    category: "Senses",
    star: false,
    description: "Detect paranormal mental abilities when in use (mindreading, thought-casting, mental control). Not magical origins.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Green FEAT if specifically checking, Yellow if not paying attention."
  },
  "Astral Detection": {
    category: "Senses",
    star: false,
    description: "See astral forms and ectoplasm. Automatic detection; Power rank FEAT to note features for identification.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },
  "Tracking Ability": {
    category: "Senses",
    star: false,
    description: "Track individuals' paths. Power rank FEAT to catch track, then only when chance of losing (depends on tracking method).",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Scent tracker: FEAT through stockyard. Heat tracker: FEAT through stream."
  },

  // === MOVEMENT ===
  "Flight": {
    category: "Movement",
    star: false,
    description: "Move through air under own power. Speed by Power rank. Use Agility for course changes and dodging.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Winds > Power rank cause altitude loss. Gain 1 area per 15ft dropped, lose 1 area speed per 30ft climbed."
  },
  "Gliding": {
    category: "Movement",
    star: false,
    description: "Drop 1 story per turn, distance per turn by Power rank. Cannot climb. Agility FEAT to maintain level (fail = lose 2 stories).",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Winds > glider speed may halt, down, or move backward."
  },
  "Leaping": {
    category: "Movement",
    star: false,
    description: "Leap great distances. Use Power rank instead of Strength for jumping distances.",
    bonusPower: null,
    stunts: [],
    minRank: "Strength+1",
    maxRank: null,
    limitationRequired: false,
    notes: "Minimum is Strength +1CS. If rolled lower, raise to this minimum."
  },
  "Wall-Crawling": {
    category: "Movement",
    star: false,
    description: "Move along vertical and upside-down surfaces. Power rank indicates adhesion strength vs surface slipperiness.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Surface examples: Feeble=concrete/brick, Typical=glass/steel, Remarkable=oil, Class 1000=frictionless"
  },
  "Lightning Speed": {
    category: "Movement",
    star: false,
    description: "Move as vehicle with Power rank speed. Can turn at max speed without penalty. Accelerate/decelerate in one round/area.",
    bonusPower: null,
    stunts: [],
    minRank: "Endurance+1",
    maxRank: null,
    limitationRequired: false,
    notes: "Minimum is Endurance +1CS. May apply to Flight, Gliding, Wall-crawling, or Digging if possessed."
  },
  "Teleportation": {
    category: "Movement",
    star: true,
    description: "Move instantaneously point to point. Power rank FEAT or be disoriented (no action next round). Carried targets: Endurance FEAT or disoriented 1-10 rounds.",
    bonusPower: null,
    stunts: [
      "Multiple attacks: teleport rapidly, attack multiple targets while considered Dodging, twice normal attacks"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Teleport into solid: Endurance FEAT or damage = 2x material strength. Success = random port, unconscious 1-10 rounds."
  },
  "Levitation": {
    category: "Movement",
    star: false,
    description: "Move vertically unaided. Immune to wind/air control unless hero chooses. Horizontal by pushing off or levitating while moving.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Vertical movement: Power rank as speed (Incredible = 20 areas/round vertically)."
  },
  "Swimming": {
    category: "Movement",
    star: false,
    description: "Move through water at high speeds (Lightning Speed in water). Does not negate need to breathe.",
    bonusPower: "Water Breathing",
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Bonus Power: May choose Water Breathing without roll."
  },
  "Climbing": {
    category: "Movement",
    star: false,
    description: "Scale vertical surfaces (not upside-down) as Wall-Crawling with Lightning Speed. Move through tangled areas using Power rank instead of Agility.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Requires sufficient handholds (mortared bricks work)."
  },
  "Digging": {
    category: "Movement",
    star: false,
    description: "Move below ground. Normal speed, half if digging supported tunnel. Cannot dig through materials >= Power rank material strength.",
    bonusPower: "Claws",
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Bonus Power: May choose Claws."
  },
  "Dimensional Travel": {
    category: "Movement",
    star: true,
    description: "Break into other dimensions. Automatic normally, Power rank FEAT under pressure. Specific dimensions developed as stunts.",
    bonusPower: null,
    stunts: [
      "Reach specific dimension (each dimension is separate stunt)",
      "Reach specific location in dimension (Red FEAT)",
      "Return to familiar native location (Yellow FEAT)"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Start with one known dimension/alternate universe."
  },

  // === MATTER CONTROL ===
  "Earth Control": {
    category: "Matter Control",
    star: false,
    description: "Manipulate natural/semi-natural minerals (dirt, rock, concrete, asphalt, glass). Not steel alloys, mechanisms, living/once-living things.",
    bonusPower: null,
    stunts: [
      "Digging (moving earth)",
      "Earthquake attack (all targets in area, Power rank damage)",
      "Create earth beings (FASE sum <= Power rank number, Body Armor = material strength)",
      "Transportation (earth wave, Power rank speed)",
      "Levitation (pillar beneath hero)",
      "Entrapment (open earth/wrap stone)"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Manipulate up to Power rank as Strength each round. Use as weapon (material strength damage) or shield."
  },
  "Air Control": {
    category: "Matter Control",
    star: false,
    description: "Manipulate air, winds, weather. Create wind shields vs physical missiles <= Power rank. Air as weapon (Power rank damage, repelled by Force Fields).",
    bonusPower: null,
    stunts: [
      "Flight at Power rank speed",
      "Tornadoes (Power rank Intensity/damage, Power rank FEAT to control)",
      "Summon Storm",
      "Summon Fog",
      "Lightning (Power rank range/damage)",
      "Reduce existing weather (Power rank ability)"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Starts with one stunt."
  },
  "Fire Control": {
    category: "Matter Control",
    star: false,
    description: "Control existing fire sources. Intensify/reduce fire by Power rank. Form fiery shield (Power rank damage to crossers). Cannot initially affect targets at distance.",
    bonusPower: null,
    stunts: [
      "Use existing flame as missile weapon",
      "Create flame shapes (Power rank Health/damage)",
      "Write with flame in sky",
      "Create entrapment devices (Power rank damage)",
      "Control heat to Power rank degree",
      "Absorb heat/flame as Fire Resistance"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Requires existing fire source initially."
  },
  "Water Control": {
    category: "Matter Control",
    star: false,
    description: "Use liquid water for effects. Water as missile (Power rank damage, 1 area range). Water shield (no effect on physical, reduces energy/force/fire by rank number).",
    bonusPower: null,
    stunts: [
      "Create watery servants (Power rank Health/Abilities)",
      "Speed ships/water vehicles (Power rank speed)",
      "Create air bubbles underwater",
      "Create fog (Power rank Intensity)",
      "Create storms (Power rank Intensity)",
      "Melt ice (as Fire Generation)"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },
  "Weather Control": {
    category: "Matter Control",
    star: false,
    description: "Manipulate weather forces. Power stunts cost only 50 Karma (not 100). No starting stunts.",
    bonusPower: null,
    stunts: [
      "Create Fog (Power rank Intensity)",
      "Summon storms (Power rank Intensity)",
      "Generate winds/tornadoes (Power rank damage)",
      "Summon Lightning (Power rank damage, use Power rank as Agility to hit)",
      "Lower Temperature (-1CS FEATs, -1 material strength)",
      "Raise Temperature (-1CS FEATs, Endurance FEAT vs heat prostration)",
      "Detect Weather (3 days advance)",
      "Reduce Weather Effects"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "All stunts must be developed; none at start."
  },
  "Density Manipulation - Others": {
    category: "Matter Control",
    star: false,
    description: "Alter density of others on touch. Target may make Psyche or Endurance FEAT to avoid.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Reduction: less damage taken/dealt, may be affected by Good+ winds, 1-10 rounds. Increase: Endurance FEAT each round or unconscious, may lose Endurance ranks."
  },
  "Body Transformation - Others": {
    category: "Matter Control",
    star: false,
    description: "Convert living tissues to other substances (e.g., stone, crystal). Choose one material and duration (up to 1 hour). Touch required.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Target: Psyche or Endurance FEAT to avoid. Target regains form after transformation. -2CS shift for non-living tissue option."
  },
  "Animal Transformation - Others": {
    category: "Matter Control",
    star: false,
    description: "Transform human targets into animals and reverse. Touch required, flesh-to-flesh. Target keeps RIP but gets animal FASE.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Target: Psyche or Endurance FEAT to avoid. Heroes with inborn powers retain them in animal form."
  },

  // === ENERGY CONTROL ===
  "Magnetic Manipulation": {
    category: "Energy Control",
    star: false,
    description: "Manipulate magnetic lines of force. Move/control metallic objects up to Power rank size at Power rank range.",
    bonusPower: null,
    stunts: [
      "Flight at Power rank -3CS speed",
      "Shocking Touch at Power rank -1CS",
      "Affect non-ferrous metals (bullets) via Earth's field",
      "Affect non-metallic objects via Earth's field (requires non-ferrous first)",
      "Scramble non-sentient machinery at Power rank",
      "Affect sentient robots as shocking touch +1CS",
      "Magnetic Field Detection at Power rank -1CS"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },
  "Electrical Manipulation": {
    category: "Energy Control",
    star: false,
    description: "Manipulate and control electricity. Initial: Resistance to electricity = Power rank.",
    bonusPower: null,
    stunts: [
      "Heal damage through absorption (Power rank/round)",
      "Absorb electrical damage at -2CS",
      "Act as conductor at -2CS",
      "Move at Power rank speed along power lines/wiring",
      "Store energy, deliver shocking touch (Power rank damage)"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "If also have Electrical Resistance, raise one of the two powers."
  },
  "Light Manipulation": {
    category: "Energy Control",
    star: false,
    description: "Generate and manipulate light. Power rank Intensity, burst (all in area) or line (single target). May blind targets, no damage.",
    bonusPower: null,
    stunts: [
      "Darken/intensify light +/-1CS per round",
      "Create illusions at -3CS (visual only)",
      "Hypnosis at -2CS",
      "Laser at -2CS Power rank range/damage"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },
  "Sound Manipulation": {
    category: "Energy Control",
    star: false,
    description: "Manipulate existing sonic energies. Dampen noise by Power rank Intensity or increase by 1 level. Reduce sonic attacks by Power rank.",
    bonusPower: "Sound Generation",
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Bonus Power: May choose Sound Generation for next slot."
  },
  "Darkforce Manipulation": {
    category: "Energy Control",
    star: false,
    description: "Manipulate extra-dimensional Darkforce energy. Choose one starting stunt.",
    bonusPower: null,
    stunts: [
      "Flight at Power rank -1CS speed",
      "Darkforce distance weapon at -1CS range/damage",
      "Create specific shapes (one stunt per shape, Power rank material strength)",
      "Teleportation at -2CS via Darkforce dimension",
      "Create Darkness (Power rank Intensity, 3 areas, requires concentration)"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Darkforce may have hostile sentience. Judge may apply limitations."
  },
  "Gravity Manipulation": {
    category: "Energy Control",
    star: false,
    description: "Alter gravitational attractive forces. Choose one starting stunt. Effects last while concentrating or 5 rounds.",
    bonusPower: null,
    stunts: [
      "Flight at Power rank -2CS speed",
      "Levitation at Power rank -1CS speed",
      "Levitation of others (Agility FEAT to avoid) at -1CS speed",
      "Reduce weight (offset density gain, target may be slammed on any hit)",
      "Increase weight (Power rank as load, Strength FEAT to move)"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },
  "Probability Manipulation": {
    category: "Energy Control",
    star: true,
    description: "Alter chance element of dice. Roll for Bad Luck (01-50), Good Luck (51-90), or Both (91-100).",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: true,
    notes: "Bad Luck: low die is tens. Good Luck: high die is tens. MUST take a limitation."
  },
  "Nullifying Power": {
    category: "Energy Control",
    star: true,
    description: "Negate inborn super-human powers (not tech/magical). Endurance FEAT or lose powers while in range or 1-10 rounds.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Affects ALL in range. Cannot use other inborn powers while using this."
  },
  "Energy Reflection": {
    category: "Energy Control",
    star: false,
    description: "Limited Invulnerability to specific energy type. Reflect up to Unearthly damage in same round. Use Agility to hit target.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Choose energy type. >Unearthly: reflect 100 points, take remainder. No Karma loss from reflected attacks."
  },
  "Time Control": {
    category: "Energy Control",
    star: true,
    description: "Perform time-related stunts. No starting stunts. Automatic limitation from Judge.",
    bonusPower: null,
    stunts: [
      "Speed up time (Lightning Speed at Power rank)",
      "Slow down time in area (Multiple Attacks at Power rank)",
      "Slow time for injured character (1 turn = Power rank turns for others)",
      "Time Travel (creates divergent reality, not true past change)",
      "Summon Duplicates from past/future/alternate (identical stats, start with 2, increase as stunts)"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: true,
    notes: "Very powerful. Judge assigns limitation. Duplicate death = character death, Karma lost."
  },

  // === BODY CONTROL ===
  "Growth": {
    category: "Body Control",
    star: false,
    description: "Grow taller. Use Power rank instead of Strength for Strength FEATs. Positive column shifts to be hit based on height.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Unearthly+ requires Monstrous Strength to support body. May accept permanent size as limitation (+1 rank)."
  },
  "Shrinking": {
    category: "Body Control",
    star: false,
    description: "Become smaller while retaining Strength. Column shift modifier for attacks against larger foes.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Shift X+: cross Pym barrier into Microverse."
  },
  "Density Manipulation - Self": {
    category: "Body Control",
    star: false,
    description: "Alter own mass. Shift 0 (weightless) to Power rank. Gain Body Armor = current rank. Charging damage uses Power rank.",
    bonusPower: null,
    stunts: [
      "Solidify inside target (Strength FEAT vs material, damage = material strength; vs living: Power rank damage, Endurance FEAT or unconscious)"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Shift 0: immune to physical (not energy/force). High density > Endurance: -1CS Fighting and Agility."
  },
  "Phasing": {
    category: "Body Control",
    star: false,
    description: "Pull molecules out of phase, pass through solid items. Immune to physical/most energy (not mental/magic). Pass through materials < Power rank.",
    bonusPower: null,
    stunts: [
      "Affect electronic devices (malfunction)",
      "Affect another in contact",
      "Walk on air at normal speed",
      "Phase inside ally (grant phasing)",
      "Phase in, strike, phase out in one round",
      "Phase part of body only (always Red FEAT)"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Electronics stunt: Endurance FEAT (robots) or Reason FEAT (equipment) or lose Health = Power rank. Duration limited by breath holding."
  },
  "Invisibility": {
    category: "Body Control",
    star: false,
    description: "Become invisible to normal sight. Still has mass. Coating, dust, fog, rain reveals form.",
    bonusPower: null,
    stunts: [
      "Make others invisible on touch",
      "Make others invisible at range (requires touch first)",
      "Make invisible objects visible (FEAT vs Intensity)",
      "Make part of body invisible",
      "Extend to heat/UV (become undetectable)"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Does not negate heat/UV detection initially. Power rank used for stunts."
  },
  "Plasticity": {
    category: "Body Control",
    star: false,
    description: "Elastic and malleable body. Body Armor = Power rank.",
    bonusPower: "Elongation",
    stunts: [
      "Use Power rank instead of Agility for catching (no damage from falling character)",
      "Limited disguise at -2CS detection",
      "Bouncing: fall Power rank floors without damage, Leaping at -1CS"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Bonus Power: May choose Elongation."
  },
  "Elongation": {
    category: "Body Control",
    star: false,
    description: "Extend body and limbs. Attack non-adjacent foes in close combat. Target can only attack extended part (no Kill/Stun/Slam benefits).",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Range: Power rank number in yards."
  },
  "Shape-Shifting": {
    category: "Body Control",
    star: false,
    description: "Radically modify shape to resemble objects/beings. Power rank FEAT vs target's RIP (highest). +/- half height. Only visible physical powers gained.",
    bonusPower: null,
    stunts: [
      "Claws/teeth (Edged Attack damage)",
      "Gliding at -2CS",
      "Body Armor (material strength -1CS or Power rank -2CS, whichever less)"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Cannot gain true super powers."
  },
  "Imitation": {
    category: "Body Control",
    star: false,
    description: "Specialized Shape-shifting to duplicate humanoid appearance, voice, mannerisms. Power rank FEAT vs target's RIP (lowest).",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Does not duplicate Powers, Talents, or abilities. May use target's Popularity/Contacts if successful."
  },
  "Body Transformation - Self": {
    category: "Body Control",
    star: true,
    description: "Transform into other substances with mobility and cognizance. Body Armor = material strength or Power rank (lower). Gain substance's special functions.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "+1CS if limited to one state (solid/liquid/gas/energy). +2CS if limited to specific type. Damage while transformed: can reintegrate if any Health remains."
  },
  "Animal Transformation - Self": {
    category: "Body Control",
    star: false,
    description: "Assume normal animal form with animal's powers. Animal FASE, hero or animal RIP. Power rank FEAT required unless single animal type chosen.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Other super powers lost in animal form."
  },
  "Raise Lowest Ability": {
    category: "Body Control",
    star: false,
    description: "Raise lowest primary ability by 20 points. May then choose next power from complete list.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Only one ability affected. If two tied for lowest, hero chooses."
  },
  "Blending": {
    category: "Body Control",
    star: false,
    description: "Change shade to blend with surroundings. Specialized Invisibility. Hidden until move/act.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "+2CS (instead of +1CS) if limitation chosen (only at night, only in forests, etc.)."
  },
  "Power Absorption": {
    category: "Body Control",
    star: false,
    description: "Acquire others' super powers on touch. Target: Psyche or Endurance FEAT to avoid. Max acquired = Power rank.",
    bonusPower: null,
    stunts: [
      "Drain additional powers (each is separate stunt)"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "If target power > Power rank: Psyche FEAT or knocked out 1-10 rounds, only gain Power rank amount. Target loses absorbed power while hero has it."
  },
  "Alter Ego": {
    category: "Body Control",
    star: false,
    description: "Separate normal persona. Alter ego: Normal Folks column, no powers. Transformation immediate. Separate Karma pools.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Limitation (1-10 rounds, requires item, talents not shared) allows +1 rank to one ability (Unearthly max)."
  },

  // === DISTANCE ATTACKS ===
  "Projectile Missile": {
    category: "Distance Attacks",
    star: false,
    description: "Specialized weapon. Power rank range and damage. Use Agility to hit. No range penalty for hero.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Improvements via advancement, not invention rules."
  },
  "Ensnaring Missile": {
    category: "Distance Attacks",
    star: false,
    description: "Grappling attack at range. Agility FEAT to hit. Hit = Power rank Strength grapple, Power rank material strength.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Limitations for +1CS: one target only, wears off 1-10 rounds, weakens -1CS/turn, limited charges."
  },
  "Ice Generation": {
    category: "Distance Attacks",
    star: false,
    description: "Draw water from air, convert to ice. Power rank range and damage. Use Agility to hit on Blunt/Edged Throwing.",
    bonusPower: null,
    stunts: [
      "Entrap in ice (Power rank material strength, 2 areas)",
      "Body Armor at Power rank -1CS (vulnerable to fire +1CS)",
      "Create columns/walls (Power rank -1CS material strength)",
      "Ice ramps (Power rank -1CS speed, 2 floors/round)",
      "Slick spots (Power rank -1CS slipperiness)",
      "Cold waves (Power rank range/intensity, -2CS/-1CS FEATs)",
      "Absorb cold/ice (Power rank capacity)"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "One stunt at start. Melting may cause damage (Karma loss)."
  },
  "Fire Generation": {
    category: "Distance Attacks",
    star: false,
    description: "Project flame. Power rank range and damage. Energy table. May choose less damage/effect.",
    bonusPower: null,
    stunts: [
      "Flaming shield (Power rank damage to crossers)",
      "Body transformation to fire at -2CS (Body Armor and Flight)",
      "Flaming images at -1CS",
      "Control other fire at -2CS",
      "Absorb fire/heat (Power rank capacity)",
      "Project heat at -1CS (-1CS FEATs in area)"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "One stunt at start. Fire damage may cause Karma loss."
  },
  "Energy Generation": {
    category: "Distance Attacks",
    star: false,
    description: "Fire bolts of force. Choose Energy, Force, or develop other as stunt. Power rank range and damage. May pull punch.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },
  "Sound Generation": {
    category: "Distance Attacks",
    star: false,
    description: "Sonic attacks. Power rank range and damage. Force column. Initially one target.",
    bonusPower: null,
    stunts: [
      "Wide-band (all in area at -1CS)",
      "Stunning attack (-1CS Intensity, Endurance FEAT or unconscious 1-10 rounds)",
      "Flight at -2CS (-1CS with control surface)",
      "Sonic walls (Power rank -1CS material strength)",
      "Absorb sound (-1CS, reduce sonic attacks)",
      "Holographic illusions at -2CS (semi-real, -3CS damage)"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },
  "Stunning Missile": {
    category: "Distance Attacks",
    star: false,
    description: "Weapon/bolt that damages on Force column OR stuns (Power rank Intensity). Choose one, develop other as stunt.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },
  "Corrosive Missile": {
    category: "Distance Attacks",
    star: false,
    description: "Acid attack. Power rank damage round 1, -2CS round 2, -4CS round 3. Cannot reduce damage. Washed off stops damage.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Also affects materials/Body Armor: FEAT to break if Power rank > material strength."
  },
  "Slashing Missile": {
    category: "Distance Attacks",
    star: false,
    description: "Attacks on Throwing Edged column. Cannot reduce effect. Power rank damage and range.",
    bonusPower: null,
    stunts: [
      "Blunt Throwing attack"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },
  "Nullifier Missile": {
    category: "Distance Attacks",
    star: false,
    description: "No damage, nullify inborn OR tech powers. Power rank Intensity, lasts while concentrating. Target: Psyche FEAT (inborn) or Reason FEAT (tech) each round.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Single target only."
  },
  "Darkforce Generation": {
    category: "Distance Attacks",
    star: false,
    description: "Summon Darkforce as weapon. Power rank damage OR Stunning (1-10 rounds). All Darkforce Manipulation stunts except teleportation.",
    bonusPower: null,
    stunts: [
      "Create Darkness (Power rank Intensity, 3 areas)"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },

  // === MENTAL POWERS ===
  "Ultimate Skill": {
    category: "Mental Powers",
    star: false,
    description: "Unearthly ability in one chosen Talent. Pick from: All Weapon Skills, All Fighting Skills, All Scientific Skills, Most Other Skills.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Not available: Professional Skills, Mystic/Mental Skills, Student, Heir to Fortune, Leadership."
  },
  "Telepathy": {
    category: "Mental Powers",
    star: false,
    description: "Mind-to-mind communication, read surface thoughts. Power rank FEAT. Auto on willing/lower Psyche. Yellow for equal, Red for mental powers/psi-screen.",
    bonusPower: null,
    stunts: [
      "Mental force bolt (Power rank range/damage, Energy column)",
      "Link team minds (share awareness, non-verbal orders, all have telepath's Intuition)",
      "Mental Probe at -2CS"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Higher unwilling Psyche = impossible. Link range = half normal."
  },
  "Image Generation": {
    category: "Mental Powers",
    star: true,
    description: "Create mental images. Don't register on cameras or non-sentient robots. Targets: Intuition FEAT vs Power rank to disbelieve.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Lasts while concentrating. Illusory damage: death = unconscious 1-10 rounds. Fool characters but not nature."
  },
  "Telekinesis": {
    category: "Mental Powers",
    star: false,
    description: "Lift objects at range. Power rank = Strength for FEATs.",
    bonusPower: null,
    stunts: [
      "Flight for self/others at -1CS (within weight limit)",
      "TK Force Field at -2CS",
      "TK Force Bolts at -1CS (Force column)"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Wielded items attack as Power rank Strength."
  },
  "Mind Control": {
    category: "Mental Powers",
    star: true,
    description: "Override conscious mind. Target: Psyche FEAT to avoid. Must be within 1 area initially. Obeys verbal/telepathic orders. No memory of controlled time.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Lose 10 Karma each use. Additional Psyche FEAT in Karma-losing or life-threatening situations. Karma gain/loss applies to controller."
  },
  "Emotion Control": {
    category: "Mental Powers",
    star: true,
    description: "Act on subconscious emotions. Target: Intuition FEAT to avoid. Duration 10-100 turns. Robots and aliens immune.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "+2CS if limited to one emotion. Start with 2 emotions, others as stunts. Types: Respect, Love, Fear, Hatred, Loyalty, Doubt, Pleasure."
  },
  "Force Field Generation": {
    category: "Mental Powers",
    star: false,
    description: "Create protective force fields. Cover areas = tens digit of rank number. Each area beyond first: -1CS strength.",
    bonusPower: null,
    stunts: [
      "Force missiles at -1CS range/damage (Force column)",
      "Force cushion (absorb Power rank fall/crash damage)",
      "Enhanced movement (column topple, Power rank -2CS Levitation, Typical max Flight)",
      "Entrap others",
      "Grabbing attack at range (Power rank Strength)",
      "Expand bubble inside opening (Power rank damage, bypass armor)"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Personal FF: +1CS but no stunts. Absorb damage up to rank number (breached if exceeded). Energy: full protection. Other: -10 points."
  },
  "Animal Communication and Control": {
    category: "Mental Powers",
    star: false,
    description: "Talk to and influence animals. +1CS for type/class, +2CS for family, +3CS for specific animal (becomes Contact). Use Power rank as Popularity.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Failure: animal may turn on controller. Contact animals never turn."
  },
  "Mechanical Intuition": {
    category: "Mental Powers",
    star: false,
    description: "Ultimate Skill for repairs/inventing/building. Unearthly rank for invention success rolls. Still requires Resources.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "No modifiers to roll."
  },
  "Empathy": {
    category: "Mental Powers",
    star: false,
    description: "Register surface emotions (not thoughts). Target unaware. Success as per Telepathy. Blocked by Empathy and Emotion Control.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },
  "Animal Empathy": {
    category: "Mental Powers",
    star: false,
    description: "Detect and influence animal surface emotions. Power rank FEAT to instill fear, hunger, affection, exhaustion, etc.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },
  "Psi-Screen": {
    category: "Mental Powers",
    star: false,
    description: "Inborn resistance to mental scans/domination. Use instead of Psyche vs Mental Powers requiring Psyche FEAT.",
    bonusPower: null,
    stunts: [
      "Extend over others (Power rank FEAT each, failure = lose all for 1-10 turns)"
    ],
    minRank: "Psyche+1",
    maxRank: null,
    limitationRequired: false,
    notes: "All mental power users have this at Psyche level. This power is +1CS higher. Extending reveals presence to attacker."
  },
  "Mental Probe": {
    category: "Mental Powers",
    star: false,
    description: "Search for specific image in target's mind. State target before scan. Target: Psyche FEAT to resist (can't probe again for 24 hours).",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Second Psyche FEAT: failure = -1CS Psyche for 24 hours. Info limited to target's knowledge."
  },
  "Animate Drawings": {
    category: "Mental Powers",
    star: false,
    description: "Animate flat drawings. Powers/abilities cannot exceed Power rank. +1CS if limited to specific type (e.g., Tarot deck).",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Duration: 1-10 rounds (secret). Dissipate when destroyed or return to location, can't reanimate for 24 hours."
  },
  "Possession": {
    category: "Mental Powers",
    star: true,
    description: "Enter and control target's mind. Only vs Psyche <= Power rank. Target: Psyche FEAT to avoid. Controller is 'inside' mind.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Possessed: no Karma gain/loss, may lose Popularity. Psyche FEAT to escape in life-threatening situation."
  },
  "Transferral": {
    category: "Mental Powers",
    star: true,
    description: "Complete consciousness swap. Always Red FEAT. Works on any Psyche, mental powers, aliens, robots. Trade mental abilities, Powers, Talents, Karma.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Failure: unconscious 1-10 rounds, can't retry for 1 day. Keep physical abilities, Popularity, Contacts, Resources."
  },
  "Astral Projection": {
    category: "Mental Powers",
    star: false,
    description: "Leave body, travel as astral form. Observe but not detected normally. Affected by Mental Powers and Force Fields. Phase through solids.",
    bonusPower: null,
    stunts: [
      "Astral Detection"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Body in trance while away. Body damage known if in same dimension. Body dies = trapped in astral. Cross dimensions with Power rank ability."
  },
  "Psionic Attack": {
    category: "Mental Powers",
    star: false,
    description: "Project psionic force blasts. Power rank range and Intensity. Target: Psyche FEAT or unconscious 1-10 rounds. Mental Powers or Psi-Screen used instead of Psyche.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Force Fields operate against this."
  },
  "Precognition": {
    category: "Mental Powers",
    star: true,
    description: "Scan alternative futures up to 1 week ahead. Once per day. MUST choose a limitation.",
    bonusPower: null,
    stunts: [
      "Combat precog: Yellow+ FEAT at turn start, Judge tells NPC plans, share if initiative won"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: true,
    notes: "White=lie, Green=partial truth, Yellow=fairly honest, Red=useful. Limitations: intermittent, people only, objects only, realistic dreams, once per image."
  },
  "Postcognition": {
    category: "Mental Powers",
    star: false,
    description: "Read past of handled items. Green within 1 day, Yellow within 1 week, Red within 1 year, further = feeling only.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Second FEAT determines detail: White=false, Green=partial, Yellow=honest, Red=useful."
  },
  "Plant Control": {
    category: "Mental Powers",
    star: false,
    description: "Command plants, grant temporary movement/growth/intelligence. Cannot control > Power rank material strength plants. Intelligent plant-creatures: Reason FEAT.",
    bonusPower: null,
    stunts: [
      "Animate vines (Power rank Agility, Power rank material strength entanglement)",
      "Plant images (Power rank ability)",
      "Animate trees (Power rank Health, Body Armor)",
      "Command fungi/mushrooms",
      "Gather info from plants (1 day, primitive)"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Without stunts, plants can only do normal actions."
  },

  // === BODY ALTERATIONS/OFFENSIVE ===
  "Extra Body Parts": {
    category: "Body Alterations/Offensive",
    star: false,
    description: "Additional body parts. Choose type and number.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Arms: Extra Attacks bonus. Legs: Lightning Speed bonus. Prehensile Tail: Climbing bonus. Wings: Flight +1CS bonus. Combat Tail: Strength +1CS damage. Eyes: Enhanced Senses/detection bonus. Claws: +1CS material strength. Spines: Projectile Missile +1CS."
  },
  "Extra Attacks": {
    category: "Body Alterations/Offensive",
    star: false,
    description: "Make multiple attacks. Use instead of Fighting. No penalty for failure.",
    bonusPower: null,
    stunts: [],
    minRank: "Fighting+1",
    maxRank: null,
    limitationRequired: false,
    notes: "Always +1CS better than starting Fighting."
  },
  "Energy Touch": {
    category: "Body Alterations/Offensive",
    star: false,
    description: "Inflict Energy damage (Bullseye = possible Stun). May choose less damage. Carries through conductive material.",
    bonusPower: "Resistance to Electricity",
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Multiple targets if on conductive material."
  },
  "Paralyzing Touch": {
    category: "Body Alterations/Offensive",
    star: false,
    description: "Touch: target Endurance FEAT or knocked out 1-10 rounds. Always in operation, may affect self.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },
  "Claws": {
    category: "Body Alterations/Offensive",
    star: false,
    description: "Edged Attack damage. Power rank = damage and material strength. Cannot reduce damage/effect.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Vs materials: compare claw strength vs target. Success = cut through. Works on artificial Body Armor (not natural or force fields). +2CS material strength with any limitation."
  },
  "Rotting Touch": {
    category: "Body Alterations/Offensive",
    star: false,
    description: "Organic material decays. Power rank damage. Affects organic material as Power rank Strength for breaking. Works on organic Body Armor.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Resistance to Corrosives offsets effects."
  },
  "Corrosive Touch": {
    category: "Body Alterations/Offensive",
    star: false,
    description: "Affects inorganic materials. Power rank -3CS damage vs living. Acts on inorganic as Power rank Strength. Works on inorganic Body Armor.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Resistance to Corrosives offsets effects."
  },
  "Health-Drain Touch": {
    category: "Body Alterations/Offensive",
    star: true,
    description: "Transfer Power rank Health from target to hero. Heals previous damage, excess lost. Target at 0 Health: Endurance FEAT or die.",
    bonusPower: null,
    stunts: [
      "Reverse process (give Health to others)"
    ],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },
  "Blinding Touch": {
    category: "Body Alterations/Offensive",
    star: false,
    description: "Blind unprotected target for 1-10 rounds. Requires Stun or Slam result. No FEAT to avoid unless Protected Senses or similar.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },

  // === BODY ALTERATIONS/DEFENSIVE ===
  "Body Armor": {
    category: "Body Alterations/Defensive",
    star: false,
    description: "Resist physical damage. Absorb Power rank number damage per attack. If attack < armor, no effects. Energy attacks: -20 points protection.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Natural vs Artificial. Some attacks more effective against one type. Artificial can be removed. +1 rank for -1CS Agility (min Feeble)."
  },
  "Water Breathing": {
    category: "Body Alterations/Defensive",
    star: false,
    description: "Breathe water as air. See underwater as on land. Survive at great depths.",
    bonusPower: "Swimming or Animal Communication (Sea)",
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "May choose both bonuses but then only breathes water (drowns on land)."
  },
  "Absorption": {
    category: "Body Alterations/Defensive",
    star: false,
    description: "Absorb specific damage type (fire, energy, kinetic). No damage, heals existing damage, may raise Health above normal by Power rank.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Damage > Power rank: excess inflicted, but may redirect absorbed energy next round. Absorbed energy dissipates in 10 rounds."
  },
  "Regeneration": {
    category: "Body Alterations/Defensive",
    star: false,
    description: "Recover Endurance rank number Health every 10 turns (1 minute). Requires rest, no additional damage.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "If rest interrupted, must start again."
  },
  "Solar Regeneration": {
    category: "Body Alterations/Defensive",
    star: false,
    description: "Heal Power rank Health every 10 minutes in sunshine. Normal healing otherwise.",
    bonusPower: null,
    stunts: [],
    minRank: "Endurance+1",
    maxRank: null,
    limitationRequired: false,
    notes: "Minimum Power rank is Endurance +1CS."
  },
  "Recovery": {
    category: "Body Alterations/Defensive",
    star: false,
    description: "Recover Endurance ranks at 1 rank per day. Power rank FEAT to regain.",
    bonusPower: "Any Resistance",
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },
  "Life Support": {
    category: "Body Alterations/Defensive",
    star: false,
    description: "Survive hostile environments (space, underwater, lava). Power rank number = turns before Endurance FEATs. Shift Z+: indefinitely without food/water/air.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },
  "Pheromones": {
    category: "Body Alterations/Defensive",
    star: false,
    description: "Specialized Emotion Control affecting opposite sex. Target: Psyche FEAT vs Power rank or considered Friendly.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Robots, aliens, those who can't smell, those behind force fields: immune. Hostile targets still attracted but may put hero in deathtrap."
  },
  "Damage Transfer": {
    category: "Body Alterations/Defensive",
    star: false,
    description: "Transfer Health between two separate targets on touch. Heal one, reduce other. Hero cannot regain Health from this.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: null
  },
  "Healing": {
    category: "Body Alterations/Defensive",
    star: false,
    description: "Restore lost Health and Endurance to others (not self). Power rank = max Health restored per hero per day.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Endurance FEAT per attempt: failure = lose Karma = Health healed. No Karma = no healing. Endurance ranks: 1/day/hero, failure = hero loses 1 Endurance (heals naturally only)."
  },
  "Immortality": {
    category: "Body Alterations/Defensive",
    star: true,
    description: "Do not age or die normally. Can still lose Endurance, but if result = death, stay at Shift 0 instead. Cannot act until Endurance reaches Feeble.",
    bonusPower: null,
    stunts: [],
    minRank: null,
    maxRank: null,
    limitationRequired: false,
    notes: "Lose all Karma (including advancement) when 'dead'. Body slowly regenerates. Only applies in Earth Dimension (can be killed normally in Asgard, etc.). Aliens: normal cost."
  }
};

// Talent Data with modifiers and effects
export const TALENT_DATA = {
  // === WEAPON SKILLS ===
  "Guns": {
    category: "Weapon Skills",
    star: false,
    effect: "+1CS Agility with handguns, rifles, submachine guns (including laser, stun, concussion)",
    ability: "Agility",
    modifier: 1,
    notes: null,
    grantsContact: null
  },
  "Thrown Weapons": {
    category: "Weapon Skills",
    star: false,
    effect: "+1CS Agility with weapons designed to be thrown (spears, daggers, Shuriken, disks)",
    ability: "Agility",
    modifier: 1,
    notes: null,
    grantsContact: null
  },
  "Bows": {
    category: "Weapon Skills",
    star: false,
    effect: "+1CS Agility with bows/crossbows. Fire and reload in single round. May fire multiple arrows on Agility FEAT.",
    ability: "Agility",
    modifier: 1,
    notes: "Without talent: -1CS with bows",
    grantsContact: null
  },
  "Blunt Weapons": {
    category: "Weapon Skills",
    star: false,
    effect: "+1CS to hit with Blunt Attack weapons",
    ability: "Fighting",
    modifier: 1,
    notes: null,
    grantsContact: null
  },
  "Sharp Weapons": {
    category: "Weapon Skills",
    star: false,
    effect: "+1CS to hit with Edged Attack weapons (swords, daggers, spears). Not claws or natural extensions.",
    ability: "Fighting",
    modifier: 1,
    notes: null,
    grantsContact: null
  },
  "Oriental Weapons": {
    category: "Weapon Skills",
    star: false,
    effect: "+1CS Fighting or Agility with Shuriken, crossbows, sais, katana, kris",
    ability: "Fighting/Agility",
    modifier: 1,
    notes: null,
    grantsContact: null
  },
  "Marksman": {
    category: "Weapon Skills",
    star: true,
    effect: "+1CS with any line-of-sight distance weapon. No range penalties.",
    ability: "Agility",
    modifier: 1,
    notes: null,
    grantsContact: null
  },
  "Weapons Master": {
    category: "Weapon Skills",
    star: true,
    effect: "+1CS to hit with any weapon requiring Fighting FEAT",
    ability: "Fighting",
    modifier: 1,
    notes: null,
    grantsContact: null
  },
  "Weapons Specialist": {
    category: "Weapon Skills",
    star: true,
    effect: "+2CS with single weapon of choice. +1 initiative with this weapon.",
    ability: "Fighting/Agility",
    modifier: 2,
    notes: "Choose weapon at character creation",
    grantsContact: null
  },

  // === FIGHTING SKILLS ===
  "Martial Arts A": {
    category: "Fighting Skills",
    star: false,
    effect: "Can Stun or Slam regardless of comparative Strengths and Endurances",
    ability: null,
    modifier: 0,
    notes: "Uses opponent's strength against them (judo, karate style)",
    grantsContact: null
  },
  "Martial Arts B": {
    category: "Fighting Skills",
    star: false,
    effect: "+1CS Fighting in unarmed combat",
    ability: "Fighting",
    modifier: 1,
    notes: "Offensive focus (boxing style)",
    grantsContact: null
  },
  "Martial Arts C": {
    category: "Fighting Skills",
    star: false,
    effect: "+1CS Strength for Grappling (including damage), +1CS Strength for Escaping, +1CS Agility for Dodging",
    ability: "Strength/Agility",
    modifier: 1,
    notes: "Holds and escapes focus",
    grantsContact: null
  },
  "Martial Arts D": {
    category: "Fighting Skills",
    star: false,
    effect: "Ignore Body Armor (not force fields) for Stun/Slam. Don't need to inflict damage to force check. Must study target 2 rounds first.",
    ability: null,
    modifier: 0,
    notes: "Meditative, finds weak spots",
    grantsContact: null
  },
  "Martial Arts E": {
    category: "Fighting Skills",
    star: false,
    effect: "+1 initiative in unarmed combat",
    ability: null,
    modifier: 0,
    notes: "Quick striking",
    grantsContact: null
  },
  "Wrestling": {
    category: "Fighting Skills",
    star: false,
    effect: "+2CS to Grappling attacks (not damage)",
    ability: "Fighting",
    modifier: 2,
    notes: "Combined with MA-B: +3CS Grappling, +1CS damage",
    grantsContact: null
  },
  "Thrown Objects": {
    category: "Fighting Skills",
    star: false,
    effect: "+1CS Throwing attacks (Edged and Blunt), +1CS Catching",
    ability: "Agility",
    modifier: 1,
    notes: "Stacks with Thrown Weapons for +2CS",
    grantsContact: null
  },
  "Acrobatics": {
    category: "Fighting Skills",
    star: false,
    effect: "+1CS when dodging, evading, and escaping",
    ability: "Agility",
    modifier: 1,
    notes: null,
    grantsContact: null
  },
  "Tumbling": {
    category: "Fighting Skills",
    star: false,
    effect: "Agility FEAT to land feet-first after any non-damaging fall",
    ability: "Agility",
    modifier: 0,
    notes: null,
    grantsContact: null
  },

  // === PROFESSIONAL SKILLS ===
  "Medicine": {
    category: "Professional Skills",
    star: true,
    effect: "+1CS Reason for medical problems, medications, poisons, surgery. Can revive characters at Shift 0 up to 20 turns after. Restore 1 Endurance rank/week.",
    ability: "Reason",
    modifier: 1,
    notes: "Two talent slots",
    grantsContact: null
  },
  "Law": {
    category: "Professional Skills",
    star: false,
    effect: "+1CS Reason for legal matters. May be a lawyer or pass bar (Good Reason FEAT).",
    ability: "Reason",
    modifier: 1,
    notes: null,
    grantsContact: null
  },
  "Law-Enforcement": {
    category: "Professional Skills",
    star: false,
    effect: "Includes Gun and Law talents. May legally carry gun and make arrests if member of agency.",
    ability: "Various",
    modifier: 0,
    notes: "Grants Gun and Law talents",
    grantsContact: null
  },
  "Pilot": {
    category: "Professional Skills",
    star: false,
    effect: "+1CS for all FEATs involving controlled aircraft (Control, Agility, Reason)",
    ability: "Various",
    modifier: 1,
    notes: "May extend to spacecraft with appropriate background",
    grantsContact: null
  },
  "Military": {
    category: "Professional Skills",
    star: false,
    effect: "+1CS in military matters",
    ability: "Various",
    modifier: 1,
    notes: null,
    grantsContact: "Military"
  },
  "Business/Finance": {
    category: "Professional Skills",
    star: false,
    effect: "+1CS FEATs dealing with money. Minimum Resources = Good.",
    ability: "Reason",
    modifier: 1,
    notes: null,
    grantsContact: "Business World"
  },
  "Journalism": {
    category: "Professional Skills",
    star: false,
    effect: "Gain 2 additional Contacts (media-connected)",
    ability: null,
    modifier: 0,
    notes: "Contacts should be media, law enforcement, political, or criminal informants",
    grantsContact: "Journalism x2"
  },
  "Engineering": {
    category: "Professional Skills",
    star: false,
    effect: "+1CS Reason for building things, including Resource FEAT to build",
    ability: "Reason",
    modifier: 1,
    notes: "Includes civil, chemical, mechanical engineering",
    grantsContact: null
  },
  "Crime": {
    category: "Professional Skills",
    star: false,
    effect: "+1CS Reason and Intuition for criminal practices",
    ability: "Reason/Intuition",
    modifier: 1,
    notes: null,
    grantsContact: "Crime or Law-Enforcement"
  },
  "Psychiatry": {
    category: "Professional Skills",
    star: false,
    effect: "+1CS on mind-related FEATs. +1CS with Mental Control, Domination, Hypnosis, Emotion Control, Mental Probe powers.",
    ability: "Various",
    modifier: 1,
    notes: null,
    grantsContact: null
  },
  "Detective/Espionage": {
    category: "Professional Skills",
    star: false,
    effect: "+1CS to discover crime clues",
    ability: "Reason/Intuition",
    modifier: 1,
    notes: null,
    grantsContact: "Crime, Law-Enforcement, Law, or Espionage"
  },

  // === SCIENTIFIC SKILLS ===
  "Chemistry": {
    category: "Scientific Skills",
    star: false,
    effect: "+1CS Reason for chemistry, developing formulas, curing inorganic poisons, identifying chemicals",
    ability: "Reason",
    modifier: 1,
    notes: null,
    grantsContact: null
  },
  "Biology": {
    category: "Scientific Skills",
    star: false,
    effect: "+1CS Reason for biology, animal/plant ID, curing organic poisons, disease research",
    ability: "Reason",
    modifier: 1,
    notes: null,
    grantsContact: null
  },
  "Geology": {
    category: "Scientific Skills",
    star: false,
    effect: "+1CS Reason for Earth matters, volcanic activity, geology, rock types, mineral ID",
    ability: "Reason",
    modifier: 1,
    notes: null,
    grantsContact: null
  },
  "Genetics": {
    category: "Scientific Skills",
    star: false,
    effect: "+1CS Reason for genes, creating life forms, understanding mutants, disease research",
    ability: "Reason",
    modifier: 1,
    notes: null,
    grantsContact: null
  },
  "Archeology": {
    category: "Scientific Skills",
    star: false,
    effect: "+1CS Reason for the past, paleontology, historical records, ancient myths",
    ability: "Reason",
    modifier: 1,
    notes: null,
    grantsContact: null
  },
  "Physics": {
    category: "Scientific Skills",
    star: false,
    effect: "+1CS Reason for physics and astrophysics, motion, flight, planets and stars",
    ability: "Reason",
    modifier: 1,
    notes: null,
    grantsContact: null
  },
  "Computers": {
    category: "Scientific Skills",
    star: false,
    effect: "+1CS Reason for computers, computer-controlled equipment, AIs",
    ability: "Reason",
    modifier: 1,
    notes: null,
    grantsContact: null
  },
  "Electronics": {
    category: "Scientific Skills",
    star: false,
    effect: "+1CS Reason for electronic devices, creation and repair",
    ability: "Reason",
    modifier: 1,
    notes: null,
    grantsContact: null
  },

  // === MYSTIC AND MENTAL SKILLS ===
  "Trance": {
    category: "Mystic and Mental Skills",
    star: false,
    effect: "Enter trance that slows body functions (appears deceased, Intuition FEAT to detect). Minimal food/water needs. Regain Endurance ranks at 1/day.",
    ability: null,
    modifier: 0,
    notes: null,
    grantsContact: null
  },
  "Mesmerism and Hypnosis": {
    category: "Mystic and Mental Skills",
    star: false,
    effect: "Mind Control at Power rank = Reason. Mental Probe for info. Post-hypnotic suggestions (1-10 hours). Breaks if forced to do something against nature.",
    ability: "Reason",
    modifier: 0,
    notes: null,
    grantsContact: null
  },
  "Sleight of Hand": {
    category: "Mystic and Mental Skills",
    star: false,
    effect: "Palm small items, make appear/disappear at Agility +1CS",
    ability: "Agility",
    modifier: 1,
    notes: null,
    grantsContact: null
  },
  "Resist Domination": {
    category: "Mystic and Mental Skills",
    star: false,
    effect: "Resist mental attacks as if Psyche +1CS. Passive only, no other benefits.",
    ability: "Psyche",
    modifier: 1,
    notes: "Similar to Psi-Screen power but talent version",
    grantsContact: null
  },
  "Mystic Origin": {
    category: "Mystic and Mental Skills",
    star: true,
    effect: "May have Magical Powers (with Judge approval). Initial powers may be spells from Personal, Universal, or Dimensional energies.",
    ability: null,
    modifier: 0,
    notes: "Two talent slots. Required for magic-using characters.",
    grantsContact: null
  },
  "Occult Lore": {
    category: "Mystic and Mental Skills",
    star: false,
    effect: "+1CS Reason for magical items, societies, antiquities, runes, forgotten lore",
    ability: "Reason",
    modifier: 1,
    notes: null,
    grantsContact: null
  },

  // === OTHER SKILLS ===
  "Artist": {
    category: "Other Skills",
    star: false,
    effect: "Create works of art (painting, sculpting, writing). 1-10 weeks per work. Gain 10x weeks Karma on completion. Must allocate daily time.",
    ability: null,
    modifier: 0,
    notes: null,
    grantsContact: null
  },
  "Languages": {
    category: "Other Skills",
    star: false,
    effect: "Gain 1 additional language at start. Learn new languages at half Talent cost (500 Karma).",
    ability: null,
    modifier: 0,
    notes: "Required before learning other languages. May fill in language later as needed.",
    grantsContact: null
  },
  "First Aid": {
    category: "Other Skills",
    star: false,
    effect: "Halt Endurance loss immediately. Recover 1 rank immediately (once per situation). Stabilize at Shift 0 up to 5 rounds after.",
    ability: null,
    modifier: 0,
    notes: "Less powerful than Medicine",
    grantsContact: null
  },
  "Repair/Tinkering": {
    category: "Other Skills",
    star: false,
    effect: "+1CS Reason for repair and modification (not building new items). Stacks with other talents.",
    ability: "Reason",
    modifier: 1,
    notes: "Engineer with Tinkering = +2CS repair",
    grantsContact: null
  },
  "Trivia": {
    category: "Other Skills",
    star: false,
    effect: "+1CS Reason for one specific subject (old movies, military history, sports, rock music, comic books). Must be specific, not general.",
    ability: "Reason",
    modifier: 1,
    notes: "Choose subject at character creation",
    grantsContact: null
  },
  "Performer": {
    category: "Other Skills",
    star: false,
    effect: "Acting, singing, dancing, miming. Gain 10 Karma per week of performance.",
    ability: null,
    modifier: 0,
    notes: null,
    grantsContact: null
  },
  "Animal Training": {
    category: "Other Skills",
    star: true,
    effect: "Train animals to perform stunts (Reason FEAT). If have Animal Empathy or Communication: +1CS to those powers.",
    ability: "Reason",
    modifier: 0,
    notes: "Two talent slots",
    grantsContact: null
  },
  "Heir to Fortune": {
    category: "Other Skills",
    star: true,
    effect: "Minimum Resources = Remarkable. Only at character creation.",
    ability: null,
    modifier: 0,
    notes: "Cannot be gained after generation. Don't take if Resources already Excellent or less.",
    grantsContact: null
  },
  "Student": {
    category: "Other Skills",
    star: true,
    effect: "No other initial talents. Learn new talents at discount: 1000 Karma from PC, 800 from outside. May maintain Talent advancement alongside other advancement.",
    ability: null,
    modifier: 0,
    notes: "Only at character creation.",
    grantsContact: null
  },
  "Leadership": {
    category: "Other Skills",
    star: true,
    effect: "Karma Pool gains 50 bonus points if recognized as team leader. Only one leader per pool. Points removed when leader leaves.",
    ability: null,
    modifier: 0,
    notes: "Two talent slots. Leader does not personally receive bonus points.",
    grantsContact: null
  }
};

// Contact Data with resources and specialties
export const CONTACT_DATA = {
  // Professional Contacts
  "Medicine": {
    type: "Professional",
    resourceRank: "Typical",
    specialty: "Medical advice and services, free or affordable",
    notes: "Doctor at hospital/clinic or researcher"
  },
  "Law": {
    type: "Professional",
    resourceRank: "Typical",
    specialty: "Legal assistance (reduced fee) and legal advice (free)",
    notes: "Lawyer, family retainer, or personal friend"
  },
  "Law-Enforcement": {
    type: "Professional",
    resourceRank: "Excellent",
    specialty: "Local/state police, national guard. Patrolman (Excellent knowledge of beat), Detective (Remarkable investigation), Captain/Commissioner (Remarkable resources)",
    notes: "Higher contact = more likely to request favors"
  },
  "Military": {
    type: "Professional",
    resourceRank: "Amazing",
    specialty: "Armed services contact. Ranges from sergeant to Joint Chiefs.",
    notes: "Maximum Amazing resources"
  },
  "Business World": {
    type: "Professional",
    resourceRank: "Incredible",
    specialty: "Business or finance contact. Accountant to captain of industry.",
    notes: "Maximum Incredible resources"
  },
  "Journalism": {
    type: "Professional",
    resourceRank: "Poor",
    specialty: "Media contact with Remarkable knowledge of their field. May have sources in law enforcement, politics, or criminal underworld.",
    notes: null
  },
  "Crime": {
    type: "Professional",
    resourceRank: "Remarkable",
    specialty: "Criminal underworld connection. Snitch to Maggia hierarchy.",
    notes: "WARNING: May put hero in Karma-losing situations. High-level (Remarkable+) may manipulate hero."
  },
  "Engineering": {
    type: "Professional",
    resourceRank: "Typical",
    specialty: "Someone who builds, independently or for corporation. Aid in device construction.",
    notes: null
  },
  "Psychiatry": {
    type: "Professional",
    resourceRank: "Typical",
    specialty: "Psychiatry or psycho-analysis background. May include criminal mind specialists.",
    notes: null
  },
  "Detective/Espionage": {
    type: "Professional",
    resourceRank: "Incredible",
    specialty: "FBI, CIA, NSA, KGB, Interpol, MI5, S.H.I.E.L.D., H.Y.D.R.A. Remarkable info, Incredible equipment (Amazing for S.H.I.E.L.D./H.Y.D.R.A.)",
    notes: "All agencies will request return favors"
  },
  "Hero Group": {
    type: "Professional",
    resourceRank: "Varies",
    specialty: "Connection to existing hero group. Use equipment, emergency calls, HQ, training.",
    notes: "Excessive liberties may revoke contact. Group enemies become hero's enemies."
  },
  "Artist/Performer": {
    type: "Professional",
    resourceRank: "Typical",
    specialty: "Similar to scientific contacts but for artistic fields.",
    notes: null
  },

  // Scientific Contacts
  "Chemistry": {
    type: "Scientific",
    resourceRank: "Good-Remarkable",
    specialty: "Chemistry expert, minimum Excellent Reason",
    notes: null
  },
  "Biology": {
    type: "Scientific",
    resourceRank: "Good-Remarkable",
    specialty: "Biology expert, minimum Excellent Reason",
    notes: null
  },
  "Geology": {
    type: "Scientific",
    resourceRank: "Good-Remarkable",
    specialty: "Geology expert, minimum Excellent Reason",
    notes: null
  },
  "Genetics": {
    type: "Scientific",
    resourceRank: "Good-Remarkable",
    specialty: "Genetics expert, minimum Excellent Reason",
    notes: null
  },
  "Archeology": {
    type: "Scientific",
    resourceRank: "Good-Remarkable",
    specialty: "Archeology expert, minimum Excellent Reason",
    notes: null
  },
  "Physics": {
    type: "Scientific",
    resourceRank: "Good-Remarkable",
    specialty: "Physics expert, minimum Excellent Reason",
    notes: null
  },
  "Computers": {
    type: "Scientific",
    resourceRank: "Good-Remarkable",
    specialty: "Computer expert, minimum Excellent Reason",
    notes: null
  },
  "Electronics": {
    type: "Scientific",
    resourceRank: "Good-Remarkable",
    specialty: "Electronics expert, minimum Excellent Reason",
    notes: null
  },

  // Political Contacts
  "Local Political": {
    type: "Political",
    resourceRank: "Good",
    specialty: "Alderman, mayor, councilman. Information on neighborhood.",
    notes: null
  },
  "State Political": {
    type: "Political",
    resourceRank: "Remarkable",
    specialty: "Governor's office, state representative, state agencies. Good services/info, Remarkable equipment.",
    notes: null
  },
  "National Political": {
    type: "Political",
    resourceRank: "Monstrous",
    specialty: "Congressional aide, congressman, representative, Executive Branch, federal agencies.",
    notes: "Higher contact = more likely to call in favors"
  },
  "Other National Political": {
    type: "Political",
    resourceRank: "Monstrous",
    specialty: "Foreign government contact. Friend or foe nation.",
    notes: "If known, may create difficulties with other political contacts"
  },
  "International Political": {
    type: "Political",
    resourceRank: "Monstrous",
    specialty: "UN or multi-national organization (Common Market, etc.)",
    notes: null
  },
  "Planetary Political": {
    type: "Political",
    resourceRank: "Unearthly+",
    specialty: "Contact on another planet. Aliens only.",
    notes: "Must be able to communicate to use resources"
  },

  // Mystic Contacts
  "Religion": {
    type: "Mystic",
    resourceRank: "Typical",
    specialty: "Religious organization or leader",
    notes: null
  },
  "Occult Lore": {
    type: "Mystic",
    resourceRank: "Remarkable",
    specialty: "Someone who 'dabbles' in darker arts. Remarkable Reason on mystic writings, spells, curses. Not necessarily a true magic-wielder.",
    notes: "Usually college professor or researcher"
  },
  "Mythology": {
    type: "Mystic",
    resourceRank: "Remarkable",
    specialty: "Expert on extra-dimensional beings known as gods (Olympians, Asgardians, etc.). Specializes in one pantheon.",
    notes: null
  }
};

// Limitation examples for powers that require them
export const LIMITATION_EXAMPLES = {
  "Probability Manipulation": [
    "Affects all targets in same area (Good or Bad)",
    "Only operates on FEATs involving non-living things",
    "No Karma may be gained in any encounter using this Power",
    "All associates suffer Bad Luck effects (Psyche FEAT weekly)",
    "Judge balances Good/Bad rolls (may modify critical rolls)"
  ],
  "Time Control": [
    "Power only works outside of atmosphere",
    "Power only works in below 0 temperature",
    "Power knocks hero unconscious for 1-10 rounds",
    "Power only functions in another dimension",
    "Power only functions on Astral Plane",
    "Power may be used once, period",
    "Power negates use of all other powers for one week",
    "Power only works at very high (200+) temperatures"
  ],
  "Precognition": [
    "Power is intermittent (Judge chooses when and what)",
    "Power only works on people (must touch)",
    "Power only works on objects (must hold/use)",
    "Power is extremely realistic (hero acts out vision)",
    "Power only manifests in dreams",
    "Power only operates once per image (until fulfilled)"
  ],
  "General": {
    "Excellent": [
      "Power limited to daytime use",
      "Power limited to nighttime use",
      "Power may only be used 3 times/day",
      "Power doesn't work below 0°F"
    ],
    "Remarkable": [
      "Power doesn't affect one type of material it normally would",
      "Power doesn't work near flame",
      "Power may only be used 2 times/day",
      "Power doesn't affect certain color"
    ],
    "Incredible": [
      "Power doesn't affect organic material",
      "Power doesn't affect inorganic matter",
      "Power requires vocal component",
      "Power cannot inflict less than Power rank damage",
      "Power requires two free hands"
    ],
    "Amazing": [
      "Power affects only one type of matter",
      "Power affects only one character type (demons, robots, mutants)",
      "Power only works once/week",
      "Power fails half the time (roll 5 or less on d10)"
    ],
    "Monstrous": [
      "Power only works outside atmosphere",
      "Power only works below 0°F",
      "Power knocks hero unconscious 1-10 rounds"
    ],
    "Unearthly": [
      "Power only functions in another dimension",
      "Power only functions on Astral Plane",
      "Power may be used once, period",
      "Power negates all other powers for one week",
      "Power only works at 200°F+"
    ]
  }
};

// Extra Body Parts options and their bonus powers
export const EXTRA_BODY_PARTS = {
  "Additional Arms": { bonusPower: "Extra Attacks" },
  "Additional Legs": { bonusPower: "Lightning Speed" },
  "Prehensile Tail": { bonusPower: "Climbing", notes: "Use as limb with normal Agility" },
  "Wings": { bonusPower: "Flight", modifier: "+1CS" },
  "Combat Tail": { bonusPower: null, effect: "Strength +1CS slugfest damage" },
  "Additional Eyes/Sensory Organs": { bonusPower: "Enhanced Senses or any detection Power" },
  "Claws (body part)": { bonusPower: "Claws", modifier: "+1CS material strength" },
  "Spines": { bonusPower: "Projectile Missile", modifier: "+1CS" }
};

// Growth height table
export const GROWTH_TABLE = [
  { rank: "Feeble", height: "8 feet", hitMod: "+1CS" },
  { rank: "Poor", height: "10 feet", hitMod: "+1CS" },
  { rank: "Typical", height: "12 feet", hitMod: "+1CS" },
  { rank: "Good", height: "14 feet", hitMod: "+1CS" },
  { rank: "Excellent", height: "16 feet", hitMod: "+1CS" },
  { rank: "Remarkable", height: "18 feet", hitMod: "+2CS" },
  { rank: "Incredible", height: "20 feet", hitMod: "+2CS" },
  { rank: "Amazing", height: "22 feet", hitMod: "+2CS" },
  { rank: "Monstrous", height: "25 feet", hitMod: "+3CS" },
  { rank: "Unearthly", height: "30 feet", hitMod: "+3CS" },
  { rank: "Shift-X", height: "40 feet", hitMod: "+3CS" },
  { rank: "Shift-Y", height: "50 feet", hitMod: "+3CS" },
  { rank: "Shift-Z", height: "100 feet", hitMod: "+3CS" }
];

// Shrinking size table
export const SHRINKING_TABLE = [
  { rank: "Feeble", height: '48" (1/2)', hitMod: "0" },
  { rank: "Poor", height: '24" (1/4)', hitMod: "0" },
  { rank: "Typical", height: '12" (1/8)', hitMod: "0" },
  { rank: "Good", height: '6" (1/16)', hitMod: "+1CS" },
  { rank: "Excellent", height: '3" (1/32)', hitMod: "+1CS" },
  { rank: "Remarkable", height: '1" (1/100)', hitMod: "+2CS" },
  { rank: "Incredible", height: '.5" (1/200)', hitMod: "+2CS" },
  { rank: "Amazing", height: '.25" (1/400)', hitMod: "+2CS" },
  { rank: "Monstrous", height: '.1" (1/1000)', hitMod: "+3CS" },
  { rank: "Unearthly", height: '.01" (1/10000)', hitMod: "+3CS" },
  { rank: "Shift-X+", height: "Microverse", hitMod: "Special" }
];

// Wall-crawling surface difficulty
export const WALL_CRAWLING_SURFACES = [
  { rank: "Feeble", surface: "Ordinary Concrete, Ordinary Brickwork" },
  { rank: "Typical", surface: "Glass and Steel" },
  { rank: "Good", surface: "Steel Alloys" },
  { rank: "Remarkable", surface: "Surface Coated with Oil" },
  { rank: "Incredible", surface: "Non-stick Surfaces" },
  { rank: "Class 1000", surface: "Frictionless Surfaces" }
];

// Emotion types for Emotion Control
export const EMOTION_TYPES = [
  { name: "Respect", effect: "Target treats individual as Friendly Contact" },
  { name: "Love", effect: "Target devoted to individual, will endanger own life" },
  { name: "Fear", effect: "Target flees, only attacks if cornered" },
  { name: "Hatred", effect: "Target attacks former friends and allies" },
  { name: "Loyalty", effect: "Target follows orders without question, provides info and aid" },
  { name: "Doubt", effect: "Target unsure of actions, Intuition treated as Good (10) for actions" },
  { name: "Pleasure", effect: "Target cannot act for 1-10 rounds, then Friendly to hero" }
];
