---
name: risoluto-plan-review
description: Review Risoluto implementation plans for completeness, risks, sequencing, and operator impact before execution.
---

# Risoluto Plan Review

Use this skill when reviewing a Risoluto-specific implementation plan, rollout plan, or execution checklist.

## What to check

- Does the plan name the affected runtime paths, docs, tests, and operator workflows?
- Are trust, auth, workspace, and sandbox implications called out explicitly?
- Are validation steps concrete enough to catch regressions before shipping?
- Are risks and rollback steps clear when the plan touches live orchestration behavior?

## Response shape

Start with the single most important recommendation, then list the main risks or gaps, then suggest the next revision to make the plan shippable.
