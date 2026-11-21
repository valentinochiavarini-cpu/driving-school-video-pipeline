/** Pure config: no Node imports, so the Remotion bundle can import it too. */
export const BRAND = {
  name: "THE DRIVING SCHOOL",
  /** no year anywhere in visible text (decision 2026-11-10): posts must not look expired months later */
  /** CTA target (decision 2026-11-18): the TikTok bio has no clickable link yet (business verification pending), so every
   *  CTA names the site itself. The landing page offers a free full test for the viewer's state, then the $9.99 app +
   *  ebook or the Amazon paperback on the results page. Switch the wording back to "link in bio" once TikTok has the link. */
  url: "thedrivingschool.app", urlSpoken: "the driving school dot app",
  cta: "FREE STATE TEST: THEDRIVINGSCHOOL.APP", ctaEs: "EXAMEN GRATIS: THEDRIVINGSCHOOL.APP",
  /** logo files relative to public/ (white on dark cards). Falls back to the name in text when missing. */
  logoWhite: "brand/logo-white.png", logoDark: "brand/logo-dark.png",
};

/** Hook angles. One is chosen per video (weighted by past views once metrics exist, with exploration) and stored
 *  in the ledger as hook.style so the weekly report can rank them and cut the losers. Add freely, never invent stats. */
export const HOOK_ANGLES: { id: string; brief: string }[] = [
  { id: "fail", brief: "fear of failing: would you fail the driving test on these? (never claim how many people fail)" },
  { id: "challenge", brief: "a direct dare: can YOU pass the driving test" },
  { id: "sign", brief: "curiosity about road signs: do you know what they all mean (say \"this sign\" only for a one-question video)" },
  { id: "count", brief: "the size of the test as the hook, using timing.count" },
  { id: "score", brief: "a pass mark to beat, using pass_mark out of timing.count" },
  { id: "newdriver", brief: "identity: for new drivers and permit test takers this week" },
  { id: "retake", brief: "relatable: people who failed the driving test once and are retaking it" },
  { id: "parent", brief: "parents or experienced drivers: would you still pass the written driving test today" },
  { id: "trick", brief: "the trick question: the one driving test question that looks easy and is not" },
  { id: "timer", brief: "pressure: answer before the timer runs out, using timing.seconds_per_question" },
  { id: "rightofway", brief: "who goes first: right-of-way situations that are easy to get wrong (only if the set has right-of-way questions)" },
  { id: "silent", brief: "a quiet, confident statement: this is the real driving test. No hype words." },
  { id: "bet", brief: "a bet or wager with the viewer: get them all right and comment, miss one and share" },
  { id: "duo", brief: "play it with someone: take the driving test with a friend, partner or parent and compare scores" },
  { id: "update", brief: "the current test: driving test questions people are not ready for (no year, no invented changes)" },
  { id: "honest", brief: "honest framing: no tricks, real written driving test questions, keep score" },
  // promise angles (competitor review 2026-11-18): framed as real exam content; never claim leaked or official answers, no stats
  { id: "realtest", brief: "real exam content: these are the kind of questions you get on the actual DMV written test" },
  { id: "missed", brief: "easy-to-miss questions on the written test, without claiming how many people miss them" },
  { id: "know", brief: "what the written test checks: if you know these, you are ready for the permit test" },
];
export type HookStyle = string;

/** Visual themes, rotated per video so consecutive posts do not share one fixed look (TikTok treats templated
 *  sameness as repetitive content, see docs/GROWTH.md). Tokens: light = the app's light theme, dark = the app's
 *  .dark theme, ink = brand navy with the highlight yellow. Stored in the ledger as metrics.theme. */
export const THEMES = ["light", "dark", "ink"] as const;
export type Theme = (typeof THEMES)[number];

/** Nightly rotation: two formats per weekday (decision 2026-11-10: two posts a day). */
export const NIGHTLY_ROTATION: Record<string, string[]> = {
  // dataset 2026-10 (docs/research-viral-dataset.md): 30 to 90 s quizzes and 5 min+ full tests win; 90 s to 5 min loses
  // test weeks from 2026-11-18 (docs/TESTS.md): one control and one test a day, each test twice a week
  // 2026-11-18 (later): pick6 added from the competitor review (docs/TESTS.md); debate1 once a week
  // three a day from 2026-11-18: one control and two tests (pick6 4, signs7q 4, pass5q 3, quick3 3, debate1 2 a week)
  Mon: ["pass5", "pick6", "signs7q"], Tue: ["row5", "quick3", "pass5q"], Wed: ["tricky5", "pass5q", "pick6"],
  Thu: ["signs7", "debate1", "quick3"], Fri: ["pass5q", "quick3", "signs7q"], Sat: ["classic30", "signs7q", "pick6"],
  Sun: ["signs7q", "pick6", "debate1"],
};

/** Cost assumptions for the report (USD). ElevenLabs Turbo pay-as-you-go per 1k characters; OpenAI gpt-4o-mini
 *  per video is a rough all-in average; Postiz Standard monthly. Reconcile with the platform invoices monthly. */
