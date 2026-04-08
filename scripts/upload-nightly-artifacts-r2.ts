import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

interface UploadManifest {
  generatedAt: string;
  runId: string;
  sha: string;
  refName: string;
  uploaded: Array<{ label: string; key: string; url: string; contentType: string; sourcePath: string }>;
}

interface NamedInput {
  label: string;
  filePath: string;
}

interface ResolvedUpload {
  label: string;
  sourcePath: string;
  key: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name] ?? "";
  if (!value) {
    throw new TypeError(`${name} is required`);
  }
  return value;
}

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".zip")) return "application/zip";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".webm")) return "video/webm";
  if (filePath.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function publicUrl(baseUrl: string, key: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${key}`;
}

function parseInputs(values: string[]): NamedInput[] {
  return values.map((value, index) => {
    const separator = value.indexOf("=");
    if (separator === -1) {
      return { label: `file${index + 1}`, filePath: value };
    }
    return {
      label: value.slice(0, separator),
      filePath: value.slice(separator + 1),
    };
  });
}

async function collectFiles(rootPath: string): Promise<string[]> {
  const rootStats = await stat(rootPath);
  if (!rootStats.isDirectory()) {
    return [rootPath];
  }

  const results: string[] = [];
  const entries = await readdir(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectFiles(entryPath)));
      continue;
    }
    if (entry.isFile()) {
      results.push(entryPath);
    }
  }
  return results.sort();
}

function sanitizeRelativePath(value: string): string {
  return value.split(path.sep).join("/");
}

async function resolveUploads(prefix: string, inputs: NamedInput[]): Promise<ResolvedUpload[]> {
  const uploads: ResolvedUpload[] = [];
  for (const input of inputs) {
    const sourcePath = path.resolve(input.filePath);
    const sourceStats = await stat(sourcePath);
    if (!sourceStats.isDirectory()) {
      uploads.push({
        label: input.label,
        sourcePath,
        key: `${prefix}/${input.label}-${path.basename(sourcePath)}`,
      });
      continue;
    }

    const files = await collectFiles(sourcePath);
    for (const filePath of files) {
      const relativePath = sanitizeRelativePath(path.relative(sourcePath, filePath));
      uploads.push({
        label: input.label,
        sourcePath: filePath,
        key: `${prefix}/${input.label}/${relativePath}`,
      });
    }
  }
  return uploads;
}

async function main(): Promise<void> {
  const outputPath = process.argv[2];
  const inputs = parseInputs(process.argv.slice(3).filter(Boolean));
  if (!outputPath) {
    throw new TypeError("output path argument is required");
  }
  if (inputs.length === 0) {
    throw new TypeError("at least one input file is required");
  }

  const accountId = requiredEnv("R2_ACCOUNT_ID");
  const accessKeyId = requiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("R2_SECRET_ACCESS_KEY");
  const bucket = requiredEnv("R2_BUCKET");
  const publicBaseUrl = requiredEnv("R2_PUBLIC_BASE_URL");

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  const runId = process.env.GITHUB_RUN_ID ?? "unknown-run";
  const sha = process.env.GITHUB_SHA ?? "unknown-sha";
  const refName = process.env.GITHUB_REF_NAME ?? "unknown-ref";
  const prefix = `nightly/${runId}/${sha}`;

  const resolvedUploads = await resolveUploads(prefix, inputs);
  const uploaded: UploadManifest["uploaded"] = [];
  for (const upload of resolvedUploads) {
    const body = await readFile(upload.sourcePath);
    const contentType = contentTypeFor(upload.sourcePath);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: upload.key,
        Body: body,
        ContentType: contentType,
      }),
    );
    uploaded.push({
      label: upload.label,
      key: upload.key,
      url: publicUrl(publicBaseUrl, upload.key),
      contentType,
      sourcePath: upload.sourcePath,
    });
  }

  const manifest: UploadManifest = {
    generatedAt: new Date().toISOString(),
    runId,
    sha,
    refName,
    uploaded,
  };

  await import("node:fs").then(({ writeFileSync }) =>
    writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + "\n", "utf8"),
  );
}

void main();
