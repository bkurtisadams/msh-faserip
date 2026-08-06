// scripts/modules/actions/grappling-action.js v3.3.2 - 2026-08-04
// v3.3.2: Warn on silent hold-apply skips: Partial/Full result with no
//         targetUuid (untargeted token, name typed in dialog) or an
//         unresolvable target uuid now raises ui.notifications.warn
//         instead of applying nothing without feedback.
// scripts/modules/actions/grappling-action.js v3.3.1 - 2026-05-24
// v3.3.1: Drop the STR-contest third cell (grappling is a one-roll FEAT, not
//         an opposed contest). Third cell reverts to DAMAGE (the Full-Hold
//         damage cap; em-dash otherwise); meta label reverts to Range:adjacent.
//         The Partial-Hold movement note keeps the Strength comparison per RAW.
// scripts/modules/actions/grappling-action.js v3.3.0 - 2026-05-23
// v3.3.0: Render the chat card on the shared attack-card.hbs shell. The third
//         cell becomes a STR-vs-STR contest (raw Strength, per RAW) in place of
//         DAMAGE; effect detail moves to the notes slot, buttons unchanged.
//         _buildChatCard is now async (awaits renderTemplate).
// scripts/modules/actions/grappling-action.js v3.2.1 - 2026-05-23
// v3.2.1: CS Reason now reaches the card (was discarded — choice resolved
//         with csNotes:"") and persists across reopens (lastGrappleReason,
//         gated by Remember), matching the other attack dialogs.
// scripts/modules/actions/grappling-action.js v3.2.0 - 2026-03-17
// v3.2.0: Footer reordered: [Roll] [Cancel] ... [Remember] [Skip dice].
// v3.1.0: Manual CS only — remove talent chips, sit-tags, auto-detection.
//         CS row is manual input + ? reference panel via cs-modifiers.js.
//         Simpler dialog, no activeChips persistence, no talentFlags.
// v3.0.0: Port to v3 compact dialog layout matching blunt/edged/shooting/energy/force
// v2.4.0: Consistency fixes — replace local rankValues with game.msh.getRankValue
// v2.3.0: Add support for weapon-based grappling (whips with GP damage type)
// v2.2.0: Add opts.prefill support for Grapple Back from escape reverse
// v2.1.0: Add Deal Hold Damage chip on Full Hold (red) result
// v2.0.0: Compact chat card format matching blunt attack
// v1.2.0: Use effect-engine wrappers for Partial Hold/Full Hold effects
import { AttackAction } from "./attack-action.js";
import {
  RANKS,
  getStrengthInfo, 
  shiftRank, 
  rollWithKarmaAndHistory,
  buildActionsBox,
  bannerColors, 
  labelFor, 
  effectsFor,
  applyCapabilitiesToDialog,
  showDiceAnimation,
  buildModeSelector,
  setupModeSelector,
  getTargetData,
  getBodyArmorValues
} from "./action-utils.js";
import { setupKarmaControlHandlers, extractKarmaFromDialog, getAvailableKarma, getMinimumKarmaCommitment } from "../dice/dice-roller.js";
import { applyGrappled, applyHeld } from "../effects/effect-engine.js";
import { getAttackShiftBreakdown, getDefenseShiftBreakdown } from "../effects/effect-modifiers.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";
import { buildCSRow, wireCSPanel } from "./cs-modifiers.js";

import { showFaseripDialog } from "./dialog-shim.js";
export class GrapplingAction extends AttackAction {
  constructor(args) {
    super(args);
    this.actionType = "grappling";
    this.label = labelFor(this.actionType);
    this.effects = effectsFor(this.actionType);
  }