export const COSTS = { elevenlabsPer1kChars: 0.04, openaiPerVideo: 0.004, postizPerMonth: 29, remotionPerMonth: 0 };

export const VIDEO = {
  width: 1080,
  height: 1920,
  fps: 30,
  hook1Seconds: 1.5,
  /** question-first opening: the hook banner sits over question 1 this long; question 1 gets this much extra time */
  bannerSeconds: 2.5,
  hook2Seconds: 1.5,
  outroSeconds: 3.5,
  dimSeconds: 0.5,
  revealTailSeconds: 0.5,
  /** the countdown starts with the voice; it lasts at least this long, or voice + this margin */
  voiceMarginSeconds: 0.8,
};

export type FormatDef = {
  size: number | "state";
  think: number;
  /** cap on the reading-time part of the countdown (the voice end still wins); keeps short formats under ~75 s */
  maxCountdown?: number;
  /** "cards" (default): hook card 1 + card 2 before question 1. "question": question 1 from frame 0 with the hook as a
   *  banner over it (test 2026-11-18: 74 to 89 percent of Instagram viewers skipped during the two title cards) */
  opening?: "cards" | "question";
  /** channels this format posts to (default POSTING.platforms). Instagram does not recommend reels over 3 minutes. */
  platforms?: readonly ("tiktok" | "instagram")[];
  /** false: no outro card, the video ends on the last reveal and loops (CTA lives in the caption and mid-video) */
  outro?: boolean;
  /** pick-the-sign: "Which sign means X?" with three sign pictures as the answers (drivercheck24 format) */
  pickSign?: boolean;
  label: string;
  imageFirst?: boolean;
  imageOnly?: boolean;
  categories?: string[];
  withState?: boolean;
  /** category buckets filled in order, remainder random (mirror of createSets in the app) */
  buckets?: { cats: string[]; n: number }[];
};

const SIGNS = ["Signs, Signals & Markings"];
const ROW = ["Road Rules & Right-of-Way", "Right-of-Way Rules"];
/** Classic 30 buckets from src/lib/creatorSets.ts in the app */
export const CLASSIC_BUCKETS = [
  { cats: SIGNS, n: 10 },
  { cats: ROW, n: 7 },
  { cats: ["Safe Driving & Defensive Driving", "Driving Conditions & Hazards"], n: 5 },
  { cats: ["Sharing the Road"], n: 4 },
  { cats: ["Passing Rules", "Turning & Lane Changes", "Lane Usage & Highway Driving", "Parking Rules", "Emergencies & Breakdowns", "Vehicle Equipment & Safety", "Vehicle Control & Maneuvers"], n: 4 },
];

export const FORMATS: Record<string, FormatDef> = {
  // short (decision 2026-11-18: 30 to 90 s wins, 90 s to 5 min loses; aim for <= 75 s, so the countdown is capped)
  pass5: { size: 5, think: 5, maxCountdown: 8, label: "Can you pass? (5)", imageFirst: true },
  signs7: { size: 7, think: 4, maxCountdown: 5, label: "Road signs rapid fire (7)", imageOnly: true },
  row5: { size: 5, think: 5, maxCountdown: 8, label: "Who goes first? (5)", categories: ROW },
  tricky5: { size: 5, think: 5, maxCountdown: 8, label: "Most missed (5)", categories: [...ROW, "Passing Rules", "Driving Conditions & Hazards"] },
  single: { size: 1, think: 5, label: "One question", imageFirst: true },
  // long (the viral shape: many questions, the viewer keeps score)
  pass10: { size: 10, think: 5, label: "Can you pass? (10)", imageFirst: true },
  pass15: { size: 15, think: 5, label: "Can you pass? (15)", imageFirst: true },
  signs15: { size: 15, think: 4, label: "Road signs test (15)", imageOnly: true },
  classic30: { size: 30, think: 5, label: "Classic 30", imageFirst: true, buckets: CLASSIC_BUCKETS, platforms: ["tiktok"] },
  // tests (decision 2026-11-18, docs/TESTS.md): question-first twins of the controls, a 3-question short and a one-question debate
  pass5q: { size: 5, think: 5, maxCountdown: 8, label: "Can you pass? (5)", imageFirst: true, opening: "question" },
  signs7q: { size: 7, think: 4, maxCountdown: 5, label: "Road signs rapid fire (7)", imageOnly: true, opening: "question" },
  pick6: { size: 6, think: 5, maxCountdown: 5, label: "Pick the sign (6)", imageOnly: true, opening: "question", outro: false, pickSign: true,
    categories: SIGNS },
  quick3: { size: 3, think: 4, maxCountdown: 6, label: "Hardest questions (3)", imageFirst: true, opening: "question", outro: false,
    categories: [...ROW, "Passing Rules", "Driving Conditions & Hazards", "Sharing the Road", "Signs, Signals & Markings"] },
  debate1: { size: 1, think: 6, label: "Who goes first? (1)", imageOnly: true, opening: "question",
    categories: [...ROW, "Sharing the Road", "Lane Usage & Highway Driving"] },
  full: { size: "state", think: 5, label: "Full practice test", withState: true },
};

