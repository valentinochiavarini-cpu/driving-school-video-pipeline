# The Driving School video pipeline: build plan

Status: proposal, 2026-11-09. Owner: Valentino (Inkwise Consulting Ltd).
Goal: fully automated vertical DMV quiz videos (TikTok first, Reels and Shorts second), rendered from the
question bank behind the-driving-school.lovable.app, posted on a schedule, with no editor in the loop.

## 1. Roles of each system

| System | Role | Notes |
|---|---|---|
| Lovable app + Supabase | Source of truth for content | questions table (735 rows), sign images in public storage, CSS tokens and Creator Studio styles. Read only via the anon key. |
| Supabase (same project) | Ledger and video store | New table `videos` (id, format, lang, question ids, status, caption, hashtags, mp4 url, scheduled_at, tiktok post id, metrics). New storage bucket `videos`. Lets a Lovable page show the queue later. |
| GitHub repo `driving-school-video-pipeline` | Code and the scheduled render job | Private. GitHub Actions runs the nightly batch. Claude Code sessions build, QA and change it. |
| OpenAI (gpt-4o-mini) | Text: hooks, spoken rewrites, captions, hashtags | Under $0.01 per video. Cached per question. |
| ElevenLabs | Voiceover with word timestamps | Timestamps drive on-screen captions. About $0.10 to $0.20 per video. |
| Remotion (TypeScript) | Rendering | Frame exact, animated, audio in sync, parallel render. Free for companies with up to 3 employees, otherwise a Company License. |
| Scheduler with an API (Postiz recommended) | Posting to TikTok on a schedule | Holds an audited TikTok app so posts are public from day one. |
| Creator Studio page (Lovable) | Design reference and manual QA | Not used for production rendering (timer drift, no voice sync). Left untouched. |

## 2. Rendering: why Remotion and not screenshots or the live app

Three options were on the table.

1. Record the live Creator Studio auto-play. Rejected: timers drift about 2 percent, the voice cannot be
   synced, the result is not deterministic. Keep the page as the visual reference and for manual QA.
2. One Playwright screenshot per screen state, concatenated with ffmpeg (what the zip does). Works today,
   verified in a dry run, but every frame is static: the countdown ring jumps once a second, no pulse, no pop
   on the reveal, no dim fade, no animated captions. On TikTok that reads as a slideshow.
3. Remotion: React components rendered frame by frame at 30 fps by headless Chromium. Same CSS tokens and
   the same Creator Studio stylesheet, so the look stays identical to the app, plus real motion: smooth ring,
   urgent pulse on the last 3 seconds, reveal pop, dim fade, kinetic hook text, word-level captions synced to
   the voice, whoosh transitions. Audio tracks are placed on the timeline in code, no ffmpeg scripting.

Decision: option 3. The whole pipeline becomes one TypeScript project (fetch, LLM, TTS, plan, render,
publish). The Python and bash code in the zip is ported, not kept; its prompts, format rules, timing
decisions and SFX design carry over unchanged.

Fallback if the Remotion license does not fit: option 2 upgraded with Playwright's fake clock, one
screenshot per frame. Same motion, roughly 3 times slower renders, no license question.

## 3. Video spec (unchanged from the brief, with one timing fix)

1080x1920, 30 fps, target 40 to 50 s for 5-question formats.
Hook card 1 (1.5 s) > hook card 2 (1.5 s) > N questions > outro (3 to 4 s).

Per question:
- Question phase: the countdown starts when the voice starts reading the question. Length =
  max(voice length + 1 s, think seconds). This is the fix: the old formula added think time after the
  voice and produced 65 to 75 s videos. think = 5 (pass5, row5, tricky5), 4 (signs7).
- Dim beat 0.5 s.
- Reveal: correct answer highlighted with pop, explanation shown, voice says "The answer is B." plus one
  sentence. Length = voice + 0.5 s.
- Captions: question text as word-synced captions over the lower third, from ElevenLabs timestamps.
- Audio: voice, tick on last 3 seconds, ding on reveal, whoosh on each new question, music bed at -18 dB.

Estimated length for pass5 with real voice: 3 + 5 x (5.5 + 0.5 + 3) + 3 = about 51 s. Tune think to 4.5
or trim the reveal sentence if the first renders land over 50.

Formats, filters, excluded categories, hook rules, caption rules: exactly as in CLAUDE.md.

## 4. Posting to TikTok on a schedule

Facts (verified 2026-11-09, see sources at the end):
- TikTok's own Content Posting API lets an unaudited app post only privately (SELF_ONLY). Public posting
  needs an app audit with a demo of the consent flow. Audit time is not published. Up to 5 users per app per
  24 h before the audit. Likely: the audit takes weeks and can be rejected for a fully automated flow.
- Scheduler products (Postiz, Ayrshare, Zernio formerly Late, Upload-Post) already hold an audited TikTok
  app. You connect the account once, then their API takes a video URL, caption and a time. Postiz: cloud
  from about $29 per month with API, or self-hosted for free (AGPL). Ayrshare is the most mature and the
  most expensive.
- The Higgsfield TikTok tools available in this session require Higgsfield-hosted media and a manual
  publish form per video. No scheduling. Not a fit.

