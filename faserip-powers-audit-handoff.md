# msh-faserip Powers Audit — Session Handoff (2026-07-03)

## Where the audit stands

Step #1 (preset layer, typed damage, resistance/invulnerability mitigation,
defense AE sync, chat display) — DONE, pre-dates this session.
Step #2 (powers compendium repair/reseed) — DONE this session.
Step #3 (Energy Reflection) — DONE this session, both slices.
Steps #4–#10 — IN PROGRESS. Step #4 slice 4a (FEAT-replacement
resistances, dialog side) DONE 2026-07-03. Slice 4b DONE 2026-07-03:
core (magical damage reduction in mitigation + regression) plus wiring
(auto-derive isMagic from the source power's system.isMagic through
AttackAction._executeSingleAttack — covers melee/ranged/energy — into
both the auto-apply path and the manual apply-damage button, and an
energy-dialog "Magical" override toggle). Then the Body Armor / Force
Field / Absorption regression coverage that was queued before Step #3.

## What happened this session

1. **Audited ChatGPT's Step #2 package and rejected its powers.db.**
   Its repair was built from a stale .db: 52 of 122 descriptions
   truncated (fragment-merge attached text to wrong powers — Imitation
   got Body Transformation text, Animate Objects got Density
   Manipulation text), 4 live powers replaced with empty shells, all
   122 docs missing _id, and power-presets.mjs failed to export
   populatePowerTypeOptions (sheet render would throw). Its icons and
   name/category/type normalization were good and were kept.

2. **Rebuilt the powers compendium from live data.** Live LevelDB
   descriptions (120 powers) + ChatGPT normalization/presets/icons +
   Energy Reflection and Plant Control (new, with rulebook text).
   Deterministic 16-char _ids. New pipeline: source JSON in
   `packs/_source/powers/` (one file per power, `_key` stamped),
   compiled to LevelDB `packs/powers/` via
   `node tools/build-powers-pack.mjs` (validates then compiles;
   requires `npm install @foundryvtt/foundryvtt-cli`). system.json
   powers path is now `./packs/powers` (folder, not .db); the legacy
   powers.db is deleted. RULE: edit source JSON, rebuild with Foundry
   down; in-world compendium edits must be exported back to source or
   the next build reverts them.

3. **Regression harness promoted and extended** —
   `macros/defense-regression-tests.js` v4.1.1, 26 asserts: original 7
   (resistance/invulnerability) + Body Armor (8-10) + Force Field
   (11-15) + Absorption (16-20) + Energy Reflection (22-26). All 26
   pass in-world. Sleeps ~350-450ms after sync ops and before flag
   reads (setFlag is fire-and-forget in sync mitigation code).

4. **Bugs found and fixed this session:**
   - Force Field physical double-penalty (mitigation.js v3.2.3): the
     rank−10 was applied at AE build AND apply time; every personal FF
     under-protected physical by 10. Harness test 12 guards it.
   - Energy dialog ignored damageSource (energy-action.js v3.3.5):
     any nonzero fixed-damage field won regardless of the selector.
     Now: fixed → damage field; strength/endurance → actor ability;
     rank/material/blank → power value w/ rank-table fallback.
   - Reflect prompt duplication + stale-card confusion (mitigation
     v3.3.1, action-utils v1.8.8, chat-hooks v1.7.1): attack pipeline
     runs mitigation more than once per hit (full-auto + manual Apply
     Damage click); bank dedupe (same AE + amount, <5s) with
     suppressPrompt; bankId nonce on flag + button; stale cards report
     superseded.
   - Foundry core 14.364 regression (actorSheet.js v2.3.0): appv1
     DragDrop stopped delivering sheet-level drop events, killing
     compendium drag-to-sheet. Fixed with native dragover/drop binding
     in activateListeners + same-event guard (event.__mshDropHandled)
     + idempotent bind flag (element.__mshDropBound). NOT YET CHECKED:
     talent/contact/equipment/HQ sheets may share the same dead-drop
     regression if they rely on core DragDrop — test and apply the
     same two-part fix if so.

## Energy Reflection implementation map (Step #3)

RAW: limited invulnerability to a specific energy form; blocks up to
Unearthly (100) — constant, NOT power rank; above 100 the hero blocks
100 and takes the remainder; reflect in the round it occurs at attacker
or another target within Power rank range; Agility FEAT to hit; no
Karma lost from the results.

- defense-effects.js v1.6.0: defenseType "energyReflection" AE
  (flags: reflectionType, threshold 100, rank/rankValue). Resistance
  AE is SUPPRESSED for isEnergyReflection items (preset also seeds
  isResistance+invulnerability for sheet coherence; an unlimited
  invulnerability AE would swallow the >100 remainder).
  looksLikeDefensivePower includes isEnergyReflection.
