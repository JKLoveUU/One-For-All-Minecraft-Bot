const fs = require("fs");
const path = require("path");
const toml = require("toml");

const runtimeDir = process.pkg ? path.dirname(process.execPath) : process.cwd();
const defaultsDir = path.resolve(__dirname, "../../defaults");
const configPath = path.join(runtimeDir, "config.toml");
const profilesPath = path.join(runtimeDir, "profiles.json");

const runtimeConfig = {};
const runtimeProfiles = {};

function ensureRuntimeFiles() {
  ensureFileFromDefault(configPath, path.join(defaultsDir, "config.toml"));
  ensureFileFromDefault(profilesPath, path.join(defaultsDir, "profiles.json"));
}

function ensureFileFromDefault(targetPath, defaultPath) {
  if (fs.existsSync(targetPath)) return;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (!fs.existsSync(defaultPath)) {
    throw new Error(`Bundled default file missing: ${defaultPath}`);
  }
  fs.copyFileSync(defaultPath, targetPath);
}

function replaceObject(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  for (const [key, value] of Object.entries(source || {})) target[key] = value;
  return target;
}

function loadConfig(target = runtimeConfig) {
  ensureRuntimeFiles();
  const raw = fs.readFileSync(configPath, "utf8");
  return replaceObject(target, toml.parse(raw));
}

function loadProfiles(target = runtimeProfiles) {
  ensureRuntimeFiles();
  const raw = fs.readFileSync(profilesPath, "utf8");
  return replaceObject(target, JSON.parse(raw));
}

function startFileReload(filePath, load, target, options = {}) {
  const intervalMs = options.intervalMs || 1000;
  const onReload = typeof options.onReload === "function" ? options.onReload : null;
  const onError = typeof options.onError === "function" ? options.onError : null;
  let lastMtimeMs = getMtimeMs(filePath);
  let lastError = "";

  const timer = setInterval(() => {
    const mtimeMs = getMtimeMs(filePath);
    if (!mtimeMs || mtimeMs === lastMtimeMs) return;
    try {
      load(target);
      lastMtimeMs = mtimeMs;
      lastError = "";
      if (onReload) onReload(target, filePath);
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      if (message !== lastError && onError) onError(err, filePath);
      lastError = message;
    }
  }, intervalMs);

  if (typeof timer.unref === "function") timer.unref();
  return { stop: () => clearInterval(timer) };
}

function getMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch (_) {
    return 0;
  }
}

function startConfigAutoReload(target = runtimeConfig, options = {}) {
  return startFileReload(configPath, loadConfig, target, options);
}

function startProfilesAutoReload(target = runtimeProfiles, options = {}) {
  return startFileReload(profilesPath, loadProfiles, target, options);
}

module.exports = {
  runtimeDir,
  defaultsDir,
  configPath,
  profilesPath,
  runtimeConfig,
  runtimeProfiles,
  ensureRuntimeFiles,
  loadConfig,
  loadProfiles,
  startConfigAutoReload,
  startProfilesAutoReload,
};
