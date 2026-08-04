// scripts/modules/actions/paralyzing-touch-action.js v1.2.0 - 2026-05-15
// v1.2.0: Auto-apply target/attacker effect-state shifts to the other-target
//         Fighting FEAT (mirrors attack-action.js:594 and Health-Drain v1.2.0).
//         Effect shift folded into totalShift alongside manual CS; breakdown
//         surfaced in info box and chat card. Self-path unaffected — no
//         Fighting FEAT, so effect shifts don't apply.
// v1.1.3: Fix chat card readability — "WHITE — PARALYZED" outcome block
//         hardcoded color:#fff on the white-result background (#f5f5f0),
//         making the text invisible. Use colorFg(resultColor) like the
//         RESISTED block already does.
// v1.1.2: Replace deprecated game.settings.get("core","rollMode") with v14's
//         "messageMode" via getRollMode() helper (with v13 fallback).
// v1.1.1: Fix applyColumnShifts return shape. The helper returns
//         { index, name, totalCS } not a bare rank string; rollUniversalTable
//         was being called with the object, producing "[object Object] not
//         found in universal table". Unwrap via .name.
// v1.1.0: Add standard combat-dialog elements to match Blunt Attack pattern:
//         CS row with reference panel for Fighting FEAT (other-target path),
//         karma checkbox with post-roll decision dialog for both Fighting
//         and self-End FEATs. Karma not added to target's resistance End
//         FEAT (separate scope — target-side decision, GM-managed for v1).
// v1.0.1: Dialog layout normalized to match Health-Drain Touch.
// v1.0.0: Initial. Save-or-KO touch dialog.

import { showFaseripDialog } from "./dialog-shim.js";
import { getRollMode } from "./action-utils.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";
import { determineFeatRequirement, checkFeatSuccess } from "./ability-feat-dialog.js";
import { applyParalyzed } from "../effects/effect-engine.js";
import {
  generateKarmaControlsHTML,
  setupKarmaControlHandlers,
  getAvailableKarma,
  showKarmaDecisionDialog,
} from "../dice/dice-roller.js";
import { applyColumnShifts } from "../dice/column-shifts.js";
import { buildCSRow, wireCSPanel } from "./cs-modifiers.js";
import { getAttackShiftBreakdown, getDefenseShiftBreakdown } from "../effects/effect-modifiers.js";

