// scripts/apps/battle-report.js v1.2.0 - 2026-10-03
// v1.2.0: Awarded encounters can be revised: Edit on an awarded card (or the
//         Ledger's pencil) reopens the editor with a note that it was
//         awarded; Cancel restores the record as it was, Save changes asks
//         Record only or Adjust karma (TeamSheet.saveEncounterRevision).
//         Editor adds foes by name and rank (no token needed) and lists
//         awards and penalties: shared, each hero, or one named hero, with a
//         label and amount (negative for a penalty).
// scripts/apps/battle-report.js v1.1.1 - 2026-10-03
// v1.1.1: Crime editor layout: "+ Crime" sits under the Crimes label, each
//         crime takes two rows (type dropdown with its remove button, then
//         Stopped and Arrested) so the dropdown shows the full crime name.
// scripts/apps/battle-report.js v1.1.0 - 2026-10-01
// v1.1.0: Karma UI slice 2 — the card edits in place, retiring the pop-out
//         encounter editor. Edit (GM) opens an edit view on the card: name,
//         heroes present, foe counts (0 removes) and "Add selected tokens",
//         crimes (type, stopped, arrested), rescues, losses each, GM award.
//         Every change writes the encounter record and the card redraws with
//         new totals. Edit mode is per client (a Set of encounter ids,
//         re-applied on render). openBattleReportEditor posts a fresh card in
//         edit mode and removes older cards for the same encounter, so each
//         encounter has one live card; the Ledger's Edit and Add/Import use it.
// v1.0.0: Battle report chat card (karma UI refactor, slice 1).

const SCOPE = "msh-faserip";
const FLAG = "battleReport";
const editing = new Set();
const revising = new Set();
const snapshots = new Map();

const CRIME_OPTIONS = [
  ["", "— Crime —"],
  ["violent", "Violent (30/15)"], ["destructive", "Destructive (20/10)"],
  ["theft", "Theft (10/5)"], ["robbery", "Robbery (20/10)"],
  ["misdemeanor", "Misdemeanor (5/5)"], ["national", "National Offense (20/10)"],
  ["localConspiracy", "Local Conspiracy (30/15)"], ["nationalConspiracy", "National Conspiracy (40/20)"],
  ["globalConspiracy", "Global Conspiracy (50/25)"], ["other", "Other Crimes (15/5)"]
];

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

