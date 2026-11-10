"""Reviewer decisions (Claude, 2026-11-10, delegated by the owner): Y keep, N drop (with reason), F fix (edits below).
Applies fixes to the draft files and records decisions in assets/qbank/decisions.json; sheet.py fills the approved column.
Indexes refer to the order of the draft files at review time; each decision also stores the question text as a check."""
import json, sys, os
ROOT = sys.argv[1]; Q = os.path.join(ROOT, "assets/qbank")
def load(p): return json.load(open(os.path.join(Q, p)))
def save(p, d): json.dump(d, open(os.path.join(Q, p), "w"), indent=1, ensure_ascii=False)

def ans(en, es):  # correct answer first; the sheet reshuffles
    return {"answers": dict(zip("ABCD", en)), "answers_es": dict(zip("ABCD", es)), "correct_answer": "A"}

N = {  # drops with reasons
 "signs": {3: "awkward duplicate of the meaning question", 13: "answer omits U-turn: incomplete", 17: "Spanish unclear; meaning question kept",
   19: "duplicate of the meaning question", 21: "duplicate of the meaning question", 23: "weak action question", 31: "weak action question",
   37: "Spanish weak; meaning question kept", 40: "shared-use path sign: not driver test material", 41: "shared-use path sign: not driver test material",
   60: "duplicate of the meaning question"},
 "topics": {8: "U-turn near railroad is not a universal rule", 10: "duplicate of T06", 11: "duplicate of T09", 16: "duplicate of T12", 17: "duplicate of T13",
   23: "missing an exit does not by itself require stopping", 27: "duplicate of T24", 31: "weak", 34: "duplicate", 35: "duplicate of T39", 36: "duplicate of T33",
   43: "ambiguous at a four-way stop", 45: "duplicate of T41", 50: "duplicate of T46", 51: "duplicate of T47", 52: "duplicate of T48",
   58: "duplicate of T54", 59: "duplicate of T55", 60: "not the only correct reason", 61: "duplicate of T57"},
 "rewrites": {1: "DUI: excluded topic", 4: "alcohol: excluded topic", 5: "'steer right first' oversimplifies", 8: "duplicate of R00 and ambiguous", 10: "states differ on siren vs lights: keep the original", 15: "vague"},
}
F = {  # fixes
 "signs": {
   2: ans(["One-way traffic", "Keep right", "Turn right only", "No right turn"], ["Tránsito en un sentido", "Manténgase a la der.", "Solo vuelta a la der.", "No vuelta a la der."]),
   15: ans(["Wait for green", "Turn after stopping", "Yield, then turn", "Make a U-turn"], ["Esperar la luz verde", "Girar tras detenerse", "Ceder y luego girar", "Hacer vuelta en U"]),
   16: ans(["Keep intersection open", "No U-turn", "Stop here on red", "Yield ahead"], ["No bloquear el cruce", "No vuelta en U", "Pare aquí en rojo", "Ceda el paso adelante"]),
   20: ans(["Right lane: turn right", "Keep right", "No right turn", "Right shoulder ends"], ["Carril der.: gire a la der.", "Manténgase a la der.", "No vuelta a la der.", "Termina el acotamiento"]),
   24: ans(["Pass with care", "Do not pass", "Keep right", "Road narrows"], ["Rebase con cuidado", "No rebasar", "Manténgase a la der.", "Se estrecha la vía"]),
   28: ans(["Dead end ahead", "Road narrows", "Do not enter", "Road work ahead"], ["Calle sin salida", "Se estrecha la vía", "No entre", "Obras adelante"]),
   30: ans(["No outlet", "Narrow bridge", "Do not enter", "Road work ahead"], ["Sin salida", "Puente angosto", "No entre", "Obras adelante"]),
   33: ans(["Merge left soon", "Turn right ahead", "Stop for a train", "Stay in right lane"], ["Incorpórese a la izq.", "Gire a la der. adelante", "Pare por un tren", "Siga en carril der."]),
   36: ans(["Soft shoulder", "Slippery when wet", "Low shoulder", "Shoulder drop-off"], ["Acotamiento blando", "Resbaloso si mojado", "Acotamiento bajo", "Desnivel lateral"]),
   48: ans(["Keep right of median", "Prepare for signal", "Yield to oncoming", "Merge left now"], ["Quédese a la derecha", "Prepárese al semáforo", "Ceda al tráfico opuesto", "Incorpórese a la izq."]),
 },
 "topics": {67: dict(question_text="Why should you slow down in a work zone?", question_text_es="¿Por qué debe reducir la velocidad en una zona de obras?",
   **ans(["Workers may be close by", "Speeding is allowed briefly", "Workers must move for you", "Orange signs cancel limits"],
         ["Puede haber trabajadores cerca", "Se permite acelerar un rato", "Los obreros deben apartarse", "Las señales naranjas anulan límites"]),
   explanation="Workers, equipment and changing lanes can be very close to traffic in a work zone. Slowing down gives you time to react and protects everyone.",
   explanation_es="En una zona de obras puede haber trabajadores, equipo y cambios de carril muy cerca del tráfico. Reducir la velocidad le da tiempo para reaccionar y protege a todos.")},
 "rewrites": {
   3: dict(question_text="You approach a STOP sign with a stop line. Where must you stop?", question_text_es="Se acerca a una señal de ALTO con línea de alto. ¿Dónde debe detenerse?",
     **ans(["At the stop line", "Past the stop line", "In the crosswalk", "Inside the intersection"], ["En la línea de alto", "Después de la línea", "Sobre el cruce peatonal", "Dentro de la intersección"]),
     explanation="When there is a stop line, stop at the line. If there is no line, stop before the crosswalk; if there is neither, stop before entering the intersection.",
     explanation_es="Si hay línea de alto, deténgase en la línea. Si no la hay, deténgase antes del cruce peatonal; si no hay ninguno, antes de entrar a la intersección."),
   7: dict(**ans(["Right after rain begins", "After hours of rain", "Only in heavy storms", "Only at night"], ["Justo al empezar a llover", "Tras horas de lluvia", "Solo en tormentas fuertes", "Solo de noche"]),
     explanation="Roads are most slippery just after rain begins, when water mixes with oil and dirt on the surface. Slow down and leave extra space.",
     explanation_es="El camino está más resbaloso justo cuando empieza a llover, porque el agua se mezcla con aceite y polvo. Reduzca la velocidad y deje más espacio."),
   10: dict(question_text="On the roadway, emergency vehicles have the right-of-way when using:", question_text_es="En la vía, los vehículos de emergencia tienen el derecho de paso cuando usan:",
     **ans(["Siren and flashing lights", "A loudspeaker only", "Hazard lights only", "Headlights only"], ["Sirena y luces intermitentes", "Solo un altavoz", "Solo luces de emergencia", "Solo los faros"]),
     explanation="Yield to emergency vehicles using a siren and flashing lights: pull over to the right edge and stop until they pass.",
     explanation_es="Ceda el paso a los vehículos de emergencia con sirena y luces intermitentes: oríllese a la derecha y deténgase hasta que pasen."),
 },
}
FILES = {"signs": "drafts/signs.json", "topics": "drafts/topics.json", "rewrites": "drafts/rewrites.json"}
decisions = {}
for key, f in FILES.items():
    rows = load(f)
    for i, q in enumerate(rows):
        if i in F[key] and i not in N[key]:
            before = json.dumps({k: q.get(k) for k in F[key][i]}, sort_keys=True)
            q.update(F[key][i]); d = ("Y", "fixed by reviewer")
            if json.dumps({k: q.get(k) for k in F[key][i]}, sort_keys=True) != before: q["qa"] = None
        elif i in N[key]: d = ("N", N[key][i])
        elif key == "topics" and i == 39: d = ("Y", "kept: 'discouraged or not allowed' covers both state practices (QA flag considered)")
        else: d = ("Y", "")
        q["review"] = {"decision": d[0], "reason": d[1], "by": "Claude (delegated by owner), 2026-11-10"}
        decisions[f"{key}:{i}"] = {"q": q["question_text"], "decision": d[0], "reason": d[1]}
    save(f, rows)
dg = load("diagrams/questions.json")
for q in dg: q["review"] = {"decision": "Y", "reason": "rule-derived answer, diagram checked visually", "by": "Claude (delegated by owner), 2026-11-10"}
save("diagrams/questions.json", dg)
save("decisions.json", decisions)
from collections import Counter
print(Counter((k.split(":")[0], v["decision"]) for k, v in decisions.items()), "| diagrams Y:", len(dg), "| fixed:", sum(len(v) for v in F.values()))
