# The Driving School video pipeline

Automated vertical DMV quiz videos (TikTok first, Reels and Shorts second) for The Driving School
(the-driving-school.lovable.app). Owner: Valentino (Inkwise Consulting Ltd, headcount 1).
The brief and all decisions are in docs/PLAN.md. Read it first. docs/findings.md has the test history.

## Stack (one language)

TypeScript on Node 22. Remotion 4 renders the video (free license: company of 1). ffprobe is the only
external binary (audio durations). OpenAI gpt-4o-mini for text, ElevenLabs for voice with word timestamps,
Supabase REST for the question bank, Postiz for scheduled posting (phase 3).

```
src/config.ts     brand, video timing, formats, excluded categories, model and voice settings (pure)
src/types.ts      Question, Clip, Plan ... (pure)
src/plan.ts       timeline builder: frames for every scene plus audio cues (pure, used by Remotion too)
src/dry.ts        no-API stand-ins for --dry and Remotion Studio (pure)
src/env.ts        paths, .env loading, JSON cache helpers (Node)
src/supabase.ts   fetch questions (24 h cache), cache images into public/cache/images
src/pick.ts       non-overlapping set per format; ledger cache/used.json
src/text.ts       OpenAI JSON mode: speakable rewrite per question (cached), hooks + caption per video
src/voice.ts      ElevenLabs with-timestamps; mp3 + words cached in public/cache/audio by content hash
src/render.ts     Remotion bundle + renderMedia
src/ledger.ts     video ledger via the Lovable `ingest` function (header x-ingest-token); off without INGEST_TOKEN
src/publish.ts    Postiz: schedule approved videos (next free daily slot, TikTok settings from POSTING), sync states back
src/still.ts      QA stills
src/preflight.ts  pre-render checks on still frames (questions before voice, cover before the full render)
src/qa.ts         the publishing QA checklist (file, audio, frames, vision check of cover and layout, text, content)
src/gate.ts       qa step with one automatic fix (text, cover re-render), auto-approve, retract (docs/QA-CHECKLIST.md)
src/nightly.ts    the nightly run: two formats by weekday (NIGHTLY_ROTATION in config) -> make x2 -> qa -> auto-approve -> publish approved
                  (2 per day) -> sync + metrics -> report (weekly on Sunday). `npm run nightly`.
.github/workflows/nightly.yml  manual fallback render on GitHub Actions (needs the four secrets); not scheduled.
src/report.ts     daily/weekly report from the ledger: pipeline, errors, next posts, posted with metrics, costs, rankings
src/cli.ts        dry | make | replan | approve <id> | list | publish [--at ISO,..] | sync | slots | report [weekly] | metrics <id> k=v | audition | voices
tools/fix/recover.ts  re-render only hook card 1 (the cover) of a rendered mp4 and splice it on; audio untouched
remotion/         Root, Video (sequences + audio), Cards (hook1, hook2, outro), QuestionScene, Captions,
                  fonts (Inter vendored in public/fonts), studio.css (tokens + CreatorStudio.css values)
public/sfx/       tick, ding, whoosh placeholders (synthesized, peak normalized). Replace with licensed files.
```

## Remotion skills (added 2026-11-21)

.claude/skills holds the official Remotion agent skills (remotion-dev/skills, version in skills-lock.json): best-practices
(router), markup, captions, render, docs, upgrade, license. Load the relevant one before changing anything in remotion/ or
src/render.ts. Update with `npx skills update -p`.

## Commands

    npm install
    npm run dry                      # sample set, no API calls, renders out/<id>/video.mp4 (about 3 min)
    npm run voices                   # list ElevenLabs voices
    npm run audition ["line"]        # renders the line in ELEVENLABS.auditionVoices -> out/audition/
    npm run make -- --format pass5 --lang en --count 1
    npm run studio                   # Remotion Studio with the demo plan (hot reload while styling)
    npm run still -- out/<id>/plan.json 24 900   # QA stills of a rendered plan -> out/<id>/stills/
    npm run replan -- out/<id>/plan.json         # re-time + re-render an existing plan, no API calls

Env: copy .env.example to .env. In Claude Code cloud sessions the proxy injects the real API keys, so the
placeholders work; locally and in GitHub Actions set OPENAI_API_KEY and ELEVENLABS_API_KEY.
REMOTION_BROWSER_EXECUTABLE=/opt/pw-browsers/chromium in this container. Node fetch needs
NODE_USE_ENV_PROXY=1 behind the session proxy (the npm scripts set it).

