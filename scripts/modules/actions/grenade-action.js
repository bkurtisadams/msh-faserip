// scripts/modules/actions/grenade-action.js v1.3.0 - 2026-02-22
// v1.2.0: Item category changed to "other" with weaponType="grenade"; reads grenadeType from item; template auto-target
import { RangedAttackAction } from "./ranged-attack-action.js";
import { AreaTemplate } from "./area-template.js";
import {
  getAbilityInfo,
  labelFor,
  shiftRank,
  rollWithKarmaAndHistory,
  bannerColors,
  getTargetData,
  applyDamageToTargets,
  buildModeSelector,
  setupModeSelector,
  attachAutoFillRange
} from "./action-utils.js";
import {
  generateKarmaControlsHTML,
  setupKarmaControlHandlers,
  extractKarmaFromDialog,
  getAvailableKarma,
  getMinimumKarmaCommitment
} from "../dice/dice-roller.js";
import { rollUniversalTable } from "../dice/universal-table.js";

// Grenade type definitions — all RAW values
const GRENADE_TYPES = {
  fragmentation: { label: "Fragmentary",  damageType: "physical-edged", damage: 30,  rank: "Remarkable", effectType: "damage" },
  concussive:    { label: "Concussive",   damageType: "physical-blunt", damage: 40,  rank: null,          effectType: "damage" },
  sonic:         { label: "Sonic",        damageType: "energy",         damage: 20,  rank: null,          effectType: "damage+stun", stunIntensity: "Excellent" },
  smoke:         { label: "Smoke",        damageType: null,             damage: 0,   rank: "Excellent",   effectType: "smoke" },
  tearGas:       { label: "Tear Gas",     damageType: null,             damage: 0,   rank: "Typical",     effectType: "gas" },
  knockout:      { label: "Knock-Out",    damageType: null,             damage: 0,   rank: null,          effectType: "gas" },
  flash:         { label: "Flash",        damageType: null,             damage: 0,   rank: "Amazing",     effectType: "flash" }
};

