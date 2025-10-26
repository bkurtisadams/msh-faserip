import { BaseAction } from "./base-action.js";
import { RANKS, getStrengthInfo, shiftRank, getAbilityInfo } from "./action-utils.js";

export class AttackAction extends BaseAction {
  constructor(args) {
    super(args);
    this.src = "hands";     // hands | weapon | natural
    this.pulled = false;
  }

  // attack-action.js (base class)
  getTargetCount() {
    const t = this.targets;
    if (Array.isArray(t)) return t.length;
    if (t && typeof t.size === "number") return t.size; // Set/Map (e.g., User.targets)
    // last resort: live selection
    return Number(game?.user?.targets?.size ?? 1);
  }

  _computeEffectiveRank(baseRank, columnShift=0) {
    return shiftRank(baseRank, columnShift);
  }

  _getAbilityTriplet() {
    const ab = getAbilityInfo(this.actor, this.abilityName);
    const colShift = Number(this.opts.shift ?? 0);
    const effectiveRank = this._computeEffectiveRank(ab.rank, colShift);
    return { base: ab, effectiveRank, columnShift: colShift };
  }

  _getStrength() { return getStrengthInfo(this.actor); }

  // Add to attack-action.js (base class)
  async _rollFightingFeat(actor, fightingAbility, intensity, attackCount) {
    const availableKarma = actor.system.karma.value || 0;
    
    // Get intensity rank value for comparison
    const intensityIndex = RANKS.indexOf(intensity);
    const fightingIndex = RANKS.indexOf(fightingAbility.rank);
    
    // Determine required color based on FEAT rules
    let requiredColor;
    if (fightingIndex > intensityIndex) {
      requiredColor = "Green or better";
    } else if (fightingIndex === intensityIndex) {
      requiredColor = "Yellow or better";
    } else {
      requiredColor = "Red only";
    }
    
    const dialogContent = `
      <div style="text-align: center; padding: 10px;">
        <h3>${actor.name} - Multiple Attack FEAT</h3>
        <p>Attempting <strong>${attackCount} attacks</strong> requires a Fighting FEAT roll.</p>
        <div style="margin: 15px 0; padding: 10px; background: #f5f5f5; border-radius: 4px;">
          <p><strong>Fighting Rank:</strong> ${fightingAbility.rank} (${fightingAbility.value})</p>
          <p><strong>Intensity:</strong> ${intensity}</p>
          <p><strong>Required Result:</strong> ${requiredColor}</p>
        </div>
        <hr style="margin: 10px 0;">
        <div style="margin-top: 10px;">
          <label style="display: block; margin-bottom: 5px;">Spend Karma Points:</label>
          <input type="number" id="karma-points" min="0" max="${availableKarma}" value="0" 
            style="width: 80px; padding: 4px;">
          <span style="margin-left: 8px; font-size: 0.9em; color: #666;">
            (Available: ${availableKarma})
          </span>
        </div>
      </div>
    `;
    
    return new Promise((resolve) => {
      new Dialog({
        title: `Multiple Attack FEAT (${attackCount} attacks)`,
        content: dialogContent,
        buttons: {
          roll: {
            icon: '<i class="fas fa-dice-d20"></i>',
            label: "Roll FEAT",
            callback: async (html) => {
              const karmaSpent = Math.min(
                parseInt(html.find('#karma-points').val()) || 0,
                availableKarma
              );
              
              // Roll 1d100
              const roll = await (new Roll("1d100")).evaluate();
              const totalRoll = Math.min(100, roll.total + karmaSpent);
              
              // Get result color
              const resultColor = game.msh.rollUniversalTable(fightingAbility.rank, totalRoll);
              const colorLower = resultColor.toLowerCase();
              
              // Determine success based on FEAT intensity comparison rules
              let success = false;
              if (fightingIndex > intensityIndex) {
                // Fighting > Intensity: Green or better succeeds
                success = ["green", "yellow", "red"].includes(colorLower);
              } else if (fightingIndex === intensityIndex) {
                // Fighting = Intensity: Yellow or better succeeds
                success = ["yellow", "red"].includes(colorLower);
              } else {
                // Fighting < Intensity: Only Red succeeds
                success = colorLower === "red";
              }
              
              // Deduct karma if spent
              if (karmaSpent > 0) {
                const newKarma = Math.max(0, availableKarma - karmaSpent);
                await actor.update({"system.karma.value": newKarma});
                
                // Add karma history
                const history = {
                  realDate: new Date().toLocaleDateString(),
                  gameDate: "",
                  amount: -karmaSpent,
                  type: "FEAT Roll",
                  description: `Spent karma on Multiple Attack FEAT (${intensity})`
                };
                const currentHistory = foundry.utils.deepClone(actor.system.karma?.history || []);
                await actor.update({"system.karma.history": currentHistory.concat([history])});
              }
              
              // Show result in chat
              await roll.toMessage({
                speaker: ChatMessage.getSpeaker({ actor }),
                flavor: `Multiple Attack FEAT: ${intensity}`,
              });
              
              const bgColor = success ? "#e8f5e9" : "#ffebee";
              const borderColor = success ? "#4caf50" : "#f44336";
              const textColor = success ? "#2e7d32" : "#d32f2f";
              
              await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor }),
                content: `
                  <div style="background:${bgColor}; border:1px solid ${borderColor}; border-radius:3px; padding:8px; margin:5px 0;">
                    <div style="color:${textColor}; font-weight:bold; margin-bottom:5px;">
                      Multiple Attack FEAT - ${success ? "SUCCESS" : "FAILED"}
                    </div>
                    <div style="font-size:0.9em;">
                      <div>Fighting: ${fightingAbility.rank} vs Intensity: ${intensity}</div>
                      <div>Roll: ${roll.total} + Karma: ${karmaSpent} = ${totalRoll}</div>
                      <div>Result: <strong>${resultColor.toUpperCase()}</strong></div>
                      <div style="margin-top:5px; font-style:italic;">
                        ${success 
                          ? `${attackCount} attacks at -1CS each` 
                          : `FEAT failed: Only 1 attack at -3CS`}
                      </div>
                    </div>
                  </div>
                `
              });
              
              resolve({ success, intensity, roll, totalRoll, resultColor, cancelled: false });
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
            callback: () => resolve({ cancelled: true })
          }
        },
        default: "roll"
      }).render(true);
    });
  }
}
