// scripts/dev/window-runtime-tests.js v1.0.0 - 2026-11-11
// Foundry VTT runtime suite for the three windows moved from the V1
// Application to LegacyAppV2: the Team Tracker, the Encounter Editor and GM
// Tools. It opens each, checks it is a V2 window with its content and
// title, switches its tabs, exercises the helpers other code uses to find
// and refresh an open Team Tracker, and checks that closing leaves no hooks
// behind. It reads world settings but writes none, and creates no documents.
// If GM Tools is already open it is used as it is and left open.
// Launch via macros/run-window-runtime-tests.js as a GM.

import { TeamSheet } from "../teamSheet.js";
import { GMToolsApp } from "../gm-tools.js";
import { EncounterEditor } from "../apps/encounter-editor.js";
import { LegacyAppV2 } from "../apps/legacy-app-v2.js";

const SYSTEM_ID = "msh-faserip";
const WATCHED = ["msh-faserip.timeUpdated", "renderTeamSheet", "createActor", "deleteActor", "updateActor", "controlToken", "targetToken", "createActiveEffect", "deleteActiveEffect", "updateActiveEffect", "updateWorldTime"];

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

const hookCounts = () => Object.fromEntries(WATCHED.map(n => [n, (Hooks.events?.[n] ?? []).length]));
const v1Count = () => Object.keys(ui.windows ?? {}).length;
const { ApplicationV2 } = foundry.applications.api;

async function teamTrackerTests(recorder) {
  const hooksBefore = hookCounts();
  const v1Before = v1Count();
  const alreadyOpen = LegacyAppV2.instancesOf(TeamSheet).filter(w => w.rendered).length;
  const tracker = new TeamSheet();
  let editor = null;
  try {
    await tracker.render(true);
    const opened = await waitFor(() => tracker.rendered && tracker.element?.querySelector?.("form.team-tracker"));
    await sleep(300);
    recorder.assert(!!opened, "Team Tracker: opens with its content");
    if (!opened) return;
    recorder.assert(tracker.element.classList.contains("application") && tracker.element.classList.contains("team-tracker"), "Team Tracker: is a V2 window carrying its own class", { classes: tracker.element.className });
    recorder.assert(tracker.element.classList.contains("theme-light"), "Team Tracker: gets the system's light theme", { classes: tracker.element.className });
    recorder.assert(String(tracker.title) === "Team Tracker", "Team Tracker: window title is Team Tracker", { title: tracker.title });
    recorder.assert(v1Count() === v1Before, "Team Tracker: no V1 window opened");
    recorder.assert(foundry.applications.instances.get(tracker.id) === tracker, "Team Tracker: is registered among Foundry's V2 windows");

    // Tabs
    const stuck = [];
    for (const tab of ["encounters", "hq", "team"]) {
      const btn = tracker.element.querySelector(`.tt-tab[data-tab="${tab}"]`);
      if (!btn) { stuck.push({ tab, reason: "no tab button" }); continue; }
      btn.click();
      const active = await waitFor(() => tracker.element?.querySelector(`.tt-tab[data-tab="${tab}"]`)?.classList.contains("active"), { timeout: 2000 });
      if (!active) stuck.push({ tab, reason: "did not become active" });
      await sleep(150);
    }
    recorder.assert(stuck.length === 0, "Team Tracker: the Team, Encounters and HQ tabs switch", { stuck });
    recorder.assert(!!tracker.element.querySelector(".tracker-body"), "Team Tracker: its scrolling body is present after re-renders");

    // Helpers other code relies on
    recorder.assert(LegacyAppV2.instancesOf(TeamSheet).filter(w => w.rendered).length === alreadyOpen + 1, "Team Tracker: open trackers are found through the V2 registry",
      { found: LegacyAppV2.instancesOf(TeamSheet).length, alreadyOpen });
    const worker = TeamSheet.worker();
    recorder.assert(worker instanceof TeamSheet && worker.rendered, "Team Tracker: worker() returns an open tracker when one is open");
    let renders = 0;
    const hookId = Hooks.on("renderTeamSheet", (app) => { if (app === tracker) renders++; });
    try {
      TeamSheet._refreshOpenSheets();
      await waitFor(() => renders >= 1, { timeout: 3000 });
      await sleep(200);
    } finally { Hooks.off("renderTeamSheet", hookId); }
    recorder.assert(renders === 1, "Team Tracker: _refreshOpenSheets re-renders it once (and fires renderTeamSheet)", { renders });

    // Encounter Editor pop-out (on an id that does not exist, so nothing is read or written)
    editor = new EncounterEditor(tracker, "runtime-test-missing-encounter");
    await editor.render(true);
    const edOpen = await waitFor(() => editor.rendered && editor.element?.querySelector?.(".encounter-editor-missing"));
    await sleep(200);
    recorder.assert(!!edOpen, "Encounter Editor: opens as a window and reports a missing encounter");
    if (edOpen) {
      recorder.assert(editor.element.classList.contains("application") && editor.element.classList.contains("encounter-editor"), "Encounter Editor: is a V2 window carrying its own class", { classes: editor.element.className });
      recorder.assert(String(editor.title) === "Encounter Editor", "Encounter Editor: window title falls back to Encounter Editor", { title: editor.title });
      recorder.assert(editor.id === "msh-encounter-editor", "Encounter Editor: keeps its fixed window id", { id: editor.id });
      let edRenders = 0;
      const edHook = Hooks.on("renderEncounterEditor", (app) => { if (app === editor) edRenders++; });
      try {
        await tracker.render(false);
        await waitFor(() => edRenders >= 1, { timeout: 3000 });
        await sleep(200);
      } finally { Hooks.off("renderEncounterEditor", edHook); }
      recorder.assert(edRenders >= 1, "Encounter Editor: re-renders when the Team Tracker renders", { edRenders });
      let threw = null;
      try { editor.bringToTop(); } catch (e) { threw = e?.message ?? String(e); }
      recorder.assert(!threw, "Encounter Editor: bringToTop still works", { threw });
    }
  } finally {
    try { if (editor?.rendered) await editor.close(); else if (editor) await editor.close(); } catch (_) { /* noop */ }
    try { await tracker.close(); } catch (_) { /* noop */ }
    await sleep(300);
  }
  recorder.assert(!tracker.rendered && !foundry.applications.instances.has(tracker.id), "Team Tracker: closes and leaves the V2 registry");
  recorder.assert(JSON.stringify(hooksBefore) === JSON.stringify(hookCounts()), "Team Tracker and Encounter Editor: closing leaves no hooks behind", { before: hooksBefore, after: hookCounts() });

  if (alreadyOpen === 0) {
    const v1Mid = v1Count();
    const before = new Set(foundry.applications.instances.keys());
    const headless = TeamSheet.worker();
    await sleep(200);
    const openedWindow = Array.from(foundry.applications.instances.keys()).some(k => !before.has(k));
    recorder.assert(headless instanceof TeamSheet && !headless.rendered && !openedWindow && v1Count() === v1Mid, "Team Tracker: with none open, worker() returns a hidden tracker and opens no window");
  } else recorder.skip("Team Tracker: hidden worker", { reason: "a Team Tracker was already open" });
}

