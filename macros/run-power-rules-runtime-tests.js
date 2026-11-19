// macros/run-power-rules-runtime-tests.js v1.0.0 - 2026-11-19
// Script macro: run the power rules suite (scripts/dev/power-rules-runtime-tests.js).
// GM only, with no Edit Power sheet or dialog open. Pass { keepArtifacts: true }
// to keep the test actors for inspection.
const mod = await import(`/systems/${game.system.id}/scripts/dev/power-rules-runtime-tests.js?t=${Date.now()}`);
await mod.runPowerRulesRuntimeTests({ keepArtifacts: false, postChat: true });
