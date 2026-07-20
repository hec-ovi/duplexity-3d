# Contract Convention (how isolation actually works)

This is the governing rule of the whole codebase. It exists so the project can grow to
millions of tokens while any single agent (human or AI) can safely modify one blackbox by
reading only that blackbox's own files.

It is a direct application of Garry Tan's "thin harness, fat skills" pattern (gbrain
`RESOLVER.md`): keep the runtime thin, push judgment into self-contained fat modules, and
route by a dispatcher so you only ever load the one module you are working on.

## The unit of isolation: a "layer" (blackbox)

Every subsystem is a **layer**. A layer is a folder. It is a blackbox: the outside world may
only touch it through its declared contract. A layer owns these files, and nothing outside the
folder may reach inside it:

```
layers/<layer-name>/
  CONTRACT.md      # the ONLY thing other layers are allowed to depend on
  README.md        # what this layer is, how to run/use it, how to modify it safely
  SKILL.md         # (optional) the "fat skill": the procedure/judgment an agent follows here
  src/             # the implementation (private; may be rewritten freely)
  schema/          # machine-readable contract: JSON Schemas for every input and output
  tests/           # contract tests: prove the layer still honors CONTRACT.md
  fixtures/        # example inputs/outputs used by tests and by docs
```

## The one rule

> **A layer may depend ONLY on the CONTRACT.md (and `schema/`) of other layers, never on their `src/`.**

If layer A imports a function, file, or internal type from layer B's `src/`, that is a bug in
the architecture, not a shortcut. Cross-layer communication is data (validated against a
schema), never shared code. This is what makes a blackbox swappable: rewrite B's `src/`
however you like and, as long as `schema/` still validates, A cannot tell.

## CONTRACT.md: the shape

Every `CONTRACT.md` is written for an agent that has never seen the rest of the repo. It has
exactly these sections:

```
# <Layer Name> - Contract

## Purpose
One paragraph: the single responsibility of this blackbox. If you cannot say it in one
sentence, the layer is doing too much and must be split.

## Inputs (params in)
For each entry point (a function, an HTTP route, an event it consumes):
  - name
  - JSON Schema file in schema/ (link)
  - meaning of each field
  - preconditions / invariants the caller must guarantee

## Outputs (params out)
For each output (return value, HTTP response, event it emits):
  - name
  - JSON Schema file in schema/ (link)
  - meaning of each field
  - postconditions / guarantees this layer promises

## Events (if any)
Named events this layer emits or subscribes to, each with its payload schema.

## Errors
The closed set of error codes/shapes this layer can return. Callers handle these; nothing else escapes.

## Dependencies (contracts only)
The list of OTHER layers' contracts this layer calls, by name. Never internal symbols.

## Invariants this layer will never break
The promises that let others build on it. Changing one of these is a breaking change (see Versioning).

## How to modify this blackbox safely
The checklist a future agent follows to change this layer without touching any other.
```

## schema/: the machine-readable half of the contract

Prose in `CONTRACT.md` is for humans; `schema/*.json` is the enforceable truth. Every input
and output named in the contract has a JSON Schema. At every layer boundary the runtime
validates payloads against these schemas (fail closed). Where the layer's output is produced by
an LLM, the SAME schema is what constrains generation (structured output / grammar), so the
model physically cannot emit an off-contract object.

## Versioning (how a contract changes without breaking the world)

- **Additive change** (new optional input field, new output field, new event): allowed in place;
  bump a `contractVersion` minor. Existing callers keep working.
- **Breaking change** (remove/rename a field, change a type, tighten a precondition, change an
  invariant): NOT edited in place. You add the new shape alongside the old, mark the old
  `deprecated`, migrate callers layer by layer, then remove the old. At no point do two layers
  disagree about the wire format.
- Params-in and params-out are the ONLY things a change can touch that ripples outward. Anything
  a change does purely inside `src/` ripples nowhere, by construction.

## The RESOLVER (docs/INDEX.md): load only what you touch

`docs/INDEX.md` is the dispatcher. It is a compact table mapping "the thing you want to change"
to "the one layer folder to open." An agent assigned a task reads INDEX.md, opens that layer's
`CONTRACT.md` + `README.md` + `SKILL.md`, and works entirely inside that folder. It never needs
to load the rest of the codebase. This is the "resolver" half of thin-harness-fat-skills; the
per-layer `SKILL.md` files are the "fat skills."

## Definition of done for any change to a layer

1. `CONTRACT.md` still describes reality (or was updated additively/with a version bump).
2. `schema/` matches the contract.
3. `tests/` (contract tests) pass locally: they drive the layer through its declared entry
   points with `fixtures/` and assert declared outputs. No other layer's tests were touched.
4. No file outside this layer's folder was modified (except an additive INDEX.md/contract link).

If all four hold, the change is safe to merge no matter how large the rest of the codebase is.
