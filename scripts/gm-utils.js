// gm-utils.js v1.2.0 - 2026-03-08
// v1.2.0: Add updateActiveEffect and renameEffectWithRemaining GM socket handlers
//         for player-initiated effect updates on unowned actors
// v13-safe socketlib wiring for "msh-faserip"
import { applyDamageToTargets, debugLog } from "./modules/actions/action-utils.js";

const SOCKET_NAME = "msh-faserip";
let socket = null;

// ── Settings helpers ─────────────────────────────────────────
// Always use official FASERIP blunt weapon rules
export function getBluntNextRankMinRule() {
  return true; // Always use the official rule: material > strength upgrades to next rank min
}

export function getItemMaterialRank(it) {
  const s = it?.system ?? {};
  console.groupCollapsed(`FASERIP DEBUG:getItemMaterialRank → ${it?.name ?? '(no name)'}`);
  console.debug('raw item', it);
  console.debug('system block', s);

  // Add materialStrength and common variants to the probe list
  let raw =
    s.materialRank ??          // "Good"
    s.materialStrength ??      // <-- your Club uses this ("Good")
    s.material?.rank ??        // nested
    s.material?.name ??
    s.material ??              // plain string or number
    s.materialRankName ??
    s.matStrength ??           // extra aliases just in case
    s.mat ??                   // …
    null;

  console.debug('raw material field(s) →', raw);

  if (raw == null) {
    console.debug('no material found → fallback "Excellent"');
    console.groupEnd();
    return "Excellent";
  }

  if (typeof raw === "number") {
    const byNumber = numberToRank(raw);
    console.debug('number material →', raw, '→', byNumber ?? '(no map)');
    console.groupEnd();
    return byNumber ?? "Excellent";
  }

  let text = String(raw).trim();
  console.debug('normalized text →', text);

  const numMatch = text.match(/(\d{1,4})/);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    const byNumber = numberToRank(n);
    console.debug('embedded number →', n, '→', byNumber ?? '(no map)');
    if (byNumber) { console.groupEnd(); return byNumber; }
  }

  const RANKS = [
    "Shift-0","Feeble","Poor","Typical","Good","Excellent",
    "Remarkable","Incredible","Amazing","Monstrous","Unearthly",
    "Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000","Beyond"
  ];
  const asFull = RANKS.find(r => r.toLowerCase() === text.toLowerCase());
  if (asFull) { console.debug('full rank match →', asFull); console.groupEnd(); return asFull; }

  const ABBR = {
    sh0:"Shift-0","sh-0":"Shift-0",fb:"Feeble",fe:"Feeble",pr:"Poor",ty:"Typical",
    gd:"Good",ex:"Excellent",rm:"Remarkable",rk:"Remarkable",in:"Incredible",
    am:"Amazing",mn:"Monstrous",mon:"Monstrous",un:"Unearthly",une:"Unearthly",
    shx:"Shift-X","sh-x":"Shift-X",shy:"Shift-Y","sh-y":"Shift-Y",
    shz:"Shift-Z","sh-z":"Shift-Z",cl1000:"Class 1000","cl-1000":"Class 1000",
    cl3000:"Class 3000","cl-3000":"Class 3000",cl5000:"Class 5000","cl-5000":"Class 5000",
    beyond:"Beyond"
  };
  const key = text.toLowerCase().replace(/[ _().:]/g, "");
  const abbr = ABBR[key];
  if (abbr) { console.debug('abbr match →', key, '→', abbr); console.groupEnd(); return abbr; }

  const title = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  if (RANKS.includes(title)) { console.debug('title-case fallback →', title); console.groupEnd(); return title; }

  console.debug('no match → fallback "Excellent"');
  console.groupEnd();
  return "Excellent";

  function numberToRank(n) {
    try {
      if (game?.msh?.getRankName) {
        const name = game.msh.getRankName(n);
        if (typeof name === "string" && name.length) return name;
      }
    } catch (e) { console.debug('getRankName threw:', e); }
    const MAP = {0:"Shift-0",2:"Feeble",4:"Poor",6:"Typical",10:"Good",20:"Excellent",30:"Remarkable",40:"Incredible",50:"Amazing",75:"Monstrous",100:"Unearthly",150:"Shift-X",200:"Shift-Y",500:"Shift-Z",1000:"Class 1000",3000:"Class 3000",5000:"Class 5000"};
    return MAP[n] ?? null;
  }
}