Decision: Postiz cloud for the first months (fastest route to public scheduled posts, also covers Reels
and Shorts from the same call). In parallel, register our own TikTok app and apply for the Direct Post
audit; switch when it passes to remove the monthly fee. Cadence: 1 post per day per account, hooks and
formats rotated, never bursts. TikTok treats bursts and identical captions as spam.

Approval gate: the pipeline sets status = ready; a Lovable "Content queue" page (phase 5) lets you preview
and approve or skip; the poster only schedules approved videos. Until that page exists, approval is a
column you flip in Supabase, or auto-approve when you trust the output.

## 5. Where it runs

- Build, QA, changes: Claude Code sessions on the GitHub repo. The cloud session network must allow
  ksiqvvoqlzdihjubaxbm.supabase.co, api.openai.com, api.elevenlabs.io and the scheduler's API host, with
  the API keys saved as environment secrets.
- Production: GitHub Actions, nightly cron on ubuntu-latest (ffmpeg, Node, Chromium via Remotion). Steps:
  pick questions, generate text, synthesize voice, render, upload mp4 to Supabase storage, write the
  ledger row, schedule the post. About 2 to 4 Actions minutes per video, inside the free tier for a
  private repo at 1 to 3 videos per day.
- Why not run production from Claude sessions: each run would spend model tokens to do deterministic work,
  and a scheduled agent can drift. Claude sessions stay the tool for building and reviewing.

## 6. Repo layout (TypeScript)

```
src/
  config.ts          formats, timing, brand, voices (replaces config.yaml)
  supabase.ts        fetch questions, upload mp4, ledger read/write
  pick.ts            non-overlapping set per format, image first, no same category twice (port of fetch_set.py)
  text.ts            OpenAI: speakable rewrite (cached), hooks, caption, hashtags (ports of speakable.py, hooks.py)
  voice.ts           ElevenLabs with timestamps, cached by hash, silence trim
  plan.ts            timeline: every screen, start, duration, audio cues, caption words
  publish.ts         scheduler API: create post at scheduled_at, read status and metrics back
  cli.ts             make | batch | audition | publish | status
remotion/
  Root.tsx           composition registration (1080x1920, 30 fps, duration from plan)
  Video.tsx          sequences: HookCard, Question, Reveal, Outro, Captions
  studio.css         copy of src/pages/CreatorStudio.css + the CSS tokens from src/index.css
  sfx/               tick, ding, whoosh (synthesized placeholders, replace with licensed files)
.github/workflows/
  nightly.yml        cron: render N videos, upload, schedule posts
  render-one.yml     manual: format, lang, count
docs/               this plan, findings, sample set, sample sign
```

## 7. Phases

Phase 0, setup (one session): create the private repo, push, add secrets (OpenAI, ElevenLabs, Supabase
service key for writes, scheduler API key), create the `videos` table and bucket, allow the hosts for
Claude Code sessions.

Phase 1, render (two to three sessions): TypeScript port of pick, text, voice, plan. Remotion composition
with the Studio styles. Dry mode with the sample set (no API calls). First real EN pass5 video. Voice
audition and casting. Check length, legibility on a phone, caption sync. Acceptance: one video you would
post as is.

Phase 2, batch (one session): batch command, ledger rows, mp4 upload to Supabase storage, GitHub Actions
nightly workflow, manual workflow. Acceptance: 10 videos rendered by Actions overnight with no repeats.

Phase 3, publish (one session plus account setup on your side): Postiz account, TikTok connected,
publish command, status and metrics sync. Acceptance: one video posted publicly at a scheduled time from
the pipeline, post id written back to the ledger.

Phase 4, formats (one to two sessions): ES voice and copy, signs7, row5, tricky5, music bed, licensed SFX.
Fix for the 115-image ceiling: reuse sign questions with new hooks after 16 videos, or add images to
more questions in Supabase.

Phase 5, content queue in Lovable (one session, Lovable credits): page listing the `videos` table with
preview, approve, skip, reschedule. Optional but recommended before going fully hands-off.

## 8. Decisions needed from you

1. Headcount of Inkwise Consulting Ltd: 3 or fewer means Remotion is free. Otherwise the fallback renderer
   or a Company License.
2. Posting route: Postiz cloud now plus our own TikTok app audit in parallel (recommended), or wait for the
   audit and post privately in the meantime.
3. Approval gate: human approval per video (queue page) or auto-post from day one.
4. Production runner: GitHub Actions (recommended) or scheduled Claude Code sessions.
5. Accounts: one TikTok account for EN only, or EN and ES on separate accounts.

## Sources

- TikTok Direct Post reference (unaudited clients post privately): https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post
- TikTok posting API reality check, audit and limits: https://timetopost.co/blog/how-to-post-to-tiktok-api/
- TikTok API guide 2026 (audit, limits): https://www.postzen.dev/blog/tiktok-api
- Remotion license terms: https://www.remotion.dev/docs/license
- Remotion company licenses: https://www.remotion.dev/blog/company-licenses
- Scheduling APIs compared (Postiz, Ayrshare, Zernio): https://website-apn.pages.dev/blog/best-social-media-scheduling-apis-compared
- Postiz on Railway (self-hosted TikTok scheduling): https://railway.com/deploy/deploy-postiz-for-tiktok-scheduling
