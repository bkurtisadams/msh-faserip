// scripts/dev/attack-dialog-runtime-tests.js v1.5.0 - 2026-11-11
// v1.5.0: Grenade throw dialog (compact layout). The dialog is checked and
//         then cancelled; a real throw needs a landing-zone click on the
//         canvas, so the blast itself is not exercised here.
// scripts/dev/attack-dialog-runtime-tests.js v1.4.0 - 2026-11-11
// v1.4.0: Charging and Shooting dialogs.
// scripts/dev/attack-dialog-runtime-tests.js v1.3.0 - 2026-11-11
// v1.3.0: Grappling, Grabbing and Escaping. These resolve themselves (roll,
//         card, hold effects), so they run for real against the throwaway
//         actors with Skip dice ticked; their result cards are captured
//         instead of posted.
// scripts/dev/attack-dialog-runtime-tests.js v1.2.0 - 2026-11-11
// v1.2.0: Blunt and Edged melee dialogs; broken armor no longer protects;
//         thrown dropdown shows computed damage.
// scripts/dev/attack-dialog-runtime-tests.js v1.1.0 - 2026-11-11
// v1.1.0: Throwing Blunt: listed-minimum damage ruling (2026-11-11) and the
//         Bullseye labels.
// scripts/dev/attack-dialog-runtime-tests.js v1.0.1 - 2026-11-11
// v1.0.1: The Energy Generation cap check expected a computed display of
//         inline-flex; a browser reports flex for a child of a flex row.
//         It now asserts the controls are not hidden.
// Foundry VTT runtime suite for the shared attack dialogs (Energy, Force,
// Throwing Edged, Throwing Blunt). It builds a throwaway attacker and two
// targets with tokens on the current scene, opens each real dialog, drives
// its controls and presses Roll, then asserts what the dialog shows, what it
// saves and what it hands to _executeSingleAttack. The hand-off is captured,
// so no dice roll, no chat card is posted and no damage is applied; the
// to-hit, armor and damage steps in attack-action.js are not covered here.
// Same shape as initiative-runtime-tests.js; launch via
// macros/run-attack-dialog-runtime-tests.js as a GM viewing a scene.

import { EnergyAction } from "../modules/actions/energy-action.js";
import { ForceAction } from "../modules/actions/force-action.js";
import { ThrowingEdgedAction } from "../modules/actions/throwing-edged-action.js";
import { ThrowingBluntAction } from "../modules/actions/throwing-blunt-action.js";
import { BluntAttackAction } from "../modules/actions/blunt-attack-action.js";
import { EdgedAttackAction } from "../modules/actions/edged-attack-action.js";
import { GrapplingAction } from "../modules/actions/grappling-action.js";
import { GrabbingAction } from "../modules/actions/grabbing-action.js";
import { EscapingAction } from "../modules/actions/escaping-action.js";
import { ChargingAction } from "../modules/actions/charging-action.js";
import { ShootingAction } from "../modules/actions/shooting-action.js";
import { GrenadeAction } from "../modules/actions/grenade-action.js";
import { getBodyArmorValues } from "../modules/actions/action-utils.js";
import { getAvailableKarma } from "../modules/dice/dice-roller.js";

const SYSTEM_ID = "msh-faserip";
const TEST_PREFIX = "ZZZ Attack Dialog Runtime";
const DEFAULT_TIMEOUT = 6000;
const DIALOG_WIDTH = 360;
const PREF_KEYS = ["energy", "force", "te", "tb", "ba", "ea", "charging", "shooting", "grenade"].flatMap(k => [`msh.${k}.remember`, `msh.${k}.skipDice`]);

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

function getScene() { return canvas?.scene ?? null; }

const power = (name, system) => ({ name, type: "power", system });
const weapon = (name, system) => ({ name, type: "equipment", system: { category: "weapon", weaponType: "thrown", ...system } });

const ATTACKER_ITEMS = [
  power("Energy Blast", { rank: "Incredible", value: 40, category: "energyControl", type: "energy", range: "rank" }),
  power("Energy Generation", { rank: "Amazing", value: 50, category: "energyControl", type: "Energy Generation", range: "rank" }),
  power("Corrosive Missile", { rank: "Remarkable", value: 30, isEnergyAttack: true, damageType: "corrosive", range: "rank" }),
  power("Force Bolt", { rank: "Unearthly", value: 100, isForceAttack: true, range: "rank" }),
  power("Slashing Missile", { rank: "Remarkable", value: 30, type: "Slashing Missile", range: "rank" }),
  weapon("Test Shuriken", { damageType: "EA", damage: "10", materialStrength: "Excellent", armorPiercingCS: 1 }),
  weapon("Test Club", { damageType: "BA", damage: "10", materialStrength: "Good" }),
  weapon("Test Mace", { damageType: "BA", damage: "15", materialStrength: "Good" }),
  weapon("Test Rock", { damageType: "TB", damage: "0", materialStrength: "Typical" }),
  weapon("Test Girder", { damageType: "TB", damage: "0", materialStrength: "Remarkable" }),
  { name: "Test Grenade", type: "equipment", system: { category: "other", weaponType: "grenade", damage: "30", damageType: "EA", areaRadius: 1, shots: "3", shotsRemaining: 3 } },
  { name: "Test Pistol", type: "equipment", system: { category: "weapon", weaponType: "shooting", damageType: "S", damage: "10", range: "5", shots: "6", shotsRemaining: 6, rate: "1", materialStrength: "Good" } }
];

async function createCombatant(state, name, { x, y, disposition, system = {}, items = [] }) {
  const ActorClass = Actor.implementation ?? Actor;
  const actor = await ActorClass.create({
    name: `${TEST_PREFIX} - ${name} - ${Date.now()}`,
    type: "hero",
    system,
    items,
    prototypeToken: { disposition, actorLink: true }
  });
  if (!actor) throw new Error(`Actor creation failed for ${name}`);
  state.actors.push(actor);
  const td = await actor.getTokenDocument({ x, y, disposition, actorLink: true });
  const [token] = await getScene().createEmbeddedDocuments("Token", [td.toObject()]);
  state.tokens.push(token);
  return { actor, token };
}

