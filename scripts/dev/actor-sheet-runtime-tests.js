// scripts/dev/actor-sheet-runtime-tests.js v1.6.0 - 2026-11-11
// v1.6.0: Sheet dialogs. Opens the Delete Power confirmation (cancel, then
//         delete), Talent Information, Equipment Information and Recovery &
//         Rest from the sheet's own controls, and checks each is a V2 dialog
//         and that no V1 window opens.
// scripts/dev/actor-sheet-runtime-tests.js v1.5.0 - 2026-11-11
// v1.5.0: Checks that neither legacy sheet class extends Foundry's V1
//         framework, that opening a sheet logs no V1 deprecation warning,
//         and that actor.sheet offers _rollVehicleControl for the
//         vehicle-control hotbar macros.
// scripts/dev/actor-sheet-runtime-tests.js v1.4.0 - 2026-11-11
// v1.4.0: Checks that the edited field keeps keyboard focus through the
//         re-render, drops an item on an item tab (the tab drop-zone path)
//         as well as on the sheet body, and drops a passenger on the vehicle.
// scripts/dev/actor-sheet-runtime-tests.js v1.3.0 - 2026-11-11
// v1.3.0: Vehicle sheet: quick damage button, dropping an actor on the
//         Driver slot and removing them again, and (on the V2 shell) that
//         the window does not pick up the character sheet's window styling.
// scripts/dev/actor-sheet-runtime-tests.js v1.2.0 - 2026-11-11
// v1.2.0: The History editor steps work with both the old V1 editor block
//         and the V2 <prose-mirror> element, report which one is on the
//         sheet, and check that saving makes exactly one actor update.
// scripts/dev/actor-sheet-runtime-tests.js v1.1.1 - 2026-11-11
// v1.1.1: The History editor lives in the Bio panel, which is closed by
//         default, so the first run skipped it. The suite now opens Bio,
//         edits a Bio field, runs the editor steps and closes Bio again.
//         Adds an explicit form submit (the Enter-key path) saving once.
// scripts/dev/actor-sheet-runtime-tests.js v1.1.0 - 2026-11-11
// v1.1.0: Covers what the next port steps touch, so there is a baseline
//         before they change: one actor update per edit, the portrait file
//         picker, the History rich-text editor (open, type, save), dropping
//         an item onto the sheet, the read-only rendering of a sheet that is
//         not editable, and the vehicle sheet (open, tabs, edit, close).
// Foundry VTT runtime suite for the character sheet (FaseripActorSheetV2).
// Replaces actor-sheet-parity-tests.js now that the V1 sheet is no longer
// registered. On throwaway actors it checks which sheet class actors get,
// that the sheet renders its controls, tabs and item rows, that every tab
// switches, that field edits save with the submit rules applied, that the
// sheet reopens after closing, and that closing leaves no hooks behind.
// Launch via macros/run-actor-sheet-runtime-tests.js as a GM.

import { FaseripActorSheetV2 } from "../actor-sheet-v2.js";
import { FaseripActorSheet } from "../actorSheet.js";
import { MSHVehicleActorSheet } from "../vehicle-actor-sheet.js";

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
  let updates = 0;
  const hookId = Hooks.on("updateActor", (doc) => { if (doc.id === actor.id) updates++; });
  try {
    return await applyEditInner(sheet, actor, edit, () => updates);
  } finally {
    Hooks.off("updateActor", hookId);
  }
}

async function applyEditInner(sheet, actor, edit, updateCount) {
  const el = content(sheet)?.querySelector(`[name="${edit.field}"]`);
  if (!el) return { found: false };
  if (el.disabled) return { found: true, disabled: true };
  el.focus?.();
  el.value = edit.value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  const saved = await waitFor(() => JSON.stringify(pickKeys(edit.read(actor), edit.expect)) === JSON.stringify(edit.expect), { timeout: 2500 });
  await sleep(400);
  return { found: true, saved: !!saved, updates: updateCount(), focusKept: document.activeElement?.name === edit.field, focusOn: document.activeElement?.name ?? document.activeElement?.tagName, result: pickKeys(edit.read(actor), edit.expect) };
}

