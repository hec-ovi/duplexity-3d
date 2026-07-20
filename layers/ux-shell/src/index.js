// ux-shell - app chrome that frames and launches the runtime. No game logic, no scene graph, no
// LLM. Every collaborator (runtime, persistence, author flow) is injected and called only through
// its contract, so this src imports no other layer.

export function createShell(deps = {}) {
  const { runtime, persistence, author } = deps;

  return {
    listAdventures() {
      return persistence.list();
    },

    openAdventure(id, instanceId) {
      const adventure = persistence.load(id);
      runtime.load(adventure, instanceId);
      return adventure;
    },

    newAdventure(brief) {
      // the author flow (POST /adventure) is injected; the shell never plans anything itself
      return author(brief);
    },
  };
}
