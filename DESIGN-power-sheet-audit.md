# DESIGN — Edit Power UI Audit

Audit of `templates/power-sheet-v2.html` against the FASERIP Advanced Set
Players' Book Powers chapter (pp. 71–87) and the schema in `template.json`.

The legacy `templates/power-sheet.html` is **not** audited per-section
(see "Legacy sheet" at the end for a separate retirement recommendation).

Status tags used throughout:

- **exposed** — field has a UI control in a section the user can reasonably find
- **hidden** — schema field exists but UI control is gated behind a non-obvious toggle
- **missing** — rulebook mechanic exists but no schema field models it
- **wrong-range** — control exists but allowed values don't cover the rulebook's range
- **confusing** — control exists but its label, grouping, or behavior misleads
- **redundant** — schema flag exists alongside a runtime detection path that ignores it

---

## 1. Methodology and taxonomy

The Players' Book has 10 power categories. The `system.category` dropdown in
v2 matches them exactly:

```
resistances, senses, movement, matterControl, energyControl, bodyControl,
distanceAttacks, mentalPowers, bodyAlterationsOffensive, bodyAlterationsDefensive
```

`scripts/rules/rules-reference.js` uses a slightly different set of keys
(`bodyOffensive` / `bodyDefensive` without "Alterations", and groups
Force Field Generation under `mental`). This mismatch is itself an issue,
called out under cross-cutting findings.

For this audit the v2 dropdown is treated as canonical because it's the
user-facing taxonomy. Where rules-reference disagrees it's flagged.

---

## 2. Cross-cutting findings

These patterns recur across categories and are easier to fix once than
inside each section.

### 2.1 `system.category` is decorative; sections gate on flags

Picking a category does nothing automatic. To get a Body Armor power's
fields, the user has to:

1. Set Category = "Body Alt / Defensive"
2. Tick `isDefensePower`
3. Tick `isBodyArmor` (subsection)
4. Fill Type, Nature, Physical, Energy

Three of those four steps are not signaled by the category. The same is
true for Resistance, Force Field, Energy Reflection, every Healing
sub-flag, Life Support, every Movement type, every Control type, every
Mental sub-flag, every Transformation type.

**Recommendation:** treat `system.category` as a *defaulter*. When the
user changes category, set the relevant section toggles and a sensible
defaulttransformType / controlType / detection field. Don't block the user
from overriding, but pre-light the right fieldset.

### 2.2 Flag-redundancy with name detection

Per the claws handoff: `isBodyArmor` / `isForceField` are decorative
because `defense-effects.js` v1.4.0 falls back to name detection
(`looksLikeDefensivePower`). The flag exists, the runtime ignores it. Likely
candidates for the same pattern:

- `isResistance` — does anything actually check it, or do name patterns
  ("Resistance to Fire", "Invulnerability to Cold") drive runtime?
- `isEnergyReflection` — same question
- `isAttackPower` — likely real (drives whole Attack section gating)
- `isDefensePower` — likely real (drives whole Defense section gating)
- `isMagic` — drives magic section gating; runtime usage unknown
- `isHealingPower` — drives healing section gating; runtime usage unknown
- `isLifeSupport`, `isImmortality`, `isDamageTransfer`, `hasRecoveryPower`,
  `absorptionConvertsToHealth`, `absorptionCanRedirect` — boolean flags in
  Healing section; verify each has a runtime consumer

**Recommendation:** audit each `is*` flag's runtime usage. For any flag
that's redundant with name/category detection, either (a) make it
authoritative and drop name fallback, or (b) drop the flag and rely on
name + category. Mixed is the worst state because it accumulates legacy
toggles users still see.

### 2.3 Rank-dropdown ceilings

Per handoff, three were extended to Beyond (claw / TK / ensnaring).
Remaining ceilings in v2:

| Control | Range | File line |
|---|---|---|
| `system.limitation.maxRank` | Excellent … Unearthly | 805–813 |
| `system.specialStrengthType=tk` ranks | Feeble … Beyond ✓ | 215 |
| `system.specialStrengthType=ensnare` ranks | Feeble … Beyond ✓ | 222 |
| `system.specialStrengthType=claw` ranks | Typical … Beyond ✓ | 208 |
| `system.rank` (top-level) | uses `rankListFull` partial | 53 |

`limitation.maxRank` capping at Unearthly is the only remaining UI
ceiling issue. CL1000+ characters whose powers cap out at a limitation
can't represent it. **Recommendation:** extend to Beyond.

### 2.4 Source vs armorNature mismatch

Per DESIGN-material-strength.md §7.6 and the handoff: `Source` (natural /
equipment / mystical) and `armorNature` (natural / artificial) are
independent fields the user must keep in sync manually. Source =
Equipment with armorNature = Natural is inconsistent and silently
breaks claws / shred / penetration FEAT logic.

**Recommendation:** when the user sets Source = Equipment or ticks
`grantedByEquipment`, default `armorNature` to "artificial" if unset.
Same direction for Source = Natural. Allow override (a custom
"natural body armor from a magic suit" is conceivable).

### 2.5 `system.area` is in the schema but never exposed in v2

`system.area: 0` in template.json (line 315). No UI control in v2.
Rulebook calls for area-based effects throughout:

- Force Field Generation: areas = floor(rank# / 10), -1CS per area beyond first
- Darkforce Generation / Darkforce Manipulation: 3 areas of darkness
- Earthquake stunt, Air shield, Water shield, Animate Objects range
- Light Manipulation: "burst affecting all targets in same area"
- Sound Generation wide-band stunt: "all in given area"
- Emotion Control: "same area" range constraint

**Recommendation:** add an "Areas" numeric field to the Rank & Identity
fieldset or to whichever section the power belongs to.

### 2.6 `system.save.fixedRank` is in the schema but never exposed

When the user picks Save Intensity = "Fixed" (line 384), the input for
the actual fixed rank value never appears. Schema has
`system.save.fixedRank: ""` (line 334).

**Recommendation:** conditional rank select when `save.intensity === "fixed-rank"`.

### 2.7 Power Stunts are unstructured

Per the FASERIP memory note (TODO): "Split power stunts out of
description prose into structured data". Nearly every Players' Book
power lists 3–8 specific Power Stunts. They live as freeform text in
description right now. Default Power Stunts per power name aren't
modeled; existing-known-stunts aren't queryable.

This is its own design effort — keep out of scope here, but note that
the audit would change if stunts get a structured field.

### 2.8 `magic.school` taxonomy is non-FASERIP

Lines 752–760 list D&D-style schools: Alteration, Conjuration,
Divination, Enchantment, Evocation, Illusion, Necromancy, Protection.
None of these terms appear in the Marvel rules. The actual FASERIP magical
taxonomy is the three Origins of Magic (personal / universal / dimensional)
already captured in `magic.energyType`, plus Spell Effects (per
`SPELL_EFFECTS` in rules-reference.js).

**Recommendation:** either drop the school dropdown, or replace its options
with FASERIP-canon spell categories. The dimensional `sourceEntity` field
(line 783) is the right direction; do that consistently.

### 2.9 Naming inconsistency: dropdown vs rules-reference

UI: `bodyAlterationsOffensive`, `bodyAlterationsDefensive`
rules-reference.js: `bodyOffensive`, `bodyDefensive`
MAGIC_POWERS map: `bodyDefensive` (defense), `mental` (force field, etc.)

This affects any code that looks up category descriptions or iterates
canonical power lists. **Recommendation:** pick one, migrate the other.
Suggest `bodyAlterationsOffensive` / `bodyAlterationsDefensive` since
they're more descriptive and already user-visible.

---

## 3. Resistances

**Powers in this category** (rulebook pp. 71): Resistance to Fire/Heat,
Cold, Electricity, Radiation, Toxins, Corrosives, Emotion Attacks,
Mental Attacks, Magical Attacks, Disease, plus Invulnerability.

**UI location:** Defense fieldset → Resistance subsection (lines 297–336),
gated by `isDefensePower` + `isResistance`.

### Schema → UI mapping

| Field | UI | Status |
|---|---|---|
| `isResistance` | sub-toggle line 299 | exposed, possibly redundant |
| `resistanceType` (fire/cold/electricity/…) | dropdown 304–309 | exposed |
| `resistanceEffect` (damageReduction/immunity/columnShift/featNegate/featReplace) | dropdown 312–319 | exposed but **confusing** |
| `resistanceIsInvulnerability` | checkbox 323 | exposed |
| `resistanceIsConductive` | checkbox 324 | exposed (relevant only for electrical) |
| `resistanceMinRank` (endurance+1 / intuition+1 / psyche+1) | dropdown 328–333 | exposed |

### Issues

1. **resistanceEffect dropdown is overloaded.** Rulebook describes only
   two real behaviors: (a) reduce damage by rank# and ignore intensity
   below rank (the standard Resistance rule), and (b) Invulnerability
   (Class 1000 against that attack). The five options
   (damageReduction / immunity / columnShift / featNegate / featReplace)
   confuse this. Resistance to Emotion Attacks isn't "+CS to resist"
   — it's "use this rank instead of Intuition for resist FEAT". That's
   `featReplace`, but a user wouldn't know which one to pick.
   **Recommendation:** rewrite the dropdown to match rulebook idioms:
   `damageReduction` (default), `featReplace` (used for toxin / emotion /
   mental / magical / disease — auto-derived from `resistanceType`),
   `invulnerability` (folds in the `resistanceIsInvulnerability` flag).

2. **`resistanceMinRank` is hidden in the wrong context.** It auto-bumps
   rank to Endurance+1 / Intuition+1 / Psyche+1 for Toxin/Disease/Emotion/
   Mental. But the user has to pick it manually from a dropdown that
   doesn't tell them which resistance type requires which bump.
   **Recommendation:** when `resistanceType` is set to one of toxin /
   disease / emotion / mental, set the right `resistanceMinRank`
   automatically. Hide the control unless the user wants to override.

3. **No type-specific UI variations.**
   - Resistance to Electricity: `resistanceIsConductive` only meaningful here
     — should hide for other types.
   - Resistance to Cold: rulebook notes ice-as-physical-object still
     affects the character; no flag for this nuance.
   - Resistance to Radiation: rulebook excludes concussive energy attacks.
     No way to express the included/excluded distinction.

4. **Category dropdown says "Resistances" but the UI is buried two
   toggles deep.** Picking Category = Resistances should tick
   `isDefensePower` + `isResistance` automatically.

### Schema gaps

- **Multiple resistances in one power.** Bullet from the rulebook:
  "Resistance to Toxins is a minimum of Endurance +1CS". Schema models
  one `resistanceType` per power. The character book treats each
  resistance as its own Power slot, so one Item per resistance is fine
  *unless* the user wants Hercules-style "Resistance to all damage".
  No urgent gap.
- **Invulnerability rank-bump record.** When invulnerability is taken,
  rulebook says it costs 2 power slots initially. `countsAsTwoPowers`
  is in schema (line 360) but the UI doesn't auto-tick it when
  `resistanceIsInvulnerability` is set.

---

## 4. Senses

**Powers in this category** (rulebook pp. 71–72): Protected Senses,
Enhanced Senses, Infravision, Cosmic Awareness, Combat Sense,
Computer Links, Emotion Detection, Energy Detection, Magic Detection,
Magnetic Detection, Mutant Detection, Psionic Detection,
Astral Detection, Tracking Ability.

**UI location:** Detection / Senses fieldset (lines 422–477), **always
visible** — no toggle gate.

### Schema → UI mapping

| Field | UI | Status |
|---|---|---|
| `detection.enhancedSense` (sight/hearing/smell/touch/taste) | dropdown 428–435 | exposed |
| `detection.protectedSense` (sight/hearing/smell/all) | dropdown 438–445 | exposed, missing "touch"/"taste" options |
| `detection.detectionType` (energy/life/magic/mutant/psionic/radiation/emotion/astral/magnetic) | dropdown 449–460 | exposed |
| `detection.infravisionRange` | number input 463 | exposed |
| `detection.combatSense` | checkbox 468 | exposed |
| `detection.cosmicAwareness` | checkbox 469 | exposed |
| `detection.precognition` | checkbox 470 | exposed |
| `detection.postcognition` | checkbox 471 | exposed |
| `detection.computerLinks` | checkbox 472 | exposed |
| `detection.mechanicalIntuition` | checkbox 473 | exposed in Senses section, **conceptually a Mental Power** |
| `detection.canTrack` | checkbox 474 | exposed |

### Issues

1. **Section is always visible regardless of category.** A Force-Field
   power shows the Detection section even when irrelevant. Either gate
   on category = senses, or add an explicit `isSensePower` toggle for
   symmetry with attack/defense/healing/magic.

2. **`detection.protectedSense` is missing touch/taste options.** Rulebook
   lists all five senses as protectable in principle (knock-out gas via
   smell, contact traps via touch, etc.). Dropdown only offers
   sight/hearing/smell/all.

3. **`mechanicalIntuition` is in the wrong section.** Rulebook lists it
   under Mental Powers, as "a specific form of Ultimate Skill". Move to
   Mental section.

4. **Energy Detection has no sub-type field.** Rulebook: "identify
   specific 'type' of energy (particles, x-rays, light, exhaust of a
   nuclear engine, etc.) with Power rank ability". Schema has no
   `detection.detectionSpecific` for "type of energy I detect".

5. **No FEAT-color hint per detection type.** Rulebook gives green/yellow
   distinctions for Psionic Detection (checking vs not), Magic
   Detection (recognition/individuals/spell-type), Tracking (loss
   conditions). These are runtime logic, not necessarily UI fields, but
   the Notes field is the only place to put them currently.

### Schema gaps

- **Cosmic Awareness range / FEAT mechanics.** Rulebook gives "Class 1000+
  abilities within 10 miles always noticed". No range or FEAT-bonus
  field on the schema; tracked only by the boolean.
- **Combat Sense replacement-FEAT logic** ("instead of Intuition/Fighting/
  Agility/Strength"). The `abilitySubstitution` block (lines 480–493)
  could already capture this — but the Combat Sense flag and the
  ability-substitution rows are independent, not linked.
- **Tracking Ability sub-modes.** Rulebook gives scent / heat-trail /
  visual examples. No schema field for "tracking method".
- **Infravision range falls back to 5 areas in normal darkness**, not
  rank. Schema `infravisionRange` is open. Could default to 5 on tick.

---

## 5. Movement

**Powers in this category** (rulebook pp. 72–73): Flight, Gliding,
Leaping, Wall-Crawling, Lightning Speed, Teleportation, Levitation,
Swimming, Climbing, Digging, Dimensional Travel.

**UI location:** Movement fieldset (lines 496–527), **always visible**.

### Schema → UI mapping

| Field | UI | Status |
|---|---|---|
| `movement.type` (flight/gliding/levitation/leaping/super-speed/teleportation/swimming/climbing/tunneling/wall-crawling/dimensional) | dropdown 502–515 | exposed |
| `movement.areasPerRound` | number 519 | exposed |
| `movement.useRankSpeed` | checkbox 523 | exposed |
| `movement.leavesTunnel` | checkbox 524 | exposed (digging only) |

### Issues

1. **Section always visible.** Same problem as Senses — even a Body Armor
   power shows the Movement section. Gate on category or add
   `isMovementPower` toggle.

2. **Naming: "super-speed" vs Lightning Speed.** Internal value is
   `super-speed`, display label is "Lightning Speed". Cosmetic only;
   worth aligning so grep finds it.

3. **`leavesTunnel` only relevant for tunneling/digging** but appears
   alongside every movement type. Conditional render.

4. **No leaping table integration.** Rulebook: Leaping = Strength +1CS
   minimum, uses leaping table from Ch. 2. Schema has no
   `movement.leapTable` or auto-bump. Same for Lightning Speed
   (Endurance +1CS minimum) and Solar Regeneration (Endurance +1CS
   minimum).

5. **No "carries others" field for Teleportation.** Rulebook:
   "may carry either all individuals in his area or someone the hero is
   touching up to his Strength limitations (this decision must be
   made when the character is created)". Should be a
   `movement.teleportCarry: "area" | "touched"` field.

6. **No "dimensions accessible" field for Dimensional Travel.** Rulebook:
   character starts with one dimension; gaining more is a Power Stunt.
   Schema has no list field.

### Schema gaps

- **Carry limit for teleportation** (above).
- **Wall-Crawling slipperiness vs adhesion strength.** Rulebook table:
  Feeble = ordinary concrete, Class 1000 = frictionless. No schema
  field for "what counts as adherable" — Notes field only.
- **Gliding drop ratio** (1 story per turn) — fixed by rules, no field
  needed unless variants exist.
- **Lightning Speed minimum-rank enforcement** (= Endurance +1CS).
- **Leaping minimum-rank enforcement** (= Strength +1CS).
- **Dimensional Travel destinations list** (above).
- **Method-of-flight free-text field** (the rulebook explicitly tells
  players to define wings/rockets/graviton — currently lives in
  description prose only).

---

## 6. Matter Control

**Powers in this category** (rulebook pp. 73–75): Earth Control, Air
Control, Fire Control, Water Control, Weather Control, Animate Objects,
Density Manipulation (Others), Body Transformation (Others), Animal
Transformation (Others).

**UI location:** Control / Manipulation fieldset (lines 530–570) for the
elemental controls and Animate Objects; **Transformation** fieldset
(lines 617–676) for Density / Body / Animal Transformation Others.

### Schema → UI mapping (Control section)

| Field | UI | Status |
|---|---|---|
| `control.controlType` (air/earth/fire/water/electricity/magnetism/light/darkforce/gravity/sound/plant/weather/time/probability/nullifying/animate) | dropdown 536–554 | exposed but **mixes Matter and Energy controls** |
| `control.controlSpecific` | text 558 | exposed |
| `control.manipulateExisting` | checkbox 562 | exposed |
| `control.generateNew` | checkbox 563 | exposed |
| `control.useAsShield` | checkbox 564 | exposed |
| `control.useAsWeapon` | checkbox 565 | exposed |
| `control.createConstructs` | checkbox 566 | exposed |
| `control.animateObjects` | checkbox 567 | exposed, **redundant** with `controlType = "animate"` |

### Issues

1. **Control type dropdown collapses Matter and Energy controls into one
   list.** Air/earth/fire/water/weather/plant are Matter Control;
   electricity/magnetism/light/darkforce/gravity/sound/time/probability/
   nullifying are Energy Control. The UI uses the same dropdown for
   both. This is a real conflation problem: if the user sets
   Category = Matter Control and ControlType = electricity, what does
   the system do? Recommend splitting `controlType` by category and/or
   filtering options to match category. Alternatively, leave them
   unified but accept that `system.category` is purely metadata.

2. **`control.animateObjects` checkbox is redundant** with
   `controlType = "animate"`. Pick one. If keeping checkbox, drop the
   "animate" controlType option.

3. **No per-controlType subsection.** Rulebook gives type-specific
   constraints:
   - Earth Control: "limited to naturally occurring materials (dirt,
     rock, stone), or semi-natural (concrete, asphalt, glass). Steel
     alloys / vehicles / living things beyond scope." No schema field
     for "what materials" — controlSpecific is freeform.
   - Air Control: starts with 1 Power Stunt — no field.
   - Fire Control: cannot affect distant targets without Distance
     Attacks > Fire Generation — no schema-level constraint.
   - Weather Control: stunts cost 50 Karma not 100 — no schema field.
   - Animate Objects: cannot animate > rank material strength or
     > liftable weight — no schema field.

4. **Use-as-shield / Use-as-weapon / Create-constructs / Animate-objects
   are all "default starting stunt" categories.** Rulebook awards 1
   starting stunt for some controls (Air, Darkforce, Gravity, Fire).
   These checkboxes don't link to a "starting stunt" concept.

### Transformation section (used for Matter Control's Others variants)

| Field | UI | Status |
|---|---|---|
| `transformation.affects` (self/others/both) | dropdown 622–627 | exposed |
| `transformation.transformType` (body/animal/density/shape/imitation/phasing/size/plasticity/elongation/invisibility/blending) | dropdown 631–644 | exposed but **mixes Matter Control transforms and Body Control transforms** |
| `transformation.targetMaterial` | text 647 | exposed |
| `transformation.targetResistsWith` (psyche/endurance) | dropdown 654–658 | exposed |
| `transformation.duration` (concentration/rounds/hour/permanent) | dropdown 661–668 | exposed |
| `transformation.touchRequired` | checkbox 671 | exposed |
| `transformation.retainsMental` | checkbox 672 | exposed |
| `transformation.retainsPowers` | checkbox 673 | exposed |

### Issues (Transformation section)

5. **transformType mixes Matter Control "Others" with Body Control "Self"
   transforms.** The rulebook splits these clearly: Body Transformation
   (Others) and Animal Transformation (Others) and Density Manipulation
   (Others) live under Matter Control; the same-named (Self) variants
   plus Shape-Shifting/Imitation/Phasing/Plasticity/Elongation/
   Invisibility/Blending/Growth/Shrinking live under Body Control. The
   UI lets the user pick `transformType = "size"` (which is Body Control)
   with `affects = "others"` (which doesn't exist for size in the
   rulebook). **Recommendation:** filter `transformType` by
   `transformation.affects` selection, or by category.

6. **No size table for Growth/Shrinking.** Rulebook gives rank-by-rank
   tables for max height, +CS to hit, column-shift modifiers vs
   larger/smaller foes. Schema has no `transformation.sizeRank` or
   derived "+CS to be hit" / "-CS to be hit by larger foes" fields.

7. **No body-transformation +CS bonuses.** Rulebook: "+1CS if confines
   body transformation to one state (solid/liquid/gas/energy), +2CS if
   limits to particular substance". No schema field captures this.

### Schema gaps (Matter Control)

- **Animate Objects max material strength** (= rank).
- **Earth Control material-list whitelist.**
- **Weather Control half-karma stunt rule.**
- **Fire Control distance restriction** (must develop stunt for ranged).
- **Density Manipulation Others duration** (1-10 rounds explicit).
- **Body Transformation Others non-living -2CS option.**
- **Animal Transformation Others retains-Powers flag** (already in
  schema as `transformation.retainsPowers` — covers it).

---

## 7. Energy Control

**Powers in this category** (rulebook pp. 75–77): Magnetic Manipulation,
Electrical Manipulation, Light Manipulation, Sound Manipulation,
Darkforce Manipulation, Gravity Manipulation, Probability Manipulation,
Nullifying Power, Energy Reflection, Time Control.

**UI location:** mostly Control / Manipulation fieldset (shared with
Matter Control); Energy Reflection has its own subsection in Defense
(lines 339–356). Time Control has no dedicated UI.

### Schema → UI mapping

Same `control.*` fields as section 6 (Matter Control). Energy Reflection
has its own block:

| Field | UI | Status |
|---|---|---|
| `isEnergyReflection` | toggle 340 | exposed |
| `energyReflectionType` | text 345 | exposed (free-form) |
| `energyReflectionRank` (full/rank/minus1) | dropdown 349–353 | exposed |

### Issues

1. **Energy Reflection lives in Defense, not Energy Control.** Defensible
   — it functions defensively. But a user looking under Category =
   Energy Control with `isAttackPower=false` won't naturally find it.
   Either expose a link/badge from the Energy Control area, or move the
   subsection up under the Energy Control category header.

2. **Probability Manipulation has no schema model.** Rulebook gives a
   specific Good Luck / Bad Luck / Both table (01-50 / 52-90 / 91-100
   roll), and requires the player to take one of several specific
   limitations (affects all-in-area / no Karma / teammates suffer / etc.).
   The Control section's `controlType = "probability"` is the only
   touchpoint, with no sub-fields.

3. **Time Control has no schema model.** Counts-as-two-Powers and
   automatic-limitation are partially covered by `countsAsTwoPowers` and
   `isLimited` checkboxes, but the specific Time Control stunts
   (lightning-speed-from-time / slow-area / slow-for-injured / time-travel
   / summon-duplicates) have no fields.

4. **Nullifying Power has no Power-vs-Tech distinction.** Rulebook: works
   against inborn super-human Powers only, not Technology or Magic.
   The Distance Attacks > Nullifier Missile *does* have a type
   distinction (Psyche FEAT for inborn vs Reason FEAT for tech). But the
   Energy Control > Nullifying Power has no such field. Could share
   schema.

5. **Light Manipulation burst-vs-line.** Rulebook: "burst (affecting all
   in same area) or line (single target)". No schema field.

