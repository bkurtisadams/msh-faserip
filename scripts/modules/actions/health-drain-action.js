// scripts/modules/actions/health-drain-action.js v1.1.0 - 2026-05-15
// v1.1.0: Add Fighting FEAT to hit. CS row + karma checkbox + post-roll
//         karma decision dialog (Paralyzing Touch v1.1.x pattern). Miss
//         path skips the drain entirely. Hit path proceeds with the
//         original drain math + target-at-0 End FEAT chain. Result-preview
//         grid in dialog. Target's End FEAT (drained-to-0) still has no
//         karma controls — target-side defense decision, GM-managed.
// v1.0.0: Single-target touch dialog. No FEAT (auto on touch).
// RAW: "The touch of a character with this Power transfers a Power rank
//       amount of Health from the target to the hero. Previous damage is
//       healed in an equal amount, up to the maximum Health of the
//       character. Drained Health above that point is lost. Characters
//       drained to 0 Health must make an Endurance FEAT to avoid dying.
//       If they do so, the attack has no further effect."

import { showFaseripDialog } from "./dialog-shim.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";
import {
  generateKarmaControlsHTML,
  setupKarmaControlHandlers,
  getAvailableKarma,
  showKarmaDecisionDialog,
} from "../dice/dice-roller.js";
import { applyColumnShifts } from "../dice/column-shifts.js";
import { buildCSRow, wireCSPanel } from "./cs-modifiers.js";

