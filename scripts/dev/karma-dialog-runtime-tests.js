// scripts/dev/karma-dialog-runtime-tests.js v1.0.0 - 2026-11-11
// Foundry VTT runtime suite for the Karma dialogs. On a throwaway hero it
// opens the Karma History window and drives its dialogs from the window's
// own controls: Add Karma (adds an entry), Spend Karma (adds a negative
// entry), Edit Karma Entry (changes a description), Confirm Deletion
// (cancel keeps the entry, delete removes it) and Clear All Karma Data
// (cancel keeps the history). It checks each opens as a V2 dialog, that no
// V1 window opens for any of them, and that no dialog content carries a
// nested form. The team Karma pool and advancement dialogs are not covered:
// they write world settings.
// Launch via macros/run-karma-dialog-runtime-tests.js as a GM.

import { KarmaSheetV2 } from "../karma-sheet-v2.js";

const SYSTEM_ID = "msh-faserip";
const TEST_PREFIX = "ZZZ Karma Runtime";

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

const v2Dialogs = () => Array.from(foundry.applications.instances?.values?.() ?? [])
  .filter(a => a?.element?.tagName === "DIALOG" || a?.options?.classes?.includes?.("faserip-shim-dialog") || a?.constructor?.name === "DialogV2");
const titleOf = (d) => d?.options?.window?.title ?? d?.title ?? "";
const history = (actor) => actor.system.karma?.history ?? [];

async function openDialogFrom(trigger) {
  const before = new Set(v2Dialogs());
  const v1Before = Object.keys(ui.windows ?? {}).length;
  trigger.click();
  const dialog = await waitFor(() => v2Dialogs().find(a => !before.has(a) && a.rendered), { timeout: 3000 });
  await sleep(200);
  return { dialog: dialog || null, v1Opened: Object.keys(ui.windows ?? {}).length - v1Before };
}

async function closeDialog(dialog) {
  if (!dialog?.rendered) return;
  try { await dialog.close(); } catch (_) { /* noop */ }
  await waitFor(() => !dialog.rendered, { timeout: 2000 });
  await sleep(150);
}

const setField = (dialog, name, value) => {
  const el = dialog.element.querySelector(`[name="${name}"]`);
  if (!el) return false;
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
};

const press = async (dialog, action) => {
  const btn = dialog.element.querySelector(`[data-action="${action}"]`);
  if (!btn) return false;
  btn.click();
  await waitFor(() => !dialog.rendered, { timeout: 3000 });
  await sleep(350);
  return true;
};

