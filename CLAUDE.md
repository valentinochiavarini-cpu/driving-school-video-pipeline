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
src/cli.ts        dry | make [--format --lang --count --state] | audition ["text"] | voices
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

Env: copy .env.example to .env. In Claude Code cloud sessions the proxy injects the real API keys, so the
placeholders work; locally and in GitHub Actions set OPENAI_API_KEY and ELEVENLABS_API_KEY.
REMOTION_BROWSER_EXECUTABLE=/opt/pw-browsers/chromium in this container. Node fetch needs
NODE_USE_ENV_PROXY=1 behind the session proxy (the npm scripts set it).

## Video spec

1080x1920, 30 fps. hook card 1 (1.5 s) > hook card 2 (1.5 s or voice length) > N questions > outro (3.5 s).
Per question: countdown = max(think, ceil(voice end + 0.8 s)), the voice reads the question while the ring
runs; dim 0.5 s; reveal = reveal voice + 0.5 s with pop on the correct answer and the explanation shown.
Word captions in the footer from ElevenLabs timestamps. Whoosh on each question, ticks on the last 3 s,
ding on reveal. No fixed length target: the video takes the time the voice takes (first real pass5: 58 s). Soft ceiling 75 s.

## Decisions already made (do not reopen without a reason)

- Render from data with Remotion, never record the live Creator Studio page (timer drift, no voice sync).
- Voice reads the question only; reveal says "The answer is B." plus a phrase of at most 10 words.
- Hooks are generated per video; card 2 uses the real timing numbers passed in.
- Excluded categories everywhere: Alcohol & Drugs, Speed Limits & Laws, Licensing & Registration.
- No Lovable code changes for production. No Higgsfield.
- Posting through Postiz Cloud; no own TikTok app audit. Approve the first 3 to 4 videos by hand, then auto.

## Open issues

1. Length has no target; keep an eye on anything over 75 s (the CLI warns).
2. ElevenLabs account is on the free tier (10,000 characters per month, no commercial license). A paid plan
   is required before anything is posted publicly. One video uses about 800 characters.
3. English voice: Liam (TX3LPaxmHKxFdv7VOQHJ), backup Laura (FGY2WhTYpPnrIDTdsKH5). Spanish voice not cast yet.
4. Only 115 questions have images; signs7 exhausts unique sets after about 16 videos.
5. SFX and music bed must be licensed files before the first public post.
