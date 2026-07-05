# DESIGN: Material Strength Interactions (rev 2)

Scope: pin down how claws, corrosive touch, rotting touch, and edged
weapons interact with body armor and force fields. Reference for the
upcoming bodyDefensive audit and the shred-FEAT implementation.

Rev 2 supersedes rev 1, which conflated two separate RAW mechanics
into a single damage-pipeline filter. Rules-reference.js line 2077
("Works on artificial BA, not natural BA or FF") was the source of the
misread; the more careful line 2876 ("*Shred* works on artificial BA,
not natural BA or FF") is the correct reading and is what this doc
builds on.

Rules sources:
- Claws power description (RAW Wolverine vs Sentinel example)
- Combat section: "Claws and other sharp instruments do not affect
  Force Fields with their material strength. They would inflict their
  normal damage in overloading that Force Field."
- `scripts/rules/rules-reference.js` — `bodyOffensive.claws`,
  `bodyOffensive.rottingTouch`, `bodyOffensive.corrosiveTouch`,
  `bodyDefensive`, `MATERIAL_STRENGTH`, `breakingFEAT`.

---

## 1. Two distinct mechanics

Claws, corrosive touch, and rotting touch all have **two effects**,
not one. These run on separate pipelines:

**Damage attack.** Edged Attack column (claws, swords) or Energy
column (corrosive, rotting). Power rank damage. All armor soaks
normally — natural BA, artificial BA, and Force Fields all apply as
standard mitigation. No armor type is bypassed for damage purposes.

**Shred FEAT.** A separate, concentrated action where the attacker's
material strength is compared to the target material's material
strength via a Strength FEAT. On Red, the target material is
shredded. Works on artificial BA and inanimate objects only. Does
NOT work on natural BA or Force Fields. The shred FEAT does not
itself inflict damage — the attacker is "concentrating on the armor"
this round, foregoing the damage attack.

The previous rev 1 design treated these as one combined mechanic
(damage attack ignores certain armor types). That was wrong.

---

## 2. Per-power behavior

### Claws (`bodyOffensive.claws`)

RAW: Power rank = damage AND material strength. Cannot reduce damage
or effect. +2CS material strength when the hero accepts a limitation
(including limitations required by other powers).

- **Damage attack**: routes through `edged-attack-action`. Power rank
  damage on Edged Attack column. No armor-type bypass. Cannot reduce
  damage/effect (currently informational — edged-attack dialog has no
  reduce controls to lock).
- **Shred FEAT**: separate action (button on chat card or character
  sheet). Per Claws power rule and the explicit "Power rank Strength"
  wording in Rotting/Corrosive: two-stage check.
  **Pre-check**: claws material strength ≥ target material strength.
  Pure capability gate — claws material strength can be overridden
  (Wolverine adamantium = Class 1000) above the power's own rank.
  +2CS to material strength with any limitation applies to the
  pre-check ceiling, not the FEAT column.
  **FEAT**: roll on the **Power rank** column (power rank acting as
  Strength per the Rotting/Corrosive "Power rank Strength" wording);
  intensity = target material strength; color required per the
  standard FEAT table (Intensity > Ability → Red; equal → Yellow;
  Ability > Intensity → Green; Ability ≥ Intensity + 3 → automatic;
  Intensity ≥ Ability + 2 → impossible).
  Valid targets: armor items with `armorNature: "artificial"` or
  non-living inorganic objects. Refuses to fire against natural BA
  or FF.

### Rotting Touch (`bodyOffensive.rottingTouch`)

RAW: Rank damage on touch. Acts on organic material as breaking at
rank Str. Offset by Resistance to Corrosives.

- **Damage attack**: routes through `energy-action`. Rank damage,
  Energy column. Normal armor soak. Resistance to Corrosives offsets
  via the existing resistance pipeline if the damage type matches.
- **Shred FEAT**: parallel to claws but inverted by material kind.
  Acts on organic materials. Valid targets: natural BA, organic
  objects (wood, flesh, leather). Refuses to fire against artificial
  BA or FF. This is rotting's mirror image of claws — claws shred
  inorganic, rotting shreds organic.
- **Damage-reduce lock**: rules don't explicitly say, but parallel
  with corrosive and the "sharp pointy items" lineage suggests yes.
  Keep current lock.

### Corrosive Touch (`bodyOffensive.corrosiveTouch`)

RAW: Rank-3CS vs living. Acts on inorganic material as breaking at
rank Str. Offset by Resistance to Corrosives.

Separate combat-text rule: "Corrosive attacks must hit the target,
and as such have no effect on Force Fields and the like."

- **Damage attack**: Energy column. Rank-3CS vs living targets (the
  shipped -3CS logic stays). Normal BA soak. **FF interaction is
  the open question** — see §3.
- **Shred FEAT**: acts on inorganic materials. Valid targets:
  artificial BA, inorganic objects. Refuses to fire against natural
  BA or FF.
- **Damage-reduce lock**: stays as shipped.

### Edged weapons (swords, daggers, spears)

RAW notes that the same approach applies to "swords (Black Knight,
Silver Samurai) and other sharp pointy items." Weapons have a
`material` field already; the shred FEAT can reuse the same helper
with the weapon's material strength.

