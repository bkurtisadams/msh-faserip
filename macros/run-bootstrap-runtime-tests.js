// File: macros/run-bootstrap-runtime-tests.js v1.0.0 - 2026-09-01
// Launcher for scripts/dev/runtime-regression-tests.js. Create a script
// macro with these contents (or paste into the console) and run as GM.
// Options: keepArtifacts leaves the ZZZ test documents in place for
// inspection; postChat controls the chat report.

const mod = await import('/systems/msh-faserip/scripts/dev/runtime-regression-tests.js');
const summary = await mod.runBootstrapRuntimeTests({ keepArtifacts: false, postChat: true });
console.log(`[FASERIP TEST] runtime suite: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped`);
