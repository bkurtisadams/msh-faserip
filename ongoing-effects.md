# Ongoing Effects Engine Reference

## Overview

`ongoing-engine.js` handles periodic/timed effects: Regeneration, Solar Regeneration, Dying, Recovery, Healing, Absorption decay, Corrosive damage, Impaired Endurance recovery. Config is stored in actor flags (`ongoing.<effectId>`), a matching AE with `ongoingId` flag is created on the actor. The engine processes all ongoing effects on every `updateWorldTime` tick.

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
| `"1rank"` | Special: steps Endurance rank up/down by 1 (for dying/impaired recovery) |
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
| `stat.loss` | `endurance` | Step rank down (with `1rank`), death at Shift-0 |
| `stat.gain` | `endurance` | Step rank up (with `1rank`), remove at original rank |

## Coverage Matrix

| Effect | effectId | type | stat | formula | rate | cycle | gates | interrupt | oncePerDay |
|--------|----------|------|------|---------|------|-------|-------|-----------|------------|
| Regeneration | `regeneration` | heal | health | @endurance | 10 | turn | noDamage | yes | no |
| Solar Regen | `solarRegeneration` | heal | health | @powerRank | 100 | turn | noDamage, daylight | yes | no |
| Standard Recovery | `recovery` | heal | health | @endurance | 10 | turn | noDamage, conscious | yes | yes |
| Standard Healing | `healing` | heal | health | @endurance | 1 | hour | noDamage | no | no |
| Dying | `dying` | stat.loss | endurance | 1rank | 1 | turn | none | no | no |
| Impaired Recovery | `impairedRecovery` | stat.gain | endurance | 1rank | 1 | week | none | no | no |
| Absorption Decay | `absorptionDecay` | damage | health | @powerRank | 10 | round | none | no | no |
| Corrosive | `corrosive` | damage | health | @powerRank | 1 | round | none | no | no |

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
```

### Power-Specific Shortcuts

```js
// These are also available as game.msh.ongoing.applyRegeneration, etc.
game.msh.startRegeneration(actor)       // finds power by regenerationType field
game.msh.startSolarRegeneration(actor)  // finds power by regenerationType:"solar"
game.msh.stopRegeneration(actor)        // removes both resting + solar
```

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

## Implementation Status

- [x] Core engine (processOngoingEffects, gates, formulas)
- [x] Regeneration (Resting) — auto-sync from power sheet
- [x] Solar Regeneration — auto-sync from power sheet
- [x] Damage interruption (interruptOngoingEffects via recordDamage)
- [ ] Dying (stat.loss/endurance)
- [ ] Standard Recovery (universal, once/day)
- [ ] Standard Healing (universal, hourly)
- [ ] Impaired Endurance Recovery
- [ ] Absorption Decay
- [ ] Corrosive Missile (stepDown mechanism TBD)
