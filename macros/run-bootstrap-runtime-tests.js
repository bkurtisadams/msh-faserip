// Run as a Foundry Script Macro while logged in as a GM.
(async () => {
  const systemId = game.system?.id || "msh-faserip";
  const module = await import(`/systems/${systemId}/scripts/dev/runtime-regression-tests.js`);
  return module.runBootstrapRuntimeTests({
    keepArtifacts: false,
    postChat: true
  });
})();