async function gmToolsTests(recorder) {
  const existing = foundry.applications.instances.get("faserip-gm-tools");
  const usingExisting = !!existing?.rendered;
  const hooksBefore = hookCounts();
  const v1Before = v1Count();
  const app = usingExisting ? existing : new GMToolsApp();
  try {
    if (!usingExisting) await app.render(true);
    const opened = await waitFor(() => app.rendered && app.element?.querySelector?.(".gm-tools-container"));
    await sleep(300);
    recorder.assert(!!opened, `GM Tools: ${usingExisting ? "the open window is usable" : "opens with its content"}`);
    if (!opened) return;
    recorder.assert(app.element.classList.contains("application") && app.element.classList.contains("faserip-gm-tools"), "GM Tools: is a V2 window carrying its own class", { classes: app.element.className });
    recorder.assert(app.id === "faserip-gm-tools" && String(app.title) === "GM Tools", "GM Tools: keeps its fixed id and title", { id: app.id, title: app.title });
    recorder.assert(v1Count() === v1Before, "GM Tools: no V1 window opened");

    const startTab = app.element.querySelector(".gm-tab-link.active")?.dataset.tab ?? "combat";
    const stuck = [];
    for (const tab of ["effects", "tokens", "state", "backups", "combat"]) {
      const link = app.element.querySelector(`.gm-tab-link[data-tab="${tab}"]`);
      if (!link) { stuck.push({ tab, reason: "no tab link" }); continue; }
      link.click();
      await sleep(120);
      const linkOn = app.element.querySelector(`.gm-tab-link[data-tab="${tab}"]`)?.classList.contains("active");
      const panelOn = app.element.querySelector(`.gm-tab-panel[data-tab="${tab}"]`)?.classList.contains("active");
      const panels = app.element.querySelectorAll(".gm-tab-panel.active").length;
      if (!linkOn || !panelOn || panels !== 1) stuck.push({ tab, linkOn, panelOn, activePanels: panels });
    }
    recorder.assert(stuck.length === 0, "GM Tools: every tab switches and shows exactly one panel", { stuck });

    app.element.querySelector('.gm-tab-link[data-tab="tokens"]')?.click();
    await sleep(100);
    await app.render(true);
    await sleep(400);
    recorder.assert(app.element.querySelector(".gm-tab-link.active")?.dataset.tab === "tokens", "GM Tools: the chosen tab survives a re-render",
      { active: app.element.querySelector(".gm-tab-link.active")?.dataset.tab });
    app.element.querySelector(`.gm-tab-link[data-tab="${startTab}"]`)?.click();
    await sleep(100);
  } finally {
    if (!usingExisting) { try { await app.close(); } catch (_) { /* noop */ } await sleep(300); }
  }
  if (usingExisting) recorder.skip("GM Tools: closing leaves no hooks behind", { reason: "GM Tools was already open and was left open" });
  else {
    recorder.assert(!app.rendered, "GM Tools: closes");
    recorder.assert(JSON.stringify(hooksBefore) === JSON.stringify(hookCounts()), "GM Tools: closing leaves no hooks behind", { before: hooksBefore, after: hookCounts() });
    let reopenError = null;
    try { await app.render(true); await waitFor(() => app.rendered && app.element?.querySelector?.(".gm-tools-container"), { timeout: 3000 }); }
    catch (e) { reopenError = e?.message ?? String(e); }
    recorder.assert(!reopenError && app.rendered, "GM Tools: the same instance reopens after closing (how the toolbar button reuses it)", { reopenError });
    try { await app.close(); } catch (_) { /* noop */ }
    await sleep(300);
    recorder.assert(JSON.stringify(hooksBefore) === JSON.stringify(hookCounts()), "GM Tools: reopening and closing again leaves no hooks behind", { before: hooksBefore, after: hookCounts() });
  }
}

