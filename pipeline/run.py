"""Orchestrator.
  python pipeline/run.py --format pass5 --lang en --count 1 [--state Texas] [--dry-run]
--dry-run: no API calls (uses docs/sample_set.json, template VO lines from silent placeholders) to test the render path.
"""
import argparse, json, math, subprocess, sys, time, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from common import CONFIG, ROOT, OUT, CACHE
from fetch_set import build
from speakable import speakable, speakable_dry
from hooks import hooks
from tts import tts, duration
from plan import build_plan

def silent(seconds, path):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", str(seconds), str(path)], check=True); return path

def fetch_images(questions, dest):
    import urllib.request
    for q in questions:
        if q.get("image_url"):
            p = dest / f"{q['id']}.png"
            if not p.exists(): urllib.request.urlretrieve(q["image_url"], p)
            q["image_url"] = str(p)

def make(fmt, lang, state, dry):
    vid = f"{fmt}_{lang}_{int(time.time())}"
    work = OUT / vid; work.mkdir(parents=True, exist_ok=True)
    qs = json.load(open(ROOT / "docs/sample_set.json")) if dry else build(fmt, lang, state)
    fetch_images(qs, CACHE / "images") if not dry else None
    if dry:
        for q in qs: q["image_url"] = str(ROOT / "docs/sample_sign.png") if q.get("image_url") else None
    speak = [speakable_dry(q) if dry else speakable(q, lang) for q in qs]
    think = CONFIG["formats"][fmt]["think"]
    if dry:
        aq = [(silent(3, work / f"q{i}.mp3"), 3.0) for i in range(len(qs))]
        ar = [(silent(2, work / f"r{i}.mp3"), 2.0) for i in range(len(qs))]
    else:
        aq = [(p := tts(s["question_vo"], lang), duration(p)) for s in speak]
        ar = [(p := tts(s["reveal_vo"], lang), duration(p)) for s in speak]
    secs = round(sum(math.ceil(d) + think for _, d in aq) / len(aq))
    timing = {"count": len(qs), "seconds_per_question": secs}
    h = hooks(qs, fmt, lang, timing, state, dry=dry)
    if dry:
        ah = (silent(3, work / "hook.mp3"), 3.0); ao = (silent(3, work / "outro.mp3"), 3.0)
    else:
        ah = (p := tts(h["vo_line"], lang), duration(p)); ao = (p := tts(h["outro_vo"], lang), duration(p))
    plan = build_plan(vid, qs, speak, h, {"hook": ah, "outro": ao, "q": aq, "r": ar}, fmt, lang)
    json.dump(plan, open(work / "plan.json", "w"), indent=1)
    subprocess.run(["node", str(ROOT / "render/render.js"), str(work / "plan.json")], check=True)
    subprocess.run(["bash", str(ROOT / "render/assemble.sh"), str(work)], check=True)
    json.dump({"caption": h["caption"], "hashtags": h["hashtags"], "hook": h, "questions": [q["id"] for q in qs]}, open(work / "post.json", "w"), indent=1)
    print(f"OK {work / 'video.mp4'}  {plan['total']:.1f}s")

if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("--format", default="pass5"); a.add_argument("--lang", default="en"); a.add_argument("--count", type=int, default=1)
    a.add_argument("--state"); a.add_argument("--dry-run", action="store_true")
    args = a.parse_args()
    for _ in range(args.count): make(args.format, args.lang, args.state, args.dry_run)
