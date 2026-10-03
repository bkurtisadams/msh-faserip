// scripts/apps/battle-report.js v1.0.0 - 2026-10-01
// v1.0.0: Battle report chat card (karma UI refactor, slice 1).
//         When combat ends and foes were captured, a GM-whispered card shows
//         the foes defeated (with counts and karma), the heroes present and
//         the per-hero result, with Award / Edit / Undo buttons. The card is
//         a view of the pending encounter record (defeatedVillains setting),
//         so the Team Tracker Ledger, the encounter editor and the card all
//         act on the same data; cards refresh whenever that setting changes.
//         Award, Undo and Edit run through the TeamSheet award engine
//         (TeamSheet.awardEncounterById / undoEncounterById /
//         editEncounterById), so the karma math stays in one place.

const SCOPE = "msh-faserip";
const FLAG = "battleReport";

function encounters() {
  return game.settings.get(SCOPE, "defeatedVillains") || [];
}

async function teamSheetClass() {
  const { TeamSheet } = await import("../teamSheet.js");
  return TeamSheet;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Card HTML for one encounter, from the TeamSheet's own encounter context. */
async function buildCardHtml(encId) {
  const TeamSheet = await teamSheetClass();
  const ctx = TeamSheet.worker().getData();
  const enc = (ctx.encounters || []).find(e => e.id === encId);
  if (!enc) {
    return `<div class="faserip-battle-report br-gone"><div class="br-head"><strong>Battle Report</strong></div>
      <div class="br-body"><em>This encounter was deleted.</em></div></div>`;
  }

  const foes = (enc.villainRows || enc.villains || []).map(v => {
    const count = Number(v.count) || 1;
    const each = Number(v.rankValue) || 0;
    const karma = v.eligible === false ? "—" : (v.foeKarma ?? "");
    return `<div class="br-foe">
      <span class="br-count">${count}×</span>
      <span class="br-name">${esc(v.name)}</span>
      <span class="br-rank">${esc(v.rankLabel || "")}${each ? ` ${each}` : ""}</span>
      <span class="br-karma">${karma === "" ? "" : (karma === "—" ? "—" : `+${karma}`)}</span>
    </div>`;
  }).join("");

  const heroes = (enc.heroChecks || []).filter(h => h.present).map(h => esc(h.name)).join(", ") || "<em>none marked present</em>";
  const extras = [];
  if (enc.stopValue) extras.push(`Stop +${enc.stopValue}`);
  if (enc.arrestValue) extras.push(`Arrest +${enc.arrestValue}`);
  if (enc.rescueKarma) extras.push(`Rescue +${enc.rescueKarma}`);
  if (enc.gmAward) extras.push(`GM +${enc.gmAward}`);
  if (enc.losses) extras.push(`Losses −${enc.losses} each`);

  const title = esc(enc.displayName || "Battle");
  const when = esc(enc.dateDisplay || "");
  const status = enc.awarded
    ? `<div class="br-status br-awarded"><i class="fas fa-check-circle"></i> Awarded</div>`
    : "";
  const buttons = enc.awarded
    ? `<button type="button" data-action="br-undo" data-enc-id="${encId}"><i class="fas fa-undo"></i> Undo</button>`
    : `<button type="button" data-action="br-edit" data-enc-id="${encId}"><i class="fas fa-pen"></i> Edit</button>
       <button type="button" class="br-primary" data-action="br-award" data-enc-id="${encId}"><i class="fas fa-check"></i> Award</button>`;

  return `<div class="faserip-battle-report${enc.awarded ? " is-awarded" : ""}">
    <div class="br-head"><strong>Battle Report — ${title}</strong><span class="br-when">${when}</span></div>
    <div class="br-body">
      ${foes ? `<div class="br-label">Foes defeated</div>${foes}` : ""}
      ${extras.length ? `<div class="br-extras">${extras.join(" · ")}</div>` : ""}
      <div class="br-label">Heroes present</div>
      <div class="br-heroes">${heroes}</div>
      ${enc.summaryLine ? `<div class="br-summary">${enc.summaryLine}</div>` : ""}
      ${status}
    </div>
    <div class="br-buttons">${buttons}</div>
  </div>`;
}

/** Post the GM-whispered battle report for a captured encounter. */
export async function postBattleReport(encId) {
  if (!game.user.isGM) return;
  const content = await buildCardHtml(encId);
  await ChatMessage.create({
    content,
    whisper: game.users.filter(u => u.isGM).map(u => u.id),
    speaker: { alias: "Battle Report" },
    flags: { [SCOPE]: { [FLAG]: encId } }
  });
}

let _refreshTimer = null;
/** Re-render every battle report card (debounced; GM only). */
export function refreshBattleReports() {
  if (!game.user.isGM) return;
  clearTimeout(_refreshTimer);
  _refreshTimer = setTimeout(async () => {
    const msgs = game.messages.filter(m => m.getFlag(SCOPE, FLAG));
    for (const m of msgs) {
      const html = await buildCardHtml(m.getFlag(SCOPE, FLAG));
      if (html !== m.content) await m.update({ content: html });
    }
  }, 200);
}

/** Chat button handler (wired in chat-hooks.js). */
export async function handleBattleReportClick(btn) {
  if (!game.user.isGM) { ui.notifications.warn("Only the GM can award karma."); return; }
  const encId = btn.dataset.encId;
  if (!encounters().some(e => e.id === encId)) {
    ui.notifications.warn("That encounter no longer exists.");
    return;
  }
  const TeamSheet = await teamSheetClass();
  switch (btn.dataset.action) {
    case "br-award": await TeamSheet.awardEncounterById(encId); break;
    case "br-undo": await TeamSheet.undoEncounterById(encId); break;
    case "br-edit": TeamSheet.editEncounterById(encId); break;
  }
  refreshBattleReports();
}

/** Keep cards in sync with edits made anywhere (editor, Ledger, card). */
export function registerBattleReportHooks() {
  const onSetting = (setting) => {
    if (setting?.key === `${SCOPE}.defeatedVillains`) refreshBattleReports();
  };
  Hooks.on("updateSetting", onSetting);
  Hooks.on("createSetting", onSetting);
}
