import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function requiredEnv(name: string): string {
  const value = process.env[name] ?? "";
  if (!value) {
    throw new TypeError(`${name} is required`);
  }
  return value;
}

function createR2Client(): S3Client {
  const accountId = requiredEnv("R2_ACCOUNT_ID");
  const accessKeyId = requiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("R2_SECRET_ACCESS_KEY");
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function downloadHistory(client: S3Client, bucket: string, key: string, outputPath: string): Promise<void> {
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    const body = await response.Body?.transformToString();
    writeFileSync(outputPath, body ?? '{"entries":{}}\n', "utf8");
  } catch {
    writeFileSync(outputPath, '{"entries":{}}\n', "utf8");
  }
}

async function uploadHistory(client: S3Client, bucket: string, key: string, inputPath: string): Promise<void> {
  const body = await readFile(inputPath);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/json; charset=utf-8",
    }),
  );
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  const filePath = process.argv[3];
  if (!mode || !filePath) {
    throw new TypeError("usage: nightly-history-r2.ts <download|upload> <file>");
  }

  const bucket = requiredEnv("R2_BUCKET");
  const key = requiredEnv("R2_HISTORY_KEY");
  const client = createR2Client();

  if (mode === "download") {
    await downloadHistory(client, bucket, key, filePath);
    return;
  }
  if (mode === "upload") {
    await uploadHistory(client, bucket, key, filePath);
    return;
  }
  throw new TypeError(`unsupported mode: ${mode}`);
}

void main();