/**
 * Legacy entrypoint: run arbitrary GM op via { operation, ... }.
 * If caller is GM, run locally; else dispatch over socketlib.
 */
export async function runAsGM(data) {
  if (game.user.isGM) return await runGMCommand(data);
  ensureSocket();
  return await socket.executeAsGM("runGMCommand", data);
}

/**
 * Modern convenience: run a named GM action with a payload.
 * Example: executeAsGM("adjustTargetHealth", { targetActorUuid, newHealth })
 */
export async function executeAsGM(action, payload) {
  if (game.user.isGM) {
    // Direct call when already GM
    switch (action) {
      case "adjustTargetHealth": return await adjustTargetHealth(payload);
      case "createActorEffect":  return await createActorEffect(payload);
      case "createEmbeddedDocsOnActor": return await createEmbeddedDocsOnActor(payload);
      case "manageRecoveryEffect": return await manageRecoveryEffect(payload);
      case "applyRulesDamage":      return await applyRulesDamage(payload);
      case "updateActor":           return await updateActor(payload);
      case "deleteActiveEffects":   return await deleteActiveEffects(payload);
      case "deleteEmbeddedDocsOnActor": return await deleteEmbeddedDocsOnActor(payload);
      case "updateActiveEffect":    return await updateActiveEffect(payload);
      case "renameEffectWithRemaining": return await gmRenameEffectWithRemaining(payload);

      default: throw new Error(`Unknown GM action: ${action}`);
    }
  }
  ensureSocket();
  return await socket.executeAsGM(action, payload);
}

/**
 * Register socketlib and all GM-side handlers.
 * Call once on ready().
 */
export function registerSocket() {
  try {
    const mod = game.modules.get("socketlib");
    if (!mod?.active) {
      console.error("❌ SocketLib module is not active");
      return;
    }

    // Obtain a dedicated socket for this system
    // `socketlib` is a global provided by the SocketLib module.
    socket = socketlib.registerSystem(SOCKET_NAME);

    // Register concrete GM handlers
    socket.register("runGMCommand", runGMCommand);
    socket.register("adjustTargetHealth", adjustTargetHealth);
    socket.register("createActorEffect", createActorEffect);
    socket.register("createEmbeddedDocsOnActor", createEmbeddedDocsOnActor);
    socket.register("manageRecoveryEffect", manageRecoveryEffect);
    socket.register("applyRulesDamage", applyRulesDamage);
    socket.register("createMacroForPlayer", createMacroForPlayer);
    socket.register("updateActiveEffect", updateActiveEffect);
    socket.register("renameEffectWithRemaining", gmRenameEffectWithRemaining);


    // Expose on game.msh for other modules/files
    game.msh = game.msh || {};
    game.msh.socket = socket;    // preferred modern path: game.msh.socket.executeAsGM(...)
    game.msh.runAsGM = runAsGM;  // keep legacy helper alive

    console.log("✅ SocketLib registered for", SOCKET_NAME);
  } catch (error) {
    console.error("❌ Failed to register SocketLib:", error);
  }
}

/* ---------------- GM Handlers ---------------- */

/**
 * Back-compat switch for legacy callers:
 *   runAsGM({ operation: "...", ... })
 */
