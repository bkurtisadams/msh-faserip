// scripts/modules/actions/area-template.js v3.0.0 - 2026-03-04
// v3.0.0: Minimal — standard v13 createEmbeddedDocuments, no preview, no auto-dismiss.
//         GM manages templates manually like any other measured template.

export class AreaTemplate {
  constructor(templateDoc) {
    this._doc = templateDoc;
  }

  /**
   * Create a circular measured template centered on target token or {x,y}.
   * Returns AreaTemplate instance, or null on failure.
   */
  static async create({ x, y, radiusInAreas = 1, label = "AE", fillColor = "#ff0000", fillAlpha = 0.25 } = {}) {
    try {
      const [doc] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [{
        t: "circle",
        distance: radiusInAreas,
        direction: 0,
        angle: 360,
        x, y,
        fillColor,
        fillAlpha,
        borderColor: "#000000",
        flags: { "msh-faserip": { areaTemplate: true, radiusInAreas, label } }
      }]);
      return new AreaTemplate(doc);
    } catch (err) {
      console.error("[FASERIP] AreaTemplate creation failed:", err);
      return null;
    }
  }

  /**
   * Convenience: create template centered on first targeted token.
   * Falls back to provided {x,y} if no targets.
   */
  static async createAtTarget({ radiusInAreas = 1, label = "AE", fillColor = "#ff0000", fillAlpha = 0.25, fallbackX = 0, fallbackY = 0 } = {}) {
    const targets = Array.from(game.user.targets);
    const x = targets[0]?.center?.x ?? fallbackX;
    const y = targets[0]?.center?.y ?? fallbackY;
    return AreaTemplate.create({ x, y, radiusInAreas, label, fillColor, fillAlpha });
  }

  /** Select all tokens whose center falls within this template as Foundry targets. */
  async target() {
    if (!this._doc) return [];
    const gridDist = canvas.scene.grid.distance || 0.2;
    const gridSize = canvas.scene.grid.size ?? 100;
    const radiusPx = (this._doc.distance / gridDist) * gridSize;
    const cx = this._doc.x;
    const cy = this._doc.y;

    const tokens = canvas.tokens.placeables.filter(t => {
      const dx = t.center.x - cx;
      const dy = t.center.y - cy;
      return (dx * dx + dy * dy) <= (radiusPx * radiusPx);
    });

    const tokenIds = new Set(tokens.map(t => t.id));
    canvas.tokens.placeables.forEach(t => {
      t.setTarget(tokenIds.has(t.id), { user: game.user, releaseOthers: false, groupSelection: true });
    });
    return tokens;
  }

  /** Remove the template from the canvas. */
  async dismiss() {
    if (!this._doc?.id) return;
    try {
      await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", [this._doc.id]);
    } catch (err) {
      console.warn("[FASERIP] Could not delete template", this._doc.id, err);
    }
  }

  get id() { return this._doc?.id; }
  get x()  { return this._doc?.x; }
  get y()  { return this._doc?.y; }
}