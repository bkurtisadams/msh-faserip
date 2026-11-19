// scripts/dev/power-rules-runtime-tests.js v1.7.0 - 2026-11-19
// v1.7.0: "Karma ledger" section: Starting Karma on creation, existing
//         ledgers untouched, direct spends no longer wipe Karma.
// scripts/dev/power-rules-runtime-tests.js v1.6.0 - 2026-11-19
// v1.6.0: Migration tests expect the old list cleared into Notes.
// scripts/dev/power-rules-runtime-tests.js v1.5.1 - 2026-11-19
// v1.5.1: Protected Senses test expects the sheet order (hearing, sight).
// scripts/dev/power-rules-runtime-tests.js v1.5.0 - 2026-11-19
// v1.5.0: Armor equipment resistances and protection beside defense powers.
// scripts/dev/power-rules-runtime-tests.js v1.4.0 - 2026-11-19
// v1.4.0: Migration of object-shaped lists with blank names; Protected
//         Senses covering several senses.
// scripts/dev/power-rules-runtime-tests.js v1.3.0 - 2026-11-19
// v1.3.0: "Equipment powers" section: link, broken / missing item turns the
//         power and its effects off, repair and unlink restore it, the sheets
//         show it, and the granted-power-list migration.
// scripts/dev/power-rules-runtime-tests.js v1.2.0 - 2026-11-19
// v1.2.0: Karma per use now checks the balance (50 -> 40, Starting Karma
//         baseline seeded). New "Talents" section checks the rebuilt talents
//         compendium against Appendix B.
// scripts/dev/power-rules-runtime-tests.js v1.1.0 - 2026-11-19
// v1.1.0: "New power fields" section (2.55.14): multi-form Invulnerability,
//         Ultimate Skill talent link, Raise Lowest Ability +20 effect, Karma
//         per use, stunt cost, the linked-effects list and the new sheet rows.
// scripts/dev/power-rules-runtime-tests.js v1.0.1 - 2026-11-19
// v1.0.1: route() keeps watching for a window for 1.5s after rollPower
//         returns: the Generic FEAT dialog opens without being awaited, so
//         v1.0.0 missed it (and left it open) on the FEAT routes.
// Foundry VTT runtime suite for the Nov 18-19 power-rules work (2.55.0x-2.55.11):
// presets and the type reset, the rebuilt powers compendium, click routing
// (Ultimate Skill, Sound/Light/Fire/Electrical/Darkforce/Weather/Transferral,
// Nullifier by type, stunt powers, Shred choice), damage (sonic Force vs Body
// Armor and Sound Manipulation, Force vs force fields, Corrosive Touch -3CS),
// Shred armor suppression, the Limitation view, minimum-rank warnings and
// the Edit Power sheet layout. Dice are never rolled: routes are checked by
// intercepting ActionDispatcher.roll and closing any dialog that opens.
// Launch via macros/run-power-rules-runtime-tests.js as a GM.

import { rollPower } from "../modules/actions/power-router.js";
import { ActionDispatcher } from "../modules/actions/action-dispatcher.js";
import { calculateMitigation, resetFFRoundTracker } from "../rules/mitigation.js";
import { getBodyArmorValues, derivePowerDamage } from "../modules/actions/action-utils.js";
import { syncDefenseEffects, getActiveDefenseEffects } from "../modules/effects/defense-effects.js";
import { POWER_ENGINE_PRESETS, buildPowerTypeResetUpdates } from "../power-presets.mjs";
import { buildLimitationView } from "../power-limitations.mjs";
import { buildRankValidation } from "../power-validation.mjs";
import { prepareActiveEffectCategories } from "../../helpers/effects.mjs";
import { buildPowerSheetView, protectedSensesOf } from "../power-sheet-view.mjs";
import { buildUltimateSkillView, buildRaiseLowestView, buildLinkedEffectsView } from "../power-sheet-actor-view.mjs";
import { stuntKarmaCost } from "../stunt-ledger.js";
import { startingKarmaHistory } from "../karma-rules.js";
import { powerGearState, buildEquipmentLinkView, buildGrantedPowersView, linkPowerToEquipment, unlinkPower, migrateGrantedPowerLists } from "../equipment-link.mjs";

const SYSTEM_ID = "msh-faserip";
const TEST_PREFIX = "ZZZ Power Rules Runtime";
const DEFAULT_TIMEOUT = 5000;
const STARRED = ["Invulnerability", "Cosmic Awareness", "Combat Sense", "Teleportation", "Dimensional Travel",
  "Probability Manipulation", "Nullifying Power", "Time Control", "Body Transformation", "Image Generation",
  "Mind Control", "Emotion Control", "Possession", "Transferral", "Precognition", "Health-Drain Touch", "Immortality"];
const NO_START_ATTACK = ["Fire Control", "Electrical Manipulation", "Darkforce Manipulation", "Gravity Manipulation",
  "Weather Control", "Light Manipulation", "Sound Manipulation", "Nullifier Missile"];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitFor(predicate, { timeout = DEFAULT_TIMEOUT, interval = 50 } = {}) {
  const started = Date.now();
  while ((Date.now() - started) < timeout) {
    try { const v = await predicate(); if (v) return v; } catch (_) { /* retry */ }
    await sleep(interval);
  }
  return false;
}

function makeRecorder() {
  const results = [];
  function add(status, name, details) {
    const entry = { status, name, details: details === undefined ? {} : (details && typeof details === "object" ? details : { value: details }) };
    results.push(entry);
    const logger = status === "FAIL" ? console.error : status === "SKIP" ? console.warn : console.log;
    logger(`[FASERIP TEST] ${status} | ${name}`, entry.details);
    return entry;
  }
  return {
    results,
    pass: (n, d) => add("PASS", n, d),
    fail: (n, d) => add("FAIL", n, d),
    skip: (n, d) => add("SKIP", n, d),
    assert(c, n, d) { return c ? this.pass(n, d) : this.fail(n, d); },
    equal(actual, expected, n) { return this.assert(actual === expected, n, { actual, expected }); }
  };
}

const power = (name, system, flags) => ({ name, type: "power", system: { isActive: true, ...system }, ...(flags ? { flags } : {}) });

