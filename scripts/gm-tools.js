// gm-tools.js v1.1.0 - 2026-04-04
// GM Tools dialog: character backup/restore, export/import
// v1.1.0: embed actor portrait as base64 in snapshots for GCC import

const SETTING_KEY = "gmBackups";
const SCOPE = "msh-faserip";

export class GMToolsApp extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "faserip-gm-tools",
      classes: ["msh", "faserip-gm-tools"],
      title: "GM Tools",
      template: "systems/msh-faserip/templates/gm-tools.html",
      width: 680,
      height: 600,
      resizable: true,
      minimizable: true
    });
  }

  constructor(options = {}) {
    super(options);
    this._onActorChange = () => { if (this.rendered) this.render(); };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find(".gm-backup-btn").click(ev => this._onBackup(ev));
    html.find(".gm-restore-btn").click(ev => this._onRestore(ev));
    html.find(".gm-export-btn").click(ev => this._onExport(ev));
    html.find(".gm-import-btn").click(ev => this._onImport(ev));
    html.find(".gm-backup-all-btn").click(ev => this._onBackupAll(ev));
    html.find(".gm-export-all-btn").click(ev => this._onExportAll(ev));
    html.find(".gm-delete-backup-btn").click(ev => this._onDeleteBackup(ev));
    html.find(".gm-restore-orphan-btn").click(ev => this._onRestoreOrphan(ev));
    html.find(".gm-import-file").change(ev => this._onImportFile(ev));

    // Re-render when actors change
    Hooks.on("createActor", this._onActorChange);
    Hooks.on("deleteActor", this._onActorChange);
    Hooks.on("updateActor", this._onActorChange);
  }

  close(options) {
    Hooks.off("createActor", this._onActorChange);
    Hooks.off("deleteActor", this._onActorChange);
    Hooks.off("updateActor", this._onActorChange);
    return super.close(options);
  }

  async getData() {
    const backups = this._getBackups();
    const actors = game.actors.filter(a => ["hero", "villain", "npc"].includes(a.type));
    const actorData = actors.map(a => {
      const snap = backups[a.id];
      return {
        id: a.id,
        name: a.name,
        type: a.type,
        img: a.img,
        hasBackup: !!snap,
        backupDate: snap?.timestamp ? new Date(snap.timestamp).toLocaleString() : "",
        backupCount: snap ? 1 : 0
      };
    });
    // Orphan backups (actor deleted but backup remains)
    const orphans = Object.entries(backups)
      .filter(([id]) => !game.actors.get(id))
      .map(([id, snap]) => ({
        id,
        name: snap.name || "Unknown",
        type: snap.type || "hero",
        timestamp: new Date(snap.timestamp).toLocaleString(),
        isOrphan: true
      }));
    return { actors: actorData, orphans, hasOrphans: orphans.length > 0 };
  }

  // ── Portrait embedding ──

  async _imgToBase64(imgPath) {
    if (!imgPath || imgPath.includes("mystery-man")) return "";
    if (imgPath.startsWith("data:image/")) return imgPath;
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imgPath;
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      return canvas.toDataURL("image/png");
    } catch (e) {
      console.warn(`[FASERIP] GM Tools: could not embed portrait for ${imgPath}`, e);
      return "";
    }
  }

  // ── Snapshot ──

  async _snapshotActor(actor) {
    const sys = foundry.utils.deepClone(actor.system);
    const items = actor.items.map(i => ({
      name: i.name,
      type: i.type,
      img: i.img,
      system: foundry.utils.deepClone(i.system),
      flags: foundry.utils.deepClone(i.flags || {})
    }));
    const effects = actor.effects.map(e => ({
      name: e.name,
      icon: e.icon,
      disabled: e.disabled,
      duration: foundry.utils.deepClone(e.duration || {}),
      changes: foundry.utils.deepClone(e.changes || []),
      flags: foundry.utils.deepClone(e.flags || {}),
      statuses: Array.from(e.statuses || [])
    }));
    // Embed portrait as base64 for external tools (GCC import)
    const portraitData = await this._imgToBase64(actor.img);
    return {
      name: actor.name,
      type: actor.type,
      img: portraitData || actor.img,
      system: sys,
      items,
      effects,
      flags: foundry.utils.deepClone(actor.flags || {}),
      prototypeToken: foundry.utils.deepClone(actor.prototypeToken?.toObject?.() || {}),
      timestamp: Date.now(),
      version: game.system.version || "unknown"
    };
  }

  // ── Storage ──

  _getBackups() {
    try {
      return game.settings.get(SCOPE, SETTING_KEY) || {};
    } catch { return {}; }
  }

  async _saveBackups(backups) {
    await game.settings.set(SCOPE, SETTING_KEY, backups);
  }

  // ── Actions ──

  async _onBackup(ev) {
    const actorId = ev.currentTarget.dataset.actorId;
    const actor = game.actors.get(actorId);
    if (!actor) return;
    const snap = await this._snapshotActor(actor);
    const backups = this._getBackups();
    backups[actorId] = snap;
    await this._saveBackups(backups);
    ui.notifications.info(`Backed up ${actor.name}`);
    this.render();
  }

  async _onRestore(ev) {
    const actorId = ev.currentTarget.dataset.actorId;
    const backups = this._getBackups();
    const snap = backups[actorId];
    if (!snap) { ui.notifications.warn("No backup found"); return; }
    const actor = game.actors.get(actorId);
    if (!actor) { ui.notifications.warn("Actor not found"); return; }

    const confirm = await Dialog.confirm({
      title: `Restore ${snap.name}?`,
      content: `<p>This will overwrite <strong>${actor.name}</strong> with the backup from ${new Date(snap.timestamp).toLocaleString()}.</p><p>Current items, effects, and system data will be replaced.</p>`
    });
    if (!confirm) return;

    await this._applySnapshot(actor, snap);
    ui.notifications.info(`Restored ${actor.name} from backup`);
    this.render();
  }

  async _onRestoreOrphan(ev) {
    const backupId = ev.currentTarget.dataset.backupId;
    const backups = this._getBackups();
    const snap = backups[backupId];
    if (!snap) { ui.notifications.warn("Backup not found"); return; }

    const confirm = await Dialog.confirm({
      title: `Restore deleted character: ${snap.name}?`,
      content: `<p>This will create a new actor <strong>${snap.name}</strong> from the backup made ${new Date(snap.timestamp).toLocaleString()}.</p>`
    });
    if (!confirm) return;

    // For restore, use original file path if img is base64 (Foundry stores files, not data URLs)
    const restoreImg = snap._originalImg || snap.img || "icons/svg/mystery-man.svg";
    const newActor = await Actor.create({
      name: snap.name,
      type: snap.type,
      img: restoreImg.startsWith("data:") ? "icons/svg/mystery-man.svg" : restoreImg
    });
    await this._applySnapshot(newActor, snap);

    // Move backup to new actor id, remove orphan
    backups[newActor.id] = snap;
    delete backups[backupId];
    await this._saveBackups(backups);

    ui.notifications.info(`Restored ${snap.name} as new actor`);
    this.render();
  }

  async _applySnapshot(actor, snap) {
    // Update system data
    const flatUpdates = {};
    flatUpdates["system"] = snap.system;
    // Don't overwrite img with base64 — Foundry needs file paths
    const imgVal = snap._originalImg || snap.img || actor.img;
    flatUpdates["img"] = imgVal.startsWith("data:") ? actor.img : imgVal;
    if (snap.flags) flatUpdates["flags"] = snap.flags;
    if (snap.prototypeToken) flatUpdates["prototypeToken"] = snap.prototypeToken;
    await actor.update(flatUpdates);

    // Replace items
    const existingIds = actor.items.map(i => i.id);
    if (existingIds.length) await actor.deleteEmbeddedDocuments("Item", existingIds);
    if (snap.items?.length) await actor.createEmbeddedDocuments("Item", snap.items);

    // Replace effects
    const existingEffectIds = actor.effects.map(e => e.id);
    if (existingEffectIds.length) await actor.deleteEmbeddedDocuments("ActiveEffect", existingEffectIds);
    if (snap.effects?.length) await actor.createEmbeddedDocuments("ActiveEffect", snap.effects);
  }

  async _onDeleteBackup(ev) {
    const backupId = ev.currentTarget.dataset.backupId;
    const backups = this._getBackups();
    const snap = backups[backupId];
    if (!snap) return;

    const confirm = await Dialog.confirm({
      title: "Delete Backup?",
      content: `<p>Permanently delete the backup for <strong>${snap.name}</strong>?</p>`
    });
    if (!confirm) return;

    delete backups[backupId];
    await this._saveBackups(backups);
    ui.notifications.info(`Deleted backup for ${snap.name}`);
    this.render();
  }

  async _onExport(ev) {
    const actorId = ev.currentTarget.dataset.actorId;
    const actor = game.actors.get(actorId);
    if (!actor) return;

    // Fresh snapshot with embedded portrait
    const snap = await this._snapshotActor(actor);
    // Store original path so restore doesn't break Foundry
    snap._originalImg = actor.img;
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${actor.name.replace(/\s+/g, "-")}-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    ui.notifications.info(`Exported ${actor.name}`);
  }

  async _onExportAll(ev) {
    const actors = game.actors.filter(a => ["hero", "villain", "npc"].includes(a.type));
    const allSnaps = {};
    for (const actor of actors) {
      const snap = await this._snapshotActor(actor);
      snap._originalImg = actor.img;
      allSnaps[actor.id] = snap;
    }
    const blob = new Blob([JSON.stringify(allSnaps, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `faserip-all-actors-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    ui.notifications.info(`Exported ${actors.length} actors`);
  }

  _onImport(ev) {
    // Trigger the hidden file input
    const fileInput = ev.currentTarget.closest(".gm-tools-bulk-actions")?.querySelector(".gm-import-file")
      || this.element.find(".gm-import-file")[0];
    if (fileInput) fileInput.click();
  }

  async _onImportFile(ev) {
    const file = ev.currentTarget.files[0];
    if (!file) return;
    ev.currentTarget.value = "";

    const text = await file.text();
    let data;
    try { data = JSON.parse(text); } catch {
      ui.notifications.error("Invalid JSON file");
      return;
    }

    // Detect: single snapshot vs bulk export
    if (data.name && data.system && data.items) {
      // Single actor snapshot
      await this._importSingleSnapshot(data);
    } else if (typeof data === "object" && !Array.isArray(data)) {
      // Bulk export: { actorId: snapshot, ... }
      const entries = Object.values(data);
      if (entries.length && entries[0].name && entries[0].system) {
        await this._importBulkSnapshots(entries);
      } else {
        ui.notifications.error("Unrecognized backup format");
      }
    }
  }

  async _importSingleSnapshot(snap) {
    // Check if actor exists by name
    const existing = game.actors.find(a => a.name === snap.name);
    let target;
    // Use original file path for Foundry, not base64
    const actorImg = snap._originalImg || (snap.img?.startsWith("data:") ? "icons/svg/mystery-man.svg" : snap.img) || "icons/svg/mystery-man.svg";

    if (existing) {
      const choice = await Dialog.confirm({
        title: `Import: ${snap.name}`,
        content: `<p>An actor named <strong>${snap.name}</strong> already exists. Overwrite with the imported backup from ${new Date(snap.timestamp).toLocaleString()}?</p><p>Click "No" to create a new actor instead.</p>`
      });
      if (choice) {
        target = existing;
      } else {
        target = await Actor.create({
          name: `${snap.name} (Imported)`,
          type: snap.type,
          img: actorImg
        });
      }
    } else {
      target = await Actor.create({
        name: snap.name,
        type: snap.type,
        img: actorImg
      });
    }

    await this._applySnapshot(target, snap);

    // Save as backup too
    const backups = this._getBackups();
    backups[target.id] = snap;
    await this._saveBackups(backups);

    ui.notifications.info(`Imported ${snap.name}`);
    this.render();
  }

  async _importBulkSnapshots(snapshots) {
    const confirm = await Dialog.confirm({
      title: "Bulk Import",
      content: `<p>Import ${snapshots.length} character backup(s)?</p><p>Existing actors with matching names will be overwritten.</p>`
    });
    if (!confirm) return;

    let count = 0;
    for (const snap of snapshots) {
      const actorImg = snap._originalImg || (snap.img?.startsWith("data:") ? "icons/svg/mystery-man.svg" : snap.img) || "icons/svg/mystery-man.svg";
      let target = game.actors.find(a => a.name === snap.name);
      if (!target) {
        target = await Actor.create({
          name: snap.name,
          type: snap.type,
          img: actorImg
        });
      }
      await this._applySnapshot(target, snap);
      const backups = this._getBackups();
      backups[target.id] = snap;
      await this._saveBackups(backups);
      count++;
    }
    ui.notifications.info(`Imported ${count} actors`);
    this.render();
  }

  async _onBackupAll(ev) {
    const actors = game.actors.filter(a => ["hero", "villain", "npc"].includes(a.type));
    const backups = this._getBackups();
    for (const actor of actors) {
      backups[actor.id] = await this._snapshotActor(actor);
    }
    await this._saveBackups(backups);
    ui.notifications.info(`Backed up ${actors.length} actors`);
    this.render();
  }
}

// ── Registration ──

export function registerGMTools() {
  // Register backup storage setting
  game.settings.register(SCOPE, SETTING_KEY, {
    name: "GM Backups",
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  // Add button to Actor Directory header
  // Try multiple selectors for v13 compatibility
  const addButton = (html) => {
    if (!game.user.isGM) return;
    const root = html instanceof jQuery ? html[0] : html;
    if (!root) return;

    // Don't double-add
    if (root.querySelector?.(".gm-tools-btn")) return;

    // v13 uses .header-actions or .action-buttons in the directory header
    const header = root.querySelector(".header-actions")
      || root.querySelector(".action-buttons")
      || root.querySelector(".directory-header");
    if (!header) {
      console.warn("[FASERIP] GM Tools: could not find Actor Directory header element");
      return;
    }

    const btn = document.createElement("button");
    btn.className = "gm-tools-btn";
    btn.type = "button";
    btn.dataset.tooltip = "GM Tools";
    btn.setAttribute("aria-label", "GM Tools");
    btn.innerHTML = '<i class="fas fa-shield-alt"></i>';
    btn.addEventListener("click", () => {
      new GMToolsApp().render(true);
    });
    header.appendChild(btn);
    console.log("[FASERIP] GM Tools button added to Actor Directory");
  };

  Hooks.on("renderActorDirectory", (app, html) => addButton(html));

  // Also try to add now if sidebar already rendered
  if (ui.actors?.element) {
    const el = ui.actors.element instanceof jQuery ? ui.actors.element : $(ui.actors.element);
    addButton(el[0] || el);
  }
}