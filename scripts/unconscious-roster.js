// scripts/unconscious-roster.js v1.1.0 - 2026-08-20
// v1.1.0: Show KO timers, Dying Endurance state/next tick, and GM Aid action.
// scripts/unconscious-roster.js v1.0.0 - 2026-04-24
// GM dialog: list all KO'd/dying actors grouped by scene.
// Wired into scene controls (token layer) as "Unconscious Roster" button.
// Rationale: off-scene recovery is now silent by default (see rest-system.js
// postRecoveryCard routing). GM needs a one-click view of which NPCs are still
// down and on which scene, without console commands or macro bookkeeping.

import { getRemaining } from "./modules/effects/effect-engine.js";

const SCOPE = "msh-faserip";

/**
 * Classify an actor's KO state.
 * @returns {"dying"|"dead"|"unconscious"|"stable-at-0"|null}
 */
function classifyKOState(actor) {
  if (!actor) return null;
  if (actor.system?.details?.isDead) return "dead";

  const effects = Array.from(actor.effects ?? []);
  const hasDying = effects.some(e =>
    e.getFlag(SCOPE, "isDying") || e.statuses?.has?.("dying")
  );
  if (hasDying) return "dying";

  const hasUnconscious = effects.some(e => {
    if (e.disabled) return false;
    const n = (e.name || "").toLowerCase();
    return n.includes("unconscious") || n.includes("stunned") || e.statuses?.has?.("unconscious");
  });
  if (hasUnconscious) return "unconscious";

  const hp = actor.system?.attributes?.health?.value ?? null;
  if (hp !== null && hp <= 0) return "stable-at-0";

  return null;
}

/**
 * Find all scenes containing a token for this actor.
 * Handles linked (actor.id match) and unlinked (token === actor) both.
 * @returns {Scene[]}
 */


function getDyingEffect(actor) {
  return Array.from(actor?.effects ?? []).find(e =>
    !e.disabled && (e.getFlag(SCOPE, "isDying") || e.flags?.[SCOPE]?.ongoingId === "dying" || e.statuses?.has?.("dying"))
  ) || null;
}

function getUnconsciousEffect(actor) {
  return Array.from(actor?.effects ?? []).find(e => {
    if (e.disabled) return false;
    const n = (e.name || "").toLowerCase();
    return n.includes("unconscious") || n.includes("stunned") || e.statuses?.has?.("unconscious");
  }) || null;
}

function buildStateDetail(actor, state) {
  if (state === "dying") {
    const dying = getDyingEffect(actor);
    const current = actor.system?.abilities?.endurance?.rank || "?";
    const original = dying?.getFlag?.(SCOPE, "originalEndurance") || actor.getFlag(SCOPE, "originalEndurance") || current;
    const combatant = game.combat?.combatants?.find?.(c => c.actor?.id === actor.id);
    const next = combatant && game.combat?.active
      ? `next loss: Round ${(game.combat.round ?? 0) + 1}`
      : "next loss: next 6s turn";
    return { text: `END ${current}${original !== current ? ` / ${original}` : ""} · ${next}`, canAid: true };
  }

  if (state === "unconscious") {
    const effect = getUnconsciousEffect(actor);
    const remaining = effect ? getRemaining(effect) : null;
    const text = remaining?.text ? `KO ${remaining.text} remaining` : (effect?.name || "Unconscious");
    return { text, canAid: false };
  }

  if (state === "stable-at-0") return { text: "Stable at 0 Health", canAid: false };
  if (state === "dead") return { text: "Dead", canAid: false };
  return { text: "", canAid: false };
}

function findScenesForActor(actor) {
  const scenes = [];
  for (const scene of game.scenes ?? []) {
    for (const tokenDoc of scene.tokens ?? []) {
      if (!tokenDoc.actor) continue;
      if (tokenDoc.actorLink) {
        if (tokenDoc.actor.id === actor.id) { scenes.push(scene); break; }
      } else if (tokenDoc.actor === actor) {
        scenes.push(scene);
        break;
      }
    }
  }
  return scenes;
}

