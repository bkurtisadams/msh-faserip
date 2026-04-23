// scripts/modules/actions/area-template.js v9.0.0 - 2026-04-22
// v9.0.0: One-phase placement. Cursor follows, left-click commits, right-click cancels.
//   Live ghost reticles highlight affected tokens during aim (no double-click review step).
//   New `persistent` option: when false, skip Region creation entirely and return
//   { x, y, radius, affectedTokens } for ephemeral effects (frag/concussive grenades).
//   When true (default, back-compat), create a Region as before for lingering hazards
//   (smoke/gas/flash, GM markers).
// v8.0.0: v14 port — MeasuredTemplate/canvas.templates gone in v14. Persisted doc is
//   a Region with a single circle shape.
// v7.0.0: Scroll-wheel resize during aim, scrollResize option.

export class AreaTemplate {
  constructor(templateDoc, { chosenRadius, x, y, radiusPx } = {}) {
    this._doc = templateDoc;
    this._chosenRadius = chosenRadius;
    this._x = x ?? templateDoc?.shapes?.[0]?.x;
    this._y = y ?? templateDoc?.shapes?.[0]?.y;
    this._radiusPx = radiusPx ?? templateDoc?.shapes?.[0]?.radius;
  }

  get chosenRadius() { return this._chosenRadius; }
  get id() { return this._doc?.id; }
  get x()  { return this._x; }
  get y()  { return this._y; }

  /** Redraw the PIXI preview circle at a new pixel radius. */
  static _redrawPreview(preview, radiusPx, colorNum, fillAlpha) {
    preview.clear();
    preview.beginFill(colorNum, fillAlpha);
    preview.lineStyle(2, 0x000000, 0.8);
    preview.drawCircle(0, 0, radiusPx);
    preview.endFill();
  }

  /** Draw ghost reticles around tokens whose center is inside (cx,cy,radiusPx). */
  static _redrawGhostReticles(graphics, cx, cy, radiusPx) {
    graphics.clear();
    const r2 = radiusPx * radiusPx;
    if (!canvas?.tokens?.placeables) return;
    for (const t of canvas.tokens.placeables) {
      if (!t?.center) continue;
      const dx = t.center.x - cx;
      const dy = t.center.y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const tr = Math.max(t.w || 100, t.h || 100) * 0.58;
      graphics.lineStyle(3, 0xff4400, 0.95);
      graphics.drawCircle(t.center.x, t.center.y, tr);
    }
  }

  /** Collect tokens whose center falls within (cx,cy,radiusPx). */
  static _tokensInside(cx, cy, radiusPx) {
    const r2 = radiusPx * radiusPx;
    return (canvas?.tokens?.placeables ?? []).filter(t => {
      if (!t?.center) return false;
      const dx = t.center.x - cx;
      const dy = t.center.y - cy;
      return (dx * dx + dy * dy) <= r2;
    });
  }

