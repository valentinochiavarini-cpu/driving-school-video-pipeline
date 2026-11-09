# The Driving School video pipeline

Automated production of vertical DMV quiz videos (TikTok / Reels / Shorts) for
The Driving School (the-driving-school.lovable.app). Replaces a $9/video editor.

Owner: Valentino (Inkwise Consulting Ltd). This file is the brief for Claude Code.

## What a video is

1080x1920, 30 fps, 40 to 50 seconds for the 5-question formats.
Sequence: hook card 1 (1.5s) -> hook card 2 (1.5s) -> N questions -> outro (4s).
Each question: question screen with countdown ring (VO reads the question only),
0.5s dim beat, reveal screen (correct answer highlighted, explanation shown, VO reads
"The answer is X." plus one short sentence), next.
Audio: voiceover (ElevenLabs), tick on last 3 countdown seconds, ding on reveal,
whoosh on each new question, optional music bed at -18 dB.

Visual style matches the app's Creator Studio page exactly (same CSS variables,
same layout). `render/template.html` is a faithful standalone replica of
`src/pages/CreatorStudio.tsx` + `CreatorStudio.css` from the Lovable repo.

## Architecture (all local, no wrappers)

```
pipeline/fetch_set.py    Supabase REST -> picks a non-overlapping set per format (ledger in cache/used.json)
pipeline/speakable.py    OpenAI -> rewrites question/answers/explanation for the ear (cached per question id + lang)
pipeline/hooks.py        OpenAI -> card1, card2, vo_line, caption, hashtags (JSON, hard word caps)
pipeline/tts.py          ElevenLabs direct API -> mp3 per line, cached by sha1(text+voice+settings)
pipeline/plan.py         builds plan.json: every screen, its duration (from audio lengths) and audio cues
render/render.js         Playwright: one PNG per screen state from template.html, driven by plan.json
render/assemble.sh       sox SFX + ffmpeg concat + audio mix + mux -> out/<id>.mp4
pipeline/run.py          orchestrator: run.py --format pass5 --lang en --count 3
render/record_live.js    OPTIONAL: records the live Studio page headlessly (for QA only, not for production)
```

Why render-from-data and not record the live app: the Studio's timers are fixed
or reading-length based and drift ~2 percent; voice cannot be synced to it.
Rendering from data is frame exact and does not need the site up.

## Formats (mirror of src/lib/creatorSets.ts FORMATS)

| id      | size | filter                                   | think s |
|---------|------|------------------------------------------|---------|
| pass5   | 5    | general, excluded cats removed, image 1st| 4       |
| signs7  | 7    | image_url only                           | 3       |
| row5    | 5    | Right-of-Way Rules, Road Rules & Right-of-Way | 4  |
| tricky5 | 5    | ROW + Passing Rules + Driving Conditions & Hazards | 4 |
| single  | 1    | any general, prefers image               | 4       |
| full    | state exam count | general + state rows (state questions are thin, 3 to 21 per state) | 3 |

Excluded categories everywhere: Alcohol & Drugs, Speed Limits & Laws, Licensing & Registration.

## Data

Supabase project ksiqvvoqlzdihjubaxbm, table `questions` (735 rows, 634 general,
115 with image_url, all have EN + ES text and explanations).
Columns: id, question_text, answers (jsonb A-D), correct_answer, explanation, category,
state, image_url, question_text_es, answers_es, explanation_es.
The anon key is read-only and already public in the app bundle; it is enough for fetch.
Images are in a public storage bucket; download with plain GET.

## Decisions already made (do not reopen without a reason)

- VO reads the question only, not the four answers. Full reads came to 172s per video.
- Reveal VO: "The answer is B." + one sentence from the explanation (GPT shortens).
- ElevenLabs direct, model eleven_turbo_v2_5 or eleven_multilingual_v2 for ES, speed 1.1 to 1.2,
  stability 0.35, style 0.6 (TikTok feel). Voice ID in config.yaml; user picks by ear.
- Hooks are GPT generated (gpt-4o-mini, JSON mode), card text capped at 7 / 8 words.
- Card 2 copy is derived from the real plan timing, never hand written.
- No Higgsfield. No Lovable code changes required for production.

## Known weak spots (from the Nov 7 test, see docs/findings.md)

1. Length (fixed by question-only reads; verify on first render).
2. Text written for the eye ("e.g., red = stop/prohibition"): speakable.py handles it.
3. Only 115 image questions: signs7 exhausts unique sets after ~16 videos.
4. Fonts: install Inter locally or the render falls back to a wider font.
5. Hook quality unverified until OPENAI_API_KEY is set.

## Env

Copy .env.example to .env. Required: OPENAI_API_KEY, ELEVENLABS_API_KEY.
SUPABASE_URL and SUPABASE_ANON_KEY are prefilled (public read key).

## First tasks for Claude Code

1. `pip install -r requirements.txt && npm install && npx playwright install chromium`
2. `python pipeline/run.py --format pass5 --lang en --count 1 --dry-run` (no API calls, uses docs/sample_set.json)
3. Set keys, run without --dry-run, open out/*.mp4, check length is under 50s.
4. Voice casting: `python pipeline/tts.py --audition "Most people fail this one. Can you pass the 2027 DMV test?"`
   renders the line in each voice listed in config.yaml `audition_voices`.
5. Then: ES language run, signs7 format, batch of 10.