async function createActor(state, name, { system = {}, items = [] } = {}) {
  const ActorClass = Actor.implementation ?? Actor;
  const actor = await ActorClass.create({ name: `${TEST_PREFIX} - ${name} - ${Date.now()}`, type: "hero", system, items });
  if (!actor) throw new Error(`Actor creation failed for ${name}`);
  state.actors.push(actor);
  for (const item of actor.items.filter(i => i.type === "power")) {
    try { await syncDefenseEffects(actor, item, false); } catch (e) { console.warn("[FASERIP TEST] defense sync", item.name, e); }
  }
  return actor;
}

const item = (actor, name) => actor.items.find(i => i.name === name);
const appTitle = (app) => String(app?.title ?? app?.options?.window?.title ?? "");

// Calls rollPower with ActionDispatcher.roll and ChatMessage.create intercepted.
// Returns the dispatched action types, chat cards posted, and the title of any
// new window that opened (which is then closed).
async function route(actor, it) {
  const out = { dispatched: [], chat: [], window: "", error: null };
  const originalRoll = ActionDispatcher.roll;
  ActionDispatcher.roll = async (actionType) => { out.dispatched.push(actionType); };
  const chatClass = globalThis.ChatMessage;
  const hadOwnCreate = Object.prototype.hasOwnProperty.call(chatClass, "create");
  const originalCreate = chatClass.create;
  chatClass.create = async (data) => { out.chat.push(String(data?.content ?? "")); return {}; };
  const before = new Set(foundry.applications.instances.keys());
  let settledAt = 0;
  const call = Promise.resolve().then(() => rollPower(actor, it)).catch(e => { out.error = e; }).finally(() => { settledAt = Date.now(); });
  try {
    const app = await waitFor(() => {
      const found = [...foundry.applications.instances.values()].find(a => !before.has(a.id) && a.element);
      if (found) return found;
      return settledAt && (Date.now() - settledAt) > 1500 ? "settled" : false;
    }, { timeout: 4000 });
    if (app && app !== "settled") {
      out.window = appTitle(app);
      await sleep(100);
      try { await app.close(); } catch (_) { /* noop */ }
    }
    await Promise.race([call, sleep(1500)]);
  } finally {
    ActionDispatcher.roll = originalRoll;
    if (hadOwnCreate) chatClass.create = originalCreate;
    else delete chatClass.create;
  }
  return out;
}

function presetTests(recorder) {
  const missingTwo = STARRED.filter(t => POWER_ENGINE_PRESETS[t]?.countsAsTwoPowers !== true);
  recorder.assert(missingTwo.length === 0, "Presets: every starred power counts as two Powers", { missing: missingTwo });
  const attacking = NO_START_ATTACK.filter(t => {
    const p = POWER_ENGINE_PRESETS[t] || {};
    return p.isAttackPower !== false || (p.battleEffectsColumn && p.battleEffectsColumn !== "Me");
  });
  recorder.assert(attacking.length === 0, "Presets: control/no-damage powers start without an attack", { attacking });
  const reset = buildPowerTypeResetUpdates("mentalPowers", "Ultimate Skill");
  recorder.assert(reset["system.battleEffectsColumn"] === "" && reset["system.isAttackPower"] === false && reset["system.requiresSave"] === false,
    "Type reset: changing to Ultimate Skill clears attack column, attack flag and save",
    { bec: reset["system.battleEffectsColumn"], attack: reset["system.isAttackPower"], save: reset["system.requiresSave"] });
}

async function compendiumTests(recorder) {
  const pack = game.packs.get(`${SYSTEM_ID}.powers`);
  if (!pack) { recorder.skip("Compendium: powers pack found"); return; }
  const docs = await pack.getDocuments();
  const byType = t => docs.find(d => d.system?.type === t);
  const missingTwo = STARRED.filter(t => byType(t) && byType(t).system.countsAsTwoPowers !== true);
  recorder.assert(missingTwo.length === 0, "Compendium (rebuilt pack): starred powers count as two", { missing: missingTwo });
  recorder.equal(byType("Paralyzing Touch")?.system?.save?.onFail?.effect, "unconscious", "Compendium: Paralyzing Touch knocks out (Unconscious)");
  recorder.equal(byType("Rotting Touch")?.system?.continuingDamage, false, "Compendium: Rotting Touch has no continuing damage");
  recorder.equal(byType("Fire Control")?.system?.battleEffectsColumn, "", "Compendium: Fire Control has no attack column");
  recorder.equal(byType("Sound Manipulation")?.system?.resistanceType, "sound", "Compendium: Sound Manipulation keeps its sonic resistance");
}