  /**
   * One-phase interactive template placement.
   *
   * Cursor tracks a translucent PIXI circle; ghost reticles highlight affected tokens live.
   * Scroll wheel resizes if scrollResize is true. Left-click commits. Right-click cancels.
   *
   * @param {boolean} persistent - when true (default), create a Region on commit;
   *                                when false, skip Region creation and return geometry only
   * @returns {Promise<AreaTemplate|Object|null>}
   *   - persistent=true: AreaTemplate instance, or null on cancel
   *   - persistent=false: { x, y, radius, radiusPx, affectedTokens, target, dismiss }, or null
   */
  static async create({
    x = 0, y = 0,
    radiusInAreas = 1,
    label = "AE",
    fillColor = "#ff0000",
    fillAlpha = 0.25,
    scrollResize = false,
    minRadiusInAreas = 1,
    persistent = true
  } = {}) {
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

    const preview = new PIXI.Graphics();
    const reticles = new PIXI.Graphics();
    AreaTemplate._redrawPreview(preview, radiusPx, colorNum, fillAlpha);

    const snapped = canvas.grid.getSnappedPoint({ x, y }, { mode: CONST.GRID_SNAPPING_MODES.CENTER });
    preview.position.set(snapped.x, snapped.y);
    const overlayLayer = canvas.controls ?? canvas.interface ?? canvas.stage;
    overlayLayer.addChild(preview);
    overlayLayer.addChild(reticles);
    AreaTemplate._redrawGhostReticles(reticles, preview.position.x, preview.position.y, radiusPx);

    const result = await new Promise((resolve) => {
      let done = false;

      const onMove = (event) => {
        if (done) return;
        const pos = event.getLocalPosition(canvas.stage);
        const snap = canvas.grid.getSnappedPoint(pos, { mode: CONST.GRID_SNAPPING_MODES.CENTER });
        preview.position.set(snap.x, snap.y);
        AreaTemplate._redrawGhostReticles(reticles, snap.x, snap.y, radiusPx);
      };

      const onClick = (event) => {
        if (done) return;
        if (event.button === 2) { done = true; cleanup(); resolve(null); return; }
        if (event.button === 0) {
          done = true;
          cleanup();
          resolve({ x: preview.position.x, y: preview.position.y, radius: currentRadius });
        }
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
        AreaTemplate._redrawGhostReticles(reticles, preview.position.x, preview.position.y, radiusPx);
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
      if (scrollResize) canvas.app.view.addEventListener("wheel", onWheel, { capture: true });
      canvas.app.view.addEventListener("contextmenu", onContext, { capture: true });

      const hint = scrollResize
        ? `Aim. Scroll to resize (${currentRadius}/${radiusInAreas} areas). Left-click to commit.`
        : "Aim. Left-click to commit. Right-click to cancel.";
      ui.notifications.info(hint);
    });

    for (const g of [preview, reticles]) {
      if (g.parent) g.parent.removeChild(g);
      g.destroy();
    }

    if (!result) return null;

    const finalRadius = result.radius ?? currentRadius;
    const finalRadiusPx = finalRadius * pxPerArea;
    const affectedTokens = AreaTemplate._tokensInside(result.x, result.y, finalRadiusPx);

    // Ephemeral path — no Region, geometry-only return
    if (!persistent) {
      return {
        x: result.x,
        y: result.y,
        radius: finalRadius,
        radiusPx: finalRadiusPx,
        affectedTokens,
        target: async () => {
          const ids = new Set(affectedTokens.map(t => t.id));
          canvas.tokens.placeables.forEach(t => {
            t.setTarget(ids.has(t.id), { user: game.user, releaseOthers: false, groupSelection: true });
          });
          return affectedTokens;
        },
        dismiss: async () => {}
      };
    }

    // Persistent path — create Region (v14 replacement for MeasuredTemplate)
    try {
      const [created] = await canvas.scene.createEmbeddedDocuments("Region", [{
        name: label,
        shapes: [{
          type: "circle",
          x: result.x,
          y: result.y,
          radius: finalRadiusPx,
          hole: false
        }],
        flags: { "msh-faserip": { areaTemplate: true, radiusInAreas: finalRadius, label } }
      }]);
      return new AreaTemplate(created, {
        chosenRadius: finalRadius,
        x: result.x,
        y: result.y,
        radiusPx: finalRadiusPx
      });
    } catch (err) {
      console.error("[FASERIP ERROR] AreaTemplate creation failed:", err);
      return null;
    }
  }

  /**
   * Create at first targeted token (or fallback point) with interactive preview.
   */
  static async createAtTarget({
    radiusInAreas = 1,
    label = "AE",
    fillColor = "#ff0000",
    fillAlpha = 0.25,
    fallbackX = 0,
    fallbackY = 0,
    persistent = true,
    scrollResize = false,
    minRadiusInAreas = 1
  } = {}) {
    const targets = Array.from(game.user.targets);
    const x = targets[0]?.center?.x ?? fallbackX;
    const y = targets[0]?.center?.y ?? fallbackY;
    return AreaTemplate.create({
      x, y, radiusInAreas, label, fillColor, fillAlpha,
      persistent, scrollResize, minRadiusInAreas
    });
  }

  /** Select tokens inside this persisted template as Foundry targets. */
  async target() {
    if (!this._doc) return [];
    const shape = this._doc.shapes?.[0];
    if (!shape) return [];
    const tokens = AreaTemplate._tokensInside(shape.x, shape.y, shape.radius);
    const ids = new Set(tokens.map(t => t.id));
    canvas.tokens.placeables.forEach(t => {
      t.setTarget(ids.has(t.id), { user: game.user, releaseOthers: false, groupSelection: true });
    });
    return tokens;
  }

  /** Remove the persisted Region from the canvas. */
  async dismiss() {
    if (!this._doc?.id) return;
    try {
      await canvas.scene.deleteEmbeddedDocuments("Region", [this._doc.id]);
    } catch (err) {
      console.warn("[FASERIP WARN] Could not delete region", this._doc.id, err);
    }
  }
}
