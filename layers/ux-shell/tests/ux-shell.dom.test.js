// @vitest-environment jsdom
// The shell UI driven the way a user drives it: click Play/New/Export, upload an Import file. The
// backend layers are mocked at their contracts (a small stateful store that models the server saving on
// author/import); no browser and no real runtime are needed.
import { describe, it, expect, vi, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/dom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createShell } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(HERE, "../../persistence/fixtures/adventure.example.json"), "utf8"),
);

// A stateful fake backend: the store mirrors the server, which persists on author and import.
function statefulBackend(seed = [fixture]) {
  const store = new Map(seed.map((a) => [a.meta.id, structuredClone(a)]));
  const persistence = {
    list: () => [...store.values()].map((a) => ({ id: a.meta.id, title: a.meta.title, instanceCount: a.instances.length })),
    load: (id) => structuredClone(store.get(id)),
    exportFile: (id) => JSON.stringify({ adventure: store.get(id), generatedAssets: [] }),
    importFile: (text) => {
      const b = JSON.parse(text);
      store.set(b.adventure.meta.id, structuredClone(b.adventure));
      return b.adventure;
    },
  };
  const runtime = { load: vi.fn() };
  let n = 0;
  const author = vi.fn(() => {
    n += 1;
    const adv = structuredClone(fixture);
    adv.meta = { ...adv.meta, id: `adv-new-${n}`, title: `Fresh Adventure ${n}` };
    store.set(adv.meta.id, adv); // author persists server-side (POST /adventure)
    return adv;
  });
  return { persistence, runtime, author, store };
}

function mountShell(backend, opts) {
  const shell = createShell(backend);
  const container = document.createElement("div");
  document.body.appendChild(container);
  shell.mount(container, opts);
  return shell;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ux-shell - browser and screens (DOM)", () => {
  it("lists seeded adventures and plays one, mounting the runtime at the start instance", async () => {
    const backend = statefulBackend();
    mountShell(backend);
    const user = userEvent.setup();

    expect(screen.getByText(fixture.meta.title)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: `Play ${fixture.meta.title}` }));

    expect(backend.runtime.load).toHaveBeenCalledOnce();
    const [adventure, instanceId] = backend.runtime.load.mock.calls[0];
    expect(adventure.meta.id).toBe(fixture.meta.id);
    expect(instanceId).toBe(fixture.progression.start); // one-click Play lands on the start instance
    expect(document.querySelector(".stage").hidden).toBe(false);
  });

  it("creates a new adventure through the injected author flow and shows it in the browser", async () => {
    const backend = statefulBackend();
    mountShell(backend);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "New adventure" }));

    expect(backend.author).toHaveBeenCalledOnce();
    expect(screen.getByText("Fresh Adventure 1")).toBeTruthy();
  });

  it("exports an adventure to a downloadable, re-importable Bundle file", async () => {
    const backend = statefulBackend();
    const onDownload = vi.fn();
    mountShell(backend, { onDownload });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: `Export ${fixture.meta.title}` }));

    expect(onDownload).toHaveBeenCalledOnce();
    const [filename, text] = onDownload.mock.calls[0];
    expect(filename).toBe(`${fixture.meta.id}.json`);
    const bundle = JSON.parse(text);
    expect(bundle.adventure.meta.id).toBe(fixture.meta.id);
    expect(Array.isArray(bundle.generatedAssets)).toBe(true);
  });

  it("imports an adventure from an uploaded bundle file and shows it in the browser", async () => {
    const backend = statefulBackend([]); // empty browser
    mountShell(backend);
    const user = userEvent.setup();

    expect(screen.queryByText(fixture.meta.title)).toBeNull();

    const bundleText = JSON.stringify({ adventure: fixture, generatedAssets: [] });
    const file = new File([bundleText], `${fixture.meta.id}.json`, { type: "application/json" });
    await user.upload(screen.getByLabelText("Import adventure file"), file);

    expect(await screen.findByText(fixture.meta.title)).toBeTruthy();
  });

  it("surfaces an error (no unhandled rejection) when an uploaded file is rejected, and adds nothing", async () => {
    const backend = statefulBackend([]);
    backend.persistence.importFile = () => {
      throw Object.assign(new Error("bundle contractVersion 2.0.0 is newer than supported"), { code: "MIGRATION_FAILED" });
    };
    mountShell(backend);
    const user = userEvent.setup();

    const file = new File(["{}"], "bad.json", { type: "application/json" });
    await user.upload(screen.getByLabelText("Import adventure file"), file);

    expect(await screen.findByText(/import failed/i)).toBeTruthy();
    expect(document.querySelectorAll("ul[aria-label='Adventures'] li")).toHaveLength(0);
  });
});
