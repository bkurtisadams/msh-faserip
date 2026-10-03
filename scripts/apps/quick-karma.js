// scripts/apps/quick-karma.js v1.0.0 - 2026-10-01
// v1.0.0: Karma UI slice 3 — immediate awards from the tokens. GM-only
//         Karma button in the token HUD and a K keybinding open one dialog
//         for every selected token (the right-clicked token alone when it is
//         not part of the selection). RAW (Karma chapter, kernel values):
//         - Stopping a crime, arresting, rescues (20 each, 100 max per
//           action) and preventing a disaster are awarded as they happen.
//           Gains split evenly among the heroes, fractions dropped, or go in
//           full to each with Full Karma to Each Hero on; with the Team
//           Karma Pool on they go to the pool.
//         - A selected foe of Remarkable or higher adds its highest rank
//           number (the Scorpion example); smaller foes add nothing.
//         - Losses are individual: committing a crime (kernel commit value),
//           permitting a crime (= arrest value), defeat (private 20, public
//           40), property damage (5 per area). A loss never takes a hero
//           below 0; in pool mode the remainder comes from the pool.
//         Entries share one timestamp and type ("Immediate Award" /
//         "Immediate Loss") so the Ledger shows each award as one batch row.

import { CRIME_KARMA, rescueAward, foeDefeatAward, propertyDestructionLoss, DEFEAT_LOSS, poolAbsorbLoss } from "../lib/faserip-rules/faserip-karma.js";
import { getCategoryMultiplier } from "../karma-multipliers.js";
import { computeKarmaTotals } from "../karma-rules.js";

const SCOPE = "msh-faserip";

const CRIMES = [
  ["violent", "Violent"], ["destructive", "Destructive"], ["theft", "Theft"],
  ["robbery", "Robbery"], ["misdemeanor", "Misdemeanor"], ["nationalOffense", "National Offense"],
  ["localConspiracy", "Local Conspiracy"], ["nationalConspiracy", "National Conspiracy"],
  ["globalConspiracy", "Global Conspiracy"], ["other", "Other Crime"]
];
const crimeLabel = (k) => CRIMES.find(([v]) => v === k)?.[1] || k;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function isHero(actor, team) {
  if (team.has(actor.id)) return true;
  const kind = String(actor.system?.characterType || "").toLowerCase();
  return actor.type === "hero" && !kind.includes("villain") && kind !== "civilian";
}

function availableKarma(actor) {
  const history = actor.system?.karma?.history || [];
  return computeKarmaTotals(history, { advancement: actor.system?.karma?.advancement }).value;
}

async function pushEntries(actor, entries) {
  const history = foundry.utils.deepClone(actor.system?.karma?.history || []);
  history.push(...entries);
  const { earned, value } = computeKarmaTotals(history, { advancement: actor.system?.karma?.advancement });
  await actor.update({
    "system.karma.history": history,
    "system.karma.lifetime": earned,
    "system.attributes.karma.value": value
  });
}

/** Unique actors behind the tokens: heroes and foes. */
function splitTokens(tokens) {
  const team = new Set(game.settings.get(SCOPE, "teamMembers") || []);
  const heroes = new Map(), foes = new Map();
  for (const t of tokens) {
    const a = t?.actor;
    if (!a) continue;
    if (isHero(a, team)) { heroes.set(a.id, a); continue; }
    const key = t.document?.actorLink ? a.id : (t.id || a.id);
    foes.set(key, a);
  }
  return { heroes: [...heroes.values()], foes: [...foes.values()] };
}

