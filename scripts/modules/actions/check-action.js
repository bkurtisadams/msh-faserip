// scripts/modules/actions/check-action.js
import { BaseAction } from "./base-action.js";
import {
  RANKS,
  shiftRank,
  labelFor,
  effectsFor,
  buildResultGrid,
  bannerColors,
  getAbilityInfo,
} from "./action-utils.js";

/**
 * CheckAction covers: "stun" | "slam" | "kill"
 * Dispatcher must call: new CheckAction({ actor, actionType, opts })
 */
export class CheckAction extends BaseAction {
  constructor(a) {
    // Expect a single config object: { actor, actionType, abilityName?, opts? }
    // abilityName is unused (checks are rolled on TARGET Endurance), but accepted for symmetry
    if (!a || typeof a !== "object") throw new Error("CheckAction requires a config object.");
    const { actor, actionType, abilityName = "endurance", opts = {} } = a;
    super({ actor, abilityName, opts });
    this.actionType = actionType;
  }

  async execute() {
    const actor       = this.actor;
    const actionType  = this.actionType; // "stun" | "slam" | "kill"
    const actionName  = labelFor(actionType);
    const effects     = effectsFor(actionType);

    // Pull the attacker's Strength rank (used for Slam context)
    const attackerStr = getAbilityInfo(actor, "strength");

    // Extract prefill data from opts (passed from chat hook)
    const prefill = this.opts.prefill || {};
    const prefilledTargetName = prefill.targetName || "";
    const prefilledTargetEndRank = prefill.targetEndRank || "Good";
    const prefilledDmgThrough = prefill.dmgThrough || 0;
    const prefilledAttackForm = prefill.attackForm || "blunt";

    // --- Dialog: gather target info & context ---
    const targetRanks = RANKS.map(r => `<option value="${r}" ${r===prefilledTargetEndRank?'selected':''}>${r}</option>`).join("");
    const attackFormOptions = ["blunt","edged","shooting","throwing","energy","force","charging","wrestling"]
      .map(f => `<option value="${f}" ${f===prefilledAttackForm?'selected':''}>${f.charAt(0).toUpperCase() + f.slice(1)}</option>`).join("");
    
    const dialogHtml = `
      <div style="margin-bottom:8px;"><label style="display:inline-block;width:130px;">Check:</label><strong>${actionName}</strong></div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Target (label):</label>
        <input type="text" name="targetName" style="width:220px;" placeholder="e.g., Doctor Doom" value="${prefilledTargetName}">
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Target Endurance:</label>
        <select name="targetEndRank" style="width:180px;">${targetRanks}</select>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Column Shift (on target):</label>
        <input type="number" name="shift" value="0" style="width:60px;">
        <span style="color:#666;font-size:.9em;">(+ easier, - harder for target)</span>
      </div>

      <div style="margin-bottom:10px;padding:6px;border:1px solid #ddd;background:#fafafa;border-radius:3px;">
        <div style="font-weight:bold;margin-bottom:6px;">Damage Gate</div>
        <div style="margin-bottom:6px;">
          <label style="display:inline-block;width:130px;">Damage that penetrated:</label>
          <input type="number" name="dmgThrough" value="${prefilledDmgThrough}" min="0" style="width:80px;">
          <span style="color:#666;font-size:.9em;">(after Armor/Fields/Resistances)</span>
        </div>
        <div>
          <label><input type="checkbox" name="borderline"> Apply borderline allowance (tie still affects)</label>
        </div>
        <div style="color:#666;font-size:.85em;margin-top:4px;">
          Effects only apply if some damage penetrates; in borderline ties, they still apply.
        </div>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Karma (target spend):</label>
        <input type="number" name="karma" value="0" min="0" style="width:60px;">
        <span style="color:#666;font-size:.85em;">(only up to 100 total; history not recorded unless you roll as this actor)</span>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:inline-block;width:130px;">Attack Form:</label>
        <select name="attackForm" style="width:220px;">${attackFormOptions}</select>
        <span style="color:#666;font-size:.85em;">(Kill: E/S applies to Edged or Shooting only)</span>
      </div>

      ${actionType === "slam" ? `
        <div style="margin:8px 0 0;padding:6px;border:1px dashed #bbb;border-radius:3px;background:#fff;">
          <div style="font-weight:bold;">Slam context</div>
          <div>Attacker Strength: <strong>${attackerStr.rank}</strong> (${attackerStr.value})</div>
          <div style="color:#666;font-size:.85em;">Grand Slam travel ≈ attacker's Strength as ground speed (e.g., Unearthly ≈ 10 areas).</div>
        </div>
      ` : ``}

      <div style="margin-top:10px;">
        <label><input type="checkbox" name="skipDice"> Skip dice animation</label>
      </div>
      
      ${prefilledTargetName ? `<div style="margin-top:8px;padding:4px;background:#e8f5e9;border:1px solid #4CAF50;border-radius:3px;font-size:.85em;color:#2e7d32;">✓ Auto-populated from targeted token</div>` : ""}
    `;

    const choice = await new Promise((resolve) => {
      new Dialog({
        title: `${actionName} Check`,
        content: dialogHtml,
        buttons: {
          roll: {
            label: "Roll",
            callback: (html) => {
              const $ = (sel)=> html.find(sel);
              resolve({
                targetName: String($('[name="targetName"]').val() || "Target"),
                targetEndRank: String($('[name="targetEndRank"]').val() || "Good"),
                shift: Number($('[name="shift"]').val() || 0),
                dmgThrough: Number($('[name="dmgThrough"]').val() || 0),
                borderline: !!$('[name="borderline"]').is(':checked'),
                karma: Number($('[name="karma"]').val() || 0),
                attackForm: String($('[name="attackForm"]').val() || "blunt"),
                skipDice: !!$('[name="skipDice"]').is(':checked'),
              });
            }
          },
          cancel: { label: "Cancel", callback: ()=> resolve(null) }
        },
        default: "roll"
      }).render(true);
    });
    if (!choice) return;

    // --- Damage gate: effects only if dmg > 0 (or borderline toggle) ---
    const effectGateOpen = (choice.dmgThrough > 0) || !!choice.borderline;
    const effectsSuppressed = !effectGateOpen;  // <-- MOVE THIS UP HERE

    // --- Target FEAT rank after column shifts ---
    const effectiveEndRank = shiftRank(choice.targetEndRank, choice.shift);

    // --- Roll d100 (target's FEAT); cap with "spend up to 100" locally (no history unless you choose to use the actor) ---
    const roll = await (new Roll("1d100")).evaluate();
    if (!choice.skipDice) {
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `${choice.targetName} rolls Endurance vs ${actionName}`,
        rollMode: game.settings.get("core", "rollMode")
      });
    }
    const needTo100 = Math.max(0, 100 - roll.total);
    const karmaSpend = Math.min(Math.max(0, choice.karma || 0), needTo100);
    const cappedTotal = Math.min(100, roll.total + karmaSpend);

    // --- Determine color/result on target's Endurance ---
    const color = game.msh.rollUniversalTable(effectiveEndRank, cappedTotal);
    const colorLower = String(color||"").toLowerCase();
    const baseEffect = effects[colorLower] || color;

    // --- Special handling for Stun White result: auto-roll 1d10 for duration ---
    // In check-action.js, around line 150-200, replace the stun duration section with:

    // --- Special handling for Stun White result: auto-roll 1d10 for duration ---
    let stunDuration = null;
    let rawStunDuration = null;
    if (actionType === "stun" && colorLower === "white" && !effectsSuppressed) {
      const durationRoll = await (new Roll("1d10")).evaluate();
      rawStunDuration = durationRoll.total;
      
      // Apply house rule cap
      const maxStunDuration = game.settings.get('msh-faserip', 'maxStunDuration') || 10;
      stunDuration = Math.min(rawStunDuration, maxStunDuration);
      
      // Show the d10 roll in chat
      await durationRoll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `${choice.targetName} Stun Duration (1d10)${rawStunDuration > stunDuration ? ` - Capped at ${maxStunDuration}` : ''}`,
        rollMode: game.settings.get("core", "rollMode")
      });
    }

    // --- Apply special Kill "E/S" rule ---
    let finalEffect = baseEffect;
    if (actionType === "kill" && baseEffect) {
      // E/S only applies if attack form is Edged or Shooting; otherwise treat as No Effect
      if (String(baseEffect).toUpperCase() === "E/S") {
        const isEdgedOrShooting = (choice.attackForm === "edged" || choice.attackForm === "shooting");
        finalEffect = isEdgedOrShooting ? "Endurance Loss (E/S)" : "No effect";
      }
    }

    // --- If no damage penetrated (and not borderline), effects are negated ---
    if (effectsSuppressed) {
      finalEffect = "No effect (no damage penetrated)";
    }

    // --- Build visual grid/banners using your helper maps ---
    const grid = buildResultGrid(actionType, colorLower, effects, (globalThis._getResultHoverText||this._getResultHoverText));
    const { bg, fg } = bannerColors(colorLower);

    // --- Extra explanatory block per check type ---
    const extraHtml = this._extraExplanationHtml({
      actionType, 
      choice, 
      attackerStr, 
      colorLower, 
      effectiveEndRank, 
      finalEffect, 
      effectsSuppressed, 
      stunDuration,
      rawStunDuration
    });

    const shortAction = String(actionName).replace(/\s*check$/i, "");

    // --- Final chat card ---
    const cardHtml = `
      <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.1em;color:#4e342e;">
          <strong>${actor.name} - ${shortAction} Check vs ${choice.targetName}</strong>
        </div>

        <div style="padding:5px 10px;font-size:.9em;">
          <div>Target Endurance: ${choice.targetEndRank}${choice.shift ? ` — Shift ${choice.shift} → ${effectiveEndRank}` : ""}</div>
          <div>Attack Form: ${choice.attackForm}${actionType==="slam" ? ` — Attacker STR: ${attackerStr.rank} (${attackerStr.value})` : ""}</div>
          <div>Damage Penetrated: ${choice.dmgThrough}${choice.borderline ? " (borderline allowed)" : ""}</div>
          <div>Roll: ${roll.total}${karmaSpend ? ` + Karma: ${karmaSpend}` : ""} = ${cappedTotal}</div>
        </div>

        ${grid}

        <div style="text-align:center;padding:8px;margin:5px;font-weight:bold;font-size:1.1em;border-radius:3px;background:${bg};color:${fg};">
          RESULT: ${String(color).toUpperCase()} — ${String(finalEffect).toUpperCase()}
        </div>

        ${extraHtml}
      </div>
    `;

    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: cardHtml });
  }

  _extraExplanationHtml({ actionType, choice, attackerStr, colorLower, effectiveEndRank, finalEffect, effectsSuppressed, stunDuration = null, rawStunDuration = null }) {
    // Slam: show movement/dir rules; Stun: durations; Kill: E/S clarification
    if (actionType === "slam") {
      // Map Universal Table colors to Slam effects per the rules
      // If no penetration (and not borderline), don't render any Slam effect block
      if (effectsSuppressed) {
        return `
          <div style="padding:6px 10px;margin:6px 10px;background:#ffcdd2;border:1px solid #b71c1c;border-radius:3px;color:#b71c1c;">
            <strong>Note:</strong> No damage penetrated defenses — Slam effects do not apply.
          </div>
        `;
      }
      const slamEffects = {
        white: {
          name: "Grand Slam",
          desc: `Target is knocked away with speed equal to attacker's Strength as ground speed. With ${attackerStr.rank} Strength (${attackerStr.value}), this translates to approximately ${this._strengthToAreas(attackerStr.rank)} areas of travel.`,
          direction: choice.dmgThrough > 0 ? "Attacker chooses direction (any compass direction, straight up, or straight down)." : "Defender chooses direction."
        },
        green: {
          name: "1 Area",
          desc: "Target is knocked one area away (ranged or area movement).",
          direction: choice.dmgThrough > 0 ? "Attacker chooses direction (any compass direction, straight up, or straight down)." : "Defender chooses direction (likely avoiding teammates, buildings, and obstacles)."
        },
        yellow: {
          name: "Stagger",
          desc: "Target is knocked back a step or two, perhaps to one knee, but is fully capable of combat next round. Target is no longer adjacent to attacker.",
          direction: "No forced movement beyond stepping back. Target may suffer situational damage (e.g., staggering off a cliff edge)."
        },
        red: {
          name: "No Slam",
          desc: "Target is not affected by the Slam. Target still takes damage as normal.",
          direction: "No movement."
        }
      };

      const effect = slamEffects[colorLower] || slamEffects.red;
      
      // Show collision button for Grand Slam and 1 Area
      const showCollisionButton = (colorLower === 'white' || colorLower === 'green') && !effectsSuppressed;

      return `
        <div style="padding:6px 10px;margin:6px 10px;background:#fffde7;border:1px solid #f9a825;border-radius:3px;">
          <div style="font-weight:bold;margin-bottom:6px;">Slam Result: ${effect.name}</div>
          
          <div style="margin-bottom:6px;">
            <strong>Effect:</strong> ${effect.desc}
          </div>
          
          <div style="margin-bottom:6px;">
            <strong>Direction:</strong> ${effect.direction}
          </div>
          
          ${showCollisionButton ? `
            <div style="margin-top:8px;padding:4px;background:#ffebee;border:1px solid #ef5350;border-radius:3px;">
              <strong>⚠ Collision Damage:</strong> If the target slams into a building, wall, or other obstruction, they take damage as if making a Charging attack against that object. Buildings and obstructions affect movement speed as per normal movement rules.
            </div>
            
            <div style="margin-top:8px;text-align:center;">
              <a class="faserip-chip" 
                data-action="calculate-collision"
                data-target-name="${choice.targetName}"
                data-target-endurance="${choice.targetEndRank}"
                data-slam-distance="${colorLower === 'white' ? this._strengthToAreas(attackerStr.rank) : 1}"
                title="Calculate damage if target collides with an obstacle"
                style="display:inline-block;font-size:12px;line-height:1.1;padding:4px 10px;border:1px solid #ef5350;border-radius:3px;background:#fff;color:#d32f2f;text-decoration:none;cursor:pointer;font-weight:bold;">
                🧮 Calculate Collision Damage
              </a>
            </div>
          ` : ''}
          
          ${effectsSuppressed ? `
            <div style="margin-top:8px;padding:4px;background:#ffcdd2;border:1px solid #b71c1c;border-radius:3px;color:#b71c1c;">
              <strong>Note:</strong> No damage penetrated defenses → Slam effects do not apply (per rules: "For any one of these three results to be effective on a target, the attacker must inflict some damage on the target").
            </div>
          ` : ''}
          
          <div style="margin-top:8px;font-size:.85em;color:#666;">
            <strong>Attacker Context:</strong> ${this.actor.name} (Strength: ${attackerStr.rank} = ${attackerStr.value})
          </div>
        </div>
      `;
    }

    if (actionType === "stun") {
      const lines = {
        white: stunDuration 
          ? `<strong>${stunDuration} rounds Stunned</strong> — Target can take no actions for ${stunDuration} round${stunDuration > 1 ? 's' : ''}.`
          : "1–10 rounds Stunned — roll 1d10; no actions.",
        green: "1 round Stunned — no action next round (can \"play possum\").",
        yellow: "No effect.",
        red: "No effect."
      };
      
      return `
        <div style="padding:6px 10px;margin:6px 10px;background:#e3f2fd;border:1px solid #1e88e5;border-radius:3px;">
          <div style="font-weight:bold;margin-bottom:4px;">Stun Details</div>
          <div>${lines[colorLower] || ""}</div>
          ${stunDuration && colorLower === 'white' ? `
            <div style="margin-top:8px;padding:6px;background:#fff9c4;border:1px solid #fbc02d;border-radius:3px;">
              <strong>🎲 Duration Roll: ${stunDuration} round${stunDuration > 1 ? 's' : ''}</strong>
              ${rawStunDuration && rawStunDuration > stunDuration ? `<div style="font-size:0.85em;color:#f57c00;margin-top:2px;">(Rolled ${rawStunDuration}, capped by house rule at ${stunDuration})</div>` : ''}
              <div style="font-size:0.85em;color:#666;margin-top:4px;">Target is knocked out and can take no actions.</div>
            </div>
          ` : ''}
          ${effectsSuppressed ? `<div style="margin-top:6px;color:#b71c1c;"><strong>Note:</strong> No damage penetrated → Stun does not apply.</div>` : ""}
        </div>
      `;
    }

    if (actionType === "kill") {
      const lines = {
        white: "Endurance Loss — target loses 1 Endurance rank and is dying; loses 1 rank per turn until stabilized.",
        green: "E/S — Endurance Loss only if attack form is Edged (Slugfest) or Shooting; otherwise No Effect.",
        yellow: "No effect.",
        red: "No effect."
      };
      const esNote = (String(finalEffect).toLowerCase().includes("endurance loss"))
        ? `<div style="color:#b71c1c;margin-top:6px;">Karma note: A hero who kills loses all Karma.</div>`
        : "";

      return `
        <div style="padding:6px 10px;margin:6px 10px;background:#f1f8e9;border:1px solid #7cb342;border-radius:3px;">
          <div style="font-weight:bold;">Kill Details</div>
          <div>${lines[colorLower] || ""}</div>
          ${effectsSuppressed ? `<div style="margin-top:6px;color:#b71c1c;"><strong>Note:</strong> No damage penetrated → Kill does not apply.</div>` : ""}
          ${esNote}
        </div>
      `;
    }

    return "";
  }

  // Helper method to estimate areas from Strength value
  _strengthToAreas(strRank) {
    // Official FASERIP land speed (areas per round) based on Strength rank name
    const speedByRank = {
      "Shift-0": 1,
      "Feeble": 1,
      "Poor": 2,
      "Typical": 3,
      "Good": 4,
      "Excellent": 5,
      "Remarkable": 6,
      "Incredible": 7,
      "Amazing": 8,
      "Monstrous": 9,
      "Unearthly": 10,
      "Shift-X": 12,
      "Shift-Y": 14,
      "Shift-Z": 16,
      "Class 1000": 32,
      "Class 3000": 50,
      "Class 5000": 100
    };
    
    return speedByRank[strRank] || 1;
  }

}