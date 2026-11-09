# The Driving School video pipeline: build plan

Status: approved 2026-11-09, decisions in section 8. Owner: Valentino (Inkwise Consulting Ltd).
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

1080x1920, 30 fps. No fixed length target (decision 2026-11-09): a video takes the time its voice takes. Soft ceiling 75 s, the CLI warns above it.
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

Measured: first real pass5 render is 58 s.

Formats, filters, excluded categories, hook rules, caption rules: exactly as in CLAUDE.md.

## 4. Posting to TikTok on a schedule

Facts (verified 2026-11-09 against TikTok's developer docs, Postiz's docs and pricing, and Postiz's GitHub issues; sources at the end):
- TikTok's own Content Posting API, unaudited: posts forced to private (SELF_ONLY), the account must be private
  at posting time, at most 5 users per app per 24 h. Public posting needs an audit of the consent UX. Certain.
- The audit is a UI review. Generic composers get rejected for not following TikTok's UX guidelines (Postiz
  issue 1362 is one example). A headless poster has no UI to review. Likely: our own app would be rejected or
  take weeks, for a saving of about $29 per month. Not worth it now.
- Per-creator cap from the API: about 15 posts per day per account, shared across all API clients, with a
  spam_risk_too_many_posts error above it. Certain.
- Postiz Cloud: Standard plan $29 per month ($23 yearly), 5 channels, public API and webhooks included, 7-day
  trial. Posts can be created with a future date. TikTok settings exposed: privacy, comments, duet, stitch,
  AI-generated flag, branded content and own-brand flags, direct post or upload-to-inbox. Certain.
- Postiz Cloud reliability on TikTok is medium. Open or recent GitHub issues: the shared TikTok app hit
  TikTok's daily active-user cap (1854), failed uploads sit in the queue for about 30 minutes with a misleading
  error (2369), upload mode drops the privacy field (1338). Certain that the issues exist, Guessing on how
  often they bite a single-account user.
- Ayrshare: most mature API, $149 per month for one profile. Too expensive for one account. Zernio (formerly
  Late) and Upload-Post are cheaper API-first options, not verified.

Decision: Postiz Cloud Standard, direct post mode, with the pipeline polling post status after the scheduled
time and marking the ledger failed when Postiz does not confirm. A failed post triggers one retry the next
day, never a same-day repost. If Postiz fails more than twice in the first month, switch to Upload-Post or
Zernio: the publish module is one file and the ledger does not change. Own TikTok app audit: not pursued.

### Best practices for a fully automated account

1. Cadence: 1 post per day at a fixed time for the first 2 weeks on the new account, then 1 to 2 per day. Never
   bursts, never catch-up posting of a missed day. TikTok's cap is around 15 per day per account, the spam
   risk starts far lower. Certain on the cap, Likely on the safe cadence (vendor blogs disagree, 1 to 3 per
   day is the common range).
2. Timing: start at 7 pm US Eastern on weekdays, 11 am on weekends, then after 14 days read TikTok Analytics
   follower activity for the account and move the slot. Account-specific data beats every published table.
3. Variety: every video gets a distinct hook, caption and 3 to 5 hashtags drawn from a rotating pool. Identical
   captions across posts are a spam signal. The hook generator already enforces this per video; the pipeline
   also rejects a caption identical to any of the last 30.
4. Disclosures: set the AI-generated flag on every post (synthetic voice). TikTok says the label does not reduce
   reach for eligible content, and an undisclosed synthetic voice is a policy risk. Set the own-brand
   commercial disclosure, since every video promotes The Driving School with a link in bio. Likely required,
   Certain that it is harmless.
5. Account type: Business account, link in bio to the app, pinned best video. Keep comments, duet and stitch
   allowed: they are engagement signals.
6. Human in the loop: approve the first 3 to 4 videos by hand, then auto-approve. Keep a pause flag in the ledger
   as a kill switch, and a daily digest (rendered, scheduled, posted, failed) sent by email.
7. Feedback: pull views, watch time, likes and comments per post after 24 h and 7 d into the ledger. Use them to
   weight hook styles and formats in the generator after the first 30 posts.
8. Comments: reply by hand in the first weeks. There is no API for replying and early replies lift reach.
9. Music: our own licensed bed or none. Business accounts cannot use the mainstream library through the API
   anyway. SFX must be licensed files before the first public post (the synthesized placeholders are fine for
   tests).
