# What the viral dataset says (234 DMV videos with 40K+ views, scraped 15 Oct 2026)

Source: docs/research-viral-dataset.xlsx (owner's scrape; team columns filled 2026-11-10). Numbers are views at
collection time, so older posts have had longer to accumulate. Treat ratios (save rate, comments per view) as the
comparable signal, not raw views.

## Findings that change what the pipeline does
1. Quiz videos are 96 of 234. Among 2026 quiz posts, road-sign quizzes have the highest median views (380K) and
   written-question quizzes the highest save rate (1.4%). Signs are the most visual and the easiest to answer in comments.
2. Length, quiz videos only: 30 to 90 s has the best median views (302K); 5 min+ full tests have the best save rate
   (1.56%) and the deepest engagement; 90 s to 5 min is the weakest bucket for views (178K). Our pass5 (about 80 s)
   and Classic 30 (8 min) sit in the two strong buckets; pass10, pass15 and signs15 sit in the weak one.
3. Captions that work are short and ask for the score: "how did you do??", "did you get all the questions correct?",
   "Can you get 5/5?", "the pass mark is 38. Did you make it?". Series numbering ("Pt. 1", "Practice Test #1") and
   state plus year in the title ("California DMV Written Test 2026") appear on the biggest full tests.
4. "Only 12% get this right" (6.7M views) is a fabricated-looking stat. TikTok's rules and our own policy say no
   invented numbers; "Most people miss this sign" carries the same tension without the claim.
5. Spanish full tests (us.citizen06) reach 0.9 to 1.4M views each: the Spanish account plan is validated.
6. The best funnel format is not a quiz: UGC-style "this app had me passing" videos (noha.driverslicense, 12 videos,
   4.3% save rate) and relatable pass/fail stories. Both need a real person on camera. This is the owner's human
   layer, not the pipeline's job.

## Changes applied 2026-11-10
- Rotation: the 3 to 4 minute formats (pass10, pass15, signs15) leave the weekly rotation; short quizzes (60 to 90 s)
  and Classic 30 take their slots. Signs run four times a week.
- Captions: every caption now carries a series number per format ("Road signs test #4") and a score ask
  ("Can you get 7/7?"); full tests state the pass mark.
- Question reuse window shortened to 45 days so the 115 sign questions can sustain four sign videos a week.
