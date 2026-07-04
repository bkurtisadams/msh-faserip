// scripts/rules/feat-core.js v1.0.0 - 2026-07-03
// Headless FEAT resolver (powers audit Step #5, fork C(b)). Rolls d100, posts
// the roll to chat (optional flavor), resolves the color on the Universal
// Table, and reports success — with NO result card. The caller owns its own
// output. Used by action handlers that resolve a FEAT inside their own dialog
// (e.g. Healing) where the full generic-feat-dialog would be a nested dialog.
//
// resolveFeat({ actor, rank, flavor?, requiredColor?, postRoll? })
//   -> { color, success, roll, total }
// requiredColor null  => any colored result (green/yellow/red) succeeds, white
//                        fails (RAW: FEAT with no stated intensity).
// requiredColor "green"|"yellow"|"red" => success if color meets/exceeds it.

const COLOR_ORDER = { white: 0, green: 1, yellow: 2, red: 3 };

export const isColoredResult = (c) => (COLOR_ORDER[String(c).toLowerCase()] ?? 0) >= 1;

export const meetsColorRequirement = (color, required) =>
  (COLOR_ORDER[String(color).toLowerCase()] ?? 0) >= (COLOR_ORDER[String(required).toLowerCase()] ?? 0);

export async function resolveFeat({ actor, rank, flavor = "", requiredColor = null, postRoll = true }) {
  const roll = new Roll("1d100");
  await roll.evaluate();
  if (postRoll) {
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: flavor || undefined,
      rollMode: game.settings.get("core", "rollMode")
    });
  }
  const color = game.msh.rollUniversalTable(rank, roll.total);
  const success = requiredColor ? meetsColorRequirement(color, requiredColor) : isColoredResult(color);
  return { color, success, roll, total: roll.total };
}
