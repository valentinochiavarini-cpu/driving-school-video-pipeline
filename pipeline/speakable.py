"""Rewrite a question for the ear. Returns the VO scripts, cached per question id + lang.
Output: {"question_vo": "...", "reveal_vo": "The answer is B. <one sentence>", "answers_display": {...}}
answers_display is the on-screen text (only cleaned when it is unreadable, e.g. 'e.g., red = stop/prohibition').
"""
import json, re
from common import CONFIG, jcache
from llm import chat_json

SYSTEM = """You prepare DMV multiple-choice questions for a spoken short-form quiz video.
Return JSON: {"question_vo": str, "reveal_vo": str, "answers_display": {"A": str, "B": str, "C": str, "D": str}}
Rules:
- question_vo: the question as a natural spoken sentence. Max 22 words. Expand abbreviations, remove trailing colons and parenthetical lists. If the question refers to an image say "this sign".
  Do NOT read the answer options; the viewer sees them on screen.
- reveal_vo: "The answer is <letter>." then ONE short sentence (max 16 words) with the key reason, taken from the explanation. Spanish input -> Spanish output ("La respuesta es la B.").
- answers_display: the four answers for the screen. Keep them identical unless they contain symbols or shorthand that a viewer would stumble on ('e.g.', '=', '/', '&'), then rewrite to plain words, max 12 words each, same meaning.
- Never change which answer is correct. No em dashes."""

def speakable(q, lang="en"):
    key_path, data = jcache(f"speak_{q['id']}_{lang}")
    if data: return data
    user = json.dumps({"question_text": q["question_text"], "answers": q["answers"], "correct_answer": q["correct_answer"],
                       "explanation": q.get("explanation", ""), "has_image": bool(q.get("image_url")), "language": "es" if lang == "es" else "en"})
    data = chat_json(SYSTEM, user, CONFIG["openai"]["temperature_speakable"])
    for k in "ABCD": data["answers_display"].setdefault(k, q["answers"][k])
    assert re.match(r"^(The answer is|La respuesta es)", data["reveal_vo"]), data
    json.dump(data, open(key_path, "w"), indent=1)
    return data

def speakable_dry(q, lang="en"):
    """No-API fallback used by --dry-run."""
    qt = re.sub(r"\s*\(.*?\)", "", q["question_text"]).rstrip(":").strip()
    first = re.split(r"(?<=[.!?])\s", q.get("explanation", ""))[0]
    return {"question_vo": qt, "reveal_vo": f"The answer is {q['correct_answer']}. {first}", "answers_display": q["answers"]}
