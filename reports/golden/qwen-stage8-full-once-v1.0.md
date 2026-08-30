# Stage 8 Qwen Golden Test Report (full-once)

- Generated: 2026-08-30T12:28:12.333Z
- Mode: `full-once`
- Oracle: v1.0, SHA256 `A1678254FF31F2BF05D85D99EBBD7C101C28E23324B795CEFCD7065B983972FC`
- Model: `qwen3.8-flash`
- Requested `_ONLY_` attachment was absent; the unique matching v1.0 file was used.
- Fixed QuestionPlans use the current canonical product surface questions; Oracle example questions are preserved in the JSON record.
- Real API output is isolated from `npm test`; no API key is written to this report.
- Every provider response and structured output, including retry attempts, is in `qwen-stage8-full-once-v1.0.json`.
- P0/P1 stability was not rerun; this mode is admitted only by a completed passing focus report.
- ANSWER fixtures run through COMPLETE and a FINAL checkpoint with a 4-character minimum; CHECKPOINT fixtures use INTERIM eligibility and cross-checkpoint issue confirmation.

## Metrics

- First-pass evaluator-only decision accuracy: 19/20 (95.0%)
- First-pass evaluator-only label accuracy (decision + IssueType): 18/20 (90.0%)
- First-pass IssueType accuracy among expected issues: 9/10 (90.0%)
- First-pass structured-output JSON validity before retry: 20/20 (100.0%)
- First-pass structured-output Zod validity before retry: 20/20 (100.0%)
- First-pass structured output accepted without retry: 20/20 (100.0%)
- First-pass structured output validated eventually: 20/20 (100.0%)
- First-pass Final Gate accuracy: 20/20 (100.0%)
- First-pass False Gate count: 0
- P0/P1 product release bars: not rerun in full-once mode; see the prerequisite focus report.
- Recovered structured-output retries: 0/20; unrecovered schema failures: 0
- Recovered retry cases: none
- Unstable cases: none
- Stage 9 recommendation: NOT RECOMPUTED (focus prerequisite passed)

## G01–G20 First Pass