6. **Darkforce Manipulation / Generation overlap.** Rulebook lists
   Darkforce Generation under Distance Attacks (with a distinct
   "create darkness in 3 areas" extra stunt). Darkforce Manipulation
   under Energy Control is the same power minus the missile/distance
   component. Schema has no way to express "is this Darkforce Gen or
   Manipulation" — relies on user picking a category + ticking
   `isAttackPower`.

### Schema gaps (Energy Control)

- **Probability Manip mode** (good / bad / both).
- **Probability Manip limitation type** (specific enumerated list).
- **Time Control stunts** (5+ canonical options).
- **Nullifying Power target-type** (inborn / tech / magic).
- **Light Manipulation burst-or-line.**
- **Magnetic Manip ferrous-only flag** (Power Stunt to overcome).
- **Electrical Manip stored-charge tracking** (Stunt: shocking touch).

---

## 8. Body Control

**Powers in this category** (rulebook pp. 77–79): Growth, Shrinking,
Density Manipulation (Self), Phasing, Invisibility, Plasticity,
Elongation, Shape-Shifting, Imitation, Body Transformation (Self),
Animal Transformation (Self), Raise Lowest Ability, Blending,
Power Absorption, Alter Ego.

**UI location:** Transformation fieldset (lines 617–676), **always
visible**, paired with `transformation.affects = "self"`.