async function runGMCommand(data = {}) {
  const { operation } = data || {};
  switch (operation) {
    case "adjustTargetHealth":
      return await adjustTargetHealth({
        targetActorUuid: data.targetActorUuid,
        newHealth: data.newHealth
      });

    // New refactor route
    case "applyRulesDamage":
      return await applyRulesDamage({
        targetActorUuid: data.targetActorUuid,
        baseDamage: data.baseDamage,
        damageType: data.damageType,
        attackerUuid: data.attackerUuid ?? null
      });

    case "applyCombatHandlerDamage":
      return await applyRulesDamage({
        targetActorUuid: data.targetActorUuid ?? data.targetUuid ?? data.uuid ?? null,
        baseDamage: Number(data.baseDamage ?? data.damage ?? 0),
        damageType: data.damageType ?? "physical-blunt",
        attackerUuid: data.attackerUuid ?? null
      });

    case "deleteActiveEffects":
      return await deleteActiveEffects({
        targetActorUuid: data.targetActorUuid,
        effectIds: data.effectIds
      });

    case "update":
      return await updateActor({
        targetActorUuid: data.targetActorUuid,
        updateData: data.args?.[0]
      });

    case "createEmbeddedDocuments":
      // Legacy signature: args: [collectionName, [docs]]
      return await createEmbeddedDocsOnActor({
        targetActorUuid: data.targetActorUuid,
        collection: data.args?.[0],
        docs: data.args?.[1] || []
      });

    case "deleteEmbeddedDocuments":
      return await deleteEmbeddedDocsOnActor({
        targetActorUuid: data.targetActorUuid,
        collection: data.args?.[0],
        ids: data.args?.[1] || []
      });

    case "createActorEffect":
      return await createActorEffect({
        targetActorUuid: data.targetActorUuid,
        effectData: data.effectData
      });

    case "createMacro":
      return await createMacroForPlayer({
        macroData: data.macroData,
        slot: data.slot,
        userId: data.userId
      });

    case "setCombatantFlags":
      return await setCombatantFlags({
        combatantId: data.combatantId,
        flags: data.flags
      });

    default:
      throw new Error(`Unknown GM operation: ${operation}`);
  }
}

/* ----------- Concrete implementations ----------- */

function ensureSocket() {
  if (!socket) {
    ui.notifications?.warn("Socket not initialized; cannot run GM command.");
    throw new Error("Socket not initialized");
  }
}

async function getActorFromUuid(maybeUuid) {
  if (!maybeUuid) return null;
  const doc = await fromUuid(maybeUuid);
  return doc?.actor || doc || null; // token.actor or actor
}

async function adjustTargetHealth({ targetActorUuid, newHealth }) {
  const actor = await getActorFromUuid(targetActorUuid);
  if (!actor) throw new Error(`adjustTargetHealth: actor not found: ${targetActorUuid}`);
  await actor.update({ "system.attributes.health.value": newHealth });
  return true;
}

async function createActorEffect({ targetActorUuid, effectData }) {
  const actor = await getActorFromUuid(targetActorUuid);
  if (!actor) throw new Error(`createActorEffect: actor not found: ${targetActorUuid}`);
  return await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
}

async function createEmbeddedDocsOnActor({ targetActorUuid, collection, docs }) {
  const actor = await getActorFromUuid(targetActorUuid);
  if (!actor) throw new Error(`createEmbeddedDocsOnActor: actor not found: ${targetActorUuid}`);
  if (!collection) throw new Error("createEmbeddedDocsOnActor: missing collection name");
  if (!Array.isArray(docs)) throw new Error("createEmbeddedDocsOnActor: docs must be an array");
  return await actor.createEmbeddedDocuments(collection, docs);
}

async function deleteEmbeddedDocsOnActor({ targetActorUuid, collection, ids }) {
  const actor = await getActorFromUuid(targetActorUuid);
  if (!actor) throw new Error(`deleteEmbeddedDocsOnActor: actor not found: ${targetActorUuid}`);
  if (!collection) throw new Error("deleteEmbeddedDocsOnActor: missing collection name");
  if (!Array.isArray(ids)) throw new Error("deleteEmbeddedDocsOnActor: ids must be an array");
  return await actor.deleteEmbeddedDocuments(collection, ids);
}

async function deleteActiveEffects({ targetActorUuid, effectIds }) {
  const actor = await getActorFromUuid(targetActorUuid);
  if (!actor || !Array.isArray(effectIds) || effectIds.length === 0) return false;
  await actor.deleteEmbeddedDocuments("ActiveEffect", effectIds);
  return true;
}

