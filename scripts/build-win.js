const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const iconSource = path.resolve("docs", "img", "oneforall_discord_icon_v1.png");
const iconResourceId = 1;

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
const skipIcon = process.argv.includes("--no-icon");
const releaseDir = path.resolve("release");
const output = path.join(releaseDir, `${dateStamp()}ofa.exe`);
const iconOutput = path.join(releaseDir, "oneforall.ico");
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

if (result.status !== 0) process.exit(result.status ?? 1);

if (!skipIcon) {
  applyIcon(output, iconSource, iconOutput);
}

process.exit(0);

function applyIcon(exePath, pngPath, icoPath) {
  if (process.platform !== "win32") {
    console.warn("Skipping Windows icon update: this step requires Windows.");
    return;
  }
  if (!fs.existsSync(pngPath)) {
    throw new Error(`Icon source not found: ${pngPath}`);
  }

  const png = fs.readFileSync(pngPath);
  const { width, height } = readPngSize(pngPath, png);
  if (width > 256 || height > 256) {
    throw new Error(`Icon PNG must be 256x256 or smaller: ${pngPath} is ${width}x${height}`);
  }

  fs.writeFileSync(icoPath, createIcoFromPng(png, width, height));

  const groupPath = path.join(releaseDir, ".oneforall-icon-group.bin");
  fs.writeFileSync(groupPath, createGroupIconResource(png, width, height, iconResourceId));

  try {
    console.log(`Applying exe icon: ${pngPath}`);
    const ps = spawnSync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      iconUpdateScript(exePath, pngPath, groupPath, iconResourceId),
    ], { stdio: "inherit" });

    if (ps.error) throw ps.error;
    if (ps.status !== 0) process.exit(ps.status ?? 1);
  } finally {
    try { fs.unlinkSync(groupPath); } catch (_) {}
  }
}

function readPngSize(file, png) {
  if (
    png.length < 24 ||
    png[0] !== 0x89 ||
    png[1] !== 0x50 ||
    png[2] !== 0x4e ||
    png[3] !== 0x47
  ) {
    throw new Error(`Icon source is not a PNG: ${file}`);
  }
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

function iconByte(size) {
  return size >= 256 ? 0 : size;
}

function createIcoFromPng(png, width, height) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry.writeUInt8(iconByte(width), 0);
  entry.writeUInt8(iconByte(height), 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  return Buffer.concat([header, entry, png]);
}

function createGroupIconResource(png, width, height, resourceId) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(14);
  entry.writeUInt8(iconByte(width), 0);
  entry.writeUInt8(iconByte(height), 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt16LE(resourceId, 12);

  return Buffer.concat([header, entry]);
}

function psString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function iconUpdateScript(exePath, pngPath, groupPath, resourceId) {
  return `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class NativeMethods {
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern IntPtr BeginUpdateResource(string pFileName, bool bDeleteExistingResources);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool UpdateResource(IntPtr hUpdate, IntPtr lpType, IntPtr lpName, ushort wLanguage, byte[] lpData, uint cbData);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool EndUpdateResource(IntPtr hUpdate, bool fDiscard);
}
'@

function ThrowLastWin32([string] $action) {
  $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  throw "$action failed with Win32 error $err"
}

$exe = ${psString(exePath)}
$iconBytes = [IO.File]::ReadAllBytes(${psString(pngPath)})
$groupBytes = [IO.File]::ReadAllBytes(${psString(groupPath)})
$h = [NativeMethods]::BeginUpdateResource($exe, $false)
if ($h -eq [IntPtr]::Zero) { ThrowLastWin32 'BeginUpdateResource' }

$ok = [NativeMethods]::UpdateResource($h, [IntPtr]3, [IntPtr]${resourceId}, 0, $iconBytes, [uint32]$iconBytes.Length)
if (-not $ok) {
  [NativeMethods]::EndUpdateResource($h, $true) | Out-Null
  ThrowLastWin32 'UpdateResource RT_ICON'
}

$ok = [NativeMethods]::UpdateResource($h, [IntPtr]14, [IntPtr]${resourceId}, 0, $groupBytes, [uint32]$groupBytes.Length)
if (-not $ok) {
  [NativeMethods]::EndUpdateResource($h, $true) | Out-Null
  ThrowLastWin32 'UpdateResource RT_GROUP_ICON'
}

$ok = [NativeMethods]::EndUpdateResource($h, $false)
if (-not $ok) { ThrowLastWin32 'EndUpdateResource' }
`;
}
