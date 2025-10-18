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
        <li><strong>White/Green (Endurance Loss):</strong> Character is dying, loses 1 rank per turn</li>
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

    // Determine if dying or just stunned
    const isDying = (colorLower === 'white' || colorLower === 'green');

    console.log("=== Death Save Result ===");
    console.log("Color:", colorLower);
    console.log("Is Dying:", isDying);
    console.log("Unconscious Duration:", unconsciousDuration);

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
          RESULT: ${String(color).toUpperCase()} — ${String(baseEffect).toUpperCase()}
        </div>

        ${rulesBlock}
      </div>
    `;

    await ChatMessage.create({ 
      speaker: ChatMessage.getSpeaker({ actor }), 
      content: cardHtml 
    });
  }

  async _createDyingEffect(actor, endurance, unconsciousDuration) {
  const secondsPerTurn = 6;
  
  // Calculate turns until death
  // They die when they go BELOW Shift 0, so it's their current rank index + 1
  const currentRankIndex = RANKS.indexOf(endurance.rank);
  const turnsUntilDeath = currentRankIndex + 1; // +1 for the turn that takes them BELOW Shift 0
  
  const dyingEffect = {
    name: `Dying (${endurance.rank} → Dead in ${turnsUntilDeath} turns)`,
    icon: "icons/svg/skull.svg",
    origin: actor.uuid,
    disabled: false,
    duration: {
      seconds: turnsUntilDeath * secondsPerTurn,
      startTime: game.time?.worldTime || 0
    },
    flags: {
      "msh-faserip": {
        isDying: true,
        originalEndRank: endurance.rank,
        originalEndValue: endurance.value,
        unitLabel: "turn",
        unitLabelPlural: "turns"
      }
    }
  };

  await actor.createEmbeddedDocuments('ActiveEffect', [dyingEffect]);
  ui.notifications.warn(`${actor.name} is DYING! Loses 1 Endurance rank per turn. Dead in ${turnsUntilDeath} turns!`);
}

  async _createStunnedEffect(actor, duration) {
    const effectData = {
        name: `Stunned (${duration} rounds)`,
        icon: "icons/svg/daze.svg",
        origin: actor.uuid,
        disabled: false,
        duration: {
        rounds: duration,
        startRound: game.combat?.round || 0
        },
        flags: {
        "msh-faserip": {
            isStunned: true,
            fromDeathSave: true
        }
        }
    };

    await actor.createEmbeddedDocuments('ActiveEffect', [effectData]);
    ui.notifications.info(`Stunned effect created for ${actor.name} (${duration} rounds).`);
    }

  _buildEnduranceLadder(startRank) {
    const idx = RANKS.indexOf(startRank);
    if (idx === -1) return "Unknown → Dead";
    
    const ladder = [];
    for (let i = idx; i >= 0; i--) {
      ladder.push(RANKS[i]);
    }
    ladder.push("DEAD");
    
    return ladder.join(" → ");
  }
}