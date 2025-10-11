import { AttackAction } from "./attack-action.js";
export class EdgedAttackAction extends AttackAction {
  async execute() {
    // TODO: Port your edged logic (min(STR, MAT) but ≥ weapon base).
    return super.execute();
  }
}
