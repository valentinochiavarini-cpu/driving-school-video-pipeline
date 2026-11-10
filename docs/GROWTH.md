# Growth playbook

Goal: followers and link-in-bio clicks for The Driving School, from short quiz videos, at a cost that stays
under what one paying learner is worth. Every video is an experiment with three recorded variables: format
(length and question mix), hook angle, and posting slot. The ledger holds them; the weekly report ranks them.

## KPIs, in order
1. Views per post (median, not mean: one viral post should not hide a weak week).
2. Comments per 100 views (people dropping their score = the format is working).
3. Follower growth per week (Postiz account analytics).
4. Link clicks: the bio link carries `?utm_source=tiktok&utm_medium=bio`; read it in Lovable analytics.
5. Cost per 1,000 views (voice + text + Postiz, from the report's cost line).

## Platform rules that shape the pipeline (from docs/research-tiktok-rules-2026.md, Nov 2026)
- TikTok penalizes sameness, not automation: "continuous videos posted with the same template-based content, even
  with minute differentiating factors (music, voiceovers, background)" is repetitive content. Posting through an
  audited scheduler carries no documented reach penalty. Consequences for us:
  - Three visual themes rotate per video (light, dark, ink) and five structural formats rotate per week. Add formats
    with a different structure (one hard question with a timer, scenario explainer, myth vs fact, state-specific)
    before adding more of the same shape.
  - Every video carries something new: the explanation on each reveal. Keep it; consider a mnemonic line.
  - Human layer, which the pipeline cannot do: record your own voice on about a third of posts, film some real road
    or sign footage, reply to comments with video replies weekly. These are what template accounts lack.
  - Hybrid option: POSTING.tiktok.content_posting_method = "UPLOAD" sends drafts to the TikTok app inbox so the
    owner finishes them natively (text, sound, cover) and posts by hand. Use it for the first weeks if reach looks
    suppressed, then return to DIRECT_POST.
- Cadence: 1 to 2 posts a day for the first 30 days (we run 2), never near the 15-per-day API cap.
- AI label on every post (synthetic voice). TikTok states the label itself does not reduce distribution.
- Never imply an official DMV account: the brand is The Driving School, hooks say "driving test"; "DMV test" is
  the subject, never the identity.
- Videos over 60 s are the only length eligible for Creator Rewards; ours are 80 s and up.
- Kill signal: check TikTok Studio analytics weekly for "not eligible for the For You feed" flags. Two or more in a
  week means pause the theme or format that produced them and change its structure, rather than appeal and repeat.
- No engagement bait with fake incentives. "Drop your score in the comments" is fine.

## Cadence
- 2 posts a day, 11:00 and 19:00 Eastern on weekdays, 11:00 and 17:00 on weekends. Never bursts.
- After 14 days move the slots to the hours TikTok Analytics shows for the account.

## Experiments
- Hook angle: 16 angles in src/config.ts. Untried angles go first; then 70 percent best-by-views, 30 percent random.
- Format: short (5 to 7 questions, about 90 s), medium (10 to 15, 3 to 4 min), long (Classic 30, about 8 min).
- Wording: "driving test" three times out of four, "DMV test" once.

## Decision rules (weekly report flags them)
- CUT: an angle or format with at least 4 posts and average views under half the 30-day median.
- SCALE: at least 4 posts and average views over 1.5 times the median: give it more of the rotation.
- A format that costs more than 2x the median cost per 1,000 views gets fewer slots regardless of views.
- Keep at least 3 angles and 2 formats alive at all times, so the comparison stays honest.

## Reading the report
`npm run report` (daily) and `npm run report -- weekly`. Metrics arrive from Postiz analytics once posts are live;
until then, or for platforms Postiz does not cover, enter them by hand:
`npm run metrics -- <video id> views=1200 likes=40 comments=12 shares=3 saves=5`.

## Reconciliation
Monthly: compare the report's cost line with the ElevenLabs, OpenAI and Postiz invoices and adjust COSTS in
src/config.ts. Compare posted counts with the TikTok profile.
