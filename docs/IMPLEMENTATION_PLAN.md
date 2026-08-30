# Interview Repair Trainer Implementation Plan

Each stage is one verifiable vertical increment. Finish its acceptance criteria, run `npm test` and `npm run build`, and commit it before starting the next stage. The paths below are likely locations, not a requirement to add extra abstractions.

Across all stages, internal protocol identifiers remain English machine values while ordinary user copy is concise Simplified Chinese. The UI must not render issue ids, confidence, answer or checkpoint versions, provider details, or uncalibrated scores. Generated questions may be project-specific, but state labels, actions, errors, and gate or repair results are deterministic application copy.

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

## 3. Core protocol and first scenario — complete

- **Goal:** Add reusable interview rules and one science/engineering project-research deep-dive scenario.
- **Files / modules involved:** `protocols/core/interview-rules.md`, `protocols/scenarios/science-engineering-project-deep-dive.json`, `src/domain/interview/scenario.ts`, `tests/protocols/scenario.test.ts`.
- **Acceptance criteria:** Required hidden criteria are supported by their surface questions; optional evidence is non-gating; the scenario declares one primary target per question.
- **Tests:** Validate required scenario fields, allowed gate types, and the required-versus-optional evidence split.
- **Explicit non-goals:** Additional personas, additional scenarios, protocol export, broad question bank.

## 4. Single-model LLM adapter — complete

- **Goal:** Add one provider-independent LLM service with one actual provider/model configuration reused by planning and evaluation.
- **Files / modules involved:** `src/services/llm/llm-service.ts`, `src/services/llm/qwen-llm-service.ts`, `src/services/llm/schemas.ts`, `src/server/llm-config.ts`, `tests/services/llm/llm-service.test.ts`.
- **Acceptance criteria:** Planner and evaluator depend only on the service interface; generated QuestionPlans and SemanticCheckResults pass schema validation, preferably Zod.
- **Tests:** Use a fake service for valid output, invalid output, and provider error cases; verify both roles resolve to the same configured model.
- **Explicit non-goals:** Model router, fallback provider, automatic selection, second model or API key, multi-agent behavior.

## 5. Hidden in-memory session — complete

- **Goal:** Store the frozen QuestionPlan in a server-only, in-memory session with TTL.
- **Files / modules involved:** `src/server/session-store.ts`, `src/server/interview-session-service.ts`, `tests/server/interview-session.test.ts`.
- **Acceptance criteria:** Session creation uses the provider-independent LLM service, copies and freezes the complete plan server-side, exposes only the session id and surface questions, and rejects expired sessions. Planning failure creates no partial session.
- **Tests:** Cover create and read, deep freezing, hidden-field serialization, lazy expiry, missing sessions, planning failure atomicity, and session isolation.
- **Explicit non-goals:** Redis, PostgreSQL, accounts, durable recovery, horizontal scaling.

## 6. Text-first interview runtime — complete

- **Goal:** Accept text answers, run the interview state machine, and emit versioned semantic checkpoints.
- **Files / modules involved:** `src/domain/interview/runtime.ts`, `src/server/interview-runtime-service.ts`, session and answer Route Handlers, `src/components/training-console.tsx`, and runtime/server tests.
- **Acceptance criteria:** State transitions are application-controlled; answer and checkpoint versions are monotonic; old results can be identified as stale.
- **Tests:** Cover valid and invalid transitions, text submission, checkpoint creation, and out-of-order result rejection.
- **Explicit non-goals:** Browser STT, semantic evaluator orchestration, Hard Gate presentation, repair flow, and final UI polish.

## 7. Immersive voice answer shell — complete

- **Goal:** Add a Chrome-first browser voice input shell while preserving the complete text-first Runtime contract.
- **Files / modules involved:** `src/services/stt/browser-stt.ts`, `src/components/training-console.tsx`, browser adapter tests, and UI tests.
- **Acceptance criteria:** Microphone access begins only after `START`; interim recognition remains local; final segments update the existing transcript; actual analyser samples drive microphone feedback; denied or unsupported speech input falls back to text; all microphone resources stop on completion, fallback, state exit, or page exit.
- **Tests:** Cover delayed permission request, interim/final separation, stable transcript append, analyser-derived amplitude, denial and unsupported fallback, and resource cleanup. Reuse all Stage 6 Runtime tests unchanged.
- **Explicit non-goals:** Semantic Evaluator orchestration, Hard Gate, Repair, automatic silence completion, provider STT, audio persistence, and scoring.

## 8. Semantic evaluator and Hard Gate

- **Goal:** Evaluate checkpoints for the three MVP issue types and pass validated results through the Gate Arbiter.
- **Files / modules likely involved:** evaluator orchestration under `src/server`, semantic schemas, Gate Arbiter integration, semantic fixture tests.
- **Acceptance criteria:** Only `NOT_ANSWERING_QUESTION`, `VAGUE_WITHOUT_EVIDENCE`, and `OWNERSHIP_AMBIGUOUS` are supported; timeout, ambiguity, low confidence, and repeated invalid output continue; evaluator output contains no user-facing feedback; a gate returns one deterministic Chinese cue with one answer-level gap and one action, without exposing internal terms or confidence.
- **Tests:** Run all fixtures below plus timeout, retry-once, stale, state, max-gate, fixed-copy mapping, and user-visible internal-term regression cases.
- **Explicit non-goals:** Domain-knowledge truth grading, multiple simultaneous issues, calibrated probability claims, elaborate coaching.

## 9. Repair loop

- **Goal:** Freeze the original answer, accept a re-answer, and re-evaluate it against the same precommitted target.
- **Files / modules likely involved:** repair state transitions, repair Route Handler, session updates, repair tests.
- **Acceptance criteria:** The target, required evidence, and surface question cannot change during repair; the original answer remains frozen and viewable; one deterministic Chinese cue leads to a single re-answer; completion records the issue as resolved or unresolved and exits the loop.
- **Tests:** Cover target identity, first-answer preservation, successful repair, unresolved repair, invalid re-answer state, one-gate capacity, and late evaluator result discard.
- **Explicit non-goals:** New questions during repair, target regeneration, repeated repair loops, advanced UI.

## 10. Repair metrics and report

- **Goal:** Produce a deterministic report from stored runtime events and validated evaluator outputs.
- **Files / modules likely involved:** `src/domain/interview/metrics.ts`, report Route Handler, report view, aggregation tests.
- **Acceptance criteria:** Report first-pass result, gate count, repair attempt, repair success, and structured evidence before and after. Aggregation is deterministic and includes no fabricated overall score.
- **Tests:** Cover no-gate, repaired, unresolved, and incomplete-session reports plus deterministic replay of the same events.
- **Explicit non-goals:** Scores such as `87.4`, rankings, long-term profiles, database-backed analytics.

## 11. Deferred adapters and polish

- **Goal:** Only after the core repair loop is stable, add focused UI polish, optional protocol export, or a separately approved dual-model experiment.
- **Files / modules likely involved:** `src/components`, `scripts`, and a future architecture decision for any model split.
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
