// scripts/modules/actions/vehicle-control.js v1.2.0 - 2026-11-22
// v1.2.0: Compact Control FEAT dialog. A Maneuver field (the book's Control
//         FEAT list for the vehicle's Type, plus Vehicle Stunt and Other)
//         replaces the stunt checkbox, and a Difficulty choice sets the
//         colour the maneuver needs; the dialog shows the Required colour
//         live, after Speeding. A turn of up to 90 degrees that gives up one
//         area needs no FEAT, so the ground lists carry "Sudden turn (no
//         slowing)" instead. Crash settings moved to their own step behind
//         the Crash button (openVehicleCrash). Current Speed options carry
//         areas/round. openVehicleControl takes { maneuver, name,
//         difficulty, speed } to preselect. vehicleSpeedInfo lives here now.
// scripts/modules/actions/vehicle-control.js v1.1.0 - 2026-11-20
// v1.1.0: Speeding. A Current Speed one rank over the vehicle's safe Speed
//         makes the Control FEAT one colour harder (green to yellow, yellow
//         to red); more than one rank over is refused.
// scripts/modules/actions/vehicle-control.js v1.0.0 - 2026-11-20
// v1.0.0: Vehicle Control FEAT, Out of Control and Crashes in one place, for
//         a vehicle item on a character (Vehicles tab) and for a vehicle
//         actor (vehicle sheet, driver from its crew). Moved out of
//         actorSheet.js _rollVehicleControl. Chat cards follow the ability
//         FEAT card: Required pill, colour banner, success line; dice ride
//         on the card instead of a separate roll message.

import { RANK_VALUES, valueToRank, MATERIAL_STRENGTH } from "../../rules/rules-reference.js";
import { LONG_DISTANCE } from "../../lib/faserip-rules/faserip-movement.js";
import { rollUniversalTable } from "../dice/universal-table.js";
import { showFaseripButtonDialog } from "./dialog-shim.js";

const SCOPE = "msh-faserip";
const RANK_TABLE = [
  "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
  "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
  "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
];
const SELECTABLE = RANK_TABLE.slice(0, 17);
const FALL_FLOORS = [3, 6, 10, 20];
const COLOR_ORDER = { white: 0, green: 1, yellow: 2, red: 3 };
const SLOWING_TYPES = ["Road", "Off-Road", "Railed", "GEV"];
const HARDER = { green: "yellow", yellow: "red", red: "red" };

export const STUNT = "Vehicle Stunt";
export const OTHER = "Other";
const REGAIN = "Regain control";
const GROUND = ["Sudden stop", "Sudden turn (no slowing)", "Sudden action above listed Speed"];
const AIR = ["Sudden turn or dodge", "Turn of 45° or more", "Take-off or landing in abnormal conditions"];
const MANEUVERS = {
  "Road": ["Sudden stop", "Sudden turn (no slowing)", "Travelling off-road", "Sudden action above listed Speed"],
  "Off-Road": GROUND,
  "Railed": ["Sudden stop"],
  "GEV": [...GROUND, ...AIR],
  "Air": AIR,
  "Space": ["Take-off", "Landing", "Sudden movement"],
  "Water": ["Sudden change in course"],
  "Submersible": ["Sudden change in course"]
};

export function maneuversFor(type) {
  return [...(MANEUVERS[type] ?? MANEUVERS.Road), "Action while speeding", STUNT, OTHER];
}

const SPEED_KEYS = {
  "Feeble": "FE", "Poor": "PR", "Typical": "TY", "Good": "GD", "Excellent": "EX",
  "Remarkable": "RM", "Incredible": "IN", "Amazing": "AM", "Monstrous": "MN",
  "Unearthly": "UN", "Shift-X": "SHX", "Shift-Y": "SHY", "Shift-Z": "SHZ",
  "Class 1000": "CL1000", "Class 3000": "CL3000", "Class 5000": "CL5000"
};
const AIR_COLUMN_TYPES = ["Air", "Space", "GEV"];

export function usesAirColumn(type) {
  return AIR_COLUMN_TYPES.includes(type);
}

export function vehicleSpeedInfo(rank, type) {
  const air = usesAirColumn(type);
  const row = LONG_DISTANCE[SPEED_KEYS[rank]];
  if (!row) return { areas: 0, mph: 0, numeric: true, short: "0", long: "0 areas/round" };
  const areas = air ? row.air : row.land;
  if (typeof areas !== "number") return { areas, mph: null, numeric: false, short: areas, long: areas };
  const mph = (air ? row.airMph : row.landMph) ?? areas * 15;
  return { areas, mph, numeric: true, short: String(areas), long: `${areas} areas/round, ${mph.toLocaleString("en-US")} mph` };
}

