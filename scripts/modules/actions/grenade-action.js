// scripts/modules/actions/grenade-action.js v3.6.0 - 2026-11-11
// v3.6.0: The damage-grenade throw dialog moves to the compact layout the
//   other attack dialogs share (approved mockup 2026-11-11), built on
//   attack-dialog-kit.js: banner header, grenade box (damage, type, blast
//   radius, count remaining), the shared CS row with its range term and
//   Reason field, range box, Karma row, effect grid, Throw / Cancel footer,
//   mode buttons in the title bar. Remember and Skip dice now work as in
//   the other dialogs (per-browser; range, shift and reason are restored
//   only when Remember is ticked). A range beyond the Strength maximum is
//   refused with the dialog left open (it used to cancel the throw).
//   Roll, range penalty, scatter, blast and saves are unchanged.
// scripts/modules/actions/grenade-action.js v3.5.0 - 2026-09-05
// v3.5.0: RULED 2026-09-05 thrown range penalty: -1CS per area to the target,
//   own area 0, via the range kernel (thrownRangePenalty); Strength range is
//   the cap. Replaces the free first area. LOS caps render as "LOS".
// scripts/modules/actions/grenade-action.js v3.4.0 - 2026-08-02
// v3.4.0: Initial-blast saves resolve in PARALLEL (Promise.all) so each
//   caught hero's karma declaration window (area-hazard-behavior v1.3.0,
//   10s auto-decline) opens simultaneously on the owning players' clients
//   instead of stacking serially. Dedupe unchanged (_resolvedTokenIds).
// scripts/modules/actions/grenade-action.js v3.3.0 - 2026-04-22
// v3.3.0: Intensity grenades now place a visible Drawing overlay alongside the
//   Region (v14 Regions are only visible on the Regions layer, so without
//   an overlay the hazard was logically functional but invisible on canvas).
//   Per-type fillColor via resolveHazardVisual: smoke=gray, tear gas=yellow-
//   green, KO=violet, flash=bright yellow. AreaTemplate.create returns the
//   drawing id in addition to the region; dismiss() cleans up both.
// v3.2.0: Intensity grenades now attach the "msh-faserip.areaHazard" Region
//   behavior (v14) to the persistent Region they create. The behavior
//   automatically rolls saves on token entry/exit and applies/removes status
//   effects. The initial blast (tokens already inside when the Region is
//   placed) is handled by calling behavior.resolveForToken on each caught
//   token — tokenEnter doesn't fire retroactively for pre-existing tokens.
//   Per-grenade-type config (smoke = blinded-while-inside, tear gas = 1-round
//   residual on exit, KO gas = fixed-duration effect, flash = one-shot) is
//   resolved in resolveHazardBehaviorConfig() below.
// v3.1.0: Scatter on miss, per Judge's Book.
//   - Read unified item fields (system.areaRadius/damage/damageType/intensityRank)
//     with grenadeRadius/grenadeDamage/grenadeDamageType/grenadeIntensity fallback.
//     Delete the GRENADE_TYPES hardcoded table — mechanics come from item data.
//   - One-phase AreaTemplate placement (v9.0.0). Persistent Region only for lingering
//     hazards (smoke/gas/flash); ephemeral for damage grenades (no stuck Region on hit).
//   - Shake profile resolved via DAMAGE_TYPE_SHAKE map in action-utils; one line instead
//     of per-grenade-type baked-in values.
//   - Smoke/gas/flash (effectType === "intensity") delegate to IntensityAction — no more
//     parallel effect pipeline in this file.
// v2.4.0: v14 screen shake on hit via chat-message flag.
// v2.3.0: Fix range penalty off-by-one. Fix Kill result logic for frag/energy.
// v2.2.0: Template placement happens BEFORE roll.

