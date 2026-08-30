# Stage 8 Qwen Golden Test Report

- Generated: 2026-08-30T10:58:15.360Z
- Oracle: v1.0, SHA256 `A1678254FF31F2BF05D85D99EBBD7C101C28E23324B795CEFCD7065B983972FC`
- Model: `qwen3.8-flash`
- Requested `_ONLY_` attachment was absent; the unique matching v1.0 file was used.
- Fixed QuestionPlans use the current canonical product surface questions; Oracle example questions are preserved in the JSON record.
- Real API output is isolated from `npm test`; no API key is written to this report.
- Every original structured output, including retry attempts, is in `qwen-stage8-v1.0.json`.
- Deterministic preflight: every P1 transcript is shorter than the current 80-character checkpoint minimum (and the persistent minimum is 120); current-product P1 Gate recall is therefore expected to be 0 independently of Qwen. The live run still measures evaluator accuracy and stability.

## Metrics

- First-pass Evaluator decision accuracy: 17/20 (85.0%)
- First-pass Evaluator label accuracy (decision + IssueType): 16/20 (80.0%)
- First-pass IssueType accuracy among expected issues: 9/10 (90.0%)
- First-pass Final Gate accuracy: 10/20 (50.0%)
- First-pass False Gate count: 0
- P0 False-Gate Safety release bar (first pass + stability): 0 false gates across 24 observations — PASS
- P0 evaluator-only false issues: 6/24 (25.0%)
- P0 dedicated stability: 0 false gates across 18 runs
- P1 evaluator-only issue recall: 40/40 (100.0%)
- P1 evaluator-only IssueType accuracy: 33/40 (82.5%)
- P1 Arbiter recall with Oracle-complete context (diagnostic only): 37/40 (92.5%)
- P1 Current Product Gate Recall release bar (first pass + stability): 0/40 (0.0%) — FAIL
- P1 dedicated stability: 0/30 (0.0%)
- Recovered structured-output retries: 12/68; unrecovered schema failures: 0
- Recovered retry cases: G01, G05, G09, G13, G15, G17
- Unstable cases: G07, G19, G08
- Stage 9 recommendation: NO

## G01–G20 First Pass

| Case | Expected Semantic | Actual Semantic | Expected IssueType | Actual IssueType | Expected Gate | Actual Gate | Product Result | Failure | Eligibility |
|---|---|---|---|---|---|---|---|---|---|
| G01 | CONTINUE | CONTINUE | null | null | CONTINUE | CONTINUE | Evaluator label correct / Product correct | — | ELIGIBLE |
| G02 | ISSUE_DETECTED | ISSUE_DETECTED | NOT_ANSWERING_QUESTION | NOT_ANSWERING_QUESTION | GATE | CONTINUE | Evaluator label correct / Product missed gate | checkpoint/context eligibility error | TRANSCRIPT_TOO_SHORT |
| G03 | CONTINUE | CONTINUE | null | null | CONTINUE | CONTINUE | Evaluator label correct / Product correct | — | TRANSCRIPT_TOO_SHORT |
| G04 | ISSUE_DETECTED | ISSUE_DETECTED | VAGUE_WITHOUT_EVIDENCE | VAGUE_WITHOUT_EVIDENCE | GATE | CONTINUE | Evaluator label correct / Product missed gate | checkpoint/context eligibility error | TRANSCRIPT_TOO_SHORT |
| G05 | CONTINUE | CONTINUE | null | null | CONTINUE | CONTINUE | Evaluator label correct / Product correct | — | TRANSCRIPT_TOO_SHORT |
| G06 | ISSUE_DETECTED | ISSUE_DETECTED | OWNERSHIP_AMBIGUOUS | OWNERSHIP_AMBIGUOUS | GATE | CONTINUE | Evaluator label correct / Product missed gate | checkpoint/context eligibility error | TRANSCRIPT_TOO_SHORT |
| G07 | CONTINUE | ISSUE_DETECTED | null | VAGUE_WITHOUT_EVIDENCE | CONTINUE | CONTINUE | Evaluator error / Product safe | evaluator semantic error | TRANSCRIPT_TOO_SHORT |
| G08 | ISSUE_DETECTED | ISSUE_DETECTED | OWNERSHIP_AMBIGUOUS | OWNERSHIP_AMBIGUOUS | GATE | CONTINUE | Evaluator label correct / Product missed gate | checkpoint/context eligibility error | TRANSCRIPT_TOO_SHORT |
| G09 | CONTINUE | CONTINUE | null | null | CONTINUE | CONTINUE | Evaluator label correct / Product correct | — | ELIGIBLE |
| G10 | ISSUE_DETECTED | ISSUE_DETECTED | VAGUE_WITHOUT_EVIDENCE | VAGUE_WITHOUT_EVIDENCE | GATE | CONTINUE | Evaluator label correct / Product missed gate | checkpoint/context eligibility error | TRANSCRIPT_TOO_SHORT |
| G11 | CONTINUE | ISSUE_DETECTED | null | NOT_ANSWERING_QUESTION | CONTINUE | CONTINUE | Evaluator error / Product safe | evaluator semantic error | ELIGIBLE |
| G12 | ISSUE_DETECTED | ISSUE_DETECTED | NOT_ANSWERING_QUESTION | VAGUE_WITHOUT_EVIDENCE | GATE | CONTINUE | Evaluator error / Product missed gate | evaluator semantic error, checkpoint/context eligibility error | TRANSCRIPT_TOO_SHORT |
| G13 | CONTINUE | CONTINUE | null | null | CONTINUE | CONTINUE | Evaluator label correct / Product correct | — | ELIGIBLE |
| G14 | ISSUE_DETECTED | ISSUE_DETECTED | NOT_ANSWERING_QUESTION | NOT_ANSWERING_QUESTION | GATE | CONTINUE | Evaluator label correct / Product missed gate | checkpoint/context eligibility error | TRANSCRIPT_TOO_SHORT |
| G15 | CONTINUE | CONTINUE | null | null | CONTINUE | CONTINUE | Evaluator label correct / Product correct | — | ELIGIBLE |
| G16 | ISSUE_DETECTED | ISSUE_DETECTED | VAGUE_WITHOUT_EVIDENCE | VAGUE_WITHOUT_EVIDENCE | GATE | CONTINUE | Evaluator label correct / Product missed gate | checkpoint/context eligibility error | TRANSCRIPT_TOO_SHORT |
| G17 | CONTINUE | CONTINUE | null | null | CONTINUE | CONTINUE | Evaluator label correct / Product correct | — | TRANSCRIPT_TOO_SHORT |
| G18 | ISSUE_DETECTED | ISSUE_DETECTED | NOT_ANSWERING_QUESTION | NOT_ANSWERING_QUESTION | GATE | CONTINUE | Evaluator label correct / Product missed gate | checkpoint/context eligibility error | TRANSCRIPT_TOO_SHORT |
| G19 | CONTINUE | ISSUE_DETECTED | null | VAGUE_WITHOUT_EVIDENCE | CONTINUE | CONTINUE | Evaluator error / Product safe | evaluator semantic error | TRANSCRIPT_TOO_SHORT |
| G20 | ISSUE_DETECTED | ISSUE_DETECTED | NOT_ANSWERING_QUESTION | NOT_ANSWERING_QUESTION | GATE | CONTINUE | Evaluator label correct / Product missed gate | checkpoint/context eligibility error | TRANSCRIPT_TOO_SHORT |