const speedLabel = (rank, type) => {
  const info = vehicleSpeedInfo(rank, type);
  return `${rank} (${info.short}${info.numeric ? ` area${info.areas === 1 ? "" : "s"}` : ""})`;
};
const materialLabel = (rank) => {
  const eg = MATERIAL_STRENGTH[rank] ?? (rankIdx(rank) > rankIdx("Unearthly") ? MATERIAL_STRENGTH["Class 1000+"] : "");
  return eg ? `${rank} — ${eg}` : rank;
};
const crashNeededFor = (material, strength) => {
  const diff = rankIdx(material) - rankIdx(strength);
  return diff < 0 ? "green" : diff === 0 ? "yellow" : "red";
};

const FIELD = "display:flex;flex-direction:column;gap:2px;min-width:0;";
const CAPTION = "font-size:12px;color:#5a5446;";
const CONTROL = "width:100%;box-sizing:border-box;height:26px;";
const SUMMARY = "display:flex;flex-direction:column;gap:2px;padding:5px 8px;background:#f0e9d6;border:1px solid #d6cbb0;border-radius:3px;";
const REQUIRED = "display:flex;align-items:center;gap:6px;padding:5px 8px;background:#ffffff;border:1px solid #d6cbb0;border-radius:3px;";
const MUTED = "color:#6b6455;";
const field = (caption, control) => `<label style="${FIELD}"><span style="${CAPTION}">${caption}</span>${control}</label>`;

const rankIdx = (rank) => Math.max(0, RANK_TABLE.indexOf(rank));
const stepDown = (rank, steps) => RANK_TABLE[Math.max(0, rankIdx(rank) - steps)];
const lossOf = (sys, key) => Math.abs(Number(sys?.[key]) || 0);
const featColor = (rank, total) => String(rollUniversalTable(rank, total)).toLowerCase();

function colorBg(c) {
  return { white: "#ffffff", green: "#00a94e", yellow: "#fef102", red: "#ee1e25" }[c] ?? "#ddd";
}
function colorFg(c) {
  return (c === "white" || c === "yellow") ? "#333" : "#fff";
}

export function colorPill(color) {
  const c = String(color || "").toLowerCase();
  const [bg, fg, border] = {
    green: ["#00a94e", "#fff", "#007a38"],
    yellow: ["#fef102", "#222", "#b79200"],
    red: ["#ee1e25", "#fff", "#9b1118"],
    white: ["#ffffff", "#222", "#666"]
  }[c] ?? ["#f8f8f8", "#333", "#666"];
  return `<span style="display:inline-block;vertical-align:middle;margin-left:4px;padding:1px 8px;border-radius:8px;border:1px solid ${border};background:${bg};color:${fg};font-family:'Oswald',sans-serif;font-size:.92em;font-weight:700;letter-spacing:.03em;line-height:1.2;text-transform:uppercase;">${c || "any color"}</span>`;
}

function rollBox(total) {
  return `<span title="d100 = ${total}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${total}</span>`;
}

function resultBanner(color, text = `${color.toUpperCase()} RESULT`) {
  return `<div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background-color:${colorBg(color)};color:${colorFg(color)};">${text}</div>`;
}

function outcomeLine(text, good) {
  return `<div style="padding:5px 10px;font-size:1.1em;text-align:center;font-weight:bold;color:${good ? "#00a94e" : "#ee1e25"};">${text}</div>`;
}

function noteBox(html, tone = "") {
  const bg = tone === "good" ? "#e8f5e9" : tone === "bad" ? "#ffebee" : "#fff";
  return html ? `<div style="padding:5px 10px;font-size:.9em;background:${bg};border-top:1px solid #c0c0c0;">${html}</div>` : "";
}

async function postCard(driver, title, lines, body, rolls = []) {
  const msg = {
    speaker: ChatMessage.getSpeaker({ actor: driver }),
    content: `
      <div style="background-color:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
          <strong>${driver.name} - ${title}</strong>
        </div>
        <div style="padding:5px 10px;font-size:.9em;">${lines.filter(Boolean).map(l => `<div>${l}</div>`).join("")}</div>
        ${body}
      </div>`
  };
  if (rolls.length) {
    msg.rolls = rolls;
    try { ChatMessage.applyMode(msg, game.settings.get("core", "messageMode")); }
    catch { try { ChatMessage.applyRollMode(msg, game.settings.get("core", "rollMode")); } catch {} }
  }
  return ChatMessage.create(msg);
}

function isVehicleActor(vehicle) {
  return vehicle?.documentName === "Actor";
}