import { RangedAttackAction, thrownRangePenalty, rangeLabel } from "./ranged-attack-action.js";
import { AreaTemplate } from "./area-template.js";
import {
  getAbilityInfo,
  shiftRank,
  rollWithKarmaAndHistory,
  buildShiftDisplay,
  buildRollDisplay,
  buildResultBadge,
  buildContentBox,
  buildCardShell,
  buildActorTargetHtml,
  buildAbilitySection,
  getTargetData,
  applyDamageToTargets,
  shakeProfileFor,
  getAreaRadius,
  getAreaDamage,
  getAreaDamageType,
  getAreaIntensityRank
} from "./action-utils.js";
import {
  setupKarmaControlHandlers,
  extractKarmaFromDialog,
  getAvailableKarma,
  getMinimumKarmaCommitment
} from "../dice/dice-roller.js";
import { showFaseripDialog } from "./dialog-shim.js";
import { buildCSRow, wireCSPanel } from "./cs-modifiers.js";
import {
  setLS, dialogPrefs, flagRecall, saveDialogFlags, headerHtml, karmaRowHtml, fxGridHtml, footerHtml,
  pinDialogWidth, mountDialogFrame, wireRollKeys, wireRowToggle, wirePrefToggles
} from "./attack-dialog-kit.js";

// Map raw damageType code → normalized form + human label + attack form + killing flag.
// Kept small and flat — anything else is read from the item fields.
const DAMAGE_TYPE_META = {
  "BA": { normalized: "physical-blunt", label: "blunt",  attackForm: "blunt",  killing: false },
  "TB": { normalized: "physical-blunt", label: "blunt",  attackForm: "blunt",  killing: false },
  "EA": { normalized: "physical-edged", label: "edged",  attackForm: "edged",  killing: true  },
  "TE": { normalized: "physical-edged", label: "edged",  attackForm: "edged",  killing: true  },
  "S":  { normalized: "physical-blunt", label: "impact", attackForm: "blunt",  killing: false },
  "E":  { normalized: "energy",         label: "energy", attackForm: "energy", killing: true  },
  "F":  { normalized: "force",          label: "force",  attackForm: "blunt",  killing: false }
};

// Judge's Book 1d10 Slam/Stagger direction table, repurposed for grenade scatter.
// Directions are from TARGET's point of view (target facing AWAY from thrower).
// 9 (straight up) and 10 (straight down) are interpreted for grenades:
//   9 → grenade sails into the sky, no effect
//   10 → grenade drops at thrower's feet
const SCATTER_TABLE = {
  1: "back", 2: "back",
  3: "back-right", 4: "back-right",
  5: "back-left",  6: "back-left",
  7: "right",
  8: "left",
  9: "up",
  10: "down"
};

const SCATTER_LABEL = {
  "back":       "straight back — toward the thrower",
  "back-right": "back and to the right",
  "back-left":  "back and to the left",
  "right":      "straight right of the target",
  "left":       "straight left of the target",
  "up":         "straight up — lost in the air",
  "down":       "straight down — at the thrower's feet"
};

/**
 * Resolve a missed grenade's scatter position.
 * Horizontal scatters offset the blast by 1 area in the rolled direction.
 * Returns { x, y, direction, dirLabel, roll }. For "up", x/y are null (no detonation).
 */
function resolveScatter(throwerPos, targetPos, pxPerArea) {
  const roll = Math.ceil(Math.random() * 10);
  const direction = SCATTER_TABLE[roll];
  const dirLabel = SCATTER_LABEL[direction];

  if (direction === "up") {
    return { x: null, y: null, direction, dirLabel, roll };
  }
  if (direction === "down") {
    return { x: throwerPos.x, y: throwerPos.y, direction, dirLabel, roll };
  }

  // Unit vector along throw direction (thrower → target)
  const dx = targetPos.x - throwerPos.x;
  const dy = targetPos.y - throwerPos.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = len > 0 ? dx / len : 1;
  const uy = len > 0 ? dy / len : 0;

  // Target-relative basis (screen coords, y+ = down). Target faces +u (away from thrower).
  // Their right is 90° clockwise from forward: (-uy, ux). Left is the negation.
  const rightX = -uy, rightY = ux;
  const leftX  =  uy, leftY  = -ux;
  const backX  = -ux, backY  = -uy;

  let offX, offY;
  switch (direction) {
    case "back":       offX = backX;                     offY = backY;                     break;
    case "right":      offX = rightX;                    offY = rightY;                    break;
    case "left":       offX = leftX;                     offY = leftY;                     break;
    case "back-right": offX = (backX + rightX) / Math.SQRT2; offY = (backY + rightY) / Math.SQRT2; break;
    case "back-left":  offX = (backX + leftX)  / Math.SQRT2; offY = (backY + leftY)  / Math.SQRT2; break;
  }

  const rawX = targetPos.x + offX * pxPerArea;
  const rawY = targetPos.y + offY * pxPerArea;
  const snap = canvas.grid.getSnappedPoint({ x: rawX, y: rawY }, { mode: CONST.GRID_SNAPPING_MODES.CENTER });
  return { x: snap.x, y: snap.y, direction, dirLabel, roll };
}