| Case | Expected Semantic | Actual Semantic | Expected IssueType | Actual IssueType | Expected Gate | Actual Gate | Product Result | Failure | Checkpoint | Eligibility | Context | Persistence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| G01 | CONTINUE | CONTINUE | null | null | CONTINUE | CONTINUE | Evaluator label correct / Product correct | — | FINAL | ELIGIBLE | SUFFICIENT | FINAL_COMPLETION |
| G02 | ISSUE_DETECTED | ISSUE_DETECTED | NOT_ANSWERING_QUESTION | NOT_ANSWERING_QUESTION | GATE | GATE | Evaluator label correct / Product correct | — | FINAL | ELIGIBLE | SUFFICIENT | FINAL_COMPLETION |
| G03 | CONTINUE | CONTINUE | null | null | CONTINUE | CONTINUE | Evaluator label correct / Product correct | — | FINAL | ELIGIBLE | SUFFICIENT | FINAL_COMPLETION |
| G04 | ISSUE_DETECTED | ISSUE_DETECTED | VAGUE_WITHOUT_EVIDENCE | VAGUE_WITHOUT_EVIDENCE | GATE | GATE | Evaluator label correct / Product correct | — | FINAL | ELIGIBLE | SUFFICIENT | FINAL_COMPLETION |
| G05 | CONTINUE | CONTINUE | null | null | CONTINUE | CONTINUE | Evaluator label correct / Product correct | — | FINAL | ELIGIBLE | SUFFICIENT | FINAL_COMPLETION |
| G06 | ISSUE_DETECTED | ISSUE_DETECTED | OWNERSHIP_AMBIGUOUS | OWNERSHIP_AMBIGUOUS | GATE | GATE | Evaluator label correct / Product correct | — | FINAL | ELIGIBLE | SUFFICIENT | FINAL_COMPLETION |
| G07 | CONTINUE | ISSUE_DETECTED | null | OWNERSHIP_AMBIGUOUS | CONTINUE | CONTINUE | Evaluator error / Product safe | evaluator semantic error | FINAL | ELIGIBLE | SUFFICIENT | FINAL_COMPLETION |
| G08 | ISSUE_DETECTED | ISSUE_DETECTED | OWNERSHIP_AMBIGUOUS | OWNERSHIP_AMBIGUOUS | GATE | GATE | Evaluator label correct / Product correct | — | FINAL | ELIGIBLE | SUFFICIENT | FINAL_COMPLETION |
| G09 | CONTINUE | CONTINUE | null | null | CONTINUE | CONTINUE | Evaluator label correct / Product correct | — | FINAL | ELIGIBLE | SUFFICIENT | FINAL_COMPLETION |
| G10 | ISSUE_DETECTED | ISSUE_DETECTED | VAGUE_WITHOUT_EVIDENCE | VAGUE_WITHOUT_EVIDENCE | GATE | GATE | Evaluator label correct / Product correct | — | FINAL | ELIGIBLE | SUFFICIENT | FINAL_COMPLETION |
| G11 | CONTINUE | CONTINUE | null | null | CONTINUE | CONTINUE | Evaluator label correct / Product correct | — | FINAL | ELIGIBLE | SUFFICIENT | FINAL_COMPLETION |
| G12 | ISSUE_DETECTED | ISSUE_DETECTED | NOT_ANSWERING_QUESTION | NOT_ANSWERING_QUESTION | GATE | GATE | Evaluator label correct / Product correct | — | FINAL | ELIGIBLE | SUFFICIENT | FINAL_COMPLETION |
| G13 | CONTINUE | CONTINUE | null | null | CONTINUE | CONTINUE | Evaluator label correct / Product correct | — | FINAL | ELIGIBLE | SUFFICIENT | FINAL_COMPLETION |
| G14 | ISSUE_DETECTED | ISSUE_DETECTED | NOT_ANSWERING_QUESTION | NOT_ANSWERING_QUESTION | GATE | GATE | Evaluator label correct / Product correct | — | FINAL | ELIGIBLE | SUFFICIENT | FINAL_COMPLETION |
| G15 | CONTINUE | CONTINUE | null | null | CONTINUE | CONTINUE | Evaluator label correct / Product correct | — | FINAL | ELIGIBLE | SUFFICIENT | FINAL_COMPLETION |
| G16 | ISSUE_DETECTED | ISSUE_DETECTED | VAGUE_WITHOUT_EVIDENCE | VAGUE_WITHOUT_EVIDENCE | GATE | GATE | Evaluator label correct / Product correct | — | FINAL | ELIGIBLE | SUFFICIENT | FINAL_COMPLETION |
| G17 | CONTINUE | CONTINUE | null | null | CONTINUE | CONTINUE | Evaluator label correct / Product correct | — | FINAL | ELIGIBLE | SUFFICIENT | FINAL_COMPLETION |
| G18 | ISSUE_DETECTED | ISSUE_DETECTED | NOT_ANSWERING_QUESTION | NOT_ANSWERING_QUESTION | GATE | GATE | Evaluator label correct / Product correct | — | FINAL | ELIGIBLE | SUFFICIENT | FINAL_COMPLETION |
| G19 | CONTINUE | CONTINUE | null | null | CONTINUE | CONTINUE | Evaluator label correct / Product correct | — | INTERIM | TRANSCRIPT_TOO_SHORT | INSUFFICIENT | INTERIM_REQUIRES_MATCHING_NEWER_CHECKPOINT |
| G20 | ISSUE_DETECTED | ISSUE_DETECTED | NOT_ANSWERING_QUESTION | VAGUE_WITHOUT_EVIDENCE | GATE | GATE | Evaluator error / Product gate matched | evaluator semantic error | FINAL | ELIGIBLE | SUFFICIENT | FINAL_COMPLETION |

## Failure Classification