/** Totals from the dialog's choices. */
function compute(form, heroCount, foeRanks) {
  const crime = CRIME_KARMA[form.crime] || null;
  const comMult = getCategoryMultiplier("combat");
  const resMult = getCategoryMultiplier("rescue");
  const penMult = getCategoryMultiplier("penalty");
  const parts = [];
  let gain = 0;
  if (crime && form.stopped) { gain += Math.floor(crime.stop * comMult); parts.push(`Stopped ${crimeLabel(form.crime)}`); }
  if (crime && form.arrested) { gain += Math.floor(crime.arrest * comMult); parts.push(`Arrested ${crimeLabel(form.crime)}`); }
  if (form.rescues > 0) { gain += Math.floor(rescueAward(form.rescues) * resMult); parts.push(`Rescue ×${form.rescues}`); }
  if (form.disaster > 0) { gain += Math.floor(form.disaster * comMult); parts.push(`Prevented disaster`); }
  for (const f of foeRanks) {
    if (!f.checked || !f.award) continue;
    gain += Math.floor(f.award * comMult);
    parts.push(`Foe: ${f.name} (${f.award})`);
  }

  const lossParts = [];
  let loss = 0;
  const commit = CRIME_KARMA[form.committed];
  if (commit) { loss += commit.commit; lossParts.push(`Committed ${crimeLabel(form.committed)}`); }
  const permit = CRIME_KARMA[form.permitted];
  if (permit) { loss += permit.permit; lossParts.push(`Permitted ${crimeLabel(form.permitted)}`); }
  if (form.defeat === "private" || form.defeat === "public") {
    loss += DEFEAT_LOSS[form.defeat];
    lossParts.push(form.defeat === "public" ? "Public defeat" : "Private defeat");
  }
  if (form.areas > 0) { loss += propertyDestructionLoss(form.areas); lossParts.push(`Property damage ×${form.areas}`); }
  loss = loss ? Math.ceil(loss * penMult) : 0;

  const full = !!game.settings.get(SCOPE, "fullKarmaEachHero");
  const pool = !!game.settings.get(SCOPE, "useKarmaPool");
  const n = Math.max(1, heroCount);
  const each = full ? gain : Math.floor(gain / n);
  return { gain, each, loss, parts, lossParts, full, pool, n };
}

function readForm(root) {
  const q = (s) => root.querySelector(s);
  return {
    crime: q('[name="crime"]')?.value || "",
    stopped: !!q('[name="stopped"]')?.checked,
    arrested: !!q('[name="arrested"]')?.checked,
    rescues: Math.max(0, Number(q('[name="rescues"]')?.value) || 0),
    disaster: Math.max(0, Number(q('[name="disaster"]')?.value) || 0),
    committed: q('[name="committed"]')?.value || "",
    permitted: q('[name="permitted"]')?.value || "",
    defeat: q('[name="defeat"]')?.value || "",
    areas: Math.max(0, Number(q('[name="areas"]')?.value) || 0),
    heroIds: [...root.querySelectorAll('[name="hero"]:checked')].map(i => i.value),
    foeKeys: new Set([...root.querySelectorAll('[name="foe"]:checked')].map(i => i.value))
  };
}

function previewText(t) {
  const lines = [];
  if (t.gain) {
    if (t.pool) lines.push(`+${t.gain} to the team pool`);
    else lines.push(t.full ? `+${t.gain} to each hero (full award)` : `+${t.gain} ÷ ${t.n} = <strong>+${t.each}</strong> each`);
  }
  if (t.loss) lines.push(`<strong>${t.loss}</strong> each hero (losses are individual, never below 0)`);
  return lines.join("<br>") || "<em>Choose something to award.</em>";
}

