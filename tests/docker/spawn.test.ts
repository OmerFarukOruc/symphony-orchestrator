import os from "node:os";
import { describe, expect, it, afterEach } from "vitest";

import { buildDockerRunArgs, type DockerRunInput } from "../../src/docker/spawn.js";
import { PathRegistry } from "../../src/workspace/path-registry.js";
import type { SandboxConfig } from "../../src/core/types.js";

function baseSandboxConfig(): SandboxConfig {
  return {
    image: "symphony-codex:latest",
    network: "",
    security: { noNewPrivileges: true, dropCapabilities: true, gvisor: false, seccompProfile: "" },
    resources: {
      memory: "4g",
      memoryReservation: "1g",
      memorySwap: "4g",
      cpus: "2.0",
      tmpfsSize: "512m",
    },
    extraMounts: [],
    envPassthrough: [],
    logs: { driver: "json-file", maxSize: "50m", maxFile: 3 },
    egressAllowlist: [],
  };
}

function baseInput(overrides?: Partial<DockerRunInput>): DockerRunInput {
  return {
    sandboxConfig: baseSandboxConfig(),
    runId: "MT-1-1710000000000",
    command: "codex app-server",
    workspacePath: "/tmp/workspaces/MT-1",
    archiveDir: "/tmp/archive",
    runtimeConfigToml: 'model = "gpt-5.4"\n',
    ...overrides,
  };
}

