# Architecture

The repository keeps portable interview assets separate from product execution. The current code contains the scaffold, Stage 1 domain contracts, the Stage 2 deterministic Gate Arbiter policy, and the Stage 3 core protocol plus one project/research deep-dive scenario; this document freezes the remaining text-first MVP boundaries rather than claiming those runtime features are implemented.

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
  -> text answer input
  -> semantic checkpoint
  -> Semantic Evaluator
  -> Gate Arbiter
  -> Hard Gate or CONTINUE
  -> repair
  -> re-answer
  -> re-evaluate the same frozen target
  -> metrics and report
```

Browser STT is added only after this slice is stable. STT converts speech to input text and does not participate in domain decisions.

## Single-model LLM boundary

Phase 1 configures one real LLM. The same model performs two roles through one provider-independent service interface:

- before answering, it generates deep-dive questions, the frozen Hidden QuestionPlan, the primary training target, and evidence requirements;
- during answering, it evaluates semantic checkpoints for `NOT_ANSWERING_QUESTION`, `VAGUE_WITHOUT_EVIDENCE`, and `OWNERSHIP_AMBIGUOUS` and returns structured data to the Gate Arbiter.

Planner and Semantic Evaluator orchestration depend only on the provider-independent service interface. Domain code has no LLM service dependency, and provider-specific code stays inside `src/services/llm`. LLM output never directly controls the UI or state machine.

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

Phase 1 runs as a single application instance with an in-memory server session store and TTL. Redis, PostgreSQL, queues, accounts, and durable persistence are out of scope.

When API and LLM work begins, runtime schemas, preferably Zod, validate:

- API request bodies;
- generated QuestionPlans;
- SemanticCheckResults.

Parsed JSON cannot enter the domain through an unchecked type cast.

## Dependency direction

Dependencies flow from application and infrastructure boundaries toward domain code. Domain code must not import LLM or STT services, provider SDKs, UI code, or generated protocol exports. Application code owns state transitions and Gate Arbiter decisions.
