// scripts/modules/actions/area-template.js v8.0.0 - 2026-04-20
// v8.0.0: v14 port — MeasuredTemplate document and canvas.templates layer are
//   gone in v14 (absorbed into Scene Regions). Persisted doc is now a Region
//   with a single circle shape; preview overlay moved to canvas.controls.
// v7.0.0: Scroll-wheel resize during Phase 1. New scrollResize option adds
//   mouse-wheel scaling between minRadiusInAreas (default 1) and radiusInAreas (max).
//   Step size = 1 grid unit. Returns final chosen radius in the AreaTemplate instance.

export class AreaTemplate {
  constructor(templateDoc, { chosenRadius } = {}) {
    this._doc = templateDoc;
    this._chosenRadius = chosenRadius ?? templateDoc?.distance;
  }

  get chosenRadius() { return this._chosenRadius; }

  /** Redraw the PIXI preview circle at a new pixel radius. */
  static _redrawPreview(preview, radiusPx, colorNum, fillAlpha) {
    preview.clear();
    preview.beginFill(colorNum, fillAlpha);
    preview.lineStyle(2, 0x000000, 0.8);
    preview.drawCircle(0, 0, radiusPx);
    preview.endFill();
  }

  /**
   * Two-phase measured template placement.
   *
   * Phase 1: translucent PIXI circle follows cursor, snapping to grid center.
   *          Scroll wheel resizes if scrollResize is true.
   *          Left-click locks position. Right-click cancels.
   * Phase 2: circle stays put so user can review who is in the blast.
   *          Left-click confirms → persists real MeasuredTemplate → resolves.
   *          Right-click cancels → removes preview → resolves null.
   *
   * @param {number} radiusInAreas - max (and initial) radius
   * @param {boolean} scrollResize - enable mouse wheel sizing
   * @param {number} minRadiusInAreas - minimum radius when resizing (default 1)
   * @param {number} scrollStep - grid distance units per scroll tick (default gridDist)
   */
  static async create({ x = 0, y = 0, radiusInAreas = 1, label = "AE", fillColor = "#ff0000", fillAlpha = 0.25,
                         scrollResize = false, minRadiusInAreas = 1 } = {}) {
    if (!canvas?.scene) {
      console.error("[FASERIP ERROR] AreaTemplate: No active scene.");
      return null;
    }

    const gridDist = canvas.scene.grid.distance || 1;
    const gridSize = canvas.scene.grid.size ?? 100;
    const pxPerArea = gridSize / gridDist;
    let currentRadius = scrollResize ? minRadiusInAreas : radiusInAreas;
    let radiusPx = currentRadius * pxPerArea;
    const colorNum = PIXI.utils.string2hex?.(fillColor) ?? parseInt(fillColor.replace("#", ""), 16);

    // Build PIXI preview graphic
    const preview = new PIXI.Graphics();
    AreaTemplate._redrawPreview(preview, radiusPx, colorNum, fillAlpha);

    const snapped = canvas.grid.getSnappedPoint({ x, y }, { mode: CONST.GRID_SNAPPING_MODES.CENTER });
    preview.position.set(snapped.x, snapped.y);
    const overlayLayer = canvas.controls ?? canvas.interface ?? canvas.stage;
    overlayLayer.addChild(preview);

    // ── Phase 1: follow mouse, scroll to resize, left-click locks, right-click cancels ──
    const lockResult = await new Promise((resolve) => {
      let done = false;

      const onMove = (event) => {
        if (done) return;
        const pos = event.getLocalPosition(canvas.stage);
        const snap = canvas.grid.getSnappedPoint(pos, { mode: CONST.GRID_SNAPPING_MODES.CENTER });
        preview.position.set(snap.x, snap.y);
      };

      const onClick = (event) => {
        if (done) return;
        if (event.button === 2) { done = true; cleanup(); resolve(null); return; }
        if (event.button === 0) { done = true; cleanup(); resolve({ x: preview.position.x, y: preview.position.y, radius: currentRadius }); }
      };

      const onWheel = (e) => {
        if (done || !scrollResize) return;
        e.preventDefault();
        e.stopPropagation();
        const step = Math.max(1, gridDist);
        const delta = e.deltaY < 0 ? step : -step;
        const next = Math.max(minRadiusInAreas, Math.min(radiusInAreas, currentRadius + delta));
        if (next === currentRadius) return;
        currentRadius = next;
        radiusPx = currentRadius * pxPerArea;
        AreaTemplate._redrawPreview(preview, radiusPx, colorNum, fillAlpha);
      };

      const onContext = (e) => { e.preventDefault(); e.stopPropagation(); };

      const cleanup = () => {
        canvas.stage.off("pointermove", onMove);
        canvas.stage.off("pointerdown", onClick);
        canvas.app.view.removeEventListener("wheel", onWheel, true);
        canvas.app.view.removeEventListener("contextmenu", onContext, true);
      };

      canvas.stage.on("pointermove", onMove);
      canvas.stage.on("pointerdown", onClick);
      if (scrollResize) {
        canvas.app.view.addEventListener("wheel", onWheel, { capture: true });
      }
      canvas.app.view.addEventListener("contextmenu", onContext, { capture: true });

      const hint = scrollResize
        ? `Move to aim. Scroll to resize (${currentRadius}/${radiusInAreas} areas). Left-click to lock.`
        : "Move to aim. Left-click to lock position.";
      ui.notifications.info(hint);
    });

    if (!lockResult) {
      if (preview.parent) preview.parent.removeChild(preview);
      preview.destroy();
      return null;
    }

    // ── Phase 2: locked — review targets, confirm or cancel ──
    const confirmed = await new Promise((resolve) => {
      let done = false;

      const onClick = (event) => {
        if (done) return;
        if (event.button === 2) { done = true; cleanup(); resolve(false); return; }
        if (event.button === 0) { done = true; cleanup(); resolve(true); }
      };

      const onContext = (e) => { e.preventDefault(); e.stopPropagation(); };

      const cleanup = () => {
        canvas.stage.off("pointerdown", onClick);
        canvas.app.view.removeEventListener("contextmenu", onContext, true);
      };

      canvas.stage.on("pointerdown", onClick);
      canvas.app.view.addEventListener("contextmenu", onContext, { capture: true });

      ui.notifications.info("Review targets. Left-click to confirm. Right-click to cancel.");
    });

    // Remove PIXI preview
    if (preview.parent) preview.parent.removeChild(preview);
    preview.destroy();

    if (!confirmed) return null;

    // Persist the real region using the final chosen radius.
    // v14: MeasuredTemplate document was absorbed into Scene Regions. We create
    // a Region with a single circle shape; radius is in pixels (x/y already are).
    const finalRadius = lockResult.radius ?? currentRadius;
    const finalRadiusPx = finalRadius * pxPerArea;
    try {
      const [created] = await canvas.scene.createEmbeddedDocuments("Region", [{
        name: label,
        shapes: [{
          type: "circle",
          x: lockResult.x,
          y: lockResult.y,
          radius: finalRadiusPx,
          hole: false
        }],
        flags: { "msh-faserip": { areaTemplate: true, radiusInAreas: finalRadius, label } }
      }]);
      return new AreaTemplate(created, { chosenRadius: finalRadius });
    } catch (err) {
      console.error("[FASERIP ERROR] AreaTemplate creation failed:", err);
      return null;
    }
  }

  /**
   * Convenience: create with interactive preview, starting near first targeted token.
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
    const shape = this._doc.shapes?.[0];
    if (!shape) return [];
    const cx = shape.x;
    const cy = shape.y;
    const radiusPx = shape.radius;

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

  /** Remove the region from the canvas. */
  async dismiss() {
    if (!this._doc?.id) return;
    try {
      await canvas.scene.deleteEmbeddedDocuments("Region", [this._doc.id]);
    } catch (err) {
      console.warn("[FASERIP WARN] Could not delete region", this._doc.id, err);
    }
  }

  get id() { return this._doc?.id; }
  get x()  { return this._doc?.shapes?.[0]?.x; }
  get y()  { return this._doc?.shapes?.[0]?.y; }
}