async function routingTests(recorder, state) {
  const actor = await createActor(state, "Router", {
    system: { abilities: { fighting: { rank: "Remarkable", value: 30 } } },
    items: [
      { name: "Martial Arts B", type: "talent", system: { ability: "fighting", rankOverride: "Unearthly" } },
      power("Ultimate Skill", { rank: "Unearthly", value: 100, category: "mentalPowers", type: "Ultimate Skill", battleEffectsColumn: "BA", isAttackPower: true }),
      power("Sound Manipulation", { rank: "Excellent", value: 20, category: "energyControl", type: "Sound Manipulation", battleEffectsColumn: "Fo" }),
      power("Light Manipulation", { rank: "Excellent", value: 20, category: "energyControl", type: "Light Manipulation", battleEffectsColumn: "En", requiresSave: true, save: { ability: "endurance" } }),
      power("Null Ray", { rank: "Excellent", value: 20, category: "distanceAttacks", type: "Nullifier Missile", battleEffectsColumn: "Fo" }),
      power("Fire Control", { rank: "Excellent", value: 20, category: "matterControl", type: "Fire Control", battleEffectsColumn: "En" }),
      power("Electrical Manipulation", { rank: "Excellent", value: 20, category: "energyControl", type: "Electrical Manipulation", battleEffectsColumn: "En" }),
      power("Darkforce Manipulation", { rank: "Excellent", value: 20, category: "energyControl", type: "Darkforce Manipulation", battleEffectsColumn: "En" }),
      power("Weather Control", { rank: "Excellent", value: 20, category: "matterControl", type: "Weather Control", battleEffectsColumn: "Fo" }),
      power("Transferral", { rank: "Excellent", value: 20, category: "mentalPowers", type: "Transferral" }),
      power("Rotting Touch", { rank: "Excellent", value: 20, category: "bodyAlterationsOffensive", type: "Rotting Touch", battleEffectsColumn: "En" }),
      power("Flame Missile", { rank: "Good", value: 10, category: "matterControl", type: "Fire Control", battleEffectsColumn: "En", isAttackPower: true },
        { [SYSTEM_ID]: { isStuntPower: true } })
    ]
  });

  const expectWindow = async (name, label, match) => {
    const r = await route(actor, item(actor, name));
    recorder.assert(!!r.window && r.window.includes(match) && r.dispatched.length === 0 && !r.error, label,
      { window: r.window, dispatched: r.dispatched, error: r.error?.message });
  };
  const expectDispatch = async (name, label, actionType) => {
    const r = await route(actor, item(actor, name));
    recorder.assert(r.dispatched.includes(actionType) && !r.error, label, { dispatched: r.dispatched, window: r.window, error: r.error?.message });
  };

  await expectWindow("Ultimate Skill", "Route: Ultimate Skill opens Martial Arts B's talent roll, not a Blunt Attack", "Martial Arts B");
  await expectWindow("Sound Manipulation", "Route: Sound Manipulation (stale Force column) opens Dampen/Raise, not an attack", "Sound Manipulation");
  await expectDispatch("Light Manipulation", "Route: Light Manipulation (stale Energy column) rolls the intensity FEAT", "intensity");
  await expectDispatch("Null Ray", "Route: a Nullifier Missile named \"Null Ray\" goes to the nullify dialog by type", "mental-power");
  await expectWindow("Fire Control", "Route: Fire Control opens Intensify/Reduce/Fire shield, not an attack", "Fire Control");
  await expectWindow("Darkforce Manipulation", "Route: Darkforce Manipulation opens a Power stunt FEAT", "Generic FEAT");
  await expectWindow("Weather Control", "Route: Weather Control opens a Power stunt FEAT", "Generic FEAT");
  await expectWindow("Transferral", "Route: Transferral opens the hero's Red Power FEAT", "Generic FEAT");
  await expectWindow("Rotting Touch", "Route: Rotting Touch asks Attack or Shred armor", "Rotting Touch");

  const elec = await route(actor, item(actor, "Electrical Manipulation"));
  recorder.assert(elec.dispatched.length === 0 && elec.chat.some(c => c.includes("Resistance")),
    "Route: Electrical Manipulation posts its resistance card, no attack", { dispatched: elec.dispatched, cards: elec.chat.length });

  const stunt = await route(actor, item(actor, "Flame Missile"));
  recorder.assert(stunt.dispatched.includes("energy"), "Route: a stunt power typed Fire Control uses its own Energy attack",
    { dispatched: stunt.dispatched, window: stunt.window });
}

async function damageTests(recorder, state) {
  const armored = await createActor(state, "Armored", { items: [
    power("Body Armor", { rank: "Good", value: 10, category: "bodyAlterationsDefensive", type: "Body Armor", isBodyArmor: true, bodyArmorType: "both", armorNature: "natural", isDefensePower: true })
  ] });
  const sonicRes = await createActor(state, "Sonic", { items: [
    power("Sound Manipulation", { rank: "Excellent", value: 20, category: "energyControl", type: "Sound Manipulation", isDefensePower: true, isResistance: true, resistanceType: "sound", resistanceEffect: "damageReduction" })
  ] });
  const fielded = await createActor(state, "Fielded", { items: [
    power("Force Field", { rank: "Good", value: 10, category: "mentalPowers", type: "Force Field Generation", isForceField: true, isDefensePower: true, forceFieldPersonal: true })
  ] });
  await waitFor(() => getActiveDefenseEffects(armored).length && getActiveDefenseEffects(sonicRes).length && getActiveDefenseEffects(fielded).length, { timeout: 3000 });

  const net = (actor, dmg, damageType) => { resetFFRoundTracker(); return calculateMitigation(dmg, actor, { damageType })?.netDamage; };
  recorder.equal(net(armored, 30, "physical-force-sound"), 20, "Damage: sonic Force 30 vs Good Body Armor takes the full 10 (net 20)");
  recorder.equal(net(sonicRes, 30, "physical-force-sound"), 10, "Damage: sonic Force 30 vs Excellent Sound Manipulation reduced by 20 (net 10)");
  recorder.equal(net(sonicRes, 30, "physical-force"), 30, "Damage: plain Force 30 is not reduced by sonic resistance");
  recorder.equal(net(fielded, 30, "physical-force"), 20, "Damage: Force 30 vs Good force field stopped at full rank (net 20)");
  recorder.equal(net(fielded, 30, "physical-blunt"), 30, "Damage: Blunt 30 vs Good force field stopped at rank -10 (net 30)");

  recorder.equal(derivePowerDamage({ type: "Corrosive Touch", rank: "Amazing", value: 50 }), 20, "Damage: Amazing Corrosive Touch inflicts Power rank -3CS (Excellent, 20)");

  const armor = item(armored, "Body Armor");
  const baAe = () => armored.effects.find(e => e.flags?.[SYSTEM_ID]?.defenseType === "bodyArmor");
  recorder.assert(!!baAe() && baAe().isSuppressed === false, "Shred: Body Armor effect exists and is not suppressed", { found: !!baAe() });
  const [shred] = await armored.createEmbeddedDocuments("ActiveEffect", [{
    name: `Armor Shredded: ${armor.name}`, img: "icons/svg/acid.svg", statuses: ["armor-shredded"],
    flags: { [SYSTEM_ID]: { effectType: "armorShredded", shredsArmorItemId: armor.id } }
  }]);
  await sleep(150);
  recorder.assert(baAe()?.isSuppressed === true && baAe()?.disabled === false, "Shred: armor effect is suppressed, its own switch stays enabled",
    { suppressed: baAe()?.isSuppressed, disabled: baAe()?.disabled });
  recorder.equal(net(armored, 30, "physical-blunt"), 30, "Shred: shredded armor stops nothing (Blunt 30 net 30)");
  recorder.equal(getBodyArmorValues(armored, "physical-blunt")?.physical ?? 0, 0,
    "Shred: attack-dialog armor pre-calculation also ignores it");
  const cats = prepareActiveEffectCategories(armored.effects);
  recorder.assert(cats.suppressed.effects.some(e => e.id === baAe()?.id), "Shred: Effects tab lists the armor under Suppressed");
  await shred.delete();
  await sleep(150);
  recorder.assert(baAe()?.isSuppressed === false, "Shred: deleting the shred effect restores the armor");
  recorder.equal(net(armored, 30, "physical-blunt"), 20, "Shred: restored armor stops 10 again (net 20)");
}

