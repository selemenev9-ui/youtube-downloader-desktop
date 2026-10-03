const { app } = require("electron");
const crypto = require("crypto");
const fs = require("original-fs");
const path = require("path");

const moduleRoot = path.join(app.getPath("userData"), "app-modules");
const activePath = path.join(moduleRoot, "active.json");
const pendingPath = path.join(moduleRoot, "boot-pending.json");
process.env.VANTAFETCH_BOOTSTRAP_DIR = __dirname;

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value), "utf8");
}

function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function validModule(moduleInfo) {
  if (!moduleInfo?.file || !moduleInfo?.sha256 || !moduleInfo?.version)
    return false;
  const filePath = path.join(moduleRoot, path.basename(moduleInfo.file));
  return (
    fs.existsSync(filePath) &&
    sha256(filePath) === moduleInfo.sha256.toLowerCase()
  );
}

let activeState = readJson(activePath);
const pending = readJson(pendingPath);
if (pending && activeState?.current?.version === pending.version) {
  activeState = { current: activeState.previous || null, previous: null };
  writeJson(activePath, activeState);
  try {
    fs.rmSync(pendingPath, { force: true });
  } catch {}
}

if (activeState?.current && !validModule(activeState.current)) {
  activeState = {
    current: validModule(activeState.previous) ? activeState.previous : null,
    previous: null,
  };
  writeJson(activePath, activeState);
}

function loadEmbedded() {
  process.env.VANTAFETCH_MODULE_VERSION = app.getVersion();
  require("./main.js");
}

if (activeState?.current && validModule(activeState.current)) {
  const current = activeState.current;
  writeJson(pendingPath, { version: current.version, startedAt: Date.now() });
  global.__vantafetchMarkHealthy = () => {
    try {
      fs.rmSync(pendingPath, { force: true });
    } catch {}
  };
  process.env.VANTAFETCH_MODULE_VERSION = current.version;
  try {
    require(path.join(moduleRoot, path.basename(current.file), "main.js"));
  } catch {
    activeState = { current: activeState.previous || null, previous: null };
    writeJson(activePath, activeState);
    try {
      fs.rmSync(pendingPath, { force: true });
    } catch {}
    loadEmbedded();
  }
} else {
  loadEmbedded();
}
