// scripts/modules/actions/nullify-aura.js v2.0.0 - 2026-03-22
// v2.0.0: Rewrite using PIXI visual + distance-based effect management.
//   Visual: PIXI.Graphics ellipse drawn as child of caster token — moves automatically.
//   Logic: On any token move, check distances for all tokens vs active nullify auras.
//          Apply Nullified (with Endurance FEAT) when entering range, remove when leaving.
//   Inspired by ARS game system aura implementation.

import { applyNullified } from "../effects/effect-engine.js";
import { universalColor } from "./action-utils.js";
import { getNullifyRange, RANKS, rIdx, requiredColorFromDelta, meetsThreshold } from "./nullify-utils.js";

const SCOPE = () => globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip";

// Cooldown: after activation, skip checkAllAuras for a brief period
// so the initial card from mental-power-action doesn't get duplicated.
let _activationCooldownUntil = 0;

/** Call this when the aura is first activated to suppress the hook-based check. */
export function setActivationCooldown(ms = 3000) {
  _activationCooldownUntil = Date.now() + ms;
}

function hasInbornPowers(actor) {
  if (!actor) return false;
  return actor.items.some(i =>
    i.type === "power" &&
    i.system?.isActive !== false &&
    (i.system?.source || "").toLowerCase() === "natural"
  );
}

// ── PIXI Visual ──

class NullifyAuraGraphic extends PIXI.Graphics {
  constructor(token, radiusInAreas, color = "#7b1fa2", opacity = 0.15) {
    super();
    const dim = canvas.dimensions;
    const unit = dim.size / dim.distance;
    const [cx, cy] = [token.w / 2, token.h / 2];
    const { width, height } = token.document;

    const extraW = ((width - 1) * dim.distance) / 2;
    const extraH = ((height - 1) * dim.distance) / 2;
    const rw = (radiusInAreas + extraW) * unit;
    const rh = (radiusInAreas + extraH) * unit;

    const c = PIXI.utils.string2hex?.(color) ?? parseInt(color.replace("#", ""), 16);

    this.lineStyle(2, c, 0.6);
    this.beginFill(c, opacity);
    this.drawEllipse(cx, cy, rw, rh);
    this.endFill();

    this._nullifyAura = true;
  }
}

export function drawAuraVisual(casterToken, radiusInAreas) {
  removeAuraVisual(casterToken);
  if (!casterToken || radiusInAreas <= 0) return;
  const graphic = new NullifyAuraGraphic(casterToken, radiusInAreas);
  casterToken.addChildAt(graphic, 0);
}

export function removeAuraVisual(token) {
  if (!token) return;
  const toRemove = token.children?.filter(c => c._nullifyAura) ?? [];
  for (const child of toRemove) {
    token.removeChild(child);
    child.destroy();
  }
}

// ── Distance helper ──

function tokenDistance(token1, token2) {
  if (!token1?.center || !token2?.center) return Infinity;
  const dx = token1.center.x - token2.center.x;
  const dy = token1.center.y - token2.center.y;
  const distPx = Math.sqrt(dx * dx + dy * dy);
  const dim = canvas.dimensions;
  return (distPx / dim.size) * dim.distance;
}

// ── Aura state queries ──

function getActiveNullifyAuras() {
  if (!canvas?.tokens) return [];
  const scope = SCOPE();
  const auras = [];

  for (const token of canvas.tokens.placeables) {
    const actor = token.actor;
    if (!actor) continue;

    const auraEffect = actor.effects?.find(e => {
      const f = e.flags?.[scope]?.aura?.nullify;
      return f?.active;
    });
    if (!auraEffect) continue;

    const flags = auraEffect.flags[scope].aura.nullify;
    const powerRank = flags.powerRank;
    if (!powerRank) continue;

    const rangeInAreas = getNullifyRange(powerRank);

    auras.push({ casterActor: actor, casterToken: token, powerRank, rangeInAreas, powerItemUuid: auraEffect.origin ?? null });
  }
  return auras;
}

function getNullifiedFromCaster(targetActor, casterActorId) {
  const scope = SCOPE();
  return targetActor.effects?.find(e => {
    const f = e.flags?.[scope] || {};
    return f.effectType === "nullified" && !f.selfNullify && f.auraCasterId === casterActorId;
  }) ?? null;
}

// ── Per-target aura processing ──

