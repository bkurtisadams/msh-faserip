// scripts/modules/actions/psi-screen-action.js v1.0.0 - 2026-09-03
// Psi-Screen (Power): extend the screen over other targets. One Power rank
// FEAT per target, green required (RULED 2026-09-03); success grants the
// target the protector's Psi-Screen rank against mental Powers (honoured by
// scanMentalDefenses); failure ends the attempt, and all of the protector's
// psionic Powers are lost for 1-10 rounds. The attacker is aware of the
// protector's mental presence.

import { buildCardShell, buildActorTargetHtml, buildContentBox, universalColor, rankValue } from "./action-utils.js";
import { colorAtLeast } from "../../lib/faserip-rules/faserip-kernel.js";
import { generateKarmaControlsHTML, extractKarmaFromDialog, showKarmaDecisionDialog } from "../dice/dice-roller.js";
import { showFaseripButtonDialog } from "./dialog-shim.js";

export const PSI_SCREEN_PROTECT_COLOR = "green";

export async function showPsiScreenDialog(actor, item) {
  const powerRank = item.system.rank || "Typical";
  const powerValue = Number.isFinite(Number(item.system.value)) && item.system.value !== "" ? Number(item.system.value) : rankValue(powerRank);
  const targets = Array.from(game.user?.targets ?? []).filter(t => t.actor && t.actor.id !== actor.id);
  const psyche = actor.system?.abilities?.psyche || {};

  const targetList = targets.length
    ? targets.map(t => `<div style="font-size:12px;">${t.name}</div>`).join("")
    : `<div style="font-size:12px;color:#b71c1c;">No targets selected — target the characters to protect.</div>`;

  const dialogHtml = `
    <div class="frp-dlg" style="font-family:'Barlow Condensed',Arial,sans-serif;font-size:13px;">
      <div class="frp-box" style="padding:4px 8px;margin-bottom:4px;">
        <div style="display:grid;grid-template-columns:70px 1fr;gap:1px 6px;line-height:1.35;">
          <span style="font-weight:600;color:#555;">Psi-Screen:</span><span><strong>${powerRank}</strong> (${powerValue})</span>
          <span style="font-weight:600;color:#555;">Own Psyche:</span><span>${psyche.rank || "?"} (${psyche.value ?? "?"})</span>
        </div>
      </div>
      <div class="frp-box" style="padding:4px 8px;margin-bottom:4px;background:#ede7f6;border-color:#b39ddb;">
        <div style="font-weight:600;color:#4527a0;margin-bottom:2px;">Protect (${targets.length})</div>
        ${targetList}
      </div>
      ${generateKarmaControlsHTML(actor, 0)}
      <div style="font-size:10px;color:#555;margin-top:4px;padding:4px 6px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;line-height:1.35;">
        <div style="font-weight:600;color:#e65100;margin-bottom:2px;">Power rank FEAT per target — ${PSI_SCREEN_PROTECT_COLOR.toUpperCase()}</div>
        <div>Success: target resists mental Powers at ${powerRank}</div>
        <div>Failure: your psionic Powers are lost 1-10 rounds; no further targets</div>
        <div>Attackers sense your mental presence</div>
      </div>
    </div>`;

  const choice = await new Promise((resolve) => {
    showFaseripButtonDialog({
      title: item.name,
      width: 300,
      content: dialogHtml,
      buttons: {
        protect: {
          icon: '<i class="fas fa-shield-alt"></i>',
          label: "Extend Screen",
          callback: (html) => resolve({ spendKarma: extractKarmaFromDialog(html).spendKarma })
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel", callback: () => resolve(null) }
      },
      default: "protect"
    });
  });
  if (!choice) return { rawActionCancelled: true };
  if (!targets.length) { ui.notifications.warn("Psi-Screen: no targets selected."); return { rawActionCancelled: true }; }

  const { applyEffect } = await import("../effects/effect-engine.js");
  const colorBg = { white: "#e0e0e0", green: "#c8e6c9", yellow: "#fff9c4", red: "#ffcdd2" };
  const rows = [];
  let failed = false, lostRounds = 0;

  for (const t of targets) {
    if (failed) { rows.push({ name: t.name, text: "not covered", ok: false, skipped: true }); continue; }
    const roll = await (new Roll("1d100")).evaluate();
    let total = roll.total, karmaUsed = 0;
    if (choice.spendKarma) {
      const initial = universalColor(powerRank, total);
      const r = await showKarmaDecisionDialog(actor, total, powerRank, `Psi-Screen over ${t.name}`, initial);
      total = r.finalResult; karmaUsed = r.karmaSpent;
    }
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${actor.name} — Psi-Screen FEAT (${powerRank}) over ${t.name}`, rollMode: game.settings.get("core", "rollMode") });
    const color = String(universalColor(powerRank, total) || "white").toLowerCase();
    const ok = colorAtLeast(color, PSI_SCREEN_PROTECT_COLOR);
    const rollText = karmaUsed > 0 ? `<s>${total - karmaUsed}</s> ${total} (+${karmaUsed} K) ${color}` : `${total} ${color}`;
    if (ok) {
      await applyEffect(t.actor, {
        name: `Psi-Screen (from ${actor.name})`,
        img: "icons/svg/shield.svg",
        rounds: null,
        originUuid: item.uuid,
        flags: { "msh-faserip": { effectType: "psiScreenGrant", psiScreenGrant: { rank: powerRank, value: powerValue, source: `Psi-Screen (${actor.name})`, protectorUuid: actor.uuid } } }
      });
    } else {
      failed = true;
      lostRounds = (await (new Roll("1d10")).evaluate()).total;
      await applyEffect(actor, {
        name: "Psionic Powers Lost",
        img: "icons/svg/silenced.svg",
        rounds: lostRounds,
        originUuid: item.uuid,
        flags: { "msh-faserip": { effectType: "psionicPowersLost" }, meta: { unitLabel: "round", unitLabelPlural: "rounds" } }
      });
    }
    rows.push({ name: t.name, text: rollText, color, ok });
  }

  const rowHtml = rows.map(r => `<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0;font-size:.9em;">
      <span style="font-weight:600;">${r.name}</span>
      <span>${r.skipped ? `<span style="color:#666;">${r.text}</span>` : `<span style="padding:1px 6px;background:${colorBg[r.color] || "#e0e0e0"};border-radius:3px;">${r.text}</span>`}
        <span style="margin-left:6px;color:${r.ok ? "#2e7d32" : "#b71c1c"};font-weight:600;">${r.skipped ? "" : r.ok ? "Protected" : "FAILED"}</span></span>
    </div>`).join("");
  const resultBox = failed
    ? `<div style="font-weight:700;color:#b71c1c;margin-bottom:4px;">Screen Faltered</div>
       <div style="font-size:.9em;">${actor.name}'s psionic Powers are lost for ${lostRounds} round${lostRounds === 1 ? "" : "s"}. Targets already covered keep their screen; opponents are aware of ${actor.name}'s mental presence.</div>`
    : `<div style="font-weight:700;color:#2e7d32;margin-bottom:4px;">Screen Extended</div>
       <div style="font-size:.9em;">Protected targets resist mental Powers at ${powerRank}. Opponents attacking them are aware of ${actor.name}'s mental presence. Remove the effect to end protection.</div>`;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: buildCardShell({
      actionLabel: item.name,
      headerRight: "Protect Others",
      actorHtml: buildActorTargetHtml(actor.name, targets.map(t => t.name).join(", ")),
      sections: [
        buildContentBox(`<div style="display:grid;grid-template-columns:90px 1fr;gap:3px 8px;font-size:.9em;line-height:1.3;">
          <span style="font-weight:600;">Rank:</span><span>${powerRank} (${powerValue})</span>
          <span style="font-weight:600;">Required:</span><span>${PSI_SCREEN_PROTECT_COLOR.charAt(0).toUpperCase() + PSI_SCREEN_PROTECT_COLOR.slice(1)} per target</span>
        </div>`),
        buildContentBox(rowHtml),
        buildContentBox(resultBox)
      ]
    })
  });
}
