# Architecture Decisions

## Single Next.js repository

The application uses Next.js with TypeScript, Tailwind CSS, and Route Handlers in one repository. This keeps the initial web and server boundaries deployable as one unit.

## Four independent layers

Persona, Core Interview Protocol, and Scenario Pack are portable protocol assets. Runtime Engine code is kept separately under `src` so product execution does not become the source of truth for protocol content.

## Text-first domain, single-model Phase 1

The first MVP keeps text as the complete domain input contract and uses exactly one configured LLM for both planning and semantic evaluation. Browser speech is an optional input adapter with a complete text fallback. Planner and Semantic Evaluator reuse one provider-independent LLM service interface and one real provider/model configuration.

Phase 1 does not include a model router, automatic model selection, separate planner and evaluator provider configurations, or multi-agent orchestration. A future split may assign planning, hidden targets, and final review to a stronger model while a faster model monitors checkpoints, but this is an architecture extension rather than current infrastructure.

## Integration boundaries

LLM and STT adapters belong under `src/services/llm` and `src/services/stt`. Domain code has no LLM or STT dependency. Planner and evaluator orchestration depend on provider-independent service interfaces, not provider SDKs. LLM output is advisory data: application code validates it and owns UI behavior and state transitions.

The Stage 4 adapter calls Qwen's OpenAI-compatible Chat Completions endpoint with native `fetch`, so no provider SDK is required. One `QWEN_MODEL` configuration is reused for QuestionPlan generation and semantic checkpoint evaluation.

Browser STT was added only after the text-first runtime was stable. It remains an input adapter and cannot become a domain dependency. Interim recognition is presentation-only; final stable text uses the same runtime action as manual text input. Permission denial, unsupported recognition, or adapter failure returns to the text path.

## Hidden server QuestionPlan

One provider call generates exactly three distinct QuestionPlans before the first answer begins. Every plan is copied and frozen in the hidden Session and has one `primaryTarget`, `requiredEvidence`, and `optionalEvidence`. Only the primary target and required evidence may affect a Hard Gate, every required hidden criterion must be reasonably implied by the surface question, and Repair cannot regenerate any plan.

Optional evidence may improve final review but cannot force an interruption. Hidden Target means the AI's precommitted training target for this run; it is not a claim about a real interviewer's private intent. The complete QuestionPlan remains server-only while the answer is in progress.

## Application-controlled gates

Semantic Evaluator confidence or gateability is an uncalibrated signal, not a probability. It cannot independently trigger a Hard Gate. The Gate Arbiter combines the evaluator decision with the surface question requirements, available answer context, persistence of the issue, checkpoint freshness, current interview state, and the per-question gate count.

Any initial numeric threshold or timing value is an MVP heuristic and tunable parameter, not a scientifically calibrated probability.

An answer-complete-but-rambling signal does not enter the Gate Arbiter. The same signal must persist on a newer interim checkpoint before the application pauses in `WRAP_UP`, and the user can finish or resume without consuming Hard Gate capacity. This reminder is available at most once per question.

## Fail-open and anti-stale behavior

Evaluator timeout, ambiguity, low confidence, or invalid structured output after at most one retry results in `CONTINUE`. Stale checkpoint results and results arriving after `REPAIR`, `REANSWER`, or `QUESTION_DONE` are discarded. The MVP permits at most one Hard Gate per question.

The governing principle is to miss a possible gate rather than interrupt incorrectly.

## Evaluation boundary

The Runtime evaluates cross-disciplinary answer structure: question alignment, evidence sufficiency when explicitly required, personal ownership, and repair or recovery. It does not claim reliable factual judgment across every science and engineering discipline.

Explicitly stating that no reliable measurement was made is valid uncertainty or boundary awareness and is not automatically `VAGUE_WITHOUT_EVIDENCE`.

## Single-instance session model

Phase 1 runs as one application instance with an in-memory server session store and TTL. The store copies and recursively freezes complete QuestionPlans, expires records lazily, and exposes them only to trusted server code. A separately constructed public DTO contains only the session id and surface questions. Planning failure is atomic and writes no partial session.

Redis, PostgreSQL, queues, accounts, and persistence infrastructure are explicitly out of scope. Process restarts lose sessions, and horizontal scaling or durable sessions require a later architecture decision.

## Structured validation

Generated QuestionPlans and SemanticCheckResults cross a Zod validation boundary before entering application logic. Future API request bodies must use the same rule. Unvalidated parsed JSON must not be cast directly to a domain type.

## Runtime version

Node.js 24 is the reference local and Docker runtime. `package.json` retains the Next.js-supported minimum of Node.js 20.9, but project verification and the container use Node.js 24 until a deliberate runtime change is made.

## Current implementation state

The repository has completed Stages 1–10: domain contracts, deterministic Gate Arbiter policy, one portable scenario, one Qwen adapter reused for three-plan generation and evaluation, hidden in-memory Sessions, text-first API and multi-question Runtime, Chrome-first speech input with text fallback, versioned Semantic Evaluator orchestration, Hard Gate and override behavior, same-target Repair and Re-answer, the non-Gate real-time wrap-up reminder, and a deterministic three-question report.

The report selects only public-safe fields from frozen plans and completed runtime records; it does not call the LLM. There are no committed credentials, database, durable sessions, accounts, provider STT, multi-model router, multi-agent runtime, factual grading, score, or ranking.
