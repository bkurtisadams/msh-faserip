// scripts/modules/actions/flags.js
// Central place for the system's flag scope.

// Lazy getter so it works before/after Foundry's init phase.
export function getFlagScope() {
  return (
    (globalThis && (globalThis.MSH_FLAG_SCOPE || globalThis.FASERIP_FLAG_SCOPE)) ||
    (game?.system?.id) ||
    "msh-faserip"
  );
}
