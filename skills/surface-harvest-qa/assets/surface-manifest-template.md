# Surface Manifest

## Run Metadata

- **Target**: {{TARGET_URL}}
- **Seed version**: {{SEED_VERSION}}
- **Run started**: {{START_TIMESTAMP}}
- **Viewports**: 2560x1440, 1920x1080
- **Mode**: headed desktop

## Summary

| Metric | 2560x1440 | 1920x1080 | Combined |
|---|---|---|---|
| Surfaces from seed | {{SEED_COUNT}} | {{SEED_COUNT}} | {{SEED_COUNT}} |
| Surfaces discovered | {{DISCOVERED_2560}} | {{DISCOVERED_1920}} | {{DISCOVERED_TOTAL}} |
| Total surfaces | {{TOTAL_2560}} | {{TOTAL_1920}} | {{TOTAL_COMBINED}} |
| PASS | {{PASS_2560}} | {{PASS_1920}} | |
| FAIL | {{FAIL_2560}} | {{FAIL_1920}} | |
| FLAKY | {{FLAKY_2560}} | {{FLAKY_1920}} | |
| BLOCKED | {{BLOCKED_2560}} | {{BLOCKED_1920}} | |
| SKIP | {{SKIP_2560}} | {{SKIP_1920}} | |
| Coverage rate | {{COV_2560}}% | {{COV_1920}}% | |
| Pass rate (executable) | {{PASS_RATE_2560}}% | {{PASS_RATE_1920}}% | |

## Surface Entries

| ID | Route | Type | Description | 2560x1440 | 1920x1080 | Console Errors | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|
| SURFACE-001 | * | section | Sidebar — expanded state | | | | | |
| SURFACE-002 | * | section | Sidebar — collapsed state | | | | | |

<!-- Continue for all surfaces. Status values: PASS, FAIL, FLAKY, BLOCKED, SKIP -->
<!-- Evidence: screenshot, video, diff, eval -->
<!-- Notes: interaction context, error details, reproduction rate for FLAKY -->

## Graph Edges

Parent-child relationships between surfaces. A surface "opens" another when interaction with it reveals a new surface.

| Parent | Action | Child |
|---|---|---|
| SURFACE-048 | click kanban card | SURFACE-060 (inspector drawer) |
| SURFACE-066 | click abort | confirm dialog (native) |
| SURFACE-119 | click "Browse" | SURFACE-120 (project picker modal) |

## Discovered Surfaces (not in seed)

| ID | Route | Type | Description | Discovery method |
|---|---|---|---|---|
| SURFACE-NEW-001 | /queue | tooltip | Card hover tooltip | Discovered during Phase 1 snapshot |

## Missing Surfaces (in seed, not found in app)

| ID | Route | Type | Description | Possible reason |
|---|---|---|---|---|
| | | | | |

## Seed Drift Summary

- Seed surfaces matched: {{MATCHED}} / {{SEED_COUNT}}
- New surfaces discovered: {{DISCOVERED_COUNT}}
- Missing surfaces: {{MISSING_COUNT}}
- Seed version used: {{SEED_VERSION}}
- Recommended seed update: {{YES_NO}}
