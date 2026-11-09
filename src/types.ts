export type Lang = "en" | "es";

export type Question = {
  id: string;
  question_text: string;
  answers: Record<string, string>;
  correct_answer: string;
  explanation: string | null;
  category: string;
  state: string | null;
  image_url: string | null;
  question_text_es?: string | null;
  answers_es?: Record<string, string> | null;
  explanation_es?: string | null;
};

export type Word = { text: string; start: number; end: number };

/** One voice line. src is relative to public/ (null in dry mode = silent). Times in seconds. */
export type Clip = {
  src: string | null;
  text: string;
  duration: number;
  speechStart: number;
  speechEnd: number;
  words: Word[];
};

export type Speak = { question_vo: string; reveal_vo: string; answers_display: Record<string, string> };

export type Hook = {
  card1: string;
  card2: string;
  vo_line: string;
  outro_vo: string;
  caption: string;
  hashtags: string[];
};

export type DisplayQuestion = {
  id: string;
  question_text: string;
  answers: Record<string, string>;
  correct_answer: string;
  explanation: string;
  /** relative to public/ or absolute URL; null = no image */
  image: string | null;
};

export type QuestionSegment = {
  idx: number;
  n: number;
  q: DisplayQuestion;
  countdownSeconds: number;
  questionAt: number;
  questionFrames: number;
  dimAt: number;
  dimFrames: number;
  revealAt: number;
  revealFrames: number;
  vo: Clip;
  revealVo: Clip;
};

export type Cue = { kind: "tick" | "ding" | "whoosh"; at: number };

export type Plan = {
  id: string;
  format: string;
  lang: Lang;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  brand: { name: string; year: number; cta: string };
  hook: { card1: string; card2: string; sub: string; pill: string; hook1Frames: number; hook2Frames: number; vo: Clip };
  questions: QuestionSegment[];
  outro: { at: number; frames: number; vo: Clip };
  cues: Cue[];
  music: { src: string | null; gain: number };
  meta: { caption: string; hashtags: string[]; questionIds: string[]; totalSeconds: number };
};
