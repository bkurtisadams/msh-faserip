# DESIGN: Material Strength Interactions

Scope: pin down how organic vs artificial body armor, force fields, and
material-strength shred mechanics interact across claws, rotting touch,
corrosive touch, and weapon-vs-material breaking. Reference for the
upcoming bodyDefensive audit and edged-attack/energy-action follow-ups.

Rules source: `scripts/rules/rules-reference.js` — `bodyOffensive`,
`bodyDefensive`, `MATERIAL_STRENGTH`, `breakingFEAT`, entries on
`claws`, `rottingTouch`, `corrosiveTouch`, `bodyArmor`.

---

## 1. Armor classification

Three target-defense categories the rules treat differently:

| Category    | Source                                  | `armorNature` |
| ----------- | --------------------------------------- | ------------- |
| Natural BA  | Power "Body Armor" with natural skin    | `"natural"`   |
| Artificial BA | Power "Body Armor" suit, or equipment  | `"artificial"` |
| Force Field | Power "Force Field Generation"          | n/a (separate defenseType) |

`armorNature` already lives on the power and is plumbed into the
body-armor defense AE flag. Equipment-granted body armor must set
`armorNature: "artificial"` on creation. Default for body-armor
powers stays `"natural"` (matches existing data).

No new schema fields required. The work is wiring consumption.

---

## 2. Per-power behavior

### Claws (`bodyOffensive.claws`)

Rules: "Edged Attack column. Rank = damage AND material strength.
Cannot reduce damage/effect. +2CS material str with any limitation.
Vs non-living: compare material str, Str FEAT to shred. Works on
artificial BA, not natural BA or FF."

Routing: `edged-attack` (already correct).

