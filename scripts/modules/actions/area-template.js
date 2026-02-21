// scripts/modules/actions/area-template.js v1.0.0 - 2026-02-20
// v1.0.0: Place circular MeasuredTemplate on canvas, auto-target tokens inside it
// Usage: const template = await AreaTemplate.place({ radiusInAreas, label });
//        if (!template) return; // user cancelled
//        await template.target();   // select all tokens inside
//        await template.dismiss();  // remove from canvas

export class AreaTemplate {
  constructor(templateDoc) {
    this._doc = templateDoc;
  }

  // Place a circular template and wait for the user to click a location.
  // Returns an AreaTemplate instance, or null if cancelled.
  static async place({ radiusInAreas = 1, label = "AE", fillColor = "#ff0000", fillAlpha = 0.25 } = {}) {
    // Convert radius from areas to grid units (squares)
    // canvas.scene.grid.distance = areas per square (e.g. 0.1 means 1 area = 10 squares)
    const areasPerSquare = canvas.scene?.grid?.distance || 0.1;
    const radiusInSquares = radiusInAreas / areasPerSquare;
    // Foundry template distance is in grid units (squares)
    const distance = radiusInSquares * (canvas.scene?.grid?.size || 100);

    // Build template data
    const templateData = {
      t: "circle",
      user: game.user.id,
      distance: radiusInAreas,     // in scene units (areas) — Foundry renders (distance/grid.distance)*grid.size px
      direction: 0,
      x: 0,
      y: 0,
      fillColor,
      fillAlpha,
      flags: { "msh-faserip": { areaTemplate: true, radiusInAreas, label } }
    };

    // Create a temporary template document and enter placement mode
    const cls = CONFIG.MeasuredTemplate.documentClass;
    const template = new cls(templateData, { parent: canvas.scene });
    const object = new CONFIG.MeasuredTemplate.objectClass(template);

    // Inject into the template layer for preview
    canvas.templates.preview.addChild(object);
    object.draw();

    // Wait for user to place it
    // Foundry v13 / PIXI v7: listen on canvas.stage with federated events
    return new Promise((resolve) => {
      const cleanup = () => {
        canvas.stage.off("mousemove", moveHandler);
        canvas.stage.off("click", clickHandler);
        canvas.stage.off("rightclick", cancelHandler);
        canvas.templates.preview.removeChild(object);
      };

      const moveHandler = (event) => {
        const pos = event.getLocalPosition(canvas.templates);
        const snapped = canvas.templates.getSnappedPoint(pos);
        object.document.updateSource({ x: snapped.x, y: snapped.y });
        object.refresh();
      };

      const clickHandler = async (event) => {
        const pos = event.getLocalPosition(canvas.templates);
        const snapped = canvas.templates.getSnappedPoint(pos);
        cleanup();

        const [doc] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [{
          ...templateData,
          x: snapped.x,
          y: snapped.y
        }]);

        resolve(new AreaTemplate(doc));
      };

      const cancelHandler = () => {
        cleanup();
        resolve(null);
      };

      canvas.stage.on("mousemove", moveHandler);
      canvas.stage.on("click", clickHandler);
      canvas.stage.on("rightclick", cancelHandler);
    });
  }

  // Select all tokens whose center falls within this template as Foundry targets
  async target() {
    if (!this._doc) return;

    // Use the same formula Foundry uses to render the circle:
    // radiusPx = (distance / grid.distance) * grid.size
    const gridDist = canvas.scene.grid.distance || 0.2;
    const gridSize = canvas.scene.grid.size ?? 100;
    const radiusPx = (this._doc.distance / gridDist) * gridSize;
    const cx       = this._doc.x;
    const cy       = this._doc.y;

    const tokens = canvas.tokens.placeables.filter(t => {
      const dx = t.center.x - cx;
      const dy = t.center.y - cy;
      const inside = (dx * dx + dy * dy) <= (radiusPx * radiusPx);
      return inside;
    });

    // Set as user targets (Foundry v13: setTarget on each token)
    const tokenIds = new Set(tokens.map(t => t.id));
    canvas.tokens.placeables.forEach(t => {
      t.setTarget(tokenIds.has(t.id), { user: game.user, releaseOthers: false, groupSelection: true });
    });
    return tokens;
  }

  // Remove the template from the canvas
  async dismiss() {
    if (this._doc?.id) {
      await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", [this._doc.id]);
    }
  }

  // Keep template but attach a timed ActiveEffect to auto-delete it after N turns
  // Used for smoke/gas/flash that persist
  async persist({ durationTurns = 1, label = "Area Effect" } = {}) {
    if (!this._doc?.id) return;
    const templateId = this._doc.id;
    const sceneId    = canvas.scene.id;
    const secondsPerTurn = 6;
    const seconds = durationTurns * secondsPerTurn;

    // Store expiry info in a world flag so a hook can clean it up
    const key = `areaTemplate.${templateId}`;
    await game.settings.set("msh-faserip", "persistedTemplates", {
      ...(game.settings.get("msh-faserip", "persistedTemplates") || {}),
      [key]: {
        templateId,
        sceneId,
        label,
        expiresAt: (game.time?.worldTime || 0) + seconds,
        durationTurns
      }
    }).catch(() => {
      // Setting may not exist — fall back to world flag
      game.user.setFlag("msh-faserip", key, {
        templateId, sceneId, label,
        expiresAt: (game.time?.worldTime || 0) + seconds
      });
    });

    ui.notifications.info(`${label} template will persist for ${durationTurns} turn${durationTurns !== 1 ? "s" : ""}.`);
  }

  get id() { return this._doc?.id; }
  get x()  { return this._doc?.x; }
  get y()  { return this._doc?.y; }
}

// Hook: clean up persisted templates when world time advances
Hooks.on("updateWorldTime", async (worldTime) => {
  // Try to read persisted templates from settings
  let persisted = {};
  try {
    persisted = game.settings.get("msh-faserip", "persistedTemplates") || {};
  } catch {
    return; // setting not registered
  }

  const toDelete = [];
  const updated  = { ...persisted };

  for (const [key, data] of Object.entries(persisted)) {
    if (worldTime >= data.expiresAt) {
      toDelete.push(key);
      // Delete the template from the scene
      const scene = game.scenes?.get(data.sceneId);
      if (scene) {
        const tmpl = scene.templates.get(data.templateId);
        if (tmpl) {
          await scene.deleteEmbeddedDocuments("MeasuredTemplate", [data.templateId]);
          ui.notifications.info(`${data.label} has dispersed.`);
        }
      }
    }
  }

  if (toDelete.length) {
    for (const k of toDelete) delete updated[k];
    await game.settings.set("msh-faserip", "persistedTemplates", updated).catch(() => {});
  }
});