describe("buildDockerRunArgs", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns program=docker with a container name", () => {
    const result = buildDockerRunArgs(baseInput());
    expect(result.program).toBe("docker");
    expect(result.containerName).toBe("symphony-MT-1-1710000000000");
    expect(result.cacheVolumeName).toBe("symphony-cache-MT-1-1710000000000");
  });

  it("includes identity-mapped volume mounts", () => {
    const result = buildDockerRunArgs(baseInput());
    const mountArgs = result.args.filter((_, i) => result.args[i - 1] === "-v");
    // workspace, archive, cache volume
    expect(mountArgs.length).toBeGreaterThanOrEqual(3);
    expect(mountArgs).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/tmp/workspaces/MT-1"),
        expect.stringContaining("/tmp/archive"),
      ]),
    );
  });

  it("sets --user to host uid:gid", () => {
    const result = buildDockerRunArgs(baseInput());
    const userIdx = result.args.indexOf("--user");
    expect(userIdx).toBeGreaterThan(-1);
    const uid = os.userInfo().uid;
    const gid = os.userInfo().gid;
    expect(result.args[userIdx + 1]).toBe(`${uid}:${gid}`);
  });

  it("sets --workdir to workspace path", () => {
    const result = buildDockerRunArgs(baseInput());
    const wdIdx = result.args.indexOf("--workdir");
    expect(wdIdx).toBeGreaterThan(-1);
    expect(result.args[wdIdx + 1]).toBe("/tmp/workspaces/MT-1");
  });

  it("exports HOME, container CODEX_HOME, and runtime config payload", () => {
    const result = buildDockerRunArgs(baseInput());
    const envArgs = result.args.filter((_, i) => result.args[i - 1] === "-e");
    expect(envArgs).toEqual(
      expect.arrayContaining([
        "HOME=/home/agent",
        "CODEX_HOME=/home/agent/.codex-runtime",
        'SYMPHONY_CODEX_CONFIG_TOML=model = "gpt-5.4"\n\n[projects."/tmp/workspaces/MT-1"]\ntrust_level = "trusted"\n',
        "SYMPHONY_CODEX_COMMAND=codex app-server",
      ]),
    );
  });

  it("does not include --rm", () => {
    const result = buildDockerRunArgs(baseInput());
    expect(result.args).not.toContain("--rm");
  });

  it("includes security flags by default", () => {
    const result = buildDockerRunArgs(baseInput());
    expect(result.args).toContain("--cap-drop=ALL");
    expect(result.args).toContain("--security-opt=no-new-privileges");
  });

  it("omits security flags when disabled", () => {
    const cfg = baseSandboxConfig();
    cfg.security.dropCapabilities = false;
    cfg.security.noNewPrivileges = false;
    const result = buildDockerRunArgs(baseInput({ sandboxConfig: cfg }));
    expect(result.args).not.toContain("--cap-drop=ALL");
    expect(result.args).not.toContain("--security-opt=no-new-privileges");
  });

  it("includes gVisor runtime when enabled", () => {
    const cfg = baseSandboxConfig();
    cfg.security.gvisor = true;
    const result = buildDockerRunArgs(baseInput({ sandboxConfig: cfg }));
    expect(result.args).toContain("--runtime=runsc");
  });

  it("includes resource limits", () => {
    const result = buildDockerRunArgs(baseInput());
    expect(result.args).toEqual(
      expect.arrayContaining(["--memory", "4g", "--memory-reservation", "1g", "--memory-swap", "4g", "--cpus", "2.0"]),
    );
  });

  it("includes network flag only when set", () => {
    const result = buildDockerRunArgs(baseInput());
    expect(result.args).not.toContain("--network");

    const cfg = baseSandboxConfig();
    cfg.network = "symphony-sandbox";
    const resultWithNet = buildDockerRunArgs(baseInput({ sandboxConfig: cfg }));
    const netIdx = resultWithNet.args.indexOf("--network");
    expect(netIdx).toBeGreaterThan(-1);
    expect(resultWithNet.args[netIdx + 1]).toBe("symphony-sandbox");
  });

  it("places image and command at the end", () => {
    const result = buildDockerRunArgs(baseInput());
    const imageIdx = result.args.indexOf("symphony-codex:latest");
    expect(imageIdx).toBeGreaterThan(-1);
    expect(result.args[imageIdx]).toBe("symphony-codex:latest");
    expect(result.args[imageIdx + 1]).toBe("bash");
    expect(result.args[imageIdx + 2]).toBe("-lc");
    expect(result.args[imageIdx + 3]).toContain(
      'printf "%s" "$SYMPHONY_CODEX_CONFIG_TOML" > "$CODEX_HOME/config.toml"',
    );
    expect(result.args[imageIdx + 3]).toContain('exec bash -lc "$SYMPHONY_CODEX_COMMAND"');
  });

  it("passes through env vars from host", () => {
    process.env.MY_SECRET = "hunter2";
    const cfg = baseSandboxConfig();
    cfg.envPassthrough = ["MY_SECRET", "MISSING_VAR"];
    const result = buildDockerRunArgs(baseInput({ sandboxConfig: cfg }));
    const envArgs = result.args.filter((_, i) => result.args[i - 1] === "-e");
    expect(envArgs).toContain("MY_SECRET=hunter2");
    expect(envArgs).not.toEqual(expect.arrayContaining([expect.stringContaining("MISSING_VAR")]));
  });

  it("passes through required provider env vars automatically", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const result = buildDockerRunArgs(baseInput({ requiredEnv: ["OPENAI_API_KEY"] }));
    const envArgs = result.args.filter((_, i) => result.args[i - 1] === "-e");
    expect(envArgs).toContain("OPENAI_API_KEY=sk-test");
  });

  it("passes auth payload into the container when present", () => {
    const result = buildDockerRunArgs(baseInput({ runtimeAuthJsonBase64: "eyJ0b2tlbiI6IngifQ==" }));
    const envArgs = result.args.filter((_, i) => result.args[i - 1] === "-e");
    expect(envArgs).toContain("SYMPHONY_CODEX_AUTH_JSON_B64=eyJ0b2tlbiI6IngifQ==");
  });

  it("includes extra user-defined mounts", () => {
    const cfg = baseSandboxConfig();
    cfg.extraMounts = ["/data/models:/models:ro"];
    const result = buildDockerRunArgs(baseInput({ sandboxConfig: cfg }));
    const mountArgs = result.args.filter((_, i) => result.args[i - 1] === "-v");
    expect(mountArgs).toContain("/data/models:/models:ro");
  });

  it("translates workspace and archive mounts through PathRegistry while preserving container workdir", () => {
    const result = buildDockerRunArgs(
      baseInput({
        workspacePath: "/data/workspaces/MT-1",
        archiveDir: "/data/archives",
        pathRegistry: new PathRegistry({
          "/data/workspaces": "/host/workspaces",
          "/data/archives": "/host/archives",
        }),
      }),
    );
    const mountArgs = result.args.filter((_, i) => result.args[i - 1] === "-v");
    expect(mountArgs).toContain("/host/workspaces/MT-1:/data/workspaces/MT-1");
    expect(mountArgs).toContain("/host/archives:/data/archives");
    const wdIdx = result.args.indexOf("--workdir");
    expect(result.args[wdIdx + 1]).toBe("/data/workspaces/MT-1");
  });

  it("includes observability labels", () => {
    const result = buildDockerRunArgs(baseInput({ issueIdentifier: "NIN-5", model: "gpt-5.4" }));
    const labelArgs = result.args.filter((_, i) => result.args[i - 1] === "--label");
    expect(labelArgs).toEqual(
      expect.arrayContaining([
        "symphony.issue=NIN-5",
        "symphony.model=gpt-5.4",
        expect.stringContaining("symphony.workspace=/tmp/workspaces/MT-1"),
        expect.stringMatching(/^symphony\.started-at=\d{4}-/),
      ]),
    );
    // Labels must appear before the image
    const firstLabelIdx = result.args.indexOf("--label");
    const imageIdx = result.args.indexOf("symphony-codex:latest");
    expect(firstLabelIdx).toBeLessThan(imageIdx);
  });

  it("omits issue and model labels when not provided", () => {
    const result = buildDockerRunArgs(baseInput());
    const labelArgs = result.args.filter((_, i) => result.args[i - 1] === "--label");
    expect(labelArgs).not.toEqual(expect.arrayContaining([expect.stringContaining("symphony.issue=")]));
    expect(labelArgs).not.toEqual(expect.arrayContaining([expect.stringContaining("symphony.model=")]));
    // workspace and started-at are always present
    expect(labelArgs).toEqual(
      expect.arrayContaining([
        expect.stringContaining("symphony.workspace="),
        expect.stringMatching(/^symphony\.started-at=/),
      ]),
    );
  });

  it("includes seccomp profile when set", () => {
    const cfg = baseSandboxConfig();
    cfg.security.seccompProfile = "/etc/docker/seccomp-strict.json";
    const result = buildDockerRunArgs(baseInput({ sandboxConfig: cfg }));
    expect(result.args).toContain("--security-opt=seccomp=/etc/docker/seccomp-strict.json");
  });

  it("omits seccomp when profile is empty", () => {
    const result = buildDockerRunArgs(baseInput());
    const seccompArgs = result.args.filter((a) => a.startsWith("--security-opt=seccomp="));
    expect(seccompArgs).toHaveLength(0);
  });

  it("adds CAP_NET_ADMIN and egress env when allowlist is non-empty", () => {
    const cfg = baseSandboxConfig();
    cfg.egressAllowlist = ["api.openai.com", "api.linear.app"];
    const result = buildDockerRunArgs(baseInput({ sandboxConfig: cfg }));
    expect(result.args).toContain("--cap-add=NET_ADMIN");
    const envArgs = result.args.filter((_, i) => result.args[i - 1] === "-e");
    expect(envArgs).toContain("SYMPHONY_EGRESS_ALLOWLIST=api.openai.com api.linear.app");
    // Entrypoint should contain iptables rules
    const bashScript = result.args[result.args.length - 1];
    expect(bashScript).toContain("iptables -A OUTPUT");
    expect(bashScript).toContain("SYMPHONY_EGRESS_ALLOWLIST");
  });

  it("does not add egress flags when allowlist is empty", () => {
    const result = buildDockerRunArgs(baseInput());
    expect(result.args).not.toContain("--cap-add=NET_ADMIN");
    const envArgs = result.args.filter((_, i) => result.args[i - 1] === "-e");
    expect(envArgs).not.toEqual(expect.arrayContaining([expect.stringContaining("SYMPHONY_EGRESS_ALLOWLIST")]));
    const bashScript = result.args[result.args.length - 1];
    expect(bashScript).not.toContain("iptables");
  });
});
