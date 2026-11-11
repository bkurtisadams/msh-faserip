// scripts/dev/actor-sheet-runtime-tests.js v1.0.0 - 2026-11-11
// Foundry VTT runtime suite for the character sheet (FaseripActorSheetV2).
// Replaces actor-sheet-parity-tests.js now that the V1 sheet is no longer
// registered. On throwaway actors it checks which sheet class actors get,
// that the sheet renders its controls, tabs and item rows, that every tab
// switches, that field edits save with the submit rules applied, that the
// sheet reopens after closing, and that closing leaves no hooks behind.
// Launch via macros/run-actor-sheet-runtime-tests.js as a GM.

import { FaseripActorSheetV2 } from "../actor-sheet-v2.js";

const SYSTEM_ID = "msh-faserip";
const TEST_PREFIX = "ZZZ Sheet Runtime";
const HOOKS_WATCHED = ["msh-faserip.universalTableRoll", "updateWorldTime", "timeTracker.timeAdvanced"];
const EXPECTED_TABS = ["powers", "talents", "contacts", "equipment", "hardware", "headquarters", "vehicles", "stunts", "actions", "universal-table", "effects", "chargen"];
const KEY_CONTROLS = [
  "name",
  ...["fighting", "agility", "strength", "endurance", "reason", "intuition", "psyche"].flatMap(a => [`system.abilities.${a}.rank`, `system.abilities.${a}.value`]),
  "system.attributes.health.value", "system.attributes.karma.value",
  "system.attributes.resources.rank", "system.attributes.resources.value"
];

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
    if (status === "PASS") logger(`[FASERIP TEST] ${status} | ${name}`);
    else logger(`[FASERIP TEST] ${status} | ${name} | ${JSON.stringify(entry.details)}`);
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
  { name: "Runtime Blast", type: "power", system: { rank: "Incredible", value: 40 } },
  { name: "Runtime Armor", type: "power", system: { rank: "Good", value: 10 } },
  { name: "Runtime Talent", type: "talent", system: {} },
  { name: "Runtime Club", type: "equipment", system: { category: "weapon", damageType: "BA", damage: "10", materialStrength: "Good" } }
];

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
const content = (sheet) => sheet.element?.querySelector?.(".window-content") ?? sheet.element ?? null;

function hookCounts() {
  const out = {};
  for (const name of HOOKS_WATCHED) out[name] = (Hooks.events?.[name] ?? []).length;
  return out;
}

async function openSheet(actor) {
  const sheet = actor.sheet;
  await sheet.render({ force: true });
  const ok = await waitFor(() => sheet.rendered && content(sheet)?.querySelector?.('[name="name"]'));
  await sleep(300);
  return { sheet, ok: !!ok };
}

async function closeSheet(sheet) {
  try { await sheet.close(); } catch (e) { console.warn("[FASERIP TEST] close failed", e?.message ?? e); }
  await sleep(200);
}