function targetIds() { return Array.from(game.user?.targets ?? []).map(t => t.id); }

async function setTargets(tokenDocs) {
  const ids = tokenDocs.map(t => t.id);
  try {
    if (typeof canvas.tokens?.setTargets !== "function") throw new Error("no setTargets");
    canvas.tokens.setTargets(ids, { mode: "replace" });
  } catch (_) {
    for (const t of Array.from(game.user.targets)) t.setTarget(false, { releaseOthers: false });
    tokenDocs.forEach((t, i) => t.object?.setTarget(true, { releaseOthers: i === 0 }));
  }
  return !!(await waitFor(() => {
    const now = targetIds();
    return now.length === ids.length && ids.every(id => now.includes(id));
  }, { timeout: 2000 }));
}

const setVal = ($html, sel, v) => $html.find(sel).val(v).trigger("input").trigger("change");
const setChk = ($html, sel, on) => {
  const $e = $html.find(sel);
  if ($e.length && !$e.prop("disabled") && $e.prop("checked") !== on) $e.prop("checked", on).trigger("change");
};
const optionValue = ($html, sel, text) => $html.find(`${sel} option`).filter((i, o) => o.textContent.includes(text)).attr("value");
const openDialogEl = () => document.querySelector(".frp-dlg");

// Opens one real dialog, hands a driver the live DOM, and returns what the
// dialog resolved with. The attack hand-off, notifications and actor writes
// are captured for the driver's assertions.
async function withDialog(recorder, label, ActionClass, { actor, actionType, abilityName = "agility", opts = {}, captureChat = false }, drive) {
  if (openDialogEl()) {
    recorder.fail(`${label}: no other attack dialog is open`);
    return null;
  }
  const action = new ActionClass({ actor, actionType, abilityName, opts: { ...opts } });
  const ctx = { exec: null, notes: [], chat: [], writes: 0, ret: undefined, error: null, settled: false };
  action._executeSingleAttack = async (args) => { ctx.exec = args; };

  const original = {};
  for (const level of ["info", "warn", "error"]) {
    original[level] = ui.notifications[level];
    ui.notifications[level] = (message) => { ctx.notes.push({ level, message: String(message) }); };
  }
  const hookId = Hooks.on("updateActor", (doc) => { if (doc.id === actor.id) ctx.writes++; });
  const chatClass = globalThis.ChatMessage;
  const hadOwnCreate = Object.prototype.hasOwnProperty.call(chatClass, "create");
  const originalCreate = chatClass.create;
  if (captureChat) chatClass.create = async (data) => { ctx.chat.push(String(data?.content ?? "")); return {}; };

  const done = action.execute().then(
    (ret) => { ctx.ret = ret; ctx.settled = true; },
    (error) => { ctx.error = error; ctx.settled = true; }
  );

  try {
    const el = await waitFor(openDialogEl);
    if (!el) {
      recorder.fail(`${label}: dialog opened`, { error: ctx.error?.message });
      return ctx;
    }
    const wired = await waitFor(() => $._data(el.querySelector("#frp-cancel"), "events")?.click?.length);
    if (!wired) {
      recorder.fail(`${label}: dialog controls wired`);
      return ctx;
    }
    ctx.$html = $(el).parent();
    ctx.app = Array.from(foundry.applications.instances.values()).find(a => a.element?.contains?.(el)) ?? null;
    ctx.width = () => ctx.app?.position?.width;
    ctx.roll = async () => {
      const writesBefore = ctx.writes;
      ctx.notes.length = 0;
      ctx.$html.find("#frp-roll").trigger("click");
      await waitFor(() => ctx.settled || ctx.notes.some(n => n.level !== "info"), { timeout: 3000 });
      await sleep(50);
      return { rolled: ctx.settled && !!ctx.exec, writes: ctx.writes - writesBefore };
    };
    await drive(ctx);
  } catch (error) {
    recorder.fail(`${label}: driver completed without an exception`, { message: error?.message ?? String(error), stack: error?.stack });
  } finally {
    if (!ctx.settled) {
      try { ctx.$html?.find("#frp-cancel").trigger("click"); } catch (_) { /* fall through */ }
      await Promise.race([done, sleep(1500)]);
      if (!ctx.settled) { try { await ctx.app?.close?.(); } catch (_) { /* noop */ } await Promise.race([done, sleep(1500)]); }
    }
    await waitFor(() => !openDialogEl(), { timeout: 2000 });
    Hooks.off("updateActor", hookId);
    if (captureChat) {
      if (hadOwnCreate) chatClass.create = originalCreate;
      else delete chatClass.create;
    }
    for (const level of ["info", "warn", "error"]) ui.notifications[level] = original[level];
  }
  return ctx;
}

