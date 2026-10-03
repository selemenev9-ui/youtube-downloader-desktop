const asar = require("@electron/asar");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pkg = require(path.join(root, "package.json"));
const stage = path.join(root, "dist-module-stage");
const outputDir = path.join(root, "dist", "updates");
const outputName = `vantafetch-app-${pkg.version}.asar`;
const outputPath = path.join(outputDir, outputName);

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });
for (const name of ["main.js", "preload.js", "src", "dist-ui"]) {
  fs.cpSync(path.join(root, name), path.join(stage, name), { recursive: true });
}

asar.createPackage(stage, outputPath).then(() => {
  const data = fs.readFileSync(outputPath);
  const sha256 = crypto.createHash("sha256").update(data).digest("hex");
  const manifest = {
    schema: 1,
    bootstrap: 1,
    version: pkg.version,
    module: { asset: outputName, sha256, size: data.length },
  };
  fs.writeFileSync(
    path.join(outputDir, "vantafetch-update.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
  fs.rmSync(stage, { recursive: true, force: true });
  console.log(JSON.stringify(manifest));
});