  async execute() {
    const actor = this.actor;
    const actionName = this.label;
    
    // Check if a weapon was passed (e.g., whip with GP damage type)
    const passedItem = this.opts?.item || this.opts?.sourceItem || this.opts?.equipment || null;
    const isWeaponGrapple = passedItem?.type === "equipment" && 
                            passedItem?.system?.damageType?.toUpperCase() === "GP";
    const isPowerGrapple = passedItem?.type === "power";
    
    // For weapon grapples, use material strength; otherwise use actor's Strength
    let strength;
    let strengthSource;
    if (isWeaponGrapple) {
      const materialRank = passedItem.system?.materialStrength || "Typical";
      strength = {
        rank: materialRank,
        value: game.msh.getRankValue(materialRank) || 6
      };
      strengthSource = passedItem.name;
    } else if (isPowerGrapple) {
      const powerRank = passedItem.system?.materialStrength
        || passedItem.system?.rank
        || "Typical";
      strength = {
        rank: powerRank,
        value: game.msh.getRankValue(powerRank) || 6
      };
      strengthSource = passedItem.name;
    } else {
      strength = getStrengthInfo(actor);
      strengthSource = "Strength";
    }

    // Load persisted defaults
    const savedShift = await actor.getFlag("msh-faserip", "lastGrappleShift") ?? 0;
    const savedRemember = (await actor.getFlag("msh-faserip", "lastGrappleRemember")) ?? false;
    const savedSkipDice = (await actor.getFlag("msh-faserip", "lastGrappleSkipDice")) ?? false;
    const savedReason = (await actor.getFlag("msh-faserip", "lastGrappleReason")) ?? "";

    // Only apply saved shift if Remember was explicitly checked last time
    const optsShift = this.opts?.shift;
    const dialogShift = (optsShift !== undefined && optsShift !== null && optsShift !== 0) 
      ? optsShift 
      : (savedRemember ? savedShift : 0);
    const dialogReason = savedRemember ? savedReason : "";

    const choice = await this._showGrapplingDialog(actor, strength, { 
      savedShift: dialogShift, 
      savedReason: dialogReason,
      savedRemember, 
      savedSkipDice,
      isWeaponGrapple,
      isPowerGrapple,
      weaponName: (isWeaponGrapple || isPowerGrapple) ? passedItem.name : null,
      strengthSource
    });
    if (!choice) return;

    // Save prefs
    await actor.setFlag("msh-faserip", "lastGrappleRemember", choice.remember);
    await actor.setFlag("msh-faserip", "lastGrappleSkipDice", choice.skipDice);
    if (choice.remember) {
      await actor.setFlag("msh-faserip", "lastGrappleShift", choice.manualCS);
      await actor.setFlag("msh-faserip", "lastGrappleReason", choice.reason || "");
    }

    // Build shift breakdown for hover text
    const shiftBreakdown = {
      manual: choice.shift || 0,
      csNotes: choice.csNotes || ""
    };

    // Get effect-based modifiers
    const attackerEffects = getAttackShiftBreakdown(actor);
    let targetActor = null;
    let defenderEffects = { total: 0, breakdown: [] };
    
    if (choice.targetUuid) {
      try {
        const tDoc = await fromUuid(choice.targetUuid);
        targetActor = tDoc?.actor ?? (tDoc?.documentName === "Actor" ? tDoc : null);
        if (targetActor) {
          defenderEffects = getDefenseShiftBreakdown(targetActor, false);
        }
      } catch (_e) { /* ignore */ }
    }

    // Calculate total shift including effects
    const manualShift = choice.shift || 0;
    const effectShift = (attackerEffects.total || 0) - (defenderEffects.total || 0);
    const totalShift = manualShift + effectShift;

    const effectiveRank = shiftRank(strength.rank, totalShift);

    // Check consolidated chat card setting
    let useConsolidated = false;
    try {
      useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
    } catch (_e) { /* setting not registered yet */ }

    const roll = await (new Roll("1d100")).evaluate();
    
    // Show dice animation
    if (!choice.skipDice) {
      await showDiceAnimation(roll, actor, `${actor.name} attempts to Grapple ${choice.targetName}`, useConsolidated);
    }

    const { cappedTotal, totalKarmaUsed } =
        await rollWithKarmaAndHistory(actor, actionName, 0, roll, { spendKarma: choice.spendKarma, rank: effectiveRank, inlineRoll: useConsolidated });

    const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    const colorLower = String(color || "").toLowerCase();
    const effect = this.effects[colorLower] || "Miss";
    const { bg, fg } = bannerColors(colorLower);

    // Show escape button for Partial Hold and Hold results
    const showEscape = (colorLower === "yellow" || colorLower === "red");
    if (showEscape && !choice?.targetUuid) {
      ui.notifications?.warn?.(`Grapple ${effect} not applied — no targeted token (card name came from the dialog field).`);
    }
    if (showEscape && choice?.targetUuid) {
      try {
        const tDoc = await fromUuid(choice.targetUuid);
        const tActor = tDoc?.actor ?? (tDoc?.documentName === "Actor" ? tDoc : null);
        if (!tActor) {
          ui.notifications?.warn?.(`Grapple ${effect} not applied — target could not be resolved from ${choice.targetUuid}.`);
        }
        if (tActor) {
          // Remove any existing hold effects
          const existingHolds = tActor.effects?.filter(e => 
            e.statuses?.has?.("grappled") || 
            e.statuses?.has?.("held") ||
            e.statuses?.has?.("partial-hold") ||
            e.statuses?.has?.("full-hold")
          );
          if (existingHolds?.length) {
            const { canWriteEffectsOn } = await import("../effects/effect-engine.js");
            if (canWriteEffectsOn(tActor)) {
              for (const eff of existingHolds) {
                await eff.delete();
              }
            } else {
              try {
                const { executeAsGM } = await import("../../gm-utils.js");
                await executeAsGM("deleteActiveEffects", {
                  targetActorUuid: tActor.uuid,
                  effectIds: existingHolds.map(e => e.id)
                });
              } catch (err) {
                console.error("[FASERIP] Grapple: GM hold-cleanup delete failed", err);
              }
            }
          }
          
          // Apply appropriate hold effect using effect-engine
          if (colorLower === "yellow") {
            await applyGrappled(tActor, { 
              holderUuid: actor.uuid, 
              holderName: actor.name,
              rounds: null
            });
          } else {
            await applyHeld(tActor, { 
              holderUuid: actor.uuid, 
              holderName: actor.name,
              rounds: null
            });
          }
        }
      } catch (e) {
        console.warn("[FASERIP WARN] Grappling hold status failed", e);
      }
    }
    
    // For the escape button, the "defender" is the HOLDER (this actor)
    const holderStrength = actor.system?.abilities?.strength?.rank || "Good";
    
    // Show Hold Damage button only on Full Hold (red)
    const showHoldDamage = (colorLower === "red");
    
    const actions = buildActionsBox({
      showEscape: showEscape,
      showHoldDamage: showHoldDamage,
      holdDamageMax: strength.value,
      holdDamageRank: strength.rank,
      holdTargetUuid: choice.targetUuid || "",
      holdTargetName: choice.targetName || "Target",
      targetUuid: actor.uuid,
      targetName: actor.name,
      targetStrength: holderStrength,
      actorUuid: actor.uuid,
      autoApply: !!this.opts?.autoApply,
    });

    const cardHtml = await this._buildChatCard({
      actor, 
      choice, 
      strength, 
      effectiveRank, 
      roll, 
      totalKarmaUsed, 
      cappedTotal, 
      color, 
      effect,
      bg, 
      fg,
      actions,
      totalShift,
      shiftBreakdown,
      attackerEffects: attackerEffects.breakdown,
      defenderEffects: defenderEffects.breakdown
    });

    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: cardHtml });

    return { roll, color, effectiveRank, cappedTotal, totalKarmaUsed };
  }

  async _showGrapplingDialog(actor, strength, { savedShift = 0, savedRemember = false, savedSkipDice = false, savedReason = "", isWeaponGrapple = false, isPowerGrapple = false, weaponName = null, strengthSource = "Strength" } = {}) {
    // ── Target data ──
    let prefillTargetName = this.opts?.prefill?.targetName || "";
    let prefillTargetStr  = this.opts?.prefill?.targetStrength || "";
    let prefillTargetUuid = this.opts?.prefill?.targetUuid || "";

    if (!prefillTargetName) {
      const targets = Array.from(game.user?.targets ?? []);
      if (targets.length === 1) {
        const tok = targets[0];
        prefillTargetName = tok?.name || "";
        prefillTargetStr  = tok?.actor?.system?.abilities?.strength?.rank || "";
        prefillTargetUuid = tok?.actor?.uuid || "";
      }
    }

    const { targets, primaryTarget, primaryTargetActor, targetDisplay } = getTargetData();
    const targetHealth = primaryTargetActor?.system?.attributes?.health;
    const targetHealthStr = targetHealth ? `${targetHealth.value}/${targetHealth.max}` : "";
    const targetStrRank = primaryTargetActor?.system?.abilities?.strength?.rank || prefillTargetStr;
    const targetStrAbbr = targetStrRank ? (RANK_ABBR[targetStrRank] || targetStrRank) : "";
    const targetStrVal = targetStrRank ? (game.msh.getRankValue(targetStrRank) || 0) : "";
    const targetEffects = (primaryTargetActor?.effects?.filter(e => !e.disabled) ?? [])
      .filter(e => {
        const n = (e.name || e.label || '').toLowerCase();
        return !n.includes('body armor') && !n.includes('force field');
      });
    const targetStatusStr = targetEffects.length > 0
      ? targetEffects.map(e => e.name || e.label).join(", ")
      : "";

    // ── Dialog title and ability ──
    const dialogTitle = "Grappling";
    const abilityLabel = isWeaponGrapple ? `${weaponName} (Material)` : "Base Strength";
    const strengthAbbr = RANK_ABBR[strength.rank] || strength.rank;

    // ── Karma ──
    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);
    const hasKarma = availableKarma > 0;

    // Build CS row via shared utility (manual input + ? reference)
    const csRowHtml = buildCSRow({
      savedCS: savedShift,
      savedReason,
      abilityRank: strength.rank
    });

    // Store target str from token for resolve
    const resolvedTargetStr = targetStrRank || prefillTargetStr;

    // ── Dialog HTML — v3.1 Compact Layout ──
    const dialogHtml = `
    <div class="frp-dlg">

      <!-- Header: Actor (Base Strength / Rank Value) attacks Target -->
      <div class="frp-header-v3">
        <span class="h-actor" title="${actor.name}">${actor.name}</span>
        <span class="h-paren">(</span>
        <span class="h-stat">
          <span class="h-stat-label">${abilityLabel}:</span>
          <span class="h-stat-rank">${strengthAbbr} ${strength.value}</span>
        </span>
        <span class="h-paren">)</span>
        ${targetDisplay
          ? `<span class="h-verb">grapples</span><span class="h-target" title="${targetDisplay}">${targetDisplay}</span>`
          : ''}
      </div>

      <!-- Target compact line -->
      ${primaryTarget ? `
      <div class="frp-target-compact">
        ${targetHealthStr ? `<span class="t-hp">HP: ${targetHealthStr}</span>` : ''}
        ${targetStatusStr ? `<span class="t-status">${targetStatusStr}</span>` : ''}
        ${targetStrRank ? `<span class="t-armor">STR: ${targetStrAbbr} ${targetStrVal}</span>` : ''}
      </div>
      ` : `
      <div class="frp-target-compact">
        <span class="t-none">No target selected</span>
        <input type="text" name="targetName" value="${prefillTargetName}" placeholder="Target name" style="flex:1;font-size:12px;padding:2px 4px;border:1px solid #ccc;border-radius:2px;">
      </div>
      `}

      <!-- CS row (manual input + ? reference) -->
      ${csRowHtml}

      <!-- Grapple info box (blue) -->
      <div class="frp-box" style="background:#f0f4ff;border-color:#90caf9;padding:3px 8px;">
        <div style="display:flex;align-items:baseline;gap:8px;font-size:13px;color:#444;">
          <span style="font-size:11px;color:#777;text-transform:uppercase;letter-spacing:0.3px;font-weight:600;">Grapple with</span>
          <span style="font-family:'Oswald',sans-serif;font-weight:700;font-size:16px;color:#1a1a1a;">${strengthSource}: ${strengthAbbr} ${strength.value}</span>
          ${isWeaponGrapple ? `<span style="font-size:11px;color:#6a1b9a;">weapon material</span>` : ''}
          ${isPowerGrapple ? `<span style="font-size:11px;color:#1565c0;">power rank</span>` : ''}
          <span style="margin-left:auto;font-size:12px;color:#777;">Hold dmg: ${strength.value}</span>
        </div>
      </div>

      <!-- Options: Karma -->
      <div class="frp-box frp-opts-box">
        <div class="frp-opt-row${!hasKarma ? ' inactive' : hasKarma ? ' inactive' : ''}">
          ${hasKarma ? `
            <label><input type="checkbox" id="spend-karma" name="spendKarma"> <span class="frp-opt-label blue">Karma</span></label>
            <span class="frp-karma-pool"><strong>${availableKarma}</strong> avail (min ${minKarma})</span>
          ` : `<span style="font-size:12px;color:#999;">No karma available</span>`}
        </div>
      </div>

      <!-- Effect preview grid -->
      <div class="frp-fx-grid">
        <div class="frp-fx-cell w">Miss<br><span style="font-size:9px;font-weight:400;opacity:0.7;">no other atk</span></div>
        <div class="frp-fx-cell g">Miss<br><span style="font-size:9px;font-weight:400;opacity:0.7;">no other atk</span></div>
        <div class="frp-fx-cell y">Partial<br><span style="font-size:9px;font-weight:400;opacity:0.7;">-2CS, no move</span></div>
        <div class="frp-fx-cell r">Full Hold<br><span style="font-size:9px;font-weight:400;opacity:0.7;">restrained</span></div>
      </div>

      <!-- Footer: checkboxes + buttons on one row -->
      <div class="frp-foot">
        <div class="frp-foot-btns">
          <button type="button" class="frp-btn-roll" id="frp-roll">Roll</button>
          <button type="button" class="frp-btn-cancel" id="frp-cancel">Cancel</button>
        </div>
        <div class="frp-foot-checks">
          <label><input type="checkbox" name="remember" ${savedRemember ? 'checked' : ''}> Remember</label>
          <label><input type="checkbox" name="skipDice" ${savedSkipDice ? 'checked' : ''}> Skip dice</label>
        </div>
      </div>

    </div>
    `;

    return new Promise((resolve) => {
      let _resolved = false;
      let _csState = null;
      showFaseripDialog({
        title: dialogTitle,
        content: dialogHtml,
        render: async (html, dlg) => {
          setupKarmaControlHandlers(html);
          const $dialog = html.closest('.dialog');

          // Hide Foundry's native button row
          $dialog.find('.dialog-buttons').hide();

          // Inject mode buttons into the titlebar
          const $titlebar = $dialog.find('.window-title, .dialog-title').first();
          if ($titlebar.length) {
            const modeHtml = buildModeSelector({ mode: "semi" });
            const $modeWrap = $('<span class="frp-titlebar-mode"></span>').append(modeHtml);
            $titlebar.after($modeWrap);
          }
          await setupModeSelector(actor, $dialog, this.opts || {}, "lastGrapplingMode");

          // Set dialog width
          if ($dialog.length) {
            $dialog.css('width', '360px');
            $dialog[0].style.height = 'auto';
          }

          // ── Wire CS panel from shared utility ──
          _csState = wireCSPanel(html, {
            abilityRank: strength.rank,
            onUpdate: () => {
              if ($dialog.length) $dialog[0].style.height = 'auto';
            }
          });

          // Auto-focus Roll button for keyboard Enter and focus ring
          html.find('#frp-roll').focus();

          // Intercept Enter key — trigger Roll instead of Foundry's native submit
          $dialog.on('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              html.find('#frp-roll').trigger('click');
            }
          });

          // ── Roll button handler ──
          html.find('#frp-roll').on('click', async () => {
            const $dlg = (s) => html.find(s);
            const { spendKarma } = extractKarmaFromDialog(html);

            // Get CS from shared panel
            const csData = _csState ? _csState.get() : { totalShift: 0, manualCS: 0, rangePenalty: 0, csNotes: "" };
            const shift = csData.totalShift;
            const manualCS = csData.manualCS;

            const rememberSettings = !!$dlg('[name="remember"]').is(':checked');
            const skipDice = !!$dlg('[name="skipDice"]').is(':checked');

            _resolved = true;
            resolve({
              targetName:     primaryTarget?.name || String($dlg('[name="targetName"]').val() || prefillTargetName || "Target"),
              targetStrength: resolvedTargetStr,
              targetUuid:     primaryTargetActor?.uuid || prefillTargetUuid,
              shift,
              manualCS,
              csNotes: csData.csNotes,
              reason: csData.reason,
              spendKarma,
              remember: rememberSettings,
              skipDice
            });
            dlg.close();
          });

          // ── Cancel button handler ──
          html.find('#frp-cancel').on('click', () => {
            _resolved = true;
            resolve(null);
            dlg.close();
          });

          // Karma toggle — inactive styling
          html.find('#spend-karma').on('change', function() {
            $(this).closest('.frp-opt-row').toggleClass('inactive', !this.checked);
          });

          applyCapabilitiesToDialog(html, "grappling", { actor });
        },
        close: () => {
          if (_csState) _csState.destroy();
          if (!_resolved) resolve(null);
        }
      });
    });
  }

  async _buildChatCard({ actor, choice, strength, effectiveRank, roll, totalKarmaUsed, cappedTotal, color, effect, bg, fg, actions, totalShift, shiftBreakdown, attackerEffects = [], defenderEffects = [] }) {
    const effectLower = String(effect).toLowerCase();

    // Effective-rank tooltip (the CS breakdown the FEAT was read against)
    let effRankTooltip = `Strength ${strength.rank}`;
    if (totalShift !== 0) {
      const parts = [];
      if (shiftBreakdown?.manual && shiftBreakdown.manual !== 0) {
        parts.push(shiftBreakdown.csNotes || `${shiftBreakdown.manual > 0 ? '+' : ''}${shiftBreakdown.manual}`);
      }
      for (const eff of attackerEffects) parts.push(`${eff.shift > 0 ? '+' : ''}${eff.shift} ${eff.name}`);
      for (const eff of defenderEffects) parts.push(`${eff.shift > 0 ? '-' : '+'}${Math.abs(eff.shift)} ${eff.name}`);
      const breakdownText = parts.length > 0 ? parts.join(', ') : `${totalShift > 0 ? '+' : ''}${totalShift} total`;
      effRankTooltip = `${breakdownText} → ${effectiveRank}`;
    }

    // Roll cell
    const rollNum = totalKarmaUsed ? cappedTotal : roll.total;
    const rollTooltip = totalKarmaUsed
      ? `d100 = ${roll.total} + ${totalKarmaUsed} karma = ${cappedTotal}`
      : `d100 = ${roll.total}`;

    // Hold damage — only a Full Hold allows damage (up to the attacker's
    // Strength, applied via the Deal Hold Damage button); the roll deals none.
    const dmgValue = effectLower === "hold" ? strength.value : "—";
    const dmgTooltip = effectLower === "hold"
      ? `Up to ${strength.rank} (${strength.value}) — apply via Deal Hold Damage`
      : "Grappling inflicts no damage on this result";

    // Notes (neutral white — the banner now carries the result colour)
    const partialMovement = choice.targetStrength
      ? this._compareRanks(strength.rank, choice.targetStrength) >= 0
        ? `<div style="color:#f57f17;font-weight:bold;">Target cannot move (STR ${strength.rank} ≥ ${choice.targetStrength})</div>`
        : `<div>Target can still move (STR ${strength.rank} &lt; ${choice.targetStrength})</div>`
      : `<div style="color:#666;font-style:italic;">Movement restriction depends on relative Strength</div>`;

    const effectBlocks = {
      miss: `<div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
          <div style="font-weight:bold;color:#555;">Miss</div>
          <div>No hold established. ${actor.name} may not make other attacks this round.</div>
        </div>`,
      partial: `<div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
          <div style="font-weight:bold;color:#555;">Partial Hold</div>
          <div>Target acts at -2 CS; no damage inflicted.</div>
          ${partialMovement}
        </div>`,
      hold: `<div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
          <div style="font-weight:bold;color:#555;">Full Hold</div>
          <div>Target fully restrained; cannot act. You may perform one additional action.</div>
          <div><strong>May inflict up to ${strength.rank} (${strength.value}) damage</strong> (subject to Body Armor).</div>
        </div>`
    };

    const cardData = {
      actionLabel: "GRAPPLING",
      formClass: "grappling",
      weaponName: "",
      indicatorHtml: `<span style="color:#888;font-size:12px;">Strength FEAT</span>`,
      hasTarget: !!choice.targetName,
      targetName: choice.targetName || "",
      rangeText: "adjacent",
      badgesHtml: "",
      resultBg: bg,
      resultFg: fg,
      resultText: `${String(color).toUpperCase()} — ${String(effect).toUpperCase()}`,
      rollNum,
      rollTooltip,
      abilityLabelUpper: "STRENGTH",
      effRankValue: effectiveRank,
      effRankTooltip,
      dmgValue,
      dmgTooltip,
      notesHtml: effectBlocks[effectLower] || "",
      consequenceHtml: "",
      actionsHtml: actions,
      manualNoticeHtml: ""
    };

    return await foundry.applications.handlebars.renderTemplate(
      "systems/msh-faserip/templates/chat/attack-card.hbs",
      cardData
    );
  }

  _compareRanks(a, b) {
    const R = ["Shift-0","Feeble","Poor","Typical","Good","Excellent","Remarkable","Incredible","Amazing","Monstrous","Unearthly","Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000","Beyond"];
    return Math.sign(R.indexOf(a) - R.indexOf(b));
  }
}