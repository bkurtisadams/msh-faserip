// scripts/modules/ui/universal-table-tab.js v1.0.0 - 2026-04-23
// Data-driven Universal Table tab. Replaces 663 lines of hand-typed HTML
// in actor-sheet.html with three tables built from canonical sources
// (rankRows, ACTION_RESULT_LABELS, RANKS_ORDERED, RANK_VALUES, RANK_RANGES).
// Features: crosshair hover with tooltip, persistent rank-column select,
// action-header click → sheet._showActionInfo(id), external roll
// highlighting via highlightRoll().

import {
  rankRows,
  ACTION_RESULT_LABELS,
  actionTypes,
  ACTION_ABILITY_MAP
} from "../dice/universal-table.js";

import {
  RANKS_ORDERED,
  RANK_VALUES,
  RANK_RANGES
} from "../../rules/rules-reference.js";

// ── Display data ──────────────────────────────────────────────────

const CODE_TO_ID = {
  BA: "blunt-attack",   EA: "edged-attack",   Sh: "shooting",
  TE: "throwing-edged", TB: "throwing-blunt", En: "energy", Fo: "force",
  Gp: "grappling",      Gb: "grabbing",       Es: "escaping",
  Ch: "charging",
  Do: "dodging",        Ev: "evading",        Bl: "blocking", Ca: "catching",
  St: "stun",           Sl: "slam",           Ki: "kill"
};

// Multi-line display names that break well in narrow columns
const ACTION_NAME_DISPLAY = {
  BA: "Blunt\nAttacks",   EA: "Edged\nAttacks",   Sh: "Shooting\nAttacks",
  TE: "Throwing\nEdged",  TB: "Throwing\nBlunt",  En: "Energy",  Fo: "Force",
  Gp: "Grap-\npling",     Gb: "Grab-\nbing",      Es: "Escap-\ning",
  Ch: "Charg-\ning",
  Do: "Dodging",          Ev: "Evad-\ning",       Bl: "Blocking", Ca: "Catching",
  St: "Stun?",            Sl: "Slam?",            Ki: "Kill?"
};

const ABILITY_DISPLAY = {
  fighting: "Fighting",
  agility: "Agility",
  strength: "Strength",
  endurance: "Endur-\nance"
};

// Short compact rank header abbrs (narrower than RANK_ABBR)
const RANK_SHORT = {
  "Shift-0": "0",    "Feeble": "Fe",   "Poor": "Pr",    "Typical": "Ty",
  "Good": "Gd",      "Excellent": "Ex","Remarkable": "Rm","Incredible": "In",
  "Amazing": "Am",   "Monstrous": "Mn","Unearthly": "Un",
  "Shift-X": "X",    "Shift-Y": "Y",   "Shift-Z": "Z",
  "Class 1000": "1000", "Class 3000": "3000", "Class 5000": "5000",
  "Beyond": "B"
};

const RANK_DISPLAY_NAME = {
  "Shift-0": "Shift", "Shift-X": "Shift", "Shift-Y": "Shift", "Shift-Z": "Shift",
  "Class 1000": "Class", "Class 3000": "Class", "Class 5000": "Class"
};

// Rolled-d100 row labels that match rankRows[].label format for matching
const ROLL_ROW_RANGES = [
  [1,1],   [2,3],   [4,6],   [7,10],  [11,15], [16,20], [21,25], [26,30],
  [31,35], [36,40], [41,45], [46,50], [51,55], [56,60], [61,65], [66,70],
  [71,75], [76,80], [81,85], [86,90], [91,94], [95,97], [98,99], [100,100]
];

const COLOR_CLASS = { white: "c-w", green: "c-g", yellow: "c-y", red: "c-r" };
const COLOR_NAME  = { white: "White", green: "Green", yellow: "Yellow", red: "Red" };

// ── Class ─────────────────────────────────────────────────────────

export class UniversalTableTab {
  constructor(sheet) {
    this.sheet = sheet;
    this._selectedCol = -1;
  }

  render(html) {
    const root = html.find(".ut-tab-root");
    if (!root.length) return;

    root.html(`
      <div class="ut-inner">
        ${this._buildActionTable()}
        ${this._buildRankTable()}
        ${this._buildGrid()}
      </div>
      <div class="ut-tip" id="ut-tip"></div>
    `);

    this._wireHeaderClick(html);
    this._wireCellHover(html);
    this._wireColumnSelect(html);

    // Restore column selection visual if user had one picked before re-render
    if (this._selectedCol >= 0) this._paintColumnSelection(html, this._selectedCol);
  }