const SCOPE = () => (globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip");

// v14 renamed core.rollMode to core.messageMode. Try v14 first, fall back
// for older worlds. Avoids the per-call deprecation warning.

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

export async function showParalyzingTouchDialog(hero, item) {
  if (!hero || !item) {
    ui.notifications.warn("Paralyzing Touch requires actor and power item.");
    return;
  }

  const targets = Array.from(game.user.targets || []);
  if (targets.length !== 1) {
    ui.notifications.warn("Paralyzing Touch requires exactly one target. Select a single token (own token for self-test).");
    return;
  }
  const target = targets[0].actor;
  if (!target) {
    ui.notifications.warn("Target has no actor.");
    return;
  }
  const isSelf = target.uuid === hero.uuid;

  const powerRank = item.system?.rank || "Typical";
  const powerValue = game.msh?.getRankValue?.(powerRank) ?? 0;
  const rankShort = RANK_ABBR[powerRank] || powerRank;

  const heroFightRank = hero.system?.abilities?.fighting?.rank || "Typical";
  const heroFightValue = hero.system?.abilities?.fighting?.value || 0;
  const heroFightShort = RANK_ABBR[heroFightRank] || heroFightRank;

  const heroEndRank = hero.system?.abilities?.endurance?.rank || "Typical";
  const heroEndValue = hero.system?.abilities?.endurance?.value || 0;
  const heroEndShort = RANK_ABBR[heroEndRank] || heroEndRank;

  const targetEndRank = target.system?.abilities?.endurance?.rank || "Typical";
  const targetEndValue = target.system?.abilities?.endurance?.value || 0;
  const targetEndShort = RANK_ABBR[targetEndRank] || targetEndRank;

  const endFeatReq = determineFeatRequirement(targetEndRank, powerRank);
  const selfEndFeatReq = determineFeatRequirement(heroEndRank, powerRank);

  // ── Effect-state shifts (other-target Fighting FEAT only) ─────────────
  // Self path has no Fighting FEAT, so effect-shift application is moot.
  // Mirrors attack-action.js:594. Touch is melee → isRanged=false.
  const attackerShiftData = !isSelf ? getAttackShiftBreakdown(hero, false) : { total: 0, breakdown: [] };
  const defenderShiftData = !isSelf ? getDefenseShiftBreakdown(target, false) : { total: 0, breakdown: [] };
  const effectShift = (attackerShiftData.total || 0) - (defenderShiftData.total || 0);
  const effectBreakdownLines = [
    ...(attackerShiftData.breakdown || []).map(b => `${b.name} (attacker, ${b.shift > 0 ? "+" : ""}${b.shift} attack)`),
    ...(defenderShiftData.breakdown || []).map(b => `${b.name} on target (${b.shift > 0 ? "+" : ""}${b.shift} defense)`),
  ];
  const effectShiftNoteHtml = (!isSelf && effectShift !== 0)
    ? `<div style="color:#1565c0;margin-top:4px;"><strong>Effect shift: ${effectShift > 0 ? "+" : ""}${effectShift}CS</strong> &mdash; ${effectBreakdownLines.join("; ")}</div>`
    : "";

  // CS row only meaningful for the other-target Fighting FEAT
  const csRowHtml = !isSelf ? buildCSRow({ savedCS: 0, abilityRank: heroFightRank }) : "";
  const karmaHtml = generateKarmaControlsHTML(hero, false);

  const headerHtml = isSelf
    ? `<div class="frp-header-v3">
         <span class="h-actor" title="${hero.name}">${hero.name}</span>
         <span class="h-paren">(</span>
         <span class="h-stat">
           <span class="h-stat-label">Base End:</span>
           <span class="h-stat-rank">${heroEndShort} ${heroEndValue}</span>
         </span>
         <span class="h-paren">)</span>
         <span class="h-verb">touches</span>
         <span class="h-target">self</span>
       </div>`
    : `<div class="frp-header-v3">
         <span class="h-actor" title="${hero.name}">${hero.name}</span>
         <span class="h-paren">(</span>
         <span class="h-stat">
           <span class="h-stat-label">Base Fighting:</span>
           <span class="h-stat-rank">${heroFightShort} ${heroFightValue}</span>
         </span>
         <span class="h-paren">)</span>
         <span class="h-verb">touches</span>
         <span class="h-target" title="${target.name}">${target.name}</span>
       </div>`;

  const infoBoxHtml = isSelf
    ? `<div class="frp-box" style="margin-top:6px;">
         <div style="font-size:0.9em;line-height:1.5;">
           <div>Self End FEAT vs ${powerRank}: need <strong>${selfEndFeatReq.requirement}</strong></div>
         </div>
       </div>`
    : `<div class="frp-box" style="margin-top:6px;">
         <div style="font-size:0.9em;line-height:1.5;">
           <div>Target End: <strong>${targetEndShort} ${targetEndValue}</strong></div>
           <div>End FEAT vs ${powerRank}: need <strong>${endFeatReq.requirement}</strong></div>
           ${effectShiftNoteHtml}
         </div>
       </div>`;

  const resultGridHtml = !isSelf
    ? `<div class="frp-fx-grid">
         <div class="frp-fx-cell w">Miss</div>
         <div class="frp-fx-cell g">Hit &rarr; Save</div>
         <div class="frp-fx-cell y">Hit &rarr; Save</div>
         <div class="frp-fx-cell r">Hit &rarr; Save</div>
       </div>`
    : "";

  const dialogContent = `
    <div class="frp-dlg frp-feat">
      ${headerHtml}
      ${csRowHtml}
      ${infoBoxHtml}
      <div class="frp-box frp-opts-box" style="margin-top:6px;">
        ${karmaHtml}
      </div>
      ${resultGridHtml}
      <div class="frp-foot" style="margin-top:8px;">
        <button type="button" id="frp-roll" class="frp-btn frp-btn-primary">${isSelf ? "Roll Self End FEAT" : "Touch &amp; Paralyze"}</button>
        <button type="button" id="frp-cancel" class="frp-btn">Cancel</button>
      </div>
    </div>`;

  await showFaseripDialog({
    title: `Paralyzing Touch — ${hero.name}`,
    content: dialogContent,
    render: async (html, dlg) => {
      const $dialog = html.closest('.dialog');

      let csPanel = null;
      if (!isSelf) {
        csPanel = wireCSPanel(html, { abilityRank: heroFightRank });
      }
      setupKarmaControlHandlers(html);

      // Shared End-FEAT resolver. For self-path, caller passes pre-rolled
      // total + karma so the karma decision is applied to the same End FEAT
      // (not re-rolled). For other-path, this rolls fresh on the target.
      const rollEndFeatOnTarget = async (subject, subjectEndRank, subjectEndShort, subjectEndValue, intro, subjectKarmaUsed = 0, preRolledTotal = null) => {
        const req = determineFeatRequirement(subjectEndRank, powerRank);

        let displayTotal, karmaLine;
        if (preRolledTotal !== null) {
          displayTotal = preRolledTotal;
          karmaLine = subjectKarmaUsed > 0 ? ` + Karma: ${subjectKarmaUsed}` : "";
        } else {
          const endRoll = new Roll("1d100");
          await endRoll.evaluate();
          await endRoll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: subject }),
            flavor: `${subject.name} rolls End FEAT vs ${powerRank} (Paralyzing Touch)`,
            rollMode: getRollMode()
          });
          displayTotal = endRoll.total;
          karmaLine = "";
        }

        let resultColor, resisted;
        if (req.automatic) {
          resultColor = "automatic";
          resisted = true;
        } else if (req.impossible) {
          resultColor = "impossible";
          resisted = false;
        } else {
          resultColor = game.msh.rollUniversalTable(subjectEndRank, displayTotal);
          resisted = checkFeatSuccess(resultColor, req.requirement);
        }

        let outcomeBlock;
        if (resisted) {
          outcomeBlock = `
            <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.05em;border-radius:3px;background-color:${req.automatic ? "#4CAF50" : colorBg(resultColor)};color:${req.automatic ? "#fff" : colorFg(resultColor)};">
              ${req.automatic ? "AUTOMATIC" : String(resultColor).toUpperCase()} &mdash; RESISTED
            </div>
            <div style="padding:5px 10px;text-align:center;font-size:0.95em;">
              ${subject.name} resists the paralyzing touch.
            </div>`;
        } else {
          const dur = new Roll("1d10");
          await dur.evaluate();
          const rounds = Math.max(1, dur.total);
          await applyParalyzed(subject, { rounds, originUuid: hero.uuid });

          outcomeBlock = `
            <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.05em;border-radius:3px;background-color:${req.impossible ? "#6a0000" : colorBg(resultColor)};color:${req.impossible ? "#fff" : colorFg(resultColor)};">
              ${req.impossible ? "IMPOSSIBLE" : String(resultColor).toUpperCase()} &mdash; PARALYZED
            </div>
            <div style="padding:5px 10px;text-align:center;font-size:0.95em;color:#c62828;">
              ${subject.name} paralyzed for <strong>${rounds}</strong> rounds (1d10 = ${dur.total}).
            </div>`;
        }

        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: hero }),
          content: `
            <div style="background-color:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
              <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.05em;color:#8b0000;">
                <strong>Paralyzing Touch</strong><br>
                <span style="font-size:0.85em;font-weight:400;">${hero.name} &rarr; ${subject.uuid === hero.uuid ? "self" : subject.name} &mdash; ${powerRank} (${powerValue})</span>
              </div>
              ${intro || ""}
              <div style="padding:5px 10px;font-size:0.9em;">
                <div>End FEAT (${subjectEndShort} ${subjectEndValue}) vs ${powerRank} (need ${req.requirement})</div>
                <div>Roll: ${displayTotal}${karmaLine}</div>
              </div>
              ${outcomeBlock}
            </div>`
        });
      };

      const runSelf = async () => {
        const spendKarma = html.find('#spend-karma').is(':checked');

        const endRoll = new Roll("1d100");
        await endRoll.evaluate();
        await endRoll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: hero }),
          flavor: `${hero.name} rolls End FEAT vs ${powerRank} (Paralyzing Touch — self)`,
          rollMode: getRollMode()
        });

        let cappedTotal = endRoll.total;
        let karmaUsed = 0;
        if (spendKarma && getAvailableKarma(hero) > 0) {
          const initialColor = game.msh.rollUniversalTable(heroEndRank, endRoll.total);
          const karmaResult = await showKarmaDecisionDialog(
            hero, endRoll.total, heroEndRank, "Paralyzing Touch (self End)", initialColor
          );
          cappedTotal = karmaResult.finalResult;
          karmaUsed = karmaResult.karmaSpent;
        }

        await rollEndFeatOnTarget(hero, heroEndRank, heroEndShort, heroEndValue, "", karmaUsed, cappedTotal);
      };

      const runOther = async () => {
        const csInfo = csPanel ? csPanel.get() : { totalShift: 0, manualCS: 0 };
        const manualShift = Number(csInfo.totalShift) || 0;
        const totalShift = manualShift + effectShift;
        const effectiveFightRank = totalShift !== 0 ? applyColumnShifts(heroFightRank, totalShift).name : heroFightRank;
        const effectiveFightValue = game.msh?.getRankValue?.(effectiveFightRank) ?? heroFightValue;
        const spendKarma = html.find('#spend-karma').is(':checked');

        const fightRoll = new Roll("1d100");
        await fightRoll.evaluate();
        await fightRoll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: hero }),
          flavor: `${hero.name} makes a Fighting FEAT to touch ${target.name} (Paralyzing Touch)`,
          rollMode: getRollMode()
        });

        let cappedTotal = fightRoll.total;
        let karmaUsed = 0;
        if (spendKarma && getAvailableKarma(hero) > 0) {
          const initialColor = game.msh.rollUniversalTable(effectiveFightRank, fightRoll.total);
          const karmaResult = await showKarmaDecisionDialog(
            hero, fightRoll.total, effectiveFightRank, "Paralyzing Touch (Fighting)", initialColor
          );
          cappedTotal = karmaResult.finalResult;
          karmaUsed = karmaResult.karmaSpent;
        }

        const fightColor = game.msh.rollUniversalTable(effectiveFightRank, cappedTotal);
        const hit = ["green", "yellow", "red"].includes(String(fightColor).toLowerCase());

        // Shared CS-breakdown HTML for miss + hit displays
        const csBreakdownHtml = totalShift !== 0
          ? `<div>Column Shift: ${totalShift > 0 ? "+" : ""}${totalShift}CS &rarr; ${effectiveFightRank} (${effectiveFightValue})</div>
             ${(manualShift !== 0 && effectShift !== 0) ? `<div style="font-size:0.85em;color:#666;padding-left:8px;">manual ${manualShift > 0 ? "+" : ""}${manualShift}, effects ${effectShift > 0 ? "+" : ""}${effectShift}</div>` : ""}
             ${(effectShift !== 0 && effectBreakdownLines.length) ? `<div style="font-size:0.85em;color:#1565c0;padding-left:8px;">${effectBreakdownLines.join("; ")}</div>` : ""}`
          : "";

        if (!hit) {
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: hero }),
            content: `
              <div style="background-color:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
                <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.05em;color:#8b0000;">
                  <strong>Paralyzing Touch &mdash; Fighting FEAT</strong><br>
                  <span style="font-size:0.85em;font-weight:400;">${hero.name} &rarr; ${target.name}</span>
                </div>
                <div style="padding:5px 10px;font-size:0.9em;">
                  <div>Base Rank: ${heroFightRank} (${heroFightValue})</div>
                  ${csBreakdownHtml}
                  <div>Roll: ${fightRoll.total}${karmaUsed ? ` + Karma: ${karmaUsed}` : ""} = ${cappedTotal}</div>
                </div>
                <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.05em;border-radius:3px;background-color:${colorBg(fightColor)};color:${colorFg(fightColor)};">
                  ${String(fightColor).toUpperCase()} &mdash; MISS
                </div>
              </div>`
          });
          return;
        }

        const intro = `
          <div style="padding:5px 10px;font-size:0.88em;background-color:#e8f5e9;border-bottom:1px solid #c0c0c0;">
            Fighting FEAT (${heroFightShort} ${heroFightValue}${totalShift !== 0 ? ` ${totalShift > 0 ? "+" : ""}${totalShift}CS &rarr; ${effectiveFightRank}` : ""})
            roll ${fightRoll.total}${karmaUsed ? ` + ${karmaUsed}K` : ""} = ${cappedTotal}
            &mdash; <strong style="color:${colorFg(fightColor)};background-color:${colorBg(fightColor)};padding:1px 6px;border-radius:2px;">${String(fightColor).toUpperCase()}</strong>
            &mdash; HIT
          </div>
          ${(effectShift !== 0 && effectBreakdownLines.length) ? `<div style="padding:3px 10px;font-size:0.82em;background-color:#e8f5e9;color:#1565c0;border-bottom:1px solid #c0c0c0;">${effectBreakdownLines.join("; ")}</div>` : ""}`;
        await rollEndFeatOnTarget(target, targetEndRank, targetEndShort, targetEndValue, intro);
      };

      html.find('#frp-roll').on('click', async () => {
        try {
          if (isSelf) await runSelf();
          else await runOther();
        } finally {
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
