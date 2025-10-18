// scripts/modules/stunts.js

export class StuntRoller {
  constructor(actor) {
    this.actor = actor;
  }

  async rollStunt(stuntIndex) {
    const stunt = this.actor.system.stunts[stuntIndex];
    
    if (!stunt) {
      ui.notifications.error("Stunt not found");
      return;
    }
    
    // Check if mastered (10+ uses)
    if (stunt.timesUsed >= 10) {
      ui.notifications.info(`${stunt.name} is mastered! Auto-success, no roll or Karma cost needed.`);
      await this._incrementStuntUsage(stuntIndex);
      return;
    }
    
    // Determine FEAT difficulty
    const { featColor, featDifficulty } = this._getFeatDifficulty(stunt.timesUsed);
    
    const baseCost = 100;
    const availableKarma = this.actor.system.karma.lifetime;
    
    if (availableKarma < baseCost) {
      ui.notifications.warn(`Insufficient Karma! Power stunts require ${baseCost} Karma. You have ${availableKarma}.`);
      return;
    }
    
    // Show initial dialog and roll
    await this._showStuntDialog(stunt, stuntIndex, featColor, featDifficulty, baseCost, availableKarma);
  }

  _getFeatDifficulty(timesUsed) {
    if (timesUsed === 0) {
      return { featColor: "Red", featDifficulty: 100 };
    } else if (timesUsed <= 3) {
      return { featColor: "Yellow", featDifficulty: 50 };
    } else {
      return { featColor: "Green", featDifficulty: 20 };
    }
  }

  async _showStuntDialog(stunt, stuntIndex, featColor, featDifficulty, baseCost, availableKarma) {
    new Dialog({
      title: `Power Stunt: ${stunt.name}`,
      content: `
        <form>
          <div class="stunt-info" style="margin-bottom: 15px; padding: 10px; background: #f5f5f5; border-radius: 4px;">
            <h3 style="margin-top: 0;">${stunt.name}</h3>
            ${stunt.parentPower ? `<p><strong>Based on Power:</strong> ${stunt.parentPower}</p>` : '<p><em>General power stunt</em></p>'}
            <p><strong>Rank:</strong> ${stunt.rank} (${stunt.value})</p>
            ${stunt.description ? `<p><strong>Description:</strong> ${stunt.description}</p>` : ''}
            <p><strong>Times Attempted:</strong> ${stunt.timesUsed}</p>
            <p><strong>Difficulty:</strong> <span style="color: ${featColor === 'Red' ? '#F44336' : featColor === 'Yellow' ? '#FFC107' : '#4CAF50'}; font-weight: bold;">${featColor} FEAT</span> (roll ${featDifficulty} or less on d100)</p>
          </div>
          
          <div class="karma-section" style="margin-bottom: 15px;">
            <p><strong>Available Karma:</strong> ${availableKarma}</p>
            <p><strong>Base Cost:</strong> ${baseCost} Karma (required to attempt)</p>
            <p style="font-size: 0.9em; color: #666;">After rolling, you can spend additional Karma to improve your result (1 Karma = -1 to roll)</p>
          </div>
          
          <div class="rules-reminder" style="padding: 10px; background: #fff3e0; border-left: 4px solid #ff9800; font-size: 0.9em;">
            <strong>Reminder:</strong> ${stunt.timesUsed >= 9 ? 'One more success and this stunt will be <strong>mastered</strong>!' : `${10 - stunt.timesUsed} more successes until mastered.`}
          </div>
        </form>
      `,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice-d20"></i>',
          label: "Roll Stunt",
          callback: async () => {
            await this._makeStuntRoll(stunt, stuntIndex, featColor, featDifficulty, baseCost, availableKarma);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "roll"
    }).render(true);
  }

  async _makeStuntRoll(stunt, stuntIndex, featColor, featDifficulty, baseCost, availableKarma) {
    // Make the roll
    const roll = new Roll("1d100");
    await roll.evaluate();
    const rollResult = roll.total;
    
    // Show roll to chat
    await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: `${this.actor.name} attempts Power Stunt: ${stunt.name}`,
        rollMode: game.settings.get("core", "rollMode")
    });
    
    // Get the color from the universal table
    const color = game.msh.rollUniversalTable(stunt.rank, rollResult);
    const colorLower = String(color || "").toLowerCase();
    