  // ── Builders ────────────────────────────────────────────────────

  _buildCols() {
    let c = '<colgroup><col class="ut-col-roll">';
    for (let i = 0; i < RANKS_ORDERED.length; i++) c += '<col class="ut-col-rank">';
    c += '</colgroup>';
    return c;
  }

  _buildActionTable() {
    const cols = this._buildCols();

    // Header row: action name + abbr + ability, clickable for rules popup
    let head = '<tr><th class="ut-col-roll"></th>';
    for (const at of actionTypes) {
      const name = ACTION_NAME_DISPLAY[at.code] ?? at.label;
      const abilityKey = ACTION_ABILITY_MAP[at.code];
      const ability = ABILITY_DISPLAY[abilityKey] ?? abilityKey ?? "";
      const infoId = CODE_TO_ID[at.code] ?? "";
      head += `<th class="ut-col-rank ut-action-head" data-action-id="${infoId}" data-action-code="${at.code}" title="${at.label} (${at.code}) — click for rules">`;
      head += `<div class="at-name">${name.replace(/\n/g, "<br>")}</div>`;
      head += `<div class="at-abbr">${at.code}</div>`;
      head += `<div class="at-ability">${ability.replace(/\n/g, "<br>")}</div>`;
      head += `</th>`;
    }
    head += '</tr>';

    // 4 result rows (White/Green/Yellow/Red)
    const resultRows = [
      { label: "White",  cls: "row-w", color: "white"  },
      { label: "Green",  cls: "row-g", color: "green"  },
      { label: "Yellow", cls: "row-y", color: "yellow" },
      { label: "Red",    cls: "row-r", color: "red"    },
    ];

    let body = '';
    for (const r of resultRows) {
      body += `<tr class="${r.cls}"><td class="row-label">${r.label}</td>`;
      for (const at of actionTypes) {
        const label = ACTION_RESULT_LABELS[at.code]?.[r.color] ?? "";
        body += `<td>${label}</td>`;
      }
      body += '</tr>';
    }

    return `<table class="action-tbl">${cols}<thead>${head}</thead><tbody>${body}</tbody></table>`;
  }

  _buildRankTable() {
    const cols = this._buildCols();

    // Row 1: short abbr (clickable for column select)
    let r1 = '<tr><th class="ut-col-roll rk-corner">Rank</th>';
    RANKS_ORDERED.forEach((name, i) => {
      const short = RANK_SHORT[name] ?? name;
      r1 += `<th class="ut-col-rank rk-head" data-col="${i}" title="${name} — click to highlight column"><div class="rk-abbr">${short}</div><div class="rk-name">${RANK_DISPLAY_NAME[name] ?? name}</div></th>`;
    });
    r1 += '</tr>';

    // Row 2: canonical numeric value
    let r2 = '<tr><th class="ut-col-roll">Value</th>';
    RANKS_ORDERED.forEach(name => {
      const v = RANK_VALUES[name];
      const disp = v === 9999 ? "∞" : (v ?? "");
      r2 += `<td class="rk-val">${disp}</td>`;
    });
    r2 += '</tr>';

    // Row 3: FEAT range (some ranks have no range — leave blank)
    let r3 = '<tr><th class="ut-col-roll">Range</th>';
    RANKS_ORDERED.forEach(name => {
      const rng = RANK_RANGES[name];
      const disp = !rng ? "" : (rng[1] === Infinity ? `${rng[0]}+` : `${rng[0]}–${rng[1]}`);
      r3 += `<td class="rk-range">${disp}</td>`;
    });
    r3 += '</tr>';

    return `<table class="rank-tbl">${cols}<thead>${r1}</thead><tbody>${r2}${r3}</tbody></table>`;
  }

  _buildGrid() {
    const cols = this._buildCols();
    let body = '';
    rankRows.forEach((row, ri) => {
      body += `<tr data-row="${ri}" data-roll-label="${row.label}">`;
      body += `<td class="ut-roll">${row.label}</td>`;
      row.colors.forEach((color, ci) => {
        const cls = COLOR_CLASS[color] ?? "c-w";
        body += `<td class="${cls} ut-cell" data-col="${ci}" data-row="${ri}" data-color="${color}"></td>`;
      });
      body += '</tr>';
    });
    return `<table class="ut-grid">${cols}<tbody>${body}</tbody></table>`;
  }

  // ── Wiring ──────────────────────────────────────────────────────