function editHtml(encId, raw, TeamSheet) {
  const teamIds = game.settings.get(SCOPE, "teamMembers") || [];
  const present = new Set(raw.presentHeroIds || []);
  const heroes = teamIds.map(id => game.actors.get(id)).filter(Boolean).map(a =>
    `<label class="br-chip"><input type="checkbox" data-br="hero" data-id="${a.id}" ${present.has(a.id) ? "checked" : ""}> ${esc(a.name)}</label>`
  ).join("") || "<em>No team members.</em>";

  const foes = (raw.villains || []).map((v, i) => `<div class="br-erow">
      <span class="br-name">${esc(v.name)}</span>
      <span class="br-rank">${esc(v.rankLabel || "")} ${Number(v.rankValue) || ""}</span>
      <input type="number" min="0" max="99" data-br="foe-count" data-i="${i}" value="${Math.max(1, Number(v.count) || 1)}" aria-label="Count of ${esc(v.name)}">
      <button type="button" data-br="foe-remove" data-i="${i}" aria-label="Remove ${esc(v.name)}"><i class="fas fa-times"></i></button>
    </div>`).join("");

  const crimes = TeamSheet._normalizeCrimes(raw).map((c, i) => `<div class="br-crime">
      <div class="br-erow br-crime-type">
        <select data-br="crime-type" data-i="${i}" aria-label="Crime type">
          ${CRIME_OPTIONS.map(([v, l]) => `<option value="${v}" ${c.type === v ? "selected" : ""}>${l}</option>`).join("")}
        </select>
        <button type="button" data-br="crime-remove" data-i="${i}" aria-label="Remove crime"><i class="fas fa-times"></i></button>
      </div>
      <div class="br-erow br-crime-flags">
        <label><input type="checkbox" data-br="crime-stopped" data-i="${i}" ${c.stopped ? "checked" : ""}> Stopped</label>
        <label><input type="checkbox" data-br="crime-arrested" data-i="${i}" ${c.arrested ? "checked" : ""}> Arrested</label>
      </div>
    </div>`).join("");

  const teamHeroes = teamIds.map(id => game.actors.get(id)).filter(Boolean);
  const bonuses = (raw.bonuses || []).map((b, i) => {
    const scope = b.scope || "split";
    const who = scope === "individual" ? (b.heroId || "") : scope;
    const opts = [["split", "Shared"], ["per_hero", "Each hero"], ...teamHeroes.map(a => [a.id, a.name])];
    if (who === "") opts.unshift(["", "— Hero —"]);
    return `<div class="br-bonus">
      <div class="br-erow">
        <select data-br="bonus-who" data-i="${i}" aria-label="Who gets it">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === who ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
        <input type="number" step="1" data-br="bonus-amount" data-i="${i}" value="${Number(b.amount) || 0}" aria-label="Amount">
        <button type="button" data-br="bonus-remove" data-i="${i}" aria-label="Remove award or penalty"><i class="fas fa-times"></i></button>
      </div>
      <input type="text" class="br-bonus-label" data-br="bonus-label" data-i="${i}" value="${esc(b.label || "")}" placeholder="What for, e.g. Role-play or Public defeat">
    </div>`;
  }).join("");

  const rankOpts = TeamSheet.RANK_TABLE.map((r, i) => r.value > 5000 ? "" :
    `<option value="${i}" ${r.rank === "Remarkable" ? "selected" : ""}>${esc(r.rank)} ${r.value}</option>`).join("");

  const num = (field, label, title) => `<label class="br-num" title="${title}">${label}
      <input type="number" min="0" max="9999" data-br="num" data-field="${field}" value="${Number(raw[field]) || 0}"></label>`;

  const reviseNote = revising.has(encId)
    ? `<div class="br-revise-note"><i class="fas fa-info-circle"></i> Already awarded. Changes save to the record; Save changes asks whether karma changes too.</div>`
    : "";
  return `<div class="br-edit">
    ${reviseNote}
    <label class="br-erow br-namerow">Name <input type="text" data-br="name" value="${esc(raw.name || "")}" placeholder="Battle name"></label>
    <div class="br-label">Heroes present</div>
    <div class="br-chips">${heroes}</div>
    <div class="br-label">Foes defeated</div>
    ${foes || "<em class=\"br-none\">No foes.</em>"}
    <button type="button" class="br-small" data-br="foe-add-selected"><i class="fas fa-crosshairs"></i> Add selected tokens</button>
    <div class="br-foe-add">
      <input type="text" data-br-new="name" placeholder="Or add a foe by name" aria-label="Foe name">
      <div class="br-erow">
        <select data-br-new="rank" aria-label="Foe's highest rank">${rankOpts}</select>
        <input type="number" min="1" max="99" value="1" data-br-new="count" aria-label="How many">
        <button type="button" class="br-small br-add-btn" data-br="foe-add-manual"><i class="fas fa-plus"></i> Add</button>
      </div>
    </div>
    <div class="br-label">Crimes</div>
    <button type="button" class="br-small" data-br="crime-add"><i class="fas fa-plus"></i> Crime</button>
    ${crimes}
    <div class="br-label">Awards and penalties</div>
    <button type="button" class="br-small" data-br="bonus-add"><i class="fas fa-plus"></i> Award or penalty</button>
    ${bonuses}
    <div class="br-label">Other</div>
    <div class="br-nums">
      ${num("rescues", "Rescues", "20 each, at most 100 per rescue action")}
      ${num("losses", "Losses each", "Each present hero loses this amount (losses are individual)")}
      ${num("gmAward", "GM award", "Task or milestone karma, shared like the rest")}
    </div>
  </div>`;
}

