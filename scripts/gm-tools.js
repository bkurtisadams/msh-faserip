// gm-tools.js v1.2.0 - 2026-04-29
// GM Tools dialog: character backup/restore, export/import,
// effects test panel, action runner.
// v1.2.0: tabbed dialog. Effects tab applies/clears every status effect
//         in effect-engine.js against selected/targeted token; inspector
//         lists active FASERIP effects with remaining duration.
//         Combat tab dispatches every Action HUD action via
//         ActionDispatcher with mode override + Run-All sequencer +
//         coverage tracking.
// v1.1.0: embed actor portrait as base64 in snapshots for GCC import

import {
  applyStun, applySlam, applyProne, applyGrappled, applyHeld,
  applyEntangled, applyBlinded, applyUnconscious, applyDying,
  applyCharging, applyDeafened, applyParalyzed, applyWeakened,
  applyEscaped, applyReversed, applyEvade, applyBlock, applyCatch,
  getRemaining
} from "./modules/effects/effect-engine.js";
import { ActionDispatcher } from "./modules/actions/action-dispatcher.js";
import { ACTIONS as ACTION_LIST } from "../helpers/action-constants.js";
import { safeActorDeleteEffects } from "./gm-utils.js";

const SETTING_KEY = "gmBackups";
const SCOPE = "msh-faserip";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export class GMToolsApp extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "faserip-gm-tools",
      classes: ["msh", "faserip-gm-tools"],
      title: "GM Tools",
      template: "systems/msh-faserip/templates/gm-tools.html",
      width: 720,
      height: 720,
      resizable: true,
      minimizable: true
    });
  }

  constructor(options = {}) {
    super(options);
    this._onActorChange = () => { if (this.rendered) this.render(); };
    this._onTokenChange = () => { if (this.rendered) this.render(); };
    this._activeTab = "backups";
    this._effectSide = "target";
    this._testMode = "full";
    this._runDelay = 800;
    this._coverage = new Map();
    this._running = false;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Tab navigation
    html.find(".gm-tab-link").click(ev => this._onTabClick(ev));
    this._restoreActiveTab(html);

    // Backup tab
    html.find(".gm-backup-btn").click(ev => this._onBackup(ev));
    html.find(".gm-restore-btn").click(ev => this._onRestore(ev));
    html.find(".gm-export-btn").click(ev => this._onExport(ev));
    html.find(".gm-import-btn").click(ev => this._onImport(ev));
    html.find(".gm-backup-all-btn").click(ev => this._onBackupAll(ev));
    html.find(".gm-export-all-btn").click(ev => this._onExportAll(ev));
    html.find(".gm-delete-backup-btn").click(ev => this._onDeleteBackup(ev));
    html.find(".gm-restore-orphan-btn").click(ev => this._onRestoreOrphan(ev));
    html.find(".gm-import-file").change(ev => this._onImportFile(ev));

    // Effects tab
    html.find("input[name='gm-effect-side']").change(ev => this._onEffectSideChange(ev));
    html.find(".gm-effect-btn").click(ev => this._onApplyEffect(ev));
    html.find(".gm-effect-clear-one").click(ev => this._onClearOneEffect(ev));
    html.find(".gm-test-clear-all").click(ev => this._onClearAllEffects(ev));

    // Combat tab
    html.find("input[name='gm-test-mode']").change(ev => this._onModeChange(ev));
    html.find(".gm-action-btn").click(ev => this._onRunAction(ev));
    html.find(".gm-runner-all").click(ev => this._onRunAll(ev));
    html.find(".gm-runner-delay").change(ev => { this._runDelay = Number(ev.currentTarget.value) || 0; });
    html.find(".gm-coverage-reset").click(ev => this._onResetCoverage(ev));

    // Re-render when actors / tokens change
    Hooks.on("createActor", this._onActorChange);
    Hooks.on("deleteActor", this._onActorChange);
    Hooks.on("updateActor", this._onActorChange);
    Hooks.on("controlToken", this._onTokenChange);
    Hooks.on("targetToken", this._onTokenChange);
    Hooks.on("createActiveEffect", this._onTokenChange);
    Hooks.on("deleteActiveEffect", this._onTokenChange);
    Hooks.on("updateActiveEffect", this._onTokenChange);
  }

  close(options) {
    Hooks.off("createActor", this._onActorChange);
    Hooks.off("deleteActor", this._onActorChange);
    Hooks.off("updateActor", this._onActorChange);
    Hooks.off("controlToken", this._onTokenChange);
    Hooks.off("targetToken", this._onTokenChange);
    Hooks.off("createActiveEffect", this._onTokenChange);
    Hooks.off("deleteActiveEffect", this._onTokenChange);
    Hooks.off("updateActiveEffect", this._onTokenChange);
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
    const orphans = Object.entries(backups)
      .filter(([id]) => !game.actors.get(id))
      .map(([id, snap]) => ({
        id,
        name: snap.name || "Unknown",
        type: snap.type || "hero",
        timestamp: new Date(snap.timestamp).toLocaleString(),
        isOrphan: true
      }));

    // ── Test panel context ──
    const selectedToken = canvas?.tokens?.controlled?.[0] ?? null;
    const targetToken = Array.from(game.user?.targets ?? [])[0] ?? null;
    const selectedActor = selectedToken?.actor ?? null;
    const targetActor = targetToken?.actor ?? null;

    const inspectActor = this._effectSide === "selected" ? selectedActor : targetActor;
    const inspectorEffects = inspectActor ? this._collectFaseripEffects(inspectActor) : [];
    const inspectorTarget = inspectActor?.name ?? "no token";

    const coverageSet = this._coverageFor(selectedActor);
    const actionList = ACTION_LIST.map(a => ({
      ...a,
      fired: coverageSet.has(a.id)
    }));

    return {
      // Backups
      actors: actorData,
      orphans,
      hasOrphans: orphans.length > 0,
      // Test panels
      selectedName: selectedActor?.name ?? null,
      targetName: targetActor?.name ?? null,
      isTargetSide: this._effectSide === "target",
      inspectorEffects,
      inspectorTarget,
      isManualMode: this._testMode === "manual",
      isSemiMode: this._testMode === "semi",
      isFullMode: this._testMode === "full",
      actionList,
      runDelay: this._runDelay
    };
  }

  // ── Tab nav ──

  _onTabClick(ev) {
    ev.preventDefault();
    const tab = ev.currentTarget.dataset.tab;
    this._activeTab = tab;
    const root = this.element[0];
    root.querySelectorAll(".gm-tab-link").forEach(el => el.classList.toggle("active", el.dataset.tab === tab));
    root.querySelectorAll(".gm-tab-panel").forEach(el => el.classList.toggle("active", el.dataset.tab === tab));
  }

  _restoreActiveTab(html) {
    const root = html instanceof jQuery ? html[0] : html;
    if (!root) return;
    const tab = this._activeTab || "backups";
    root.querySelectorAll(".gm-tab-link").forEach(el => el.classList.toggle("active", el.dataset.tab === tab));
    root.querySelectorAll(".gm-tab-panel").forEach(el => el.classList.toggle("active", el.dataset.tab === tab));
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

  // ── Test panel: actor resolution ──

  _selectedActor() {
    return canvas?.tokens?.controlled?.[0]?.actor ?? null;
  }

  _targetActor() {
    return Array.from(game.user?.targets ?? [])[0]?.actor ?? null;
  }

  _effectSideActor() {
    return this._effectSide === "selected" ? this._selectedActor() : this._targetActor();
  }

  // ── Test panel: effects ──

  _onEffectSideChange(ev) {
    this._effectSide = ev.currentTarget.value === "selected" ? "selected" : "target";
    this.render();
  }

  _collectFaseripEffects(actor) {
    if (!actor) return [];
    const out = [];
    for (const e of actor.effects) {
      const f = e.flags?.[SCOPE];
      if (!f) continue;
      const effectType = f.effectType ?? f.ongoingId ?? (f.isDying ? "dying" : "");
      if (!effectType && !f.status) continue;
      let remaining = "";
      try {
        const r = getRemaining(e);
        if (r && typeof r === "object") {
          if (r.rounds != null) remaining = `${r.rounds}r`;
          else if (r.seconds != null) remaining = `${r.seconds}s`;
          else if (r.turns != null) remaining = `${r.turns}t`;
        } else if (typeof r === "number") {
          remaining = `${r}`;
        }
      } catch (_) { /* ignore */ }
      if (!remaining) remaining = e.duration?.rounds ? `${e.duration.rounds}r` : "—";
      out.push({
        id: e.id,
        name: e.name,
        effectType,
        remaining
      });
    }
    return out;
  }

  async _onApplyEffect(ev) {
    ev.preventDefault();
    const actor = this._effectSideActor();
    if (!actor) return ui.notifications.warn("No token on the chosen side. Select or target one.");
    const id = ev.currentTarget.dataset.effect;
    try {
      await this._applyEffectById(actor, id);
      ui.notifications.info(`Applied ${id} to ${actor.name}`);
    } catch (e) {
      console.error("[FASERIP:GMTools] applyEffect failed", id, e);
      ui.notifications.error(`Apply ${id} failed: ${e.message}`);
    }
    this.render();
  }

  async _applyEffectById(actor, id) {
    switch (id) {
      case "stun":        return applyStun(actor, { rounds: 1 });
      case "slam-1area":  return applySlam(actor, { kind: "1 Area", knockbackAreas: 1 });
      case "slam-grand":  return applySlam(actor, { kind: "Grand Slam", knockbackAreas: 3 });
      case "prone":       return applyProne(actor, { rounds: 1 });
      case "grappled":    return applyGrappled(actor, { holderName: this._otherSideName(actor) });
      case "held":        return applyHeld(actor, { holderName: this._otherSideName(actor) });
      case "entangled":   return applyEntangled(actor, { materialRank: "Good", rounds: 5 });
      case "blinded":     return applyBlinded(actor, { rounds: 5 });
      case "deafened":    return applyDeafened(actor, { rounds: 5 });
      case "paralyzed":   return applyParalyzed(actor, { rounds: 5 });
      case "weakened":    return applyWeakened(actor, { rounds: 5 });
      case "unconscious": return applyUnconscious(actor, { rounds: 10 });
      case "dying":       return applyDying(actor, {});
      case "charging":    return applyCharging(actor, { rounds: 1 });
      case "evade":       return applyEvade(actor, { evadeSuccessful: true });
      case "block":       return applyBlock(actor, { armorRank: "Good", armorValue: 10 });
      case "catch":       return applyCatch(actor, { scenario: "generic" });
      case "escaped":     return applyEscaped(actor);
      case "reversed":    return applyReversed(actor);
      default: throw new Error(`Unknown effect id: ${id}`);
    }
  }

  _otherSideName(actor) {
    const sel = this._selectedActor();
    const tgt = this._targetActor();
    if (actor === sel) return tgt?.name ?? "";
    if (actor === tgt) return sel?.name ?? "";
    return "";
  }

  async _onClearOneEffect(ev) {
    ev.preventDefault();
    const actor = this._effectSideActor();
    if (!actor) return;
    const effectId = ev.currentTarget.dataset.effectId;
    if (!effectId) return;
    await safeActorDeleteEffects(actor, [effectId]);
    this.render();
  }

  async _onClearAllEffects(ev) {
    ev.preventDefault();
    const actor = this._effectSideActor();
    if (!actor) return ui.notifications.warn("No token on the chosen side.");
    const ids = actor.effects
      .filter(e => e.flags?.[SCOPE])
      .map(e => e.id);
    if (!ids.length) return ui.notifications.info(`${actor.name}: no FASERIP effects to clear.`);
    await safeActorDeleteEffects(actor, ids);
    ui.notifications.info(`Cleared ${ids.length} effect(s) from ${actor.name}`);
    this.render();
  }

  // ── Test panel: combat / action runner ──

  _onModeChange(ev) {
    const v = ev.currentTarget.value;
    this._testMode = (v === "manual" || v === "semi" || v === "full") ? v : "full";
  }

  _coverageFor(actor) {
    if (!actor) return new Set();
    let s = this._coverage.get(actor.id);
    if (!s) { s = new Set(); this._coverage.set(actor.id, s); }
    return s;
  }

  async _onRunAction(ev) {
    ev.preventDefault();
    const actor = this._selectedActor();
    if (!actor) return ui.notifications.warn("Select an attacker token first.");
    const id = ev.currentTarget.dataset.actionId;
    const ability = ev.currentTarget.dataset.ability;
    await this._dispatch(actor, id, ability);
    this._coverageFor(actor).add(id);
    this.render();
  }

  async _dispatch(actor, actionId, ability) {
    try {
      await ActionDispatcher.roll(actionId, {
        actor,
        abilityName: ability,
        opts: { mode: this._testMode }
      });
    } catch (e) {
      if (e?.message && e.message !== "cancelled") {
        console.error(`[FASERIP:GMTools] action ${actionId} threw`, e);
        ui.notifications.error(`${actionId} error: ${e.message}`);
      }
    }
  }

  async _onRunAll(ev) {
    ev.preventDefault();
    if (this._running) return;
    const actor = this._selectedActor();
    if (!actor) return ui.notifications.warn("Select an attacker token first.");
    const target = this._targetActor();
    if (!target) {
      const proceed = await Dialog.confirm({
        title: "No Target",
        content: "<p>No targeted token. Attack actions will likely warn or no-op. Continue anyway?</p>"
      });
      if (!proceed) return;
    }
    if (this._testMode !== "full") {
      const proceed = await Dialog.confirm({
        title: "Mode is not Full",
        content: "<p>Manual/Semi modes open dialogs that block the runner. Switch to Full or continue and click through?</p>"
      });
      if (!proceed) return;
    }
    this._running = true;
    const cov = this._coverageFor(actor);
    try {
      for (const a of ACTION_LIST) {
        await this._dispatch(actor, a.id, a.ability);
        cov.add(a.id);
        this.render();
        if (this._runDelay > 0) await sleep(this._runDelay);
      }
      ui.notifications.info(`Run All: ${ACTION_LIST.length} actions dispatched.`);
    } finally {
      this._running = false;
      this.render();
    }
  }

  _onResetCoverage(ev) {
    ev.preventDefault();
    const actor = this._selectedActor();
    if (actor) this._coverage.set(actor.id, new Set());
    else this._coverage.clear();
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

  // Console + programmatic opener (singleton)
  game.msh = game.msh ?? {};
  game.msh.openGMTools = () => {
    if (!game.user.isGM) return ui.notifications.warn("GM Tools is GM-only");
    if (game.msh._gmToolsApp?.rendered) {
      game.msh._gmToolsApp.bringToTop();
      return game.msh._gmToolsApp;
    }
    game.msh._gmToolsApp = new GMToolsApp();
    game.msh._gmToolsApp.render(true);
    return game.msh._gmToolsApp;
  };

  // Scene Controls button (v13/v14 reliable path)
  Hooks.on("getSceneControlButtons", (controlsData) => {
    if (!game.user?.isGM) return;
    let groups;
    if (Array.isArray(controlsData)) groups = controlsData;
    else if (controlsData && typeof controlsData === "object") groups = Object.values(controlsData);
    else return;
    const tokenGroup = groups.find(g => g.name === "tokens" || g.name === "token");
    if (!tokenGroup) return;

    const tools = {};
    if (tokenGroup.tools) {
      for (const t of Object.values(tokenGroup.tools)) {
        if (t?.name) tools[t.name] = t;
      }
    }
    if (!tools["faserip-gm-tools"]) {
      tools["faserip-gm-tools"] = {
        name: "faserip-gm-tools",
        title: "GM Tools",
        icon: "fas fa-shield-alt",
        visible: true,
        button: true,
        onClick: () => game.msh.openGMTools(),
        onChange: () => game.msh.openGMTools()
      };
      tokenGroup.tools = tools;
    }
  });

  // Actor Directory header button (best-effort across v13/v14 markup)
  const addButton = (html) => {
    if (!game.user.isGM) return;
    const root = html instanceof jQuery ? html[0] : html;
    if (!root) return;
    if (root.querySelector?.(".gm-tools-btn")) return;

    const header = root.querySelector(".directory-header .header-actions")
      || root.querySelector(".directory-header .action-buttons")
      || root.querySelector("header.directory-header")
      || root.querySelector("header .action-buttons")
      || root.querySelector("header .header-actions")
      || root.querySelector(":scope > header")
      || root.querySelector(".header-actions")
      || root.querySelector(".action-buttons")
      || root.querySelector(".directory-header");
    if (!header) {
      console.warn("[FASERIP] GM Tools: Actor Directory header not found; use the shield in the Token controls or game.msh.openGMTools().");
      return;
    }

    const btn = document.createElement("button");
    btn.className = "gm-tools-btn";
    btn.type = "button";
    btn.dataset.tooltip = "GM Tools";
    btn.setAttribute("aria-label", "GM Tools");
    btn.innerHTML = '<i class="fas fa-shield-alt"></i>';
    btn.addEventListener("click", () => game.msh.openGMTools());
    header.appendChild(btn);
    console.log("[FASERIP] GM Tools button added to Actor Directory");
  };

  Hooks.on("renderActorDirectory", (app, html) => addButton(html));

  if (ui.actors?.element) {
    const el = ui.actors.element instanceof jQuery ? ui.actors.element[0] : ui.actors.element;
    addButton(el);
  }
}