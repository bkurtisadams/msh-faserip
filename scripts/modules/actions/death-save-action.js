// scripts/modules/actions/death-save-action.js v1.3.1 - 2025-12-24
// v1.3.1: Fix structure - Death Save is outer card, Kill Check is collapsible inside
//         - Roll number has hover text showing what was rolled
// v1.3.0: Dialog and chat card redesign matching slam/stun check style
//         - Two-column Character/Endurance info grid in dialog
//         - Dynamic CS field with directional coloring and reset button
// v1.2.0: Change unconscious duration from "d10 + cap" to configurable die (stunDurationDie setting)
// v1.1.0: Fix DiceSoNice animation in consolidated chat cards mode
import { BaseAction } from "./base-action.js";
import {
  RANKS,
  shiftRank,
  getAbilityInfo,
  showDiceAnimation,
} from "./action-utils.js";
import { resolveKillFeat, KILL_CONTEXTS, getKillContextFromAttackForm } from "../../rules/kill-resolver.js";
import { rollUniversalTable } from "../dice/universal-table.js";
import { applyDying } from "../effects/effect-engine.js";

export class DeathSaveAction extends BaseAction {
  constructor(a) {
    if (!a || typeof a !== "object") throw new Error("DeathSaveAction requires a config object.");
    const { actor, abilityName = "endurance", opts = {} } = a;
    super({ actor, abilityName, opts });
  }

