"""Send assets/qbank/import.json to the ingest import_questions action in batches (<= 60 inserts, <= 20 updates).
Records inserted and updated ids in assets/qbank/imported-<tag>.json for rollback and resumes after a failed batch.
Uses curl so the session proxy injects the ingest token.
usage: python3 -I tools/qbank/push.py <repo root> <tag>"""
import sys, os, json, subprocess

ROOT, TAG = sys.argv[1], sys.argv[2]
Q = os.path.join(ROOT, "assets/qbank")
URL = "https://ksiqvvoqlzdihjubaxbm.supabase.co/functions/v1/ingest"

p = json.load(open(os.path.join(Q, "import.json")))
ins = [{k: v for k, v in r.items() if not (k == "image_url" and v is None)} for r in p["inserts"]]
log_path = os.path.join(Q, f"imported-{TAG}.json")
log = json.load(open(log_path)) if os.path.exists(log_path) else {"inserted_ids": [], "updated_ids": [], "batches_done": 0}

batches = [ins[i:i + 60] for i in range(0, len(ins), 60)]
for b, chunk in enumerate(batches):
    if b < log["batches_done"]:
        continue
    updates = p["updates"] if b == len(batches) - 1 else []
    body = json.dumps({"action": "import_questions", "inserts": chunk, "updates": updates}, ensure_ascii=False)
    out = subprocess.run(
        ["curl", "-sS", "-m", "120", "-X", "POST", URL, "-H", "x-ingest-token: proxy-injected",
         "-H", "Content-Type: application/json", "--data-binary", "@-"],
        input=body, capture_output=True, text=True)
    try:
        r = json.loads(out.stdout or "{}")
    except json.JSONDecodeError:
        r = {}
    if "inserted_ids" not in r:
        raise SystemExit(f"batch {b} failed: {out.stdout[:300]} {out.stderr[:200]}")
    log["inserted_ids"] += r["inserted_ids"]
    log["updated_ids"] += r.get("updated_ids", [])
    log["batches_done"] = b + 1
    json.dump(log, open(log_path, "w"), indent=1)
    print(f"batch {b}: inserted {len(r['inserted_ids'])}, updated {len(r.get('updated_ids', []))}")

print(f"total inserted {len(log['inserted_ids'])}, updated {len(log['updated_ids'])} -> {log_path}")
