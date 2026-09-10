// scripts/modules/actions/blinding-touch-action.js v1.3.0 - 2026-09-09
// v1.3.0: Generalized for reuse by Light Emission's Blind stunt (ranged
//         Agility instead of touch Fighting) rather than writing a near-
//         duplicate file. showBlindingTouchDialog(hero, item, opts) takes
//         an optional 3rd arg — ability, verb, isRanged, rangeNote,
//         powerLabel — all defaulting to the original Fighting/touch
//         behavior, so Blinding Touch's own call site is unchanged. The
//         protected-senses rank gate and Slam/Stun requirement are
//         unchanged and now shared by both.
// scripts/modules/actions/blinding-touch-action.js v1.2.0 - 2026-09-09
// v1.2.0: Fixed-bug — hasProtectedSenses() was a flat "has the item =
//         total immunity" check, but rules-reference.js's own
//         protectedSenses desc is "Ignore damaging attacks < rank
//         Intensity" — a threshold on the item's OWN rank, not a blanket
//         immunity (found auditing Crosswise, whose write-up specifies
//         Amazing as that threshold). Replaced with protectedSensesRank(),
//         compared against Blinding Touch's own rank: negated only when
//         this attack's rank is strictly below the target's Protected
//         Senses rank.
// scripts/modules/actions/blinding-touch-action.js v1.1.0 - 2026-05-15
// v1.1.0: Auto-apply target/attacker effect-state shifts to the Fighting
//         FEAT (mirrors attack-action.js:594 + Health-Drain v1.2.0 +
//         Paralyzing v1.2.0). Effect shift folded into totalShift alongside
//         manual CS; breakdown surfaced in info box and chat card.
// v1.0.0: Touch attack dialog for the Blinding Touch power.
// RAW: "Blind unprotected target 1-10 rounds. Must achieve Stun or Slam
//       result. No avoidance unless Protected Senses or helmet."
// Flow: Fighting FEAT to touch (CS + karma). Color result:
//   White  = Miss
//   Green  = Hit (no blind — RAW requires Stun/Slam color)
//   Yellow = Slam result → Blinded 1d10 rounds (unless protected)
//   Red    = Stun result → Blinded 1d10 rounds (unless protected)
// Protection: actor with a Power item named "Protected Senses" auto-bypasses.
// Helmet detection deferred (would need equipment metadata to identify
// helmet items reliably).

import { showFaseripDialog } from "./dialog-shim.js";
import { getRollMode } from "./action-utils.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";
import { applyBlinded } from "../effects/effect-engine.js";
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

// RAW (rules-reference.js protectedSenses desc): "Ignore damaging attacks
// < rank Intensity" — a threshold on the Protected Senses item's own
// rank, not a blanket immunity. Returns that rank, or null if the target
// has no such power.
function protectedSensesRank(actor) {
  if (!actor?.items) return null;
  for (const item of actor.items) {
    if (item.type !== "power") continue;
    const nm = String(item.name || "").trim().toLowerCase();
    if (nm === "protected senses") return item.system?.rank || null;
  }
  return null;
}

