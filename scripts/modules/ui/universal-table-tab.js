// scripts/modules/ui/universal-table-tab.js v1.1.0 - 2026-04-23
// v1.1.0: Add detach/popout feature via FaseripUniversalTableWindow
//         (ApplicationV2). Detach icon in tab toolbar; click opens popout,
//         in-tab content shows placeholder with "Return to tab" button.
//         Roll highlights route to popout when detached, tab otherwise.
//         Window position/size persisted per-actor via msh-faserip flag.
//         Escape key closes popout. Popout auto-closes with sheet.
//         Wiring methods (_wireHeaderClick, _wireCellHover,
//         _wireColumnSelect, _clearColumnSelection, _paintColumnSelection,
//         _highlightRollIn) now take plain DOM root elements instead of
//         jQuery wrappers, so the same renderer drives both hosts.
// v1.0.0: Data-driven Universal Table tab. Replaces 663 lines of
//         hand-typed HTML in actor-sheet.html with three tables built
//         from canonical sources (rankRows, ACTION_RESULT_LABELS,
//         RANKS_ORDERED, RANK_VALUES, RANK_RANGES). Features: crosshair
//         hover with tooltip, persistent rank-column select, action-header
//         click → sheet._showActionInfo(id), external roll highlighting
//         via highlightRoll().

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
    this._popout = null;  // FaseripUniversalTableWindow when detached
  }

  render(html) {
    const root = html.find(".ut-tab-root")[0];
    if (!root) return;

    // If detached, show placeholder and bail
    if (this._popout?.rendered) {
      this._renderPlaceholder(root);
      return;
    }

    this._renderBody(root);
  }

  _renderPlaceholder(root) {
    root.innerHTML = `
      <div class="ut-placeholder">
        <div class="ut-placeholder-icon"><i class="fas fa-up-right-from-square"></i></div>
        <div class="ut-placeholder-text">Universal Table is open in its own window.</div>
        <button type="button" class="ut-placeholder-btn" data-ut-action="reattach">Return to tab</button>
      </div>
    `;
    root.querySelector("[data-ut-action='reattach']").addEventListener("click", () => {
      this.reattach();
    });
  }

  _renderBody(root) {
    root.innerHTML = `
      <div class="ut-toolbar">
        <button type="button" class="ut-detach-btn" data-ut-action="detach"
                data-tooltip="Open in its own window">
          <i class="fas fa-up-right-from-square"></i>
        </button>
      </div>
      <div class="ut-inner">
        ${this._buildActionTable()}
        ${this._buildRankTable()}
        ${this._buildGrid()}
      </div>
      <div class="ut-tip" id="ut-tip-${this.sheet.id}"></div>
    `;

    root.querySelector("[data-ut-action='detach']").addEventListener("click", () => {
      this.detach();
    });

    this._wireHeaderClick(root);
    this._wireCellHover(root);
    this._wireColumnSelect(root);

    if (this._selectedCol >= 0) this._paintColumnSelection(root, this._selectedCol);
  }

  /** Wire the tab content into a generic root element (used by the popout too). */
  renderIntoRoot(root) {
    this._renderBody(root);
  }

  // ── Detach / reattach ────────────────────────────────────────────

  async detach() {
    if (this._popout?.rendered) { this._popout.bringToTop?.(); return; }
    this._popout = new FaseripUniversalTableWindow(this);
    await this._popout.render(true);
    // Re-render the tab to swap in the placeholder
    if (this.sheet.rendered) this.sheet.render(false);
  }

  async reattach() {
    if (this._popout) {
      const p = this._popout;
      this._popout = null;
      await p.close({ _reattach: true });
    }
    if (this.sheet.rendered) this.sheet.render(false);
  }

  /** Called by the popout when the user closes it directly (X button). */
  _onPopoutClosed() {
    this._popout = null;
    if (this.sheet.rendered) this.sheet.render(false);
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

  // ── Wiring (root is a plain DOM element) ────────────────────────

  _wireHeaderClick(root) {
    const sheet = this.sheet;
    root.querySelectorAll(".action-tbl thead .ut-action-head").forEach(el => {
      el.addEventListener("click", async (ev) => {
        const id = ev.currentTarget.dataset.actionId;
        if (!id || !sheet?._showActionInfo) return;
        await sheet._showActionInfo(id);
      });
    });
  }

  _wireCellHover(root) {
    const grid = root.querySelector(".ut-grid");
    const tip = root.querySelector("[id^='ut-tip-']") || root.querySelector(".ut-tip");
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

  _wireColumnSelect(root) {
    const rankThead = root.querySelector(".rank-tbl thead");
    if (!rankThead) return;

    rankThead.addEventListener("click", (e) => {
      const th = e.target.closest("th[data-col]");
      if (!th) return;
      const col = parseInt(th.dataset.col);
      if (this._selectedCol === col) {
        this._clearColumnSelection(root);
        this._selectedCol = -1;
      } else {
        this._clearColumnSelection(root);
        this._selectedCol = col;
        this._paintColumnSelection(root, col);
      }
    });
  }

  _clearColumnSelection(root) {
    root.querySelectorAll(".rank-tbl .col-sel").forEach(el => el.classList.remove("col-sel"));
    root.querySelectorAll(".ut-grid .col-sel-bg").forEach(el => el.classList.remove("col-sel-bg"));
    root.querySelectorAll(".action-tbl .col-sel-bg").forEach(el => el.classList.remove("col-sel-bg"));
  }

  _paintColumnSelection(root, col) {
    const rankTh = root.querySelector(`.rank-tbl th[data-col="${col}"]`);
    if (rankTh) rankTh.classList.add("col-sel");
    root.querySelectorAll(`.ut-grid td[data-col="${col}"]`).forEach(el => el.classList.add("col-sel-bg"));
    // Action table: header row + 4 result rows, cells indexed by col+1 (first is label)
    root.querySelectorAll(".action-tbl tr").forEach(tr => {
      const cell = tr.children[col + 1];
      if (cell) cell.classList.add("col-sel-bg");
    });
  }

  // ── External roll highlight ─────────────────────────────────────

  /**
   * Pulse the cell matching a d100 roll on a specific rank column.
   * Routes to whichever instance is currently visible: the popout if
   * detached, otherwise the in-tab content on the sheet.
   */
  highlightRoll(html, rankName, roll) {
    // Pick the live root: popout takes priority when detached
    let root = null;
    if (this._popout?.rendered && this._popout.element) {
      root = this._popout.element.querySelector(".ut-tab-root");
    } else if (html) {
      // html is a jQuery wrapper from actorSheet; unwrap if so
      const el = (html.jquery ? html[0] : html);
      root = el?.querySelector?.(".ut-tab-root") ?? null;
    }
    if (!root) return;

    this._highlightRollIn(root, rankName, roll);
  }

  _highlightRollIn(root, rankName, roll) {
    const col = RANKS_ORDERED.indexOf(rankName);
    if (col === -1) return;

    let row = -1;
    for (let i = 0; i < ROLL_ROW_RANGES.length; i++) {
      const [lo, hi] = ROLL_ROW_RANGES[i];
      if (roll >= lo && roll <= hi) { row = i; break; }
    }
    if (row === -1) return;

    const grid = root.querySelector(".ut-grid");
    if (!grid) return;

    grid.querySelectorAll(".roll-highlight").forEach(el => el.classList.remove("roll-highlight"));
    const cell = grid.querySelector(`td[data-col="${col}"][data-row="${row}"]`);
    if (!cell) return;
    cell.classList.add("roll-highlight");
    cell.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setTimeout(() => cell.classList.remove("roll-highlight"), 10000);
  }
}

// ── Detached popout window ────────────────────────────────────────

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class FaseripUniversalTableWindow extends ApplicationV2 {
  constructor(tab, options = {}) {
    super(options);
    this.tab = tab;  // UniversalTableTab instance
  }

  static DEFAULT_OPTIONS = {
    id: "faserip-universal-table-{id}",  // templated per actor in _initializeApplicationOptions
    classes: ["faserip-universal-table-window"],
    tag: "div",
    window: {
      frame: true,
      positioned: true,
      title: "Universal Table",
      icon: "fas fa-table",
      minimizable: true,
      resizable: true,
    },
    position: { width: 980, height: "auto" },
  };

  _initializeApplicationOptions(options) {
    const opts = super._initializeApplicationOptions(options);
    const actorId = this.tab?.sheet?.actor?.id ?? foundry.utils.randomID();
    opts.id = `faserip-universal-table-${actorId}`;
    // Restore saved position (per-actor flag)
    const saved = this.tab?.sheet?.actor?.getFlag?.("msh-faserip", "utPopoutPos");
    if (saved?.left != null && saved?.top != null) {
      opts.position = { ...opts.position, left: saved.left, top: saved.top };
    }
    if (saved?.width)  opts.position.width  = saved.width;
    if (saved?.height) opts.position.height = saved.height;
    return opts;
  }

  get title() {
    const name = this.tab?.sheet?.actor?.name;
    return name ? `Universal Table — ${name}` : "Universal Table";
  }

  async _renderHTML(context, options) { return ""; }

  _replaceHTML(result, content, options) {
    // Build a root node we can hand to the shared renderer
    if (!content.querySelector(".ut-tab-root")) {
      const root = document.createElement("div");
      root.className = "ut-tab-root ut-tab-root-popout";
      content.appendChild(root);
    }
    const root = content.querySelector(".ut-tab-root");
    this.tab.renderIntoRoot(root);
    // The detach button in the popout becomes a "Return to tab" button
    const btn = root.querySelector("[data-ut-action='detach']");
    if (btn) {
      btn.setAttribute("data-tooltip", "Return to tab");
      btn.innerHTML = '<i class="fas fa-down-left-and-up-right-to-center"></i>';
      btn.onclick = () => this.tab.reattach();
    }
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    // Escape closes
    this.element?.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") this.close();
    });
    this.element?.setAttribute("tabindex", "-1");
    this.element?.focus?.();
  }

  async close(options = {}) {
    // Save position to the actor's flag for next detach
    try {
      const actor = this.tab?.sheet?.actor;
      if (actor && this.position) {
        await actor.setFlag("msh-faserip", "utPopoutPos", {
          left: this.position.left,
          top: this.position.top,
          width: this.position.width,
          height: this.position.height,
        });
      }
    } catch (_) {}

    const result = await super.close(options);
    if (!options?._reattach) this.tab?._onPopoutClosed?.();
    return result;
  }
}
