# Architecture

The repository keeps portable interview assets separate from product execution. The current code has completed Stages 1–7: domain contracts, deterministic Gate Arbiter policy, the core protocol and first scenario, a provider-independent single-model Qwen integration, hidden in-memory sessions, the text-first interview runtime, and an immersive browser voice-answer shell with text fallback.

| Layer | Responsibility | Location |
| --- | --- | --- |
| Persona | Interviewer tone and expression style | `protocols/personas/` |
| Core Interview Protocol | Reusable interview behavior rules | `protocols/core/` |
| Scenario Pack | Scenario-specific questions and evidence context | `protocols/scenarios/` |
| Runtime Engine | State, checkpoints, semantic decisions, repair, and metrics | `src/domain/`, `src/server/` |

Protocol export artifacts belong in `protocols/exports/`. Provider-specific LLM and STT code belongs behind `src/services/llm/` and `src/services/stt/` boundaries. Shared presentation components and utilities belong in `src/components/` and `src/lib/`.

## Phase 1 vertical slice

```text
project or research context input
  -> generate and freeze QuestionPlan in the hidden server session
  -> expose the surface question
  -> browser speech input or text fallback
  -> stable transcript input
  -> semantic checkpoint
  -> Semantic Evaluator
  -> Gate Arbiter
  -> Hard Gate or CONTINUE
  -> repair
  -> re-answer
  -> re-evaluate the same frozen target
  -> metrics and report
```

Browser STT converts speech to input text and does not participate in domain decisions. Interim recognition text remains presentation-only; only final recognition segments or explicit text fallback edits update the stable transcript consumed by the existing Runtime.

## Single-model LLM boundary

Phase 1 configures one real LLM. The same model performs two roles through one provider-independent service interface:

- before answering, it generates deep-dive questions, the frozen Hidden QuestionPlan, the primary training target, and evidence requirements;
- during answering, it evaluates semantic checkpoints for `NOT_ANSWERING_QUESTION`, `VAGUE_WITHOUT_EVIDENCE`, and `OWNERSHIP_AMBIGUOUS` and returns structured data to the Gate Arbiter.

Planner and Semantic Evaluator orchestration depend only on the provider-independent service interface. Domain code has no LLM service dependency, and provider-specific code stays inside `src/services/llm`. LLM output never directly controls the UI or state machine.

Stage 4 uses one Qwen model configuration for both operations through Qwen's OpenAI-compatible Chat Completions endpoint. The adapter uses native `fetch` rather than a provider SDK. `QWEN_API_KEY`, `QWEN_MODEL`, and `QWEN_BASE_URL` are server environment configuration; the default model is `qwen3.8-flash`. Requests use non-thinking mode and JSON Object output so the existing Zod validation and single structured-output retry remain authoritative.

A future extension may use a stronger model for planning and final review and a faster model for real-time monitoring. Phase 1 does not implement the router, selection logic, or second provider configuration required for that split.

## QuestionPlan and Hidden Target

Each Phase 1 question has one `primaryTarget` and separates evidence into:

- `requiredEvidence`: evidence reasonably demanded by the surface question;
- `optionalEvidence`: useful for review but never sufficient reason for a Hard Gate when absent.

Only `primaryTarget` plus `requiredEvidence` can affect Gate Arbiter eligibility. The complete QuestionPlan is generated and frozen before the answer begins and remains on the server. The frontend receives the surface question and public runtime state, not hidden targets or expected evidence.

Hidden Target is the AI's precommitted target for this training run. It is not an inference about a real interviewer's private psychology.

## Semantic evaluation and Gate Arbiter

The Semantic Evaluator is advisory. Its confidence or gateability signal is not a calibrated probability and cannot trigger a Hard Gate by itself.

The application-level Gate Arbiter must combine at least:

- evaluator decision and issue type;
- confidence or gateability signal;
- whether the surface question explicitly requires the missing content;
- whether enough answer context exists;
- whether the issue persists beyond a partial sentence;
- whether the checkpoint result is current;
- whether the interview state permits a gate;
- whether the question still has gate capacity.

Numeric thresholds and timing values are initial MVP heuristics and tunable parameters. They must not be presented as scientifically calibrated probabilities.

## Fail-open and stale protection

- Evaluator timeout returns `CONTINUE`.
- Invalid structured output is retried at most once; another failure returns `CONTINUE`.
- Low confidence or ambiguity returns `CONTINUE`.
- A stale checkpoint result is discarded.
- An old result arriving in `REPAIR`, `REANSWER`, or `QUESTION_DONE` is discarded.
- The MVP allows at most one Hard Gate per question.

The safety bias is to miss a possible gate rather than interrupt incorrectly.

## Evaluation scope