export const EXCLUDED_CATEGORIES = ["Alcohol & Drugs", "Speed Limits & Laws", "Licensing & Registration"];

/** Bank questions never used in videos: add an id prefix here when a broken question is found, fix it in the bank,
 *  then remove it. Empty since 2026-11-21: c4669e7e (two correct answers), e727ce0d (four-second rule, now "at least
 *  three seconds"), f7cdc8c1 (letter answers, now "Sign A".."Sign D") and two typos were fixed in the bank. */
/** One-off extra renders for a given nightly run (ET date of the run, YYYY-MM-DD), on top of the weekday rotation. Use it to
 *  replace a retired buffer video; old entries do nothing. 2026-11-21: pass5q_en_1795058829391 retired (voiced before the
 *  spoken-question guard, card 2 timing from before the uniform countdown). */
export const EXTRA_RENDERS: { on: string; format: string }[] = [{ on: "2026-11-21", format: "pass5q" }];

export const EXCLUDED_QUESTIONS: string[] = [];
/** Topics excluded by keyword as well as by category: an alcohol question sat in "Safe Driving" (659b6650). */
export const EXCLUDED_TOPIC_WORDS = /\b(alcohol|drunk|drinking|drugs?|intoxicat|dui|dwi|blood alcohol|bac)\b/i;

export const OPENAI = { model: "gpt-4o-mini", temperatureHooks: 0.9, temperatureSpeakable: 0.2 };

export const ELEVENLABS = {
  modelEn: "eleven_turbo_v2_5",
  modelEs: "eleven_multilingual_v2",
  voiceEn: "TX3LPaxmHKxFdv7VOQHJ", // Liam (chosen 2026-11-09). Backup: Laura FGY2WhTYpPnrIDTdsKH5
  voiceEs: "",
  speed: 1.12,
  stability: 0.35,
  similarityBoost: 0.8,
  style: 0.6,
  outputFormat: "mp3_44100_128",
  /** voices rendered by `npm run audition` (ids from `npm run voices`) */
  auditionVoices: [
    "TX3LPaxmHKxFdv7VOQHJ", // Liam, energetic social media creator
    "FGY2WhTYpPnrIDTdsKH5", // Laura, enthusiast
    "nPczCjzI2devNBz1zQrb", // Brian, deep resonant
    "pNInz6obpgDQGcFmaJgB", // Adam, dominant firm
    "cgSgspJ2msm6clMCkdW9", // Jessica, playful bright
    "IKne3meq5aSn9XLyUdCD", // Charlie, deep confident energetic
    "bIHbv24MWmeRgasZH58o", // Will, relaxed optimist
    "EXAVITQu4vr4xnSDxMaL", // Sarah, confident
  ],
};

export const SFX = { tickGain: 0.6, dingGain: 0.5, whooshGain: 0.35, musicPath: "", musicGain: 0.12 };

/** Reading rule (decision 2026-11-09): the viewer must be able to read the question and all four answers.
 *  countdown = clamp(ceil(words / wordsPerSecond + thinkSeconds + imageSeconds), min, max), and never less
 *  than the format's think or the voice end + margin. Mirrors the app's creatorTiming.ts, tuned for video. */
export const READING = { wordsPerSecond: 3.5, thinkSeconds: 1.5, imageSeconds: 1.0, minSeconds: 5, maxSeconds: 14 };

/** Posting schedule (decision 2026-11-09): one post per day per account at a fixed local time, never bursts.
 *  After 14 days, move the hours to what TikTok Analytics shows for the account. */
export const POSTING = {
  timezone: "America/New_York",
  // decision 2026-11-18: three posts a day (more test samples per week; every view so far comes from For You)
  weekdayHours: [11, 15, 19],   // Mon to Fri: 11 am, 3 pm, 7 pm
  weekendHours: [11, 14, 17],   // Sat and Sun: 11 am, 2 pm, 5 pm
  perDay: 3,
  // decision 2026-11-12: from 2026-11-13 the nightly run approves videos itself, but only those that pass the QA gate (src/qa.ts)
  autoApprove: true,
  /** questions may be reused in a new set after this many days */
  reuseAfterDays: 45,
  minLeadMinutes: 90,  // never schedule closer than this to now
  horizonDays: 30,
  /** channels that receive every approved video (Postiz identifiers matched by prefix) */
  platforms: ["tiktok", "instagram"] as const,
  /** Instagram: a single video with post_type "post" publishes as a Reel */
  instagram: { post_type: "post", is_trial_reel: false, collaborators: [] as { label: string }[] },
  /** TikTok settings sent with every post */
  tiktok: {
    privacy_level: "PUBLIC_TO_EVERYONE", duet: true, stitch: true, comment: true, autoAddMusic: "no",
    brand_content_toggle: false, brand_organic_toggle: true, video_made_with_ai: true,
    /** DIRECT_POST publishes at the slot. UPLOAD sends a draft to the TikTok app inbox for native finishing
     *  (own text, sound, cover) and the owner posts by hand: the hybrid TikTok's policies favour. */
    content_posting_method: "DIRECT_POST",
  },
};