async function sheetTests(recorder, state) {
  const actor = await createActor(state, "Limits", {
    system: { abilities: { endurance: { rank: "Remarkable", value: 30 }, strength: { rank: "Good", value: 10 } } },
    items: [
      power("Fire Generation", { rank: "Remarkable", value: 30, category: "distanceAttacks", type: "Fire Generation", isLimited: true, preLimitationRank: "Excellent", limitation: { kind: "raise", preset: "two-day" } }),
      power("Flight", { rank: "Good", value: 10, category: "movement", type: "Flight", isLimited: true, limitation: { preset: "two-day" } }),
      power("Body Armor", { rank: "Good", value: 10, category: "bodyAlterationsDefensive", type: "Body Armor", isLimited: true, limitation: { preset: "two-day" } }),
      power("Lightning Speed", { rank: "Amazing", value: 50, category: "movement", type: "Lightning Speed", isLimited: true, preLimitationRank: "Good", limitation: { preset: "nighttime" } }),
      power("Precognition", { rank: "Amazing", value: 50, category: "mentalPowers", type: "Precognition", isLimited: true, limitations: "" }),
      power("Resistance to Toxins", { rank: "Typical", value: 6, category: "resistances", type: "Resistance to Toxins" })
    ]
  });
  const fire = buildLimitationView(item(actor, "Fire Generation"));
  recorder.assert(fire.charLimitName === "Only two times/day" && fire.maxRank === "Remarkable" && fire.raisedCount === 3,
    "Limitation: character's limit, maximum and count", { name: fire.charLimitName, max: fire.maxRank, count: fire.raisedCount, warnings: fire.warnings });
  const speed = buildLimitationView(item(actor, "Lightning Speed"));
  recorder.assert(speed.warnings.length === 3, "Limitation: above maximum, second limit and 4th raised power all warn", { warnings: speed.warnings });
  const precog = buildLimitationView(item(actor, "Precognition"));
  recorder.assert(precog.required && precog.typeLocked && precog.warnings.length === 1, "Limitation: Precognition is required and warns on empty Detail", { warnings: precog.warnings });
  const toxins = buildRankValidation(item(actor, "Resistance to Toxins"));
  recorder.assert(toxins.label.startsWith("Incredible") && toxins.hasWarnings, "Rank check: Typical Resistance to Toxins warns (minimum Incredible from Remarkable Endurance)", toxins);

  const it = item(actor, "Lightning Speed");
  await it.sheet.render(true);
  const el = await waitFor(() => it.sheet.element?.querySelector?.('[data-section="limitation"]') && it.sheet.element);
  if (!el) { recorder.fail("Edit Power sheet: renders with the Limitation section"); return; }
  recorder.assert(el.querySelectorAll('[data-section="limitation"] .ps2-limit-warn').length === 3, "Edit Power sheet: Limitation section shows the 3 warnings");
  recorder.assert(!!el.querySelector('select[name="system.limitation.preset"]') && !el.querySelector('select[name="system.limitation.rankBonus"]'),
    "Edit Power sheet: book limitation list replaces the +1CS/+2CS dropdown");
  recorder.equal(el.querySelector('textarea[name="system.description"]')?.rows, 9, "Edit Power sheet: Description has 9 lines");
  recorder.equal(el.querySelector('textarea[name="system.specialMechanics"]')?.rows, 2, "Edit Power sheet: Special Mechanics has 2 lines");
  await it.sheet.close();

  const tox = item(actor, "Resistance to Toxins");
  await tox.sheet.render(true);
  const el2 = await waitFor(() => tox.sheet.element?.querySelector?.(".ps2-limit-warns") && tox.sheet.element);
  recorder.assert(!!el2, "Edit Power sheet: below-minimum rank warning shows under Basics");
  await tox.sheet.close();
}

