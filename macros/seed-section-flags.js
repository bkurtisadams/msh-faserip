// seed-section-flags.js — Slice N migration (run AFTER a full world restart
// so the new template.json section-flag defaults are live). Idempotent.
//
// The six relocated sections (Detection, Ability Substitution, Movement,
// Control, Mental, Transformation) are now gated by per-section flags. Existing
// powers default those flags false, so their bodies render collapsed even when
// they hold data. This sets each flag true where that section already has
// authored content. Only ever flips false -> true; never clears a flag, so a
// deliberate user untick is preserved on re-run.

const truthy = v => v !== undefined && v !== null && v !== "" && v !== false && v !== 0;
const anyTruthy = obj => obj && typeof obj === "object" && Object.values(obj).some(truthy);

function hasAbilitySub(sys) {
  const a = sys.abilitySubstitution;
  return a && typeof a === "object" && Object.values(a).some(x => x?.enabled);
}
function hasTransform(sys) {
  const t = sys.transformation || {};
  return truthy(t.transformType) || truthy(t.targetMaterial)
      || t.touchRequired || t.retainsPowers || (t.affects && t.affects !== "self");
}

const pack = game.packs.get("msh-faserip.powers");
if (!pack) { ui.notifications.error("msh-faserip.powers pack not found"); }
else {
  const docs = await pack.getDocuments();
  const updates = [];
  for (const doc of docs) {
    const sys = doc.system ?? {};
    const u = {};
    if (!sys.isSensePower          && anyTruthy(sys.detection)) u["system.isSensePower"] = true;
    if (!sys.isAbilitySubstitution && hasAbilitySub(sys))       u["system.isAbilitySubstitution"] = true;
    if (!sys.isMovementPower        && anyTruthy(sys.movement))  u["system.isMovementPower"] = true;
    if (!sys.isControlPower         && anyTruthy(sys.control))   u["system.isControlPower"] = true;
    if (!sys.isMentalPower          && anyTruthy(sys.mental))    u["system.isMentalPower"] = true;
    if (!sys.isTransformPower       && hasTransform(sys))        u["system.isTransformPower"] = true;
    if (Object.keys(u).length) { u._id = doc.id; updates.push(u); }
  }
  if (updates.length) {
    await Item.updateDocuments(updates, { pack: pack.collection });
    ui.notifications.info(`Section flags seeded on ${updates.length} power(s).`);
  } else {
    ui.notifications.info("Section flags already current — no changes.");
  }
  console.log("seed-section-flags: updated", updates.map(u => u._id));
}
