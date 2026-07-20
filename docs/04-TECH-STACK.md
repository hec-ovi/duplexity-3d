# 04 - Tech Stack (2026)

> Status: research in progress. A multi-agent web survey (with adversarial fact-checking) is
> running to pin the concrete 2026 tooling per layer: generative 3D models, local AMD/ComfyUI
> feasibility, three.js speech-bubble and pathfinding/animation libraries, modular asset kits,
> structured-output for the scenario-creator, and the local LLM runtime. This file will be
> replaced with the verified, cited results and one clear choice per layer.

## Leaning (to be confirmed by the research)

- Frontend engine: three.js (browser). Kits-first rendering; AI generation as async enrichment.
- Backend: FastAPI + stdlib sqlite3 + httpx, one `llm.chat()` client, no agent framework (mirrors
  gamentic's proven shape on the same AMD box).
- Local text model: a GGUF model on llama.cpp Vulkan (Strix Halo, gfx1151), OpenAI-wire-compatible.
- Structured output: JSON-Schema-constrained decoding (llama.cpp GBNF grammar) so the
  scenario-creator and npc layers physically cannot emit off-contract objects.
- Asset generation: ComfyUI on the local AMD box IF the research confirms the 3D nodes run on
  ROCm/Vulkan for gfx1151; otherwise a cloud 3D API, behind the `providers/gen3d` adapter. Either
  way it is optional (the engine runs from curated kits).

Each choice plugs in behind exactly one layer's contract, so a wrong bet here changes one folder,
not the architecture.
