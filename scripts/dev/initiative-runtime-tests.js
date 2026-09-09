// scripts/dev/initiative-runtime-tests.js v1.0.2 - 2026-09-09
// v1.0.2: [CERT] Dodging text (2026-09-09): a dodger may perform one other
//         action that turn including an attack — asserted, no longer OPEN.
// v1.0.1: the actions-begun Change Action check uses the pure rule with a
//         clean combatant (the hero's resolved Dodge was refusing first);
//         the Dodge-then-attack assertion is marked OPEN pending the
//         Judge's read of the Dodging text; cleanup waits for in-flight
//         death-save hooks so deleted actors are not looked up afterwards.
// Foundry VTT runtime suite for the RAW initiative FLOW (Declare → Ready →
// roll → Actions, declared defences, Change Action window, the combat-action
// budget, round reset, single-side rounds, side assignment). It drives real
// documents — a throwaway hero and villain with tokens on the current scene,
// a real Combat — and asserts the flags and gate verdicts the tracker and
// dispatcher read, so it catches ordering and gating bugs the source-wiring
// tests in tools/ cannot. Gate verdicts are computed the way the dispatcher
// computes them (authorizeRawAction / defensePending over the live flags) so
// no attack dialog opens. Same shape as runtime-regression-tests.js; launch
// via macros/run-initiative-runtime-tests.js as a GM with no active combat.

import { FaseripInitiative } from "../faserip-initiative.js";
import { authorizeRawAction, defensePending, canChangeAction, RAW_PHASES } from "../rules/raw-combat-state.js";

const SYSTEM_ID = "msh-faserip";
const TEST_PREFIX = "ZZZ Initiative Runtime";
const DEFAULT_TIMEOUT = 6000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitFor(predicate, { timeout = DEFAULT_TIMEOUT, interval = 75 } = {}) {
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
    assert(c, n, d) { return c ? this.pass(n, d) : this.fail(n, d); }
  };
}

async function preserveSetting(key, changes, value) {
  try {
    changes.push({ key, oldValue: game.settings.get(SYSTEM_ID, key) });
    await game.settings.set(SYSTEM_ID, key, value);
  } catch (e) { console.warn(`[FASERIP TEST] Could not set ${key}`, e); }
}
async function restoreSettings(changes) {
  for (const { key, oldValue } of changes.reverse()) {
    try { await game.settings.set(SYSTEM_ID, key, oldValue); } catch (e) { console.warn(`[FASERIP TEST] Could not restore ${key}`, e); }
  }
}

function getScene() { return canvas?.scene ?? game.scenes?.active ?? game.scenes?.contents?.[0] ?? null; }

async function createFighter(name, { characterType, intuition, disposition, x, y }) {
  const ActorClass = Actor.implementation ?? Actor;
  // Both are hero-TYPE documents on purpose: a villain built this way (the
  // sheet's characterType says villain) is the shape that broke the side rule.
  const actor = await ActorClass.create({
    name: `${TEST_PREFIX} - ${name} - ${Date.now()}`,
    type: "hero",
    system: { characterType, abilities: { intuition: { value: intuition } } },
    prototypeToken: { disposition, actorLink: true }
  });
  if (!actor) throw new Error(`Actor creation failed for ${name}`);
  const scene = getScene();
  const td = await actor.getTokenDocument({ x, y, disposition, actorLink: true });
  const [token] = await scene.createEmbeddedDocuments("Token", [td.toObject()]);
  return { actor, token };
}

function gate(combat, combatant, actionType, { rawPreAction = false } = {}) {
  return authorizeRawAction({
    phase: combat.getFlag(SYSTEM_ID, "turnPhase"),
    declaration: combatant.getFlag(SYSTEM_ID, "declaredAction"),
    preActionResolved: combatant.getFlag(SYSTEM_ID, "preActionResolved"),
    actionState: combatant.getFlag(SYSTEM_ID, "actionState"),
    round: combat.round,
    actionType,
    rawPreAction,
    actorName: combatant.name
  });
}

function pending(combat, target) {
  return defensePending({
    declaration: target.getFlag(SYSTEM_ID, "declaredAction"),
    preActionResolved: target.getFlag(SYSTEM_ID, "preActionResolved"),
    round: combat.round
  });
}

