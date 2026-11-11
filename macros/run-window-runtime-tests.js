// macros/run-window-runtime-tests.js v1.0.0 - 2026-11-11
// Script macro: run the window suite (scripts/dev/window-runtime-tests.js). GM only.
const mod = await import(`/systems/${game.system.id}/scripts/dev/window-runtime-tests.js?t=${Date.now()}`);
await mod.runWindowRuntimeTests({ postChat: true });