/**
 * Resolve the effect mode of a grenade item:
 *   - "damage"    : rolls attack, applies damage to all in area on hit
 *   - "intensity" : delegates to IntensityAction (smoke/gas/flash — no damage, saves only)
 *
 * Mode is inferred from item fields:
 *   - has damage > 0 AND damageType    → damage
 *   - has intensityRank (and no damage) → intensity
 *   - otherwise fall back to damage (user misconfigured; show a warning)
 */
function resolveGrenadeMode(item) {
  const damage = getAreaDamage(item);
  const dt = getAreaDamageType(item);
  const intensity = getAreaIntensityRank(item);
  if (damage > 0 && dt) return "damage";
  if (intensity) return "intensity";
  return damage > 0 ? "damage" : "intensity";
}

export class GrenadeAction extends RangedAttackAction {
  async execute() {
    const actor = this.actor;
    const item  = this.opts?.item ?? (this.opts?.itemId ? actor.items.get(this.opts.itemId) : null);

    if (!item) {
      ui.notifications.warn("No grenade item found.");
      return;
    }

    const mode = resolveGrenadeMode(item);

    // Intensity grenades (smoke/gas/flash) → delegate to IntensityAction, which
    // already supports single-target FEATs and will grow the area-template step.
    // For now: place a persistent Region (the hazard lingers), target everyone
    // inside it, then dispatch IntensityAction with the pre-set targets.
    if (mode === "intensity") {
      return this._executeIntensityGrenade(actor, item);
    }

    return this._executeDamageGrenade(actor, item);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DAMAGE PATH — frag, concussive, sonic, etc.
  // ─────────────────────────────────────────────────────────────────────────
  async _executeDamageGrenade(actor, item) {
    // Ammo check
    const _sr = item.system.shotsRemaining;
    const shotsRemaining = (_sr !== "" && _sr != null)
      ? _sr
      : (item.system.shots !== "" && item.system.shots != null ? item.system.shots : 1);
    if (Number.isFinite(Number(shotsRemaining)) && Number(shotsRemaining) <= 0) {
      if (game.msh?.playCombatSFX) {
        await game.msh.playCombatSFX({ item, actionType: "grenade", outOfAmmo: true });
      }
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div style="background:#fff;border:1px solid #bbb;border-radius:3px;padding:6px 8px;">
          <b>${actor.name}</b> reaches for a <b>${item.name}</b> — none left.
        </div>`
      });
      return;
    }

    // Resolve item data
    const damage = getAreaDamage(item);
    const dtCode = getAreaDamageType(item) || "BA";
    const meta   = DAMAGE_TYPE_META[dtCode] ?? DAMAGE_TYPE_META.BA;
    const damageTypeNormalized = meta.normalized;
    const radiusInAreas = getAreaRadius(item) || 1;

    const ability  = getAbilityInfo(actor, "agility");
    const strRank  = actor?.system?.abilities?.strength?.rank || "Typical";
    const maxRange = this._getThrowingRangeInAreas(strRank);

    const availableKarma = getAvailableKarma(actor);
    const minKarma       = getMinimumKarmaCommitment(actor);

    const prefs = dialogPrefs("grenade");
    const recall = flagRecall(actor, prefs.remember);
    const savedRange = recall("lastGrenadeRange", 1);
    const savedShift = recall.nullish("lastGrenadeShift", 0);
    const savedReason = recall("lastGrenadeReason", "");

    const { targets, targetDisplay } = getTargetData();
    const landing = targets.length ? targetDisplay : "landing zone";
    const rangePenaltyAt = (range) => range > maxRange ? 0 : thrownRangePenalty(range, strRank); // RULED 2026-09-05

    const csRowHtml = buildCSRow({
      savedCS: savedShift,
      savedReason,
      abilityRank: ability.rank,
      rangePenalty: rangePenaltyAt(savedRange),
      showRange: true
    });

    const dialogHtml = `
    <div class="frp-dlg">
      ${headerHtml({ actor, ability: { ...ability, name: "Agility" }, targetDisplay: landing, verb: "throws at" })}

      <div class="frp-box frp-dmg-box">
        <div class="frp-dmg-inline">
          <span style="font-family:'Oswald',sans-serif;font-weight:600;font-size:14px;flex:1;">${item.name}</span>
          <span class="frp-dmg-num" id="dmg-val">${damage}</span>
          <span class="frp-cs-arrow">&rarr;</span>
          <span class="frp-dmg-after">${meta.label}, all in area</span>
        </div>
        <div style="font-size:11px;color:#555;margin-top:2px;display:flex;gap:10px;"><span>Blast radius: <strong>${radiusInAreas} area${radiusInAreas !== 1 ? "s" : ""}</strong></span><span style="margin-left:auto;"><strong>${shotsRemaining}</strong> remaining</span></div>
      </div>

      ${csRowHtml}

      <div class="frp-box" style="padding:3px 8px;background:#e3f2fd;border-color:#90caf9;">
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;">
          <span style="font-family:'Oswald',sans-serif;font-size:10px;color:#1565c0;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">Range</span>
          <input type="number" name="range" value="${savedRange}" min="0" class="frp-pull-input" style="width:36px;">
          <span style="color:#777;">areas</span>
          <span style="color:#999;font-size:11px;">(max <span id="max-range-hint">${rangeLabel(maxRange)}</span>)</span>
          <span id="range-penalty-display" style="margin-left:auto;font-family:'Oswald',sans-serif;font-weight:600;font-size:12px;color:#e65100;"></span>
        </div>
      </div>

      <div class="frp-box frp-opts-box">
        ${karmaRowHtml({ availableKarma, minKarma })}
      </div>

      ${fxGridHtml({
        white: `Miss<br><span style="font-size:9px;font-weight:400;opacity:0.7;">scatters</span>`,
        green: `Hit<br><span style="font-size:9px;font-weight:400;opacity:0.7;">all in area</span>`,
        yellow: `Hit<br><span style="font-size:9px;font-weight:400;opacity:0.7;">all in area</span>`,
        red: `Hit<br><span style="font-size:9px;font-weight:400;opacity:0.7;">all in area</span>`
      })}
      ${footerHtml({ remember: prefs.remember, skipDice: prefs.skipDice, rollLabel: "Throw" })}
    </div>
    `;

    const choice = await new Promise(resolve => {
      let _csState = null;
      let _resolved = false;
      showFaseripDialog({
        title: "Grenade",
        content: dialogHtml,
        render: async (html, dlg) => {
          setupKarmaControlHandlers(html);
          const $dialog = await mountDialogFrame({ html, dlg, actor, opts: this.opts || {}, modeFlag: "lastGrenadeMode" });

          const rangeField = () => Number(html.find('[name="range"]').val() || 0);

          _csState = wireCSPanel(html, {
            abilityRank: ability.rank,
            getRangePenalty: () => rangePenaltyAt(rangeField()),
            onUpdate: () => {
              if ($dialog.length) $dialog[0].style.height = 'auto';
            }
          });

          const update = () => {
            const range = rangeField();
            const $rangePenalty = html.find('#range-penalty-display');
            if (range > maxRange) {
              $rangePenalty.text('OUT OF RANGE').css('color', '#c62828');
              _csState.setRange(0);
            } else {
              const penalty = rangePenaltyAt(range);
              $rangePenalty.text(penalty < 0 ? `${penalty}CS` : '').css('color', '#e65100');
              _csState.setRange(penalty);
            }
            if ($dialog.length) $dialog[0].style.height = 'auto';
            pinDialogWidth(dlg);
          };

          html.find('[name="range"]').on('input change', update);
          wireRowToggle(html, '#spend-karma');
          wirePrefToggles(html, prefs);
          wireRollKeys(html, $dialog);

          html.find('#frp-roll').on('click', async () => {
            const $d = sel => html.find(sel);
            const rememberSettings = !!$d('#msh-remember-settings').is(':checked');
            const skipDice = !!$d('#msh-skip-dice').is(':checked');
            setLS(prefs.rememberKey, rememberSettings ? "1" : "0");
            setLS(prefs.skipKey, skipDice ? "1" : "0");

            const range = Number($d('[name="range"]').val() || 1);
            if (range > maxRange) {
              ui.notifications.error(`Beyond max throwing range (${maxRange} areas).`);
              return;
            }

            const cs = _csState.get();
            const shift = cs.manualCS;
            const rangeModifier = rangePenaltyAt(range);
            const totalShift = shift + rangeModifier;
            const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);

            const flagUpdate = { csNotes: cs.csNotes };
            if (rememberSettings) {
              Object.assign(flagUpdate, {
                lastGrenadeRange: range,
                lastGrenadeShift: shift,
                lastGrenadeReason: cs.reason
              });
            }
            await saveDialogFlags(actor, flagUpdate);

            _resolved = true;
            resolve({ range, shift, totalShift, rangeModifier, skipDice, spendKarma, karma: karmaToSpend });
            dlg.close();
          });

          html.find('#frp-cancel').on('click', () => {
            _resolved = true;
            resolve(null);
            dlg.close();
          });

          update();
        },
        close: () => {
          if (_csState) _csState.destroy();
          if (!_resolved) resolve(null);
        }
      });
    });

    if (!choice) return { rawActionCancelled: true };

    // Ephemeral template — no Region persists; just geometry + affectedTokens
    const template = await AreaTemplate.createAtTarget({
      radiusInAreas,
      label: item.name,
      fillColor: "#ff4400",
      fillAlpha: 0.25,
      persistent: false
    });
    if (!template) return;

    // Decrement ammo
    const newShots = Math.max(0, Number(shotsRemaining) - 1);
    await item.update({ "system.shotsRemaining": newShots });

    // Roll Agility FEAT (range penalty applied)
    const effectiveRank = shiftRank(ability.rank, choice.totalShift);
    const roll = await (new Roll("1d100")).evaluate();
    if (!choice.skipDice) {
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${actor.name} throws ${item.name}` });
    }

