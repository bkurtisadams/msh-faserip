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
    ["Limitations and sheet", () => sheetTests(recorder, state)]
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
