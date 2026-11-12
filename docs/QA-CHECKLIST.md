# Quality gate (decision 2026-11-12)

Nothing reaches Postiz unless its current file passed every check. Code: `src/qa.ts` (checks), `src/gate.ts`
(fix loop, auto-approve, retract). The result is stored on the ledger row (`metrics.qa`) with the exact file URL it
checked; replacing the file voids it.

## The checklist

| Check | What fails it | Fixed automatically? |
|---|---|---|
| format | a test format (`single`) or an unknown format | no: marked skipped, never posted |
| file | not 1080x1920, not 30 fps, not H.264 + AAC, shorter than 15 s, longer than 240 s (900 s for classic30/full) | no |
| audio | mean volume below -35 dB (silent) or peak above -0.1 dB (clipping) | no |
| frames | the cover, a question frame or the outro is blank | no |
| cover | frame 0 does not read exactly as card 1, or shows markup, cut-off or garbled text (vision model) | yes: cover re-rendered |
| layout | text cut off, overlapping or unreadable, a broken image, a rendering error (vision model) | no |
| text | card 1 without exactly one highlight or without "driving test"/"DMV"; asterisks anywhere; a year anywhere; caption missing; not 3 to 8 hashtags; post text over 2,000 chars | yes, except a year or a missing "driving test" |
| content | a question missing from the bank, a question in an excluded category, wrong question count | no |

## The flow

    render -> QA -> (fail, fixable) fix once -> QA again -> pass -> auto-approve -> publish (QA re-checked) -> sync
                 -> (fail, not fixable) HELD: stays "ready", reasons in the report, never posted

- The nightly run does `make` x2, `qa`, `auto-approve`, `publish`, `sync`, `report`.
- `approve <id>` by hand also requires a pass (`--force` overrides; do not use it for public posts).
- `publish` skips any approved video without a passing QA for its current file.
- The report shows a "HELD BY QA" block with the reasons for every held video.

## When a mistake gets out

    npx tsx src/cli.ts retract <id> "what is wrong"   # cancels scheduled posts in Postiz, clears approval and QA
    # if it was already live: delete it in the TikTok and Instagram apps (Postiz cannot remove a published post)
    # fix the cause in code, then repair the video (tools/fix/recover.ts for the cover, or a re-render)
    npx tsx src/cli.ts qa <id>                        # must PASS
    npx tsx src/cli.ts approve <id>                   # publish picks it up at the next free slot

Every mistake that gets out also gets a new check here, so it cannot get out twice.

## History

- 2026-11-12: covers of signs7 and row5 showed raw asterisks ("*DRIVING TEST*"). Caught by eye before posting,
  repaired with tools/fix/recover.ts. Added the cover and text checks; the renderer no longer draws asterisks.
- 2026-11-12: row5 hashtags were stored without "#". The caption builder now adds it; the text check enforces it.
