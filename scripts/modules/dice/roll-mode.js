// scripts/modules/dice/roll-mode.js v1.0.0 - 2026-11-10
// Roll visibility mode. v14 renamed core.rollMode to core.messageMode; the old
// key is deprecated and goes away in v16. Leaf module, no imports.

export function getRollMode() {
  try { return game.settings.get("core", "messageMode"); }
  catch { try { return game.settings.get("core", "rollMode"); } catch { return undefined; } }
}