async function applyEdit(sheet, actor, edit) {
  await actor.update(foundry.utils.deepClone(BASELINE));
  await sleep(250);
  const el = content(sheet)?.querySelector(`[name="${edit.field}"]`);
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

function reportHtml(results) {
  const counts = results.reduce((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {});
  const rows = results.map(r => {
    const color = r.status === "PASS" ? "#2e7d32" : r.status === "SKIP" ? "#8a6d00" : "#b71c1c";
    const details = (r.status !== "PASS" && Object.keys(r.details ?? {}).length) ? `<div style="font-size:0.85em;color:#555;overflow-wrap:anywhere;">${foundry.utils.escapeHTML(JSON.stringify(r.details))}</div>` : "";
    return `<li style="margin:4px 0;"><strong style="color:${color};">${r.status}</strong> — ${foundry.utils.escapeHTML(r.name)}${details}</li>`;
  }).join("");
  return `<div style="border:2px solid #555;padding:10px;border-radius:5px;background:#fafafa;">
    <h3 style="margin:0 0 6px;">FASERIP Character Sheet Runtime Tests</h3>
    <p style="margin:0 0 6px;"><strong>${counts.PASS ?? 0}</strong> passed, <strong>${counts.FAIL ?? 0}</strong> failed, <strong>${counts.SKIP ?? 0}</strong> skipped.</p>
    <ol style="margin:0;padding-left:22px;">${rows}</ol></div>`;
}

/**
 * Run the character sheet suite.
 * @param {object} options
 * @param {boolean} [options.keepArtifacts=false] Keep the test actors for inspection.
 * @param {boolean} [options.postChat=true] Whisper a summary card to GMs.
 */
export async function runActorSheetRuntimeTests({ keepArtifacts = false, postChat = true } = {}) {
  if (!game?.ready) throw new Error("Foundry must be fully ready before running tests.");
  if (!game.user?.isGM) throw new Error("Run the character sheet tests while logged in as a GM.");
  if (game.system?.id !== SYSTEM_ID) throw new Error(`Expected system ${SYSTEM_ID}, found ${game.system?.id}.`);

  const recorder = makeRecorder();
  const actors = [];
  let sheet = null;

  console.group("FASERIP Character Sheet Runtime Tests");
  try {
    const ActorClass = Actor.implementation ?? Actor;
    const make = async (type, extra = {}) => {
      const a = await ActorClass.create({ ...foundry.utils.deepClone(BASELINE), name: `${BASELINE.name} ${type} ${Date.now()}`, type, items: ITEMS, ...extra });
      if (!a) throw new Error(`Could not create the ${type} test actor.`);
      actors.push(a);
      return a;
    };
    const actor = await make("hero");
    BASELINE.name = actor.name;

    // Which sheet actors get
    recorder.assert(actor.sheet instanceof FaseripActorSheetV2, "Registration: a hero opens with the V2 sheet", { got: actor.sheet?.constructor?.name });
    for (const type of ["villain", "npc"]) {
      const other = await make(type);
      recorder.assert(other.sheet instanceof FaseripActorSheetV2, `Registration: a ${type} opens with the V2 sheet`, { got: other.sheet?.constructor?.name });
    }
    const legacy = await make("hero", { flags: { core: { sheetClass: "msh-faserip.FaseripActorSheet" } } });
    recorder.assert(legacy.sheet instanceof FaseripActorSheetV2, "Registration: an actor that was assigned the V1 sheet falls back to the V2 sheet", { got: legacy.sheet?.constructor?.name });
    recorder.assert(!game.settings.settings.has(`${SYSTEM_ID}.useActorSheetV2`), "Registration: the Use V2 Character Sheet setting is gone");

    // Render
    const hooksBefore = hookCounts();
    const opened = await openSheet(actor);
    sheet = opened.sheet;
    recorder.assert(opened.ok, "Render: sheet opens");
    if (opened.ok) {
      const root = content(sheet);
      const missing = KEY_CONTROLS.filter(n => !root.querySelector(`[name="${n}"]`));
      recorder.assert(missing.length === 0, "Render: the core controls are present", { missing });
      const navTabs = Array.from(root.querySelectorAll(".sheet-tabs-navigation .item[data-tab]")).map(a => a.dataset.tab);
      const panels = Array.from(root.querySelectorAll(".sheet-tab-content .tab[data-tab]")).map(t => t.dataset.tab);
      recorder.assert(JSON.stringify(navTabs) === JSON.stringify(EXPECTED_TABS), "Render: the twelve tabs are listed in order", { navTabs });
      recorder.assert(EXPECTED_TABS.every(t => panels.includes(t)) && panels.length === EXPECTED_TABS.length, "Render: every tab has its panel, Hardware included",
        { missing: EXPECTED_TABS.filter(t => !panels.includes(t)), extra: panels.filter(t => !EXPECTED_TABS.includes(t)) });
      const rows = (tab) => root.querySelectorAll(`.sheet-tab-content .tab[data-tab="${tab}"] [data-item-id]`).length;
      recorder.assert(rows("powers") >= 2 && rows("talents") >= 1 && rows("equipment") >= 1, "Render: item rows appear on the Powers, Talents and Equipment tabs",
        { powers: rows("powers"), talents: rows("talents"), equipment: rows("equipment") });

      // Tabs
      const stuck = [];
      for (const tab of EXPECTED_TABS) {
        content(sheet).querySelector(`.sheet-tabs-navigation .item[data-tab="${tab}"]`)?.click();
        await sleep(120);
        const r = content(sheet);
        const navActive = r.querySelector(`.sheet-tabs-navigation .item[data-tab="${tab}"]`)?.classList.contains("active");
        const panelActive = r.querySelector(`.sheet-tab-content .tab[data-tab="${tab}"]`)?.classList.contains("active");
        const others = r.querySelectorAll(".sheet-tab-content .tab.active").length;
        if (!navActive || !panelActive || others !== 1) stuck.push({ tab, navActive, panelActive, activePanels: others });
      }
      recorder.assert(stuck.length === 0, "Tabs: every tab switches and shows exactly one panel", { stuck });

      // Edits
      content(sheet).querySelector('.sheet-tabs-navigation .item[data-tab="talents"]')?.click();
      await sleep(120);
      for (const edit of EDITS) {
        let o;
        try { o = await applyEdit(sheet, actor, edit); } catch (e) { o = { error: e?.message ?? String(e) }; }
        if (o.found === false) recorder.skip(`Edits: ${edit.label}`, { reason: "control not found" });
        else recorder.assert(o.saved === true, `Edits: ${edit.label} saves ${JSON.stringify(edit.expect)}`, o);
      }
      const tabAfterEdits = content(sheet).querySelector(".sheet-tabs-navigation .item.active")?.dataset.tab;
      recorder.assert(tabAfterEdits === "talents", "Edits: the sheet stays on the Talents tab through the re-renders", { tabAfterEdits });

      // Close and reopen
      await closeSheet(sheet);
      recorder.assert(JSON.stringify(hooksBefore) === JSON.stringify(hookCounts()), "Close: the sheet leaves no hooks behind", { before: hooksBefore, after: hookCounts() });
      const again = await openSheet(actor);
      sheet = again.sheet;
      recorder.assert(again.ok && !!content(sheet)?.querySelector('[name="system.abilities.fighting.rank"]'), "Close: the sheet reopens with its controls");
      await closeSheet(sheet);
      sheet = null;
      recorder.assert(JSON.stringify(hooksBefore) === JSON.stringify(hookCounts()), "Close: hook counts are back where the run started", { before: hooksBefore, after: hookCounts() });
    }
  } catch (error) {
    recorder.fail("Character sheet suite completed without an uncaught exception", { message: error?.message ?? String(error), stack: error?.stack });
    console.error("[FASERIP TEST] Character sheet suite aborted", error);
  } finally {
    if (sheet) await closeSheet(sheet);
    if (!keepArtifacts) for (const a of actors.reverse()) { try { await a.delete(); } catch (e) { console.warn("[FASERIP TEST] Actor cleanup failed", e); } }
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
  ui.notifications.info(`Character sheet tests: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped.`);
  return summary;
}
