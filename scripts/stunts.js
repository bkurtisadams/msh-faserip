// scripts/stunts.js v1.3.0 - 2026-09-03
// v1.3.0: Stunt mechanics: a stunt entry may carry `mechanic` (see
//         modules/actions/stunt-mechanics.js); it runs after a successful
//         roll and directly when the stunt is mastered. rollStuntForPreset()
//         lets a power dialog attempt a book-listed stunt through the tab.
//         FEAT colour from kernel powerStuntRequiredColor (RULED 2026-09-03:
//         mastery at 10 successes).
// scripts/stunts.js v1.2.0 - 2026-07-23
// scripts/stunts.js v1.1.0 - 2026-04-22
// v1.1.0: v14 port — DialogV2 conversions; pre-roll karma declaration (RAW);
//         min-10 karma commitment enforced; GM impossible refund button;
//         parentPowerId link (dynamic rank from power item).
// v1.0.0: Initial stunt roller.

import { powerStuntRequiredColor, POWER_STUNT_MASTERY } from "./lib/faserip-rules/faserip-karma.js";
import { runStuntMechanic, ensureStuntForPreset } from "./modules/actions/stunt-mechanics.js";

const DialogV2 = foundry.applications.api.DialogV2;

export class StuntRoller {
  constructor(actor) {
    this.actor = actor;
  }

  async rollStunt(stuntIndex) {
    const stunt = this.actor.system.stunts?.[stuntIndex];
    if (!stunt) {
      ui.notifications.error("Stunt not found");
      return;
    }

    const resolved = this._resolveStuntRank(stunt);

    if (stunt.timesUsed >= POWER_STUNT_MASTERY) {
      ui.notifications.info(`${stunt.name} is mastered and does not need to be rolled.`);
      await runStuntMechanic(this.actor, stunt);
      return;
    }

    const { featColor } = this._getFeatDifficulty(stunt.timesUsed);
    const baseCost = 100;
    const availableKarma = this._getAvailableKarma();

    if (availableKarma < baseCost) {
      ui.notifications.warn(`Insufficient Karma! Power stunts require ${baseCost} Karma. You have ${availableKarma}.`);
      return;
    }

    await this._showStuntDialog(stunt, stuntIndex, resolved, featColor, baseCost, availableKarma);
  }

  _getAvailableKarma() {
    const lifetime = this.actor.system.karma?.lifetime || 0;
    const history = this.actor.system.karma?.history || [];
    let spent = 0;
    for (const e of history) if ((e.amount || 0) < 0) spent += Math.abs(e.amount);
    const advancement = this.actor.system.karma?.advancement || 0;
    const pool = this.actor.system.karma?.pool || 0;
    return Math.max(0, lifetime - spent - advancement - pool);
  }

  _resolveStuntRank(stunt) {
    if (stunt.parentPowerId) {
      const power = this.actor.items.get(stunt.parentPowerId);
      if (power?.system) {
        return {
          rank: power.system.rank ?? stunt.rank,
          value: power.system.value ?? stunt.value,
          powerName: power.name
        };
      }
    }
    return { rank: stunt.rank, value: stunt.value, powerName: stunt.parentPower || null };
  }

  _getFeatDifficulty(timesUsed) {
    const c = powerStuntRequiredColor(Number(timesUsed) || 0);
    return { featColor: c.charAt(0).toUpperCase() + c.slice(1) };
  }

  // Attempt a book-listed stunt for a power (creates the tab entry on first use).
  async rollStuntForPreset(item, preset) {
    const idx = await ensureStuntForPreset(this.actor, item, preset);
    return this.rollStunt(idx);
  }

