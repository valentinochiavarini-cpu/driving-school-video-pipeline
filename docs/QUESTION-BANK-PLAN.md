# Question bank expansion (plan, 2026-11-10)

Owner decisions: state coverage is out of scope. Images must be real: sign images come from Wikimedia Commons
(US MUTCD signs are public domain federal works; keep the file name and Commons URL as attribution in the row).
Never invent a sign. Diagrams (intersections, road markings, signal states) are drawn programmatically, and every
generated image is rendered and looked at before it is committed or imported. Accuracy: the owner reviews every
drafted question against the state handbook before import; the pipeline never posts an unreviewed question.

## Gaps found 2026-11-10 (bank: 634 general questions, 115 with images)
1. Intersection and right-of-way diagrams: 6 exist. Target 30 to 50 ("who goes first": four-way stop, uncontrolled,
   T-junction, left turn vs straight, roundabout entry, emergency vehicle, pedestrian in crosswalk, merge).
2. Signs: 106 images, each asked once, mostly "What does this sign mean?". Ask each sign 2 to 3 ways (meaning,
   required action, where seen). Missing common signs: yield, one way, wrong way, no left turn, keep left, dead end,
   detour, low clearance, lane ends, flagger ahead, pavement ends, soft shoulder, HOV lane, lane-use arrows.
3. Road markings and signal states: no images. Solid vs broken lines, centre turn lane, arrows, flashing and arrow
   signals. Drawable.
4. Thin topics (questions): HOV 0, U-turn 1, curves 2, drowsy 2, distracted 3, lane changes 4, four-way stop 4,
   roundabout 5, following distance 7. Target 10 each.
5. 24 questions with "All of the above" as the correct answer: rewrite as specific questions.
Excluded categories stay excluded (Alcohol & Drugs, Speed Limits & Laws, Licensing & Registration).

## Build steps
1. `tools/diagrams/`: SVG templates for intersections (top-down, labelled cars A/B/C, arrows for intended paths),
   markings and signals; render to 1200x900 PNG with the preinstalled Chromium; write a contact sheet of every
   image and review it visually before anything is committed. Style: app tokens (navy, highlight yellow), clear
   at 360 px wide on a phone.
2. `tools/signs/`: fetch sign images from Wikimedia Commons by MUTCD code (needs commons.wikimedia.org and
   upload.wikimedia.org allowed in the environment); store code, title, Commons URL and licence per file; review
   contact sheet.
3. `tools/draft-questions.ts`: for each image or topic, draft question, four answers, correct letter, explanation
   and Spanish text with gpt-4o-mini; write a review sheet (xlsx) with an "approved" column. No invented statistics,
   no state-specific claims, one unambiguous correct answer, no "All of the above".
4. Import: the Lovable project already has a server function `bulk-translate-import` (supabase/config.toml); read it
   before writing an importer, and go through the ingest function or Lovable with the approved rows only. Upload
   images to the existing public `images` bucket.
5. After import, lower nothing in the pipeline: the formats pick up new rows automatically (24 h question cache).