Out of scope for the first shred slice. Land claws first, then
generalize.

---

## 3. Force Field interactions

| Touch attack    | FF blocks damage? | Source / interpretation |
| --------------- | ----------------- | ----------------------- |
| Claws           | No (FF soaks)     | RAW: "inflict normal damage in overloading that Force Field" |
| Edged weapons   | No (FF soaks)     | Same as claws |
| Rotting         | No (FF soaks)     | Rules silent, default fail-safe |
| Corrosive       | **Open question** | "must hit the target, and as such have no effect on Force Fields and the like" |

Shred FEAT vs FF: never valid for any of these (RAW explicit for
claws, parallel reasoning for corrosive/rotting).

**Corrosive vs FF reading.** Two interpretations exist:

1. *FF blocks corrosive entirely.* "Must hit target" means the corrosive
   must make physical contact. FF prevents contact. Therefore zero
   damage when target has active FF. This is the strict reading of the
   combat-text rule.
2. *FF doesn't apply against corrosive.* The existing code in
   `energy-action.js` (pre-rev-2) reads the rule as "corrosive bypasses
   FF" — i.e. corrosive damage hits the target unimpeded. This is
   probably a misread of the same text but it's been shipped this way.

Recommend (1) on principle but it changes existing in-play behavior.
Decision deferred — see §7.

---

## 4. Schema

No schema changes required. All needed fields exist:

- Power: `armorNature` ("natural" / "artificial"), defaults natural
- Power: `isForceField` boolean
- Power: `clawMaterialStrength` (override; derive from power rank when blank)
- Power: `isLimited` (drives +2CS material strength bump on claws)
- Equipment: `material` (used as material strength)
- Equipment: `isForceField` boolean

Two cosmetic gaps the audit should address:

- Equipment armor has no `armorNature` field. Equipment-source BA is
  artificial by convention. A `grantedByEquipment` flag already exists
  on powers; when a Body Armor power has it set, `armorNature` should
  auto-derive to "artificial" rather than defaulting to natural. Saves
  Kurt having to set two fields manually (see test session 2026-05-20).
- Power "Source" dropdown ("Equipment" / "Innate" / etc.) and
  `armorNature` are independent fields. Same auto-derive logic:
  `source === "equipment"` → `armorNature: "artificial"` when unset.

These are inference-at-read in `getBodyArmorValues` / `defense-effects.js`,
not data migration. Backward compatible — explicit `armorNature`
settings always win.

---

## 5. Shred FEAT implementation

Single new action class: `ShredArmorAction` (or fold into an existing
breaking-feat dialog). Triggered from:

- "Shred Armor" button on the claws power's actions row
- "Shred Armor" button on the corrosive/rotting power's actions row
- (Future) "Shred Armor" button on edged weapon attack mode dialogs

Flow:

