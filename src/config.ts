/** Pure config: no Node imports, so the Remotion bundle can import it too. */
export const BRAND = {
  name: "THE DRIVING SCHOOL", year: 2027,
  cta: "PRACTICE MORE: LINK IN BIO", ctaEs: "PRACTICA MAS: LINK EN LA BIO",
  /** logo files relative to public/ (white on dark cards). Falls back to the name in text when missing. */
  logoWhite: "brand/logo-white.png", logoDark: "brand/logo-dark.png",
};

/** Hook angles. One is chosen per video (weighted by past views once metrics exist, with exploration) and stored
 *  in the ledger as hook.style so the weekly report can rank them and cut the losers. Add freely, never invent stats. */
export const HOOK_ANGLES: { id: string; brief: string }[] = [
  { id: "fail", brief: "fear of failing: most people get this driving test question wrong" },
  { id: "challenge", brief: "a direct dare: can YOU pass the driving test" },
  { id: "sign", brief: "curiosity about the first road sign shown: do you know what it means" },
  { id: "count", brief: "the size of the test as the hook, using timing.count" },
  { id: "score", brief: "a pass mark to beat, using pass_mark out of timing.count" },
  { id: "newdriver", brief: "identity: for new drivers and permit test takers this week" },
  { id: "retake", brief: "relatable: people who failed the driving test once and are retaking it" },
  { id: "parent", brief: "parents or experienced drivers: would you still pass the written driving test today" },
  { id: "trick", brief: "the trick question: the one driving test question that looks easy and is not" },
  { id: "timer", brief: "pressure: answer before the timer runs out, using timing.seconds_per_question" },
  { id: "rightofway", brief: "who goes first: right-of-way situations that confuse most drivers (only if the set has right-of-way questions)" },
  { id: "silent", brief: "a quiet, confident statement: this is the real driving test. No hype words." },
  { id: "bet", brief: "a bet or wager with the viewer: get them all right and comment, miss one and share" },
  { id: "duo", brief: "play it with someone: take the driving test with a friend, partner or parent and compare scores" },
  { id: "year", brief: "the updated test: the 2027 driving test questions people are not ready for (no invented changes)" },
  { id: "honest", brief: "honest framing: no tricks, real written driving test questions, keep score" },
];
export type HookStyle = string;

/** Visual themes, rotated per video so consecutive posts do not share one fixed look (TikTok treats templated
 *  sameness as repetitive content, see docs/GROWTH.md). Tokens: light = the app's light theme, dark = the app's
 *  .dark theme, ink = brand navy with the highlight yellow. Stored in the ledger as metrics.theme. */
export const THEMES = ["light", "dark", "ink"] as const;
export type Theme = (typeof THEMES)[number];

/** Nightly rotation: two formats per weekday (decision 2026-11-10: two posts a day). */
export const NIGHTLY_ROTATION: Record<string, string[]> = {
  Mon: ["pass5", "signs7"], Tue: ["row5", "pass10"], Wed: ["tricky5", "signs15"], Thu: ["pass5", "classic30"],
  Fri: ["signs7", "pass15"], Sat: ["classic30", "pass5"], Sun: ["row5", "signs7"],
};

/** Cost assumptions for the report (USD). ElevenLabs Turbo pay-as-you-go per 1k characters; OpenAI gpt-4o-mini
 *  per video is a rough all-in average; Postiz Standard monthly. Reconcile with the platform invoices monthly. */
export const COSTS = { elevenlabsPer1kChars: 0.04, openaiPerVideo: 0.004, postizPerMonth: 29, remotionPerMonth: 0 };

export const VIDEO = {
  width: 1080,
  height: 1920,
  fps: 30,
  hook1Seconds: 1.5,
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
  // short
  pass5: { size: 5, think: 5, label: "Can you pass? (5)", imageFirst: true },
  signs7: { size: 7, think: 4, label: "Road signs rapid fire (7)", imageOnly: true },
  row5: { size: 5, think: 5, label: "Who goes first? (5)", categories: ROW },
  tricky5: { size: 5, think: 5, label: "Most missed (5)", categories: [...ROW, "Passing Rules", "Driving Conditions & Hazards"] },
  single: { size: 1, think: 5, label: "One question", imageFirst: true },
  // long (the viral shape: many questions, the viewer keeps score)
  pass10: { size: 10, think: 5, label: "Can you pass? (10)", imageFirst: true },
  pass15: { size: 15, think: 5, label: "Can you pass? (15)", imageFirst: true },
  signs15: { size: 15, think: 4, label: "Road signs test (15)", imageOnly: true },
  classic30: { size: 30, think: 5, label: "Classic 30", imageFirst: true, buckets: CLASSIC_BUCKETS },
  full: { size: "state", think: 5, label: "Full practice test", withState: true },
};

export const EXCLUDED_CATEGORIES = ["Alcohol & Drugs", "Speed Limits & Laws", "Licensing & Registration"];

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
  weekdayHours: [11, 19],   // Mon to Fri: 11 am and 7 pm
  weekendHours: [11, 17],   // Sat and Sun: 11 am and 5 pm
  perDay: 2,
  /** questions may be reused in a new set after this many days */
  reuseAfterDays: 60,
  minLeadMinutes: 90,  // never schedule closer than this to now
  horizonDays: 30,
  /** TikTok settings sent with every post */
  tiktok: {
    privacy_level: "PUBLIC_TO_EVERYONE", duet: true, stitch: true, comment: true, autoAddMusic: "no",
    brand_content_toggle: false, brand_organic_toggle: true, video_made_with_ai: true,
    /** DIRECT_POST publishes at the slot. UPLOAD sends a draft to the TikTok app inbox for native finishing
     *  (own text, sound, cover) and the owner posts by hand: the hybrid TikTok's policies favour. */
    content_posting_method: "DIRECT_POST",
  },
};
