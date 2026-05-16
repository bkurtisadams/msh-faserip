// scripts/modules/actions/paralyzing-touch-action.js v1.0.1 - 2026-05-15
// v1.0.1: Dialog layout normalized to match Health-Drain Touch — strip
//         the yellow self-warning block and the verbose explanatory text
//         under the target info. Single frp-box now shows just hero
//         Fighting (skipped for self), target End, and End FEAT requirement.
// v1.0.0: Initial. Touch attack dialog for the Paralyzing Touch power.
// RAW: "End FEAT vs rank or KO 1-10 rounds. Always active. User can be KO'd
//       by own touch."
// Flow:
//   - Self-target → skip Fighting FEAT, go straight to hero's End FEAT.
//   - Other target → Fighting FEAT to hit. White = miss. Hit → target rolls
//     End FEAT vs power rank.
//   - End FEAT pass = target unaffected. Fail = applyParalyzed for 1d10
//     rounds. Power rank as intensity via determineFeatRequirement.

import { showFaseripDialog } from "./dialog-shim.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";
import { determineFeatRequirement, checkFeatSuccess } from "./ability-feat-dialog.js";
import { applyParalyzed } from "../effects/effect-engine.js";

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

  const targetEndRank = target.system?.abilities?.endurance?.rank || "Typical";
  const targetEndValue = target.system?.abilities?.endurance?.value || 0;
  const targetEndShort = RANK_ABBR[targetEndRank] || targetEndRank;

  const endFeatReq = determineFeatRequirement(targetEndRank, powerRank);

  const dialogContent = `
    <div class="frp-dlg frp-feat">
      <div class="frp-header-v3">
        <span class="h-actor" title="${hero.name}">${hero.name}</span>
        <span class="h-paren">&rarr;</span>
        <span class="h-actor" title="${target.name}">${isSelf ? "self" : target.name}</span>
        <span class="h-paren">(</span>
        <span class="h-stat">
          <span class="h-stat-label">Paralyzing Touch</span>
          <span class="h-stat-rank">${rankShort}</span>
          <span class="h-stat-val">${powerValue}</span>
        </span>
        <span class="h-paren">)</span>
      </div>

      <div class="frp-box" style="margin-top:8px;">
        <div style="font-size:0.9em;line-height:1.5;">
          ${!isSelf ? `<div>${hero.name} Fighting: <strong>${heroFightShort} ${heroFightValue}</strong></div>` : ""}
          <div>Target End: <strong>${targetEndShort} ${targetEndValue}</strong></div>
          <div>End FEAT vs ${powerRank}: need <strong>${endFeatReq.requirement}</strong></div>
        </div>
      </div>

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

      const rollEndFeatAndApply = async (subject, subjectEndRank, subjectEndShort, subjectEndValue, intro) => {
        const req = determineFeatRequirement(subjectEndRank, powerRank);
        const endRoll = new Roll("1d100");
        await endRoll.evaluate();
        await endRoll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: subject }),
          flavor: `${subject.name} rolls End FEAT vs ${powerRank} (Paralyzing Touch)`,
          rollMode: game.settings.get("core", "rollMode")
        });

        let resultColor;
        let resisted;
        if (req.automatic) {
          resultColor = "automatic";
          resisted = true;
        } else if (req.impossible) {
          resultColor = "impossible";
          resisted = false;
        } else {
          resultColor = game.msh.rollUniversalTable(subjectEndRank, endRoll.total);
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
            <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.05em;border-radius:3px;background-color:${req.impossible ? "#6a0000" : colorBg(resultColor)};color:#fff;">
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
                <span style="font-size:0.85em;font-weight:400;">${hero.name} &rarr; ${subject.name === hero.name ? "self" : subject.name} &mdash; ${powerRank} (${powerValue})</span>
              </div>
              ${intro || ""}
              <div style="padding:5px 10px;font-size:0.9em;">
                <div>End FEAT (${subjectEndShort} ${subjectEndValue}) vs ${powerRank} (need ${req.requirement})</div>
                <div>Roll: ${endRoll.total}</div>
              </div>
              ${outcomeBlock}
            </div>`
        });
      };

      // Self path
      const runSelf = async () => {
        const heroEndRank = hero.system?.abilities?.endurance?.rank || "Typical";
        const heroEndValue = hero.system?.abilities?.endurance?.value || 0;
        const heroEndShort = RANK_ABBR[heroEndRank] || heroEndRank;
        await rollEndFeatAndApply(hero, heroEndRank, heroEndShort, heroEndValue, "");
      };

      // Other-target path
      const runOther = async () => {
        // Fighting FEAT first
        const fightRoll = new Roll("1d100");
        await fightRoll.evaluate();
        await fightRoll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: hero }),
          flavor: `${hero.name} makes a Fighting FEAT to touch ${target.name} (Paralyzing Touch)`,
          rollMode: game.settings.get("core", "rollMode")
        });
        const fightColor = game.msh.rollUniversalTable(heroFightRank, fightRoll.total);
        const hit = ["green", "yellow", "red"].includes(String(fightColor).toLowerCase());

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
                  <div>Fighting FEAT (${heroFightShort} ${heroFightValue}). Roll: ${fightRoll.total}</div>
                </div>
                <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.05em;border-radius:3px;background-color:${colorBg(fightColor)};color:${colorFg(fightColor)};">
                  ${String(fightColor).toUpperCase()} &mdash; MISS
                </div>
              </div>`
          });
          return;
        }

        // Hit — pass the hit info as intro for the End FEAT card
        const intro = `
          <div style="padding:5px 10px;font-size:0.88em;background-color:#e8f5e9;border-bottom:1px solid #c0c0c0;">
            Fighting FEAT (${heroFightShort} ${heroFightValue}) roll ${fightRoll.total}
            &mdash; <strong style="color:${colorFg(fightColor)};background-color:${colorBg(fightColor)};padding:1px 6px;border-radius:2px;">${String(fightColor).toUpperCase()}</strong>
            &mdash; HIT
          </div>`;
        await rollEndFeatAndApply(target, targetEndRank, targetEndShort, targetEndValue, intro);
      };

      html.find('#frp-roll').on('click', async () => {
        try {
          if (isSelf) await runSelf();
          else await runOther();
        } finally { dlg.close(); }
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
