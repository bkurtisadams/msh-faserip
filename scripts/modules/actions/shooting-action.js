// shooting-action.js v3.11.0 - 2026-09-02
// v3.11.0: AP-CS slice (RULED 2026-09-02: armor piercing is always column
//          shifts). Weapon AP read through getItemArmorPiercingCS; AP shot
//          variant = 2CS; flat/apMode plumbing retired; Remember flags
//          written in ONE actor.update instead of 9 sequential setFlag calls.
// shooting-action.js v3.10.0 - 2026-08-21
// v3.10.0: Lock the Multi controls when the tracker Multiple Attacks FEAT is
//          already resolved (rolled or Automatic) — no implied second roll.
// shooting-action.js v3.9.4 - 2026-08-21
// v3.9.4: Consume RAW Multiple Attacks from the combat tracker Pre-Action result.
// shooting-action.js v3.9.3 - 2026-08-02
// v3.9.3: Tear Gas effect flags nest under the msh-faserip scope (v14
//        mangles top-level primitive flags to {} — confirmed in-world:
//        flags = { effectType: {} }). Dedupe matcher already checks the
//        scoped location first.
// shooting-action.js v3.9.2 - 2026-08-02
// v3.9.2: Tear-gas dedupe matcher hardened — CTT renames managed effects
//        ("Tear Gas (12s)") so exact-name match missed, and top-level
//        flags.effectType may not survive v14 flag-scope validation. Now
//        matches system-scoped flag, legacy flag, or /^Tear Gas\b/ prefix.
// shooting-action.js v3.9.1 - 2026-08-02
// v3.9.1: Canister dedupe — targets already tear-gassed refresh the existing
//        effect's duration instead of stacking a second -3CS/-2CS AE;
//        already-unconscious targets skip the KO save. Both skip the FEAT
//        and the karma prompt entirely (mirrors area-hazard-behavior's
//        "already hazarded" guard).
// shooting-action.js v3.9.0 - 2026-08-02
// v3.9.0: Defender karma + scaled FEAT difficulty on ammo saves. Mercy Shot
//        KO FEAT and Canister gas/KO saves route through resolveResistFeat
//        (owner-client prompt, 10s auto-decline) and determineFeatRequirement
//        (green/yellow/red by rank gap, automatic at 3+, impossible at 2+
//        below — canister was white-only fail). Canister targets resolve in
//        PARALLEL so multiple players get their declaration windows
//        simultaneously instead of stacking 10s waits.
// shooting-action.js v3.8.0 - 2026-08-02
// v3.8.0: Weapon dropdown filter widened: weaponType "shooting" and damageType
//        "Stun" now qualify (previously only damageType "S" / attackType
//        "shooting" / tags). A Stun Pistol (weaponType shooting, damage 0,
//        damageType Stun, intensityRank) was invisible from the Actions tab —
//        it only worked when dispatched from the equipment hub because the
//        passed item gets prepended.
// shooting-action.js v3.7.8 - 2026-07-31
// v3.7.8: Mercy Shot armor gate honors borderline equality (>= not >) per
//        the "one more point" rule in the GM RULINGS LOG.
// shooting-action.js v3.7.7 - 2026-06-12
// v3.7.7: Mercy KO intensity also reads the unified system.intensityRank.
// shooting-action.js v3.7.6 - 2026-06-12
// v3.7.6: Drop removed Roll#evaluate({async:true}) option (use evaluate()).
// v3.7.5: Mercy Shot KO intensity is now per-weapon (system.mercyIntensity,
//         falling back to system.stunIntensity, default Remarkable per RAW)
//         and the Endurance FEAT is gated against it via requiredColorForIntensity
//         instead of treating any non-white roll as a resist. Lets a tranq be
//         set to Excellent (or any) Intensity.
// v3.7.4: Relabel the blue distance box "Range" -> "DISTANCE" to disambiguate
//         it from the CS-row range penalty term.
// shooting-action.js v3.7.3 - 2026-05-23
// v3.7.3: Range penalty is now -1CS per full area to the target (weapon rule,
//         RAW); the closest area is no longer free. Same area = 0 = no penalty.
// shooting-action.js v3.7.2 - 2026-05-23
// v3.7.2: Range penalty now itemized in the to-hit breakdown
//         (shiftBreakdown.range), matching the thrown forms.
// shooting-action.js v3.7.1 - 2026-05-23
// v3.7.1: CS Reason field now persists across reopens (lastShootingReason
//         flag, gated by Remember), matching the other attack dialogs.
// v3.7.0: Aim tactic — Bullseye-effect reinterpretation per RAW Tactics.
//         New Aim row in options box: Neutralize (Red→Yellow, disarm chat
//         note) or Stun (Yellow Bullseye → Stun chip via attack-action.js
//         pipeline). Persisted via lastShootingAim actor flag; resolution
//         logic lives in attack-action.js v1.9.24.
// v3.6.0: Honor opts.attackMode.damage and opts.attackMode.damageType when the equipment
//         hub dispatched a specific attack mode (e.g. Air Pistol → Explosive Pellet).
//         _modeDamage / _modeDamageType helpers gate the override to the passed item;
//         other weapons in the dropdown keep their own values. Without this, multi-mode
//         weapons resolved to 0 damage because mode.damage was never read. Chat card
//         sourceName now reads "Weapon — Mode Name" when a mode is active so the chat
//         log distinguishes which pellet/mode was fired.
// v3.5.1: Mercy Shot armor-gate preserved per RAW. If the weapon's
//         standard damage would not have penetrated armor, KO drug
//         has no effect. Pairs with removal of legacy mercy stun-
//         trigger in attack-action.js that was firing a duplicate
//         (and incorrectly-labeled) Stun Check FEAT.
// v3.5.0: T1/T2/T3 ammo variant follow-ups.
//         T1: Mercy Shot now rolls Endurance FEAT vs Rm Intensity on hit,
//             applies applyUnconscious with 1-10 round duration on failure.
//             Uses _executeSingleAttack postHitCallback hook.
//         T2: Explosive Shot on weapons with burstScatter !== "none" now
//             places a 1-area template at the primary target and applies
//             2x damage to all other tokens in the area. Single-target
//             explosive behavior unchanged for non-burst weapons.
//         T3: Canister Shot sub-types fully implemented (gas/knockout/
//             smoke/explosive/incendiary). Sub-type defaults from
//             weapon.system.canisterSubType, overridable via new dialog
//             picker that appears when variant === canister.
//             - gas: In Intensity tear gas, Endurance FEAT or incapacitated
//             - knockout: Rm Intensity KO gas, applyUnconscious on FEAT fail
//             - smoke: Ex Intensity, -2CS AE on all in area
//             - explosive: 2x damage to all in area (adjacent falloff TODO)
//             - incendiary: damage + ongoing burn via game.msh.ongoing
//         Adds postHitCallback plumbing. Imports AreaTemplate.
// v3.4.2: Rubber Shot now correctly ignores Slam per RAW (Advanced Set
//         Ammunition: "Ignore Slam results in using rubber bullets").
//         Downgrades yellow Slam → Hit on the cloned blunt-attack effect
//         table. Green Hit and red Stun stand. Previous v3.4.1 "fix" was
//         based on an incorrect review claim and has been reverted —
//         RAW explicitly suppresses Slam for rubber rounds.
// v3.4.1: (reverted) rubber shot comment changes
// v3.4.0: Wire ammo variant rules — variantType in resolve, heat-seeker no range penalty,
//         explosive 2x damage, mercy 0 damage + KO, rubber blunt effects, preview updates.
// v3.3.0: Manual CS only — remove talent/power auto-detection and auto-mods.
//         CS row is a simple number input + ? reference panel.
//         Range penalty still displayed in Range box (informational).
// v3.1.0: Separate talent row from CS input — talents in own green box above CS,
//         CS input is purely manual/situational. Eliminates CS drift across sessions.
//         Net row shows combined breakdown. Compact single-row footer with inline buttons.
// v3.0.0: Port to v3 compact layout — header-v3, CS box with talent chips + situational dropdown,
//         inline damage row with weapon select, range info box, opts box (multi x2/x3 + karma)
//         with greyed inactive rows, FX grid, titlebar mode injection, 360px width.
//         Range/movement/obstacle modifiers now applied via situational tags feeding CS total.
// v2.0.0: Complete dialog redesign to match blunt-attack-action.js structure

