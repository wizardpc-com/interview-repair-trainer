# Qwen Stage 8 Ownership Guard Focused Regression

- Model: qwen3.8-flash
- Logical Semantic Evaluator calls: 14/14
- G05 false gates: 0/3 — PASS
- G07 false gates: 0/5 — PASS
- G06 product gate recall: 3/3 — PASS
- G08 product gate recall: 3/3 — PASS
- Acceptance: PASS
- First-pass schema valid: 14/14; retries: 0

## Results

| Case | Run | Expected Semantic | Actual Semantic | Expected Issue | Actual Issue | Expected Gate | Actual Gate | Product Result |
|---|---:|---|---|---|---|---|---|---|
| G07 | 1 | CONTINUE | ISSUE_DETECTED | null | OWNERSHIP_AMBIGUOUS | CONTINUE | CONTINUE | Evaluator error / Product safe |
| G07 | 2 | CONTINUE | ISSUE_DETECTED | null | OWNERSHIP_AMBIGUOUS | CONTINUE | CONTINUE | Evaluator error / Product safe |
| G07 | 3 | CONTINUE | ISSUE_DETECTED | null | OWNERSHIP_AMBIGUOUS | CONTINUE | CONTINUE | Evaluator error / Product safe |
| G07 | 4 | CONTINUE | ISSUE_DETECTED | null | OWNERSHIP_AMBIGUOUS | CONTINUE | CONTINUE | Evaluator error / Product safe |
| G07 | 5 | CONTINUE | ISSUE_DETECTED | null | OWNERSHIP_AMBIGUOUS | CONTINUE | CONTINUE | Evaluator error / Product safe |
| G05 | 1 | CONTINUE | CONTINUE | null | null | CONTINUE | CONTINUE | Evaluator label correct / Product correct |
| G05 | 2 | CONTINUE | CONTINUE | null | null | CONTINUE | CONTINUE | Evaluator label correct / Product correct |
| G05 | 3 | CONTINUE | CONTINUE | null | null | CONTINUE | CONTINUE | Evaluator label correct / Product correct |
| G06 | 1 | ISSUE_DETECTED | ISSUE_DETECTED | OWNERSHIP_AMBIGUOUS | OWNERSHIP_AMBIGUOUS | GATE | GATE | Evaluator label correct / Product correct |
| G06 | 2 | ISSUE_DETECTED | ISSUE_DETECTED | OWNERSHIP_AMBIGUOUS | OWNERSHIP_AMBIGUOUS | GATE | GATE | Evaluator label correct / Product correct |
| G06 | 3 | ISSUE_DETECTED | ISSUE_DETECTED | OWNERSHIP_AMBIGUOUS | OWNERSHIP_AMBIGUOUS | GATE | GATE | Evaluator label correct / Product correct |
| G08 | 1 | ISSUE_DETECTED | ISSUE_DETECTED | OWNERSHIP_AMBIGUOUS | OWNERSHIP_AMBIGUOUS | GATE | GATE | Evaluator label correct / Product correct |
| G08 | 2 | ISSUE_DETECTED | ISSUE_DETECTED | OWNERSHIP_AMBIGUOUS | OWNERSHIP_AMBIGUOUS | GATE | GATE | Evaluator label correct / Product correct |
| G08 | 3 | ISSUE_DETECTED | ISSUE_DETECTED | OWNERSHIP_AMBIGUOUS | OWNERSHIP_AMBIGUOUS | GATE | GATE | Evaluator label correct / Product correct |

## Mismatch Raw Structured Outputs

### G07 #1

Expected CONTINUE/null/CONTINUE; actual ISSUE_DETECTED/OWNERSHIP_AMBIGUOUS/CONTINUE.

````text
attempt 1, HTTP 200
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
  "issueExplanation": "The candidate states a role ('backend') but does not specify which designs, implementations, analyses, or decisions were personally completed, failing to separate personal contribution from general team activity.",
  "repairCue": "List specific tasks you performed (e.g., 'I designed the API schema', 'I implemented the database layer')."
}
````

### G07 #2

Expected CONTINUE/null/CONTINUE; actual ISSUE_DETECTED/OWNERSHIP_AMBIGUOUS/CONTINUE.

````text
attempt 1, HTTP 200
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
  "issueExplanation": "The candidate states a role ('backend') but does not specify which designs, implementations, analyses, or decisions were personally completed.",
  "repairCue": "List specific tasks you performed (e.g., 'I designed the API schema', 'I implemented the database layer')."
}
````

### G07 #3

Expected CONTINUE/null/CONTINUE; actual ISSUE_DETECTED/OWNERSHIP_AMBIGUOUS/CONTINUE.

````text
attempt 1, HTTP 200
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
  "issueExplanation": "The candidate states a role ('backend') but does not specify which particular designs, implementations, analyses, or decisions were personally completed by them.",
  "repairCue": "List specific tasks or components you personally built or decided on within the backend scope."
}
````

### G07 #4

Expected CONTINUE/null/CONTINUE; actual ISSUE_DETECTED/OWNERSHIP_AMBIGUOUS/CONTINUE.

````text
attempt 1, HTTP 200
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
  "issueExplanation": "The candidate states a role ('backend') but does not specify any concrete design, implementation, analysis, or decision personally performed.",
  "repairCue": "Please describe specific tasks you completed, such as designing an API, implementing a module, or analyzing performance data."
}
````

### G07 #5

Expected CONTINUE/null/CONTINUE; actual ISSUE_DETECTED/OWNERSHIP_AMBIGUOUS/CONTINUE.

````text
attempt 1, HTTP 200
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
  "issueExplanation": "The candidate states a role ('backend') but does not specify any concrete design, implementation, analysis, or decision personally performed.",
  "repairCue": "Please list specific tasks you completed, such as designing an API, writing code for a module, or analyzing performance data."
}
````

Full raw structured outputs and provider response bodies for every run are retained in the JSON report.
