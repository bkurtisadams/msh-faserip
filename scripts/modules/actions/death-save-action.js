// scripts/modules/actions/death-save-action.js
import { BaseAction } from "./base-action.js";
import {
  RANKS,
  shiftRank,
  effectsFor,
  buildResultGrid,
  bannerColors,
  getAbilityInfo,
} from "./action-utils.js";
import { resolveKillFeat, KILL_CONTEXTS } from "../../rules/kill-resolver.js";
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
    const effects = effectsFor("kill"); // Reuse Kill column effects

    // --- AUTO MODE FAST-PATH: Full Auto skips dialog & rolls immediately ---
    if (this?.opts?.autoApply === true) {
      const actor = this.actor;
      const endurance = {
        rank: actor.system?.abilities?.endurance?.rank || "Good",
        value: actor.system?.abilities?.endurance?.value || 8
      };
      const effectiveRank = shiftRank(endurance.rank, Number(this.opts?.featCs ?? 0));

      const roll = await (new Roll("1d100")).evaluate();
      const cappedTotal = Math.min(100, roll.total);

      const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
      const colorLower = String(color).toLowerCase();
      
      // Roll unconscious duration
      const durationRoll = await (new Roll("1d10")).evaluate();
      const maxStunDuration = game.settings.get('msh-faserip', 'maxStunDuration') || 10;
      const unconsciousDuration = Math.min(durationRoll.total, maxStunDuration);

      // Use Kill resolver to determine outcome
      const killResult = resolveKillFeat(colorLower, KILL_CONTEXTS.ZERO_HEALTH);
      const isDying = (killResult.outcome === "EnduranceLoss");

      const resultHtml = `
        <div style="background:#fafafa;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
          <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#4e342e;">
            <strong>${actor.name} — Death Save</strong>
          </div>
          <div style="padding:8px 10px;font-size:.95em;">
            <div>Endurance: ${endurance.rank}${this.opts?.featCs ? ` — Shift ${this.opts.featCs} → ${effectiveRank}` : ""}</div>
            <div>Roll: ${roll.total}</div>
            <div>Unconscious: ${unconsciousDuration} rounds</div>
            <div style="margin-top:6px;padding:6px;border-radius:3px;background:${bannerColors(isDying ? 'red' : 'green').bg};color:${bannerColors(isDying ? 'red' : 'green').fg};">
              RESULT: ${isDying ? "DYING" : "STUNNED"}
            </div>
          </div>
        </div>
      `;
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: resultHtml });

      // Always create unconscious effect when at 0 HP
      await this._createStunnedEffect(actor, unconsciousDuration);

      // If dying, ALSO create dying effect
      if (isDying) {
        await this._createDyingEffect(actor, endurance, unconsciousDuration);
      }
      
      return; // ← skip dialog path
    }
    // --- END AUTO MODE FAST-PATH ---

    // Simple dialog - just endurance and shift
    const dialogHtml = `
    <div style="margin-bottom:12px;padding:8px;background:#ffebee;border:1px solid #ef5350;border-radius:3px;">
        <strong style="color:#c62828;">Death Save</strong>
        <div style="font-size:0.9em;color:#666;margin-top:4px;">
        Character has reached 0 Health and is unconscious. Roll Endurance FEAT vs Kill column.
        </div>
    </div>

    <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Character:</label>
        <strong>${actor.name}</strong>
    </div>

    <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Endurance:</label>
        <input type="text" value="${endurance.rank}" readonly style="width:160px;">
        <span style="margin-left:6px;">(${endurance.value})</span>
    </div>

    <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Column Shift:</label>
        <input type="number" name="shift" value="0" style="width:60px;">
        <span style="color:#666;font-size:.9em;">(+ easier, - harder)</span>
    </div>

    <div style="margin-top:12px;padding:8px;background:#fff3e0;border:1px solid #ff9800;border-radius:3px;font-size:0.9em;">
        <strong>Possible Results:</strong>
        <ul style="margin:6px 0 0 20px;padding:0;">
        <li><strong>White (Endurance Loss):</strong> Character is dying, loses 1 rank per turn</li>
        <li><strong>Green (E/S):</strong> Dying if Edged/Shooting attack, otherwise stunned</li>
        <li><strong>Yellow/Red (No Effect):</strong> Character is stunned 1-10 rounds, can wake up</li>
        </ul>
    </div>

    <div style="margin-top:10px;">
        <label><input type="checkbox" name="skipDice"> Skip dice animation</label>
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
        default: "roll"
      }).render(true);
    });

    if (!choice) return;

    // Effective rank after shifts
    const effectiveRank = shiftRank(endurance.rank, choice.shift);

    // Roll d100 - no karma allowed on initial death save
    const roll = await (new Roll("1d100")).evaluate();
    if (!choice.skipDice) {
    await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `${actor.name} Death Save (Endurance FEAT)`,
        rollMode: game.settings.get("core", "rollMode")
    });
    }

    const cappedTotal = roll.total; // No karma spending

    // Determine result on Kill column
    const color = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    const colorLower = String(color || "").toLowerCase();
    const baseEffect = effects[colorLower] || color;

    // Roll 1d10 for unconscious duration
    const durationRoll = await (new Roll("1d10")).evaluate();
    const rawDuration = durationRoll.total;
    const maxStunDuration = game.settings.get('msh-faserip', 'maxStunDuration') || 10;
    const unconsciousDuration = Math.min(rawDuration, maxStunDuration);

    await durationRoll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `${actor.name} Unconscious Duration (1d10)${rawDuration > unconsciousDuration ? ` - Capped at ${maxStunDuration}` : ''}`,
      rollMode: game.settings.get("core", "rollMode")
    });

    // *** FIXED: Use centralized Kill resolver with ZERO_HEALTH context ***
    const killResult = resolveKillFeat(colorLower, KILL_CONTEXTS.ZERO_HEALTH);
    const isDying = (killResult.outcome === "EnduranceLoss");

    console.log("=== Death Save Result ===");
    console.log("Color:", colorLower);
    console.log("Kill Result:", killResult);
    console.log("Is Dying:", isDying);
    console.log("Unconscious Duration:", unconsciousDuration);

    // --- Death Save on 0 Health (always, any source) --- covered in init.js

    // Create appropriate effect
    if (isDying) {
      console.log("Calling _createDyingEffect...");
      await this._createDyingEffect(actor, endurance, unconsciousDuration);
      console.log("_createDyingEffect complete");
    } else {
      console.log("Calling _createStunnedEffect...");
      await this._createStunnedEffect(actor, unconsciousDuration);
      console.log("_createStunnedEffect complete");
    }

    // Build chat card
    const grid = buildResultGrid("kill", colorLower, effects);
    const { bg, fg } = bannerColors(colorLower);

    const rulesBlock = isDying ? `
      <div style="padding:8px 10px;margin:6px 10px;background:#ffebee;border:1px solid #ef5350;border-radius:3px;">
        <div style="font-weight:bold;margin-bottom:6px;color:#c62828;">☠️ DYING</div>
        <div style="margin-bottom:6px;">
          Character is unconscious for ${unconsciousDuration} round${unconsciousDuration > 1 ? 's' : ''} and losing 1 Endurance rank per turn:
        </div>
        <div style="margin-left:12px;margin-bottom:6px;font-family:monospace;">
          ${this._buildEnduranceLadder(endurance.rank)}
        </div>
        <div style="font-weight:bold;margin-top:8px;margin-bottom:4px;">Stabilization Options:</div>
        <ul style="margin:4px 0 0 20px;padding:0;">
          <li><strong>50 Karma:</strong> Stabilize for 1 round (temporary)</li>
          <li><strong>200 Karma + FEAT:</strong> Roll another Endurance check; success = stabilized</li>
          <li><strong>Any Aid:</strong> First aid, pulling to safety, checking if OK - stops Endurance loss</li>
        </ul>
        <div style="margin-top:8px;padding:6px;background:#fff9c4;border:1px solid #f57c00;border-radius:3px;font-size:0.85em;">
          <strong>⚠️ Note:</strong> Manually edit the Dying effect in the Effects tab to track current rank and turns elapsed.
        </div>
      </div>
    ` : `
      <div style="padding:8px 10px;margin:6px 10px;background:#e3f2fd;border:1px solid #2196F3;border-radius:3px;">
        <div style="font-weight:bold;margin-bottom:6px;color:#1565c0;">Stunned</div>
        <div>
          Character is unconscious for ${unconsciousDuration} round${unconsciousDuration > 1 ? 's' : ''}.
        </div>
        <div style="margin-top:6px;font-size:0.9em;color:#666;">
          After ${unconsciousDuration} rounds, character can attempt an Endurance FEAT to regain consciousness.
          Success = wake with Health equal to Endurance rank (${endurance.value}).
        </div>
      </div>
    `;

    const cardHtml = `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
          <strong>${actor.name} - Death Save</strong>
        </div>

        <div style="padding:5px 10px;font-size:.9em;">
          <div>Endurance: ${endurance.rank} (${endurance.value})${choice.shift ? ` — Shift ${choice.shift} → ${effectiveRank}` : ""}</div>
          <div>Roll: ${roll.total} = ${cappedTotal}</div>
          <div>Unconscious Duration: ${unconsciousDuration} round${unconsciousDuration > 1 ? 's' : ''}</div>
        </div>

        ${grid}

        <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background:${bg};color:${fg};">
          RESULT: ${String(color).toUpperCase()} — ${String(killResult.label).toUpperCase()}
        </div>

        ${rulesBlock}
      </div>
    `;

    await ChatMessage.create({ 
      speaker: ChatMessage.getSpeaker({ actor }), 
      content: cardHtml 
    });
  }

  /** Create the DYING effect: loses 1 Endurance rank per turn (6 seconds) */
  async _createDyingEffect(actor, endurance, _unconsciousDuration) {
    const scope = globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip";

    // Remove any existing dying timers to avoid duplicates
    try {
      const existing = actor.effects.filter(e => e.flags?.[scope]?.dyingTimer);
      if (existing.length) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(e => e.id));
      }
    } catch (_) {}

    const usesCTT = game.modules.get("calendar-time-tracker")?.active === true;

    const effectData = {
      name: "Dying",
      img: "icons/svg/skull.svg",         // IMPORTANT: use img, never read effect.icon anywhere
      origin: actor.uuid,
      flags: {
        [scope]: {
          dyingTimer: true,
          isDying: true,
          unitLabel: "turn",
          unitLabelPlural: "turns"
        }
      },
      changes: [
        { key: "system.status.dying", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: true }
      ],
      statuses: ["dying"],
      duration: usesCTT
        ? { seconds: 6, startTime: game.time.worldTime }                         // 1 turn
        : { rounds: 1, startRound: game.combat?.round }
    };

    await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);

    // Not required for the CTT tick-loop; the chat card already shows the duration rolled.
  }

  /** Create an UNCONSCIOUS effect for non-dying outcomes (N rounds) */
  async _createStunnedEffect(actor, unconsciousRounds = 1) {
    //console.log("DEBUG: _createStunnedEffect called", {actor: actor.name, rounds: unconsciousRounds});
    
    const scope = globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip";
    const usesCTT = game.modules.get("calendar-time-tracker")?.active === true;

    // Clean up any old unconscious effects we own (optional, but tidy)
    try {
      const existing = actor.effects.filter(e => e.statuses?.has?.("unconscious"));
      if (existing.length) {
        console.log("DEBUG: Deleting existing unconscious effects", existing.length);
        await actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(e => e.id));
      }
    } catch (err) {
      console.error("DEBUG: Error deleting existing effects", err);
    }

    const effectData = {
      name: `Unconscious (${unconsciousRounds} rounds)`,
      img: "icons/svg/unconscious.svg",
      origin: actor.uuid,
      flags: {
        [scope]: {
          isStunned: true,           // if this exists already
          fromDeathSave: true,        // ADD THIS
          unitLabel: "turn",
          unitLabelPlural: "turns"
        }
      },
      statuses: ["unconscious"],
      duration: usesCTT
        ? { seconds: Math.max(1, Number(unconsciousRounds)) * 6, startTime: game.time.worldTime }
        : { rounds: Math.max(1, Number(unconsciousRounds)), startRound: game.combat?.round || 0 }
    };

    //console.log("DEBUG: About to create effect", effectData);
    
    try {
      const created = await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
      //console.log("DEBUG: Effect created successfully", created);
    } catch (err) {
      console.error("DEBUG: Effect creation failed", err);
    }
    
    ui.notifications.info(`Stunned effect created for ${actor.name} (${unconsciousRounds} rounds).`);
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