/** Card HTML for one encounter, from the TeamSheet's own encounter context. */
async function buildCardHtml(encId) {
  const TeamSheet = await teamSheetClass();
  const ctx = TeamSheet.worker().getData();
  const enc = (ctx.encounters || []).find(e => e.id === encId);
  const raw = encounters().find(e => e.id === encId);
  if (!enc || !raw) {
    return `<div class="faserip-battle-report br-gone"><div class="br-head"><strong>Battle Report</strong></div>
      <div class="br-body"><em>This encounter was deleted.</em></div></div>`;
  }

  const foes = (enc.villainRows || []).map(v => `<div class="br-foe">
      <span class="br-count">${Number(v.count) || 1}×</span>
      <span class="br-name">${esc(v.name)}</span>
      <span class="br-rank">${esc(v.rankLabel || "")}${v.rankValue ? ` ${v.rankValue}` : ""}</span>
      <span class="br-karma">${v.eligible ? `+${v.foeKarma}` : "—"}</span>
    </div>`).join("");

  const heroes = (enc.heroChecks || []).filter(h => h.present).map(h => esc(h.name)).join(", ") || "<em>none marked present</em>";
  const extras = [];
  if (enc.stopValue) extras.push(`Stop +${enc.stopValue}`);
  if (enc.arrestValue) extras.push(`Arrest +${enc.arrestValue}`);
  if (enc.rescueKarma) extras.push(`Rescue +${enc.rescueKarma}`);
  if (enc.gmAward) extras.push(`GM +${enc.gmAward}`);
  if (enc.losses) extras.push(`Losses −${enc.losses} each`);

  const title = esc(enc.displayName || "Battle");
  const when = esc(enc.dateDisplay || "");
  const isRevising = enc.awarded && revising.has(encId);
  const buttons = isRevising
    ? `<button type="button" data-action="br-revise-cancel" data-enc-id="${encId}"><i class="fas fa-times"></i> Cancel</button>
       <button type="button" class="br-primary" data-action="br-revise-save" data-enc-id="${encId}"><i class="fas fa-save"></i> Save changes</button>`
    : enc.awarded
    ? `<button type="button" data-action="br-revise" data-enc-id="${encId}"><i class="fas fa-pen"></i> Edit</button>
       <button type="button" data-action="br-undo" data-enc-id="${encId}"><i class="fas fa-undo"></i> Undo</button>`
    : `<button type="button" class="br-edit-btn" data-action="br-edit" data-enc-id="${encId}"><i class="fas fa-pen"></i> <span class="br-edit-label">Edit</span><span class="br-done-label">Done</span></button>
       <button type="button" class="br-primary" data-action="br-award" data-enc-id="${encId}"><i class="fas fa-check"></i> Award</button>`;

  return `<div class="faserip-battle-report${enc.awarded ? " is-awarded" : ""}" data-enc-id="${encId}">
    <div class="br-head"><strong>Battle Report — ${title}</strong><span class="br-when">${when}</span></div>
    <div class="br-body">
      <div class="br-view">
        ${foes ? `<div class="br-label">Foes defeated</div>${foes}` : ""}
        ${extras.length ? `<div class="br-extras">${extras.join(" · ")}</div>` : ""}
        <div class="br-label">Heroes present</div>
        <div class="br-heroes">${heroes}</div>
      </div>
      ${enc.awarded && !isRevising ? "" : editHtml(encId, raw, TeamSheet)}
      ${enc.summaryLine ? `<div class="br-summary">${enc.summaryLine}</div>` : `<div class="br-summary"><em>No karma yet.</em></div>`}
      ${enc.awarded ? `<div class="br-status"><i class="fas fa-check-circle"></i> Awarded</div>` : ""}
    </div>
    <div class="br-buttons">${buttons}</div>
  </div>`;
}

function gmIds() {
  return game.users.filter(u => u.isGM).map(u => u.id);
}

/** Post the GM-whispered battle report for an encounter. */
export async function postBattleReport(encId) {
  if (!game.user.isGM) return;
  const content = await buildCardHtml(encId);
  await ChatMessage.create({
    content,
    whisper: gmIds(),
    speaker: { alias: "Battle Report" },
    flags: { [SCOPE]: { [FLAG]: encId } }
  });
}

/** Post a fresh card in edit mode; older cards for this encounter are removed. */
export async function openBattleReportEditor(encId, { revise = false } = {}) {
  if (!game.user.isGM) return;
  if (revise) startRevision(encId);
  const old = game.messages.filter(m => m.getFlag(SCOPE, FLAG) === encId).map(m => m.id);
  if (old.length) await ChatMessage.deleteDocuments(old);
  editing.add(encId);
  await postBattleReport(encId);
  ui.sidebar?.changeTab?.("chat", "primary");
}

