// macros/run-karma-dialog-runtime-tests.js v1.0.0 - 2026-11-11
// Script macro: run the Karma dialog suite (scripts/dev/karma-dialog-runtime-tests.js). GM only.
const mod = await import(`/systems/${game.system.id}/scripts/dev/karma-dialog-runtime-tests.js?t=${Date.now()}`);
await mod.runKarmaDialogRuntimeTests({ keepArtifacts: false, postChat: true });
