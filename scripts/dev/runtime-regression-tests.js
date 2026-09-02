// Foundry VTT runtime regression harness for the bootstrap and CTT repairs in v2.1.10.
// 2026-09-01: createTestCombat now creates pristine -> adds combatants ->
// updates to round 1, eliminating the uncaught core #triggerTurnEvents
// TypeError on one-shot creation (also seen on socket replay at reload).
// Run through macros/run-bootstrap-runtime-tests.js while logged in as a GM.

const SYSTEM_ID = "msh-faserip";
const TEST_PREFIX = "ZZZ Bootstrap Regression";
const DEFAULT_TIMEOUT = 3500;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(predicate, { timeout = DEFAULT_TIMEOUT, interval = 75 } = {}) {
  const started = Date.now();
  while ((Date.now() - started) < timeout) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (_) { /* retry until timeout */ }
    await sleep(interval);
  }
  return false;
}

function getActorType(preferred = "hero") {
  const available = game.system?.documentTypes?.Actor ?? [];
  if (available.includes?.(preferred)) return preferred;
  if (Array.isArray(available) && available.length) return available[0];
  const fromModel = Object.keys(game.model?.Actor ?? {}).filter(type => !type.startsWith("_"));
  return fromModel.includes(preferred) ? preferred : fromModel[0];
}

function getItemType(preferred = "power") {
  const available = game.system?.documentTypes?.Item ?? [];
  if (available.includes?.(preferred)) return preferred;
  if (Array.isArray(available) && available.length) return available[0];
  const fromModel = Object.keys(game.model?.Item ?? {}).filter(type => !type.startsWith("_"));
  return fromModel.includes(preferred) ? preferred : fromModel[0];
}

function getSceneId() {
  return canvas?.scene?.id
    ?? game.scenes?.active?.id
    ?? game.scenes?.find?.(scene => scene.active)?.id
    ?? game.scenes?.contents?.[0]?.id
    ?? null;
}

function resultDetails(value) {
  if (value === undefined) return {};
  if (value && typeof value === "object") return value;
  return { value };
}

function makeRecorder() {
  const results = [];

  function add(status, name, details) {
    const entry = { status, name, details: resultDetails(details) };
    results.push(entry);
    const marker = status === "PASS" ? "PASS" : status === "SKIP" ? "SKIP" : "FAIL";
    const logger = status === "FAIL" ? console.error : status === "SKIP" ? console.warn : console.log;
    logger(`[FASERIP TEST] ${marker} | ${name}`, entry.details);
    return entry;
  }

  return {
    results,
    pass: (name, details) => add("PASS", name, details),
    fail: (name, details) => add("FAIL", name, details),
    skip: (name, details) => add("SKIP", name, details),
    assert(condition, name, details) {
      return condition ? this.pass(name, details) : this.fail(name, details);
    }
  };
}

async function preserveSetting(namespace, key, changes, value) {
  try {
    const oldValue = game.settings.get(namespace, key);
    changes.push({ namespace, key, oldValue });
    await game.settings.set(namespace, key, value);
    return true;
  } catch (error) {
    console.warn(`[FASERIP TEST] Could not set ${namespace}.${key}`, error);
    return false;
  }
}

async function restoreSettings(changes) {
  for (const { namespace, key, oldValue } of changes.reverse()) {
    try {
      await game.settings.set(namespace, key, oldValue);
    } catch (error) {
      console.warn(`[FASERIP TEST] Could not restore ${namespace}.${key}`, error);
    }
  }
}

async function createTestActor(name, type = getActorType("hero")) {
  if (!type) throw new Error("No valid Actor type is registered.");
  const ActorClass = Actor.implementation ?? Actor;
  const actor = await ActorClass.create({
    name: `${TEST_PREFIX} - ${name} - ${Date.now()}`,
    type,
    system: {}
  });
  if (!actor) throw new Error(`Actor creation failed for type ${type}.`);
  return actor;
}

