"""Build the owner review sheet (assets/qbank/review.xlsx) from every draft source.
Answers are reshuffled per question (seeded) with the same order applied to EN and ES. Near-duplicates (within the
batch and against the live bank) and content flags (numbers, excluded topics) are marked for the reviewer.
Run with: python3 -I tools/qbank/sheet.py <repo root>"""
import sys, os, json, re, random, hashlib
from openpyxl import Workbook
from openpyxl.drawing.image import Image as XImage
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation
from PIL import Image

ROOT = sys.argv[1]
Q = os.path.join(ROOT, "assets/qbank")
THUMBS = os.path.join(Q, "thumbs"); os.makedirs(THUMBS, exist_ok=True)
bank = json.load(open(os.path.join(ROOT, "cache/json/questions_all.json")))["rows"]

def words(s): return set(w for w in re.findall(r"[a-z]+", s.lower()) if len(w) > 3)
def sim(a, b):
    A, B = words(a), words(b)
    return len(A & B) / max(1, len(A | B))
EXCL = re.compile(r"alcohol|drunk|under the influence|\bdui\b|\bdwi\b|license|licence|registration|insurance|speed limit", re.I)

def reshuffle(q):
    rnd = random.Random(hashlib.md5(q["question_text"].encode()).hexdigest())
    letters = ["A", "B", "C", "D"]; src = letters[:]; rnd.shuffle(src)
    en = {letters[i]: q["answers"][src[i]] for i in range(4)}
    es = {letters[i]: q["answers_es"][src[i]] for i in range(4)}
    q = dict(q, answers=en, answers_es=es, correct_answer=letters[src.index(q["correct_answer"])])
    return q

def flags(q, peers, same=lambda a, b: False, skip_bank_id=None):
    f = []
    if q.get("qa", {}).get("verdict") == "problem": f.append("QA: " + q["qa"]["issue"])
    text = q["question_text"] + " " + " ".join(q["answers"].values()) + " " + q["explanation"]
    if re.search(r"\d", text): f.append("has a number: check it is the same in every state")
    if EXCL.search(text): f.append("excluded topic (alcohol/licensing/speed limits): drop")
    best = max(((sim(q["question_text"], b["question_text"]), b["question_text"]) for b in bank if b["state"] is None and b["id"] != skip_bank_id), default=(0, ""))
    if best[0] >= 0.5: f.append(f"similar to bank: {best[1][:70]}")
    for p in peers:
        if p is not q and not same(p, q) and sim(q["question_text"], p["question_text"]) >= 0.5: f.append(f"near-duplicate in batch: {p['question_text'][:60]}"); break
    return "; ".join(f)

