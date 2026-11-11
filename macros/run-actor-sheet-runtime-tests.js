// macros/run-actor-sheet-runtime-tests.js v1.0.0 - 2026-11-11
// Script macro: run the character sheet suite (scripts/dev/actor-sheet-runtime-tests.js). GM only.
const mod = await import(`/systems/${game.system.id}/scripts/dev/actor-sheet-runtime-tests.js?t=${Date.now()}`);
await mod.runActorSheetRuntimeTests({ keepArtifacts: false, postChat: true });
