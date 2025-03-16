import { HandlebarsApplicationMixin } from 'foundry.applications.api';

export class FaseripActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    ...super.DEFAULT_OPTIONS,
    classes: ["faserip-sheet", "sheet", "actor"],
    width: 600,
    height: "auto",
    // Define drag/drop config in default options
    dragDrop: [{ dragSelector: '.item', dropSelector: '.faserip-sheet' }],
    tabs: [{ navSelector: ".tabs", contentSelector: ".sheet-body", initial: "abilities" }],
    parts: {
      main: { template: "systems/msh-faserip/templates/actor-sheet.html" }
    }
  };

  // Add private property for drag/drop instances
  #dragDrop;

  constructor(options) {
    super(options);
    // Initialize drag/drop in constructor
    this.#dragDrop = this.#createDragDropHandlers();
  }

  /**
   * Create drag-and-drop workflow handlers for this Application
   * @returns {DragDrop[]}     An array of DragDrop handlers
   * @private
   */
  #createDragDropHandlers() {
    return this.options.dragDrop.map((d) => {
      d.permissions = {
        dragstart: this._canDragStart.bind(this),
        drop: this._canDragDrop.bind(this),
      };
      d.callbacks = {
        dragstart: this._onDragStart.bind(this),
        dragover: this._onDragOver.bind(this),
        drop: this._onDrop.bind(this),
      };
      return new DragDrop(d);
    });
  }

  async _prepareContext() {
    const context = await super._prepareContext();
    context.system = this.actor.system;
    context.items = this.actor.items;
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    
    // Bind the drag/drop listeners after render
    this.#dragDrop.forEach(dd => dd.bind(this.element));
    
    // Add FEAT roll event listeners
    const featRolls = this.element.querySelectorAll('.feat-roll');
    for (const button of featRolls) {
      button.addEventListener('click', (event) => {
        const abilityKey = event.currentTarget.dataset.ability;
        game.msh.rollFeat(this.actor, abilityKey);
      });
    }
    
    // Add item use event listeners
    const itemUseButtons = this.element.querySelectorAll('.item .item-use');
    for (const button of itemUseButtons) {
      button.addEventListener('click', (event) => {
        const itemId = event.currentTarget.closest(".item").dataset.itemId;
        const item = this.actor.items.get(itemId);
        this.itemMacro(item);
      });
    }
  }

  /**
   * Define whether a user is able to begin a dragstart workflow
   * @param {string} selector       The candidate HTML selector for dragging
   * @returns {boolean}             Can the current user drag this selector?
   * @protected
   */
  _canDragStart(selector) {
    return this.isEditable;
  }

  /**
   * Define whether a user is able to conclude a drag-and-drop workflow
   * @param {string} selector       The candidate HTML selector for the drop target
   * @returns {boolean}             Can the current user drop on this selector?
   * @protected
   */
  _canDragDrop(selector) {
    return this.isEditable;
  }

  /**
   * Handle the dragstart event
   * @param {DragEvent} event       The originating dragstart event
   * @protected
   */
  _onDragStart(event) {
    const itemId = event.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    
    const dragData = item.toDragData();
    event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
  }

  /**
   * Handle dragover event
   * @param {DragEvent} event     The originating dragover event
   * @protected
   */
  _onDragOver(event) {
    // You can add special handling here if needed
  }

  /**
   * Handle the drop event
   * @param {DragEvent} event       The originating drop event
   * @protected
   */
  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);
    if (!data.type || data.type !== "Item") return ui.notifications.warn("Only items can be dropped.");

    let item;

    if (data.uuid) {
      const droppedItem = await fromUuid(data.uuid);
      if (!droppedItem) {
        ui.notifications.error("Item not found by UUID.");
        return;
      }
      item = droppedItem.toObject();
    } else if (data.pack) {
      const pack = game.packs.get(data.pack);
      if (!pack) return ui.notifications.error("Compendium pack not found.");
      const document = await pack.getDocument(data.id);
      item = document.toObject();
    } else {
      item = game.items.get(data.id)?.toObject();
      if (!item) return ui.notifications.error("World item not found.");
    }

    delete item._id;
    await this.actor.createEmbeddedDocuments("Item", [item]);
  }

  /**
   * Item macro functionality
   */
  itemMacro(item) {
    if (!item) return ui.notifications.warn("Item not found!");
    if (item.type === "power") {
      item.rollItem();
    } else {
      ui.notifications.info(`Macro not defined for item type: ${item.type}`);
    }
  }
}