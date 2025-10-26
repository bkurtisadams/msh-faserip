export async function playCombatSFX({ damageType, sourceName, isHit }) {
  try {
    // Map damageType/sourceName → sound keys, then AudioHelper.play({src, volume})
    // (keep logic minimal; if you want the old detection, move just that code from combat-handler)
  } catch (e) {
    // silent fail
  }
}
