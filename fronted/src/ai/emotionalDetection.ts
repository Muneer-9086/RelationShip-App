import { pipeline } from '@xenova/transformers';

/* ---------------- GLOBAL MODELS ---------------- */

let sentimentModel: any;
let toxicModel: any;
let embedder: any;

async function getSentimentModel() {
  if (!sentimentModel) {
    sentimentModel = await pipeline(
      'text-classification',
      'Xenova/twitter-roberta-base-sentiment-latest'
    );
  }
  return sentimentModel;
}

async function getToxicModel() {
  if (!toxicModel) {
    toxicModel = await pipeline(
      'text-classification',
      'Xenova/toxic-bert'
    );
  }
  return toxicModel;
}

async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    );
  }
  return embedder;
}

/* ---------------- IMPLICIT HARASSMENT DETECTOR ---------------- */

const HARASSMENT_PATTERNS = [
  "insulting someone",
  "mocking a person",
  "sexual provocation",
  "sarcastic insult",
  "personal attack",
  "condescending remark",
  "humiliating statement",
  "friend wife",
  "uncle son"
];

function cosine(a: any[], b: any[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function detectImplicitOffense(text: string) {
  const model = await getEmbedder();

  const textVec: any = await model(text, { pooling: "mean", normalize: true });
  const textEmb = Array.from(textVec.data);

  let max = 0;

  for (const pattern of HARASSMENT_PATTERNS) {
    const pVec: any = await model(pattern, { pooling: "mean", normalize: true });
    const sim = cosine(textEmb, Array.from(pVec.data));
    max = Math.max(max, sim);
  }

  return max > 0.55; // tuned threshold
}

/* ---------------- TOXICITY DETECTOR ---------------- */

async function detectToxicity(text: string) {
  const model = await getToxicModel();
  const res: any = await model(text);

  const label = res[0].label.toLowerCase();
  const score = res[0].score;

  if (label.includes("toxic") && score > 0.6) {
    return score > 0.9 ? "threatening" : "aggressive";
  }

  return null;
}

/* ---------------- EMOTION MAPPER ---------------- */

function sentimentToEmotion(label: string, score: number): string {
  label = label.toLowerCase();

  if (label === "positive") {
    if (score >= 0.95) return "excited";
    if (score >= 0.85) return "happy";
    if (score >= 0.65) return "pleased";
    return "calm";
  }

  if (label === "negative") {
    if (score >= 0.95) return "angry";
    if (score >= 0.85) return "frustrated";
    if (score >= 0.65) return "concerned";
    return "unhappy";
  }

  return "neutral";
}

/* ---------------- BOOST WORDS ---------------- */

const boosters = [
  "very", "really", "extremely", "totally", "absolutely",
  "hate", "love", "amazing", "terrible", "worst", "awesome"
];

function boostScore(text: string, score: number) {
  const lower = text.toLowerCase();

  for (const word of boosters) {
    if (lower.includes(word)) score += 0.05;
  }

  return Math.min(score, 1);
}

/* ---------------- WORD HIGHLIGHTER ---------------- */

async function highlightWords(classifier: any, text: string) {
  const base = await classifier(text);
  const baseScore = base[0].score;
  const baseLabel = base[0].label.toLowerCase();

  const words = text.split(" ");
  const results: any[] = [];

  for (let i = 0; i < words.length; i++) {
    const modified = words.filter((_, idx) => idx !== i).join(" ");
    const res = await classifier(modified);

    const diff = baseScore - res[0].score;

    let sentiment = "neutral";
    if (Math.abs(diff) > 0.08) {
      sentiment = baseLabel === "positive" ? "positive" : "negative";
    }

    results.push({
      word: words[i],
      sentiment,
      impact: Number(diff.toFixed(3))
    });
  }

  return results;
}

/* ---------------- FINAL ANALYZER ---------------- */

async function emotionalAnalyze(text: string)
{
    
    console.log("TEXT");
    console.log(text);

  const classifier = await getSentimentModel();

  // 1️⃣ implicit harassment (NEW)
  const implicit = await detectImplicitOffense(text);
  if (implicit) {
    return {
      text,
      emotion: "provocative",
      words: [],
      reason: "implicit harassment detected"
    };
  }

  // 2️⃣ explicit toxicity
  const toxic = await detectToxicity(text);

  // 3️⃣ sentiment
  const result: any = await classifier(text);

  let score = result[0].score;
  const label = result[0].label;

  score = boostScore(text, score);

  let emotion = sentimentToEmotion(label, score);

  if (toxic) emotion = toxic;

  // 4️⃣ word highlight
  const words = await highlightWords(classifier, text);

  if (toxic) {
    for (const w of words) {
      if (["ass", "kill", "idiot", "stupid", "hate"].includes(w.word.toLowerCase())) {
        w.sentiment = "negative";
        w.toxic = true;
      }
    }
  }

  return { text, emotion, words };
}


export
{
    emotionalAnalyze
}