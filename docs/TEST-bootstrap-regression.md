# Bootstrap Regression Tests

These tests cover the repairs made to `system.json`, `template.json`, and `scripts/init.js` in system version 2.1.10.

## 1. Node regression suite

Run from the root of the `msh-faserip` system folder:

```powershell
npm test
```

No package installation is required. The test suite uses only Node's built-in modules.

The Node suite checks:

- V14 manifest dependency, grid, and bootstrap fields
- LevelDB compendium paths
- Actor and Item type agreement between `system.json` and `template.json`
- Death-state, Power, and vehicle schema defaults
- Nested, flattened, and replicated Health-update wiring
- Configurable combat turn timing
- CTT public API wiring, Per Turn sync, Per Round sync, and Time Authority clock ownership
- Recovery and Healing timers being round-based rather than combatant-turn-based
- Multi-step elapsed Dying processing
- Legacy column-shift forwarding
- JavaScript syntax for every `.js` and `.mjs` file
- Import resolution for every module reachable from `scripts/init.js`

A successful run ends with:

```text
# tests 12
# pass 12
# fail 0
```

## 2. Foundry GM runtime suite

Run this outside an active encounter. A Scene must exist for the temporary Combat test.

1. Start Foundry and enter a world as the GM.
2. Create a **Script** Macro.
3. Paste the contents of:

```text
macros/run-bootstrap-runtime-tests.js
```

4. Run the Macro.

The suite temporarily changes relevant world settings, creates test Actors and an inactive Combat, then restores the settings and deletes the temporary documents. It whispers a result card to the GMs and also prints details to the browser console.

The runtime suite checks:

- Character, Power, and vehicle defaults after real Foundry document creation
- Nested and flattened Health changes through the actual Actor hooks
- Recovery timers remaining unchanged on individual combatant turns
- Recovery timers losing exactly one turn when the round changes
- `turnSeconds` being passed to `game.time.advance`
- CTT public API availability
- Per Turn synchronization advancing exactly once
- Per Round synchronization advancing exactly once without the CTT compatibility bridge duplicating it
- Time Authority suppressing the older direct world-time combat clock
- FASERIP campaign date/time reading from CTT
- Multiple sequential Dying steps
- Legacy `rollUniversalAction` forwarding shift, Karma, and options

Calendar Time Tracker produces a **SKIP**, not a failure, only when that module is not active. With CTT 2.1.1 active, the CTT checks should pass rather than skip.

Set `keepArtifacts: true` in the Macro only when inspecting the temporary test documents. Delete them manually afterward.

## 3. Player-to-GM Health probe

This test requires a connected GM and a separate non-GM player client.

1. Give the player Owner permission over a healthy test Actor.
2. Have the player select that Actor's token.
3. On the player client, create and run a Script Macro containing:

```text
macros/player-health-update-probe.js
```

The probe reduces Health by one using a flattened update. It waits for the GM-side damage hook to record the damage timestamp, reports PASS or FAIL, restores Health, removes effects created by the probe, and restores the previous damage flags.

This is the only test that directly exercises the original cross-client case. The GM runtime suite tests the same update forms locally, but a true replicated update requires two connected clients.

## Recommended routine

Run `npm test` before each commit that touches the manifest, schema, imports, combat timing, Health hooks, or compatibility API. Run the Foundry GM suite after those commits and before publishing a system release. Run the player probe whenever Health-update or socket behavior changes.
