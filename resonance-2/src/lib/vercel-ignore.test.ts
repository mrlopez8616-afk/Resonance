import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const RESONANCE3_PROJECT_ID = "prj_X4ZJXArkUXpdjBJ4sKSzjkkKsVlT";

const IGNORE_COMMAND =
  'if [ -z "$VERCEL_PROJECT_ID" ]; then exit 1; fi; if [ "$VERCEL_PROJECT_ID" = "prj_X4ZJXArkUXpdjBJ4sKSzjkkKsVlT" ] && [ "$VERCEL_ENV" = "production" ]; then exit 1; fi; exit 0';

const libDir = path.dirname(fileURLToPath(import.meta.url));
const resonance2Root = path.resolve(libDir, "../..");
const repoRoot = path.resolve(resonance2Root, "..");

const configPaths = [path.join(repoRoot, "vercel.json"), path.join(resonance2Root, "vercel.json")];

function readIgnoreCommand(file: string): string {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(typeof parsed, "object");
  assert.ok(parsed);
  assert.equal(Array.isArray(parsed), false);
  const ignoreCommand = (parsed as { ignoreCommand?: unknown }).ignoreCommand;
  assert.equal(typeof ignoreCommand, "string");
  return ignoreCommand as string;
}

function exitCode(
  command: string,
  projectId: string | undefined,
  vercelEnv: string | undefined,
): number {
  const env = { ...process.env };
  delete env.VERCEL_PROJECT_ID;
  delete env.VERCEL_ENV;
  if (projectId !== undefined) env.VERCEL_PROJECT_ID = projectId;
  if (vercelEnv !== undefined) env.VERCEL_ENV = vercelEnv;
  try {
    execFileSync("sh", ["-c", command], { env, stdio: "pipe" });
    return 0;
  } catch (error) {
    const status = (error as { status?: number | null }).status;
    assert.equal(typeof status, "number");
    return status as number;
  }
}

describe("vercel ignoreCommand", () => {
  it("keeps the same ignoreCommand in the root and resonance-2 vercel.json files", () => {
    const commands = configPaths.map((file) => readIgnoreCommand(file));
    assert.equal(commands[0], commands[1]);
    assert.equal(commands[0], IGNORE_COMMAND);
    assert.ok(IGNORE_COMMAND.length < 256);

    const root = JSON.parse(readFileSync(configPaths[0], "utf8")) as Record<string, unknown>;
    assert.deepEqual(Object.keys(root), ["ignoreCommand"]);
  });

  const cases: Array<{
    name: string;
    projectId?: string;
    vercelEnv?: string;
    code: number;
  }> = [
    {
      name: "resonance3 production builds",
      projectId: RESONANCE3_PROJECT_ID,
      vercelEnv: "production",
      code: 1,
    },
    {
      name: "resonance3 preview skips",
      projectId: RESONANCE3_PROJECT_ID,
      vercelEnv: "preview",
      code: 0,
    },
    {
      name: "another project production skips",
      projectId: "prj_other",
      vercelEnv: "production",
      code: 0,
    },
    {
      name: "another project preview skips",
      projectId: "prj_other",
      vercelEnv: "preview",
      code: 0,
    },
    {
      name: "unset project id builds",
      vercelEnv: "production",
      code: 1,
    },
  ];

  for (const item of cases) {
    it(item.name, () => {
      const command = readIgnoreCommand(configPaths[0]);
      assert.equal(exitCode(command, item.projectId, item.vercelEnv), item.code);
    });
  }
});
