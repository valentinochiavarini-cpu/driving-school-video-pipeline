"""ElevenLabs direct API. One mp3 per line, cached by hash(text, voice, settings).
Also: --audition "<text>" renders the text in every voice in config elevenlabs.audition_voices.
"""
import json, subprocess, sys, urllib.request
from common import CONFIG, CACHE, OUT, env, sha

AUDIO = CACHE / "audio"; AUDIO.mkdir(parents=True, exist_ok=True)

def duration(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]).decode().strip())

def tts(text, lang="en", voice_id=None, out=None):
    c = CONFIG["elevenlabs"]
    voice = voice_id or (c["voice_es"] if lang == "es" else c["voice_en"])
    if not voice: raise SystemExit("Set elevenlabs.voice_en / voice_es in config.yaml (run --audition first).")
    model = c["model_es"] if lang == "es" else c["model_en"]
    settings = {"stability": c["stability"], "similarity_boost": c["similarity_boost"], "style": c["style"], "speed": c["speed"]}
    path = out or AUDIO / f"{sha(text, voice, model, json.dumps(settings))}.mp3"
    if path.exists(): return path
    body = json.dumps({"text": text, "model_id": model, "voice_settings": settings}).encode()
    req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format={c['output_format']}",
                                 data=body, headers={"xi-api-key": env("ELEVENLABS_API_KEY"), "Content-Type": "application/json", "Accept": "audio/mpeg"})
    with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as f: f.write(r.read())
    # trim leading/trailing silence so timing is tight
    tmp = path.with_suffix(".trim.mp3")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(path), "-af",
                    "silenceremove=start_periods=1:start_silence=0.05:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_silence=0.15:start_threshold=-45dB,areverse",
                    str(tmp)], check=True)
    tmp.replace(path)
    return path

def list_voices():
    req = urllib.request.Request("https://api.elevenlabs.io/v1/voices", headers={"xi-api-key": env("ELEVENLABS_API_KEY")})
    with urllib.request.urlopen(req, timeout=60) as r: return json.load(r)["voices"]

if __name__ == "__main__":
    if "--voices" in sys.argv:
        for v in list_voices(): print(v["voice_id"], v["name"], v.get("labels", {}))
    elif "--audition" in sys.argv:
        text = sys.argv[sys.argv.index("--audition") + 1]
        ids = CONFIG["elevenlabs"]["audition_voices"] or [v["voice_id"] for v in list_voices()[:8]]
        d = OUT / "audition"; d.mkdir(exist_ok=True)
        for vid in ids:
            p = tts(text, voice_id=vid, out=d / f"{vid}.mp3"); print(vid, f"{duration(p):.1f}s", p)
    else:
        print(tts(sys.argv[1]))
