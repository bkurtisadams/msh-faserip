// scripts/dev/actor-sheet-parity-tests.js v1.0.0 - 2026-11-11
// Foundry VTT runtime suite: opens the V1 character sheet and the V2
// character sheet on the same throwaway actor and compares them. It checks
// that both render the same named controls, tabs and item rows, that the
// same edits made through each sheet leave the actor in the same state, and
// that closing each sheet leaves no hooks behind. Differences are reported as
// FAIL so they can be fixed before the V2 sheet becomes the default.
// Launch via macros/run-actor-sheet-parity-tests.js as a GM.

import { FaseripActorSheet } from "../actorSheet.js";
import { FaseripActorSheetV2 } from "../actor-sheet-v2.js";

const SYSTEM_ID = "msh-faserip";
const TEST_PREFIX = "ZZZ Sheet Parity";
const HOOKS_WATCHED = ["msh-faserip.universalTableRoll", "updateWorldTime", "timeTracker.timeAdvanced"];
const LIST_LIMIT = 12;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitFor(predicate, { timeout = 5000, interval = 50 } = {}) {
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

const BASELINE = {
  name: `${TEST_PREFIX} Hero`,
  system: {
    abilities: {
      fighting: { rank: "Remarkable", value: 30 }, agility: { rank: "Excellent", value: 20 },
      strength: { rank: "Good", value: 10 }, endurance: { rank: "Remarkable", value: 30 },
      reason: { rank: "Typical", value: 6 }, intuition: { rank: "Good", value: 10 }, psyche: { rank: "Good", value: 10 }
    },
    attributes: { resources: { rank: "Typical", value: 6 } }
  }
};

const ITEMS = [
  { name: "Parity Blast", type: "power", system: { rank: "Incredible", value: 40 } },
  { name: "Parity Armor", type: "power", system: { rank: "Good", value: 10 } },
  { name: "Parity Talent", type: "talent", system: {} },
  { name: "Parity Club", type: "equipment", system: { category: "weapon", damageType: "BA", damage: "10", materialStrength: "Good" } }
];

function hookCounts() {
  const out = {};
  for (const name of HOOKS_WATCHED) out[name] = (Hooks.events?.[name] ?? []).length;
  return out;
}

async function openSheet(kind, actor) {
  if (kind === "V1") {
    const sheet = new FaseripActorSheet(actor, { left: 60, top: 60 });
    sheet.render(true);
    const ok = await waitFor(() => sheet.rendered && sheet.element?.[0]?.querySelector?.('[name="name"]'));
    return { kind, sheet, ok: !!ok, root: () => sheet.element?.[0] ?? null };
  }
  const sheet = new FaseripActorSheetV2({ document: actor, position: { left: 820, top: 60 } });
  await sheet.render({ force: true });
  const ok = await waitFor(() => sheet.rendered && sheet.element?.querySelector?.('[name="name"]'));
  return { kind, sheet, ok: !!ok, root: () => sheet.element ?? null };
}

async function closeSheet(handle) {
  try { await handle.sheet.close(); } catch (e) { console.warn("[FASERIP TEST] close failed", e); }
  await sleep(150);
}

function describeControl(el) {
  const type = el.tagName === "INPUT" ? (el.type || "text") : el.tagName.toLowerCase();
  const value = (type === "checkbox" || type === "radio") ? (el.checked ? "checked" : "unchecked") : String(el.value ?? "");
  return `${type}|${el.disabled ? "disabled" : "enabled"}|${value}`;
}

function snapshot(root) {
  const controls = {};
  for (const el of root.querySelectorAll("[name]")) {
    if (!el.name || !["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) continue;
    (controls[el.name] ??= []).push(describeControl(el));
  }
  const navTabs = Array.from(root.querySelectorAll(".sheet-tabs-navigation .item[data-tab]")).map(a => a.dataset.tab);
  const panels = Array.from(root.querySelectorAll(".sheet-tab-content .tab[data-tab]")).map(t => t.dataset.tab);
  const activeNav = root.querySelector(".sheet-tabs-navigation .item.active")?.dataset.tab ?? null;
  const itemRows = {};
  for (const el of root.querySelectorAll("[data-item-id]")) {
    const tab = el.closest(".tab[data-tab]")?.dataset.tab ?? "(outside tabs)";
    itemRows[tab] = (itemRows[tab] ?? 0) + 1;
  }
  return {
    controls, navTabs, panels, activeNav, itemRows,
    rollables: root.querySelectorAll(".rollable").length,
    buttons: root.querySelectorAll("button, a[data-action], [data-action]").length
  };
}

function compareSnapshots(recorder, a, b) {
  const namesA = Object.keys(a.controls), namesB = Object.keys(b.controls);
  const onlyV1 = namesA.filter(n => !(n in b.controls));
  const onlyV2 = namesB.filter(n => !(n in a.controls));
  recorder.assert(onlyV1.length === 0 && onlyV2.length === 0, `Render: both sheets have the same named controls (${namesA.length} on V1, ${namesB.length} on V2)`,
    { onlyOnV1: onlyV1.slice(0, LIST_LIMIT), onlyOnV2: onlyV2.slice(0, LIST_LIMIT), onlyOnV1Count: onlyV1.length, onlyOnV2Count: onlyV2.length });

  const differing = namesA.filter(n => n in b.controls && JSON.stringify(a.controls[n]) !== JSON.stringify(b.controls[n]));
  recorder.assert(differing.length === 0, "Render: shared controls show the same type, state and value",
    { count: differing.length, examples: differing.slice(0, LIST_LIMIT).map(n => ({ name: n, v1: a.controls[n], v2: b.controls[n] })) });

  recorder.assert(JSON.stringify(a.navTabs) === JSON.stringify(b.navTabs), "Render: both sheets list the same tabs in the same order", { v1: a.navTabs, v2: b.navTabs });
  recorder.assert(JSON.stringify(a.panels) === JSON.stringify(b.panels), "Render: both sheets have the same tab panels", { v1: a.panels, v2: b.panels });
  recorder.assert(a.activeNav === b.activeNav, "Render: both sheets open on the same tab", { v1: a.activeNav, v2: b.activeNav });
  recorder.assert(JSON.stringify(a.itemRows) === JSON.stringify(b.itemRows), "Render: both sheets show the same item rows per tab", { v1: a.itemRows, v2: b.itemRows });
  recorder.assert(a.rollables === b.rollables && a.buttons === b.buttons, "Render: both sheets have the same number of rollable elements and buttons",
    { v1: { rollables: a.rollables, buttons: a.buttons }, v2: { rollables: b.rollables, buttons: b.buttons } });
}

const EDITS = [
  { label: "rename", field: "name", value: `${TEST_PREFIX} Renamed`,
    read: a => ({ name: a.name }), expect: { name: `${TEST_PREFIX} Renamed` } },
  { label: "Fighting rank to Incredible", field: "system.abilities.fighting.rank", value: "Incredible",
    read: a => ({ ...a.system.abilities.fighting }), expect: { rank: "Incredible", value: 40 } },
  { label: "Fighting number to 36", field: "system.abilities.fighting.value", value: "36",
    read: a => ({ ...a.system.abilities.fighting }), expect: { rank: "Incredible", value: 36 } },
  { label: "Strength rank to Feeble", field: "system.abilities.strength.rank", value: "Feeble",
    read: a => ({ ...a.system.abilities.strength }), expect: { rank: "Feeble", value: 2 } },
  { label: "Resources rank to Excellent", field: "system.attributes.resources.rank", value: "Excellent",
    read: a => ({ rank: a.system.attributes.resources.rank, value: a.system.attributes.resources.value }), expect: { rank: "Excellent", value: 20 } }
];

const pickKeys = (obj, like) => Object.fromEntries(Object.keys(like).map(k => [k, obj?.[k]]));

async function applyEdit(handle, actor, edit) {
  await actor.update(foundry.utils.deepClone(BASELINE));
  await sleep(250);
  const el = handle.root()?.querySelector(`[name="${edit.field}"]`);
  if (!el) return { found: false };
  if (el.disabled) return { found: true, disabled: true };
  el.focus?.();
  el.value = edit.value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  const saved = await waitFor(() => JSON.stringify(pickKeys(edit.read(actor), edit.expect)) === JSON.stringify(edit.expect), { timeout: 2500 });
  await sleep(250);
  return { found: true, saved: !!saved, result: pickKeys(edit.read(actor), edit.expect) };
}

async function switchTab(handle, tab) {
  const nav = handle.root()?.querySelector(`.sheet-tabs-navigation .item[data-tab="${tab}"]`);
  if (!nav) return { found: false };
  nav.click();
  await sleep(200);
  const root = handle.root();
  return {
    found: true,
    navActive: root.querySelector(`.sheet-tabs-navigation .item[data-tab="${tab}"]`)?.classList.contains("active") ?? false,
    panelActive: root.querySelector(`.sheet-tab-content .tab[data-tab="${tab}"]`)?.classList.contains("active") ?? false
  };
}

function reportHtml(results) {
  const counts = results.reduce((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {});
  const rows = results.map(r => {
    const color = r.status === "PASS" ? "#2e7d32" : r.status === "SKIP" ? "#8a6d00" : "#b71c1c";
    const details = (r.status !== "PASS" && Object.keys(r.details ?? {}).length) ? `<div style="font-size:0.85em;color:#555;overflow-wrap:anywhere;">${foundry.utils.escapeHTML(JSON.stringify(r.details))}</div>` : "";
    return `<li style="margin:4px 0;"><strong style="color:${color};">${r.status}</strong> — ${foundry.utils.escapeHTML(r.name)}${details}</li>`;
  }).join("");
  return `<div style="border:2px solid #555;padding:10px;border-radius:5px;background:#fafafa;">
    <h3 style="margin:0 0 6px;">FASERIP Sheet Parity: V1 vs V2</h3>
    <p style="margin:0 0 6px;"><strong>${counts.PASS ?? 0}</strong> passed, <strong>${counts.FAIL ?? 0}</strong> failed, <strong>${counts.SKIP ?? 0}</strong> skipped.</p>
    <ol style="margin:0;padding-left:22px;">${rows}</ol></div>`;
}

/**
 * Compare the V1 and V2 character sheets.
 * @param {object} options
 * @param {boolean} [options.keepArtifacts=false] Keep the test actor for inspection.
 * @param {boolean} [options.postChat=true] Whisper a summary card to GMs.
 */
export async function runActorSheetParityTests({ keepArtifacts = false, postChat = true } = {}) {
  if (!game?.ready) throw new Error("Foundry must be fully ready before running tests.");
  if (!game.user?.isGM) throw new Error("Run the sheet parity tests while logged in as a GM.");
  if (game.system?.id !== SYSTEM_ID) throw new Error(`Expected system ${SYSTEM_ID}, found ${game.system?.id}.`);

  const recorder = makeRecorder();
  let actor = null;
  const open = [];

  console.group("FASERIP Sheet Parity: V1 vs V2");
  try {
    const ActorClass = Actor.implementation ?? Actor;
    actor = await ActorClass.create({ ...foundry.utils.deepClone(BASELINE), name: `${BASELINE.name} ${Date.now()}`, type: "hero", items: ITEMS });
    if (!actor) throw new Error("Could not create the test actor.");
    BASELINE.name = actor.name;

    // Render
    const hooksBefore = hookCounts();
    const v1 = await openSheet("V1", actor); open.push(v1);
    recorder.assert(v1.ok, "Render: V1 sheet opens");
    const v2 = await openSheet("V2", actor); open.push(v2);
    recorder.assert(v2.ok, "Render: V2 sheet opens");
    await sleep(400);

    if (v1.ok && v2.ok) {
      compareSnapshots(recorder, snapshot(v1.root()), snapshot(v2.root()));

      // Tabs
      const tabs = snapshot(v1.root()).navTabs;
      const target = tabs.find(t => t === "talents") ?? tabs[1];
      if (!target) recorder.skip("Tabs: switching", { reason: "no second tab found" });
      else {
        for (const h of [v1, v2]) {
          const r = await switchTab(h, target);
          recorder.assert(r.found && r.navActive && r.panelActive, `Tabs: ${h.kind} switches to the ${target} tab`, r);
        }
      }
    }

    // Edits: one sheet open at a time so each save is that sheet's alone.
    for (const h of open.splice(0)) await closeSheet(h);
    const outcomes = { V1: {}, V2: {} };
    for (const kind of ["V1", "V2"]) {
      const h = await openSheet(kind, actor); open.push(h);
      if (!h.ok) { recorder.fail(`Edits: ${kind} sheet opens`); continue; }
      await sleep(300);
      for (const edit of EDITS) {
        try { outcomes[kind][edit.label] = await applyEdit(h, actor, edit); }
        catch (e) { outcomes[kind][edit.label] = { error: e?.message ?? String(e) }; }
      }
      await closeSheet(h); open.pop();
    }
    for (const edit of EDITS) {
      const a = outcomes.V1[edit.label], b = outcomes.V2[edit.label];
      if (!a?.found || !b?.found) {
        recorder.skip(`Edits: ${edit.label}`, { reason: "control not found on a sheet", v1: a, v2: b });
        continue;
      }
      for (const [kind, o] of [["V1", a], ["V2", b]]) {
        recorder.assert(o.saved === true, `Edits: ${kind} ${edit.label} saves ${JSON.stringify(edit.expect)}`, o);
      }
      recorder.assert(JSON.stringify(a.result) === JSON.stringify(b.result), `Edits: ${edit.label} leaves the actor the same through both sheets`, { v1: a.result, v2: b.result });
    }

    // Hooks left behind by open + close.
    for (const kind of ["V1", "V2"]) {
      const before = hookCounts();
      const h = await openSheet(kind, actor);
      await sleep(400);
      const during = hookCounts();
      await closeSheet(h);
      await sleep(200);
      const after = hookCounts();
      recorder.assert(JSON.stringify(before) === JSON.stringify(after), `Close: ${kind} sheet leaves no hooks behind`, { before, during, after });
    }
    recorder.assert(JSON.stringify(hooksBefore) === JSON.stringify(hookCounts()), "Close: hook counts are back where the run started", { before: hooksBefore, after: hookCounts() });
  } catch (error) {
    recorder.fail("Sheet parity suite completed without an uncaught exception", { message: error?.message ?? String(error), stack: error?.stack });
    console.error("[FASERIP TEST] Sheet parity suite aborted", error);
  } finally {
    for (const h of open) await closeSheet(h);
    if (actor && !keepArtifacts) { try { await actor.delete(); } catch (e) { console.warn("[FASERIP TEST] Actor cleanup failed", e); } }
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
  ui.notifications.info(`Sheet parity: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped.`);
  return summary;
}