function startRevision(encId) {
  const raw = encounters().find(e => e.id === encId);
  if (!raw?.awarded) return;
  if (!revising.has(encId)) snapshots.set(encId, foundry.utils.deepClone(raw));
  revising.add(encId);
}

function endRevision(encId) {
  revising.delete(encId);
  editing.delete(encId);
  snapshots.delete(encId);
}

let _refreshTimer = null;
/** Re-render every battle report card (debounced; GM only). */
export function refreshBattleReports() {
  if (!game.user.isGM) return;
  clearTimeout(_refreshTimer);
  _refreshTimer = setTimeout(async () => {
    for (const m of game.messages.filter(msg => msg.getFlag(SCOPE, FLAG))) {
      const html = await buildCardHtml(m.getFlag(SCOPE, FLAG));
      if (html !== m.content) await m.update({ content: html });
    }
  }, 150);
}

/** Change the stored encounter; the setting hook redraws the cards. */
async function mutate(encId, fn) {
  const list = foundry.utils.deepClone(encounters());
  const enc = list.find(e => e.id === encId);
  if (!enc || (enc.awarded && !revising.has(encId))) return;
  await fn(enc);
  await game.settings.set(SCOPE, "defeatedVillains", list);
}

async function onEditControl(el, encId) {
  const TeamSheet = await teamSheetClass();
  const i = Number(el.dataset.i);
  switch (el.dataset.br) {
    case "name":
      return mutate(encId, e => { e.name = el.value.trim(); });
    case "hero":
      return mutate(encId, e => {
        const ids = new Set(e.presentHeroIds || []);
        if (el.checked) ids.add(el.dataset.id); else ids.delete(el.dataset.id);
        e.presentHeroIds = [...ids];
      });
    case "foe-count":
      return mutate(encId, e => {
        const n = Math.max(0, Math.floor(Number(el.value) || 0));
        if (n === 0) e.villains.splice(i, 1);
        else if (e.villains[i]) e.villains[i].count = n;
      });
    case "foe-remove":
      return mutate(encId, e => { e.villains.splice(i, 1); });
    case "foe-add-selected": {
      const team = new Set(game.settings.get(SCOPE, "teamMembers") || []);
      const actors = (canvas?.tokens?.controlled || []).map(t => t.actor).filter(a => a && !team.has(a.id));
      if (!actors.length) { ui.notifications.warn("Select the foes' tokens first."); return; }
      return mutate(encId, e => {
        e.villains ??= [];
        for (const a of actors) {
          const hit = e.villains.find(v => v.actorId === a.id);
          if (hit) { hit.count = (Number(hit.count) || 1) + 1; continue; }
          const { rankValue, rankLabel } = TeamSheet.getHighestRank(a);
          e.villains.push({ name: a.name, img: a.img || "icons/svg/mystery-man.svg", actorId: a.id, rankValue, rankLabel, count: 1 });
        }
      });
    }
    case "crime-add":
      return mutate(encId, e => {
        e.crimes = [...TeamSheet._normalizeCrimes(e), { type: "", stopped: false, arrested: false }];
        delete e.crimeType; delete e.stopped; delete e.arrested;
      });
    case "crime-remove":
    case "crime-type":
    case "crime-stopped":
    case "crime-arrested":
      return mutate(encId, e => {
        const crimes = [...TeamSheet._normalizeCrimes(e)].map(c => ({ ...c }));
        if (el.dataset.br === "crime-remove") crimes.splice(i, 1);
        else if (crimes[i]) {
          if (el.dataset.br === "crime-type") crimes[i].type = el.value;
          if (el.dataset.br === "crime-stopped") crimes[i].stopped = el.checked;
          if (el.dataset.br === "crime-arrested") crimes[i].arrested = el.checked;
        }
        e.crimes = crimes;
        delete e.crimeType; delete e.stopped; delete e.arrested;
      });
    case "num":
      return mutate(encId, e => { e[el.dataset.field] = Math.max(0, Math.floor(Number(el.value) || 0)); });
    case "foe-add-manual": {
      const box = el.closest(".br-foe-add");
      const name = box?.querySelector('[data-br-new="name"]')?.value.trim();
      if (!name) { ui.notifications.warn("Type the foe's name first."); return; }
      const rank = TeamSheet.RANK_TABLE[Number(box.querySelector('[data-br-new="rank"]')?.value)] || TeamSheet.RANK_TABLE[0];
      const count = Math.max(1, Math.floor(Number(box.querySelector('[data-br-new="count"]')?.value) || 1));
      return mutate(encId, e => {
        e.villains ??= [];
        const hit = e.villains.find(v => !v.actorId && v.name === name && Number(v.rankValue) === rank.value);
        if (hit) hit.count = (Number(hit.count) || 1) + count;
        else e.villains.push({ name, img: "icons/svg/mystery-man.svg", actorId: null, rankValue: rank.value, rankLabel: rank.rank, count });
      });
    }
    case "bonus-add":
      return mutate(encId, e => {
        const first = (e.presentHeroIds || [])[0] || "";
        e.bonuses = [...(e.bonuses || []), { label: "", amount: 0, scope: "individual", heroId: first }];
      });
    case "bonus-remove":
      return mutate(encId, e => { (e.bonuses ||= []).splice(i, 1); });
    case "bonus-who":
    case "bonus-amount":
    case "bonus-label":
      return mutate(encId, e => {
        const b = (e.bonuses || [])[i];
        if (!b) return;
        if (el.dataset.br === "bonus-label") b.label = el.value.trim();
        if (el.dataset.br === "bonus-amount") b.amount = Math.trunc(Number(el.value) || 0);
        if (el.dataset.br === "bonus-who") {
          if (el.value === "split" || el.value === "per_hero") { b.scope = el.value; delete b.heroId; }
          else { b.scope = "individual"; b.heroId = el.value; }
        }
      });
  }
}

