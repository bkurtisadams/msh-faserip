// scripts/modules/actions/healing-action.js v2.0.1 - 2026-07-03
// Two-mode dialog for the Healing power. Restores lost Health/End to others
// (not self). Power rank = max Health per target per day (the daily cap only).
// RAW (rulebook): BOTH modes make an ENDURANCE FEAT (the healer's Endurance),
// not a Power-rank FEAT.
//   Health mode: heal up to cap; Endurance FEAT; fail -> healer loses Karma =
//                amount healed. A character without Karma may not Heal.
//   End-rank mode: 1 rank/day per target; Endurance FEAT; the TARGET's rank is
//                restored regardless of the FEAT; on FAILURE the HEALER loses
//                one Endurance rank (below Feeble -> healer perishes, RAW).
// v2.0.1: Lock dialog width (was ballooning to full width on the long End-mode
//         panel line, same AppV2 position.width 'auto' bug as the other
//         dialogs) and fix the window-title arrow (&rarr; -> → ; titles are
//         plain text, not HTML).
// v2.0.0: Route both rolls through the shared headless resolver
//         (rules/feat-core.js, powers audit Step #5 fork C(b)) and FIX RAW:
//         End-rank mode now rolls Endurance (was Power rank) and heals the
//         target regardless of success; add the no-Karma gate on Health mode.
// v1.0.0: Initial two-mode dialog. (End-rank FEAT base + gating were wrong.)
// Target selection via game.user.targets (must be exactly one, not self).

import { showFaseripDialog } from "./dialog-shim.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";
import { deductKarma, getAvailableKarma } from "../dice/dice-roller.js";
import { resolveFeat } from "../../rules/feat-core.js";
import {
  restoreOneEnduranceRank,
  loseOneEnduranceRank,
  getCurrentGameDate,
} from "../effects/ongoing-engine.js";

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

function getHealingDailyCap(healer, targetUuid, today, rank) {
  const scope = SCOPE();
  const cap = healer.getFlag(scope, "healing.dailyCap") || {};
  const entry = cap[targetUuid];
  if (!entry || entry.date !== today) return rank;
  return Math.max(0, rank - (entry.amount || 0));
}

async function recordHealingHealth(healer, targetUuid, today, amount) {
  const scope = SCOPE();
  const cap = foundry.utils.deepClone(healer.getFlag(scope, "healing.dailyCap") || {});
  const entry = cap[targetUuid];
  if (!entry || entry.date !== today) {
    cap[targetUuid] = { date: today, amount };
  } else {
    cap[targetUuid] = { date: today, amount: (entry.amount || 0) + amount };
  }
  await healer.setFlag(scope, "healing.dailyCap", cap);
}

