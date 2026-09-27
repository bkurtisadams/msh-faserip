// scripts/modules/combat/vehicle-crew-combat.js v1.0.0 - 2026-09-26
// v1.0.0: A vehicle joining combat is replaced by its driver and passengers. Crew with a token
//         on the vehicle's scene join by token; crew with none join tokenless (actor only).
//         A vehicle with no crew stays in the tracker.

const SCOPE = "msh-faserip";

function crewUuids(actor) {
  const sys = actor?.system ?? {};
  const list = [sys.driverUuid, ...(Array.isArray(sys.passengerUuids) ? sys.passengerUuids : [])];
  return [...new Set(list.filter(Boolean))];
}

function crewCombatantData(doc, scene) {
  if (!doc || doc.documentName !== "Actor" || doc.type === "vehicle") return null;
  if (doc.isToken && doc.token) {
    const td = doc.token;
    return { tokenId: td.id, sceneId: td.parent?.id, actorId: td.actorId };
  }
  const linked = scene?.tokens?.find(t => t.actorLink && t.actorId === doc.id);
  if (linked) return { tokenId: linked.id, sceneId: scene.id, actorId: doc.id };
  return { actorId: doc.id };
}

function alreadyIn(combat, data) {
  return combat.combatants.some(c => data.tokenId
    ? c.tokenId === data.tokenId
    : (!c.tokenId && c.actorId === data.actorId));
}

async function addCrew(combat, vehicle, scene) {
  const add = [];
  const names = [];
  for (const uuid of crewUuids(vehicle)) {
    const doc = fromUuidSync(uuid);
    const data = crewCombatantData(doc, scene);
    if (!data || alreadyIn(combat, data) || add.some(a => a.tokenId ? a.tokenId === data.tokenId : a.actorId === data.actorId && !a.tokenId)) continue;
    add.push(data);
    names.push((doc.token?.name || doc.name) + (data.tokenId ? "" : " (no token)"));
  }
  if (add.length) await combat.createEmbeddedDocuments("Combatant", add);
  const vName = vehicle.token?.name || vehicle.name;
  ui.notifications?.info(names.length
    ? `${vName}: ${names.join(", ")} added to combat — the driver acts for the vehicle.`
    : `${vName}: crew already in combat.`);
}

export function registerVehicleCrewCombat() {
  Hooks.on("preCreateCombatant", (combatant, data, options, userId) => {
    if (userId !== game.user.id) return;
    const vehicle = combatant.actor;
    if (vehicle?.type !== "vehicle") return;
    const combat = combatant.parent;
    const uuids = crewUuids(vehicle);
    if (!combat || !uuids.some(u => fromUuidSync(u))) {
      ui.notifications?.warn(`${vehicle.name} has no crew; added to combat as itself.`);
      return;
    }
    const scene = combatant.token?.parent ?? game.scenes.get(data.sceneId) ?? canvas.scene;
    addCrew(combat, vehicle, scene).catch(err => {
      console.error(`${SCOPE} | vehicle crew combat`, err);
      ui.notifications?.error(`Could not add ${vehicle.name}'s crew to combat — see console.`);
    });
    return false;
  });
}
