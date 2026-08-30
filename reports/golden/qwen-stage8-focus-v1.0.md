# Stage 8 Qwen Golden Test Report (focus)

- Generated: 2026-08-30T11:34:51.783Z
- Mode: `focus`
- Oracle: v1.0, SHA256 `A1678254FF31F2BF05D85D99EBBD7C101C28E23324B795CEFCD7065B983972FC`
- Model: `qwen3.8-flash`
- Requested `_ONLY_` attachment was absent; the unique matching v1.0 file was used.
- Fixed QuestionPlans use the current canonical product surface questions; Oracle example questions are preserved in the JSON record.
- Real API output is isolated from `npm test`; no API key is written to this report.
- Every provider response and structured output, including retry attempts, is in `qwen-stage8-focus-v1.0.json`.
- P0 and P1 product release metrics use only the balanced 3-run-per-case stability observations; first-pass cases do not change their weighting.
- ANSWER fixtures run through COMPLETE and a FINAL checkpoint with a 4-character minimum; CHECKPOINT fixtures use INTERIM eligibility and cross-checkpoint issue confirmation.

## Metrics

- First-pass evaluator-only decision accuracy: 4/5 (80.0%)
- First-pass evaluator-only label accuracy (decision + IssueType): 4/5 (80.0%)
- First-pass IssueType accuracy among expected issues: 2/2 (100.0%)
- First-pass structured-output JSON validity before retry: 5/5 (100.0%)
- First-pass structured-output Zod validity before retry: 5/5 (100.0%)
- First-pass structured output accepted without retry: 5/5 (100.0%)
- First-pass structured output validated eventually: 5/5 (100.0%)
- First-pass Final Gate accuracy: 4/5 (80.0%)
- First-pass False Gate count: 1
- P0 Product False Gate release bar: 2/18 — FAIL
- P0 evaluator-only false issues: 4/18
- P1 evaluator-only issue recall: 30/30 (100.0%)
- P1 evaluator-only IssueType accuracy: 28/30 (93.3%)
- P1 Arbiter recall with Oracle-complete context (diagnostic only): 30/30 (100.0%)
- P1 Current Product Gate Recall release bar: 30/30 (100.0%) — PASS
- Recovered structured-output retries: 0/56; unrecovered schema failures: 0
- Recovered retry cases: none
- Unstable cases: G11, G05, G07, G14, G20
- Stage 9 recommendation: NO

## Focused First Pass (G07/G08/G11/G12/G19)

| Case | Expected Semantic | Actual Semantic | Expected IssueType | Actual IssueType | Expected Gate | Actual Gate | Product Result | Failure | Checkpoint | Eligibility | Context | Persistence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| G07 | CONTINUE | ISSUE_DETECTED | null | OWNERSHIP_AMBIGUOUS | CONTINUE | GATE | Evaluator error / Product unsafe | evaluator semantic error | FINAL | ELIGIBLE | SUFFICIENT | FINAL_COMPLETION |
| G08 | ISSUE_DETECTED | ISSUE_DETECTED | OWNERSHIP_AMBIGUOUS | OWNERSHIP_AMBIGUOUS | GATE | GATE | Evaluator label correct / Product correct | — | FINAL | ELIGIBLE | SUFFICIENT | FINAL_COMPLETION |
| G11 | CONTINUE | CONTINUE | null | null | CONTINUE | CONTINUE | Evaluator label correct / Product correct | — | FINAL | ELIGIBLE | SUFFICIENT | FINAL_COMPLETION |
| G12 | ISSUE_DETECTED | ISSUE_DETECTED | NOT_ANSWERING_QUESTION | NOT_ANSWERING_QUESTION | GATE | GATE | Evaluator label correct / Product correct | — | FINAL | ELIGIBLE | SUFFICIENT | FINAL_COMPLETION |
| G19 | CONTINUE | CONTINUE | null | null | CONTINUE | CONTINUE | Evaluator label correct / Product correct | — | INTERIM | TRANSCRIPT_TOO_SHORT | INSUFFICIENT | INTERIM_REQUIRES_MATCHING_NEWER_CHECKPOINT |