import { RangedAttackAction } from "./ranged-attack-action.js";
import { 
  setupKarmaControlHandlers, 
  extractKarmaFromDialog,
  getAvailableKarma,
  getMinimumKarmaCommitment
} from "../dice/dice-roller.js";
import { 
  applyDamageToTargets,
  attachAutoFillRange,
  bannerColors,
  buildActionsBox,
  buildModeSelector,
  buildResultGrid,
  debugLog,
  effectsFor,
  getAbilityInfo,
  getBodyArmorValues,
  getTargetData,
  labelFor,
  RANKS,
  rollWithKarmaAndHistory,
  setupModeSelector,
  applyCapabilitiesToDialog,
  shiftRank,
  buildInlineFeatDisplay,
  getEffectiveArmor as _getEffectiveArmor,
  getItemArmorPiercingCS,
  getDeclaredMultiAttackState
} from "./action-utils.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";
import { AreaTemplate } from "./area-template.js";
import { canEffectsApply } from "../../rules/effects-gate.js";
import { playCombatSFX } from "./audio-utils.js";
import { rollUniversalTable } from "../dice/universal-table.js";
import { buildCSRow, wireCSPanel } from "./cs-modifiers.js";

import { showFaseripDialog } from "./dialog-shim.js";
export class ShootingAction extends RangedAttackAction {
  async execute() {
    const actor = this.actor;
    const actionType = "shooting";
    const actionName = labelFor(actionType);
    const effects = effectsFor(actionType);
    const ability = getAbilityInfo(actor, this.abilityName);

    // === Find shooting weapons ===
    const passedItemId = this.opts?.itemId || this.opts?.item?.id || null;
    const passedItem = passedItemId ? actor.items.get(passedItemId) : null;

    // Per-attack-mode override: when the equipment hub dispatched a specific mode
    // (e.g. Air Pistol → Explosive Pellet), the mode's damage/damageType replace
    // the item-level values for the duration of this attack. Other weapons in the
    // dropdown keep their own values.
    const attackMode = this.opts?.attackMode || null;
    const _modeDamage = (weapon) =>
      (attackMode && passedItem && weapon?.id === passedItem.id)
        ? (Number(attackMode.damage) || 0)
        : (Number(weapon?.system?.damage) || 0);
    const _modeDamageType = (weapon) =>
      (attackMode && passedItem && weapon?.id === passedItem.id && attackMode.damageType)
        ? attackMode.damageType
        : (weapon?.system?.damageType || "");

    let shootingWeapons = actor.items.filter(i => {
      if (i.type !== "equipment") return false;
      const s = i.system || {};
      const tagHit = Array.isArray(s.tags) && (s.tags.includes("S") || s.tags.includes("shooting"));
      return (s.damageType === "S")
        || (s.damageType === "Stun")
        || (s.attackType === "shooting")
        || (String(s.weaponType || "").toLowerCase() === "shooting")
        || tagHit;
    });

    if (passedItem && passedItem.type === "equipment") {
      if (!shootingWeapons.find(i => i.id === passedItem.id)) {
        shootingWeapons = [passedItem, ...shootingWeapons];
      }
    }

    if (!shootingWeapons.length) {
      if (this.opts?.deviceAbility) {
        const deviceItems = actor.items.filter(i => {
          if (i.type !== "equipment") return false;
          return i.system?.category === "device";
        });
        if (deviceItems.length) shootingWeapons = deviceItems;
      }
      if (!shootingWeapons.length) {
        ui.notifications.warn(`${actor.name} has no shooting weapons.`);
        return;
      }
    }

    // --- INITIALIZATION & DEFAULTS ---
    const lsRememberKey = "msh.shooting.remember";
    const lsSkipKey = "msh.shooting.skipDice";

    const storedRemember = localStorage.getItem(lsRememberKey);
    const shouldRemember = storedRemember === "1";

    const savedItemId = passedItemId || (shouldRemember ? (await actor.getFlag("msh-faserip", "lastShootingItemId")) : "") || "";
    const savedRange = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastShootingRange")) || 1) : 1;
    const savedColumnShift = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastShootingShift")) || 0) : 0;
    let savedMultiAttacks = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastShootingMultiAttacks")) || false) : false;
    let savedAttackCount = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastShootingAttackCount")) || 2) : 2;
    const declaredMultiState = getDeclaredMultiAttackState(actor);
    if (declaredMultiState.raw) {
      savedMultiAttacks = !!declaredMultiState.declared;
      if (declaredMultiState.declared) savedAttackCount = declaredMultiState.count;
    }
    const savedVariantType = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastShootingVariant")) || "") : "";
    const savedAim = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastShootingAim")) || "none") : "none";
    const savedReason = shouldRemember ? ((await actor.getFlag("msh-faserip", "lastShootingReason")) || "") : "";
    const savedSkipDice = localStorage.getItem(lsSkipKey) === "1";

    // === Target info ===
    const { targets, primaryTarget, primaryTargetActor, targetDisplay } = getTargetData();

    const targetArmorInfo = primaryTargetActor ? getBodyArmorValues(primaryTargetActor, "physical-ranged") : null;
    const targetArmor = targetArmorInfo?.applicable ?? 0;
    const targetArmorRank = targetArmorInfo?.physicalRank || "";
    const targetArmorAbbr = targetArmorRank ? (RANK_ABBR[targetArmorRank] || targetArmorRank) : "";

    // === Initial weapon info ===
    const initialWeapon = shootingWeapons.find(i => i.id === savedItemId) || shootingWeapons[0];
    const initialWeaponRange = initialWeapon?.system?.range || 15;
    const initialWeaponDamage = _modeDamage(initialWeapon);

    // Variant/special ammo helpers
    const _buildVariantOptions = (weapon, currentVariant) => {
      const sa = weapon?.system?.specialAmmo || {};
      const saved = currentVariant || weapon?.system?.variantType || "standard";
      const opts = [{ v: "standard", label: "Standard" }];
      if (sa.ap)         opts.push({ v: "ap",        label: "Armor Piercing" });
      if (sa.mercy)      opts.push({ v: "mercy",     label: "Mercy/Non-Lethal" });
      if (sa.rubber)     opts.push({ v: "rubber",    label: "Blunted/Rubber" });
      if (sa.explosive)  opts.push({ v: "explosive", label: "Explosive" });
      if (sa.canister)   opts.push({ v: "canister",  label: "Canister Shot" });
      if (sa.heatSeeker) opts.push({ v: "heatSeeker", label: "Heat-Seeker" });
      if (sa.powerPack)  opts.push({ v: "powerPack", label: "Power Pack" });
      if (opts.length === 1) return "";
      return opts.map(o => `<option value="${o.v}" ${o.v === saved ? "selected" : ""}>${o.label}</option>`).join("");
    };
    const _getEffectiveAPForVariant = (weapon, variantType) => {
      if (variantType === "ap") return { apCS: 2, bypassFF: false };
      return { apCS: getItemArmorPiercingCS(weapon), bypassFF: !!weapon?.system?.bypassForceField };
    };

    const initialVariant = initialWeapon?.system?.variantType || savedVariantType || "standard";
    const initialVariantOptions = _buildVariantOptions(initialWeapon, initialVariant);
    const initialAPInfo = _getEffectiveAPForVariant(initialWeapon, initialVariant);
    const initialEffArmor = _getEffectiveArmor(targetArmor, initialAPInfo.apCS);
    const initialAfterArmor = Math.max(0, initialWeaponDamage - initialEffArmor);
    const initialAPLabel = initialAPInfo.apCS > 0 ? `${initialAPInfo.apCS}CS` : "";

    // === Karma ===
    const availableKarma = getAvailableKarma(actor);
    const minKarma = getMinimumKarmaCommitment(actor);
    const hasKarma = availableKarma > 0;

    const abilityShort = RANK_ABBR[ability.rank] || ability.rank;

    // === Build weapon damage source <select> ===
    const damageSrcOptions = shootingWeapons.map(i => {
      const dmg = _modeDamage(i);
      const rng = Number(i.system?.range || 0);
      const ap = getItemArmorPiercingCS(i);
      const apLabel = ap > 0 ? ` [AP ${ap}CS]` : "";
      const isBroken = i.system?.broken === true;
      const sel = ((i.id === savedItemId || (!savedItemId && i.id === initialWeapon?.id)) && !isBroken) ? 'selected' : '';
      const disabled = isBroken ? 'disabled' : '';
      const label = isBroken ? `[BROKEN] ${i.name}` : i.name;
      return `<option value="${i.id}" ${sel} ${disabled}>${label} &mdash; ${dmg} dmg / ${rng} areas${apLabel}</option>`;
    }).join('');

    // === Build CS row via shared utility (manual input + range + ? reference) ===
    const initialRangePenalty = (initialVariant === "heatSeeker") ? 0 : (savedRange > 1 ? -(savedRange - 1) : 0);
    const csRowHtml = buildCSRow({
      savedCS: savedColumnShift,
      savedReason,
      abilityRank: ability.rank,
      rangePenalty: initialRangePenalty,
      showRange: true
    });

    // === Dialog HTML — v3.2 Mods Panel Layout ===
    const multiEnabled = savedMultiAttacks;

    const dialogHtml = `
    <div class="frp-dlg">

      <!-- Header: Actor (Base Agility / Rank Value) attacks Target -->
      <div class="frp-header-v3">
        <span class="h-actor" title="${actor.name}">${actor.name}</span>
        <span class="h-paren">(</span>
        <span class="h-stat">
          <span class="h-stat-label">Base Agility:</span>
          <span class="h-stat-rank">${abilityShort} ${ability.value}</span>
        </span>
        <span class="h-paren">)</span>
        ${targetDisplay
          ? `<span class="h-verb">attacks</span><span class="h-target" title="${targetDisplay}">${targetDisplay}</span>`
          : ''}
      </div>

      ${primaryTarget ? `
      <div class="frp-target-compact">
        <span class="t-name">${targetDisplay}</span>
        ${targetArmorAbbr ? `<span class="t-armor">BA: ${targetArmorAbbr}(${targetArmor})</span>` : ''}
      </div>` : ''}

      <!-- CS row with Mods dropdown (from shared utility) -->
      ${csRowHtml}

      <!-- Damage: weapon select + numbers inline -->
      <div class="frp-box frp-dmg-box">
        <div class="frp-dmg-inline">
          <select class="frp-select" name="weapon" id="damage-source-select">
            ${damageSrcOptions}
          </select>
          <span class="frp-dmg-num" id="dmg-val">${initialWeaponDamage}</span>
          <span class="frp-cs-arrow">&rarr;</span>
          <span class="frp-dmg-after" id="after-armor-display">${primaryTarget ? `${initialAfterArmor} after armor` : `${initialWeaponDamage} damage`}</span>
        </div>
        <!-- AP indicator -->
        <div id="ap-display" style="font-size:11px;color:#1565c0;margin-top:2px;${initialAPLabel ? '' : 'display:none;'}">
          AP: <strong id="ap-val">${initialAPLabel}</strong>
        </div>
        <!-- Variant ammo row (hidden if no variants) -->
        ${initialVariantOptions ? `
        <div class="object-row" id="variant-row" style="margin-top:3px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <label style="font-size:12px;white-space:nowrap;">Ammo:</label>
            <select name="variantType" id="variant-select" style="flex:1;font-size:12px;padding:2px 3px;border:1px solid #b8b8b8;border-radius:2px;">${initialVariantOptions}</select>
          </div>
        </div>` : ""}
        <!-- Canister sub-type row (shown only when variant === canister) -->
        <div class="object-row" id="canister-subtype-row" style="margin-top:3px;display:${initialVariant === "canister" ? "block" : "none"};">
          <div style="display:flex;align-items:center;gap:6px;">
            <label style="font-size:12px;white-space:nowrap;">Canister:</label>
            <select name="canisterSubType" id="canister-subtype-select" style="flex:1;font-size:12px;padding:2px 3px;border:1px solid #b8b8b8;border-radius:2px;">
              ${(() => {
                const cur = String(initialWeapon?.system?.canisterSubType || "gas").toLowerCase();
                const choices = [
                  ["gas",        "Tear Gas (In)"],
                  ["knockout",   "Knock-Out Gas (Rm)"],
                  ["smoke",      "Smoke (Ex)"],
                  ["explosive",  "Explosive (2\u00d7 area)"],
                  ["incendiary", "Incendiary (burn 1-10 rnd)"]
                ];
                return choices.map(([v, l]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${l}</option>`).join("");
              })()}
            </select>
          </div>
        </div>
      </div>

      <!-- Range info box (blue) — auto-filled from token distance -->
      <div class="frp-box" style="padding:3px 8px;background:#e3f2fd;border-color:#90caf9;">
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;">
          <span style="font-family:'Oswald',sans-serif;font-size:10px;color:#1565c0;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">Distance</span>
          <input type="number" name="range" value="${savedRange}" min="0" readonly class="frp-pull-input" style="width:36px;">
          <span style="color:#777;">areas</span>
          <span style="color:#999;font-size:11px;">(max <span id="max-range-hint">${initialWeaponRange}</span>)</span>
          <span id="range-penalty-display" style="margin-left:auto;font-family:'Oswald',sans-serif;font-weight:600;font-size:12px;color:#c62828;"></span>
        </div>
      </div>

      <!-- Options: Multi / Aim / Karma -->
      <div class="frp-box frp-opts-box">
        <div class="frp-opt-row${!multiEnabled ? ' inactive' : ''}" style="border-bottom:1px solid #e8e0d0;">
          <label><input type="checkbox" id="multi-enabled" ${multiEnabled ? 'checked' : ''}> <span class="frp-opt-label green">Multi</span></label>
          <label style="margin-left:8px;"><input type="radio" name="multiCount" value="2" ${(!savedMultiAttacks || savedAttackCount === 2) ? 'checked' : ''} ${!multiEnabled ? 'disabled' : ''}> &times;2</label>
          <label><input type="radio" name="multiCount" value="3" ${savedAttackCount === 3 ? 'checked' : ''} ${!multiEnabled ? 'disabled' : ''}> &times;3</label>
        </div>
        <div class="frp-opt-row${savedAim === 'none' ? ' inactive' : ''}" style="border-bottom:1px solid #e8e0d0;">
          <label><input type="checkbox" id="aim-enabled" ${savedAim !== 'none' ? 'checked' : ''}> <span class="frp-opt-label red">Aim</span></label>
          <select name="aimMode" ${savedAim === 'none' ? 'disabled' : ''} style="font-size:11px;padding:1px 3px;border:1px solid #bbb;border-radius:2px;margin-left:6px;">
            <option value="neutralize" ${savedAim === 'neutralize' ? 'selected' : ''}>Neutralize (disarm)</option>
            <option value="stun" ${(savedAim === 'stun' || savedAim === 'none') ? 'selected' : ''}>Stun</option>
          </select>
          <span style="font-size:10px;color:#888;margin-left:auto;">Bullseye effect</span>
        </div>
        <div class="frp-opt-row${!hasKarma ? ' inactive' : ' inactive'}">
          ${hasKarma ? `
            <label><input type="checkbox" id="spend-karma" name="spendKarma"> <span class="frp-opt-label blue">Karma</span></label>
            <span class="frp-karma-pool"><strong>${availableKarma}</strong> avail (min ${minKarma})</span>
          ` : `<span style="font-size:12px;color:#999;">No karma available</span>`}
        </div>
      </div>

      <!-- Effect preview grid -->
      <div class="frp-fx-grid">
        <div class="frp-fx-cell w">${effects.white}</div>
        <div class="frp-fx-cell g">${effects.green}</div>
        <div class="frp-fx-cell y">${effects.yellow}</div>
        <div class="frp-fx-cell r">${effects.red}</div>
      </div>

      <!-- Footer: checkboxes + buttons on one row -->
      <div class="frp-foot">
        <div class="frp-foot-btns">
          <button type="button" class="frp-btn-roll" id="frp-roll">Roll</button>
          <button type="button" class="frp-btn-cancel" id="frp-cancel">Cancel</button>
        </div>
        <div class="frp-foot-checks">
          <label><input type="checkbox" id="msh-remember-settings" name="remember" ${shouldRemember ? 'checked' : ''}> Remember</label>
          <label><input type="checkbox" id="msh-skip-dice" name="skipDice" ${savedSkipDice ? 'checked' : ''}> Skip dice</label>
        </div>
      </div>
    </div>
    `;

    const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch (_e) {} };

    const choice = await new Promise((resolve) => {
      let _resolved = false;
      let _csState = null;
      showFaseripDialog({
        title: actionName,
        content: dialogHtml,
        render: async (html, dlg) => {
          setupKarmaControlHandlers(html);
          const $dialog = html.closest('.dialog');

          $dialog.find('.dialog-buttons').hide();

          const $titlebar = $dialog.find('.window-title, .dialog-title').first();
          if ($titlebar.length) {
            const modeHtml = buildModeSelector({ mode: "semi" });
            const $modeWrap = $('<span class="frp-titlebar-mode"></span>').append(modeHtml);
            $titlebar.after($modeWrap);
          }
          await setupModeSelector(actor, $dialog, this.opts || {}, "lastShootingMode");

          if ($dialog.length) {
            $dialog.css('width', '360px');
            $dialog[0].style.height = 'auto';
          }

          // ── Wire CS panel from shared utility ──
          // getRangePenalty reads live range from the dialog
          const _getCurrentRangePenalty = () => {
            // Heat-seeker ammo: no range penalty (tracks hottest source)
            const vt = html.find('[name="variantType"]').val() || "standard";
            if (vt === "heatSeeker") return 0;
            const rangeVal = Number(html.find('[name="range"]').val() || 0);
            const weaponId = html.find('#damage-source-select').val() || "";
            const weapon = shootingWeapons.find(i => i.id === weaponId);
            const maxRange = weapon?.system?.range || 15;
            if (rangeVal > maxRange) return 0; // out of range — handled separately
            return rangeVal > 1 ? -(rangeVal - 1) : 0; // -1CS per area beyond the first (RAW)
          };
          _csState = wireCSPanel(html, {
            abilityRank: ability.rank,
            getRangePenalty: _getCurrentRangePenalty,
            onUpdate: () => {
              if ($dialog.length) $dialog[0].style.height = 'auto';
            }
          });

          // ── Main update function (weapon/damage/range only — CS handled by csState) ──
          const update = () => {
            const weaponId = html.find('#damage-source-select').val() || "";
            const weapon = shootingWeapons.find(i => i.id === weaponId);
            const $val = html.find('#dmg-val');
            const $afterArmor = html.find('#after-armor-display');
            const $apDisplay = html.find('#ap-display');
            const $apVal = html.find('#ap-val');

            const currentDamage = _modeDamage(weapon);
            const currentRange = weapon?.system?.range || 15;
            const variantType = html.find('[name="variantType"]').val() || "standard";
            const apInfo = _getEffectiveAPForVariant(weapon, variantType);

            // Ammo-modified damage for preview
            let previewDamage = currentDamage;
            let previewSuffix = "";
            if (variantType === "explosive") {
              previewDamage = currentDamage * 2;
              previewSuffix = " (2× explosive)";
            } else if (variantType === "mercy") {
              previewDamage = 0;
              previewSuffix = " (Rm KO drug)";
            }

            $val.text(previewDamage + previewSuffix);
            html.find('#max-range-hint').text(currentRange);

            // AP display
            const apLabel = apInfo.apCS > 0 ? `${apInfo.apCS}CS` : "";
            if (apLabel) { $apDisplay.show(); $apVal.text(apLabel); } else { $apDisplay.hide(); }

            // After-armor display
            const effArmor = _getEffectiveArmor(targetArmor, apInfo.apCS);
            const afterArmorDmg = Math.max(0, previewDamage - effArmor);
            if (primaryTarget) {
              $afterArmor.text(`${afterArmorDmg} after armor`);
            } else {
              $afterArmor.text(`${previewDamage} damage${previewSuffix}`);
            }

            // Range penalty — update CS panel and range info display
            const rangeVal = Number(html.find('[name="range"]').val() || 0);
            const $rangePenalty = html.find('#range-penalty-display');

            // Heat-seeker ammo: no range penalty (tracks hottest source)
            const isHeatSeeker = variantType === "heatSeeker";

            if (rangeVal > currentRange) {
              $rangePenalty.text('OUT OF RANGE').css('color', '#c62828');
              _csState.setRange(0);
            } else if (isHeatSeeker) {
              $rangePenalty.text('Heat-Seeker (no penalty)').css('color', '#1565c0');
              _csState.setRange(0);
            } else {
              const penalty = rangeVal > 1 ? -(rangeVal - 1) : 0; // -1CS per area beyond the first (RAW)
              $rangePenalty.text(penalty < 0 ? `${penalty}CS` : '').css('color', '#e65100');
              _csState.setRange(penalty);
            }

            if ($dialog.length) $dialog[0].style.height = 'auto';
          };

          update();

          // Auto-focus Roll button for keyboard Enter and focus ring
          html.find('#frp-roll').focus();

          // Intercept Enter key — trigger Roll instead of Foundry's native submit
          $dialog.on('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              html.find('#frp-roll').trigger('click');
            }
          });

          // ── Roll button handler ──
          html.find('#frp-roll').on('click', async () => {
            const $dlg = (sel) => html.find(sel);

            const rememberSettings = $dlg("#msh-remember-settings").is(':checked');
            const skipDice = $dlg("#msh-skip-dice").is(':checked');

            try {
              localStorage.setItem(lsRememberKey, rememberSettings ? "1" : "0");
              localStorage.setItem(lsSkipKey, skipDice ? "1" : "0");
            } catch (e) {}

            const weaponId = String($dlg('[name="weapon"]').val() || "");
            const weapon = shootingWeapons.find(i => i.id === weaponId);

            if (!weapon) {
              ui.notifications.error("No weapon selected!");
              return;
            }

            // Get CS state from shared utility
            const cs = _csState.get();

            const { spendKarma, karmaToSpend } = extractKarmaFromDialog(html);
            const karma = karmaToSpend;
            const range = Number($dlg('[name="range"]').val() || 1);
            const variantType = $dlg('[name="variantType"]').val() || weapon.system?.variantType || "standard";
            const canisterSubType = $dlg('[name="canisterSubType"]').val() || weapon.system?.canisterSubType || "gas";

            const multiEnabled = $dlg('#multi-enabled').is(':checked');
            const multiCountVal = $dlg('[name="multiCount"]:checked').val() || "2";
            const multiAttacks = multiEnabled;
            const attackCount = (multiCountVal === "3") ? 3 : 2;

            // Aim tactic — Bullseye-effect reinterpretation (Tactics, RAW)
            const aimEnabled = $dlg('#aim-enabled').is(':checked');
            const aimMode = aimEnabled ? ($dlg('[name="aimMode"]').val() || "none") : "none";

            // Weapon stats + AP
            const weaponRange = weapon.system?.range || 15;
            const weaponDamage = _modeDamage(weapon);
            const _apInfo = _getEffectiveAPForVariant(weapon, variantType);

            // Range validation
            if (range > weaponRange) {
              ui.notifications.error(`Target is beyond weapon range (${weaponRange} areas)!`);
              return;
            }

            // Save settings — single document update
            const flagUpdate = { csNotes: cs.csNotes };
            if (rememberSettings) {
              Object.assign(flagUpdate, {
                lastShootingItemId: weaponId,
                lastShootingRange: range,
                lastShootingShift: cs.manualCS,
                cs_shooting: cs.manualCS,
                lastShootingMultiAttacks: multiAttacks,
                lastShootingAttackCount: attackCount,
                lastShootingVariant: variantType,
                lastShootingAim: aimMode,
                lastShootingReason: cs.reason
              });
            }
            await actor.update({ "flags.msh-faserip": flagUpdate });

            // Persist ammo variant on the weapon — the gun stays loaded with
            // this ammo until changed. Independent of Remember Settings and
            // survives reload (reload only refills shotsRemaining).
            if ((weapon.system?.variantType || "standard") !== variantType) {
              try { await weapon.update({ "system.variantType": variantType }); } catch (_e) {}
            }

            _resolved = true;
            resolve({
              weapon,
              weaponDamage,
              weaponRange,
              shift: cs.totalShift,
              karma,
              spendKarma,
              range,
              skipDice,
              totalShift: cs.totalShift,
              multiAttacks,
              attackCount,
              variantType,
              canisterSubType,
              aimMode,
              csNotes: cs.csNotes,
              armorPiercingCS: _apInfo.apCS,
              bypassForceField: _apInfo.bypassFF,
              shiftBreakdown: {
                manual: cs.manualCS,
                range: cs.rangePenalty,
                multiAttack: 0,
                csNotes: cs.csNotes
              }
            });
            dlg.close();
          });

          // ── Cancel button handler ──
          html.find('#frp-cancel').on('click', () => {
            _resolved = true;
            resolve(null);
            dlg.close();
          });

          // ── Event bindings (weapon/variant/range only — CS handled by csState) ──
          html.find('#damage-source-select').on('change', () => {
            const wId = html.find('#damage-source-select').val();
            const w = shootingWeapons.find(i => i.id === wId);
            const newVariantOpts = _buildVariantOptions(w, "");
            const $variantRow = html.find('#variant-row');
            if (newVariantOpts) {
              if (html.find('#variant-select').length) {
                html.find('#variant-select').html(newVariantOpts);
              } else if ($variantRow.length === 0) {
                html.find('.frp-dmg-box').append(`<div class="object-row" id="variant-row" style="margin-top:3px;"><div style="display:flex;align-items:center;gap:6px;"><label style="font-size:12px;white-space:nowrap;">Ammo:</label><select name="variantType" id="variant-select" style="flex:1;font-size:12px;padding:2px 3px;border:1px solid #b8b8b8;border-radius:2px;">${newVariantOpts}</select></div></div>`);
                html.find('#variant-select').on('change', update);
              }
            } else {
              html.find('#variant-row').remove();
            }
            update();
          });
          html.find('[name="range"]').on('input change', update);
          html.on('change', '[name="variantType"]', update);
          // Show/hide canister sub-type row based on variant selection
          html.on('change', '[name="variantType"]', function() {
            const isCan = $(this).val() === "canister";
            html.find('#canister-subtype-row').css('display', isCan ? 'block' : 'none');
          });

          // Multi-attack toggle
          html.find('#multi-enabled').on('change', function() {
            const $row = $(this).closest('.frp-opt-row');
            $row.toggleClass('inactive', !this.checked);
            $row.find('[name="multiCount"]').prop('disabled', !this.checked);
          });
          if (declaredMultiState.resolved) {
            html.find('#multi-enabled').prop('disabled', true)
              .attr('title', `Multiple Attacks FEAT locked in tracker: ${String(declaredMultiState.result || 'done').toUpperCase()} — ${declaredMultiState.attacksAllowed} attack(s) at ${declaredMultiState.consequenceCS}CS`);
            html.find('[name="multiCount"]').prop('disabled', true);
          }

          // Aim tactic toggle
          html.find('#aim-enabled').on('change', function() {
            const $row = $(this).closest('.frp-opt-row');
            $row.toggleClass('inactive', !this.checked);
            $row.find('[name="aimMode"]').prop('disabled', !this.checked);
          });

          // Karma toggle
          html.find('#spend-karma').on('change', function() {
            $(this).closest('.frp-opt-row').toggleClass('inactive', !this.checked);
          });

          applyCapabilitiesToDialog(html, "shooting", { actor });

          // Attach auto-fill range from token distance
          this._disposeAutoFill = attachAutoFillRange(html, actor, () => update());

          html.find('#msh-skip-dice').on('change', function() {
            setLS(lsSkipKey, this.checked ? "1" : "0");
          });
          html.find('#msh-remember-settings').on('change', function() {
            setLS(lsRememberKey, this.checked ? "1" : "0");
          });
        },
        close: () => {
          if (this._disposeAutoFill) this._disposeAutoFill();
          if (_csState) _csState.destroy();
          if (!_resolved) resolve(null);
        }
      });
    });

    if (!choice) return { rawActionCancelled: true };

    // Mode already set by setupModeSelector during dialog render (respects global lock + ceiling)
    const mode = this.opts.mode;

    // Track shift breakdown
    const shiftBreakdown = choice.shiftBreakdown || {
      manual: choice.shift || 0,
      multiAttack: 0,
      csNotes: choice.csNotes || ""
    };

    // Multiple Attacks. In RAW tracker mode the Fighting FEAT belongs to the
    // Pre-Action phase and is consumed here rather than rolled again.
    let actualAttackCount = 1;
    let multiAttackFeatResult = null;
    const rawMulti = getDeclaredMultiAttackState(actor);
    if (rawMulti.raw) {
      if (rawMulti.declared) { choice.multiAttacks = true; choice.attackCount = rawMulti.count; }
      else if (choice.multiAttacks) {
        ui.notifications.warn("Multiple Attacks were not declared before initiative; making a normal shot.");
        choice.multiAttacks = false;
      }
    }
    if (choice.multiAttacks) {
      const intensity = choice.attackCount === 2 ? "Remarkable" : "Amazing";
      if (rawMulti.raw) {
        if (!rawMulti.resolved) { ui.notifications.warn("Resolve the Multiple Attacks Fighting FEAT in Pre-Action before shooting."); return; }
        multiAttackFeatResult = { success: rawMulti.success, resultColor: rawMulti.result, intensity, attackCount: rawMulti.count, preAction: true };
        actualAttackCount = rawMulti.attacksAllowed;
        shiftBreakdown.multiAttack = rawMulti.consequenceCS;
        choice.totalShift = (choice.totalShift || 0) + rawMulti.consequenceCS;
      } else {
        const fightingAbility = getAbilityInfo(actor, "fighting");
        const featResult = await this._rollFightingFeat(actor, fightingAbility, intensity, choice.attackCount);
        if (featResult.cancelled) return;
        multiAttackFeatResult = { ...featResult, intensity, attackCount: choice.attackCount };
        let useConsolidated = false;
        try { useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards"); } catch (_e) {}
        if (!useConsolidated) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div style="background:#eef6ff;border:1px solid #90caf9;border-radius:3px;padding:6px;margin:4px 0;"><b>Multi-Attack FEAT:</b> ${intensity} — ${featResult?.success ? "SUCCESS" : "FAIL"} ${featResult?.auto ? "(Automatic)" : ""}</div>` });
        const featSuccess = !!(featResult?.auto || featResult?.resultColor === "AUTO" || featResult?.success);
        const featImpossible = !!(featResult?.resultColor === "IMPOSSIBLE");
        if (featSuccess && !featImpossible) { actualAttackCount = choice.attackCount; shiftBreakdown.multiAttack = -1; choice.totalShift = (choice.totalShift || 0) - 1; }
        else { actualAttackCount = 1; shiftBreakdown.multiAttack = -3; choice.totalShift = (choice.totalShift || 0) - 3; }
      }
    }

    choice.shiftBreakdown = shiftBreakdown;

    // ── Ammo variant overrides ──────────────────────────────────
    const vt = choice.variantType || "standard";
    let effectiveActionType = actionType;
    let effectiveEffects = effects;
    let effectiveAttackForm = "shooting";
    let effectiveDamageType = _modeDamageType(choice.weapon) || "physical-ranged";
    let effectiveDamage = choice.weaponDamage || 0;
    let effectiveDamageNote = "";
    let variantNote = "";
    let postHitCallback = null;
    const weapon = choice.weapon;
    const weaponSys = weapon?.system || {};

    if (vt === "rubber") {
      // Rubber Shot per RAW (Advanced Set Ammunition): inflicts slugfest
      // (blunt) damage, "Ignore Slam results in using rubber bullets."
      // Clone blunt-attack config and downgrade yellow Slam → Hit;
      // green Hit and red Stun stand.
      const { ACTION_EFFECTS } = await import("./action-config.js");
      // ACTION_EFFECTS entries are color-keyed maps; downgrade yellow Slam → Hit,
      // green Hit and red Stun stand.
      effectiveEffects = { ...ACTION_EFFECTS["blunt-attack"], yellow: "Hit" };
      effectiveAttackForm = "blunt";
      effectiveDamageType = "physical-blunt";
      variantNote = "Rubber Shot — blunt damage, ignore Slam";
    } else if (vt === "mercy") {
      // Mercy Shot per RAW (Advanced Set Ammunition): "Mercy bullets inflict no
      // damage, but spread a Remarkable Intensity knock-out drug over the skin
      // of the target. If the bullet inflicts damage to the target, the drug
      // takes effect, knocking those affected out for 1-10 rounds."
      // Interpretation: if the shot hits (color ≥ green), target makes an
      // Endurance FEAT vs Remarkable Intensity or is KO'd 1-10 rounds.
      effectiveDamage = 0;
      variantNote = "Mercy Shot — Rm Intensity KO drug on hit";
      postHitCallback = this._mercyKnockoutCallback();
    } else if (vt === "explosive") {
      // Explosive Shot per RAW: 2x weapon damage. If the weapon fires bursts
      // or scatters, all in the area are affected. Single-target weapons
      // just do 2x to the primary target (current single-hit behavior).
      effectiveDamage = (choice.weaponDamage || 0) * 2;
      effectiveDamageNote = `${choice.weaponDamage}×2 explosive`;
      const bs = String(weaponSys.burstScatter || "none").toLowerCase();
      if (bs === "burst" || bs === "scatter") {
        variantNote = `Explosive Shot — double damage, ${bs} area effect`;
        postHitCallback = this._explosiveAreaCallback({ damage: effectiveDamage, damageType: effectiveDamageType });
      } else {
        variantNote = "Explosive Shot — double damage";
      }
    } else if (vt === "heatSeeker") {
      variantNote = "Heat-Seeker — no range penalty";
    } else if (vt === "canister") {
      // Canister Shot per RAW: 5 sub-types, all area-effect.
      //   gas       — In Intensity tear gas, 1 area
      //   knockout  — Rm Intensity KO gas, 1 area
      //   smoke     — Ex Intensity smoke, 1 area
      //   explosive — 2x damage target area, 1x adjacent (adjacent falloff TODO)
      //   incendiary — weapon damage as fire, burns 1-10 rounds
      // Sub-type default from weapon.system.canisterSubType; dialog may override.
      const subType = String(choice.canisterSubType || weaponSys.canisterSubType || "gas").toLowerCase();
      const subLabels = {
        gas: "Tear Gas (In Intensity)",
        knockout: "KO Gas (Rm Intensity)",
        smoke: "Smoke (Ex Intensity)",
        explosive: "Explosive (2× area)",
        incendiary: `Incendiary (burn 1-10 rnd @ ${choice.weaponDamage || 0})`
      };
      variantNote = `Canister Shot — ${subLabels[subType] || subType}`;
      if (subType === "explosive") {
        effectiveDamage = (choice.weaponDamage || 0) * 2;
        effectiveDamageNote = `${choice.weaponDamage}×2 canister explosive`;
      } else if (subType === "incendiary") {
        effectiveDamageType = "energy";
      } else {
        // Gas / KO / Smoke: no direct damage on primary target from the shot itself.
        effectiveDamage = 0;
      }
      postHitCallback = this._canisterAreaCallback({
        subType,
        baseDamage: choice.weaponDamage || 0,
        damageType: effectiveDamageType
      });
    }

    // Execute attack(s)
    for (let i = 1; i <= actualAttackCount; i++) {
      if (i > 1) await new Promise(resolve => setTimeout(resolve, 500));

      const actionLabel = actualAttackCount > 1 ? `${actionName} (${i}/${actualAttackCount})` : actionName;
      const targetForThisAttack = actualAttackCount === 1 ? targets[0] : targets[(i-1) % targets.length];

      const _baseSourceName = choice.weapon?.name || "Weapon";
      const _sourceName = (attackMode && choice.weapon?.id === passedItem?.id && attackMode.name)
        ? `${_baseSourceName} — ${attackMode.name}`
        : _baseSourceName;

      await this._executeSingleAttack({
        choice: { ...choice, specificTarget: targetForThisAttack, multiAttackFeatResult: i === 1 ? multiAttackFeatResult : null },
        actor: this.actor,
        ability,
        actionType: effectiveActionType,
        actionName: actionLabel,
        effects: effectiveEffects,
        damageType: effectiveDamageType,
        rawDamage: effectiveDamage,
        damageNote: effectiveDamageNote,
        sourceName: _sourceName,
        attackForm: effectiveAttackForm,
        breakingFeat: null,
        targetCount: 1,
        attackNumber: i,
        totalAttacks: actualAttackCount,
        postHitCallback: i === 1 ? postHitCallback : null
      });
    }

    // Multi-attack completion message
    if (actualAttackCount > 1) {
      let useConsolidated = false;
      try {
        useConsolidated = game.settings.get("msh-faserip", "consolidatedChatCards");
      } catch (_e) {}

      if (!useConsolidated) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div style="background:#e8f5e9;border:1px solid #4caf50;border-radius:3px;padding:8px;margin:5px 0;">
            <div style="color:#2e7d32;font-weight:bold;margin-bottom:5px;">Multiple Attack Sequence Complete</div>
            <div style="font-size:0.9em;">${actor.name} completed ${actualAttackCount} attacks.</div>
          </div>`
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // T1 — Mercy Shot KO drug
  // ─────────────────────────────────────────────────────────────
  // Returns a postHitCallback that fires an Endurance FEAT vs Rm Intensity
  // on hit; on FEAT failure (white result), target is KO'd 1-10 rounds via
  // applyUnconscious. Per RAW Advanced Set Ammunition: "If the bullet inflicts
  // damage to the target, the drug takes effect, knocking those affected out
  // for 1-10 rounds." Armor-gate: if the weapon's standard damage would not
  // have penetrated the target's armor, the drug has no effect either — the
  // bullet bounced off before it could deliver the drug.
  _mercyKnockoutCallback() {
    return async ({ targetActor, target, targetName, isHit, color, damageType, weapon, actor }) => {
      if (!isHit || !targetActor) return;
      if (color === "white") return;

      const { getAbilityInfo, getBodyArmorValues } = await import("./action-utils.js");
      const { rollUniversalTable } = await import("../dice/universal-table.js");
      const { applyUnconscious } = await import("../effects/effect-engine.js");

      // Armor gate: would a normal (non-mercy) shot have penetrated?
      // Borderline ("one more point") rule per GM RULINGS LOG: at exact
      // equality the target is affected, so >= not >.
      const stdDamage = Number(weapon?.system?.damage) || 0;
      const armorData = getBodyArmorValues(targetActor, damageType);
      const armorValue = Number(armorData?.applicable) || 0;
      const wouldPenetrate = armorValue <= 0 || stdDamage >= armorValue;

      if (!wouldPenetrate) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div style="background:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;padding:6px 8px;font-size:.9em;">
            <strong>Mercy Shot</strong> \u2014 ${targetName || targetActor.name}'s armor blocked the bullet. KO drug has no effect.
          </div>`
        });
        return;
      }

      const endInfo = getAbilityInfo(targetActor, "endurance");
      const endRank = endInfo?.rank || "Typical";

      // KO-drug intensity is per-weapon. Default Remarkable per the RAW Advanced
      // Set mercy-bullet rule; a weapon may override via system.mercyIntensity,
      // the unified system.intensityRank, or legacy system.stunIntensity — e.g.
      // an Excellent-Intensity tranquilizer. The Endurance FEAT is gated against
      // that intensity rather than treating any non-white roll as a resist.
      const koIntensity =
        weapon?.system?.mercyIntensity ||
        weapon?.system?.intensityRank ||
        weapon?.system?.stunIntensity ||
        "Remarkable";
      const { determineFeatRequirement, checkFeatSuccess } = await import("./ability-feat-dialog.js");
      const req = determineFeatRequirement(endRank, koIntensity);

      let resisted, featLine;
      if (req.automatic) {
        resisted = true;
        featLine = `Endurance (${endRank}) vs ${koIntensity} Intensity \u2014 3+ ranks above: AUTOMATIC resist, no roll`;
      } else if (req.impossible) {
        resisted = false;
        featLine = `Endurance (${endRank}) vs ${koIntensity} Intensity \u2014 2+ ranks below: IMPOSSIBLE FEAT, no roll`;
      } else {
        const { resolveResistFeat } = await import("../dice/dice-roller.js");
        const fr = await resolveResistFeat(targetActor, {
          sourceName: `Resist ${weapon?.name || "Mercy Shot"} KO drug`,
          rank: endRank,
          intensityRank: koIntensity,
          requirement: req.requirement,
          declareTimeoutMs: 10000
        });
        const featColorLower = String(
          (game.msh?.rollUniversalTable ?? rollUniversalTable)(endRank, Math.min(100, fr.cappedTotal)) || "white"
        ).toLowerCase();
        resisted = checkFeatSuccess(featColorLower, req.requirement);
        const rollPart = fr.karmaUsed > 0
          ? `rolled ${fr.rollTotal} + ${fr.karmaUsed} Karma = ${fr.cappedTotal}`
          : `rolled ${fr.rollTotal}`;
        featLine = `Endurance FEAT (${endRank}) vs ${koIntensity} Intensity \u2014 need ${req.requirement.toUpperCase()}: ${rollPart} \u2192 <b>${featColorLower.toUpperCase()}</b>`;
      }

      let line = "";
      if (resisted) {
        line = `<div style="color:#2e7d32;font-weight:bold;">${targetActor.name} resists the KO drug.</div>`;
      } else {
        const rounds = Math.max(1, Math.min(10, Math.floor(Math.random() * 10) + 1));
        try {
          await applyUnconscious(targetActor, { rounds, originUuid: actor?.uuid });
        } catch (e) {
          console.error("[FASERIP ERROR] Mercy KO applyUnconscious failed:", e);
        }
        line = `<div style="color:#d32f2f;font-weight:bold;">${targetActor.name} succumbs to the KO drug \u2014 unconscious ${rounds} round${rounds !== 1 ? "s" : ""}.</div>`;
      }

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div style="background:#f3e5f5;border:1px solid #8e24aa;border-radius:3px;padding:6px 8px;margin:4px 0;">
          <div style="font-weight:bold;color:#6a1b9a;margin-bottom:3px;">Mercy Shot \u2014 KO Drug</div>
          <div style="font-size:.85em;">${featLine}</div>
          ${line}
        </div>`
      });
    };
  }

  // ─────────────────────────────────────────────────────────────
  // T2 — Explosive Shot area effect (burst/scatter weapons only)
  // ─────────────────────────────────────────────────────────────
  // Returns a postHitCallback that places a 1-area template at the primary
  // target and applies 2× weapon damage to every other token in the area.
  // Primary target already took damage via the normal attack pipeline; this
  // handles the ripple. Skipped if the shot missed. Per RAW: "If the weapon
  // fires bursts or scatters, all in the area are affected when using
  // explosive shot."
  _explosiveAreaCallback({ damage, damageType }) {
    return async ({ targetActor, target, isHit, color, actor }) => {
      if (!isHit || color === "white" || !target) return;

      try {
        const template = await AreaTemplate.create({
          x: target.center?.x ?? 0,
          y: target.center?.y ?? 0,
          radiusInAreas: 1,
          label: "Explosive",
          fillColor: "#ff4400",
          fillAlpha: 0.25
        });
        if (!template) return;

        const inArea = await template.target();
        const splashTokens = inArea.filter(t => t?.actor && t.id !== target.id);

        if (splashTokens.length > 0) {
          const { applyDamageToTargets } = await import("./action-utils.js");
          await applyDamageToTargets({
            damage,
            attackerUuid: actor?.uuid,
            damageType,
            showNotification: false,
            bypassArmor: false,
            attackForm: "shooting",
            targets: splashTokens
          });
        }

        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div style="background:#fff3e0;border:1px solid #ef6c00;border-radius:3px;padding:6px 8px;margin:4px 0;">
            <div style="font-weight:bold;color:#e65100;margin-bottom:3px;">Explosive Shot — Area Effect</div>
            <div style="font-size:.85em;">${splashTokens.length} additional token${splashTokens.length !== 1 ? "s" : ""} in area took ${damage} damage.</div>
          </div>`
        });
      } catch (e) {
        console.error("[FASERIP ERROR] Explosive area callback failed:", e);
      }
    };
  }

  // ─────────────────────────────────────────────────────────────
  // T3 — Canister Shot area effect (5 sub-types)
  // ─────────────────────────────────────────────────────────────
  // gas       — In Intensity tear gas over 1 area. Affected tokens: Endurance
  //             FEAT or no actions (movement only) until leaving + 1 round.
  // knockout  — Rm Intensity KO gas. Endurance FEAT or KO 1-10 rounds.
  // smoke     — Ex Intensity smoke. -2CS on all FEATs in area.
  //             (Status applied; duration is GM-adjudicated per grenade pattern.)
  // explosive — 2× weapon damage to all in target area. (Adjacent-area 1×
  //             falloff TODO — grenade High Explosive doesn't implement it
  //             either; module-wide gap.)
  // incendiary — weapon damage as fire + ongoing burn damage per round for
  //             1-10 rounds via ongoing-engine register. Status: "burning".
  _canisterAreaCallback({ subType, baseDamage, damageType }) {
    return async ({ targetActor, target, isHit, color, actor }) => {
      if (!isHit || color === "white" || !target) return;

      const labels = {
        gas: "Tear Gas",
        knockout: "Knock-Out Gas",
        smoke: "Smoke",
        explosive: "Explosive",
        incendiary: "Incendiary"
      };
      const label = labels[subType] || subType;

      const fillColors = {
        gas:        "#9ccc65",
        knockout:   "#7e57c2",
        smoke:      "#757575",
        explosive:  "#ff4400",
        incendiary: "#ff6f00"
      };

      try {
        const template = await AreaTemplate.create({
          x: target.center?.x ?? 0,
          y: target.center?.y ?? 0,
          radiusInAreas: 1,
          label: `Canister: ${label}`,
          fillColor: fillColors[subType] || "#888888",
          fillAlpha: 0.3
        });
        if (!template) return;

        const inArea = await template.target();
        const affected = inArea.filter(t => t?.actor);

        const lines = [];

        if (subType === "explosive") {
          // 2× weapon damage to all in target area. TODO: 1× adjacent area falloff.
          const dmg = baseDamage * 2;
          if (affected.length > 0) {
            const { applyDamageToTargets } = await import("./action-utils.js");
            await applyDamageToTargets({
              damage: dmg,
              attackerUuid: actor?.uuid,
              damageType: damageType || "physical-edged",
              showNotification: false,
              bypassArmor: false,
              attackForm: "shooting",
              targets: affected
            });
          }
          lines.push(`${affected.length} target${affected.length !== 1 ? "s" : ""} take ${dmg} damage.`);
        } else if (subType === "incendiary") {
          // Damage on impact + ongoing burn for 1-10 rounds.
          const burnRounds = Math.max(1, Math.min(10, Math.floor(Math.random() * 10) + 1));
          const { applyDamageToTargets } = await import("./action-utils.js");
          if (affected.length > 0 && baseDamage > 0) {
            await applyDamageToTargets({
              damage: baseDamage,
              attackerUuid: actor?.uuid,
              damageType: "energy",
              showNotification: false,
              bypassArmor: false,
              attackForm: "shooting",
              targets: affected
            });
          }
          // Register ongoing burn on each affected actor.
          const ongoing = game.msh?.ongoing;
          if (ongoing?.register) {
            for (const tok of affected) {
              const a = tok.actor;
              if (!a) continue;
              try {
                await ongoing.register(a, `incendiaryBurn-${Date.now()}-${a.id}`, {
                  type: "damage",
                  stat: "health",
                  formula: baseDamage,
                  rate: 1,
                  cycle: "round",
                  count: burnRounds,
                  interruptOnDamage: false,
                  autoDisable: true
                }, {
                  name: "Burning",
                  img: "icons/svg/fire.svg",
                  disabled: false,
                  statuses: ["burning"],
                  duration: { value: burnRounds, units: "rounds", expiry: "roundEnd" }
                });
              } catch (e) {
                console.error("[FASERIP ERROR] Incendiary ongoing register failed:", e);
              }
            }
          }
          lines.push(`${affected.length} target${affected.length !== 1 ? "s" : ""} take ${baseDamage} fire damage + burning ${burnRounds} round${burnRounds !== 1 ? "s" : ""}.`);
        } else if (subType === "gas" || subType === "knockout") {
          // Gas-type: save FEAT vs Intensity per target, with the scaled
          // green/yellow/red requirement (was white-only fail), automatic/
          // impossible handling, and the karma routing (resolveResistFeat).
          // Targets resolve in PARALLEL so multiple owned heroes prompt their
          // players simultaneously instead of serially stacking 10s windows.
          const intensityRank = subType === "knockout" ? "Remarkable" : "Incredible";
          const gasLabel = subType === "knockout" ? "KO Gas" : "Tear Gas";
          const { getAbilityInfo } = await import("./action-utils.js");
          const { rollUniversalTable } = await import("../dice/universal-table.js");
          const { determineFeatRequirement, checkFeatSuccess } = await import("./ability-feat-dialog.js");
          const { resolveResistFeat } = await import("../dice/dice-roller.js");
          const { applyUnconscious, applyEffect } = await import("../effects/effect-engine.js");

          const rowPromises = affected.map(async (tok) => {
            const a = tok.actor;
            if (!a) return null;

            // Already affected? Skip the save AND the karma prompt — a
            // gassed target can't get "more gassed" (effects were stacking
            // -3CS/-2CS per additional canister), and an unconscious one
            // has no FEAT to make. Mirrors the region hazard's dedupe.
            if (subType === "knockout") {
              const alreadyKO = a.statuses?.has?.("unconscious")
                || a.effects.some(e => e.statuses?.has?.("unconscious"));
              if (alreadyKO) return `<li>${a.name}: already unconscious \u2014 no additional effect</li>`;
            } else {
              // Match is hardened: CTT renames managed effects with a
              // remaining-duration suffix ("Tear Gas (12s)"), so exact-name
              // matching misses; and top-level flag keys (flags.effectType)
              // may not survive v14's flag-scope validation. Check the
              // system-scoped flag, the legacy top-level flag, and a
              // name-prefix regex.
              const existingGas = a.effects.find(e =>
                e.flags?.["msh-faserip"]?.effectType === "tearGas"
                || e.flags?.effectType === "tearGas"
                || /^Tear Gas\b/.test(e.name || "")
              );
              if (existingGas) {
                try {
                  const { computeDuration } = await import("../effects/effect-engine.js");
                  await existingGas.update({ duration: computeDuration({ rounds: 2 }), disabled: false });
                } catch (e) { console.warn("[FASERIP] Tear Gas refresh failed:", e); }
                return `<li>${a.name}: still gassed \u2014 duration refreshed, no stacking</li>`;
              }
            }

            const endInfo = getAbilityInfo(a, "endurance");
            const endRank = endInfo?.rank || "Typical";
            const req = determineFeatRequirement(endRank, intensityRank);

            let resisted, detail;
            if (req.automatic) {
              resisted = true;
              detail = `automatic (End 3+ above)`;
            } else if (req.impossible) {
              resisted = false;
              detail = `impossible (Intensity 2+ above)`;
            } else {
              const fr = await resolveResistFeat(a, {
                sourceName: `Resist ${gasLabel}`,
                rank: endRank,
                intensityRank,
                requirement: req.requirement,
                declareTimeoutMs: 10000
              });
              const lc = String(
                (game.msh?.rollUniversalTable ?? rollUniversalTable)(endRank, Math.min(100, fr.cappedTotal)) || "white"
              ).toLowerCase();
              resisted = checkFeatSuccess(lc, req.requirement);
              detail = fr.karmaUsed > 0
                ? `${fr.rollTotal} + ${fr.karmaUsed}K = ${fr.cappedTotal} \u2192 ${lc.toUpperCase()}, need ${req.requirement}`
                : `${fr.rollTotal} \u2192 ${lc.toUpperCase()}, need ${req.requirement}`;
            }

            if (resisted) return `<li>${a.name}: resists (${detail})</li>`;

            if (subType === "knockout") {
              const rounds = Math.max(1, Math.min(10, Math.floor(Math.random() * 10) + 1));
              try {
                await applyUnconscious(a, { rounds, originUuid: actor?.uuid });
              } catch (e) { console.error("[FASERIP ERROR] Canister KO failed:", e); }
              return `<li>${a.name}: KO'd ${rounds} rnd (${detail})</li>`;
            }
            // Tear gas: apply -3CS-on-actions effect (approximation of
            // "no actions other than movement"). Foundry status = "blinded".
            try {
              await applyEffect(a, {
                name: "Tear Gas",
                img: "icons/svg/blind.svg",
                rounds: 2,
                originUuid: actor?.uuid,
                changes: [
                  { key: "system.combatMods.attackShift", mode: "add", value: "-3", priority: 20 },
                  { key: "system.combatMods.defenseShift", mode: "add", value: "-2", priority: 20 }
                ],
                flags: { "msh-faserip": { effectType: "tearGas" } },
                statuses: ["blinded"]
              });
            } catch (e) { console.error("[FASERIP ERROR] Canister gas failed:", e); }
            return `<li>${a.name}: incapacitated by tear gas (${detail})</li>`;
          });
          const resultRows = (await Promise.all(rowPromises)).filter(Boolean);
          lines.push(`Endurance FEATs vs ${intensityRank}:<ul style="margin:3px 0 0 18px;padding:0;font-size:.85em;">${resultRows.join("")}</ul>`);
        } else if (subType === "smoke") {
          // Smoke: -2CS on all FEATs for those in the area. Applied as a
          // persistent AE per token; GM dismisses when the smoke disperses.
          const { applyEffect } = await import("../effects/effect-engine.js");
          for (const tok of affected) {
            const a = tok.actor;
            if (!a) continue;
            try {
              await applyEffect(a, {
                name: "Smoke Cloud",
                img: "icons/svg/smoke.svg",
                rounds: 10,
                originUuid: actor?.uuid,
                changes: [
                  { key: "system.combatMods.attackShift", mode: "add", value: "-2", priority: 20 },
                  { key: "system.combatMods.defenseShift", mode: "add", value: "-2", priority: 20 }
                ],
                flags: { "msh-faserip": { effectType: "smoke" } }
              });
            } catch (e) { console.error("[FASERIP ERROR] Canister smoke failed:", e); }
          }
          lines.push(`${affected.length} target${affected.length !== 1 ? "s" : ""} in smoke — -2CS on all FEATs.`);
        }

        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div style="background:#eceff1;border:1px solid #546e7a;border-radius:3px;padding:6px 8px;margin:4px 0;">
            <div style="font-weight:bold;color:#263238;margin-bottom:3px;">Canister Shot \u2014 ${label}</div>
            <div style="font-size:.85em;">${lines.join("<br>")}</div>
          </div>`
        });
      } catch (e) {
        console.error("[FASERIP ERROR] Canister area callback failed:", e);
      }
    };
  }
}