/**
 * Read last dying-start or unconscious-start entry from ledger for "time dropped" display.
 * @returns {{t: number, event: string}|null}
 */
function getLastEpisodeStart(actor) {
  const log = actor.getFlag(SCOPE, "recoveryLog") || [];
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.event === "dying-start" || e.event === "unconscious-start") return e;
    // If we hit a terminal, stop — this actor's current state is from a new episode we haven't logged
    if (e.event === "wake-success" || e.event === "dying-death" || e.event === "fully-recovered") break;
  }
  return null;
}

function _formatRelativeTime(worldTime, fromWorldTime) {
  const delta = Math.max(0, fromWorldTime - worldTime);
  const days = Math.floor(delta / 86400);
  const hours = Math.floor((delta % 86400) / 3600);
  const mins = Math.floor((delta % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ago`;
  if (hours > 0) return `${hours}h ${mins}m ago`;
  if (mins > 0) return `${mins}m ago`;
  return "just now";
}

/**
 * Build roster data: array of { scene, rows[] }, plus unplaced section.
 */
function buildRoster({ includeDead = false } = {}) {
  const now = game.time?.worldTime ?? 0;
  const activeSceneId = canvas?.scene?.id ?? null;

  // Collect KO'd actors keyed by id (dedup)
  const koActors = [];
  for (const actor of game.actors ?? []) {
    if (!["hero", "villain", "npc"].includes(actor.type)) continue;
    const state = classifyKOState(actor);
    if (!state) continue;
    if (state === "dead" && !includeDead) continue;
    koActors.push({ actor, state });
  }

  // Group by scene
  const sceneBuckets = new Map(); // sceneId -> { scene, rows }
  const unplaced = []; // actors with no token on any scene

  for (const entry of koActors) {
    const { actor, state } = entry;
    const scenes = findScenesForActor(actor);
    const start = getLastEpisodeStart(actor);
    const timeDroppedStr = start ? _formatRelativeTime(start.t, now) : null;
    const wakeFails = (actor.getFlag(SCOPE, "recoveryLog") || [])
      .filter(e => e.event === "wake-fail").length;

    const stateDetail = buildStateDetail(actor, state);
    const row = {
      actorId: actor.id,
      name: actor.name,
      img: actor.img || actor.prototypeToken?.texture?.src || "icons/svg/mystery-man.svg",
      state,
      stateLabel: {
        "dying":       "Dying",
        "unconscious": "Unconscious",
        "stable-at-0": "At 0 HP",
        "dead":        "Dead"
      }[state] || state,
      stateColor: {
        "dying":       "#b71c1c",
        "unconscious": "#e65100",
        "stable-at-0": "#f9a825",
        "dead":        "#424242"
      }[state] || "#555",
      timeDroppedStr,
      wakeFails,
      statusDetail: stateDetail.text,
      canAid: stateDetail.canAid,
      hp: actor.system?.attributes?.health?.value ?? 0,
      hpMax: actor.system?.attributes?.health?.max ?? 0
    };

    if (!scenes.length) {
      unplaced.push(row);
      continue;
    }
    for (const scene of scenes) {
      if (!sceneBuckets.has(scene.id)) {
        sceneBuckets.set(scene.id, {
          sceneId: scene.id,
          sceneName: scene.name,
          isActive: scene.id === activeSceneId,
          rows: []
        });
      }
      sceneBuckets.get(scene.id).rows.push(row);
    }
  }

  // Sort buckets: active scene first, then alphabetical
  const buckets = Array.from(sceneBuckets.values()).sort((a, b) => {
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;
    return a.sceneName.localeCompare(b.sceneName);
  });

  // Sort rows within each bucket: dying > unconscious > stable-at-0 > dead, then name
  const stateOrder = { "dying": 0, "unconscious": 1, "stable-at-0": 2, "dead": 3 };
  for (const bucket of buckets) {
    bucket.rows.sort((a, b) => {
      const so = (stateOrder[a.state] ?? 99) - (stateOrder[b.state] ?? 99);
      if (so !== 0) return so;
      return a.name.localeCompare(b.name);
    });
  }
  unplaced.sort((a, b) => a.name.localeCompare(b.name));

  return { buckets, unplaced, total: koActors.length };
}

function buildDialogHTML({ includeDead }) {
  const { buckets, unplaced, total } = buildRoster({ includeDead });

  const rowHTML = (row) => `
    <div class="ur-row" data-actor-id="${row.actorId}"
         style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid #e0d6c4;cursor:pointer;"
         title="Click to open ${row.name}'s sheet">
      <img src="${row.img}" alt="" style="width:32px;height:32px;border-radius:3px;border:1px solid #c0a070;flex-shrink:0;object-fit:cover;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:bold;color:#333;">${row.name}</div>
        <div style="font-size:11px;color:#666;">
          HP ${row.hp}/${row.hpMax}
          ${row.timeDroppedStr ? ` · dropped ${row.timeDroppedStr}` : ''}
          ${row.wakeFails > 0 ? ` · ${row.wakeFails} wake fail${row.wakeFails > 1 ? 's' : ''}` : ''}
        </div>
        ${row.statusDetail ? `<div style="font-size:11px;color:${row.stateColor};font-weight:600;margin-top:2px;">${row.statusDetail}</div>` : ''}
      </div>
      ${row.canAid ? `<button type="button" class="ur-aid" data-actor-id="${row.actorId}" title="Aid / stabilize this dying character" style="padding:3px 7px;font-size:10px;flex-shrink:0;"><i class="fas fa-hand-holding-medical"></i> Aid</button>` : ''}
      <div style="padding:3px 8px;border-radius:3px;background:${row.stateColor};color:#fff;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;flex-shrink:0;">
        ${row.stateLabel}
      </div>
    </div>
  `;

  const bucketHTML = (bucket) => `
    <fieldset style="border:1px solid #c0a070;background:#faf8f2;margin-bottom:10px;padding:0;">
      <legend style="color:#8b0000;font-weight:bold;padding:0 6px;cursor:pointer;"
              class="ur-scene-jump" data-scene-id="${bucket.sceneId}"
              title="Click to switch to this scene">
        ${bucket.isActive ? '<i class="fas fa-eye"></i> ' : '<i class="fas fa-map"></i> '}
        ${bucket.sceneName}
        ${bucket.isActive ? ' <span style="font-size:10px;color:#5b7a3a;">(current)</span>' : ''}
        <span style="font-size:10px;color:#666;font-weight:normal;">— ${bucket.rows.length}</span>
      </legend>
      ${bucket.rows.map(rowHTML).join("")}
    </fieldset>
  `;

  const unplacedHTML = unplaced.length ? `
    <fieldset style="border:1px solid #c0a070;background:#faf8f2;margin-bottom:10px;padding:0;">
      <legend style="color:#8b0000;font-weight:bold;padding:0 6px;">
        <i class="fas fa-question-circle"></i> Not on any scene
        <span style="font-size:10px;color:#666;font-weight:normal;">— ${unplaced.length}</span>
      </legend>
      ${unplaced.map(rowHTML).join("")}
    </fieldset>
  ` : '';

  const emptyHTML = total === 0 ? `
    <div style="padding:20px;text-align:center;color:#666;font-style:italic;">
      No unconscious, dying${includeDead ? '' : ' (or dead)'} NPCs found.
    </div>
  ` : '';

  return `
    <div class="faserip-unconscious-roster" style="padding:4px;">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;padding:6px 8px;background:#f5f0e8;border:1px solid #8b0000;border-radius:3px;">
        <label style="font-size:11px;display:flex;align-items:center;gap:4px;cursor:pointer;">
          <input type="checkbox" class="ur-include-dead" ${includeDead ? 'checked' : ''}>
          Include dead actors
        </label>
        <div style="flex:1;"></div>
        <button type="button" class="ur-refresh" style="padding:3px 10px;font-size:11px;">
          <i class="fas fa-sync"></i> Refresh
        </button>
      </div>
      ${buckets.map(bucketHTML).join("")}
      ${unplacedHTML}
      ${emptyHTML}
    </div>
  `;
}

export function openUnconsciousRoster() {
  if (!game.user.isGM) {
    ui.notifications.warn("Unconscious Roster is GM-only.");
    return;
  }

  let includeDead = false;

  const dlg = new Dialog({
    title: "Unconscious Roster",
    content: buildDialogHTML({ includeDead }),
    buttons: {
      close: { label: "Close", callback: () => {} }
    },
    default: "close",
    render: (html) => attachHandlers(html, dlg, () => includeDead, (v) => { includeDead = v; })
  }, { width: 480, height: "auto", resizable: true, classes: ["msh", "faserip-unconscious-roster-dialog"] });

  dlg.render(true);

  // Auto-refresh on relevant hooks while dialog is open
  const refresh = () => {
    if (!dlg.rendered) return;
    const el = dlg.element.find(".faserip-unconscious-roster").parent();
    el.html(buildDialogHTML({ includeDead }));
    attachHandlers(dlg.element, dlg, () => includeDead, (v) => { includeDead = v; });
  };
  const hookIds = [
    Hooks.on("updateActor",        refresh),
    Hooks.on("createActiveEffect", refresh),
    Hooks.on("deleteActiveEffect", refresh),
    Hooks.on("canvasReady",        refresh)
  ];
  const origClose = dlg.close.bind(dlg);
  dlg.close = (opts) => {
    Hooks.off("updateActor",        hookIds[0]);
    Hooks.off("createActiveEffect", hookIds[1]);
    Hooks.off("deleteActiveEffect", hookIds[2]);
    Hooks.off("canvasReady",        hookIds[3]);
    return origClose(opts);
  };
}

function attachHandlers(html, dlg, getIncludeDead, setIncludeDead) {
  const $root = html instanceof jQuery ? html : $(html);

  $root.find(".ur-refresh").off("click").on("click", () => {
    const container = $root.find(".faserip-unconscious-roster").parent();
    container.html(buildDialogHTML({ includeDead: getIncludeDead() }));
    attachHandlers($root, dlg, getIncludeDead, setIncludeDead);
  });

  $root.find(".ur-include-dead").off("change").on("change", (ev) => {
    setIncludeDead(ev.currentTarget.checked);
    const container = $root.find(".faserip-unconscious-roster").parent();
    container.html(buildDialogHTML({ includeDead: getIncludeDead() }));
    attachHandlers($root, dlg, getIncludeDead, setIncludeDead);
  });

  $root.find(".ur-aid").off("click").on("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const actorId = ev.currentTarget.dataset.actorId;
    const actor = game.actors.get(actorId);
    if (!actor) return ui.notifications.warn("Actor not found.");
    const result = await game.msh?.rest?.stabilizeDying?.(actor);
    if (!result?.success) ui.notifications.warn(result?.message || `${actor.name} could not be stabilized.`);
  });

  $root.find(".ur-row").off("click").on("click", (ev) => {
    const actorId = ev.currentTarget.dataset.actorId;
    const actor = game.actors.get(actorId);
    if (actor) actor.sheet.render(true);
  });

  $root.find(".ur-scene-jump").off("click").on("click", async (ev) => {
    ev.stopPropagation();
    const sceneId = ev.currentTarget.dataset.sceneId;
    const scene = game.scenes.get(sceneId);
    if (!scene) return;
    if (scene.id === canvas?.scene?.id) {
      ui.notifications.info(`Already viewing ${scene.name}.`);
      return;
    }
    await scene.view();
  });
}

/**
 * Register the scene control button. Call from getSceneControlButtons hook.
 * Mutates existingToolsObj in place.
 */
export function registerUnconsciousRosterControl(existingToolsObj) {
  if (!game.user?.isGM) return;
  if (existingToolsObj["faserip-unconscious-roster"]) return;
  existingToolsObj["faserip-unconscious-roster"] = {
    name: "faserip-unconscious-roster",
    title: "Unconscious Roster (KO'd NPCs by scene)",
    icon: "fas fa-bed-pulse",
    visible: true,
    button: true,
    onChange: () => openUnconsciousRoster()
  };
}