## Focused Regression Stability

| Case | Semantic runs | Product Gate runs | Correct Gate |
|---|---|---|---|
| G07 | ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / ISSUE_DETECTED:OWNERSHIP_AMBIGUOUS | CONTINUE / CONTINUE / GATE | 2/3 |
| G08 | ISSUE_DETECTED:OWNERSHIP_AMBIGUOUS / ISSUE_DETECTED:OWNERSHIP_AMBIGUOUS / ISSUE_DETECTED:OWNERSHIP_AMBIGUOUS | GATE / GATE / GATE | 3/3 |
| G11 | CONTINUE / ISSUE_DETECTED:NOT_ANSWERING_QUESTION / CONTINUE | CONTINUE / GATE / CONTINUE | 2/3 |
| G12 | ISSUE_DETECTED:NOT_ANSWERING_QUESTION / ISSUE_DETECTED:NOT_ANSWERING_QUESTION / ISSUE_DETECTED:NOT_ANSWERING_QUESTION | GATE / GATE / GATE | 3/3 |
| G19 | CONTINUE / CONTINUE / CONTINUE | CONTINUE / CONTINUE / CONTINUE | 3/3 |

## P0 Stability

| Case | Semantic runs | Product Gate runs | Correct Gate |
|---|---|---|---|
| G05 | CONTINUE / CONTINUE / ISSUE_DETECTED:OWNERSHIP_AMBIGUOUS | CONTINUE / CONTINUE / GATE | 2/3 |
| G07 | ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / ISSUE_DETECTED:OWNERSHIP_AMBIGUOUS | CONTINUE / CONTINUE / GATE | 2/3 |
| G09 | CONTINUE / CONTINUE / CONTINUE | CONTINUE / CONTINUE / CONTINUE | 3/3 |
| G13 | CONTINUE / CONTINUE / CONTINUE | CONTINUE / CONTINUE / CONTINUE | 3/3 |
| G17 | CONTINUE / CONTINUE / CONTINUE | CONTINUE / CONTINUE / CONTINUE | 3/3 |
| G19 | CONTINUE / CONTINUE / CONTINUE | CONTINUE / CONTINUE / CONTINUE | 3/3 |

## P1 Stability

| Case | Semantic runs | Product Gate runs | Correct Gate |
|---|---|---|---|
| G02 | ISSUE_DETECTED:NOT_ANSWERING_QUESTION / ISSUE_DETECTED:NOT_ANSWERING_QUESTION / ISSUE_DETECTED:NOT_ANSWERING_QUESTION | GATE / GATE / GATE | 3/3 |
| G04 | ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE | GATE / GATE / GATE | 3/3 |
| G06 | ISSUE_DETECTED:OWNERSHIP_AMBIGUOUS / ISSUE_DETECTED:OWNERSHIP_AMBIGUOUS / ISSUE_DETECTED:OWNERSHIP_AMBIGUOUS | GATE / GATE / GATE | 3/3 |
| G08 | ISSUE_DETECTED:OWNERSHIP_AMBIGUOUS / ISSUE_DETECTED:OWNERSHIP_AMBIGUOUS / ISSUE_DETECTED:OWNERSHIP_AMBIGUOUS | GATE / GATE / GATE | 3/3 |
| G10 | ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE | GATE / GATE / GATE | 3/3 |
| G12 | ISSUE_DETECTED:NOT_ANSWERING_QUESTION / ISSUE_DETECTED:NOT_ANSWERING_QUESTION / ISSUE_DETECTED:NOT_ANSWERING_QUESTION | GATE / GATE / GATE | 3/3 |
| G14 | ISSUE_DETECTED:NOT_ANSWERING_QUESTION / ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / ISSUE_DETECTED:NOT_ANSWERING_QUESTION | GATE / GATE / GATE | 3/3 |
| G16 | ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE | GATE / GATE / GATE | 3/3 |
| G18 | ISSUE_DETECTED:NOT_ANSWERING_QUESTION / ISSUE_DETECTED:NOT_ANSWERING_QUESTION / ISSUE_DETECTED:NOT_ANSWERING_QUESTION | GATE / GATE / GATE | 3/3 |
| G20 | ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / ISSUE_DETECTED:NOT_ANSWERING_QUESTION / ISSUE_DETECTED:NOT_ANSWERING_QUESTION | GATE / GATE / GATE | 3/3 |