export async function showHealingDialog(healer, item) {
  if (!healer || !item) {
    ui.notifications.warn("Healing requires actor and power item.");
    return;
  }

  // ── Target resolution: exactly one target, not self ─────────────────
  const targets = Array.from(game.user.targets || []);
  if (targets.length !== 1) {
    ui.notifications.warn("Healing requires exactly one target. Select a single target token.");
    return;
  }
  const targetToken = targets[0];
  const target = targetToken.actor;
  if (!target) {
    ui.notifications.warn("Target has no actor.");
    return;
  }
  if (target.uuid === healer.uuid) {
    ui.notifications.warn(`${healer.name} cannot heal themselves with the Healing power.`);
    return;
  }

  const scope = SCOPE();
  const powerRank = item.system?.rank || "Typical";
  const powerValue = game.msh?.getRankValue?.(powerRank) ?? 0;
  const rankShort = RANK_ABBR[powerRank] || powerRank;
  const today = getCurrentGameDate();

  // ── Pre-flight: Health state ─────────────────────────────────────────
  const tHp = Number(target.system?.attributes?.health?.value ?? 0);
  const tHpMax = Number(target.system?.attributes?.health?.max ?? tHp);
  const missingHp = Math.max(0, tHpMax - tHp);
  const dailyCapRemaining = getHealingDailyCap(healer, target.uuid, today, powerValue);
  const healthMaxThisRoll = Math.min(powerValue, missingHp, dailyCapRemaining);

  // ── Pre-flight: End-rank state ───────────────────────────────────────
  const tEndCurrent = target.system?.abilities?.endurance?.rank;
  const tEndOriginal = target.getFlag(scope, "originalEndurance") || tEndCurrent;
  const tEndImpaired = tEndCurrent !== tEndOriginal;
  const endLastUsed = healer.getFlag(scope, "healingEndLastUsedDate");
  const endModeAvailable = !endLastUsed || endLastUsed !== today;

  // Healer endurance for the FEAT (RAW: both modes use the healer's Endurance).
  const healerEndRank = healer.system?.abilities?.endurance?.rank || "Typical";
  const healerEndValue = healer.system?.abilities?.endurance?.value || 0;
  const healerEndShort = RANK_ABBR[healerEndRank] || healerEndRank;

  // RAW: "A character without Karma may not Heal" — gate Health mode (whose
  // failure costs Karma). End-rank mode risks Endurance, not Karma.
  const healerHasKarma = getAvailableKarma(healer) > 0;

  const healthDisabled = healthMaxThisRoll <= 0 || !healerHasKarma;
  const endDisabled = !tEndImpaired || !endModeAvailable;

  // ── Both modes blocked? ──────────────────────────────────────────────
  if (healthDisabled && endDisabled) {
    ui.notifications.info(`${healer.name} cannot Heal ${target.name} right now (no eligible Health or Endurance restoration).`);
    return;
  }

  const defaultMode = !healthDisabled ? "health" : "end";

  const dialogContent = `
    <div class="frp-dlg frp-feat">
      <div class="frp-header-v3">
        <span class="h-actor" title="${healer.name}">${healer.name}</span>
        <span class="h-paren">&rarr;</span>
        <span class="h-actor" title="${target.name}">${target.name}</span>
        <span class="h-paren">(</span>
        <span class="h-stat">
          <span class="h-stat-label">Healing</span>
          <span class="h-stat-rank">${rankShort}</span>
          <span class="h-stat-val">${powerValue}</span>
        </span>
        <span class="h-paren">)</span>
      </div>

      <div class="frp-box" style="margin-top:8px;">
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="frp-box-label" style="margin:0;color:var(--feat-deep);">MODE</span>
          <label style="display:inline-flex;align-items:center;gap:4px;${healthDisabled ? 'opacity:0.5;' : ''}">
            <input type="radio" name="heal-mode" value="health" ${defaultMode === "health" ? "checked" : ""} ${healthDisabled ? "disabled" : ""}>
            Health
          </label>
          <label style="display:inline-flex;align-items:center;gap:4px;${endDisabled ? 'opacity:0.5;' : ''}">
            <input type="radio" name="heal-mode" value="end" ${defaultMode === "end" ? "checked" : ""} ${endDisabled ? "disabled" : ""}>
            Endurance Rank
          </label>
        </div>
      </div>

      <div id="heal-health-panel" class="frp-box" style="margin-top:6px;${defaultMode !== "health" ? "display:none;" : ""}">
        <div style="font-size:0.9em;line-height:1.5;">
          <div>Target HP: <strong>${tHp} / ${tHpMax}</strong> (missing ${missingHp})</div>
          <div>Daily cap remaining for ${target.name}: <strong>${dailyCapRemaining}</strong> / ${powerValue}</div>
          <div style="margin-top:6px;display:flex;gap:6px;align-items:center;">
            <span style="color:var(--feat-deep);font-weight:700;">Amount:</span>
            <input type="number" id="heal-amount" min="1" max="${healthMaxThisRoll}" value="${healthMaxThisRoll}" style="width:70px;text-align:center;">
            <span style="color:#666;">(up to ${healthMaxThisRoll})</span>
          </div>
          <div style="margin-top:6px;color:#666;font-size:0.85em;">
            Endurance FEAT (${healer.name}: ${healerEndShort} ${healerEndValue}).
            Fail &rarr; healer loses Karma equal to the amount healed.${!healerHasKarma ? ' <span style="color:#c62828;">No Karma &mdash; may not Heal (RAW).</span>' : ''}
          </div>
        </div>
      </div>

      <div id="heal-end-panel" class="frp-box" style="margin-top:6px;${defaultMode !== "end" ? "display:none;" : ""}">
        <div style="font-size:0.9em;line-height:1.5;">
          ${tEndImpaired
            ? `<div>Target End: <strong>${tEndCurrent}</strong> &rarr; restore to <strong>${tEndOriginal}</strong> (1 rank).</div>`
            : `<div style="color:#c62828;">${target.name}'s Endurance is at full rank. Nothing to restore.</div>`}
          ${!endModeAvailable
            ? `<div style="color:#c62828;">${healer.name} has already used End-rank healing today.</div>`
            : ""}
          <div style="margin-top:6px;color:#666;font-size:0.85em;">
            Endurance FEAT (${healerEndShort} ${healerEndValue}). Healer uses 1/day.<br>
            Target's Endurance is restored regardless; on a failed FEAT the healer loses 1 Endurance rank (below Feeble &rarr; healer perishes, RAW).
          </div>
        </div>
      </div>

      <div class="frp-foot" style="margin-top:8px;">
        <button type="button" id="frp-roll" class="frp-btn frp-btn-primary">Roll FEAT</button>
        <button type="button" id="frp-cancel" class="frp-btn">Cancel</button>
      </div>
    </div>`;

  await showFaseripDialog({
    title: `Healing — ${healer.name} → ${target.name}`,
    content: dialogContent,
    render: async (html, dlg) => {
      const $dialog = html.closest('.dialog');

      // Fix width so the long End-mode explanation can't force the dialog wide
      // (AppV2 re-applies position.width 'auto' on re-measure). Same fix as the
      // energy / generic-feat dialogs.
      if ($dialog.length) {
        $dialog.css('width', '400px');
        $dialog[0].style.height = 'auto';
      }
      try { dlg?.setPosition?.({ width: 400 }); } catch (_) {}

      // Mode toggle
      html.find('input[name="heal-mode"]').on('change', (ev) => {
        const mode = ev.currentTarget.value;
        html.find('#heal-health-panel').toggle(mode === "health");
        html.find('#heal-end-panel').toggle(mode === "end");
      });

      const runHealthRoll = async (amount) => {
        if (amount <= 0 || amount > healthMaxThisRoll) {
          ui.notifications.warn(`Invalid heal amount: ${amount} (max ${healthMaxThisRoll}).`);
          return;
        }
        // RAW: without Karma the healer may not Heal.
        if (getAvailableKarma(healer) <= 0) {
          ui.notifications.warn(`${healer.name} has no Karma — may not Heal (RAW).`);
          return;
        }
        // Endurance FEAT for the healer (shared headless resolver).
        const { color: resultColor, success, roll } = await resolveFeat({
          actor: healer,
          rank: healerEndRank,
          flavor: `${healer.name} makes an Endurance FEAT to heal ${target.name} (${amount} HP)`
        });

        if (success) {
          const tHpNow = Number(target.system?.attributes?.health?.value ?? 0);
          const tHpMaxNow = Number(target.system?.attributes?.health?.max ?? tHpNow);
          const newHp = Math.min(tHpMaxNow, tHpNow + amount);
          const actualHealed = newHp - tHpNow;
          await target.update({ "system.attributes.health.value": newHp });
          await recordHealingHealth(healer, target.uuid, today, actualHealed);

          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: healer }),
            content: `
              <div style="background-color:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
                <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.05em;color:#8b0000;">
                  <strong>Healing FEAT &mdash; Health</strong><br>
                  <span style="font-size:0.85em;font-weight:400;">${healer.name} &rarr; ${target.name}</span>
                </div>
                <div style="padding:5px 10px;font-size:0.9em;">
                  <div>Endurance FEAT (${healerEndRank} ${healerEndValue}). Roll: ${roll.total}</div>
                  <div>Amount attempted: ${amount}</div>
                </div>
                <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background-color:${colorBg(resultColor)};color:${colorFg(resultColor)};">
                  ${String(resultColor).toUpperCase()} &mdash; SUCCESS
                </div>
                <div style="padding:5px 10px;font-size:0.95em;text-align:center;">
                  ${target.name} healed for <strong>${actualHealed}</strong> HP (${tHpNow} &rarr; ${newHp}).
                </div>
              </div>`
          });
        } else {
          // Failure: healer loses Karma = attempted amount
          await deductKarma(healer, amount, `Healing FEAT failure (${target.name})`);
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: healer }),
            content: `
              <div style="background-color:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
                <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.05em;color:#8b0000;">
                  <strong>Healing FEAT &mdash; Health</strong><br>
                  <span style="font-size:0.85em;font-weight:400;">${healer.name} &rarr; ${target.name}</span>
                </div>
                <div style="padding:5px 10px;font-size:0.9em;">
                  <div>Endurance FEAT (${healerEndRank} ${healerEndValue}). Roll: ${roll.total}</div>
                  <div>Amount attempted: ${amount}</div>
                </div>
                <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background-color:${colorBg(resultColor)};color:${colorFg(resultColor)};">
                  ${String(resultColor).toUpperCase()} &mdash; FAILURE
                </div>
                <div style="padding:5px 10px;font-size:0.95em;text-align:center;color:#c62828;">
                  ${healer.name} lost <strong>${amount} Karma</strong>.
                </div>
              </div>`
          });
        }
      };

      const runEndRoll = async () => {
        if (!tEndImpaired) {
          ui.notifications.warn(`${target.name} has no lost Endurance to restore.`);
          return;
        }
        if (!endModeAvailable) {
          ui.notifications.warn(`${healer.name} already used End-rank healing today.`);
          return;
        }

        // RAW: End-rank healing uses an ENDURANCE FEAT (the healer's Endurance),
        // not the Power rank.
        const { color: resultColor, success, roll } = await resolveFeat({
          actor: healer,
          rank: healerEndRank,
          flavor: `${healer.name} makes an Endurance FEAT to restore ${target.name}'s Endurance`
        });

        // 1/day attempt regardless of outcome.
        await healer.setFlag(scope, "healingEndLastUsedDate", today);

        // RAW: the target's Endurance is restored regardless of the FEAT.
        const restored = await restoreOneEnduranceRank(target, { source: `Healing by ${healer.name}` });

        // RAW: on a FAILED FEAT the HEALER loses one Endurance rank (below
        // Feeble -> healer perishes). Success costs the healer nothing.
        let lost = null, dieWarning = "";
        if (!success) {
          lost = await loseOneEnduranceRank(healer, { source: `Failed Healing on ${target.name}` });
          if (lost?.belowFeeble) {
            dieWarning = `<div style="margin-top:6px;padding:6px;background:#c62828;color:#fff;text-align:center;font-weight:bold;">${healer.name}'s Endurance dropped below Feeble &mdash; the healer perishes (RAW). GM resolves.</div>`;
          }
        }

        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: healer }),
          content: `
            <div style="background-color:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
              <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.05em;color:#8b0000;">
                <strong>Healing FEAT &mdash; Endurance Rank</strong><br>
                <span style="font-size:0.85em;font-weight:400;">${healer.name} &rarr; ${target.name}</span>
              </div>
              <div style="padding:5px 10px;font-size:0.9em;">
                <div>Endurance FEAT (${healerEndShort} ${healerEndValue}). Roll: ${roll.total}</div>
              </div>
              <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background-color:${colorBg(resultColor)};color:${colorFg(resultColor)};">
                ${String(resultColor).toUpperCase()} &mdash; ${success ? "SUCCESS" : "FAILURE"}
              </div>
              <div style="padding:5px 10px;font-size:0.95em;text-align:center;">
                ${restored?.restored
                  ? `${target.name} Endurance restored: <strong>${restored.oldRank}</strong> &rarr; <strong>${restored.newRank}</strong>`
                  : `${target.name}: no rank restored (already at cap).`}
              </div>
              ${!success ? `<div style="padding:5px 10px;font-size:0.95em;text-align:center;color:#c62828;">
                ${lost?.lost
                  ? `${healer.name} lost 1 Endurance rank: <strong>${lost.oldRank}</strong> &rarr; <strong>${lost.newRank}</strong>`
                  : `${healer.name} could not lose Endurance (already at floor).`}
              </div>` : ""}
              ${dieWarning}
            </div>`
        });
      };

      const runRoll = async () => {
        const mode = html.find('input[name="heal-mode"]:checked').val();
        if (mode === "end") {
          await runEndRoll();
        } else {
          const amount = Math.max(1, Math.min(healthMaxThisRoll, Number(html.find('#heal-amount').val() || 0)));
          await runHealthRoll(amount);
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