## P0 Stability

| Case | Semantic runs | Product Gate runs | Correct Gate |
|---|---|---|---|
| G05 | CONTINUE / CONTINUE / CONTINUE | CONTINUE / CONTINUE / CONTINUE | 3/3 |
| G07 | ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / ISSUE_DETECTED:OWNERSHIP_AMBIGUOUS | CONTINUE / CONTINUE / CONTINUE | 3/3 |
| G09 | CONTINUE / CONTINUE / CONTINUE | CONTINUE / CONTINUE / CONTINUE | 3/3 |
| G13 | CONTINUE / CONTINUE / CONTINUE | CONTINUE / CONTINUE / CONTINUE | 3/3 |
| G17 | CONTINUE / CONTINUE / CONTINUE | CONTINUE / CONTINUE / CONTINUE | 3/3 |
| G19 | ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / CONTINUE / CONTINUE | CONTINUE / CONTINUE / CONTINUE | 3/3 |

## P1 Stability

| Case | Semantic runs | Product Gate runs | Correct Gate |
|---|---|---|---|
| G02 | ISSUE_DETECTED:NOT_ANSWERING_QUESTION / ISSUE_DETECTED:NOT_ANSWERING_QUESTION / ISSUE_DETECTED:NOT_ANSWERING_QUESTION | CONTINUE / CONTINUE / CONTINUE | 0/3 |
| G04 | ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE | CONTINUE / CONTINUE / CONTINUE | 0/3 |
| G06 | ISSUE_DETECTED:OWNERSHIP_AMBIGUOUS / ISSUE_DETECTED:OWNERSHIP_AMBIGUOUS / ISSUE_DETECTED:OWNERSHIP_AMBIGUOUS | CONTINUE / CONTINUE / CONTINUE | 0/3 |
| G08 | ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE | CONTINUE / CONTINUE / CONTINUE | 0/3 |
| G10 | ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE | CONTINUE / CONTINUE / CONTINUE | 0/3 |
| G12 | ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE | CONTINUE / CONTINUE / CONTINUE | 0/3 |
| G14 | ISSUE_DETECTED:NOT_ANSWERING_QUESTION / ISSUE_DETECTED:NOT_ANSWERING_QUESTION / ISSUE_DETECTED:NOT_ANSWERING_QUESTION | CONTINUE / CONTINUE / CONTINUE | 0/3 |
| G16 | ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE / ISSUE_DETECTED:VAGUE_WITHOUT_EVIDENCE | CONTINUE / CONTINUE / CONTINUE | 0/3 |
| G18 | ISSUE_DETECTED:NOT_ANSWERING_QUESTION / ISSUE_DETECTED:NOT_ANSWERING_QUESTION / ISSUE_DETECTED:NOT_ANSWERING_QUESTION | CONTINUE / CONTINUE / CONTINUE | 0/3 |
| G20 | ISSUE_DETECTED:NOT_ANSWERING_QUESTION / ISSUE_DETECTED:NOT_ANSWERING_QUESTION / ISSUE_DETECTED:NOT_ANSWERING_QUESTION | CONTINUE / CONTINUE / CONTINUE | 0/3 |

