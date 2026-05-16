// scripts/modules/actions/recovery-action.js v1.0.0 - 2026-05-15
// Power-rank FEAT for the Recovery power. RAW: "Recover lost End ranks:
// 1/day, Power rank FEAT." Success on green/yellow/red; white = failure.
// Once-per-day enforced via actor flag keyed by game date.

import { showFaseripDialog } from "./dialog-shim.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";
import { restoreOneEnduranceRank, getCurrentGameDate } from "../effects/ongoing-engine.js";

const SCOPE = () => (globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip");

function colorBg(c) {
  switch ((c || '').toLowerCase()) {
    case 'white':  return '#f5f5f0';
    case 'green':  return '#4CAF50';
    case 'yellow': return '#FFC107';
    case 'red':    return '#F44336';
    default:       return '#ddd';
  }
}

function colorFg(c) {
  switch ((c || '').toLowerCase()) {
    case 'white':  return '#1a1a1a';
    case 'green':  return '#fff';
    case 'yellow': return '#1a1a1a';
    case 'red':    return '#fff';
    default:       return '#1a1a1a';
  }
}

export async function showRecoveryFeatDialog(actor, item) {
  if (!actor || !item) {
    ui.notifications.warn("Recovery FEAT requires actor and power item.");
    return;
  }

  const scope = SCOPE();
  const powerRank = item.system?.rank || "Typical";
  const powerValue = game.msh?.getRankValue?.(powerRank) ?? 0;
  const rankShort = RANK_ABBR[powerRank] || powerRank;

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

  const dialogContent = `
    <div class="frp-dlg frp-feat">
      <div class="frp-header-v3">
        <span class="h-actor" title="${actor.name}">${actor.name}</span>
        <span class="h-paren">(</span>
        <span class="h-stat">
          <span class="h-stat-label">Recovery</span>
          <span class="h-stat-rank">${rankShort}</span>
          <span class="h-stat-val">${powerValue}</span>
        </span>
        <span class="h-paren">)</span>
      </div>
      <div class="frp-box" style="margin-top:8px;">
        <div style="font-size:0.95em;line-height:1.4;">
          Roll a <strong>${powerRank} FEAT</strong> to restore one Endurance rank.
          <div style="margin-top:4px;color:#666;font-size:0.88em;">
            Current: <strong>${currentRank}</strong> &rarr; Target: <strong>${originalRank}</strong>
          </div>
          <div style="margin-top:4px;color:#666;font-size:0.85em;">
            Success on Green/Yellow/Red. Failure (White) does not consume the daily attempt.
          </div>
        </div>
      </div>
      <div class="frp-foot">
        <button type="button" id="frp-roll" class="frp-btn frp-btn-primary">Roll Recovery FEAT</button>
        <button type="button" id="frp-cancel" class="frp-btn">Cancel</button>
      </div>
    </div>`;

  await showFaseripDialog({
    title: `Recovery — ${actor.name}`,
    content: dialogContent,
    render: (html, dlg, $dialog) => {
      const runRoll = async () => {
        const roll = new Roll("1d100");
        await roll.evaluate();

        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor }),
          flavor: `${actor.name} makes a Recovery FEAT (${powerRank})`,
          rollMode: game.settings.get("core", "rollMode")
        });

        const resultColor = game.msh.rollUniversalTable(powerRank, roll.total);
        const success = ["green", "yellow", "red"].includes(String(resultColor).toLowerCase());

        if (success) {
          await actor.setFlag(scope, "recoveryLastUsedDate", today);
          const restored = await restoreOneEnduranceRank(actor, { source: "Recovery" });
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `
              <div style="background-color:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
                <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.05em;color:#8b0000;">
                  <strong>Recovery FEAT</strong><br>
                  <span style="font-size:0.85em;font-weight:400;">${powerRank} (${powerValue}) &mdash; Power rank FEAT</span>
                </div>
                <div style="padding:5px 10px;font-size:0.9em;">
                  <div>Roll: ${roll.total}</div>
                </div>
                <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background-color:${colorBg(resultColor)};color:${colorFg(resultColor)};">
                  ${String(resultColor).toUpperCase()} &mdash; SUCCESS
                </div>
                <div style="padding:5px 10px;font-size:0.95em;text-align:center;">
                  ${restored?.restored
                    ? `Endurance restored: <strong>${restored.oldRank}</strong> &rarr; <strong>${restored.newRank}</strong>`
                    : `No rank to restore (already at cap).`}
                </div>
              </div>`
          });
        } else {
          // White = failure; daily attempt NOT consumed per common FEAT convention.
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `
              <div style="background-color:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
                <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.05em;color:#8b0000;">
                  <strong>Recovery FEAT</strong><br>
                  <span style="font-size:0.85em;font-weight:400;">${powerRank} (${powerValue}) &mdash; Power rank FEAT</span>
                </div>
                <div style="padding:5px 10px;font-size:0.9em;">
                  <div>Roll: ${roll.total}</div>
                </div>
                <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background-color:${colorBg(resultColor)};color:${colorFg(resultColor)};">
                  ${String(resultColor).toUpperCase()} &mdash; FAILURE
                </div>
                <div style="padding:5px 10px;font-size:0.85em;text-align:center;color:#666;">
                  No Endurance restored. May retry tomorrow.
                </div>
              </div>`
          });
        }
      };

      html.find('#frp-roll').on('click', async () => {
        try { await runRoll(); } finally { dlg.close(); }
      });
      html.find('#frp-cancel').on('click', () => dlg.close());
      html.find('#frp-roll').focus();
      $dialog.on('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          html.find('#frp-roll').trigger('click');
        }
      });
    }
  });
}