async function newFieldTests(recorder, state) {
  const net = (actor, dmg, damageType) => { resetFFRoundTracker(); return calculateMitigation(dmg, actor, { damageType })?.netDamage; };

  // Invulnerability: several attack forms on one power.
  const invSys = { rank: "Class 1000", value: 1000, category: "resistances", type: "Invulnerability", isDefensePower: true, isResistance: true,
    resistanceEffect: "invulnerability", resistanceIsInvulnerability: true, resistanceType: "fire",
    resistanceTypes: { fire: true, cold: true, electricity: false } };
  const inv = await createActor(state, "Invulnerable", { items: [power("Invulnerability", invSys)] });
  await waitFor(() => getActiveDefenseEffects(inv).length, { timeout: 3000 });
  const invAe = getActiveDefenseEffects(inv)[0];
  recorder.assert(Array.isArray(invAe?.flags?.[SYSTEM_ID]?.resistanceTypes) && invAe.flags[SYSTEM_ID].resistanceTypes.length === 2,
    "Invulnerability: defense effect carries both attack forms", { types: invAe?.flags?.[SYSTEM_ID]?.resistanceTypes, name: invAe?.name });
  recorder.equal(net(inv, 50, "energy-fire"), 0, "Invulnerability: fire 50 stopped");
  recorder.equal(net(inv, 50, "energy-cold"), 0, "Invulnerability: cold 50 stopped (second form)");
  recorder.equal(net(inv, 50, "energy-electricity"), 50, "Invulnerability: electricity 50 not covered");
  recorder.equal(buildPowerSheetView(invSys).invulnForms.filter(f => f.checked).length, 2, "Invulnerability: sheet shows two forms checked");
  recorder.equal(buildPowerSheetView({ ...invSys, resistanceTypes: undefined }).invulnForms.filter(f => f.checked).map(f => f.key).join(), "fire",
    "Invulnerability: legacy single resistanceType shows as one checked form");

  // Ultimate Skill: talent picker and Rank Override link.
  const talent = (name, category) => ({ name, type: "talent", system: { category } });
  const us = await createActor(state, "Ultimate", { items: [
    power("Ultimate Skill", { rank: "Unearthly", value: 100, category: "mentalPowers", type: "Ultimate Skill" }),
    talent("Martial Arts B", "Fighting Skills"), talent("Physics", "Scientific Skills"),
    talent("Law", "Professional Skills"), talent("Student", "Other Talents")
  ] });
  const usItem = item(us, "Ultimate Skill");
  const usView = buildUltimateSkillView(usItem);
  const opt = n => usView.options.find(o => o.label.startsWith(n));
  recorder.assert(!opt("Martial Arts B").disabled && !opt("Physics").disabled && opt("Law").disabled && opt("Student").disabled,
    "Ultimate Skill: Fighting/Scientific allowed; Professional and Student greyed", { options: usView.options });
  const ma = item(us, "Martial Arts B"), phys = item(us, "Physics");
  await usItem.update({ "system.ultimateSkillTalentId": ma.id });
  await usItem.sheet._syncUltimateSkillTalent("");
  recorder.equal(item(us, "Martial Arts B").system.rankOverride, "Unearthly", "Ultimate Skill: picking Martial Arts B sets its Rank Override to Unearthly");
  await usItem.update({ "system.ultimateSkillTalentId": phys.id });
  await usItem.sheet._syncUltimateSkillTalent(ma.id);
  recorder.assert(item(us, "Physics").system.rankOverride === "Unearthly" && !item(us, "Martial Arts B").system.rankOverride,
    "Ultimate Skill: switching to Physics moves the Rank Override and clears Martial Arts B",
    { physics: item(us, "Physics").system.rankOverride, ma: item(us, "Martial Arts B").system.rankOverride });
  const r = await route(us, usItem);
  recorder.assert(r.window.includes("Physics") && !r.error, "Ultimate Skill: clicking the power rolls the linked talent (Physics)",
    { window: r.window, dispatched: r.dispatched, error: r.error?.message });

  // Raise Lowest Ability: picker and +20 Active Effect.
  const abil = (rank, value) => ({ rank, value });
  const rl = await createActor(state, "Raise Lowest", {
    system: { abilities: { fighting: abil("Excellent", 20), agility: abil("Good", 10), strength: abil("Feeble", 2), endurance: abil("Remarkable", 30),
      reason: abil("Typical", 6), intuition: abil("Good", 10), psyche: abil("Typical", 6) } },
    items: [power("Raise Lowest Ability", { rank: "", value: 0, category: "bodyControl", type: "Raise Lowest Ability" })]
  });
  const rlItem = item(rl, "Raise Lowest Ability");
  const rlView = buildRaiseLowestView(rlItem);
  recorder.assert(rlView.ability === "strength" && rlView.options.filter(o => !o.disabled).length === 1 && rlView.result.includes("2 \u2192 22 (Excellent)"),
    "Raise Lowest: only Strength (lowest) is selectable; result 2 to 22 Excellent", rlView);
  await rlItem.update({ "system.raiseLowest": { ability: "strength", applied: true } });
  await rlItem.sheet._syncRaiseLowestEffect();
  await sleep(150);
  recorder.assert(rl.system.abilities.strength.value === 22 && rl.system.abilities.strength.rank === "Excellent",
    "Raise Lowest: applying adds +20 Strength through an Active Effect (22, Excellent)", rl.system.abilities.strength);
  await rlItem.update({ "system.raiseLowest.applied": false });
  await rlItem.sheet._syncRaiseLowestEffect();
  await sleep(150);
  recorder.assert(rl.system.abilities.strength.value === 2 && !rlItem.effects.size, "Raise Lowest: unticking removes the effect (back to 2)",
    { value: rl.system.abilities.strength.value, effects: rlItem.effects.size });

  // Karma per use and stunt cost.
  const kc = await createActor(state, "Karma", {
    system: { attributes: { karma: { value: 50 } } },
    items: [power("Mind Control", { ...POWER_ENGINE_PRESETS["Mind Control"], rank: "Amazing", value: 50, category: "mentalPowers", type: "Mind Control" }),
      power("Pricey", { rank: "Good", value: 10, category: "mentalPowers", type: "Telepathy", karmaCost: 999 })]
  });
  recorder.equal(Number(item(kc, "Mind Control").system.karmaCost), 10, "Karma: Mind Control preset costs 10 Karma per use");
  await route(kc, item(kc, "Mind Control"));
  await sleep(150);
  const hist = kc.system.karma?.history ?? [];
  recorder.assert(hist.at(-1)?.amount === -10 && kc.system.attributes.karma.value === 40,
    "Karma: using Mind Control spends 10 Karma (50 -> 40, no ledger reset)",
    { value: kc.system.attributes.karma.value, history: hist.map(h => `${h.type}:${h.amount}`) });
  recorder.assert(hist[0]?.type === "Starting Karma" && hist[0]?.amount === 50, "Karma: first spend seeds a Starting Karma 50 baseline", { first: hist[0] });
  const pricey = await route(kc, item(kc, "Pricey"));
  recorder.assert(!pricey.dispatched.length && !pricey.window && (kc.system.karma?.history ?? []).length === hist.length,
    "Karma: a power costing more than the character has does not fire or charge", pricey);
  recorder.equal(stuntKarmaCost({ name: "Weather Control", system: { type: "Weather Control" } }), 50, "Stunt cost: Weather Control 50");
  recorder.equal(stuntKarmaCost({ name: "X", system: { type: "Telepathy", stuntKarmaCost: 75 } }), 75, "Stunt cost: the power's own field wins");

  // Linked effects list.
  const ba = await createActor(state, "Linked", { items: [
    power("Body Armor", { rank: "Good", value: 10, category: "bodyAlterationsDefensive", type: "Body Armor", isBodyArmor: true, bodyArmorType: "both", isDefensePower: true })
  ] });
  await waitFor(() => getActiveDefenseEffects(ba).length, { timeout: 3000 });
  const armor = item(ba, "Body Armor");
  recorder.assert(buildLinkedEffectsView(armor).linked.some(l => l.status === "Active"), "Linked effects: armor's defense effect listed as Active");
  await ba.createEmbeddedDocuments("ActiveEffect", [{ name: `Armor Shredded: ${armor.name}`, img: "icons/svg/acid.svg",
    flags: { [SYSTEM_ID]: { effectType: "armorShredded", shredsArmorItemId: armor.id, shreddingPower: "Rotting Touch" } } }]);
  await sleep(150);
  const lv = buildLinkedEffectsView(armor).linked[0];
  recorder.assert(lv?.status === "Suppressed" && lv?.by?.power === "Rotting Touch", "Linked effects: shredded armor shows Suppressed by Rotting Touch", lv);

  // Sheet rows.
  const sheetActor = await createActor(state, "New Rows", { items: [
    power("Invulnerability", invSys),
    power("Enhanced Senses", { rank: "Incredible", value: 40, category: "senses", type: "Enhanced Senses", isSensePower: true, detection: { senses: { hearing: true, sight: true } } }),
    power("Emotion Control", { rank: "Remarkable", value: 30, category: "mentalPowers", type: "Emotion Control", mental: { emotionType: "fear", emotionType2: "love" } })
  ] });
  const checkSheet = async (name, selector, test, label) => {
    const it = item(sheetActor, name);
    await it.sheet.render(true);
    const el = await waitFor(() => it.sheet.element?.querySelector?.(selector) && it.sheet.element);
    recorder.assert(!!el && test(el), label);
    await it.sheet.close();
  };
  await checkSheet("Invulnerability", 'input[name^="system.resistanceTypes."]',
    el => el.querySelectorAll('input[name^="system.resistanceTypes."]').length === 10 && el.querySelectorAll('input[name^="system.resistanceTypes."]:checked').length === 2,
    "Edit Power sheet: Invulnerability shows 10 attack forms, 2 checked");
  await checkSheet("Enhanced Senses", 'input[name^="system.detection.senses."]',
    el => el.querySelectorAll('input[name^="system.detection.senses."]').length === 5 && el.querySelectorAll('input[name^="system.detection.senses."]:checked').length === 2,
    "Edit Power sheet: Enhanced Senses shows 5 senses, 2 checked");
  await checkSheet("Emotion Control", 'select[name="system.mental.emotionType2"]',
    el => !!el.querySelector('input[name="system.karmaCost"]') && !!el.querySelector(".ps2-efx-head"),
    "Edit Power sheet: Emotion 2, Costs and Active Effects render");
}