### Schema → UI mapping

Same as Transformation block in section 6. Most Body Control powers
flow through `transformation.transformType`.

### Issues

1. **Raise Lowest Ability, Power Absorption, and Alter Ego have no
   transformType option.** All three are listed in the rulebook Body
   Control section but the dropdown (lines 631–644) doesn't include
   them.

2. **No "Power Absorption type" field.** Rulebook: must specify Powers
   only / Talents only / Abilities only / all; with FEAT type
   (Psyche or Endurance) decided at character creation.

3. **No Alter Ego sub-record.** Rulebook: separate Karma, separate
   Popularity split, separate Contacts, optional 1-10 round
   transformation. This wants its own structured sub-object.

4. **Density Manipulation Self has no `densitySelf.currentDensity`
   field.** Rulebook: density may range from Shift 0 (intangible) to
   rank. A character switches between settings each round. Schema
   models the power's rank but not a current setting.

5. **Phasing has no breath-holding duration field.** Rulebook: max phase
   duration = how long character can hold breath.

6. **Growth/Shrinking column-shift table not modeled.** Rulebook tables:
   Growth at Feeble = +1CS, Remarkable+ = +2CS, Monstrous+ = +3CS.
   Schema has no derived bonus.

### Schema gaps

- **Power Absorption mechanics** (type, FEAT choice, max-acquired count).
- **Alter Ego sub-object.**
- **Density Self current-setting selector.**
- **Phasing breath duration.**
- **Growth / Shrinking size table derived fields.**
- **Shape-Shifting size limits** (half to 1.5x original).
- **Imitation popularity transfer flag.**