Runtime evaluation is limited to cross-disciplinary answer structure:

- alignment with the explicit question;
- evidence sufficiency when evidence is explicitly required;
- personal ownership;
- repair and recovery.

The Runtime does not claim to verify all science or engineering knowledge. A candidate who states that no reliable measurement was made is expressing uncertainty or measurement boundaries; absence of a number alone must not trigger `VAGUE_WITHOUT_EVIDENCE`.

## Session and validation boundaries

Phase 1 runs as a single application instance with an in-memory server session store and TTL. Session creation calls the provider-independent `LlmService`; failed planning does not create a record. Successful plans are copied and recursively frozen in server memory with the project context and scenario id/version. Reads expire records lazily, with a minimal cleanup method available for bulk removal.

The public session DTO is constructed by explicit field selection. It contains only the `sessionId` plus each `questionId` and `surfaceQuestion`; it does not contain project context, scenario hints, timestamps, primary targets, required or optional evidence, or allowed gate types. Redis, PostgreSQL, queues, accounts, durable persistence, and horizontal scaling are out of scope.

Zod now validates generated QuestionPlans and SemanticCheckResults. When API routes are added, runtime schemas must also validate:

- API request bodies;
- any additional untrusted boundary payloads.

Parsed JSON cannot enter the domain through an unchecked type cast.

## Interview runtime and public API

Each hidden session now owns an immutable runtime snapshot alongside its frozen QuestionPlan. The active Stage 6 path is deterministic:

```text
QUESTION_READY -> ANSWERING -> QUESTION_DONE
```

The transition table also reserves `ANSWERING -> REPAIR -> REANSWER -> QUESTION_DONE` for later stages, but Stage 6 exposes no Repair action or UI. Application code starts, updates, checkpoints, and completes an answer; LLM output cannot invoke a transition.

Every accepted transcript change increments `answerVersion`. Creating a checkpoint increments `checkpointVersion` independently and stores the session id, question id, both versions, the transcript snapshot, and creation time. A checkpoint is stale when its session or question differs, either version no longer matches, a newer checkpoint exists, or the question is no longer in `ANSWERING`. This makes all prior checkpoints invalid immediately after a transcript revision or `QUESTION_DONE`.

Periodic checkpoint eligibility is an explicitly tunable MVP heuristic, not a scientifically calibrated threshold. The initial values require 80 characters in the trimmed transcript, five seconds since answer start, eight seconds since the previous checkpoint, a changed answer version, and no request already in flight. Completing a non-empty answer preserves a final snapshot even if the periodic heuristic has not fired.

`POST /api/sessions` validates project context, plans and freezes one question, and returns only the public session and runtime DTOs. `POST /api/sessions/:sessionId/answer` validates `START`, `UPDATE_TRANSCRIPT`, and `COMPLETE` actions. Public runtime responses include the surface question, state, transcript, version counters, and checkpoint freshness metadata; they exclude project context and every private QuestionPlan field.

The Training Console is deliberately not a chat transcript. Setup contains one project/research context field. Before answering, the surface question occupies the center of a near-full-screen interview stage. During answering, the question remains visible above a microphone focus and a compact read-only transcript. Version and save information remains secondary. This stage can later be frozen behind a near-full-screen Hard Gate without turning the experience into a form layout.

## Browser speech input

Stage 7 adds a Chrome-first Browser STT adapter under `src/services/stt`. The adapter requests microphone access only after the application has accepted `START`, configures continuous `zh-CN` Web Speech recognition, and separates interim display text from final stable segments. Only stable segments are appended and sent through the existing `UPDATE_TRANSCRIPT` action, preserving `answerVersion`, checkpoint eligibility, checkpoint snapshots, and stale detection without adding speech concepts to the domain.

The same microphone stream feeds a Web Audio `AnalyserNode`. The UI derives a normalized RMS amplitude from actual time-domain samples and uses it only for microphone rings and level bars. Audio levels never enter semantic evaluation or Gate Arbiter inputs.

Microphone permission denial, missing SpeechRecognition support, audio setup failure, or recognition failure switches the answer stage to an explicit text fallback. Manual completion remains the only Stage 7 end condition. A future conservative silence-based completion candidate may be added separately, but it must remain independent from Semantic Hard Gate decisions.

Stopping an answer, switching to text, leaving the page, or leaving `ANSWERING` stops SpeechRecognition, cancels animation and restart timers, disconnects audio nodes, closes the AudioContext, and stops every microphone track.

## Dependency direction

Dependencies flow from application and infrastructure boundaries toward domain code. Domain code must not import LLM or STT services, provider SDKs, UI code, or generated protocol exports. Application code owns state transitions and Gate Arbiter decisions.
