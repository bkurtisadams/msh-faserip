# msh-faserip Powers Audit — Session Handoff (2026-07-05)

Continues the 2026-07-03 handoff. Core 14.364, system 2.0.0. All files below
were `node --check` clean and staged as downloads this session.

## What happened this session

Five things landed: bodyControl click workflows (slice 8b), the
bodyAlterationsDefensive passive leftovers, a drag-drop double-create fix
(Kurt's, not mine — see note), a core-14 FEAT-card crash fix, and a Recovery
dying-clear fix.

### 1. Slice 8b — bodyControl click workflows (audit Step #8)
- NEW `scripts/modules/actions/body-control-action.js` v1.0.0. Data-driven
  `BODY_CONTROL_CONFIG`, all 15 bodyControl types, mirroring
  movement-action.js. THREE Power FEATs via showGenericFeatDialog:
  Shape-Shifting (FEAT vs target's HIGHEST of Rea/Int/Psy; generic/object
  forms auto when no target), Imitation (vs target's LOWEST of Rea/Int/Psy),
  Animal Transformation Self (colored=change, white=fail; note single-animal
  limit is automatic). TWELVE passive info cards (Growth, Shrinking, Density
  Self, Phasing, Invisibility, Plasticity, Elongation, Body Transformation,
  Raise Lowest Ability, Blending, Power Absorption, Alter Ego). `NAME_ALIASES`
  resolves the "(Self)"/bare Density/Animal/Body variants body-control-effects
  hedges on. Card text lifted from rules-reference.js 2014–2028.
- EDIT `power-router.js` → v1.11.0. Early-route
  `catLower === "bodycontrol" || item.system?.isTransformPower === true` →
  showBodyControlFeat, placed after the movement block, before the non-attack
  bail. Passive state AEs remain owned by body-control-effects.js (untouched).
- Passive mechanical state (defense shift / body armor / phasing intangibility
  / invisible badge) is still body-control-effects.js on the isActive bolt —
  8b only gives the CLICK a workflow.

### 2. bodyAlterationsDefensive passive leftovers ("#2 defensive leftovers")
- NEW `scripts/modules/actions/body-defense-action.js` v1.0.0. All-passive
  info cards. The four true leftovers (Water Breathing, Life Support,
  Pheromones, Immortality) PLUS the four that previously fell through to the
  bail (Body Armor, Absorption, Regeneration, Solar Regeneration). Text from
  rules-reference.js 2086–2096. Pheromones is target-resisted (Psyche FEAT vs
  rank) so it's an info card, like Power Absorption — not a hero FEAT.
- EDIT `power-router.js` → v1.12.0. Early-route
  `catLower === "bodyalterationsdefensive"` → showBodyDefenseFeat, after the
  bodyControl block. Recovery / Healing / Damage Transfer are matched by
  name/flag MUCH earlier (right after Nullifying) and return before reaching
  this handler, so their dedicated dialogs are unaffected.
- SIDE EFFECT (intended): clicking Absorption now posts a card instead of
  "Absorption is not typically used as an attack power" — fixes the complaint
  Kurt hit mid-session (that was the defensive `bodyAlterationsDefensive`
  Absorption, a different power from bodyControl "Power Absorption").

### 3. Drag-drop double-create — RESOLVED, but the fix is KURT'S
- Bug chain: the `.power-row` reorder handler (and 5 siblings — Talent /
  Contact / Equipment / Vehicle / HQ sort-rows) `return`ed for non-*Sort
  payloads, relying on a bubble to the form-level `_onDrop` that core 14.364
  appv1 DragDrop swallowed — so compendium drops onto a populated row created
  nothing. I first delegated each row handler
  (`if (sourceData.type !== "PowerSort") return this._onDrop(ev);`). After
  Kurt rebooted, core DragDrop delivery RESUMED, so native binding + core each
  delivered the same drop on SEPARATE event objects → two creates (the
  per-event `__mshDropHandled` guard can't bridge different events).
- **Kurt then uploaded his own newer actorSheet.js (his v2.3.5)** that already
  solved the double-create HIS way: payload-fingerprint dedupe + stopping the
  row delegation from bubbling into the form handler. My time-window dedupe was
  superseded. I rebased onto his file. **The current actorSheet.js is Kurt's
  v2.3.5 base + only my v2.3.6 applyMode fix on top.** The whole drop machinery
  is his — do NOT reintroduce the time-window dedupe.
- CONSEQUENCE: actorSheet.js now DIVERGES from the zip. Any further actorSheet
  work MUST start from Kurt's current uploaded copy, not the zip.

### 4. Core-14 FEAT-card crash (the "Recovery gives errors" report)
- Root cause (Pattern A): `ChatMessage.applyMode(msg, game.settings.get("core",
  "rollMode"))` — a prior pass renamed applyRollMode→applyMode (correct for
  v14) but kept feeding it the legacy ROLL mode. v14 applyMode wants a MESSAGE
  mode from `core.messageMode`; the roll-mode value doesn't map, so applyMode
  read `.handler` off undefined and threw. Fired on EVERY generic-dialog FEAT
  (Recovery, the new bodyControl FEATs, movement/sense FEATs) and every ability
  FEAT, plus two sheet rolls.
- Fixed 4 sites with the pattern already used by paralyzing/blinding/
  health-drain actions:
  `try { ChatMessage.applyMode(m, game.settings.get("core","messageMode")); }
   catch { try { ChatMessage.applyRollMode(m, game.settings.get("core","rollMode")); } catch {} }`
  - generic-feat-dialog.js → v1.5.4 (runRoll, ~line 501)
  - ability-feat-dialog.js → v1.8.2 (~line 701)
  - actorSheet.js → v2.3.6 (resistance roll ~4056, ability roll ~4278)
- The dialog files were edited from the ZIP versions (v1.5.3 / v1.8.1) matching
  the crash stack. If either is stale on Kurt's end, rebase the one-line fix.
- STILL OPEN (benign): ~13 other sites set `rollMode:` on message DATA (not
  applyMode) — deprecation warning only, no crash. Left alone. Cosmetic sweep
  available (see loose ends). Sites: grabbing-break.js:99, action-utils.js:740
  & 782, mental-power-action.js:422, chat-hooks.js:1981, dice-roller.js:338 &
  378, stunts.js:167, feat-core.js:28, movement-feats.js:382/678/1116/1536/1892.

### 5. Recovery clears the dying state
- `recovery-action.js` → v2.1.0. On a successful Recovery, if the actor carries
  the dying AE (`isDying` / "dying" status), it now calls
  `game.msh.rest.stabilizeDying(actor)` AFTER restore. Restore runs first so
  regained Health lifts them above 0 and stabilizeDying keeps them conscious.
  `wasDying` guard so stabilizeDying's own "not dying" warning never fires on a
  normal Recovery.
- Why stabilizeDying and not a raw AE delete: it also clears the death-save
  Unconscious AE with the v14/CTT duration-expiry dance and re-applies Impaired
  Endurance if still below original — a naive delete misses both. Reached via
  `game.msh.rest` (same access path actorSheet.js:970 uses). applyDyingOngoing
  sets the actor-level `originalEndurance` flag, so restoreOneEnduranceRank
  caps correctly during dying.
- Before: restoreOneEnduranceRank bumped the rank/Health but left the dying AE
  ticking, so the character kept dying after a successful Recovery.

## Current file versions (changed this session)

- scripts/modules/actions/body-control-action.js **v1.0.0 (NEW)**
- scripts/modules/actions/body-defense-action.js **v1.0.0 (NEW)**
- scripts/modules/actions/power-router.js **v1.12.0**
- scripts/modules/actions/generic-feat-dialog.js **v1.5.4**
- scripts/modules/actions/ability-feat-dialog.js **v1.8.2**
- scripts/modules/actions/recovery-action.js **v2.1.0**
- scripts/actorSheet.js **v2.3.6** (on KURT'S v2.3.5 base — diverges from zip)

## Open rulings awaiting Kurt (collected)

1. **Shape-Shifting / Imitation success model.** Currently success = beating
   the target's mental ability as the FEAT intensity (same mechanic as Emotion
   Detection). Confirm vs reading "FEAT vs highest/lowest of Rea/Int/Psy" as a
   fixed difficulty.
2. **Defensive card scope.** Routing the whole bodyAlterationsDefensive
   category means Body Armor / Absorption / Regeneration / Solar Regeneration
   now post cards (previously bailed). Keep, or gate the config to only the four
   true leftovers and let the rest keep bailing? (one-line change)
3. **Recovery dying-clear threshold.** Currently clears dying on ANY colored
   success (even Shift-0 → Feeble, a single rank). Matches "if it succeeds,
   remove dying." Gate to a threshold instead? (one-line change)
4. **Power Absorption full dialog?** Currently an info card (RAW roll belongs to
   the TARGET). A real two-actor opposed touch is its own slice; needs two
   rulings first — temporary vs permanent absorption (and how temporary ends),
   and enforce "inborn Powers only" by filtering the target's power list vs
   leave to GM selection.

## Powers audit — what's left

Categories fully audited: resistances (#4), senses (#7), movement (#6),
bodyControl (#8, click + states), distanceAttacks & mentalPowers (attack
audit), the defensive CORE (Body Armor / Force Field / Absorption / Energy
Reflection), the Recovery/Healing/Damage Transfer/Regeneration routing, AND —
new this session — the bodyAlterationsDefensive passive leftovers.

Remaining category work (verified unwired):
1. **bodyAlterationsOffensive leftovers — Extra Attacks, Extra Body Parts.**
   Zero wiring (only a seed macro for extra body parts). Passive combat mods —
   the heavier "bodyOffensive" thread. Touches the combat/attack-sequencing
   path (multi-attack per round, extra limbs), not just card-posting. Highest
   value, highest effort.
2. **matterControl "Others" transforms + Animate Objects/Drawings.** Density /
   Body / Animal Transformation Others (target touch-transforms), Animate
   Objects — no dedicated workflow; fall through to force/energy attack routing,
   wrong for target-transform powers.
3. **energyControl meta-powers — Probability Manipulation, Time Control.** No
   handling; mis-fall-through to an energy attack. GM-adjudicated; want an info
   card or explicit bail rather than being treated as attacks.

Deferred (Kurt's call — choice UI): bodyControl activation-time choices + power
item-sheet template — Density level/material, Growth Strength-as-rank,
Shrinking-vs-larger, animal pick, Density Shift-0 immunity, Phasing FF-passage.
Plus the Power Absorption opposed dialog (ruling #4 above).

Smaller loose ends (from the 07-03 handoff, still open):
- Step #4: an invulnerability-upgraded resistance should AUTO-succeed the
  matching FEAT rather than roll — not handled (belongs on the invulnerability
  path, not the substitution slice).
- Absorption's redirect never got the bankId/dedupe treatment reflection got —
  same double-fire exposure likely.
- Per-attack isMagic override exists only on the energy dialog; blunt/edged/
  shooting/mental have none; non-power applyDamageToTargets callers
  (shooting/charging/grenade/equipment/gm-utils/charge-damage) don't pass
  isMagic; mental-power buildActionsBox doesn't either.
- Range displayed, not enforced; POWER_RANGE_VALUES duplicated 4×
  (_getPowerRangeInAreas in ranged-attack-action is a 4th copy).
- feat-core: migrate generic-feat-dialog's runRoll onto it; extend feat-core
  with CS/intensity/Karma-boost when a caller needs them.
- **Standalone talent/contact/equipment/HQ sheets untested for the 14.364 drop
  regression** — they have their OWN _onDrop; could show the same swallow OR the
  same double-create just chased on the main sheet. Now especially relevant.
- Deprecation cosmetic sweep: the ~13 benign `rollMode:` message-data sites
  (section 4) → migrate to messageMode. Console-noise only.

## Conventions (unchanged, restated for safety)

Code only, minimal comments. str_replace on precise targeted strings — NEVER
regex over whole files. Classic imperative commit messages with explicit
destination paths (system root systems/msh-faserip/). User hard-refreshes after
installs; never suggest hard refresh as a diagnostic. Read
scripts/rules/rules-reference.js before answering FASERIP rules questions.
Version header + changelog line at the top of every touched file, bumped every
slice. Kurt holds final authority on all rules calls.

BEWARE mixed line endings when editing programmatically: chat-hooks.js is CRLF
throughout; actorSheet.js is CRLF body with an LF header block; action-utils.js
is LF with ~16 stray CRLF lines. The new/edited action files this session are
pure LF (body-control-action, body-defense-action, power-router,
generic-feat-dialog, ability-feat-dialog, recovery-action). Always verify anchor
byte count == 1 before replacing, and write with matching endings per anchor.
The applyMode fix in actorSheet.js was applied CRLF (the two roll sites are
CRLF body); its header block is LF.

## Files to upload next session

Simplest: zip the whole system minus packs/ (as before), PLUS a note of any
versions changed since this handoff. **CRITICAL: include Kurt's CURRENT
actorSheet.js** — the in-repo/zip copy is behind his v2.3.5 drop-dedupe work;
starting from the zip's actorSheet would clobber it.

If the next slice is bodyAlterationsOffensive (#1 — Extra Attacks / Extra Body
Parts), also useful: attack-action.js, action-hud.js / faserip-initiative.js
(multi-attack sequencing), template.json (extra-attacks/body-parts fields),
power-router.js, rules-reference.js, and macros/seed-extrabodyparts.js (existing
seed macro).
