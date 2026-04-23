// scripts/modules/regions/area-hazard-behavior.js v1.0.0 - 2026-04-22
// v14 Region Behavior: persistent intensity hazard (smoke, gas, flash, KO).
//
// Attaches to a Region created by a lingering grenade (or manual GM placement).
// On token entry, rolls an Endurance/save FEAT against the hazard's intensity;
// on fail, applies the configured status effect (blinded, incapacitated, etc.)
// tagged with the Region's ID so we can find-and-remove on exit.
//
// ── Usage ────────────────────────────────────────────────────────
// Attach via code (see grenade-action.js _executeIntensityGrenade):
//   await region.createEmbeddedDocuments("RegionBehavior", [{
//     name: "Smoke",
//     type: "msh-faserip.areaHazard",
//     system: {
//       intensityRank: "Excellent",
//       intensityEffect: "blinded",
//       saveAbility: "endurance",
//       saveOnEntry: true,
//       removeOnExit: true,
//       residualRounds: 0,
//       label: "Smoke Grenade"
//     }
//   }]);
//
// Attach manually by GM: open Region config → Behaviors tab → Add → select
// "Area Hazard (FASERIP)" → fill in the fields → Save.
//
// ── GM-only execution ────────────────────────────────────────────
// Region event handlers run on every connected client. All state mutations
// (roll, AE apply, chat card) are guarded behind game.user.isActiveGM so only
// one client actually writes. Other clients see the result via document sync.

import { rollUniversalTable } from "../dice/universal-table.js";

const { StringField, BooleanField, NumberField } = foundry.data.fields;

const EFFECT_LABELS = {
  blinded: "Blinded",
  deafened: "Deafened",
  stunned: "Stunned",
  unconscious: "Unconscious",
  incapacitated: "Incapacitated",
  immobilized: "Immobilized",
  paralyzed: "Paralyzed",
  weakened: "Weakened",
  "": "Affected (GM adjudicate)"
};

// Flag key used to tag AEs created by a given hazard region so we can remove them later
const FROM_HAZARD_FLAG = "fromHazardRegion";

export class AreaHazardBehavior extends foundry.data.regionBehaviors.RegionBehaviorType {

  static LOCALIZATION_PREFIXES = ["MSH_FASERIP.RegionBehavior.AreaHazard"];

  static defineSchema() {
    return {
      intensityRank: new StringField({
        required: true, initial: "Typical", blank: false,
        choices: {
          "Feeble": "Feeble", "Poor": "Poor", "Typical": "Typical",
          "Good": "Good", "Excellent": "Excellent", "Remarkable": "Remarkable",
          "Incredible": "Incredible", "Amazing": "Amazing",
          "Monstrous": "Monstrous", "Unearthly": "Unearthly"
        },
        label: "Intensity Rank"
      }),
      intensityEffect: new StringField({
        required: false, initial: "blinded", blank: true,
        choices: {
          "": "None (GM adjudicate)",
          "blinded": "Blinded",
          "deafened": "Deafened",
          "stunned": "Stunned",
          "unconscious": "Unconscious",
          "incapacitated": "Incapacitated",
          "immobilized": "Immobilized",
          "paralyzed": "Paralyzed",
          "weakened": "Weakened"
        },
        label: "Effect on Failure"
      }),
      saveAbility: new StringField({
        required: true, initial: "endurance", blank: false,
        choices: {
          "fighting": "Fighting", "agility": "Agility", "strength": "Strength",
          "endurance": "Endurance", "reason": "Reason", "intuition": "Intuition",
          "psyche": "Psyche"
        },
        label: "Save Ability"
      }),
      saveOnEntry: new BooleanField({ initial: true, label: "Save on Entry" }),
      removeOnExit: new BooleanField({ initial: true, label: "Remove Effect on Exit" }),
      residualRounds: new NumberField({
        initial: 0, min: 0, integer: true,
        label: "Residual Rounds After Exit"
      }),
      label: new StringField({ initial: "Area Hazard", label: "Display Label" })
    };
  }

  // ── Event router ────────────────────────────────────────────────
  async _handleRegionEvent(event) {
    if (!game.user?.isActiveGM) return;
    switch (event.name) {
      case CONST.REGION_EVENTS.TOKEN_ENTER: return this._onTokenEnter(event);
      case CONST.REGION_EVENTS.TOKEN_EXIT:  return this._onTokenExit(event);
    }
  }

  async _onTokenEnter(event) {
    if (!this.saveOnEntry) return;
    const tokenDoc = event.data?.token;
    if (!tokenDoc?.actor) return;
    await this.resolveForToken(tokenDoc);
  }

  async _onTokenExit(event) {
    const tokenDoc = event.data?.token;
    if (!tokenDoc?.actor) return;
    await this._clearHazardEffect(tokenDoc.actor);
  }

