# Project Guidance

- Keep Persona, Core Interview Protocol, Scenario Pack, and Runtime Engine as separate architectural layers.
- Treat `protocols/core`, `protocols/personas`, and `protocols/scenarios` as portable source assets. Treat `protocols/exports` as generated output.
- Put deterministic runtime behavior under `src/domain`; external integrations belong under `src/services`.
- Do not claim unimplemented LLM, STT, semantic evaluation, gate, repair, persistence, or multi-agent behavior.
- Prefer the smallest implementation that satisfies the active phase. Do not add infrastructure for hypothetical needs.
- Never commit secrets. Keep real environment files, credentials, and private keys untracked.
- Run the relevant tests and production build before committing changes.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
