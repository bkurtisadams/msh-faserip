// breaking-feat.js

export function openBreakingFeatDialog({ weaponMatRank = "Excellent", actor = null }) {
  const RANKS = [
    "Shift-0","Feeble","Poor","Typical","Good","Excellent",
    "Remarkable","Incredible","Amazing","Monstrous","Unearthly",
    "Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000","Beyond"
  ];

  const options = RANKS.map(r => `<option value="${r}">${r}</option>`).join('');
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
            <li>Same rank: Green required</li>
            <li>1 rank lower: Yellow required</li>
            <li>2+ ranks lower: Red required</li>
            <li><strong>Failure = weapon breaks</strong></li>
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
          const comparatorRank = wielderStr;  // Roll on Strength column
          const intensityRank = weaponMatRank; // Against weapon material

          // Compute required color
          const reqColor = requiredColorForIntensity(comparatorRank, intensityRank);

          // Roll
          const roll = new Roll("1d100");
          await roll.evaluate();

          // Determine rolled color on Strength column
          const color = game.msh.rollUniversalTable(comparatorRank, roll.total);
          const passed = compareColors(color, reqColor); // true if FEAT succeeded

          // INVERTED: passed = weapon survives, failed = weapon breaks
          const weaponBreaks = !passed;

          // Post result card
          const content = `
            <div style="background-color:#f5f5f0; border:1px solid #c0c0c0; border-radius:3px; margin-bottom:5px;">
              <div style="padding:5px 10px; border-bottom:1px solid #c0c0c0; font-size:1.1em; color:#8b0000;">
                <strong>${actor?.name ?? 'Character'} — Breaking FEAT</strong>
              </div>
              <div style="padding:5px 10px; font-size:0.9em;">
                <div>Wielder Strength: ${comparatorRank}</div>
                <div>Weapon Material: ${weaponMatRank}</div>
                <div>Target Material: ${targetRank}</div>
                <div>Required Color: ${reqColor.toUpperCase()}</div>
                <div>Roll: ${roll.total} → ${color.toUpperCase()}</div>
              </div>
              <div style="text-align:center; padding:8px; margin:5px; font-weight:bold; font-size:1.1em; border-radius:3px;
                          background-color:${weaponBreaks ? '#F44336' : '#4CAF50'}; color:white;">
                ${weaponBreaks ? '💔 WEAPON BREAKS!' : '✓ WEAPON SURVIVES'}
              </div>
            </div>
          `;

          // Echo the d100
          await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: `${actor?.name ?? 'Character'} — Breaking FEAT`
          });

          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content
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

  const diff = ii - ci; // positive means intensity higher than comparator
  if (diff <= 0) return 'green';   // comparator ≥ intensity → Green needed
  if (diff === 1) return 'yellow'; // one rank lower → Yellow needed
  return 'red';                    // ≥ two ranks lower → Red needed
}

// Return true if rolled color meets/exceeds the required color
function compareColors(rolled, required) {
  const order = { white: 0, green: 1, yellow: 2, red: 3 };
  const r = order[(rolled || '').toLowerCase()] ?? 0;
  const q = order[(required || '').toLowerCase()] ?? 1;
  return r >= q;
}