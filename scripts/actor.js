export class FaseripActor extends Actor {

  prepareData() {
    super.prepareData();

    const actorData = this.system;

    // Explicitly ensure abilities exist
    actorData.abilities = actorData.abilities || {};
    actorData.abilities.fighting = actorData.abilities.fighting || { value: 10 };
    actorData.abilities.agility = actorData.abilities.agility || { value: 10 };
    actorData.abilities.strength = actorData.abilities.strength || { value: 10 };
    actorData.abilities.endurance = actorData.abilities.endurance || { value: 10 };
    actorData.abilities.reason = actorData.abilities.reason || { value: 10 };
    actorData.abilities.intuition = actorData.abilities.intuition || { value: 10 };
    actorData.abilities.psyche = actorData.abilities.psyche || { value: 10 };

    // Clearly ensure attributes exist explicitly
    actorData.attributes = actorData.attributes || {};
    actorData.attributes.health = actorData.attributes.health || { value: 0, max: 0 };
    actorData.attributes.karma = actorData.attributes.karma || { value: 0, max: 0 };
    actorData.attributes.resources = actorData.attributes.resources || { rank: "Typical" };
    actorData.attributes.popularity = actorData.attributes.popularity || { value: 0 };

    // Automatically calculate Health (F + A + S + E)
    actorData.attributes.health.max = abilitiesTotal([
      abilitiesValue(actorData.abilities.fighting),
      abilitiesValue(actorData.abilities.agility),
      abilitiesValue(actorData.abilities.strength),
      abilitiesValue(actorData.abilities.endurance)
    ]);

    actorData.attributes.health.value = actorData.attributes.health.max;

    // Automatically calculate Karma (Reason + Intuition + Psyche)
    actorData.attributes.karma.max = abilitiesTotal([
      abilitiesValue(actorData.abilities.reason),
      abilitiesValue(actorData.abilities.intuition),
      abilitiesValue(actorData.abilities.psyche)
    ]);

    actorData.attributes.karma.value = actorData.attributes.karma.max;

    function abilitiesValue(attr) {
      return Number(attr?.value) || 0;
    }

    function abilitiesTotal(arr) {
      return arr.reduce((sum, num) => sum + num, 0);
    }
  }

  activateListeners(html) {
    super.activateListeners(html);

    if (!this.isEditable) return;

    // Clearly defined Drag-and-drop
    new DragDrop({
      dragSelector: '.item-list .item',
      dropSelector: '.faserip-sheet',
      callbacks: { drop: this._onDropItem.bind(this) }
    }).bind(html[0]);

    // FEAT rolls for abilities
    html.find('.feat-roll').click(ev => {
      const abilityKey = ev.currentTarget.dataset.ability;
      game.msh.rollFeat(this.actor, abilityKey);
    });

    // Item Macro trigger
    html.find('.item .item-use').click(ev => {
      const itemId = ev.currentTarget.closest(".item").dataset.itemId;
      const item = this.actor.items.get(itemId);
      this.itemMacro(item);
    });
  }

  itemMacro(item) {
    if (!item) return ui.notifications.warn("Item not found!");
    if (item.type === "power") {
      item.rollItem();
    } else {
      ui.notifications.info(`Macro not defined for item type: ${item.type}`);
    }
  }

}