/** Open the immediate-award dialog for the given tokens (defaults to the selection). */
export async function openQuickKarma(tokens = canvas?.tokens?.controlled || []) {
  if (!game.user.isGM) return;
  const { heroes, foes } = splitTokens(tokens);
  if (!heroes.length) { ui.notifications.warn("Select at least one hero's token."); return; }

  const { TeamSheet } = await import("../teamSheet.js");
  const foeRanks = foes.map((a, i) => {
    const { rankValue, rankLabel } = TeamSheet.getHighestRank(a);
    const award = foeDefeatAward(Number(rankValue) || 0);
    return { key: String(i), name: a.name, rankValue, rankLabel, award, checked: award > 0 };
  });

  const crimeOpts = (blank) => `<option value="">${blank}</option>` + CRIMES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  const content = `<form class="faserip-quick-karma">
    <div class="qk-label">Heroes</div>
    <div class="qk-chips">${heroes.map(h => `<label class="qk-chip"><input type="checkbox" name="hero" value="${h.id}" checked> ${esc(h.name)}</label>`).join("")}</div>
    <div class="qk-label">Earned now</div>
    <div class="qk-row">
      <select name="crime" aria-label="Crime">${crimeOpts("— Crime —")}</select>
      <label><input type="checkbox" name="stopped"> Stopped</label>
      <label><input type="checkbox" name="arrested"> Arrested</label>
    </div>
    <div class="qk-row">
      <label>Rescues <input type="number" name="rescues" min="0" max="99" value="0"></label>
      <label title="Judge sets the amount">Prevented disaster <input type="number" name="disaster" min="0" max="9999" value="0"></label>
    </div>
    ${foeRanks.length ? `<div class="qk-label">Foes defeated or arrested</div>
      ${foeRanks.map(f => `<label class="qk-foe"><input type="checkbox" name="foe" value="${f.key}" ${f.checked ? "checked" : ""} ${f.award ? "" : "disabled"}>
        ${esc(f.name)} <span class="qk-dim">${esc(f.rankLabel || "")} ${Number(f.rankValue) || ""}</span>
        <span class="qk-amt">${f.award ? `+${f.award}` : "below Remarkable"}</span></label>`).join("")}` : ""}
    <div class="qk-label">Lost now (each hero)</div>
    <div class="qk-row">
      <select name="committed" aria-label="Crime committed">${crimeOpts("— Committed crime —")}</select>
      <select name="permitted" aria-label="Crime permitted">${crimeOpts("— Permitted crime —")}</select>
    </div>
    <div class="qk-row">
      <select name="defeat" aria-label="Defeat"><option value="">— Defeat —</option><option value="private">Private (−20)</option><option value="public">Public, more than 3 witnesses (−40)</option></select>
      <label>Areas damaged <input type="number" name="areas" min="0" max="99" value="0"></label>
    </div>
    <div class="qk-preview"></div>
  </form>`;

  const recalc = (root) => {
    const f = readForm(root);
    const fr = foeRanks.map(x => ({ ...x, checked: f.foeKeys.has(x.key) }));
    root.querySelector(".qk-preview").innerHTML = previewText(compute(f, f.heroIds.length, fr));
  };

  new Dialog({
    title: "Award Karma",
    content,
    buttons: {
      award: {
        icon: '<i class="fas fa-check"></i>', label: "Award",
        callback: async (html) => {
          const root = html[0] ?? html;
          const f = readForm(root);
          const chosen = heroes.filter(h => f.heroIds.includes(h.id));
          if (!chosen.length) { ui.notifications.warn("No heroes ticked."); return false; }
          const fr = foeRanks.map(x => ({ ...x, checked: f.foeKeys.has(x.key) }));
          await applyAward(chosen, compute(f, chosen.length, fr));
        }
      },
      cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
    },
    default: "award",
    render: (html) => {
      const root = html[0] ?? html;
      root.addEventListener("change", () => recalc(root));
      root.addEventListener("input", () => recalc(root));
      recalc(root);
    }
  }, { width: 460, classes: ["dialog", "faserip-quick-karma-dialog"] }).render(true);
}

