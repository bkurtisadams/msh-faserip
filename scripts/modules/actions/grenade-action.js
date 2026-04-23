// scripts/modules/actions/grenade-action.js v3.0.0 - 2026-04-22
// v3.0.0: Major cleanup.
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

import { RangedAttackAction } from "./ranged-attack-action.js";
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
  buildModeSelector,
  setupModeSelector,
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
    const hasKarma       = availableKarma > 0;

    const savedRange = await actor.getFlag("msh-faserip", "lastGrenadeRange") || 1;
    const savedShift = await actor.getFlag("msh-faserip", "lastGrenadeShift") || 0;
    const savedSkip  = (await actor.getFlag("msh-faserip", "skipDiceRoll")) ?? false;

    const { targetDisplay } = getTargetData();

    const effectDesc = `${damage} pts ${meta.label} damage to all in area`;

    const dialogHtml = `
      ${buildModeSelector({ mode: "semi" })}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
          <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Target Area</div>
          <div style="font-weight:600;color:#d32f2f;">${targetDisplay || "Pick landing zone after Throw"}</div>
        </div>
        <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
          <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Throw</div>
          <div style="font-weight:600;">Agility: ${ability.rank} (${ability.value})</div>
          <div style="color:#666;font-size:.85em;">Max range: ${maxRange} areas</div>
        </div>
      </div>

      <div style="background:#fff8e1;border:1px solid #ffc107;border-radius:3px;padding:8px;margin-bottom:8px;">
        <div style="font-weight:700;color:#e65100;">${item.name}</div>
        <div style="color:#555;font-size:.88em;margin-top:2px;">${effectDesc}</div>
        <div style="color:#888;font-size:.82em;margin-top:2px;">White = miss (grenade lost). Green+ = hits target area, affects all in it.</div>
      </div>

      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:6px 8px;border:1px solid #ddd;border-radius:3px;background:#fafafa;">
        <label style="font-weight:600;">Range:</label>
        <input type="number" name="range" value="${savedRange}" min="1" max="${maxRange}" style="width:60px;padding:3px;text-align:center;box-sizing:border-box;">
        <span style="color:#666;font-size:.85em;">areas (max ${maxRange})</span>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;font-size:.9em;">
        <div class="cs-field" style="display:flex;align-items:center;gap:4px;padding:4px 6px;border-radius:3px;border:1px solid transparent;">
          <label style="font-weight:600;">CS:</label>
          <input type="number" name="shift" value="${savedShift}" style="width:35px;padding:3px;text-align:center;box-sizing:border-box;">
          <span style="color:#666;">→</span>
          <strong id="shifted-rank-display">${shiftRank(ability.rank, savedShift)}</strong>
          <button type="button" class="cs-reset" style="visibility:${savedShift !== 0 ? "visible" : "hidden"};padding:1px 5px;font-size:.85em;cursor:pointer;border:1px solid #999;border-radius:2px;background:#eee;" title="Reset to 0">×</button>
        </div>
        <div class="karma-field" style="display:flex;align-items:center;gap:4px;padding:4px 6px;border-radius:3px;${hasKarma ? "background:#e3f2fd;border:1px solid #90caf9;" : ""}">
          ${hasKarma ? `
            <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
              <input type="checkbox" id="spend-karma" name="spendKarma">
              <span style="font-weight:600;">Karma:</span>
            </label>
            <span title="Available: ${availableKarma} | Min commitment: ${minKarma}" style="padding:1px 4px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${availableKarma}</span>
            <span style="color:#999;font-size:.8em;">(min ${minKarma})</span>
          ` : `<span style="color:#999;">No karma</span>`}
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid #ddd;">
        <label><input type="checkbox" name="skipDice" ${savedSkip ? "checked" : ""}> Skip dice</label>
        <span style="font-size:.8em;color:#888;">${shotsRemaining} remaining</span>
      </div>
    `;

    const choice = await new Promise(resolve => {
      new Dialog({
        title: `Grenade: ${actor.name}`,
        content: dialogHtml,
        buttons: {
          roll: {
            label: "Throw",
            callback: async (html) => {
              const $d = sel => html.find(sel);
              const range    = Number($d('[name="range"]').val() || 1);
              const shift    = parseInt($d('[name="shift"]').val() || 0);
              const skipDice = !!$d('[name="skipDice"]').is(":checked");
              const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);

              if (range > maxRange) {
                ui.notifications.error(`Beyond max throwing range (${maxRange} areas).`);
                return resolve(null);
              }

              const rangeModifier = -(Math.max(0, range - 1));
              const totalShift = shift + rangeModifier;

              await actor.setFlag("msh-faserip", "lastGrenadeRange", range);
              await actor.setFlag("msh-faserip", "lastGrenadeShift", shift);

              resolve({ range, shift, totalShift, rangeModifier, skipDice, spendKarma, karma: karmaToSpend });
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll",
        render: async (html) => {
          setupKarmaControlHandlers(html);
          await setupModeSelector(actor, html, this.opts || {}, "lastGrenadeMode");

          html.find('input, select').on('mousedown', (e) => e.stopPropagation());

          const $dialog = html.closest('.dialog');
          if ($dialog.length) $dialog[0].style.height = 'auto';

          const update = () => {
            const cs = parseInt(html.find('[name="shift"]').val()) || 0;
            const shifted = shiftRank(ability.rank, cs);
            const $sr = html.find('#shifted-rank-display');
            const $cf = html.find('.cs-field');
            const $rb = html.find('.cs-reset');
            $sr.text(shifted);
            if (cs < 0)      { $cf.css({ background: "#ffebee", border: "1px solid #ef5350" }); $sr.css("color", "#c62828"); $rb.css("visibility", "visible"); }
            else if (cs > 0) { $cf.css({ background: "#e8f5e9", border: "1px solid #66bb6a" }); $sr.css("color", "#2e7d32"); $rb.css("visibility", "visible"); }
            else             { $cf.css({ background: "",         border: "1px solid transparent" }); $sr.css("color", ""); $rb.css("visibility", "hidden"); }
          };
          html.find('[name="shift"]').on("input change", update);
          html.find('.cs-reset').on("click", e => { e.preventDefault(); html.find('[name="shift"]').val(0).trigger("change"); });
          update();
        }
      }).render(true);
    });

    if (!choice) return;

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

    if (!isHit) {
      resultHtml = `<div style="padding:6px 8px;margin:0 10px 6px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.88em;">
        <div style="font-weight:700;color:#888;">MISS</div>
        <div style="color:#555;">Grenade fails to reach target area. No effect.</div>
      </div>`;
    } else {
      await template.target();
      affectedTargets = Array.from(game.user.targets);

      resultHtml = `<div style="padding:6px 8px;margin:0 10px 6px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.88em;">
        <div style="font-weight:700;color:#e65100;">HIT — ALL IN AREA AFFECTED</div>
        <div style="color:#555;margin-top:2px;">${damage} pts ${meta.label} damage to every target in the area.</div>
      </div>`;
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

    // Resolve shake from damage-type map (null for non-concussive types, but this is the damage path so usually set)
    const shakeProfile = (isHit) ? shakeProfileFor(dtCode) : null;
    const shakeFlag = shakeProfile ? { "msh-faserip": { shake: shakeProfile } } : undefined;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: cardHtml,
      ...(shakeFlag ? { flags: shakeFlag } : {})
    });

    // Apply damage to all affected tokens
    const isKillingDamage = meta.killing;
    if (isHit && damage > 0 && affectedTargets.length > 0) {
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
  // Place a PERSISTENT Region (hazard lingers), target everyone inside, dispatch
  // IntensityAction which already handles per-target FEAT resolution.
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

    // Persistent Region — the cloud/flash lingers on the scene
    const template = await AreaTemplate.createAtTarget({
      radiusInAreas,
      label: item.name,
      fillColor: "#9e9e9e",
      fillAlpha: 0.35,
      persistent: true
    });
    if (!template) return;

    const newShots = Math.max(0, Number(shotsRemaining) - 1);
    await item.update({ "system.shotsRemaining": newShots });

    // Target everyone inside, then dispatch IntensityAction
    await template.target();

    const { IntensityAction } = await import("./intensity-action.js");
    const action = new IntensityAction({
      actor,
      actionType: "intensity",
      abilityName: "endurance",
      opts: {
        itemId: item.id,
        item,
        sourceItem: item,
        equipment: item
      }
    });
    return action.execute();
  }
}
