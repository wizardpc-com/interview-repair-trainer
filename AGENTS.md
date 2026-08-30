# Project Guidance

## Architecture boundaries

- Keep Persona, Core Interview Protocol, Scenario Pack, and Runtime Engine as separate architectural layers.
- Treat `protocols/core`, `protocols/personas`, and `protocols/scenarios` as portable source assets. Treat `protocols/exports` as generated output.
- Put deterministic runtime behavior under `src/domain`; external integrations belong under `src/services`.
- Domain and orchestration code may depend only on a provider-independent LLM service interface, never a provider SDK.
- Treat LLM output as validated input to application logic. Never let an LLM directly mutate UI state or choose a state transition.

## Phase 1 boundaries

- Build the text-first vertical slice before Browser STT. Keep STT as an input adapter and never a domain dependency.
- Use one configured LLM for both QuestionPlan generation and semantic evaluation through the same service interface.
- Do not add a multi-model router, automatic model selection, multiple real provider configurations, or multi-agent orchestration.
- Run one application instance with an in-memory session store and TTL.
- Do not add Redis, PostgreSQL, queues, accounts, or persistence infrastructure for future scalability.

## Runtime invariants

- Generate and freeze each QuestionPlan before the answer begins. Keep the complete plan server-only.
- Give each question one `primaryTarget` and separate `requiredEvidence` from `optionalEvidence`.
- Only `primaryTarget` plus `requiredEvidence` may affect a Hard Gate. Every required hidden criterion must be reasonably supported by the surface question.
- Treat Hidden Target as a precommitted training target, not a claim about a real interviewer's private intent.
- Treat evaluator confidence or gateability as an uncalibrated signal. It must never trigger a Hard Gate by itself.
- Keep Gate Arbiter decisions deterministic at the application layer and require sufficient context, a persistent issue, a current checkpoint, an allowed state, and remaining gate capacity.
- Fail open on evaluator timeout, invalid output after at most one retry, low confidence, or ambiguity.
- Discard stale checkpoints and results produced after entering `REPAIR`, `REANSWER`, or `QUESTION_DONE`. Allow at most one Hard Gate per question in the MVP.
- Evaluate cross-disciplinary answer structure, not specialist factual truth. An explicit statement that a reliable measurement was not made is not automatically `VAGUE_WITHOUT_EVIDENCE`.
- Validate API request bodies, generated QuestionPlans, and SemanticCheckResults with schemas, preferably Zod. Never cast unvalidated `JSON.parse` output to a domain type.

## Delivery rules

- Prefer the smallest implementation that satisfies the active phase. Complete one verifiable vertical increment per change.
- Add or update corresponding tests whenever a core runtime feature changes, including positive and negative semantic gate cases.
- Do not claim unimplemented LLM, STT, semantic evaluation, gate, repair, persistence, or multi-agent behavior.
- Never commit secrets. Keep real environment files, credentials, and private keys untracked.
- Run `npm test` and `npm run build` successfully before committing.
- Do not rewrite or squash the existing scaffold history; add new commits only.

## Third-party reuse

- For non-core infrastructure, prefer in order: an official SDK or existing dependency; a small, maintained library with a clear compatible license; selective reuse of the minimum necessary compatible open-source code; and only then a local implementation.
- Never copy source from a repository without an explicit compatible license. Do not fork or import an entire interview product for a small feature; reuse only the smallest necessary component.
- Implement this repository's core product logic locally rather than copying or substantially adapting competitor implementations: QuestionPlan and Hidden Target semantics, Semantic Checkpoint policy, Gate Arbiter, Hard Gate state transitions, Repair and Re-answer flow, and Repair metrics.
- Before committing directly copied or substantially adapted third-party source, update `THIRD_PARTY_NOTICES.md` with the source repository URL, exact license, and affected repository files; preserve and record every required notice or copyright statement.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
