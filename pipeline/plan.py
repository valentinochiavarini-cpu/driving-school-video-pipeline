"""Build plan.json: the full screen-by-screen timeline with audio cues. render.js and assemble.sh consume it."""
import math, json
from common import CONFIG

V = CONFIG["video"]

def build_plan(video_id, questions, speak, hook, audio, fmt_id, lang):
    """questions: list of question dicts (display); speak: list of speakable dicts (same order);
    audio: dict with 'hook' (path, dur), 'outro' (path, dur), 'q' [(path, dur)], 'r' [(path, dur)]."""
    think = CONFIG["formats"][fmt_id]["think"]
    screens, cues, t = [], [], 0.0
    def add(screen, seconds, **cue):
        nonlocal t
        screens.append({**screen, "seconds": round(seconds, 3), "at": round(t, 3)})
        for k, v in cue.items():
            if v: cues.append({"kind": k, "file": v if isinstance(v, str) else None, "at": round(t, 3)})
        t += seconds
    hp, hd = audio["hook"]
    add({"type": "hook1", "text": hook["card1"], "sub": f"Can you pass the {CONFIG['brand']['year']} DMV test?" if lang == "en" else f"¿Pasarías el examen DMV {CONFIG['brand']['year']}?"}, V["hook1_seconds"], vo=str(hp))
    add({"type": "hook2", "text": hook["card2"], "pill": "LET'S GO" if lang == "en" else "VAMOS"}, max(V["hook2_seconds"], hd - V["hook1_seconds"] + 0.3))
    n = len(questions)
    for i, (q, s) in enumerate(zip(questions, speak)):
        qp, qd = audio["q"][i]; rp, rd = audio["r"][i]
        total = math.ceil(qd) + think
        disp = {**q, "answers": s["answers_display"]}
        for remaining in range(total, 0, -1):
            add({"type": "question", "q": disp, "idx": i, "n": n, "seconds_left": remaining, "total": total, "phase": "question"}, 1.0,
                vo=str(qp) if remaining == total else None, whoosh=remaining == total, tick=remaining <= 3)
        add({"type": "question", "q": disp, "idx": i, "n": n, "seconds_left": 0, "total": total, "phase": "question", "dim": True}, V["dim_seconds"])
        rev_len = rd + V["reveal_tail_seconds"]; rev_total = math.ceil(rev_len)
        for s_left in range(rev_total, 0, -1):
            add({"type": "question", "q": disp, "idx": i, "n": n, "seconds_left": s_left, "total": rev_total, "phase": "reveal"},
                rev_len - (rev_total - 1) if s_left == rev_total else 1.0, vo=str(rp) if s_left == rev_total else None, ding=s_left == rev_total)
    op, od = audio["outro"]
    add({"type": "outro", "n": n, "lang": lang}, max(V["outro_seconds"], od + 0.5), vo=str(op))
    return {"id": video_id, "format": fmt_id, "lang": lang, "total": round(t, 3), "screens": screens, "cues": cues,
            "hook": hook, "timing": {"count": n, "seconds_per_question": think + 3}}