async function createTestCombat(actors) {
  const sceneId = getSceneId();
  if (!sceneId) return null;

  const combatantData = actors.map((actor, index) => ({
    type: "base",
    actorId: actor.id,
    name: actor.name,
    initiative: 100 - index,
    hidden: false,
    defeated: false
  }));

  const CombatClass = Combat.implementation ?? Combat;
  // Create pristine, then populate, then position. Creating in one shot at
  // round 1 with embedded combatants makes core _onCreate fire turn events
  // against a nonexistent previous state (uncaught "reading 'round'" from
  // #triggerTurnEvents); on update the previous state exists and the path
  // is safe.
  const combat = await CombatClass.create({
    name: `${TEST_PREFIX} - Combat - ${Date.now()}`,
    type: "base",
    scene: sceneId,
    active: false
  });

  if (!combat) throw new Error("Combat creation failed.");
  await combat.createEmbeddedDocuments("Combatant", combatantData);
  await combat.update({ round: 1, turn: 0 });
  return combat;
}

async function patchFunction(target, key, replacement, callback) {
  if (!target || typeof target[key] !== "function") {
    return { patched: false, reason: `${key} is not a function` };
  }
  const hadOwn = Object.hasOwn(target, key);
  const original = target[key];
  try {
    target[key] = replacement;
  } catch (error) {
    return { patched: false, reason: `${key} is not writable: ${error?.message ?? error}` };
  }
  if (target[key] !== replacement) {
    if (!hadOwn) { try { delete target[key]; } catch (_) {} }
    return { patched: false, reason: `${key} is not writable` };
  }
  try {
    const value = await callback();
    return { patched: true, value };
  } finally {
    try {
      if (hadOwn) target[key] = original;
      else delete target[key];
    } catch (_) { /* best effort */ }
  }
}

async function testRuntimeSchema(recorder, state) {
  const actor = await createTestActor("Schema Character");
  state.actors.push(actor);

  recorder.assert(
    actor.system?.details?.isDead === false && actor.system?.details?.isDeactivated === false,
    "Character death-state defaults are present",
    { details: actor.system?.details }
  );

  const powerType = getItemType("power");
  if (powerType !== "power") {
    recorder.skip("Power runtime defaults", { reason: "No power Item type is registered." });
  } else {
    const [power] = await actor.createEmbeddedDocuments("Item", [{
      name: `${TEST_PREFIX} Power`,
      type: "power",
      system: {}
    }]);
    const fields = [
      "armorPhysicalCustom",
      "calculatedRange",
      "regenerationRate",
      "resistanceSpecific",
      "resistanceValue"
    ];
    const missing = fields.filter(field => !(field in (power?.system ?? {})));
    recorder.assert(missing.length === 0, "Power runtime defaults are present", { missing });
  }

  const vehicleType = getActorType("vehicle");
  if (vehicleType !== "vehicle") {
    recorder.skip("Vehicle currentSpeed default", { reason: "No vehicle Actor type is registered." });
  } else {
    const vehicle = await createTestActor("Schema Vehicle", "vehicle");
    state.actors.push(vehicle);
    recorder.assert(
      typeof vehicle.system?.currentSpeed === "number" && vehicle.system.currentSpeed === 0,
      "Vehicle currentSpeed defaults to numeric zero",
      { currentSpeed: vehicle.system?.currentSpeed, type: typeof vehicle.system?.currentSpeed }
    );
  }

  return actor;
}

