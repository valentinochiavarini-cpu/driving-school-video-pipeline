import os, json, hashlib, pathlib, yaml
from dotenv import load_dotenv

ROOT = pathlib.Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
CONFIG = yaml.safe_load(open(ROOT / "config.yaml"))
CACHE = ROOT / "cache"; CACHE.mkdir(exist_ok=True)
OUT = ROOT / "out"; OUT.mkdir(exist_ok=True)

def env(name, default=None):
    v = os.environ.get(name, default)
    if v is None:
        raise SystemExit(f"Missing env var {name} (see .env.example)")
    return v

def sha(*parts):
    return hashlib.sha1("|".join(str(p) for p in parts).encode()).hexdigest()[:16]

def jcache(key):
    """Tiny JSON cache: returns (path, data or None)."""
    p = CACHE / "json" / f"{key}.json"; p.parent.mkdir(parents=True, exist_ok=True)
    return p, (json.load(open(p)) if p.exists() else None)

def localized(q, lang):
    """Return a question dict in one language with plain keys."""
    if lang == "es" and q.get("question_text_es"):
        return {**q, "question_text": q["question_text_es"], "answers": q["answers_es"], "explanation": q.get("explanation_es") or q.get("explanation")}
    return q
