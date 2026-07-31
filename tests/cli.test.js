import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { initProject } from "../src/commands/init.js";
import { disableProject } from "../src/commands/disable.js";
import { enableProject } from "../src/commands/enable.js";
import { doctorProject } from "../src/commands/doctor.js";

const packageRoot = path.resolve(import.meta.dirname, "..");

async function withTempProject(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "stitches-test-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("init installs Stitches templates into a project", async () => {
  await withTempProject(async (projectDir) => {
    const result = await initProject({ projectDir });

    assert.equal(result.created.length > 0, true);
    assert.match(
      await readFile(path.join(projectDir, "AGENTS.md"), "utf8"),
      /Stitches/
    );
    assert.match(
      await readFile(path.join(projectDir, ".opencode/commands/stitch-propose.md"), "utf8"),
      /OpenSpec/
    );
    assert.match(
      await readFile(path.join(projectDir, ".opencode/skills/stitches-workflow/SKILL.md"), "utf8"),
      /Stitches/
    );
    assert.deepEqual(
      result.created.filter((entry) => entry.includes(".DS_Store")),
      []
    );
    assert.deepEqual(
      (await readdir(path.join(projectDir, ".opencode/skills"))).sort(),
      ["stitches-review", "stitches-spec", "stitches-tdd", "stitches-workflow"]
    );
  });
});

test("disable and enable soft-toggle OpenCode Stitches entries", async () => {
  await withTempProject(async (projectDir) => {
    await initProject({ projectDir });

    const disabled = await disableProject({ projectDir });
    assert.deepEqual(disabled.disabled.sort(), [".opencode/commands", ".opencode/skills"]);

    const enabled = await enableProject({ projectDir });
    assert.deepEqual(enabled.enabled.sort(), [".opencode/commands", ".opencode/skills"]);
  });
});

test("doctor reports whether Stitches is installed", async () => {
  await withTempProject(async (projectDir) => {
    assert.equal((await doctorProject({ projectDir })).installed, false);

    await initProject({ projectDir });

    const result = await doctorProject({ projectDir });
    assert.equal(result.installed, true);
    assert.equal(result.commands, true);
    assert.equal(result.skills, true);
    assert.equal(result.openspec, true);
  });
});

test("ocss launcher starts OpenCode with the Stitches config and config directory", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8")
  );
  const launcher = await readFile(path.join(packageRoot, "bin/ocss"), "utf8");
  const config = JSON.parse(
    await readFile(path.join(packageRoot, "opencode.stitches.json"), "utf8")
  );
  const plugin = await readFile(
    path.join(packageRoot, "opencode/plugins/stitches.js"),
    "utf8"
  );

  assert.equal(packageJson.bin.ocss, "./bin/ocss");
  assert.match(launcher, /OPENCODE_CONFIG=/);
  assert.match(launcher, /OPENCODE_CONFIG_DIR=/);
  assert.doesNotMatch(launcher, /OPENCODE_CONFIG_DIR=.*\/opencode/);
  assert.match(launcher, /exec opencode "\$@"/);
  assert.deepEqual(config.plugin, ["./opencode/plugins/stitches.js"]);
  assert.match(plugin, /id:\s*"stitches"/);
  await stat(path.join(packageRoot, "commands/stitch-propose.md"));
  await stat(path.join(packageRoot, "skills/stitches-workflow/SKILL.md"));
  await assert.rejects(
    stat(path.join(packageRoot, "opencode/commands/stitch-propose.md")),
    { code: "ENOENT" }
  );
  await assert.rejects(
    stat(path.join(packageRoot, "templates/.opencode/commands/stitch-propose.md")),
    { code: "ENOENT" }
  );
});