    // Determine if it's a natural success based on the FEAT requirement
    let naturalSuccess = this._checkFeatSuccess(colorLower, featColor);
    
    // Calculate how much Karma is needed to succeed
    let karmaNeeded = 0;
    if (!naturalSuccess) {
        karmaNeeded = this._calculateKarmaNeeded(rollResult, stunt.rank, featColor);
    }
    
    const maxKarmaAvailable = availableKarma - baseCost;
    const canAffordSuccess = karmaNeeded > 0 && karmaNeeded <= maxKarmaAvailable;
    
    // Ask if they want to spend Karma (if needed and possible)
    if (!naturalSuccess && canAffordSuccess) {
        await this._showKarmaSpendDialog(stunt, stuntIndex, rollResult, featColor, karmaNeeded, baseCost, availableKarma, roll, color);
    } else {
        await this._finalizeStuntRoll(stunt, stuntIndex, rollResult, featColor, 0, baseCost, naturalSuccess, roll, color);
    }
    }

    _checkFeatSuccess(colorRolled, featRequired) {
    const colorHierarchy = { 'white': 0, 'green': 1, 'yellow': 2, 'red': 3 };
    const rolledLevel = colorHierarchy[colorRolled] || 0;
    const requiredLevel = colorHierarchy[featRequired.toLowerCase()] || 0;
    
    return rolledLevel >= requiredLevel;
    }

    _calculateKarmaNeeded(rollResult, rank, featColor) {
    // Try adding karma until we get the required color
    for (let karma = 1; karma <= 100; karma++) {
        const newResult = rollResult + karma;
        if (newResult > 100) return 999; // Can't succeed even with max karma
        
        const newColor = game.msh.rollUniversalTable(rank, newResult);
        const colorLower = String(newColor || "").toLowerCase();
        
        if (this._checkFeatSuccess(colorLower, featColor)) {
        return karma;
        }
    }
    
    return 999; // Can't succeed
    }

    async _showKarmaSpendDialog(stunt, stuntIndex, rollResult, featColor, karmaNeeded, baseCost, availableKarma, roll, initialColor) {
  const maxKarmaAvailable = availableKarma - baseCost;
  
  // Calculate what the final result would be with karma
  const finalRoll = rollResult + karmaNeeded;
  const finalColor = game.msh.rollUniversalTable(stunt.rank, finalRoll);
  
  new Dialog({
    title: "Spend Karma to Succeed?",
    content: `
      <div style="padding: 10px;">
        <p><strong>Initial Roll:</strong> ${rollResult}</p>
        <p><strong>Color Result:</strong> <span style="font-weight: bold; color: ${
          initialColor === 'white' ? '#666' : 
          initialColor === 'green' ? '#2e7d32' :
          initialColor === 'yellow' ? '#f57f17' : '#c62828'
        };">${String(initialColor).toUpperCase()}</span></p>
        <p><strong>Required FEAT:</strong> <span style="font-weight: bold; color: ${
          featColor === 'Green' ? '#2e7d32' :
          featColor === 'Yellow' ? '#f57f17' : '#c62828'
        };">${featColor.toUpperCase()}</span></p>
        
        <hr style="margin: 10px 0;">
        
        <p><strong>Karma Needed:</strong> ${karmaNeeded}</p>
        <p><strong>With Karma:</strong> ${rollResult} + ${karmaNeeded} = ${finalRoll}</p>
        <p><strong>New Color:</strong> <span style="font-weight: bold; color: ${
          finalColor === 'yellow' ? '#f57f17' : '#c62828'
        };">${String(finalColor).toUpperCase()}</span></p>
        <p><strong>Available Karma (after base cost):</strong> ${maxKarmaAvailable}</p>
        
        <div style="margin-top: 15px; padding: 10px; background: #fff3e0; border-left: 4px solid #ff9800;">
          <p style="margin: 0;">Do you want to spend <strong>${karmaNeeded} Karma</strong> to turn this into a success?</p>
          <p style="margin: 5px 0 0 0; font-size: 0.9em; color: #666;">Total Karma cost: ${baseCost + karmaNeeded}</p>
        </div>
      </div>
    `,
    buttons: {
      spend: {
        icon: '<i class="fas fa-check"></i>',
        label: `Spend ${karmaNeeded} Karma`,
        callback: async () => {
          await this._finalizeStuntRoll(stunt, stuntIndex, rollResult, featColor, karmaNeeded, baseCost, true, roll, initialColor);
        }
      },
      decline: {
        icon: '<i class="fas fa-times"></i>',
        label: "Don't Spend (Fail)",
        callback: async () => {
          await this._finalizeStuntRoll(stunt, stuntIndex, rollResult, featColor, 0, baseCost, false, roll, initialColor);
        }
      }
    },
    default: "spend"
  }).render(true);
}

