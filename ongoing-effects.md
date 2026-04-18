# Ongoing Effects Engine Reference

_Last verified against `scripts/modules/effects/ongoing-engine.js` v1.7.0 (2026-04-17)._

## Overview

`ongoing-engine.js` handles periodic/timed effects: Regeneration, Solar Regeneration, Dying, and any custom effect registered via the generic API. Config is stored in actor flags (`ongoing.<effectId>`); a matching AE with `ongoingId` flag is created on the actor. The engine processes all ongoing effects on every `updateWorldTime` tick for actors in the active scene.

Dying is special-cased: it does NOT run through the generic `processOneEffect` path. It is driven by `processDyingRound`, invoked from combat round + timeAdvanced hooks, with a synchronous in-memory lock per actor to prevent double-processing races.

## Schema

```js
{
  type:              "heal" | "damage" | "stat.loss" | "stat.gain",
  stat:              "health" | "endurance",
  formula:           "@endurance" | "@strength" | "@powerRank" | "1rank" | <number>,
  rate:              10,              // every N cycles
  cycle:             "turn" | "round" | "minute" | "hour" | "day" | "week",
  count:             -1,              // -1 = unlimited, N = max triggers
  gate:              "none",          // single gate (ignored if gates[] set)
  gates:             ["noDamage", "daylight"],  // array for multiple gates
  interruptOnDamage: true,            // disable AE + reset timer on damage
  oncePerDay:        false,           // only trigger once per game day
  capAtMax:          true,            // stop healing at max HP
  autoDisable:       true,            // disable AE when fully healed / count exhausted
  combatOnly:        false,           // skip processOneEffect path; driven by combat hooks
  // Power context (optional):
  powerRankValue:    30,              // resolved rank number for @powerRank
  powerItemId:       "abc123",        // item ID for @powerRank lookup
  originalEndurance: "Good",          // for stat.gain: target rank to restore to
}
```

### Runtime State (managed by engine, do not set manually)

```js
{
  startedAt:         null,   // worldTime when timer started
  lastTriggered:     null,   // worldTime of last trigger
  triggerCount:      0,      // total triggers so far
  lastTriggeredDate: null,   // game date string (for oncePerDay)
}
```

## Formula Tokens

| Token | Resolves To |
|-------|-------------|
| `@endurance` | `actor.system.abilities.endurance.value` |
| `@strength` | `actor.system.abilities.strength.value` |
| `@powerRank` | `config.powerRankValue`, or looked up from `config.powerItemId` |
| `"1rank"` | Special: steps Endurance rank up/down by 1 (dying/impaired recovery) |
| `<number>` | Flat value |

## Gates

| Gate | Condition |
|------|-----------|
| `none` | Always passes |
| `noDamage` | `lastDamageWorldTime` < `startedAt` (no damage since timer started) |
| `daylight` | CTT hour 6:00–18:00 (passes if CTT not installed) |
| `conscious` | `health.value > 0` |

Combine with `gates: ["noDamage", "daylight"]` — all must pass.

## Cycle Units

| Unit | Seconds |
|------|---------|
| `turn` / `round` | `turnSeconds` setting (default 6) |
| `minute` | 60 |
| `hour` | 3600 |
| `day` | 86400 |
| `week` | 604800 |

## Type/Stat Executors

| type | stat | Behavior |
|------|------|----------|
| `heal` | `health` | Add HP, cap at max, auto-disable at full |
| `damage` | `health` | Remove HP, auto-disable at 0 |
| `stat.loss` | `endurance` | Step rank down (with `1rank`), death at Shift-0. HP max and current both drop with the rank (per Health = F+A+S+E). |
| `stat.gain` | `endurance` | Step rank up (with `1rank`), remove at `originalEndurance`. Restores HP max and adds delta to current. |

## API

### `game.msh.ongoing`

```js
// Register a custom ongoing effect
game.msh.ongoing.register(actor, "myEffectId", configObj, aeOverrides)

// Remove an ongoing effect (deletes AE + clears flags)
game.msh.ongoing.remove(actor, "myEffectId")

// Interrupt all damage-sensitive effects on an actor
game.msh.ongoing.interrupt(actor)

// Manually process all ongoing effects (normally called by updateWorldTime)
game.msh.ongoing.process(worldTime, dt)

// Process one round of dying (called by combat hooks, not generic process)
game.msh.ongoing.processDyingRound(actor)

// Power-specific shortcuts (shipped)
game.msh.ongoing.applyRegeneration(actor, { healAmount?, cycleTurns?, powerRank?, powerItemId? })
game.msh.ongoing.applySolarRegeneration(actor, { powerRank?, powerItemId?, cycleTurns? })
game.msh.ongoing.applyDying(actor, { skipImmediateLoss? })
```

### Top-level shortcuts on `game.msh`