async function testHealthHooks(recorder, actor, scope) {
  await actor.update({
    "system.attributes.health.max": 40,
    "system.attributes.health.value": 40
  });

  const clearDamageState = async () => {
    try { await actor.unsetFlag(scope, "lastDamageTime"); } catch (_) {}
    try { await actor.unsetFlag(scope, "lastDamageWorldTime"); } catch (_) {}
    game.msh._lastDamageTimerAt ??= {};
    game.msh._lastDamageTimerAt[actor.id] = 0;
  };

  await clearDamageState();
  const nestedStarted = Date.now();
  await actor.update({
    system: {
      attributes: {
        health: { value: 35 }
      }
    }
  });
  const nestedRecorded = await waitFor(() => {
    const stamp = Number(actor.getFlag(scope, "lastDamageTime"));
    return Number.isFinite(stamp) && stamp >= nestedStarted ? stamp : false;
  });
  recorder.assert(!!nestedRecorded, "Nested Health update records damage", {
    health: actor.system?.attributes?.health?.value,
    lastDamageTime: actor.getFlag(scope, "lastDamageTime")
  });

  await clearDamageState();
  await sleep(50);
  const flatStarted = Date.now();
  await actor.update({ "system.attributes.health.value": 30 });
  const flatRecorded = await waitFor(() => {
    const stamp = Number(actor.getFlag(scope, "lastDamageTime"));
    return Number.isFinite(stamp) && stamp >= flatStarted ? stamp : false;
  });
  recorder.assert(!!flatRecorded, "Flattened Health update records damage", {
    health: actor.system?.attributes?.health?.value,
    lastDamageTime: actor.getFlag(scope, "lastDamageTime")
  });
}

async function testCombatTimerCadence(recorder, state, scope) {
  if (game.combat?.active) {
    recorder.skip("Recovery timer cadence", { reason: "An active combat is running. End it and rerun the suite." });
    return null;
  }

  const actors = [];
  for (let index = 1; index <= 3; index++) {
    const actor = await createTestActor(`Combatant ${index}`);
    state.actors.push(actor);
    actors.push(actor);
  }

  const combat = await createTestCombat(actors);
  if (!combat) {
    recorder.skip("Recovery timer cadence", { reason: "No Scene exists for a temporary Combat." });
    return null;
  }
  state.combats.push(combat);

  // Recovery/Healing are handled by rest-system.js against worldTime, not by
  // per-round AE turnsRemaining timers. The cadence assertions that lived here
  // tested a fallback that no longer exists; createTimerEffect/readTimer went
  // with them. This function now only stands up the Combat that the
  // turn-length and CTT tests reuse.
  await combat.update({ turn: 1 });
  await sleep(200);

  return combat;
}

async function testConfiguredTurnLength(recorder, combat) {
  if (!combat) {
    recorder.skip("Configured turn length", { reason: "Temporary Combat was unavailable." });
    return;
  }

  const captured = [];
  const patched = await patchFunction(
    game.time,
    "advance",
    async seconds => {
      captured.push(Number(seconds));
      return game.time.worldTime;
    },
    async () => {
      Hooks.callAll("combatRound", combat, { round: combat.round + 1 }, {}, game.user.id);
      await waitFor(() => captured.length > 0);
    }
  );

  if (!patched.patched) {
    recorder.skip("Configured turn length", { reason: patched.reason });
    return;
  }

  recorder.assert(
    captured.length === 1 && captured[0] === 11,
    "combatRound advances the configured number of seconds",
    { calls: captured }
  );
}