async function talentTests(recorder) {
  const pack = game.packs.get(`${SYSTEM_ID}.talents`);
  if (!pack) { recorder.skip("Talents: compendium found"); return; }
  const docs = await pack.getDocuments();
  const t = n => docs.find(d => d.name === n)?.system ?? {};
  const has = (n, k) => (t(n).appliesTo ?? []).includes(k);
  recorder.assert(has("Sharp Weapons", "edged-attack") && !has("Sharp Weapons", "throwing-edged"), "Talents: Sharp Weapons not for thrown daggers");
  recorder.assert(has("Oriental Weapons", "throwing-edged") && has("Oriental Weapons", "shooting") && !has("Oriental Weapons", "blunt-attack"),
    "Talents: Oriental Weapons covers shuriken and crossbows, not blunt", t("Oriental Weapons").appliesTo);
  recorder.assert(!has("Martial Arts E", "shooting") && !has("Martial Arts E", "energy") && !has("Martial Arts E", "throwing-edged"),
    "Talents: Martial Arts E is unarmed combat only", t("Martial Arts E").appliesTo);
  recorder.assert(!has("Military", "shooting"), "Talents: Military gives no shooting bonus");
  recorder.equal(t("Repair/Tinkering").isCumulative, true, "Talents: Repair/Tinkering stacks with other Talents");
  const contacts = ["Business/Finance", "Criminology", "Detective/Espionage", "Journalism", "Military"].filter(n => !t(n).grantsContact);
  recorder.assert(!contacts.length, "Talents: contact-granting Talents name their Contact", { missing: contacts });
  const weaponsCum = docs.filter(d => d.system?.category === "Weapon Skills" && d.system.isCumulative === true).map(d => d.name);
  const sciCum = docs.filter(d => d.system?.category === "Scientific Skills" && d.system.isCumulative === true).map(d => d.name);
  const fightNot = docs.filter(d => d.system?.category === "Fighting Skills" && d.system.isCumulative !== true).map(d => d.name);
  recorder.assert(!weaponsCum.length && !sciCum.length && !fightNot.length,
    "Talents: Weapon and Scientific Talents don't stack; Fighting Talents do", { weaponsCum, sciCum, fightNot });
}

