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
