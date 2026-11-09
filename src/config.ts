/** Pure config: no Node imports, so the Remotion bundle can import it too. */
export const BRAND = { name: "THE DRIVING SCHOOL", year: 2027, cta: "LINK IN BIO" };

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
};

export const FORMATS: Record<string, FormatDef> = {
  pass5: { size: 5, think: 5, label: "Can you pass?", imageFirst: true },
  signs7: { size: 7, think: 4, label: "Road signs rapid fire", imageOnly: true },
  row5: { size: 5, think: 5, label: "Who goes first?", categories: ["Right-of-Way Rules", "Road Rules & Right-of-Way"] },
  tricky5: {
    size: 5, think: 5, label: "Most missed",
    categories: ["Right-of-Way Rules", "Road Rules & Right-of-Way", "Passing Rules", "Driving Conditions & Hazards"],
  },
  single: { size: 1, think: 5, label: "One question", imageFirst: true },
  full: { size: "state", think: 4, label: "Full practice test", withState: true },
};

export const EXCLUDED_CATEGORIES = ["Alcohol & Drugs", "Speed Limits & Laws", "Licensing & Registration"];

export const OPENAI = { model: "gpt-4o-mini", temperatureHooks: 0.9, temperatureSpeakable: 0.2 };

export const ELEVENLABS = {
  modelEn: "eleven_turbo_v2_5",
  modelEs: "eleven_multilingual_v2",
  voiceEn: "",           // set after the audition
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