async function equipmentTests(recorder, state) {
  const net = (actor, dmg, damageType) => { resetFFRoundTracker(); return calculateMitigation(dmg, actor, { damageType })?.netDamage; };
  const actor = await createActor(state, "Gear", { items: [
    { name: "Cyber-Suit", type: "equipment", system: { category: "armor", broken: false } },
    power("Body Armor", { rank: "Excellent", value: 20, category: "bodyAlterationsDefensive", type: "Body Armor", isBodyArmor: true, bodyArmorType: "both", isDefensePower: true, armorNature: "artificial" }),
    power("Flight", { rank: "Good", value: 10, category: "movement", type: "Flight", isMovementPower: true, movement: { type: "flight" } })
  ] });
  const suit = item(actor, "Cyber-Suit");
  const armor = item(actor, "Body Armor");
  await linkPowerToEquipment(armor, suit);
  await linkPowerToEquipment(item(actor, "Flight"), suit);
  await syncDefenseEffects(actor, item(actor, "Body Armor"), false);
  await waitFor(() => getActiveDefenseEffects(actor).length, { timeout: 3000 });
  const baAe = () => actor.effects.find(e => e.flags?.[SYSTEM_ID]?.defenseType === "bodyArmor");

  recorder.assert(item(actor, "Body Armor").system.source === "equipment" && item(actor, "Body Armor").system.equipmentId === suit.id
    && item(actor, "Body Armor").system.equipmentName === "Cyber-Suit", "Equipment: linking sets Source Equipment, the item id and name");
  recorder.equal(powerGearState(item(actor, "Body Armor")).status, "ok", "Equipment: working item, power ok");
  recorder.equal(net(actor, 30, "physical-blunt"), 10, "Equipment: linked Excellent armor stops 20 (Blunt 30 net 10)");
  const gv = buildGrantedPowersView(item(actor, "Cyber-Suit"));
  recorder.assert(gv.rows.length === 2 && !gv.offCount, "Equipment sheet: Granted Powers lists both linked powers", gv);

  await item(actor, "Cyber-Suit").update({ "system.broken": true });
  await sleep(200);
  recorder.equal(powerGearState(item(actor, "Body Armor")).status, "broken", "Broken item: power reports broken");
  recorder.assert(baAe()?.isSuppressed === true && baAe()?.disabled === false, "Broken item: armor's defense effect is suppressed, not disabled",
    { suppressed: baAe()?.isSuppressed, disabled: baAe()?.disabled });
  recorder.equal(net(actor, 30, "physical-blunt"), 30, "Broken item: armor stops nothing (net 30)");
  recorder.equal(getBodyArmorValues(actor, "physical-blunt")?.physical ?? 0, 0, "Broken item: attack-dialog armor pre-calculation ignores it");
  const r = await route(actor, item(actor, "Flight"));
  recorder.assert(!r.dispatched.length && !r.window && !r.error, "Broken item: clicking Flight shows a notice instead of rolling", r);
  const gvb = buildGrantedPowersView(item(actor, "Cyber-Suit"));
  recorder.assert(gvb.offCount === 2 && gvb.offText.includes("Body Armor"), "Broken item: banner says 2 granted powers are off", gvb);
  const lv = buildLinkedEffectsView(item(actor, "Body Armor")).linked[0];
  recorder.assert(lv?.status === "Suppressed" && lv?.gear?.status === "broken" && lv?.gear?.name === "Cyber-Suit", "Broken item: Active Effects list says the Cyber-Suit is broken", lv);

  await item(actor, "Cyber-Suit").update({ "system.broken": false });
  await sleep(200);
  recorder.equal(net(actor, 30, "physical-blunt"), 10, "Repaired item: armor stops 20 again");

  await item(actor, "Cyber-Suit").delete();
  await sleep(200);
  const ev = buildEquipmentLinkView(item(actor, "Body Armor"));
  recorder.assert(ev.missing && ev.name === "Cyber-Suit" && ev.options[0]?.label === "Cyber-Suit (missing)", "Missing item: power warns and keeps the item's name", ev);
  recorder.equal(net(actor, 30, "physical-blunt"), 30, "Missing item: armor stops nothing");

  await unlinkPower(item(actor, "Body Armor"));
  await sleep(200);
  recorder.assert(powerGearState(item(actor, "Body Armor")).status === "ok" && net(actor, 30, "physical-blunt") === 10,
    "Not linked: the power works on its own again");

  // Sheets
  const [suit2] = await actor.createEmbeddedDocuments("Item", [{ name: "Jet Pack", type: "equipment", system: { category: "gear" } }]);
  await linkPowerToEquipment(item(actor, "Flight"), suit2);
  await suit2.sheet.render(true);
  const eqEl = await waitFor(() => suit2.sheet.element?.querySelector?.(".frp-granted") && suit2.sheet.element);
  recorder.assert(!!eqEl && eqEl.querySelectorAll(".frp-gp-row").length === 1 && !!eqEl.querySelector(".frp-gp-link"),
    "Equipment sheet: Granted Powers shows Flight with a Link control");
  await suit2.sheet.close();
  await actor.sheet.render(true);
  const asEl = await waitFor(() => actor.sheet.element?.querySelector?.(".power-origin-badge.gear") && actor.sheet.element);
  recorder.assert(!!asEl, "Character sheet: Flight shows the GEAR badge");
  await suit2.update({ "system.broken": true });
  await sleep(300);
  recorder.assert(!!actor.sheet.element?.querySelector?.(".power-row.power-gear-off .power-origin-badge.gear-off"),
    "Character sheet: broken Jet Pack dims Flight with GEAR: BROKEN");
  await actor.sheet.close();
  const flight = item(actor, "Flight");
  await flight.sheet.render(true);
  const psEl = await waitFor(() => flight.sheet.element?.querySelector?.('select[name="system.equipmentId"]') && flight.sheet.element);
  recorder.assert(!!psEl && psEl.querySelector('select[name="system.equipmentId"]').value === suit2.id && !!psEl.querySelector(".ps2-limit-warns"),
    "Edit Power sheet: From equipment shows the Jet Pack and the broken warning");
  await flight.sheet.close();

  // Migration of the old name-and-rank list: cleared into Notes, no power rows.
  const old = await createActor(state, "Old List", { items: [
    { name: "Power Gauntlet", type: "equipment", system: { category: "device", notes: "", powers: [{ name: "Gauntlet Blast", rank: "Remarkable", value: 30, grantedByEquipment: true }] } }
  ] });
  await migrateGrantedPowerLists();
  await sleep(200);
  const gauntlet = item(old, "Power Gauntlet");
  recorder.assert(!old.items.some(i => i.type === "power") && !(gauntlet.system.powers ?? []).length
    && String(gauntlet.system.notes).includes("Old granted powers: Gauntlet Blast (Remarkable)"),
    "Migration: old granted-power list is cleared into the item's Notes, no power added",
    { powers: old.items.filter(i => i.type === "power").map(i => i.name), notes: gauntlet.system.notes });

  // Lists saved as objects ("0": {...}) with a blank name, as on older actors.
  const obj = await createActor(state, "Old Object List", { items: [
    { name: "Helmet", type: "equipment", system: { category: "gear", notes: "", powers: { "0": { name: "", rank: "Remarkable", value: 30, damageType: "sensory", grantedByEquipment: "true" } } } }
  ] });
  await migrateGrantedPowerLists();
  await sleep(200);
  const helm = item(obj, "Helmet");
  recorder.assert(!obj.items.some(i => i.type === "power") && String(helm.system.notes).includes("Old granted powers: Helmet (Remarkable)"),
    "Migration: an object-shaped list with a blank name is noted under the item's own name", { notes: helm.system.notes });

  // Protected Senses: several senses; Blinding Touch only cares about sight.
  recorder.equal(protectedSensesOf({ protectedSenses: { sight: true, hearing: true } }).join(), "hearing,sight", "Protected Senses: covers hearing and sight");
  recorder.equal(protectedSensesOf({ protectedSense: "all" }).length, 5, "Protected Senses: legacy All covers every sense");

  // Armor equipment's own resistances list (no powers needed).
  const suitSys = { category: "armor", protection: "Typical", broken: false, resistances: [
    { type: "fireHeat", rank: "Excellent", value: 20, customLabel: "" },
    { type: "electricity", rank: "Incredible", value: 40, customLabel: "" }
  ] };
  const geared = await createActor(state, "Suit Only", { items: [{ name: "Body-Suit", type: "equipment", system: suitSys }] });
  recorder.equal(net(geared, 30, "energy-fire"), 10, "Armor equipment: Excellent fire/heat resistance on the suit stops 20 (fire 30 net 10)");
  recorder.equal(net(geared, 50, "energy-electricity"), 10, "Armor equipment: Incredible electricity resistance stops 40 (net 10)");
  recorder.equal(net(geared, 30, "physical-blunt"), 24, "Armor equipment: the suit's Typical protection still stops 6 (Blunt 30 net 24)");
  recorder.equal(net(geared, 30, "energy-cold"), 30, "Armor equipment: cold isn't listed, no reduction");
  await item(geared, "Body-Suit").update({ "system.broken": true });
  await sleep(150);
  recorder.equal(net(geared, 30, "energy-fire"), 30, "Armor equipment: a broken suit's resistances give nothing");
  const mixed = await createActor(state, "Suit Plus Power", { items: [
    { name: "Body-Suit", type: "equipment", system: { ...suitSys, broken: false } },
    power("Resistance to Cold", { rank: "Good", value: 10, category: "resistances", type: "Resistance to Cold", isDefensePower: true, isResistance: true, resistanceType: "cold", resistanceEffect: "damageReduction" })
  ] });
  await waitFor(() => getActiveDefenseEffects(mixed).length, { timeout: 3000 });
  recorder.equal(net(mixed, 30, "physical-blunt"), 24, "Armor equipment: still counts when the character also has a defense power (Blunt 30 net 24)");
  recorder.equal(net(mixed, 30, "energy-cold"), 20, "Armor equipment: a cold resistance power still works beside it (net 20)");
}

