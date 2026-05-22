// seed-extrabodyparts.js — Slice I migration (run AFTER a full world restart
// so the template.json `extraBodyParts: []` default is live). Idempotent.
//
// Normalizes system.extraBodyParts on every power in msh-faserip.powers to an
// array of {type, count, notes}. Any legacy scalar/object value (the old sheet
// stored a freeform `extraBodyParts`) is parked into a single entry's notes so
// nothing is silently dropped. Re-running is a no-op once normalized.

const TYPES = ["arms","legs","prehensileTail","wings","combatTail","extraEyes","claws","spines"];

const pack = game.packs.get("msh-faserip.powers");
if (!pack) { ui.notifications.error("msh-faserip.powers pack not found"); }
else {
  const docs = await pack.getDocuments();
  const updates = [];
  for (const doc of docs) {
    const cur = doc.system?.extraBodyParts;
    if (Array.isArray(cur)) {
      // Already an array: drop blank rows, clamp count, keep order.
      const clean = cur
        .filter(e => e && (e.type || e.notes))
        .map(e => ({
          type: TYPES.includes(e.type) ? e.type : "",
          count: Math.max(1, Number(e.count) || 1),
          notes: String(e.notes ?? "")
        }));
      if (JSON.stringify(clean) !== JSON.stringify(cur))
        updates.push({ _id: doc.id, "system.extraBodyParts": clean });
      continue;
    }
    // Missing or legacy non-array value.
    if (cur === undefined || cur === null || cur === "") {
      updates.push({ _id: doc.id, "system.extraBodyParts": [] });
    } else {
      const notes = typeof cur === "object" ? JSON.stringify(cur) : String(cur);
      updates.push({ _id: doc.id, "system.extraBodyParts": [{ type: "", count: 1, notes }] });
    }
  }
  if (updates.length) {
    await Item.updateDocuments(updates, { pack: pack.collection });
    ui.notifications.info(`extraBodyParts normalized on ${updates.length} power(s).`);
  } else {
    ui.notifications.info("extraBodyParts already normalized — no changes.");
  }
  console.log("seed-extrabodyparts: updated", updates.map(u => u._id));
}
