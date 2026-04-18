// scripts/data-models.js v2.0.0 - 2026-04-14
// V14 compat: Minimal TypeDataModel classes that allow ALL existing
// template.json data through without strict per-field validation.
// Uses _enableV10Backwards = true to preserve legacy data passthrough.

/**
 * A permissive base that accepts any system data without enumeration.
 * This avoids the Proxy ownKeys duplicate-entries trap that occurs when
 * a strict schema partially overlaps with existing source data keys.
 */
class PermissiveDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    // Empty schema — all fields come from the source data as-is.
    // V14 still initializes the system object from the database;
    // defineSchema() returning {} means no fields are validated or
    // coerced, but existing data is preserved on the model instance.
    return {};
  }

  /** Allow extra source keys that aren't in the schema. */
  static _enableV10Backwards = true;

  static migrateData(source) {
    return super.migrateData(source);
  }
}

// ── Actor types ──────────────────────────────────────────────────────────
class FaseripHeroData extends PermissiveDataModel {}
class FaseripVillainData extends PermissiveDataModel {}
class FaseripNPCData extends PermissiveDataModel {}
class FaseripVehicleActorData extends PermissiveDataModel {}

// ── Item types ───────────────────────────────────────────────────────────
class FaseripPowerData extends PermissiveDataModel {}
class FaseripTalentData extends PermissiveDataModel {}
class FaseripContactData extends PermissiveDataModel {}
class FaseripEquipmentData extends PermissiveDataModel {}
class FaseripVehicleItemData extends PermissiveDataModel {}
class FaseripHeadquartersData extends PermissiveDataModel {}

// ── Registration ─────────────────────────────────────────────────────────
export function registerDataModels() {
  // V14: TypeDataModel registration disabled for debugging.
  // With documentTypes in system.json and no template.json templates,
  // V14 should treat system data as plain untyped objects.
  console.log("[FASERIP] TypeDataModel registration skipped — using untyped system data.");
}