async function karmaLedgerTests(recorder, state) {
  const fresh = await createActor(state, "Ledger New", { system: { attributes: { karma: { value: 50 } } } });
  const h = fresh.system.karma?.history ?? [];
  recorder.assert(h.length === 1 && h[0].type === "Starting Karma" && h[0].amount === 50 && fresh.system.attributes.karma.value === 50,
    "Karma ledger: a character created with 50 Karma and no ledger gets Starting Karma 50", { history: h });

  const had = await createActor(state, "Ledger Existing", { system: {
    attributes: { karma: { value: 70 } },
    karma: { history: [{ timestamp: "", realDate: "", gameDate: "", amount: 70, type: "Award", description: "Existing" }] } } });
  const hh = had.system.karma?.history ?? [];
  recorder.assert(hh.length === 1 && hh[0].type === "Award", "Karma ledger: a character that already has a ledger is left alone", { history: hh });

  // A spend written straight to the history (as stunts and equipment do).
  await fresh.update({ "system.karma.history": [...h, { timestamp: "", realDate: "", gameDate: "", amount: -20, type: "Stunt", description: "Test spend" }] });
  await sleep(150);
  recorder.equal(fresh.system.attributes.karma.value, 30, "Karma ledger: a direct 20-Karma spend leaves 30, not 0");

  recorder.equal(startingKarmaHistory(fresh._source.system), null, "Karma ledger: startup check does nothing to a seeded ledger (no double entry)");
  recorder.equal(startingKarmaHistory({ attributes: { karma: { value: 50 } }, karma: { history: [{ amount: -10 }] } }), null,
    "Karma ledger: a ledger with spends but nothing earned is not changed (only reported)");
  const fromEmpty = startingKarmaHistory({ attributes: { karma: { value: 50 } }, karma: { history: [{ amount: 0, type: "Resources FEAT" }] } });
  recorder.assert(fromEmpty?.[0]?.amount === 50 && fromEmpty.length === 2, "Karma ledger: log-only entries still count as an empty ledger", { fromEmpty });
}

async function cleanupState(state, keepArtifacts) {
  if (keepArtifacts) return;
  for (const actor of state.actors.reverse()) { try { await actor.delete(); } catch (e) { console.warn("[FASERIP TEST] Actor cleanup failed", e); } }
}

function reportHtml(results) {
  const counts = results.reduce((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {});
  const rows = results.map(r => {
    const color = r.status === "PASS" ? "#2e7d32" : r.status === "SKIP" ? "#8a6d00" : "#b71c1c";
    const details = (r.status !== "PASS" && Object.keys(r.details ?? {}).length) ? `<div style="font-size:0.85em;color:#555;overflow-wrap:anywhere;">${foundry.utils.escapeHTML(JSON.stringify(r.details))}</div>` : "";
    return `<li style="margin:4px 0;"><strong style="color:${color};">${r.status}</strong> — ${foundry.utils.escapeHTML(r.name)}${details}</li>`;
  }).join("");
  return `<div style="border:2px solid #555;padding:10px;border-radius:5px;background:#fafafa;">
    <h3 style="margin:0 0 6px;">FASERIP Power Rules Runtime Tests</h3>
    <p style="margin:0 0 6px;"><strong>${counts.PASS ?? 0}</strong> passed, <strong>${counts.FAIL ?? 0}</strong> failed, <strong>${counts.SKIP ?? 0}</strong> skipped.</p>
    <ol style="margin:0;padding-left:22px;">${rows}</ol></div>`;
}

/**
 * Run the power rules suite.
 * @param {object} options
 * @param {boolean} [options.keepArtifacts=false] Keep the test actors for inspection.
 * @param {boolean} [options.postChat=true] Whisper a summary card to GMs.
 */
export async function runPowerRulesRuntimeTests({ keepArtifacts = false, postChat = true } = {}) {
  if (!game?.ready) throw new Error("Foundry must be fully ready before running tests.");
  if (!game.user?.isGM) throw new Error("Run the power rules runtime tests while logged in as a GM.");
  if (game.system?.id !== SYSTEM_ID) throw new Error(`Expected system ${SYSTEM_ID}, found ${game.system?.id}.`);

  const recorder = makeRecorder();
  const state = { actors: [] };
  console.group("FASERIP Power Rules Runtime Tests");
  const sections = [
    ["Presets", async () => presetTests(recorder)],
    ["Compendium", () => compendiumTests(recorder)],
    ["Routing", () => routingTests(recorder, state)],
    ["Damage and Shred", () => damageTests(recorder, state)],
    ["Limitations and sheet", () => sheetTests(recorder, state)],
    ["New power fields", () => newFieldTests(recorder, state)],
    ["Talents", () => talentTests(recorder)],
    ["Equipment powers", () => equipmentTests(recorder, state)],
    ["Karma ledger", () => karmaLedgerTests(recorder, state)]
  ];
  for (const [label, run] of sections) {
    try { await run(); }
    catch (error) {
      recorder.fail(`${label}: section completed without an exception`, { message: error?.message ?? String(error), stack: error?.stack });
      console.error(`[FASERIP TEST] ${label} aborted`, error);
    }
  }
  await cleanupState(state, keepArtifacts);
  console.table(recorder.results.map(({ status, name }) => ({ status, name })));
  console.groupEnd();

  const summary = {
    results: recorder.results,
    passed: recorder.results.filter(r => r.status === "PASS").length,
    failed: recorder.results.filter(r => r.status === "FAIL").length,
    skipped: recorder.results.filter(r => r.status === "SKIP").length
  };
  if (postChat) {
    try { await ChatMessage.create({ content: reportHtml(recorder.results), whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id) }); }
    catch (e) { console.warn("[FASERIP TEST] Could not post the chat report", e); }
  }
  ui.notifications.info(`Power rules tests: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped.`);
  return summary;
}