- mitigation.js v3.3.1: reflection layer applies before ALL other
  defenses on both bypass and non-bypass paths. Type matching mirrors
  absorption (broad "energy" or specific substring). Banks
  pendingReflect flag on target: { bankId, amount, damageType,
  bankedRound, expiresRound (same round, unlike absorption's
  next-round redirect), bankedAt, sourceAeId, reflectRangeRank }.
  Result carries reflectBank { amount, damageType, aeId,
  reflectRangeRank, bankId, suppressPrompt }.
- action-utils.js v1.8.8: postReflectPrompt posts the offer card after
  damage application (same placement as handleFFBreach); skipped when
  suppressPrompt; button carries reflector/attacker uuids + bankId.
- chat-hooks.js v1.7.1: reflect-attack handler — ownership check,
  bankId match (stale cards report superseded), same-round expiry,
  target = user target else attacker's active token, direct Agility
  FEAT via rollUniversalTable (green+ hits; deliberately no Karma
  hooks), damage routed through applyDamageToTargets (new target
  defends normally; reflection ping-pong is legal per RAW), flag
  cleared hit or miss.
- attack-action.js v1.9.46: mitigation summary wording — "blocked N —
  may reflect".
- Range is DISPLAYED (Power rank on the card), not enforced by token
  distance — deferred to the range-table consolidation backlog
  (_getPowerRangeInAreas in ranged-attack-action.js is a 4th duplicate
  of POWER_RANGE_VALUES).

## Current file versions (all verified in-world this session)

- scripts/rules/mitigation.js v3.4.0
- scripts/modules/effects/defense-effects.js v1.6.0
- scripts/modules/actions/action-utils.js v1.8.10
- scripts/modules/actions/attack-action.js v1.9.47
- scripts/modules/actions/chat-hooks.js v1.7.2
- scripts/modules/actions/energy-action.js v3.4.2
- scripts/modules/actions/ability-feat-dialog.js v1.7.0 (slice 4a:
  resistance FEAT substitution; Endurance/Intuition/Psyche category
  radios, magical rolls higher of Psyche vs magical rank)
- scripts/modules/actions/generic-feat-dialog.js v1.5.2 (slice 5a:
  Power FEAT opts — power/label/intensity/onResult/suppressCard)
- scripts/modules/actions/recovery-action.js v2.0.1 (slice 5a: migrated
  onto the shared Power FEAT engine; 171 → 60 lines)
- scripts/init.js (game.msh.openPowerFeat added, slice 5a)
- scripts/actorSheet.js v2.3.0
- scripts/power-presets.mjs (exports populatePowerTypeOptions)
- scripts/power-sheet-v2-logic.js v1.11.2
- macros/defense-regression-tests.js v4.2.0
- tools/build-powers-pack.mjs v1.0.0
- system.json: powers pack path ./packs/powers
- Foundry core 14.364, system version 2.0.0

## Known issues / loose ends

- Compendium descriptions are still raw OCR text: hard line-wrap
  newlines, occasional stray page numbers (e.g. an embedded "86" in
  Blinding Touch). Content-polish pass someday; now grep-able in
  packs/_source/powers/.
- Rebuilt pack docs carry 5 system keys absent from template.json's
  power schema (type, subtype, stunts, limitRankMax,
  limitationColumnShift). Benign under template governance and all
  declared in FaseripPowerData KEYS; REGISTER_DATA_MODELS is false
  (template.json governs since core 14.363 fixed the ActorDelta bug).
