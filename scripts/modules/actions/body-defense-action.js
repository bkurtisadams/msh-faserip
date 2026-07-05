// scripts/modules/actions/body-defense-action.js v1.0.0 - 2026-07-05
// Body-alterations (defensive) group — the passive defensive powers that have
// no dedicated dialog. Same data-driven shape as movement-action.js /
// body-control-action.js: BODY_DEFENSE_CONFIG has one entry per power and every
// entry posts an info card (none of these is a hero-side FEAT — Pheromones is
// resisted by the TARGET, and Recovery/Healing, which DO roll, are routed to
// their own dialogs earlier in power-router.js and never reach here).
//
// Covers the four leftovers (Water Breathing, Life Support, Pheromones,
// Immortality) plus the passive-AE defenses that previously fell through to the
// non-attack bail (Body Armor, Absorption, Regeneration, Solar Regeneration).
// Passive mechanical state (Body Armor / Absorption AEs, ongoing regen) is
// applied elsewhere; this only gives the click a response.
//
// Routed from power-router.js for any bodyAlterationsDefensive-category power.

import { RANK_ABBR } from "../../rules/rules-reference.js";

const BODY_DEFENSE_CONFIG = {
  "water breathing": { text: (r) => `Breathe water as easily as air and see underwater normally; survive the pressure of the depths. Companion Power: Swimming or aquatic Animal Communication (taking both limits breathing to water only).` },
  "life support": { text: (r) => `Survive hostile environments — vacuum, underwater, lava — for ${r}# turns before Endurance FEATs are needed. At Shift-Z or higher, survive indefinitely with no food, water, or air.` },
  "pheromones": { text: (r) => `Emit pheromones affecting the opposite sex within range: each makes a Psyche FEAT vs ${r} or turns Friendly. No effect on robots, aliens, or the shielded. An already-hostile target is still attracted but won't call off a deathtrap.` },
  "immortality": { text: (r) => `No aging or normal death (counts as 2 Powers; 1 for aliens). Still takes damage normally. At Shift-0 Endurance, cannot act until the body regenerates to Feeble, and ALL Karma is lost on each "death." The body slowly regenerates — Earth dimension only.` },

  "body armor": { text: (r) => `Reduces physical damage by ${r}# and energy damage by ${r}#−20. If an attack deals less than the Body Armor, no Slam/Stun/Kill result applies. Natural (organic) or Artificial (a worn suit). +1 rank if you accept −1CS Agility.` },
  "absorption": { text: (r) => `Absorb one specific damage type: heal and temporarily raise Health by ${r}#. Damage above ${r} is taken but may be redirected the next round. The extra Health dissipates over 10 rounds.` },
  "regeneration": { text: (r) => `Recover Endurance rank# Health every 10 turns (about 1 minute) while resting. No actions may be taken during the rest; an interruption restarts the count.` },
  "solar regeneration": { text: (r) => `Heal ${r}# Health per 10 minutes in sunshine (normal healing otherwise). Minimum rank = Endurance +1CS.` }
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
          <span style="font-size:0.85em;font-weight:400;">Body defense (${short})</span>
        </div>
        <div style="padding:6px 10px;font-size:0.9em;">${cfg.text(rank)}</div>
      </div>`
  });
}

export async function showBodyDefenseFeat(actor, item) {
  if (!actor || !item) {
    ui.notifications.warn("Defensive power requires an actor.");
    return;
  }
  const cfg = BODY_DEFENSE_CONFIG[(item.name || "").toLowerCase()];

  // Unknown defensive power: post an info card from its own description.
  if (!cfg) {
    return postPassiveCard(actor, item, { text: () => item.system?.description || "Defensive power." });
  }
  return postPassiveCard(actor, item, cfg);
}