    const { cappedTotal, totalKarmaUsed } = await rollWithKarmaAndHistory(
      actor, `Grenade: ${item.name}`, choice.karma, roll,
      { spendKarma: choice.spendKarma, rank: effectiveRank }
    );

    const color      = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    const colorLower = String(color || "").toLowerCase();
    const isHit      = colorLower !== "white";

    if (game.msh?.playCombatSFX) {
      await game.msh.playCombatSFX({
        item,
        actionType: "grenade",
        damageType: damageTypeNormalized,
        rollResult: colorLower,
        isHit
      });
    }

    const shiftBreakdown = {};
    if (choice.shift) shiftBreakdown.manual = Number(choice.shift);
    if (choice.rangeModifier) shiftBreakdown.range = choice.rangeModifier;
    const shiftDisplay = buildShiftDisplay(choice.totalShift, effectiveRank, shiftBreakdown);
    const rollDisplay = buildRollDisplay(roll, totalKarmaUsed, cappedTotal);
    const resultBadge = buildResultBadge(color, isHit ? "HIT" : "MISS");

    let resultHtml = "";
    let affectedTargets = [];
    let exploded = false;

    if (isHit) {
      await template.target();
      affectedTargets = Array.from(game.user.targets);
      exploded = true;
      resultHtml = `<div style="padding:6px 8px;margin:0 10px 6px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.88em;">
        <div style="font-weight:700;color:#e65100;">HIT — ALL IN AREA AFFECTED</div>
        <div style="color:#555;margin-top:2px;">${damage} pts ${meta.label} damage to every target in the area.</div>
      </div>`;
    } else {
      // White result → scatter per Judge's Book 1d10 direction table
      const gridDist  = canvas.scene.grid.distance || 1;
      const gridSize  = canvas.scene.grid.size ?? 100;
      const pxPerArea = gridSize / gridDist;
      const throwerToken = actor.getActiveTokens?.()[0] ?? canvas.tokens.controlled?.[0] ?? null;
      const throwerPos = throwerToken
        ? { x: throwerToken.center.x, y: throwerToken.center.y }
        : { x: template.x, y: template.y };

      const scatter = resolveScatter(throwerPos, { x: template.x, y: template.y }, pxPerArea);

      if (scatter.x === null) {
        // Straight up — lost, no detonation
        resultHtml = `<div style="padding:6px 8px;margin:0 10px 6px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.88em;">
          <div style="font-weight:700;color:#888;">MISS — SCATTER (1d10 = ${scatter.roll})</div>
          <div style="color:#555;margin-top:2px;">${item.name} sails ${scatter.dirLabel}. No effect.</div>
        </div>`;
      } else {
        // Horizontal scatter or at-feet — re-target at new blast center
        affectedTargets = AreaTemplate._tokensInside(scatter.x, scatter.y, template.radiusPx);
        const ids = new Set(affectedTargets.map(t => t.id));
        canvas.tokens.placeables.forEach(t => {
          t.setTarget(ids.has(t.id), { user: game.user, releaseOthers: false, groupSelection: true });
        });
        exploded = true;

        const n = affectedTargets.length;
        const hitLine = n > 0
          ? `${damage} pts ${meta.label} damage to ${n} target${n !== 1 ? "s" : ""} in blast area.`
          : `No targets in blast area.`;

        resultHtml = `<div style="padding:6px 8px;margin:0 10px 6px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.88em;">
          <div style="font-weight:700;color:#e65100;">MISS — SCATTER (1d10 = ${scatter.roll})</div>
          <div style="color:#555;margin-top:2px;">${item.name} goes wide — lands ${scatter.dirLabel}.</div>
          <div style="color:#555;margin-top:2px;">${hitLine}</div>
        </div>`;
      }
    }

