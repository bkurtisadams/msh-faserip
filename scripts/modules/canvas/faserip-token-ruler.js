// scripts/modules/canvas/faserip-token-ruler.js v1.1.0 - 2026-02-07
// Custom TokenRuler for FASERIP: color-codes drag ruler by movement mode
// Reads token.document.movementAction (V13 Token HUD selection)
// Green = within normal movement, Yellow = Speed FEAT zone (+1 area), Red = over max

const TokenRuler = foundry.canvas.placeables.tokens.TokenRuler;

// Colors
const COLOR_GREEN  = 0x00CC00;
const COLOR_YELLOW = 0xFFCC00;
const COLOR_RED    = 0xFF3333;
const COLOR_DEFAULT = 0xCCCCCC;

// Map Foundry movement action keys to actor.system.movement fields
const ACTION_SPEED_MAP = {
  walk:     "run",
  fly:      "fly",
  swim:     "swim",
  teleport: "teleport",
  climb:    "run",      // no separate climb speed in FASERIP, use run
  burrow:   "run",      // no separate burrow speed in FASERIP, use run
  crawl:    "run"       // no separate crawl speed in FASERIP, use run
};

export class FaseripTokenRuler extends TokenRuler {

  /**
   * Get the actor's effective movement ranges in scene distance units.
   * Reads token.document.movementAction to determine which speed to use.
   * Returns { normal, feat, action } where feat = normal + 1 area.
   * Returns null if no actor (falls back to default behavior).
   */
  _getMovementRanges() {
    const actor = this.token?.actor;
    if (!actor?.system) return null;

    const movement = actor.system.movement || {};
    const action = this.token.document?.movementAction || "walk";
    const speedField = ACTION_SPEED_MAP[action] || "run";

    // Resolve areas/round based on active movement action
    let baseAreas;
    switch (speedField) {
      case "fly":
        baseAreas = movement.fly || 0;
        break;
      case "swim":
        baseAreas = movement.swim || 1;
        break;
      case "teleport":
        baseAreas = movement.teleport || 0;
        break;
      default:
        baseAreas = movement.run ?? actor.suggestedMovement ?? 2;
        break;
    }

    // Active Effect modifier (e.g. 0.5 from Dodging)
    const movementMult = Number(actor.system.combatMods?.movementMult) || 1;
    const effectiveAreas = baseAreas * movementMult;

    // Speed FEAT grants +1 area
    const featAreas = effectiveAreas + 1;

    return { normal: effectiveAreas, feat: featAreas, movementMult, action };
  }

  /**
   * Extract cumulative movement cost from a waypoint.
   * Tries measurement.cost first (movement cost including terrain), then distance.
   */
  _getCost(waypoint) {
    const m = waypoint?.measurement;
    if (!m) return 0;
    // cost accounts for terrain multipliers; distance is raw distance
    if (typeof m.cost === "number") return m.cost;
    if (typeof m.distance === "number") return m.distance;
    return 0;
  }

  /**
   * Determine the speed tier color for a given cumulative cost.
   */
  _getSpeedColor(cost) {
    const ranges = this._getMovementRanges();
    if (!ranges) return COLOR_DEFAULT;

    // Small epsilon for floating-point comparison
    const eps = 0.001;
    if (cost <= ranges.normal + eps) return COLOR_GREEN;
    if (cost <= ranges.feat + eps) return COLOR_YELLOW;
    return COLOR_RED;
  }

  /* ---------------------------------------- */
  /*  Override: Grid cell highlight color     */
  /* ---------------------------------------- */

  _getGridHighlightStyle(waypoint, offset) {
    if (!this.token?.actor?.system) return super._getGridHighlightStyle(waypoint, offset);

    const cost = this._getCost(waypoint);
    const color = this._getSpeedColor(cost);

    return {
      color,
      alpha: color === COLOR_RED ? 0.35 : 0.25
    };
  }

  /* ---------------------------------------- */
  /*  Override: Ruler line segment color       */
  /* ---------------------------------------- */

  _getSegmentStyle(waypoint) {
    const base = super._getSegmentStyle(waypoint);
    if (!this.token?.actor?.system) return base;

    const cost = this._getCost(waypoint);
    return {
      ...base,
      color: this._getSpeedColor(cost)
    };
  }

  /* ---------------------------------------- */
  /*  Override: Waypoint dot color             */
  /* ---------------------------------------- */

  _getWaypointStyle(waypoint) {
    const base = super._getWaypointStyle(waypoint);
    if (!this.token?.actor?.system) return base;

    const cost = this._getCost(waypoint);
    return {
      ...base,
      color: this._getSpeedColor(cost)
    };
  }

  /* ---------------------------------------- */
  /*  Override: Token outline during drag      */
  /* ---------------------------------------- */

  _configureOutline() {
    const base = super._configureOutline();
    if (!this.token?.actor?.system) return base;
    // Start green; actual per-cell color comes from grid highlights
    return { ...base, color: COLOR_GREEN };
  }

  /* ---------------------------------------- */
  /*  Override: Waypoint label (areas display) */
  /* ---------------------------------------- */

  _getWaypointLabelContext(waypoint, state) {
    const base = super._getWaypointLabelContext(waypoint, state);
    if (!base || !this.token?.actor?.system) return base;

    const ranges = this._getMovementRanges();
    if (!ranges) return base;

    const cost = this._getCost(waypoint);
    const gridDistance = canvas.scene?.grid?.distance || 1;
    const gridUnits = canvas.scene?.grid?.units || "areas";

    // Action label for display
    const actionLabels = { walk: "Run", fly: "Fly", swim: "Swim", teleport: "Tel", climb: "Climb" };
    const actionLabel = actionLabels[ranges.action] || "Run";

    // If the grid unit is area-based, show "X / Y areas (Mode)"
    if (gridUnits.toLowerCase().includes("area")) {
      const costAreas = cost;
      const maxAreas = ranges.normal;
      base.distance = `${this._round(costAreas)} / ${this._round(maxAreas)} ${gridUnits} (${actionLabel})`;
    }

    return base;
  }

  /** Round to 1 decimal if needed */
  _round(v) {
    if (Number.isInteger(v)) return v;
    return Math.round(v * 10) / 10;
  }
}