async function updateActiveEffect({ targetActorUuid, effectId, updateData }) {
  const actor = await getActorFromUuid(targetActorUuid);
  if (!actor) throw new Error(`updateActiveEffect: actor not found: ${targetActorUuid}`);
  const effect = actor.effects.get(effectId);
  if (!effect) throw new Error(`updateActiveEffect: effect not found: ${effectId}`);
  await effect.update(updateData);
  return true;
}

async function gmRenameEffectWithRemaining({ targetActorUuid, effectId }) {
  const actor = await getActorFromUuid(targetActorUuid);
  if (!actor) return false;
  const effect = actor.effects.get(effectId);
  if (!effect) return false;
  try {
    const { renameEffectWithRemaining } = await import("./modules/effects/effect-engine.js");
    await renameEffectWithRemaining(effect);
    return true;
  } catch (e) {
    console.warn("[FASERIP] gmRenameEffectWithRemaining failed:", e);
    return false;
  }
}

async function updateActor({ targetActorUuid, updateData }) {
  const actor = await getActorFromUuid(targetActorUuid);
  if (!actor || !updateData) return false;
  await actor.update(updateData);
  return true;
}

async function applyRulesDamage({ targetActorUuid, baseDamage, damageType, attackerUuid }) {
  const actor = await getActorFromUuid(targetActorUuid);

  if (!actor) return false;
  debugLog("gm-utils → applyRulesDamage", { actor: actor.name, baseDamage, damageType, attackerUuid });
  // Use selection if GM clicked from a message; otherwise direct-apply to target actor only
  const targets = game.user?.targets?.size ? Array.from(game.user.targets) : [actor.getActiveTokens()?.at(0)?.document ?? actor];
  await applyDamageToTargets({
    damage: baseDamage,
    attackerUuid,
    damageType: damageType || "physical-blunt"
  });
  return true;
}


async function manageRecoveryEffect({ actorUuid, action, effectData = null, effectId = null }) {
  const actor = await getActorFromUuid(actorUuid);
  if (!actor) throw new Error(`manageRecoveryEffect: actor not found: ${actorUuid}`);
  
  if (action === "create") {
    if (!effectData) throw new Error("manageRecoveryEffect: effectData required for create action");
    return await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
  } 
  else if (action === "delete") {
    if (!effectId) throw new Error("manageRecoveryEffect: effectId required for delete action");
    const effect = actor.effects.get(effectId);
    if (effect) {
      return await effect.delete();
    }
    return null;
  }
  else {
    throw new Error(`manageRecoveryEffect: unknown action: ${action}`);
  }
}

/**
 * Create a macro on behalf of a player (GM executes this via socket)
 */