async function writeVehicle(vehicle, updates) {
  if (!Object.keys(updates).length) return;
  if (vehicle.isOwner !== false) return vehicle.update(updates);
  const actorVehicle = isVehicleActor(vehicle);
  return game.msh.runAsGM(actorVehicle
    ? { operation: "update", targetActorUuid: vehicle.uuid, args: [updates] }
    : { operation: "updateEmbeddedDocuments", targetActorUuid: vehicle.parent.uuid, args: ["Item", [{ _id: vehicle.id, ...updates }]] });
}

export function getOocState(vehicle) {
  const flag = vehicle.getFlag(SCOPE, "ooc") || null;
  if (!isVehicleActor(vehicle)) return flag;
  const sys = vehicle.system;
  if (!sys.outOfControl) return null;
  const speed = RANK_TABLE.includes(sys.currentSpeed)
    ? sys.currentSpeed
    : (flag?.speed ?? stepDown(sys.speed || "Typical", lossOf(sys, "speedCSLoss")));
  return { rounds: 0, fallen: 0, ...(flag ?? {}), speed };
}

async function setOocState(vehicle, state) {
  const updates = {};
  if (state) updates[`flags.${SCOPE}.ooc`] = state;
  else if (vehicle.getFlag(SCOPE, "ooc")) updates[`flags.${SCOPE}.-=ooc`] = null;
  if (isVehicleActor(vehicle)) {
    updates["system.outOfControl"] = !!state;
    if (state) updates["system.currentSpeed"] = state.speed;
  }
  return writeVehicle(vehicle, updates);
}

function resolveCrew(vehicle, driver) {
  if (!isVehicleActor(vehicle)) return { driver, passengers: [] };
  const sys = vehicle.system;
  const doc = sys.driverUuid ? fromUuidSync(sys.driverUuid) : null;
  const passengers = (Array.isArray(sys.passengerUuids) ? sys.passengerUuids : [])
    .map(u => fromUuidSync(u)).filter(Boolean)
    .map(d => d.token?.name || d.name);
  return { driver: doc ?? null, passengers };
}

function vehicleContext(vehicle, driver) {
  const crew = resolveCrew(vehicle, driver);
  const actor = crew.driver;
  if (!actor) return null;
  const sys = vehicle.system;
  const agility = Number(actor.system?.abilities?.agility?.value ?? 6);
  const driverAgiRank = valueToRank(agility);
  const controlRank = sys.control || "Typical";
  const controlCSLoss = lossOf(sys, "controlCSLoss");
  const effectiveControlRank = stepDown(controlRank, controlCSLoss);
  const baseRankIndex = Math.min(rankIdx(driverAgiRank), rankIdx(effectiveControlRank));
  const bodyRank = sys.body || "Typical";
  return {
    crew, actor, sys,
    driverName: actor.token?.name || actor.name,
    agility, driverAgiRank, controlRank, controlCSLoss, effectiveControlRank,
    baseRankIndex, baseUsedRank: RANK_TABLE[baseRankIndex],
    bodyRank,
    effectiveBodyRank: stepDown(bodyRank, lossOf(sys, "bodyCSLoss")),
    effectiveSpeedRank: stepDown(sys.speed || "Typical", lossOf(sys, "speedCSLoss")),
    vType: sys.type || "Road",
    actorVehicle: isVehicleActor(vehicle)
  };
}

/**
 * Open the Vehicle Control FEAT dialog.
 * @param {Item|Actor} vehicle  vehicle item on a character, or a vehicle actor
 * @param {Actor} [driver]      the driving character (needed for a vehicle item)
 * @param {object} [preset]     { maneuver, name, difficulty, speed } to preselect
 */
