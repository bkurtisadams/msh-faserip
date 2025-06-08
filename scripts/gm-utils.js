// File: systems/msh-faserip/gm-utils.js

export async function runAsGM(data = {}) {
  if (game.user.isGM) {
    await runGMCommand(data);
  } else if (game.users.some(u => u.isGM && u.active)) {
    const dataPacket = {
      requestId: foundry.utils.randomID(16),
      type: 'runAsGM',
      ...data
    };
    console.trace('runAsGM', { data, dataPacket });
    await game.socket.emit('system.msh-faserip', dataPacket);
  } else {
    ui.notifications.error(`No GM logged in. Action failed: ${JSON.stringify(data)}`);
    return false;
  }
  return true;
}

async function runGMCommand(data) {
  const targetActor = data.targetActorUuid ? await fromUuid(data.targetActorUuid) : null;
  const attacker = data.attackerUuid ? await fromUuid(data.attackerUuid) : null;

  switch (data.operation) {
    case 'adjustTargetHealth':
      if (!targetActor) return;
      await targetActor.update({ "system.attributes.health.value": data.newHealth });
      break;

    case 'applyCombatHandlerDamage':
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
      break;

    default:
      console.warn("Unknown GM command:", data);
  }
}

// Register GM socket listener
Hooks.once("ready", () => {
  game.socket.on('system.msh-faserip', async data => {
    if (!game.user.isGM) return;
    await runGMCommand(data);
  });
});