## Failure Classification

```json
{
  "evaluator semantic error": 14,
  "Gate Arbiter error": 0,
  "checkpoint/context eligibility error": 37,
  "schema/output instability": 0,
  "provider/API error": 0,
  "recovered schema/output retry": 12
}
```

## Minimal Repair Guidance

- Evaluator semantic errors: inspect the generic issue boundary by issue family; do not add Gxx text or labels to the prompt.
- Checkpoint/context misses: recalibrate only the centralized MVP character/time heuristic against completed Chinese answers, preserving G19 fail-open behavior.
- Do not simply lower both global thresholds for every checkpoint. The smallest safer change is to let a stable/final `ANSWER` use completion as persistence (or a separately configured ~20-character floor), while retaining the conservative 80/120 policy for interim checkpoints. In this set the shortest clear complete P1 answer is 22 characters and G19 is an incomplete 17-character checkpoint.
- A global 20/20 counterfactual would recover the length-blocked P1 path, but the observed model outputs imply only 37/40 diagnostic Arbiter recall and would expose G11 as a false Gate. Add final-vs-interim fixtures and address G11 before shipping such a threshold change.
- Schema instability: keep the existing single retry and fail-open behavior; inspect the raw retry pair before any schema compatibility change.
- Provider failures: treat as an environment/API run failure and rerun without changing Golden labels.

## First-pass Failure Raw Structured Outputs

### G02 — checkpoint/context eligibility error

Expected: ISSUE_DETECTED/NOT_ANSWERING_QUESTION, GATE. Actual: ISSUE_DETECTED/NOT_ANSWERING_QUESTION, CONTINUE.

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
  "issueType": "NOT_ANSWERING_QUESTION",
  "triggeringCriterion": {
    "kind": "PRIMARY_TARGET",
    "id": "technical-reasoning"
  },
  "issueExplanation": "The candidate states the chosen technology (YOLOv8n with INT8 quantization) but provides no reasoning or explanation for why this choice was made, failing to address the 'why' component of the question.",
  "repairCue": "Explain the rationale behind choosing YOLOv8n and INT8 quantization, such as tradeoffs between speed/accuracy or deployment constraints."
}
rawResponseBody:
{"choices":[{"finish_reason":"stop","index":0,"message":{"content":"{\n  \"questionId\": \"technical-choice\",\n  \"checkpointVersion\": 1,\n  \"confidence\": 0.95,\n  \"gateability\": \"GATE_ELIGIBLE\",\n  \"answerBoundary\": \"NONE\",\n  \"decision\": \"ISSUE_DETECTED\",\n  \"issueType\": \"NOT_ANSWERING_QUESTION\",\n  \"triggeringCriterion\": {\n    \"kind\": \"PRIMARY_TARGET\",\n    \"id\": \"technical-reasoning\"\n  },\n  \"issueExplanation\": \"The candidate states the chosen technology (YOLOv8n with INT8 quantization) but provides no reasoning or explanation for why this choice was made, failing to address the 'why' component of the question.\",\n  \"repairCue\": \"Explain the rationale behind choosing YOLOv8n and INT8 quantization, such as tradeoffs between speed/accuracy or deployment constraints.\"\n}","role":"assistant"}}],"created":1788087327,"id":"chatcmpl-b89e4020-bd0d-9448-9ace-0915645d02e0","model":"qwen3.8-flash","object":"chat.completion","usage":{"completion_tokens":197,"prompt_tokens":567,"prompt_tokens_details":{"cached_tokens":0,"text_tokens":567},"total_tokens":764}}
````

### G04 — checkpoint/context eligibility error