export function openVehicleControl(vehicle, driver = null, preset = {}) {
  if (!vehicle) return;
  const ctx = vehicleContext(vehicle, driver);
  if (!ctx) {
    ui.notifications.warn(`${vehicle.name} has no driver. Add one on the Crew tab first.`);
    return;
  }
  const { actor, sys, driverName, agility, driverAgiRank, controlRank, controlCSLoss, effectiveControlRank,
    baseRankIndex, baseUsedRank, bodyRank, effectiveSpeedRank, vType, actorVehicle } = ctx;
  const rankValues = RANK_VALUES;

  const maxHP = rankValues[bodyRank] ?? 6;
  if ((sys.bodyHP ?? maxHP) <= 0) {
    ui.notifications.error(`${vehicle.name} is destroyed and cannot be operated.`);
    postCard(actor, "Vehicle Control FEAT", [`Vehicle: ${vehicle.name}`],
      outcomeLine("VEHICLE DESTROYED", false) + noteBox(`${driverName} cannot operate ${vehicle.name}.`, "bad"));
    return;
  }

  const oocState = getOocState(vehicle);
  if (!oocState && vehicle.getFlag(SCOPE, "ooc")) setOocState(vehicle, null);
  const slowsWhenOoc = SLOWING_TYPES.includes(vType);
  const fallsWhenOoc = vType === "Air";
  const regainNeeded = fallsWhenOoc ? "yellow" : "green";
  const baseNeeded = oocState ? regainNeeded : "green";
  const dialogSpeed = oocState?.speed && RANK_TABLE.includes(oocState.speed)
    ? oocState.speed
    : (RANK_TABLE.includes(preset.speed) ? preset.speed
      : (actorVehicle && RANK_TABLE.includes(sys.currentSpeed) ? sys.currentSpeed : effectiveSpeedRank));
  const oocMovementNote = (speed) => fallsWhenOoc
    ? `Continues in a straight line at ${speed} and loses altitude as if falling.`
    : slowsWhenOoc
      ? `Continues forward at ${speed}; Speed drops one rank each round control is not regained.`
      : `Continues in a straight line at ${speed} without slowing.`;

  const maneuvers = oocState ? [REGAIN] : maneuversFor(vType);
  const startManeuver = maneuvers.includes(preset.maneuver) ? preset.maneuver : maneuvers[0];
  const difficulties = [["green", "Green (normal)"], ["yellow", "Yellow (hard)"], ["red", "Red (very hard)"]]
    .filter(([c]) => COLOR_ORDER[c] >= COLOR_ORDER[baseNeeded]);
  const startDifficulty = difficulties.some(([c]) => c === preset.difficulty) ? preset.difficulty : baseNeeded;
  const opt = (value, label, selected) => `<option value="${value}" ${selected ? "selected" : ""}>${label}</option>`;

  const assess = (maneuver, difficulty, speed) => {
    const speedNow = oocState ? oocState.speed : speed;
    const overBy = rankIdx(speedNow) - rankIdx(effectiveSpeedRank);
    const speeding = overBy === 1;
    const chosen = COLOR_ORDER[difficulty] >= COLOR_ORDER[baseNeeded] ? difficulty : baseNeeded;
    const needed = speeding ? HARDER[chosen] : chosen;
    const why = [
      oocState ? `${chosen[0].toUpperCase()}${chosen.slice(1)} to regain control` : `${chosen[0].toUpperCase()}${chosen.slice(1)} for the maneuver`,
      speeding ? "raised one colour for speeding" : ""
    ].filter(Boolean).join(", ");
    const hint = maneuver === STUNT ? " A trained driver needs green or yellow, a novice red." : "";
    const safe = `${effectiveSpeedRank} (${vehicleSpeedInfo(effectiveSpeedRank, vType).short} areas)`;
    const speedNote = overBy > 1
      ? `${speedNow} is more than one rank over the safe Speed, ${safe}. A vehicle may exceed it by one rank only.`
      : speeding ? `Speeding: ${speedNow} is one rank over the safe Speed, ${safe}. FEAT is one colour higher.` : "";
    return { speedNow, overBy, speeding, chosen, needed, why: why + "." + hint, speedNote };
  };
  const first = assess(startManeuver, startDifficulty, dialogSpeed);

  showFaseripButtonDialog({
    title: `${oocState ? "Regain Control" : "Vehicle Control FEAT"}: ${vehicle.name}`,
    width: 460,
    classes: ["veh-control-dialog"],
    content: `
      <div class="veh-ctl" style="display:flex;flex-direction:column;gap:8px;">
        <div style="${SUMMARY}">
          <div><strong>${vehicle.name}</strong> <span style="${MUTED}">(${vType}) · Driver</span> <strong>${driverName}</strong></div>
          <div>Rolls on <strong>${baseUsedRank} (${rankValues[baseUsedRank]})</strong> <span style="${MUTED}">— lesser of Agility ${driverAgiRank} and Control ${effectiveControlRank}${controlCSLoss > 0 ? ` (${controlRank}, ${controlCSLoss} CS lost)` : ""}</span></div>
          ${oocState ? `<div style="font-weight:bold;color:#b71c1c;">OUT OF CONTROL at ${oocState.speed}. Karma may not be spent.</div>` : ""}
        </div>
        <div style="display:grid;grid-template-columns:1.7fr 1fr;gap:8px;">
          ${field("Maneuver", `<select id="maneuver" style="${CONTROL}" ${oocState ? "disabled" : ""}>${maneuvers.map(m => opt(m, m, m === startManeuver)).join("")}</select>`)}
          ${field("Difficulty", `<select id="difficulty" style="${CONTROL}">${difficulties.map(([c, l]) => opt(c, l, c === startDifficulty)).join("")}</select>`)}
        </div>
        <div id="maneuver-name-row" style="display:${[STUNT, OTHER].includes(startManeuver) ? "block" : "none"};">
          <input id="maneuver-name" type="text" value="${String(preset.name ?? "").replace(/"/g, "&quot;")}" placeholder="Name it, e.g. Bootleg Turn" aria-label="Maneuver name" style="${CONTROL}">
        </div>
        <div style="display:grid;grid-template-columns:1.7fr 1fr 1fr;gap:8px;">
          ${field("Current Speed", `<select id="current-speed" style="${CONTROL}" ${oocState ? "disabled" : ""}>${SELECTABLE.map(r => opt(r, speedLabel(r, vType), r === dialogSpeed)).join("")}</select>`)}
          ${field("Column Shift", `<input id="cs" type="number" value="0" style="${CONTROL}">`)}
          ${field("Karma", `<input id="karma" type="number" value="0" min="0" style="${CONTROL}" ${oocState ? "disabled" : ""}>`)}
        </div>
        <div id="speed-note" style="font-size:12px;color:#a01414;display:${first.speedNote ? "block" : "none"};">${first.speedNote}</div>
        <div style="${REQUIRED}">
          <strong>Required:</strong> <span id="required-pill">${colorPill(first.needed)}</span>
          <span id="required-why" style="font-size:12px;${MUTED}">${first.why}</span>
        </div>
      </div>
    `,
    render: ($html) => {
      const update = () => {
        const maneuver = $html.find("#maneuver").val();
        const a = assess(maneuver, $html.find("#difficulty").val(), $html.find("#current-speed").val());
        $html.find("#maneuver-name-row").css("display", [STUNT, OTHER].includes(maneuver) ? "block" : "none");
        $html.find("#required-pill").html(colorPill(a.needed));
        $html.find("#required-why").text(a.why);
        $html.find("#speed-note").text(a.speedNote).css("display", a.speedNote ? "block" : "none");
      };
      $html.find("#maneuver, #difficulty, #current-speed").on("change", update);
    },
    buttons: {
      roll: {
        label: oocState ? "Regain Control" : "Roll",
        callback: async html => {
          const cs = parseInt(html.find("#cs").val()) || 0;
          const currentSpeed = html.find("#current-speed").val() || dialogSpeed;
          const karma = oocState ? 0 : (parseInt(html.find("#karma").val()) || 0);
          const maneuver = oocState ? REGAIN : (html.find("#maneuver").val() || startManeuver);
          const maneuverName = String(html.find("#maneuver-name").val() || "").trim();
          const difficulty = html.find("#difficulty").val() || baseNeeded;
          const stunt = maneuver === STUNT;
          const a = assess(maneuver, difficulty, currentSpeed);
          const { speedNow, speeding, needed } = a;

          if (a.overBy > 1) {
            ui.notifications.warn(`${vehicle.name} can exceed its safe Speed (${effectiveSpeedRank}) by one rank only.`);
            openVehicleControl(vehicle, driver, { maneuver, name: maneuverName, difficulty });
            return;
          }

          const shiftedRank = RANK_TABLE[Math.min(Math.max(baseRankIndex + cs, 0), RANK_TABLE.length - 1)];
          const controlRoll = new Roll("1d100");
          await controlRoll.evaluate();

          let cappedTotal = controlRoll.total;
          if (karma > 0) {
            cappedTotal = Math.min(100, controlRoll.total + karma);
            const history = foundry.utils.deepClone(actor.system.karma?.history || []);
            history.push({
              timestamp: new Date().toISOString(),
              realDate: new Date().toLocaleDateString(),
              gameDate: "",
              amount: -karma,
              type: "Die Roll",
              description: `Spent karma on Vehicle Control for ${vehicle.name}`
            });
            await game.msh.runAsGM({ operation: "update", targetActorUuid: actor.uuid, args: [{ "system.karma.history": history }] });
          }

          const color = featColor(shiftedRank, cappedTotal);
          const success = COLOR_ORDER[color] >= COLOR_ORDER[needed];

          let resultText, note = "";
          if (!oocState) {
            if (success) {
              resultText = stunt ? "STUNT SUCCEEDED" : "CONTROL MAINTAINED";
              if (actorVehicle) await writeVehicle(vehicle, { "system.currentSpeed": currentSpeed });
            } else {
              const state = { speed: currentSpeed, rounds: 0, fallen: 0 };
              if (fallsWhenOoc) { state.rounds = 1; state.fallen = FALL_FLOORS[0]; }
              await setOocState(vehicle, state);
              resultText = stunt ? "STUNT FAILED — OUT OF CONTROL" : "OUT OF CONTROL";
              note = `${oocMovementNote(currentSpeed)}${fallsWhenOoc ? ` Falls ${FALL_FLOORS[0]} floors this round.` : ""} The driver may try to regain control next round; Karma may not be spent on that FEAT.`;
            }
          } else if (success) {
            await setOocState(vehicle, null);
            resultText = "CONTROL REGAINED";
            note = `${vehicle.name} is back under control at ${oocState.speed}.`;
          } else {
            const rounds = (Number(oocState.rounds) || 0) + 1;
            if (slowsWhenOoc) {
              const newIdx = rankIdx(oocState.speed) - 1;
              if (newIdx <= 0) {
                await setOocState(vehicle, null);
                if (actorVehicle) await writeVehicle(vehicle, { "system.currentSpeed": "" });
                resultText = "STILL OUT OF CONTROL — VEHICLE STOPS";
                note = `${vehicle.name} has slowed to a complete stop.`;
              } else {
                await setOocState(vehicle, { ...oocState, speed: RANK_TABLE[newIdx], rounds });
                resultText = "STILL OUT OF CONTROL";
                note = `Speed drops one rank: ${oocState.speed} → ${RANK_TABLE[newIdx]}. Another attempt may be made next round.`;
              }
            } else if (fallsWhenOoc) {
              const floors = FALL_FLOORS[Math.min(rounds - 1, FALL_FLOORS.length - 1)];
              const fallen = (Number(oocState.fallen) || 0) + floors;
              await setOocState(vehicle, { ...oocState, rounds, fallen });
              resultText = "STILL OUT OF CONTROL";
              note = `Holds ${oocState.speed} in a straight line and falls ${floors} more floors this round (${fallen} floors, ${fallen * 15} feet in all).`;
            } else {
              await setOocState(vehicle, { ...oocState, rounds });
              resultText = "STILL OUT OF CONTROL";
              note = `Holds ${oocState.speed} in a straight line without slowing.`;
            }
          }

          const named = [STUNT, OTHER].includes(maneuver) && maneuverName;
          const maneuverText = maneuver === OTHER ? (maneuverName || OTHER) : named ? `${maneuver}: ${maneuverName}` : maneuver;
          await postCard(actor, "Vehicle Control FEAT", [
            `Maneuver: <strong>${maneuverText}</strong>`,
            `Vehicle: ${vehicle.name} (${vType}) at ${speedNow}`,
            `Driver Agility: ${driverAgiRank} (${agility})`,
            `Control: ${controlRank}${controlCSLoss > 0 ? ` — ${controlCSLoss} CS lost → ${effectiveControlRank}` : ""}`,
            `Used Rank: ${baseUsedRank} <span style="color:#777;">(lesser of Agility and Control)</span>`,
            cs !== 0 ? `Column Shift: ${cs > 0 ? "+" : ""}${cs} → ${shiftedRank}` : "",
            a.chosen !== baseNeeded ? `Difficulty: ${a.chosen} FEAT` : "",
            speeding ? `Speeding: ${speedNow} is one rank over the safe Speed (${effectiveSpeedRank}) — FEAT one colour higher` : "",
            `Required: ${colorPill(needed)}`,
            `Roll: ${karma ? `${rollBox(controlRoll.total)} + Karma: ${karma} = ${cappedTotal}` : rollBox(controlRoll.total)}`
          ], `${resultBanner(color)}${outcomeLine(resultText, success)}${noteBox(note, success ? "good" : "bad")}`, [controlRoll]);
        }
      },
      crash: {
        label: "Crash…",
        callback: async html => {
          openVehicleCrash(vehicle, driver, {
            speed: html.find("#current-speed").val() || dialogSpeed,
            back: {
              maneuver: html.find("#maneuver").val(),
              name: String(html.find("#maneuver-name").val() || ""),
              difficulty: html.find("#difficulty").val(),
              speed: html.find("#current-speed").val()
            }
          });
        }
      },
      cancel: { label: "Cancel" }
    }
  });
}

