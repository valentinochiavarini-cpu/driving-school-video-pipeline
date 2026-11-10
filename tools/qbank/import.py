"""Prepare the import of owner-approved questions from assets/qbank/review.xlsx.
- Only rows marked Y are used. Rows with notes are listed and skipped until the note is applied to the draft.
- Approved images are uploaded through the Lovable `ingest` route upload_question_image (public images bucket,
  Questions/Generated/). Upload goes through curl so the session proxy can inject the ingest token.
- Writes assets/qbank/import.sql: INSERT for new questions, UPDATE in place for all-of-the-above rewrites.
  The SQL is run separately (Lovable database tool) after a final look.
usage: python3 -I tools/qbank/import.py <repo root> [--no-upload]"""
import sys, os, json, subprocess, re
from openpyxl import load_workbook

ROOT = sys.argv[1]; UPLOAD = "--no-upload" not in sys.argv
Q = os.path.join(ROOT, "assets/qbank")
INGEST = "https://ksiqvvoqlzdihjubaxbm.supabase.co/functions/v1/ingest"
wb = load_workbook(os.environ.get("REVIEW", os.path.join(Q, "review.xlsx")))

def rows(sheet):
    ws = wb[sheet]; head = [c.value for c in ws[1]]
    for r in ws.iter_rows(min_row=2, values_only=True):
        yield dict(zip(head, r))

def lit(s):  # dollar-quoted SQL literal
    s = "" if s is None else str(s)
    tag = "q"
    while f"${tag}$" in s: tag += "q"
    return f"${tag}${s}${tag}$"

def upload(path, name):
    if not UPLOAD: return f"https://ksiqvvoqlzdihjubaxbm.supabase.co/storage/v1/object/public/images/Questions/Generated/{name}"
    out = subprocess.run(["curl", "-sS", "-m", "60", "-X", "POST", f"{INGEST}?action=upload_question_image&name={name}",
                          "-H", "x-ingest-token: proxy-injected", "-H", "Content-Type: image/png", "--data-binary", f"@{path}"], capture_output=True, text=True)
    j = json.loads(out.stdout or "{}")
    if "url" not in j: raise SystemExit(f"upload failed for {name}: {out.stdout[:200]} {out.stderr[:200]}")
    return j["url"]

def load(p): return json.load(open(os.path.join(Q, p))) if os.path.exists(os.path.join(Q, p)) else []
dg = {q["id"]: q for q in load("diagrams/questions.json")}
sg = load("drafts/signs.json"); tp = load("drafts/topics.json"); rw = load("drafts/rewrites.json")
by_text = {q["question_text"]: q for q in sg + tp + rw}

sql, skipped, n_ins, n_upd = ["begin;"], [], 0, 0
def emit_insert(q, xrow, image_url):
    global n_ins
    # the sheet shows the reshuffled answer order: take answers and the correct letter from the sheet row
    en = {k: xrow[k] for k in "ABCD"}
    es_correct = xrow["correct answer (ES)"]
    es = q["answers_es"]
    # map ES answers to the sheet order by matching the EN text positions in the draft
    pos = {v: k for k, v in q["answers"].items()}
    if not all(en[k] in pos for k in "ABCD") or xrow["correct"] not in "ABCD" or q["answers"][q["correct_answer"]] != en[xrow["correct"]]:
        raise SystemExit(f"sheet row does not match its draft (stale sheet? rebuild with tools/qbank/sheet.py): {xrow['question'][:70]}")
    es_sheet = {k: es[pos[en[k]]] for k in "ABCD"}
    sql.append("insert into public.questions (question_text, answers, correct_answer, explanation, category, state, image_url, question_text_es, answers_es, explanation_es) values ("
               + ", ".join([lit(xrow["question"]), lit(json.dumps(en)) + "::jsonb", lit(xrow["correct"]), lit(xrow["explanation"]), lit(xrow["category"] or q.get("category")),
                            "null", lit(image_url) if image_url else "null", lit(xrow["question (ES)"]), lit(json.dumps(es_sheet, ensure_ascii=False)) + "::jsonb", lit(xrow["explanation (ES)"])]) + ");")
    n_ins += 1

for sheet in [s for s in wb.sheetnames if s != "How to review"]:
    for x in rows(sheet):
        if (x.get("approved (Y/N)") or "").strip().upper() != "Y": continue
        if (x.get("notes") or "").strip(): skipped.append((sheet, x["question"], x["notes"])); continue
        if sheet == "Diagrams":
            q = dg[x["ref"]]; name = f"rw-{x['ref'][3:]}.png".lower()
            emit_insert(q, x, upload(os.path.join(Q, q["image_file"]), name))
        elif sheet == "Signs":
            q = by_text.get(x["question"]) or next(v for v in sg if v["question_text"] == x["question"])
            emit_insert(q, x, upload(os.path.join(Q, "signs", q["sign_code"] + ".png"), f"mutcd-{q['sign_code'].lower()}.png"))
        elif sheet == "Thin topics":
            emit_insert(by_text[x["question"]], x, None)
        else:  # rewrites: update the original row in place
            q = by_text[x["question"]]; en = {k: x[k] for k in "ABCD"}; pos = {v: k for k, v in q["answers"].items()}
            if not all(en[k] in pos for k in "ABCD") or q["answers"][q["correct_answer"]] != en[x["correct"]]:
                raise SystemExit(f"sheet row does not match its draft (stale sheet?): {x['question'][:70]}")
            es_sheet = {k: q["answers_es"][pos[en[k]]] for k in "ABCD"}
            sql.append(f"update public.questions set question_text = {lit(x['question'])}, answers = {lit(json.dumps(en))}::jsonb, correct_answer = {lit(x['correct'])}, "
                       f"explanation = {lit(x['explanation'])}, question_text_es = {lit(x['question (ES)'])}, answers_es = {lit(json.dumps(es_sheet, ensure_ascii=False))}::jsonb, "
                       f"explanation_es = {lit(x['explanation (ES)'])} where id = {lit(q['replaces_id'])}::uuid;")
            n_upd += 1
sql.append("commit;")
open(os.environ.get("SQL_OUT", os.path.join(Q, "import.sql")), "w").write("\n".join(sql) + "\n")
print(f"import.sql: {n_ins} inserts, {n_upd} updates; skipped (notes to apply first): {len(skipped)}")
for s in skipped: print("  ", s[0], "|", s[1][:60], "|", s[2][:80])
