# Text-First MVP Implementation Plan

Each stage is one verifiable vertical increment. Finish its acceptance criteria, run `npm test` and `npm run build`, and commit it before starting the next stage. The paths below are likely locations, not a requirement to add extra abstractions.

## 1. Domain contracts — complete

- **Goal:** Define `TrainingTarget`, `EvidenceRequirement`, `QuestionPlan`, `GateIssueType`, `SemanticCheckResult`, and interview state types.
- **Files / modules likely involved:** `src/domain/interview/contracts.ts`, `src/domain/interview/state.ts`, `src/domain/semantic/contracts.ts`, `tests/domain/contracts.test.ts`.
- **Acceptance criteria:** A QuestionPlan has one `primaryTarget`, separate `requiredEvidence` and `optionalEvidence`, and no provider or UI dependency.
- **Tests:** Cover allowed issue types, QuestionPlan invariants, and state value invariants; production build supplies the type check.
- **Explicit non-goals:** API routes, LLM calls, session storage, state-machine behavior.

## 2. Gate policy and arbiter — complete

- **Goal:** Implement the deterministic application-level Gate Arbiter before connecting an evaluator.
- **Files / modules likely involved:** `src/domain/semantic/gate-arbiter.ts`, `tests/domain/gate-arbiter.test.ts`, `tests/fixtures/semantic-gates.ts`.
- **Acceptance criteria:** Confidence is only one signal; the arbiter checks explicit question requirements, sufficient context, persistent issue, freshness, allowed state, and at most one gate per question. Uncertainty fails open.
- **Tests:** Write positive and negative cases first, including confidence-only, partial-answer, stale-result, invalid-state, and gate-count cases.
- **Explicit non-goals:** LLM evaluation, API integration, repair UI, numeric calibration claims.

## 3. Core protocol and first scenario

- **Goal:** Add reusable interview rules and one science/engineering project-research deep-dive scenario.
- **Files / modules likely involved:** `protocols/core/interviewer.md`, `protocols/core/boundaries.md`, `protocols/scenarios/science-engineering-project-deep-dive.yaml`, `tests/protocols/scenario.test.ts`.
- **Acceptance criteria:** Required hidden criteria are supported by their surface questions; optional evidence is non-gating; the scenario declares one primary target per question.
- **Tests:** Validate required scenario fields, allowed gate types, and the required-versus-optional evidence split.
- **Explicit non-goals:** Additional personas, additional scenarios, protocol export, broad question bank.

## 4. Single-model LLM adapter

- **Goal:** Add one provider-independent LLM service with one actual provider/model configuration reused by planning and evaluation.
- **Files / modules likely involved:** `src/services/llm/llm-service.ts`, one provider adapter, `src/server/config.ts`, runtime schemas, adapter tests.
- **Acceptance criteria:** Planner and evaluator depend only on the service interface; generated QuestionPlans and SemanticCheckResults pass schema validation, preferably Zod.
- **Tests:** Use a fake service for valid output, invalid output, and provider error cases; verify both roles resolve to the same configured model.
- **Explicit non-goals:** Model router, fallback provider, automatic selection, second model or API key, multi-agent behavior.

## 5. Hidden in-memory session

- **Goal:** Store the frozen QuestionPlan in a server-only, in-memory session with TTL.
- **Files / modules likely involved:** `src/server/session-store.ts`, session creation Route Handler, request and response schemas, store tests.
- **Acceptance criteria:** The complete plan never reaches the frontend; the response exposes only the surface question and public runtime state; expired sessions are rejected.
- **Tests:** Cover create, read, expiry, missing session, and response serialization without hidden fields.
- **Explicit non-goals:** Redis, PostgreSQL, accounts, durable recovery, horizontal scaling.

## 6. Text-first interview runtime

- **Goal:** Accept text answers, run the interview state machine, and emit versioned semantic checkpoints.
- **Files / modules likely involved:** `src/domain/interview/runtime.ts`, answer Route Handler, checkpoint scheduler, runtime tests.
- **Acceptance criteria:** State transitions are application-controlled; answer and checkpoint versions are monotonic; old results can be identified as stale.
- **Tests:** Cover valid and invalid transitions, text submission, checkpoint creation, and out-of-order result rejection.
- **Explicit non-goals:** Browser STT, Hard Gate presentation, repair flow, UI polish.