async function testCttIntegration(recorder, combat) {
  const module = game.modules?.get?.("calendar-time-tracker");
  if (!combat) {
    recorder.skip("CTT integration", { reason: "Temporary Combat was unavailable." });
    return;
  }
  if (!module?.active) {
    recorder.skip("CTT integration", { reason: "Calendar Time Tracker is not active." });
    return;
  }

  const api = module.api;
  const engine = api?.timeEngine;
  recorder.assert(
    typeof api?.advanceTime === "function" && typeof engine?.advanceTime === "function",
    "CTT exposes its supported time-advance API",
    {
      moduleVersion: module.version,
      apiAdvanceTime: typeof api?.advanceTime,
      engineAdvanceTime: typeof engine?.advanceTime
    }
  );
  if (typeof api?.advanceTime !== "function" || typeof engine?.advanceTime !== "function") return;

  const calls = [];
  const patched = await patchFunction(
    engine,
    "advanceTime",
    (amount, unit) => {
      calls.push({ amount: Number(amount), unit });
      return true;
    },
    async () => {
      await game.settings.set(SYSTEM_ID, "ctt.timeAuthority", true);
      await game.settings.set(SYSTEM_ID, "combatSyncEnabled", false);

      // Per Turn: one combatant-turn update must produce exactly one CTT turn.
      await game.settings.set(SYSTEM_ID, "ctt.syncMode", "turn");
      calls.length = 0;
      const nextTurn = Math.min((combat.turn ?? 0) + 1, Math.max(0, (combat.turns?.length ?? 1) - 1));
      await combat.update({ turn: nextTurn });
      await waitFor(() => calls.length > 0);
      recorder.assert(
        calls.length === 1 && calls[0].amount === 1 && calls[0].unit === "turn",
        "CTT Per Turn sync advances exactly one turn",
        { calls: [...calls], combatRound: combat.round, combatTurn: combat.turn }
      );

      // RAW phase/initiative code may reposition Foundry's combatant cursor
      // without any game time elapsing. That update must not advance CTT.
      calls.length = 0;
      const internalTurn = combat.turn === 0 && (combat.turns?.length ?? 0) > 1 ? 1 : 0;
      await combat.update({ turn: internalTurn }, { mshNoTimeAdvance: true });
      await sleep(100);
      recorder.assert(
        calls.length === 0,
        "CTT ignores internal initiative/phase cursor positioning",
        { calls: [...calls], combatRound: combat.round, combatTurn: combat.turn }
      );

      // RAW Turn Phases subdivide a single FASERIP round. Even if the world
      // setting still says Per Combatant Turn, a cursor move must not tick CTT.
      await game.settings.set(SYSTEM_ID, "useRawTurnPhases", true);
      calls.length = 0;
      const rawPhaseTurn = combat.turn === 0 ? 1 : 0;
      await combat.update({ turn: rawPhaseTurn });
      await sleep(100);
      recorder.assert(
        calls.length === 0,
        "RAW Turn Phases normalize CTT sync to per-round timing",
        { calls: [...calls], combatRound: combat.round, combatTurn: combat.turn }
      );
      await game.settings.set(SYSTEM_ID, "useRawTurnPhases", false);

      // Per Round: the system and CTT's compatibility bridge must not both advance.
      await game.settings.set(SYSTEM_ID, "ctt.syncMode", "round");
      calls.length = 0;
      await combat.update({ round: (combat.round ?? 1) + 1, turn: 0 });
      await waitFor(() => calls.length > 0);
      recorder.assert(
        calls.length === 1 && calls[0].amount === 1 && calls[0].unit === "turn",
        "CTT Per Round sync advances exactly once without bridge duplication",
        { calls: [...calls], combatRound: combat.round, combatTurn: combat.turn }
      );

      // When CTT is authoritative, the older worldTime combat clock must stand down.
      await game.settings.set(SYSTEM_ID, "ctt.syncMode", "turn");
      await game.settings.set(SYSTEM_ID, "combatSyncEnabled", true);
      const worldTimeCalls = [];
      const worldTimePatch = await patchFunction(
        game.time,
        "advance",
        async seconds => {
          worldTimeCalls.push(Number(seconds));
          return game.time.worldTime;
        },
        async () => {
          Hooks.callAll("combatRound", combat, { round: combat.round }, {}, game.user.id);
          await sleep(250);
        }
      );

      if (!worldTimePatch.patched) {
        recorder.skip("CTT Time Authority suppresses the legacy worldTime clock", { reason: worldTimePatch.reason });
      } else {
        recorder.assert(
          worldTimeCalls.length === 0,
          "CTT Time Authority suppresses the legacy worldTime clock",
          { calls: worldTimeCalls }
        );
      }

      const campaignTime = game.msh?.getCampaignDateTime?.();
      recorder.assert(
        campaignTime?.source === "ctt",
        "FASERIP campaign time reads from CTT when it is Time Authority",
        { source: campaignTime?.source, formatted: campaignTime?.formatted }
      );
    }
  );

  if (!patched.patched) {
    recorder.skip("CTT synchronization calls", { reason: patched.reason });
  }
}

