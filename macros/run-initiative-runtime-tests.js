// macros/run-initiative-runtime-tests.js v1.0.0 - 2026-09-09
// Script macro: run the RAW initiative flow suite (scripts/dev/initiative-runtime-tests.js).
// GM only; end any active combat first. Pass { keepArtifacts: true } to keep the test
// actors, tokens and combat for inspection.
const mod = await import(`/systems/${game.system.id}/scripts/dev/initiative-runtime-tests.js?t=${Date.now()}`);
await mod.runInitiativeRuntimeTests({ keepArtifacts: false, postChat: true });