  _wireHeaderClick(html) {
    const sheet = this.sheet;
    html.find(".action-tbl thead .ut-action-head").on("click", async (ev) => {
      const id = ev.currentTarget.dataset.actionId;
      if (!id || !sheet?._showActionInfo) return;
      await sheet._showActionInfo(id);
    });
  }

  _wireCellHover(html) {
    const grid = html.find(".ut-grid")[0];
    const tip = html.find("#ut-tip")[0];
    if (!grid || !tip) return;

    let curCell = null;

    const clearHL = () => {
      grid.querySelectorAll(".cell-hl, .col-hl, .row-hl").forEach(el => {
        el.classList.remove("cell-hl", "col-hl", "row-hl");
      });
    };

    grid.addEventListener("mouseover", (e) => {
      const td = e.target.closest("td[data-col][data-row]");
      if (td === curCell) return;
      clearHL();
      curCell = td;
      if (!td) { tip.style.display = "none"; return; }

      const col = parseInt(td.dataset.col);
      const row = parseInt(td.dataset.row);
      const color = td.dataset.color;
      const rollLabel = rankRows[row]?.label ?? "";
      const rankName = RANKS_ORDERED[col] ?? "";
      const rankShort = RANK_SHORT[rankName] ?? rankName;

      td.classList.add("cell-hl");
      grid.querySelectorAll(`td[data-col="${col}"]`).forEach(el => el.classList.add("col-hl"));
      const tr = td.parentElement;
      tr.querySelectorAll("td").forEach(el => el.classList.add("row-hl"));

      tip.textContent = `${rollLabel} / ${rankName} (${rankShort}) → ${COLOR_NAME[color] ?? color}`;
      tip.style.display = "block";
    });

    grid.addEventListener("mousemove", (e) => {
      if (tip.style.display !== "block") return;
      tip.style.left = (e.clientX + 12) + "px";
      tip.style.top  = (e.clientY - 28) + "px";
    });

    grid.addEventListener("mouseleave", () => {
      clearHL();
      curCell = null;
      tip.style.display = "none";
    });
  }

  _wireColumnSelect(html) {
    const rankThead = html.find(".rank-tbl thead")[0];
    if (!rankThead) return;

    rankThead.addEventListener("click", (e) => {
      const th = e.target.closest("th[data-col]");
      if (!th) return;
      const col = parseInt(th.dataset.col);
      if (this._selectedCol === col) {
        // Toggle off
        this._clearColumnSelection(html);
        this._selectedCol = -1;
      } else {
        this._clearColumnSelection(html);
        this._selectedCol = col;
        this._paintColumnSelection(html, col);
      }
    });
  }

  _clearColumnSelection(html) {
    html.find(".rank-tbl .col-sel").removeClass("col-sel");
    html.find(".ut-grid .col-sel-bg").removeClass("col-sel-bg");
    html.find(".action-tbl .col-sel-bg").removeClass("col-sel-bg");
  }

  _paintColumnSelection(html, col) {
    html.find(`.rank-tbl th[data-col="${col}"]`).addClass("col-sel");
    html.find(`.ut-grid td[data-col="${col}"]`).addClass("col-sel-bg");
    // Highlight matching action column (+1 for the label col)
    const actionCols = html.find(".action-tbl tr > *");
    // The action table has header row + 4 result rows, each with th/td indexed by col+1
    html.find(".action-tbl tr").each((_, tr) => {
      const cells = tr.children;
      if (cells[col + 1]) cells[col + 1].classList.add("col-sel-bg");
    });
  }

  // ── External roll highlight ─────────────────────────────────────

  /**
   * Pulse the cell corresponding to a d100 result on a specific rank column.
   * Called from the actor sheet's msh-faserip.universalTableRoll hook.
   * @param {string} rankName — canonical rank name (from RANKS_ORDERED)
   * @param {number} roll — 1-100
   */
  highlightRoll(html, rankName, roll) {
    const col = RANKS_ORDERED.indexOf(rankName);
    if (col === -1) return;

    let row = -1;
    for (let i = 0; i < ROLL_ROW_RANGES.length; i++) {
      const [lo, hi] = ROLL_ROW_RANGES[i];
      if (roll >= lo && roll <= hi) { row = i; break; }
    }
    if (row === -1) return;

    const grid = html.find(".ut-grid")[0];
    if (!grid) return;

    grid.querySelectorAll(".roll-highlight").forEach(el => el.classList.remove("roll-highlight"));
    const cell = grid.querySelector(`td[data-col="${col}"][data-row="${row}"]`);
    if (!cell) return;
    cell.classList.add("roll-highlight");
    cell.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setTimeout(() => cell.classList.remove("roll-highlight"), 10000);
  }
}