async function createMacroForPlayer({ macroData, slot, userId }) {
  if (!macroData) throw new Error("createMacroForPlayer: macroData required");
  
  // Check if macro already exists
  let macro = game.macros.find(m => m.name === macroData.name && m.command === macroData.command);
  
  if (!macro) {
    // Create with owner permission for the requesting user
    const ownership = { default: 0 };
    if (userId) {
      ownership[userId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    }
    
    macro = await Macro.create({
      ...macroData,
      ownership
    });
  } else {
    // Ensure the user has ownership of existing macro
    if (userId && !macro.testUserPermission(game.users.get(userId), "OWNER")) {
      const ownership = foundry.utils.deepClone(macro.ownership || {});
      ownership[userId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
      await macro.update({ ownership });
    }
  }
  
  // Assign to hotbar for the requesting user
  if (slot && userId) {
    const user = game.users.get(userId);
    if (user) {
      await user.assignHotbarMacro(macro, slot);
    }
  }
  
  return { macroId: macro.id, macroUuid: macro.uuid };
}

/**
 * Set flags on a combatant document (GM-only operation).
 * Players cannot modify Combatant documents directly.
 */
async function setCombatantFlags({ combatantId, flags }) {
  if (!combatantId || !flags || typeof flags !== "object") {
    throw new Error("setCombatantFlags: combatantId and flags required");
  }
  const combat = game.combat;
  if (!combat) throw new Error("setCombatantFlags: no active combat");
  const combatant = combat.combatants.get(combatantId);
  if (!combatant) throw new Error(`setCombatantFlags: combatant not found: ${combatantId}`);
  for (const [key, value] of Object.entries(flags)) {
    await combatant.setFlag("msh-faserip", key, value);
  }
  return true;
}

/* ----------- Safe Actor Write Utilities ----------- */
// These handle the v13 ActorDelta permission issue where a player may
// own the base Actor but lack write permission on the unlinked Token's
// ActorDelta. They pre-check canUserModify to avoid Foundry console
// warnings, then delegate to GM socket when needed.

/**
 * Check if current user can modify this actor directly.
 * For unlinked tokens (ActorDelta), checks the parent Token permission.
 */
function _canWriteActor(actor) {
  if (game.user.isGM) return true;
  try {
    // v13 ActorDelta: check parent token
    if (actor.parent?.documentName === "Token") {
      return actor.parent.canUserModify?.(game.user, "update") ?? actor.parent.isOwner ?? false;
    }
    // Synthetic token actor
    if (actor.token?.isLinked === false) {
      return actor.token.canUserModify?.(game.user, "update") ?? actor.token.isOwner ?? false;
    }
    if (actor.isToken === true) {
      const token = canvas.tokens?.placeables?.find(t => t.actor === actor);
      if (token?.document) {
        return token.document.canUserModify?.(game.user, "update") ?? token.document.isOwner ?? false;
      }
    }
    // Regular linked actor
    return actor.canUserModify?.(game.user, "update") ?? actor.isOwner ?? false;
  } catch {
    return false;
  }
}

/**
 * Safe actor.update — delegates to GM socket when player lacks permission.
 */
export async function safeActorUpdate(actor, updateData, updateOpts = {}) {
  if (!actor || !updateData) return;
  if (_canWriteActor(actor)) {
    return actor.update(updateData, updateOpts);
  }
  console.log(`[FASERIP] safeActorUpdate: delegating to GM for ${actor.name}`);
  return runAsGM({ operation: "update", targetActorUuid: actor.uuid, args: [updateData] });
}

/**
 * Safe actor.setFlag — delegates to GM socket when player lacks permission.
 */
export async function safeActorSetFlag(actor, scope, key, value) {
  if (!actor) return;
  if (_canWriteActor(actor)) {
    return actor.setFlag(scope, key, value);
  }
  console.log(`[FASERIP] safeActorSetFlag: delegating to GM for ${actor.name}`);
  const updateData = { [`flags.${scope}.${key}`]: value };
  return runAsGM({ operation: "update", targetActorUuid: actor.uuid, args: [updateData] });
}

/**
 * Safe actor.createEmbeddedDocuments("ActiveEffect", ...) — delegates to GM.
 */
export async function safeActorCreateEffect(actor, effectDataArray) {
  if (!actor) return;
  if (_canWriteActor(actor)) {
    return actor.createEmbeddedDocuments("ActiveEffect", effectDataArray);
  }
  console.log(`[FASERIP] safeActorCreateEffect: delegating to GM for ${actor.name}`);
  return runAsGM({
    operation: "createEmbeddedDocuments",
    targetActorUuid: actor.uuid,
    args: ["ActiveEffect", effectDataArray]
  });
}

/**
 * Safe actor.deleteEmbeddedDocuments — delegates to GM.
 */
export async function safeActorDeleteEffects(actor, effectIds, opts = {}) {
  if (!actor || !effectIds?.length) return;
  if (_canWriteActor(actor)) {
    return actor.deleteEmbeddedDocuments("ActiveEffect", effectIds, opts);
  }
  console.log(`[FASERIP] safeActorDeleteEffects: delegating to GM for ${actor.name}`);
  return runAsGM({
    operation: "deleteEmbeddedDocuments",
    targetActorUuid: actor.uuid,
    args: ["ActiveEffect", effectIds]
  });
}