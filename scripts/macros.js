// macros.js (corrected and explicit export)

export async function rollFeat(actor, abilityKey) {
  const abilityRank = actor.system.abilities[abilityKey].value;
  const roll = await new Roll("1d100").evaluate({ async: true });

  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `${actor.name} rolled ${roll.total} for ${abilityKey.toUpperCase()} (${abilityRank})`
  });
}