async function energyTests(recorder, { attacker, targetA }) {
  const actor = attacker.actor;
  const blastId = actor.items.getName("Energy Blast").id;
  const base = { actor, actionType: "energy" };
  await setTargets([targetA.token]);

  await withDialog(recorder, "Energy", EnergyAction, base, async (d) => {
    const { $html } = d;
    recorder.equal(d.width(), DIALOG_WIDTH, "Energy: dialog opens at its pinned width");
    setChk($html, "#msh-remember-settings", true);
    setVal($html, "#power-source-select", `power:${blastId}`);
    recorder.equal($html.find("#dmg-val").text(), "40", "Energy: Energy Blast shows its rank damage");
    recorder.equal($html.find(".result-cap-controls").css("display"), "none", "Energy: no result cap offered for an ordinary energy power");
    setVal($html, '[name="range"]', 2);
    setChk($html, "#pwr-hit-toggle", true);
    setChk($html, "#multi-enabled", true);
    setChk($html, "#magical-enabled", true);
    setChk($html, "#multi-enabled", false);
    setChk($html, "#blindside-attack", true);
    recorder.equal(d.width(), DIALOG_WIDTH, "Energy: width holds after toggling options");
    const r = await d.roll();
    recorder.assert(r.rolled, "Energy: Roll hands the attack off", { notes: d.notes });
    recorder.equal(r.writes, 1, "Energy: Remember flags saved in one actor update");
    const c = d.exec?.choice ?? {};
    recorder.assert(c.powerId === blastId && c.usePowerToHit === true && c.range === 2 && c.blindside === true && c.isMagic === true,
      "Energy: choice carries power, PwrHit, range, Blindside and Magical", { powerId: c.powerId, usePowerToHit: c.usePowerToHit, range: c.range, blindside: c.blindside, isMagic: c.isMagic });
    recorder.assert(d.exec?.ability?.name === "Power" && d.exec?.ability?.rank === "Incredible" && d.exec?.ability?.value === 40,
      "Energy: PwrHit passes the power rank and its number", d.exec?.ability);
    recorder.assert(d.exec?.damageType === "energy-generic" && d.exec?.rawDamage === 40, "Energy: damage type and raw damage", { damageType: d.exec?.damageType, rawDamage: d.exec?.rawDamage });
  });

  await withDialog(recorder, "Energy reopen", EnergyAction, base, async (d) => {
    const { $html } = d;
    recorder.assert($html.find("#msh-remember-settings").prop("checked"), "Energy reopen: Remember still ticked");
    recorder.equal($html.find("#power-source-select").val(), `power:${blastId}`, "Energy reopen: power restored");
    recorder.equal(actor.getFlag(SYSTEM_ID, "lastEnergyRange"), 2, "Energy reopen: range was saved (the field itself refills from token distance)");
    recorder.assert($html.find("#pwr-hit-toggle").prop("checked"), "Energy reopen: PwrHit restored");
    recorder.assert($html.find("#magical-enabled").prop("checked") && !$html.find("#multi-enabled").prop("checked"), "Energy reopen: Magical on, Multi off");

    setVal($html, "#power-source-select", optionValue($html, "#power-source-select", "Energy Generation"));
    const capDisplay = $html.find(".result-cap-controls").css("display");
    recorder.assert(!!capDisplay && capDisplay !== "none", "Energy Generation: result cap radios appear", { display: capDisplay });
    setChk($html, "#reduce-damage-enabled", true);
    setVal($html, '[name="reducedDamage"]', 5);
    $html.find('[name="resultCap"][value="yellow"]').prop("checked", true).trigger("change");
    const r = await d.roll();
    const c = d.exec?.choice ?? {};
    recorder.assert(r.rolled && c.reduceDamageEnabled === true && c.reducedDamage === 5 && c.resultCap === "yellow" && c.freeEffectReduction === true && d.exec?.rawDamage === 5,
      "Energy Generation: Reduce to 5 with a free yellow cap reaches the attack", { reduceDamageEnabled: c.reduceDamageEnabled, reducedDamage: c.reducedDamage, resultCap: c.resultCap, freeEffectReduction: c.freeEffectReduction, rawDamage: d.exec?.rawDamage });
  });

  await withDialog(recorder, "Energy corrosive", EnergyAction, base, async (d) => {
    const { $html } = d;
    setVal($html, "#power-source-select", optionValue($html, "#power-source-select", "Corrosive Missile"));
    recorder.assert($html.find("#reduce-damage-enabled").prop("disabled") && !$html.find("#reduce-damage-enabled").prop("checked") && $html.find('[name="reducedDamage"]').prop("disabled"),
      "Corrosive: Reduce is locked off");
    recorder.equal($html.find(".effect-note").text(), "Corrosive: damage cannot be reduced", "Corrosive: note explains the lock");
    const r = await d.roll();
    const c = d.exec?.choice ?? {};
    recorder.assert(r.rolled && d.exec?.damageType === "corrosive" && c.bypassForceField === true && c.reduceDamageEnabled === false && d.exec?.rawDamage === 30,
      "Corrosive: full damage, corrosive type, Force Field bypass", { damageType: d.exec?.damageType, bypassForceField: c.bypassForceField, rawDamage: d.exec?.rawDamage });
  });

  const cancelled = await withDialog(recorder, "Energy cancel", EnergyAction, base, async (d) => {
    d.$html.find("#frp-cancel").trigger("click");
    await waitFor(() => d.settled, { timeout: 2000 });
  });
  recorder.assert(cancelled?.ret?.rawActionCancelled === true && !cancelled?.exec, "Energy: Cancel reports cancellation and attacks nothing", { ret: cancelled?.ret });
}

