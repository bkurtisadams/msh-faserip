import { rollUniversalTable } from "./universalTable.js";

Hooks.once('ready', () => {
  game.msh = {
    rollFeat: (actor, abilityKey) => {
      const ability = actor.system.abilities[abilityKey];
      if (!ability) return ui.notifications.error("Ability not found!");

      const rank = ability.rank || "Typical";
      const roll = new Roll('1d100').roll({async: false}).total;
      const result = rollUniversalTable(rank, roll);

      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({actor}),
        content: `
          <strong>${abilityKey.toUpperCase()} FEAT (${rank}):</strong> ${roll} - <span style="color:blue">${result}</span>
        `
      });
    }
  };
});
