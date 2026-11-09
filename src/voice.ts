/** ElevenLabs text-to-speech with character timestamps. Cached in public/cache/audio by hash(text, voice, model, settings). */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ELEVENLABS } from "./config";
import { keyOrPlaceholder, PUBLIC, OUT } from "./env";
import type { Clip, Lang, Word } from "./types";
export { dryClip } from "./dry";

const API = "https://api.elevenlabs.io/v1";
const hdr = () => ({ "xi-api-key": keyOrPlaceholder("ELEVENLABS_API_KEY"), "Content-Type": "application/json" });

export function probeDuration(file: string): number {
  return parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());
}

type Alignment = { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };

export function wordsFromAlignment(a: Alignment): Word[] {
  const words: Word[] = []; let cur = "", start = 0, end = 0;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) { if (cur) words.push({ text: cur, start, end }); cur = ""; return; }
    if (!cur) start = a.character_start_times_seconds[i];
    cur += ch; end = a.character_end_times_seconds[i];
  });
  if (cur) words.push({ text: cur, start, end });
  return words;
}

export async function tts(text: string, lang: Lang, voiceId?: string, outFile?: string): Promise<Clip> {
  const c = ELEVENLABS;
  const voice = voiceId || (lang === "es" ? c.voiceEs : c.voiceEn);
  if (!voice) throw new Error("Set ELEVENLABS.voiceEn / voiceEs in src/config.ts (run `npm run audition` first).");
  const model = lang === "es" ? c.modelEs : c.modelEn;
  const settings = { stability: c.stability, similarity_boost: c.similarityBoost, style: c.style, speed: c.speed, use_speaker_boost: true };
  const hash = crypto.createHash("sha1").update([text, voice, model, JSON.stringify(settings)].join("|")).digest("hex").slice(0, 16);
  const rel = `cache/audio/${hash}.mp3`;
  const mp3 = outFile ?? path.join(PUBLIC, rel);
  const meta = mp3.replace(/\.mp3$/, ".json");
  if (fs.existsSync(mp3) && fs.existsSync(meta)) return JSON.parse(fs.readFileSync(meta, "utf8")) as Clip;

  const r = await fetch(`${API}/text-to-speech/${voice}/with-timestamps?output_format=${c.outputFormat}`, {
    method: "POST", headers: hdr(),
    body: JSON.stringify({ text, model_id: model, voice_settings: settings }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { audio_base64: string; alignment: Alignment };
  fs.mkdirSync(path.dirname(mp3), { recursive: true });
  fs.writeFileSync(mp3, Buffer.from(j.audio_base64, "base64"));
  const words = wordsFromAlignment(j.alignment);
  const clip: Clip = {
    src: outFile ? null : rel, text, duration: probeDuration(mp3),
    speechStart: words[0]?.start ?? 0, speechEnd: words.at(-1)?.end ?? probeDuration(mp3), words,
  };
  fs.writeFileSync(meta, JSON.stringify(clip, null, 1));
  return clip;
}


export async function listVoices() {
  const r = await fetch(`${API}/voices`, { headers: hdr() });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${await r.text()}`);
  return ((await r.json()) as { voices: { voice_id: string; name: string; labels: Record<string, string> }[] }).voices;
}

export async function audition(text: string) {
  const dir = path.join(OUT, "audition"); fs.mkdirSync(dir, { recursive: true });
  const voices = await listVoices();
  const ids = ELEVENLABS.auditionVoices.length ? ELEVENLABS.auditionVoices : voices.slice(0, 8).map((v) => v.voice_id);
  for (const id of ids) {
    const name = (voices.find((v) => v.voice_id === id)?.name ?? id).split(" - ")[0].replace(/\W+/g, "_");
    const clip = await tts(text, "en", id, path.join(dir, `${name}_${id}.mp3`));
    console.log(`${name.padEnd(10)} ${id}  ${clip.duration.toFixed(1)}s  out/audition/${name}_${id}.mp3`);
  }
}
