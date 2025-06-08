// gm-utils.js
let socket;

export async function runAsGM(data) {
  if (game.user.isGM) {
    return await runGMCommand(data);
  } else {
    return await socketlib.system.executeAsGM("runGMCommand", data);
  }
}

export function registerSocket() {
  try {
    // Check if socketlib is available via the global game object
    if (!game.modules.get("socketlib")?.active) {
      console.error("❌ SocketLib module is not active");
      return;
    }

    // Register the system with socketlib
    socketlib.registerSystem("msh-faserip");
    socketlib.system.register("runGMCommand", runGMCommand);
    
    console.log("✅ SocketLib registered for msh-faserip");
  } catch (error) {
    console.error("❌ Failed to register SocketLib:", error);
  }
}

async function runGMCommand(data) {
  const targetActor = data.targetActorUuid ? await fromUuid(data.targetActorUuid) : null;
  const attacker = data.attackerUuid ? await fromUuid(data.attackerUuid) : null;

  if (data.operation === 'adjustTargetHealth') {
    if (!targetActor) return;
    await targetActor.update({ "system.attributes.health.value": data.newHealth });

  } else if (data.operation === 'applyCombatHandlerDamage') {
    if (attacker && targetActor) {
      await game.msh.CombatHandler.processAttack({
        attacker,
        target: targetActor,
        baseDamage: data.baseDamage,
        damageType: data.damageType,
        sourceName: data.sourceName,
        canBeStun: data.canBeStun,
        canBeSlam: data.canBeSlam,
        canBeKill: data.canBeKill,
        originalRollResult: data.originalRollResult
      });
    }

  } else if (data.operation === 'deleteActiveEffects') {
    if (!targetActor || !data.effectIds?.length) return;
    await targetActor.deleteEmbeddedDocuments("ActiveEffect", data.effectIds);

  } else if (data.operation === 'update') {
    if (!targetActor || !data.args?.[0]) return;
    await targetActor.update(data.args[0]);

  } else if (data.operation === 'createEmbeddedDocuments') {
    if (!targetActor || !data.args?.[0] || !data.args?.[1]) return;
    await targetActor.createEmbeddedDocuments(data.args[0], data.args[1]);

  } else if (data.operation === 'deleteEmbeddedDocuments') {
    if (!targetActor || !data.args?.[0] || !data.args?.[1]) return;
    await targetActor.deleteEmbeddedDocuments(data.args[0], data.args[1]);

  } else {
    console.warn("Unknown GM command:", data);
  }
}