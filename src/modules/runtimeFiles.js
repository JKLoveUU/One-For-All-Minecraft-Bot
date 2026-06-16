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
  const patched = patchTomlFromDefault(configPath, path.join(defaultsDir, "config.toml"));
  if (patched.length > 0) {
    process.stderr.write(`[CONFIG] 自動補充缺少的設定項目: ${patched.join(', ')}\n`);
  }
}

function ensureFileFromDefault(targetPath, defaultPath) {
  if (fs.existsSync(targetPath)) return;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (!fs.existsSync(defaultPath)) {
    throw new Error(`Bundled default file missing: ${defaultPath}`);
  }
  fs.copyFileSync(defaultPath, targetPath);
}

/**
 * Parse a default TOML file's raw text into a section map, preserving
 * the comment lines that precede each key.
 * Returns: { [section]: { headerLine, headerPreamble[], keys: { [key]: { preamble[], lines[] } } } }
 * Only handles flat [section] headers (not [[array-of-tables]]).
 */
function parseDefaultSections(raw) {
  const lines = raw.split(/\r?\n/);
  const sections = Object.create(null);
  let currentSection = null;
  let pendingComments = [];
  let inMultiline = 0;
  let currentKey = null;
  let currentKeyLines = [];
  let currentKeyPreamble = [];

  const flushKey = () => {
    if (currentKey !== null && currentSection !== null) {
      sections[currentSection].keys[currentKey] = {
        preamble: currentKeyPreamble,
        lines: currentKeyLines,
      };
    }
    currentKey = null;
    currentKeyLines = [];
    currentKeyPreamble = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (inMultiline > 0) {
      currentKeyLines.push(line);
      for (const ch of trimmed) {
        if (ch === '[' || ch === '{') inMultiline++;
        else if (ch === ']' || ch === '}') inMultiline--;
      }
      if (inMultiline === 0) flushKey();
      continue;
    }

    if (trimmed === '' || trimmed.startsWith('#')) {
      if (currentKey !== null) flushKey();
      pendingComments.push(line);
      continue;
    }

    const secMatch = trimmed.match(/^\[([^\]]+)\]/);
    if (secMatch) {
      flushKey();
      const secName = secMatch[1].replace(/^"|"$/g, '');
      currentSection = secName;
      sections[secName] = {
        headerLine: line,
        headerPreamble: [...pendingComments],
        keys: Object.create(null),
      };
      pendingComments = [];
      continue;
    }

    const keyMatch = trimmed.match(/^([a-zA-Z0-9_]+)\s*=/);
    if (keyMatch && currentSection !== null) {
      flushKey();
      currentKey = keyMatch[1];
      currentKeyPreamble = [...pendingComments];
      currentKeyLines = [line];
      pendingComments = [];

      const valPart = trimmed.slice(trimmed.indexOf('=') + 1).trim();
      let depth = 0;
      for (const ch of valPart) {
        if (ch === '[' || ch === '{') depth++;
        else if (ch === ']' || ch === '}') depth--;
      }
      if (depth > 0) {
        inMultiline = depth;
      } else {
        flushKey();
      }
      continue;
    }

    pendingComments = [];
  }

  flushKey();
  return sections;
}

/**
 * Compare a user TOML file against the bundled default and append any
 * missing keys (with their default comments) into the correct sections.
 * Missing sections are appended at the end of the file.
 * Returns an array of "section.key" strings that were added, or [] if nothing changed.
 */
function patchTomlFromDefault(userPath, defaultPath) {
  if (!fs.existsSync(userPath) || !fs.existsSync(defaultPath)) return [];

  const defaultRaw = fs.readFileSync(defaultPath, 'utf8');
  const userRaw = fs.readFileSync(userPath, 'utf8');

  let defaultParsed, userParsed;
  try {
    defaultParsed = toml.parse(defaultRaw);
    userParsed = toml.parse(userRaw);
  } catch (_) {
    return [];
  }

  const defaultSections = parseDefaultSections(defaultRaw);

  // 區段名可能是點分巢狀表頭(如 "permission.groups");toml.parse 會把它解析成
  // userParsed.permission.groups,故須沿點分路徑下探,不能直接 `sec in userParsed`。
  const getByPath = (obj, dotted) => {
    let cur = obj;
    for (const part of dotted.split('.')) {
      if (cur == null || typeof cur !== 'object' || !(part in cur)) return undefined;
      cur = cur[part];
    }
    return cur;
  };

  // Collect what needs to be added
  const missingSectionKeys = Object.create(null); // sec -> [key, ...]
  const missingSections = [];

  for (const [sec, secData] of Object.entries(defaultSections)) {
    const userSec = getByPath(userParsed, sec);
    if (userSec === undefined || typeof userSec !== 'object') {
      missingSections.push(sec);
    } else {
      const missingKeys = Object.keys(secData.keys).filter(k => !(k in userSec));
      if (missingKeys.length > 0) missingSectionKeys[sec] = missingKeys;
    }
  }

  if (missingSections.length === 0 && Object.keys(missingSectionKeys).length === 0) return [];

  // Rebuild user file, injecting missing keys at the end of each section
  const userLines = userRaw.split(/\r?\n/);
  const output = [];
  let currentSec = null;
  let tailBuffer = [];
  const added = [];

  const injectMissing = (secName) => {
    const keys = missingSectionKeys[secName];
    if (!keys || keys.length === 0) return;
    const secData = defaultSections[secName];
    output.push('  # --- 以下設定為版本更新後自動補充 ---');
    for (const key of keys) {
      const keyData = secData.keys[key];
      for (const commentLine of keyData.preamble) output.push(commentLine);
      for (const valueLine of keyData.lines) output.push(valueLine);
      added.push(`${secName}.${key}`);
    }
  };

  for (const line of userLines) {
    const trimmed = line.trim();
    const secMatch = trimmed.match(/^\[([^\]]+)\]/);

    if (secMatch) {
      injectMissing(currentSec);
      output.push(...tailBuffer);
      tailBuffer = [];
      currentSec = secMatch[1].replace(/^"|"$/g, '');
      output.push(line);
    } else if (trimmed === '' || trimmed.startsWith('#')) {
      tailBuffer.push(line);
    } else {
      output.push(...tailBuffer);
      tailBuffer = [];
      output.push(line);
    }
  }

  injectMissing(currentSec);
  output.push(...tailBuffer);

  // Append entirely missing sections
  for (const sec of missingSections) {
    const secData = defaultSections[sec];
    output.push('');
    for (const commentLine of secData.headerPreamble) output.push(commentLine);
    output.push(secData.headerLine);
    for (const [key, keyData] of Object.entries(secData.keys)) {
      for (const commentLine of keyData.preamble) output.push(commentLine);
      for (const valueLine of keyData.lines) output.push(valueLine);
      added.push(`${sec}.${key}`);
    }
  }

  fs.writeFileSync(userPath, output.join('\n'), 'utf8');
  return added;
}

// isCashierStaff:此 bot 帳號是否擔任出納(負責綠寶石出入金:監聽入金 + 受理出金)。
// 讀 config.toml 的 [setting] cashier_staff 清單;空 / 未設 = 不限(所有帳號都處理,向後相容)。
function isCashierStaff(name) {
  const list = runtimeConfig && runtimeConfig.setting && runtimeConfig.setting.cashier_staff;
  if (!Array.isArray(list) || list.length === 0) return true;
  return list.includes(name);
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
  patchTomlFromDefault,
  isCashierStaff,
};
