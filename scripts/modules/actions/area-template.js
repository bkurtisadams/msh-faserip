// scripts/modules/actions/area-template.js v6.0.0 - 2026-03-05
// v6.0.0: Two-phase placement with PIXI.Graphics preview (objectClass doesn't render unpersisted).
//   Phase 1 — PIXI circle follows mouse. Left-click locks position.
//   Phase 2 — Circle stays put for target review. Left-click confirms. Right-click cancels.
//   On confirm, persists via createEmbeddedDocuments (standard v13 API).

export class AreaTemplate {
  constructor(templateDoc) {
    this._doc = templateDoc;
  }

  /**
   * Two-phase measured template placement.
   *
   * Phase 1: translucent PIXI circle follows cursor, snapping to grid center.
   *          Left-click locks position. Right-click cancels.
   * Phase 2: circle stays put so user can review who is in the blast.
   *          Left-click confirms → persists real MeasuredTemplate → resolves.
   *          Right-click cancels → removes preview → resolves null.
   */
  static async create({ x = 0, y = 0, radiusInAreas = 1, label = "AE", fillColor = "#ff0000", fillAlpha = 0.25 } = {}) {
    if (!canvas?.scene) {
      console.error("[FASERIP ERROR] AreaTemplate: No active scene.");
      return null;
    }

    const gridDist = canvas.scene.grid.distance || 1;
    const gridSize = canvas.scene.grid.size ?? 100;
    const radiusPx = (radiusInAreas / gridDist) * gridSize;
    const colorNum = PIXI.utils.string2hex?.(fillColor) ?? parseInt(fillColor.replace("#", ""), 16);

    // Build PIXI preview graphic
    const preview = new PIXI.Graphics();
    preview.beginFill(colorNum, fillAlpha);
    preview.lineStyle(2, 0x000000, 0.8);
    preview.drawCircle(0, 0, radiusPx);
    preview.endFill();

    const snapped = canvas.grid.getSnappedPoint({ x, y }, { mode: CONST.GRID_SNAPPING_MODES.CENTER });
    preview.position.set(snapped.x, snapped.y);
    canvas.templates.addChild(preview);

    // ── Phase 1: follow mouse, left-click locks, right-click cancels ──
    const lockPos = await new Promise((resolve) => {
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
        if (event.button === 0) { done = true; cleanup(); resolve({ x: preview.position.x, y: preview.position.y }); }
      };

      const onContext = (e) => { e.preventDefault(); e.stopPropagation(); };

      const cleanup = () => {
        canvas.stage.off("pointermove", onMove);
        canvas.stage.off("pointerdown", onClick);
        canvas.app.view.removeEventListener("contextmenu", onContext, true);
      };

      canvas.stage.on("pointermove", onMove);
      canvas.stage.on("pointerdown", onClick);
      canvas.app.view.addEventListener("contextmenu", onContext, { capture: true });

      ui.notifications.info("Move to aim. Left-click to lock position.");
    });

    if (!lockPos) {
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

    // Persist the real template
    try {
      const [created] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [{
        t: "circle",
        distance: radiusInAreas,
        direction: 0,
        angle: 360,
        x: lockPos.x,
        y: lockPos.y,
        fillColor,
        fillAlpha,
        borderColor: "#000000",
        flags: { "msh-faserip": { areaTemplate: true, radiusInAreas, label } }
      }]);
      return new AreaTemplate(created);
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
      console.warn("[FASERIP WARN] Could not delete template", this._doc.id, err);
    }
  }

  get id() { return this._doc?.id; }
  get x()  { return this._doc?.x; }
  get y()  { return this._doc?.y; }
}