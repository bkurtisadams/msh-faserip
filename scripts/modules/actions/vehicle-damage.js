// scripts/modules/actions/vehicle-damage.js v1.2.0 - 2026-07-31
// v1.2.0: Import canonical valueToRank from rules-reference (printed Rank
//         Range semantics) instead of local standard-value-floor copy.
// v1.1.0: Store CS losses as negative (matching rules "-1CS"), abs for rank math
// v1.0.0: Vehicle damage routing for applyDamageToTargets
// Implements: Protection as passenger armor, Body as vehicle HP,
// Vehicle Damage Table (p.50-51) for CS degradation

import { valueToRank } from "../../rules/rules-reference.js";

const RANK_VALUES = {
  "Shift-0": 0, "Feeble": 2, "Poor": 4, "Typical": 6, "Good": 10,
  "Excellent": 20, "Remarkable": 30, "Incredible": 40, "Amazing": 50,
  "Monstrous": 75, "Unearthly": 100, "Shift-X": 150, "Shift-Y": 200,
  "Shift-Z": 500, "Class 1000": 1000, "Class 3000": 3000, "Class 5000": 5000,
  "Beyond": 9999, "Shift X": 150, "Shift Y": 200, "Shift Z": 500,
  "Class1000": 1000, "Class3000": 3000, "Class5000": 5000
};

const RANK_ORDER = [
  "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
  "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
  "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
];

function rankValue(name) {
  if (!name) return 0;
  return RANK_VALUES[name] ?? CONFIG?.FASERIP?.rankValues?.[name] ?? 0;
}

function shiftRank(name, steps) {
  const idx = RANK_ORDER.indexOf(name);
  if (idx < 0) return name;
  const newIdx = Math.max(0, Math.min(RANK_ORDER.length - 1, idx + steps));
  return RANK_ORDER[newIdx];
}

// Universal Table color from d100 roll vs rank
function universalColor(roll, rankName) {
  const table = CONFIG?.FASERIP?.universalTable;
  if (table) {
    const entry = table[rankName];
    if (entry) {
      if (roll >= (entry.red ?? 100)) return "red";
      if (roll >= (entry.yellow ?? 100)) return "yellow";
      if (roll >= (entry.green ?? 100)) return "green";
      return "white";
    }
  }
  // Fallback heuristic if table not loaded
  if (roll >= 95) return "red";
  if (roll >= 75) return "yellow";
  if (roll >= 30) return "green";
  return "white";
}

/**
 * Apply damage to a vehicle actor.
 * Returns a result object compatible with applyDamageToTargets results array.
 */
