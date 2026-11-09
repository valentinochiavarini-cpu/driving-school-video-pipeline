# Findings from the Nov 7 to 9 workflow test

## What was tested
- Question extraction from Supabase (735 rows, schema in CLAUDE.md). Works with the public anon key.
- Headless recording of the live Creator Studio (`render/record_live.js`): logs in with the passcode,
  picks "Can you pass? (5)", starts set 1, records 1080x1920 at 25 fps. Clean frames. Kept for QA only.
- Data-driven render (`render/template.html` + Playwright screenshots + ffmpeg): frame exact, deterministic.
- Voiceover: ElevenLabs via a wrapper (Higgsfield) for the test; production uses the direct API in `pipeline/tts.py`.
- Full sample video: hook cards, 5 questions with sign image, countdown ring, reveal, outro, VO, SFX.

## Weak spots, in order
1. Length. Reading question + four answers: 18 to 30 s per question, 172 s per video. Decision: VO reads the
   question only; reveal reads letter + one sentence. Verify first real render is under 50 s, else set think: 3.
2. Live-app recording cannot be synced to voice: Studio timers are fixed or reading-length based and drift
   about 2 percent per second. Do not use for production.
3. Question text is written for the eye ("e.g., red = stop/prohibition", trailing colons). `speakable.py`
   rewrites for the ear and also cleans on-screen answers that contain symbols.
4. Images: only 115 questions have one (106 in Signs). signs7 runs out of unique sets after about 16 videos.
   Consider reusing with different hooks after that, or adding sign images to more questions.
5. Fonts: the render falls back to a wider font if Inter is not installed on the render machine.
   `apt install fonts-inter` (Debian/Ubuntu) or install Inter from Google Fonts on macOS.
6. Hook quality (GPT) is unverified: no OpenAI key was available during the test.
7. Voice: the user rejected the narrator-style sample ("more TikTok"). Cast with `make audition` using the
   ElevenLabs library directly; set stability low (0.3 to 0.4), style 0.5 to 0.7, speed 1.1 to 1.2.
8. Timer drift in the live Studio is also visible to real users of the app (each second is ~1.02 s). Minor.

## V17 (the $9 editor's output) defects, for reference
- Recorded from the "Classic 30" set and cut to 5 questions: every frame says "Question 1 of 30".
- 15 s per question (the 5-question format defines 8 s), 6 s static intro, 107 s total.

## Costs (Likely, verify on first batch)
- OpenAI gpt-4o-mini: under $0.01 per video (speakable rewrites are cached per question, so they amortize to zero).
- ElevenLabs: roughly 600 to 900 characters per 5-question video; at Creator plan rates about $0.10 to $0.20.
- Render: local CPU, about 20 s per video. No per-video infrastructure cost.
