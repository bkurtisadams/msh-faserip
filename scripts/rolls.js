// File: systems/msh-faserip/rolls.js
import { applyColumnShiftToRank } from './actorSheet.js';
//import { rankRows } from './rank-rows.js';

// This file contains roll functions that can be called directly from macros
// without requiring the character sheet to be open

const actionTypes = [
  { code: "BA", label: "Blunt Attacks" },
  { code: "EA", label: "Edged Attacks" },
  { code: "Sh", label: "Shooting Attacks" },
  { code: "TE", label: "Throwing Edged" },
  { code: "TB", label: "Throwing Blunt" },
  { code: "En", label: "Energy" },
  { code: "Fo", label: "Force" },
  { code: "Gp", label: "Grappling" },
  { code: "Gb", label: "Grabbing" },
  { code: "Es", label: "Escaping" },
  { code: "Ch", label: "Charging" },
  { code: "Do", label: "Dodging" },
  { code: "Ev", label: "Evading" },
  { code: "Bl", label: "Blocking" },
  { code: "Ca", label: "Catching" },
  { code: "St", label: "Stun?" },
  { code: "Sl", label: "Slam?" },
  { code: "Ki", label: "Kill?" }
];

const ACTION_ABILITY_MAP = {
  BA: "fighting",
  EA: "fighting",
  Sh: "agility",
  TE: "agility",
  TB: "agility",
  En: "agility",
  Fo: "agility",
  Gp: "strength",
  Gb: "strength",
  Es: "strength",
  Ch: "endurance",
  Do: "agility",
  Ev: "fighting",
  Bl: "strength",
  Ca: "agility",
  St: "endurance",
  Sl: "endurance",
  Ki: "endurance"
};

