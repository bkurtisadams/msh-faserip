// This could be in a separate file like powerDialog.js
class PowerRollDialog extends Dialog {
    constructor(actor, item) {
      super({
        title: `${item.name} - Power Roll`,
        content: `<p>Roll ${item.name}?</p>`,
        buttons: {
          roll: {
            label: "Roll",
            callback: () => this._onRoll(actor, item)
          },
          cancel: {
            label: "Cancel"
          }
        },
        default: "roll"
      });
      
      this.actor = actor;
      this.item = item;
    }
    
    _onRoll(actor, item) {
      // Your existing power roll logic
      console.log("Rolling power", item.name);
      // Call whatever method you use to roll powers
    }
  }