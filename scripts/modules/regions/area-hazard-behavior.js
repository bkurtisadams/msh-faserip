// scripts/modules/regions/area-hazard-behavior.js v1.4.1 - 2026-08-02
// v1.4.1: incapacitated/immobilized hazard effects nest flags under the
//   msh-faserip scope (top-level primitive flags are mangled to {} by
//   v14's DocumentFlagsField and invisible to the scoped readers).
// scripts/modules/regions/area-hazard-behavior.js v1.4.0 - 2026-08-02
// v1.4.0: Cross-source dedupe — a token already suffering the hazard's
//   effect (from another region or a canister) skips the save entirely.
//   The per-region-id guard alone let a second grenade re-gas everyone,
//   creating duplicate status-providing AEs (core warned "already has
//   'Tear Gas (12s)' providing that status" but the -CS changes stacked).
// scripts/modules/regions/area-hazard-behavior.js v1.3.0 - 2026-08-02
// v1.3.0: Entry saves honor FEAT difficulty vs Intensity (was white-only
//   fail): green/yellow/red requirement by rank gap via
//   determineFeatRequirement, automatic at 3+ above, impossible at 2+ below.
//   Karma offered via resolveResistFeat (owner-client prompt, 10s
//   auto-decline) — applies to both the initial blast and later walk-ins.
// scripts/modules/regions/area-hazard-behavior.js v1.2.0 - 2026-07-23
// v1.2.0: Fix double save on grenade detonation. v14 fires TOKEN_ENTER for
//   tokens already inside when the behavior is created, racing the manual
//   initial-blast loop in grenade-action.js. Added synchronous per-token
//   in-flight guard (_resolvedTokenIds), cleared on TOKEN_EXIT.
// v1.1.0: Declare `static events` map so Foundry's Region event dispatcher
//   actually routes TOKEN_ENTER / TOKEN_EXIT to this behavior. v14 gates
//   dispatch on `eventName in behavior.system.constructor.events` BEFORE
//   calling _handleRegionEvent — without an entry in the static map,
//   overriding _handleRegionEvent has no effect because it's never called.
//   Converted instance handlers _onTokenEnter/_onTokenExit to static methods
//   _onRegionEnter/_onRegionExit invoked via handler.call(instance, event)
//   by the base class dispatcher. Instance context (this.saveOnEntry,
//   this.resolveForToken, etc.) still works inside static handlers.
// v1.0.0: Initial Layer A — persistent intensity hazard Region behavior.
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

  // ── Event handlers (static — called with instance as `this`) ────
  // These must be declared BEFORE the `static events` map below, because
  // class static methods and static field initializers are processed in
  // source order. If the events map comes first, `this._onRegionEnter`
  // resolves to undefined at initialization time.
  static async _onRegionEnter(event) {
    if (!game.user?.isActiveGM) return;
    if (!this.saveOnEntry) return;
    const tokenDoc = event.data?.token;
    if (!tokenDoc?.actor) return;
    await this.resolveForToken(tokenDoc);
  }

  static async _onRegionExit(event) {
    if (!game.user?.isActiveGM) return;
    const tokenDoc = event.data?.token;
    if (!tokenDoc?.actor) return;
    this._resolvedTokenIds?.delete(tokenDoc.id);
    await this._clearHazardEffect(tokenDoc.actor);
  }

  // ── Event subscriptions (v14 idiom) ─────────────────────────────
  // The base class's _handleRegionEvent dispatches via this static map.
  // Foundry's event dispatcher gates on `eventName in constructor.events`
  // BEFORE calling _handleRegionEvent — behaviors without the event declared
  // here receive nothing, even if _handleRegionEvent is overridden. That was
  // the v1.0.0 bug: we overrode _handleRegionEvent but never declared static
  // events, so Foundry's gate blocked every dispatch.
  static events = {
    [CONST.REGION_EVENTS.TOKEN_ENTER]: this._onRegionEnter,
    [CONST.REGION_EVENTS.TOKEN_EXIT]:  this._onRegionExit
  };

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

    // Synchronous dedupe — v14 fires TOKEN_ENTER when the behavior is created
    // over tokens already inside, so the entry event and grenade-action's
    // initial-blast loop both call this. Guard BEFORE any await; cleared on exit.
    this._resolvedTokenIds ??= new Set();
    if (this._resolvedTokenIds.has(tokenDoc.id)) return;
    this._resolvedTokenIds.add(tokenDoc.id);

    // Already hazarded by this Region? Skip (no double saves on re-entry).
    const existing = actor.effects.find(e =>
      e.getFlag("msh-faserip", FROM_HAZARD_FLAG) === regionId
    );
    if (existing) return;

    // Cross-source dedupe: already suffering this hazard's effect from ANY
    // source (another region — second grenade — or a canister shot)? Skip
    // the save and the karma prompt; being gassed twice doesn't stack.
    // Status ids match the intensityEffect keys throughout effect-engine,
    // and actor.statuses is authoritative regardless of CTT renames.
    // Known tradeoff: in overlapping clouds, exiting the region that
    // applied the effect removes it even if the token is still inside the
    // other — GM adjudicates the rare overlap case.
    if (this.intensityEffect) {
      const alreadyAffected = actor.statuses?.has?.(this.intensityEffect)
        || actor.effects.some(e => e.statuses?.has?.(this.intensityEffect));
      if (alreadyAffected) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ token: tokenDoc }),
          content: `<div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;padding:6px 10px;font-size:.9em;">
            <div style="color:#8b0000;font-weight:bold;font-size:.85em;text-transform:uppercase;">Area Hazard — ${this.label}</div>
            <div><strong>${tokenDoc.name}</strong> is already ${EFFECT_LABELS[this.intensityEffect] || "affected"} — no additional save.</div>
          </div>`
        });
        return;
      }
    }

    // Save FEAT vs the hazard's Intensity: scaled green/yellow/red requirement
    // by rank gap (was white-only fail), automatic at 3+ above, impossible at
    // 2+ below, and karma via resolveResistFeat (owner-client prompt with 10s
    // auto-decline; this method already runs on the active GM's client, the
    // right executor for the socket routing).
    const abilityRank = actor.system?.abilities?.[this.saveAbility]?.rank || "Typical";
    const abilLabel = this.saveAbility.charAt(0).toUpperCase() + this.saveAbility.slice(1);
    const { determineFeatRequirement, checkFeatSuccess } = await import("../actions/ability-feat-dialog.js");
    const req = determineFeatRequirement(abilityRank, this.intensityRank);

    let failed, rollLine;
    if (req.automatic) {
      failed = false;
      rollLine = `Automatic — ${abilLabel} 3+ ranks above`;
    } else if (req.impossible) {
      failed = true;
      rollLine = `Impossible FEAT — Intensity 2+ ranks above`;
    } else {
      const { resolveResistFeat } = await import("../dice/dice-roller.js");
      const fr = await resolveResistFeat(actor, {
        sourceName: `Resist ${this.label}`,
        rank: abilityRank,
        intensityRank: this.intensityRank,
        requirement: req.requirement,
        declareTimeoutMs: 10000
      });
      const colorLower = String(rollUniversalTable(abilityRank, Math.min(100, fr.cappedTotal)) || "white").toLowerCase();
      failed = !checkFeatSuccess(colorLower, req.requirement);
      rollLine = fr.karmaUsed > 0
        ? `Roll: ${fr.rollTotal} + ${fr.karmaUsed} Karma = ${fr.cappedTotal} (need ${req.requirement})`
        : `Roll: ${fr.rollTotal} (need ${req.requirement})`;
    }

    // Chat card — one line per save so players see what happened
    const outcomeLabel = failed
      ? `<span style="color:#c62828;font-weight:bold;">FAIL — ${EFFECT_LABELS[this.intensityEffect] || "Affected"}</span>`
      : `<span style="color:#2e7d32;font-weight:bold;">RESIST</span>`;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ token: tokenDoc }),
      content: `<div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;padding:6px 10px;font-size:.9em;">
        <div style="color:#8b0000;font-weight:bold;font-size:.85em;text-transform:uppercase;">Area Hazard — ${this.label}</div>
        <div><strong>${tokenDoc.name}</strong> enters — ${abilLabel} FEAT vs ${this.intensityRank} Intensity</div>
        <div>${rollLine} → ${outcomeLabel}</div>
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
            flags: { "msh-faserip": { effectType: "incapacitated", status: { isIncapacitated: true }, intensitySource: this.label } },
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
            flags: { "msh-faserip": { effectType: "immobilized", status: { isImmobilized: true }, intensitySource: this.label } },
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