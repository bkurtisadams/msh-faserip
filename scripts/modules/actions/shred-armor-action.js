// scripts/modules/actions/shred-armor-action.js v1.1.0 - 2026-11-18
// Shred Armor choice for Claws, Rotting Touch and Corrosive Touch
// (DESIGN-material-strength.md rev 2 §5 step 6). Clicking one of these powers
// asks Attack or Shred armor. Shredding spends the round on the armor: no damage,
// Power rank FEAT vs the armor's material strength via executeShredFeat.
//   Claws / Corrosive Touch: artificial Body Armor only.
//   Rotting Touch:           natural (organic) Body Armor only.
// v1.1.0: A successful shred puts an "Armor Shredded" Active Effect on the
//         target naming the Body Armor power (flag shredsArmorItemId). While it
//         is active, damage ignores that armor and its defense AE stays off;
//         deleting or disabling the effect restores the armor.

import { showFaseripButtonDialog } from "./dialog-shim.js";
import { executeShredFeat } from "./breaking-feat.js";
import { shiftRank } from "../../rules/rules-reference.js";

const SCOPE = () => globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip";
const STATUS_ID = "armor-shredded";

export function shredKind(item) {
  const key = `${item?.name || ""} ${item?.system?.type || ""}`.toLowerCase();
  if (key.includes("rotting touch")) return "rotting";
  if (key.includes("corrosive touch")) return "corrosive";
  if (/\bclaws\b/.test(key)) return "claws";
  return null;
}

function attackerMaterial(item, kind) {
  const sys = item.system || {};
  if (kind !== "claws") return sys.rank || "Typical";
  let mat = sys.clawMaterialStrength || sys.rank || "Typical";
  if (sys.isLimited) mat = shiftRank(mat, 2);
  return mat;
}

function findArmorAe(targetActor, wantNature) {
  const scope = SCOPE();
  return targetActor?.effects?.find(e => {
    const f = e.flags?.[scope];
    return !e.disabled && f?.effectCategory === "defense" && f?.defenseType === "bodyArmor"
      && (f.armorNature || "natural") === wantNature;
  }) || null;
}

async function applyShreddedEffect(actor, item, targetActor, armorItem) {
  const scope = SCOPE();
  const statusTaken = targetActor.effects.some(e => e.statuses?.has?.(STATUS_ID));
  const effectData = {
    name: `Armor Shredded: ${armorItem.name}`,
    img: "icons/svg/acid.svg",
    origin: item.uuid,
    statuses: statusTaken ? [] : [STATUS_ID],
    description: `${armorItem.name} was shredded by ${actor.name}'s ${item.name} and gives no protection. Delete or disable this effect to restore it.`,
    flags: {
      [scope]: {
        effectType: "armorShredded",
        shredsArmorItemId: armorItem.id,
        shreddedBy: actor.name,
        shreddingPower: item.name
      }
    }
  };
  const { executeAsGM } = await import("../../gm-utils.js");
  await executeAsGM("createActorEffect", { targetActorUuid: targetActor.uuid, effectData });
}

async function runShred(actor, item, kind) {
  const targets = [...(game.user?.targets ?? [])];
  if (targets.length !== 1 || !targets[0]?.actor) {
    ui.notifications.warn("Shred armor: target exactly one token.");
    return;
  }
  const targetActor = targets[0].actor;
  const wantNature = kind === "rotting" ? "natural" : "artificial";
  const ae = findArmorAe(targetActor, wantNature);
  if (!ae) {
    ui.notifications.warn(`${targetActor.name} has no active ${wantNature} Body Armor for ${item.name} to shred.`);
    return;
  }
  const f = ae.flags[SCOPE()];
  const result = await executeShredFeat({
    attackerMatRank: attackerMaterial(item, kind),
    powerRank: item.system?.rank || "Typical",
    targetMatRank: f.materialStrength || "Typical",
    attackerName: actor.name,
    powerName: item.name,
    actor,
    targetActor,
    targetBaAeId: null,
    postChat: true
  });
  const armorItem = f.powerItemId ? targetActor.items.get(f.powerItemId) : null;
  if (result?.shredded && armorItem) await applyShreddedEffect(actor, item, targetActor, armorItem);
  return result;
}

export async function showAttackOrShredChoice(actor, item, onAttack) {
  const kind = shredKind(item);
  const nature = kind === "rotting" ? "natural (organic)" : "artificial";
  return showFaseripButtonDialog({
    title: `${item.name}: ${actor.name}`,
    content: `<p>Attack the target, or spend the round on its ${nature} Body Armor?</p>
      <p style="font-size:0.85em;color:#555;">Shred: Power rank FEAT vs the armor's material strength. No damage; on success the target gets an Armor Shredded effect, and the armor gives no protection until that effect is removed.</p>`,
    buttons: {
      attack: { label: "Attack", callback: () => onAttack() },
      shred:  { label: "Shred armor", callback: () => runShred(actor, item, kind) }
    },
    default: "attack"
  });
}
