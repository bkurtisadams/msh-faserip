// scripts/modules/actions/fire-modes.js v1.1.0 - 2026-11-19
// v1.1.0: Compact: one options row (Shots/Barrels, Burst, Scatter,
//         Reloading) styled like the Multi row; details in tooltips.
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

/** One options row for the chosen weapon ("" when nothing applies):
 *  Shots x1/x2, Burst (with the burst's target count), Scatter, and the
 *  1-per-2 warning. Details sit in tooltips to keep the dialog compact. */
export function fireModeBoxHtml(weapon, { targets = [], areasBetween = () => 0, combat = null } = {}) {
  const fm = weaponFireMode(weapon);
  const parts = [];
  if (fm.maxShots > 1) {
    const tip = fm.barrels ? "One or both barrels; separate rolls, no Multi FEAT" : "Shots this round; separate rolls, no Multi FEAT";
    parts.push(`<span class="frp-opt-label blue" title="${tip}">${fm.barrels ? "Barrels" : "Shots"}</span>
      <label><input type="radio" name="fireShots" value="1" checked> &times;1</label>
      <label><input type="radio" name="fireShots" value="2"> &times;2</label>`);
  }
  if (fm.burst) {
    const { inBurst, left } = burstTargets(targets, areasBetween);
    const tip = ["One roll for up to 3 targets in the same area",
      ...inBurst.map(t => `In: ${t.name}`), ...left.map(l => `Out: ${l.token.name} (${l.reason})`)].join("\n");
    const n = Math.max(1, inBurst.length);
    parts.push(`<label${parts.length ? ' style="margin-left:8px;"' : ""} title="${esc(tip)}"><input type="checkbox" name="fireBurst" checked> <span class="frp-opt-label blue">Burst</span></label>
      <span title="${esc(tip)}">${n} target${n === 1 ? "" : "s"}${left.length ? ` (${left.length} out)` : ""}</span>`);
  }
  if (fm.scatter) {
    parts.push(`<span class="frp-opt-label blue"${parts.length ? ' style="margin-left:8px;"' : ""} title="On a hit, everyone within 1 area of the target takes the damage">Scatter</span>`);
  }
  if (fm.slow) {
    const st = slowWeaponStatus(weapon, combat);
    if (st.blocked) {
      parts.push(`<span class="frp-opt-label orange"${parts.length ? ' style="margin-left:8px;"' : ""} title="Fires 1 shot every 2 rounds; fired in round ${st.lastRound}, next shot round ${st.nextRound}">Reloading</span>
        <label><input type="checkbox" name="fireAnyway"> Fire anyway</label>`);
    }
  }
  if (!parts.length) return "";
  return `<div class="frp-opt-row" style="border-bottom:1px solid #e8e0d0;">${parts.join("")}</div>`;
}
