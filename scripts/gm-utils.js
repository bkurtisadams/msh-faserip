// gm-utils.js
// v13-safe socketlib wiring for "msh-faserip"

const SOCKET_NAME = "msh-faserip";
let socket = null;

/**
 * Legacy entrypoint: run arbitrary GM op via { operation, ... }.
 * If caller is GM, run locally; else dispatch over socketlib.
 */
export async function runAsGM(data) {
  if (game.user.isGM) return await runGMCommand(data);
  ensureSocket();
  return await socket.executeAsGM("runGMCommand", data);
}

/**
 * Modern convenience: run a named GM action with a payload.
 * Example: executeAsGM("adjustTargetHealth", { targetActorUuid, newHealth })
 */
export async function executeAsGM(action, payload) {
  if (game.user.isGM) {
    // Direct call when already GM
    switch (action) {
      case "adjustTargetHealth": return await adjustTargetHealth(payload);
      case "createActorEffect":  return await createActorEffect(payload);
      case "createEmbeddedDocsOnActor": return await createEmbeddedDocsOnActor(payload);
      default: throw new Error(`Unknown GM action: ${action}`);
    }
  }
  ensureSocket();
  return await socket.executeAsGM(action, payload);
}

/**
 * Register socketlib and all GM-side handlers.
 * Call once on ready().
 */
export function registerSocket() {
  try {
    const mod = game.modules.get("socketlib");
    if (!mod?.active) {
      console.error("❌ SocketLib module is not active");
      return;
    }

    // Obtain a dedicated socket for this system
    // `socketlib` is a global provided by the SocketLib module.
    socket = socketlib.registerSystem(SOCKET_NAME);

    // Register concrete GM handlers
    socket.register("runGMCommand", runGMCommand);
    socket.register("adjustTargetHealth", adjustTargetHealth);
    socket.register("createActorEffect", createActorEffect);
    socket.register("createEmbeddedDocsOnActor", createEmbeddedDocsOnActor);

    // Expose on game.msh for other modules/files
    game.msh = game.msh || {};
    game.msh.socket = socket;    // preferred modern path: game.msh.socket.executeAsGM(...)
    game.msh.runAsGM = runAsGM;  // keep legacy helper alive

    console.log("✅ SocketLib registered for", SOCKET_NAME);
  } catch (error) {
    console.error("❌ Failed to register SocketLib:", error);
  }
}

/* ---------------- GM Handlers ---------------- */

/**
 * Back-compat switch for legacy callers:
 *   runAsGM({ operation: "...", ... })
 */
async function runGMCommand(data = {}) {
  const { operation } = data || {};
  switch (operation) {
    case "adjustTargetHealth":
      return await adjustTargetHealth({
        targetActorUuid: data.targetActorUuid,
        newHealth: data.newHealth
      });

    case "applyCombatHandlerDamage":
      return await applyCombatHandlerDamage({
        attackerUuid: data.attackerUuid,
        targetActorUuid: data.targetActorUuid,
        baseDamage: data.baseDamage,
        damageType: data.damageType,
        sourceName: data.sourceName,
        canBeStun: data.canBeStun,
        canBeSlam: data.canBeSlam,
        canBeKill: data.canBeKill,
        originalRollResult: data.originalRollResult
      });

    case "deleteActiveEffects":
      return await deleteActiveEffects({
        targetActorUuid: data.targetActorUuid,
        effectIds: data.effectIds
      });

    case "update":
      return await updateActor({
        targetActorUuid: data.targetActorUuid,
        updateData: data.args?.[0]
      });

    case "createEmbeddedDocuments":
      // Legacy signature: args: [collectionName, [docs]]
      return await createEmbeddedDocsOnActor({
        targetActorUuid: data.targetActorUuid,
        collection: data.args?.[0],
        docs: data.args?.[1] || []
      });

    case "deleteEmbeddedDocuments":
      return await deleteEmbeddedDocsOnActor({
        targetActorUuid: data.targetActorUuid,
        collection: data.args?.[0],
        ids: data.args?.[1] || []
      });

    case "createActorEffect":
      return await createActorEffect({
        targetActorUuid: data.targetActorUuid,
        effectData: data.effectData
      });

    default:
      throw new Error(`Unknown GM operation: ${operation}`);
  }
}

/* ----------- Concrete implementations ----------- */

function ensureSocket() {
  if (!socket) {
    ui.notifications?.warn("Socket not initialized; cannot run GM command.");
    throw new Error("Socket not initialized");
  }
}

async function getActorFromUuid(maybeUuid) {
  if (!maybeUuid) return null;
  const doc = await fromUuid(maybeUuid);
  return doc?.actor || doc || null; // token.actor or actor
}

async function adjustTargetHealth({ targetActorUuid, newHealth }) {
  const actor = await getActorFromUuid(targetActorUuid);
  if (!actor) throw new Error(`adjustTargetHealth: actor not found: ${targetActorUuid}`);
  await actor.update({ "system.attributes.health.value": newHealth });
  return true;
}

async function createActorEffect({ targetActorUuid, effectData }) {
  const actor = await getActorFromUuid(targetActorUuid);
  if (!actor) throw new Error(`createActorEffect: actor not found: ${targetActorUuid}`);
  return await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
}

async function createEmbeddedDocsOnActor({ targetActorUuid, collection, docs }) {
  const actor = await getActorFromUuid(targetActorUuid);
  if (!actor) throw new Error(`createEmbeddedDocsOnActor: actor not found: ${targetActorUuid}`);
  if (!collection) throw new Error("createEmbeddedDocsOnActor: missing collection name");
  if (!Array.isArray(docs)) throw new Error("createEmbeddedDocsOnActor: docs must be an array");
  return await actor.createEmbeddedDocuments(collection, docs);
}

async function deleteEmbeddedDocsOnActor({ targetActorUuid, collection, ids }) {
  const actor = await getActorFromUuid(targetActorUuid);
  if (!actor) throw new Error(`deleteEmbeddedDocsOnActor: actor not found: ${targetActorUuid}`);
  if (!collection) throw new Error("deleteEmbeddedDocsOnActor: missing collection name");
  if (!Array.isArray(ids)) throw new Error("deleteEmbeddedDocsOnActor: ids must be an array");
  return await actor.deleteEmbeddedDocuments(collection, ids);
}

async function deleteActiveEffects({ targetActorUuid, effectIds }) {
  const actor = await getActorFromUuid(targetActorUuid);
  if (!actor || !Array.isArray(effectIds) || effectIds.length === 0) return false;
  await actor.deleteEmbeddedDocuments("ActiveEffect", effectIds);
  return true;
}

async function updateActor({ targetActorUuid, updateData }) {
  const actor = await getActorFromUuid(targetActorUuid);
  if (!actor || !updateData) return false;
  await actor.update(updateData);
  return true;
}

async function applyCombatHandlerDamage({
  attackerUuid, targetActorUuid, baseDamage, damageType, sourceName,
  canBeStun, canBeSlam, canBeKill, originalRollResult
}) {
  const attacker = await getActorFromUuid(attackerUuid);
  const targetActor = await getActorFromUuid(targetActorUuid);
  if (!attacker || !targetActor) return false;

  // Call your system’s combat handler directly on the GM
  await game.msh.CombatHandler.processAttack({
    attacker,
    target: targetActor,
    baseDamage,
    damageType,
    sourceName,
    canBeStun,
    canBeSlam,
    canBeKill,
    originalRollResult
  });
  return true;
}