- Legacy world items may carry damageSource "fixed" from the old pack
  import (Human Torch's Fire Generation did). Fresh drags seed "rank".
- Other appv1 sheets (talent/contact/equipment/HQ) untested for the
  14.364 drop regression.
- Absorption's redirect workflow predates this session and was NOT
  given the bankId/dedupe treatment reflection got — same double-fire
  exposure likely exists there.
- Resistance FEAT substitution (slice 4a) fires only for `featReplace`
  powers. A resistance upgraded to Invulnerability (resistanceEffect
  "invulnerability", Class 1000 vs the chosen form) should AUTO-SUCCEED
  the matching FEAT rather than roll the resistance rank — not handled
  in ability-feat-dialog.js; belongs with the invulnerability path, not
  the substitution slice. Owner of such a power currently sees no
  category radio for that form and rolls the plain ability.

## Next work order (as agreed)

1. Step #4: FEAT-replacement resistances — Toxins/Disease (Endurance),
   Emotion Attacks (Intuition), Mental Attacks (Psyche), Magical
   Attacks (Psyche + magical damage reduction).
   - Slice 4a DONE (ability-feat-dialog.js v1.7.0): dialog-side FEAT
     substitution via owned featReplace resistance powers.
   - Slice 4b core DONE (mitigation.js v3.4.0, action-utils.js v1.8.10,
     defense-regression-tests.js v4.2.0): calculateMitigation takes
     isMagic; featReplace magical resistance reduces magical damage by
     rank#, matching regardless of elemental type when isMagic. 30
     asserts pass. Representation is an explicit isMagic option (NOT a
     damageType-string token — avoids rippling through every .includes).
   - Slice 4b wiring DONE (attack-action.js v1.9.47, action-utils.js
     v1.8.10, chat-hooks.js v1.7.2, energy-action.js v3.4.2):
     AttackAction._executeSingleAttack derives isMagic once from the
     resolved source item's system.isMagic (choice.isMagic overrides),
     covering melee/ranged/energy (RangedAttackAction and EnergyAction
     both extend AttackAction, no override). Threaded to the auto-apply
     applyDamageToTargets call and to buildActionsBox, which emits
     data-is-magic on the apply-damage button; chat-hooks reads it on the
     manual path. Energy dialog has a "Magical" override checkbox
     (forces on only; unchecked leaves auto-derive intact; persisted as
     lastEnergyMagical).
     Loose ends: the per-attack override toggle is on the ENERGY dialog
     only — blunt/edged/shooting/mental attacks still auto-derive from
     the source item but have no per-attack override UI. Direct
     applyDamageToTargets callers that are not power attacks
     (shooting/charging/grenade/equipment/gm-utils/charge-damage) and
     mental-power-action's buildActionsBox do NOT pass isMagic (default
     false) — a magic arrow / magically-sourced mental attack would not
     reduce; wire per-need. applyDamageNow (0 external callers) unwired.
     mitigation item-fallback path (getResistanceModifiers, non-AE) not
     extended — AE path only.
2. Step #5: generic Power FEAT action — highest-leverage item; turns
   dozens of Steps #7–#10 powers into one shared workflow.
   - Slice 5a DONE (generic-feat-dialog.js v1.5.2, init.js, recovery-
     action.js v2.0.1): the shared generic FEAT engine now takes a
     power item and resolves a Power FEAT — opts power/label/intensity/
     onResult/suppressCard. Result delivery is an awaited onResult
     callback that returns an HTML effect line appended to the shared
     card (suppressCard opt-out). RAW: with no intensity a colored
     result succeeds, white fails (isColored). game.msh.openPowerFeat
     is the public entry; the HUD "Generic FEAT" button and
     openGenericFeat are unchanged (no power → original behavior).
     Recovery migrated as the proof (171 → 60 lines): preconditions
     stay, effect (End restore + daily flag) applied in onResult.
     Forks locked: (A) callback, (B) shared card + effect line +
     suppressCard escape hatch, (C) dialog-first, (D) no range.
   - Follow-ups: migrate Healing (healing-action.js "Healing Power
     FEAT") onto openPowerFeat next; extract a headless resolveFeat
     core when the first auto-triggered (no-dialog) power FEAT appears
     (fork C(b)) — this also de-dups the color/requirement math still
     repeated between the dialog's updateFeatRequirement and runRoll.
3. Then movement (#6) / senses (#7) / body control (#8) per the audit.

## Conventions (also in memory, restated for safety)

Code only, minimal comments. str_replace on precise targeted strings —
NEVER regex over whole files. Classic imperative commit messages with
explicit destination paths (system root systems/msh-faserip/). User
hard-refreshes after installs; never suggest hard refresh as a
diagnostic. Read scripts/rules/rules-reference.js before answering
FASERIP rules questions. Version header + changelog line at the top of
every touched file, bumped every slice.

BEWARE mixed line endings when editing programmatically:
chat-hooks.js is CRLF throughout; actorSheet.js is CRLF body with an
LF header line; action-utils.js is LF with ~16 stray CRLF lines.
Always verify anchor bytes (count==1) before replacing, and write with
matching endings per anchor.

## Files to upload next session (Step #4)

Required:
- scripts/modules/actions/ability-feat-dialog.js  (the FEAT dialog to wire)
- scripts/rules/feat-math.js
- scripts/rules/rules-reference.js
- scripts/modules/dice/universal-table.js
- scripts/power-presets.mjs  (current, to read the resistance preset fields)
- scripts/modules/effects/defense-effects.js v1.6.0
- scripts/rules/mitigation.js v3.3.1  (Magical Attacks also reduces damage)
- template.json
- macros/defense-regression-tests.js v4.1.1  (to extend with FEAT-sub tests)

Nice to have (context, avoids re-asking):
- scripts/modules/actions/action-utils.js, action-dispatcher.js,
  power-router.js, mental-power-action.js  (how FEATs route today)
- One example world-actor export with a Resistance to Toxins power on it

Simplest: zip the whole system (as this session) minus packs/, plus a
note of any versions changed since this handoff.
