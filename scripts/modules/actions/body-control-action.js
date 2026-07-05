// scripts/modules/actions/body-control-action.js v1.0.0 - 2026-07-05
// Body-control group (powers audit Step #8, slice 8b). Same data-driven shape
// as movement-action.js / sense-action.js: BODY_CONTROL_CONFIG has one entry
// per power. Three powers make a Power FEAT (Shape-Shifting, Imitation,
// Animal Transformation Self) and resolve through the shared engine; the rest
// are continuous self-transformation states that post an info card. Passive
// mechanical state (defense shift, body armor, intangibility, invisible badge)
// is still applied separately by body-control-effects.js on the isActive bolt;
// this file only gives the power a click workflow instead of the non-attack bail.
//
// Routed from power-router.js for any bodyControl-category / isTransformPower power.

import { showGenericFeatDialog } from "./generic-feat-dialog.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";

const effLine = (html) => `<div style="padding:5px 10px;font-size:0.95em;text-align:center;">${html}</div>`;

const rankVal = (r) => Number(game.msh?.getRankValue?.(r)) || Number(CONFIG.FASERIP?.rankValues?.[r]) || 0;

// Pick the highest or lowest of the target's Reason / Intuition / Psyche and
// return its rank string (used as the FEAT intensity for the disguise powers).
function pickMental(target, which) {
  const ab = target?.system?.abilities || {};
  const trio = ["reason", "intuition", "psyche"].map((k) => {
    const rank = ab[k]?.rank || "Typical";
    const val = Number(ab[k]?.value);
    return { rank, val: Number.isFinite(val) && val ? val : rankVal(rank) };
  });
  trio.sort((a, b) => a.val - b.val);
  return which === "highest" ? trio[trio.length - 1].rank : trio[0].rank;
}

// kind "feat": roll the power rank as a Power FEAT.
//   needsTarget + targetPick "highest"/"lowest" -> intensity = that mental rank.
//     noTarget -> info line shown (auto/generic form) when no single target.
//   outcomes { white, green, yellow, red } -> color-graded result line.
//   onSuccess/onFail -> simple pass/fail line (functions get the target name).
//   note -> extra line under the FEAT card.
// kind "passive": post an info card (text), no FEAT.
const BODY_CONTROL_CONFIG = {
  "growth": { kind: "passive", text: (r) => `Grow taller — use ${r} in place of Strength for Feats and damage. Larger target: +1CS to be hit at Feeble–Good, +2CS at Remarkable–Amazing, +3CS at Monstrous+. Permanent option: +1 rank but a fixed size.` },
  "shrinking": { kind: "passive", text: (r) => `Shrink while keeping full Strength. Harder to hit and a better attacker vs larger foes: 1CS at Good–Excellent, 2CS at Remarkable–Incredible, 3CS at Monstrous–Unearthly. Shift-X+ crosses the Pym barrier into the Microverse.` },
  "density manipulation self": { kind: "passive", text: (r) => `Alter mass from Shift-0 to ${r}. Body Armor = the current density rank; may Charge at ${r}. At Shift-0: immune to physical attacks (not energy or force). Density above your Endurance: −1CS Fighting and Agility.` },
  "phasing": { kind: "passive", text: (r) => `Out of phase with matter — immune to physical and most energy. Pass through any material below ${r}. A Force Field below ${r}: green FEAT to pass. Disrupts electronics. Duration limited by held breath.` },
  "invisibility": { kind: "passive", text: (r) => `Invisible to normal sight (you still have mass) at ${r}. Stunts: turn others invisible on touch or at range, reveal the invisible, partial invisibility, extend to heat/UV.` },
  "plasticity": { kind: "passive", text: (r) => `Elastic, malleable body — Body Armor = ${r}. Bonus: Elongation. Stunts: catch a falling object (${r} as Agility), disguise (−2CS), bounce (leaping at −1CS).` },
  "elongation": { kind: "passive", text: (r) => `Extend body or limbs up to ${r}# yards to attack non-adjacent foes. The target can strike only the extended part — no Kill, Stun, or Slam result applies to it.` },
  "body transformation": { kind: "passive", text: (r) => `Transform into a chosen material. Body Armor = the material's Strength or ${r}, whichever is lower, plus the material's special functions. +1CS if limited to one state, +2CS if limited to one specific substance.` },
  "raise lowest ability": { kind: "passive", text: () => `Not a true Power — raises the character's lowest ability by 20 points (its rank shifts up accordingly). The freed Power slot is then chosen from the full list.` },
  "blending": { kind: "passive", text: (r) => `Camouflage — hidden at ${r} until you move or act. With a limitation (only at night, only in forest, etc.), the concealment bonus is +2CS instead of the standard +1CS.` },
  "power absorption": { kind: "passive", text: (r) => `Acquire another's Powers on touch, up to ${r}. The target resists with a Psyche or Endurance FEAT vs ${r}; only inborn Powers can be taken, and the target loses each Power you absorb. One Power at a time (more via stunts).` },
  "alter ego": { kind: "passive", text: () => `Switch instantly to a separate normal persona with Normal-Folk abilities and no Powers. Contacts, Popularity, and Karma are tracked separately for each identity.` },

  "animal transformation self": {
    kind: "feat",
    hint: "Fixed by the power — a colored result completes the change; white fails.",
    note: "Automatic if limited to a single animal form. You gain the animal's Powers and its normal size/weight; your other Powers are lost while transformed.",
    onSuccess: "Transforms into the animal form.",
    onFail: "The transformation fails this round."
  },
  "shape-shifting": {
    kind: "feat",
    needsTarget: true,
    targetPick: "highest",
    noTarget: (r) => `Reshaping into an object or a generic being (half to 1.5× your size) is automatic. To convincingly resemble a specific being, target them and roll the likeness FEAT.`,
    hint: (t, short) => `Convincing likeness resisted by ${t}'s highest mental ability (${short}).`,
    note: "Only visible physical powers are copied, never actual Powers.",
    onSuccess: (t) => `Convincingly takes ${t}'s form.`,
    onFail: (t) => `The likeness is imperfect — noticeably off.`
  },
  "imitation": {
    kind: "feat",
    needsTarget: true,
    targetPick: "lowest",
    noTarget: () => `Imitation duplicates a specific humanoid. Target the person you want to copy, then roll.`,
    hint: (t, short) => `Duplicating ${t} resisted by their lowest mental ability (${short}).`,
    onSuccess: (t) => `Duplicates ${t}'s appearance, voice, and mannerisms (may use their Popularity).`,
    onFail: (t) => `The imitation has detectable flaws.`
  }
};

