import fs from "fs";
import { runSync } from "./sync-jobs.mjs";

const raw = fs.readFileSync(".env.local", "utf8");
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  let k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim().replace(/^"|"$/g, "");
  if (k && v) process.env[k] = v;
}

const start = Date.now();
await runSync();
console.log("TOTAL SYNC MS:", Date.now() - start);