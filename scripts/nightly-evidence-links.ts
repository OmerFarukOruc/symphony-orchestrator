import { writeFileSync } from "node:fs";

interface EvidenceLinks {
  generatedAt: string;
  runUrl: string | null;
  htmlReportUrl: string | null;
  traceUrl: string | null;
  videoUrl: string | null;
  intakeArtifactUrl: string | null;
  artifactBaseUrl: string | null;
}

function buildArtifactUrl(name: string | null): string | null {
  if (!name) {
    return null;
  }
  const runUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null;
  return runUrl ? `${runUrl}#artifacts` : null;
}

function main(): void {
  const outputPath = process.argv[2];
  if (!outputPath) {
    throw new TypeError("output path argument is required");
  }

  const runUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null;

  const links: EvidenceLinks = {
    generatedAt: new Date().toISOString(),
    runUrl,
    htmlReportUrl: buildArtifactUrl(process.env.NIGHTLY_HTML_ARTIFACT_NAME ?? null),
    traceUrl: buildArtifactUrl(process.env.NIGHTLY_TRACE_ARTIFACT_NAME ?? null),
    videoUrl: buildArtifactUrl(process.env.NIGHTLY_VIDEO_ARTIFACT_NAME ?? null),
    intakeArtifactUrl: buildArtifactUrl(process.env.NIGHTLY_INTAKE_ARTIFACT_NAME ?? null),
    artifactBaseUrl: runUrl ? `${runUrl}#artifacts` : null,
  };

  writeFileSync(outputPath, JSON.stringify(links, null, 2) + "\n", "utf8");
}

main();