## Video spec

1080x1920, 30 fps. Safe zone (decision 2026-11-10): the quiz layout is a 360x548 phone box scaled 2.5x into
x 90..990, y 220..1590, because TikTok and Instagram overlay the top ~220 px, bottom ~330 px and right ~120 px.
Brand cards are full-bleed navy with their content inside the same box. Frame 0 of hook card 1 is fully composed:
both platforms use it as the cover. hook card 1 (1.5 s) > hook card 2 (1.5 s or voice length) > N questions > outro (3.5 s).
Per question: countdown = max(reading time, format think, ceil(voice end + 0.8 s)), where reading time =
clamp(words of question + answers / 3.5 + 1.5 s (+1 s with image), 5, 14) (src/config.ts READING); the voice
reads the question while the ring runs; dim 0.5 s; reveal = reveal voice + 0.5 s with pop on the correct answer and the explanation shown.
Word captions in the footer from ElevenLabs timestamps. Whoosh on each question, ticks on the last 3 s,
ding on reveal. No fixed length target: the video takes the time the voice takes (first real pass5: 58 s). Soft ceiling 75 s.

## Decisions already made (do not reopen without a reason)

- Render from data with Remotion, never record the live Creator Studio page (timer drift, no voice sync).
- Voice reads the question only; reveal says "The answer is B." plus a phrase of at most 10 words (one reveal per video
  also carries the link-in-bio CTA line).
- Hooks are generated per video; card 2 uses the real timing numbers passed in.
- Excluded categories everywhere: Alcohol & Drugs, Speed Limits & Laws, Licensing & Registration.
- Lovable app UI untouched. One backend addition lives in the Lovable project (decision 2026-11-09): table
  public.videos (anon read only), private bucket `videos` (signed 1-year URLs; workspace policy blocks public
  buckets), and the `ingest` server function at /functions/v1/ingest with actions upsert, update, list,
  used_question_ids and ?action=upload. Writes happen only there, with the shared secret INGEST_TOKEN. No Higgsfield.
- Posting through Postiz Cloud; no own TikTok app audit. From 2026-11-13 the nightly run approves videos itself, but
  only through the QA gate (docs/QA-CHECKLIST.md): nothing is approved or published without a passing QA on its current file.
- Self-healing (decision 2026-11-19): a vision flag holds a video only if a second look at another frame agrees; a video still
  held after the text repair is retired (status skipped, reason on the row) and remade as a fresh video of the same format,
  up to 2 rounds within 40 minutes of the nightly run (`cli held`, `cli skip`, loop in src/nightly.ts). Holds cost render
  time, not posting slots.