## 7. Semantic evaluator and Hard Gate

- **Goal:** Evaluate checkpoints for the three MVP issue types and pass validated results through the Gate Arbiter.
- **Files / modules likely involved:** evaluator orchestration under `src/server`, semantic schemas, Gate Arbiter integration, semantic fixture tests.
- **Acceptance criteria:** Only `NOT_ANSWERING_QUESTION`, `VAGUE_WITHOUT_EVIDENCE`, and `OWNERSHIP_AMBIGUOUS` are supported; timeout, ambiguity, low confidence, and repeated invalid output continue; a gate returns one minimal repair cue.
- **Tests:** Run all fixtures below plus timeout, retry-once, stale, state, and max-gate cases.
- **Explicit non-goals:** Domain-knowledge truth grading, multiple simultaneous issues, calibrated probability claims, elaborate coaching.

## 8. Repair loop

- **Goal:** Freeze the original answer, accept a re-answer, and re-evaluate it against the same precommitted target.
- **Files / modules likely involved:** repair state transitions, repair Route Handler, session updates, repair tests.
- **Acceptance criteria:** The target and required evidence cannot change during repair; outcomes are `successful` or `unresolved`; the original answer remains available for reporting.
- **Tests:** Cover target identity, successful repair, unresolved repair, invalid re-answer state, and late evaluator result discard.
- **Explicit non-goals:** New questions during repair, target regeneration, repeated repair loops, advanced UI.

## 9. Repair metrics and report

- **Goal:** Produce a deterministic report from stored runtime events and validated evaluator outputs.
- **Files / modules likely involved:** `src/domain/interview/metrics.ts`, report Route Handler, report view, aggregation tests.
- **Acceptance criteria:** Report first-pass result, gate count, repair attempt, repair success, and structured evidence before and after. Aggregation is deterministic and includes no fabricated overall score.
- **Tests:** Cover no-gate, repaired, unresolved, and incomplete-session reports plus deterministic replay of the same events.
- **Explicit non-goals:** Scores such as `87.4`, rankings, long-term profiles, database-backed analytics.

## 10. Deferred adapters and polish

- **Goal:** Only after stages 1-9 are stable, add Browser STT with text fallback, focused UI polish, optional protocol export, or a separately approved dual-model experiment.
- **Files / modules likely involved:** `src/services/stt`, `src/components`, `scripts`, and a future architecture decision for any model split.
- **Acceptance criteria:** Every adapter preserves the existing text-first domain contract and fallback path; any dual-model work is justified by measured need.
- **Tests:** Reuse the complete text-first suite and add adapter failure and fallback cases.
- **Explicit non-goals:** Treating any deferred item as a prerequisite for the core repair loop.

## Required semantic gate fixtures

`GATE_ELIGIBLE` means the semantic issue may proceed to the Gate Arbiter; it does not guarantee a Hard Gate.

| Fixture | Answer pattern | Expected outcome |
| --- | --- | --- |
| `ownership_recovered` | Says “we”, then clearly states “I personally implemented…” | `CONTINUE` |
| `measurement_boundary` | Gives no number and explicitly states that no reliable measurement was taken | `CONTINUE` |
| `why_returns_to_reason` | Briefly adds background, then answers the reason | `CONTINUE` |
| `why_stays_on_what` | A why question is answered only with a persistent description of what happened | `GATE_ELIGIBLE: NOT_ANSWERING_QUESTION` |
| `ownership_team_only` | A personal-contribution question is answered only with team behavior | `GATE_ELIGIBLE: OWNERSHIP_AMBIGUOUS` |
| `explicit_metric_stays_vague` | The question explicitly requests data, but the answer only says “improved a lot” | `GATE_ELIGIBLE: VAGUE_WITHOUT_EVIDENCE` |

Each fixture should record the surface question, frozen primary target, required evidence, answer or checkpoint sequence, evaluator result, and expected arbiter outcome. Add separate fixtures for timeout, invalid output twice, low confidence, stale checkpoint, disallowed state, and exhausted gate count.
