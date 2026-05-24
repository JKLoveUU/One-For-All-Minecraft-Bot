#!/usr/bin/env node
// build 前清掉 node_modules/minecraft-data 內不需要的 PC/bedrock 版本資料，
// 大幅縮小 pkg 打包後的 binary。重跑 `npm install` 即可還原。

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "node_modules", "minecraft-data", "minecraft-data", "data");

const PC_KEEP = new Set([
  "common", "latest",
  // 1.21.x cross-ref 依賴
  "1.8", "1.16.1", "1.20", "1.20.2", "1.20.3", "1.20.5",
  // 實際使用的 1.21.x 系列
  "1.21", "1.21.1", "1.21.3", "1.21.4", "1.21.5", "1.21.6", "1.21.8", "1.21.9", "1.21.11",
]);

const BEDROCK_KEEP = new Set(["common"]);

function pruneDir(dir, keepSet, label) {
  if (!fs.existsSync(dir)) {
    console.log(`[prune] skip: ${dir} not found`);
    return { deleted: 0, kept: 0 };
  }
  let deleted = 0;
  let kept = 0;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (!stat.isDirectory()) continue;
    if (keepSet.has(name)) {
      kept++;
      continue;
    }
    fs.rmSync(full, { recursive: true, force: true });
    deleted++;
  }
  console.log(`[prune] ${label}: deleted ${deleted}, kept ${kept}`);
  return { deleted, kept };
}

function main() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`[prune] ERROR: ${DATA_DIR} not found. Did you run \`npm install\`?`);
    process.exit(1);
  }
  pruneDir(path.join(DATA_DIR, "pc"), PC_KEEP, "pc");
  pruneDir(path.join(DATA_DIR, "bedrock"), BEDROCK_KEEP, "bedrock");
  console.log("[prune] done. (run `npm install` to restore full data)");
}

main();
