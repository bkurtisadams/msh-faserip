// active-effect.js v1.1.0 - 2026-11-19
// v1.1.0: Also suppressed while the power it comes from is granted by
//         equipment that is broken or no longer on the character
//         (equipment-link.mjs). gearBlock names the item and why.
// active-effect.js v1.0.0 - 2026-11-19
// FASERIP ActiveEffect document class. Overrides Foundry's isSuppressed
// ("is there some system logic that makes this active effect ineligible for
// application?") so circumstances, not the user's on/off switch, can take an
// effect out of play. `disabled` stays the user's toggle; `active` (core:
// !disabled && !isSuppressed) is what system code should test.
//   Body Armor defense AE: suppressed while an enabled Armor Shredded effect
//   on the same actor names its power (flag shredsArmorItemId).

import { powerGearState } from "./equipment-link.mjs";

const SCOPE = () => globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip";

export class FaseripActiveEffect extends ActiveEffect {
  get isSuppressed() {
    if (super.isSuppressed) return true;
    return !!this.shreddedBy || !!this.gearBlock;
  }

  /** The power this effect comes from: an effect on a power item, or a
   *  character effect naming it (flag powerItemId). */
  get sourcePower() {
    const p = this.parent;
    if (p?.documentName === "Item") return p.type === "power" ? p : null;
    const id = this.flags?.[SCOPE()]?.powerItemId;
    return id && p?.documentName === "Actor" ? p.items.get(id) || null : null;
  }

  /** { status: "broken"|"missing", name } when the power's equipment is out. */
  get gearBlock() {
    const power = this.sourcePower;
    if (!power) return null;
    const g = powerGearState(power);
    return g.status === "ok" ? null : { status: g.status, name: g.name };
  }

  get shreddedBy() {
    const scope = SCOPE();
    const f = this.flags?.[scope];
    if (f?.effectCategory !== "defense" || f?.defenseType !== "bodyArmor" || !f?.powerItemId) return null;
    const actor = this.parent;
    if (!actor || actor.documentName !== "Actor") return null;
    return actor.effects.find(e => e.id !== this.id && !e.disabled
      && e.flags?.[scope]?.shredsArmorItemId === f.powerItemId) || null;
  }
}
