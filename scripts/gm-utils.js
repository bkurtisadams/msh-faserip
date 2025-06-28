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
  let targetActor = null;
  let attacker = null;
  
  // Handle target actor - could be Actor UUID or Token UUID
  if (data.targetActorUuid) {
    const targetDocument = await fromUuid(data.targetActorUuid);
    if (targetDocument) {
      // If it's a Token, get its actor; if it's already an Actor, use it directly
      targetActor = targetDocument.actor || targetDocument;
    }
  }
  
  // Handle attacker - could be Actor UUID or Token UUID  
  if (data.attackerUuid) {
    const attackerDocument = await fromUuid(data.attackerUuid);
    if (attackerDocument) {
      attacker = attackerDocument.actor || attackerDocument;
    }
  }

  if (data.operation === 'adjustTargetHealth') {
    if (!targetActor) {
      console.error("🏥 GM: No target actor found for UUID:", data.targetActorUuid);
      return;
    }
    console.log(`🏥 GM: Adjusting ${targetActor.name} health from ${targetActor.system.attributes.health.value} to ${data.newHealth}`);
    await targetActor.update({ "system.attributes.health.value": data.newHealth });
    console.log(`🏥 GM: Health update complete for ${targetActor.name}`);
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