const elementOf = (sheet) => (sheet?.element?.jquery ? sheet.element[0] : sheet?.element) ?? null;

function openApps() {
  const apps = new Set(Array.from(foundry.applications.instances?.values?.() ?? []));
  for (const w of Object.values(ui.windows ?? {})) apps.add(w);
  return apps;
}

async function portraitTest(recorder, sheet) {
  const img = content(sheet)?.querySelector('img[data-edit="img"]');
  if (!img) return recorder.skip("Portrait: file picker", { reason: "no img[data-edit=img] on the sheet" });
  const before = openApps();
  img.click();
  const picker = await waitFor(() => Array.from(openApps()).find(a => !before.has(a) && /FilePicker/i.test(a?.constructor?.name ?? "")), { timeout: 3000 });
  const opened = Array.from(openApps()).filter(a => !before.has(a));
  recorder.assert(!!picker, "Portrait: clicking the portrait opens a file picker", { newWindows: opened.map(a => a?.constructor?.name) });
  recorder.assert(opened.length <= 1, "Portrait: only one window opens", { newWindows: opened.map(a => a?.constructor?.name) });
  for (const a of opened) { try { await a.close(); } catch (_) { /* noop */ } }
  await sleep(200);
}

async function bioTest(recorder, sheet, actor) {
  const toggle = () => content(sheet)?.querySelector(".biography-toggle");
  if (!toggle()) return recorder.skip("Bio panel", { reason: "no .biography-toggle on the sheet" });
  const isOpen = () => !!content(sheet)?.querySelector(".msh-bio");
  if (!isOpen()) { toggle().click(); await waitFor(isOpen, { timeout: 3000 }); await sleep(300); }
  recorder.assert(isOpen(), "Bio panel: the Bio button opens the panel");
  if (!isOpen()) return;

  const field = content(sheet).querySelector('[name="system.race"]');
  if (!field) recorder.skip("Bio panel: field edit", { reason: "no system.race control" });
  else {
    const value = `Runtime${Date.now()}`;
    field.value = value;
    field.dispatchEvent(new Event("change", { bubbles: true }));
    const saved = await waitFor(() => actor.system.race === value, { timeout: 2500 });
    await sleep(300);
    recorder.assert(!!saved, "Bio panel: a Bio field edit saves", { race: actor.system.race });
    recorder.assert(isOpen(), "Bio panel: the panel stays open through the re-render");
  }

  await historyEditorTest(recorder, sheet, actor);

  if (isOpen()) { toggle()?.click(); await waitFor(() => !isOpen(), { timeout: 3000 }); await sleep(200); }
  recorder.assert(!isOpen(), "Bio panel: the Bio button closes the panel");
}

async function submitTest(recorder, sheet, actor) {
  const form = sheet.element?.tagName === "FORM" ? sheet.element : sheet.element?.querySelector("form");
  const name = content(sheet)?.querySelector('[name="name"]');
  if (!form || !name || typeof form.requestSubmit !== "function") return recorder.skip("Submit: explicit form submit", { reason: "no form or name control" });
  const value = `${TEST_PREFIX} Submitted`;
  let updates = 0;
  const hookId = Hooks.on("updateActor", (doc) => { if (doc.id === actor.id) updates++; });
  try {
    name.value = value;
    form.requestSubmit();
    const saved = await waitFor(() => actor.name === value, { timeout: 2500 });
    await sleep(500);
    recorder.assert(!!saved, "Submit: an explicit form submit saves", { name: actor.name });
    recorder.assert(updates === 1, "Submit: an explicit form submit makes exactly one actor update", { updates });
    recorder.assert(sheet.rendered, "Submit: the sheet stays open after a submit");
  } finally {
    Hooks.off("updateActor", hookId);
  }
}