async function testSequentialDyingSteps(recorder, state, scope) {
  const actor = await createTestActor("Dying Steps");
  state.actors.push(actor);

  await actor.update({
    "system.abilities.endurance.rank": "Excellent",
    "system.abilities.endurance.value": 20,
    "system.attributes.health.value": 0,
    "system.attributes.health.max": 50
  }, { mshDyingTick: true });

  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: "Dying",
    img: "icons/svg/skull.svg",
    disabled: false,
    statuses: ["dying"],
    flags: {
      [scope]: {
        ongoingId: "dying",
        isDying: true,
        stabilizedRounds: 0
      }
    }
  }]);

  const { processDyingRound } = await import("../modules/effects/ongoing-engine.js");
  const outcomes = [];

  const patchedChat = await patchFunction(
    ChatMessage,
    "create",
    async data => ({ id: `bootstrap-test-${Date.now()}`, ...data }),
    async () => {
      for (let index = 0; index < 3; index++) {
        outcomes.push(await processDyingRound(actor));
      }
    }
  );

  if (!patchedChat.patched) {
    recorder.skip("Multiple Dying steps", { reason: patchedChat.reason });
    return;
  }

  recorder.assert(
    actor.system?.abilities?.endurance?.rank === "Poor" && outcomes.every(outcome => outcome === "stepped"),
    "Dying can process multiple elapsed steps sequentially",
    { outcomes, endurance: actor.system?.abilities?.endurance?.rank }
  );
}

async function testLegacyColumnShift(recorder, actor) {
  const module = await import("../modules/actions/action-dispatcher.js");
  const dispatcher = module.ActionDispatcher;
  if (!dispatcher || typeof dispatcher.roll !== "function") {
    recorder.fail("Legacy column shift forwarding", { reason: "ActionDispatcher.roll is unavailable." });
    return;
  }

  const calls = [];
  const patched = await patchFunction(
    dispatcher,
    "roll",
    async (actionType, payload) => {
      calls.push({ actionType, payload });
      return { actionType, payload };
    },
    async () => game.msh.rollUniversalAction("BA", actor.id, 2, 7, { regressionProbe: true })
  );

  if (!patched.patched) {
    recorder.skip("Legacy column shift forwarding", { reason: patched.reason });
    return;
  }

  const call = calls[0];
  recorder.assert(
    calls.length === 1
      && call.actionType === "blunt-attack"
      && call.payload?.opts?.shift === 2
      && call.payload?.opts?.karma === 7
      && call.payload?.opts?.regressionProbe === true,
    "rollUniversalAction forwards shift, Karma, and options",
    {
      actionType: call?.actionType,
      actorId: call?.payload?.actor?.id,
      shift: call?.payload?.opts?.shift,
      karma: call?.payload?.opts?.karma,
      regressionProbe: call?.payload?.opts?.regressionProbe
    }
  );
}

async function cleanupState(state, keepArtifacts) {
  if (keepArtifacts) return;

  for (const combat of state.combats.reverse()) {
    try { await combat.delete(); } catch (error) { console.warn("[FASERIP TEST] Combat cleanup failed", error); }
  }
  for (const actor of state.actors.reverse()) {
    try { await actor.delete(); } catch (error) { console.warn("[FASERIP TEST] Actor cleanup failed", error); }
  }
}

function reportHtml(results) {
  const counts = results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] ?? 0) + 1;
    return acc;
  }, {});
  const rows = results.map(result => {
    const color = result.status === "PASS" ? "#2e7d32" : result.status === "SKIP" ? "#8a6d00" : "#b71c1c";
    const details = Object.keys(result.details ?? {}).length
      ? `<div style="font-size:0.85em;color:#555;overflow-wrap:anywhere;">${foundry.utils.escapeHTML(JSON.stringify(result.details))}</div>`
      : "";
    return `<li style="margin:4px 0;"><strong style="color:${color};">${result.status}</strong> — ${foundry.utils.escapeHTML(result.name)}${details}</li>`;
  }).join("");

  return `<div style="border:2px solid #555;padding:10px;border-radius:5px;background:#fafafa;">
    <h3 style="margin:0 0 6px;">FASERIP Bootstrap Regression Tests</h3>
    <p style="margin:0 0 6px;"><strong>${counts.PASS ?? 0}</strong> passed, <strong>${counts.FAIL ?? 0}</strong> failed, <strong>${counts.SKIP ?? 0}</strong> skipped.</p>
    <ol style="margin:0;padding-left:22px;">${rows}</ol>
  </div>`;
}

