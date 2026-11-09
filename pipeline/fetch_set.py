"""Pull questions from Supabase and build a non-overlapping set for a format.
Mirrors src/lib/creatorSets.ts: image first, no same category back to back, excluded categories removed.
A ledger in cache/used.json keeps sets from repeating across runs (per format + lang).
"""
import json, random, sys, urllib.request, urllib.parse
from common import CONFIG, CACHE, env, localized

LEDGER = CACHE / "used.json"

def fetch_all():
    p, data = __import__("common").jcache("questions_all")
    if data: return data
    url = env("SUPABASE_URL") + "/rest/v1/questions?select=*&limit=5000"
    req = urllib.request.Request(url, headers={"apikey": env("SUPABASE_ANON_KEY"), "Authorization": "Bearer " + env("SUPABASE_ANON_KEY")})
    with urllib.request.urlopen(req, timeout=60) as r: data = json.load(r)
    json.dump(data, open(p, "w")); return data

def order(picked):
    rest = picked[:]; random.shuffle(rest); out = []
    img = next((i for i, q in enumerate(rest) if q.get("image_url")), -1)
    if img >= 0: out.append(rest.pop(img))
    while rest:
        i = next((i for i, q in enumerate(rest) if not out or q["category"] != out[-1]["category"]), 0)
        out.append(rest.pop(i))
    return out

def build(fmt_id, lang="en", state=None, state_count=None):
    fmt = CONFIG["formats"][fmt_id]; excluded = set(CONFIG["excluded_categories"])
    ledger = json.load(open(LEDGER)) if LEDGER.exists() else {}
    used = set(ledger.get(f"{fmt_id}:{lang}", []))
    all_q = fetch_all()
    base = [q for q in all_q if q["id"] not in used and q["category"] not in excluded]
    general = [q for q in base if q["state"] is None]
    if fmt.get("image_only"): general = [q for q in general if q.get("image_url")]
    if fmt.get("categories"): general = [q for q in general if q["category"] in fmt["categories"]]
    size = fmt["size"] if fmt["size"] != "state" else (state_count or 30)
    random.shuffle(general)
    picked = []
    if fmt.get("with_state") and state:
        local = [q for q in base if q["state"] == state]; random.shuffle(local)
        picked += local[: max(1, size // 3)]
    if fmt.get("image_first") and not any(q.get("image_url") for q in general[: size - len(picked)]):
        img = next((q for q in general if q.get("image_url")), None)
        if img: general.remove(img); picked.append(img)
    picked += general[: size - len(picked)]
    if len(picked) < size: raise SystemExit(f"Not enough unused questions for {fmt_id} ({len(picked)}/{size}). Reset cache/used.json or widen the filter.")
    picked = order(picked)
    ledger.setdefault(f"{fmt_id}:{lang}", []).extend(q["id"] for q in picked)
    json.dump(ledger, open(LEDGER, "w"), indent=1)
    return [localized(q, lang) for q in picked]

if __name__ == "__main__":
    print(json.dumps(build(sys.argv[1] if len(sys.argv) > 1 else "pass5", sys.argv[2] if len(sys.argv) > 2 else "en"), indent=1))