  async _showStuntDialog(stunt, stuntIndex, resolved, featColor, baseCost, availableKarma) {
    const difficultyDesc = featColor === 'Red' ? 'Need RED result on Universal Table'
      : featColor === 'Yellow' ? 'Need YELLOW or RED result'
      : 'Need GREEN, YELLOW, or RED result';

    const featColorHex = featColor === 'Red' ? '#F44336' : featColor === 'Yellow' ? '#FFC107' : '#4CAF50';
    const remaining = POWER_STUNT_MASTERY - stunt.timesUsed;
    const masterHint = stunt.timesUsed >= POWER_STUNT_MASTERY - 1
      ? 'One more success and this stunt will be <strong>mastered</strong>!'
      : `${remaining} more successes until mastered.`;

    const canAffordBoost = availableKarma >= baseCost + 10;

    const content = `
      <form>
        <div class="stunt-info" style="margin-bottom:8px;padding:8px 10px;background:#f5f5f5;border-radius:4px;line-height:1.3;">
          <h3 style="margin:0 0 6px 0;">${stunt.name}</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:0.92em;">
            ${resolved.powerName ? `<div style="grid-column:1 / -1;"><strong>Power:</strong> ${resolved.powerName}</div>` : '<div style="grid-column:1 / -1;"><em>General power stunt</em></div>'}
            <div><strong>Rank:</strong> ${resolved.rank} (${resolved.value})</div>
            <div><strong>Progress:</strong> ${stunt.timesUsed}/10</div>
            <div><strong>Difficulty:</strong> <span style="color:${featColorHex};font-weight:bold;">${featColor}</span></div>
            <div style="color:#666;">${difficultyDesc}</div>
            ${stunt.description ? `<div style="grid-column:1 / -1;"><strong>Description:</strong> ${stunt.description}</div>` : ''}
          </div>
        </div>
        <div class="karma-section" style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin-bottom:8px;font-size:0.92em;line-height:1.3;">
          <div><strong>Available Karma:</strong> ${availableKarma}</div>
          <div><strong>Attempt Cost:</strong> ${baseCost}</div>
          <div style="grid-column:1 / -1;color:#666;font-size:0.9em;">
            Karma boost: declare before the roll, then spend at least +10 after seeing the result.
          </div>
        </div>
        <div class="rules-reminder" style="padding:7px 9px;background:#fff3e0;border-left:4px solid #ff9800;font-size:0.9em;line-height:1.25;">
          <strong>Reminder:</strong> ${masterHint}
        </div>
      </form>
    `;

    const buttons = [
      {
        action: "attempt",
        icon: "fas fa-dice-d20",
        label: `Attempt`,
        default: !canAffordBoost,
        callback: async () => {
          await this._makeStuntRoll(stunt, stuntIndex, resolved, featColor, baseCost, availableKarma, false);
        }
      }
    ];

    if (canAffordBoost) {
      buttons.push({
        action: "attemptBoost",
        icon: "fas fa-plus-circle",
        label: `Boost Roll`,
        default: true,
        callback: async () => {
          await this._makeStuntRoll(stunt, stuntIndex, resolved, featColor, baseCost, availableKarma, true);
        }
      });
    }

    buttons.push({
      action: "impossible",
      icon: "fas fa-ban",
      label: `Impossible`,
      callback: async () => {
        await ChatMessage.create({
          user: game.user.id,
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: `<div style="padding:6px 10px;background:#fff3e0;border-left:4px solid #ff9800;">
            <strong>${this.actor.name}</strong> — Power Stunt <em>${stunt.name}</em> ruled impossible by the Judge. No Karma spent.
          </div>`
        });
      }
    });

    buttons.push({ action: "cancel", icon: "fas fa-times", label: "Cancel" });

    await DialogV2.wait({
      window: { title: `Power Stunt: ${stunt.name}` },
      position: { width: 480 },
      content,
      buttons,
      rejectClose: false
    });
  }

  async _makeStuntRoll(stunt, stuntIndex, resolved, featColor, baseCost, availableKarma, declaredBoost) {
    // DialogV2 keeps the stunt dialog open (and clickable) until this method
    // resolves — a second click on Attempt/Boost re-enters and double-charges.
    if (this._rolling) return;
    this._rolling = true;
    try {
    const roll = new Roll("1d100");
    await roll.evaluate();
    const rollResult = roll.total;

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `${this.actor.name} attempts Power Stunt: ${stunt.name}${declaredBoost ? ' (Karma declared)' : ''}`,
      rollMode: game.settings.get("core", "rollMode")
    });

