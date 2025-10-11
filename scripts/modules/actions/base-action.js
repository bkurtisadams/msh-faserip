import { labelFor, effectsFor, rollD100, universalColor } from "./action-utils.js";

export class BaseAction {
  constructor({ actor, actionType, abilityName, opts }) {
    this.actor = actor;
    this.actionType = actionType;
    this.abilityName = abilityName;
    this.opts = opts ?? {};
    this.label = labelFor(actionType);
    this.effects = effectsFor(actionType);
  }

  // Template: subclasses override pieces, but call execute() to run the flow
  async execute() {
    const { roll, cappedTotal, karmaSpent, effectiveRank } = await this._performRoll();
    const color = universalColor(effectiveRank, cappedTotal);
    await this._toChat({ roll, cappedTotal, color, karmaSpent, effectiveRank });
    return { roll, color, effectiveRank, cappedTotal, karmaSpent };
  }

  // Default behavior can be extended/overridden
  async _performRoll() {
    const roll = await rollD100().evaluate();
    const karma = Number(this.opts.karma ?? 0);
    const cappedTotal = Math.min(100, roll.total + Math.max(0, karma));
    const karmaSpent = karma;
    const effectiveRank = this.opts.effectiveRank ?? this.opts.baseRank ?? "Typical";
    return { roll, cappedTotal, karmaSpent, effectiveRank };
  }

  async _toChat(_ctx) {
    // Subclass should implement nice message formatting
  }
}
