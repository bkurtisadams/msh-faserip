// scripts/modules/actions/recovery-action.js v2.2.0 - 2026-07-05
// v2.2.0: RAW conformance (Kurt ruling). Revert the v2.1.0 dying-clear -- RAW
//         Recovery only regains lost Endurance ranks and says nothing about the
//         Kill/dying state (a separate axis, resolved by per-turn Endurance
//         FEATs). Also make a failed FEAT consume the daily attempt (RAW: one
//         Power rank FEAT per day), matching the "retry tomorrow" card text.
// v2.1.0: (reverted in v2.2.0 as non-RAW) A successful Recovery cleared a dying
//         state via RestSystem.stabilizeDying.
// scripts/modules/actions/recovery-action.js v2.0.1 - 2026-07-03
// v2.0.1: Lock the intensity dropdown (Recovery has no target intensity — RAW
//         any colored result succeeds) and add an explanatory hint, via the
//         new lockIntensity/intensityHint opts.
// scripts/modules/actions/recovery-action.js v2.0.0 - 2026-07-03
// v2.0.0: Migrate onto the shared Power FEAT engine (powers audit Step #5,
//         slice 5a). Preconditions (once-per-day gate, restore-needed) stay
//         here; the roll / color / success / card now run through
//         showGenericFeatDialog({ power, ... }). Effect (Endurance restore +
//         daily flag) is applied in onResult, which returns the card's effect
//         line. Replaces the ~170-line bespoke dialog from v1.x.
// v1.0.1: Fix render-callback signature. (superseded)
// v1.0.0: Initial. RAW: "Recover lost End ranks: 1/day, Power rank FEAT."
//         Success on green/yellow/red; white = failure. Once-per-day enforced
//         via actor flag keyed by game date.

import { showGenericFeatDialog } from "./generic-feat-dialog.js";
import { restoreOneEnduranceRank, getCurrentGameDate } from "../effects/ongoing-engine.js";

const SCOPE = () => (globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip");

export async function showRecoveryFeatDialog(actor, item) {
  if (!actor || !item) {
    ui.notifications.warn("Recovery FEAT requires actor and power item.");
    return;
  }

  const scope = SCOPE();

  // ── Once-per-day gate ───────────────────────────────────────────────
  const today = getCurrentGameDate();
  const lastUsed = actor.getFlag(scope, "recoveryLastUsedDate");
  if (lastUsed && lastUsed === today) {
    ui.notifications.warn(`${actor.name} has already used Recovery today.`);
    return;
  }

  // ── State check: anything to restore? ───────────────────────────────
  const currentRank = actor.system?.abilities?.endurance?.rank;
  const originalRank = actor.getFlag(scope, "originalEndurance") || currentRank;
  if (currentRank === originalRank) {
    ui.notifications.info(`${actor.name}'s Endurance is already at full rank (${originalRank}). No need for Recovery.`);
    return;
  }

  // Roll the power's rank as a FEAT through the shared engine. No intensity:
  // RAW colored result (green/yellow/red) = success, white = failure.
  return showGenericFeatDialog(actor, {
    power: item,
    label: "Recovery",
    intensity: "None",
    lockIntensity: true,
    intensityHint: "Fixed by Recovery — any colored result (Green/Yellow/Red) restores one Endurance rank; White fails.",
    onResult: async ({ success }) => {
      // RAW: one Power rank FEAT per day. Either outcome consumes the attempt.
      await actor.setFlag(scope, "recoveryLastUsedDate", today);
      if (!success) {
        return `<div style="padding:5px 10px;font-size:0.85em;text-align:center;color:#666;">No Endurance restored. May retry tomorrow.</div>`;
      }
      const restored = await restoreOneEnduranceRank(actor, { source: "Recovery" });
      return restored?.restored
        ? `<div style="padding:5px 10px;font-size:0.95em;text-align:center;">Endurance restored: <strong>${restored.oldRank}</strong> &rarr; <strong>${restored.newRank}</strong></div>`
        : `<div style="padding:5px 10px;font-size:0.95em;text-align:center;">No rank to restore (already at cap).</div>`;
    }
  });
}