async function historyEditorTest(recorder, sheet, actor) {
  const marker = `RuntimeHistory${Date.now()}`;
  const block = () => content(sheet)?.querySelector('prose-mirror[name="system.history"]')
    ?? content(sheet)?.querySelector('.editor-content[data-edit="system.history"]')?.closest(".editor")
    ?? null;
  if (!block()) return recorder.skip("History editor", { reason: "no editor for system.history on the sheet" });
  const kind = block().tagName === "PROSE-MIRROR" ? "V2 prose-mirror element" : "V1 editor block";
  recorder.pass(`History editor: the editor is on the sheet (${kind})`);

  const pencil = block().querySelector(".editor-edit, button.toggle, button");
  recorder.assert(!!pencil, "History editor: the edit button is present", { html: block().outerHTML.slice(0, 300) });
  if (!pencil) return;
  pencil.click();
  const surface = await waitFor(() => block()?.querySelector('[contenteditable="true"]'), { timeout: 4000 });
  recorder.assert(!!surface, "History editor: clicking edit opens an editing surface", { html: block()?.innerHTML?.slice(0, 300) });
  if (!surface) return;

  surface.focus();
  let typed = false;
  try {
    document.execCommand("selectAll", false);
    typed = document.execCommand("insertText", false, marker);
  } catch (_) { typed = false; }
  await sleep(200);
  recorder.assert(typed && surface.textContent.includes(marker), "History editor: text can be typed into it", { typed, text: surface.textContent.slice(0, 80) });

  const save = block().querySelector('[data-action="save"]') ?? content(sheet).querySelector('.editor-menu [data-action="save"], menu [data-action="save"]');
  recorder.assert(!!save, "History editor: the save button is present", { buttons: Array.from(block().querySelectorAll("button,[data-action]")).map(b => b.dataset?.action ?? b.className).slice(0, 12) });
  if (!save) return;
  let updates = 0;
  const hookId = Hooks.on("updateActor", (doc) => { if (doc.id === actor.id) updates++; });
  try {
    save.click();
    const saved = await waitFor(() => String(actor.system.history ?? "").includes(marker), { timeout: 4000 });
    recorder.assert(!!saved, "History editor: saving writes the text to the actor", { history: String(actor.system.history ?? "").slice(0, 120) });
    await sleep(600);
    recorder.assert(updates === 1, "History editor: saving makes exactly one actor update", { updates });
  } finally {
    Hooks.off("updateActor", hookId);
  }
  const shown = block()?.textContent ?? "";
  recorder.assert(shown.includes(marker), "History editor: the sheet shows the saved text afterwards", { shown: shown.slice(0, 120) });
  recorder.assert(!block()?.querySelector('[contenteditable="true"]'), "History editor: the editor closes after saving");
}

const v2Dialogs = () => Array.from(foundry.applications.instances?.values?.() ?? [])
  .filter(a => a?.element?.tagName === "DIALOG" || a?.options?.classes?.includes?.("faserip-shim-dialog") || a?.constructor?.name === "DialogV2");

async function openDialogFrom(trigger) {
  const before = new Set(v2Dialogs());
  const v1Before = Object.keys(ui.windows ?? {}).length;
  trigger.click();
  const dialog = await waitFor(() => v2Dialogs().find(a => !before.has(a) && a.rendered), { timeout: 3000 });
  await sleep(150);
  return { dialog: dialog || null, v1Opened: Object.keys(ui.windows ?? {}).length - v1Before };
}

async function closeDialog(dialog) {
  try { await dialog?.close?.(); } catch (_) { /* noop */ }
  await waitFor(() => !dialog?.rendered, { timeout: 2000 });
  await sleep(150);
}

