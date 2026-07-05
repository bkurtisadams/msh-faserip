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
- scripts/modules/actions/ability-feat-dialog.js v1.8.1 (slice 4a+7b:
  resistance + Combat Sense FEAT substitution; category
  radios, magical rolls higher of Psyche vs magical rank)
- scripts/modules/actions/generic-feat-dialog.js v1.5.3 (slice 5a:
  Power FEAT opts — power/label/intensity/onResult/suppressCard)
- scripts/modules/actions/recovery-action.js v2.0.1 (slice 5a: migrated
  onto the shared Power FEAT engine; 171 → 60 lines)
- scripts/init.js (game.msh.openPowerFeat added, slice 5a)
- scripts/modules/actions/sense-action.js v1.0.1 (Step #7 slice 7a+7b)
- scripts/modules/actions/movement-action.js v1.0.0 (Step #6 slice 6a)
- scripts/modules/actions/power-router.js v1.10.0 (senses + movement early-routes)
- scripts/rules/feat-core.js v1.0.0 (headless resolveFeat, fork C(b))
- scripts/modules/actions/healing-action.js v2.0.2 (migrated onto
  feat-core; End-mode RAW fixes)
- scripts/actorSheet.js v2.3.1
- scripts/power-presets.mjs (exports populatePowerTypeOptions)
- scripts/power-sheet-v2-logic.js v1.11.2
- macros/defense-regression-tests.js v4.2.0
- tools/build-powers-pack.mjs v1.0.0
- system.json: powers pack path ./packs/powers
- Foundry core 14.364, system version 2.0.0

## Known issues / loose ends

- Power-damage derivation CONSOLIDATED 2026-07-04 (action-utils.js v1.8.11):
  one shared derivePowerDamage(system, actor) honoring system.damageSource is
  now the single source of truth. Fixes Air Control (matterControl -> force-
  action) dealing 0 damage: force-action v3.3.3 read s.damage first via ?? so
  a rank-sourced power with a 0/blank fixed field dealt 0 (old copies only
  worked because 40 had been typed into the fixed field). energy-action v3.4.3,
  throwing-blunt v3.2.5, throwing-edged v3.2.4 all now import the shared helper
  (kills the drift that let energy get the fix but not force/throwing). The
  separate thrown-WEAPON path (computeThrownBluntDamage: max(weaponBase,
  min(STR,MAT))) is unchanged.

- Pack QA pass 2026-07-03 (packs source now available): ROUTING CLEAN —
  each exclusive routing flag (hasRecoveryPower, isHealingPower,
  isDamageTransfer, isHealthDrain, isParalyzingTouch, isBlindingTouch)
  is on exactly the right power; Healing/Regeneration split correct
  (Healing isHealingPower + empty regenerationType; Regeneration/Solar
  have regenerationType, isHealingPower false). All 122 have rank/_key/
  _id, no dup ids.
  CLEANUP DONE 2026-07-03 (source JSONs edited; PACK REBUILD REQUIRED —
  node tools/build-powers-pack.mjs): removed OCR page-number lines from
  Astral Projection (84), Light Manipulation (75), Plant Control (85);
  fixed Mind Control "The hem" -> "The hero"; and FIXED A FRAGMENT-MERGE
  BUG — Postcognition had the entire Plant Control description wrongly
  appended (truncated back to its correct ending "...find the gun at the
  robbery)."). A full-pack scan for other merges came back clean (only
  false positive: Resistance to Mental legitimately cross-references
  Resistance to Emotion). Elongation description also rewritten from
  Kurt's clean rulebook text: flowing intro + a readable rank->areas
  table (was OCR-mangled run-together columns). 6 source JSONs edited
  total this cleanup.
- Pack DESCRIPTION REFLOW DONE 2026-07-04 (all 122): removed the OCR
  hard line-wraps (~39-char book-column breaks that rendered as a skinny
  1/3-width column) — descriptions now flow to fill the field. Bullet
  lists preserved (34 powers) with continuations rejoined; hyphenated
  word-splits mended (pos-sible->possible, stif-fening->stiffening,
  advance-ment->advancement, vulnerable-to->vulnerable to) while real
  compounds kept their hyphen (non-telepathic, extra-dimensional, etc.).
  Text-integrity verified (alnum char counts match originals — nothing
  lost). Delivered as faserip-powers-source-reflowed.zip (unzip into the
  system root -> packs/_source/powers/, then rebuild). Description text
  only — no mechanics/flags/ids touched.
- Healing compendium entry: correct for routing; carries benign
  leftovers damageSource "rank" (inert, non-attack) and activationType
  "passive" (category default; Recovery is same and rolls fine).
- GM testing: State tab of GM Tools (gm-tools.js v1.4.1 +
  templates/gm-tools.html) has reduce/restore ▼/▲ for the six non-
  Endurance ability ranks on the SELECTED actor (rows fed by
  _snapshotState.abilityRanks; RANKS_ORDERED step + gmRankTest flag so
  Restore climbs back to the original). Endurance is NOT duplicated: the
  native Endurance ▼/▲ is now Health-aware (lose/restoreOneEnduranceRank,
  sets originalEndurance) — one Endurance control that Recovery/Healing
  see. Set-rank dropdown still forces any rank raw. Markup is in the
  template (no DOM injection). Standalone macro macros/gm-rank-tester.js
  still available for use without opening GM Tools (it covers all 7).
  NOTE: the native Endurance ▲ now caps at originalEndurance (restore
  semantics); use the Set-rank dropdown to push End above its original.

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
   - Slice 5b DONE (feat-core.js v1.0.0, healing-action.js v2.0.2):
     extracted the headless resolveFeat core (fork C(b)) — rolls d100,
     posts the roll, resolves color on the Universal Table, reports
     success (requiredColor null => any color wins / white fails), NO
     card (caller owns output). Healing migrated onto it and its RAW
     was FIXED to match the rulebook writeup Kurt provided:
       • BOTH modes now make an Endurance FEAT (healer's Endurance). The
         old End-mode code rolled the Power rank — that was wrong. Power
         rank is only the Health daily cap.
       • End-mode: the TARGET's Endurance is restored REGARDLESS of the
         FEAT; on FAILURE the HEALER loses one Endurance rank. Old code
         gated the target heal on success — wrong. CONFIRMED by Kurt.
         DEATH THRESHOLD (Kurt ruling, healing-action v2.0.2): healer
         perishes only when Endurance would drop BELOW Shift-0 (already
         at Shift-0 and forced to lose again) — SURVIVES at Shift-0.
         Was firing on reaching Shift-0 (loseOneEnduranceRank
         belowFeeble); now keys off atFloor. (ongoing-engine's
         belowFeeble flag + its "below Feeble = dies" comment are now
         stale/unused — left untouched.)
       • Added the "no Karma => may not Heal" gate on Health mode —
         CONFIRMED by Kurt: gates Health only (whose failure costs
         Karma); End mode risks Endurance, not Karma, so it is NOT
         Karma-gated.
     Healing keeps its own two-mode/target/cap dialog; only the FEAT
     roll delegates to feat-core.
   - Remaining follow-up: refactor the generic FEAT dialog's runRoll
     onto feat-core too (deferred — it's the just-changed 5a code, keep
     risk low). feat-core is currently roll-only (no CS/intensity/Karma-
     boost); extend when a caller needs those. This also de-dups the
     color/requirement math still repeated in the dialog.
3. Step #7 senses (audit group; first use of the openPowerFeat "wire
   powers as data" model).
   - Slice 7a DONE (sense-action.js v1.0.0, power-router.js v1.9.0):
     senses now route to showSenseFeat instead of the non-attack bail.
     Data-driven SENSE_CONFIG (one entry per sense). 8 detection senses
     resolve through showGenericFeatDialog({power,...}) with a per-sense
     intensity rule + color->outcome mapping: Magic/Psionic Detection are
     color-graded (W/G/Y/R give different info); Emotion Detection is
     vs the single target's Intuition (needsTarget); Energy/Astral/
     Mutant/Cosmic/Tracking are simple colored=success. 6 passive senses
     (Protected/Enhanced/Infravision/Magnetic/Computer Links + Combat
     Sense for now) post an info card. All 14 pack senses covered.
   - Slice 7b NEXT: Combat Sense as a FEAT-substitution (reuse the 4a
     ability-feat-dialog substitution — Combat Sense rank in place of
     Int(surprise)/Fight(block)/Agi(dodge)/Str(escape)).
   - Slice 7b DONE (ability-feat-dialog.js v1.8.0, sense-action.js
     v1.0.1): Combat Sense FEAT-substitution — extends the 4a machinery
     so an owned Combat Sense adds a radio on Int/Fight/Agi/Str FEATs
     (labelled surprise/block/dodge/escape) that rolls the higher of the
     ability vs Combat Sense rank. Card substitution line generalized
     (dropped the "Resistance:" prefix; higher-of note now covers magical
     + combatSense). Combat Sense passive card text updated. RAW "use
     instead of" read as higher-of (parallels the magical 4a choice).
   Movement (#6) slice 6a DONE (movement-action.js v1.0.0,
   power-router.js v1.10.0): movement powers route to showMovementFeat
   instead of the non-attack bail. Data-driven MOVEMENT_CONFIG: 2 Power
   FEATs — Teleportation (colored=clean, white=disoriented) and
   Dimensional Travel (graded: green=break through, yellow=return home,
   red=specific location) — resolve through showGenericFeatDialog; 9
   passive movement powers (Flight/Gliding/Leaping/Wall-Crawling/
   Lightning Speed/Levitation/Swimming/Climbing/Digging) post info
   cards. All 11 pack movement powers covered. Out of scope (noted):
   actual token movement / speed-in-areas is a separate movement-system
   concern, not this FEAT-audit pass.
   Body control (#8) is the heavier remaining group (stateful self-
   transformations — Growth/Shrinking combat mods, Density damage mods,
   Invisibility/Blending/Phasing states; Active-Effect territory).
   - Slice 8a-i DONE (body-control-effects.js v1.0.0 NEW + init.js hooks):
     auto-builds state AEs from body-control powers, mirroring defense-
     effects.js; toggled by the power's isActive (sheet bolt); synced
     from the per-item create/update/delete handler + world-load bulk,
     alongside syncDefenseEffects. Growth -> combatMods.defenseShift
     −tier (easier to hit); Shrinking -> +tier (harder); Density Self ->
     bodyArmor AE (physical+energy = rank; read by defense-effects
     getBodyArmorFromEffects, no mitigation change) + −1CS Fight/Agi when
     rank value > Endurance; Plasticity -> bodyArmor AE (physical = rank).
     combatMods changes use the effect-engine string-mode convention
     ({mode:"add",priority:20}). DECISIONS: size tier from the power's
     RANK (Fe-Gd/Rm-Am/Mn+ = 1/2/3); Excellent defaults to tier 1 (flag
     if Kurt wants tier 2). Density mass defaults to full rank (max BA).
     Slice 8a-ii DONE (body-control-effects.js v1.1.1 + mitigation.js v3.5.0):
   Phasing -> flags.bodyControlType 'phasing'; mitigation zeroes any NON-mental
   damage for a phased target (RAW immune to everything but psychic; mental
   routes via mental-action so it's unaffected). Invisibility + Blending ->
   the 'invisible' status badge only (STATUS-ONLY per Kurt). The attack
   sense-gate (Monstrous Intuition FEAT to strike an unseen target) was
   CONSIDERED and CANCELLED: RAW is conditional (only attackers who can't
   sense you are penalized), which a hard gate can't capture, so sensing is
   left to GM adjudication. Density Shift-0 immunity stays deferred (mass-
   choice UI).
   OUT OF SCOPE (choice UI): Growth Strength-as-rank, Shrinking
     attacking-vs-larger (target-relative), Density Shift-0 immunity
     (lowest mass), Phasing/Invisibility/Blending (need immunity + hard-
     to-target channels confirmed). Power ITEM sheet template still wanted
     for the activation-time choices (Density level, material, animal).

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
