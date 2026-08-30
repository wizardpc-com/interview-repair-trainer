# Architecture

The repository keeps portable interview assets separate from product execution.

| Layer | Responsibility | Location |
| --- | --- | --- |
| Persona | Interviewer tone and expression style | `protocols/personas/` |
| Core Interview Protocol | Reusable interview behavior rules | `protocols/core/` |
| Scenario Pack | Scenario-specific questions and evidence context | `protocols/scenarios/` |
| Runtime Engine | State, checkpoints, semantic decisions, repair, and metrics | `src/domain/`, `src/server/` |

Protocol export artifacts belong in `protocols/exports/`. Provider-specific LLM and STT code belongs behind `src/services/llm/` and `src/services/stt/` boundaries. Shared presentation components and utilities belong in `src/components/` and `src/lib/`.

Dependencies flow from the application and infrastructure boundaries toward domain code. Domain code must not import provider SDKs or generated protocol exports.
