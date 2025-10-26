// systems/msh-faserip/scripts/modules/actions/audio-utils.js

// Optional existence check. We keep it simple and tolerant.
async function soundFileExists(path) {
  try {
    const dir = path.slice(0, path.lastIndexOf("/"));
    const file = path.slice(path.lastIndexOf("/") + 1);
    const res = await FilePicker.browse("data", dir);
    return Array.isArray(res.files) && res.files.some(f => f.endsWith(`/${file}`) || f === path);
  } catch (_e) { return false; }
}

function basePath() {
  const SYS = game.system?.id || "msh-faserip";
  const base = game.settings?.get?.(SYS, "sfxBasePath");
  return base || `systems/${SYS}/assets/sfx`;
}

function pickFromItemSfx(item, { actionType, isHit, rollResult }) {
  if (!item) return null;
  const sfx = item.system?.sfx || {};
  const crit = String(rollResult || "").toLowerCase() === "red";

  // Per-mode override (if present on the matching attack mode)
  const mode = (item.system?.attackModes || []).find(m => m?.actionType === actionType);
  const modeSfx = mode?.sfx || {};

  // Priority: mode.critical → item.critical → mode.hit/miss → item.hit/miss
  if (crit && (modeSfx.critical || sfx.critical)) return modeSfx.critical || sfx.critical;
  if (isHit && (modeSfx.hit || sfx.hit))         return modeSfx.hit || sfx.hit;
  if (!isHit && (modeSfx.miss || sfx.miss))      return modeSfx.miss || sfx.miss;

  // Single-base style (if you eventually store sfx.base)
  if (sfx.base) {
    if (crit)   return sfx.base.replace(/\.(wav|ogg|mp3)$/i, "-critical.$1");
    if (isHit)  return sfx.base;
    return sfx.base.replace(/\.(wav|ogg|mp3)$/i, "-miss.$1");
  }
  return null;
}

/**
 * Back-compat signature:
 *   playCombatSFX(damageType, sourceName, rollResult, options?)
 * New signature (object):
 *   playCombatSFX({ item, kind, rof, volume, damageType, sourceName, rollResult, isHit, isMiss, ammoType })
 */
