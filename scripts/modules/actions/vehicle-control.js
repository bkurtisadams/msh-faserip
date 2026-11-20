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

import { RANK_VALUES, valueToRank } from "../../rules/rules-reference.js";
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

/**
 * Open the Vehicle Control FEAT dialog.
 * @param {Item|Actor} vehicle  vehicle item on a character, or a vehicle actor
 * @param {Actor} [driver]      the driving character (needed for a vehicle item)
 */
export function openVehicleControl(vehicle, driver = null) {
  if (!vehicle) return;
  const crew = resolveCrew(vehicle, driver);
  const actor = crew.driver;
  if (!actor) {
    ui.notifications.warn(`${vehicle.name} has no driver. Add one on the Crew tab first.`);
    return;
  }
  const driverName = actor.token?.name || actor.name;
  const sys = vehicle.system;
  const rankValues = RANK_VALUES;

  const agility = Number(actor.system?.abilities?.agility?.value ?? 6);
  const driverAgiRank = valueToRank(agility);
  const controlRank = sys.control || "Typical";
  const controlCSLoss = lossOf(sys, "controlCSLoss");
  const effectiveControlRank = stepDown(controlRank, controlCSLoss);
  const baseRankIndex = Math.min(rankIdx(driverAgiRank), rankIdx(effectiveControlRank));
  const baseUsedRank = RANK_TABLE[baseRankIndex];

  const bodyRank = sys.body || "Typical";
  const effectiveBodyRank = stepDown(bodyRank, lossOf(sys, "bodyCSLoss"));
  const effectiveSpeedRank = stepDown(sys.speed || "Typical", lossOf(sys, "speedCSLoss"));
  const nextLoss = (key) => -(lossOf(vehicle.system, key) + 1);

  const maxHP = rankValues[bodyRank] ?? 6;
  if ((sys.bodyHP ?? maxHP) <= 0) {
    ui.notifications.error(`${vehicle.name} is destroyed and cannot be operated.`);
    postCard(actor, "Vehicle Control FEAT", [`Vehicle: ${vehicle.name}`],
      outcomeLine("VEHICLE DESTROYED", false) + noteBox(`${driverName} cannot operate ${vehicle.name}.`, "bad"));
    return;
  }

  const oocState = getOocState(vehicle);
  if (!oocState && vehicle.getFlag(SCOPE, "ooc")) setOocState(vehicle, null);
  const vType = sys.type || "Road";
  const slowsWhenOoc = SLOWING_TYPES.includes(vType);
  const fallsWhenOoc = vType === "Air";
  const regainNeeded = fallsWhenOoc ? "yellow" : "green";
  const actorVehicle = isVehicleActor(vehicle);
  const dialogSpeed = oocState?.speed && RANK_TABLE.includes(oocState.speed)
    ? oocState.speed
    : (actorVehicle && RANK_TABLE.includes(sys.currentSpeed) ? sys.currentSpeed : effectiveSpeedRank);
  const oocMovementNote = (speed) => fallsWhenOoc
    ? `Continues in a straight line at ${speed} and loses altitude as if falling.`
    : slowsWhenOoc
      ? `Continues forward at ${speed}; Speed drops one rank each round control is not regained.`
      : `Continues in a straight line at ${speed} without slowing.`;
  const options = (selected) => SELECTABLE.map(r => `<option value="${r}" ${r === selected ? "selected" : ""}>${r}</option>`).join("");

  showFaseripButtonDialog({
    title: `${oocState ? "Regain Control" : "Vehicle Control FEAT"}: ${vehicle.name}`,
    content: `
      ${oocState ? `<div style="margin-bottom:8px;padding:6px;border:1px solid #c62828;background:#ffebee;color:#b71c1c;border-radius:3px;font-weight:bold;">
        OUT OF CONTROL at ${oocState.speed}. Needs: ${colorPill(regainNeeded)} Karma may not be spent.
      </div>` : ""}
      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Vehicle:</label>
        <strong>${vehicle.name}</strong> <span style="color:#666;font-size:.85em;">(${vType})</span>
      </div>
      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Driver:</label>
        <strong>${driverName}</strong>
      </div>
      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Used Rank:</label>
        <input type="text" value="${baseUsedRank}" style="width:120px;" readonly>
        <span style="margin-left:6px;">(${rankValues[baseUsedRank]})</span>
      </div>
      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Column Shift:</label>
        <input id="cs" type="number" value="0" style="width:60px;">
        <span style="color:#666;font-size:.9em;">(+ right, - left)</span>
      </div>
      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Current Speed:</label>
        <select id="current-speed">${options(dialogSpeed)}</select>
        <span style="color:#666;font-size:.85em;">(speed at moment of FEAT)</span>
      </div>
      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:120px;">Karma Points:</label>
        <input id="karma" type="number" value="0" min="0" style="width:60px;" ${oocState ? "disabled" : ""}>
        <span style="color:#666;font-size:.85em;">${oocState ? "(none while out of control)" : "(spend only up to 100)"}</span>
      </div>
      ${oocState ? "" : `<div style="margin-top:8px;padding:6px;border:1px solid #ddd;background:#fafafa;border-radius:3px;">
        <div style="font-weight:bold;margin-bottom:6px;">Stunt Settings</div>
        <div style="margin-bottom:6px;">
          <label><input type="checkbox" id="stunt-check"> Attempting Stunt?</label>
        </div>
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:100px;">Stunt Name:</label>
          <input id="stunt-name" type="text" placeholder="e.g., Bootleg Turn" style="width:200px;">
        </div>
      </div>`}
      <div style="margin-top:8px;padding:6px;border:1px solid #ddd;background:#fafafa;border-radius:3px;">
        <div style="font-weight:bold;margin-bottom:6px;">Crash Settings <span style="font-weight:normal;color:#666;font-size:.85em;">(used by the Crash button)</span></div>
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:120px;">Crash Object:</label>
          <select id="crash-object">${options("Excellent")}</select>
        </div>
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:120px;">Occupants:</label>
          <select id="buckled">
            <option value="yes">Strapped in (Blunt)</option>
            <option value="no">Not strapped in (Edged)</option>
          </select>
        </div>
        ${actorVehicle
          ? `<div style="margin-bottom:6px;color:#666;font-size:.85em;">Crew: ${[driverName, ...crew.passengers].join(", ")}</div>`
          : `<div style="margin-bottom:6px;">
          <label style="display:inline-block;width:120px;">Passengers:</label>
          <input id="passenger-count" type="number" value="0" min="0" max="20" style="width:60px;">
          <span style="color:#666;font-size:.85em;">(besides the driver)</span>
        </div>`}
      </div>
    `,
    buttons: {
      roll: {
        label: oocState ? "Regain Control" : "Roll",
        callback: async html => {
          const cs = parseInt(html.find("#cs").val()) || 0;
          const currentSpeed = html.find("#current-speed").val() || dialogSpeed;
          const karma = oocState ? 0 : (parseInt(html.find("#karma").val()) || 0);
          const stunt = !oocState && !!html.find("#stunt-check")[0]?.checked;
          const stuntName = oocState ? "" : (html.find("#stunt-name").val() || "");

          const speedNow = oocState ? oocState.speed : currentSpeed;
          const overBy = rankIdx(speedNow) - rankIdx(effectiveSpeedRank);
          if (overBy > 1) {
            ui.notifications.warn(`${vehicle.name} can exceed its safe Speed (${effectiveSpeedRank}) by one rank only.`);
            openVehicleControl(vehicle, driver);
            return;
          }
          const speeding = overBy === 1;

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
          const baseNeeded = oocState ? regainNeeded : "green";
          const needed = speeding ? HARDER[baseNeeded] : baseNeeded;
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

          await postCard(actor, `Vehicle Control FEAT${oocState ? " — Regain Control" : stunt ? " — Stunt" : ""}`, [
            `Vehicle: ${vehicle.name} (${vType}) at ${oocState ? oocState.speed : currentSpeed}`,
            `Driver Agility: ${driverAgiRank} (${agility})`,
            `Control: ${controlRank}${controlCSLoss > 0 ? ` — ${controlCSLoss} CS lost → ${effectiveControlRank}` : ""}`,
            `Used Rank: ${baseUsedRank} <span style="color:#777;">(lesser of Agility and Control)</span>`,
            cs !== 0 ? `Column Shift: ${cs > 0 ? "+" : ""}${cs} → ${shiftedRank}` : "",
            stunt ? `Stunt: ${stuntName || "(unnamed)"}` : "",
            speeding ? `Speeding: ${speedNow} is one rank over the safe Speed (${effectiveSpeedRank}) — FEAT one colour higher` : "",
            `Required: ${colorPill(needed)}`,
            `Roll: ${karma ? `${rollBox(controlRoll.total)} + Karma: ${karma} = ${cappedTotal}` : rollBox(controlRoll.total)}`
          ], `${resultBanner(color)}${outcomeLine(resultText, success)}${noteBox(note, success ? "good" : "bad")}`, [controlRoll]);
        }
      },
      crash: {
        label: "Crash",
        callback: async html => {
          const speedRank = html.find("#current-speed").val() || dialogSpeed;
          const crashObjRank = html.find("#crash-object").val() || "Excellent";
          const strapped = html.find("#buckled").val() !== "no";
          const passengerNames = actorVehicle
            ? crew.passengers
            : Array.from({ length: Math.max(0, Math.min(20, parseInt(html.find("#passenger-count").val()) || 0)) }, (_, i) => `Passenger ${i + 1}`);
          const rolls = [];
          const d100 = async () => { const r = new Roll("1d100"); await r.evaluate(); rolls.push(r); return r.total; };

          const strengthRank = rankValues[speedRank] <= rankValues[effectiveBodyRank] ? speedRank : effectiveBodyRank;
          const materialDiff = rankIdx(crashObjRank) - rankIdx(strengthRank);
          const crashNeeded = materialDiff < 0 ? "green" : materialDiff === 0 ? "yellow" : "red";
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
      cancel: { label: "Cancel" }
    }
  });
}