async function processAuraTarget(aura, targetToken) {
  const { casterActor, casterToken, powerRank, rangeInAreas, powerItemUuid } = aura;
  const targetActor = targetToken.actor;
  if (!targetActor || targetActor.id === casterActor.id) return;

  const dist = tokenDistance(casterToken, targetToken);
  const inRange = dist <= rangeInAreas;
  const existingEffect = getNullifiedFromCaster(targetActor, casterActor.id);

  if (inRange && !existingEffect) {
    if (!hasInbornPowers(targetActor)) return;

    // Check combat mode
    const mode = game.settings?.get?.("msh-faserip", "defaultCombatMode") || "semi";

    const endRank = targetActor.system?.abilities?.endurance?.rank || "Typical";
    const delta = rIdx(powerRank) - rIdx(endRank);
    const req = requiredColorFromDelta(delta);
    const reqLabel = req === "auto-fail" ? "Impossible" : req === "auto-success" ? "Auto" : req.charAt(0).toUpperCase() + req.slice(1);

    // Auto-success: ability 3+ ranks above intensity — no roll, no effect
    if (req === "auto-success") {
      await ChatMessage.create({
        content: `<div style="border:1px solid #4caf50;border-radius:4px;padding:6px;">
          <div style="font-size:.9em;">
            <b>${targetActor.name}</b> enters ${casterActor.name}'s nullification field — <span style="color:#2e7d32;font-weight:600;">auto-resisted</span> (End ${endRank} vs ${powerRank}).
          </div>
        </div>`
      });
      return;
    }

    if (mode !== "full") {
      // ── Semi mode: post a save button instead of auto-rolling ──
      if (req === "auto-fail") {
        await ChatMessage.create({
          content: `<div style="border:2px solid #7b1fa2;border-radius:4px;padding:6px;">
            <div style="font-weight:700;color:#7b1fa2;margin-bottom:4px;">Nullify Aura — ${casterActor.name}</div>
            <div style="display:flex;align-items:center;gap:8px;font-size:.9em;">
              <span style="font-weight:600;min-width:100px;">${targetActor.name}</span>
              <span style="color:#666;">End: ${endRank} — impossible to resist</span>
              <a class="faserip-chip" data-action="nullify-auto-fail" data-target-uuid="${targetActor.uuid}" data-attacker-uuid="${casterActor.uuid}" data-power-item-uuid="${powerItemUuid || ""}"
                 style="padding:2px 8px;border:1px solid #b71c1c;border-radius:3px;background:#ffebee;color:#b71c1c;cursor:pointer;font-size:12px;font-weight:600;">
                 Apply
              </a>
            </div>
          </div>`
        });
      } else {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: casterActor }),
          content: `<div style="border:2px solid #7b1fa2;border-radius:4px;padding:6px;">
            <div style="font-weight:700;color:#7b1fa2;margin-bottom:4px;">Nullify Aura — ${casterActor.name}</div>
            <div style="display:flex;align-items:center;gap:8px;font-size:.9em;">
              <span style="font-weight:600;min-width:100px;">${targetActor.name}</span>
              <span style="color:#666;">End: ${endRank} (need ${reqLabel})</span>
              <a class="faserip-chip" data-action="force-save-nullify"
                 data-attacker-uuid="${casterActor.uuid}" data-target-uuid="${targetActor.uuid}" data-target-name="${targetActor.name}"
                 data-intensity-rank="${powerRank}" data-save-ability="endurance"
                 style="padding:2px 8px;border:1px solid #6a1b9a;border-radius:3px;background:#f3e5f5;color:#6a1b9a;cursor:pointer;font-size:12px;font-weight:600;">
                 Roll Save
              </a>
            </div>
          </div>`,
          flags: {
            "msh-faserip": {
              requiresSave: true,
              attackerUuid: casterActor.uuid,
              targetUuid: targetActor.uuid,
              defenderUuid: targetActor.uuid,
              saveAbility: "endurance",
              saveIntensity: "fixed-rank",
              saveFixedRank: powerRank,
              effectName: "Nullified",
              failMessage: "has powers nullified",
              powerName: "Nullifying Power"
            }
          }
        });
      }
      return;
    }

    // ── Full Auto: roll saves immediately ──
    if (req === "auto-fail") {
      await applyNullified(targetActor, { rounds: null, originUuid: powerItemUuid, selfNullify: false, auraCasterId: casterActor.id });

      await ChatMessage.create({
        content: `<div style="border:2px solid #7b1fa2;border-radius:4px;padding:6px;">
          <div style="font-weight:700;color:#7b1fa2;margin-bottom:4px;">Nullify Aura — ${casterActor.name}</div>
          <div style="font-size:.9em;">
            <b>${targetActor.name}</b> enters nullification field.
            Endurance (${endRank}) vs ${powerRank} — impossible to resist. <span style="color:#b71c1c;font-weight:600;">NULLIFIED</span>
          </div>
        </div>`
      });
      return;
    }

    const roll = await (new Roll("1d100")).evaluate();
    const total = roll.total;
    const color = universalColor(endRank, total);
    const colorLower = String(color || "white").toLowerCase();
    const saved = meetsThreshold(colorLower, req);

    if (!saved) {
      await applyNullified(targetActor, { rounds: null, originUuid: powerItemUuid, selfNullify: false, auraCasterId: casterActor.id });

      await ChatMessage.create({
        content: `<div style="border:2px solid #7b1fa2;border-radius:4px;padding:6px;">
          <div style="font-weight:700;color:#7b1fa2;margin-bottom:4px;">Nullify Aura — ${casterActor.name}</div>
          <div style="font-size:.9em;">
            <b>${targetActor.name}</b> enters nullification field.
            Endurance FEAT: <b>${total}</b> (${colorLower}) — needed ${reqLabel}.
            <span style="color:#b71c1c;font-weight:600;">NULLIFIED</span> while in range.
          </div>
        </div>`
      });
    } else {
      await ChatMessage.create({
        content: `<div style="border:2px solid #7b1fa2;border-radius:4px;padding:6px;">
          <div style="font-weight:700;color:#7b1fa2;margin-bottom:4px;">Nullify Aura — ${casterActor.name}</div>
          <div style="font-size:.9em;">
            <b>${targetActor.name}</b> enters nullification field.
            Endurance FEAT: <b>${total}</b> (${colorLower}) — needed ${reqLabel}.
            <span style="color:#2e7d32;font-weight:600;">RESISTED</span>
          </div>
        </div>`
      });
    }
  } else if (!inRange && existingEffect) {
    // Leaving range — always auto-remove regardless of mode
    await existingEffect.delete();
    await ChatMessage.create({
      content: `<div style="border:1px solid #4caf50;border-radius:4px;padding:6px;">
        <div style="font-size:.9em;">
          <b>${targetActor.name}</b> leaves ${casterActor.name}'s nullification field — powers restored.
        </div>
      </div>`
    });
  }
}