Expected: ISSUE_DETECTED/VAGUE_WITHOUT_EVIDENCE, GATE. Actual: ISSUE_DETECTED/VAGUE_WITHOUT_EVIDENCE, CONTINUE.

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
  "issueExplanation": "The candidate provides generic adjectives ('good performance', 'advanced') without specific tradeoffs or project requirements that justify the choice.",
  "repairCue": "Provide specific technical reasons or tradeoffs (e.g., async support vs Django, type hinting benefits) relevant to the project's constraints."
}
rawResponseBody:
{"choices":[{"finish_reason":"stop","index":0,"message":{"content":"{\n  \"questionId\": \"technical-choice\",\n  \"checkpointVersion\": 1,\n  \"confidence\": 0.95,\n  \"gateability\": \"GATE_ELIGIBLE\",\n  \"answerBoundary\": \"NONE\",\n  \"decision\": \"ISSUE_DETECTED\",\n  \"issueType\": \"VAGUE_WITHOUT_EVIDENCE\",\n  \"triggeringCriterion\": {\n    \"kind\": \"REQUIRED_EVIDENCE\",\n    \"id\": \"decision-rationale\"\n  },\n  \"issueExplanation\": \"The candidate provides generic adjectives ('good performance', 'advanced') without specific tradeoffs or project requirements that justify the choice.\",\n  \"repairCue\": \"Provide specific technical reasons or tradeoffs (e.g., async support vs Django, type hinting benefits) relevant to the project's constraints.\"\n}","role":"assistant"}}],"created":1788087330,"id":"chatcmpl-bd896c17-8a19-9077-9a8c-aed03b37bb1e","model":"qwen3.8-flash","object":"chat.completion","usage":{"completion_tokens":183,"prompt_tokens":565,"prompt_tokens_details":{"cached_tokens":0,"text_tokens":565},"total_tokens":748}}
````

### G06 — checkpoint/context eligibility error

Expected: ISSUE_DETECTED/OWNERSHIP_AMBIGUOUS, GATE. Actual: ISSUE_DETECTED/OWNERSHIP_AMBIGUOUS, CONTINUE.

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
  "issueExplanation": "The candidate attributes all work to the team ('everyone participated', 'completed together') without distinguishing their specific individual contribution.",
  "repairCue": "Clarify exactly which parts (design, code, analysis) you personally handled versus what others did."
}
rawResponseBody:
{"choices":[{"finish_reason":"stop","index":0,"message":{"content":"{\n  \"questionId\": \"personal-contribution\",\n  \"checkpointVersion\": 1,\n  \"confidence\": 0.95,\n  \"gateability\": \"GATE_ELIGIBLE\",\n  \"answerBoundary\": \"NONE\",\n  \"decision\": \"ISSUE_DETECTED\",\n  \"issueType\": \"OWNERSHIP_AMBIGUOUS\",\n  \"triggeringCriterion\": {\n    \"kind\": \"PRIMARY_TARGET\",\n    \"id\": \"personal-ownership\"\n  },\n  \"issueExplanation\": \"The candidate attributes all work to the team ('everyone participated', 'completed together') without distinguishing their specific individual contribution.\",\n  \"repairCue\": \"Clarify exactly which parts (design, code, analysis) you personally handled versus what others did.\"\n}","role":"assistant"}}],"created":1788087334,"id":"chatcmpl-efb3c7fc-a010-98e9-a5e5-01f02948936e","model":"qwen3.8-flash","object":"chat.completion","usage":{"completion_tokens":170,"prompt_tokens":589,"prompt_tokens_details":{"cached_tokens":0,"text_tokens":589},"total_tokens":759}}
````

### G07 — evaluator semantic error

Expected: CONTINUE/null, CONTINUE. Actual: ISSUE_DETECTED/VAGUE_WITHOUT_EVIDENCE, CONTINUE.

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
  "issueType": "VAGUE_WITHOUT_EVIDENCE",
  "triggeringCriterion": {
    "kind": "REQUIRED_EVIDENCE",
    "id": "personal-action"
  },
  "issueExplanation": "The candidate states a general role ('backend') but provides no specific action, decision, or implementation details to evidence personal contribution.",
  "repairCue": "Ask for specific examples of tasks completed, such as modules implemented, bugs fixed, or architectural decisions made."
}
rawResponseBody:
{"choices":[{"finish_reason":"stop","index":0,"message":{"content":"{\n  \"questionId\": \"personal-contribution\",\n  \"checkpointVersion\": 1,\n  \"confidence\": 0.95,\n  \"gateability\": \"GATE_ELIGIBLE\",\n  \"answerBoundary\": \"NONE\",\n  \"decision\": \"ISSUE_DETECTED\",\n  \"issueType\": \"VAGUE_WITHOUT_EVIDENCE\",\n  \"triggeringCriterion\": {\n    \"kind\": \"REQUIRED_EVIDENCE\",\n    \"id\": \"personal-action\"\n  },\n  \"issueExplanation\": \"The candidate states a general role ('backend') but provides no specific action, decision, or implementation details to evidence personal contribution.\",\n  \"repairCue\": \"Ask for specific examples of tasks completed, such as modules implemented, bugs fixed, or architectural decisions made.\"\n}","role":"assistant"}}],"created":1788087336,"id":"chatcmpl-17ae5b3f-8535-9a17-9c81-06c85ac53a7e","model":"qwen3.8-flash","object":"chat.completion","usage":{"completion_tokens":175,"prompt_tokens":576,"prompt_tokens_details":{"cached_tokens":0,"text_tokens":576},"total_tokens":751}}
````

### G08 — checkpoint/context eligibility error