const phaseOf = combat => FaseripInitiative._getPhase(combat);
const flag = (doc, key) => doc.getFlag(SYSTEM_ID, key);
const decl = (type, round, extra = {}) => ({ type, attackCount: null, note: "", target: "", shift: 0, autoRoll: false, qualifiers: { unarmed: false, weaponSpecialist: false }, label: FaseripInitiative._declarationMeta(type).label, round, ...extra });

async function runFlow(recorder, state) {
  const scene = getScene();
  if (!scene) { recorder.skip("Initiative flow", { reason: "No Scene for tokens." }); return; }
  if (game.combat?.active) { recorder.skip("Initiative flow", { reason: "An active combat is running. End it and rerun." }); return; }

  const hero = await createFighter("Hero", { characterType: "hero", intuition: 30, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY, x: 100, y: 100 });
  const villain = await createFighter("Villain", { characterType: "villain", intuition: 10, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE, x: 400, y: 100 });
  state.actors.push(hero.actor, villain.actor);
  state.tokens.push(hero.token, villain.token);

  const CombatClass = Combat.implementation ?? Combat;
  const combat = await CombatClass.create({ name: `${TEST_PREFIX} - Combat - ${Date.now()}`, type: "base", scene: scene.id, active: true });
  state.combats.push(combat);
  await combat.createEmbeddedDocuments("Combatant", [
    { type: "base", actorId: hero.actor.id, tokenId: hero.token.id, sceneId: scene.id },
    { type: "base", actorId: villain.actor.id, tokenId: villain.token.id, sceneId: scene.id }
  ]);
  const heroC = () => combat.combatants.find(c => c.actorId === hero.actor.id);
  const villC = () => combat.combatants.find(c => c.actorId === villain.actor.id);

  // ── Side assignment (fixed-bug 2026-09-09) ────────────────────────────────
  recorder.assert(FaseripInitiative._determineSide(heroC()) === "pc", "Hero-type hero sits PC-side");
  recorder.assert(FaseripInitiative._determineSide(villC()) === "npc", "Hero-type actor with characterType villain sits NPC-side (Klaw shape)", { characterType: villain.actor.system?.characterType });

  // ── Round 1 opens in Declare; attacks and moves refused ──────────────────
  await combat.startCombat();
  await waitFor(() => combat.started && combat.round === 1);
  await sleep(150);
  recorder.assert(combat.started && combat.round === 1, "Combat starts at round 1", { round: combat.round, started: combat.started });
  recorder.assert(phaseOf(combat) === RAW_PHASES.DECLARE, "RAW round 1 opens in Declare (no auto-roll)", { phase: phaseOf(combat), turnPhase: flag(combat, "turnPhase") });
  const g0 = gate(combat, heroC(), "blunt-attack");
  recorder.assert(!g0.ok && /initiative first/i.test(g0.message || ""), "Attack refused during Declare with the initiative message", g0);
  const m0 = FaseripInitiative.authorizeTokenMovement(hero.token);
  recorder.assert(!m0.ok, "Token movement refused during Declare", m0);
  recorder.assert(heroC().initiative == null && villC().initiative == null, "No initiative values before the roll");

  // ── Hero declares Dodge (auto-roll); villain declares nothing ─────────────
  await FaseripInitiative._setCombatantFlags(heroC(), { declaredAction: decl("dodge", 1, { autoRoll: true }) });
  await sleep(150);
  recorder.assert(flag(heroC(), "declaredAction")?.type === "dodge", "Hero's Dodge declaration is stored");
  const readyBefore = FaseripInitiative._getReadiness(combat);
  recorder.assert(readyBefore.allReady === false || readyBefore.total === 0, "Declare window is open until every player-owned combatant is Ready", readyBefore);

  // ── Judge closes the window: roll ─────────────────────────────────────────
  // (the Ready auto-roll needs player-owned combatants; test actors are GM-owned,
  // so this is the Judge-clicks-Initiative path — a Judge-only table must roll
  // by hand and never auto-roll)
  await sleep(300);
  recorder.assert(phaseOf(combat) === RAW_PHASES.DECLARE, "GM-owned-only roster does not auto-roll on declaration", { phase: phaseOf(combat) });
  await FaseripInitiative.rollSideInitiative(combat);
  const rolled = await waitFor(() => phaseOf(combat) === RAW_PHASES.ACTIONS && heroC().initiative != null && villC().initiative != null);
  recorder.assert(!!rolled, "Roll opens Actions with both sides carrying an initiative value", { phase: phaseOf(combat), hero: heroC().initiative, villain: villC().initiative });
  const d = FaseripInitiative._getFlagData(combat);
  recorder.assert(FaseripInitiative._hasCompleteData(d), "Side roll flags complete (rolls, modifiers, winner)", d);
  recorder.assert(d.pcRoll !== 1 ? d.pcInit === d.pcRoll + d.pcMod + (d.pcTalentBonus || 0) : d.pcInit === 1, "PC total = roll + Intuition modifier (natural 1 stays 1)", { pcRoll: d.pcRoll, pcMod: d.pcMod, pcInit: d.pcInit });
  recorder.assert(d.pcMod === 2 && d.npcMod === 0, "Intuition 30 → +2, Intuition 10 → +0", { pcMod: d.pcMod, npcMod: d.npcMod });
  recorder.assert(d.goesFirst === (d.pcInit > d.npcInit ? "pc" : "npc"), "Higher total goes first", { goesFirst: d.goesFirst, pcInit: d.pcInit, npcInit: d.npcInit });
  const lead = combat.combatant;
  recorder.assert(lead && FaseripInitiative._getCombatantSide(lead) === d.goesFirst, "Active turn is the winning side's lead", { active: lead?.name, side: lead && FaseripInitiative._getCombatantSide(lead) });
  recorder.assert(flag(villC(), "declaredAction")?.defaulted === true && flag(villC(), "declaredAction")?.type === "attack", "Undeclared villain defaulted to Attack at the roll", flag(villC(), "declaredAction"));

  // ── Declared Dodge auto-rolled at initiative and locked ──────────────────
  const dodged = await waitFor(() => flag(heroC(), "preActionResolved")?.action === "dodging" && flag(heroC(), "preActionResolved")?.round === 1);
  recorder.assert(!!dodged, "Hero's auto-roll Dodge resolved at initiative (step 4)", flag(heroC(), "preActionResolved"));
  recorder.assert(pending(combat, heroC()) === false, "Attacks on the hero are no longer blocked by a pending defence");
  const gDodgeAgain = gate(combat, heroC(), "dodging", { rawPreAction: true });
  recorder.assert(!gDodgeAgain.ok && /locked/i.test(gDodgeAgain.message || ""), "A resolved defence FEAT is locked for the round", gDodgeAgain);
  const gHeroAttack = gate(combat, heroC(), "blunt-attack");
  recorder.assert(gHeroAttack.ok === true && gHeroAttack.consumesCombatAction === true, "[CERT Dodging] a dodger may still make one attack this round", gHeroAttack);
  const gHeroCharge = gate(combat, heroC(), "charging");
  recorder.assert(gHeroCharge.ok === false, "[CERT Dodging] a dodger may not charge", gHeroCharge);

  // ── Change Action window ─────────────────────────────────────────────────
  const ca1 = FaseripInitiative._canChangeAction(villC(), combat);
  recorder.assert(ca1.ok === true, "Change Action available after initiative, before anyone acts", ca1);
  const gVill = gate(combat, villC(), "blunt-attack");
  recorder.assert(gVill.ok === true && gVill.consumesCombatAction === true, "Villain (defaulted Attack) may attack and it consumes the combat action", gVill);
  await FaseripInitiative._setCombatantFlags(villC(), { actionState: { round: 1, combatActionUsed: true, actionType: "blunt-attack", usedAt: Date.now() } });
  await sleep(150);
  const gVill2 = gate(combat, villC(), "blunt-attack");
  recorder.assert(!gVill2.ok && /already used/i.test(gVill2.message || ""), "Second attack in the same round refused", gVill2);
  recorder.assert(FaseripInitiative._actionsBegun(combat) === true, "Actions-begun lock engages after the first combat action");
  const ca2 = canChangeAction({ phase: flag(combat, "turnPhase"), round: combat.round, changeActionAttempted: null, preActionResolved: null, actionState: null, actionsBegun: FaseripInitiative._actionsBegun(combat), actorName: "Bystander" });
  recorder.assert(ca2.ok === false && /begun/i.test(ca2.message || ""), "Change Action closes for everyone once actions have begun", ca2);
  const caHero = FaseripInitiative._canChangeAction(heroC(), combat);
  recorder.assert(caHero.ok === false, "A combatant whose declared FEAT has resolved cannot Change Action", caHero);
  const m1 = FaseripInitiative.authorizeTokenMovement(villain.token);
  recorder.assert(m1.ok === true, "Token movement allowed in Actions for an attacker", m1);

  // ── Next round: Declare again, round-scoped flags cleared, plans kept ────
  await combat.nextRound();
  const reset = await waitFor(() => combat.round === 2 && phaseOf(combat) === RAW_PHASES.DECLARE && heroC().initiative == null);
  recorder.assert(!!reset, "Round 2 reopens Declare with initiative cleared", { round: combat.round, phase: phaseOf(combat), hero: heroC().initiative });
  recorder.assert(flag(heroC(), "preActionResolved") == null && flag(villC(), "actionState") == null && flag(heroC(), "ready") == null, "Round reset clears preActionResolved / actionState / ready");
  recorder.assert(flag(heroC(), "declaredAction")?.type === "dodge", "Round reset keeps the declared plan (Dodge carried into round 2)");
  recorder.assert(FaseripInitiative._isReady(heroC(), combat) === false, "A carried-over plan does not count as Ready for the new round");
  recorder.assert(!FaseripInitiative._hasCompleteData(FaseripInitiative._getFlagData(combat)), "Round reset clears the side roll flags (no stale bar)");

  // ── Single-side round: villain KO'd → heroes act without a roll ──────────
  await villain.actor.update({ "system.attributes.health.value": 0 });
  await sleep(150);
  recorder.assert(FaseripInitiative._isInitiativeEligible(villC()) === false, "A 0-Health combatant is not initiative-eligible");
  await FaseripInitiative.rollSideInitiative(combat);
  const single = await waitFor(() => phaseOf(combat) === RAW_PHASES.ACTIONS);
  recorder.assert(!!single, "Single-side round opens Actions without a roll", { phase: phaseOf(combat) });
  recorder.assert(flag(combat, "goesFirst") === "pc" && flag(combat, "pcInitiative") == null, "Acting side stamped, no side roll recorded", { goesFirst: flag(combat, "goesFirst"), pcInitiative: flag(combat, "pcInitiative") });
  recorder.assert(heroC().initiative != null && villC().initiative == null, "Acting side sorts above the KO'd row", { hero: heroC().initiative, villain: villC().initiative });
  await FaseripInitiative._setCombatantFlags(heroC(), { declaredAction: decl("attack", 2) });
  await sleep(100);
  const gHero2 = gate(combat, heroC(), "blunt-attack");
  recorder.assert(gHero2.ok === true, "Hero may attack in the single-side round", gHero2);
  recorder.assert(FaseripInitiative.authorizeTokenMovement(hero.token).ok === true, "Hero may move in the single-side round");
  const mKO = FaseripInitiative.authorizeTokenMovement(villain.token);
  recorder.assert(mKO.ok === false, "KO'd villain cannot move", mKO);

  // ── Nobody eligible: refuse cleanly, stay in Declare ─────────────────────
  await combat.nextRound();
  await waitFor(() => combat.round === 3 && phaseOf(combat) === RAW_PHASES.DECLARE);
  await hero.actor.update({ "system.attributes.health.value": 0 });
  await sleep(150);
  await FaseripInitiative.rollSideInitiative(combat);
  await sleep(300);
  recorder.assert(phaseOf(combat) === RAW_PHASES.DECLARE, "With nobody eligible the roll refuses and Declare stays open", { phase: phaseOf(combat) });

  // ── Swap Side override beats the automatic rule ──────────────────────────
  await FaseripInitiative.swapSide(villC());
  await sleep(150);
  recorder.assert(FaseripInitiative._resolveSide(villC()) === "pc" && flag(villC(), "sideOverride") === "pc", "Swap Side moves the villain PC-side via sideOverride", { override: flag(villC(), "sideOverride") });
  await FaseripInitiative.clearSideOverride(villC());
  await sleep(150);
  recorder.assert(FaseripInitiative._resolveSide(villC()) === "npc" && flag(villC(), "sideOverride") == null, "Reset Side returns to the automatic rule");
  recorder.assert(typeof Hooks.events?.getCombatantContextOptions?.length === "number" && Hooks.events.getCombatantContextOptions.length > 0, "Swap Side context entries are registered on getCombatantContextOptions (tracker menu)", { registered: Hooks.events?.getCombatantContextOptions?.length ?? 0 });
}

