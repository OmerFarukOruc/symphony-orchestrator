# Nightly failure intake schema

This note defines the minimal machine-readable payload expected from a nightly failure processor before it opens or updates a Linear issue.

## Fingerprint inputs

Use stable fields only:
- workflow name
- job name
- test file or suite path
- test title when present
- normalized error class
- normalized top stack frame or assertion site
- environment label (`fullstack-e2e`, `visual-regression`, `live-provider-smoke`, etc.)
- browser/project only when it changes triage ownership

Avoid timestamps, random IDs, temp paths, and run-specific URLs.

## Required fields in the normalized summary

- `fingerprint`: stable hash of normalized fingerprint inputs
- `workflow`: GitHub workflow name
- `job`: failing job name
- `runId`: GitHub run ID
- `sha`: commit SHA
- `refName`: branch or tag name
- `firstSeenAt`: ISO timestamp if known
- `lastSeenAt`: ISO timestamp
- `occurrenceCount`: integer recurrence count
- `reproducedOnRetry`: boolean or null
- `failedTests`: array of `{ file, title }`
- `errorSummary`: normalized short error text
- `reportUrl`: artifact or durable report URL
- `traceUrl`: optional
- `videoUrl`: optional
- `logUrl`: optional
- `manifestUrl`: optional nightly manifest URL
- `suggestedRepro`: shell command or short repro recipe

## Linear issue body minimum

- failure summary
- recurrence information
- affected tests
- artifact URLs
- suggested repro command
- environment metadata

## Ticketing heuristic

Initial heuristic only; tune later:
- create or reopen after 2 consecutive nightly failures, or 2 of the last 3 nightly runs, or immediate business-critical reproduction-on-retry
- one issue per fingerprint
- subsequent occurrences become comments or attachment metadata updates, not new issues