    const initialColor = game.msh.rollUniversalTable(resolved.rank, rollResult);
    const initialSuccess = this._checkFeatSuccess(String(initialColor || '').toLowerCase(), featColor);

    // If no boost was declared, finalize directly with 0 extra karma.
    if (!declaredBoost) {
      await this._finalizeStuntRoll(stunt, stuntIndex, resolved, rollResult, featColor, 0, baseCost, initialSuccess, initialColor);
      return;
    }

    // Karma was declared: minimum 10 is spent regardless of outcome.
    // Player picks amount (min 10) AFTER seeing the roll.
    const maxAfterBase = availableKarma - baseCost;
    const minCommit = Math.min(10, maxAfterBase);
    await this._showBoostAmountDialog(stunt, stuntIndex, resolved, rollResult, featColor, baseCost, minCommit, maxAfterBase, initialColor, initialSuccess);
    } finally {
      this._rolling = false;
    }
  }

  _checkFeatSuccess(colorRolled, featRequired) {
    const h = { white: 0, green: 1, yellow: 2, red: 3 };
    return (h[colorRolled] ?? 0) >= (h[featRequired.toLowerCase()] ?? 0);
  }

  async _showBoostAmountDialog(stunt, stuntIndex, resolved, rollResult, featColor, baseCost, minCommit, maxAfterBase, initialColor, initialSuccess) {
    // Compute breakpoints (informational; RAW doesn't require showing them, but useful UX).
    const breakpoints = this._computeBreakpoints(rollResult, resolved.rank, featColor, minCommit, maxAfterBase);

    const initialSuccessText = initialSuccess
      ? `<div style="padding:6px 10px;margin-bottom:10px;background:#e8f5e9;border:1px solid #66bb6a;border-radius:3px;">
           <strong style="color:#2e7d32;">Natural success!</strong> Your roll already meets the ${featColor} FEAT. Per RAW, the declared Karma minimum (${minCommit}) is still spent.
         </div>`
      : '';

    let bpHtml = '';
    for (const bp of breakpoints) {
      bpHtml += `<div style="margin:4px 0;padding:4px;background:#f0f0f0;border-radius:3px;font-size:0.9em;">
        <label><input type="radio" name="karmaChoice" value="${bp.amount}" ${bp.preferred ? 'checked' : ''}>
          <strong>${bp.label} (+${bp.amount}):</strong> ${rollResult} + ${bp.amount} = ${rollResult + bp.amount} → <span style="color:${bp.color};font-weight:bold;">${bp.resultColor.toUpperCase()}</span>
        </label>
      </div>`;
    }

    const content = `
      <form>
        ${initialSuccessText}
        <div style="margin-bottom:10px;">
          <strong>Initial roll:</strong> ${rollResult} → <strong>${String(initialColor).toUpperCase()}</strong>
          (needed ${featColor} FEAT)
        </div>
        <div style="margin-bottom:10px;">
          <strong>Available for boost:</strong> ${maxAfterBase} Karma (minimum ${minCommit} must be spent)
        </div>
        ${bpHtml}
        <div style="margin-top:10px;padding:6px;border-top:1px solid #ccc;">
          <label><input type="radio" name="karmaChoice" value="custom">
            <strong>Custom amount:</strong>
            <input type="number" name="customAmount" value="${minCommit}" min="${minCommit}" max="${Math.min(maxAfterBase, Math.max(minCommit, 100 - rollResult))}" style="width:70px;margin-left:6px;" disabled>
            <span style="font-size:0.85em;color:#666;">(${minCommit} - ${maxAfterBase})</span>
          </label>
        </div>
      </form>
    `;

    const result = await DialogV2.wait({
      window: { title: "Commit Karma Boost" },
      content,
      render: (event, dialog) => {
        const root = dialog.element;
        const customRadio = root.querySelector('input[name="karmaChoice"][value="custom"]');
        const customInput = root.querySelector('input[name="customAmount"]');
        root.querySelectorAll('input[name="karmaChoice"]').forEach(r => {
          r.addEventListener('change', () => {
            customInput.disabled = !customRadio.checked;
            if (customRadio.checked) customInput.focus();
          });
        });
      },
      buttons: [
        {
          action: "commit",
          icon: "fas fa-check",
          label: `Commit Karma`,
          default: true,
          callback: async (event, button, dialog) => {
            const root = dialog.element;
            const selected = root.querySelector('input[name="karmaChoice"]:checked');
            let extra = minCommit;
            if (selected) {
              if (selected.value === 'custom') {
                const customInput = root.querySelector('input[name="customAmount"]');
                const maxUseful = Math.min(maxAfterBase, Math.max(minCommit, 100 - rollResult));
                extra = Math.max(minCommit, Math.min(maxUseful, Number(customInput.value) || minCommit));
              } else {
                extra = Number(selected.value) || minCommit;
              }
            }
            const finalResult = rollResult + extra;
            const finalColor = game.msh.rollUniversalTable(resolved.rank, finalResult);
            const success = this._checkFeatSuccess(String(finalColor || '').toLowerCase(), featColor);
            await this._finalizeStuntRoll(stunt, stuntIndex, resolved, rollResult, featColor, extra, baseCost, success, initialColor);
            return "committed";
          }
        }
      ],
      rejectClose: false
    });
    // Dialog closed without committing: the roll was made, so per RAW the
    // 100 attempt cost and the declared minimum are still spent.
    if (result !== "committed") {
      const finalColor = game.msh.rollUniversalTable(resolved.rank, rollResult + minCommit);
      const success = this._checkFeatSuccess(String(finalColor || '').toLowerCase(), featColor);
      await this._finalizeStuntRoll(stunt, stuntIndex, resolved, rollResult, featColor, minCommit, baseCost, success, initialColor);
    }
  }

  _computeBreakpoints(rollResult, rank, featColor, minCommit, maxAfterBase) {
    const targets = [
      { name: 'green',  label: 'Reach GREEN',  color: '#2e7d32' },
      { name: 'yellow', label: 'Reach YELLOW', color: '#f57f17' },
      { name: 'red',    label: 'Reach RED',    color: '#c62828' }
    ];
    const result = [];
    const feat = featColor.toLowerCase();
    // Always include minimum commitment.
    const minRoll = Math.min(100, rollResult + minCommit);
    const minColor = String(game.msh.rollUniversalTable(rank, minRoll) || '').toLowerCase();
    result.push({
      amount: minCommit,
      label: `Minimum commitment`,
      color: '#666',
      resultColor: minColor,
      preferred: true
    });

    for (const t of targets) {
      const karma = this._karmaToReach(rollResult, rank, t.name);
      if (karma === null) continue;
      if (karma <= minCommit) continue;
      if (karma > maxAfterBase) continue;
      const rc = String(game.msh.rollUniversalTable(rank, rollResult + karma) || '').toLowerCase();
      result.push({
        amount: karma,
        label: t.label,
        color: t.color,
        resultColor: rc,
        preferred: false
      });
    }
    return result;
  }

  _karmaToReach(rollResult, rank, targetColor) {
    const target = targetColor.toLowerCase();
    for (let k = 1; k + rollResult <= 100; k++) {
      const c = String(game.msh.rollUniversalTable(rank, rollResult + k) || '').toLowerCase();
      if (c === target) return k;
      // Also count higher colors as "reaching" the lower target
      const h = { white: 0, green: 1, yellow: 2, red: 3 };
      if ((h[c] ?? 0) >= (h[target] ?? 0)) return k;
    }
    return null;
  }

  async _finalizeStuntRoll(stunt, stuntIndex, resolved, rollResult, featColor, extraKarma, baseCost, success, initialColor) {
    const totalKarma = baseCost + extraKarma;
    const finalResult = rollResult + extraKarma;
    const finalColor = extraKarma > 0 ? game.msh.rollUniversalTable(resolved.rank, finalResult) : initialColor;

    const bg = success ? '#e8f5e9' : '#ffebee';
    const fg = success ? '#2e7d32' : '#c62828';

    const cardHtml = `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#8b0000;">
          <strong>${this.actor.name} — Power Stunt</strong>
        </div>
        <div style="padding:5px 10px;border-bottom:1px solid #e0e0e0;font-size:.9em;">
          <div><strong>Stunt:</strong> ${stunt.name}</div>
          ${resolved.powerName ? `<div><strong>Parent Power:</strong> ${resolved.powerName}</div>` : ''}
        </div>
        <div style="padding:5px 10px;font-size:.9em;">
          <div>Rank: ${resolved.rank} (${resolved.value})</div>
          <div>Difficulty: ${featColor} FEAT</div>
          <div>Roll: ${rollResult}${extraKarma > 0 ? ` + ${extraKarma} Karma = ${finalResult}` : ''}</div>
          <div>Color: ${String(initialColor).toUpperCase()}${extraKarma > 0 ? ` → ${String(finalColor).toUpperCase()}` : ''}</div>
          <div>Times Attempted: ${stunt.timesUsed} → ${stunt.timesUsed + 1}</div>
          <div>Total Karma Spent: ${totalKarma} (${baseCost} attempt${extraKarma > 0 ? ` + ${extraKarma} boost` : ''})</div>
        </div>
        <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.05em;border-radius:3px;background:${bg};color:${fg};">
          RESULT: ${success ? 'SUCCESS' : 'FAILURE'}
        </div>
        ${success ? `
          <div style="padding:6px 10px;margin:6px 10px;background:#e8f5e9;border:1px solid #66bb6a;border-radius:3px;">
            <div style="font-weight:bold;color:#2e7d32;">Power Stunt Successful</div>
            <div style="font-size:.9em;">${stunt.description || 'The power stunt works as intended!'}</div>
          </div>
        ` : `
          <div style="padding:6px 10px;margin:6px 10px;background:#ffebee;border:1px solid #ef5350;border-radius:3px;">
            <div style="font-weight:bold;color:#c62828;">Power Stunt Failed</div>
            <div style="font-size:.9em;">The stunt does not work as intended. The Judge will determine the specific effects of the failure.</div>
          </div>
        `}
      </div>
    `;

    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: cardHtml
    });

    const karmaEvent = {
      timestamp: new Date().toISOString(),
      realDate: new Date().toLocaleDateString(),
      gameDate: "",
      amount: -totalKarma,
      type: "Power Stunt",
      description: `${stunt.name}${resolved.powerName ? ` (${resolved.powerName})` : ''} - ${success ? 'Success' : 'Failed'}${extraKarma > 0 ? ` (+${extraKarma} boost)` : ''}`
    };

    const stunts = foundry.utils.deepClone(this.actor.system.stunts);
    if (success) stunts[stuntIndex].timesUsed += 1;

    const history = foundry.utils.deepClone(this.actor.system.karma?.history || []);
    history.push(karmaEvent);

    await this.actor.update({
      "system.stunts": stunts,
      "system.karma.history": history
    });

    if (stunts[stuntIndex].timesUsed >= POWER_STUNT_MASTERY) {
      ui.notifications.info(`${stunt.name} is now MASTERED! No future cost or roll required.`);
    }

    if (success) await runStuntMechanic(this.actor, stunts[stuntIndex]);
  }

  async _incrementStuntUsage(stuntIndex) {
    const stunts = foundry.utils.deepClone(this.actor.system.stunts);
    stunts[stuntIndex].timesUsed += 1;
    await this.actor.update({ "system.stunts": stunts });
  }
}
