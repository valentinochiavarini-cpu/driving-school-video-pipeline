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
| E | pick6 | "Which sign means X?" with 3 sign pictures as answers, question-first, about 7 s a question, no outro (loops) | signs7 | comments and completion (drivercheck24 format: 6.7M views, 1,136 comments) |

quick3 also ends without an outro (loops). New hook angles realtest, missed and know (promise framing, no stats)
enter the angle rotation as untried angles.

## Link in bio (decision 2026-11-18): the bio link is where the books sell, so it is the goal metric
- Every video speaks one CTA about a third of the way in ("take the full test for your state free at the driving
  school dot app") with a yellow pill over the header, and every caption ends with the same offer and the domain.
- The CTA names the domain, not "link in bio", until TikTok shows a clickable link (business verification failed
  several times, 2026-11-18). Instagram's Website field already holds the link. Funnel behind it: free full test for
  the viewer's state (36 questions for California), then the results page offers $9.99 app access with the ebook
  or the $16.99 Amazon paperback.
- Baseline 10 to 18 Nov: 0 bio link clicks, 11 profile views, 0 profile views attributed to any video. The bio held the
  URL as plain text (not clickable) until the owner adds it in the Website field.
- Read per test: video_profile_views per 1,000 views (Windsor tiktok_organic) and daily bio_link_clicks.

Classic 30 now posts to TikTok only: Instagram does not recommend reels over 3 minutes (2 views on Instagram).

## Competitor review 2026-11-18 (7 videos watched frame by frame with TikTok's own transcripts)
- drivercheck24 6.7M: question 1 at frame 0 on a road photo, picture answers, 7.5 s a question, no outro, music bed.
- safedriver.com 5.1M (15 s): sign collage with a red "DMV Released Answers" label (insider promise).
- caitlyn.studies 4.5M: person on camera reads the questions, plugs an app mid-video.
- quizup244 1.9M, wazirdiy 3.0M, roadsigntrivia (Zutobi) 0.93M: a printed worksheet filmed with a pen or pointer,
  every question visible at once. Zutobi's bio: "Download Zutobi for 600+ questions and practice tests".
- None opens with a title card. Not yet replicated: the filmed worksheet (owner, later) and on-camera people.

## What decides it
- Instagram (Windsor connector, per reel): media_reel_skip_rate, media_reel_avg_watch_time, media_views, comments.
- TikTok (Postiz post analytics): views, likes, comments, shares. Add average watch time once TikTok is connected in Windsor.
- Read after 7 days (2026-11-25) and again after 14 days. A test wins when its median skip rate is at least
  10 points under its control on 3+ posts, or its comments per 1,000 views are clearly higher. Winners replace their
  control in the rotation; losers leave it.