    const ammoNote = buildContentBox(`<strong>${item.name}</strong> thrown — ${newShots} remaining`);

    const cardHtml = buildCardShell({
      actionLabel: "Grenade",
      headerRight: `${item.name} · Agility FEAT`,
      actorHtml: buildActorTargetHtml(actor.name),
      abilityHtml: buildAbilitySection({
        abilityLabel: "Agility",
        abilityRank: ability.rank,
        shiftDisplay,
        rollDisplay,
        resultBadge,
        extraLine: `Range: ${choice.range} area${choice.range !== 1 ? "s" : ""}`
      }),
      sections: [resultHtml, ammoNote]
    });

    // Shake fires on any detonation (hit OR scatter-landing); lost-to-sky = no shake
    const shakeProfile = exploded ? shakeProfileFor(dtCode) : null;
    const shakeFlag = shakeProfile ? { "msh-faserip": { shake: shakeProfile } } : undefined;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: cardHtml,
      ...(shakeFlag ? { flags: shakeFlag } : {})
    });

    // Apply damage to all affected tokens (works for both hit and scatter-landing)
    const isKillingDamage = meta.killing;
    if (exploded && damage > 0 && affectedTargets.length > 0) {
      const dmgResults = await applyDamageToTargets({
        damage,
        targets: affectedTargets,
        attackerUuid: actor.uuid,
        damageType: damageTypeNormalized,
        attackForm: meta.attackForm,
        showNotification: false,
        wasKillResult: isKillingDamage,
        forceKilling: isKillingDamage
      });

      if (dmgResults?.length) {
        const rows = dmgResults.map(r => {
          if (r.net === 0 && r.absorbed > 0) {
            return `<tr><td style="padding:2px 6px;">${r.name}</td><td style="padding:2px 6px;color:#888;">All absorbed by armor</td><td style="padding:2px 6px;color:#888;">${r.hpBefore} → ${r.hpAfter}</td></tr>`;
          }
          const armorNote = r.absorbed > 0 ? ` <span style="color:#888;font-size:.85em;">(${damage} − ${r.absorbed} armor)</span>` : "";
          return `<tr><td style="padding:2px 6px;">${r.name}</td><td style="padding:2px 6px;color:#c62828;font-weight:600;">−${r.net}${armorNote}</td><td style="padding:2px 6px;">${r.hpBefore} → ${r.hpAfter}</td></tr>`;
        }).join("");

        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: buildCardShell({
            actionLabel: "Grenade Damage",
            headerRight: `${damage} pts ${meta.label} — ${dmgResults.length} target${dmgResults.length !== 1 ? "s" : ""}`,
            sections: [`<table style="width:100%;border-collapse:collapse;font-size:.88em;padding:4px 10px;">
              <thead><tr style="border-bottom:1px solid #eee;color:#666;font-size:.82em;">
                <th style="padding:2px 6px;text-align:left;">Target</th>
                <th style="padding:2px 6px;text-align:left;">Damage</th>
                <th style="padding:2px 6px;text-align:left;">Health</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>`]
          })
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INTENSITY PATH — smoke, gas, flash, anything with intensityRank and no damage.
  // Places a persistent Region, attaches an AreaHazard behavior (v14), then runs
  // saves on every token currently inside via behavior.resolveForToken. Future
  // token entries/exits are handled automatically by the Region behavior.
  // ─────────────────────────────────────────────────────────────────────────
  async _executeIntensityGrenade(actor, item) {
    const radiusInAreas = getAreaRadius(item) || 1;
    const intensityRank = getAreaIntensityRank(item);

    if (!intensityRank) {
      ui.notifications.warn(`${item.name} has no intensity rank or damage configured.`);
      return;
    }

    // Ammo check
    const _sr = item.system.shotsRemaining;
    const shotsRemaining = (_sr !== "" && _sr != null)
      ? _sr
      : (item.system.shots !== "" && item.system.shots != null ? item.system.shots : 1);
    if (Number.isFinite(Number(shotsRemaining)) && Number(shotsRemaining) <= 0) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div style="background:#fff;border:1px solid #bbb;border-radius:3px;padding:6px 8px;">
          <b>${actor.name}</b> reaches for a <b>${item.name}</b> — none left.
        </div>`
      });
      return;
    }

    // Per-grenade-type visual — picks a distinct fillColor so smoke, gas,
    // KO gas, and flash each look different on the canvas.
    const visual = resolveHazardVisual(item);

    // Place the persistent Region — cloud/flash/gas lingers on the scene
    const template = await AreaTemplate.createAtTarget({
      radiusInAreas,
      label: item.name,
      fillColor: visual.fillColor,
      fillAlpha: visual.fillAlpha,
      persistent: true
    });
    if (!template) return;

    // Decrement ammo
    const newShots = Math.max(0, Number(shotsRemaining) - 1);
    await item.update({ "system.shotsRemaining": newShots });

    // Attach the AreaHazard behavior to the Region.
    const region = template._doc;
    const config = resolveHazardBehaviorConfig(item);
    // Strip the non-schema `_initialBlast` marker before sending to Foundry —
    // DataModel validation would reject or silently drop unknown fields.
    const { _initialBlast, ...systemConfig } = config;
    let behaviorDoc = null;
    try {
      const [created] = await region.createEmbeddedDocuments("RegionBehavior", [{
        name: config.label,
        type: "areaHazard",
        system: systemConfig
      }]);
      behaviorDoc = created;
    } catch (err) {
      console.error("[FASERIP ERROR] Failed to attach area-hazard behavior:", err);
    }

    // Target everyone visually (red reticles), then fire initial saves.
    // tokenEnter events DON'T fire for tokens already inside at creation time,
    // so we have to resolve them manually via the behavior's public method.
    await template.target();
    const affected = Array.from(game.user.targets);

    // Summary chat card before the per-token saves
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;padding:6px 10px;">
        <div style="color:#8b0000;font-weight:bold;font-size:.85em;text-transform:uppercase;">Area Hazard Placed</div>
        <div><strong>${actor.name}</strong> throws <strong>${item.name}</strong></div>
        <div style="color:#555;font-size:.88em;margin-top:2px;">${config.intensityRank} Intensity · ${affected.length} token${affected.length !== 1 ? "s" : ""} caught in blast · ${newShots} remaining</div>
      </div>`
    });

    // Fallback resolve for tokens already inside. v14 usually fires TOKEN_ENTER
    // for these at behavior creation (behavior dedupes the double call); this
    // loop covers flash (_initialBlast, saveOnEntry false) and any missed fires.
    if (behaviorDoc?.system) {
      const hazard = behaviorDoc.system;
      const initialSaveAll = hazard.saveOnEntry || _initialBlast;
      if (initialSaveAll) {
        // Parallel: each caught token's save (and its karma declaration
        // window, when routed to an owning player) runs simultaneously —
        // serial resolution stacked 10s countdowns per hero. The behavior's
        // synchronous _resolvedTokenIds guard dedupes against v14's
        // TOKEN_ENTER race.
        await Promise.all(affected.map(tok => hazard.resolveForToken(tok.document)));
      }
    }
  }
}