const ACTION_RESULT_LABELS = {
  BA: { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" },
  EA: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
  Sh: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
  TE: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
  TB: { white: "Miss", green: "Hit", yellow: "Hit", red: "Stun" },
  En: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
  Fo: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" },
  Gp: { white: "Miss", green: "Miss", yellow: "Partial", red: "Hold" },
  Gb: { white: "Miss", green: "Take", yellow: "Grab", red: "Break" },
  Es: { white: "Miss", green: "Miss", yellow: "Escape", red: "Reverse" },
  Ch: { white: "None", green: "Slam", yellow: "Slam", red: "Stun" },
  Do: { white: "Autohit", green: "-2 CS", yellow: "-4 CS", red: "-6 CS" },
  Ev: { white: "Autohit", green: "Evasion", yellow: "+1 CS", red: "+2 CS" },
  Bl: { white: "Autohit", green: "+4 CS", yellow: "+2 CS", red: "+1 CS" },
  Ca: { white: "Miss", green: "Catch", yellow: "Catch", red: "No" },
  St: { white: "1–10", green: "1", yellow: "Damage", red: "No" },
  Sl: { white: "Gr. Slam", green: "1 area", yellow: "Stagger", red: "No" },
  Ki: { white: "End. Loss", green: "E/S", yellow: "No", red: "No" }
};
                            // 0      Feeble  Poor   Typical  Good    Ex      Rm      In      Am       Mn    Un      Sh X     Sh Y    Sh Z    1000   3000     5000   Beyond
export const rankRows = [
  { label: "01", colors:    ["white","white","white","white","white","white","white","white","white","white","white","white","white","white","white","white","white","white"] },
  { label: "02–03", colors: ["white","white","white","white","white","white","white","white","white","white","white","white","white","white","green","green","green","green"] },
  { label: "04–06", colors: ["white","white","white","white","white","white","white","white","white","white","white","white","white","green","green","green","green","green"] },
  { label: "07–10", colors: ["white","white","white","white","white","white","white","white","white","white","white","white","green","green","green","green","green","green"] },
  { label: "11–15", colors: ["white","white","white","white","white","white","white","white","white","white","white","green","green","green","green","green","green","green"] },
  { label: "16–20", colors: ["white","white","white","white","white","white","white","white","white","white","green","green","green","green","green","green","green","green"] },
  { label: "21–25", colors: ["white","white","white","white","white","white","white","white","white","green","green","green","green","green","green","green","green","yellow"] },
  { label: "26–30", colors: ["white","white","white","white","white","white","white","white","green","green","green","green","green","green","green","green","yellow","yellow"] },
  { label: "31–35", colors: ["white","white","white","white","white","white","white","green","green","green","green","green","green","green","green","yellow","yellow","yellow"] },
  { label: "36–40", colors: ["white","white","white","white","white","white","green","green","green","green","green","green","green","yellow","yellow","yellow","yellow","yellow"] },
  { label: "41–45", colors: ["white","white","white","white","white","green","green","green","green","green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow"] },
  { label: "46–50", colors: ["white","white","white","white","green","green","green","green","green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow"] },
  { label: "51–55", colors: ["white","white","white","green","green","green","green","green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow"] },
  { label: "56–60", colors: ["white","white","green","green","green","green","green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow"] },
  { label: "61–65", colors: ["white","green","green","green","green","green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow"   ,"red"] },
  { label: "66–70", colors: ["green","green","green","green","green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow"   ,"red"  ,"red"] },
  { label: "71–75", colors: ["green","green","green","green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow"  ,"red"   ,"red"  ,"red"] },
  { label: "76–80", colors: ["green","green","green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow","yellow"  ,"red"  ,"red"   ,"red"   ,"red"   ,"red"  ,"red"] },
  { label: "81–85", colors: ["green","green","green","yellow","yellow","yellow","yellow","yellow","yellow" ,"yellow","yellow","red"   ,"red"  ,"red"   ,"red"   ,"red"   ,"red"  ,"red"] },
  { label: "86–90", colors: ["green","green","yellow","yellow","yellow","yellow","yellow","yellow","yellow","red"   ,"red"   ,"red"   ,"red"  ,"red"   ,"red"   ,"red"   ,"red"  ,"red"] },
  { label: "91–94", colors: ["green","yellow","yellow","yellow","yellow","yellow","yellow","red"  ,"red"   ,"red"   ,"red"   ,"red"   ,"red"  ,"red"   ,"red"   ,"red"   ,"red"  ,"red"] },
  { label: "95–97", colors: ["yellow","yellow","yellow","yellow","yellow","red"  ,"red"  ,"red"   ,"red"   ,"red"   ,"red"   ,"red"   ,"red"  ,"red"   ,"red"   ,"red"   ,"red"  ,"red"] },
  { label: "98–99", colors: ["yellow","yellow","yellow","red"   ,"red"   ,"red"  ,"red"  ,"red"   ,"red"   ,"red"   ,"red"   ,"red"   ,"red"  ,"red"   ,"red"   ,"red"   ,"red"  ,"red"] },
  { label: "100", colors:   ["red"   ,"red"   ,"red"   ,"red"   ,"red"   ,"red"  ,"red"  ,"red"   ,"red"   ,"red"   ,"red"   ,"red"   ,"red"  ,"red"   ,"red"   ,"red"   ,"red"  ,"red"] }
];

function highlightResultCell(rankName, rollValue) {
  console.log("Highlighting:", rankName, rollValue);

  const dialog = document.querySelector(".app.dialog");
  if (!dialog) {
    console.warn("No dialog found");
    return;
  }

  const rankIndex = getRankIndex(rankName);
  const rollLabel = getRollLabelFromValue(rollValue);
  console.log("Looking for:", rollLabel, "Rank Index:", rankIndex);

  const selector = `.universal-rank-table tr[data-roll-label="${rollLabel}"] td:nth-child(${rankIndex + 2})`;
  const cell = dialog.querySelector(selector);

  if (cell) {
    console.log("Cell found:", cell);
    cell.classList.add("highlight-cell");
    setTimeout(() => cell.classList.remove("highlight-cell"), 15000);  // 15 seconds
  } else {
    console.warn("Cell not found for:", selector);
  }
}


function getRankIndex(rankName) {
  const ranks = [
    "Shift 0", "Feeble", "Poor", "Typical", "Good", "Excellent", "Remarkable", "Incredible",
    "Amazing", "Monstrous", "Unearthly", "Shift X", "Shift Y", "Shift Z",
    "Class 1000", "Class 3000", "Class 5000", "Beyond"
  ];
  return ranks.indexOf(rankName);
}

function getRollLabelFromValue(value) {
  if (value === 1) return "01";
  if (value <= 3) return "02–03";
  if (value <= 6) return "04–06";
  if (value <= 10) return "07–10";
  if (value <= 15) return "11–15";
  if (value <= 20) return "16–20";
  if (value <= 25) return "21–25";
  if (value <= 30) return "26–30";
  if (value <= 35) return "31–35";
  if (value <= 40) return "36–40";
  if (value <= 45) return "41–45";
  if (value <= 50) return "46–50";
  if (value <= 55) return "51–55";
  if (value <= 60) return "56–60";
  if (value <= 65) return "61–65";
  if (value <= 70) return "66–70";
  if (value <= 75) return "71–75";
  if (value <= 80) return "76–80";
  if (value <= 85) return "81–85";
  if (value <= 90) return "86–90";
  if (value <= 94) return "91–94";
  if (value <= 97) return "95–97";
  if (value <= 99) return "98–99";
  return "100";
}


const resultRows = [
  {
    result: "white",
    cells: [
      { value: "Miss", span: 5 }, { value: "Miss", span: 2 }, { value: "Miss", span: 1 },
      { value: "Miss", span: 1 }, { value: "Miss", span: 1 }, { value: "None", span: 1 },
      { value: "Autohit", span: 1 }, { value: "-6 CS", span: 1 }, { value: "Autohit", span: 1 },
      { value: "Miss", span: 1 }, { value: "1–10", span: 1 }, { value: "Gr. Slam", span: 1 },
      { value: "En. Loss", span: 1 }
    ]
  },
  {
    result: "green",
    cells: [
      { value: "Hit", span: 5 }, { value: "Hit", span: 2 }, { value: "Hit", span: 1 },
      { value: "Hit", span: 1 }, { value: "Hit", span: 1 }, { value: "-2 CS", span: 1 },
      { value: "Evasion", span: 1 }, { value: "+4 CS", span: 1 }, { value: "Catch", span: 1 },
      { value: "1", span: 1 }, { value: "1 area", span: 1 }, { value: "E/S", span: 1 }
    ]
  },
  {
    result: "yellow",
    cells: [
      { value: "Slam", span: 1 }, { value: "Stun", span: 1 }, { value: "Bullseye", span: 1 },
      { value: "Stun", span: 1 }, { value: "Bullseye", span: 1 }, { value: "Bullseye", span: 1 },
      { value: "Partial", span: 1 }, { value: "Grab", span: 1 }, { value: "Escape", span: 1 },
      { value: "Slam", span: 1 }, { value: "-4 CS", span: 1 }, { value: "+1 CS", span: 1 },
      { value: "+2 CS", span: 1 }, { value: "Catch", span: 1 }, { value: "Damage", span: 1 },
      { value: "Stagger", span: 1 }, { value: "No", span: 1 }
    ]
  },
  {
    result: "red",
    cells: [
      { value: "Stun", span: 1 }, { value: "Kill", span: 1 }, { value: "Kill", span: 1 },
      { value: "Kill", span: 1 }, { value: "Stun", span: 1 }, { value: "Kill", span: 1 },
      { value: "Hold", span: 1 }, { value: "Break", span: 1 }, { value: "Reverse", span: 1 },
      { value: "Stun", span: 1 }, { value: "-6 CS", span: 1 }, { value: "+2 CS", span: 1 },
      { value: "+1 CS", span: 1 }, { value: "No", span: 1 }, { value: "No", span: 1 },
      { value: "No", span: 1 }
    ]
  }
];

// universal table roll referenced via game.msh.openUniversalTableDialog
export async function openUniversalTableDialog(actor) {
  const actionTypes = [
    { labelTop: "Blunt", labelMid: "Attack", code: "BA", ability: "Fighting", white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" },
    { labelTop: "Edged", labelMid: "Attack", code: "EA", ability: "Fighting", white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
    { labelTop: "Shooting", labelMid: "Attack", code: "Sh", ability: "Agility", white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
    { labelTop: "Throwing", labelMid: "Edged", code: "TE", ability: "Agility", white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
    { labelTop: "Throwing", labelMid: "Blunt", code: "TB", ability: "Agility", white: "Miss", green: "Hit", yellow: "Hit", red: "Stun" },
    { labelTop: "Energy", labelMid: "Attack", code: "En", ability: "Agility", white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
    { labelTop: "Force", labelMid: "Attack", code: "Fo", ability: "Agility", white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" },
    { labelTop: "Grappling", labelMid: "Attack", code: "Gp", ability: "Strength", white: "Miss", green: "Hit", yellow: "Partial", red: "Hold" },
    { labelTop: "Grabbing", labelMid: "Attack", code: "Gb", ability: "Strength", white: "Miss", green: "Take", yellow: "Grab", red: "Break" },
    { labelTop: "Escaping", labelMid: "Hold", code: "Es", ability: "Strength", white: "Miss", green: "Miss", yellow: "Escape", red: "Reverse" },
    { labelTop: "Charging", labelMid: "Attack", code: "Ch", ability: "Endurance", white: "None", green: "Slam", yellow: "Slam", red: "Stun" },
    { labelTop: "Dodging", labelMid: "Defense", code: "Do", ability: "Agility", white: "Autohit", green: "-2 CS", yellow: "-4 CS", red: "-6 CS" },
    { labelTop: "Evading", labelMid: "Defense", code: "Ev", ability: "Fighting", white: "Autohit", green: "Evasion", yellow: "+1 CS", red: "+2 CS" },
    { labelTop: "Blocking", labelMid: "Defense", code: "Bl", ability: "Strength", white: "Autohit", green: "+4 CS", yellow: "+2 CS", red: "+1 CS" },
    { labelTop: "Catching", labelMid: "Objects", code: "Ca", ability: "Agility", white: "Miss", green: "Catch", yellow: "Catch", red: "No" },
    { labelTop: "Stun", labelMid: "Check", code: "St", ability: "Endurance", white: "1–10", green: "1", yellow: "Damage", red: "No" },
    { labelTop: "Slam", labelMid: "Check", code: "Sl", ability: "Endurance", white: "Gr. Slam", green: "1 area", yellow: "Stagger", red: "No" },
    { labelTop: "Kill", labelMid: "Check", code: "Ki", ability: "Endurance", white: "End. Loss", green: "E/S", yellow: "No", red: "No" }
  ];

  const actorItems = actor.items.contents;
  const powers = actorItems.filter(i => i.type === "power");
  const talents = actorItems.filter(i => i.type === "talent");
  const equipment = actorItems.filter(i => i.type === "equipment");

  const savedAction = actor.getFlag("msh-faserip", "universalRollAction") || "";
  const savedSource = actor.getFlag("msh-faserip", "universalRollSource") || "";
  const savedCS = actor.getFlag("msh-faserip", "universalRollCS") || 0;
  const savedKarma = actor.getFlag("msh-faserip", "universalRollKarma") || 0;

  const dialogContent = `
    <form>
      <div class="form-group">
        <label>Action Type</label>
        <select name="action">
          ${actionTypes.map(type => `
            <option value="${type.code}" ${type.code === savedAction ? "selected" : ""}>
              ${type.labelTop} ${type.labelMid} (${type.code})
            </option>`).join('')}
        </select>

      </div>
      <div class="form-group">
        <label>Source</label>
        <select name="source">
          <option value="">(Select Power, Talent, or Equipment)</option>
          <optgroup label="Powers">
            ${powers.map(p => `<option value="power:${p.id}" ${`power:${p.id}` === savedSource ? "selected" : ""}>${p.name} (${p.system.rank})</option>`).join('')}
          </optgroup>
          <optgroup label="Talents">
            ${talents.map(t => `<option value="talent:${t.id}" ${`talent:${t.id}` === savedSource ? "selected" : ""}>${t.name}</option>`).join('')}
          </optgroup>
          <optgroup label="Equipment">
            ${equipment.map(e => `<option value="equipment:${e.id}" ${`equipment:${e.id}` === savedSource ? "selected" : ""}>${e.name}</option>`).join('')}
          </optgroup>
        </select>
      </div>
      <div class="form-group">
        <label>Generic Column Shift Modifier</label>
        <input type="number" name="cs" value="${savedCS}">
      </div>
      <div class="form-group">
        <label>Karma to Spend</label>
        <input type="number" name="karma" value="${savedKarma}">
      </div>
      <div class="form-group">
        <label>
          <input type="checkbox" name="save" checked />
          Remember these settings
        </label>
      </div>
    </form>
  `;

  const html = await renderTemplate("systems/msh-faserip/templates/universal-table.html", {
    actionTypes,
    rankRows  // ✅ now this works
  });

  const dlg = new Dialog({
    title: "Universal Table",
    content: html,
    buttons: {}, // 👈 no close button; rely on top-right X
    render: html => {
      const app = html.closest(".app.dialog");
      if (app.length) {
        app.css({
          width: "1100px",
          resize: "both",
          overflow: "auto"
        });

        // Center it horizontally
        const left = Math.max((window.innerWidth - 1100) / 2, 50);
        app[0].style.left = `${left}px`;
      }
    }
  });
  dlg.render(true);

  Hooks.once("renderDialog", (_app, html) => {

    html.find("#toggleRankTable").on("click", () => {
      html.find("#rankTableContainer").toggle();
    });

    // Font size slider logic
    html.find("#fontSizeSlider").on("input", (event) => {
      const size = event.target.value + "px";
      html.find(".stack").css("font-size", size);
    });

    // Drag and click logic for action buttons
    html.find(".action-button, .action-code").each((_, el) => {
      el.addEventListener("dragstart", async ev => {
        const action = ev.currentTarget.dataset.action;
        const actor = game.user.character || canvas.tokens.controlled[0]?.actor;
        if (!actor) return;

        const command = `game.msh.rollUniversalAction("${action}", "${actor.id}");`;

        let macro = game.macros.find(m => m.name === `FEAT: ${action}` && m.command === command);
        if (!macro) {
          const iconMap = {
            BA: "blunt",
            EA: "edged",
            Sh: "shooting",
            TE: "thrown",
            TB: "thrown_blunt",
            En: "energy",
            Fo: "force",
            Gp: "grapple",
            Gb: "grab",
            Es: "escape",
            Ch: "charge",
            Ki: "kill",
            St: "stun",
            Sl: "slam",
            Do: "dodge",
            Ev: "evade",
            Bl: "block",
            Ca: "catch",
          };

          const iconName = iconMap[action] || "dice-target";
          const img = `systems/msh-faserip/assets/icons/actions/${iconName}.png`; // or .svg if that's what you're using

          macro = await Macro.create({
            name: `FEAT: ${action}`,
            type: "script",
            command,
            img
          });

        }

        // Include the macro's UUID so Foundry can resolve it
        ev.dataTransfer.setData("text/plain", JSON.stringify({
          type: "Macro",
          uuid: macro.uuid
        }));
      });

      el.addEventListener("click", ev => {
        const action = ev.currentTarget.dataset.action;
        const actor = game.user.character || canvas.tokens.controlled[0]?.actor;

        if (!actor) {
          return ui.notifications.warn("Select a token or assign a character first.");
        }

        const savedCS = actor.getFlag("msh-faserip", `cs_${action}`) || 0;
        const savedKarma = actor.getFlag("msh-faserip", `karma_${action}`) || 0;

        new Dialog({
          title: `Roll: ${action}`,
          content: `
          <form>
            <div class="form-group">
              <label>Column Shift</label>
              <input type="number" name="cs" value="${savedCS}" />
            </div>
            <div class="form-group">
              <label>Karma</label>
              <input type="number" name="karma" value="${savedKarma}" />
            </div>
            <div class="form-group">
              <label><input type="checkbox" name="remember" checked /> Remember these settings</label>
            </div>
          </form>
        `,
          buttons: {
            roll: {
              label: "Roll",
              callback: async (html) => {
                const cs = parseInt(html.find('[name="cs"]').val()) || 0;
                const karma = parseInt(html.find('[name="karma"]').val()) || 0;
                const remember = html.find('[name="remember"]').is(":checked");

                if (remember) {
                  await actor.setFlag("msh-faserip", `cs_${action}`, cs);
                  await actor.setFlag("msh-faserip", `karma_${action}`, karma);
                }

                game.msh.rollUniversalAction(action, actor.id, cs, karma);
              }
            },
            cancel: { label: "Cancel" }
          },
          default: "roll"
        }).render(true);
      });

    });

    /* html.find(".action-toggle").on("change", (event) => {
      const code = event.currentTarget.dataset.code;
      const visible = event.currentTarget.checked;
      html.find(`.column[data-code="${code}"]`).toggle(visible);
    }); */

  });
  // end of openUniversalTableDialog  
}

export async function rollUniversalAction(actionCode, actorId, columnShift = null, karma = null) {
  let actor = game.actors.get(actorId) || canvas.tokens.controlled[0]?.actor || game.user.character;
  if (!actor) return ui.notifications.warn("No actor found.");

  // If columnShift or karma are null, show the dialog instead
  if (columnShift === null || karma === null) {
    const savedCS = actor.getFlag("msh-faserip", `cs_${actionCode}`) || 0;
    const savedKarma = actor.getFlag("msh-faserip", `karma_${actionCode}`) || 0;

    new Dialog({
      title: `FEAT: ${actionCode}`,
      content: `
        <form>
          <div class="form-group">
            <label>Column Shift</label>
            <input type="number" name="cs" value="${savedCS}" />
          </div>
          <div class="form-group">
            <label>Karma</label>
            <input type="number" name="karma" value="${savedKarma}" />
          </div>
          <div class="form-group">
            <label><input type="checkbox" name="remember" checked /> Remember these settings</label>
          </div>
        </form>
      `,
      buttons: {
        roll: {
          label: "Roll",
          callback: async (html) => {
            const cs = parseInt(html.find('[name="cs"]').val()) || 0;
            const karma = parseInt(html.find('[name="karma"]').val()) || 0;
            const remember = html.find('[name="remember"]').is(":checked");

            if (remember) {
              await actor.setFlag("msh-faserip", `cs_${actionCode}`, cs);
              await actor.setFlag("msh-faserip", `karma_${actionCode}`, karma);
            }

            // Re-call self with real values
            rollUniversalAction(actionCode, actor.id, cs, karma);
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "roll"
    }).render(true);

    return; // Stop here until dialog result comes in
  }

  const label = `FEAT: ${actionCode}`;
  const abilityKey = ACTION_ABILITY_MAP[actionCode] || "fighting";
  const ability = actor.system.abilities[abilityKey] || { rank: "Typical", value: 6 };

  const rank = applyColumnShiftToRank(ability.rank, ability.value, columnShift).rank;
  const value = ability.value;

  const roll = new Roll("1d100");
  await roll.evaluate();

  let cappedTotal = roll.total;
  let karmaUsed = 0;

  if (karma > 0) {
    cappedTotal = Math.min(100, roll.total + karma);
    karmaUsed = cappedTotal - roll.total;
  } else {
    cappedTotal = roll.total;
  }

  // Log Karma use (only what’s needed to hit 100)
  if (karmaUsed > 0) {
    const history = foundry.utils.deepClone(actor.system.karma?.history || []);
    const newEvent = {
      realDate: new Date().toLocaleDateString(),
      gameDate: "",
      amount: -karmaUsed,
      type: "Die Roll",
      description: `Spent on ${actionCode} roll`
    };
    history.push(newEvent);

    await actor.update({ "system.karma.history": history });
  }

  // Determine result color using capped value
  const color = game.msh.rollUniversalTable(rank, cappedTotal);


  // light up the rank table cell
  highlightResultCell(rank, cappedTotal);

  const labelColor = color.toLowerCase();
  const resultText = (ACTION_RESULT_LABELS[actionCode] || {})[labelColor] || color.toUpperCase();

  const content = `
  <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
    <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
      <strong>${actor.name} - ${label}</strong>
    </div>
    <div style="padding: 5px 10px; font-size: 0.9em;">
      <div>Ability: ${abilityKey.charAt(0).toUpperCase() + abilityKey.slice(1)}</div>
      <div>Base Rank: ${rank} (${value})</div>
      ${columnShift !== 0 ? `<div>Column Shift: ${columnShift > 0 ? "+" : ""}${columnShift}</div>` : ""}

      Roll: ${roll.total} + Karma: ${karmaUsed} = <strong>${cappedTotal}</strong>

    </div>
    <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
      background-color: ${labelColor === 'white' ? '#f8f8f8' :
      labelColor === 'green' ? '#4CAF50' :
        labelColor === 'yellow' ? '#FFD700' : '#F44336'};
      color: ${labelColor === 'white' || labelColor === 'yellow' ? '#333' : 'white'};">
      ${resultText} (${color.toUpperCase()})
    </div>

  </div>
`;

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${actor.name} uses ${label}`,
    content,
    rollMode: game.settings.get("core", "rollMode")
  });

}


export class FaseripRolls {

  /**
  * Roll a power
  * @param {Actor} actor - The actor who owns the power
  * @param {Item} power - The power item to roll
  * @param {Object} options - Optional configuration for the roll
  */
  static async rollPower(actor, power, options = {}) {
    if (!actor || !power) {
      ui.notifications.error("Actor or power not found");
      return;
    }

    // Get saved power settings or use defaults
    const savedActionType = power.getFlag("msh-faserip", "lastActionType") || "";
    const savedColumnShift = power.getFlag("msh-faserip", "lastColumnShift") || 0;
    const skipDiceRoll = power.getFlag("msh-faserip", "skipDiceRoll") || false;

    // If this is a direct roll (macro called with options or dialog submitted)
    // Check if CTRL is pressed or if this is a direct roll call
    if (options.useDirectRoll || game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.CONTROL)) {
      // Optional notification that CTRL quick roll is being used
      if (game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.CONTROL)) {
        ui.notifications.info("Quick roll with saved settings (CTRL pressed)");
      }
      // Use provided options from dialog or direct call
      const actionType = options.actionType || savedActionType;
      const columnShift = options.columnShift ?? savedColumnShift;
      const karma = options.karma || 0;
      const skipDice = options.skipDice ?? skipDiceRoll;

      // Get the power's rank and value
      const powerRank = power.system.rank || "Typical";
      const powerValue = power.system.value || 6;

      // Apply column shifts to get effective rank
      let effectiveRank = powerRank;
      if (columnShift !== 0) {
        const ranks = [
          "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
          "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
          "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
        ];
        const index = ranks.indexOf(powerRank);
        if (index !== -1) {
          const newIndex = Math.min(Math.max(index + columnShift, 0), ranks.length - 1);
          effectiveRank = ranks[newIndex];
          console.log(`Applied ${columnShift} column shifts to ${powerRank}, now ${effectiveRank}`);
        }
      }

      // Create the roll
      const roll = new Roll("1d100");

      // Evaluate the roll
      await roll.evaluate();

      // Display the dice roll with flavor text if not skipped
      if (!skipDice) {
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: actor }),
          flavor: `${actor.name} uses ${power.name}`,
          rollMode: game.settings.get("core", "rollMode")
        });
      }

      // Calculate the result
      const totalRoll = roll.total + karma;
      const resultColor = game.msh.rollUniversalTable(effectiveRank, totalRoll);

      // Define action types and results based on color
      const ACTIONS = {
        "Blunt Attack (BA)": { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" },
        "Edged Attack (EA)": { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
        "Shooting Attack (Sh)": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
        "Throwing Edged (TE)": { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
        "Throwing Blunt (TB)": { white: "Miss", green: "Hit", yellow: "Hit", red: "Stun" },
        "Energy (En)": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
        "Force (Fo)": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" },
        "Grappling (GP)": { white: "Miss", green: "Miss", yellow: "Partial", red: "Hold" },
        "Grabbing (Gb)": { white: "Miss", green: "Take", yellow: "Grab", red: "Break" },
        "Escaping (ES)": { white: "Miss", green: "Miss", yellow: "Escape", red: "Reverse" },
        "Mental Attack": { white: "Failure", green: "Success", yellow: "Special Effect", red: "Maximum Effect" },
        "General Power Use": { white: "Failure", green: "Success", yellow: "Special Effect", red: "Maximum Effect" }
      };

      // Get the result text based on action type and color
      let resultText = "";
      if (ACTIONS[actionType]) {
        resultText = ACTIONS[actionType][resultColor.toLowerCase()];
      } else {
        resultText = resultColor.toUpperCase();
      }

      // Create chat message styled to match screenshot
      let content = `
      <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
        <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
          <strong>${actor.name} - ${power.name} (${actionType})</strong>
        </div>
        <div style="padding: 5px 10px; font-size: 0.9em;">
          <div>Base Rank: ${powerRank} (${powerValue})</div>
          <div>Column Shift: ${columnShift} → ${effectiveRank}</div>
          <div>Roll: ${roll.total} + Karma: ${karma} = ${totalRoll}</div>
        </div>
        <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
          background-color: ${resultColor.toLowerCase() === 'white' ? '#f8f8f8' :
          resultColor.toLowerCase() === 'green' ? '#4CAF50' :
            resultColor.toLowerCase() === 'yellow' ? '#FFD700' :
              '#F44336'}; 
          color: ${resultColor.toLowerCase() === 'white' || resultColor.toLowerCase() === 'yellow' ? '#333' : 'white'};">
          ${resultText} (${resultColor.toUpperCase()})
        </div>
      </div>
    `;

      // Send to chat
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: content
      });

      return { roll, resultColor, resultText };
    } else {
      // First call - show dialog to select options
      // Define action types from the Universal Table
      const ACTIONS = {
        "Blunt Attack (BA)": { ability: "fighting", results: { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" } },
        "Edged Attack (EA)": { ability: "fighting", results: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" } },
        "Shooting Attack (Sh)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" } },
        "Throwing Edged (TE)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" } },
        "Throwing Blunt (TB)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Hit", red: "Stun" } },
        "Energy (En)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" } },
        "Force (Fo)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" } },
        "Grappling (GP)": { ability: "strength", results: { white: "Miss", green: "Miss", yellow: "Partial", red: "Hold" } },
        "Grabbing (Gb)": { ability: "strength", results: { white: "Miss", green: "Take", yellow: "Grab", red: "Break" } },
        "Escaping (ES)": { ability: "strength", results: { white: "Miss", green: "Miss", yellow: "Escape", red: "Reverse" } },
        "Mental Attack": { ability: "psyche", results: { white: "Failure", green: "Success", yellow: "Special Effect", red: "Maximum Effect" } },
        "General Power Use": { ability: "none", results: { white: "Failure", green: "Success", yellow: "Special Effect", red: "Maximum Effect" } }
      };

      // Create dialog for roll options
      let dialogContent = `
    <div style="background: #f0e8d8; padding: 10px; border-radius: 5px;">
      <div style="margin-bottom: 10px;">
        <label style="display: inline-block; width: 120px;">Action Type:</label>
        <select id="action" name="action" style="width: 180px;">
          ${Object.keys(ACTIONS).map(action =>
        `<option value="${action}" ${action === savedActionType ? 'selected' : ''}>${action}</option>`
      ).join('')}
        </select>
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: inline-block; width: 120px;">Column Shift:</label>
        <input type="number" id="shift" name="shift" value="${savedColumnShift}" style="width: 50px;">
        <span style="color: #666; font-size: 0.9em;">(+ right, - left)</span>
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: inline-block; width: 120px;">Karma Points:</label>
        <input type="number" id="karma" name="karma" value="0" min="0" style="width: 50px;">
      </div>
      <div>
        <label>
          <input type="checkbox" id="skip-dice" name="skipDice" ${skipDiceRoll ? 'checked' : ''}> 
          Skip dice animation
        </label>
      </div>
      <div style="margin-top: 10px;">
        <label>
          <input type="checkbox" id="save-settings" name="saveSettings" checked> 
          Remember these settings for future rolls
        </label>
      </div>
    </div>`;

      return new Dialog({
        title: `Power Roll: ${power.name} (${power.system.rank})`,
        content: dialogContent,
        buttons: {
          roll: {
            label: "Roll",
            callback: async (html) => {
              const actionType = html.find('[name="action"]').val();
              const columnShift = parseInt(html.find('[name="shift"]').val()) || 0;
              const karma = parseInt(html.find('[name="karma"]').val()) || 0;
              const skipDice = html.find('[name="skipDice"]').is(':checked');
              const saveSettings = html.find('[name="saveSettings"]').is(':checked');

              // Save settings if requested
              if (saveSettings) {
                await power.setFlag("msh-faserip", "lastActionType", actionType);
                await power.setFlag("msh-faserip", "lastColumnShift", columnShift);
                await power.setFlag("msh-faserip", "skipDiceRoll", skipDice);
              }

              // Call this method again but with the gathered options
              return FaseripRolls.rollPower(actor, power, {
                useDirectRoll: true,
                actionType: actionType,
                columnShift: columnShift,
                karma: karma,
                skipDice: skipDice
              });
            }
          },
          cancel: { label: "Cancel" }
        },
        default: "roll"
      }).render(true);
    }
  }

  /**
   * Roll a talent
   * @param {Actor} actor - The actor who owns the talent
   * @param {Item} talent - The talent item to roll
   * @param {Object} options - Optional configuration for the roll
   */
  static async rollTalent(actor, talent, options = {}) {
    if (!actor || !talent) {
      ui.notifications.error("Actor or talent not found");
      return;
    }

    // Get talent bonus as column shift value
    let talentBonus = 0;
    switch (talent.system.bonus) {
      case "+1CS": talentBonus = 1; break;
      case "+2CS": talentBonus = 2; break;
      case "+3CS": talentBonus = 3; break;
      case "Special": talentBonus = 1; break; // Default for special
      default: talentBonus = 0;
    }

    // Get saved talent settings
    const savedActionType = talent.getFlag("msh-faserip", "lastActionType") || "";
    const savedExtraShift = talent.getFlag("msh-faserip", "lastExtraShift") || 0;
    const skipDiceRoll = talent.getFlag("msh-faserip", "skipDiceRoll") || false;

    // If this is a direct roll (called after dialog or with options)
    // Check if CTRL is pressed or if this is a direct roll call
    if (options.useDirectRoll || game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.CONTROL)) {
      // Optional notification that CTRL quick roll is being used
      if (game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.CONTROL)) {
        ui.notifications.info("Quick roll with saved settings (CTRL pressed)");
      }
      // Use provided options from dialog or direct call
      const actionType = options.actionType || savedActionType;
      const extraShift = options.extraShift ?? savedExtraShift;
      const karma = options.karma || 0;
      const skipDice = options.skipDice ?? skipDiceRoll;

      // Total column shift is talent bonus plus any extra shifts
      const totalColumnShift = talentBonus + extraShift;

      // Get ability information
      let abilityModified = talent.system.abilityModified;
      let abilityRank = abilityModified ? actor.system.abilities[abilityModified].rank : "Typical";
      let abilityValue = abilityModified ? actor.system.abilities[abilityModified].value : 6;

      // Apply column shifts to get effective rank
      let effectiveRank = abilityRank;
      if (totalColumnShift !== 0) {
        const ranks = [
          "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
          "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
          "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
        ];
        const index = ranks.indexOf(abilityRank);
        if (index !== -1) {
          const newIndex = Math.min(Math.max(index + totalColumnShift, 0), ranks.length - 1);
          effectiveRank = ranks[newIndex];
          console.log(`Applied ${totalColumnShift} column shifts to ${abilityRank}, now ${effectiveRank}`);
        }
      }

      // Create the roll
      const roll = new Roll("1d100");

      // Evaluate the roll
      await roll.evaluate();

      // Display the dice roll with flavor text if not skipped
      if (!skipDice) {
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: actor }),
          flavor: `${actor.name} uses ${talent.name}`,
          rollMode: game.settings.get("core", "rollMode")
        });
      }

      // Calculate the result
      const totalRoll = roll.total + karma;
      const resultColor = game.msh.rollUniversalTable(effectiveRank, totalRoll);

      // Format ability name for display
      const abilityName = abilityModified ?
        abilityModified.charAt(0).toUpperCase() + abilityModified.slice(1) :
        "None";

      // Define action types and results based on color
      const ACTIONS = {
        // Combat results
        "Blunt Attack (BA)": { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" },
        "Edged Attack (EA)": { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" },
        "Shooting Attack (Sh)": { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" },
        "Grappling (GP)": { white: "Miss", green: "Miss", yellow: "Partial", red: "Hold" },
        "Grabbing (Gb)": { white: "Miss", green: "Take", yellow: "Grab", red: "Break" },
        "Escaping (ES)": { white: "Miss", green: "Miss", yellow: "Escape", red: "Reverse" },

        // Non-combat results
        "Knowledge Check": { white: "No Knowledge", green: "Basic Knowledge", yellow: "Good Knowledge", red: "Expert Knowledge" },
        "Practical Application": { white: "Failure", green: "Basic Success", yellow: "Good Success", red: "Excellent Success" },
        "Analysis": { white: "Failed Analysis", green: "Basic Analysis", yellow: "Detailed Analysis", red: "Complete Analysis" },
        "Research": { white: "No Results", green: "Basic Results", yellow: "Good Results", red: "Breakthrough" },
        "Technical Application": { white: "Failure", green: "Works Minimally", yellow: "Works Well", red: "Works Perfectly" },
        "Mental Power": { white: "No Effect", green: "Minor Effect", yellow: "Moderate Effect", red: "Major Effect" },
        "Mystical Knowledge": { white: "No Insight", green: "Minor Insight", yellow: "Significant Insight", red: "Complete Insight" },
        "Skill Use": { white: "Failure", green: "Basic Success", yellow: "Good Success", red: "Excellent Success" }
      };

      // Get the result text - if action type doesn't have specific results, use color names
      let resultText = "";
      if (ACTIONS[actionType]) {
        resultText = ACTIONS[actionType][resultColor.toLowerCase()];
      } else {
        resultText = resultColor.toUpperCase();
      }

      // Create chat message styled to match screenshot
      let content = `
          <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
            <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
              <strong>${actor.name} - ${abilityName} Roll (${actionType})</strong>
            </div>
            <div style="padding: 5px 10px; font-size: 0.9em;">
              <div>Base Rank: ${abilityRank} (${abilityValue})</div>
              <div>Column Shift: ${totalColumnShift} → ${effectiveRank}</div>
              <div>Roll: ${roll.total} + Karma: ${karma} = ${totalRoll}</div>
            </div>
            <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
              background-color: ${resultColor.toLowerCase() === 'white' ? '#f8f8f8' :
          resultColor.toLowerCase() === 'green' ? '#4CAF50' :
            resultColor.toLowerCase() === 'yellow' ? '#FFD700' :
              '#F44336'}; 
              color: ${resultColor.toLowerCase() === 'white' || resultColor.toLowerCase() === 'yellow' ? '#333' : 'white'};">
              ${resultText} (${resultColor.toUpperCase()})
            </div>
          </div>
        `;

      // Send to chat
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: content
      });

      return { roll, resultColor, resultText };
    } else {
      // First call - show dialog to select options
      // Define action options based on talent type
      let actionOptions = [];

      // Get talent type and specialty
      const talentType = talent.system.type || "";
      const talentSpecialty = talent.system.specialty || "";

      // Assign appropriate action types based on talent type
      if (talentType === "Weapon Skill") {
        // Weapon skill actions
        if (talentSpecialty === "Blunt Weapons") {
          actionOptions = [
            { value: "Blunt Attack (BA)", label: "Blunt Attack (BA)" }
          ];
        } else if (talentSpecialty === "Sharp Weapons" || talentSpecialty === "Edged Weapons") {
          actionOptions = [
            { value: "Edged Attack (EA)", label: "Edged Attack (EA)" }
          ];
        } else if (talentSpecialty === "Thrown Weapons" || talentSpecialty === "Bows") {
          actionOptions = [
            { value: "Shooting Attack (Sh)", label: "Shooting Attack (Sh)" }
          ];
        } else {
          // Generic weapon options
          actionOptions = [
            { value: "Blunt Attack (BA)", label: "Blunt Attack (BA)" },
            { value: "Edged Attack (EA)", label: "Edged Attack (EA)" },
            { value: "Shooting Attack (Sh)", label: "Shooting Attack (Sh)" }
          ];
        }
      } else if (talentType === "Fighting Skill") {
        // Fighting skill actions
        actionOptions = [
          { value: "Grappling (GP)", label: "Grappling (GP)" },
          { value: "Grabbing (Gb)", label: "Grabbing (Gb)" },
          { value: "Escaping (ES)", label: "Escaping (ES)" },
          { value: "Blunt Attack (BA)", label: "Blunt Attack (BA)" }
        ];
      } else if (talentType === "Professional Skill") {
        // Professional skill actions
        actionOptions = [
          { value: "Knowledge Check", label: "Knowledge Check" },
          { value: "Practical Application", label: "Practical Application" }
        ];
      } else if (talentType === "Scientific Skill") {
        // Scientific skill actions
        actionOptions = [
          { value: "Analysis", label: "Analysis" },
          { value: "Research", label: "Research" },
          { value: "Technical Application", label: "Technical Application" }
        ];
      } else if (talentType === "Mystic/Mental Skill") {
        // Mystic/Mental skill actions
        actionOptions = [
          { value: "Mental Power", label: "Mental Power" },
          { value: "Mystical Knowledge", label: "Mystical Knowledge" }
        ];
      } else {
        // Default/generic options
        actionOptions = [
          { value: "Skill Use", label: "Skill Use" },
          { value: "Knowledge Check", label: "Knowledge Check" }
        ];
      }

      // Create action type options HTML
      const actionOptionsHTML = actionOptions.map(option =>
        `<option value="${option.value}" ${option.value === savedActionType ? 'selected' : ''}>${option.label}</option>`
      ).join('');

      // Get ability information for display
      let abilityModified = talent.system.abilityModified || "none";
      let abilityLabel = abilityModified ?
        abilityModified.charAt(0).toUpperCase() + abilityModified.slice(1) :
        "None";

      // Create dialog for roll options
      let dialogContent = `
        <div style="background: #f0e8d8; padding: 10px; border-radius: 5px;">
          <div style="margin-bottom: 10px;">
            <label style="display: inline-block; width: 120px;">Action Type:</label>
            <select id="action-type" name="actionType" style="width: 180px;">
              ${actionOptionsHTML}
            </select>
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display: inline-block; width: 120px;">Talent Bonus:</label>
            <input type="number" id="talent-bonus" name="talentBonus" value="${talentBonus}" style="width: 50px;" readonly>
            <span style="color: #666; font-size: 0.9em;">(${talent.system.bonus})</span>
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display: inline-block; width: 120px;">Ability Modified:</label>
            <input type="text" id="ability-modified" value="${abilityLabel}" style="width: 120px;" readonly>
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display: inline-block; width: 120px;">Extra Column Shift:</label>
            <input type="number" id="shift" name="shift" value="${savedExtraShift}" style="width: 50px;">
            <span style="color: #666; font-size: 0.9em;">(additional +/- CS)</span>
          </div>
          <div style="margin-bottom: 10px;">
            <label style="display: inline-block; width: 120px;">Karma Points:</label>
            <input type="number" id="karma" name="karma" value="0" min="0" style="width: 50px;">
          </div>
          <div style="margin-bottom: 10px;">
            <label>
              <input type="checkbox" id="skip-dice" name="skipDice" ${skipDiceRoll ? 'checked' : ''}> 
              Skip dice animation
            </label>
          </div>
          <div style="margin-top: 10px;">
            <label>
              <input type="checkbox" id="save-settings" name="saveSettings" checked> 
              Remember these settings for future rolls
            </label>
          </div>
        </div>`;

      return new Dialog({
        title: `Talent Roll: ${talent.name}`,
        content: dialogContent,
        buttons: {
          roll: {
            label: "Roll",
            callback: async (html) => {
              const actionType = html.find('[name="actionType"]').val();
              const extraShift = parseInt(html.find('[name="shift"]').val()) || 0;
              const karma = parseInt(html.find('[name="karma"]').val()) || 0;
              const skipDice = html.find('[name="skipDice"]').is(':checked');
              const saveSettings = html.find('[name="saveSettings"]').is(':checked');

              // Save settings if requested
              if (saveSettings) {
                await talent.setFlag("msh-faserip", "lastActionType", actionType);
                await talent.setFlag("msh-faserip", "lastExtraShift", extraShift);
                await talent.setFlag("msh-faserip", "skipDiceRoll", skipDice);
              }

              // Call this method again but with the gathered options
              return FaseripRolls.rollTalent(actor, talent, {
                useDirectRoll: true,
                actionType: actionType,
                extraShift: extraShift,
                karma: karma,
                skipDice: skipDice
              });
            }
          },
          cancel: { label: "Cancel" }
        },
        default: "roll"
      }).render(true);
    }
  }

  /**
   * Roll a contact
   * @param {Actor} actor - The actor who owns the contact
   * @param {Item} contact - The contact item to roll
   * @param {Object} options - Optional configuration for the roll
   */
  static async rollContact(actor, contact, options = {}) {
    if (!actor || !contact) {
      ui.notifications.error("Actor or contact not found");
      return;
    }

    // Get saved contact settings
    const savedActionType = contact.getFlag("msh-faserip", "lastActionType") || "Availability";
    const savedColumnShift = contact.getFlag("msh-faserip", "lastColumnShift") || 0;
    const skipDiceRoll = contact.getFlag("msh-faserip", "skipDiceRoll") || false;

    // If this is a direct roll (called after dialog or with options)
    // Check if CTRL is pressed or if this is a direct roll call
    if (options.useDirectRoll || game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.CONTROL)) {
      // Optional notification that CTRL quick roll is being used
      if (game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.CONTROL)) {
        ui.notifications.info("Quick roll with saved settings (CTRL pressed)");
      }
      // Use provided options
      const actionType = options.actionType || savedActionType;
      const columnShift = options.columnShift ?? savedColumnShift;
      const karma = options.karma || 0;
      const skipDice = options.skipDice ?? skipDiceRoll;

      // Get the hero's popularity
      const heroPopularity = actor.system.attributes?.popularity?.value || 0;
      const heroPopularityRank = actor.system.attributes?.popularity?.rank || "Typical";
      const isMutant = actor.system.powerOrigin === "mutant" || actor.system.isMutant;

      // Get contact type
      const contactType = contact.system.type || "General";

      // Determine effective disposition (normally Friendly, but affected by negative popularity)
      let effectiveDisposition = "Friendly";
      if (heroPopularity < 0) {
        effectiveDisposition = "Neutral";
      }

      // Map disposition to required FEAT color
      let requiredFeatColor;
      switch (effectiveDisposition) {
        case "Friendly": requiredFeatColor = "Green"; break;
        case "Neutral": requiredFeatColor = "Yellow"; break;
        case "Suspicious": requiredFeatColor = "Red"; break;
        case "Hostile": requiredFeatColor = "Impossible"; break;
      }

      // Apply column shifts to get effective rank
      let effectiveRank = heroPopularityRank;
      if (columnShift !== 0) {
        const ranks = [
          "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
          "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
        ];
        const index = ranks.indexOf(effectiveRank);
        if (index !== -1) {
          const newIndex = Math.min(Math.max(index + columnShift, 0), ranks.length - 1);
          effectiveRank = ranks[newIndex];
          console.log(`Applied ${columnShift} column shifts to ${heroPopularityRank}, now ${effectiveRank}`);
        }
      }

      // Apply mutant penalty if applicable
      if (isMutant) {
        // Apply a -1CS to reflect mutant penalty
        const ranks = [
          "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
          "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
        ];
        const index = ranks.indexOf(effectiveRank);
        if (index > 0) { // Don't go below Shift-0
          effectiveRank = ranks[index - 1];
          console.log(`Applied -1CS mutant penalty, now ${effectiveRank}`);
        }
      }

      // Create the roll
      const roll = new Roll("1d100");

      // Evaluate the roll
      await roll.evaluate();

      // Display the dice roll with flavor text if not skipped
      if (!skipDice) {
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: actor }),
          flavor: `${actor.name} contacts ${contact.name}`,
          rollMode: game.settings.get("core", "rollMode")
        });
      }

      // Calculate the result
      const totalRoll = roll.total + karma;
      const resultColor = game.msh.rollUniversalTable(effectiveRank, totalRoll);

      // Check if the result meets the required FEAT color
      let meetsFeatRequirement = false;
      switch (requiredFeatColor) {
        case "Green":
          meetsFeatRequirement = (resultColor.toLowerCase() === "green" || resultColor.toLowerCase() === "yellow" || resultColor.toLowerCase() === "red");
          break;
        case "Yellow":
          meetsFeatRequirement = (resultColor.toLowerCase() === "yellow" || resultColor.toLowerCase() === "red");
          break;
        case "Red":
          meetsFeatRequirement = (resultColor.toLowerCase() === "red");
          break;
        case "Impossible":
          meetsFeatRequirement = false; // Always fails
          break;
      }

      // Determine resource level based on contact type (simplified for brevity)
      let resourceLevel = "Typical";
      switch (contactType) {
        case "Law Enforcement": resourceLevel = "Remarkable"; break;
        case "Military": resourceLevel = "Amazing"; break;
        case "Business World": resourceLevel = "Incredible"; break;
        case "Journalism": resourceLevel = "Poor"; break;
        case "Scientific": resourceLevel = "Good"; break;
        case "State": resourceLevel = "Remarkable"; break;
        case "National": resourceLevel = "Monstrous"; break;
        case "International": resourceLevel = "Monstrous"; break;
        case "Planetary": resourceLevel = "Unearthly"; break;
        default: resourceLevel = "Typical";
      }

      // Define all possible results by color 
      const ALL_RESULTS = {
        "Availability": {
          white: "Unavailable",
          green: "Available (Limited)",
          yellow: "Available",
          red: "Eager to Help"
        },
        "Information": {
          white: "No Information",
          green: "Basic Information",
          yellow: "Good Information",
          red: "Detailed Information"
        },
        "Equipment": {
          white: "No Equipment",
          green: "Basic Equipment",
          yellow: `Good Equipment (up to ${resourceLevel} rank)`,
          red: `Excellent Equipment (up to ${resourceLevel} rank)`
        },
        "Assistance": {
          white: "No Assistance",
          green: "Limited Assistance",
          yellow: "Direct Assistance",
          red: "Above and Beyond"
        },
        "Favor": {
          white: "Refuses",
          green: "Small Favor Only",
          yellow: "Willing to Help",
          red: "Goes Above and Beyond"
        }
      };

      // Determine the result text
      let resultText;
      if (meetsFeatRequirement) {
        // If requirement met, use the result corresponding to the color rolled
        resultText = ALL_RESULTS[actionType][resultColor.toLowerCase()];
      } else {
        // If requirement not met, show the "failure" result regardless of color
        if (actionType === "Availability") resultText = "Unavailable";
        else if (actionType === "Information") resultText = "No Information";
        else if (actionType === "Equipment") resultText = "No Equipment";
        else if (actionType === "Assistance") resultText = "No Assistance";
        else if (actionType === "Favor") resultText = "Refuses";
      }

      // Create chat message styled to match others
      let content = `
        <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
          <div style="padding: 5px 10px; border-bottom: 1px solid #c0c0c0; font-size: 1.1em; color: #8b0000;">
            <strong>${actor.name} - ${contactType} Contact: ${contact.name} (${actionType})</strong>
          </div>
          <div style="padding: 5px 10px; font-size: 0.9em;">
            <div>Popularity: ${heroPopularityRank} (${heroPopularity})</div>
            <div>Disposition: ${effectiveDisposition} (Required: ${requiredFeatColor})</div>
            ${isMutant ? '<div style="color: #aa0000;">Mutant Penalty Applied (-1CS)</div>' : ''}
            <div>Effective Rank: ${heroPopularityRank} ${columnShift !== 0 ? `→ ${effectiveRank} (${columnShift > 0 ? '+' : ''}${columnShift}CS)` : ''}</div>
            <div>Roll: ${roll.total} + Karma: ${karma} = ${totalRoll}</div>
          </div>
          <div style="text-align: center; padding: 8px; margin: 5px; font-weight: bold; font-size: 1.1em; border-radius: 3px; 
            background-color: ${resultColor.toLowerCase() === 'white' ? '#f8f8f8' :
          resultColor.toLowerCase() === 'green' ? '#4CAF50' :
            resultColor.toLowerCase() === 'yellow' ? '#FFD700' :
              '#F44336'}; 
            color: ${resultColor.toLowerCase() === 'white' || resultColor.toLowerCase() === 'yellow' ? '#333' : 'white'};">
            ${resultText} (${resultColor.toUpperCase()})
          </div>
          ${!meetsFeatRequirement ?
          `<div style="padding: 5px 10px; font-size: 0.9em; color: #aa0000;">Failed to meet required ${requiredFeatColor} result for ${effectiveDisposition} contact</div>` : ''}
          ${heroPopularity < 0 ?
          '<div style="padding: 5px 10px; font-size: 0.9em; color: #aa0000;">Negative popularity affects contact relations</div>' : ''}
        </div>
      `;

      // Send to chat
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: content
      });

      // If hero has negative popularity, using contacts costs Karma
      if (heroPopularity < 0) {
        ui.notifications.warn("Negative popularity: Using contacts costs Karma!");
        // You could implement Karma reduction here if desired
      }

      return { roll, resultColor, resultText, meetsFeatRequirement };
    } else {
      // First call - show dialog to select options
      // Define contact action types
      const actionOptions = [
        { value: "Availability", label: "Availability" },
        { value: "Information", label: "Information Request" },
        { value: "Equipment", label: "Equipment Request" },
        { value: "Assistance", label: "Request Assistance" },
        { value: "Favor", label: "Request Favor" }
      ];

      // Create action type options HTML
      const actionOptionsHTML = actionOptions.map(option =>
        `<option value="${option.value}" ${option.value === savedActionType ? 'selected' : ''}>${option.label}</option>`
      ).join('');

      // Get the hero's popularity for display
      const heroPopularity = actor.system.attributes?.popularity?.value || 0;
      const heroPopularityRank = actor.system.attributes?.popularity?.rank || "Typical";
      const isMutant = actor.system.powerOrigin === "mutant" || actor.system.isMutant;

      // Determine effective disposition (normally Friendly, but affected by negative popularity)
      let effectiveDisposition = "Friendly";
      if (heroPopularity < 0) {
        effectiveDisposition = "Neutral";
      }

      // Map disposition to required FEAT color
      let requiredFeatColor;
      switch (effectiveDisposition) {
        case "Friendly": requiredFeatColor = "Green"; break;
        case "Neutral": requiredFeatColor = "Yellow"; break;
        case "Suspicious": requiredFeatColor = "Red"; break;
        case "Hostile": requiredFeatColor = "Impossible"; break;
      }

      // Create dialog for roll options
      let dialogContent = `
      <div style="background: #f0e8d8; padding: 10px; border-radius: 5px;">
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Request Type:</label>
          <select id="action-type" name="actionType" style="width: 180px;">
            ${actionOptionsHTML}
          </select>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Popularity:</label>
          <input type="text" id="popularity-rank" value="${heroPopularityRank}" style="width: 100px;" readonly>
          <span style="margin-left: 5px;">(${heroPopularity})</span>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Disposition:</label>
          <input type="text" id="disposition" value="${effectiveDisposition}" style="width: 100px;" readonly>
          ${heroPopularity < 0 ?
          '<span style="color: #aa0000; font-size: 0.9em;"> (Modified due to negative popularity)</span>' : ''}
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Required Result:</label>
          <input type="text" id="required-result" value="${requiredFeatColor}" style="width: 100px;" readonly>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Column Shift:</label>
          <input type="number" id="shift" name="shift" value="${savedColumnShift}" style="width: 50px;">
          <span style="color: #666; font-size: 0.9em;">(+ right, - left)</span>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Karma Points:</label>
          <input type="number" id="karma" name="karma" value="0" min="0" style="width: 50px;">
        </div>
        <div style="margin-bottom: 10px;">
          <label>
            <input type="checkbox" id="skip-dice" name="skipDice" ${skipDiceRoll ? 'checked' : ''}> 
            Skip dice animation
          </label>
        </div>
        <div style="margin-top: 10px;">
          <label>
            <input type="checkbox" id="save-settings" name="saveSettings" checked> 
            Remember these settings for future rolls
          </label>
        </div>
      </div>`;

      return new Dialog({
        title: `Contact Roll: ${contact.name}`,
        content: dialogContent,
        buttons: {
          roll: {
            label: "Roll",
            callback: async (html) => {
              const actionType = html.find('[name="actionType"]').val();
              const columnShift = parseInt(html.find('[name="shift"]').val()) || 0;
              const karma = parseInt(html.find('[name="karma"]').val()) || 0;
              const skipDice = html.find('[name="skipDice"]').is(':checked');
              const saveSettings = html.find('[name="saveSettings"]').is(':checked');

              // Save settings if requested
              if (saveSettings) {
                await contact.setFlag("msh-faserip", "lastActionType", actionType);
                await contact.setFlag("msh-faserip", "lastColumnShift", columnShift);
                await contact.setFlag("msh-faserip", "skipDiceRoll", skipDice);
              }

              // Call this method again but with the gathered options
              return FaseripRolls.rollContact(actor, contact, {
                useDirectRoll: true,
                actionType: actionType,
                columnShift: columnShift,
                karma: karma,
                skipDice: skipDice
              });
            }
          },
          cancel: { label: "Cancel" }
        },
        default: "roll"
      }).render(true);
    }
  }

  /**
* Roll equipment
* @param {Actor} actor - The actor who owns the equipment
* @param {Item} equipment - The equipment item to roll
* @param {Object} options - Optional configuration for the roll
*/
  static async rollEquipment(actor, equipment, options = {}) {
    console.log("rollEquipment called", equipment); // Debug

    if (!actor || !equipment) {
      ui.notifications.error("Actor or equipment not found");
      return;
    }

    // Get saved equipment settings - ADD THIS SECTION
    const savedActionType = equipment.getFlag("msh-faserip", "lastActionType") || "";
    const savedColumnShift = equipment.getFlag("msh-faserip", "lastColumnShift") || 0;
    const skipDiceRoll = equipment.getFlag("msh-faserip", "skipDiceRoll") || false;

    // Get equipment information
    const category = equipment.system.category || "gear";

    // Check ammunition at the very beginning for weapons
    if (category === "weapon" && equipment.system.shots) {
      // Explicitly parse as integer and handle missing/undefined values
      const currentShots = equipment.system.shotsRemaining !== undefined ?
        parseInt(equipment.system.shotsRemaining) : 0;

      console.log("Weapon shots check:", equipment.name, currentShots); // Debug

      if (currentShots <= 0) {
        // Weapon is out of ammo - show notification and chat message
        ui.notifications.warn(`${equipment.name} is out of ammunition! Reload required.`);

        // Create a chat message about being out of ammo
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `
              <div style="background-color: #f5f5f0; border: 1px solid #c0c0c0; border-radius: 3px; margin-bottom: 5px;">
                <div style="padding: 5px 10px; font-size: 1.1em; color: #8b0000; text-align: center;">
                  <strong>${equipment.name} is out of ammunition!</strong>
                </div>
                <div style="padding: 5px 10px; text-align: center;">
                  <em>Manual reload required before firing again.</em>
                </div>
              </div>
            `
        });

        // Return early without rolling dice or performing the attack
        return { outOfAmmo: true };
      }
    }

    // Handle different equipment categories
    if (category === "weapon") {
      // Roll for weapon attack
      const rank = equipment.system.materialStrength || "Typical";
      const damage = equipment.system.damage || "-";
      const damageType = equipment.system.damageType || "Blunt";
      const range = equipment.system.range || "None";
      // Get the weapon type from the equipment
      const weaponType = equipment.system.weaponType || "";

      // Determine default action based on weapon type
      let defaultAction = "Shooting Attack (Sh)";
      if (weaponType === "melee" && damageType === "BA") {
        defaultAction = "Blunt Attack (BA)";
      } else if (weaponType === "melee" && damageType === "EA") {
        defaultAction = "Edged Attack (EA)";
      } else if (weaponType === "thrown" && damageType === "BA") {
        defaultAction = "Throwing Blunt (TB)";
      } else if (weaponType === "thrown" && damageType === "EA") {
        defaultAction = "Throwing Edged (TE)";
      } else if (weaponType === "energy" || damageType === "E") {
        defaultAction = "Energy (En)";
      } else if (weaponType === "force" || damageType === "F") {
        defaultAction = "Force (Fo)";
      } else if (weaponType === "grappling" || damageType === "GP") {
        defaultAction = "Grappling (GP)";
      } else if (weaponType === "grabbing" || damageType === "Gb") {
        defaultAction = "Grabbing (Gb)";
      }
      else if (damageType === "Stun" || equipment.system.stunIntensity) {
        defaultAction = "Stunning Attack";
      }

      // Define action types from the Universal Table
      const ACTIONS = {
        "Blunt Attack (BA)": { ability: "fighting", results: { white: "Miss", green: "Hit", yellow: "Slam", red: "Stun" } },
        "Edged Attack (EA)": { ability: "fighting", results: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" } },
        "Shooting Attack (Sh)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" } },
        "Throwing Edged (TE)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Stun", red: "Kill" } },
        "Throwing Blunt (TB)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Hit", red: "Stun" } },
        "Energy (En)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Kill" } },
        "Force (Fo)": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Bullseye", red: "Stun" } },
        "Grappling (GP)": { ability: "strength", results: { white: "Miss", green: "Miss", yellow: "Partial", red: "Hold" } },
        "Grabbing (Gb)": { ability: "strength", results: { white: "Miss", green: "Take", yellow: "Grab", red: "Break" } },
        "Escaping (Es)": { ability: "strength", results: { white: "Miss", green: "Miss", yellow: "Escape", red: "Reverse" } },
        "Stunning Attack": { ability: "agility", results: { white: "Miss", green: "Hit", yellow: "Hit", red: "Hit" } }
      };

      // If this is a macro or direct call with options provided
      // Check if CTRL is pressed or if this is a direct roll call
      if (options.useDirectRoll || game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.CONTROL)) {
        // Optional notification that CTRL quick roll is being used
        if (game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.CONTROL)) {
          ui.notifications.info("Quick roll with saved settings (CTRL pressed)");
        }

        const actionName = options.actionType || savedActionType || defaultAction;
        const action = ACTIONS[actionName];
        const shift = parseInt(options.columnShift) || savedColumnShift || 0;
        const karma = parseInt(options.karma) || 0;
        const skipDice = options.skipDice ?? skipDiceRoll;

        // Get the ability to use (fighting or agility)
        const abilityKey = action.ability || "fighting";
        const abilityRank = actor.system.abilities[abilityKey].rank || "Typical";
        const abilityValue = actor.system.abilities[abilityKey].value || 10;

        // Apply column shifts if needed
        let effectiveRank = abilityRank;
        if (shift !== 0) {
          const ranks = [
            "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
            "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly"
          ];
          const index = ranks.indexOf(abilityRank);
          if (index !== -1) {
            const newIndex = Math.min(Math.max(index + shift, 0), ranks.length - 1);
            effectiveRank = ranks[newIndex];
          }
        }

        // Create the roll and evaluate it
        const roll = new Roll("1d100");
        await roll.evaluate();

        // Calculate the result
        let cappedTotal = roll.total;
        let karmaUsed = 0;

        if (karma > 0) {
          cappedTotal = Math.min(100, roll.total + karma);
          karmaUsed = cappedTotal - roll.total;
        }

        // ✅ Now use cappedTotal instead of totalRoll
        const resultColor = game.msh.rollUniversalTable(effectiveRank, cappedTotal);
        const effect = action.results[resultColor.toLowerCase()];

        if (karmaUsed > 0) {
          const history = foundry.utils.deepClone(actor.system.karma?.history || []);
          const newEvent = {
            realDate: new Date().toLocaleDateString(),
            gameDate: "",
            amount: -karmaUsed,
            type: "Die Roll",
            description: `Spent on ${equipment.name} (Equipment)`
          };
          history.push(newEvent);
          await actor.update({ "system.karma.history": history });
        }

        // Get grenade properties if applicable
        let additionalInfo = "";
        const isGrenade = equipment.name.toLowerCase().includes("grenade") ||
          equipment.system.weaponType === "grenade";
        if (isGrenade && equipment.system.grenadeType) {
          additionalInfo += `<div><strong>Grenade Type:</strong> ${equipment.system.grenadeType}</div>`;
          if (equipment.system.grenadeRadius) {
            additionalInfo += `<div><strong>Blast Radius:</strong> ${equipment.system.grenadeRadius} areas</div>`;
          }
          if (equipment.system.grenadeIntensity) {
            additionalInfo += `<div><strong>Intensity:</strong> ${equipment.system.grenadeIntensity}</div>`;
          }
          if (equipment.system.grenadeDamage) {
            additionalInfo += `<div><strong>Damage:</strong> ${equipment.system.grenadeDamage} ${equipment.system.grenadeDamageType ? `(${equipment.system.grenadeDamageType})` : ''}</div>`;
          }
        }

        const isMissileLauncher = equipment.name.toLowerCase().includes("missile") ||
          equipment.system.weaponType === "missile";
        if (isGrenade && equipment.system.grenadeType) {
          additionalInfo += `<div><strong>Missile Type:</strong> ${equipment.system.missileType}</div>`;
          if (equipment.system.guidanceSystem) {
            additionalInfo += `<div><strong>Guidance:</strong> ${equipment.system.guidanceSystem}</div>`;
          }
          if (equipment.system.payloadType) {
            additionalInfo += `<div><strong>Payload:</strong> ${equipment.system.payloadType}</div>`;
          }
          if (equipment.system.missileDamage) {
            additionalInfo += `<div><strong>Damage:</strong> ${equipment.system.missileDamage} ${equipment.system.missileDamageType ? `(${equipment.system.missileDamageType})` : ''}</div>`;
            if (equipment.system.missileSecondaryDamage) {
              additionalInfo += `<div><strong>Secondary Damage:</strong> ${equipment.system.missileSecondaryDamage} to adjacent areas</div>`;
            }
          }
        }

        // Special ammo effects
        if (equipment.system.ammoType !== "Standard") {
          let ammoEffect = "";
          switch (equipment.system.ammoType) {
            case "Mercy":
              ammoEffect = "Target must make Endurance FEAT vs Remarkable drug or be knocked out for 1-10 rounds";
              break;
            case "AP":
              ammoEffect = "Reduces target Body Armor by 2 CS";
              break;
            case "Rubber":
              ammoEffect = "Inflicts Slugfest damage instead of Shooting damage";
              break;
            case "Explosive":
              ammoEffect = "Double normal damage";
              break;
            case "Heat-Seeker":
              ammoEffect = "Seeks hottest source, no penalty for range";
              break;
          }
          if (ammoEffect) {
            additionalInfo += `<div><strong>Ammo Effect:</strong> ${ammoEffect}</div>`;
          }
        }

        // Create a single enhanced message that includes the roll and all information
        const messageContent = `
          <div>
            <h3 style="color: #8B0000; margin: 0 0 5px 0; font-size: 1.1em;">${actor.name} - ${equipment.name} (${actionName})</h3>
            <div style="margin-bottom: 5px; font-size: 0.9em;">
              <div>Base Rank: ${abilityRank} (${abilityValue})</div>
              <div>Column Shift: ${shift !== 0 ? `${shift} → ${effectiveRank}` : "None"}</div>

              <div>Roll: ${roll.total} + Karma: ${karmaUsed} = ${cappedTotal}</div>

              ${equipment.system.ammoType !== "Standard" ? `<div>Ammo Effect: ${equipment.system.ammoType}</div>` : ''}
              ${additionalInfo}
            </div>
            <div style="
              background-color: ${resultColor.toLowerCase() === 'white' ? '#FFFFFF' :
            resultColor.toLowerCase() === 'green' ? '#4CAF50' :
              resultColor.toLowerCase() === 'yellow' ? '#FFC107' :
                '#F44336'
          }; 
              color: ${resultColor.toLowerCase() === 'white' ? '#000000' :
            resultColor.toLowerCase() === 'yellow' ? '#000000' : '#FFFFFF'
          };
              padding: 8px;
              text-align: center;
              font-weight: bold;
              font-size: 1.1em;
              border-radius: 3px;
              border: ${resultColor.toLowerCase() === 'white' ? '1px solid #CCCCCC' : 'none'};
            ">
              ${effect} (${resultColor.toUpperCase()})
            </div>
          </div>
          `;

        // Display the enhanced message with the roll
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: messageContent,
          roll: roll
        });

        // After the roll is complete and the chat message is created, update ammunition:
        if (category === "weapon" && equipment.system.shots) {
          const currentShots = equipment.system.shotsRemaining !== undefined ?
            parseInt(equipment.system.shotsRemaining) : 0;

          if (currentShots > 0) {
            // Decrement ammunition
            const newShots = currentShots - 1;
            console.log(`${equipment.name}: Reducing ammo from ${currentShots} to ${newShots}`);

            try {
              // Method 1: Direct item update
              await equipment.update({ "system.shotsRemaining": newShots });

              // Method 2: Actor embedded document update (as a backup)
              await actor.updateEmbeddedDocuments("Item", [{
                _id: equipment.id,
                "system.shotsRemaining": newShots
              }]);

              console.log("Ammunition updated successfully");
            } catch (error) {
              console.error("Failed to update ammunition:", error);
            }
          }
        }

        return { roll, resultColor, effect };
      }

      // Otherwise show dialog for interactive roll
      // Create dialog for roll options
      let dialogContent = `
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Action Type:</label>
          <select id="action" name="action" style="width: 180px;">
            ${Object.keys(ACTIONS).map(action =>
        `<option value="${action}" ${action === defaultAction ? 'selected' : ''}>${action}</option>`
      ).join('')}
          </select>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Column Shift:</label>
          <input type="number" id="shift" name="shift" value="0" style="width: 50px;">
          <span style="color: #666; font-size: 0.9em;">(+ right, - left)</span>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: inline-block; width: 120px;">Karma Points:</label>
          <input type="number" id="karma" name="karma" value="0" min="0" style="width: 50px;">
        </div>
        <div>
          <label>
            <input type="checkbox" id="skip-dice" name="skipDice"> 
            Skip dice animation
          </label>
        <div style="margin-top: 10px;">
        <label>
          <input type="checkbox" id="save-settings" name="saveSettings" checked> 
          Remember these settings for future rolls
        </label>
      </div>
    `;

      return new Dialog({
        title: `Equipment Roll: ${equipment.name}`,
        content: dialogContent,
        buttons: {
          roll: {
            label: "Roll",
            callback: async (html) => {
              const actionName = html.find('[name="action"]').val();
              const shift = parseInt(html.find('[name="shift"]').val()) || 0;
              const karma = parseInt(html.find('[name="karma"]').val()) || 0;
              const skipDice = html.find('[name="skipDice"]').is(':checked');
              const saveSettings = html.find('[name="saveSettings"]').is(':checked');

              // Save settings if requested
              if (saveSettings) {
                await equipment.setFlag("msh-faserip", "lastActionType", actionName);
                await equipment.setFlag("msh-faserip", "lastColumnShift", shift);
                await equipment.setFlag("msh-faserip", "skipDiceRoll", skipDice);
              }

              // Call this method again but with the gathered options
              return FaseripRolls.rollEquipment(actor, equipment, {
                useDirectRoll: true,
                actionType: actionName,
                columnShift: shift,
                karma: karma,
                skipDice: skipDice
              });
            }
          },
          cancel: { label: "Cancel" }
        },
        default: "roll"
      }).render(true);
    }
    else if (category === "power-item") {
      // For power items, roll using the power mechanism
      const powerRank = equipment.system.powerRank || "Typical";
      const powerType = equipment.system.powerType || "";

      // Use the power roll function
      return game.msh.rollPower(actor, {
        name: equipment.name,
        type: "power",
        system: {
          rank: powerRank,
          value: FaseripRolls._getRankValue(powerRank),
          type: powerType,
          range: equipment.system.powerRange || ""
        },
        getFlag: () => null // Simple stub for the getFlag method
      });
    }
    else {
      // For other equipment types, show info message
      ui.notifications.info(`${actor.name} uses ${equipment.name} (${equipment.system.materialStrength || "Typical"})`);

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `
        <div class="faserip-equipment-use">
          <h3>${actor.name} uses ${equipment.name}</h3>
          <div class="equipment-info">
            <div><strong>Type:</strong> ${category}</div>
            <div><strong>Material:</strong> ${equipment.system.materialStrength || "Typical"}</div>
            ${equipment.system.description ? `<div class="description">${equipment.system.description}</div>` : ''}
          </div>
        </div>
        <style>
          .faserip-equipment-use {
            font-family: Arial, sans-serif;
            background: #f9f8f4;
            border: 1px solid #ccc;
            border-radius: 3px;
            padding: 8px;
          }
          .faserip-equipment-use h3 {
            margin: 0 0 8px 0;
            border-bottom: 1px solid #ccc;
            padding-bottom: 4px;
            font-size: 1.1em;
          }
          .equipment-info {
            margin-bottom: 8px;
            font-size: 0.95em;
          }
          .equipment-info div {
            margin-bottom: 3px;
          }
          .description {
            margin-top: 6px;
            font-style: italic;
            border-top: 1px dotted #ccc;
            padding-top: 6px;
          }
        </style>
      `
      });

      return true;
    }
  }

  // Helper method to convert rank names to values
  static _getRankValue(rankName) {
    const rankValues = {
      "Shift-0": 0,
      "Feeble": 2,
      "Poor": 4,
      "Typical": 6,
      "Good": 10,
      "Excellent": 20,
      "Remarkable": 30,
      "Incredible": 40,
      "Amazing": 50,
      "Monstrous": 75,
      "Unearthly": 100
    };

    return rankValues[rankName] || 6; // Default to Typical if not found
  }
}