---

## 9. Distance Attacks

**Powers in this category** (rulebook pp. 79–80): Projectile Missile,
Ensnaring Missile, Ice Generation, Fire Generation, Energy Generation,
Sound Generation, Stunning Missile, Corrosive Missile, Slashing Missile,
Nullifier Missile, Darkforce Generation.

**UI location:** Attack fieldset (lines 122–231), gated by
`isAttackPower`. Damage type goes in the `damageType` dropdown
(lines 159–179) which has eight `energy-*` and four `touch-*` options
plus `physical-blunt/edged`, `corrosive`, `mental`.

### Schema → UI mapping

| Field | UI | Status |
|---|---|---|
| `isAttackPower` | toggle 125 | exposed |
| `battleEffectsColumn` (BA/EA/S/TE/TB/En/Fo/Ch/Gp/Gb) | dropdown 133–145 | exposed |
| `damageSource` (rank/strength/endurance/material/fixed) | dropdown 149–155 | exposed |
| `damageType` (long list) | dropdown 159–179 | exposed |
| `damage` (fixed value) | number 183 | exposed when `damageSource=fixed` |
| `canPullPunch` | checkbox 187 | exposed |
| `canReduceEffect` | checkbox 188 | exposed |
| `armorPiercing` | checkbox 189 | exposed |
| `extraAttacks` | checkbox 190 | exposed (in Attack section, but it's a Body Offensive power) |
| `specialStrengthType` (claw/tk/ensnare) | dropdown 195–200 | exposed |
| `clawMaterialStrength` | rank dropdown 206–211 | exposed, Beyond ✓ |
| `telekinesisStrength` | rank dropdown 213–218 | exposed, Beyond ✓ |
| `ensnaringStrength` | rank dropdown 220–225 | exposed, Beyond ✓ |
| `ignoresNaturalArmor` | (no UI control) | **hidden** |
| `ignoresArtificialArmor` | (no UI control) | **hidden** |
| `bypassForceField` | (no UI control on power sheet) | **hidden** |
| `continuingDamage` | checkbox 105 (Rank section) | exposed but in wrong section |
| `continuingDamageRounds` | conditional 116 | exposed |

### Issues

1. **`ignoresNaturalArmor` / `ignoresArtificialArmor` / `bypassForceField`
   are schema fields with no UI control.** Per claws handoff §7.6 and
   `mitigation.js` v3.2.0, the damage pipeline reads these flags but no
   UI surfaces them. Add three checkboxes near `armorPiercing`.

2. **`continuingDamage` lives in Rank & Identity, not Attack.** Per
   rulebook it's a Corrosive Missile mechanic ("Power rank damage round 1,
   rank-2CS round 2, rank-4CS round 3"). Belongs in Attack.

3. **`extraAttacks` checkbox in Attack section is misleading.** Extra
   Attacks is a Body Alteration (Offensive) power, not a Distance Attack
   modifier. The checkbox should not be in this fieldset, or should be
   labeled to indicate it's a permanent extra-action grant.

4. **No "stun intensity" field for stunning powers.** Rulebook: Stunning
   Missile, Sound Generation stun stunt, Darkforce Generation. Schema has
   `system.save.intensity = power-rank` which kinda covers it, but the
   user has to wire up the Target Save section manually.

5. **Ensnaring Missile limitations not modeled.** Rulebook offers four
   specific +1CS limitations: single target / wears off 1-10 rounds /
   weakens one rank per turn / limited charges. The generic
   `system.isLimited` + `system.limitations` text field is the only
   touchpoint.

6. **Ice Generation: no body-armor-from-ice flag.** Rulebook gives
   "BA at rank -1CS, vulnerable to fire (+1CS to hit/dmg)". Currently a
   Power Stunt with no schema home.

7. **Corrosive Missile decay schedule unmodeled.** Schema has
   `continuingDamageRounds = 3` (good!) but no per-round damage curve
   (round 1: rank, round 2: rank-2CS, round 3: rank-4CS).

8. **Darkforce Generation create-darkness stunt unmodeled.** No
   `darknessAreas` field.

### Schema gaps

- **ignoresArmor / bypassForceField UI controls** (the schema is fine).
- **Continuing-damage decay curve** (or accept that it's hardcoded for
  Corrosive Missile).
- **Stunning attack target intensity** (could reuse save.intensity).
- **Ensnaring limitation enum.**
- **Darkforce darkness-area count.**
- **Ice/Fire shield child stunt** with armor rank / vulnerability flag.

---

## 10. Mental Powers

**Powers in this category** (rulebook pp. 81–85): Ultimate Skill,
Telepathy, Image Generation, Telekinesis, Mind Control, Emotion
Control, Force Field Generation, Animal Communication & Control,
Mechanical Intuition, Empathy, Animal Empathy, Psi-Screen, Mental
Probe, Animate Drawings, Possession, Transferral, Astral Projection,
Psionic Attack, Precognition, Postcognition, Plant Control.

**UI location:** Mental / Psionic fieldset (lines 573–614), **always
visible**. 13 of the 21 powers have checkbox flags. Force Field
Generation lives in Defense (section 11 below). Plant Control lives
under Control with `controlType = "plant"`. Precognition and
Postcognition live in Detection. Mechanical Intuition lives in
Detection. Animal Communication lives nowhere obvious.

### Schema → UI mapping

| Field | UI | Status |
|---|---|---|
| `mental.telepathy` | checkbox 577 | exposed |
| `mental.mentalProbe` | checkbox 578 | exposed |
| `mental.mindControl` | checkbox 579 | exposed |
| `mental.emotionControl` | checkbox 580 | exposed |
| `mental.empathy` | checkbox 581 | exposed |
| `mental.psiScreen` | checkbox 582 | exposed |
| `mental.imageGeneration` | checkbox 583 | exposed |
| `mental.possession` | checkbox 584 | exposed |
| `mental.astralProjection` | checkbox 585 | exposed |
| `mental.psionicAttack` | checkbox 586 | exposed |
| `mental.transferral` | checkbox 587 | exposed |
| `mental.animateDrawings` | checkbox 588 | exposed |
| `mental.pheromones` | checkbox 589 | exposed, **conceptually a Body Alteration (Defensive)** |
| `mental.emotionType` | dropdown 596–605, gated by emotionControl | exposed |
| `mental.singleEmotionBonus` | checkbox 608 | exposed |
| Ultimate Skill | (no field) | **missing** |
| Animal Communication & Control | (no field) | **missing** |
| Animal Empathy | (no field) | **missing** |
| Force Field Generation | in Defense subsection (line 279) | exposed elsewhere |
| Plant Control | in Control dropdown | exposed elsewhere |
| Mechanical Intuition | in Detection checkboxes | exposed in wrong section |
| Precognition / Postcognition | in Detection checkboxes | exposed in wrong section |

### Issues

1. **Pheromones is misclassified.** Rulebook lists it under Body
   Alterations — Defensive. v2 schema puts it under `mental.*`. Move
   to the right block, or accept the schema as wrong and call it
   "convention".

2. **Mechanical Intuition is misclassified.** Rulebook: "specific form
   of Ultimate Skill, a Mental Power". v2 has it in Detection. Move.

3. **Precognition and Postcognition are in Detection but are Mental
   Powers.** Move to mental.

4. **Ultimate Skill has no schema field.** Rulebook: pick one Talent,
   raise to Unearthly. Need a `mental.ultimateSkill: { talent: "" }`
   sub-object.

5. **Animal Communication & Control has no schema.** Rulebook gives
   +1CS/+2CS/+3CS tiers for class/family/specific-animal. No fields.

6. **Animal Empathy has no schema.**

7. **Mind Control 10-karma cost not modeled.** Per memory: "Mind Control
   10-karma cost not deducted". Schema has no `mental.karmaPerUse` field.

8. **Emotion Control duration / area constraints not modeled.** Rulebook:
   10-100 turns, same area. The Range and Duration top-level fields
   *can* hold this but it's manual.

9. **Possession Psyche cap not modeled.** Rulebook: "only possible
   against targets with no greater Psyche than the hero's Power rank."
   No automatic enforcement.

10. **Transferral always-red-FEAT not modeled.** Could be enforced via
    save.intensity logic.

11. **Plant Control split between Mental Powers section (rulebook) and
    Control section (UI).** It's a Mental Power in the rulebook. UI puts
    it in Control. Resolve by either (a) duplicating the option, (b)
    moving to Mental, or (c) adding a "see Mental section" link.

### Schema gaps

- **Ultimate Skill talent picker.**
- **Animal Communication tier (class/family/specific) + species text.**
- **Animal Empathy emotion options.**
- **Mind Control karma-per-use cost.**
- **Possession Psyche cap auto-check.**
- **Emotion Control duration table** (10-100 turns).
- **Telepathic link / team Karma pool link.**
- **Mental Probe second-FEAT loop** (per existing TODO in memory).

---

## 11. Body Alterations — Offensive

**Powers in this category** (rulebook pp. 85–86): Extra Body Parts,
Extra Attacks, Energy Touch, Paralyzing Touch, Claws, Rotting Touch,
Corrosive Touch, Health-Drain Touch, Blinding Touch.

**UI location:** Attack fieldset (with damageType set to one of the
`touch-*` options), plus `specialStrengthType = "claw"` for claws
material strength, plus `extraAttacks` checkbox at line 190.

### Schema → UI mapping

| Power | Schema touchpoint | UI |
|---|---|---|
| Extra Body Parts | (none) | **missing** |
| Extra Attacks | `extraAttacks` checkbox | exposed in wrong section |
| Energy Touch | `damageType = "touch-energy"` | exposed |
| Paralyzing Touch | `damageType = "touch-paralyzing"` | exposed |
| Claws | `damageType = "physical-edged"` + `specialStrengthType=claw` + `clawMaterialStrength` | exposed (multi-step) |
| Rotting Touch | `damageType = "touch-rotting"` + `ignoresNaturalArmor=true` | partly hidden |
| Corrosive Touch | `damageType = "touch-corrosive"` + `ignoresArtificialArmor=true` | partly hidden |
| Health-Drain Touch | `damageType = "touch-healthdrain"` | exposed |
| Blinding Touch | `damageType = "touch-blinding"` | exposed |

### Issues

1. **Extra Body Parts has no UI.** Rulebook gives 8 specific types
   (additional arms / legs / prehensile tail / wings / combat tail /
   extra eyes / claws / spines), each granting a different Bonus Power.
   The legacy sheet had `system.extraBodyParts` (not in template.json).
   Need a structured field, probably an enum + per-type bonus-power
   wiring.

2. **Extra Attacks checkbox in Attack section is decorative.** It's a
   permanent grant ("+1CS to Fighting for multiple attacks"), not a
   per-power attack modifier. Move or relabel.

3. **Claws workflow takes 4 fields across 2 sections.** User must set
   `damageType = "physical-edged"`, `specialStrengthType = "claw"`, set
   `clawMaterialStrength` rank, optionally tick `ignoresArtificialArmor`,
   and depending on house rule the `houseRules.clawsPenetrateNaturalBA`
   world setting. The "Claws" name in the power's name then triggers
   name-detection in shred-armor-action.js. **Recommendation:** add a
   `isClawsPower` shortcut toggle (or wire up the category) that
   populates all those fields with sensible defaults.

4. **Rotting Touch & Corrosive Touch require the user to manually tick
   ignoresNaturalArmor / ignoresArtificialArmor.** Both flags have no UI
   control (per finding 9.1) AND no automatic linkage to damageType.
   The right behavior: `damageType = "touch-rotting"` auto-sets
   `ignoresNaturalArmor = true`; `damageType = "touch-corrosive"` auto-sets
   `ignoresArtificialArmor = true`.

5. **Health-Drain Touch has no "transfer-to-self healing" toggle.**
   Rulebook: damage drained heals the user up to max Health.
   Currently no field links it to the healing pipeline.

6. **Blinding Touch's "must achieve Stun or Slam" gate not modeled.**
   Save section can hold a Custom effect but the if-Stun-or-Slam
   conditional has no schema home.

7. **Paralyzing Touch's "always active, can knock out self" not modeled.**
   No `isAlwaysOn` or `affectsUser` flag.

### Schema gaps

- **Extra Body Parts structured field** (type + count + bonus-power
  links).
- **`isClawsPower` shortcut OR damageType-driven flag autopopulation.**
- **Health-Drain heal-self flag.**
- **Blinding-Touch gate condition.**
- **Paralyzing-Touch user-affected flag.**

---

## 12. Body Alterations — Defensive

**Powers in this category** (rulebook pp. 86–87): Body Armor, Water
Breathing, Absorption Power, Regeneration, Solar Regeneration,
Recovery, Life Support, Pheromones, Damage Transfer, Healing,
Immortality.

**UI location:** Defense fieldset (Body Armor subsection) + Healing /
Absorption fieldset (gated by `isHealingPower`).

### Schema → UI mapping (Body Armor)

| Field | UI | Status |
|---|---|---|
| `isBodyArmor` | sub-toggle 245 | exposed, redundant per finding 2.2 |
| `bodyArmorType` (both/physical/energy) | dropdown 250–253 | exposed |
| `armorNature` (natural/artificial) | dropdown 258–261 | exposed, see finding 2.4 |
| `armorPhysical` | number 267 | exposed |
| `armorEnergy` | number 271 | exposed |
| `armorPhysicalCustom` (badge flag) | derived | UI-only |
| `armorEnergyCustom` | derived | UI-only |

### Schema → UI mapping (Healing / Absorption section)

| Field | UI | Status |
|---|---|---|
| `isHealingPower` | toggle 682 | exposed |
| `healingType` (touch/range) | dropdown 690–694 | exposed |
| `regenerationType` (rest/solar) | dropdown 697–702 | exposed |
| `absorptionType` (energy/physical/both) | dropdown 706–711 | exposed |
| `absorptionSpecific` | text 715 | exposed |
| `hasRecoveryPower` | checkbox 719 | exposed |
| `isDamageTransfer` | checkbox 720 | exposed |
| `isImmortality` | checkbox 721 | exposed |
| `absorptionConvertsToHealth` | checkbox 722 | exposed |
| `absorptionCanRedirect` | checkbox 723 | exposed |
| `isLifeSupport` | checkbox 724 | exposed |
| Water Breathing | (no field) | **missing** |

### Issues

1. **Water Breathing has no UI or schema.** Rulebook lists it
   explicitly. Needs an `isWaterBreathing` flag + the "Swimming or
   Animal Comm (sea) bonus" wiring.

2. **`isHealingPower` umbrella conflates four distinct powers.**
   Absorption, Regeneration, Recovery, Healing, Damage Transfer,
   Immortality, Life Support all share one section gated by one
   toggle. A power that's just Life Support requires ticking
   `isHealingPower` first.

3. **Solar Regeneration min-rank rule (Endurance +1CS) not enforced.**

4. **Healing rank-units-per-day rule not modeled.** Schema has no
   `healingMaxPerDay`. Legacy had it.

5. **Absorption max-temporary-Health track not modeled.** Rulebook:
   excess Health above max dissipates over 10 rounds.

6. **Immortality "counts as 2 Powers, 1 for aliens" not auto-wired.**
   `countsAsTwoPowers` is a separate checkbox in Rank & Identity.

7. **Pheromones target-sex not modeled.** Rulebook: opposite sex only.
   Lives under `mental.pheromones` (see finding 10.1).

8. **`armorPhysical` / `armorEnergy` are integers but the rest of the
   sheet uses rank names.** Rulebook gives Body Armor in ranks
   (Amazing(49) = 49 physical, 29 energy). The dual-input may have
   been a feature, but worth documenting why the convention is
   different here.

### Schema gaps

- **Water Breathing flag.**
- **Healing max-rank-per-day cap field.**
- **Absorption temporary-Health track (current bonus, expiration).**
- **Pheromones target-sex (male/female/any).**
- **Solar Regen min-rank enforcement.**
- **Immortality auto-tick countsAsTwoPowers.**
- **Damage Transfer "transferred from -> to" target picker.**

---

## 13. Legacy `power-sheet.html` — kill it?

**Recommendation: deprecate and remove after one stable release of v2.**

Reasoning:

1. **Feature coverage is comparable.** Diff of top-level schema field
   references shows the legacy sheet exposes a handful of fields v2
   doesn't, but most of those are schema-orphaned (not in `template.json`):
   `animal`, `area`, `calculatedRange`, `columnShiftBonus`, `combatMods`,
   `extraBodyParts`, `healingMaxPerDay`, `isActive`, the per-column
   `isBluntAttack` / `isEdgedAttack` / `isShootingAttack` etc. (replaced
   in v2 by the single `battleEffectsColumn` dropdown — strict
   improvement), `karmaCost`, `karmaLoss`, `limitRankMax`,
   `limitationColumnShift`, `overridePullPunch`, `primaryEffect`,
   `regenerationRate`, `resistanceNotes`, `resistanceSpecific`,
   `subtype`, `type`.
2. **Of those, three should migrate into v2 first:**
   - `area` (already in template.json; see finding 2.5)
   - `extraBodyParts` (needs full schema + UI; see section 11.1)
   - `healingMaxPerDay` (could be added under Healing; see 12.4)
3. **Of those, `system.animal` could become a structured field for
   Animal Transformation / Animal Communication once those get proper
   schema.**
4. **v2-only fields are real upgrades:** `abilitySubstitution` (Combat
   Sense, Telekinesis-as-Strength, etc.), `armorPiercing`,
   `canReduceEffect`, `isAttackPower` / `isDefensePower` / `isHealingPower`
   / `isMagic` section gating, `resistanceMinRank`, `specialStrengthType`,
   `vfx` block, `bonusPowers` array, `abilitySubstitution`.

Path: after the migrations above land in v2, delete `power-sheet.html`,
`itemSheet.js` legacy template references, and any registered
ItemSheet that points to the old template. Keep an item-migration
script if any saved items still reference removed fields.

---

## 14. Suggested fix slices (proposal — not yet code)

Ordered roughly by impact-per-effort. Each line is one PR-sized slice.
Numbers reference the findings above.

1. **Slice A — UI controls for orphan ignore-flags.** Add
   `ignoresNaturalArmor` / `ignoresArtificialArmor` / `bypassForceField`
   checkboxes next to `armorPiercing` in the Attack fieldset. Auto-tick
   from `damageType` (rotting / corrosive). Refs 9.1, 11.4.
2. **Slice B — Area field exposure.** Surface `system.area` in the Rank &
   Identity fieldset. Ref 2.5.
3. **Slice C — Save fixedRank exposure.** Conditional rank dropdown when
   `save.intensity === "fixed-rank"`. Ref 2.6.
4. **Slice D — Limitation rank cap extension to Beyond.** Ref 2.3.
5. **Slice E — Source ↔ armorNature auto-derivation.** Ref 2.4 and
   DESIGN-material-strength §7.6.
6. **Slice F — Section gating sanity.** Add `isSensePower`,
   `isMovementPower`, `isControlPower`, `isMentalPower`,
   `isTransformPower` toggles (or auto-set based on category). Refs 3.4,
   4.1, 5.1, 6.1, 10.x.
7. **Slice G — Mental Powers reorg.** Move Mechanical Intuition,
   Precognition, Postcognition from Detection to Mental. Move Pheromones
   from Mental to Defensive Body Alterations. Refs 4.3, 10.1, 10.2,
   10.3.
8. **Slice H — Resistance UX rewrite.** Auto-set `resistanceMinRank`
   from `resistanceType`; rework `resistanceEffect` dropdown to match
   rulebook idioms; conditional `resistanceIsConductive` for
   electricity only. Refs 3.1, 3.2, 3.3.
9. **Slice I — Extra Body Parts structured field.** Schema + UI. Ref
   11.1.
10. **Slice J — Water Breathing flag.** Ref 12.1.
11. **Slice K — Magic school dropdown.** Either drop or replace with
    FASERIP-canon terms. Ref 2.8.
12. **Slice L — Power Stunts structured field.** Cross-cutting design
    effort; out of scope here. Ref 2.7.
13. **Slice M — Category auto-defaulter.** Listen for
    `system.category` change; pre-light section toggles and seed
    sensible defaults. Refs all of cross-cutting 2.1.

---

## 15. Open questions / decisions for Kurt

- **Naming inconsistency** (2.9): pick `bodyOffensive` or
  `bodyAlterationsOffensive` as canonical.
- **`controlType` unified dropdown** (6.1, 7): keep one combined list,
  or split into matterControl / energyControl?
- **Force Field Generation home** (10.1): it's a Mental Power in the
  rulebook but lives under Defense in v2. Defensible, but worth
  deciding before adding cross-links.
- **Plant Control home** (10.11): Mental Power per rulebook, currently
  Control dropdown.
- **Pheromones home** (10.1, 12.7): rulebook says Body Defensive,
  schema says `mental.*`.
- **Mechanical Intuition / Precognition / Postcognition** (4.3, 10.2):
  move to Mental, leaving Detection as the strict "senses" section.
- **Power Stunts structured field** (2.7): worth a separate design doc
  before implementation.
- **House-rule toggles**: `houseRules.clawsPenetrateNaturalBA` exists.
  Are there others worth exposing on the power sheet as overrides?
- **Schema migration strategy**: most of the "missing field" findings
  would add new keys. Confirm appetite for a schema-version bump and
  one-time migration pass.