export async function showBlindingTouchDialog(hero, item, opts = {}) {
  const {
    ability = "fighting",       // "fighting" (touch) or "agility" (ranged)
    verb = "touches",
    isRanged = false,
    rangeNote = "",             // shown as a reminder; not range-enforced
    powerLabel = "Blinding Touch",
  } = opts;
  const abilityLabel = ability.charAt(0).toUpperCase() + ability.slice(1);

  if (!hero || !item) {
    ui.notifications.warn(`${powerLabel} requires actor and power item.`);
    return;
  }

  const targets = Array.from(game.user.targets || []);
  if (targets.length !== 1) {
    ui.notifications.warn(`${powerLabel} requires exactly one target. Select a single token.`);
    return;
  }
  const target = targets[0].actor;
  if (!target) {
    ui.notifications.warn("Target has no actor.");
    return;
  }
  if (target.uuid === hero.uuid) {
    ui.notifications.warn(`${hero.name} cannot blind themselves with ${powerLabel}.`);
    return;
  }

  const powerRank = item.system?.rank || "Typical";
  const powerValue = game.msh?.getRankValue?.(powerRank) ?? 0;
  const rankShort = RANK_ABBR[powerRank] || powerRank;

  const heroFightRank = hero.system?.abilities?.[ability]?.rank || "Typical";
  const heroFightValue = hero.system?.abilities?.[ability]?.value || 0;
  const heroFightShort = RANK_ABBR[heroFightRank] || heroFightRank;

  const protectedRank = protectedSensesRank(target);
  const protectedValue = protectedRank ? (game.msh?.getRankValue?.(protectedRank) ?? 0) : 0;
  // Negated only when THIS attack's rank is strictly below the target's
  // Protected Senses rank ("< rank Intensity") — an attack at or above
  // that rank still blinds normally.
  const protectedSenses = protectedRank !== null && powerValue < protectedValue;

  // ── Effect-state shifts (auto-applied to the FEAT) ─────────────────────
  // Mirrors attack-action.js:594 / Health-Drain v1.2.0 / Paralyzing v1.2.0.
  const attackerShiftData = getAttackShiftBreakdown(hero, isRanged);
  const defenderShiftData = getDefenseShiftBreakdown(target, isRanged);
  const effectShift = (attackerShiftData.total || 0) - (defenderShiftData.total || 0);
  const effectBreakdownLines = [
    ...(attackerShiftData.breakdown || []).map(b => `${b.name} (attacker, ${b.shift > 0 ? "+" : ""}${b.shift} attack)`),
    ...(defenderShiftData.breakdown || []).map(b => `${b.name} on target (${b.shift > 0 ? "+" : ""}${b.shift} defense)`),
  ];
  const effectShiftNoteHtml = effectShift !== 0
    ? `<div style="color:#1565c0;margin-top:4px;"><strong>Effect shift: ${effectShift > 0 ? "+" : ""}${effectShift}CS</strong> &mdash; ${effectBreakdownLines.join("; ")}</div>`
    : "";

  const csRowHtml = buildCSRow({ savedCS: 0, abilityRank: heroFightRank });
  const karmaHtml = generateKarmaControlsHTML(hero, false);

  const headerHtml = `
    <div class="frp-header-v3">
      <span class="h-actor" title="${hero.name}">${hero.name}</span>
      <span class="h-paren">(</span>
      <span class="h-stat">
        <span class="h-stat-label">Base ${abilityLabel}:</span>
        <span class="h-stat-rank">${heroFightShort} ${heroFightValue}</span>
      </span>
      <span class="h-paren">)</span>
      <span class="h-verb">${verb}</span>
      <span class="h-target" title="${target.name}">${target.name}</span>
    </div>`;

  const infoBoxHtml = `
    <div class="frp-box" style="margin-top:6px;">
      <div style="font-size:0.9em;line-height:1.5;">
        <div>Target: <strong>${target.name}</strong></div>
        <div>Blind on <strong>Slam (Y)</strong> or <strong>Stun (R)</strong>; 1d10 rounds.</div>
        ${rangeNote ? `<div style="color:#666;">${rangeNote}</div>` : ""}
        ${protectedSenses ? `<div style="color:#2e7d32;"><strong>${target.name}</strong>'s Protected Senses (${protectedRank}) ignores attacks below that Intensity — immune to this ${powerRank} touch.</div>` : ""}
        ${(protectedRank && !protectedSenses) ? `<div style="color:#c62828;"><strong>${target.name}</strong> has Protected Senses (${protectedRank}), but this ${powerRank} touch meets or exceeds it — not immune.</div>` : ""}
        ${effectShiftNoteHtml}
      </div>
    </div>`;

  const resultGridHtml = `
    <div class="frp-fx-grid">
      <div class="frp-fx-cell w">Miss</div>
      <div class="frp-fx-cell g">Hit</div>
      <div class="frp-fx-cell y">Blind (Slam)</div>
      <div class="frp-fx-cell r">Blind (Stun)</div>
    </div>`;

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
        <button type="button" id="frp-roll" class="frp-btn frp-btn-primary">${verb === "touches" ? "Touch" : "Attack"} &amp; Blind</button>
        <button type="button" id="frp-cancel" class="frp-btn">Cancel</button>
      </div>
    </div>`;

  await showFaseripDialog({
    title: `${powerLabel} — ${hero.name}`,
    content: dialogContent,
    render: async (html, dlg) => {
      const $dialog = html.closest('.dialog');

      const csPanel = wireCSPanel(html, { abilityRank: heroFightRank });
      setupKarmaControlHandlers(html);

      const runRoll = async () => {
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
          flavor: `${hero.name} makes an ${abilityLabel} FEAT to ${verb.replace(/s$/, "")} ${target.name} (${powerLabel})`,
          rollMode: getRollMode()
        });

        let cappedTotal = fightRoll.total;
        let karmaUsed = 0;
        if (spendKarma && getAvailableKarma(hero) > 0) {
          const initialColor = game.msh.rollUniversalTable(effectiveFightRank, fightRoll.total);
          const karmaResult = await showKarmaDecisionDialog(
            hero, fightRoll.total, effectiveFightRank, `${powerLabel} (${abilityLabel})`, initialColor
          );
          cappedTotal = karmaResult.finalResult;
          karmaUsed = karmaResult.karmaSpent;
        }

        const fightColor = game.msh.rollUniversalTable(effectiveFightRank, cappedTotal);
        const cLower = String(fightColor).toLowerCase();
        const hit = cLower !== "white";
        const blindResult = cLower === "yellow" || cLower === "red";
        const blindKind = cLower === "red" ? "Stun" : (cLower === "yellow" ? "Slam" : "");

        // ── Build outcome block ──
        let outcomeBlock;
        if (!hit) {
          outcomeBlock = `
            <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.05em;border-radius:3px;background-color:${colorBg(fightColor)};color:${colorFg(fightColor)};">
              ${String(fightColor).toUpperCase()} &mdash; MISS
            </div>`;
        } else if (!blindResult) {
          outcomeBlock = `
            <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.05em;border-radius:3px;background-color:${colorBg(fightColor)};color:${colorFg(fightColor)};">
              ${String(fightColor).toUpperCase()} &mdash; HIT (no blind &mdash; needs Slam/Stun)
            </div>`;
        } else if (protectedSenses) {
          outcomeBlock = `
            <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.05em;border-radius:3px;background-color:${colorBg(fightColor)};color:${colorFg(fightColor)};">
              ${String(fightColor).toUpperCase()} &mdash; ${blindKind.toUpperCase()}
            </div>
            <div style="padding:5px 10px;text-align:center;font-size:0.95em;color:#2e7d32;">
              ${target.name}'s Protected Senses (${protectedRank}) negates the blinding — this ${powerRank} touch is below that Intensity.
            </div>`;
        } else {
          const dur = new Roll("1d10");
          await dur.evaluate();
          const rounds = Math.max(1, dur.total);
          await applyBlinded(target, { rounds, originUuid: hero.uuid });

          outcomeBlock = `
            <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.05em;border-radius:3px;background-color:${colorBg(fightColor)};color:${colorFg(fightColor)};">
              ${String(fightColor).toUpperCase()} &mdash; ${blindKind.toUpperCase()} &rarr; BLINDED
            </div>
            <div style="padding:5px 10px;text-align:center;font-size:0.95em;color:#c62828;">
              ${target.name} blinded for <strong>${rounds}</strong> rounds (1d10 = ${dur.total}).
            </div>`;
        }

        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: hero }),
          content: `
            <div style="background-color:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
              <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.05em;color:#8b0000;">
                <strong>${powerLabel}</strong><br>
                <span style="font-size:0.85em;font-weight:400;">${hero.name} &rarr; ${target.name} &mdash; ${powerRank} (${powerValue})</span>
              </div>
              <div style="padding:5px 10px;font-size:0.9em;">
                <div>${abilityLabel} FEAT (${heroFightShort} ${heroFightValue}${totalShift !== 0 ? ` ${totalShift > 0 ? "+" : ""}${totalShift}CS &rarr; ${effectiveFightRank} (${effectiveFightValue})` : ""})</div>
                ${(manualShift !== 0 && effectShift !== 0) ? `<div style="font-size:0.85em;color:#666;padding-left:8px;">manual ${manualShift > 0 ? "+" : ""}${manualShift}, effects ${effectShift > 0 ? "+" : ""}${effectShift}</div>` : ""}
                ${(effectShift !== 0 && effectBreakdownLines.length) ? `<div style="font-size:0.85em;color:#1565c0;padding-left:8px;">${effectBreakdownLines.join("; ")}</div>` : ""}
                <div>Roll: ${fightRoll.total}${karmaUsed ? ` + Karma: ${karmaUsed}` : ""} = ${cappedTotal}</div>
              </div>
              ${outcomeBlock}
            </div>`
        });
      };

      html.find('#frp-roll').on('click', async () => {
        try { await runRoll(); } finally {
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