function reportHtml(results) {
  const counts = results.reduce((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {});
  const rows = results.map(r => {
    const color = r.status === "PASS" ? "#2e7d32" : r.status === "SKIP" ? "#8a6d00" : "#b71c1c";
    const details = (r.status !== "PASS" && Object.keys(r.details ?? {}).length) ? `<div style="font-size:0.85em;color:#555;overflow-wrap:anywhere;">${foundry.utils.escapeHTML(JSON.stringify(r.details))}</div>` : "";
    return `<li style="margin:4px 0;"><strong style="color:${color};">${r.status}</strong> — ${foundry.utils.escapeHTML(r.name)}${details}</li>`;
  }).join("");
  return `<div style="border:2px solid #555;padding:10px;border-radius:5px;background:#fafafa;">
    <h3 style="margin:0 0 6px;">FASERIP Karma Dialog Runtime Tests</h3>
    <p style="margin:0 0 6px;"><strong>${counts.PASS ?? 0}</strong> passed, <strong>${counts.FAIL ?? 0}</strong> failed, <strong>${counts.SKIP ?? 0}</strong> skipped.</p>
    <ol style="margin:0;padding-left:22px;">${rows}</ol></div>`;
}

/**
 * Run the Karma dialog suite.
 * @param {object} options
 * @param {boolean} [options.keepArtifacts=false] Keep the test actor for inspection.
 * @param {boolean} [options.postChat=true] Whisper a summary card to GMs.
 */
export async function runKarmaDialogRuntimeTests({ keepArtifacts = false, postChat = true } = {}) {
  if (!game?.ready) throw new Error("Foundry must be fully ready before running tests.");
  if (!game.user?.isGM) throw new Error("Run the Karma dialog tests while logged in as a GM.");
  if (game.system?.id !== SYSTEM_ID) throw new Error(`Expected system ${SYSTEM_ID}, found ${game.system?.id}.`);

  const recorder = makeRecorder();
  let actor = null;
  let sheet = null;
  let v1Total = 0;
  const nested = [];
  const stray = [];

  console.group("FASERIP Karma Dialog Runtime Tests");
  try {
    const ActorClass = Actor.implementation ?? Actor;
    const seed = { timestamp: new Date().toISOString(), realDate: new Date().toLocaleDateString(), gameDate: "", amount: 200, type: "Custom", description: "Runtime seed" };
    actor = await ActorClass.create({
      name: `${TEST_PREFIX} ${Date.now()}`, type: "hero",
      system: { karma: { history: [seed], lifetime: 200 }, attributes: { karma: { value: 200 } } }
    });
    if (!actor) throw new Error("Could not create the test actor.");

    sheet = new KarmaSheetV2(actor);
    await sheet.render(true);
    const opened = await waitFor(() => sheet.rendered && sheet.element?.querySelector?.(".add-karma"));
    await sleep(300);
    recorder.assert(!!opened, "Karma window: opens with its Add Karma control");
    if (!opened) throw new Error("Karma window did not open.");
    const root = () => sheet.element;

    const open = async (label, selector, expectTitle) => {
      const trigger = root().querySelector(selector);
      if (!trigger) { recorder.skip(`${label}: opens`, { reason: `no ${selector} control` }); return null; }
      const r = await openDialogFrom(trigger);
      v1Total += r.v1Opened;
      recorder.assert(!!r.dialog && expectTitle.test(titleOf(r.dialog)), `${label}: opens as a V2 dialog`, { title: titleOf(r.dialog), v1Opened: r.v1Opened });
      if (r.dialog) {
        stray.push(r.dialog);
        const inner = r.dialog.element.querySelectorAll(".dialog-content form, .window-content form form").length;
        if (inner) nested.push(label);
      }
      return r.dialog;
    };

    // Add Karma
    let d = await open("Add Karma", ".add-karma", /^Add Karma$/i);
    if (d) {
      const before = history(actor).length;
      const ok = setField(d, "eventType", "Custom") && setField(d, "amount", "60") && setField(d, "description", "Runtime add");
      recorder.assert(ok, "Add Karma: event type, amount and description fields are present");
      await press(d, "add");
      const added = await waitFor(() => history(actor).length === before + 1, { timeout: 3000 });
      const last = history(actor).at(-1);
      recorder.assert(!!added && last?.amount === 60 && last?.type === "Custom" && last?.description === "Runtime add",
        "Add Karma: Add records a +60 Custom entry", { last });
      await closeDialog(d);
    }

    // Spend Karma
    d = await open("Spend Karma", ".spend-karma", /^Spend Karma$/i);
    if (d) {
      const before = history(actor).length;
      const type = d.element.querySelector('[name="spendType"]');
      const plain = Array.from(type?.options ?? []).find(o => !/Advancement|Addition/i.test(o.value) && o.value);
      if (plain) setField(d, "spendType", plain.value);
      const ok = setField(d, "amount", "10") && setField(d, "description", "Runtime spend");
      recorder.assert(!!type && ok, "Spend Karma: type, amount and description fields are present", { type: plain?.value });
      await press(d, "spend");
      const spent = await waitFor(() => history(actor).length === before + 1, { timeout: 3000 });
      const last = history(actor).at(-1);
      recorder.assert(!!spent && last?.amount === -10, "Spend Karma: Spend records a -10 entry", { last });
      await closeDialog(d);
    }
    await sleep(300);

    // Edit Karma Entry
    d = await open("Edit Karma Entry", ".edit-karma", /Edit Karma Entry/i);
    if (d) {
      const had = setField(d, "description", "Runtime edited");
      recorder.assert(had, "Edit Karma Entry: description field is present");
      await press(d, "save");
      const edited = await waitFor(() => history(actor).some(e => e.description === "Runtime edited"), { timeout: 3000 });
      recorder.assert(!!edited, "Edit Karma Entry: Save changes the entry's description", { descriptions: history(actor).map(e => e.description) });
      await closeDialog(d);
    }
    await sleep(300);

    // Confirm Deletion: cancel, then delete
    d = await open("Confirm Deletion", ".delete-karma", /Confirm Deletion/i);
    if (d) {
      const before = history(actor).length;
      await press(d, "cancel");
      recorder.assert(history(actor).length === before, "Confirm Deletion: Cancel keeps the entry");
      await closeDialog(d);
      d = await open("Confirm Deletion (again)", ".delete-karma", /Confirm Deletion/i);
      if (d) {
        await press(d, "delete");
        const gone = await waitFor(() => history(actor).length === before - 1, { timeout: 3000 });
        recorder.assert(!!gone, "Confirm Deletion: Delete removes the entry", { before, after: history(actor).length });
        await closeDialog(d);
      }
    }
    await sleep(300);

    // Clear All Karma Data: cancel only
    d = await open("Clear All Karma Data", ".clear-karma", /Clear All Karma Data/i);
    if (d) {
      const before = history(actor).length;
      await press(d, "cancel");
      recorder.assert(history(actor).length === before && before > 0, "Clear All Karma Data: Cancel keeps the history", { entries: history(actor).length });
      await closeDialog(d);
    }

    recorder.assert(v1Total === 0, "No V1 window opened for any Karma dialog", { v1Opened: v1Total });
    recorder.assert(nested.length === 0, "No Karma dialog carries a form inside its content", { nested });
  } catch (error) {
    recorder.fail("Karma dialog suite completed without an uncaught exception", { message: error?.message ?? String(error), stack: error?.stack });
    console.error("[FASERIP TEST] Karma dialog suite aborted", error);
  } finally {
    for (const dlg of stray) await closeDialog(dlg);
    if (sheet) { try { await sheet.close(); } catch (_) { /* noop */ } }
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
  ui.notifications.info(`Karma dialog tests: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped.`);
  return summary;
}
