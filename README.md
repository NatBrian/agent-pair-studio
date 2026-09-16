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

- [Design Specification (Approved)](file:///C:/Users/Admin/Documents/Github/agent-collab-studio/docs/superpowers/specs/2026-09-16-agent-collab-studio-design.md) - Formal architecture specification covering equal peer hierarchy, containment, Kilo/Cline flags, Git branching, and dashboard layout.
- [Detailed Implementation Plan (Bite-Sized Tasks)](file:///C:/Users/Admin/Documents/Github/agent-collab-studio/docs/superpowers/plans/2026-09-16-agent-collab-studio.md) - 11 comprehensive TDD tasks with exact code blocks, tests, and commit commands ready for execution.
- [Discussion, Research & Questions Catalog](file:///C:/Users/Admin/Documents/Github/agent-collab-studio/docs/discussion-and-planning.md) - Detailed record of all research, architectural decisions, and alignment notes.
- [Reference Learnings from Claude Octopus](file:///C:/Users/Admin/Documents/Github/agent-collab-studio/docs/reference-claude-octopus-learnings.md) - Architectural analysis and 6 battle-tested patterns adapted from `claude-octopus` (Kilo `--pure` hang fix, Windows process termination, path security, secret redaction, and error classification).