async function dialogTests(recorder, sheet, actor) {
  const root = () => content(sheet);
  const title = (d) => d?.options?.window?.title ?? d?.title ?? "";
  let v1Total = 0;

  // Delete Power: cancel keeps the item, delete removes it.
  const victim = actor.items.getName("Runtime Armor");
  const delBtn = () => root()?.querySelector(`.powers-table [data-item-id="${victim?.id}"] .item-delete`)
    ?? root()?.querySelector(`[data-item-id="${victim?.id}"] .item-delete`);
  if (!victim || !delBtn()) recorder.skip("Dialogs: Delete Power", { reason: "no delete control for the test power" });
  else {
    let r = await openDialogFrom(delBtn()); v1Total += r.v1Opened;
    recorder.assert(!!r.dialog && /Delete Power/i.test(title(r.dialog)), "Dialogs: the power delete control opens a V2 Delete Power dialog", { title: title(r.dialog), v1Opened: r.v1Opened });
    if (r.dialog) {
      const cancel = r.dialog.element.querySelector('[data-action="cancel"]');
      recorder.assert(!!cancel && !!r.dialog.element.querySelector('[data-action="delete"]'), "Dialogs: Delete Power offers Cancel and Delete",
        { actions: Array.from(r.dialog.element.querySelectorAll("[data-action]")).map(b => b.dataset.action) });
      cancel?.click();
      await waitFor(() => !r.dialog.rendered, { timeout: 2000 });
      await sleep(300);
      recorder.assert(!!actor.items.get(victim.id), "Dialogs: Cancel leaves the power in place");
      if (!cancel) await closeDialog(r.dialog);

      r = await openDialogFrom(delBtn()); v1Total += r.v1Opened;
      r.dialog?.element.querySelector('[data-action="delete"]')?.click();
      const gone = await waitFor(() => !actor.items.get(victim.id), { timeout: 3000 });
      await sleep(300);
      recorder.assert(!!gone, "Dialogs: Delete removes the power");
      if (r.dialog?.rendered) await closeDialog(r.dialog);
    }
  }

  // Information dialogs.
  for (const [label, selector, expect] of [["Talent Information", ".talent-info", /Talent Information/i], ["Equipment Information", ".equipment-info", /Equipment Information/i]]) {
    const trigger = root()?.querySelector(selector);
    if (!trigger) { recorder.skip(`Dialogs: ${label}`, { reason: `no ${selector} control` }); continue; }
    const r = await openDialogFrom(trigger); v1Total += r.v1Opened;
    recorder.assert(!!r.dialog && expect.test(title(r.dialog)), `Dialogs: ${label} opens as a V2 dialog`, { title: title(r.dialog), v1Opened: r.v1Opened });
    if (r.dialog) {
      const close = r.dialog.element.querySelector('[data-action="close"]');
      close?.click();
      const closed = await waitFor(() => !r.dialog.rendered, { timeout: 2000 });
      recorder.assert(!!close && !!closed, `Dialogs: ${label} closes from its Close button`);
      if (!closed) await closeDialog(r.dialog);
    }
  }

  // Recovery & Rest: frame-only dialog driven by its own buttons.
  const rest = root()?.querySelector(".health-recovery-link");
  if (!rest) recorder.skip("Dialogs: Recovery & Rest", { reason: "no .health-recovery-link control" });
  else {
    const r = await openDialogFrom(rest); v1Total += r.v1Opened;
    recorder.assert(!!r.dialog && /Recovery & Rest/i.test(title(r.dialog)), "Dialogs: Recovery & Rest opens as a V2 dialog", { title: title(r.dialog), v1Opened: r.v1Opened });
    if (r.dialog) {
      recorder.assert(!!r.dialog.element.querySelector(".faserip-recovery-dialog .recovery-btn"), "Dialogs: Recovery & Rest shows its recovery buttons");
      await closeDialog(r.dialog);
    }
  }

  recorder.assert(v1Total === 0, "Dialogs: no V1 window opened for any of them", { v1Opened: v1Total });
}

