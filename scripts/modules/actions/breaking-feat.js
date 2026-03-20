// breaking-feat.js v1.3.0 - 2026-03-20
// v1.3.0: Fix inverted break result (success=breaks), auto-success/fail for 3+ rank gap
// v1.2.1: Add debug logging
// v1.2.0: Auto-populate target material from attack context
// v1.1.0: Chat card styled to match attack action format

import { rollUniversalTable } from "../dice/universal-table.js";

// Banner colors for result display
function bannerColors(color) {
  switch (String(color).toLowerCase()) {
    case "white": return { bg: "#e0e0e0", fg: "#333" };
    case "green": return { bg: "#4caf50", fg: "#fff" };
    case "yellow": return { bg: "#ffeb3b", fg: "#333" };
    case "red": return { bg: "#f44336", fg: "#fff" };
    default: return { bg: "#9e9e9e", fg: "#fff" };
  }
}

export function openBreakingFeatDialog({ weaponMatRank = "Excellent", targetMatRank = "", actor = null }) {
  console.log("[FASERIP] openBreakingFeatDialog called:", { weaponMatRank, targetMatRank, actorName: actor?.name });
  
  const RANKS = [
    "Shift-0","Feeble","Poor","Typical","Good","Excellent",
    "Remarkable","Incredible","Amazing","Monstrous","Unearthly",
    "Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000","Beyond"
  ];

  const options = RANKS.map(r => `<option value="${r}" ${r === targetMatRank ? 'selected' : ''}>${r}</option>`).join('');
  const wielderStr = actor?.system?.abilities?.strength?.rank ?? 'Typical';

  const dlg = new Dialog({
    title: `Breaking FEAT — ${actor?.name ?? "Character"}`,
    content: `
      <div style="line-height:1.4;">
        <div style="margin-bottom:6px;">
          <label style="display:inline-block; width:140px;">Wielder Strength:</label>
          <input type="text" value="${wielderStr}" readonly style="width:160px;">
        </div>

        <div style="margin-bottom:6px;">
          <label style="display:inline-block; width:140px;">Weapon Material:</label>
          <input type="text" value="${weaponMatRank}" readonly style="width:160px;">
        </div>

        <div style="margin-bottom:6px;">
          <label style="display:inline-block; width:140px;">Target Material:</label>
          <select name="bf-target-rank" style="width:170px;">${options}</select>
        </div>

        <div style="font-size:0.85em; color:#555; margin-top:8px; padding:6px; background:#fff3e0; border:1px solid #ff9800; border-radius:3px;">
          <strong>Rule:</strong> When weapon hits tougher material (weapon material &lt; target material/BA), 
          roll Wielder's Strength vs Weapon Material to see if weapon breaks.
          <ul style="margin:4px 0 0 20px; padding:0;">
            <li>Strength &gt; Weapon Mat: Green required</li>
            <li>Strength = Weapon Mat: Yellow required</li>
            <li>Strength &lt; Weapon Mat: Red required</li>
            <li><strong>Success = weapon breaks</strong></li>
            <li>3+ ranks above = auto-break</li>
            <li>3+ ranks below = auto-survive</li>
          </ul>
        </div>
      </div>
    `,
    buttons: {
      roll: {
        label: "Roll FEAT",
        callback: async (html) => {
          const targetRank = html.find('[name="bf-target-rank"]').val();
          
          // Check if weapon material < target material (condition for breaking check)
          const weaponIdx = RANKS.indexOf(weaponMatRank);
          const targetIdx = RANKS.indexOf(targetRank);
          
          if (weaponIdx >= targetIdx) {
            ui.notifications.info("Weapon material is not weaker than target - no breaking check needed.");
            return;
          }

          // Roll wielder's Strength vs weapon material (as intensity)
          const comparatorRank = wielderStr;   // Roll on Strength column
          const intensityRank = weaponMatRank; // Against weapon material

          // Check rank distance for auto-success/fail
          const strIdx = RANKS.indexOf(comparatorRank);
          const matIdx = RANKS.indexOf(intensityRank);
          const rankGap = strIdx - matIdx; // positive = Str outranks material

          let color, roll, autoResult = null, passed = false;

          if (rankGap >= 3) {
            // Auto-success: Strength 3+ ranks above weapon material
            autoResult = "auto-break";
            color = "green";
            roll = null;
          } else if (rankGap <= -3) {
            // Auto-fail: Strength 3+ ranks below weapon material
            autoResult = "auto-survive";
            color = "white";
            roll = null;
          } else {
            // Roll
            roll = new Roll("1d100");
            await roll.evaluate();

            // Determine rolled color on Strength column
            color = game.msh.rollUniversalTable(comparatorRank, roll.total);
            
            const reqColor = requiredColorForIntensity(comparatorRank, intensityRank);
            passed = compareColors(color, reqColor);
          }

          const colorLower = String(color).toLowerCase();
          const { bg, fg } = bannerColors(colorLower);
          
          // Success = wielder's strength overcomes weapon material = weapon breaks
          const weaponBreaks = autoResult
            ? autoResult === "auto-break"
            : passed;

          // Required color for display (only meaningful if rolled)
          const reqColor = requiredColorForIntensity(comparatorRank, intensityRank);
          const { bg: reqBg, fg: reqFg } = bannerColors(reqColor);

          // Build chat card matching attack action format
          const cardHtml = `
            <div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
              <!-- Header -->
              <div style="padding:6px 10px;border-bottom:1px solid #c0c0c0;">
                <strong style="color:#8b0000;">BREAKING FEAT</strong>
              </div>
              
              <!-- Actor -->
              <div style="padding:4px 10px;font-size:.95em;">
                <strong>${actor?.name ?? 'Character'}</strong>
              </div>
              
              <!-- Ability + Roll + Result -->
              <div style="padding:2px 10px 6px;font-size:.9em;color:#555;">
                <div>Strength: ${comparatorRank}</div>
                ${autoResult ? `
                <div style="font-weight:bold;color:#555;">
                  ${autoResult === "auto-break" ? "Automatic (Str 3+ ranks above material)" : "Automatic (Str 3+ ranks below material)"}
                </div>
                ` : `
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  <span>Roll: <span title="d100 = ${roll.total}" style="padding:0 3px;background:#fff8e1;border:1px solid #ffc107;border-radius:2px;cursor:help;">${roll.total}</span></span>
                  <span style="padding:2px 8px;border-radius:3px;font-weight:bold;font-size:.9em;background:${bg};color:${fg};">
                    ${String(color).toUpperCase()}
                  </span>
                </div>
                `}
              </div>
              
              <!-- Context -->
              <div style="margin:0 10px 6px;padding:6px 8px;background:#fff;border:1px solid #ddd;border-radius:3px;font-size:.9em;">
                <div><strong>Weapon:</strong> ${weaponMatRank} material</div>
                <div><strong>Target Armor:</strong> ${targetRank}</div>
                ${!autoResult ? `<div><strong>To break:</strong> <span style="padding:1px 6px;border-radius:2px;background:${reqBg};color:${reqFg};font-size:.85em;">${reqColor.toUpperCase()}</span> <span style="color:#666;">(Str ${comparatorRank} vs ${intensityRank} intensity)</span></div>` : ''}
              </div>
              
              <!-- Result -->
              <div style="margin:6px 10px 8px;padding:8px;text-align:center;font-weight:bold;border-radius:3px;background:${weaponBreaks ? '#ffebee' : '#e8f5e9'};border:1px solid ${weaponBreaks ? '#ef5350' : '#66bb6a'};color:${weaponBreaks ? '#c62828' : '#2e7d32'};">
                ${weaponBreaks ? 'WEAPON BREAKS' : 'WEAPON SURVIVES'}
              </div>
            </div>
          `;

          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: cardHtml
          });
        }
      },
      cancel: { label: "Cancel" }
    }
  });
  dlg.render(true);
}

// ===== helpers =====

// FEAT vs Intensity: how hard a color is needed based on column distance
export function requiredColorForIntensity(comparatorRank, intensityRank) {
  const RANKS = [
    "Shift-0","Feeble","Poor","Typical","Good","Excellent",
    "Remarkable","Incredible","Amazing","Monstrous","Unearthly",
    "Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000","Beyond"
  ];
  const ci = RANKS.indexOf(comparatorRank);
  const ii = RANKS.indexOf(intensityRank);
  if (ci === -1 || ii === -1) return 'green';

  // Per FASERIP rules:
  // - Ability > Intensity: Green needed
  // - Ability = Intensity: Yellow needed
  // - Ability < Intensity: Red needed
  if (ci > ii) return 'green';   // comparator > intensity -> Green
  if (ci === ii) return 'yellow'; // equal -> Yellow
  return 'red';                   // comparator < intensity -> Red
}

// Return true if rolled color meets/exceeds the required color
function compareColors(rolled, required) {
  const order = { white: 0, green: 1, yellow: 2, red: 3 };
  const r = order[(rolled || '').toLowerCase()] ?? 0;
  const q = order[(required || '').toLowerCase()] ?? 1;
  return r >= q;
}