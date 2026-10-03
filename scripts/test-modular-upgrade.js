const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { UpdateService } = require("../src/main/services/UpdateService");

async function main() {
  const root = path.resolve(__dirname, "..");
  const testRoot = path.join(root, "test-upgrade-user");
  const moduleDirectory = path.join(testRoot, "app-modules");
  const currentPath = path.join(
    root,
    "dist",
    "updates",
    "vantafetch-app-2.0.0.asar",
  );
  const current = fs.readFileSync(currentPath);
  const update = Buffer.from(current);
  const digest = (value) =>
    crypto.createHash("sha256").update(value).digest("hex");

  fs.rmSync(testRoot, { recursive: true, force: true });
  fs.mkdirSync(moduleDirectory, { recursive: true });
  fs.copyFileSync(currentPath, path.join(moduleDirectory, path.basename(currentPath)));
  fs.writeFileSync(
    path.join(moduleDirectory, "active.json"),
    JSON.stringify({
      current: {
        file: path.basename(currentPath),
        sha256: digest(current),
        version: "2.0.0",
      },
      previous: null,
    }),
  );

  const service = new UpdateService({
    currentVersion: "2.0.0",
    moduleDirectory,
  });
  service.latest = {
    version: "2.0.1",
    sha256: digest(update),
    size: update.length,
    asset: "vantafetch-app-2.0.1.asar",
    downloadUrl: "https://github.com/test/module.asar",
  };
  global.fetch = async () => new Response(update);
  const progress = [];
  const result = await service.install((value) => progress.push(value));
  const state = JSON.parse(
    fs.readFileSync(path.join(moduleDirectory, "active.json"), "utf8"),
  );

  if (
    result.version !== "2.0.1" ||
    state.current.version !== "2.0.1" ||
    state.previous.version !== "2.0.0" ||
    progress.at(-1) !== 100
  ) {
    throw new Error("The modular upgrade test did not produce the expected state.");
  }
  console.log(
    JSON.stringify({ testRoot, result, progress: progress.at(-1), state }),
  );
  fs.rmSync(testRoot, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
