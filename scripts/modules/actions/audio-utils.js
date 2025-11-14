// systems/msh-faserip/scripts/modules/actions/audio-utils.js
// Modernized SFX utilities with verbose debug logging.

/* ---------------------------------- Core handles ---------------------------------- */

const FilePickerImpl = foundry?.applications?.apps?.FilePicker?.implementation ?? FilePicker;
const AudioHelperNS  = foundry?.audio?.AudioHelper ?? AudioHelper;

/* ---------------------------------- Utilities ---------------------------------- */

function SYS_ID() {
  return game.system?.id || "msh-faserip";
}

function BASE_PATH() {
  const base = game.settings?.get?.(SYS_ID(), "sfxBasePath");
  return base || `systems/${SYS_ID()}/assets/sfx`;
}

function isDebug() {
  try { return !!game.settings?.get?.(SYS_ID(), "debugMode"); }
  catch { return false; }
}

function dlog(...args) {
  if (!isDebug()) return;
  // prefix to make filtering super easy
  console.log("[SFX]", ...args);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* -------------------------- Existence cache & folder cache -------------------------- */

const _dirCache  = new Map();   // dir -> Set(fileNames)
const _fileCache = new Map();   // fullPath -> boolean

async function soundFileExists(fullPath) {
  if (_fileCache.has(fullPath)) {
    dlog("exists: cache-hit", { path: fullPath, ok: _fileCache.get(fullPath) });
    return _fileCache.get(fullPath);
  }

  // Non-GM users can't browse directories in Foundry v13
  // Skip file checking for players - just assume files exist
  if (!game.user?.isGM) {
    dlog("exists: skipping check (non-GM user)");
    _fileCache.set(fullPath, true);
    return true;
  }

  const lastSlash = fullPath.lastIndexOf("/");
  const dir  = fullPath.slice(0, lastSlash);
  const file = fullPath.slice(lastSlash + 1);

  try {
    let files = _dirCache.get(dir);
    if (!files) {
      dlog("exists: browsing dir", { dir });
      const res = await FilePickerImpl.browse("data", dir);
      files = new Set((res.files || []).map(f => f.split("/").pop()));
      _dirCache.set(dir, files);
      dlog("exists: dir cached", { dir, count: files.size });
    }
    const ok = files.has(file);
    _fileCache.set(fullPath, ok);
    dlog("exists: resolved", { path: fullPath, ok });
    return ok;
  } catch (e) {
    _fileCache.set(fullPath, false);
    dlog("exists: error", { path: fullPath, error: String(e) });
    return false;
  }
}

async function pickFirstExisting(files) {
  const candidates = shuffle([...files]);
  dlog("pick: candidates", { base: BASE_PATH(), n: candidates.length, list: candidates });
  for (const f of candidates) {
    const full = `${BASE_PATH()}/${f}`;
    if (await soundFileExists(full)) {
      dlog("pick: chosen", { full });
      return full;
    }
  }
  dlog("pick: none-found");
  return null;
}

/* ------------------------- Item-configured SFX (per-mode aware) ------------------------- */

function normalizeSfxShape(sfx) {
  // Accept string or object; normalize to {hit, miss, critical, base}
  if (!sfx) return {};
  if (typeof sfx === "string") return { hit: sfx };
  if (typeof sfx === "object") return sfx;
  return {};
}

function getArrayish(val) {
  // Turn common shapes (array, object map, nullish, bogus) into an array safely
  if (Array.isArray(val)) return val;
  if (val && typeof val === "object") return Object.values(val);
  return [];
}

function pickFromItemSfx(item, { actionType, isHit, rollResult }) {
  if (!item || typeof item !== "object") return null;

  const sfx = normalizeSfxShape(item.system?.sfx);
  const modes = getArrayish(item.system?.attackModes);
  const crit = String(rollResult || "").toLowerCase() === "red";

  // Per-mode override if the matching mode has its own sfx block
  const mode = modes.find(m => (m?.actionType || "").toLowerCase() === String(actionType || "").toLowerCase());
  const modeSfx = normalizeSfxShape(mode?.sfx);

  // Priority: mode.critical → item.critical → mode.hit/miss → item.hit/miss
  if (crit && (modeSfx.critical || sfx.critical)) return modeSfx.critical || sfx.critical;
  if (isHit && (modeSfx.hit || sfx.hit))         return modeSfx.hit || sfx.hit;
  if (!isHit && (modeSfx.miss || sfx.miss))      return modeSfx.miss || sfx.miss;

  // Single-base style fallback
  if (sfx.base) {
    if (crit)   return sfx.base.replace(/\.(wav|ogg|mp3)$/i, "-critical.$1");
    if (isHit)  return sfx.base;
    return sfx.base.replace(/\.(wav|ogg|mp3)$/i, "-miss.$1");
  }
  return null;
}

/* ---------------------------------- Classifier ---------------------------------- */

// Accept actionType so we can detect e.g. "edged-attack" / "blunt-attack"
export function classifyWeapon({ item, sourceName, damageType, actionType }) {
  const typeStr = String(item?.system?.damageType ?? damageType ?? "").toLowerCase();
  const actStr  = String(actionType ?? "").toLowerCase();
  const name    = String(item?.name ?? sourceName ?? "").toLowerCase();
  const notes   = String(item?.system?.notes ?? "").toLowerCase();
  const burstScatter = String(item?.system?.burstScatter ?? "none").toLowerCase();

  // Psychic first
  if (typeStr.includes("mental") || /psychic|telepathy|psionic/.test(name + " " + notes)) {
    return { cat: "psychic", bursty: false, detail: {} };
  }

  // --- New: explicit edged & blunt detection ---
  if (typeStr.includes("edged") || actStr.includes("edged") ||
      /\b(sword|sabre|saber|rapier|katana|knife|dagger|dirk|axe|ax|hatchet|machete|spear|halberd|glaive|scythe|bayonet)\b/.test(name)) {
    return { cat: "edged", bursty: false, detail: {} };
  }
  if (typeStr.includes("blunt") || actStr.includes("blunt") ||
      /\b(club|mace|hammer|maul|staff|baton|bat|cudgel|flail|morningstar)\b/.test(name)) {
    return { cat: "blunt", bursty: false, detail: {} };
  }

  // Firearms & bows
  const isSMG     = /\b(sub-?machine|smg|thompson|tommy|uzi|mp[-\s]?5|mp[-\s]?40|mac[-\s]?1?0|mac[-\s]?11|machine\s?pistol)\b/i.test(name);
  const isMG      = /\b(machine\s?gun|lmg|hmg|m60|m249|m134|minigun)\b/i.test(name);
  const isShotgun = /shotgun|riot\s*gun/.test(name) || /scatter/.test(notes);
  const isRifle   = (/\brifle\b|carbine|sniper/.test(name)) && !/laser/.test(name);
  const isPistol  = /\bpistol\b|handgun|revolver|sidearm/.test(name);
  const isBow     = /\b(bow|crossbow)\b/.test(name);
  const hasBursts = burstScatter !== "none" || /burst/.test(notes) || isSMG || isMG;

  const isEnergy = /energy|laser|plasma/.test(typeStr);
  const isForce  = /force|concussion/.test(typeStr);

  if (isEnergy)   return { cat: "energy",     bursty: false, detail: { hasBursts } };
  if (isForce)    return { cat: "force",      bursty: false, detail: { hasBursts } };
  if (isBow)      return { cat: "bow",        bursty: false, detail: { hasBursts } };
  if (isMG)       return { cat: "mg",         bursty: true,  detail: { hasBursts } };
  if (isSMG)      return { cat: "smg",        bursty: true,  detail: { hasBursts } };
  if (isShotgun)  return { cat: "shotgun",    bursty: true,  detail: { hasBursts } };
  if (isRifle)    return { cat: hasBursts ? "auto-rifle" : "rifle", bursty: hasBursts, detail: { hasBursts } };
  if (isPistol)   return { cat: "pistol",     bursty: false, detail: { hasBursts } };

  if (String(damageType || "").toLowerCase().includes("shooting")) {
    return { cat: hasBursts ? "burst-gun" : "pistol", bursty: hasBursts, detail: { hasBursts } };
  }

  // Final fallback
  return { cat: "blunt", bursty: false, detail: { hasBursts } };
}


/* ---------------------------------- Public API ---------------------------------- */

export async function playCombatSFX(...args) {
  try {
    // Normalize call signatures
    let opts = {};
    if (typeof args[0] === "string") {
      const [damageType, sourceName, rollResult, options = {}] = args;
      opts = { damageType, sourceName, rollResult, ...options };
      dlog("input: legacy", { damageType, sourceName, rollResult, options });
    } else {
      opts = args[0] || {};
      dlog("input: object", { ...opts, item: opts.item ? `[Item:${opts.item?.name}]` : null });
    }

    // Settings
    const enabled = game.settings?.get?.(SYS_ID(), "sfxEnabled");
    if (enabled === false) { dlog("skip: sfx disabled"); return; }

    let volume = Number(
      opts.volume ?? game.settings?.get?.(SYS_ID(), "sfxVolume") ?? 0.8
    );
    if (!Number.isFinite(volume)) volume = 0.8;
    volume = Math.max(0, Math.min(volume, 1));

    // Rate limit
    const now = Date.now();
    const key = "msh-last-sfx-at";
    game.msh ??= {};
    if (game.msh[key] && (now - game.msh[key]) < 35) { dlog("skip: rate-limit"); return; }
    game.msh[key] = now;

    const lowerDamageType = String(opts.damageType ?? opts.kind ?? "").toLowerCase();
    const lowerSourceName = String(opts.sourceName ?? opts.item?.name ?? "").toLowerCase();
    const rollResult      = String(opts.rollResult ?? "").toLowerCase();
    const isHit           = opts.isHit ?? (rollResult !== "white");
    const isMiss          = opts.isMiss ?? (rollResult === "white");
    const actionType      = opts.actionType ?? null;

    dlog("normalized", {
      basePath: BASE_PATH(),
      damageType: lowerDamageType,
      name: lowerSourceName,
      rollResult,
      isHit,
      actionType,
      volume
    });

    // 1) Item-configured SFX
    const forcePsychic = lowerDamageType === "mental";
    if (!forcePsychic) {
      const itemChosen = pickFromItemSfx(opts.item ?? null, { actionType, isHit, rollResult });
      if (itemChosen) {
        dlog("play: item-sfx", { src: itemChosen });
        await AudioHelperNS.play({ src: itemChosen, volume, autoplay: true, loop: false }, true);
        return;
      }
    } else {
      dlog("force: psychic via damageType");
    }

    // 2) Classify & table
    const { cat, bursty, detail } = classifyWeapon({
      item: opts.item ?? null,
      sourceName: lowerSourceName,
      damageType: lowerDamageType,
      actionType: actionType            // <— ensure this is forwarded
    });

    dlog("classify", { cat, bursty, detail });

    const HIT = {
      "psychic":    ["psychic.mp3", "telepathy.wav", "mind-blast.wav"],
      "mg":         ["mg-burst.ogg", "machine-gun.wav", "submachine-gun.wav", "gunshot.wav"],
      "smg":        ["submachine-gun.wav", "machine-gun.wav", "gunshot.wav"],
      "auto-rifle": ["assault-rifle.mp3", "rifle.wav"],
      "burst-gun":  ["machine-pistol.mp3", "submachine-gun.wav", "gunshot.wav"],
      "rifle":      ["rifle.wav"],
      "shotgun":    ["shotgun.wav"],
      "pistol":     ["gunshot.mp3"],
      "bow":        ["bow-string.wav", "gunshot.wav"],
      "energy":     ["lightning-bolt.mp3", "fire-blast.wav"],
      "force":      ["concussion.wav", "thump.ogg", "near-miss-swing-whoosh-5.wav"],
      "blunt":      ["punch.wav"],
      "edged":      ["sword-slice.mp3"]
    };

    const MISS = {
      "psychic":   ["whoosh-end.mp3"],
      "mg":         ["mg-ricochets.mp3"],
      "smg":        ["mg-ricochets.mp3"],
      "auto-rifle": ["mg-ricochets.mp3"],
      "burst-gun":  ["mg-ricochets.mp3"],
      "rifle":      ["ricochet-shot.mp3"],
      "shotgun":    ["shotgun-miss.wav", "near-miss-swing-whoosh-5.wav"],
      "pistol":     ["ricochet-shot.mp3"],
      "bow":        ["near-miss-swing-whoosh-5.wav"],
      "energy":     ["whoosh-cinematic.mp3"],
      "force":      ["whoosh-cinematic.mp3"],
      "blunt":      ["whoosh-simple.mp3"],
      "edged":      ["whoosh-simple.mp3"]
    };

    let soundPath = null;
    if (cat) {
      soundPath = isHit
        ? (await pickFirstExisting(HIT[cat] || []))  || `${BASE_PATH()}/gunshot.wav`
        : (await pickFirstExisting(MISS[cat] || [])) || `${BASE_PATH()}/near-miss-swing-whoosh-5.wav`;
      dlog("pick: by-cat", { cat, isHit, soundPath });
    }

    // 3) Damage-type fallback
    if (!soundPath) {
      if (lowerDamageType.includes("edged")) {
        soundPath = isHit ? `${BASE_PATH()}/blade.wav` : `${BASE_PATH()}/blade-miss.wav`;
      } else if (lowerDamageType.includes("blunt")) {
        soundPath = isHit ? `${BASE_PATH()}/punch.wav` : `${BASE_PATH()}/punch-miss.wav`;
      } else if (lowerDamageType.includes("energy")) {
        soundPath = isHit ? `${BASE_PATH()}/fire-blast.wav` : `${BASE_PATH()}/fire-blast-miss.wav`;
      } else if (lowerDamageType.includes("force")) {
        soundPath = `${BASE_PATH()}/near-miss-swing-whoosh-5.wav`;
      } else if (lowerDamageType.includes("mental")) {
        soundPath = isHit ? `${BASE_PATH()}/psychic.wav` : `${BASE_PATH()}/psychic-whoosh.wav`;
      } else {
        soundPath = isHit ? `${BASE_PATH()}/gunshot.wav` : `${BASE_PATH()}/gunshot-miss.wav`;
      }
      dlog("fallback: by-damageType", { lowerDamageType, isHit, soundPath });
    }

    // 4) Critical variant
    if (isHit && rollResult === "red" && soundPath) {
      const criticalPath = soundPath.replace(/\.(wav|ogg|mp3)$/i, "-critical.$1");
      if (await soundFileExists(criticalPath)) {
        dlog("critical: variant-found", { criticalPath });
        soundPath = criticalPath;
        volume = Math.min(volume * 1.2, 1.0);
      } else {
        dlog("critical: no-variant");
      }
    }

    // 5) Special ammo override
    if (opts.ammoType === "explosive" && isHit) {
      const exp = `systems/${SYS_ID()}/sounds/explosion.wav`;
      if (await soundFileExists(exp)) {
        dlog("ammo: explosive override", { exp });
        soundPath = exp;
        volume = 1.0;
      } else {
        dlog("ammo: explosive override missing", { exp });
      }
    }

    // 6) Play
    if (soundPath) {
      dlog("play", { soundPath, volume });
      await AudioHelperNS.play({ src: soundPath, volume, autoplay: true, loop: false }, true);
    } else {
      dlog("skip: no soundPath resolved");
    }
  } catch (e) {
    dlog("error: playCombatSFX crashed", { error: String(e) });
    // swallow errors to avoid impacting action flow
  }
}