// Pack type names are canonical, but owned items sometimes carry a variant
// spelling (parenthesized "(Self)", or a bare "Density Manipulation"). Map the
// known variants onto the config key so they get the real card, not the fallback.
const NAME_ALIASES = {
  "density manipulation (self)": "density manipulation self",
  "density manipulation": "density manipulation self",
  "animal transformation (self)": "animal transformation self",
  "animal transformation": "animal transformation self",
  "body transformation (self)": "body transformation",
  "body transformation self": "body transformation",
  "shape shifting": "shape-shifting"
};
const cfgKey = (name) => {
  const k = String(name || "").toLowerCase();
  return NAME_ALIASES[k] || k;
};

function postPassiveCard(actor, item, cfg) {
  const rank = item.system?.rank || "Typical";
  const short = RANK_ABBR[rank] || rank;
  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div style="background-color:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.05em;color:#8b0000;">
          <strong>${item.name}</strong><br>
          <span style="font-size:0.85em;font-weight:400;">Body control (${short})</span>
        </div>
        <div style="padding:6px 10px;font-size:0.9em;">${cfg.text(rank)}</div>
      </div>`
  });
}

export async function showBodyControlFeat(actor, item) {
  if (!actor || !item) {
    ui.notifications.warn("Body-control power requires an actor.");
    return;
  }
  const cfg = BODY_CONTROL_CONFIG[cfgKey(item.name)];

  // Unknown body-control power: treat as a passive info card from its own text.
  if (!cfg) {
    return postPassiveCard(actor, item, { text: () => item.system?.description || "Body-control power." });
  }
  if (cfg.kind === "passive") return postPassiveCard(actor, item, cfg);

  // FEAT powers -----------------------------------------------------------
  let intensity = "None";
  let target = null;
  let hint = typeof cfg.hint === "string" ? cfg.hint : "";

  if (cfg.needsTarget) {
    const targets = Array.from(game.user.targets || []);
    // No specific being to imitate: the change is automatic — post an info card.
    if (targets.length !== 1) {
      const rank = item.system?.rank || "Typical";
      return postPassiveCard(actor, item, { text: () => cfg.noTarget(rank) });
    }
    target = targets[0].actor;
    if (!target) return;
    intensity = pickMental(target, cfg.targetPick);
    const short = RANK_ABBR[intensity] || intensity;
    hint = typeof cfg.hint === "function" ? cfg.hint(target.name, short) : hint;
  }

  const noteHtml = cfg.note ? `<div style="padding:0 10px 4px;font-size:0.82em;color:#666;text-align:center;">${cfg.note}</div>` : "";

  return showGenericFeatDialog(actor, {
    power: item,
    label: item.name,
    intensity,
    lockIntensity: true,
    intensityHint: hint,
    onResult: ({ color, success }) => {
      const c = String(color).toLowerCase();
      let line;
      if (cfg.outcomes) line = cfg.outcomes[c] ?? cfg.outcomes.white;
      else {
        const s = success ? cfg.onSuccess : cfg.onFail;
        line = typeof s === "function" ? s(target?.name ?? "the target") : s;
      }
      return noteHtml + effLine(line);
    }
  });
}