async function checkAllAuras() {
  if (!game.user.isGM) return;
  if (Date.now() < _activationCooldownUntil) return; // skip during activation cooldown
  const auras = getActiveNullifyAuras();
  if (auras.length === 0) return;

  for (const aura of auras) {
    for (const targetToken of canvas.tokens.placeables) {
      await processAuraTarget(aura, targetToken);
    }
  }
}

// ── Public API for nullify.js ──

export async function removeAllAuraEffects(casterActorId) {
  if (!canvas?.tokens) return;
  const scope = SCOPE();
  for (const token of canvas.tokens.placeables) {
    const actor = token.actor;
    if (!actor) continue;
    const effects = actor.effects?.filter(e => {
      const f = e.flags?.[scope] || {};
      return f.effectType === "nullified" && !f.selfNullify && f.auraCasterId === casterActorId;
    }) ?? [];
    for (const effect of effects) {
      await effect.delete();
      console.log(`[FASERIP] Nullify aura ended: removed nullified from ${actor.name}`);
    }
  }
}

export function refreshAllAuraVisuals() {
  if (!canvas?.tokens) return;
  for (const token of canvas.tokens.placeables) removeAuraVisual(token);
  for (const aura of getActiveNullifyAuras()) drawAuraVisual(aura.casterToken, aura.rangeInAreas);
}

// ── Hooks registration ──

let _hooksRegistered = false;

export function registerNullifyAuraHooks() {
  if (_hooksRegistered) return;
  _hooksRegistered = true;

  // Any token moves → check all auras (delay lets token finish move)
  Hooks.on("updateToken", (tokenDoc, changes, options, userId) => {
    if (!game.user.isGM) return;
    if (!("x" in changes || "y" in changes)) return;
    setTimeout(() => checkAllAuras(), 500);
  });

  // Token created → might land inside an aura
  Hooks.on("createToken", (tokenDoc, options, userId) => {
    if (!game.user.isGM) return;
    setTimeout(() => checkAllAuras(), 500);
  });

  // Token deleted → clean up visuals
  Hooks.on("deleteToken", () => setTimeout(() => refreshAllAuraVisuals(), 250));

  // Canvas ready → redraw all aura visuals
  Hooks.on("canvasReady", () => setTimeout(() => refreshAllAuraVisuals(), 500));

  // Aura effect created/deleted → refresh visuals + recheck
  Hooks.on("createActiveEffect", (effect) => {
    if (effect.flags?.[SCOPE()]?.aura?.nullify?.active) {
      setTimeout(() => { refreshAllAuraVisuals(); checkAllAuras(); }, 500);
    }
  });

  Hooks.on("deleteActiveEffect", (effect) => {
    if (effect.flags?.[SCOPE()]?.aura?.nullify?.active) {
      setTimeout(() => refreshAllAuraVisuals(), 250);
    }
  });

  // Token refresh (after drag, etc.) → redraw aura visual if this token is a caster
  Hooks.on("refreshToken", (token) => {
    if (!token?.actor) return;
    const scope = SCOPE();
    const hasAura = token.actor.effects?.some(e => e.flags?.[scope]?.aura?.nullify?.active);
    if (hasAura) {
      const auras = getActiveNullifyAuras().filter(a => a.casterToken.id === token.id);
      if (auras.length > 0) {
        removeAuraVisual(token);
        drawAuraVisual(token, auras[0].rangeInAreas);
      }
    }
  });

  console.log("[FASERIP] Nullify aura hooks registered (PIXI + distance mode)");
}
