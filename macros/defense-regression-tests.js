// defense-regression-tests.js v4.0.0 - 2026-07-02
// v4.0.0: Promoted from console paste to permanent macro. Adds Body Armor,
//         Force Field, and Absorption coverage (tests 8-20) to the seven
//         Step #1 resistance/invulnerability tests. Test 12 guards the FF
//         physical double-penalty fix (mitigation.js v3.2.3). mitigate()
//         helper now takes bypassArmor per-call (BA tests need false).
// Run as a script macro or paste into the console. Creates and deletes a
// temporary actor; posts no chat cards.
(async () => {
  const KEEP_TEST_ACTOR = false;
  const SYSTEM_ID = game.system.id || "msh-faserip";
  const systemPath = `/systems/${SYSTEM_ID}`;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const results = [];

  function getValidActorType() {
    const targetedActor = Array.from(game.user.targets || [])[0]?.actor;
    if (targetedActor?.type) return targetedActor.type;
    const selectedActor = canvas?.tokens?.controlled?.[0]?.actor;
    if (selectedActor?.type) return selectedActor.type;
    const existingActor = game.actors?.find(a => !!a.type);
    if (existingActor?.type) return existingActor.type;
    const modelTypes = Object.keys(game.model?.Actor || {}).filter(t => !t.startsWith("_"));
    if (modelTypes.length) return modelTypes[0];
    const docTypes = game.system?.documentTypes?.Actor || [];
    if (docTypes.length) return docTypes[0];
    throw new Error("Could not determine a valid Actor type for this system.");
  }

  function assert(condition, name, details = {}) {
    const result = { name, pass: !!condition, details };
    results.push(result);
    if (condition) console.log(`✅ PASS | ${name}`, details);
    else console.error(`❌ FAIL | ${name}`, details);
    return result;
  }

  async function importMitigation() {
    const mod = await import(`${systemPath}/scripts/rules/mitigation.js`);
    const fn = mod.calculateMitigation || mod.default?.calculateMitigation;
    if (!fn) throw new Error("Could not import calculateMitigation from scripts/rules/mitigation.js");
    const reset = mod.resetFFRoundTracker || mod.default?.resetFFRoundTracker;
    if (!reset) throw new Error("Could not import resetFFRoundTracker from scripts/rules/mitigation.js");
    return { calculateMitigation: fn, resetFFRoundTracker: reset };
  }

  async function createTestActor() {
    const actorType = getValidActorType();
    console.log("Using test actor type:", actorType);
    const actor = await Actor.create({
      name: `ZZZ Defense Test ${Date.now()}`,
      type: actorType,
      system: {}
    });
    if (!actor) throw new Error(`Actor.create returned no actor for type "${actorType}".`);
    return actor;
  }

  async function createPower(actor, name, system) {
    const created = await actor.createEmbeddedDocuments("Item", [{
      name,
      type: "power",
      system: {
        rank: "Remarkable",
        value: 30,
        isActive: true,
        activationType: "passive",
        isDefensePower: true,
        ...system
      }
    }]);
    await sleep(350);
    const item = created?.[0];
    if (!item) throw new Error(`Could not create test power "${name}".`);
    return actor.items.get(item.id) || item;
  }

  async function createResistancePower(actor, {
    name, powerType, rank, value, resistanceType,
    resistanceEffect = "damageReduction", isInvulnerability = false
  }) {
    return createPower(actor, name, {
      category: "resistances",
      type: powerType || name,
      rank, value,
      isResistance: true,
      resistanceType,
      resistanceEffect,
      resistanceIsInvulnerability: isInvulnerability,
      countsAsTwoPowers: isInvulnerability
    });
  }

  async function createBodyArmorPower(actor, { rank = "Remarkable", value = 30 } = {}) {
    return createPower(actor, "Body Armor", {
      category: "bodyAlterationsDefensive",
      type: "Body Armor",
      rank, value,
      isBodyArmor: true,
      bodyArmorType: "both"
    });
  }

  async function createForceFieldPower(actor, { rank = "Remarkable", value = 30 } = {}) {
    return createPower(actor, "Force Field Generation", {
      category: "mentalPowers",
      type: "Force Field Generation",
      rank, value,
      isForceField: true,
      forceFieldType: "personal",
      forceFieldPersonal: true
    });
  }

  async function createAbsorptionPower(actor, {
    rank = "Remarkable", value = 30,
    absorptionType = "energy", absorptionSpecific = "",
    convertsToHealth = false
  } = {}) {
    return createPower(actor, "Absorption", {
      category: "bodyAlterationsDefensive",
      type: "Absorption",
      rank, value,
      absorptionType,
      absorptionSpecific,
      absorptionConvertsToHealth: convertsToHealth
    });
  }

  async function forceDefenseSync(actor) {
    await actor.update({ "system.__defenseTestSync": Date.now() });
    await sleep(350);
  }

  function listDefenseEffects(actor) {
    return actor.effects.map(effect => {
      const flags = effect.flags?.["msh-faserip"] || effect.flags?.[SYSTEM_ID] || {};
      return {
        id: effect.id,
        name: effect.name,
        powerItemId: flags.powerItemId,
        effectCategory: flags.effectCategory,
        defenseType: flags.defenseType,
        resistanceType: flags.resistanceType,
        resistanceValue: flags.resistanceValue,
        physical: flags.physical,
        energy: flags.energy,
        fullValue: flags.fullValue,
        rankValue: flags.rankValue,
        isInvulnerability: flags.isInvulnerability
      };
    }).filter(e => e.effectCategory === "defense" || e.defenseType);
  }

  async function mitigate(calculateMitigation, actor, {
    rawDamage, damageType, attackForm = "energy", bypassArmor = true
  }) {
    // calculateMitigation(rawDamage, targetActor, options)
    return await calculateMitigation(rawDamage, actor, {
      damageType,
      attackForm,
      bypassArmor,
      ignoresNaturalArmor: false,
      ignoresArtificialArmor: false,
      armorPiercing: 0,
      armorPiercingCS: 0,
      apMode: "value"
    });
  }

  async function deletePowerAndSync(actor, item) {
    await item.delete();
    await sleep(450);
    await forceDefenseSync(actor);
  }

  let testActor = null;

  console.group("FASERIP Defense Regression Harness v4");

  try {
    const { calculateMitigation, resetFFRoundTracker } = await importMitigation();
    testActor = await createTestActor();
    console.log("Created temporary actor:", testActor.name, testActor);

    // ── Step #1 tests (1-7): resistance / invulnerability ──────────────────

    // 1. Fire Resistance 30 vs Fire 75 = 45.
    let fireRes = await createResistancePower(testActor, {
      name: "Resistance to Fire and Heat",
      powerType: "Resistance to Fire and Heat",
      rank: "Remarkable", value: 30, resistanceType: "fire"
    });
    await forceDefenseSync(testActor);
    console.table(listDefenseEffects(testActor));

    let r = await mitigate(calculateMitigation, testActor, { rawDamage: 75, damageType: "energy-fire" });
    assert(r.netDamage === 45, "Fire Resistance 30 reduces 75 fire damage to 45",
      { netDamage: r.netDamage, absorbed: r.absorbed, layers: r.layers });

    // 2. Deleted Fire Resistance no longer applies.
    await deletePowerAndSync(testActor, fireRes);
    r = await mitigate(calculateMitigation, testActor, { rawDamage: 75, damageType: "energy-fire" });
    assert(r.netDamage === 75, "Deleted Fire Resistance no longer reduces fire damage",
      { netDamage: r.netDamage, defenseEffects: listDefenseEffects(testActor) });

    // 3. Fire Invulnerability prevents Fire 75.
    let fireInvuln = await createResistancePower(testActor, {
      name: "Invulnerability", powerType: "Invulnerability",
      rank: "Class 1000", value: 1000, resistanceType: "fire",
      resistanceEffect: "invulnerability", isInvulnerability: true
    });
    await forceDefenseSync(testActor);
    r = await mitigate(calculateMitigation, testActor, { rawDamage: 75, damageType: "energy-fire" });
    assert(r.netDamage === 0, "Fire Invulnerability prevents 75 fire damage",
      { netDamage: r.netDamage, absorbed: r.absorbed, layers: r.layers });

    // 4. Deleted Fire Invulnerability must not ghost-block weaker Fire Resistance.
    await deletePowerAndSync(testActor, fireInvuln);
    fireRes = await createResistancePower(testActor, {
      name: "Resistance to Fire and Heat",
      powerType: "Resistance to Fire and Heat",
      rank: "Remarkable", value: 30, resistanceType: "fire"
    });
    await forceDefenseSync(testActor);
    r = await mitigate(calculateMitigation, testActor, { rawDamage: 75, damageType: "energy-fire" });
    assert(r.netDamage === 45, "Deleted Fire Invulnerability does not ghost-block later Fire Resistance test",
      { netDamage: r.netDamage, defenseEffects: listDefenseEffects(testActor) });
    await deletePowerAndSync(testActor, fireRes);

    // 5. Electricity Resistance 30 vs Electricity 40 = 10.
    const elecRes = await createResistancePower(testActor, {
      name: "Resistance to Electricity", powerType: "Resistance to Electricity",
      rank: "Remarkable", value: 30, resistanceType: "electricity"
    });
    await forceDefenseSync(testActor);
    r = await mitigate(calculateMitigation, testActor, { rawDamage: 40, damageType: "energy-electricity" });
    assert(r.netDamage === 10, "Electricity Resistance 30 reduces 40 electricity damage to 10",
      { netDamage: r.netDamage, absorbed: r.absorbed });
    await deletePowerAndSync(testActor, elecRes);

    // 6. Cold Resistance 30 vs Cold 75 = 45.
    const coldRes = await createResistancePower(testActor, {
      name: "Resistance to Cold", powerType: "Resistance to Cold",
      rank: "Remarkable", value: 30, resistanceType: "cold"
    });
    await forceDefenseSync(testActor);
    r = await mitigate(calculateMitigation, testActor, { rawDamage: 75, damageType: "energy-cold" });
    assert(r.netDamage === 45, "Cold Resistance 30 reduces 75 cold damage to 45",
      { netDamage: r.netDamage, absorbed: r.absorbed });
    await deletePowerAndSync(testActor, coldRes);

    // 7. Corrosive Resistance 30 vs Corrosive 75 = 45.
    const corrosiveRes = await createResistancePower(testActor, {
      name: "Resistance to Corrosives", powerType: "Resistance to Corrosives",
      rank: "Remarkable", value: 30, resistanceType: "corrosive"
    });
    await forceDefenseSync(testActor);
    r = await mitigate(calculateMitigation, testActor, { rawDamage: 75, damageType: "energy-corrosive" });
    assert(r.netDamage === 45, "Corrosive Resistance 30 reduces 75 corrosive damage to 45",
      { netDamage: r.netDamage, absorbed: r.absorbed });
    await deletePowerAndSync(testActor, corrosiveRes);

    // ── Body Armor (8-10) ───────────────────────────────────────────────────
    // BA "both" at 30: physical 30, energy 30-20=10. bypassArmor:false so the
    // mitigation engine applies BA itself (in play attack-action pre-subtracts).

    let bodyArmor = await createBodyArmorPower(testActor, { rank: "Remarkable", value: 30 });
    await forceDefenseSync(testActor);
    console.table(listDefenseEffects(testActor));

    // 8. BA 30 vs blunt 50 = 20.
    r = await mitigate(calculateMitigation, testActor, {
      rawDamage: 50, damageType: "physical-blunt", attackForm: "blunt", bypassArmor: false
    });
    assert(r.netDamage === 20, "Body Armor 30 reduces 50 blunt damage to 20",
      { netDamage: r.netDamage, absorbed: r.absorbed, layers: r.layers });

    // 9. BA 30 vs fire 50 = 40 (energy side is rank-20).
    r = await mitigate(calculateMitigation, testActor, {
      rawDamage: 50, damageType: "energy-fire", bypassArmor: false
    });
    assert(r.netDamage === 40, "Body Armor 30 reduces 50 fire damage to 40 (energy at rank-20)",
      { netDamage: r.netDamage, absorbed: r.absorbed, layers: r.layers });

    // 10. Deleted BA no longer reduces blunt.
    await deletePowerAndSync(testActor, bodyArmor);
    r = await mitigate(calculateMitigation, testActor, {
      rawDamage: 50, damageType: "physical-blunt", attackForm: "blunt", bypassArmor: false
    });
    assert(r.netDamage === 50, "Deleted Body Armor no longer reduces blunt damage",
      { netDamage: r.netDamage, defenseEffects: listDefenseEffects(testActor) });

    // ── Force Field (11-15) ─────────────────────────────────────────────────
    // Personal FF at 30: energy 30, physical 20. Breach is cumulative per
    // round, so the tracker is reset before each FF case.

    let forceField = await createForceFieldPower(testActor, { rank: "Remarkable", value: 30 });
    await forceDefenseSync(testActor);
    console.table(listDefenseEffects(testActor));

    // 11. FF 30 vs fire 25 = 0 (within capacity).
    resetFFRoundTracker();
    r = await mitigate(calculateMitigation, testActor, { rawDamage: 25, damageType: "energy-fire" });
    assert(r.netDamage === 0, "Force Field 30 absorbs 25 fire damage entirely",
      { netDamage: r.netDamage, absorbed: r.absorbed, layers: r.layers });

    // 12. FF 30 vs blunt 18 = 0. Regression guard for mitigation.js v3.2.3:
    // physical protection is rank-10=20 applied ONCE. The old double-penalty
    // gave 10, leaking 8 damage here.
    resetFFRoundTracker();
    r = await mitigate(calculateMitigation, testActor, {
      rawDamage: 18, damageType: "physical-blunt", attackForm: "blunt"
    });
    assert(r.netDamage === 0, "Force Field 30 stops 18 blunt damage (physical rank-10 applied once)",
      { netDamage: r.netDamage, absorbed: r.absorbed, layers: r.layers });

    // 13. FF 30 vs fire 75: absorbs 30, breaches, excess 45 passes (personal FF).
    resetFFRoundTracker();
    r = await mitigate(calculateMitigation, testActor, { rawDamage: 75, damageType: "energy-fire" });
    assert(r.netDamage === 45 && !!r.ffBreach, "Force Field 30 breached by 75 fire: absorbs 30, 45 passes, breach flagged",
      { netDamage: r.netDamage, absorbed: r.absorbed, ffBreach: r.ffBreach });

    // 14. Personal FF replaces Body Armor: with both up, BA layer is skipped.
    bodyArmor = await createBodyArmorPower(testActor, { rank: "Remarkable", value: 30 });
    await forceDefenseSync(testActor);
    resetFFRoundTracker();
    r = await mitigate(calculateMitigation, testActor, {
      rawDamage: 18, damageType: "physical-blunt", attackForm: "blunt", bypassArmor: false
    });
    const baSkipped = (r.layers || []).some(l => l.type === "Body Armor" && l.skipped);
    assert(r.netDamage === 0 && baSkipped, "Personal Force Field replaces Body Armor (BA layer skipped)",
      { netDamage: r.netDamage, layers: r.layers });
    await deletePowerAndSync(testActor, bodyArmor);

    // 15. Deleted FF no longer absorbs.
    await deletePowerAndSync(testActor, forceField);
    resetFFRoundTracker();
    r = await mitigate(calculateMitigation, testActor, { rawDamage: 40, damageType: "energy-fire" });
    assert(r.netDamage === 40, "Deleted Force Field no longer absorbs fire damage",
      { netDamage: r.netDamage, defenseEffects: listDefenseEffects(testActor) });

    // ── Absorption (16-20) ──────────────────────────────────────────────────
    // Absorption soaks min(damage, rank) of matching damage before any other
    // layer; runs on both bypass and non-bypass paths.

    // 16. Absorption (energy) 30 vs fire 75 = 45.
    let absorption = await createAbsorptionPower(testActor, {
      rank: "Remarkable", value: 30, absorptionType: "energy"
    });
    await forceDefenseSync(testActor);
    console.table(listDefenseEffects(testActor));
    r = await mitigate(calculateMitigation, testActor, { rawDamage: 75, damageType: "energy-fire" });
    assert(r.netDamage === 45, "Absorption (energy) 30 reduces 75 fire damage to 45",
      { netDamage: r.netDamage, absorbed: r.absorbed, layers: r.layers });
    await deletePowerAndSync(testActor, absorption);

    // 17. Specific absorption matches only its type: "fire" ignores cold, soaks fire.
    absorption = await createAbsorptionPower(testActor, {
      rank: "Remarkable", value: 30, absorptionType: "", absorptionSpecific: "fire"
    });
    await forceDefenseSync(testActor);
    r = await mitigate(calculateMitigation, testActor, { rawDamage: 75, damageType: "energy-cold" });
    assert(r.netDamage === 75, "Fire-specific Absorption does not absorb cold damage",
      { netDamage: r.netDamage, layers: r.layers });
    r = await mitigate(calculateMitigation, testActor, { rawDamage: 75, damageType: "energy-fire" });
    assert(r.netDamage === 45, "Fire-specific Absorption 30 reduces 75 fire damage to 45",
      { netDamage: r.netDamage, absorbed: r.absorbed });
    await deletePowerAndSync(testActor, absorption);

    // 18. convertsToHealth reports the heal on the result (caller applies it).
    absorption = await createAbsorptionPower(testActor, {
      rank: "Remarkable", value: 30, absorptionType: "energy", convertsToHealth: true
    });
    await forceDefenseSync(testActor);
    r = await mitigate(calculateMitigation, testActor, { rawDamage: 75, damageType: "energy-fire" });
    assert(r.netDamage === 45 && r.absorptionHeal === 30, "Absorption convertsToHealth reports absorptionHeal 30",
      { netDamage: r.netDamage, absorptionHeal: r.absorptionHeal, absorptionAeIds: r.absorptionAeIds });

    // 19-20. Deleted Absorption: no soak, no ghost heal.
    await deletePowerAndSync(testActor, absorption);
    r = await mitigate(calculateMitigation, testActor, { rawDamage: 75, damageType: "energy-fire" });
    assert(r.netDamage === 75, "Deleted Absorption no longer absorbs fire damage",
      { netDamage: r.netDamage, defenseEffects: listDefenseEffects(testActor) });
    assert(!r.absorptionHeal, "Deleted Absorption reports no ghost heal",
      { absorptionHeal: r.absorptionHeal });

    // ── Summary ─────────────────────────────────────────────────────────────
    const passed = results.filter(x => x.pass).length;
    const failed = results.filter(x => !x.pass).length;

    console.table(results.map(x => ({
      result: x.pass ? "PASS" : "FAIL",
      test: x.name,
      netDamage: x.details?.netDamage,
      absorbed: x.details?.absorbed
    })));

    if (failed === 0) {
      ui.notifications.info(`FASERIP defense regression tests passed: ${passed}/${results.length}`);
      console.log(`🎉 All defense regression tests passed: ${passed}/${results.length}`);
    } else {
      ui.notifications.error(`FASERIP defense regression tests failed: ${failed}/${results.length}`);
      console.error("Failed tests:", results.filter(x => !x.pass));
    }

    return { passed, failed, results, finalDefenseEffects: listDefenseEffects(testActor) };

  } catch (err) {
    console.error("FASERIP defense regression harness crashed:", err);
    ui.notifications.error(`FASERIP defense regression harness crashed: ${err.message}`);
    return { error: err, results };

  } finally {
    if (testActor && !KEEP_TEST_ACTOR) {
      await testActor.delete();
      console.log("Deleted temporary test actor.");
    } else if (testActor) {
      console.warn("Keeping temporary test actor because KEEP_TEST_ACTOR=true:", testActor.name);
    }
    console.groupEnd();
  }
})();
