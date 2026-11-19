// scripts/modules/actions/fire-modes.js v1.0.0 - 2026-11-19
// v1.0.0: Weapon Rate, bursts and scatter (Players Book ch. 4, Shooting
//         Weapons): "Multiple shots require separate die rolls, but are
//         taken at the same time in the combat phase. Certain weapons fire
//         bursts, which affect up to three adjacent targets, with one roll
//         made for all targets. Some weapons are noted to scatter, which
//         indicates all targets within one area of the target will be hit
//         for that damage."
//         RULED 2026-11-19: burst "adjacent" = in the same area as the main
//         target; Shotgun "1,2" = one or both barrels, each a burst; a
//         "1 per 2" weapon fired last round warns, the GM may fire anyway.
//         Scatter: everyone within one area of the target (same or next area),
//         the shooter excepted.

const SCOPE = "msh-faserip";
const norm = v => String(v ?? "").trim().toLowerCase();

/** What the weapon's Rate and Burst/Scatter fields allow. */
export function weaponFireMode(weapon) {
  const sys = weapon?.system || {};
  const rate = norm(sys.rate);
  const bs = norm(sys.burstScatter);
  return {
    rate,
    maxShots: rate === "2" || rate === "1,2" ? 2 : 1,
    barrels: rate === "1,2",
    slow: rate === "1 per 2",
    burst: bs === "burst",
    scatter: bs === "scatter"
  };
}

/** Burst targets: the first target plus up to two more in its area. */
export function burstTargets(targets, areasBetween) {
  const list = Array.from(targets ?? []);
  const main = list[0];
  if (!main) return { inBurst: [], left: [] };
  const inBurst = [main];
  const left = [];
  for (const t of list.slice(1)) {
    const d = areasBetween(main, t);
    if (d > 0) left.push({ token: t, reason: `${d} area${d === 1 ? "" : "s"} from ${main.name}, not in the same area` });
    else if (inBurst.length >= 3) left.push({ token: t, reason: "a burst covers up to 3 targets" });
    else inBurst.push(t);
  }
  return { inBurst, left };
}

/** Scatter: every token within one area of the target, except the target
 *  itself and the shooter. */
export function scatterTokens(target, tokens, areasBetween, { exclude = [] } = {}) {
  if (!target) return [];
  const skip = new Set([target.id, ...exclude].filter(Boolean));
  return Array.from(tokens ?? []).filter(t => t?.actor && !skip.has(t.id) && areasBetween(target, t) <= 1);
}

/** A "1 shot every 2 rounds" weapon fired in the previous round of this combat. */
export function slowWeaponStatus(weapon, combat) {
  if (!weaponFireMode(weapon).slow || !combat?.started) return { blocked: false };
  const last = weapon.getFlag?.(SCOPE, "lastFired") ?? weapon.flags?.[SCOPE]?.lastFired;
  if (!last || last.combatId !== combat.id) return { blocked: false };
  const round = Number(combat.round) || 0;
  const blocked = round - Number(last.round) < 2;
  return { blocked, lastRound: Number(last.round), nextRound: Number(last.round) + 2 };
}

export async function markSlowWeaponFired(weapon, combat) {
  if (!weaponFireMode(weapon).slow || !combat?.started) return;
  try { await weapon.setFlag(SCOPE, "lastFired", { combatId: combat.id, round: Number(combat.round) || 0 }); } catch (_e) { /* not owner */ }
}

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** The dialog's fire-mode box for the chosen weapon ("" when nothing applies). */
export function fireModeBoxHtml(weapon, { targets = [], areasBetween = () => 0, combat = null } = {}) {
  const fm = weaponFireMode(weapon);
  const parts = [];
  const lbl = t => `<div class="frp-fire-lbl">${t}</div>`;
  if (fm.maxShots > 1) {
    const one = fm.barrels ? "1 barrel" : "1 shot";
    const two = fm.barrels ? "Both barrels" : "2 shots";
    parts.push(`${lbl("Rate of fire")}
      <div class="frp-fire-row"><label><input type="radio" name="fireShots" value="1" checked> ${one}</label>
      <label><input type="radio" name="fireShots" value="2"> ${two}</label></div>
      <div class="frp-fire-note">${esc(weapon.name)} fires 2 shots a round: one roll each, at the same time, no Multi FEAT.${fm.burst ? " Each shot is a burst." : ""}</div>`);
  }
  if (fm.slow) {
    const st = slowWeaponStatus(weapon, combat);
    if (st.blocked) {
      parts.push(`${lbl("Rate of fire")}
        <div class="frp-fire-warn">${esc(weapon.name)} fires 1 shot every 2 rounds and was fired in round ${st.lastRound}. Next shot: round ${st.nextRound}.</div>
        <div class="frp-fire-row"><label><input type="checkbox" name="fireAnyway"> Fire anyway (GM call)</label></div>`);
    }
  }
  if (fm.burst) {
    const { inBurst, left } = burstTargets(targets, areasBetween);
    const chips = inBurst.map(t => `<span class="frp-fire-chip in">&check; ${esc(t.name)}</span>`).join("")
      + left.map(l => `<span class="frp-fire-chip out" title="${esc(l.reason)}">${esc(l.token.name)}</span>`).join("");
    const warn = left.filter(l => !l.reason.startsWith("a burst")).map(l => `${esc(l.token.name)} is ${esc(l.reason)}: left out of the burst.`).join(" ");
    parts.push(`${lbl("Burst")}
      <div class="frp-fire-row"><label><input type="checkbox" name="fireBurst" checked> Fire a burst</label><span class="frp-fire-hint">one roll, up to 3 targets in the same area</span></div>
      ${chips ? `<div>${chips}</div>` : `<div class="frp-fire-note">Target up to 3 tokens in the same area.</div>`}
      ${warn ? `<div class="frp-fire-warn">${warn}</div>` : ""}`);
  }
  if (fm.scatter) {
    const main = Array.from(targets ?? [])[0];
    parts.push(`${lbl("Scatter")}
      <div class="frp-fire-row" style="font-size:12px">On a hit, everyone within 1 area of ${esc(main?.name || "the target")} takes the damage.</div>`);
  }
  if (!parts.length) return "";
  return `<div class="frp-box frp-fire-box">${parts.join("")}</div>`;
}
