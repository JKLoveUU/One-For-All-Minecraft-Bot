const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function pad2(value) {
  return String(value).padStart(2, "0");
}

function dateStamp(date = new Date()) {
  return [
    pad2(date.getFullYear() % 100),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join("");
}

const compress = process.argv.includes("--compress");
const releaseDir = path.resolve("release");
const output = path.join(releaseDir, `${dateStamp()}ofa.exe`);
const pkgBin = process.platform === "win32" ? "pkg.cmd" : "pkg";
const args = ["index.js", "-t", "node22-win-x64"];

if (compress) args.push("--compress", "GZip");
args.push("-o", output);

fs.mkdirSync(releaseDir, { recursive: true });
console.log(`Building Windows exe: ${output}`);

const result = spawnSync(pkgBin, args, {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