  // ── Public: run save + apply for a single token ─────────────────
  // Called both by the entry event AND by grenade-action.js for tokens
  // that were already inside the Region at creation time (tokenEnter
  // doesn't fire retroactively for those).
  async resolveForToken(tokenDoc) {
    if (!game.user?.isActiveGM) return;
    const actor = tokenDoc?.actor;
    if (!actor) return;
    const regionId = this.region?.id;
    if (!regionId) return;

    // Already hazarded by this Region? Skip (no double saves on re-entry).
    const existing = actor.effects.find(e =>
      e.getFlag("msh-faserip", FROM_HAZARD_FLAG) === regionId
    );
    if (existing) return;

    // Roll save: 1d100 on the universal table against the save ability's rank
    const abilityRank = actor.system?.abilities?.[this.saveAbility]?.rank || "Typical";
    const roll = await (new Roll("1d100")).evaluate();
    const color = rollUniversalTable(abilityRank, Math.min(100, roll.total));
    const colorLower = String(color || "white").toLowerCase();
    const failed = colorLower === "white";

    // Chat card — one line per save so players see what happened
    const abilLabel = this.saveAbility.charAt(0).toUpperCase() + this.saveAbility.slice(1);
    const outcomeLabel = failed
      ? `<span style="color:#c62828;font-weight:bold;">FAIL — ${EFFECT_LABELS[this.intensityEffect] || "Affected"}</span>`
      : `<span style="color:#2e7d32;font-weight:bold;">RESIST</span>`;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ token: tokenDoc }),
      content: `<div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;padding:6px 10px;font-size:.9em;">
        <div style="color:#8b0000;font-weight:bold;font-size:.85em;text-transform:uppercase;">Area Hazard — ${this.label}</div>
        <div><strong>${tokenDoc.name}</strong> enters — ${abilLabel} FEAT vs ${this.intensityRank} Intensity</div>
        <div>Roll: ${roll.total} → ${outcomeLabel}</div>
      </div>`
    });

    if (!failed) return;
    if (!this.intensityEffect) return;

    // Apply effect, tag with region id for later cleanup
    await this._applyHazardEffect(actor, regionId);
  }

  // ── Effect apply ────────────────────────────────────────────────
  async _applyHazardEffect(actor, regionId) {
    const {
      applyBlinded, applyDeafened, applyStun, applyUnconscious,
      applyParalyzed, applyWeakened, applyEffect
    } = await import("../effects/effect-engine.js");

    // Snapshot existing effect IDs so we can find the newly-created one after apply
    const before = new Set(actor.effects.map(e => e.id));

    // Large rounds value — effect persists until we manually remove on exit.
    // If removeOnExit is false, the AE's own duration takes over (effect-engine
    // wrappers default to 1 round, which is wrong for hazards — override below).
    const rounds = this.removeOnExit ? 999 : 10;  // 10 rounds for bounded hazards (flash)
    const originUuid = actor.uuid;  // self-attributed; no single thrower in GM-placed regions

    try {
      switch (this.intensityEffect) {
        case "blinded":       await applyBlinded(actor, { rounds, originUuid }); break;
        case "deafened":      await applyDeafened(actor, { rounds, originUuid }); break;
        case "stunned":       await applyStun(actor, { rounds, originUuid }); break;
        case "unconscious":   await applyUnconscious(actor, { rounds, originUuid }); break;
        case "paralyzed":     await applyParalyzed(actor, { rounds, originUuid }); break;
        case "weakened":      await applyWeakened(actor, { rounds, originUuid }); break;
        case "incapacitated":
          await applyEffect(actor, {
            name: "Incapacitated", img: "icons/svg/paralysis.svg",
            rounds, originUuid,
            changes: [
              { key: "system.combatMods.attackShift",        mode: "add",      value: "-4", priority: 20 },
              { key: "system.combatMods.defenseShift",       mode: "add",      value: "-2", priority: 20 },
              { key: "system.combatMods.defenseShiftRanged", mode: "add",      value: "-2", priority: 20 },
              { key: "system.combatMods.movementMult",       mode: "multiply", value: "0.5", priority: 20 }
            ],
            flags: { effectType: "incapacitated", status: { isIncapacitated: true }, intensitySource: this.label },
            statuses: ["incapacitated"]
          });
          break;
        case "immobilized":
          await applyEffect(actor, {
            name: "Immobilized", img: "icons/svg/frozen.svg",
            rounds, originUuid,
            changes: [
              { key: "system.combatMods.movementMult",       mode: "override", value: "0",     priority: 50 },
              { key: "system.combatMods.canMove",            mode: "override", value: "false", priority: 50 },
              { key: "system.combatMods.defenseShift",       mode: "add",      value: "-2",    priority: 20 },
              { key: "system.combatMods.defenseShiftRanged", mode: "add",      value: "-2",    priority: 20 }
            ],
            flags: { effectType: "immobilized", status: { isImmobilized: true }, intensitySource: this.label },
            statuses: ["immobilized"]
          });
          break;
        default:
          return;  // unknown effect type
      }
    } catch (err) {
      console.error("[FASERIP ERROR] AreaHazard apply failed:", err);
      return;
    }

    // Find the newly-added AE and tag it with the region id
    const created = actor.effects.find(e => !before.has(e.id));
    if (created) {
      await created.setFlag("msh-faserip", FROM_HAZARD_FLAG, regionId);
    }
  }

  // ── Effect removal on exit ──────────────────────────────────────
  async _clearHazardEffect(actor) {
    const regionId = this.region?.id;
    if (!regionId) return;
    const ae = actor.effects.find(e =>
      e.getFlag("msh-faserip", FROM_HAZARD_FLAG) === regionId
    );
    if (!ae) return;

    if (!this.removeOnExit) return;  // let it tick down naturally

    if (this.residualRounds > 0) {
      // Tear gas pattern — effect persists briefly after exit
      const seconds = this.residualRounds * 6;  // rough FASERIP turn = 6s
      try {
        await ae.update({
          "duration.rounds": this.residualRounds,
          "duration.seconds": seconds,
          "duration.startRound": game.combat?.round ?? 0,
          "duration.startTurn": 0
        });
        // Untag so if token re-enters they can get saved again later
        await ae.unsetFlag("msh-faserip", FROM_HAZARD_FLAG);
      } catch (err) {
        console.warn("[FASERIP WARN] AreaHazard residual update failed:", err);
      }
    } else {
      try {
        await ae.delete();
      } catch (err) {
        console.warn("[FASERIP WARN] AreaHazard effect delete failed:", err);
      }
    }
  }
}
