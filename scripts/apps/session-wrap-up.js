// scripts/apps/session-wrap-up.js v1.0.0 - 2026-10-03
// v1.0.0: Close Session wrap-up (Team Tracker, Team tab). One dialog for the
//         end-of-session personal awards, all individual (Karma chapter):
//         gaming awards (role-play 0-10, Stump the Judge 0-15, humor 5),
//         commitments (kept +5, missed -10, left early -5, GM ruling amount
//         asked at Apply) and the weekly award (0-10) once a game week has
//         passed since the last one (world time). With Calendar & Time
//         Tracker: commitments that came due are listed with their calendar
//         status, decided ones are written back to the calendar, and each
//         hero's obligations sit beside the weekly box. Without it: kept /
//         missed / left early counters per hero. Category multipliers apply;
//         a loss never takes a hero below 0. Battle karma stays in the
//         pending tray; the R+I+P bonus stays on its own button.

import { TeamSheet } from "../teamSheet.js";
import { computeKarmaAward } from "../karma-multipliers.js";
import {
  planWrapUp, heroTotals, dueCommitments, weeklyStatus, formatWeekdays,
  outcomeFromCtt, cttFromOutcome, clampAward
} from "../lib/faserip-rules/faserip-wrapup.js";

const S = "msh-faserip";
const CTT = "calendar-time-tracker";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const OPTION_STYLE = {
  kept:   { cls: "wu-opt-kept",   label: "Kept +5" },
  left:   { cls: "wu-opt-left",   label: "Left early −5" },
  missed: { cls: "wu-opt-missed", label: "Missed −10" },
  ruling: { cls: "wu-opt-ruling", label: "Ruling" }
};

function cttApi() {
  const mod = game.modules.get(CTT);
  const api = mod?.active ? mod.api : null;
  return typeof api?.getCommitments === "function" ? api : null;
}

