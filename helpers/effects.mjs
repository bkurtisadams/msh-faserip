/**
 * Manage Active Effect instances through an Actor or Item Sheet via effect control buttons.
 * @param {MouseEvent} event      The left-click event on the effect control
 * @param {Actor|Item} owner      The owning document which manages this effect
 */
export function onManageActiveEffect(event, owner) {
  event.preventDefault();
  const a = event.currentTarget;
  const li = a.closest('li');
  const effect = li.dataset.effectId
    ? owner.effects.get(li.dataset.effectId)
    : null;
  switch (a.dataset.action) {
    case 'create':
      return owner.createEmbeddedDocuments('ActiveEffect', [
        {
          name: game.i18n.format('DOCUMENT.New', {
            type: game.i18n.localize('DOCUMENT.ActiveEffect'),
          }),
          icon: 'icons/svg/aura.svg',
          origin: owner.uuid,
          'duration.rounds':
            li.dataset.effectType === 'temporary' ? 1 : undefined,
          disabled: li.dataset.effectType === 'inactive',
        },
      ]);
    case 'edit':
      return effect.sheet.render(true);
    case 'delete':
      return effect.delete();
    case 'toggle':
      return effect.update({ disabled: !effect.disabled });
  }
}

/**
 * Prepare the data structure for Active Effects which are currently embedded in an Actor or Item.
 * @param {ActiveEffect[]} effects    A collection or generator of Active Effect documents to prepare sheet data for
 * @return {object}                   Data for rendering
 */
// Optional: recognize a "suppressed" category (not disabled, but hidden/paused)
export function prepareActiveEffectCategories(effects) {
  const categories = {
    temporary: { type: "temporary", label: "Temporary", effects: [] },
    passive:   { type: "passive",   label: "Passive",   effects: [] },
    inactive:  { type: "inactive",  label: "Inactive",  effects: [] },
    suppressed:{ type: "suppressed",label: "Suppressed",effects: [] } // NEW
  };

  for (let e of effects) {
    const suppressed = e.getFlag(globalThis.MSH_FLAG_SCOPE || "msh-faserip", "suppressed");
    if (suppressed) categories.suppressed.effects.push(e);
    else if (e.disabled) categories.inactive.effects.push(e);
    else if (e.isTemporary) categories.temporary.effects.push(e);
    else categories.passive.effects.push(e);
  }
  return categories;
}

// Factory used by damage/0-HP code to mark an actor as "Dying"
export function buildDyingEffect(actor, { rounds = undefined } = {}) {
  return {
    name: "Dying",
    icon: "icons/svg/skull.svg",
    origin: actor.uuid,
    "duration.rounds": rounds,
    changes: [],
    flags: {
      [globalThis.MSH_FLAG_SCOPE || "msh-faserip"]: {
        dying: true,
        stabilizedRounds: 0,
        reFeatOnSlip: false
      }
    }
  };
}