async function forceTests(recorder, { attacker, targetA, targetB }) {
  const actor = attacker.actor;
  const boltId = actor.items.getName("Force Bolt").id;
  const base = { actor, actionType: "force" };

  await setTargets([targetA.token]);
  await withDialog(recorder, "Force", ForceAction, base, async (d) => {
    const { $html } = d;
    setChk($html, "#msh-remember-settings", true);
    setVal($html, "#power-source-select", `power:${boltId}`);
    setVal($html, '[name="range"]', 3);
    setChk($html, "#pwr-hit-toggle", true);
    setChk($html, "#pull-punch-enabled", true);
    setVal($html, '[name="pulledDamage"]', 12);
    recorder.equal(d.width(), DIALOG_WIDTH, "Force: width holds after toggling options");
    const r = await d.roll();
    recorder.assert(r.rolled, "Force: Roll hands the attack off", { notes: d.notes });
    recorder.equal(r.writes, 1, "Force: Remember flags saved in one actor update");
    recorder.assert(d.exec?.ability?.name === "Power" && d.exec?.ability?.rank === "Unearthly" && d.exec?.ability?.value === 100,
      "Force: PwrHit passes the power rank's real number (was always 30)", d.exec?.ability);
    recorder.assert(d.exec?.damageType === "physical-force" && d.exec?.rawDamage === 12 && d.exec?.choice?.pulledDamage === 12,
      "Force: Reduce to 12 reaches the attack", { damageType: d.exec?.damageType, rawDamage: d.exec?.rawDamage });
  });

  await withDialog(recorder, "Force reopen", ForceAction, base, async (d) => {
    const { $html } = d;
    recorder.equal($html.find("#power-source-select").val(), `power:${boltId}`, "Force reopen: power restored");
    recorder.equal(actor.getFlag(SYSTEM_ID, "lastForceRange"), 3, "Force reopen: range was saved (the field itself refills from token distance)");
    recorder.assert($html.find("#pwr-hit-toggle").prop("checked"), "Force reopen: PwrHit restored");
    recorder.assert($html.find("#pull-punch-enabled").prop("checked") && String($html.find('[name="pulledDamage"]').val()) === "12", "Force reopen: Reduce restored at 12",
      { checked: $html.find("#pull-punch-enabled").prop("checked"), value: $html.find('[name="pulledDamage"]').val() });
  });

  const twoTargets = await setTargets([targetA.token, targetB.token]);
  if (!twoTargets) {
    recorder.skip("Force: multi-target guard", { reason: "could not target two tokens" });
  } else {
    await withDialog(recorder, "Force multi", ForceAction, base, async (d) => {
      const { $html } = d;
      setChk($html, "#multi-enabled", false);
      const refused = await d.roll();
      recorder.assert(!refused.rolled && !d.settled && d.notes.some(n => n.level === "warn" && /Multiple targets/.test(n.message)),
        "Force: two targets with Multi unticked is refused and the dialog stays open", { notes: d.notes });
      setChk($html, "#multi-enabled", true);
      const r = await d.roll();
      recorder.assert(r.rolled && d.exec?.targetCount === 2 && d.exec?.choice?.shiftBreakdown?.adjacent === -4,
        "Force: with Multi ticked both targets are attacked at -4CS", { targetCount: d.exec?.targetCount, shiftBreakdown: d.exec?.choice?.shiftBreakdown });
    });
  }
  await setTargets([targetA.token]);
}

async function thrownEdgedTests(recorder, { attacker, targetA }) {
  const actor = attacker.actor;
  const shurikenId = actor.items.getName("Test Shuriken").id;
  const missileId = actor.items.getName("Slashing Missile").id;
  const base = { actor, actionType: "throwing-edged" };
  await setTargets([targetA.token]);
  const karma = getAvailableKarma(actor);

  await withDialog(recorder, "Throwing Edged", ThrowingEdgedAction, base, async (d) => {
    const { $html } = d;
    recorder.equal(d.width(), DIALOG_WIDTH, "Throwing Edged: dialog opens at its pinned width");
    $html.find('[name="src"][value="carried"]').prop("checked", true).trigger("change");
    setVal($html, "#damage-source-select", shurikenId);
    recorder.assert($html.find(`#damage-source-select option[value="${shurikenId}"]`).text().includes("[AP 1CS]"), "Throwing Edged: dropdown labels the Shuriken's armor piercing");
    recorder.assert($html.find(`#damage-source-select option[value="${missileId}"]`).text().includes("30 dmg"), "Throwing Edged: dropdown shows a power's computed damage",
      { label: $html.find(`#damage-source-select option[value="${missileId}"]`).text() });
    recorder.assert($html.find("#ap-display").css("display") !== "none" && $html.find("#ap-val").text() === "1CS", "Throwing Edged: AP line shows 1CS");
    recorder.equal($html.find("#after-armor-display").text(), "4 after armor", "Throwing Edged: preview drops Good armor to Typical (10 - 6 = 4)");

    setVal($html, "#damage-source-select", missileId);
    recorder.assert($html.find("#pull-punch-enabled").prop("disabled") && $html.find("#pull-effect-enabled").prop("disabled") && $html.find('[name="resultCap"]').prop("disabled"),
      "Slashing Missile: Pull and Effect are both locked");
    setVal($html, "#damage-source-select", shurikenId);
    recorder.assert(!$html.find("#pull-punch-enabled").prop("disabled"), "Throwing Edged: Pull unlocks again for the Shuriken");

    setVal($html, '[name="range"]', 99);
    const refused = await d.roll();
    recorder.assert(!refused.rolled && !d.settled && d.notes.some(n => n.level === "error" && /beyond throwing range/.test(n.message)),
      "Throwing Edged: a target beyond throwing range is refused", { notes: d.notes });
    recorder.equal($html.find("#range-penalty-display").text(), "OUT OF RANGE", "Throwing Edged: range box says OUT OF RANGE");
    setVal($html, '[name="range"]', 1);

    if (karma < 50) {
      recorder.skip("Throwing Edged: paid Effect cap", { reason: "test actor has under 50 Karma", karma });
    } else {
      recorder.assert(!$html.find("#pull-effect-enabled").prop("disabled"), "Throwing Edged: Effect cap is offered with 50+ Karma", { karma });
      setChk($html, "#pull-effect-enabled", true);
      setVal($html, '[name="resultCap"]', "yellow");
    }
    setChk($html, "#blindside-attack", true);
    recorder.equal(d.width(), DIALOG_WIDTH, "Throwing Edged: width holds after toggling options");
    const r = await d.roll();
    const c = d.exec?.choice ?? {};
    recorder.assert(r.rolled && c.weaponId === shurikenId && c.armorPiercingCS === 1 && c.damageType === "physical-edged" && c.blindside === true && d.exec?.rawDamage === 10,
      "Throwing Edged: weapon, AP 1CS, damage type and Blindside reach the attack", { weaponId: c.weaponId, armorPiercingCS: c.armorPiercingCS, damageType: c.damageType, rawDamage: d.exec?.rawDamage });
    if (karma >= 50) recorder.equal(c.resultCap, "yellow", "Throwing Edged: paid Effect cap reaches the attack");
  });
}