async function dropTest(recorder, sheet, actor, donor) {
  const gift = donor.items.getName("Runtime Gift");
  const root = content(sheet);
  if (!gift || !root) return recorder.skip("Drop: item from another actor", { reason: "no donor item or sheet" });
  let dt;
  try { dt = new DataTransfer(); dt.setData("text/plain", JSON.stringify({ type: "Item", uuid: gift.uuid })); }
  catch (e) { return recorder.skip("Drop: item from another actor", { reason: `cannot build a DataTransfer: ${e?.message}` }); }
  const count = () => actor.items.filter(i => i.name === "Runtime Gift").length;
  root.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
  await waitFor(() => count() > 0, { timeout: 3000 });
  await sleep(800);
  recorder.assert(count() === 1, "Drop: an item dropped from another actor is added exactly once", { copies: count() });

  const gift2 = donor.items.getName("Runtime Blast");
  const tab = content(sheet)?.querySelector('.sheet-tab-content .tab[data-tab="powers"]');
  if (!gift2 || !tab) return recorder.skip("Drop: item onto the Powers tab", { reason: "no donor item or Powers tab" });
  const before = actor.items.filter(i => i.name === "Runtime Blast").length;
  const dt2 = new DataTransfer();
  dt2.setData("text/plain", JSON.stringify({ type: "Item", uuid: gift2.uuid }));
  tab.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt2 }));
  await waitFor(() => actor.items.filter(i => i.name === "Runtime Blast").length > before, { timeout: 3000 });
  await sleep(800);
  const added = actor.items.filter(i => i.name === "Runtime Blast").length - before;
  recorder.assert(added === 1, "Drop: an item dropped on the Powers tab is added exactly once", { added });
}

async function readOnlyTest(recorder, actor) {
  const sheet = new FaseripActorSheetV2({ document: actor });
  Object.defineProperty(sheet, "isEditable", { get: () => false, configurable: true });
  try {
    await sheet.render({ force: true });
    const ok = await waitFor(() => sheet.rendered && content(sheet)?.querySelector('[name="name"]'));
    await sleep(400);
    recorder.assert(!!ok, "Read-only: a sheet that is not editable still opens");
    if (!ok) return;
    const controls = Array.from(content(sheet).querySelectorAll("input[name], select[name], textarea[name]")).filter(el => el.type !== "hidden");
    const live = controls.filter(el => !el.disabled && !el.readOnly);
    recorder.assert(live.length === 0, `Read-only: all ${controls.length} named controls are disabled`, { stillEditable: live.slice(0, 12).map(el => el.name), count: live.length });
    const editorEl = content(sheet).querySelector('prose-mirror[name="system.history"]');
    const pencil = content(sheet).querySelector('.editor-content[data-edit="system.history"]')?.closest(".editor")?.querySelector(".editor-edit");
    const pencilShown = !!pencil && getComputedStyle(pencil).display !== "none";
    recorder.assert(!pencilShown && !editorEl, "Read-only: no History editor is offered");
  } finally {
    await closeSheet(sheet);
  }
}

