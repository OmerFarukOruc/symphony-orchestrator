# Changelog

## [0.3.0](https://github.com/OmerFarukOruc/symphony-orchestrator/compare/v0.2.0...v0.3.0) (2026-03-18)


### Features

* adopt 6 OpenSandbox patterns for Docker sandbox hardening ([8b29eed](https://github.com/OmerFarukOruc/symphony-orchestrator/commit/8b29eed29bab603a10975ff48815bb12a22629b1))
* default workspace root to sibling directory of project repo ([82c5dc9](https://github.com/OmerFarukOruc/symphony-orchestrator/commit/82c5dc9d280e41c8327429ec281280eb27a38c6c))
* finish v1 runtime integrations ([654e3cd](https://github.com/OmerFarukOruc/symphony-orchestrator/commit/654e3cd71ed1df9c0156dde43ef79479d64824b9))
* harden symphony orchestration spec conformance ([8feb2c2](https://github.com/OmerFarukOruc/symphony-orchestrator/commit/8feb2c23ce87fab458c1d5cf90af75c1d16981e4))
* implement v1 operator runtime foundations ([508f956](https://github.com/OmerFarukOruc/symphony-orchestrator/commit/508f956d928a7024b921db03210fd79f12f581a5))
* tighten static analysis — ESLint rules, Knip blocking, Semgrep & SonarCloud ([a9a510b](https://github.com/OmerFarukOruc/symphony-orchestrator/commit/a9a510bc1433ac54f292bb13ad16b3ebf0043995))


### Bug Fixes

* align defaults with spec and enforce project_slug validation ([a115526](https://github.com/OmerFarukOruc/symphony-orchestrator/commit/a1155264bfd7b9e5ae0ab1a54e0624a51f7faada))
* allow WORKFLOW.docker.md in .dockerignore for Docker build ([133289b](https://github.com/OmerFarukOruc/symphony-orchestrator/commit/133289b5bee1a624078a2d2fb7a5f510519959bf))
* **ci:** force Node.js 24 for release-please-action ([da768c2](https://github.com/OmerFarukOruc/symphony-orchestrator/commit/da768c2ae339efe79c57eaed4b50693c1e1cbdd2))
* **ci:** update release-please-action to v4.4.0 and remove invalid package-name input ([996df12](https://github.com/OmerFarukOruc/symphony-orchestrator/commit/996df126c3c4c25530a266ce7f37782b987f9f76))
* **ci:** use npm ci with cache in test job instead of artifact download ([ac2986d](https://github.com/OmerFarukOruc/symphony-orchestrator/commit/ac2986daac94c2a7ecb1d3eadc75841f19ce3d8a))
* commit missing source files and refactor codex runtime config ([d3e78b4](https://github.com/OmerFarukOruc/symphony-orchestrator/commit/d3e78b4813d27d26db17c13921d0b1b150fda7e5))
* Docker sandbox volume mounts, host networking, and deployment docs ([373b82b](https://github.com/OmerFarukOruc/symphony-orchestrator/commit/373b82b2020b3333f175b2b8579434a0f922b3dc))
* resolve 4 verified bugs with regression tests ([574754a](https://github.com/OmerFarukOruc/symphony-orchestrator/commit/574754a6978ee47c75a7d764dfc865affc81ea2a))
* resolve all 61 SonarCloud issues ([3502a7b](https://github.com/OmerFarukOruc/symphony-orchestrator/commit/3502a7bd339f7b014a8912427b7be5b69244306b))
* resolve CI test failure, lint warnings, and Node.js 20 deprecations ([81f651c](https://github.com/OmerFarukOruc/symphony-orchestrator/commit/81f651cb3ef57e053cc2691eedd55de98d39cce9))
* stabilize desktop linux launch ([5ddf0a9](https://github.com/OmerFarukOruc/symphony-orchestrator/commit/5ddf0a9fb46f2090330e608f8dbce46cb902eeec))
* stop one-shot issues after completion ([21217b3](https://github.com/OmerFarukOruc/symphony-orchestrator/commit/21217b3506071caef80a1258ad7e4052c8ffca33))
* unblock CI — keep tsconfig.json in Docker context, revert SonarCloud SHA pin ([f113cf7](https://github.com/OmerFarukOruc/symphony-orchestrator/commit/f113cf7f08eb5693b356afc87c7e55071faf5c42))
* upgrade SonarCloud action to v6 (v5 deprecated with security vuln) ([129f250](https://github.com/OmerFarukOruc/symphony-orchestrator/commit/129f250afd08159585bc20967eda82196c87a626))