async function thrownBluntTests(recorder, { attacker, targetA }) {
  const actor = attacker.actor;
  const clubId = actor.items.getName("Test Club").id;
  const base = { actor, actionType: "throwing-blunt" };
  await setTargets([targetA.token]);

  await withDialog(recorder, "Throwing Blunt", ThrowingBluntAction, base, async (d) => {
    const { $html } = d;
    setChk($html, "#msh-remember-settings", true);
    $html.find('[name="src"][value="carried"]').prop("checked", true).trigger("change");
    setVal($html, "#damage-source-select", clubId);
    recorder.equal($html.find("#after-armor-display").text(), "0 after armor", "Throwing Blunt: preview shows Good armor stopping 10 damage");
    const dmgFor = (name) => { setVal($html, "#damage-source-select", actor.items.getName(name).id); return $html.find("#dmg-val").text(); };
    recorder.equal(dmgFor("Test Mace"), "15", "Throwing Blunt: a listed weapon keeps its listed minimum (15 at Good Strength)");
    recorder.equal(dmgFor("Test Rock"), "6", "Throwing Blunt: an improvised object is capped by its material (Typical 6)");
    recorder.equal(dmgFor("Test Girder"), "10", "Throwing Blunt: an improvised object is capped by Strength (Good 10)");
    setVal($html, "#damage-source-select", clubId);
    recorder.equal($html.find(".frp-fx-cell.y").text(), "Bullseye", "Throwing Blunt: effect grid names yellow Bullseye");
    recorder.equal($html.find('[name="resultCap"] option[value="yellow"]').text(), "Bullseye", "Throwing Blunt: yellow Cap is labelled Bullseye");
    recorder.assert($html.find('[name="resultCap"]').prop("disabled"), "Throwing Blunt: Cap is disabled until Pull is ticked");
    setChk($html, "#pull-punch-enabled", true);
    setVal($html, '[name="pulledDamage"]', 3);
    setVal($html, '[name="resultCap"]', "yellow");
    setVal($html, '[name="range"]', 1);
    recorder.equal(d.width(), DIALOG_WIDTH, "Throwing Blunt: width holds after toggling options");
    const r = await d.roll();
    const c = d.exec?.choice ?? {};
    recorder.assert(r.rolled && c.weaponId === clubId && c.pulledDamage === 3 && c.resultCap === "yellow" && d.exec?.damageType === "physical-blunt",
      "Throwing Blunt: Pull to 3 with a yellow Cap reaches the attack", { weaponId: c.weaponId, pulledDamage: c.pulledDamage, resultCap: c.resultCap, notes: d.notes });
    recorder.equal(r.writes, 1, "Throwing Blunt: Remember flags saved in one actor update (was 11)");
  });

  await withDialog(recorder, "Throwing Blunt reopen", ThrowingBluntAction, base, async (d) => {
    const { $html } = d;
    recorder.equal($html.find("#damage-source-select").val(), clubId, "Throwing Blunt reopen: weapon restored");
    recorder.assert($html.find("#pull-punch-enabled").prop("checked") && String($html.find('[name="pulledDamage"]').val()) === "3" && $html.find('[name="resultCap"]').val() === "yellow",
      "Throwing Blunt reopen: Pull 3 and yellow Cap restored", { pull: $html.find("#pull-punch-enabled").prop("checked"), value: $html.find('[name="pulledDamage"]').val(), cap: $html.find('[name="resultCap"]').val() });

    $html.find('[name="src"][value="adhoc"]').prop("checked", true).trigger("change");
    setVal($html, '[name="adhocDamage"]', -4);
    setVal($html, '[name="range"]', 1);
    const refused = await d.roll();
    recorder.assert(!refused.rolled && !d.settled && d.notes.some(n => n.level === "error" && /non-negative damage/.test(n.message)),
      "Throwing Blunt: a negative ad-hoc damage is refused", { notes: d.notes });
  });
}

