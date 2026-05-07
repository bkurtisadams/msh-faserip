// // scripts/modules/canvas/faserip-token-ruler.js v1.3.1 - 2026-04-19
// v1.3.1: v14 — foundry.canvas.tokens → foundry.canvas.placeables.tokens
// v1.3.0: Fix combat tracker interference — track passedWaypoints cost so color coding
//         accounts for prior movement this turn. Override refresh() to capture prior cost.
// v1.2.0: Add flight sub-mode support (Full/Low Alt/Cruise) - resolves speed from MOVEMENT_DATA
// Reads token.document.movementAction (V13 Token HUD selection)
// Green = within normal movement, Yellow = Speed FEAT zone (+1 area), Red = over max

import { FaseripInitiative } from "../../faserip-initiative.js";

const TokenRuler = foundry.canvas.placeables.tokens.TokenRuler ?? CONFIG.Token.rulerClass;

// Colors
const COLOR_GREEN  = 0x00CC00;
const COLOR_YELLOW = 0xFFCC00;
const COLOR_RED    = 0xFF3333;
const COLOR_DEFAULT = 0xCCCCCC;

// Map Foundry movement action keys to speed resolution
// Flight sub-modes resolve dynamically via MOVEMENT_DATA
const ACTION_SPEED_MAP = {
  walk:       "run",
  fly:        "flyFull",    // fallback if default fly is somehow selected
  flyFull:    "flyFull",
  flyLowAlt:  "flyLowAlt",
  flyCruise:  "flyCruise",
  swim:       "swim",
  teleport:   "teleport",
  climb:      "run",
  burrow:     "run",
  crawl:      "run"
};

export class FaseripTokenRuler extends TokenRuler {

  /** Cost already spent by passed (completed) movements this combat turn */
  _priorCost = 0;

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
    let modeLabel = "";
    switch (speedField) {
      case "flyFull":
        baseAreas = movement.fly || 0;
        modeLabel = "Full";
        break;
      case "flyLowAlt": {
        // Low altitude / enclosed spaces: ground speed for the flight power rank
        const flyAreas = movement.fly || 0;
        const flightInfo = actor.constructor.getFlightInfo?.(flyAreas);
        baseAreas = flightInfo?.groundAreas ?? Math.max(1, Math.floor(flyAreas / 2));
        modeLabel = "Low Alt";
        break;
      }
      case "flyCruise": {
        // Cruise: 2 ranks lower air speed, no exhaustion
        const flyAreas = movement.fly || 0;
        const cruising = actor.constructor.getCruisingFlight?.(flyAreas);
        baseAreas = cruising?.areas ?? Math.max(1, Math.floor(flyAreas / 2));
        modeLabel = "Cruise";
        break;
      }
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
    let effectiveAreas = baseAreas * movementMult;

    // RAW action declaration cap (half-move when acting; full when charging).
    // Null when the cap doesn't apply (setting off, out of combat, no declaration).
    const declMult = FaseripInitiative.getDeclaredMoveMultiplier?.(this.token);
    const declHalved = declMult !== null && declMult !== undefined && declMult < 1;
    if (declMult !== null && declMult !== undefined) effectiveAreas *= declMult;

    // Speed FEAT grants +1 area
    const featAreas = effectiveAreas + 1;

    return { normal: effectiveAreas, feat: featAreas, movementMult, action, modeLabel, declHalved };
  }

  /* ---------------------------------------- */
  /*  Override: refresh to capture prior cost  */
  /* ---------------------------------------- */

  refresh({ passedWaypoints, pendingWaypoints, plannedMovement } = {}) {
    // Calculate cumulative cost of already-completed movements this turn.
    // passedWaypoints are waypoints from prior drags in the same combat turn;
    // the last one's measurement.cost is the total distance already moved.
    this._priorCost = 0;
    if (passedWaypoints?.length) {
      const last = passedWaypoints[passedWaypoints.length - 1];
      const m = last?.measurement;
      if (m) {
        this._priorCost = (typeof m.cost === "number") ? m.cost
                        : (typeof m.distance === "number") ? m.distance
                        : 0;
      }
    }
    return super.refresh({ passedWaypoints, pendingWaypoints, plannedMovement });
  }

  /**
   * Extract cumulative movement cost from a waypoint, including prior combat movement.
   * During combat, pending waypoints reset their cost to 0; we add _priorCost to get
   * the true total movement this turn.
   */
  _getCost(waypoint) {
    const m = waypoint?.measurement;
    if (!m) return this._priorCost;
    const wpCost = (typeof m.cost === "number") ? m.cost
                 : (typeof m.distance === "number") ? m.distance
                 : 0;
    // Passed waypoints already carry absolute cumulative cost — don't double-add.
    // Pending/planned waypoints restart from 0 so we offset by prior movement.
    if (waypoint.stage === "passed") return wpCost;
    return wpCost + this._priorCost;
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
    // Color outline based on how much movement is already spent
    const color = this._getSpeedColor(this._priorCost);
    return { ...base, color };
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
    const actionLabels = {
      walk: "Run", fly: "Fly", flyFull: "Fly", flyLowAlt: "Fly", flyCruise: "Fly",
      swim: "Swim", teleport: "Tel", climb: "Climb"
    };
    const baseLabel = actionLabels[ranges.action] || "Run";
    const modeSuffix = ranges.modeLabel ? ` (${ranges.modeLabel})` : "";
    const halfSuffix = ranges.declHalved ? " ½" : "";
    const actionLabel = `${baseLabel}${modeSuffix}${halfSuffix}`;

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