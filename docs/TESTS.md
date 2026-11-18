# Format tests (started 2026-11-18)

## Why
Instagram reel insights (Windsor, 15 reels, 10 to 18 Nov) show 74 to 89 percent of viewers skip in the first 3 seconds,
average watch time 7 to 18 s, zero comments. The first 3 seconds of every video were two title cards. The viral
dataset (docs/research-viral-dataset.md) says quiz videos under 30 s and 30 to 90 s both win, and that road sign
questions are the easiest to answer in comments.

## Tests (each runs twice a week next to a control, NIGHTLY_ROTATION in src/config.ts)

| Test | Format | Changes vs control | Control | Hypothesis |
|---|---|---|---|---|
| A | pass5q | question 1 from frame 0, hook as a banner on it, no title cards | pass5 | lower 3 s skip rate, longer watch |
| B | signs7q | same as A on sign questions | signs7 | same as A |
| C | quick3 | 3 questions, about 30 to 45 s, question-first | pass5 | short bucket: more completions and rewatches |
| D | debate1 | one right-of-way diagram, about 20 to 25 s, "Which one did you pick? Comment A, B, C or D" | row5 | comments (all controls: 0) |

Classic 30 now posts to TikTok only: Instagram does not recommend reels over 3 minutes (2 views on Instagram).

## What decides it
- Instagram (Windsor connector, per reel): media_reel_skip_rate, media_reel_avg_watch_time, media_views, comments.
- TikTok (Postiz post analytics): views, likes, comments, shares. Add average watch time once TikTok is connected in Windsor.
- Read after 7 days (2026-11-25) and again after 14 days. A test wins when its median skip rate is at least
  10 points under its control on 3+ posts, or its comments per 1,000 views are clearly higher. Winners replace their
  control in the rotation; losers leave it.