async function meleeTests(recorder, { attacker, targetA, targetB }) {
  const actor = attacker.actor;
  const clubId = actor.items.getName("Test Club").id;
  const shurikenId = actor.items.getName("Test Shuriken").id;
  const karma = getAvailableKarma(actor);
  await setTargets([targetA.token]);

  const blunt = { actor, actionType: "blunt-attack", abilityName: "fighting" };
  await withDialog(recorder, "Blunt Attack", BluntAttackAction, blunt, async (d) => {
    const { $html } = d;
    recorder.equal(d.width(), DIALOG_WIDTH, "Blunt Attack: dialog opens at its pinned width");
    recorder.assert($html.find(".h-stat-label").text() === "Base Fighting:" && $html.find(".h-stat-rank").text() === "Rm 30", "Blunt Attack: header shows Fighting Rm 30",
      { label: $html.find(".h-stat-label").text(), rank: $html.find(".h-stat-rank").text() });
    setChk($html, "#msh-remember-settings", true);
    setVal($html, "#damage-source-select", `weapon:${clubId}`);
    recorder.equal($html.find("#dmg-val").text(), "10", "Blunt Attack: Club damage at Good Strength");
    recorder.equal($html.find(".frp-fx-cell.y").text(), "Slam", "Blunt Attack: effect grid names yellow Slam");
    setChk($html, "#blindside-attack", true);
    recorder.equal(d.width(), DIALOG_WIDTH, "Blunt Attack: width holds after toggling options");
    const r = await d.roll();
    const c = d.exec?.choice ?? {};
    recorder.assert(r.rolled && c.src === "weapon" && c.itemId === clubId && c.blindside === true && d.exec?.damageType === "physical-blunt" && d.exec?.rawDamage === 10 && d.exec?.attackForm === "blunt",
      "Blunt Attack: weapon, Blindside, damage and type reach the attack", { src: c.src, itemId: c.itemId, blindside: c.blindside, damageType: d.exec?.damageType, rawDamage: d.exec?.rawDamage, notes: d.notes });
    recorder.equal(r.writes, 1, "Blunt Attack: Remember flags saved in one actor update");
  });
  await withDialog(recorder, "Blunt Attack reopen", BluntAttackAction, blunt, async (d) => {
    const { $html } = d;
    recorder.assert($html.find("#msh-remember-settings").prop("checked") && $html.find("#damage-source-select").val() === `weapon:${clubId}`,
      "Blunt Attack reopen: Remember ticked and weapon restored", { value: $html.find("#damage-source-select").val() });
    const e = $.Event("keydown"); e.key = "Enter";
    $html.closest(".dialog").trigger(e);
    await waitFor(() => d.settled, { timeout: 3000 });
    recorder.assert(d.settled && !!d.exec, "Blunt Attack: Enter rolls the attack");
  });

  const edged = { actor, actionType: "edged-attack", abilityName: "fighting" };
  await withDialog(recorder, "Edged Attack", EdgedAttackAction, edged, async (d) => {
    const { $html } = d;
    recorder.equal(d.width(), DIALOG_WIDTH, "Edged Attack: dialog opens at its pinned width");
    setChk($html, "#msh-remember-settings", true);
    setVal($html, "#damage-source-select", `weapon:${shurikenId}`);
    recorder.equal($html.find("#dmg-val").text(), "10", "Edged Attack: weapon damage");
    recorder.assert($html.find("#ap-display").css("display") !== "none" && $html.find("#ap-val").text() === "1CS", "Edged Attack: AP line shows 1CS");
    recorder.equal($html.find("#after-armor-display").text(), "4 after armor", "Edged Attack: preview drops Good armor to Typical (10 - 6 = 4)");
    if (karma < 50) {
      recorder.skip("Edged Attack: paid result cap", { reason: "test actor has under 50 Karma", karma });
    } else {
      recorder.assert(!$html.find("#pull-effect-enabled").prop("disabled"), "Edged Attack: paid result cap is offered with 50+ Karma");
      setChk($html, "#pull-effect-enabled", true);
      setVal($html, '[name="resultCap"]', "green");
    }
    recorder.equal(d.width(), DIALOG_WIDTH, "Edged Attack: width holds after toggling options");
    const r = await d.roll();
    const c = d.exec?.choice ?? {};
    recorder.assert(r.rolled && c.src === "weapon" && c.itemId === shurikenId && c.armorPiercingCS === 1 && d.exec?.damageType === "physical-edged" && d.exec?.rawDamage === 10,
      "Edged Attack: weapon, AP 1CS, damage and type reach the attack", { src: c.src, itemId: c.itemId, armorPiercingCS: c.armorPiercingCS, damageType: d.exec?.damageType, rawDamage: d.exec?.rawDamage, notes: d.notes });
    if (karma >= 50) recorder.equal(c.resultCap, "green", "Edged Attack: paid result cap reaches the attack");
    recorder.equal(r.writes, 1, "Edged Attack: Remember flags saved in one actor update");
  });
  await withDialog(recorder, "Edged Attack reopen", EdgedAttackAction, edged, async (d) => {
    const { $html } = d;
    recorder.assert($html.find("#damage-source-select").val() === `weapon:${shurikenId}` && (karma < 50 || $html.find("#pull-effect-enabled").prop("checked")),
      "Edged Attack reopen: weapon and result cap restored", { value: $html.find("#damage-source-select").val(), cap: $html.find("#pull-effect-enabled").prop("checked") });
  });

  recorder.equal(getBodyArmorValues(targetA.actor, "physical-edged")?.applicable, 10, "Armor: an intact Good Body Armor counts as 10");
  recorder.equal(getBodyArmorValues(targetB.actor, "physical-edged")?.applicable, 0, "Armor: an armor item marked broken gives no protection");
}

async function chargingAndShootingTests(recorder, { attacker, targetA }) {
  const actor = attacker.actor;
  await setTargets([targetA.token]);
  const karma = getAvailableKarma(actor);

  await withDialog(recorder, "Charging", ChargingAction, { actor, actionType: "charging", abilityName: "endurance" }, async (d) => {
    const { $html } = d;
    recorder.equal(d.width(), DIALOG_WIDTH, "Charging: dialog opens at its pinned width");
    recorder.assert($html.find(".h-stat-label").text() === "Base Endurance" && $html.find(".h-verb").text() === "charges", "Charging: header reads Base Endurance ... charges",
      { label: $html.find(".h-stat-label").text(), verb: $html.find(".h-verb").text() });
    recorder.equal($html.find(".frp-fx-cell").length, 4, "Charging: effect grid has four cells");
    setChk($html, "#msh-remember-settings", true);
    setChk($html, "#blindside-attack", true);
    recorder.equal(d.width(), DIALOG_WIDTH, "Charging: width holds after toggling options");
    const r = await d.roll();
    recorder.assert(r.rolled && d.exec?.attackForm === "charging" && d.exec?.damageType === "physical-charging" && d.exec?.choice?.blindside === true,
      "Charging: the charge and Blindside reach the attack", { attackForm: d.exec?.attackForm, damageType: d.exec?.damageType, blindside: d.exec?.choice?.blindside, notes: d.notes });
    recorder.equal(r.writes, 1, "Charging: Remember flags saved in one actor update");
  });

  const pistolId = actor.items.getName("Test Pistol").id;
  await withDialog(recorder, "Shooting", ShootingAction, { actor, actionType: "shooting", abilityName: "agility" }, async (d) => {
    const { $html } = d;
    recorder.equal(d.width(), DIALOG_WIDTH, "Shooting: dialog opens at its pinned width");
    recorder.equal($html.find(".h-stat-label").text(), "Base Agility:", "Shooting: header reads Base Agility");
    setVal($html, "#damage-source-select", optionValue($html, "#damage-source-select", "Test Pistol"));
    recorder.equal($html.find("#dmg-val").text(), "10", "Shooting: pistol damage");
    recorder.equal($html.find(".frp-fx-cell.y").text(), "Bullseye", "Shooting: effect grid names yellow Bullseye");
    recorder.equal($html.find('[name="resultCap"] option[value="yellow"]').text(), "Cap at Bullseye", "Shooting: yellow result cap is labelled Bullseye");
    setChk($html, "#msh-remember-settings", true);
    setChk($html, "#aim-enabled", true);
    recorder.assert(!$html.find('[name="aimMode"]').prop("disabled"), "Shooting: ticking Aim enables the aim mode");
    setVal($html, '[name="aimMode"]', "neutralize");
    if (karma >= 50) {
      setChk($html, "#pull-effect-enabled", true);
      recorder.assert(!$html.find('[name="resultCap"]').prop("disabled"), "Shooting: ticking the paid cap enables its select");
      setVal($html, '[name="resultCap"]', "green");
    }
    setVal($html, '[name="range"]', 1);
    recorder.equal(d.width(), DIALOG_WIDTH, "Shooting: width holds after toggling options");
    const r = await d.roll();
    const c = d.exec?.choice ?? {};
    recorder.assert(r.rolled && d.exec?.attackForm === "shooting" && d.exec?.rawDamage === 10 && c.aimMode === "neutralize" && (karma < 50 || c.resultCap === "green"),
      "Shooting: weapon damage, Aim and paid cap reach the attack", { attackForm: d.exec?.attackForm, rawDamage: d.exec?.rawDamage, aimMode: c.aimMode, resultCap: c.resultCap, notes: d.notes });
    recorder.equal(r.writes, 1, "Shooting: Remember flags saved in one actor update");
  });
  await withDialog(recorder, "Shooting reopen", ShootingAction, { actor, actionType: "shooting", abilityName: "agility" }, async (d) => {
    const { $html } = d;
    recorder.assert($html.find("#msh-remember-settings").prop("checked") && $html.find("#aim-enabled").prop("checked") && $html.find('[name="aimMode"]').val() === "neutralize",
      "Shooting reopen: Remember and Aim restored", { aim: $html.find("#aim-enabled").prop("checked"), mode: $html.find('[name="aimMode"]').val() });
  });
}