function fmtTime(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(str || ""));
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]}${h < 12 ? "am" : "pm"}`;
}

function timeRange(e) {
  const a = fmtTime(e.time), b = fmtTime(e.endTime);
  return a && b ? `${a} to ${b}` : a;
}

function signed(n) {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
}

export class SessionWrapUp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.wu = null;
  }

  static DEFAULT_OPTIONS = {
    id: "msh-session-wrap-up",
    classes: ["msh-wrapup"],
    tag: "div",
    window: { title: "Close Session", resizable: true },
    position: { width: 760, height: "auto" }
  };

  static PARTS = {
    body: { template: "systems/msh-faserip/templates/session-wrap-up.html" }
  };

  _initState() {
    const ids = game.settings.get(S, "teamMembers") || [];
    const heroes = ids.map(id => game.actors.get(id)).filter(Boolean).map(a => ({ id: a.id, name: a.name }));
    const api = cttApi();
    const heroIds = new Set(heroes.map(h => h.id));
    const calCfg = game.modules.get(CTT)?.timeTracker?.calendarSystem?.configuration || null;
    const calSys = game.modules.get(CTT)?.timeTracker?.calendarSystem || null;

    let commitments = [];
    const obligations = {};
    if (api) {
      const events = game.settings.get(CTT, "calendarEvents") || [];
      const awarded = game.settings.get(S, "wrapUpAwardedCommitments") || [];
      commitments = dueCommitments(events, awarded)
        .filter(e => heroIds.has(e.actorId))
        .map(e => {
          let when = `${Number(e.month) + 1}/${e.day}`;
          if (calCfg && calSys) {
            const total = calSys.calculateTotalDays(Number(e.year), Number(e.month), Number(e.day));
            const n = calCfg.daysPerWeek;
            const dow = (((calCfg.startDayOfWeek || 0) + total) % n + n) % n;
            const wd = String(calCfg.weekDays?.[dow] || "").slice(0, 3);
            if (wd) when = `${wd} ${when}`;
          }
          const t = timeRange(e);
          return {
            id: e.id, actorId: e.actorId,
            title: e.withWhom && !String(e.title).includes(e.withWhom) ? `${e.title}, ${e.withWhom}` : e.title,
            when: t ? `${when}, ${t}` : when,
            outcome: outcomeFromCtt(e.status),
            initialStatus: e.status || "open"
          };
        });
      const weekNames = calCfg?.weekDays || [];
      for (const o of api.getCommitments({ category: "obligation" })) {
        if (!heroIds.has(o.actorId)) continue;
        const parts = [o.withWhom || o.title, [formatWeekdays(o.weekdays, weekNames), timeRange(o)].filter(Boolean).join(" ")].filter(Boolean);
        (obligations[o.actorId] ||= []).push(parts.join(", "));
      }
    }

    const last = game.settings.get(S, "wrapUpLastWeekly") || null;
    const status = weeklyStatus(last, game.time.worldTime);
    const now = TeamSheet._getGameDateTimeStatic();
    let weekLabel;
    if (status.passed) weekLabel = `A game week passed: ${last.gameDate} to ${now.gameDate}`;
    else if (status.known) weekLabel = `Weekly award (last given ${last.gameDate}, ${status.days} day${status.days === 1 ? "" : "s"} ago)`;
    else weekLabel = "Weekly award (none recorded yet)";

    this.wu = {
      heroes,
      hasCtt: !!api,
      gaming: Object.fromEntries(heroes.map(h => [h.id, { rp: 0, stump: 0, humor: false }])),
      commitments,
      tally: Object.fromEntries(heroes.map(h => [h.id, { kept: 0, missed: 0, left: 0 }])),
      obligations,
      weeklyOn: status.passed,
      weekly: Object.fromEntries(heroes.map(h => [h.id, 0])),
      weekLabel,
      weekRange: status.passed ? `${last.gameDate} to ${now.gameDate}` : now.gameDate,
      now
    };
  }

  _planInput() {
    const w = this.wu;
    const commitments = w.hasCtt
      ? w.commitments.map(c => ({ id: c.id, actorId: c.actorId, title: c.title, outcome: c.outcome, ruling: c.ruling }))
      : w.heroes.flatMap(h => {
          const t = w.tally[h.id];
          const rows = [];
          for (const [key, title] of [["kept", "Commitment kept"], ["missed", "Commitment missed"], ["left", "Left a commitment early"]]) {
            for (let i = 0; i < (Number(t[key]) || 0); i++) rows.push({ id: `${h.id}-${key}-${i}`, actorId: h.id, title, outcome: key });
          }
          return rows;
        });
    return {
      heroes: w.heroes, gaming: w.gaming, commitments,
      weeklyOn: w.weeklyOn, weekly: w.weekly, weekLabel: w.weekRange
    };
  }

  _totals() {
    const plan = planWrapUp(this._planInput());
    const totals = heroTotals(this.wu.heroes, plan);
    return { plan, totals };
  }

  async _prepareContext() {
    if (!this.wu) this._initState();
    const w = this.wu;
    const { plan, totals } = this._totals();
    const nameOf = Object.fromEntries(w.heroes.map(h => [h.id, h.name]));
    const teamName = game.settings.get(S, "teamName") || "The Team";
    return {
      teamName: String(teamName).toUpperCase(),
      sessionEnds: [w.now.gameDate, w.now.gameTime].filter(Boolean).join(" "),
      hasHeroes: w.heroes.length > 0,
      heroCount: w.heroes.length,
      hasCtt: w.hasCtt,
      heroes: w.heroes.map(h => ({ ...h, ...w.gaming[h.id], tally: w.tally[h.id] })),
      commitments: w.commitments.map(c => ({
        ...c,
        hero: nameOf[c.actorId] || "",
        isOpen: !c.outcome,
        options: Object.entries(OPTION_STYLE).map(([key, o]) => ({ key, label: o.label, cls: o.cls, selected: c.outcome === key }))
      })),
      hasCommitments: w.commitments.length > 0,
      weeklyOn: w.weeklyOn,
      weekLabel: w.weekLabel,
      weekly: w.heroes.map(h => ({
        id: h.id, name: h.name, value: w.weekly[h.id],
        obligations: (w.obligations[h.id] || []).join("; "),
        hasObligations: !!w.obligations[h.id]?.length
      })),
      totals: w.heroes.map(h => ({ id: h.id, name: h.name, display: signed(totals[h.id]), sign: totals[h.id] > 0 ? "pos" : totals[h.id] < 0 ? "neg" : "zero" })),
      entryCount: plan.length
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    const w = this.wu;
    root.querySelectorAll("[data-gaming]").forEach(el => {
      const evt = el.type === "checkbox" ? "change" : "input";
      el.addEventListener(evt, () => {
        const g = w.gaming[el.dataset.hero];
        const key = el.dataset.gaming;
        if (key === "humor") g.humor = el.checked;
        else g[key] = clampAward(el.value, key === "rp" ? 10 : 15);
        this._refreshTotals();
      });
    });
    root.querySelectorAll("[data-tally]").forEach(el => el.addEventListener("input", () => {
      w.tally[el.dataset.hero][el.dataset.tally] = Math.max(0, Math.floor(Number(el.value) || 0));
      this._refreshTotals();
    }));
    root.querySelectorAll("[data-weekly]").forEach(el => el.addEventListener("input", () => {
      w.weekly[el.dataset.hero] = clampAward(el.value, 10);
      this._refreshTotals();
    }));
    root.querySelectorAll("[data-outcome]").forEach(el => el.addEventListener("click", () => {
      const c = w.commitments.find(x => x.id === el.dataset.commitment);
      if (c) c.outcome = c.outcome === el.dataset.outcome ? "" : el.dataset.outcome;
      this.render();
    }));
    root.querySelector("[name=weeklyOn]")?.addEventListener("change", ev => {
      w.weeklyOn = ev.currentTarget.checked;
      this.render();
    });
    root.querySelector("[data-wu=cancel]")?.addEventListener("click", () => this.close());
    root.querySelector("[data-wu=apply]")?.addEventListener("click", () => this._apply());
    const max = window.innerHeight - 40;
    if ((root.offsetHeight || 0) > max) this.setPosition({ height: max, top: 20 });
  }

  _refreshTotals() {
    const { plan, totals } = this._totals();
    for (const h of this.wu.heroes) {
      const el = this.element.querySelector(`[data-total="${h.id}"]`);
      if (!el) continue;
      const n = totals[h.id];
      el.textContent = signed(n);
      el.classList.toggle("pos", n > 0);
      el.classList.toggle("neg", n < 0);
      el.classList.toggle("zero", n === 0);
    }
    const count = this.element.querySelector(".wu-entry-count");
    if (count) count.textContent = String(plan.length);
  }

  async _askRulings(rulings) {
    const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
    const nameOf = Object.fromEntries(this.wu.heroes.map(h => [h.id, h.name]));
    const rows = rulings.map(c => `
      <div class="form-group">
        <label>${esc(nameOf[c.actorId])}: ${esc(c.title)}</label>
        <input type="number" name="r-${esc(c.id)}" value="0" step="1">
      </div>`).join("");
    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Commitment rulings" },
      content: `<p>Karma for each ruling. Negative for a loss, 0 for nothing.</p>${rows}`,
      ok: {
        label: "Use these amounts",
        callback: (event, button) => Object.fromEntries(rulings.map(c => [c.id, Number(button.form.elements[`r-${c.id}`]?.value) || 0]))
      },
      rejectClose: false
    });
    return result || null;
  }

  async _apply() {
    if (!game.user.isGM) return;
    const w = this.wu;
    const rulings = w.hasCtt ? w.commitments.filter(c => c.outcome === "ruling") : [];
    if (rulings.length) {
      const amounts = await this._askRulings(rulings);
      if (!amounts) return;
      for (const c of rulings) c.ruling = amounts[c.id];
    }
    const plan = planWrapUp(this._planInput());
    const decided = w.hasCtt ? w.commitments.filter(c => c.outcome) : [];
    if (!plan.length && !decided.length && !w.weeklyOn) {
      ui.notifications.warn("Nothing to award yet.");
      return;
    }

    const worker = TeamSheet.worker();
    const { gameDate } = w.now;
    for (const e of plan) {
      const hero = game.actors.get(e.heroId);
      if (!hero) continue;
      const amount = computeKarmaAward({ eventType: e.type, baseAmount: e.amount }).perHero;
      if (!amount) continue;
      await worker._addHeroKarmaEvent(hero, { amount, type: e.type, description: e.description, gameDate });
    }

    if (decided.length) {
      const api = cttApi();
      for (const c of decided) {
        const status = cttFromOutcome(c.outcome);
        if (api && status !== c.initialStatus) {
          try { await api.setCommitmentStatus(c.id, status); }
          catch (err) { console.warn("[FASERIP] wrap-up: calendar status not updated", err); }
        }
      }
      const awarded = new Set(game.settings.get(S, "wrapUpAwardedCommitments") || []);
      decided.forEach(c => awarded.add(c.id));
      await game.settings.set(S, "wrapUpAwardedCommitments", [...awarded]);
    }

    if (w.weeklyOn) {
      await game.settings.set(S, "wrapUpLastWeekly", { worldTime: game.time.worldTime, gameDate });
    }

    const open = w.hasCtt ? w.commitments.filter(c => !c.outcome).length : 0;
    const msg = `Session wrap-up: ${plan.length} entr${plan.length === 1 ? "y" : "ies"} written.`
      + (open ? ` ${open} commitment${open === 1 ? "" : "s"} still open, left for the next wrap-up.` : "");
    ui.notifications.info(msg);
    Object.values(ui.windows).forEach(app => { if (app instanceof TeamSheet && app.rendered) app.render(false); });
    this.close();
  }
}

export function openSessionWrapUp() {
  if (!game.user.isGM) return;
  new SessionWrapUp().render(true);
}

