// Cross-client Health regression probe.
// Run this as a PLAYER while a GM is connected. Select an owned token first.
(async () => {
  if (game.user.isGM) {
    return ui.notifications.warn("Run this probe from a non-GM player account.");
  }

  const actor = canvas?.tokens?.controlled?.[0]?.actor ?? game.user.character;
  if (!actor) return ui.notifications.warn("Select an owned token or assign a user character first.");
  if (!actor.isOwner) return ui.notifications.error(`You do not own ${actor.name}.`);

  const scope = globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip";
  const health = Number(actor.system?.attributes?.health?.value);
  if (!Number.isFinite(health) || health <= 1) {
    return ui.notifications.warn("Use an actor with at least 2 Health.");
  }

  const beforeEffects = new Set(actor.effects.map(effect => effect.id));
  const previousDamageTime = actor.getFlag(scope, "lastDamageTime");
  const previousDamageWorldTime = actor.getFlag(scope, "lastDamageWorldTime");
  const previousDamageStamp = Number(previousDamageTime);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  try {
    await actor.update({ "system.attributes.health.value": health - 1 });

    let observed = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const stamp = Number(actor.getFlag(scope, "lastDamageTime"));
      if (Number.isFinite(stamp) && stamp !== previousDamageStamp) {
        observed = true;
        break;
      }
      await sleep(100);
    }

    if (observed) {
      console.log("[FASERIP TEST] PASS | GM processed player-originated flattened Health update", {
        actor: actor.name,
        healthBefore: health,
        healthAfter: actor.system?.attributes?.health?.value,
        lastDamageTime: actor.getFlag(scope, "lastDamageTime")
      });
      ui.notifications.info("PASS: the GM processed the player-originated Health update.");
    } else {
      console.error("[FASERIP TEST] FAIL | GM did not record the player-originated Health update", {
        actor: actor.name,
        lastDamageTime: actor.getFlag(scope, "lastDamageTime")
      });
      ui.notifications.error("FAIL: the GM did not record the player-originated Health update.");
    }
  } finally {
    await actor.update({ "system.attributes.health.value": health });
    await sleep(250);

    const addedEffects = actor.effects.filter(effect => !beforeEffects.has(effect.id));
    if (addedEffects.length) {
      try {
        await actor.deleteEmbeddedDocuments("ActiveEffect", addedEffects.map(effect => effect.id), { mshIntentional: true });
      } catch (error) {
        console.warn("[FASERIP TEST] Could not remove probe-created effects", error);
      }
    }

    try {
      if (previousDamageTime === undefined) await actor.unsetFlag(scope, "lastDamageTime");
      else await actor.setFlag(scope, "lastDamageTime", previousDamageTime);
    } catch (_) {}
    try {
      if (previousDamageWorldTime === undefined) await actor.unsetFlag(scope, "lastDamageWorldTime");
      else await actor.setFlag(scope, "lastDamageWorldTime", previousDamageWorldTime);
    } catch (_) {}
  }
})();
