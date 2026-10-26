# Caffè Scavo 3D pass: progress

Intent: replace the four still placeholders with real-time, scroll-driven 3D scenes of the craft, keeping design, copy, layout and a light first paint. Contract: SCENES.md.

Decisions
- WebGPURenderer + TSL, one renderer per mount, lazily imported after first paint; procedural geometry only.
- One phase function per scene so scrubbing is reversible; ambient motion only for a short window after scroll.
- NoToneMapping (frame-level tone mapping in WebGPURenderer shifted brand colours).
- Serialized, prioritized renderer starts; canvas attached after a GPU-synced first frame.
- Hero visual revealed on load (was waiting on an IntersectionObserver threshold that a short phone viewport never met before scrolling).

Done: all four scenes, test hooks (test build only), evidence manifest, gate passes on both backends, verify + verify:scenes pass.

Remaining weak points: milk microfoam detail is subtle at phone size; crema bubbles alias slightly at small sizes; no real-GPU performance measurement.