def thumb(path, w, h):
    out = os.path.join(THUMBS, os.path.basename(path))
    im = Image.open(path).convert("RGBA"); im.thumbnail((w, h)); bg = Image.new("RGBA", (w, h), (255, 255, 255, 255))
    bg.paste(im, ((w - im.width) // 2, (h - im.height) // 2), im); bg.convert("RGB").save(out); return out

HEAD = ["approved (Y/N)", "notes", "ref", "image", "category", "question", "A", "B", "C", "D", "correct", "explanation", "question (ES)", "correct answer (ES)", "explanation (ES)", "flags", "source"]
wb = Workbook(); wb.remove(wb.active)

def sheet(name, rows, img_size=None, extra=None):
    ws = wb.create_sheet(name); ws.append(HEAD + (extra or []))
    for c in ws[1]: c.font = Font(bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor="0B1A33")
    dv = DataValidation(type="list", formula1='"Y,N"', allow_blank=True); ws.add_data_validation(dv)
    yellow = PatternFill("solid", fgColor="FFF4C2")
    for i, q in enumerate(rows, start=2):
        ws.append(["", "", q.get("ref", ""), "", q.get("category", ""), q["question_text"], q["answers"]["A"], q["answers"]["B"], q["answers"]["C"], q["answers"]["D"],
                   q["correct_answer"], q["explanation"], q.get("question_text_es", ""), q["answers_es"][q["correct_answer"]], q.get("explanation_es", ""), q.get("flags", ""), q.get("source", "")]
                  + [q.get(k, "") for k in (extra or [])])
        dv.add(ws.cell(i, 1)); ws.cell(i, 1).fill = yellow; ws.cell(i, 2).fill = yellow
        if q.get("flags"): ws.cell(i, 16).font = Font(color="B91C1C", bold=True)
        if img_size and q.get("image_path") and os.path.exists(q["image_path"]):
            t = thumb(q["image_path"], *img_size); xi = XImage(t); ws.add_image(xi, f"D{i}")
            ws.row_dimensions[i].height = img_size[1] * 0.78
        else: ws.row_dimensions[i].height = 60
    widths = [9, 22, 26, (img_size[0] / 7 if img_size else 8), 18, 40, 22, 22, 22, 22, 8, 46, 40, 26, 46, 34, 18] + [30] * len(extra or [])
    for col, w in enumerate(widths, start=1): ws.column_dimensions[ws.cell(1, col).column_letter].width = w
    for row in ws.iter_rows(min_row=2):
        for c in row: c.alignment = Alignment(wrap_text=True, vertical="top")
    ws.freeze_panes = "C2"

# diagrams (answers already balanced by the generator)
dg = json.load(open(os.path.join(Q, "diagrams/questions.json")))
for q in dg: q["ref"] = q["id"]; q["image_path"] = os.path.join(Q, q["image_file"]); q["flags"] = flags(q, dg, same=lambda a, b: a["scene"] == b["scene"]); q["source"] = "generated diagram, rule-derived answer"
sheet("Diagrams", dg, (240, 180))

# signs (if drafted)
sp = os.path.join(Q, "drafts/signs.json")
if os.path.exists(sp):
    sg = [reshuffle(q) for q in json.load(open(sp))]
    for q in sg: q["ref"] = f"{q['sign_code']} ({q['sign_meaning']})"; q["image_path"] = os.path.join(Q, "signs", q["sign_code"] + ".png"); q["flags"] = flags(q, sg)
    sheet("Signs", sg, (130, 130), ["commons_page"])

tp = [reshuffle(q) for q in json.load(open(os.path.join(Q, "drafts/topics.json")))]
for q in tp: q["ref"] = q["topic_key"]; q["flags"] = flags(q, tp)
sheet("Thin topics", tp)

rw = [reshuffle(q) for q in json.load(open(os.path.join(Q, "drafts/rewrites.json")))]
for q in rw: q["ref"] = f"replaces {q['replaces_id'][:8]}"; q["flags"] = flags(q, rw, skip_bank_id=q["replaces_id"])
sheet("All-of-above rewrites", rw, None, ["original_question", "replaces_id"])

how = wb.create_sheet("How to review", 0)
for line in [
    "Mark each row Y (import) or N (skip) in the yellow column. Use notes for corrections; I apply them before import.",
    "Check every correct answer against your state handbook. Rows with red flags need a closer look.",
    "Diagrams: the correct answer is derived from the right-of-way rule in code, not written by a model. Check that the picture reads clearly.",
    "Signs: images come from Wikimedia Commons (US MUTCD designs, public domain); the Commons page is in the last column.",
    "Rewrites: each replaces an existing 'All of the above' question (original shown). Approving it replaces the original; N keeps the original.",
    "Thin topics and rewrites were drafted by a model under strict rules (no state-specific numbers, one correct answer, no 'all of the above').",
    "Nothing is imported until you approve it. After import, the video pipeline picks the new questions up within 24 hours.",
]: how.append([line])
how.column_dimensions["A"].width = 140
out = os.path.join(Q, "review.xlsx"); wb.save(out)
print("saved", out, {ws.title: ws.max_row - 1 for ws in wb.worksheets if ws.title != "How to review"})