async function cleanupState(state, keepArtifacts) {
  if (keepArtifacts) return;
  await sleep(1500); // let full-auto death saves from the Health-0 writes finish before the actors vanish
  for (const combat of state.combats.reverse()) { try { await combat.delete(); } catch (e) { console.warn("[FASERIP TEST] Combat cleanup failed", e); } }
  for (const token of state.tokens.reverse()) { try { await token.delete(); } catch (e) { console.warn("[FASERIP TEST] Token cleanup failed", e); } }
  for (const actor of state.actors.reverse()) { try { await actor.delete(); } catch (e) { console.warn("[FASERIP TEST] Actor cleanup failed", e); } }
}

function reportHtml(results) {
  const counts = results.reduce((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {});
  const rows = results.map(r => {
    const color = r.status === "PASS" ? "#2e7d32" : r.status === "SKIP" ? "#8a6d00" : "#b71c1c";
    const details = Object.keys(r.details ?? {}).length ? `<div style="font-size:0.85em;color:#555;overflow-wrap:anywhere;">${foundry.utils.escapeHTML(JSON.stringify(r.details))}</div>` : "";
    return `<li style="margin:4px 0;"><strong style="color:${color};">${r.status}</strong> — ${foundry.utils.escapeHTML(r.name)}${details}</li>`;
  }).join("");
  return `<div style="border:2px solid #555;padding:10px;border-radius:5px;background:#fafafa;">
    <h3 style="margin:0 0 6px;">FASERIP Initiative Runtime Tests</h3>
    <p style="margin:0 0 6px;"><strong>${counts.PASS ?? 0}</strong> passed, <strong>${counts.FAIL ?? 0}</strong> failed, <strong>${counts.SKIP ?? 0}</strong> skipped.</p>
    <ol style="margin:0;padding-left:22px;">${rows}</ol></div>`;
}

/**
 * Run the RAW initiative flow suite.
 * @param {object} options
 * @param {boolean} [options.keepArtifacts=false] Keep the test actors/tokens/combat for inspection.
 * @param {boolean} [options.postChat=true] Whisper a summary card to GMs.
 */
export async function runInitiativeRuntimeTests({ keepArtifacts = false, postChat = true } = {}) {
  if (!game?.ready) throw new Error("Foundry must be fully ready before running tests.");
  if (!game.user?.isGM) throw new Error("Run the initiative runtime tests while logged in as a GM.");
  if (game.system?.id !== SYSTEM_ID) throw new Error(`Expected system ${SYSTEM_ID}, found ${game.system?.id}.`);

  const recorder = makeRecorder();
  const state = { actors: [], tokens: [], combats: [], settings: [] };
  console.group("FASERIP Initiative Runtime Tests");
  try {
    await preserveSetting("useRawTurnPhases", state.settings, true);
    await preserveSetting("initiativeMode", state.settings, FaseripInitiative.MODE_SIDE);
    await preserveSetting("rawAutoRollWhenReady", state.settings, true);
    await preserveSetting("autoRerollInitiative", state.settings, true);
    await preserveSetting("combatSyncEnabled", state.settings, false);
    await preserveSetting("ctt.syncMode", state.settings, "off");
    await runFlow(recorder, state);
  } catch (error) {
    recorder.fail("Initiative suite completed without an uncaught exception", { message: error?.message ?? String(error), stack: error?.stack });
    console.error("[FASERIP TEST] Initiative suite aborted", error);
  } finally {
    await restoreSettings(state.settings);
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
  if (summary.failed > 0) ui.notifications.error(`FASERIP initiative tests: ${summary.failed} failed.`);
  else ui.notifications.info(`FASERIP initiative tests: ${summary.passed} passed${summary.skipped ? `, ${summary.skipped} skipped` : ""}.`);
  return summary;
}