/** Chat button handler for Award / Edit / Undo (wired in chat-hooks.js). */
export async function handleBattleReportClick(btn) {
  if (!game.user.isGM) { ui.notifications.warn("Only the GM can award karma."); return; }
  const encId = btn.dataset.encId;
  if (btn.dataset.action === "br-revise") {
    startRevision(encId);
    editing.add(encId);
    refreshBattleReports();
    return;
  }
  if (btn.dataset.action === "br-revise-cancel") {
    const snap = snapshots.get(encId);
    endRevision(encId);
    if (snap) {
      const list = foundry.utils.deepClone(encounters());
      const i = list.findIndex(e => e.id === encId);
      if (i >= 0) { list[i] = snap; await game.settings.set(SCOPE, "defeatedVillains", list); }
    }
    refreshBattleReports();
    return;
  }
  if (btn.dataset.action === "br-revise-save") {
    const TeamSheet = await teamSheetClass();
    if (await TeamSheet.saveEncounterRevision(encId)) endRevision(encId);
    refreshBattleReports();
    return;
  }
  if (btn.dataset.action === "br-edit") {
    const card = btn.closest(".faserip-battle-report");
    if (editing.has(encId)) editing.delete(encId); else editing.add(encId);
    card?.classList.toggle("br-editing", editing.has(encId));
    return;
  }
  if (!encounters().some(e => e.id === encId)) {
    ui.notifications.warn("That encounter no longer exists.");
    return;
  }
  const TeamSheet = await teamSheetClass();
  if (btn.dataset.action === "br-award") { editing.delete(encId); await TeamSheet.awardEncounterById(encId); }
  if (btn.dataset.action === "br-undo") await TeamSheet.undoEncounterById(encId);
  refreshBattleReports();
}

/** Keep cards in sync with edits made anywhere; bind the card's edit controls. */
export function registerBattleReportHooks() {
  const onSetting = (setting) => {
    if (setting?.key === `${SCOPE}.defeatedVillains`) refreshBattleReports();
  };
  Hooks.on("updateSetting", onSetting);
  Hooks.on("createSetting", onSetting);

  Hooks.on("renderChatMessageHTML", (message, el) => {
    const encId = message.getFlag?.(SCOPE, FLAG);
    if (!encId) return;
    const card = el.querySelector?.(".faserip-battle-report");
    if (!card) return;
    card.classList.toggle("br-editing", editing.has(encId));
    if (!game.user.isGM) return;
    card.addEventListener("change", (ev) => {
      const t = ev.target.closest("[data-br]");
      if (t && t.tagName !== "BUTTON") onEditControl(t, encId);
    });
    card.addEventListener("click", (ev) => {
      const t = ev.target.closest("button[data-br]");
      if (!t) return;
      ev.preventDefault();
      onEditControl(t, encId);
    });
  });
}
