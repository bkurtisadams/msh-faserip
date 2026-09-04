// gm-tools.js v1.4.4 - 2026-09-03
// v1.4.4: Advance Time "round" uses TURN_SECONDS (turnSeconds setting retired).
// gm-tools.js v1.4.3 - 2026-08-01
// v1.4.3: Poison dialog — capture button/form refs before awaits
//         (ev.currentTarget is nulled after handler yields); button shows
//         Applied state instead of fragile auto-close.
// gm-tools.js v1.4.2 - 2026-08-01
// v1.4.2: Poison button on Effects tab — opens toxin-picker dialog
//         (TOXINS catalog + custom intensity + source) → applyPoisonExposure.
// v1.4.1: Move the ability-rank test controls into the template (State tab,
//         six non-Endurance ability rows via _snapshotState.abilityRanks);
//         drop the activateListeners DOM injection. De-dup Endurance: the
//         native End ▼/▲ is now Health-aware (lose/restoreOneEnduranceRank),
//         so there's one Endurance control that sets originalEndurance.
// v1.4.0 - 2026-07-03: (superseded) injected Ability Ranks panel.
// gm-tools.js v1.3.0 - 2026-04-29
// GM Tools dialog: backups, effects, action runner, token finder, state quick-set.
// v1.3.0: Tokens tab — list every token across scope (current/all), filter,
//         locate (scene-switch + pan + ping + select), bring-to-viewport
//         (cross-scene supported via clone+delete), center-on-scene, toggle
//         hidden, delete; bulk reveal-hidden + rescue-off-canvas.
//         State tab — health quick-set (Full/Half/1/0/-1, ±10), endurance
//         step+set (uses shiftRank/RANKS_ORDERED), karma quick-set + ±10,
//         time-jumper (+round/min/10min/hour/day) via CTT timeEngine when
//         active, falls back to game.time.advance.
// v1.2.1: Compact dialog (460×500); reorder tabs Combat→Effects→Backups;
//         Bronze Age palette on effect buttons; v14 text-shadow override.
// v1.2.0: tabbed dialog. Effects + Combat tabs.
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
import { RANKS_ORDERED, rankValue, shiftRank } from "./rules/rules-reference.js";
import { loseOneEnduranceRank, restoreOneEnduranceRank } from "./modules/effects/ongoing-engine.js";
import { TURN_SECONDS } from "./modules/recovery-timing.js";

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
      width: 460,
      height: 500,
      resizable: true,
      minimizable: true
    });
  }

  constructor(options = {}) {
    super(options);
    // Debounced re-render: coalesce bursts of actor/token/effect/world-time
    // updates (e.g. during a Run All sweep) into a single render. Without
    // this, ~50+ renders fire per Run All, flooding the console with image
    // fetches and masking real bugs.
    this._renderTimer = null;
    const scheduleRender = () => {
      if (!this.rendered) return;
      if (this._renderTimer) clearTimeout(this._renderTimer);
      this._renderTimer = setTimeout(() => {
        this._renderTimer = null;
        if (this.rendered) this.render();
      }, 150);
    };
    this._onActorChange = scheduleRender;
    this._onTokenChange = scheduleRender;
    this._activeTab = "combat";
    this._effectSide = "target";
    this._testMode = "full";
    this._runDelay = 800;
    this._coverage = new Map();
    this._running = false;
    this._tokenScope = "current";
    this._tokenFilter = "";
    this._backupFilter = "";
    this._brokenPortraits = new Set();
    this._preclearAttacker = false;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Tab navigation
    html.find(".gm-tab-link").click(ev => this._onTabClick(ev));
    this._restoreActiveTab(html);

    // Backup tab
    html.find(".gm-backup-filter").on("input", ev => {
      this._backupFilter = String(ev.currentTarget.value || "");
      // Debounce: hook scheduler already coalesces, reuse it
      this._onActorChange();
    });
    // Shield text inputs from Foundry's keybinding layer (Action HUD's H,
    // Combat Tracker's C, Target's T, etc.) so typing into a filter doesn't
    // also trigger system actions. This is the standard pattern for custom
    // Application V1 dialogs that don't go through Foundry's form pipeline.
    this._shieldFromKeybinds(html.find(".gm-backup-filter, .gm-token-filter"));

    html.find(".gm-backup-btn").click(ev => this._onBackup(ev));
    html.find(".gm-restore-btn").click(ev => this._onRestore(ev));
    html.find(".gm-export-btn").click(ev => this._onExport(ev));
    html.find(".gm-import-btn").click(ev => this._onImport(ev));
    html.find(".gm-backup-all-btn").click(ev => this._onBackupAll(ev));
    html.find(".gm-export-all-btn").click(ev => this._onExportAll(ev));
    html.find(".gm-delete-backup-btn").click(ev => this._onDeleteBackup(ev));
    html.find(".gm-restore-orphan-btn").click(ev => this._onRestoreOrphan(ev));
    html.find(".gm-import-file").change(ev => this._onImportFile(ev));

    // Record portrait 404s so subsequent renders substitute the fallback
    // and don't re-fetch the broken URL. Browsers don't cache 404 by default,
    // so without this every render hits the network on broken paths.
    html.find(".gm-tools-actor-table img").each((_, el) => {
      el.addEventListener("error", () => {
        const orig = el.dataset.orig;
        if (orig && !orig.startsWith("icons/")) this._brokenPortraits.add(orig);
      }, { once: true });
    });

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
    html.find(".gm-preclear-attacker").change(ev => { this._preclearAttacker = !!ev.currentTarget.checked; });
    html.find(".gm-coverage-reset").click(ev => this._onResetCoverage(ev));

    // Tokens tab
    html.find("input[name='gm-token-scope']").change(ev => this._onTokenScopeChange(ev));
    html.find(".gm-token-filter").on("input", ev => this._onTokenFilterInput(ev));
    html.find(".gm-token-locate").click(ev => this._onLocateToken(ev));
    html.find(".gm-token-bring").click(ev => this._onBringToken(ev));
    html.find(".gm-token-center").click(ev => this._onCenterToken(ev));
    html.find(".gm-token-reveal").click(ev => this._onToggleHidden(ev));
    html.find(".gm-token-delete").click(ev => this._onDeleteToken(ev));
    html.find(".gm-token-reveal-all").click(ev => this._onRevealAllHidden(ev));
    html.find(".gm-token-rescue-all").click(ev => this._onRescueOffCanvas(ev));
    html.find(".gm-token-refresh").click(() => this.render());

    // State tab
    html.find(".gm-health-set").click(ev => this._onSetHealth(ev));
    html.find(".gm-health-adj").click(ev => this._onAdjustHealth(ev));
    html.find(".gm-end-shift").click(ev => this._onShiftEndurance(ev));
    html.find(".gm-end-set").change(ev => this._onSetEndurance(ev));
    html.find(".gm-karma-set").click(ev => this._onSetKarma(ev));
    html.find(".gm-karma-adj").click(ev => this._onAdjustKarma(ev));
    html.find(".gm-time-adv").click(ev => this._onAdvanceTime(ev));

    // Ability-rank test controls (State tab)
    html.find(".grt-btn").click(ev => this._onRankTestBtn(ev));

    // Re-render when actors / tokens / scenes / time change.
    // activateListeners runs on every render; register once per instance.
    if (!this._hooksBound) {
      this._hooksBound = true;
    Hooks.on("createActor", this._onActorChange);
    Hooks.on("deleteActor", this._onActorChange);
    Hooks.on("updateActor", this._onActorChange);
    Hooks.on("controlToken", this._onTokenChange);
    Hooks.on("targetToken", this._onTokenChange);
    Hooks.on("createActiveEffect", this._onTokenChange);
    Hooks.on("deleteActiveEffect", this._onTokenChange);
    Hooks.on("updateActiveEffect", this._onTokenChange);
    Hooks.on("createToken", this._onTokenChange);
    Hooks.on("deleteToken", this._onTokenChange);
    Hooks.on("updateToken", this._onTokenChange);
    Hooks.on("updateScene", this._onTokenChange);
    Hooks.on("updateWorldTime", this._onTokenChange);
    }
  }

  close(options) {
    if (this._renderTimer) { clearTimeout(this._renderTimer); this._renderTimer = null; }
    this._hooksBound = false;
    Hooks.off("createActor", this._onActorChange);
    Hooks.off("deleteActor", this._onActorChange);
    Hooks.off("updateActor", this._onActorChange);
    Hooks.off("controlToken", this._onTokenChange);
    Hooks.off("targetToken", this._onTokenChange);
    Hooks.off("createActiveEffect", this._onTokenChange);
    Hooks.off("deleteActiveEffect", this._onTokenChange);
    Hooks.off("updateActiveEffect", this._onTokenChange);
    Hooks.off("createToken", this._onTokenChange);
    Hooks.off("deleteToken", this._onTokenChange);
    Hooks.off("updateToken", this._onTokenChange);
    Hooks.off("updateScene", this._onTokenChange);
    Hooks.off("updateWorldTime", this._onTokenChange);
    return super.close(options);
  }

  async getData() {
    const backups = this._getBackups();
    const actors = game.actors.filter(a => ["hero", "villain", "npc"].includes(a.type));
    const FALLBACK_IMG = "icons/svg/mystery-man.svg";
    const filterLower = this._backupFilter.toLowerCase();
    const matchesFilter = (name) => !filterLower || (name && name.toLowerCase().includes(filterLower));
    const actorData = actors
      .filter(a => matchesFilter(a.name))
      .map(a => {
      const snap = backups[a.id];
      const safeImg = this._brokenPortraits.has(a.img) ? FALLBACK_IMG : a.img;
      return {
        id: a.id,
        name: a.name,
        type: a.type,
        img: safeImg,
        origImg: a.img,
        hasBackup: !!snap,
        backupDate: snap?.timestamp ? new Date(snap.timestamp).toLocaleString() : "",
        backupCount: snap ? 1 : 0
      };
    });
    const orphans = Object.entries(backups)
      .filter(([id]) => !game.actors.get(id))
      .filter(([, snap]) => matchesFilter(snap.name))
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
      backupFilter: this._backupFilter,
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
      runDelay: this._runDelay,
      preclearAttacker: this._preclearAttacker,
      // Tokens tab
      tokens: this._collectTokens(),
      tokenFilter: this._tokenFilter,
      isScopeCurrent: this._tokenScope === "current",
      sceneCount: game.scenes?.size ?? 0,
      // State tab
      hasSelected: !!selectedActor,
      ...this._snapshotState(selectedActor),
      rankList: RANKS_ORDERED,
      worldTimeLabel: this._formatWorldTime()
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
    const tab = this._activeTab || "combat";
    root.querySelectorAll(".gm-tab-link").forEach(el => el.classList.toggle("active", el.dataset.tab === tab));
    root.querySelectorAll(".gm-tab-panel").forEach(el => el.classList.toggle("active", el.dataset.tab === tab));
  }

  /**
   * Block Foundry/system keybindings while a text input is focused.
   * Uses capture-phase listeners so this runs before document-level
   * hotkey handlers regardless of registration order. Standard pattern
   * for custom Application V1 dialogs whose inputs aren't auto-shielded
   * by Foundry's form pipeline.
   * @param {jQuery|HTMLElement|HTMLElement[]} target
   */
  _shieldFromKeybinds(target) {
    const handler = ev => {
      const k = ev.key;
      // Allow form/dialog navigation keys through
      if (k === "Enter" || k === "Tab" || k === "Escape") return;
      ev.stopImmediatePropagation();
    };
    const els = target instanceof jQuery ? target.toArray() : (Array.isArray(target) ? target : [target]);
    for (const el of els) {
      if (!el?.addEventListener) continue;
      el.addEventListener("keydown", handler, true);
      el.addEventListener("keyup", handler, true);
      el.addEventListener("keypress", handler, true);
    }
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
      _id: i.id,
      name: i.name,
      type: i.type,
      img: i.img,
      system: foundry.utils.deepClone(i.system),
      flags: foundry.utils.deepClone(i.flags || {}),
      effects: i.effects?.map(e => ({
        _id: e.id,
        name: e.name,
        icon: e.icon,
        disabled: e.disabled,
        duration: foundry.utils.deepClone(e.duration || {}),
        changes: foundry.utils.deepClone(e.changes || []),
        flags: foundry.utils.deepClone(e.flags || {}),
        statuses: Array.from(e.statuses || []),
        origin: e.origin
      })) || []
    }));
    const effects = actor.effects.map(e => ({
      _id: e.id,
      name: e.name,
      icon: e.icon,
      disabled: e.disabled,
      duration: foundry.utils.deepClone(e.duration || {}),
      changes: foundry.utils.deepClone(e.changes || []),
      flags: foundry.utils.deepClone(e.flags || {}),
      statuses: Array.from(e.statuses || []),
      origin: e.origin
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

    // Replace items — pass keepId so AEs whose flags reference item IDs
    // (e.g. defense.bodyArmor.flags.powerItemId) stay valid after restore.
    // Without this, createEmbeddedDocuments assigns new IDs and any AE that
    // references the old ID becomes an orphan pointing at a non-existent
    // Power. The system's createItem hooks then build a fresh AE from the
    // newly-created Power, which can race the snapshot's AE write and
    // produce stale values.
    const existingIds = actor.items.map(i => i.id);
    if (existingIds.length) await actor.deleteEmbeddedDocuments("Item", existingIds);
    if (snap.items?.length) {
      // Items may have explicit _id from snapshot; sanitize: drop any item
      // entries lacking _id (legacy snapshots from before this fix).
      const itemsWithIds = snap.items.filter(i => i._id);
      const itemsWithoutIds = snap.items.filter(i => !i._id);
      if (itemsWithIds.length) {
        await actor.createEmbeddedDocuments("Item", itemsWithIds, { keepId: true });
      }
      if (itemsWithoutIds.length) {
        await actor.createEmbeddedDocuments("Item", itemsWithoutIds);
      }
    }

    // Replace effects with same keepId treatment so origin / cross-references
    // (e.g. ongoingId pointing at item IDs) remain valid.
    const existingEffectIds = actor.effects.map(e => e.id);
    if (existingEffectIds.length) await actor.deleteEmbeddedDocuments("ActiveEffect", existingEffectIds);
    if (snap.effects?.length) {
      const effectsWithIds = snap.effects.filter(e => e._id);
      const effectsWithoutIds = snap.effects.filter(e => !e._id);
      if (effectsWithIds.length) {
        await actor.createEmbeddedDocuments("ActiveEffect", effectsWithIds, { keepId: true });
      }
      if (effectsWithoutIds.length) {
        await actor.createEmbeddedDocuments("ActiveEffect", effectsWithoutIds);
      }
    }

    // Force defense AEs (body armor, force field, resistance) to rebuild
    // from the restored Power items. The snapshot's defense AE flag values
    // (physical, energy, *Rank) are computed/cached values, not the source
    // of truth — the Power item is. If a Power was modified after backup
    // and then the actor was restored, the snapshot AE will carry the
    // pre-modification values until something forces a sync. Call the
    // system's own sync function so this stays consistent with how the
    // createItem / updateItem / createToken hooks already manage these AEs.
    try {
      const { syncAllDefenseEffects } = await import("./modules/effects/defense-effects.js");
      await syncAllDefenseEffects(actor);
    } catch (e) {
      console.warn("[FASERIP:GMTools] syncAllDefenseEffects after restore failed:", e);
    }
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
      case "poison":      return this._openPoisonDialog(actor);
      case "charging":    return applyCharging(actor, { rounds: 1 });
      case "evade":       return applyEvade(actor, { evadeSuccessful: true });
      case "block":       return applyBlock(actor, { armorRank: "Good", armorValue: 10 });
      case "catch":       return applyCatch(actor, { scenario: "generic" });
      case "escaped":     return applyEscaped(actor);
      case "reversed":    return applyReversed(actor);
      default: throw new Error(`Unknown effect id: ${id}`);
    }
  }

  async _openPoisonDialog(actor) {
    const { TOXINS } = await import("./rules/rules-reference.js");
    const { showFaseripDialog } = await import("./modules/actions/dialog-shim.js");
    const { determineFeatRequirement } = await import("./modules/actions/ability-feat-dialog.js");

    const endRank = actor.system?.abilities?.endurance?.rank || "Typical";
    const toxinOpts = Object.entries(TOXINS)
      .map(([id, t]) => `<option value="${id}" data-intensity="${t.intensity}">${t.name} (${t.intensity})</option>`)
      .join("");
    const rankOpts = RANKS_ORDERED
      .filter(r => r !== "Shift-0" && r !== "Beyond")
      .map(r => `<option value="${r}" ${r === "Typical" ? "selected" : ""}>${r}</option>`)
      .join("");

    const content = `
      <div class="frp-dlg frp-feat">
        <div class="frp-box">
          <div class="frp-box-label gold">Toxin</div>
          <select name="toxinId" style="width:100%;">
            ${toxinOpts}
            <option value="">&mdash; Custom (set Intensity below) &mdash;</option>
          </select>
        </div>
        <div class="frp-box">
          <div class="frp-box-label">Intensity</div>
          <select name="intensity" style="width:100%;">${rankOpts}</select>
        </div>
        <div class="frp-box" id="poison-save-box">
          <div class="frp-box-label red">Exposure Save</div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span>${actor.name} &mdash; Endurance <b id="poison-end-rank">${endRank}</b></span>
            <span class="frp-need-line" style="margin-left:auto;">
              <span class="frp-need-label">Needs:</span>
              <span id="poison-need-pill" class="frp-feat-pill is-white">ANY COLOR</span>
            </span>
          </div>
        </div>
        <div class="frp-box">
          <div class="frp-box-label muted">Source (optional)</div>
          <input type="text" name="sourceName" placeholder="e.g. Snake bite" style="width:100%;">
        </div>
        <div class="frp-foot">
          <div class="frp-foot-btns">
            <button type="button" name="apply-poison" class="frp-btn-roll">
              <i class="fas fa-skull-crossbones"></i> Expose ${actor.name}
            </button>
          </div>
        </div>
      </div>`;

    return showFaseripDialog({
      title: `Poison Exposure \u2014 ${actor.name}`,
      content,
      width: 360,
      render: (html) => {
        const root = html instanceof HTMLElement ? html : html?.[0];
        if (!root) return;
        const toxinSel = root.querySelector('[name="toxinId"]');
        const intSel = root.querySelector('[name="intensity"]');
        const pill = root.querySelector('#poison-need-pill');

        const setPill = (requirement, { impossible = false, automatic = false } = {}) => {
          if (!pill) return;
          pill.classList.remove("is-white", "is-green", "is-yellow", "is-red", "is-auto", "is-impossible");
          if (impossible) { pill.classList.add("is-impossible"); pill.textContent = "IMPOSSIBLE"; return; }
          if (automatic)  { pill.classList.add("is-auto"); pill.textContent = "AUTOMATIC"; return; }
          const map = { green: "is-green", yellow: "is-yellow", red: "is-red" };
          const key = String(requirement || "").toLowerCase();
          pill.classList.add(map[key] || "is-white");
          pill.textContent = map[key] ? key.toUpperCase() : "ANY COLOR";
        };

        const syncIntensity = () => {
          const opt = toxinSel?.selectedOptions?.[0];
          const catalogIntensity = opt?.dataset?.intensity;
          if (catalogIntensity) {
            intSel.value = catalogIntensity;
            intSel.disabled = true;
          } else {
            intSel.disabled = false;
          }
          const req = determineFeatRequirement(endRank, intSel.value);
          setPill(req.requirement, req);
        };

        toxinSel?.addEventListener("change", syncIntensity);
        intSel?.addEventListener("change", syncIntensity);
        syncIntensity();

        root.querySelector('[name="apply-poison"]')?.addEventListener("click", async (ev) => {
          // Capture refs synchronously \u2014 ev.currentTarget is nulled once the
          // handler yields at the first await.
          const btnEl = ev.currentTarget;
          const toxinId = toxinSel?.value || "";
          const intensity = intSel?.value || "Typical";
          const sourceName = root.querySelector('[name="sourceName"]')?.value || "";
          btnEl.disabled = true;
          const { applyPoisonExposure } = await import("./modules/effects/poison-engine.js");
          const result = await applyPoisonExposure(actor, {
            toxinId: toxinId || null,
            intensity,
            sourceName,
          });
          ui.notifications.info(`Poison exposure: ${actor.name} \u2014 ${result}`);
          btnEl.innerHTML = '<i class="fas fa-check"></i> Applied';
        });
      },
    });
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

  async _preclearForAttacker(actor) {
    if (!actor) return;
    const ids = actor.effects
      .filter(e => {
        const f = e.flags?.[SCOPE];
        if (!f) return false;                              // ignore non-FASERIP AEs
        if (f.effectCategory === "defense") return false;   // keep BA / FF / Resistance
        return true;
      })
      .map(e => e.id);
    if (!ids.length) return;
    await safeActorDeleteEffects(actor, ids);
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
    // Sweep order: run Escaping last. The escaping action applies a
    // "Just Escaped (half move, no actions)" AE that gates every
    // subsequent action with "Cannot act due to: active effects",
    // so anything after it in ACTION_LIST gets skipped during a
    // Run All. HUD button order is unchanged.
    const sweepOrder = [
      ...ACTION_LIST.filter(a => a.id !== "escaping"),
      ...ACTION_LIST.filter(a => a.id === "escaping")
    ];
    try {
      for (const a of sweepOrder) {
        if (this._preclearAttacker) await this._preclearForAttacker(actor);
        await this._dispatch(actor, a.id, a.ability);
        cov.add(a.id);
        this._onActorChange();   // coalesced render via debouncer (covers ✓ pulse)
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

  // ── Tokens tab ──

  _onTokenScopeChange(ev) {
    this._tokenScope = ev.currentTarget.value === "all" ? "all" : "current";
    this.render();
  }

  _onTokenFilterInput(ev) {
    this._tokenFilter = String(ev.currentTarget.value || "");
    // Live filter — re-scan and re-render
    this.render();
  }

  _collectTokens() {
    const filter = this._tokenFilter.toLowerCase();
    const scenes = this._tokenScope === "all"
      ? game.scenes.contents
      : (canvas?.scene ? [canvas.scene] : []);
    const out = [];
    for (const scene of scenes) {
      const w = scene.dimensions?.width ?? scene.width ?? 4000;
      const h = scene.dimensions?.height ?? scene.height ?? 4000;
      for (const t of scene.tokens) {
        const name = t.name || "";
        const sceneName = scene.name || "";
        if (filter && !name.toLowerCase().includes(filter) && !sceneName.toLowerCase().includes(filter)) continue;
        const flags = [];
        const offCanvas = t.x < 0 || t.y < 0 || t.x >= w || t.y >= h;
        if (offCanvas) flags.push({ label: "off-canvas", cls: "danger" });
        if (t.hidden) flags.push({ label: "hidden", cls: "warn" });
        if (!t.actor) flags.push({ label: "no actor", cls: "warn" });
        if (t.actor?.effects?.some(e => e.flags?.[SCOPE]?.effectType === "dying")) flags.push({ label: "dying", cls: "danger" });
        if (t.actor?.effects?.some(e => e.flags?.[SCOPE]?.effectType === "unconscious")) flags.push({ label: "ko", cls: "warn" });
        out.push({
          tokenId: t.id,
          sceneId: scene.id,
          name,
          sceneName,
          pos: `${Math.round(t.x)}, ${Math.round(t.y)}`,
          flags,
          hidden: !!t.hidden,
          isCurrentScene: scene.id === canvas?.scene?.id
        });
      }
    }
    out.sort((a, b) => {
      if (a.isCurrentScene !== b.isCurrentScene) return a.isCurrentScene ? -1 : 1;
      const s = a.sceneName.localeCompare(b.sceneName);
      if (s) return s;
      return a.name.localeCompare(b.name);
    });
    return out;
  }

  _viewportCenter() {
    if (!canvas?.stage) return { x: 0, y: 0 };
    const p = canvas.stage.pivot;
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }

  _sceneCenter(scene) {
    const w = scene.dimensions?.sceneWidth ?? scene.dimensions?.width ?? scene.width ?? 4000;
    const h = scene.dimensions?.sceneHeight ?? scene.dimensions?.height ?? scene.height ?? 4000;
    const ox = scene.dimensions?.sceneX ?? 0;
    const oy = scene.dimensions?.sceneY ?? 0;
    return { x: Math.round(ox + w / 2), y: Math.round(oy + h / 2) };
  }

  async _onLocateToken(ev) {
    ev.preventDefault();
    const { sceneId, tokenId } = ev.currentTarget.dataset;
    const scene = game.scenes.get(sceneId);
    if (!scene) return;
    if (canvas?.scene?.id !== sceneId) await scene.view();
    const tok = canvas.tokens?.get(tokenId);
    if (!tok) return ui.notifications.warn("Token not on canvas yet");
    const c = tok.center ?? { x: tok.document.x, y: tok.document.y };
    await canvas.animatePan({ x: c.x, y: c.y, scale: Math.max(canvas.stage.scale.x, 0.5) });
    try { tok.control({ releaseOthers: true }); } catch (_) {}
    if (typeof canvas.ping === "function") canvas.ping(c);
  }

  async _onBringToken(ev) {
    ev.preventDefault();
    const { sceneId, tokenId } = ev.currentTarget.dataset;
    const sourceScene = game.scenes.get(sceneId);
    const sourceToken = sourceScene?.tokens.get(tokenId);
    if (!sourceToken) return;
    const center = this._viewportCenter();
    if (sceneId === canvas?.scene?.id) {
      await sourceToken.update({ x: center.x, y: center.y }, { mshRawMovementBypass: true });
      ui.notifications.info(`${sourceToken.name} brought to viewport center`);
      return;
    }
    const targetScene = canvas?.scene;
    if (!targetScene) return ui.notifications.warn("No active scene to bring to");
    const confirm = await Dialog.confirm({
      title: "Cross-scene move",
      content: `<p>Token <strong>${sourceToken.name}</strong> is on <em>${sourceScene.name}</em>. Move it to <em>${targetScene.name}</em>? Token data is duplicated then the original is deleted (unlinked actor delta is preserved).</p>`
    });
    if (!confirm) return;
    const data = sourceToken.toObject();
    delete data._id;
    data.x = center.x;
    data.y = center.y;
    await targetScene.createEmbeddedDocuments("Token", [data]);
    await sourceScene.deleteEmbeddedDocuments("Token", [tokenId]);
    ui.notifications.info(`${sourceToken.name} moved to ${targetScene.name}`);
  }

  async _onCenterToken(ev) {
    ev.preventDefault();
    const { sceneId, tokenId } = ev.currentTarget.dataset;
    const scene = game.scenes.get(sceneId);
    const tok = scene?.tokens.get(tokenId);
    if (!tok) return;
    const c = this._sceneCenter(scene);
    const gridSize = scene.grid?.size || 100;
    const halfW = ((tok.width || 1) * gridSize) / 2;
    const halfH = ((tok.height || 1) * gridSize) / 2;
    await tok.update({ x: c.x - halfW, y: c.y - halfH }, { mshRawMovementBypass: true });
    ui.notifications.info(`${tok.name} centered on ${scene.name}`);
  }

  async _onToggleHidden(ev) {
    ev.preventDefault();
    const { sceneId, tokenId } = ev.currentTarget.dataset;
    const scene = game.scenes.get(sceneId);
    const tok = scene?.tokens.get(tokenId);
    if (!tok) return;
    await tok.update({ hidden: !tok.hidden });
  }

  async _onDeleteToken(ev) {
    ev.preventDefault();
    const { sceneId, tokenId } = ev.currentTarget.dataset;
    const scene = game.scenes.get(sceneId);
    const tok = scene?.tokens.get(tokenId);
    if (!tok) return;
    const confirm = await Dialog.confirm({
      title: "Delete token?",
      content: `<p>Delete <strong>${tok.name}</strong> from <em>${scene.name}</em>? The actor itself is not affected.</p>`
    });
    if (!confirm) return;
    await scene.deleteEmbeddedDocuments("Token", [tokenId]);
  }

  async _onRevealAllHidden(ev) {
    ev.preventDefault();
    const scene = canvas?.scene;
    if (!scene) return;
    const ids = scene.tokens.filter(t => t.hidden).map(t => t.id);
    if (!ids.length) return ui.notifications.info("No hidden tokens on this scene.");
    await scene.updateEmbeddedDocuments("Token", ids.map(id => ({ _id: id, hidden: false })));
    ui.notifications.info(`Revealed ${ids.length} token(s)`);
  }

  async _onRescueOffCanvas(ev) {
    ev.preventDefault();
    const scene = canvas?.scene;
    if (!scene) return;
    const w = scene.dimensions?.width ?? scene.width ?? 4000;
    const h = scene.dimensions?.height ?? scene.height ?? 4000;
    const c = this._sceneCenter(scene);
    const gridSize = scene.grid?.size || 100;
    const updates = [];
    for (const t of scene.tokens) {
      if (t.x < 0 || t.y < 0 || t.x >= w || t.y >= h) {
        const halfW = ((t.width || 1) * gridSize) / 2;
        const halfH = ((t.height || 1) * gridSize) / 2;
        updates.push({ _id: t.id, x: c.x - halfW, y: c.y - halfH });
      }
    }
    if (!updates.length) return ui.notifications.info("No off-canvas tokens on this scene.");
    await scene.updateEmbeddedDocuments("Token", updates, { mshRawMovementBypass: true });
    ui.notifications.info(`Rescued ${updates.length} token(s)`);
  }

  // ── State tab ──

  _snapshotState(actor) {
    if (!actor) return { healthCur: 0, healthMax: 0, enduranceRank: "", enduranceVal: 0, karmaCur: 0, abilityRanks: [] };
    const sys = actor.system ?? {};
    const h = sys.derived?.attributes?.health ?? {};
    const k = sys.derived?.attributes?.karma ?? {};
    const e = sys.abilities?.endurance ?? {};
    const ABIL = [
      ["fighting", "Fighting"], ["agility", "Agility"], ["strength", "Strength"],
      ["reason", "Reason"], ["intuition", "Intuition"], ["psyche", "Psyche"]
    ];
    const abilityRanks = ABIL.map(([key, label]) => {
      const a = sys.abilities?.[key] ?? {};
      return { key, label, rank: a.rank ?? "—", value: a.value ?? 0 };
    });
    return {
      healthCur: h.value ?? 0,
      healthMax: h.max ?? 0,
      enduranceRank: e.rank ?? "",
      enduranceVal: e.value ?? 0,
      karmaCur: k.value ?? 0,
      abilityRanks
    };
  }

  async _onSetHealth(ev) {
    ev.preventDefault();
    const actor = this._selectedActor();
    if (!actor) return ui.notifications.warn("Select a token first");
    const mode = ev.currentTarget.dataset.mode;
    const max = actor.system.derived?.attributes?.health?.max ?? 0;
    let val;
    if (mode === "full") val = max;
    else if (mode === "half") val = Math.floor(max / 2);
    else val = Number(mode);
    if (!Number.isFinite(val)) return;
    await actor.update({ "system.derived.attributes.health.value": val });
  }

  async _onAdjustHealth(ev) {
    ev.preventDefault();
    const actor = this._selectedActor();
    if (!actor) return;
    const delta = Number(ev.currentTarget.dataset.delta) || 0;
    const cur = actor.system.derived?.attributes?.health?.value ?? 0;
    await actor.update({ "system.derived.attributes.health.value": cur + delta });
  }

  async _onShiftEndurance(ev) {
    ev.preventDefault();
    const actor = this._selectedActor();
    if (!actor) return ui.notifications.warn("Select a token first");
    const delta = Number(ev.currentTarget.dataset.delta) || 0;
    // Health-aware: ▼ loses a rank (recalcs Health, sets originalEndurance so
    // Recovery/Healing see the loss); ▲ restores toward the original. The
    // set-rank dropdown remains for raw/forced sets.
    if (delta < 0) await loseOneEnduranceRank(actor, { source: "GM test" });
    else if (delta > 0) await restoreOneEnduranceRank(actor, { source: "GM test" });
  }

  // ── Ability-rank test controls (State tab) ──────────────────────────
  // Reduce/restore an ability rank on the selected actor for testing powers
  // that key off lost ranks. Endurance uses the Health-aware ongoing-engine
  // path (via _onShiftEndurance, and the guard below for safety); the other
  // six step via RANKS_ORDERED and remember the original under a gmRankTest
  // flag so Restore climbs back to the right cap. Markup + rank display live
  // in templates/gm-tools.html (fed by _snapshotState.abilityRanks).
  async _rankReduce(actor, key) {
    if (key === "endurance") return loseOneEnduranceRank(actor, { source: "GM test" });
    const scope = globalThis.MSH_FLAG_SCOPE || game.system.id;
    const cur = actor.system?.abilities?.[key]?.rank;
    const idx = RANKS_ORDERED.indexOf(cur);
    if (idx <= 0) return ui.notifications.info(`${actor.name} ${key} already at the floor.`);
    const orig = foundry.utils.deepClone(actor.getFlag(scope, "gmRankTest") || {});
    if (!(key in orig)) orig[key] = cur;
    await actor.setFlag(scope, "gmRankTest", orig);
    const nr = RANKS_ORDERED[idx - 1];
    await actor.update({ [`system.abilities.${key}.rank`]: nr, [`system.abilities.${key}.value`]: rankValue(nr) });
  }

  async _rankRestore(actor, key) {
    if (key === "endurance") return restoreOneEnduranceRank(actor, { source: "GM test" });
    const scope = globalThis.MSH_FLAG_SCOPE || game.system.id;
    const orig = foundry.utils.deepClone(actor.getFlag(scope, "gmRankTest") || {});
    const cap = orig[key];
    if (!cap) return ui.notifications.info(`${actor.name} ${key} was not reduced by this tool.`);
    const cur = actor.system?.abilities?.[key]?.rank;
    const ci = RANKS_ORDERED.indexOf(cur), capi = RANKS_ORDERED.indexOf(cap);
    const nr = (ci >= 0 && ci < capi) ? RANKS_ORDERED[ci + 1] : cap;
    await actor.update({ [`system.abilities.${key}.rank`]: nr, [`system.abilities.${key}.value`]: rankValue(nr) });
    if (nr === cap) { delete orig[key]; await actor.setFlag(scope, "gmRankTest", orig); }
  }

  async _onRankTestBtn(ev) {
    ev.preventDefault();
    const actor = this._selectedActor();
    if (!actor) return ui.notifications.warn("Select a token first");
    const { k, op } = ev.currentTarget.dataset;
    const btn = ev.currentTarget;
    btn.disabled = true;
    try {
      if (op === "reduce") await this._rankReduce(actor, k);
      else await this._rankRestore(actor, k);
    } finally { btn.disabled = false; }
  }

  async _onSetEndurance(ev) {
    ev.preventDefault();
    const actor = this._selectedActor();
    if (!actor) return;
    const rank = ev.currentTarget.value;
    if (!rank) return;
    await actor.update({
      "system.abilities.endurance.rank": rank,
      "system.abilities.endurance.value": rankValue(rank)
    });
    ev.currentTarget.value = ""; // reset dropdown to placeholder
  }

  async _onSetKarma(ev) {
    ev.preventDefault();
    const actor = this._selectedActor();
    if (!actor) return ui.notifications.warn("Select a token first");
    const val = Number(ev.currentTarget.dataset.value) || 0;
    await actor.update({ "system.derived.attributes.karma.value": val });
  }

  async _onAdjustKarma(ev) {
    ev.preventDefault();
    const actor = this._selectedActor();
    if (!actor) return;
    const delta = Number(ev.currentTarget.dataset.delta) || 0;
    const cur = actor.system.derived?.attributes?.karma?.value ?? 0;
    await actor.update({ "system.derived.attributes.karma.value": cur + delta });
  }

  async _onAdvanceTime(ev) {
    ev.preventDefault();
    const unit = ev.currentTarget.dataset.unit;
    const turnSec = TURN_SECONDS;
    const TIME_SEC = { round: turnSec, min: 60, "10min": 600, hour: 3600, day: 86400 };
    const seconds = TIME_SEC[unit];
    if (!seconds) return;
    // Prefer CTT timeEngine if active so calendar stays in sync; else fallback
    try {
      const cttMod = game.modules.get("calendar-time-tracker");
      const te = cttMod?.active ? cttMod.api?.timeEngine : null;
      if (typeof te?.advanceTime === "function") {
        te.advanceTime(seconds, "second");
      } else {
        await game.time.advance(seconds);
      }
    } catch (_) {
      await game.time.advance(seconds);
    }
    ui.notifications.info(`Advanced ${seconds}s`);
  }

  _formatWorldTime() {
    const t = game.time?.worldTime ?? 0;
    const d = Math.floor(t / 86400);
    const h = Math.floor((t % 86400) / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    return `${d}d ${h}h ${m}m ${s}s`;
  }
}

// ── Registration ──

// Top-level: register the scene controls hook at module-load time so
// it's bound BEFORE Foundry first builds the controls. registerGMTools()
// runs at the "ready" stage (see init.js), which is too late — by then
// getSceneControlButtons has already fired. ES modules resolve imports
// before init, so Hooks.on at top level is safe and early.
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
    const open = () => {
      if (game.msh?.openGMTools) return game.msh.openGMTools();
      // Fallback if registerGMTools hasn't run yet (shouldn't happen)
      if (!game.user.isGM) return;
      new GMToolsApp().render(true);
    };
    tools["faserip-gm-tools"] = {
      name: "faserip-gm-tools",
      title: "GM Tools",
      icon: "fas fa-shield-alt",
      visible: true,
      button: true,
      onChange: open
    };
    tokenGroup.tools = tools;
  }
});

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
    // Reuse existing instance regardless of rendered flag — render(true)
    // re-opens a closed app and brings a rendered one to top.
    if (game.msh._gmToolsApp) {
      game.msh._gmToolsApp.render(true);
      return game.msh._gmToolsApp;
    }
    game.msh._gmToolsApp = new GMToolsApp();
    game.msh._gmToolsApp.render(true);
    return game.msh._gmToolsApp;
  };

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