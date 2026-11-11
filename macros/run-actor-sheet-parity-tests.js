// macros/run-actor-sheet-parity-tests.js v1.0.0 - 2026-11-11
// Script macro: compare the V1 and V2 character sheets on a throwaway actor
// (scripts/dev/actor-sheet-parity-tests.js). GM only. Works whichever sheet
// the "Use V2 Character Sheet" setting currently selects.
const mod = await import(`/systems/${game.system.id}/scripts/dev/actor-sheet-parity-tests.js?t=${Date.now()}`);
await mod.runActorSheetParityTests({ keepArtifacts: false, postChat: true });