## Failure Classification

```json
{
  "evaluator semantic error": 8,
  "Gate Arbiter error": 0,
  "checkpoint/context eligibility error": 0,
  "schema/output instability": 0,
  "provider/API error": 0,
  "recovered schema/output retry": 0
}
```

## Runtime Replay Semantics

- ANSWER records are completed through the product FINAL path. A FINAL issue is persistence-satisfied after the current FINAL context check.
- CHECKPOINT records remain INTERIM. One INTERIM issue becomes a candidate and cannot Hard Gate without the same issue on a newer checkpoint.
- Product replay uses the captured evaluator semantics with the actual product checkpoint identity; raw provider output remains unchanged in the record.

## First-pass Failure Raw Structured Outputs

### G07 — evaluator semantic error

Expected: CONTINUE/null, CONTINUE. Actual: ISSUE_DETECTED/OWNERSHIP_AMBIGUOUS, GATE.

````text
attempt 1, HTTP 200
transportErrorName: null
structuredOutput:
{
  "questionId": "personal-contribution",
  "checkpointVersion": 1,
  "confidence": 0.95,
  "gateability": "GATE_ELIGIBLE",
  "answerBoundary": "NONE",
  "decision": "ISSUE_DETECTED",
  "issueType": "OWNERSHIP_AMBIGUOUS",
  "triggeringCriterion": {
   "kind": "PRIMARY_TARGET",
   "id": "personal-ownership"
  },
  "issueExplanation": "The candidate states a general role ('backend') but does not specify which particular designs, implementations, analyses, or decisions were personally completed, failing to separate personal contribution from team activity.",
  "repairCue": "List specific tasks (e.g., 'I designed the API schema', 'I implemented the database migration') rather than just stating your role."
}
rawResponseBody:
{"choices":[{"finish_reason":"stop","index":0,"message":{"content":"{\n  \"questionId\": \"personal-contribution\",\n  \"checkpointVersion\": 1,\n  \"confidence\": 0.95,\n  \"gateability\": \"GATE_ELIGIBLE\",\n  \"answerBoundary\": \"NONE\",\n  \"decision\": \"ISSUE_DETECTED\",\n  \"issueType\": \"OWNERSHIP_AMBIGUOUS\",\n  \"triggeringCriterion\": {\n   \"kind\": \"PRIMARY_TARGET\",\n   \"id\": \"personal-ownership\"\n  },\n  \"issueExplanation\": \"The candidate states a general role ('backend') but does not specify which particular designs, implementations, analyses, or decisions were personally completed, failing to separate personal contribution from team activity.\",\n  \"repairCue\": \"List specific tasks (e.g., 'I designed the API schema', 'I implemented the database migration') rather than just stating your role.\"\n}","role":"assistant"}}],"created":1788089478,"id":"chatcmpl-eabe0f67-27c6-9658-aa0f-643113139ddf","model":"qwen3.8-flash","object":"chat.completion","usage":{"completion_tokens":190,"prompt_tokens":910,"prompt_tokens_details":{"cached_tokens":0,"text_tokens":910},"total_tokens":1100}}
````

Full raw outputs for all first-pass and stability runs are retained in the JSON report.