async _finalizeStuntRoll(stunt, stuntIndex, rollResult, featColor, extraKarma, baseCost, success, roll, initialColor) {
    const totalKarma = baseCost + extraKarma;
    const finalResult = rollResult + extraKarma; // ADD karma, don't subtract
    
    // Get final color if karma was spent
    const finalColor = extraKarma > 0 
        ? game.msh.rollUniversalTable(stunt.rank, finalResult)
        : initialColor;
    
    // Determine banner colors
    const bg = success ? '#e8f5e9' : '#ffebee';
    const fg = success ? '#2e7d32' : '#c62828';
    
    // Create chat card
    const cardHtml = `
        <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
            <strong>${this.actor.name} — Power Stunt</strong>
        </div>
        
        <div style="padding:5px 10px;border-bottom:1px solid #e0e0e0;font-size:.9em;">
            <div><strong>Stunt:</strong> ${stunt.name}</div>
            ${stunt.parentPower ? `<div><strong>Parent Power:</strong> ${stunt.parentPower}</div>` : ''}
        </div>

        <div style="padding:5px 10px;font-size:.9em;">
            <div>Rank: ${stunt.rank} (${stunt.value})</div>
            <div>Difficulty: ${featColor} FEAT</div>
            <div>Roll: ${rollResult}${extraKarma > 0 ? ` + ${extraKarma} Karma = ${finalResult}` : ''}</div>
            <div>Color: ${String(initialColor).toUpperCase()}${extraKarma > 0 ? ` → ${String(finalColor).toUpperCase()}` : ''}</div>
            <div>Times Attempted: ${stunt.timesUsed} → ${stunt.timesUsed + 1}</div>
            <div>Total Karma Spent: ${totalKarma}</div>
        </div>

        <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.05em;border-radius:3px;background:${bg};color:${fg};">
            RESULT: ${success ? 'SUCCESS' : 'FAILURE'}
        </div>

        ${success ? `
            <div style="padding:6px 10px;margin:6px 10px;background:#e8f5e9;border:1px solid #66bb6a;border-radius:3px;">
            <div style="font-weight:bold;color:#2e7d32;">Power Stunt Successful</div>
            <div style="font-size:.9em;">
                ${stunt.description || 'The power stunt works as intended!'}
            </div>
            </div>
        ` : `
            <div style="padding:6px 10px;margin:6px 10px;background:#ffebee;border:1px solid #ef5350;border-radius:3px;">
            <div style="font-weight:bold;color:#c62828;">Power Stunt Failed</div>
            <div style="font-size:.9em;">
                The stunt does not work as intended. The Judge will determine the specific effects of the failure.
            </div>
            </div>
        `}
        </div>
    `;
    
    await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: cardHtml
    });
    
    // Create karma history entry
    const karmaEvent = {
        realDate: new Date().toLocaleDateString(),
        gameDate: "",
        amount: -totalKarma,
        type: "Power Stunt",
        description: `${stunt.name}${stunt.parentPower ? ` (${stunt.parentPower})` : ''} - ${success ? 'Success' : 'Failed'}`
    };
    
    // Update actor
    const stunts = foundry.utils.deepClone(this.actor.system.stunts);
    stunts[stuntIndex].timesUsed += 1;
    
    const history = foundry.utils.deepClone(this.actor.system.karma?.history || []);
    history.push(karmaEvent);
    
    await this.actor.update({
        "system.stunts": stunts,
        "system.karma.history": history
    });
    
    if (stunts[stuntIndex].timesUsed >= 10) {
        ui.notifications.info(`${stunt.name} is now MASTERED! No future cost or roll required.`);
    }
}

  async _incrementStuntUsage(stuntIndex) {
    const stunts = foundry.utils.deepClone(this.actor.system.stunts);
    stunts[stuntIndex].timesUsed += 1;
    await this.actor.update({ "system.stunts": stunts });
  }
}