/**
 * Pick the visual fill for an intensity grenade's lingering Drawing overlay.
 * Smoke = gray, tear gas = yellow-green, KO = violet, flash = bright yellow.
 * Returns { fillColor (hex), fillAlpha (0..1) }.
 */
function resolveHazardVisual(item) {
  const grenadeType = String(item?.system?.grenadeType || "").toLowerCase();
  switch (grenadeType) {
    case "smoke":     return { fillColor: "#9e9e9e", fillAlpha: 0.45 };
    case "teargas":
    case "tear-gas":  return { fillColor: "#aed581", fillAlpha: 0.42 };
    case "knockout":
    case "ko":
    case "kogas":     return { fillColor: "#9575cd", fillAlpha: 0.42 };
    case "flash":     return { fillColor: "#fff59d", fillAlpha: 0.55 };
    default:          return { fillColor: "#9e9e9e", fillAlpha: 0.45 };
  }
}

/**
 * Map an intensity-grenade item onto an AreaHazard behavior config.
 * Per-type defaults keep smoke/gas/KO/flash acting per RAW without the user
 * having to set every flag manually on the item.
 *
 * Note: `_initialBlast` is a non-schema marker used only by _executeIntensityGrenade
 * to decide whether to run the caught-in-blast saves (flash saves initial tokens
 * even though its Region's saveOnEntry is false for later entries).
 */
