// ux-shell - app chrome that frames and launches the runtime. No game logic, no scene graph, no
// LLM. Every collaborator (runtime, persistence, author flow) is injected and called only through
// its contract, so this src imports no other layer.
//
// Two faces of the same thing: a headless controller (listAdventures / openAdventure / newAdventure /
// exportAdventure / importAdventure) that a host can drive directly, and `mount`, a plain vanilla-DOM
// shell (menu + adventure browser + new/import/export screens) that renders and tests in jsdom without
// a browser. The runtime owns its own canvas; the shell only calls runtime.load and reveals the stage.

export function createShell(deps = {}) {
  const { runtime, persistence, author } = deps;

  const controller = {
    listAdventures() {
      return persistence.list();
    },

    openAdventure(id, instanceId) {
      const adventure = persistence.load(id);
      // default to the progression's start instance so a one-click "Play" always lands somewhere real
      const target = instanceId ?? adventure.progression?.start;
      runtime.load(adventure, target);
      return adventure;
    },

    newAdventure(brief) {
      // the author flow (POST /adventure) is injected and persists server-side; the shell never plans
      return author(brief);
    },

    exportAdventure(id) {
      return persistence.exportFile(id);
    },

    importAdventure(text) {
      return persistence.importFile(text);
    },
  };

  function mount(container, opts = {}) {
    const onDownload = opts.onDownload ?? defaultDownload;
    const defaultBrief = opts.defaultBrief ?? null;

    container.innerHTML = `
      <div class="shell">
        <h1>duplexity-3d</h1>
        <div class="browser">
          <button type="button" data-act="new">New adventure</button>
          <label>Import adventure
            <input type="file" accept="application/json" aria-label="Import adventure file" />
          </label>
          <p class="error" role="alert"></p>
          <ul aria-label="Adventures"></ul>
        </div>
        <div class="stage" aria-label="Play" hidden></div>
      </div>`;

    const listEl = container.querySelector("ul[aria-label='Adventures']");
    const stageEl = container.querySelector(".stage");
    const fileInput = container.querySelector("input[type='file']");
    const errorEl = container.querySelector(".error");
    const setError = (msg) => {
      errorEl.textContent = msg;
    };

    function renderList() {
      listEl.replaceChildren();
      for (const a of controller.listAdventures()) {
        const label = a.title ?? a.id;
        const li = document.createElement("li");

        const title = document.createElement("span");
        title.className = "title";
        title.textContent = label;

        const play = document.createElement("button");
        play.type = "button";
        play.textContent = `Play ${label}`;
        play.addEventListener("click", () => {
          controller.openAdventure(a.id);
          stageEl.hidden = false;
        });

        const exportBtn = document.createElement("button");
        exportBtn.type = "button";
        exportBtn.textContent = `Export ${label}`;
        exportBtn.addEventListener("click", () => onDownload(`${a.id}.json`, controller.exportAdventure(a.id)));

        li.append(title, play, exportBtn);
        listEl.append(li);
      }
    }

    container.querySelector("button[data-act='new']").addEventListener("click", () => {
      controller.newAdventure(defaultBrief);
      setError("");
      renderList();
    });

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        controller.importAdventure(await file.text());
        setError("");
        renderList();
      } catch (e) {
        // a rejected upload is client-actionable (BAD_BUNDLE / MIGRATION_FAILED / SCHEMA_INVALID):
        // tell the user instead of swallowing the throw as an unhandled rejection
        setError(`Import failed: ${e?.message ?? e?.code ?? "invalid file"}`);
      } finally {
        fileInput.value = ""; // let the same file be re-selected (a retry) after a failure
      }
    });

    renderList();
    return { refresh: renderList, el: container.querySelector(".shell") };
  }

  return { ...controller, mount };
}

// Browser-only default for the Export button: hand the serialized bundle to the user as a download.
// No-op-safe where the DOM download APIs are absent (e.g. a headless host that injects its own sink).
function defaultDownload(filename, text) {
  if (typeof document === "undefined" || typeof URL?.createObjectURL !== "function") return;
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