const SCOPE = () => (globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip");

function getRollMode() {
  try { return game.settings.get("core", "messageMode"); }
  catch { try { return game.settings.get("core", "rollMode"); } catch { return undefined; } }
}

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

export async function showHealthDrainDialog(hero, item) {
  if (!hero || !item) {
    ui.notifications.warn("Health-Drain Touch requires actor and power item.");
    return;
  }

  const targets = Array.from(game.user.targets || []);
  if (targets.length !== 1) {
    ui.notifications.warn("Health-Drain Touch requires exactly one target. Select a single token.");
    return;
  }
  const targetToken = targets[0];
  const target = targetToken.actor;
  if (!target) {
    ui.notifications.warn("Target has no actor.");
    return;
  }
  if (target.uuid === hero.uuid) {
    ui.notifications.warn(`${hero.name} cannot drain themselves with Health-Drain Touch.`);
    return;
  }

  const powerRank = item.system?.rank || "Typical";
  const powerValue = game.msh?.getRankValue?.(powerRank) ?? 0;
  const rankShort = RANK_ABBR[powerRank] || powerRank;

  const heroFightRank = hero.system?.abilities?.fighting?.rank || "Typical";
  const heroFightValue = hero.system?.abilities?.fighting?.value || 0;
  const heroFightShort = RANK_ABBR[heroFightRank] || heroFightRank;

  const tHp = Number(target.system?.attributes?.health?.value ?? 0);
  const hHp = Number(hero.system?.attributes?.health?.value ?? 0);
  const hMax = Number(hero.system?.attributes?.health?.max ?? hHp);
  const hMissing = Math.max(0, hMax - hHp);

  if (tHp <= 0) {
    ui.notifications.warn(`${target.name} has no Health to drain.`);
    return;
  }

  const maxDrain = Math.min(powerValue, tHp);
  const defaultDrain = Math.min(maxDrain, Math.max(hMissing, 1));

  const csRowHtml = buildCSRow({ savedCS: 0, abilityRank: heroFightRank });
  const karmaHtml = generateKarmaControlsHTML(hero, false);

  const dialogContent = `
    <div class="frp-dlg frp-feat">
      <div class="frp-header-v3">
        <span class="h-actor" title="${hero.name}">${hero.name}</span>
        <span class="h-paren">(</span>
        <span class="h-stat">
          <span class="h-stat-label">Base Fighting:</span>
          <span class="h-stat-rank">${heroFightShort} ${heroFightValue}</span>
        </span>
        <span class="h-paren">)</span>
        <span class="h-verb">drains</span>
        <span class="h-target" title="${target.name}">${target.name}</span>
      </div>

      ${csRowHtml}

      <div class="frp-box" style="margin-top:6px;">
        <div style="font-size:0.9em;line-height:1.5;">
          <div>${hero.name}: <strong>${hHp} / ${hMax}</strong> (missing ${hMissing})</div>
          <div>${target.name}: <strong>${tHp}</strong> HP</div>
        </div>
      </div>

      <div class="frp-box" style="margin-top:6px;">
        <div style="display:flex;gap:6px;align-items:center;">
          <span class="frp-box-label" style="margin:0;color:var(--feat-deep);">DRAIN</span>
          <input type="number" id="hd-amount" min="1" max="${maxDrain}" value="${defaultDrain}" style="width:70px;text-align:center;">
          <span id="hd-cap" style="color:#666;">(up to ${maxDrain})</span>
        </div>
        <div id="hd-preview" style="margin-top:6px;color:#666;font-size:0.88em;line-height:1.4;"></div>
      </div>

      <div class="frp-box frp-opts-box" style="margin-top:6px;">
        ${karmaHtml}
      </div>

      <div class="frp-fx-grid">
        <div class="frp-fx-cell w">Miss</div>
        <div class="frp-fx-cell g">Hit &rarr; Drain</div>
        <div class="frp-fx-cell y">Hit &rarr; Drain</div>
        <div class="frp-fx-cell r">Hit &rarr; Drain</div>
      </div>

      <div class="frp-foot" style="margin-top:8px;">
        <button type="button" id="frp-roll" class="frp-btn frp-btn-primary">Touch &amp; Drain</button>
        <button type="button" id="frp-cancel" class="frp-btn">Cancel</button>
      </div>
    </div>`;

  await showFaseripDialog({
    title: `Health-Drain Touch — ${hero.name}`,
    content: dialogContent,
    render: async (html, dlg) => {
      const $dialog = html.closest('.dialog');
      const $amt = html.find('#hd-amount');
      const $preview = html.find('#hd-preview');

      const csPanel = wireCSPanel(html, { abilityRank: heroFightRank });
      setupKarmaControlHandlers(html);

      const recompute = () => {
        const amount = Math.max(1, Math.min(maxDrain, Number($amt.val() || 1)));
        const targetAfter = Math.max(0, tHp - amount);
        const heroHeal = Math.min(amount, hMissing);
        const heroAfter = Math.min(hMax, hHp + heroHeal);
        const lost = amount - heroHeal;
        const zeroWarn = targetAfter === 0
          ? `<div style="color:#c62828;margin-top:4px;">${target.name} reaches 0 HP &mdash; will roll End FEAT vs ${powerRank} to avoid dying.</div>`
          : "";
        const lostNote = lost > 0
          ? `<div style="color:#666;font-size:0.85em;margin-top:2px;">(${lost} HP drained above ${hero.name}'s max &mdash; lost per RAW)</div>`
          : "";
        $preview.html(
          `${target.name}: ${tHp} &rarr; ${targetAfter}<br>` +
          `${hero.name}: ${hHp} &rarr; ${heroAfter}` +
          lostNote +
          zeroWarn
        );
      };
      $amt.on('input', recompute);
      recompute();

      const commit = async () => {
        // ── Fighting FEAT with CS + karma ──
        const csInfo = csPanel ? csPanel.get() : { totalShift: 0, manualCS: 0 };
        const shift = Number(csInfo.totalShift) || 0;
        const effectiveFightRank = shift !== 0 ? applyColumnShifts(heroFightRank, shift).name : heroFightRank;
        const effectiveFightValue = game.msh?.getRankValue?.(effectiveFightRank) ?? heroFightValue;
        const spendKarma = html.find('#spend-karma').is(':checked');

        const fightRoll = new Roll("1d100");
        await fightRoll.evaluate();
        await fightRoll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: hero }),
          flavor: `${hero.name} makes a Fighting FEAT to touch ${target.name} (Health-Drain)`,
          rollMode: getRollMode()
        });

        let cappedTotal = fightRoll.total;
        let karmaUsed = 0;
        if (spendKarma && getAvailableKarma(hero) > 0) {
          const initialColor = game.msh.rollUniversalTable(effectiveFightRank, fightRoll.total);
          const karmaResult = await showKarmaDecisionDialog(
            hero, fightRoll.total, effectiveFightRank, "Health-Drain (Fighting)", initialColor
          );
          cappedTotal = karmaResult.finalResult;
          karmaUsed = karmaResult.karmaSpent;
        }

        const fightColor = game.msh.rollUniversalTable(effectiveFightRank, cappedTotal);
        const hit = ["green", "yellow", "red"].includes(String(fightColor).toLowerCase());

        if (!hit) {
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: hero }),
            content: `
              <div style="background-color:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
                <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.05em;color:#8b0000;">
                  <strong>Health-Drain Touch &mdash; Fighting FEAT</strong><br>
                  <span style="font-size:0.85em;font-weight:400;">${hero.name} &rarr; ${target.name}</span>
                </div>
                <div style="padding:5px 10px;font-size:0.9em;">
                  <div>Base Rank: ${heroFightRank} (${heroFightValue})</div>
                  ${shift !== 0 ? `<div>Column Shift: ${shift > 0 ? "+" : ""}${shift} &rarr; ${effectiveFightRank} (${effectiveFightValue})</div>` : ""}
                  <div>Roll: ${fightRoll.total}${karmaUsed ? ` + Karma: ${karmaUsed}` : ""} = ${cappedTotal}</div>
                </div>
                <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.05em;border-radius:3px;background-color:${colorBg(fightColor)};color:${colorFg(fightColor)};">
                  ${String(fightColor).toUpperCase()} &mdash; MISS
                </div>
              </div>`
          });
          return;
        }

        // ── Hit: perform the drain ──
        const amount = Math.max(1, Math.min(maxDrain, Number($amt.val() || 1)));
        const tHpNow = Number(target.system?.attributes?.health?.value ?? 0);
        const hHpNow = Number(hero.system?.attributes?.health?.value ?? 0);
        const hMaxNow = Number(hero.system?.attributes?.health?.max ?? hHpNow);
        const cappedDrain = Math.min(amount, tHpNow);
        if (cappedDrain <= 0) {
          ui.notifications.warn("Nothing to drain.");
          return;
        }
        const targetAfter = Math.max(0, tHpNow - cappedDrain);
        const heroHeal = Math.min(cappedDrain, Math.max(0, hMaxNow - hHpNow));
        const heroAfter = Math.min(hMaxNow, hHpNow + heroHeal);
        const lost = cappedDrain - heroHeal;

        await target.update({ "system.attributes.health.value": targetAfter });
        await hero.update({ "system.attributes.health.value": heroAfter });

        // ── Hit summary banner for the Fighting FEAT ──
        const fightHitBanner = `
          <div style="padding:5px 10px;font-size:0.88em;background-color:#e8f5e9;border-bottom:1px solid #c0c0c0;">
            Fighting FEAT (${heroFightShort} ${heroFightValue}${shift !== 0 ? ` ${shift > 0 ? "+" : ""}${shift}CS &rarr; ${effectiveFightRank}` : ""})
            roll ${fightRoll.total}${karmaUsed ? ` + ${karmaUsed}K` : ""} = ${cappedTotal}
            &mdash; <strong style="color:${colorFg(fightColor)};background-color:${colorBg(fightColor)};padding:1px 6px;border-radius:2px;">${String(fightColor).toUpperCase()}</strong>
            &mdash; HIT
          </div>`;

        // ── If target reduced to 0, target rolls End FEAT vs power rank ──
        let endFeatBlock = "";
        if (targetAfter === 0) {
          const targetEndRank = target.system?.abilities?.endurance?.rank || "Typical";
          const targetEndValue = target.system?.abilities?.endurance?.value || 0;
          const targetEndShort = RANK_ABBR[targetEndRank] || targetEndRank;

          const endRoll = new Roll("1d100");
          await endRoll.evaluate();
          await endRoll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: target }),
            flavor: `${target.name} makes an Endurance FEAT vs ${powerRank} (Health-Drain at 0 HP)`,
            rollMode: getRollMode()
          });
          const resultColor = game.msh.rollUniversalTable(targetEndRank, endRoll.total);
          const survived = ["green", "yellow", "red"].includes(String(resultColor).toLowerCase());

          endFeatBlock = `
            <div style="border-top:1px solid #c0c0c0;padding:5px 10px;margin-top:4px;font-size:0.9em;background-color:#fff8e1;">
              <strong>End FEAT vs Death</strong> &mdash; ${target.name} (${targetEndShort} ${targetEndValue})
              <div>Roll: ${endRoll.total}</div>
            </div>
            <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.05em;border-radius:3px;background-color:${colorBg(resultColor)};color:${colorFg(resultColor)};">
              ${String(resultColor).toUpperCase()} &mdash; ${survived ? "SURVIVES (at 0 HP)" : "DIES"}
            </div>`;

          if (!survived) {
            endFeatBlock += `<div style="padding:5px 10px;text-align:center;color:#c62828;font-size:0.95em;font-weight:bold;">${target.name} dies per RAW. GM resolves.</div>`;
          }
        }

        const lostNote = lost > 0
          ? `<div style="color:#666;font-size:0.85em;margin-top:2px;">${lost} HP drained above max &mdash; lost per RAW.</div>`
          : "";

        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: hero }),
          content: `
            <div style="background-color:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
              <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.05em;color:#8b0000;">
                <strong>Health-Drain Touch</strong><br>
                <span style="font-size:0.85em;font-weight:400;">${hero.name} &larr; ${target.name} (${powerRank} ${powerValue})</span>
              </div>
              ${fightHitBanner}
              <div style="padding:8px 10px;font-size:0.95em;">
                <div>${target.name}: <strong>${tHpNow}</strong> &rarr; <strong>${targetAfter}</strong> &nbsp; (&minus;${cappedDrain})</div>
                <div>${hero.name}: <strong>${hHpNow}</strong> &rarr; <strong>${heroAfter}</strong> &nbsp; (+${heroHeal})</div>
                ${lostNote}
              </div>
              ${endFeatBlock}
            </div>`
        });
      };

      html.find('#frp-roll').on('click', async () => {
        try { await commit(); } finally {
          if (csPanel) csPanel.destroy();
          dlg.close();
        }
      });
      html.find('#frp-cancel').on('click', () => {
        if (csPanel) csPanel.destroy();
        dlg.close();
      });
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