function resolveHazardBehaviorConfig(item) {
  const sys = item.system || {};
  const grenadeType = String(sys.grenadeType || "").toLowerCase();
  const intensityRank = getAreaIntensityRank(item) || "Typical";
  const saveAbility = sys.intensitySaveAbility || sys.save?.ability || "endurance";

  const base = {
    intensityRank,
    intensityEffect: sys.intensityEffect || "",
    saveAbility,
    saveOnEntry: true,
    removeOnExit: true,
    residualRounds: 0,
    label: item.name,
    _initialBlast: true
  };

  switch (grenadeType) {
    case "smoke":
      return { ...base,
        intensityEffect: base.intensityEffect || "blinded",
        removeOnExit: true
      };
    case "teargas":
    case "tearGas".toLowerCase():
      return { ...base,
        intensityEffect: base.intensityEffect || "incapacitated",
        removeOnExit: true,
        residualRounds: 1  // "+1 round after leaving" per RAW
      };
    case "knockout":
    case "ko":
    case "kogas":
      return { ...base,
        intensityEffect: base.intensityEffect || "unconscious",
        removeOnExit: false  // KO persists even after leaving the cloud
      };
    case "flash":
      return { ...base,
        intensityEffect: base.intensityEffect || "blinded",
        saveOnEntry: false,  // flash fires once at detonation, not for late-comers
        removeOnExit: false  // blindness persists on its own bounded timer
      };
    default:
      return base;
  }
}