  async execute() {
    const actor = this.actor;
    const endurance = getAbilityInfo(actor, "endurance");

    console.log("[FASERIP DEBUG] DeathSaveAction.execute() called", {
      actorName: actor.name,
      autoApply: this?.opts?.autoApply,
      opts: this.opts
    });

    // Get attack form from opts for E/S context (passed from applyDamageToTargets)
    const attackForm = this.opts?.attackForm || "";
    
    // Determine kill context based on attack form
    // If we know the attack form, use it; otherwise default to ZERO_HEALTH
    const killContext = attackForm 
      ? getKillContextFromAttackForm(attackForm)
      : KILL_CONTEXTS.ZERO_HEALTH;

    // Add clear debug statement at the start
    console.log(`🎲 DEATH SAVE | ${actor.name} rolling Endurance FEAT (${endurance.rank} rank) vs Kill table`, {
      attackForm,
      killContext
    });

    // --- AUTO MODE FAST-PATH: Full Auto skips dialog & rolls immediately ---
    if (this?.opts?.autoApply === true) {
      console.log("[FASERIP DEBUG] Death Save AUTO MODE - entering fast path");
      
      const endurance = {
        rank: actor.system?.abilities?.endurance?.rank || "Good",
        value: actor.system?.abilities?.endurance?.value || 8
      };
      const effectiveRank = shiftRank(endurance.rank, Number(this.opts?.featCs ?? 0));

      const roll = await (new Roll("1d100")).evaluate();
      const cappedTotal = Math.min(100, roll.total);

      const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
      const colorLower = String(color).toLowerCase();
      
      // Roll unconscious duration using configurable die
      const stunDie = game.settings.get('msh-faserip', 'stunDurationDie') || "d10";
      const durationRoll = await (new Roll(`1${stunDie}`)).evaluate();
      const unconsciousDuration = durationRoll.total;

      // Use Kill resolver with proper context (E/S aware)
      const killResult = resolveKillFeat(colorLower, killContext);
      const isDying = (killResult.outcome === "EnduranceLoss");

      console.log(`[FASERIP DEBUG] DEATH SAVE AUTO | ${actor.name} result: ${color.toUpperCase()} - ${killResult.label}`, {
        isDying,
        context: killContext
      });

      // Build Kill Check collapsible section (inside Death Save card)
      const killColors = isDying 
        ? { bg: "#8B0000", fg: "#fff", icon: "&#x1F480;" }
        : { bg: "#1565c0", fg: "#fff", icon: "&#x1F4A4;" };
      
      const killSummaryText = isDying 
        ? `Kill Check - DYING (Endurance Loss)`
        : `Kill Check - Stunned`;
      
      const killDetailContent = isDying ? `
        <div style="padding:8px;font-size:.9em;">
          <div>Losing 1 Endurance rank per turn until stabilized.</div>
        </div>
      ` : `
        <div style="padding:8px;font-size:.9em;">
          <div>No Endurance loss - character will recover.</div>
        </div>
      `;
      
      const killRollInfo = `
        <div style="padding:4px 8px;font-size:.85em;color:#555;border-top:1px solid rgba(0,0,0,.1);">
          Endurance: ${effectiveRank}${this.opts?.featCs ? ` (${this.opts.featCs > 0 ? '+' : ''}${this.opts.featCs}CS)` : ''} | Roll: <span title="d100 vs ${effectiveRank} Endurance (Kill column)" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${roll.total}</span> | Result: <strong style="text-transform:capitalize;">${colorLower}</strong>
        </div>`;
      
      const killCheckSection = `
        <details class="faserip-check-section kill-check-section" style="margin:6px 10px 8px;border:1px solid ${killColors.bg};border-radius:4px;overflow:hidden;">
          <summary style="padding:6px 10px;background:${killColors.bg};color:${killColors.fg};cursor:pointer;font-weight:600;font-size:.9em;list-style:none;display:flex;align-items:center;gap:6px;">
            <span style="font-size:1.1em;">${killColors.icon}</span>
            <span>${killSummaryText}</span>
            <span style="margin-left:auto;font-size:.8em;opacity:.8;">&#9660;</span>
          </summary>
          <div style="background:#fff;">
            ${killDetailContent}
            ${killRollInfo}
          </div>
        </details>`;

      console.log("[FASERIP DEBUG] AUTO killCheckSection built:", killCheckSection.substring(0, 100) + "...");

      const resultHtml = `
        <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
          <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
            <strong>${actor.name} - Death Save</strong>
          </div>
          <div style="padding:8px 10px;font-size:.9em;">
            <div><strong>Endurance:</strong> ${endurance.rank} (${endurance.value})</div>
            <div><strong>Unconscious:</strong> ${unconsciousDuration} round${unconsciousDuration !== 1 ? 's' : ''}</div>
            <div style="margin-top:6px;padding:6px;border-radius:3px;background:${isDying ? '#ffebee' : '#e3f2fd'};border:1px solid ${isDying ? '#ef5350' : '#90caf9'};">
              <strong style="color:${isDying ? '#c62828' : '#1565c0'};">${isDying ? 'DYING' : 'STUNNED'}</strong>
            </div>
          </div>
          ${killCheckSection}
        </div>
      `;
      
      console.log("[FASERIP DEBUG] AUTO resultHtml includes killCheckSection:", resultHtml.includes("kill-check-section"));
      console.log("[FASERIP DEBUG] AUTO About to create SINGLE ChatMessage");
      
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: resultHtml });
      
      console.log("[FASERIP DEBUG] AUTO Death Save ChatMessage created - this should be the ONLY card");

      // Always create unconscious effect when at 0 HP
      await this._createStunnedEffect(actor, unconsciousDuration);

      // If dying, ALSO create dying effect
      if (isDying) {
        await this._createDyingEffect(actor, endurance, unconsciousDuration);
      }
      