1. Open target picker. Filter target list by armor-shred validity:
   - Claws: target must have artificial BA (`armorNature: "artificial"`,
     or equipment armor that's not an FF) OR be an inanimate object
   - Corrosive: same — artificial BA / inorganic objects
   - Rotting: target must have natural BA OR be an organic object
   - Refuse any target with FF active and no other valid shred target

2. Resolve material strengths:
   - Attacker: `clawMaterialStrength` override, else power rank;
     +2CS if `isLimited` (claws); +2CS if any other applicable
     limitation
   - Target: pulled from the target's defense AE flags
     (`bodyArmor` AE → `materialStrength` field; need to add this to
     the defense-effects AE schema), or from `material` on equipment

3. Resolve the FEAT per the **Claws power rule** combined with the
   **explicit "Power rank Strength" wording** in Rotting Touch and
   Corrosive Touch ("acts on organic material as if an attempt to
   break the item with Power rank Strength" / "acts on inorganic
   material as if breaking it with Power rank Strength"). Both
   powers explicitly tie the breaking FEAT to the **power's rank**
   acting as the Strength comparator. The "same approach" link
   binds Claws to this convention.

   "Strength FEAT" in the Claws rule is generic FASERIP naming for
   an opposed FEAT roll. The column rolled on is the power's rank
   (not the wielder's Strength ability and not the claws' material
   strength stat). For Wolverine: Excellent (his claws Power rank
   per "Excellent Edged Attack damage"). The Class 1000 material
   strength gates capability via the pre-check, doesn't enter the
   FEAT itself.

   Two-stage check:

   **Pre-check (material capability)**: attacker material strength ≥
   target material strength. If claws aren't hard enough to dent
   the target, FEAT is refused before rolling. Material strength
   sources:
   - Claws: `clawMaterialStrength` override, else Power rank;
     +2CS per applicable limitation (`isLimited` and others)
   - Rotting / Corrosive: Power rank only (no material strength
     override exists; the powers don't have separate material stats)
   - Target: pulled from the target's defense AE (`bodyArmor` AE →
     `materialStrength`), or from `material` on equipment armor

   **Shred FEAT**:
   - Comparator (Ability): Power rank (claws / rotting / corrosive)
   - Intensity: target material strength (+/- thickness modifiers)
   - Resolve per the standard FEAT table:

     | rankGap (Ability - Intensity) | Result        |
     | ----------------------------- | ------------- |
     | ≥ +3                          | Auto-shred    |
     | +1 or +2                      | Green needed  |
     | 0                             | Yellow needed |
     | -1                            | Red needed    |
     | ≤ -2                          | Impossible    |

     "Auto-shred" and "Impossible" are RAW defaults (Judges Book:
     "the Judge may bend it at his discretion"). The existing
     `executeBreakingFeat` uses ≥ +3 for auto and ≤ -3 for auto-fail;
     the auto-fail threshold needs tightening to ≤ -2 to match
     the impossible rule. Address in the shred sibling, leave the
     existing breaking-feat alone for now.

   **Thickness modifiers on target material** (RAW Breaking Things):
   <2" thick −1 rank, 2"-12" base, 1-2ft +1 rank, >2ft +2 ranks.
   Body Armor defaults to base ("2-12 inches"). Object shred can
   apply thickness from the object's data (defer to a follow-up
   slice — first slice just does BA at base thickness).

   Wolverine vs Sentinel concretely:
   - Pre-check: claws material strength Cl1000 (rank 14) ≥
     Sentinel BA Remarkable (rank 6) ✓
   - FEAT: Power rank Excellent (5) vs target intensity
     Remarkable (6) → rankGap = -1 → **Red needed**
   - Matches RAW example exactly.

4. On success (auto-shred or rolled success): disable the target's
   BA defense AE (set `disabled: true` on the AE). Chat card shows
   "Armor shredded." If the BA was equipment-granted, the equipment
   item gets a flag noting it's been shredded (visual cue on the
   equipment sheet; doesn't auto-delete the item).

5. Persistence: shredded BA stays disabled until the GM re-enables
   the AE manually (story-level repair). No auto-recovery.

The shred FEAT does not deal damage to the wearer. The attacker is
spending the round concentrating on the armor.

Existing `executeBreakingFeat` uses `wielderStr` as comparator,
which is correct for the **generic Breaking Things rule** (a
character bashing through a wall with raw Strength). It is the
**wrong comparator** for claws / corrosive / rotting — those use
Power rank as the Strength substitute per the explicit
"Power rank Strength" wording. Add a new `executeShredFeat({
attackerMatRank, powerRank, targetMatRank, ... })` function:
- `attackerMatRank` drives the pre-check
- `powerRank` is the FEAT comparator (Ability)
- `targetMatRank` (+/- thickness) is the FEAT intensity
- Auto-shred at rankGap ≥ +3, impossible at rankGap ≤ -2,
  otherwise roll for color per the FEAT table

Keep `executeBreakingFeat` untouched (its semantics are correct for
the generic case); both functions coexist.

---

## 6. Damage pipeline (revert plan)

The rev-1 wiring set `ignoresNaturalArmor` / `ignoresArtificialArmor`
on the choice object for claws (edged-attack-action), corrosive
(energy-action), and rotting (energy-action). Under rev 2 these flags
should NOT be set automatically — damage goes through normal soak.

**Revert:**

- `edged-attack-action.js` v3.2.0: drop the `isClawsPower` block and
  the flag-stamping in both `_executeSingleAttack` choice spreads.
  Version → v3.2.1 (keep the bump as a clarifying revert).
- `energy-action.js` v3.3.0: in the dialog `update()`, keep the
  `isRotting` detection and the reduce-lock (those are correct).
  In `execute()`, drop the `ignoresNaturalArmor` and
  `ignoresArtificialArmor` setters on `choiceForAttack`.
  `bypassForceField: _isCorrosive` is the §3 open question — pending
  decision, leave or remove based on §7.

**Keep:**

- `mitigation.js` v3.2.0: filter logic in `getDefensesFromAEs`.
  Harmless when no caller sets the flags; the shred FEAT can also
  consume these flags later for any "this specific roll ignores
  natural BA" power stunt that comes up.
- `action-utils.js`: `getBodyArmorValues` and `applyDamageToTargets`
  forwarding. Same reasoning — latent plumbing, no behavior change
  when flags are unset.
- `attack-action.js` v1.9.28: flag-forwarding through
  `_executeSingleAttack`, prefill on the chat card. Same reasoning.
- `chat-hooks.js`: dataset reads. Same.
- `applyDamageToTargets` `bypassForceField` forwarding fix. This
  was a real silent-drop bug, fixes corrosive's manual-apply path
  regardless of where §3 lands.

Net effect of revert: the schema fields and the filter wiring stay
in place as latent capability. Only the auto-application by claws /
corrosive / rotting is removed. Damage pipeline returns to normal
soak across the board.

---

## 7. Open questions to resolve before coding

1. **Corrosive vs FF**: total block (FF=0 damage) or "bypasses" FF
   (FF doesn't soak). Pre-rev-1 code did the latter; strict RAW
   suggests the former.
2. **Shred FEAT partial-weakening tier**: standard rank-comparison
   already gives binary success/fail per FASERIP universal-table
   conventions. Optional add-on: when the rolled color falls one tier
   short of the required color, treat as rank-1 weakening to the BA
   (apply via the defense AE's protection values). Simplest path is
   pure binary — pick one.

3. **Shred FEAT material-strength source for target**: do defense
   AEs already carry a `materialStrength` field, or does that need
   to be added to the BA AE schema in `defense-effects.js`?
4. **+2CS limitation bump**: which `system` flags on a power qualify
   as "limitations" for the bump? `isLimited` is the obvious one;
   are there others (e.g. `usesEnergyReserve`, `requiresFocus`)?
5. **Damage-reduce lock on rotting**: keep (parallel to corrosive,
   "sharp pointy" lineage) or drop (RAW silent on rotting reducibility).
6. **Auto-derive `armorNature` from `source === "equipment"`**: yes
   (cleaner) or no (explicit only).

---

## 8. Implementation order (rev 2)

1. Revert §6 items. Cleanest single-slice change to undo rev 1's
   incorrect damage-pipeline auto-setting.
2. Resolve §7 questions.
3. Add `materialStrength` field to body-armor defense AE schema in
   `defense-effects.js` if not already present.
4. Auto-derive `armorNature` from `source === "equipment"` or
   `grantedByEquipment` in `getBodyArmorValues` and `defense-effects.js`
   (assuming §7.6 = yes).
5. Build `ShredArmorAction` (or breaking-feat dialog extension) per §5.
6. Wire shred button onto claws / corrosive / rotting power action rows.
7. Audit pass: bodyDefensive (now safe to open — armor-nature and shred
   are properly separated from damage).
