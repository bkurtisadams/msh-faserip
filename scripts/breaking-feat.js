// breaking-feat.js

export function openBreakingFeatDialog({ weaponMatRank = "Excellent", actor = null }) {
  const RANKS = [
    "Shift-0","Feeble","Poor","Typical","Good","Excellent",
    "Remarkable","Incredible","Amazing","Monstrous","Unearthly",
    "Shift-X","Shift-Y","Shift-Z","Class 1000","Class 3000","Class 5000","Beyond"
  ];

  const options = RANKS.map(r => `<option value="${r}">${r}</option>`).join('');

  const dlg = new Dialog({
    title: `Breaking FEAT — ${actor?.name ?? "Weapon"}`,
    content: `
      <div style="line-height:1.4;">
        <div style="margin-bottom:6px;">
          <label style="display:inline-block; width:140px;">Weapon Material:</label>
          <input type="text" value="${weaponMatRank}" readonly style="width:160px;">
        </div>

        <div style="margin-bottom:6px;">
          <label style="display:inline-block; width:140px;">Compare Against:</label>
          <label><input type="radio" name="bf-comp" value="target" checked> Target Armor/Material</label>
          <label style="margin-left:10px;"><input type="radio" name="bf-comp" value="wielder"> Wielder Strength</label>
        </div>

        <div id="bf-target-row" style="margin-bottom:6px;">
          <label style="display:inline-block; width:140px;">Target Rank:</label>
          <select name="bf-target-rank" style="width:170px;">${options}</select>
        </div>

        <div id="bf-wielder-row" style="display:none; margin-bottom:6px;">
          <label style="display:inline-block; width:140px;">Wielder Strength:</label>
          <input name="bf-wielder-rank" type="text" value="${actor?.system?.abilities?.strength?.rank ?? 'Typical'}"
                 style="width:160px;" readonly>
        </div>

        <div style="font-size:0.85em; color:#555; margin-top:6px;">
          Rule: Roll on the comparator’s rank column vs intensity = weapon material. If comparator is 1 rank lower than intensity, a <b>Yellow</b> is required; ≥2 lower requires <b>Red</b>.
        </div>
      </div>
    `,
    buttons: {
      roll: {
        label: "Roll FEAT",
        callback: async (html) => {
          // Gather inputs
          const compType = html.find('[name="bf-comp"]:checked').val();
          const compRank = compType === 'wielder'
            ? (actor?.system?.abilities?.strength?.rank ?? 'Typical')
            : html.find('[name="bf-target-rank"]').val();

          // Compute required color per FEAT intensity rules
          const reqColor = requiredColorForIntensity(compRank, weaponMatRank);

          // Roll
          const roll = new Roll("1d100");
          await roll.evaluate();

          // Determine rolled color on comparator column
          const color = game.msh.rollUniversalTable(compRank, roll.total); // "White/Green/Yellow/Red"
          const passed = compareColors(color, reqColor); // true if rolled >= required

          // Post compact result card (matches your style)
          const content = `
            <div style="background-color:#f5f5f0; border:1px solid #c0c0c0; border-radius:3px; margin-bottom:5px;">
              <div style="padding:5px 10px; border-bottom:1px solid #c0c0c0; font-size:1.1em; color:#8b0000;">
                <strong>${actor?.name ?? 'Weapon'} — Breaking FEAT</strong>
              </div>
              <div style="padding:5px 10px; font-size:0.9em;">
                <div>Comparator: ${compRank}</div>
                <div>Intensity (Weapon): ${weaponMatRank}</div>
                <div>Required Color: ${reqColor.toUpperCase()}</div>
                <div>Roll: ${roll.total} → ${color.toUpperCase()}</div>
              </div>
              <div style="text-align:center; padding:8px; margin:5px; font-weight:bold; font-size:1.1em; border-radius:3px;
                          background-color:${passed ? '#4CAF50' : '#F44336'}; color:white;">
                ${passed ? 'WEAPON BREAKS!' : 'NO BREAK'}
              </div>
            </div>
          `;

          // Echo the d100 if you want dice to show
          await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: `${actor?.name ?? 'Weapon'} — Breaking FEAT`
          });

          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content
          });
        }
      },
      cancel: { label: "Cancel" }
    },
    render: (html) => {
      const $targetRow  = html.find('#bf-target-row');
      const $wielderRow = html.find('#bf-wielder-row');
      html.find('[name="bf-comp"]').on('change', () => {
        const v = html.find('[name="bf-comp"]:checked').val();
        if (v === 'wielder') { $targetRow.hide(); $wielderRow.show(); }
        else { $targetRow.show(); $wielderRow.hide(); }
      });
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
  const q = order[(required || '').toLowerCase()] ?? 1; // default need at least green
  return r >= q;
}
