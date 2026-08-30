# Architecture Decisions

## Single Next.js repository

The application uses Next.js with TypeScript, Tailwind CSS, and Route Handlers in one repository. This keeps the initial web and server boundaries deployable as one unit.

## Four independent layers

Persona, Core Interview Protocol, and Scenario Pack are portable protocol assets. Runtime Engine code is kept separately under `src` so product execution does not become the source of truth for protocol content.

## Integration boundaries

Future LLM and STT adapters belong under `src/services/llm` and `src/services/stt`. Domain behavior must not depend directly on a provider SDK.

## Phase-one scope

The initial scaffold contains no database, external AI or speech connection, semantic evaluator, hard gate, repair loop, or multi-agent implementation.