10. Languages: English only now. Spanish later on a separate account with its own voice and hooks, never the
    same video on two accounts.

Approval gate: status flow draft > ready > approved > scheduled > posted or failed. For the first videos,
`approve <id>` on the CLI (or flipping the column in Supabase) moves ready to approved. After you flip
auto_approve in config, ready videos are scheduled without a stop. The Lovable queue page (phase 5) is a nicer
front end for the same table, optional.

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

Phase 2, batch: DONE on the code side 2026-11-09 (ledger through the Lovable ingest function, upload after render,
approve/list commands, nightly + manual GitHub Actions workflow). Open: owner adds INGEST_TOKEN in Lovable and the
three secrets in GitHub, then the first Actions run. Acceptance: 10 videos rendered by Actions overnight with no repeats.

Phase 3, publish: code DONE 2026-11-09 (src/publish.ts, nightly workflow steps). Open on the owner's side: Postiz
account, TikTok connected, API key in GitHub secrets. Metrics pull: later, once posts exist. Acceptance: one video posted publicly at a scheduled time from
the pipeline, post id written back to the ledger.

Phase 4, formats (one to two sessions): ES voice and copy, signs7, row5, tricky5, music bed, licensed SFX.
Fix for the 115-image ceiling: reuse sign questions with new hooks after 16 videos, or add images to
more questions in Supabase.

Phase 5, content queue in Lovable (one session, Lovable credits): page listing the `videos` table with
preview, approve, skip, reschedule. Optional but recommended before going fully hands-off.

## 8. Decisions (taken 2026-11-09)

1. Headcount: 1. Remotion free license applies.
2. Posting route: Postiz Cloud Standard. No own TikTok app audit.
3. Approval gate: manual approval for the first 3 to 4 videos, then auto-approve.
4. Production runner: GitHub Actions nightly. Claude Code sessions build, QA and change the repo.
5. Accounts: one TikTok account, English. Spanish later on a separate account.

## 9. Phase 0 checklist (next session)

- Create the private GitHub repo driving-school-video-pipeline and push this tree.
- Secrets: OPENAI_API_KEY, ELEVENLABS_API_KEY, SUPABASE_SERVICE_KEY (writes to the ledger and bucket), POSTIZ_API_KEY.
- Supabase: `videos` table and `videos` storage bucket (public read).
- Postiz: start the 7-day trial, connect the TikTok Business account, create the API key.
- Claude Code environment: allow ksiqvvoqlzdihjubaxbm.supabase.co, api.openai.com, api.elevenlabs.io, api.postiz.com.

## Sources

- TikTok Content Sharing Guidelines (unaudited limits, per-creator caps): https://developers.tiktok.com/docs/en/content-sharing-guidelines
- TikTok Direct Post reference: https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post
- Postiz pricing: https://postiz.com/pricing
- Postiz plans and limits: https://docs.postiz.com/cloud/plans
- Postiz TikTok provider settings: https://docs.postiz.com/public-api/providers/tiktok
- Postiz TikTok issues: https://github.com/gitroomhq/postiz-app/issues/1854 , https://github.com/gitroomhq/postiz-app/issues/2369 , https://github.com/gitroomhq/postiz-app/issues/1338 , https://github.com/gitroomhq/postiz-app/issues/1362
- TikTok AI label rules (third party): https://www.hypelive.io/en/blog/tiktok-ai-content-rules-2026
- Ayrshare pricing (third party): https://planvortex.com/en/resources/ayrshare-alternatives
- TikTok posting API reality check, audit and limits: https://timetopost.co/blog/how-to-post-to-tiktok-api/
- TikTok API guide 2026 (audit, limits): https://www.postzen.dev/blog/tiktok-api
- Remotion license terms: https://www.remotion.dev/docs/license
- Remotion company licenses: https://www.remotion.dev/blog/company-licenses
- Scheduling APIs compared (Postiz, Ayrshare, Zernio): https://website-apn.pages.dev/blog/best-social-media-scheduling-apis-compared
- Postiz on Railway (self-hosted TikTok scheduling): https://railway.com/deploy/deploy-postiz-for-tiktok-scheduling
