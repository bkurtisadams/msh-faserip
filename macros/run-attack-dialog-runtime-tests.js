// macros/run-attack-dialog-runtime-tests.js v1.0.0 - 2026-11-11
// Script macro: run the attack dialog suite (scripts/dev/attack-dialog-runtime-tests.js).
// GM only, viewing a scene, with no attack dialog open. Pass { keepArtifacts: true }
// to keep the test actors and tokens for inspection.
const mod = await import(`/systems/${game.system.id}/scripts/dev/attack-dialog-runtime-tests.js?t=${Date.now()}`);
await mod.runAttackDialogRuntimeTests({ keepArtifacts: false, postChat: true });
