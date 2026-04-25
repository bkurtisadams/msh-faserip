// systems/msh-faserip/scripts/modules/fx/fx-service.js
// Modular power FX service. Currently routes through Sequencer (if active) with
// a no-op fallback. A native v14 VFX provider can be added as a second branch
// once foundry.canvas VFX leaves "experimental" without changing call sites.

const SYS_ID = () => game.system?.id || "msh-faserip";

function isDebug() {
  try { return !!game.settings?.get?.(SYS_ID(), "debugMode"); }
  catch { return false; }
}

function dlog(...args) {
  if (!isDebug()) return;
  console.log("[FX]", ...args);
}

function isEnabled() {
  try { return game.settings.get(SYS_ID(), "fxEnabled") !== false; }
  catch { return true; }
}

function intensityScale() {
  let v;
  try { v = game.settings.get(SYS_ID(), "fxIntensity"); } catch { v = "normal"; }
  if (v === "subtle") return 0.7;
  if (v === "dramatic") return 1.3;
  return 1.0;
}

function hasSequencer() {
  return !!game.modules.get("sequencer")?.active && typeof Sequence !== "undefined";
}

// JB2A asset map. Conservative defaults — Sequencer no-ops silently if a key
// isn't present in the user's installed JB2A pack. Per-item overrides via
// system.vfx.preset / system.vfx.asset / system.vfx.color take precedence.
const BEAMS = {
  energy:    (c = "blue")    => `jb2a.energy_beam.normal.${c}.01`,
  force:     (c = "white")   => `jb2a.impact.010.${c}`,
  bullet:    ()              => `jb2a.bullet.01.orange`,
  edged:     ()              => `jb2a.melee_attack.05.slashing`,
  blunt:     ()              => `jb2a.unarmed_strike.physical.01.white`,
  lightning: (c = "blue")    => `jb2a.chain_lightning.primary.${c}.01`,
  fire:      (c = "orange")  => `jb2a.fire_bolt.${c}`,
  ice:       ()              => `jb2a.ice_spikes.radial.01`,
  laser:     (c = "red")     => `jb2a.laser_blast.${c}`,
  magic:     (c = "blue")    => `jb2a.magic_missile.${c}`,
  throw:     ()              => null,   // item must configure asset
  mental:    ()              => null    // impact-only at target
};

const IMPACTS = {
  energy:    (c = "blue")    => `jb2a.impact.010.${c}`,
  force:     (c = "white")   => `jb2a.impact.010.${c}`,
  bullet:    ()              => `jb2a.impact.010.orange`,
  edged:     ()              => `jb2a.impact.010.white`,
  blunt:     ()              => `jb2a.impact.010.white`,
  lightning: (c = "blue")    => `jb2a.impact.010.${c}`,
  fire:      ()              => `jb2a.impact.010.orange`,
  ice:       (c = "blue")    => `jb2a.impact.010.${c}`,
  laser:     (c = "red")     => `jb2a.impact.010.${c}`,
  magic:     (c = "blue")    => `jb2a.impact.010.${c}`,
  throw:     ()              => `jb2a.impact.010.white`,
  mental:    (c = "purple")  => `jb2a.markers.light_01.${c}`
};

function presetFromActionType(actionType, damageType) {
  const at = String(actionType ?? "").toLowerCase();
  const dt = String(damageType ?? "").toLowerCase();
  if (at === "energy"  || dt.includes("energy"))  return { preset: "energy",  color: "blue"  };
  if (at === "force"   || dt.includes("force"))   return { preset: "force",   color: "white" };
  if (at === "shooting"|| dt.includes("shooting"))return { preset: "bullet",  color: null    };
  if (at.startsWith("throwing"))                  return { preset: "throw",   color: null    };
  if (at === "edged"   || dt.includes("edged"))   return { preset: "edged",   color: null    };
  if (at === "blunt"   || dt.includes("blunt"))   return { preset: "blunt",   color: null    };
  if (dt.includes("mental"))                      return { preset: "mental",  color: "purple"};
  return null;
}

function resolvePreset({ item, actionType, damageType }) {
  // Item-level override
  const iv = item?.system?.vfx;
  if (iv?.enabled === false) return null;
  if (iv?.preset || iv?.asset) {
    return {
      preset: iv.preset || "custom",
      color:  iv.color || null,
      asset:  iv.asset || null,
      impact: iv.impact || null,
      scale:  Number(iv.scale ?? 1),
      duration: Number(iv.duration ?? 1000)
    };
  }
  // Per-mode override
  const modes = item?.system?.attackModes;
  if (Array.isArray(modes)) {
    const mode = modes.find(m =>
      String(m?.actionType ?? "").toLowerCase() === String(actionType ?? "").toLowerCase()
    );
    const mv = mode?.vfx;
    if (mv && mv.enabled !== false && (mv.preset || mv.asset)) {
      return {
        preset: mv.preset || "custom",
        color:  mv.color || null,
        asset:  mv.asset || null,
        impact: mv.impact || null,
        scale:  Number(mv.scale ?? 1),
        duration: Number(mv.duration ?? 1000)
      };
    }
  }
  // Default by action/damage type
  const def = presetFromActionType(actionType, damageType);
  if (!def) return null;
  return { ...def, asset: null, impact: null, scale: 1, duration: 1000 };
}