async function vehicleTest(recorder, vehicle, crewActor) {
  const sheet = vehicle.sheet;
  const isV1 = !!foundry.appv1?.sheets?.ActorSheet && sheet instanceof foundry.appv1.sheets.ActorSheet;
  recorder.pass(`Vehicle: sheet class is ${sheet?.constructor?.name} (${isV1 ? "V1 framework" : "V2 framework"})`);
  const before = hookCounts();
  try {
    if (isV1) sheet.render(true); else await sheet.render({ force: true });
  } catch (e) { return recorder.fail("Vehicle: sheet opens", { message: e?.message }); }
  const ok = await waitFor(() => sheet.rendered && elementOf(sheet)?.querySelector?.('[name="name"]'));
  await sleep(300);
  recorder.assert(!!ok, "Vehicle: sheet opens");
  if (!ok) return;
  const root = () => elementOf(sheet);
  recorder.assert(!!(sheet.form ?? (root().tagName === "FORM" ? root() : root().querySelector("form"))), "Vehicle: the sheet has a form element");
  const tabs = Array.from(new Set(Array.from(root().querySelectorAll(".sheet-tabs [data-tab]")).map(a => a.dataset.tab)));
  recorder.assert(["crew", "equipment", "condition", "effects"].every(t => tabs.includes(t)), "Vehicle: Crew, Equipment, Condition and Effects tabs are listed", { tabs });
  const stuck = [];
  for (const tab of ["equipment", "condition", "effects", "crew"]) {
    root().querySelector(`.sheet-tabs [data-tab="${tab}"]`)?.click();
    await sleep(150);
    const panel = root().querySelector(`.sheet-body [data-tab="${tab}"]`);
    if (!panel?.classList.contains("active")) stuck.push(tab);
  }
  recorder.assert(stuck.length === 0, "Vehicle: every tab switches", { stuck });
  if (!isV1) recorder.assert(!root().classList.contains("faserip-sheet") && !!root().querySelector(".vehicle-sheet.faserip-sheet"),
    "Vehicle: the window keeps its own look (character window class is on the content, not the window)", { windowClasses: root().className });

  const dmg = root().querySelector(".vehicle-damage-quick");
  if (!dmg) recorder.skip("Vehicle: quick damage button", { reason: "no .vehicle-damage-quick button" });
  else {
    const before = Number(vehicle.system.bodyHP) || 0;
    const amt = Number(dmg.dataset.amt || 0);
    dmg.click();
    const done = await waitFor(() => Number(vehicle.system.bodyHP) === Math.max(0, before - amt), { timeout: 2500 });
    await sleep(300);
    recorder.assert(!!done, `Vehicle: the quick damage button takes ${amt} off Body`, { before, after: vehicle.system.bodyHP });
  }

  const zone = root().querySelector('.crew-drop-zone[data-slot="driver"]');
  if (!zone || !crewActor) recorder.skip("Vehicle: driver drop", { reason: "no driver drop zone or crew actor" });
  else {
    let dt = null;
    try { dt = new DataTransfer(); dt.setData("text/plain", JSON.stringify({ type: "Actor", uuid: crewActor.uuid })); } catch (_) { dt = null; }
    if (!dt) recorder.skip("Vehicle: driver drop", { reason: "cannot build a DataTransfer" });
    else {
      zone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
      const seated = await waitFor(() => vehicle.system.driverUuid === crewActor.uuid, { timeout: 3000 });
      await sleep(400);
      recorder.assert(!!seated, "Vehicle: dropping an actor on the Driver slot makes them the driver", { driverUuid: vehicle.system.driverUuid });
      const shownName = root().querySelector('.crew-link')?.textContent?.trim() ?? "";
      if (seated) recorder.assert(shownName.length > 0, "Vehicle: the driver is listed on the Crew tab", { shownName });
      else recorder.skip("Vehicle: the driver is listed on the Crew tab", { reason: "no driver was seated" });
      const remove = root().querySelector('.crew-remove[data-slot="driver"]');
      if (remove) {
        remove.click();
        const cleared = await waitFor(() => !vehicle.system.driverUuid, { timeout: 2500 });
        await sleep(300);
        recorder.assert(!!cleared, "Vehicle: the remove button clears the driver", { driverUuid: vehicle.system.driverUuid });
      } else if (seated) recorder.fail("Vehicle: the remove button clears the driver", { reason: "no .crew-remove[data-slot=driver] after seating" });

      const pZone = root().querySelector('.crew-drop-zone[data-slot="passenger"]');
      if (!pZone) recorder.skip("Vehicle: passenger drop", { reason: "no passenger drop zone" });
      else {
        const dt2 = new DataTransfer();
        dt2.setData("text/plain", JSON.stringify({ type: "Actor", uuid: crewActor.uuid }));
        pZone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt2 }));
        await waitFor(() => (vehicle.system.passengerUuids ?? []).includes(crewActor.uuid), { timeout: 3000 });
        await sleep(500);
        const copies = (vehicle.system.passengerUuids ?? []).filter(u => u === crewActor.uuid).length;
        recorder.assert(copies === 1, "Vehicle: dropping an actor on the Passenger slot seats them once", { passengerUuids: vehicle.system.passengerUuids });
      }
    }
  }

  const newName = `${TEST_PREFIX} Vehicle Renamed`;
  const el = root().querySelector('[name="name"]');
  let threw = null;
  const onError = (ev) => { threw = ev?.reason?.message ?? ev?.message ?? String(ev); };
  window.addEventListener("unhandledrejection", onError);
  window.addEventListener("error", onError);
  try {
    el.value = newName;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    const saved = await waitFor(() => vehicle.name === newName, { timeout: 2500 });
    recorder.assert(!!saved, "Vehicle: renaming through the sheet saves", { name: vehicle.name, error: threw });
    await sleep(300);
    let closeError = null;
    try { await sheet.close(); } catch (e) { closeError = e?.message ?? String(e); }
    await sleep(300);
    recorder.assert(!closeError && !threw, "Vehicle: the sheet closes without an error", { closeError, error: threw });
  } finally {
    window.removeEventListener("unhandledrejection", onError);
    window.removeEventListener("error", onError);
  }
  recorder.assert(JSON.stringify(before) === JSON.stringify(hookCounts()), "Vehicle: the sheet leaves no hooks behind", { before, after: hookCounts() });
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
  let restoreWarn = () => {};

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
    const legacy = await make("hero", { flags: { core: { sheetClass: "msh-faserip.FaseripActorSheet" } }, items: [...ITEMS, { name: "Runtime Gift", type: "power", system: { rank: "Typical", value: 6 } }] });
    recorder.assert(legacy.sheet instanceof FaseripActorSheetV2, "Registration: an actor that was assigned the V1 sheet falls back to the V2 sheet", { got: legacy.sheet?.constructor?.name });
    recorder.assert(!game.settings.settings.has(`${SYSTEM_ID}.useActorSheetV2`), "Registration: the Use V2 Character Sheet setting is gone");

    // Framework
    const v1Bases = [foundry.appv1?.api?.Application, foundry.appv1?.sheets?.ActorSheet].filter(Boolean);
    const onV1 = (cls) => v1Bases.some(base => cls.prototype instanceof base);
    recorder.assert(!onV1(FaseripActorSheet) && Object.getPrototypeOf(FaseripActorSheet) === Function.prototype,
      "Framework: the character sheet's legacy class no longer extends the V1 framework", { base: Object.getPrototypeOf(FaseripActorSheet)?.name || "(none)" });
    recorder.assert(!onV1(MSHVehicleActorSheet), "Framework: the vehicle sheet's legacy class no longer extends the V1 framework",
      { base: Object.getPrototypeOf(MSHVehicleActorSheet)?.name || "(none)" });
    recorder.assert(typeof actor.sheet._rollVehicleControl === "function", "Framework: actor.sheet offers _rollVehicleControl for the vehicle-control macros");

    const v1Warnings = [];
    const originalWarn = foundry.utils.logCompatibilityWarning;
    let warnPatched = false;
    try {
      foundry.utils.logCompatibilityWarning = function (message, ...rest) {
        if (/V1 Application framework/i.test(String(message))) v1Warnings.push(String(message).slice(0, 80));
        return originalWarn.call(this, message, ...rest);
      };
      warnPatched = foundry.utils.logCompatibilityWarning !== originalWarn;
      if (warnPatched) restoreWarn = () => { try { foundry.utils.logCompatibilityWarning = originalWarn; } catch (_) { /* noop */ } };
    } catch (_) { warnPatched = false; }

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
      const updateCounts = {};
      const focus = {};
      for (const edit of EDITS) {
        let o;
        try { o = await applyEdit(sheet, actor, edit); } catch (e) { o = { error: e?.message ?? String(e) }; }
        if (o.found === false) recorder.skip(`Edits: ${edit.label}`, { reason: "control not found" });
        else {
          recorder.assert(o.saved === true, `Edits: ${edit.label} saves ${JSON.stringify(edit.expect)}`, o);
          updateCounts[edit.label] = o.updates;
          focus[edit.label] = o.focusKept ? "kept" : `lost (now on ${o.focusOn})`;
        }
      }
      recorder.assert(Object.values(focus).every(v => v === "kept"), "Edits: the edited field keeps keyboard focus through the re-render", focus);
      recorder.assert(Object.values(updateCounts).every(n => n === 1), "Edits: each edit makes exactly one actor update", updateCounts);
      const tabAfterEdits = content(sheet).querySelector(".sheet-tabs-navigation .item.active")?.dataset.tab;
      recorder.assert(tabAfterEdits === "talents", "Edits: the sheet stays on the Talents tab through the re-renders", { tabAfterEdits });

      // Portrait, History editor, drop
      await actor.update(foundry.utils.deepClone(BASELINE));
      await sleep(300);
      try { await portraitTest(recorder, sheet); } catch (e) { recorder.fail("Portrait: test ran", { message: e?.message }); }
      try { await bioTest(recorder, sheet, actor); } catch (e) { recorder.fail("Bio panel: test ran", { message: e?.message }); }
      try { await submitTest(recorder, sheet, actor); } catch (e) { recorder.fail("Submit: test ran", { message: e?.message }); }
      try { await dropTest(recorder, sheet, actor, legacy); } catch (e) { recorder.fail("Drop: test ran", { message: e?.message }); }
      try { await dialogTests(recorder, sheet, actor); } catch (e) { recorder.fail("Dialogs: test ran", { message: e?.message }); }

      // Close and reopen
      await closeSheet(sheet);
      recorder.assert(JSON.stringify(hooksBefore) === JSON.stringify(hookCounts()), "Close: the sheet leaves no hooks behind", { before: hooksBefore, after: hookCounts() });
      const again = await openSheet(actor);
      sheet = again.sheet;
      recorder.assert(again.ok && !!content(sheet)?.querySelector('[name="system.abilities.fighting.rank"]'), "Close: the sheet reopens with its controls");
      await closeSheet(sheet);
      sheet = null;
      recorder.assert(JSON.stringify(hooksBefore) === JSON.stringify(hookCounts()), "Close: hook counts are back where the run started", { before: hooksBefore, after: hookCounts() });

      try { await readOnlyTest(recorder, actor); } catch (e) { recorder.fail("Read-only: test ran", { message: e?.message }); }
    }

    try {
      const vehicle = await ActorClass.create({ name: `${TEST_PREFIX} Vehicle ${Date.now()}`, type: "vehicle", system: { bodyHP: 20, bodyHPMax: 20, seatingCapacity: 5 } });
      if (!vehicle) throw new Error("Could not create the vehicle test actor.");
      actors.push(vehicle);
      await vehicleTest(recorder, vehicle, actors[0]);
    } catch (e) { recorder.fail("Vehicle: test ran", { message: e?.message ?? String(e) }); }

    restoreWarn();
    if (!warnPatched) recorder.skip("Framework: no V1 deprecation warning while the sheets were in use", { reason: "could not observe Foundry's compatibility warnings" });
    else recorder.assert(v1Warnings.length === 0, "Framework: no V1 deprecation warning while the sheets were in use", { count: v1Warnings.length });
  } catch (error) {
    recorder.fail("Character sheet suite completed without an uncaught exception", { message: error?.message ?? String(error), stack: error?.stack });
    console.error("[FASERIP TEST] Character sheet suite aborted", error);
  } finally {
    restoreWarn();
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