      return; // <- skip dialog path
    }
    // --- END AUTO MODE FAST-PATH ---

    // Determine if E/S context applies (for dialog display)
    const isEdgedOrShooting = (killContext === KILL_CONTEXTS.EDGED_MELEE || killContext === KILL_CONTEXTS.SHOOTING);

    // Simple dialog - compact style matching slam/stun checks
    const dialogHtml = `
      <div class="frp-dialog" style="min-width:380px;">
        <!-- Header Banner -->
        <div style="background:#ffebee;border:1px solid #ef5350;border-radius:3px;padding:10px;margin-bottom:8px;">
          <div style="font-weight:bold;color:#c62828;font-size:1.1em;">Death Save</div>
          <div style="font-size:.85em;color:#666;margin-top:4px;">
            Character has reached 0 Health. Roll Endurance FEAT vs Kill column.
          </div>
        </div>

        <!-- Character Info -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
          <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
            <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Character</div>
            <div style="font-weight:600;color:#c62828;">${actor.name}</div>
          </div>
          <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
            <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Endurance</div>
            <div style="font-weight:600;">${endurance.rank}</div>
            <div style="color:#666;">Rank Value: ${endurance.value}</div>
          </div>
        </div>

        <!-- Attack Context (if applicable) -->
        ${attackForm ? `
          <div style="padding:6px 8px;margin-bottom:8px;border-radius:3px;${isEdgedOrShooting ? 'background:#ffebee;border:1px solid #ef5350;' : 'background:#e3f2fd;border:1px solid #90caf9;'}">
            <span style="font-weight:600;">Attack Type:</span> ${attackForm}
            ${isEdgedOrShooting 
              ? `<span style="color:#c62828;margin-left:8px;">⚠️ E/S: Green = Dying</span>` 
              : `<span style="color:#1565c0;margin-left:8px;">Green = Stunned only</span>`}
          </div>
        ` : ''}

        <!-- Column Shift -->
        <div class="cs-field" style="display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:8px;border-radius:3px;border:1px solid transparent;">
          <label style="font-weight:600;">Column Shift:</label>
          <input type="number" name="shift" value="0" style="width:50px;padding:4px;text-align:center;">
          <span style="color:#666;">→</span>
          <strong id="shifted-rank-display">${endurance.rank}</strong>
          <button type="button" class="cs-reset" style="visibility:hidden;padding:1px 5px;font-size:.85em;cursor:pointer;border:1px solid #999;border-radius:2px;background:#eee;" title="Reset to 0">×</button>
        </div>

        <!-- Possible Results -->
        <div style="padding:8px;background:#fff3e0;border:1px solid #ffcc80;border-radius:3px;margin-bottom:8px;font-size:.9em;">
          <div style="font-weight:600;margin-bottom:4px;">Possible Results:</div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px;">
            <span style="color:#333;font-weight:600;">White:</span><span>Endurance Loss (Dying)</span>
            <span style="color:#4caf50;font-weight:600;">Green:</span><span>${isEdgedOrShooting ? 'Endurance Loss (E/S)' : 'Stunned'}</span>
            <span style="color:#f57f17;font-weight:600;">Yellow:</span><span>Stunned</span>
            <span style="color:#c62828;font-weight:600;">Red:</span><span>Stunned</span>
          </div>
        </div>

        <!-- Footer -->
        <div style="display:flex;justify-content:flex-end;padding-top:8px;border-top:1px solid #ddd;">
          <label><input type="checkbox" name="skipDice"> Skip dice animation</label>
        </div>
      </div>
    `;

    const choice = await new Promise((resolve) => {
      new Dialog({
        title: `Death Save: ${actor.name}`,
        content: dialogHtml,
        buttons: {
          roll: {
            label: "Roll Death Save",
            callback: (html) => {
              const $ = (sel) => html.find(sel);
              resolve({
                shift: Number($('[name="shift"]').val() || 0),
                skipDice: !!$('[name="skipDice"]').is(':checked'),
              });
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll",
        render: (html) => {
          // CS field dynamic highlighting
          const updateCS = () => {
            const cs = parseInt(html.find('[name="shift"]').val()) || 0;
            const shiftedRank = shiftRank(endurance.rank, cs);
            const $shiftedRank = html.find('#shifted-rank-display');
            const $csField = html.find('.cs-field');
            const $resetBtn = html.find('.cs-reset');
            
            $shiftedRank.text(shiftedRank);
            
            if (cs < 0) {
              $csField.css({ 'background': '#ffebee', 'border': '1px solid #ef5350' });
              $shiftedRank.css('color', '#c62828');
              $resetBtn.css('visibility', 'visible');
            } else if (cs > 0) {
              $csField.css({ 'background': '#e8f5e9', 'border': '1px solid #66bb6a' });
              $shiftedRank.css('color', '#2e7d32');
              $resetBtn.css('visibility', 'visible');
            } else {
              $csField.css({ 'background': '', 'border': '1px solid transparent' });
              $shiftedRank.css('color', '');
              $resetBtn.css('visibility', 'hidden');
            }
          };
          
          html.find('[name="shift"]').on('input change', updateCS);
          html.find('.cs-reset').on('click', (e) => {
            e.preventDefault();
            html.find('[name="shift"]').val(0).trigger('change');
          });
        }
      }).render(true);
    });

    if (!choice) return;

    // Effective rank after shifts
    const effectiveRank = shiftRank(endurance.rank, choice.shift);

    // Check consolidated chat card setting
    let useConsolidated = false;
    try {
      useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
    } catch (_e) { /* setting not registered yet */ }

    // Roll d100 - no karma allowed on initial death save
    const roll = await (new Roll("1d100")).evaluate();
    
    // Show dice animation
    if (!choice.skipDice) {
      await showDiceAnimation(roll, actor, `${actor.name} Death Save (Endurance FEAT)`, useConsolidated);
    }

    const cappedTotal = roll.total; // No karma spending

    // Determine result on Kill column
    const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    const colorLower = String(color || "").toLowerCase();

    // Roll for unconscious duration using configurable die
    const stunDie = game.settings.get('msh-faserip', 'stunDurationDie') || "d10";
    const durationRoll = await (new Roll(`1${stunDie}`)).evaluate();
    const unconsciousDuration = durationRoll.total;

    // Only show separate duration roll if NOT using consolidated mode
    if (!useConsolidated) {
      await durationRoll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `${actor.name} Unconscious Duration (1${stunDie})`,
        rollMode: game.settings.get("core", "rollMode")
      });
    }

    // *** FIXED: Use centralized Kill resolver with proper E/S context ***
    const killResult = resolveKillFeat(colorLower, killContext);
    const isDying = (killResult.outcome === "EnduranceLoss");

    console.log("[FASERIP DEBUG] Death Save Result:", {
      color: colorLower,
      killContext,
      killResult,
      isDying,
      unconsciousDuration
    });

    // Build Kill Check collapsible section (inside Death Save card)
    const killColors = isDying 
      ? { bg: "#8B0000", fg: "#fff", icon: "&#x1F480;" }  // Skull for dying
      : { bg: "#1565c0", fg: "#fff", icon: "&#x1F4A4;" }; // Zzz for stunned
    
    const killSummaryText = isDying 
      ? `Kill Check - DYING (Endurance Loss)`
      : `Kill Check - Stunned`;
    
    // Build kill check detail content based on outcome
    const killDetailContent = isDying ? `
      <div style="padding:8px;font-size:.9em;">
        <div style="margin-bottom:6px;">Losing 1 Endurance rank per turn:</div>
        <div style="margin-left:8px;margin-bottom:6px;font-family:monospace;font-size:.85em;">
          ${this._buildEnduranceLadder(endurance.rank)}
        </div>
        <div style="margin-top:8px;"><strong>Stabilization:</strong></div>
        <div style="margin-left:8px;font-size:.85em;">
          <div>• <strong>50 Karma:</strong> Stabilize 1 round</div>
          <div>• <strong>200 Karma + FEAT:</strong> Re-roll Endurance</div>
          <div>• <strong>Any Aid:</strong> Stops Endurance loss</div>
        </div>
      </div>
    ` : `
      <div style="padding:8px;font-size:.9em;">
        <div>No Endurance loss - character will recover.</div>
        <div style="font-size:.85em;color:#555;margin-top:4px;">
          After waking, Health = Endurance rank value (${endurance.value}).
        </div>
      </div>
    `;
    
    // Compact roll info line with yellow box around roll and hover text
    const killRollInfo = `
      <div style="padding:4px 8px;font-size:.85em;color:#555;border-top:1px solid rgba(0,0,0,.1);">
        Endurance: ${effectiveRank}${choice.shift ? ` (${choice.shift > 0 ? '+' : ''}${choice.shift}CS)` : ''} | Roll: <span title="d100 vs ${effectiveRank} Endurance (Kill column)" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${roll.total}</span> | Result: <strong style="text-transform:capitalize;">${colorLower}</strong>
      </div>`;
    
    const killCheckSection = `
      <details class="faserip-check-section kill-check-section" style="margin:6px 10px 8px;border:1px solid ${killColors.bg};border-radius:4px;overflow:hidden;">
        <summary style="padding:6px 10px;background:${killColors.bg};color:${killColors.fg};cursor:pointer;font-weight:600;font-size:.9em;list-style:none;display:flex;align-items:center;gap:6px;">
          <span style="font-size:1.1em;">${killColors.icon}</span>
          <span>${killSummaryText}</span>
          <span style="margin-left:auto;font-size:.8em;opacity:.8;">&#9660;</span>
        </summary>
        <div style="background:#fff;">
          ${killDetailContent}
          ${killRollInfo}
        </div>
      </details>`;
    
    console.log("[FASERIP DEBUG] killCheckSection built:", killCheckSection.substring(0, 200) + "...");
    
    const cardHtml = `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
          <strong>${actor.name} - Death Save</strong>
        </div>
        <div style="padding:8px 10px;font-size:.9em;">
          <div><strong>Endurance:</strong> ${endurance.rank} (${endurance.value})</div>
          <div><strong>Unconscious:</strong> ${unconsciousDuration} round${unconsciousDuration !== 1 ? 's' : ''}</div>
          <div style="margin-top:6px;padding:6px;border-radius:3px;background:${isDying ? '#ffebee' : '#e3f2fd'};border:1px solid ${isDying ? '#ef5350' : '#90caf9'};">
            <strong style="color:${isDying ? '#c62828' : '#1565c0'};">${isDying ? 'DYING' : 'STUNNED'}</strong>
          </div>
        </div>
        ${killCheckSection}
      </div>
    `;

    console.log("[FASERIP DEBUG] Death Save cardHtml includes killCheckSection:", cardHtml.includes("kill-check-section"));
    console.log("[FASERIP DEBUG] About to create SINGLE ChatMessage for Death Save");

    await ChatMessage.create({ 
      speaker: ChatMessage.getSpeaker({ actor }), 
      content: cardHtml 
    });
    
    console.log("[FASERIP DEBUG] Death Save ChatMessage created - this should be the ONLY card");

    // =========================================================
    // FIX: CREATE EFFECTS IN DIALOG PATH (was missing!)
    // =========================================================
    console.log(`💀 DEATH SAVE | Creating effects for ${actor.name}`, { isDying, unconsciousDuration });

    // Always create unconscious effect when at 0 HP
    await this._createStunnedEffect(actor, unconsciousDuration);

    // If dying, ALSO create dying effect
    if (isDying) {
      await this._createDyingEffect(actor, endurance, unconsciousDuration);
      ui.notifications.warn(`${actor.name} is DYING! Losing 1 Endurance rank per turn.`);
    } else {
      ui.notifications.info(`${actor.name} is unconscious for ${unconsciousDuration} rounds.`);
    }
    // =========================================================
  }

  /** Create the DYING effect: loses 1 Endurance rank per turn (6 seconds) */
  async _createDyingEffect(actor, endurance, _unconsciousDuration) {
      const scope = globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip";

      // Remove any existing dying effects to avoid duplicates
      try {
        const existing = actor.effects.filter(e => e.flags?.[scope]?.isDying);
        if (existing.length) {
          if (game.user.isGM || actor.isOwner) {
            await actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(e => e.id));
          } else {
            const { runAsGM } = await import("../../gm-utils.js");
            await runAsGM({
              operation: "deleteEmbeddedDocuments",
              targetActorUuid: actor.uuid,
              args: ["ActiveEffect", existing.map(e => e.id)]
            });
          }
        }
      } catch (_) {}

      const effectData = {
        name: "Dying",
        img: "icons/svg/skull.svg",
        origin: actor.uuid,
        disabled: false,
        flags: {
          [scope]: {
            isDying: true,
            zeroHealth: true
          }
        },
        changes: [
          { key: "system.status.dying", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: true }
        ],
        statuses: ["dying"]
        // NO DURATION - persists until manually removed
      };

      if (game.user.isGM || actor.isOwner) {
        await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
      } else {
        const { runAsGM } = await import("../../gm-utils.js");
        await runAsGM({
          operation: "createEmbeddedDocuments",
          targetActorUuid: actor.uuid,
          args: ["ActiveEffect", [effectData]]
        });
      }
      
      console.log(`💀 DYING EFFECT | Created for ${actor.name}`);
    }


  /** Create an UNCONSCIOUS effect for non-dying outcomes (N rounds) */
  async _createStunnedEffect(actor, unconsciousRounds = 1) {
    const scope = globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip";
    
    // Check the SETTING, not just if module exists
    const cttSyncMode = game.settings.get("msh-faserip", "ctt.syncMode");
    const usesCTT = (cttSyncMode !== "off" && game.modules.get("calendar-time-tracker")?.active === true);

    // Clean up any old unconscious effects
    try {
      const existing = actor.effects.filter(e => e.statuses?.has?.("unconscious"));
      if (existing.length) {
        if (game.user.isGM || actor.isOwner) {
          await actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(e => e.id));
        } else {
          const { runAsGM } = await import("../../gm-utils.js");
          await runAsGM({
            operation: "deleteEmbeddedDocuments",
            targetActorUuid: actor.uuid,
            args: ["ActiveEffect", existing.map(e => e.id)]
          });
        }
      }
    } catch (err) {
      console.error("Error deleting existing effects", err);
    }

    const effectData = {
      name: `Unconscious (${unconsciousRounds} rounds)`,
      img: "icons/svg/sleep.svg",
      origin: actor.uuid,
      disabled: false,
      flags: {
        [scope]: {
          isUnconscious: true,
          zeroHealth: true,
          durationRounds: Number(unconsciousRounds)
        }
      },
      changes: [
        { key: "system.status.unconscious", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: true }
      ],
      statuses: ["unconscious"],
      duration: usesCTT
        ? { seconds: Math.max(1, Number(unconsciousRounds)) * 6, startTime: game.time.worldTime }
        : { rounds: Math.max(1, Number(unconsciousRounds)), startRound: game.combat?.round || 0 }
    };
    
    if (game.user.isGM || actor.isOwner) {
      await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    } else {
      const { runAsGM } = await import("../../gm-utils.js");
      await runAsGM({
        operation: "createEmbeddedDocuments",
        targetActorUuid: actor.uuid,
        args: ["ActiveEffect", [effectData]]
      });
    }
    
    console.log(`😴 UNCONSCIOUS EFFECT | Created for ${actor.name} (${unconsciousRounds} rounds)`);
  }


  /** Build a simple endurance "ladder" preview for the chat card */
  _buildEnduranceLadder(startRank = "Typical") {
    const order = [
      "Shift-0","Feeble","Poor","Typical","Good","Excellent","Remarkable",
      "Incredible","Amazing","Monstrous","Unearthly","Shift X","Shift Y","Shift Z",
      "Class 1000","Class 3000","Class 5000","Beyond"
    ];
    const i = order.indexOf(startRank);
    if (i < 0) return `${startRank} → (unknown)`;
    // Show a short tail down to Shift-0 for readability
    const tail = order.slice(Math.max(0, i - 3), i + 1).concat("… → Shift-0");
    return tail.join(" → ");
  }

}