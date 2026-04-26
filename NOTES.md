# msh-faserip — Technical Notes

A running log of Foundry quirks, gotchas, and workarounds discovered during
development. Aimed at future-me and anyone else maintaining this system.

---

## Foundry V2 quirks

### V2 passes a stale `form` argument to `_prepareSubmitData`

**Symptom:** Fields on a power sheet (or any `FaseripItemSheet` subtype) fail
to persist on save. Specifically, fields without an explicit change handler
in `power-sheet-v2-logic.js` — textareas, dynamic dropdowns, late-rendered
sections — silently get dropped. Fields *with* explicit handlers work because
they call `sheet.item.update({...})` directly, bypassing the form pipeline.

**Cause:** During submit, `ItemSheetV2._prepareSubmitData(event, form, formData)`
receives a `form` argument that is a *different DOM node* than the on-screen
form. The detached form has the right number of `<input>`/`<select>`/`<textarea>`
elements (same count, same names, same structure), but all their values are
empty. Scanning it with `FormDataExtended` returns only `{img: ...}` —
everything else evaluates to undefined.

This was confirmed by diagnostic logging:

- `form === sheet.element.querySelector('form')` → **false**
- `new FormDataExtended(form).object` → 1 key (`img`)
- `new FormDataExtended(sheet.element.querySelector('form')).object` → 142 keys

**Workaround:** In `_prepareSubmitData`, scan `this.element.querySelector("form")`
instead of the `form` argument. This reads the live DOM the user is interacting
with. Fall back to the passed `form` if `this.element` is unavailable.

```js
_prepareSubmitData(event, form, formData, updateData) {
  const FDE = foundry.applications.ux?.FormDataExtended ?? FormDataExtended;
  const liveForm = this.element?.querySelector?.("form") ?? form;
  const fresh = (liveForm instanceof HTMLFormElement) ? new FDE(liveForm) : formData;
  const data = foundry.utils.expandObject(fresh.object);
  // ...rebuild indexed arrays, merge updateData, return
}
```

**Affected files:**

- `scripts/itemSheet.js` (`FaseripItemSheet`) — workaround applied
- `scripts/equipment.js` — uses its own `_prepareSubmitData` that trusts
  `formData.object` without rescan. Currently works, possibly because
  equipment doesn't trigger the same partial-snapshot path. Fragile — if
  equipment grows late-rendered fields, apply the same workaround.

**Other approaches tried:**

- `_processFormData` override (the documented v14 hook for "customize how
  form data is extracted") — didn't fire correctly in v14.360.
- `_prepareSubmitData` with `expandObject(formData.object)` — failed,
  confirms V2's formData is partial.
- `_prepareSubmitData` rescanning the passed `form` arg — failed, confirms
  the passed form is the wrong DOM node.

**Re-test after each Foundry update.** If V2 fixes this upstream, the
live-form rescan becomes redundant overhead and should be removed.

**Foundry version when discovered:** v14.360
**Date:** 2026-04-25

---

## Schema changes require Return to Setup, not F5

When `template.json` is modified, Foundry caches the schema at world startup.
Refreshing the page (F5) does *not* reload the schema. Writes to fields not
in the cached schema get silently rejected at the data layer.

**Fix:** *Return to Setup → Launch World* after every `template.json` edit
during development. Tell users the same in upgrade notes.

**Symptom if forgotten:** New fields appear in the sheet UI, accept user
input, but `power.system.newField` returns `undefined` after save. No
error, no warning.

---

## Sequencer database key validation

When using JB2A/Sequencer assets, dotted database keys like
`jb2a.energy_beam.normal.blue.01` get fetched as URLs if they're missing
from the user's installed pack. This 404s and crashes the canvas effect
with `Cannot read properties of null (reading 'baseTexture')`.

**Fix:** Gate every database-key asset through `Sequencer.Database.entryExists`
before queueing the effect. File paths (containing slashes or known video
extensions) pass through unchecked. Implemented in `fx-service.js`.

**Affected JB2A entries seen missing in different installs:**
- `jb2a.impact.010.blue` (no `.blue` color variant in any pack)

Default presets should prefer `.001`-series entries which have wider color coverage.