export async function applyDamageToVehicle({
  targetActor,
  token,
  damage,
  damageType = "physical-blunt",
  attackForm = "blunt",
  bypassArmor = false,
  showNotification = true
} = {}) {
  const sys = targetActor.system;
  const targetName = token?.name ?? targetActor.name;

  const bodyRank = sys.body || "Typical";
  const bodyVal = rankValue(bodyRank);
  const protRank = sys.protection || "Shift-0";
  const protVal = rankValue(protRank);

  const bodyHP = Number(sys.bodyHP ?? sys.resources?.body?.value ?? bodyVal);
  const bodyHPMax = Number(sys.bodyHPMax ?? sys.resources?.body?.max ?? bodyVal);

  // Protection reduces incoming damage (like body armor for the vehicle itself)
  // Per rules: "Body is the protection of the vehicle itself. Damage inflicted
  // on the vehicle must pass through the Body to inflict damage."
  // But Protection is passenger armor, not vehicle armor.
  // For attacks ON the vehicle: Body is the armor. Damage that exceeds Body
  // causes system degradation. We track HP as Body rank value.
  // For attacks on passengers: Protection is their armor (handled separately).

  // Net damage after Body armor (vehicle's own "armor" = Body rank value)
  // NOTE: Always apply Body armor for vehicles. Callers may pass bypassArmor:true
  // because they pre-calculated character armor (which is 0 for vehicles).
  // Vehicle Body armor is the correct mitigation here regardless.
  let netDamage = Math.max(0, Number(damage) - bodyVal);

  // Reduce bodyHP
  const hpBefore = bodyHP;
  const hpAfter = Math.max(0, hpBefore - netDamage);

  const updates = {
    "system.bodyHP": hpAfter,
    "system.resources.body.value": hpAfter
  };

  // --- Vehicle Damage Table (p.50-51) ---
  // Compare raw damage to Body rank value, roll FEAT vs Body
  const rawDmg = Number(damage) || 0;
  let damageCategory;
  if (rawDmg > bodyVal) damageCategory = "greater";
  else if (rawDmg === bodyVal) damageCategory = "equal";
  else damageCategory = "less";

  // Roll d100 FEAT vs Body
  const featRoll = await new Roll("1d100").evaluate();
  const featColor = universalColor(featRoll.total, bodyRank);

  // Determine vehicle damage effects from the table
  const tableResult = getVehicleDamageResult(damageCategory, featColor);

  // Apply CS losses (stored as negative per rules "-1CS", abs for rank math)
  let bodyCSLoss = Number(sys.bodyCSLoss) || 0;
  let speedCSLoss = Number(sys.speedCSLoss) || 0;
  let controlCSLoss = Number(sys.controlCSLoss) || 0;

  if (tableResult.bodyCS) {
    bodyCSLoss = -(Math.abs(bodyCSLoss) + 1);
    updates["system.bodyCSLoss"] = bodyCSLoss;
  }
  if (tableResult.speedCS) {
    speedCSLoss = -(Math.abs(speedCSLoss) + 1);
    updates["system.speedCSLoss"] = speedCSLoss;
  }
  if (tableResult.controlCS) {
    controlCSLoss = -(Math.abs(controlCSLoss) + 1);
    updates["system.controlCSLoss"] = controlCSLoss;
  }
  if (tableResult.allCS) {
    bodyCSLoss = -(Math.abs(bodyCSLoss) + 1);
    speedCSLoss = -(Math.abs(speedCSLoss) + 1);
    controlCSLoss = -(Math.abs(controlCSLoss) + 1);
    updates["system.bodyCSLoss"] = bodyCSLoss;
    updates["system.speedCSLoss"] = speedCSLoss;
    updates["system.controlCSLoss"] = controlCSLoss;
  }

  // Effective ranks after CS losses
  const effBody = shiftRank(bodyRank, -Math.abs(bodyCSLoss));
  const effSpeed = shiftRank(sys.speed || "Typical", -Math.abs(speedCSLoss));
  const effControl = shiftRank(sys.control || "Typical", -Math.abs(controlCSLoss));

  // Apply updates
  const canDirect = game.user.isGM || targetActor?.isOwner;
  if (canDirect) {
    await targetActor.update(updates);
  } else if (game.msh?.runAsGM) {
    await game.msh.runAsGM({
      operation: "update",
      targetActorUuid: targetActor.uuid,
      args: [updates]
    });
  } else if (game.msh?.socket?.executeAsGM) {
    await game.msh.socket.executeAsGM("runGMCommand", {
      operation: "update",
      targetActorUuid: targetActor.uuid,
      args: [updates]
    });
  }

  // Build chat card
  const chatLines = [];
  chatLines.push(`<div style="background:#f5f0e8;border:1px solid #c0a070;border-radius:3px;padding:8px;margin:4px 0;">`);
  chatLines.push(`<div style="font-weight:bold;color:#8b0000;font-size:1.1em;margin-bottom:4px;">${targetName} — Vehicle Damage</div>`);
  chatLines.push(`<div style="font-size:0.9em;">`);
  chatLines.push(`<b>Incoming:</b> ${rawDmg} &nbsp; <b>Body Armor:</b> ${bodyVal} (${bodyRank})`);
  chatLines.push(`<br><b>Net Damage:</b> ${netDamage} &nbsp; <b>Body HP:</b> ${hpBefore} → ${hpAfter} / ${bodyHPMax}`);
  chatLines.push(`<hr style="border:none;border-top:1px solid #c0a070;margin:4px 0;">`);
  chatLines.push(`<b>Damage vs Body:</b> ${damageCategory.charAt(0).toUpperCase() + damageCategory.slice(1)}`);
  chatLines.push(`<br><b>FEAT Roll:</b> ${featRoll.total} vs ${bodyRank} → <span style="color:${featColorCSS(featColor)};font-weight:bold;">${featColor.toUpperCase()}</span>`);

  // Table result effects
  const effects = [];
  if (tableResult.noEffect) effects.push("No damage to vehicle");
  if (tableResult.bodyCS) effects.push("Body -1CS");
  if (tableResult.speedCS) effects.push("Speed -1CS");
  if (tableResult.controlCS) effects.push("Control -1CS");
  if (tableResult.allCS) effects.push("ALL stats -1CS");
  if (tableResult.controlFEAT) effects.push("Control FEAT required");
  if (tableResult.outOfControl) effects.push('<span style="color:#c62828;font-weight:bold;">OUT OF CONTROL</span>');
  if (tableResult.passengerDamage) effects.push("Passengers take damage");

  chatLines.push(`<br><b>Result:</b> ${effects.join(", ") || "No additional effects"}`);

  // Current effective stats
  chatLines.push(`<hr style="border:none;border-top:1px solid #c0a070;margin:4px 0;">`);
  chatLines.push(`<b>Effective Stats:</b> Body: ${effBody} | Speed: ${effSpeed} | Control: ${effControl}`);

  // Critical conditions
  if (rankValue(effControl) < 2) {
    chatLines.push(`<br><span style="color:#c62828;font-weight:bold;">Control below Feeble — Vehicle is OUT OF CONTROL!</span>`);
  }
  if (rankValue(effSpeed) < 2) {
    chatLines.push(`<br><span style="color:#c62828;font-weight:bold;">Speed below Feeble — Vehicle has STOPPED!</span>`);
  }
  if (hpAfter <= 0) {
    chatLines.push(`<br><span style="color:#c62828;font-weight:bold;">Body HP at 0 — No protection for passengers!</span>`);
    const vType = (sys.type || "").toLowerCase();
    if (vType === "water" || vType === "submersible" || vType === "sub") {
      chatLines.push(`<br><span style="color:#c62828;">Water/Sub vehicle will begin to SINK!</span>`);
    }
    if (vType === "air") {
      chatLines.push(`<br><span style="color:#c62828;">Air vehicle — any action requires a Control FEAT!</span>`);
    }
  }

  chatLines.push(`</div></div>`);

  await ChatMessage.create({
    content: chatLines.join("\n"),
    speaker: ChatMessage.getSpeaker({ actor: targetActor })
  });

  if (showNotification) {
    ui.notifications?.info?.(`${targetName}: ${netDamage} damage to vehicle. Body HP: ${hpBefore} → ${hpAfter}`);
  }

  return {
    actorUuid: targetActor?.uuid,
    tokenUuid: token?.uuid,
    name: targetName,
    hpBefore,
    hpAfter,
    absorbed: rawDmg - netDamage,
    net: netDamage,
    wasKillResult: false,
    isVehicle: true,
    tableResult,
    featRoll: featRoll.total,
    featColor
  };
}