export async function playCombatSFX(...args) {
  // ---- Helpers (scoped to this function) -----------------------------------
  function sysId() {
    return game.system?.id || "msh-faserip";
  }
  function basePath() {
    const base = game.settings?.get?.(sysId(), "sfxBasePath");
    return base || `systems/${sysId()}/assets/sfx`;
  }
  async function soundFileExists(path) {
    try {
      const dir  = path.slice(0, path.lastIndexOf("/"));
      const file = path.slice(path.lastIndexOf("/") + 1);
      const res  = await FilePicker.browse("data", dir);
      return Array.isArray(res.files) && res.files.some(f => f.endsWith(`/${file}`) || f === path);
    } catch {
      return false;
    }
  }
  function dlog(...m) {
    try {
      if (game.settings?.get?.(sysId(), "debugMode")) console.log("SFX|", ...m);
    } catch {}
  }
  function pickFromItemSfx(item, { actionType, isHit, rollResult }) {
    if (!item) return null;
    const sfx = item.system?.sfx || {};
    // Per-mode override (if attackModes[].sfx is present)
    const mode = (item.system?.attackModes || []).find(m => m?.actionType === actionType);
    const modeSfx = mode?.sfx || {};
    const crit = String(rollResult || "").toLowerCase() === "red";

    // Priority: mode.critical → item.critical → mode.hit/miss → item.hit/miss
    if (crit && (modeSfx.critical || sfx.critical)) return modeSfx.critical || sfx.critical;
    if (isHit && (modeSfx.hit || sfx.hit))         return modeSfx.hit || sfx.hit;
    if (!isHit && (modeSfx.miss || sfx.miss))      return modeSfx.miss || sfx.miss;

    // Single-base style (if ever used)
    if (sfx.base) {
      if (crit)   return sfx.base.replace(/\.(wav|ogg|mp3)$/i, "-critical.$1");
      if (isHit)  return sfx.base;
      return sfx.base.replace(/\.(wav|ogg|mp3)$/i, "-miss.$1");
    }
    return null;
  }
  async function pickFirstExisting(files) {
    for (const f of files) {
      const full = `${basePath()}/${f}`;
      if (await soundFileExists(full)) return full;
    }
    return null;
  }
  function classifyWeapon({ item, sourceName, damageType }) {
    const name = String(item?.name ?? sourceName ?? "").toLowerCase();
    const notes = String(item?.system?.notes ?? "").toLowerCase();
    const typeStr = String(item?.system?.damageType ?? damageType ?? "").toLowerCase();
    const burstScatter = String(item?.system?.burstScatter ?? "none").toLowerCase();

    const isSMG     = /\b(sub-?machine|smg|thompson|tommy|uzi|mp[-\s]?5|mp[-\s]?40|mac[-\s]?1?0|mac[-\s]?11|machine\s?pistol)\b/i.test(name);
    const isMG      = /\b(machine\s?gun|lmg|hmg|m60|m249|m134|minigun)\b/i.test(name);
    const isShotgun = /shotgun|riot\s*gun/.test(name) || /scatter/.test(notes);
    const isRifle   = /\brifle\b|carbine|sniper/.test(name) && !/laser/.test(name);
    const isPistol  = /\bpistol\b|handgun|revolver|sidearm/.test(name);
    const isBow     = /\b(bow|crossbow)\b/.test(name);

    const hasBursts = burstScatter !== "none" || /burst/.test(notes) || isSMG || isMG;

    // Column type hints (E/F/S) from rules
    const isEnergy = /energy|laser|plasma/.test(typeStr);
    const isForce  = /force|concussion/.test(typeStr);

    // Category keys for mapping table below
    if (isEnergy) return { cat: "energy", bursty: false, detail: { isSMG, isMG, isShotgun, isRifle, isPistol, isBow, hasBursts } };
    if (isForce)  return { cat: "force",  bursty: false, detail: { isSMG, isMG, isShotgun, isRifle, isPistol, isBow, hasBursts } };
    if (isBow)    return { cat: "bow",    bursty: false, detail: { isSMG, isMG, isShotgun, isRifle, isPistol, isBow, hasBursts } };

    if (isMG)      return { cat: "mg",          bursty: true,  detail: { isSMG, isMG, isShotgun, isRifle, isPistol, isBow, hasBursts } };
    if (isSMG)     return { cat: "smg",         bursty: true,  detail: { isSMG, isMG, isShotgun, isRifle, isPistol, isBow, hasBursts } };
    if (isShotgun) return { cat: "shotgun",     bursty: true,  detail: { isSMG, isMG, isShotgun, isRifle, isPistol, isBow, hasBursts } };
    if (isRifle)   return { cat: hasBursts ? "auto-rifle" : "rifle", bursty: hasBursts, detail: { isSMG, isMG, isShotgun, isRifle, isPistol, isBow, hasBursts } };
    if (isPistol)  return { cat: "pistol",      bursty: false, detail: { isSMG, isMG, isShotgun, isRifle, isPistol, isBow, hasBursts } };

    // Generic shooting fallback
    if (String(damageType || "").toLowerCase().includes("shooting"))
      return { cat: hasBursts ? "burst-gun" : "pistol", bursty: hasBursts, detail: { isSMG, isMG, isShotgun, isRifle, isPistol, isBow, hasBursts } };

    // Default to blunt-ish if unknown
    return { cat: "blunt", bursty: false, detail: { isSMG, isMG, isShotgun, isRifle, isPistol, isBow, hasBursts } };
  }

  // ---- Main body ------------------------------------------------------------
  try {
    // Normalize call signatures
    let opts = {};
    if (typeof args[0] === "string") {
      // Legacy: (damageType, sourceName, rollResult, options)
      const [damageType, sourceName, rollResult, options = {}] = args;
      opts = { damageType, sourceName, rollResult, ...options };
    } else {
      // New: single options object
      opts = args[0] || {};
    }

    const SYS = sysId();
    const lowerDamageType = String(opts.damageType ?? opts.kind ?? "").toLowerCase();
    const lowerSourceName = String(opts.sourceName ?? opts.item?.name ?? "").toLowerCase();
    const rollResult      = String(opts.rollResult ?? "").toLowerCase();
    const isHit           = opts.isHit ?? (rollResult !== "white");
    const isMiss          = opts.isMiss ?? (rollResult === "white");
    const actionType      = opts.actionType ?? null;

    let volume    = Number(opts.volume ?? 0.8) || 0.8;
    let soundPath = null;

    // 1) If the item specifies SFX explicitly, use that first
    const itemChosen = pickFromItemSfx(opts.item ?? null, { actionType, isHit, rollResult });
    if (itemChosen) {
      dlog("item SFX", { src: itemChosen, isHit, rollResult, name: lowerSourceName });
      await AudioHelper.play({ src: itemChosen, volume, autoplay: true, loop: false }, true);
      return;
    }

    // 2) Heuristic mapping (rules-aware, no ROF dependence)
    const { cat, bursty, detail } = classifyWeapon({
      item: opts.item ?? null,
      sourceName: lowerSourceName,
      damageType: lowerDamageType
    });

    dlog("classify", { cat, bursty, detail, damageType: lowerDamageType, name: lowerSourceName, rollResult });

    // Candidate filenames by category
    const HIT = {
      "mg":         ["mg-burst.ogg", "machine-gun.wav", "submachine-gun.wav", "gunshot.wav"],
      "smg":        ["submachine-gun.wav", "machine-gun.wav", "gunshot.wav"],
      "auto-rifle": ["assault-rifle-burst.wav", "machine-gun.wav", "submachine-gun.wav", "rifle.wav"],
      "burst-gun":  ["machine-gun.wav", "submachine-gun.wav", "gunshot.wav"],
      "rifle":      ["rifle.wav"],
      "shotgun":    ["shotgun.wav"],
      "pistol":     ["gunshot.wav"],
      "bow":        ["bow-string.wav", "gunshot.wav"],
      "energy":     ["fire-blast.wav", "lightning_bolt.wav"],
      "force":      ["concussion.wav", "thump.ogg", "near-miss-swing-whoosh-5.wav"],
      "blunt":      ["punch.wav"],
      "edged":      ["blade.wav"]
    };
    const MISS = {
      "mg":         ["mg-burst-miss.ogg", "machine-gun-miss.wav", "submachine-gun-miss.wav", "gunshot-miss.wav", "near-miss-swing-whoosh-5.wav"],
      "smg":        ["submachine-gun-miss.wav", "machine-gun-miss.wav", "gunshot-miss.wav", "near-miss-swing-whoosh-5.wav"],
      "auto-rifle": ["submachine-gun-miss.wav", "machine-gun-miss.wav", "rifle-miss.wav", "near-miss-swing-whoosh-5.wav"],
      "burst-gun":  ["submachine-gun-miss.wav", "machine-gun-miss.wav", "gunshot-miss.wav", "near-miss-swing-whoosh-5.wav"],
      "rifle":      ["rifle-miss.wav", "near-miss-swing-whoosh-5.wav"],
      "shotgun":    ["shotgun-miss.wav", "near-miss-swing-whoosh-5.wav"],
      "pistol":     ["gunshot-miss.wav", "near-miss-swing-whoosh-5.wav"],
      "bow":        ["near-miss-swing-whoosh-5.wav"],
      "energy":     ["fire-blast-miss.wav", "near-miss-swing-whoosh-5.wav"],
      "force":      ["near-miss-swing-whoosh-5.wav"],
      "blunt":      ["punch-miss.wav", "near-miss-swing-whoosh-5.wav"],
      "edged":      ["blade-miss.wav", "near-miss-swing-whoosh-5.wav"]
    };

    if (cat) {
      soundPath = isHit
        ? (await pickFirstExisting(HIT[cat] || []))  || `${basePath()}/gunshot.wav`
        : (await pickFirstExisting(MISS[cat] || [])) || `${basePath()}/near-miss-swing-whoosh-5.wav`;
    }

    // 3) Damage-type fallback if still nothing chosen
    if (!soundPath) {
      if (lowerDamageType.includes("edged")) {
        soundPath = isHit ? `${basePath()}/blade.wav` : `${basePath()}/blade-miss.wav`;
      } else if (lowerDamageType.includes("blunt")) {
        soundPath = isHit ? `${basePath()}/punch.wav` : `${basePath()}/punch-miss.wav`;
      } else if (lowerDamageType.includes("energy")) {
        soundPath = isHit ? `${basePath()}/fire-blast.wav` : `${basePath()}/fire-blast-miss.wav`;
      } else if (lowerDamageType.includes("force")) {
        soundPath = `${basePath()}/near-miss-swing-whoosh-5.wav`;
      } else {
        soundPath = isHit ? `${basePath()}/gunshot.wav` : `${basePath()}/gunshot-miss.wav`;
      }
    }

    // 4) Critical (red) variant for hits: try -critical.*
    if (isHit && rollResult === "red" && soundPath) {
      const criticalPath = soundPath.replace(".wav", "-critical.wav").replace(".ogg", "-critical.ogg").replace(".mp3", "-critical.mp3");
      if (await soundFileExists(criticalPath)) {
        soundPath = criticalPath;
        volume = Math.min(volume * 1.2, 1.0);
      }
    }

    // 5) Special ammo override (hits only)
    if (opts.ammoType === "explosive" && isHit) {
      soundPath = `systems/${SYS}/sounds/explosion.wav`;
      volume = 1.0;
    }

    // 6) Play
    if (soundPath) {
      dlog("play", { soundPath, volume });
      await AudioHelper.play({ src: soundPath, volume, autoplay: true, loop: false }, true);
    }
  } catch {
    // no-op
  }
}