async function applyAward(heroes, t) {
  if (!t.gain && !t.loss) { ui.notifications.info("Nothing to award."); return; }
  const timestamp = new Date().toISOString();
  const realDate = new Date().toLocaleDateString();
  let gameDate = "";
  try {
    const { TeamSheet } = await import("../teamSheet.js");
    gameDate = TeamSheet._getGameDateTimeStatic().gameDate || "";
  } catch (_) {}
  const gainDesc = t.parts.join(", ");
  const lossDesc = t.lossParts.join(", ");
  const results = [];

  let pool = Number(game.settings.get(SCOPE, "teamKarmaPoolTotal")) || 0;
  if (t.gain && t.pool) pool += t.gain;

  for (const h of heroes) {
    const entries = [];
    let got = 0, lost = 0;
    if (t.gain && !t.pool && t.each > 0) {
      entries.push({ timestamp, realDate, gameDate, amount: t.each, type: "Immediate Award", description: gainDesc, encounterId: null });
      got = t.each;
    }
    if (t.loss) {
      const have = availableKarma(h) + got;
      let fromHero = Math.min(have, -t.loss);
      if (t.pool) {
        const after = poolAbsorbLoss({ individual: have, pool, loss: -t.loss });
        fromHero = have - after.individual;
        pool = after.pool;
      }
      if (fromHero > 0) {
        const capped = fromHero < -t.loss && !t.pool ? ` (capped at ${fromHero}; loss was ${-t.loss})` : "";
        entries.push({ timestamp, realDate, gameDate, amount: -fromHero, type: "Immediate Loss", description: lossDesc + capped, encounterId: null });
        lost = fromHero;
      }
    }
    if (entries.length) await pushEntries(h, entries);
    results.push({ name: h.name, got, lost });
  }
  if (t.pool) await game.settings.set(SCOPE, "teamKarmaPoolTotal", Math.max(0, pool));

  const rows = results.map(r => {
    const bits = [];
    if (r.got) bits.push(`<span style="color:#1b5e20;">+${r.got}</span>`);
    if (r.lost) bits.push(`<span style="color:#b71c1c;">−${r.lost}</span>`);
    return bits.length ? `<div><strong>${esc(r.name)}</strong> ${bits.join(" ")}</div>` : "";
  }).join("");
  await ChatMessage.create({
    speaker: { alias: "Karma" },
    content: `<div style="background:#f5f5f0;border:1px solid #8b0000;border-radius:3px;">
      <div style="padding:4px 8px;background:#8b0000;color:#fff;font-weight:bold;">Karma</div>
      <div style="padding:6px 8px;font-size:13px;">
        ${gainDesc ? `<div>${esc(gainDesc)}${t.pool ? ` — <strong>+${t.gain}</strong> to the team pool` : ""}</div>` : ""}
        ${lossDesc ? `<div>${esc(lossDesc)}</div>` : ""}
        ${rows}
      </div></div>`
  });
  for (const w of Object.values(ui.windows)) if (w.constructor?.name === "TeamSheet" && w.rendered) w.render(false);
}

/** Token HUD button (GM) and the K keybinding. Call from the init hook. */
export function registerQuickKarma() {
  game.keybindings.register(SCOPE, "quickKarma", {
    name: "Award Karma (selected tokens)",
    category: "FASERIP",
    hint: "Opens the immediate karma award for the selected tokens. GM only.",
    editable: [{ key: "KeyK" }],
    restricted: true,
    onDown: () => { openQuickKarma(); return true; }
  });

  Hooks.on("renderTokenHUD", (hud, html) => {
    if (!game.user.isGM) return;
    const el = html instanceof HTMLElement ? html : html?.[0];
    const col = el?.querySelector(".col.right") || el?.querySelector(".right");
    if (!col || col.querySelector(".faserip-karma-hud")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "control-icon faserip-karma-hud";
    btn.title = "Award Karma";
    btn.setAttribute("aria-label", "Award Karma");
    btn.innerHTML = '<i class="fas fa-hand-sparkles"></i>';
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const token = hud.object;
      const controlled = canvas.tokens.controlled;
      const tokens = controlled.includes(token) ? controlled : [token];
      openQuickKarma(tokens);
    });
    col.appendChild(btn);
  });
}