Expected: ISSUE_DETECTED/OWNERSHIP_AMBIGUOUS, GATE. Actual: ISSUE_DETECTED/OWNERSHIP_AMBIGUOUS, CONTINUE.

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
  "issueExplanation": "The candidate claims overall responsibility but does not specify distinct personal actions versus team activities.",
  "repairCue": "List specific tasks or decisions you personally executed."
}
rawResponseBody:
{"choices":[{"finish_reason":"stop","index":0,"message":{"content":"{\n  \"questionId\": \"personal-contribution\",\n  \"checkpointVersion\": 1,\n  \"confidence\": 0.95,\n  \"gateability\": \"GATE_ELIGIBLE\",\n  \"answerBoundary\": \"NONE\",\n  \"decision\": \"ISSUE_DETECTED\",\n  \"issueType\": \"OWNERSHIP_AMBIGUOUS\",\n  \"triggeringCriterion\": {\n    \"kind\": \"PRIMARY_TARGET\",\n    \"id\": \"personal-ownership\"\n  },\n  \"issueExplanation\": \"The candidate claims overall responsibility but does not specify distinct personal actions versus team activities.\",\n  \"repairCue\": \"List specific tasks or decisions you personally executed.\"\n}","role":"assistant"}}],"created":1788087338,"id":"chatcmpl-852f7473-cd3d-9ec2-bfbb-d934225a3c5a","model":"qwen3.8-flash","object":"chat.completion","usage":{"completion_tokens":152,"prompt_tokens":582,"prompt_tokens_details":{"cached_tokens":0,"text_tokens":582},"total_tokens":734}}
````

### G10 — checkpoint/context eligibility error

Expected: ISSUE_DETECTED/VAGUE_WITHOUT_EVIDENCE, GATE. Actual: ISSUE_DETECTED/VAGUE_WITHOUT_EVIDENCE, CONTINUE.

````text
attempt 1, HTTP 200
transportErrorName: null
structuredOutput:
{
  "questionId": "results-and-validation",
  "checkpointVersion": 1,
  "confidence": 0.95,
  "gateability": "GATE_ELIGIBLE",
  "answerBoundary": "NONE",
  "decision": "ISSUE_DETECTED",
  "issueType": "VAGUE_WITHOUT_EVIDENCE",
  "triggeringCriterion": {
    "kind": "REQUIRED_EVIDENCE",
    "id": "observed-result"
  },
  "issueExplanation": "The candidate uses vague qualitative terms ('significantly improved', 'much higher', 'much lower') without providing specific observed metrics or data points.",
  "repairCue": "Provide concrete numbers for accuracy and latency improvements to substantiate the claim of significant results."
}
rawResponseBody:
{"choices":[{"finish_reason":"stop","index":0,"message":{"content":"{\n  \"questionId\": \"results-and-validation\",\n  \"checkpointVersion\": 1,\n  \"confidence\": 0.95,\n  \"gateability\": \"GATE_ELIGIBLE\",\n  \"answerBoundary\": \"NONE\",\n  \"decision\": \"ISSUE_DETECTED\",\n  \"issueType\": \"VAGUE_WITHOUT_EVIDENCE\",\n  \"triggeringCriterion\": {\n    \"kind\": \"REQUIRED_EVIDENCE\",\n    \"id\": \"observed-result\"\n  },\n  \"issueExplanation\": \"The candidate uses vague qualitative terms ('significantly improved', 'much higher', 'much lower') without providing specific observed metrics or data points.\",\n  \"repairCue\": \"Provide concrete numbers for accuracy and latency improvements to substantiate the claim of significant results.\"\n}","role":"assistant"}}],"created":1788087343,"id":"chatcmpl-65be7096-9128-90b2-9ca5-d741ded59736","model":"qwen3.8-flash","object":"chat.completion","usage":{"completion_tokens":175,"prompt_tokens":605,"prompt_tokens_details":{"cached_tokens":0,"text_tokens":605},"total_tokens":780}}
````

### G11 — evaluator semantic error

Expected: CONTINUE/null, CONTINUE. Actual: ISSUE_DETECTED/NOT_ANSWERING_QUESTION, CONTINUE.