- Every approved video goes to TikTok and Instagram Reels in one Postiz request (POSTING.platforms), only to the pinned Driving School channel ids in POSTING.channels (decision 2026-11-23: the Postiz workspace also holds BookVyral's TikTok, Instagram and Facebook; a missing id skips that platform, never falls back to another account). The Postiz key
  lives in Lovable as the secret POSTIZ_API_KEY; the pipeline reaches Postiz through the ingest function's `postiz`
  action (POSTIZ_API_KEY=via-ingest in .env), because the session proxy cannot send a bare Authorization header.
- Three posts a day (decision 2026-11-18, was two from 2026-11-10): 11:00, 15:00 and 19:00 ET weekdays, 11:00, 14:00 and
  17:00 weekends; the nightly run renders the weekday's three formats. When a format's unused pool runs out, pick.ts reuses
  older questions instead of failing the render. Questions may be
  reused in a new set after 60 days (POSTING.reuseAfterDays), since 634 general questions run out in weeks at this rate.
- Hooks: 16 angles (HOOK_ANGLES), chosen by past views with exploration; growth rules in docs/GROWTH.md.
- No year or date in any visible text or caption (decision 2026-11-10): posts must not look expired later.
- Length (decision 2026-11-18): short formats carry maxCountdown in FORMATS (8 s for 5-question, 5 s for signs7) so they
  land at about 60 to 85 s, inside the 30 to 90 s band that wins in docs/research-viral-dataset.md; the voice end still wins.
- Reveal screen (decision 2026-11-18): the explanation is never cut off with an ellipsis. plan.ts fitExplanation shows the full
  text, else its first sentence, else the reveal voice phrase (125 chars, 165 in the picture + 2x2 layout); long-answer picture
  questions hide the picture on the reveal. The spoken caption word is navy on yellow in every theme.
- Captions (decision 2026-11-18): the model writes one short line; src/post.ts adds the score ask (pass mark for 20+ questions)
  and language-correct hashtags. No series numbers in posts. QA check text:caption-clean enforces it; the gate auto-fixes it.
- Format tests (decision 2026-11-18, docs/TESTS.md): question-first opening (FormatDef.opening, hook banner on question 1,
  frame 0 is the cover) in pass5q and signs7q, quick3 (3 questions) and debate1 (one diagram, comment A to D); one test
  and one control a day in NIGHTLY_ROTATION. Classic 30 posts to TikTok only (FormatDef.platforms). Read on 2026-11-25.
- pick6 and link-in-bio CTA (decision 2026-11-18): pick-the-sign (FormatDef.pickSign, src/pick.ts buildPicks, picture
  answers in QuestionScene), outro: false loops (pick6, quick3), a spoken mid-video CTA plus header pill (plan.ts CTA_LINE,
  ctaIndex) and a caption CTA (post.ts BIO_CTA). The bio link is the goal metric (docs/TESTS.md).
- Spoken question guard (fix 2026-11-21): a debate1 voice read "This sign indicates that car A must yield to car B" on a
  diagram, giving the answer away. src/text.ts questionVoProblems rejects a rewrite that drops the question's facts, adds
  claims, says "sign" on a non-sign question or turns it into a statement; one retry, then the bank wording is read as is.
- Review of everything posted (2026-11-21), fixes: (1) one countdown per video (plan.ts setCountdown, the longest any
  question needs) so card 2's "N seconds each" matches the ring on every question; on question 1 under the hook banner
  the ring holds full until the banner ends (segment.ringSeconds). (2) Hooks and captions never claim what other people do
  ("most people fail"), never say "this sign" on a multi-question video, a one-question video never asks for a score
  (text.ts hookProblems, one retry then a safe hook; QA check text:cover-claims); the caption keeps only one score ask
  (post.ts buildCaption drops score and claim sentences from the model line). (3) Questions never used: EXCLUDED_QUESTIONS,
  alcohol/drug words in any category, bare-letter answers, right-of-way scenes in sign formats (pick.ts usable).
  (4) publish re-runs the text checks on approved videos before scheduling and rebuilds a failing caption.
- Nightly 2026-11-21 held 6 of 9 videos, fixes: the outro CTA pill was wider than the box and cut off (now two lines,
  Cards.tsx); the vision QA treated capitals on the cover and live-caption fragments in the footer as errors (prompt now
  says they are fine); too few hashtags (cleanHashtags pads to 5). config EXTRA_RENDERS adds one-off renders to a dated run.
- Pre-render checks (decision 2026-11-21, src/preflight.ts): before any voice is bought, a draft plan (estimated voice
  timing) renders a still of every question and reveal; the vision model flags broken screens and those questions are
  swapped (pick.ts pickReplacement, 2 rounds; sets of 7 or fewer, not pick6). Before the full render, cover, a question
  and the outro of the real plan are checked; a rejected cover gets one new hook. PREFLIGHT=0 turns both off. A failed
  vision call never blocks a render. Re-rendering a held video inside the same run was rejected: same code, same video.
- Empty slots fix (2026-11-24): on 2026-11-21 and 2026-11-22 every format that runs the pre-render check (signs7q, pass5q,
  debate1) crashed in make and left no row: the stills bundle was reused for the full render, but a Remotion bundle copies
  public/ when it is made, so the voice mp3s bought after it 404ed. render.ts now bundles fresh for every render. Text jobs
  never kill a video any more (retry without answers_display, malformed reveal_vo, hook too long all fall back). nightly.ts
  retries a failed make once, then renders the format's control (FALLBACK), and logs each failure as a skipped row with
  error "make failed: ..." so the report and the watchdog see it (`cli make-failed`).
- Voice credits (2026-11-21): make records the ElevenLabs quota on each row (metrics.voice_left_pct); the report shows
  it and RENDERS PER POST (7d); the daily watchdog task alerts under 20% credits or above 1.5 renders per post.
- Visual themes rotate per video (THEMES: light, dark, ink; least used first) so posts never share one fixed look:
  TikTok treats templated sameness as repetitive content (docs/research-tiktok-rules-2026.md).

- Read 2026-11-25 and owner decisions 2026-11-26: (1) no title cards on any format (config isQuestionFirst: opening
  defaults to "question"); (2) rotation: pick6 every day, pass5q/signs7q alternate, quick3, row5, classic30 twice a week,
  tricky5 and debate1 paused; (3) classic30 repeats the CTA on questions 2, 10 and 20 (plan.ts ctaIndexes): viewers watch
  about 51 s; (4) sign formats mix about a third hard signs (config SIGN_MIX, EASY_SIGN_MEANINGS; pick.ts isHardSign,
  mixOrder: easy first, hard mid and last, hard targets get hard distractors), stored as metrics.hard_signs;
  (5) batch production twice a week (src/batch.ts, config BATCH: Sunday makes Mon to Thu, Wednesday makes Fri to Sun,
  plus a buffer of 2 approved unscheduled videos) and a daily run without rendering (src/daily.ts: sync, fill empty
  slots of the next 36 h from the buffer, review, report). `npm run batch`, `npm run daily`, `cli buffer`, `publish --within-hours`.
  (6) every posted video is reviewed once after it posts (src/review.ts, `cli review`): frames every 2 s (6 s for long
  tests) plus a voice transcript against the bank's answers; result on metrics.review, critical issues alert the watchdog.
  One production scheduled task runs daily at 3:17 ET: batch on Sun and Wed (one day per command, 2 h limit), else daily.

## Nightly run (decision 2026-11-10, replaced by batch + daily on 2026-11-26)

Runs as a scheduled task in the owner's Claude Code cloud environment (Default), which holds the OpenAI, ElevenLabs
and ingest credentials as network secrets. A fresh session clones this repo, runs `npm ci` and `npm run nightly`,
and reports the NIGHTLY SUMMARY line. No GitHub secrets needed. Override with NIGHTLY_FORMAT / NIGHTLY_LANG.

## Question bank expansion (tools/, assets/qbank/; plan in docs/QUESTION-BANK-PLAN.md)

    npx tsx tools/diagrams/build.ts          # right-of-way diagrams: rule-derived answers, 3 orientations, frame check
    npx tsx tools/signs/fetch.ts [CODE ...]  # real MUTCD signs from Wikimedia Commons (direct file URLs; ~1 in 3
                                             # requests gets 429 from the shared IP: fixed 8 s retries)
    npx tsx tools/signs/rasterise.ts         # sign SVG -> PNG + captioned contact sheet for visual checking
    npx tsx tools/qbank/draft.ts             # thin-topic questions + all-of-the-above rewrites (gpt-5.4)
    npx tsx tools/qbank/draft-signs.ts       # sign questions (short answers for the large-picture layout)
    python3 -I tools/qbank/sheet.py "$PWD"   # owner review workbook assets/qbank/review.xlsx (thumbnails, flags)
    npx tsx tools/qbank/preview.ts <json> [id ...]   # how questions look in the video, before import
    python3 -I tools/qbank/import.py "$PWD"  # approved rows only: uploads images via ingest
                                             # upload_question_image, writes assets/qbank/import.sql (run via Lovable)

Rules: never invent a sign (Commons only); every generated image is looked at before commit; nothing is imported
without the owner's Y in review.xlsx; the importer refuses rows that do not match their draft (stale sheet).
Video: questions with an image use a flexible image height; when every answer is <= 22 chars they use a 2x2 grid.

## Ledger flow

make -> row status draft -> mp4 + thumb uploaded -> status ready -> `qa` (pass, or held with reasons) -> auto-approve or
`approve <id>` (both need a pass) -> approved. A mistake that got out: `retract <id>`, fix, `qa <id>`, `approve <id>`.
`publish` uploads the approved video to Postiz from its signed URL and schedules it at the next free slot (POSTING in
src/config.ts: 7 pm ET weekdays, 11 am weekends, one per day, 90 min lead). `sync` reads Postiz post states 30 min
after the slot: PUBLISHED -> posted (post_url), ERROR or stuck 12 h -> failed. A failed video is retried once.
used_question_ids from the ledger is merged with cache/used.json so GitHub Actions runners never repeat a set.

## Open issues

1. Length has no target; keep an eye on anything over 75 s (the CLI warns).
2. ElevenLabs upgraded from the free tier on 2026-11-17 (the free 10,000 character cap emptied the 2026-11-17 nightly run).
   Two posts a day is roughly 40,000 to 60,000 characters a month; watch the plan's quota.
3. English voice: Liam (TX3LPaxmHKxFdv7VOQHJ), backup Laura (FGY2WhTYpPnrIDTdsKH5). Spanish voice not cast yet.
4. Only 115 questions have images; signs7 exhausts unique sets after about 16 videos.
5. SFX and music bed must be licensed files before the first public post.
