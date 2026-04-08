# Claim Types

Every run should express claims in these groups when applicable:

- Backend behavior
- Frontend wiring
- Loading, empty, and error states
- Regression protection
- Docs accuracy
- Tests coverage

Allowed statuses:

- pending
- passed
- failed
- reopened
- accepted-risk
- n/a

Preferred markdown format:

- `- [pending] CLM-XXX: claim text`
- `- [passed] CLM-XXX: claim text`
- `- [failed] CLM-XXX: claim text`

Counting rules:

- `pending` and `reopened` count as open claims
- `accepted-risk` does not count as failed, but must still be an explicit decision
