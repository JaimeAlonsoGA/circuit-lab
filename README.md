# Circuit Lab

Build, power and break circuits in your browser. Next.js + TypeScript.

## Works
- Animated drag & drop palette, inspector, code and AI drawers
- Own MNA solver (Newton + transient): visible current flow, plug/unplug wires, parts burn (LED overcurrent, fuses, etc.) and can be repaired
- Microcontroller code in Monaco: Arduino C subset (transpiled to JS) or JavaScript mode; load sketches from public GitHub repos
- Exports: JSON project, SVG, PNG, SPICE netlist, BOM CSV, KiCad netlist
- AI agent "Sparky" with tools (add/connect/set/run/repair…) using **your own** xAI or Anthropic API key (stored only in your browser, proxied without logging)
- Animated pet that reacts to burns, power and success
- Autosave to localStorage, undo/redo, templates, mobile layout
- 43 unit tests (vitest) + 18 Playwright e2e checks

## Limits (honest)
- Arduino transpiler covers a subset: no arbitrary libraries, interrupts, pointers, structs/classes, templates. No MicroPython.
- AI needs an API key (a chat subscription won't work); e2e tests use a mocked provider.
- Simulation is educational, not SPICE-accurate.

## Dev
`npm i && npm run dev` · `npm test` · `node e2e/run.mjs` (against `next start -p 3100`)
