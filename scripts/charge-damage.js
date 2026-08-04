// charge-damage.js v1.1.0 - 2026-07-31
// v1.1.0: Delete dead legacy .calculate-slam-collision handler body (was
//         return-gated; caused "unreachable code" console warning). Live
//         handler is chat-hooks.js:712.
// charge-damage.js v1.0.1 - 2025-12-23
// v1.0.1: Disable legacy .calculate-slam-collision handler (now handled by chat-hooks.js + collision-damage.js)

import { 
  resolveSlamFeat, 
  resolveStunFeat, 
  getGrandSlamDistance 
} from './modules/combat/damage-resolution.js';
// At the top of charge-damage.js with other imports
import { ActionDispatcher } from "./modules/actions/action-dispatcher.js";
import { applyDamageToTargets } from "./modules/actions/action-utils.js";
export function initializeSlamHandlers() {
    if (game.msh?.slamHandlersInstalled) return;
    game.msh ??= {};
    game.msh.slamHandlersInstalled = true;
    console.log("🔧 initializeSlamHandlers() called");
    // Add event listener for collision damage calculation
    Hooks.on("renderChatMessageHTML", (message, htmlEl) => {
        
        // Handle slam FEAT rolls - FIXED
        htmlEl.querySelectorAll('.resolve-slam-feat').forEach(el => el.addEventListener('click', async function() {
            console.log("🎲 Slam FEAT button clicked");
            const targetUuid = this.dataset.target;
            const attackerStrength = parseInt(this.dataset.attackerStrength);
            
            const targetActor = await fromUuid(targetUuid);
            if (!targetActor) {
                ui.notifications.error("Target actor not found!");
                return;
            }
            
            // Make the actual Endurance FEAT roll - FIXED
            const enduranceRank = targetActor.system.abilities?.endurance?.rank || "Typical";
            const rollValue = Math.ceil(Math.random() * 100);
            
            // Create a simple chat message for the roll instead of using roll.toMessage
            await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: targetActor }),
                content: `
                    <div style="background-color: #e8f5e8; border: 1px solid #4caf50; border-radius: 3px; padding: 8px;">
                        <strong>🎲 ${targetActor.name} Slam Endurance FEAT</strong><br>
                        Rank: ${enduranceRank}<br>
                        Roll: <strong>${rollValue}</strong>
                    </div>
                `
            });
            
            // Resolve the slam effect based on the roll
            const color = game.faserip?.getResultColor(enduranceRank, rollValue) || 'white';
            const slamResult = resolveSlamFeat({
                targetEnduranceRank: enduranceRank,
                targetEnduranceValue: targetActor.system.abilities?.endurance?.value || 6,
                attackerStrength: attackerStrength,
                penetratingDamage: 1,
                roll: rollValue
            });
            
            // Show the slam result
            await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: targetActor }),
                content: `
                    <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 3px; padding: 10px;">
                        <strong>🎯 Slam Result for ${targetActor.name}:</strong><br>
                        Roll: ${rollValue} → ${color.toUpperCase()}<br>
                        Effect: <strong>${slamResult.effect}</strong><br>
                        ${slamResult.knockbackDistance > 0 ? `Knockback: ${slamResult.knockbackDistance} areas<br>` : ''}
                        ${slamResult.description}
                        ${slamResult.knockbackDistance > 0 ? `
                            <button class="calculate-slam-collision" 
                                    data-target="${targetActor.uuid}" 
                                    data-distance="${slamResult.knockbackDistance}" 
                                    data-speed="${slamResult.knockbackDistance}" 
                                    data-attacker-strength="${attackerStrength}"
                                    style="margin-top: 8px; padding: 5px 10px; background: #d4af37; border: 1px solid #b8941f; border-radius: 3px; cursor: pointer; font-weight: bold;">
                                🎯 Calculate Collision Damage
                            </button>
                        ` : ''}
                    </div>
                `
            });
            
            // Disable the button
            this.disabled = true; this.textContent = 'FEAT Rolled';
        }));

        // Handle stun FEAT rolls - FIXED
        htmlEl.querySelectorAll('.resolve-stun-feat').forEach(el => el.addEventListener('click', async function() {
            console.log("😵 Stun FEAT button clicked");
            const targetUuid = this.dataset.target;
            const attackerStrength = parseInt(this.dataset.attackerStrength);
            
            const targetActor = await fromUuid(targetUuid);
            if (!targetActor) {
                ui.notifications.error("Target actor not found!");
                return;
            }
            
            // Make the actual Endurance FEAT roll for stun - FIXED
            const enduranceRank = targetActor.system.abilities?.endurance?.rank || "Typical";
            const rollValue = Math.ceil(Math.random() * 100);
            
            // Create a simple chat message for the roll
            await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: targetActor }),
                content: `
                    <div style="background-color: #f3e5f5; border: 1px solid #ce93d8; border-radius: 3px; padding: 8px;">
                        <strong>🎲 ${targetActor.name} Stun Endurance FEAT</strong><br>
                        Rank: ${enduranceRank}<br>
                        Roll: <strong>${rollValue}</strong>
                    </div>
                `
            });
            const stunResult = resolveStunFeat({
                targetEnduranceRank: enduranceRank,
                targetEnduranceValue: targetActor.system.abilities?.endurance?.value || 6,
                penetratingDamage: 1,
                roll: rollValue
            });
            const slamResult   = resolveSlamFeat({
                targetEnduranceRank: enduranceRank,
                targetEnduranceValue: targetActor.system.abilities?.endurance?.value || 6,
                attackerStrength: attackerStrength,
                penetratingDamage: 1,
                roll: rollValue
            });
            
            // Show the stun result
            let stunContent = `
                <div style="background-color: #f3e5f5; border: 1px solid #ce93d8; border-radius: 3px; padding: 10px;">
                    <strong>😵 Stun Result for ${targetActor.name}:</strong><br>
                    Roll: ${rollValue} → ${color.toUpperCase()}<br>
                    Stun Effect: <strong>${stunResult.effect}</strong><br>
                    ${stunResult.stunDuration > 0 ? `Duration: ${stunResult.stunDuration} rounds<br>` : ''}
                    ${stunResult.description}<br>
            `;
            
            // Add slam information if applicable
            if (slamResult.effect !== "No Slam") {
                stunContent += `
                    <br><strong>Also includes slam:</strong> ${slamResult.effect}<br>
                    ${slamResult.knockbackDistance > 0 ? `Knockback: ${slamResult.knockbackDistance} areas<br>` : ''}
                `;
            }
            
            stunContent += `</div>`;
            
            // Add collision button if there's knockback
            if (slamResult.knockbackDistance > 0) {
                stunContent = stunContent.replace('</div>', `
                    <button class="calculate-slam-collision" 
                            data-target="${targetActor.uuid}" 
                            data-distance="${slamResult.knockbackDistance}" 
                            data-speed="${slamResult.knockbackDistance}" 
                            data-attacker-strength="${attackerStrength}"
                            style="margin-top: 8px; padding: 5px 10px; background: #d4af37; border: 1px solid #b8941f; border-radius: 3px; cursor: pointer; font-weight: bold;">
                        🎯 Calculate Collision Damage
                    </button>
                </div>`);
            }
            
            await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: targetActor }),
                content: stunContent
            });
            
            // Disable the button
            this.disabled = true; this.textContent = 'FEAT Rolled';
        }));

        // Legacy .calculate-slam-collision handler removed — collision damage
        // is handled by chat-hooks.js + collision-damage.js.
    }); // end of Hooks.on("renderChatMessageHTML")
}