export class GrenadeAction extends RangedAttackAction {
  async execute() {
    const actor  = this.actor;
    const item   = this.opts?.item ?? (this.opts?.itemId ? actor.items.get(this.opts.itemId) : null);

    if (!item) {
      ui.notifications.warn("No grenade item found.");
      return;
    }

    // Check ammo
    // shotsRemaining defaults to "" in template — treat "" same as null
    const _sr = item.system.shotsRemaining;
    const shotsRemaining = (_sr !== "" && _sr != null) ? _sr : (item.system.shots !== "" && item.system.shots != null ? item.system.shots : 1);
    if (Number.isFinite(Number(shotsRemaining)) && Number(shotsRemaining) <= 0) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div style="background:#fff;border:1px solid #bbb;border-radius:3px;padding:6px 8px;">
          <b>${actor.name}</b> reaches for a <b>${item.name}</b> — none left.
        </div>`
      });
      return;
    }

    const grenadeType  = item.system.grenadeType || "fragmentation";
    let typeDef        = GRENADE_TYPES[grenadeType] || GRENADE_TYPES.fragmentation;
    // Item damage/intensity can override defaults
    // grenadeDamage may be a string like "RM (30)" or "30" or a plain number
    const _dmgRaw = item.system.grenadeDamage ?? typeDef.damage ?? 0;
    const _dmgMatch = String(_dmgRaw).match(/\d+/);
    const damage = _dmgMatch ? parseInt(_dmgMatch[0], 10) : (typeDef.damage ?? 0);
    const intensity    = item.system.grenadeIntensity || typeDef.rank || "";

    // Normalize grenadeDamageType from item sheet (EA→physical-edged, BA→physical-blunt, E→energy, etc.)
    const _rawDt = String(item.system.grenadeDamageType || "").toUpperCase();
    const _dtMap = { EA: "physical-edged", TE: "physical-edged", BA: "physical-blunt", TB: "physical-blunt", E: "energy", F: "force", S: "physical-blunt" };
    const itemDamageType = _dtMap[_rawDt] || null;
    // Override typeDef.damageType with item's explicit setting if present
    if (itemDamageType) typeDef = { ...typeDef, damageType: itemDamageType };

    const ability      = getAbilityInfo(actor, "agility");
    const strRank      = actor?.system?.abilities?.strength?.rank || "Typical";
    const maxRange     = this._getThrowingRangeInAreas(strRank);

    const availableKarma = getAvailableKarma(actor);
    const minKarma       = getMinimumKarmaCommitment(actor);
    const hasKarma       = availableKarma > 0;

    const savedRange  = await actor.getFlag("msh-faserip", "lastGrenadeRange")  || 1;
    const savedShift  = await actor.getFlag("msh-faserip", "lastGrenadeShift")  || 0;
    const savedSkip   = (await actor.getFlag("msh-faserip", "skipDiceRoll"))    ?? false;

    const { targets, targetDisplay } = getTargetData();

    // Effect description for dialog
    const effectDesc = {
      damage:      `${damage} pts ${typeDef.damageType?.replace("physical-", "") ?? ""} damage to all in area`,
      "damage+stun": `${damage} pts Energy damage + End FEAT vs ${typeDef.stunIntensity} Stunning to all in area`,
      smoke:       `${intensity} Intensity smoke — all FEATs at -2CS in area`,
      gas:         `${intensity} Intensity gas affects all in area`,
      flash:       `${intensity} Intensity flash — affects all facing it in area`
    }[typeDef.effectType] || "";

    const dialogHtml = `
      ${buildModeSelector({ mode: "semi" })}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
          <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Target Area</div>
          <div style="font-weight:600;color:#d32f2f;">${targetDisplay || "Select target area"}</div>
        </div>
        <div style="background:#f5f5f5;padding:8px;border-radius:3px;">
          <div style="font-weight:600;color:#666;font-size:.8em;text-transform:uppercase;">Throw</div>
          <div style="font-weight:600;">Agility: ${ability.rank} (${ability.value})</div>
          <div style="color:#666;font-size:.85em;">Max range: ${maxRange} areas</div>
        </div>
      </div>

      <div style="background:#fff8e1;border:1px solid #ffc107;border-radius:3px;padding:8px;margin-bottom:8px;">
        <div style="font-weight:700;color:#e65100;">${item.name} — ${typeDef.label}</div>
        <div style="color:#555;font-size:.88em;margin-top:2px;">${effectDesc}</div>
        <div style="color:#888;font-size:.82em;margin-top:2px;">White = miss. Any other result = hits target area, affects all in it.</div>
      </div>

      <!-- Range -->
      <div style="display:grid;grid-template-columns:auto 1fr auto;gap:6px;align-items:center;margin-bottom:8px;padding:6px 8px;border:1px solid #ddd;border-radius:3px;background:#fafafa;">
        <label style="font-weight:600;">Range:</label>
        <input type="number" name="range" value="${savedRange}" min="1" max="${maxRange}" style="width:50px;padding:3px;text-align:center;">
        <span style="color:#666;font-size:.85em;">areas (max ${maxRange})</span>
      </div>

      <!-- CS / Karma -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;font-size:.9em;">
        <div class="cs-field" style="display:flex;align-items:center;gap:4px;padding:4px 6px;border-radius:3px;border:1px solid transparent;">
          <label style="font-weight:600;">CS:</label>
          <input type="number" name="shift" value="${savedShift}" style="width:35px;padding:3px;text-align:center;box-sizing:border-box;">
          <span style="color:#666;">→</span>
          <strong id="shifted-rank-display">${shiftRank(ability.rank, savedShift)}</strong>
          <button type="button" class="cs-reset" style="visibility:${savedShift !== 0 ? "visible" : "hidden"};padding:1px 5px;font-size:.85em;cursor:pointer;border:1px solid #999;border-radius:2px;background:#eee;" title="Reset to 0">×</button>
        </div>
        <div style="display:flex;align-items:center;gap:4px;padding:4px 6px;border-radius:3px;${hasKarma ? "background:#e3f2fd;border:1px solid #90caf9;" : ""}">
          ${hasKarma ? `
            <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
              <input type="checkbox" id="spend-karma" name="spendKarma">
              <span style="font-weight:600;">Karma:</span>
            </label>
            <span style="padding:1px 4px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;">${availableKarma}</span>
            <span style="color:#999;font-size:.8em;">(min ${minKarma})</span>
          ` : `<span style="color:#999;">No karma</span>`}
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid #ddd;">
        <label><input type="checkbox" name="skipDice" ${savedSkip ? "checked" : ""}> Skip dice</label>
        <span style="font-size:.8em;color:#888;">${shotsRemaining} remaining</span>
      </div>
    `;

    const choice = await new Promise(resolve => {
      new Dialog({
        title: `Grenade: ${actor.name}`,
        content: dialogHtml,
        buttons: {
          roll: {
            label: "Throw",
            callback: async (html) => {
              const $d = sel => html.find(sel);
              const range    = Number($d('[name="range"]').val() || 1);
              const shift    = parseInt($d('[name="shift"]').val() || 0);
              const skipDice = !!$d('[name="skipDice"]').is(":checked");
              const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);

              if (range > maxRange) {
                ui.notifications.error(`Beyond max throwing range (${maxRange} areas).`);
                return resolve(null);
              }

              // -1CS per area traveled (weapons rule RAW)
              const rangeModifier = -range;
              const totalShift = shift + rangeModifier;

              await actor.setFlag("msh-faserip", "lastGrenadeRange", range);
              await actor.setFlag("msh-faserip", "lastGrenadeShift", shift);

              resolve({ range, shift, totalShift, rangeModifier, skipDice, spendKarma, karma: karmaToSpend });
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "roll",
        render: async (html) => {
          setupKarmaControlHandlers(html);
          await setupModeSelector(actor, html, this.opts || {}, "lastGrenadeMode");

          const update = () => {
            const cs = parseInt(html.find('[name="shift"]').val()) || 0;
            const shifted = shiftRank(ability.rank, cs);
            const $sr = html.find('#shifted-rank-display');
            const $cf = html.find('.cs-field');
            const $rb = html.find('.cs-reset');
            $sr.text(shifted);
            if (cs < 0)      { $cf.css({ background: "#ffebee", border: "1px solid #ef5350" }); $sr.css("color", "#c62828"); $rb.css("visibility", "visible"); }
            else if (cs > 0) { $cf.css({ background: "#e8f5e9", border: "1px solid #66bb6a" }); $sr.css("color", "#2e7d32"); $rb.css("visibility", "visible"); }
            else             { $cf.css({ background: "",         border: "1px solid transparent" }); $sr.css("color", ""); $rb.css("visibility", "hidden"); }
          };
          html.find('[name="shift"]').on("input change", update);
          html.find('.cs-reset').on("click", e => { e.preventDefault(); html.find('[name="shift"]').val(0).trigger("change"); });
          update();
        }
      }).render(true);
    });

    if (!choice) return;

    // Place area template — user clicks location on canvas
    const radiusInAreas = item.system.grenadeRadius || 1;
    ui.notifications.info(`Click on the canvas to place the ${item.name} (${radiusInAreas} area radius).`);
    const template = await AreaTemplate.place({
      radiusInAreas,
      label: item.name,
      fillColor: "#ff4400",
      fillAlpha: 0.25
    });

    if (!template) {
      ui.notifications.info("Grenade throw cancelled.");
      return;
    }

    // Auto-target all tokens inside the template
    await template.target();

    // Capture targets NOW — scatter will call target() again and overwrite game.user.targets
    let affectedTargets = Array.from(game.user.targets);

    // Decrement shots
    const newShots = Math.max(0, Number(shotsRemaining) - 1);
    await item.update({ "system.shotsRemaining": newShots });

    // Roll
    const effectiveRank = shiftRank(ability.rank, choice.totalShift);
    const roll = await (new Roll("1d100")).evaluate();
    if (!choice.skipDice) {
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${actor.name} throws ${item.name}` });
    }

    const { cappedTotal, totalKarmaUsed } = await rollWithKarmaAndHistory(
      actor, `Grenade: ${typeDef.label}`, choice.karma, roll,
      { spendKarma: choice.spendKarma, rank: effectiveRank }
    );

    const color      = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
    const colorLower = String(color || "").toLowerCase();
    const isHit      = colorLower !== "white";
    const { bg, fg } = bannerColors(colorLower);

    // Badge html
    const badgeColor = { white: "#888", green: "#4CAF50", yellow: "#FFC107", red: "#F44336" }[colorLower] || "#888";
    const badgeBg    = { white: "#f5f5f5", green: "#e8f5e9", yellow: "#fff8e1", red: "#ffebee" }[colorLower] || "#f5f5f5";
    const badgeHtml  = `<span style="display:inline-block;padding:1px 8px;border-radius:3px;font-weight:700;font-size:.85em;background:${badgeBg};color:${badgeColor};border:1px solid ${badgeColor};">${color.toUpperCase()}</span>`;

    // Result box
    let resultHtml = "";
    // Scatter on miss
    let scatterDirLabel = "";
    if (!isHit) {
      const dirs = ["N","NE","E","SE","S","SW","W","NW"];
      const d8 = Math.floor(Math.random() * 8);
      scatterDirLabel = dirs[d8];
      const scatterAreas = Math.max(0.5, choice.range / 2);
      const areasPerSq   = canvas.scene?.grid?.distance || 0.1;
      const pxPerSq      = canvas.scene?.grid?.size || 100;
      const scatterPx    = (scatterAreas / areasPerSq) * pxPerSq;
      // Cardinal/diagonal offset in pixels
      const rad = (d8 * 45) * (Math.PI / 180);
      const dx  = Math.round(Math.cos(rad) * scatterPx);
      const dy  = Math.round(-Math.sin(rad) * scatterPx); // canvas Y is inverted
      // Move template to scatter position
      await template._doc.update({ x: template._doc.x + dx, y: template._doc.y + dy });
      // Retarget at new position
      await template.target();
    }

    if (!isHit) {
      resultHtml = `<div style="padding:6px 8px;margin:0 10px 6px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.88em;">
        <div style="font-weight:700;color:#888;">MISS — SCATTER</div>
        <div style="color:#555;">Grenade scatters ${Math.max(0.5, choice.range / 2)} area(s) ${scatterDirLabel} of target. Effects apply at scatter point.</div>
      </div>`;
    } else {
      if (typeDef.effectType === "damage" || typeDef.effectType === "damage+stun") {
        const dmgLabel = typeDef.damageType?.replace("physical-", "") ?? "damage";
        resultHtml = `<div style="padding:6px 8px;margin:0 10px 6px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.88em;">
          <div style="font-weight:700;color:#e65100;">HIT — ALL IN AREA AFFECTED</div>
          <div style="color:#555;margin-top:2px;">${damage} pts ${dmgLabel} damage to every target in the area.</div>
          ${typeDef.effectType === "damage+stun" ? `<div style="color:#555;margin-top:2px;">Each target makes Endurance FEAT vs <strong>${typeDef.stunIntensity}</strong> Intensity or is Stunned.</div>` : ""}
        </div>`;
      } else {
        const effectLabels = {
          smoke: `<b>SMOKE</b> fills the area — all FEATs at -2CS until dispersed.`,
          gas:   `<b>${intensity} Intensity GAS</b> fills the area — all targets affected.`,
          flash: `<b>${intensity} Intensity FLASH</b> — all targets facing the source are affected.`
        };
        resultHtml = `<div style="padding:6px 8px;margin:0 10px 6px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.88em;">
          <div style="font-weight:700;color:#2e7d32;">HIT — AREA EFFECT</div>
          <div style="color:#555;margin-top:2px;">${effectLabels[typeDef.effectType] || effectDesc}</div>
          <div style="color:#888;font-size:.85em;margin-top:4px;">Apply effect to all tokens in target area.</div>
        </div>`;
      }
    }

    const cardHtml = `
      <div style="font-family:'Segoe UI',system-ui,sans-serif;background:#fff;border:1px solid #c0c0c0;border-radius:4px;overflow:hidden;margin-bottom:4px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding:5px 10px;border-bottom:1px solid #e0e0e0;">
          <span style="font-weight:700;color:#8b0000;letter-spacing:.03em;text-transform:uppercase;">GRENADE</span>
          <span style="font-size:.8em;color:#666;">Agility FEAT</span>
        </div>
        <div style="padding:5px 10px 3px;font-size:.88em;">
          <div style="font-weight:700;">${actor.name}</div>
          <div style="color:#555;">Agility: ${ability.rank} (${ability.value})</div>
          <div style="color:#555;">Range: ${choice.range} area${choice.range !== 1 ? "s" : ""} (${choice.rangeModifier}CS)${choice.shift ? ` + manual ${choice.shift > 0 ? "+" : ""}${choice.shift}CS` : ""} → ${shiftRank(ability.rank, choice.totalShift)}</div>
          <div style="margin-top:2px;">Roll: <strong>${roll.total}</strong>${totalKarmaUsed ? ` + Karma: ${totalKarmaUsed}` : ""} = <strong>${cappedTotal}</strong>
            &nbsp;${badgeHtml}
          </div>
        </div>
        ${resultHtml}
        <div style="padding:4px 8px;margin:0 10px 6px;background:#e8f5e9;border:1px solid #4CAF50;border-radius:3px;font-size:.8em;font-weight:700;color:#2e7d32;text-align:center;">
          ${item.name} thrown — ${newShots} remaining
        </div>
      </div>
    `;

    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: cardHtml });

    // On a miss, scatter may have found additional targets — merge them in
    const scatterTargets = Array.from(game.user.targets);
    for (const t of scatterTargets) {
      if (!affectedTargets.includes(t)) affectedTargets.push(t);
    }

    // Handle template — persist smoke/gas regardless of hit/miss (scatter lands somewhere)
    const isPersistent = ["smoke", "tearGas", "knockout", "flash"].includes(grenadeType);
    if (isPersistent) {
      const durationMap = { smoke: 10, tearGas: 5, knockout: 5, flash: 2 };
      await template.persist({
        durationTurns: durationMap[grenadeType] || 5,
        label: `${typeDef.label} (${item.name})`
      });
    } else {
      await template.dismiss();
    }

    // Apply to all targeted tokens at landing point (hit or scatter)
    // RAW: frag/edged grenades trigger kill saves on any hit (treat as Kill-capable)
    const isKillCapable = ["physical-edged", "energy"].includes(typeDef.damageType);
    const wasKillResult = isKillCapable; // area hits always treated as Red (Kill column) per RAW
    if (damage > 0 && affectedTargets.length > 0) {
      const dmgResults = await applyDamageToTargets({
        damage,
        targets: affectedTargets,
        attackerUuid: actor.uuid,
        damageType: typeDef.damageType,
        attackForm: typeDef.damageType?.includes("edged") ? "edged" : typeDef.damageType === "energy" ? "energy" : "blunt",
        showNotification: false,
        wasKillResult,
        forceKilling: wasKillResult
      });

      // Post damage summary chat card for each target
      if (dmgResults?.length) {
        const dmgLabel = typeDef.damageType?.replace("physical-", "") ?? "damage";
        const rows = dmgResults.map(r => {
          if (r.net === 0 && r.absorbed > 0) {
            return `<tr><td style="padding:2px 6px;">${r.name}</td><td style="padding:2px 6px;color:#888;">All absorbed by armor</td><td style="padding:2px 6px;color:#888;">${r.hpBefore} → ${r.hpAfter}</td></tr>`;
          }
          const armorNote = r.absorbed > 0 ? ` <span style="color:#888;font-size:.85em;">(${damage} − ${r.absorbed} armor)</span>` : "";
          return `<tr><td style="padding:2px 6px;">${r.name}</td><td style="padding:2px 6px;color:#c62828;font-weight:600;">−${r.net}${armorNote}</td><td style="padding:2px 6px;">${r.hpBefore} → ${r.hpAfter}</td></tr>`;
        }).join("");

        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div style="font-family:'Segoe UI',system-ui,sans-serif;background:#fff;border:1px solid #c0c0c0;border-radius:4px;overflow:hidden;margin-bottom:4px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;padding:5px 10px;border-bottom:1px solid #e0e0e0;">
              <span style="font-weight:700;color:#8b0000;letter-spacing:.03em;text-transform:uppercase;">GRENADE DAMAGE</span>
              <span style="font-size:.8em;color:#666;">${damage} pts ${dmgLabel} — ${dmgResults.length} target${dmgResults.length !== 1 ? "s" : ""}</span>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:.88em;padding:4px;">
              <thead><tr style="border-bottom:1px solid #eee;color:#666;font-size:.82em;">
                <th style="padding:2px 6px;text-align:left;">Target</th>
                <th style="padding:2px 6px;text-align:left;">Damage</th>
                <th style="padding:2px 6px;text-align:left;">Health</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`
        });
      }
    }
  }
}