/**
 * Open the crash step: the vehicle has hit something.
 * @param {Item|Actor} vehicle
 * @param {Actor} [driver]
 * @param {object} [options]  { speed: rank at impact, material: preselected rank, back: preset for the Control dialog }
 */
export function openVehicleCrash(vehicle, driver = null, options = {}) {
  if (!vehicle) return;
  const ctx = vehicleContext(vehicle, driver);
  if (!ctx) {
    ui.notifications.warn(`${vehicle.name} has no driver. Add one on the Crew tab first.`);
    return;
  }
  const { crew, actor, sys, driverName, effectiveBodyRank, effectiveSpeedRank, vType, actorVehicle } = ctx;
  const rankValues = RANK_VALUES;
  const oocState = getOocState(vehicle);
  const nextLoss = (key) => -(lossOf(vehicle.system, key) + 1);
  const speedRank = RANK_TABLE.includes(options.speed) ? options.speed
    : (oocState?.speed ?? (actorVehicle && RANK_TABLE.includes(sys.currentSpeed) ? sys.currentSpeed : effectiveSpeedRank));
  const strengthRank = rankValues[speedRank] <= rankValues[effectiveBodyRank] ? speedRank : effectiveBodyRank;
  const startMaterial = SELECTABLE.includes(options.material) ? options.material : "Excellent";
  const materials = SELECTABLE.filter(r => r !== "Shift-0");
  const whyFor = (needed) => needed === "green" ? "to break through: the material is below crash strength"
    : needed === "yellow" ? "to break through: the material equals crash strength"
      : "to break through: the material is above crash strength";
  const opt = (value, label, selected) => `<option value="${value}" ${selected ? "selected" : ""}>${label}</option>`;
  const firstNeeded = crashNeededFor(startMaterial, strengthRank);

  showFaseripButtonDialog({
    title: `Vehicle Crash: ${vehicle.name}`,
    width: 460,
    classes: ["veh-control-dialog"],
    content: `
      <div class="veh-ctl" style="display:flex;flex-direction:column;gap:8px;">
        <div style="${SUMMARY}">
          <div><strong>${vehicle.name}</strong> <span style="${MUTED}">(${vType}) at</span> <strong>${speedLabel(speedRank, vType)}</strong></div>
          <div>Crash strength <strong>${strengthRank}</strong> <span style="${MUTED}">— lesser of Speed ${speedRank} and Body ${effectiveBodyRank}</span></div>
        </div>
        <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:8px;">
          ${field("Crash Object", `<select id="crash-object" style="${CONTROL}">${materials.map(r => opt(r, materialLabel(r), r === startMaterial)).join("")}</select>`)}
          ${field("Occupants", `<select id="buckled" style="${CONTROL}"><option value="yes">Strapped in (Blunt)</option><option value="no">Not strapped in (Edged)</option></select>`)}
        </div>
        ${actorVehicle
          ? `<div style="font-size:12px;${MUTED}">Crew: ${[driverName, ...crew.passengers].join(", ")}</div>`
          : `<label style="display:flex;align-items:center;gap:6px;font-size:12px;${MUTED}">Passengers besides ${driverName}
              <input id="passenger-count" type="number" value="0" min="0" max="20" style="width:52px;box-sizing:border-box;height:24px;"></label>`}
        <div style="${REQUIRED}">
          <strong>Required:</strong> <span id="required-pill">${colorPill(firstNeeded)}</span>
          <span id="required-why" style="font-size:12px;${MUTED}">${whyFor(firstNeeded)}</span>
        </div>
      </div>
    `,
    render: ($html) => {
      $html.find("#crash-object").on("change", () => {
        const needed = crashNeededFor($html.find("#crash-object").val(), strengthRank);
        $html.find("#required-pill").html(colorPill(needed));
        $html.find("#required-why").text(whyFor(needed));
      });
    },
    buttons: {
      crash: {
        label: "Resolve Crash",
        callback: async html => {
          const crashObjRank = html.find("#crash-object").val() || startMaterial;
          const strapped = html.find("#buckled").val() !== "no";
          const passengerNames = actorVehicle
            ? crew.passengers
            : Array.from({ length: Math.max(0, Math.min(20, parseInt(html.find("#passenger-count").val()) || 0)) }, (_, i) => `Passenger ${i + 1}`);
          const rolls = [];
          const d100 = async () => { const r = new Roll("1d100"); await r.evaluate(); rolls.push(r); return r.total; };

          const crashNeeded = crashNeededFor(crashObjRank, strengthRank);
          const crashTotal = await d100();
          const crashColor = featColor(strengthRank, crashTotal);
          const brokeThrough = COLOR_ORDER[crashColor] >= COLOR_ORDER[crashNeeded];

          const head = [
            `Vehicle: ${vehicle.name} (${vType}) at ${speedRank}`,
            `Obstacle: ${crashObjRank} material`,
            `Crash Strength: ${strengthRank} <span style="color:#777;">(lesser of Speed and Body)</span>`,
            `Required: ${colorPill(crashNeeded)}`,
            `Roll: ${rollBox(crashTotal)}`
          ];

          if (brokeThrough) {
            const newIdx = rankIdx(speedRank) - rankIdx(crashObjRank);
            const stopped = newIdx <= 0;
            const newSpeed = stopped ? "" : RANK_TABLE[newIdx];
            if (oocState) await setOocState(vehicle, stopped ? null : { ...oocState, speed: newSpeed });
            if (actorVehicle && !(oocState && !stopped)) await writeVehicle(vehicle, { "system.currentSpeed": newSpeed });
            await postCard(actor, "Vehicle Crash", head,
              `${resultBanner(crashColor)}${outcomeLine("BREAKS THROUGH", true)}${noteBox(
                `Speed reduced by the rank of the material (${rankIdx(crashObjRank)}): ${speedRank} → ${stopped ? "0 (stopped)" : newSpeed}.${oocState && !stopped ? " The vehicle is still out of control." : ""}`,
                "good")}`, rolls);
            return;
          }

          if (oocState) await setOocState(vehicle, null);
          if (actorVehicle) await writeVehicle(vehicle, { "system.currentSpeed": "" });

          const baseDamageRank = rankValues[crashObjRank] >= rankValues[speedRank] ? crashObjRank : speedRank;
          const baseDamage = rankValues[baseDamageRank];
          const noProtection = rankIdx(effectiveBodyRank) <= 0;
          const protectionRank = sys.protection || "Typical";
          const protection = noProtection ? 0 : (Number(rankValues[protectionRank]) || 0);
          const occupantDamage = Math.max(0, baseDamage - protection);

          const effectFor = (color) => strapped
            ? { white: "No damage", green: "Hit", yellow: "Slam", red: "Stun" }[color]
            : { white: "No damage", green: "Hit", yellow: "Stun", red: "Kill" }[color];
          const occupantLines = [];
          for (const name of [driverName, ...passengerNames]) {
            const total = await d100();
            const c = featColor(baseDamageRank, total);
            occupantLines.push(`<div style="margin-top:2px;">${name}: ${rollBox(total)} ${colorPill(c)} <strong>${effectFor(c)}</strong>${c === "white" ? "" : ` — ${occupantDamage} damage before own armor`}</div>`);
          }

          const bodyValue = rankValues[effectiveBodyRank];
          const damageLevel = baseDamage > bodyValue ? "greater" : baseDamage === bodyValue ? "equal" : "less";
          const bodyTotal = await d100();
          const damageColor = featColor(effectiveBodyRank, bodyTotal);
          const table = {
            greater: { red: ["Body -1CS", ["bodyCSLoss"]], yellow: ["Speed -1CS, Control FEAT", ["speedCSLoss"]], green: ["Control -1CS, Control FEAT", ["controlCSLoss"]], white: ["All -1CS, Out of Control", ["bodyCSLoss", "speedCSLoss", "controlCSLoss"]] },
            equal:   { red: ["No damage to vehicle", []], yellow: ["Body -1CS", ["bodyCSLoss"]], green: ["Speed -1CS, Control FEAT", ["speedCSLoss"]], white: ["Control -1CS, Control FEAT", ["controlCSLoss"]] },
            less:    { red: ["No damage", []], yellow: ["No damage", []], green: ["Body -1CS, Control FEAT", ["bodyCSLoss"]], white: ["Control -1CS, Control FEAT", ["controlCSLoss"]] }
          };
          const [outcome, lossKeys] = table[damageLevel][damageColor];
          const updates = {};
          for (const key of lossKeys) updates[`system.${key}`] = nextLoss(key);
          await writeVehicle(vehicle, updates);

          await postCard(actor, "Vehicle Crash", head, `
            ${resultBanner(crashColor)}${outcomeLine("STOPPED BY OBSTACLE", false)}
            <div style="padding:5px 10px;font-size:.9em;border-top:1px solid #c0c0c0;">
              <div>Base Damage: ${baseDamageRank} (${baseDamage}) <span style="color:#777;">(higher of material and Speed)</span></div>
              <div>Protection: ${noProtection ? "none (Body at 0)" : `${protectionRank} (${protection})`} — each occupant faces ${occupantDamage}</div>
              <div style="margin-top:6px;font-weight:bold;">Occupants — ${strapped ? "strapped in, Blunt Attack" : "not strapped in, Edged Attack"}; no Karma on the roll</div>
              ${occupantLines.join("")}
            </div>
            <div style="padding:5px 10px 8px;font-size:.9em;border-top:1px solid #c0c0c0;">
              <div style="font-weight:bold;">Damage to the Vehicle</div>
              <div>Damage ${baseDamage} is ${damageLevel === "equal" ? "equal to" : `${damageLevel} than`} Body ${effectiveBodyRank} (${bodyValue})</div>
              <div>Body FEAT: ${rollBox(bodyTotal)} ${colorPill(damageColor)} <strong>${outcome}</strong></div>
            </div>`, rolls);
        }
      },
      back: {
        label: "Back",
        callback: async () => { openVehicleControl(vehicle, driver, options.back ?? { speed: speedRank }); }
      }
    }
  });
}