````text
attempt 1, HTTP 200
transportErrorName: null
structuredOutput:
{
  "questionId": "results-and-validation",
  "checkpointVersion": 1,
  "confidence": 0.95,
  "gateability": "GATE_ELIGIBLE",
  "answerBoundary": "NONE",
  "decision": "ISSUE_DETECTED",
  "issueType": "NOT_ANSWERING_QUESTION",
  "triggeringCriterion": {
    "kind": "REQUIRED_EVIDENCE",
    "id": "validation-method"
  },
  "issueExplanation": "The candidate reports specific metrics (mAP50, latency) and mentions using a fixed script/checkpoint, but fails to describe *how* the results were validated or checked for correctness (e.g., cross-checking with ground truth, statistical significance tests, comparison against baseline, or manual inspection). Running a script is an execution method, not a validation method.",
  "repairCue": "Explain how you verified that the reported mAP and latency values are accurate and reliable (e.g., did you compare against known baselines, use multiple seeds, manually inspect failure cases, or validate the dataset labels?)."
}
rawResponseBody:
{"choices":[{"finish_reason":"stop","index":0,"message":{"content":"{\n  \"questionId\": \"results-and-validation\",\n  \"checkpointVersion\": 1,\n  \"confidence\": 0.95,\n  \"gateability\": \"GATE_ELIGIBLE\",\n  \"answerBoundary\": \"NONE\",\n  \"decision\": \"ISSUE_DETECTED\",\n  \"issueType\": \"NOT_ANSWERING_QUESTION\",\n  \"triggeringCriterion\": {\n    \"kind\": \"REQUIRED_EVIDENCE\",\n    \"id\": \"validation-method\"\n  },\n  \"issueExplanation\": \"The candidate reports specific metrics (mAP50, latency) and mentions using a fixed script/checkpoint, but fails to describe *how* the results were validated or checked for correctness (e.g., cross-checking with ground truth, statistical significance tests, comparison against baseline, or manual inspection). Running a script is an execution method, not a validation method.\",\n  \"repairCue\": \"Explain how you verified that the reported mAP and latency values are accurate and reliable (e.g., did you compare against known baselines, use multiple seeds, manually inspect failure cases, or validate the dataset labels?).\"\n}","role":"assistant"}}],"created":1788087345,"id":"chatcmpl-86539581-df2b-9659-81e6-4590664c89f1","model":"qwen3.8-flash","object":"chat.completion","usage":{"completion_tokens":244,"prompt_tokens":646,"prompt_tokens_details":{"cached_tokens":0,"text_tokens":646},"total_tokens":890}}
````

### G12 — evaluator semantic error, checkpoint/context eligibility error

Expected: ISSUE_DETECTED/NOT_ANSWERING_QUESTION, GATE. Actual: ISSUE_DETECTED/VAGUE_WITHOUT_EVIDENCE, CONTINUE.

````text
attempt 1, HTTP 200
transportErrorName: null
structuredOutput:
{
  "questionId": "results-and-validation",
  "checkpointVersion": 1,
  "confidence": 0.95,
  "gateability": "GATE_ELIGIBLE",
  "answerBoundary": "NONE",
  "decision": "ISSUE_DETECTED",
  "issueType": "VAGUE_WITHOUT_EVIDENCE",
  "triggeringCriterion": {
    "kind": "REQUIRED_EVIDENCE",
    "id": "validation-method"
  },
  "issueExplanation": "The candidate provides specific numerical results (mAP and latency) but completely omits any description of how these results were verified or validated.",
  "repairCue": "Explain the validation process used to confirm the mAP and latency figures."
}
rawResponseBody:
{"choices":[{"finish_reason":"stop","index":0,"message":{"content":"{\n  \"questionId\": \"results-and-validation\",\n  \"checkpointVersion\": 1,\n  \"confidence\": 0.95,\n  \"gateability\": \"GATE_ELIGIBLE\",\n  \"answerBoundary\": \"NONE\",\n  \"decision\": \"ISSUE_DETECTED\",\n  \"issueType\": \"VAGUE_WITHOUT_EVIDENCE\",\n  \"triggeringCriterion\": {\n    \"kind\": \"REQUIRED_EVIDENCE\",\n    \"id\": \"validation-method\"\n  },\n  \"issueExplanation\": \"The candidate provides specific numerical results (mAP and latency) but completely omits any description of how these results were verified or validated.\",\n  \"repairCue\": \"Explain the validation process used to confirm the mAP and latency figures.\"\n}","role":"assistant"}}],"created":1788087349,"id":"chatcmpl-4aa605ac-f480-9ba1-8646-aad616007c2d","model":"qwen3.8-flash","object":"chat.completion","usage":{"completion_tokens":171,"prompt_tokens":604,"prompt_tokens_details":{"cached_tokens":0,"text_tokens":604},"total_tokens":775}}
````

### G14 — checkpoint/context eligibility error