function resolveAsset(p) {
  if (p?.asset) return p.asset;
  const fn = BEAMS[p?.preset];
  return fn ? fn(p.color) : null;
}

function resolveImpact(p) {
  if (p?.impact) return p.impact;
  const fn = IMPACTS[p?.preset];
  return fn ? fn(p.color) : null;
}

function resolveSourceToken(actor, fallback) {
  if (fallback) return fallback;
  const tokens = actor?.getActiveTokens?.() ?? [];
  return tokens[0] ?? canvas.tokens?.controlled?.[0] ?? null;
}

function resolveTargets(provided) {
  if (Array.isArray(provided) && provided.length) return provided;
  return Array.from(game.user?.targets ?? []);
}

export const fxService = {
  async playAttack(opts = {}) {
    try {
      if (!isEnabled()) { dlog("skip: disabled"); return; }
      if (!hasSequencer()) { dlog("skip: no sequencer"); return; }

      const { actor, item, actionType, damageType, isHit } = opts;
      const sourceToken = resolveSourceToken(actor, opts.sourceToken);
      const targets = resolveTargets(opts.targets);
      if (!sourceToken || !targets.length) { dlog("skip: no source/targets"); return; }

      const p = resolvePreset({ item, actionType, damageType });
      if (!p) { dlog("skip: no preset", { actionType, damageType }); return; }

      const beam = resolveAsset(p);
      const impact = resolveImpact(p);
      if (!beam && !impact) { dlog("skip: no asset", p); return; }

      const scale = (p.scale ?? 1) * intensityScale();
      const duration = p.duration ?? 1000;

      const seq = new Sequence();
      if (beam) {
        for (const t of targets) {
          seq.effect()
            .file(beam)
            .atLocation(sourceToken)
            .stretchTo(t)
            .duration(duration)
            .scale(scale);
        }
      }
      if (isHit && impact) {
        for (const t of targets) {
          seq.effect()
            .file(impact)
            .atLocation(t)
            .scale(scale * 0.8);
        }
      }

      dlog("play", { preset: p.preset, beam, impact, isHit, n: targets.length });
      await seq.play();
    } catch (err) {
      console.warn("[FX] playAttack failed:", err);
    }
  },

  // Phase 4 stubs — call sites can be wired now, behavior added later.
  async playArea() { /* TODO Phase 4 */ },
  async playPersistent() { /* TODO Phase 3 */ },

  // Sheet-driven preview. Reads raw config (not an item) so unsaved form
  // values can be previewed. Uses controlled token as source, first target
  // if any, otherwise a fake point 4 grid cells east of the source.
  async preview(opts = {}) {
    try {
      if (!hasSequencer()) {
        ui.notifications?.warn("Sequencer module is not active.");
        return;
      }
      const sourceToken = canvas.tokens?.controlled?.[0];
      if (!sourceToken) {
        ui.notifications?.warn("Select a token on the canvas to preview the effect.");
        return;
      }
      const targets = Array.from(game.user?.targets ?? []);
      const grid = canvas.grid?.size ?? 100;
      const target = targets[0] || {
        x: (sourceToken.center?.x ?? sourceToken.x) + grid * 4,
        y: (sourceToken.center?.y ?? sourceToken.y)
      };

      const p = {
        preset:   opts.preset || "custom",
        color:    opts.color || null,
        asset:    opts.asset || null,
        impact:   opts.impact || null,
        scale:    Number(opts.scale ?? 1),
        duration: Number(opts.duration ?? 1000)
      };

      const beam = resolveAsset(p);
      const impact = resolveImpact(p);
      if (!beam && !impact) {
        ui.notifications?.warn("Pick a preset or asset path before previewing.");
        return;
      }

      const scale = (p.scale ?? 1) * intensityScale();
      const duration = p.duration ?? 1000;

      const seq = new Sequence();
      if (beam) {
        seq.effect()
          .file(beam)
          .atLocation(sourceToken)
          .stretchTo(target)
          .duration(duration)
          .scale(scale);
      }
      if (impact) {
        seq.effect()
          .file(impact)
          .atLocation(target)
          .scale(scale * 0.8);
      }
      dlog("preview", { preset: p.preset, beam, impact });
      await seq.play();
    } catch (err) {
      console.warn("[FX] preview failed:", err);
    }
  }
};

export default fxService;
