# Agent Collab Studio (Kilo CLI & Cline CLI)

An autonomous pair-programming and collaborative arena between **Kilo CLI** and **Cline CLI**, featuring strict workspace containment, dual-layer memory, Git turn checkpoints, and a multi-tab web studio dashboard.

---

## High-Level Vision

Enable two independent coding agents (`kilo` and `cline`) to collaborate autonomously on:
1. **User-provided topics/tasks**: Pair-programming, debugging, code refactoring, algorithm design, or research.
2. **Agent-initiated ideation**: One agent pitches a novel idea, challenge, or topic to kick off the session.

Both agents run in **`yolo` / `dangerously-skip-permissions` mode**, strictly contained within a dedicated sandbox directory, with their actions observable in a live multi-tab web dashboard.

---

## Documentation Index

- [Discussion, Research & Questions Catalog](file:///C:/Users/Admin/Documents/Github/agent-collab-studio/docs/discussion-and-planning.md) - Deep dive into agent memory, collaboration dynamics, ACP vs. NDJSON protocols, free model handling, containment, and upcoming discussion topics.
- [Implementation Plan Draft](file:///C:/Users/Admin/Documents/Github/agent-collab-studio/docs/implementation-plan-draft.md) - Phased technical blueprint covering project scaffolding, CLI subprocess runners, turn orchestrator, Git checkpoints, multi-tab web studio, and testing.