Expected: ISSUE_DETECTED/NOT_ANSWERING_QUESTION, GATE. Actual: ISSUE_DETECTED/NOT_ANSWERING_QUESTION, CONTINUE.

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
  "issueType": "NOT_ANSWERING_QUESTION",
  "triggeringCriterion": {
    "kind": "PRIMARY_TARGET",
    "id": "technical-reasoning"
  },
  "issueExplanation": "The candidate lists technical actions and the final choice (hybrid retrieval) but completely omits the 'why' (reasoning/tradeoffs) explicitly requested by the surface question.",
  "repairCue": "Explain the specific reasons or tradeoffs that led to choosing hybrid retrieval over dense retrieval or BM25 alone."
}
rawResponseBody:
{"choices":[{"finish_reason":"stop","index":0,"message":{"content":"{\n  \"questionId\": \"technical-choice\",\n  \"checkpointVersion\": 1,\n  \"confidence\": 0.95,\n  \"gateability\": \"GATE_ELIGIBLE\",\n  \"answerBoundary\": \"NONE\",\n  \"decision\": \"ISSUE_DETECTED\",\n  \"issueType\": \"NOT_ANSWERING_QUESTION\",\n  \"triggeringCriterion\": {\n    \"kind\": \"PRIMARY_TARGET\",\n    \"id\": \"technical-reasoning\"\n  },\n  \"issueExplanation\": \"The candidate lists technical actions and the final choice (hybrid retrieval) but completely omits the 'why' (reasoning/tradeoffs) explicitly requested by the surface question.\",\n  \"repairCue\": \"Explain the specific reasons or tradeoffs that led to choosing hybrid retrieval over dense retrieval or BM25 alone.\"\n}","role":"assistant"}}],"created":1788087353,"id":"chatcmpl-4edf20a9-5a0f-9631-a91c-5c86a504a336","model":"qwen3.8-flash","object":"chat.completion","usage":{"completion_tokens":184,"prompt_tokens":580,"prompt_tokens_details":{"cached_tokens":0,"text_tokens":580},"total_tokens":764}}
````

### G16 — checkpoint/context eligibility error

Expected: ISSUE_DETECTED/VAGUE_WITHOUT_EVIDENCE, GATE. Actual: ISSUE_DETECTED/VAGUE_WITHOUT_EVIDENCE, CONTINUE.

````text
attempt 1, HTTP 200
transportErrorName: null
structuredOutput:
{
  "questionId": "challenge-and-iteration",
  "checkpointVersion": 1,
  "confidence": 0.95,
  "gateability": "GATE_ELIGIBLE",
  "answerBoundary": "NONE",
  "decision": "ISSUE_DETECTED",
  "issueType": "VAGUE_WITHOUT_EVIDENCE",
  "triggeringCriterion": {
    "kind": "REQUIRED_EVIDENCE",
    "id": "iteration-evidence"
  },
  "issueExplanation": "The candidate mentions a 'synchronization problem' and 'optimization' but provides no specific details on what the problem was, how it was addressed, or what the measurable result of the change was.",
  "repairCue": "Provide specific details: What exactly was the synchronization issue? What technical changes were made to fix it? What was the concrete outcome or metric that improved?"
}
rawResponseBody:
{"choices":[{"finish_reason":"stop","index":0,"message":{"content":"{\n  \"questionId\": \"challenge-and-iteration\",\n  \"checkpointVersion\": 1,\n  \"confidence\": 0.95,\n  \"gateability\": \"GATE_ELIGIBLE\",\n  \"answerBoundary\": \"NONE\",\n  \"decision\": \"ISSUE_DETECTED\",\n  \"issueType\": \"VAGUE_WITHOUT_EVIDENCE\",\n  \"triggeringCriterion\": {\n    \"kind\": \"REQUIRED_EVIDENCE\",\n    \"id\": \"iteration-evidence\"\n  },\n  \"issueExplanation\": \"The candidate mentions a 'synchronization problem' and 'optimization' but provides no specific details on what the problem was, how it was addressed, or what the measurable result of the change was.\",\n  \"repairCue\": \"Provide specific details: What exactly was the synchronization issue? What technical changes were made to fix it? What was the concrete outcome or metric that improved?\"\n}","role":"assistant"}}],"created":1788087359,"id":"chatcmpl-40f8f7d4-909c-9583-bcf4-cd3f188e78de","model":"qwen3.8-flash","object":"chat.completion","usage":{"completion_tokens":201,"prompt_tokens":592,"prompt_tokens_details":{"cached_tokens":0,"text_tokens":592},"total_tokens":793}}
````

### G18 — checkpoint/context eligibility error

Expected: ISSUE_DETECTED/NOT_ANSWERING_QUESTION, GATE. Actual: ISSUE_DETECTED/NOT_ANSWERING_QUESTION, CONTINUE.

````text
attempt 1, HTTP 200
transportErrorName: null
structuredOutput:
{
  "questionId": "limitations-and-boundaries",
  "checkpointVersion": 1,
  "confidence": 0.95,
  "gateability": "GATE_ELIGIBLE",
  "answerBoundary": "NONE",
  "decision": "ISSUE_DETECTED",
  "issueType": "NOT_ANSWERING_QUESTION",
  "triggeringCriterion": {
    "kind": "PRIMARY_TARGET",
    "id": "boundary-awareness"
  },
  "issueExplanation": "The candidate describes the system components (IMU, camera, EKF) but does not state what the work could not prove or identify any uncertainties/limitations.",
  "repairCue": "Explicitly state a limitation or uncertainty regarding what the fusion system failed to establish or where it remains unreliable."
}
rawResponseBody:
{"choices":[{"finish_reason":"stop","index":0,"message":{"content":"{\n  \"questionId\": \"limitations-and-boundaries\",\n  \"checkpointVersion\": 1,\n  \"confidence\": 0.95,\n  \"gateability\": \"GATE_ELIGIBLE\",\n  \"answerBoundary\": \"NONE\",\n  \"decision\": \"ISSUE_DETECTED\",\n  \"issueType\": \"NOT_ANSWERING_QUESTION\",\n  \"triggeringCriterion\": {\n    \"kind\": \"PRIMARY_TARGET\",\n    \"id\": \"boundary-awareness\"\n  },\n  \"issueExplanation\": \"The candidate describes the system components (IMU, camera, EKF) but does not state what the work could not prove or identify any uncertainties/limitations.\",\n  \"repairCue\": \"Explicitly state a limitation or uncertainty regarding what the fusion system failed to establish or where it remains unreliable.\"\n}","role":"assistant"}}],"created":1788087365,"id":"chatcmpl-fd9df693-55e7-9b82-98f8-73f8607fe9e0","model":"qwen3.8-flash","object":"chat.completion","usage":{"completion_tokens":179,"prompt_tokens":561,"prompt_tokens_details":{"cached_tokens":0,"text_tokens":561},"total_tokens":740}}
````

