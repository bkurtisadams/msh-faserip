// Test Effect System Macro
// Select a token, then run this macro to test all effect types
// Opens a dialog to apply/remove effects and verify changes arrays

(async () => {
  const token = canvas.tokens.controlled[0];
  if (!token?.actor) {
    ui.notifications.warn("Select a token first!");
    return;
  }
  
  const actor = token.actor;
  const effectEngine = await import("/systems/msh-faserip/scripts/modules/effects/effect-engine.js");
  const effectMods = await import("/systems/msh-faserip/scripts/modules/effects/effect-modifiers.js");
  
  // Effect test configurations
  const effects = [
    { name: "Stunned", fn: () => effectEngine.applyStun(actor, { rounds: 3 }) },
    { name: "Prone", fn: () => effectEngine.applyProne(actor, { rounds: 2 }) },
    { name: "Grappled", fn: () => effectEngine.applyGrappled(actor, { holderName: "Test Holder", rounds: null }) },
    { name: "Held", fn: () => effectEngine.applyHeld(actor, { holderName: "Test Holder", rounds: null }) },
    { name: "Entangled", fn: () => effectEngine.applyEntangled(actor, { materialRank: "Remarkable", rounds: null }) },
    { name: "Blinded", fn: () => effectEngine.applyBlinded(actor, { rounds: 3 }) },
    { name: "Unconscious", fn: () => effectEngine.applyUnconscious(actor, { rounds: 5 }) },
    { name: "Evading", fn: () => effectEngine.applyEvade(actor, { target: "Test Enemy" }) },
    { name: "Blocking", fn: () => effectEngine.applyBlock(actor, { armorRank: "Excellent", armorValue: 20 }) },
    { name: "Charging", fn: () => effectEngine.applyCharging(actor, { rounds: 1 }) },
    { name: "Dying", fn: () => effectEngine.applyDying(actor) },
    { name: "Slam (Stagger)", fn: () => effectEngine.applySlam(actor, { kind: "Stagger", stagger: true }) },
    { name: "Slam (1 Area)", fn: () => effectEngine.applySlam(actor, { kind: "1 Area", prone: true }) },
    { name: "Slam (Grand Slam)", fn: () => effectEngine.applySlam(actor, { kind: "Grand Slam", knockbackAreas: 3 }) }
  ];
  
  // Build button HTML
  const buttonHtml = effects.map((e, i) => 
    `<button type="button" class="apply-effect" data-index="${i}" style="margin:2px;padding:4px 8px;">${e.name}</button>`
  ).join("");
  
  const content = `
    <div style="margin-bottom:10px;">
      <strong>Target:</strong> ${actor.name}
    </div>
    
    <div style="margin-bottom:10px;">
      <strong>Current combatMods:</strong>
      <pre style="font-size:10px;background:#f5f5f5;padding:5px;max-height:150px;overflow:auto;">${JSON.stringify(actor.system.combatMods, null, 2)}</pre>
    </div>
    
    <div style="margin-bottom:10px;">
      <strong>Apply Effects:</strong><br>
      ${buttonHtml}
    </div>
    
    <div style="margin-bottom:10px;">
      <button type="button" class="clear-all" style="background:#f44336;color:white;padding:6px 12px;">Clear All Effects</button>
      <button type="button" class="show-mods" style="background:#2196f3;color:white;padding:6px 12px;">Show Current Modifiers</button>
      <button type="button" class="list-effects" style="background:#4caf50;color:white;padding:6px 12px;">List Active Effects</button>
    </div>
    
    <div id="effect-log" style="font-size:11px;background:#333;color:#0f0;padding:8px;max-height:200px;overflow:auto;font-family:monospace;">
      Ready...
    </div>
  `;
  
  const dlg = new Dialog({
    title: "Effect System Tester",
    content,
    buttons: {
      close: { label: "Close" }
    },
    render: (html) => {
      const log = html.find("#effect-log");
      const addLog = (msg) => {
        log.append(`<div>${new Date().toLocaleTimeString()}: ${msg}</div>`);
        log.scrollTop(log[0].scrollHeight);
      };
      
      // Apply effect buttons
      html.find(".apply-effect").click(async (ev) => {
        const idx = parseInt(ev.currentTarget.dataset.index);
        const eff = effects[idx];
        addLog(`Applying ${eff.name}...`);
        try {
          const created = await eff.fn();
          if (created) {
            addLog(`SUCCESS: ${created.name} (${created.changes?.length || 0} changes)`);
            if (created.changes?.length > 0) {
              created.changes.forEach(c => {
                addLog(`  - ${c.key}: ${c.value} (mode ${c.mode})`);
              });
            }
          } else {
            addLog(`FAILED: No effect created`);
          }
        } catch (err) {
          addLog(`ERROR: ${err.message}`);
          console.error(err);
        }
      });
      
      // Clear all effects
      html.find(".clear-all").click(async () => {
        const count = actor.effects.size;
        addLog(`Clearing ${count} effects...`);
        const ids = actor.effects.map(e => e.id);
        await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
        addLog(`Cleared!`);
      });
      
      // Show current modifiers
      html.find(".show-mods").click(() => {
        const mods = effectMods.getActiveModifiers(actor);
        addLog(`--- Current Modifiers ---`);
        addLog(`Attack Shift: ${mods.attackShift}`);
        addLog(`Defense Shift: ${mods.defenseShift}`);
        addLog(`Can Act: ${mods.canAct}`);
        addLog(`Can Move: ${mods.canMove}`);
        addLog(`Movement Mult: ${mods.movementMult}`);
        for (const [ab, shift] of Object.entries(mods.abilityShifts)) {
          if (shift !== 0) addLog(`  ${ab}: ${shift}`);
        }
        addLog(`Summary: ${effectMods.getModifierSummary(actor)}`);
      });
      
      // List active effects
      html.find(".list-effects").click(() => {
        addLog(`--- Active Effects (${actor.effects.size}) ---`);
        for (const eff of actor.effects) {
          if (eff.disabled) continue;
          addLog(`${eff.name}: ${eff.changes?.length || 0} changes`);
          eff.changes?.forEach(c => {
            addLog(`  ${c.key} = ${c.value}`);
          });
        }
      });
    }
  }, { width: 500, height: 600 });
  
  dlg.render(true);
})();