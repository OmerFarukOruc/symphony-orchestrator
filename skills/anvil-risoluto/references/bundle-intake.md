# Bundle Intake

Accept these intake forms:

- issue IDs
- issue URLs
- roadmap bundle text
- requirements docs
- plan docs
- vague feature prompts

When intake is vague:

- identify likely scope and risk
- identify likely touched areas
- note what is still ambiguous
- harden the intake before planning

Bundle metadata should include:

- slug
- title
- source type
- source items
- risk level
- touches UI
- touches backend
- touches docs
- touches tests

Bundle metadata may also include explicit runtime requirements when they are already known:

- requires GitHub auth
- requires Linear API
- requires Docker
- requires ui-test
- verification surfaces

Prefer grouping issues by shared code paths and shared verification needs, not just by label.