### G19 — evaluator semantic error

Expected: CONTINUE/null, CONTINUE. Actual: ISSUE_DETECTED/VAGUE_WITHOUT_EVIDENCE, CONTINUE.

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
  "issueExplanation": "The candidate states a choice (hybrid retrieval) but provides no actual reasoning or tradeoffs, ending with 'mainly because...' without completing the thought.",
  "repairCue": "Complete the sentence by explaining the specific reasons or tradeoffs that led to choosing hybrid retrieval."
}
rawResponseBody:
{"choices":[{"finish_reason":"stop","index":0,"message":{"content":"{\n  \"questionId\": \"technical-choice\",\n  \"checkpointVersion\": 1,\n  \"confidence\": 0.95,\n  \"gateability\": \"GATE_ELIGIBLE\",\n  \"answerBoundary\": \"NONE\",\n  \"decision\": \"ISSUE_DETECTED\",\n  \"issueType\": \"VAGUE_WITHOUT_EVIDENCE\",\n  \"triggeringCriterion\": {\n    \"kind\": \"REQUIRED_EVIDENCE\",\n    \"id\": \"decision-rationale\"\n  },\n  \"issueExplanation\": \"The candidate states a choice (hybrid retrieval) but provides no actual reasoning or tradeoffs, ending with 'mainly because...' without completing the thought.\",\n  \"repairCue\": \"Complete the sentence by explaining the specific reasons or tradeoffs that led to choosing hybrid retrieval.\"\n}","role":"assistant"}}],"created":1788087367,"id":"chatcmpl-15c2f22b-c866-9f1d-b4a1-f9dfd01e42b8","model":"qwen3.8-flash","object":"chat.completion","usage":{"completion_tokens":179,"prompt_tokens":557,"prompt_tokens_details":{"cached_tokens":0,"text_tokens":557},"total_tokens":736}}
````

### G20 — checkpoint/context eligibility error

Expected: ISSUE_DETECTED/NOT_ANSWERING_QUESTION, GATE. Actual: ISSUE_DETECTED/NOT_ANSWERING_QUESTION, CONTINUE.

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
  "issueType": "NOT_ANSWERING_QUESTION",
  "triggeringCriterion": {
    "kind": "REQUIRED_EVIDENCE",
    "id": "decision-rationale"
  },
  "issueExplanation": "The candidate stated the chosen technical solution (hybrid retrieval) but provided no reasoning or tradeoffs for why this specific choice was made over alternatives.",
  "repairCue": "Explain the rationale behind choosing hybrid retrieval. What problem did it solve that other methods didn't? What were the tradeoffs?"
}
rawResponseBody:
{"choices":[{"finish_reason":"stop","index":0,"message":{"content":"{\n  \"questionId\": \"technical-choice\",\n  \"checkpointVersion\": 1,\n  \"confidence\": 0.95,\n  \"gateability\": \"GATE_ELIGIBLE\",\n  \"answerBoundary\": \"NONE\",\n  \"decision\": \"ISSUE_DETECTED\",\n  \"issueType\": \"NOT_ANSWERING_QUESTION\",\n  \"triggeringCriterion\": {\n    \"kind\": \"REQUIRED_EVIDENCE\",\n    \"id\": \"decision-rationale\"\n  },\n  \"issueExplanation\": \"The candidate stated the chosen technical solution (hybrid retrieval) but provided no reasoning or tradeoffs for why this specific choice was made over alternatives.\",\n  \"repairCue\": \"Explain the rationale behind choosing hybrid retrieval. What problem did it solve that other methods didn't? What were the tradeoffs?\"\n}","role":"assistant"}}],"created":1788087369,"id":"chatcmpl-abb6bf79-1e43-9e3d-94b6-f7174eb23afa","model":"qwen3.8-flash","object":"chat.completion","usage":{"completion_tokens":182,"prompt_tokens":577,"prompt_tokens_details":{"cached_tokens":0,"text_tokens":577},"total_tokens":759}}
````

Full raw outputs for all first-pass and stability runs are retained in the JSON report.
