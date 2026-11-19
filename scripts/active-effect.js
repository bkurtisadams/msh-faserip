// active-effect.js v1.0.0 - 2026-11-19
// FASERIP ActiveEffect document class. Overrides Foundry's isSuppressed
// ("is there some system logic that makes this active effect ineligible for
// application?") so circumstances, not the user's on/off switch, can take an
// effect out of play. `disabled` stays the user's toggle; `active` (core:
// !disabled && !isSuppressed) is what system code should test.
//   Body Armor defense AE: suppressed while an enabled Armor Shredded effect
//   on the same actor names its power (flag shredsArmorItemId).

const SCOPE = () => globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip";

export class FaseripActiveEffect extends ActiveEffect {
  get isSuppressed() {
    if (super.isSuppressed) return true;
    return !!this.shreddedBy;
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