Behavior:
- `ignoresNaturalArmor = true` (claws bypass natural BA)
- `bypassForceField = true` (claws don't work on FF)
- Artificial BA applies normally
- Damage cannot be reduced or have effect reduced (like corrosive)
- Material strength = power rank; if `isLimited` is set, +2CS to
  material strength only (damage unchanged)
- Vs non-living target / object: route a Breaking FEAT using
  `executeBreakingFeat({ weaponMatRank: claws material str,
  targetMatRank: object material, actor })` instead of the attack roll

Schema reuse: `clawMaterialStrength` already exists but is not read.
Treat it as override-only — if blank, derive from power rank.

### Rotting Touch (`bodyOffensive.rottingTouch`)

Rules: "Rank damage on touch. Acts on organic material as breaking at
rank Str. Directed against organic BA. Offset by Resistance to
Corrosives."

Routing: `energy-action` via touch-type (already correct).

Behavior:
- `ignoresArtificialArmor = true` (artificial BA does not protect)
- Natural BA applies normally — but additionally triggers a Breaking
  FEAT using rotting's rank vs the BA's material rank to potentially
  degrade or destroy the natural BA itself
- FF still blocks (rules don't list FF bypass; default fail-safe)
- Resistance to Corrosives offsets normally via existing resistance
  pipeline if damage type matches
- "Cannot reduce damage" — apply same lock as corrosive in the
  energy-action dialog
- Detection in energy-action: extend the `isCorrosive` regex pattern
  to a parallel `isRotting` (`/rotting|rot.touch/i` on name + dtype)

### Corrosive Touch (`bodyOffensive.corrosiveTouch`)

Rules: "Rank-3CS vs living. Acts on inorganic material as breaking at
rank Str. Chews through inorganic BA. Offset by Resistance to
Corrosives."

Routing: `energy-action` (already correct).

Status: −3CS vs living + FF bypass + reduce-lock all confirmed
shipped. Remaining piece for parity with rotting:

- `ignoresNaturalArmor = true` (corrosive ignores organic BA)
- Artificial BA applies normally — additionally triggers Breaking
  FEAT to degrade the artificial BA
- FF bypass already wired

---

## 3. Force Field interactions

FF is its own defenseType, not classified as natural/artificial.
Per RAW + current code:

| Touch attack    | FF blocks? | Source         |
| --------------- | ---------- | -------------- |
| Corrosive       | No         | RAW "no effect on Force Fields" |
| Rotting         | Yes        | Default; rules silent |
| Claws           | No         | RAW "not natural BA or FF" |
| Energy Touch    | Yes        | Default        |
| Paralyzing/Blinding/Health-Drain | Yes | Default |

`bypassForceField` flag on the choice object is the canonical
mechanism. Already consumed by mitigation.

---

## 4. Mitigation pipeline changes

`scripts/rules/mitigation.js` `calculateMitigation()` currently does
not branch on `armorNature`. Add the consumption layer:

1. Read `ignoresNaturalArmor` and `ignoresArtificialArmor` from
   `options` (passed by attack-action).
2. In the body-armor aggregation block (line ~358), filter the
   `activeDefenses` body-armor AEs by `armorNature` before taking
   the max:
   - If `ignoresNaturalArmor`: skip AEs with `armorNature === "natural"`
   - If `ignoresArtificialArmor`: skip AEs with `armorNature === "artificial"`
3. No change to Force Field aggregation (already covered by
   `bypassForceField`).

Caller responsibility (`energy-action.js`, `edged-attack-action.js`,
`attack-action.js _executeSingleAttack`): set the flags on the choice
object based on power type detection, then pass through to
mitigation options.

---

## 5. Breaking FEAT integration

Claws-vs-object and rotting/corrosive-vs-BA both want the same
secondary check: weapon/effect material strength vs target material
strength, with the wielder's Strength as the FEAT comparator.

Single helper to add (probably in `action-utils.js`):

```
async function triggerArmorDegradeFEAT({
  attackName, attackMatRank,
  targetActor, targetArmorAeId, targetArmorMatRank,
  attackerActor
})
```

Calls `executeBreakingFeat` with the right ranks, and on success
flags the defense AE for degradation (rank-1) or deletion. Behavior
details (degrade once vs destroy outright, recovery) deferred — for
v1 just chat-post the result and let the GM apply manually.

Same helper used by claws-vs-object: targetArmorAeId null, just
posts the breaking result.

---

## 6. Other material-strength touchpoints (lower priority)

These already have rules text but inconsistent or missing
implementation. Tracked here so the audit covers them in one pass:

- **Weapon damage cap**: melee weapons inflict `min(Str, weapon
  material strength)`. Check whether `attack-action.js`
  `_executeSingleAttack` honors this for equipment with
  `material` field set.
- **Whip as grapple**: leather whip Ty / metal whip Gd — effective
  Str for grapple = material strength. Currently weapon equipment
  has `material` but grappling-action does not consult it.
- **Ensnaring Missile**: rank Str grapple + rank material strength
  for the entangle. `ensnaringStrength` schema field already exists.
- **Entangling (force power)**: target's Agility FEAT vs material
  strength to avoid; Str FEAT to break. Confirm entangling-action
  reads the entangle's material rank.
- **Breaking FEAT thickness modifiers**: <2" −1 rank, 1-2ft +1 rank,
  >2ft +2 ranks. Currently `executeBreakingFeat` takes a single
  `targetMatRank`; add optional `thickness` param.

These are not blockers for the bodyDefensive audit but should appear
on the bodyOffensive audit checklist when that category opens.

---

## 7. Implementation order

1. `mitigation.js`: read and consume `ignoresNaturalArmor` /
   `ignoresArtificialArmor`. Pure additive — no existing path
   changes if both flags are false.
2. `energy-action.js`: extend `isCorrosive` detection to set
   `ignoresNaturalArmor` on the choice. Add `isRotting` parallel
   that sets `ignoresArtificialArmor` and the reduce-lock.
3. `edged-attack-action.js` (or `attack-action.js _executeSingleAttack`):
   detect claws power and set `ignoresNaturalArmor +
   bypassForceField` plus damage/effect reduce-lock.
4. `action-utils.js`: add `triggerArmorDegradeFEAT` helper.
5. Wire helper from rotting, corrosive, and claws-vs-object paths.
6. Audit pass: bodyDefensive (now safe to open — armor nature is a
   first-class concept downstream).

Open questions to resolve during implementation, not now:
- How degraded BA is represented: rank-1 on the AE flags vs disable
  the AE outright vs new flag on the defense AE
- Whether claws-vs-object should use the standard attack dialog
  (with a Breaking FEAT chip) or skip straight to the breaking
  dialog. Lean: chip on existing chat card.
- Equipment with both `material` field and granted Body Armor —
  the granted BA needs `armorNature: "artificial"` auto-set on item
  creation. Confirm during step 3.
