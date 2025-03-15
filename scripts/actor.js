export class FaseripActor extends Actor {

  prepareData() {
    super.prepareData();

    const actorData = this.system;

    // Clearly ensure abilities exist
    actorData.abilities = actorData.abilities || {
      fighting: { value: 10 },
      agility: { value: 10 },
      strength: { value: 10 },
      endurance: { value: 10 },
      reason: { value: 10 },
      intuition: { value: 10 },
      psyche: { value: 10 }
    };

    // Clearly ensure attributes exist
    actorData.attributes = actorData.attributes || {
      health: { value: 0, max: 0 },
      karma: { value: 0, max: 0 },
      resources: { rank: "Typical" },
      popularity: { value: 0 }
    };

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

    // Drag-and-drop setup clearly defined
    new DragDrop({
      dragSelector: '.item-list .item',
      dropSelector: '.faserip-sheet',
      callbacks: { drop: this._onDropItem.bind(this) }
    }).bind(html[0]);

    // FEAT rolls for abilities clearly defined
    html.find('.feat-roll').click(ev => {
      const abilityKey = ev.currentTarget.dataset.ability;
      game.msh.rollFeat(this.actor, abilityKey);
    });

    // Item Macro trigger clearly defined
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

  async _onDropItem(event, data) {
    if (!this.actor.isOwner) return false;
    const item = await Item.implementation.fromDropData(data);
    if (!item) return false;
    return this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
  }
}