/**
 * Vehicle Damage Table (FASERIP p.50-51)
 * Returns which effects apply based on damage category and FEAT color.
 */
function getVehicleDamageResult(category, color) {
  // Damage Greater than Body
  if (category === "greater") {
    switch (color) {
      case "red":    return { bodyCS: true, passengerDamage: true };
      case "yellow": return { speedCS: true, controlFEAT: true };
      case "green":  return { controlCS: true, controlFEAT: true };
      case "white":  return { allCS: true, outOfControl: true };
    }
  }
  // Damage Equal to Body
  if (category === "equal") {
    switch (color) {
      case "red":    return { noEffect: true };
      case "yellow": return { bodyCS: true, passengerDamage: true };
      case "green":  return { speedCS: true, controlFEAT: true };
      case "white":  return { controlCS: true, controlFEAT: true };
    }
  }
  // Damage Less than Body
  if (category === "less") {
    switch (color) {
      case "red":    return { noEffect: true };
      case "yellow": return { noEffect: true };
      case "green":  return { bodyCS: true, controlFEAT: true };
      case "white":  return { controlCS: true, passengerDamage: true, controlFEAT: true };
    }
  }
  return { noEffect: true };
}

function featColorCSS(color) {
  switch (color) {
    case "red": return "#c62828";
    case "yellow": return "#f9a825";
    case "green": return "#2e7d32";
    default: return "#666";
  }
}