async function grenadeTests(recorder, { attacker }) {
  const actor = attacker.actor;
  const item = actor.items.getName("Test Grenade");
  await setTargets([]);
  const result = await withDialog(recorder, "Grenade", GrenadeAction, { actor, actionType: "grenade", abilityName: "agility", opts: { item } }, async (d) => {
    const { $html } = d;
    recorder.equal(d.width(), DIALOG_WIDTH, "Grenade: dialog opens at its pinned width");
    recorder.assert($html.find(".h-verb").text() === "throws at" && $html.find(".h-target").text() === "landing zone", "Grenade: header reads ... throws at landing zone",
      { verb: $html.find(".h-verb").text(), target: $html.find(".h-target").text() });
    recorder.assert($html.find(".frp-dmg-box").text().includes("Test Grenade") && $html.find("#dmg-val").text() === "30" && $html.find(".frp-dmg-after").text() === "edged, all in area",
      "Grenade: box shows name, damage and type", { text: $html.find(".frp-dmg-box").text().replace(/\s+/g, " ").trim() });
    recorder.assert(/Blast radius:\s*1 area/.test($html.find(".frp-dmg-box").text()) && /3\s*remaining/.test($html.find(".frp-dmg-box").text()), "Grenade: box shows blast radius and count remaining");
    recorder.assert($html.find(".frp-fx-cell.w").text().includes("scatters") && $html.find(".frp-fx-cell.r").text().includes("all in area"), "Grenade: effect grid reads Miss scatters / Hit all in area");
    recorder.equal($html.find("#frp-roll").text(), "Throw", "Grenade: the roll button reads Throw");
    recorder.assert($html.find("#msh-remember-settings").length === 1 && $html.find("#msh-skip-dice").length === 1, "Grenade: footer has Remember and Skip dice");
    recorder.equal($html.find(".faserip-mode-row").length, 0, "Grenade: mode buttons are no longer inside the dialog body");
    setVal($html, '[name="range"]', 2);
    recorder.equal($html.find("#range-penalty-display").text(), "-2CS", "Grenade: range 2 at Good Strength shows -2CS");
    recorder.equal($html.find("#frp-cs-rank").text(), "Typical", "Grenade: CS row shows Excellent shifted to Typical");
    setVal($html, '[name="shift"]', 1);
    recorder.assert($html.find("#frp-cs-reason-row").css("display") !== "none", "Grenade: a manual shift reveals the Reason field");
    setVal($html, '[name="range"]', 99);
    recorder.equal($html.find("#range-penalty-display").text(), "OUT OF RANGE", "Grenade: range box says OUT OF RANGE");
    const refused = await d.roll();
    recorder.assert(!refused.rolled && !d.settled && d.notes.some(n => n.level === "error" && /Beyond max throwing range/.test(n.message)),
      "Grenade: a throw beyond range is refused and the dialog stays open", { notes: d.notes });
    recorder.equal(d.width(), DIALOG_WIDTH, "Grenade: width holds after changes");
    $html.find("#frp-cancel").trigger("click");
    await waitFor(() => d.settled, { timeout: 2000 });
  });
  recorder.assert(result?.ret?.rawActionCancelled === true, "Grenade: Cancel reports cancellation and throws nothing", { ret: result?.ret });
  recorder.equal(Number(item.system.shotsRemaining), 3, "Grenade: no grenade was used up");
}