async function postReport(results) {
  try {
    const recipients = ChatMessage.getWhisperRecipients("GM").map(user => user.id);
    await ChatMessage.create({
      content: reportHtml(results),
      whisper: recipients
    });
  } catch (error) {
    console.warn("[FASERIP TEST] Could not post the chat report", error);
  }
}

/**
 * Run the Foundry-side bootstrap regression suite.
 * @param {object} options
 * @param {boolean} [options.keepArtifacts=false] Keep temporary Actors/Combat for inspection.
 * @param {boolean} [options.postChat=true] Whisper a summary card to GMs.
 * @returns {Promise<{results:Array, passed:number, failed:number, skipped:number}>}
 */
export async function runBootstrapRuntimeTests({ keepArtifacts = false, postChat = true } = {}) {
  if (!game?.ready) throw new Error("Foundry must be fully ready before running tests.");
  if (!game.user?.isGM) throw new Error("Run the bootstrap runtime tests while logged in as a GM.");
  if (game.system?.id !== SYSTEM_ID) throw new Error(`Expected system ${SYSTEM_ID}, found ${game.system?.id}.`);

  const recorder = makeRecorder();
  const state = { actors: [], combats: [], settings: [] };
  const scope = globalThis.MSH_FLAG_SCOPE || SYSTEM_ID;

  console.group("FASERIP Bootstrap Runtime Regression Tests");
  try {

    await preserveSetting(SYSTEM_ID, "autoHealingEnabled", state.settings, false);
    await preserveSetting(SYSTEM_ID, "effects.autoDamageTimers", state.settings, false);
    await preserveSetting(SYSTEM_ID, "combatSyncEnabled", state.settings, false);
    await preserveSetting(SYSTEM_ID, "ctt.syncMode", state.settings, "off");
    await preserveSetting(SYSTEM_ID, "ctt.timeAuthority", state.settings, false);
    await preserveSetting(SYSTEM_ID, "useRawTurnPhases", state.settings, false);
    await preserveSetting(SYSTEM_ID, "turnSeconds", state.settings, 11);

    const schemaActor = await testRuntimeSchema(recorder, state);
    await testHealthHooks(recorder, schemaActor, scope);

    const combat = await testCombatTimerCadence(recorder, state, scope);

    await game.settings.set(SYSTEM_ID, "combatSyncEnabled", true);
    await testConfiguredTurnLength(recorder, combat);
    await game.settings.set(SYSTEM_ID, "combatSyncEnabled", false);

    await testCttIntegration(recorder, combat);
    await game.settings.set(SYSTEM_ID, "ctt.syncMode", "off");
    await game.settings.set(SYSTEM_ID, "ctt.timeAuthority", false);
    await game.settings.set(SYSTEM_ID, "combatSyncEnabled", false);

    await testSequentialDyingSteps(recorder, state, scope);
    await testLegacyColumnShift(recorder, schemaActor);
  } catch (error) {
    recorder.fail("Runtime suite completed without an uncaught exception", {
      message: error?.message ?? String(error),
      stack: error?.stack
    });
    console.error("[FASERIP TEST] Runtime suite aborted", error);
  } finally {
    await restoreSettings(state.settings);
    await cleanupState(state, keepArtifacts);
    console.table(recorder.results.map(({ status, name }) => ({ status, name })));
    console.groupEnd();
  }

  const summary = {
    results: recorder.results,
    passed: recorder.results.filter(result => result.status === "PASS").length,
    failed: recorder.results.filter(result => result.status === "FAIL").length,
    skipped: recorder.results.filter(result => result.status === "SKIP").length
  };

  if (postChat) await postReport(recorder.results);
  if (summary.failed > 0) ui.notifications.error(`FASERIP regression tests: ${summary.failed} failed.`);
  else ui.notifications.info(`FASERIP regression tests: ${summary.passed} passed${summary.skipped ? `, ${summary.skipped} skipped` : ""}.`);

  return summary;
}