```js
game.msh.startRegeneration(actor)       // finds power by regenerationType field
game.msh.startSolarRegeneration(actor)  // finds power by regenerationType: "solar"
game.msh.stopRegeneration(actor)        // removes both resting + solar
```

## Registering a Custom Effect

```js
await game.msh.ongoing.register(actor, "mercyKO", {
  type: "damage",
  stat: "health",
  formula: 0,               // no damage per cycle; used purely for duration
  rate: 1,
  cycle: "round",
  count: 3,                 // triggers 3 times then auto-disables
  interruptOnDamage: false,
}, {
  name: "Mercy KO",
  img: "icons/svg/sleep.svg",
  disabled: false,          // active immediately
  statuses: ["unconscious"], // Foundry status effect IDs
  duration: { rounds: 3 },  // AE duration for HUD display
});
```

`aeOverrides` accepted keys:
- `name`, `img` — AE display
- `disabled` — default `true` (auto-sync pattern); pass `false` for immediate activation
- `changes` — AE stat changes array
- `statuses` — Foundry status-effect IDs (`"unconscious"`, `"stunned"`, etc.)
- `duration` — AE duration object (`{ rounds, turns, seconds }`)
- `extraFlags` — additional flag payload merged under the system scope

## Auto-Sync from Power Sheet

Setting **Regeneration Type** on a power's **Functions tab** auto-registers the ongoing effect on the owning actor via `createItem` / `updateItem` / `deleteItem` hooks. The AE appears disabled in the actor's Effects tab. Player toggles it on to begin resting.

Flow: `Functions tab dropdown → updateItem hook → syncPowerOngoingEffects() → registerOngoingEffect() → AE created`

## Storage Layout

```
Actor flags:
  msh-faserip.ongoing.regeneration      = { type, stat, formula, rate, ... }
  msh-faserip.ongoing.solarRegeneration = { ... }
  msh-faserip.ongoing.dying             = { ... }
  msh-faserip.lastDamageWorldTime       = <number>  (used by noDamage gate)

AE flags:
  msh-faserip.effectType = "ongoing"
  msh-faserip.ongoingId  = "regeneration"  (matches the actor flag key)
```

## Combat Hooks

Dying is driven by the combat round hook and `timeAdvanced` hook, which both call `processDyingRound(actor)`. The `_dyingLocks` Set prevents concurrent calls per actor.

Generic effects run through `processOngoingEffects(worldTime, dt)` on the `updateWorldTime` hook. This path SKIPS any effect with `combatOnly: true` or `effectId === "dying"`.

`interruptOngoingEffects(actor)` is called from `recordDamage` (in effect-engine.js) and disables all effects with `interruptOnDamage: true`, clearing their `startedAt` so the next tick restarts the timer.

## Implementation Status

Shipped:
- [x] Core engine (processOngoingEffects, gates, formulas, type/stat executors)
- [x] Regeneration (Resting) — auto-sync from power sheet, `applyRegenerationOngoing` shortcut
- [x] Solar Regeneration — auto-sync from power sheet, `applySolarRegenerationOngoing` shortcut
- [x] Dying (stat.loss/endurance, combat-driven, lock-protected, HP-sync on rank change)
- [x] Impaired Endurance (applied by dying as a nested AE with `-2CS` on all FEATs via `selfPenaltyCS`)
- [x] Damage interruption (`interruptOngoingEffects` via `recordDamage`)
- [x] Active-scene-only processing (`getActiveSceneActors`)
- [x] Legacy dying AE migration (auto-registers config, strips duration)
- [x] Robot origin handling for death (deactivation, no karma loss)
- [x] HP max + current synced on stat.loss/stat.gain rank steps

Pending (via `register` API, no dedicated shortcut yet):
- [ ] Standard Recovery (universal, once/day, 10-turn timer)
- [ ] Standard Healing (universal, hourly)
- [ ] Absorption Decay (power-rank damage per cycle)
- [ ] Corrosive Missile (power-rank damage per cycle, stepDown mechanism TBD)

## Patterns for Future Effects

### Duration-limited effect (e.g., Mercy KO, Stun, Sleep)

Use `count` + `autoDisable: true`. Effect triggers `count` times then removes itself. Pair with `statuses: ["unconscious"]` in aeOverrides to apply Foundry status.

### Area-effect DoT (e.g., Incendiary ammo, Flamethrower burn)

Register the effect on each target actor individually via `register` with:
- `type: "damage"`, `formula: <damage>`
- `rate: 1`, `cycle: "round"`
- `count: <duration in rounds>` (for fixed) or `-1` with manual removal

Use `area-template.js` to collect targets, loop over them with register calls.

### Intensity FEAT gate

Handled outside the engine — run the FEAT at attack resolution, call `register` only if the target fails. The engine does not currently have a "conditional registration on FEAT failure" primitive.