```json
{
  "evaluator semantic error": 2,
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

Expected: CONTINUE/null, CONTINUE. Actual: ISSUE_DETECTED/OWNERSHIP_AMBIGUOUS, CONTINUE.

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
  "issueExplanation": "The candidate states a general role ('responsible for backend') but does not specify any concrete design, implementation, analysis, or decision personally performed, failing to separate personal contribution from team activity.",
  "repairCue": "List specific tasks you completed, such as designing an API, writing code for a module, or analyzing performance data."
}
rawResponseBody:
{"choices":[{"finish_reason":"stop","index":0,"message":{"content":"{\n  \"questionId\": \"personal-contribution\",\n  \"checkpointVersion\": 1,\n  \"confidence\": 0.95,\n  \"gateability\": \"GATE_ELIGIBLE\",\n  \"answerBoundary\": \"NONE\",\n  \"decision\": \"ISSUE_DETECTED\",\n  \"issueType\": \"OWNERSHIP_AMBIGUOUS\",\n  \"triggeringCriterion\": {\n   \"kind\": \"PRIMARY_TARGET\",\n   \"id\": \"personal-ownership\"\n  },\n  \"issueExplanation\": \"The candidate states a general role ('responsible for backend') but does not specify any concrete design, implementation, analysis, or decision personally performed, failing to separate personal contribution from team activity.\",\n  \"repairCue\": \"List specific tasks you completed, such as designing an API, writing code for a module, or analyzing performance data.\"\n}","role":"assistant"}}],"created":1788092867,"id":"chatcmpl-203e5816-b8f5-93c5-ac88-65c7f6c4ef8b","model":"qwen3.8-flash","object":"chat.completion","usage":{"completion_tokens":187,"prompt_tokens":1031,"prompt_tokens_details":{"cached_tokens":1024,"text_tokens":1031},"total_tokens":1218}}
````

### G20 — evaluator semantic error

Expected: ISSUE_DETECTED/NOT_ANSWERING_QUESTION, GATE. Actual: ISSUE_DETECTED/VAGUE_WITHOUT_EVIDENCE, GATE.

````text
attempt 1, HTTP 200
transportErrorName: null
structuredOutput:
{
  "questionId": "technical-choice",
  "checkpointVersion": 1,
  "confidence": 0.95,
  "gateability": "GATE_ELIGIBLE",
  "answerBoundary": "NONE",
  "decision": "ISSUE_DETECTED",
  "issueType": "VAGUE_WITHOUT_EVIDENCE",
  "triggeringCriterion": {
   "kind": "REQUIRED_EVIDENCE",
   "id": "decision-rationale"
  },
  "issueExplanation": "The candidate states the choice (hybrid retrieval) but provides no reasoning or tradeoffs for why this specific technical solution was selected over alternatives.",
  "repairCue": "Explain the rationale behind choosing hybrid retrieval. What problems did it solve? Why was it better than pure vector search or keyword search in your context?"
}
rawResponseBody:
{"choices":[{"finish_reason":"stop","index":0,"message":{"content":"{\n  \"questionId\": \"technical-choice\",\n  \"checkpointVersion\": 1,\n  \"confidence\": 0.95,\n  \"gateability\": \"GATE_ELIGIBLE\",\n  \"answerBoundary\": \"NONE\",\n  \"decision\": \"ISSUE_DETECTED\",\n  \"issueType\": \"VAGUE_WITHOUT_EVIDENCE\",\n  \"triggeringCriterion\": {\n   \"kind\": \"REQUIRED_EVIDENCE\",\n   \"id\": \"decision-rationale\"\n  },\n  \"issueExplanation\": \"The candidate states the choice (hybrid retrieval) but provides no reasoning or tradeoffs for why this specific technical solution was selected over alternatives.\",\n  \"repairCue\": \"Explain the rationale behind choosing hybrid retrieval. What problems did it solve? Why was it better than pure vector search or keyword search in your context?\"\n}","role":"assistant"}}],"created":1788092890,"id":"chatcmpl-eb28a2cd-91f9-9c3d-ad4b-e4af8ec5a1f2","model":"qwen3.8-flash","object":"chat.completion","usage":{"completion_tokens":187,"prompt_tokens":1032,"prompt_tokens_details":{"cached_tokens":1024,"text_tokens":1032},"total_tokens":1219}}
````

Full raw outputs for all first-pass and stability runs are retained in the JSON report.
