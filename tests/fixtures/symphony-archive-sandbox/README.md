# Symphony archive sandbox

This fixture is a controlled `.symphony/` archive for testing the `skills/symphony-logs` skill without using real production runs.

## Scenarios

- `NIN-6` — single deliberate failure with clear failure metadata and matching failure events.
- `NIN-3` — retry history that ends in failure after an earlier stall.
- `MT-42` — retry history that ends in success after an earlier failure.

## Notes

- `issue-index.json` lists attempt IDs in newest-first order.
- Raw `events/*.jsonl` files are chronological, so later lines are newer.
- Use the real helper against this fixture with `--dir`:

```bash
./symphony-logs NIN-6 --dir tests/fixtures/symphony-archive-sandbox/.symphony
./symphony-logs NIN-3 --attempts --dir tests/fixtures/symphony-archive-sandbox/.symphony
./symphony-logs MT-42 --dir tests/fixtures/symphony-archive-sandbox/.symphony
```
