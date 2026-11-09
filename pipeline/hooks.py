"""Hook generator (OpenAI, JSON mode). One call per video.
Returns {"card1", "card2", "vo_line", "outro_vo", "caption", "hashtags"}.
card2 is built from real timing (count, seconds per question) passed in by plan.py, so it never lies.
"""
import json
from common import CONFIG
from llm import chat_json

SYSTEM = """You write opening hooks for vertical short-form quiz videos (TikTok, Reels, Shorts) for 'The Driving School', a US DMV written-test practice brand.
Return JSON only: {"card1": str, "card2": str, "vo_line": str, "outro_vo": str, "caption": str, "hashtags": [str]}
Rules:
- card1 = the hook. Max 7 words. One emotional trigger: fear of failing, curiosity, challenge, "most people get this wrong". Wrap exactly ONE word in *asterisks* for highlight. Uppercase-friendly.
- card2 = the promise. Max 8 words. MUST use the numbers given in `timing` (question count and seconds). Example: "5 questions. 10 seconds each."
- vo_line = spoken version of card1 + card2, max 14 words, energetic, ends with "Let's go." (or "Vamos." in Spanish).
- outro_vo = max 16 words: ask for the score in the comments and point to the link in bio.
- caption = max 110 chars, ends with a question asking for their score. hashtags = 5 lowercase tags including #dmvtest and #drivingtest (Spanish: #examendemanejo #dmv).
- Banned words: studying, learn, educational, tips, tutorial. No emojis in cards. No em dashes.
- If first_has_image is true, card1 may reference "this sign"."""

def hooks(questions, fmt_id, lang, timing, state=None, dry=False):
    if dry:
        n = timing["count"]; s = timing["seconds_per_question"]
        return {"card1": "Most people *FAIL* this one", "card2": f"{n} questions. {s} seconds each.",
                "vo_line": f"Most people fail this one. Can you pass the 2027 DMV test? Let's go.",
                "outro_vo": "How many did you get? Drop your score in the comments and check the link in bio.",
                "caption": "Only 5 questions. How many did you get right?", "hashtags": ["#dmvtest", "#drivingtest", "#permittest", "#roadsigns", "#newdriver"]}
    q1 = questions[0]
    user = json.dumps({"format": fmt_id, "format_label": CONFIG["formats"][fmt_id]["label"], "state": state,
                       "language": "Spanish (US)" if lang == "es" else "English (US)", "year": CONFIG["brand"]["year"],
                       "first_question": q1["question_text"], "first_has_image": bool(q1.get("image_url")),
                       "categories": sorted({q["category"] for q in questions}), "timing": timing})
    h = chat_json(SYSTEM, user, CONFIG["openai"]["temperature_hooks"])
    assert len(h["card1"].split()) <= 8 and len(h["card2"].split()) <= 9, h
    return h
