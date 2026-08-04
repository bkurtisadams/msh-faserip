/**
 * Manage Active Effect instances through an Actor or Item Sheet via effect control buttons.
 * @param {MouseEvent} event      The left-click event on the effect control
 * @param {Actor|Item} owner      The owning document which manages this effect
 */
export function onManageActiveEffect(event, owner) {
  event.preventDefault();
  const a = event.currentTarget;
  const li = a.closest('li');
  const effectId = li?.dataset.effectId;
  const parentId = li?.dataset.parentId;

  // Find the effect: it may be on the actor directly or on an owned item
  let effect = null;
  if (effectId) {
    effect = owner.effects.get(effectId);
    if (!effect && parentId) {
      // Non-legacy: effect lives on an owned item
      const parentItem = owner.items?.get(parentId);
      if (parentItem) effect = parentItem.effects.get(effectId);
    }
  }

  switch (a.dataset.action) {
    case 'create': {
      const effectData = {
        name: game.i18n.format('DOCUMENT.New', {
          type: game.i18n.localize('DOCUMENT.ActiveEffect'),
        }),
        img: 'icons/svg/aura.svg',
        origin: owner.uuid,
        disabled: li.dataset.effectType === 'inactive',
      };
      if (li.dataset.effectType === 'temporary') effectData.duration = { seconds: 6 };
      return owner.createEmbeddedDocuments('ActiveEffect', [effectData]);
    }
    case 'edit':
      return effect?.sheet.render(true);
    case 'delete':
      return effect?.delete();
    case 'toggle':
      return effect?.update({ disabled: !effect.disabled });
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