async function grappleFamilyTests(recorder, { attacker, targetA }) {
  const actor = attacker.actor;
  await setTargets([targetA.token]);
  const cases = [
    ["Grappling", GrapplingAction, "grappling", "GRAPPLING"],
    ["Grabbing", GrabbingAction, "grabbing", "GRABBING"],
    ["Escaping", EscapingAction, "escaping", "ESCAPE"]
  ];
  for (const [label, ActionClass, actionType, cardLabel] of cases) {
    await withDialog(recorder, label, ActionClass, { actor, actionType, abilityName: "strength", captureChat: true }, async (d) => {
      const { $html } = d;
      recorder.equal(d.width(), DIALOG_WIDTH, `${label}: dialog opens at its pinned width`);
      recorder.assert($html.find(".frp-karma-pool").text().includes("avail"), `${label}: Karma row shows the pool`, { text: $html.find(".frp-karma-pool").text() });
      recorder.equal($html.find(".frp-fx-cell").length, 4, `${label}: effect grid has four cells`);
      recorder.assert($html.find('[name="remember"]').length === 1 && $html.find('[name="skipDice"]').length === 1, `${label}: footer has Remember and Skip dice`);
      $html.find('[name="remember"]').prop("checked", true).trigger("change");
      $html.find('[name="skipDice"]').prop("checked", true).trigger("change");
      recorder.equal(d.width(), DIALOG_WIDTH, `${label}: width holds after toggling options`);
      const e = $.Event("keydown"); e.key = "Enter";
      $html.closest(".dialog").trigger(e);
      await waitFor(() => d.settled, { timeout: 8000 });
      recorder.assert(d.settled && !d.error, `${label}: Enter rolls and the action resolves`, { error: d.error?.message, notes: d.notes });
      recorder.assert(d.chat.some(c => c.includes(cardLabel)), `${label}: a result card is produced`, { cards: d.chat.length });
    });
  }
  recorder.equal(actor.getFlag(SYSTEM_ID, "lastGrappleRemember"), true, "Grappling: Remember was saved");
}

async function cleanupState(state, keepArtifacts) {
  try { await setTargets(state.previousTargets ?? []); } catch (_) { /* noop */ }
  for (const [key, value] of Object.entries(state.prefs)) {
    try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch (_) { /* noop */ }
  }
  if (keepArtifacts) return;
  for (const token of state.tokens.reverse()) { try { await token.delete(); } catch (e) { console.warn("[FASERIP TEST] Token cleanup failed", e); } }
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
    <h3 style="margin:0 0 6px;">FASERIP Attack Dialog Runtime Tests</h3>
    <p style="margin:0 0 6px;"><strong>${counts.PASS ?? 0}</strong> passed, <strong>${counts.FAIL ?? 0}</strong> failed, <strong>${counts.SKIP ?? 0}</strong> skipped.</p>
    <ol style="margin:0;padding-left:22px;">${rows}</ol></div>`;
}

/**
 * Run the attack dialog suite.
 * @param {object} options
 * @param {boolean} [options.keepArtifacts=false] Keep the test actors/tokens for inspection.
 * @param {boolean} [options.postChat=true] Whisper a summary card to GMs.
 */
export async function runAttackDialogRuntimeTests({ keepArtifacts = false, postChat = true } = {}) {
  if (!game?.ready) throw new Error("Foundry must be fully ready before running tests.");
  if (!game.user?.isGM) throw new Error("Run the attack dialog runtime tests while logged in as a GM.");
  if (game.system?.id !== SYSTEM_ID) throw new Error(`Expected system ${SYSTEM_ID}, found ${game.system?.id}.`);
  if (!canvas?.ready || !getScene()) throw new Error("View a scene before running the attack dialog runtime tests.");
  if (openDialogEl()) throw new Error("Close any open attack dialog before running the attack dialog runtime tests.");

  const recorder = makeRecorder();
  const state = { actors: [], tokens: [], prefs: {}, previousTargets: [] };
  for (const key of PREF_KEYS) state.prefs[key] = localStorage.getItem(key);
  state.previousTargets = Array.from(game.user.targets).map(t => t.document).filter(Boolean);

  console.group("FASERIP Attack Dialog Runtime Tests");
  try {
    for (const key of PREF_KEYS) localStorage.removeItem(key);
    const scene = getScene();
    const size = scene.grid?.size ?? canvas.grid?.size ?? 100;
    const x0 = (scene.dimensions?.sceneX ?? 0) + size * 2;
    const y0 = (scene.dimensions?.sceneY ?? 0) + size * 2;
    const abilities = { fighting: { rank: "Remarkable", value: 30 }, agility: { rank: "Excellent", value: 20 }, strength: { rank: "Good", value: 10 } };
    const armor = [power("Body Armor", { rank: "Good", value: 10, armorPhysical: 10, isBodyArmor: true, isActive: true })];

    const brokenArmor = [{ name: "Broken Vest", type: "equipment", system: { category: "armor", protection: "Excellent", broken: true } }];
    const attacker = await createCombatant(state, "Attacker", { x: x0, y: y0, disposition: 1, system: { abilities, karma: { lifetime: 120 } }, items: ATTACKER_ITEMS });
    const targetA = await createCombatant(state, "Target A", { x: x0 + size, y: y0, disposition: -1, items: armor });
    const targetB = await createCombatant(state, "Target B", { x: x0 + size, y: y0 + size, disposition: -1, items: brokenArmor });
    await waitFor(() => attacker.token.object && targetA.token.object && targetB.token.object, { timeout: 3000 });

    const targeted = await setTargets([targetA.token]);
    recorder.assert(targeted, "Setup: test target can be targeted", { targets: targetIds() });
    if (targeted) {
      const fixtures = { attacker, targetA, targetB };
      await energyTests(recorder, fixtures);
      await forceTests(recorder, fixtures);
      await thrownEdgedTests(recorder, fixtures);
      await thrownBluntTests(recorder, fixtures);
      await meleeTests(recorder, fixtures);
      await chargingAndShootingTests(recorder, fixtures);
      await grenadeTests(recorder, fixtures);
      await grappleFamilyTests(recorder, fixtures);
    }
  } catch (error) {
    recorder.fail("Attack dialog suite completed without an uncaught exception", { message: error?.message ?? String(error), stack: error?.stack });
    console.error("[FASERIP TEST] Attack dialog suite aborted", error);
  } finally {
    await cleanupState(state, keepArtifacts);
    console.table(recorder.results.map(({ status, name }) => ({ status, name })));
    console.groupEnd();
  }
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
  ui.notifications.info(`Attack dialog tests: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped.`);
  return summary;
}