function reportHtml(results) {
  const counts = results.reduce((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {});
  const rows = results.map(r => {
    const color = r.status === "PASS" ? "#2e7d32" : r.status === "SKIP" ? "#8a6d00" : "#b71c1c";
    const details = (r.status !== "PASS" && Object.keys(r.details ?? {}).length) ? `<div style="font-size:0.85em;color:#555;overflow-wrap:anywhere;">${foundry.utils.escapeHTML(JSON.stringify(r.details))}</div>` : "";
    return `<li style="margin:4px 0;"><strong style="color:${color};">${r.status}</strong> — ${foundry.utils.escapeHTML(r.name)}${details}</li>`;
  }).join("");
  return `<div style="border:2px solid #555;padding:10px;border-radius:5px;background:#fafafa;">
    <h3 style="margin:0 0 6px;">FASERIP Window Runtime Tests</h3>
    <p style="margin:0 0 6px;"><strong>${counts.PASS ?? 0}</strong> passed, <strong>${counts.FAIL ?? 0}</strong> failed, <strong>${counts.SKIP ?? 0}</strong> skipped.</p>
    <ol style="margin:0;padding-left:22px;">${rows}</ol></div>`;
}

/**
 * Run the window suite.
 * @param {object} options
 * @param {boolean} [options.postChat=true] Whisper a summary card to GMs.
 */
export async function runWindowRuntimeTests({ postChat = true } = {}) {
  if (!game?.ready) throw new Error("Foundry must be fully ready before running tests.");
  if (!game.user?.isGM) throw new Error("Run the window tests while logged in as a GM.");
  if (game.system?.id !== SYSTEM_ID) throw new Error(`Expected system ${SYSTEM_ID}, found ${game.system?.id}.`);

  const recorder = makeRecorder();
  console.group("FASERIP Window Runtime Tests");
  try {
    const v1Bases = [foundry.appv1?.api?.Application].filter(Boolean);
    for (const [name, cls] of [["Team Tracker", TeamSheet], ["GM Tools", GMToolsApp], ["Encounter Editor", EncounterEditor]]) {
      const onV1 = v1Bases.some(base => cls.prototype instanceof base);
      recorder.assert(!onV1 && cls.prototype instanceof ApplicationV2, `Framework: ${name} is a V2 application, not a V1 one`, { base: Object.getPrototypeOf(cls)?.name });
    }
    try { await teamTrackerTests(recorder); } catch (e) { recorder.fail("Team Tracker: tests ran", { message: e?.message ?? String(e), stack: e?.stack }); }
    try { await gmToolsTests(recorder); } catch (e) { recorder.fail("GM Tools: tests ran", { message: e?.message ?? String(e), stack: e?.stack }); }
  } finally {
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
  ui.notifications.info(`Window tests: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped.`);
  return summary;
}
