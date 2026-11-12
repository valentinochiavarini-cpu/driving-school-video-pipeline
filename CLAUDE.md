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
src/nightly.ts    the nightly run: two formats by weekday (NIGHTLY_ROTATION in config) -> make x2 -> publish approved
                  (2 per day) -> sync + metrics -> report (weekly on Sunday). `npm run nightly`.
.github/workflows/nightly.yml  manual fallback render on GitHub Actions (needs the four secrets); not scheduled.
src/report.ts     daily/weekly report from the ledger: pipeline, errors, next posts, posted with metrics, costs, rankings
src/cli.ts        dry | make | replan | approve <id> | list | publish [--at ISO,..] | sync | slots | report [weekly] | metrics <id> k=v | audition | voices
tools/fix/recover.ts  re-render only hook card 1 (the cover) of a rendered mp4 and splice it on; audio untouched
remotion/         Root, Video (sequences + audio), Cards (hook1, hook2, outro), QuestionScene, Captions,
                  fonts (Inter vendored in public/fonts), studio.css (tokens + CreatorStudio.css values)
public/sfx/       tick, ding, whoosh placeholders (synthesized, peak normalized). Replace with licensed files.
```

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
- Voice reads the question only; reveal says "The answer is B." plus a phrase of at most 10 words.
- Hooks are generated per video; card 2 uses the real timing numbers passed in.
- Excluded categories everywhere: Alcohol & Drugs, Speed Limits & Laws, Licensing & Registration.
- Lovable app UI untouched. One backend addition lives in the Lovable project (decision 2026-11-09): table
  public.videos (anon read only), private bucket `videos` (signed 1-year URLs; workspace policy blocks public
  buckets), and the `ingest` server function at /functions/v1/ingest with actions upsert, update, list,
  used_question_ids and ?action=upload. Writes happen only there, with the shared secret INGEST_TOKEN. No Higgsfield.
- Posting through Postiz Cloud; no own TikTok app audit. Approve the first 3 to 4 videos by hand, then auto.
- Every approved video goes to TikTok and Instagram Reels in one Postiz request (POSTING.platforms). The Postiz key
  lives in Lovable as the secret POSTIZ_API_KEY; the pipeline reaches Postiz through the ingest function's `postiz`
  action (POSTIZ_API_KEY=via-ingest in .env), because the session proxy cannot send a bare Authorization header.
- Two posts a day (decision 2026-11-10): 11:00 and 19:00 ET weekdays, 11:00 and 17:00 weekends. Questions may be
  reused in a new set after 60 days (POSTING.reuseAfterDays), since 634 general questions run out in weeks at this rate.
- Hooks: 16 angles (HOOK_ANGLES), chosen by past views with exploration; growth rules in docs/GROWTH.md.
- No year or date in any visible text or caption (decision 2026-11-10): posts must not look expired later.
- Visual themes rotate per video (THEMES: light, dark, ink; least used first) so posts never share one fixed look:
  TikTok treats templated sameness as repetitive content (docs/research-tiktok-rules-2026.md).

## Nightly run (decision 2026-11-10)

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

make -> row status draft -> mp4 + thumb uploaded -> status ready. `approve <id>` sets approved + status approved.
`publish` uploads the approved video to Postiz from its signed URL and schedules it at the next free slot (POSTING in
src/config.ts: 7 pm ET weekdays, 11 am weekends, one per day, 90 min lead). `sync` reads Postiz post states 30 min
after the slot: PUBLISHED -> posted (post_url), ERROR or stuck 12 h -> failed. A failed video is retried once.
used_question_ids from the ledger is merged with cache/used.json so GitHub Actions runners never repeat a set.

## Open issues

1. Length has no target; keep an eye on anything over 75 s (the CLI warns).
2. ElevenLabs account is on the free tier (10,000 characters per month, no commercial license). Two posts a day
   is roughly 40,000 to 60,000 characters a month (Classic 30 alone is about 4,000): Creator plan or pay-as-you-go
   on top of Starter, before public posting.
3. English voice: Liam (TX3LPaxmHKxFdv7VOQHJ), backup Laura (FGY2WhTYpPnrIDTdsKH5). Spanish voice not cast yet.
4. Only 115 questions have images; signs7 exhausts unique sets after about 16 videos.
5. SFX and music bed must be licensed files before the first public post.
