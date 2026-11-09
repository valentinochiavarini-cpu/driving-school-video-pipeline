import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CACHE = path.join(ROOT, "cache");
export const OUT = path.join(ROOT, "out");
export const PUBLIC = path.join(ROOT, "public");
for (const d of [CACHE, OUT, path.join(PUBLIC, "cache", "audio"), path.join(PUBLIC, "cache", "images"), path.join(CACHE, "json")])
  fs.mkdirSync(d, { recursive: true });

const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

/** API keys: in Claude Code cloud sessions the proxy injects the real value, so a placeholder is fine. */
export function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`Missing env var ${name} (see .env.example)`);
  return v;
}
export const keyOrPlaceholder = (name: string) => process.env[name] || "proxy-injected";

export function jsonCache<T>(key: string): { path: string; data: T | null } {
  const p = path.join(CACHE, "json", `${key}.json`);
  return { path: p, data: fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")) as T) : null };
}
export const writeJson = (p: string, data: unknown) => fs.writeFileSync(p, JSON.stringify(data, null, 1));
