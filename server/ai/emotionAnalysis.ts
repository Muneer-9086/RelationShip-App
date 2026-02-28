import { pipeline } from '@xenova/transformers';

/* ─────────────────────────────────────────────────────────────────────────────
   MODEL SINGLETONS
───────────────────────────────────────────────────────────────────────────── */

let sentimentModel: any;
let toxicModel: any;
let embedder: any;

async function getSentimentModel() {
    if (!sentimentModel)
        sentimentModel = await pipeline('text-classification', 'Xenova/twitter-roberta-base-sentiment-latest');
    return sentimentModel;
}

async function getToxicModel() {
    if (!toxicModel)
        toxicModel = await pipeline('text-classification', 'Xenova/toxic-bert');
    return toxicModel;
}

async function getEmbedder() {
    if (!embedder)
        embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    return embedder;
}

/* ─────────────────────────────────────────────────────────────────────────────
   ANALYZE RESULT CACHE
   Avoid re-running expensive model inference on identical text.
───────────────────────────────────────────────────────────────────────────── */

const resultCache = new Map<string, AnalysisResult>();
const CACHE_MAX = 200;

function getCached(text: string): AnalysisResult | null {
    return resultCache.get(text) ?? null;
}

function setCache(text: string, result: AnalysisResult): void {
    if (resultCache.size >= CACHE_MAX) {
        const firstKey = resultCache.keys().next().value;
        if (firstKey !== undefined) resultCache.delete(firstKey);
    }
    resultCache.set(text, result);
}

/* ─────────────────────────────────────────────────────────────────────────────
   FORMATTING SIGNALS
   Things transformer models are blind to — surface-level text features
   that are strong indicators of emotional state.
───────────────────────────────────────────────────────────────────────────── */

interface FormattingSignals {
    hasAllCaps: boolean;
    capsRatio: number;
    excessiveExclamation: boolean;
    excessiveQuestion: boolean;
    repeatedChars: boolean;
    ellipsisCount: number;
    scoreMod: number;
    labelForce: string | null;
}

function detectFormattingSignals(text: string): FormattingSignals {
    const letters = text.replace(/[^a-zA-Z]/g, '');
    const upper = letters.replace(/[^A-Z]/g, '');
    const capsRatio = letters.length > 0 ? upper.length / letters.length : 0;
    const hasAllCaps = capsRatio > 0.75 && letters.length > 4;

    const excessiveExclamation = (text.match(/!/g) ?? []).length >= 3;
    const excessiveQuestion = (text.match(/\?/g) ?? []).length >= 3;
    const repeatedChars = /(.)\1{3,}/.test(text);
    const ellipsisCount = (text.match(/\.{2,}/g) ?? []).length;

    let scoreMod = 0;
    let labelForce: string | null = null;

    if (hasAllCaps) {
        scoreMod += 0.12;
        if (capsRatio > 0.9) labelForce = 'negative';
    }
    if (excessiveExclamation) scoreMod += 0.07;
    if (excessiveQuestion) scoreMod += 0.05;
    if (repeatedChars) scoreMod += 0.04;
    if (ellipsisCount >= 2) scoreMod += 0.03;

    return {
        hasAllCaps, capsRatio,
        excessiveExclamation, excessiveQuestion, repeatedChars,
        ellipsisCount,
        scoreMod: Math.min(scoreMod, 0.25),
        labelForce,
    };
}

/* ─────────────────────────────────────────────────────────────────────────────
   EMOJI SENTIMENT
   Transformers strip or mishandle emojis — we handle them explicitly.
───────────────────────────────────────────────────────────────────────────── */

const EMOJI_NEGATIVE: Record<string, number> = {
    '😡': 0.9, '🤬': 1.0, '😠': 0.8, '💢': 0.85, '🖕': 1.0,
    '😤': 0.7, '😒': 0.6, '🙄': 0.55, '😑': 0.5, '😖': 0.65,
    '😩': 0.6, '😫': 0.65, '😢': 0.5, '😭': 0.7, '💔': 0.65,
    '👎': 0.75, '🤮': 0.85, '🤡': 0.7, '💀': 0.8, '☠️': 0.85,
};

const EMOJI_POSITIVE: Record<string, number> = {
    '😊': 0.8, '😀': 0.85, '😁': 0.9, '❤️': 0.9, '🥰': 0.95,
    '😍': 0.9, '🙏': 0.75, '✨': 0.7, '🎉': 0.9, '💯': 0.85,
    '👍': 0.8, '😂': 0.7, '🤣': 0.75, '😄': 0.85, '💪': 0.8,
    '🫂': 0.85, '😌': 0.65, '🥹': 0.7,
};

// Positive-looking emojis commonly used sarcastically
const SARCASM_EMOJIS = new Set(['👏', '🙃', '😏', '😈', '🤭', '😬', '🫠']);

interface EmojiSignal {
    negativeScore: number;
    positiveScore: number;
    hasSarcasmEmoji: boolean;
    scoreMod: number;
    labelForce: string | null;
}

function detectEmojiSignals(text: string): EmojiSignal {
    let negativeScore = 0;
    let positiveScore = 0;
    let hasSarcasmEmoji = false;

    const emojiRegex = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu;
    const found = text.match(emojiRegex) ?? [];

    for (const e of found) {
        if (EMOJI_NEGATIVE[e]) negativeScore = Math.max(negativeScore, EMOJI_NEGATIVE[e]);
        if (EMOJI_POSITIVE[e]) positiveScore = Math.max(positiveScore, EMOJI_POSITIVE[e]);
        if (SARCASM_EMOJIS.has(e)) hasSarcasmEmoji = true;
    }

    let scoreMod = 0;
    let labelForce: string | null = null;

    if (negativeScore > 0.85) { labelForce = 'negative'; scoreMod = negativeScore * 0.15; }
    else if (negativeScore > 0.5) { scoreMod = negativeScore * 0.1; }
    if (positiveScore > negativeScore) scoreMod = -positiveScore * 0.05;

    return { negativeScore, positiveScore, hasSarcasmEmoji, scoreMod, labelForce };
}

/* ─────────────────────────────────────────────────────────────────────────────
   SARCASM DETECTOR
   Surface patterns + sentiment inversion + sarcasm emoji signals.
───────────────────────────────────────────────────────────────────────────── */

const SARCASM_SURFACE_PATTERNS = [
    /oh\s+(wow|great|sure|yeah|right|brilliant|fantastic|perfect|wonderful)/i,
    /\bsure[,.\s]+totally\b/i,
    /\bwow[,.\s]+thanks\b/i,
    /\bthanks\s+(a\s+lot|so\s+much)[.!]*\s*[👏🙃😏]/u,
    /\bso\s+(helpful|useful|smart|clever)\b.*[👏🙃😏]/ui,
    /yeah[,.\s]+right\b/i,
    /\boh\s+really[?!]+/i,
    /\bsuch\s+a\s+(great|good|nice|brilliant)\b.*(not)?/i,
];

interface SarcasmResult {
    detected: boolean;
    confidence: number;
}

function detectSarcasm(
    text: string,
    sentimentLabel: string,
    formatting: FormattingSignals,
    emoji: EmojiSignal,
): SarcasmResult {
    let confidence = 0;

    for (const pattern of SARCASM_SURFACE_PATTERNS) {
        if (pattern.test(text)) { confidence += 0.35; break; }
    }

    if (emoji.hasSarcasmEmoji) confidence += 0.3;
    if (sentimentLabel === 'positive' && emoji.negativeScore > 0.5) confidence += 0.25;
    if (sentimentLabel === 'positive' && formatting.hasAllCaps) confidence += 0.2;
    if (sentimentLabel === 'positive' && formatting.excessiveExclamation && emoji.negativeScore > 0) confidence += 0.15;

    return {
        detected: confidence >= 0.35,
        confidence: Math.min(Number(confidence.toFixed(3)), 1),
    };
}

/* ─────────────────────────────────────────────────────────────────────────────
   PATTERN EMBEDDING CACHE
───────────────────────────────────────────────────────────────────────────── */

const HARASSMENT_PATTERNS = [
    "insulting someone",
    "mocking a person",
    "sexual provocation",
    "sarcastic insult",
    "personal attack",
    "condescending remark",
    "humiliating statement",
    "dismissing someone's feelings",
    "passive aggressive comment",
    "belittling remark",
    "threatening someone",
    "making someone feel worthless",
];

let cachedPatternEmbeddings: number[][] | null = null;

async function getPatternEmbeddings(): Promise<number[][]> {
    if (cachedPatternEmbeddings) return cachedPatternEmbeddings;
    const model = await getEmbedder();
    cachedPatternEmbeddings = await Promise.all(
        HARASSMENT_PATTERNS.map(async (p) => {
            const vec: any = await model(p, { pooling: 'mean', normalize: true });
            return Array.from(vec.data) as number[];
        })
    );
    return cachedPatternEmbeddings;
}

/* ─────────────────────────────────────────────────────────────────────────────
   UTILITIES
───────────────────────────────────────────────────────────────────────────── */

function cosine(a: any[], b: any[]): number {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const NEGATORS = new Set([
    "not", "never", "don't", "dont", "didn't", "didnt",
    "no", "neither", "nor", "hardly", "barely", "n't",
]);

function applyNegation(tokens: string[], score: number, label: string): { score: number; label: string } {
    const lower:any = tokens.map(w => w.toLowerCase());
    for (let i = 1; i < lower.length; i++) {
        if (NEGATORS.has(lower[i - 1])) {
            const flipped = label === 'positive' ? 'negative' : label === 'negative' ? 'positive' : label;
            return { score: score * 0.75, label: flipped };
        }
    }
    return { score, label };
}

const AMPLIFIERS = [
    "very", "really", "extremely", "totally", "absolutely",
    "so", "insanely", "incredibly", "deeply", "utterly", "completely",
];
const STRONG_NEGATIVE = [
    "hate", "terrible", "worst", "disgusting", "awful", "pathetic",
    "useless", "despise", "loathe", "furious", "enraged",
];
const STRONG_POSITIVE = [
    "love", "amazing", "awesome", "wonderful", "fantastic",
    "brilliant", "incredible", "outstanding",
];

function boostScore(text: string, score: number, label: string): number {
    const lower = text.toLowerCase();
    let boost = 0;
    for (const w of AMPLIFIERS) if (lower.includes(w)) boost += 0.04;
    const strongList = label === 'positive' ? STRONG_POSITIVE : STRONG_NEGATIVE;
    for (const w of strongList) if (lower.includes(w)) boost += 0.06;
    return Math.min(score + boost, 1);
}

/* ─────────────────────────────────────────────────────────────────────────────
   IMPLICIT HARASSMENT DETECTOR
───────────────────────────────────────────────────────────────────────────── */

interface ImplicitResult {
    detected: boolean;
    confidence: number;
    matchedPattern: string | null;
}

async function detectImplicitOffense(text: string): Promise<ImplicitResult> {
    const model = await getEmbedder();
    const textVec: any = await model(text, { pooling: 'mean', normalize: true });
    const textEmb = Array.from(textVec.data) as number[];
    const patternEmbs:any = await getPatternEmbeddings();

    let max = 0;
    let matchedPattern:any = null;

    for (let i = 0; i < patternEmbs.length; i++) {
        const sim = cosine(textEmb, patternEmbs[i]);
        if (sim > max) { max = sim; matchedPattern = HARASSMENT_PATTERNS[i]; }
    }

    return {
        detected: max > 0.52,
        confidence: Number(max.toFixed(3)),
        matchedPattern: max > 0.52 ? matchedPattern : null,
    };
}

/* ─────────────────────────────────────────────────────────────────────────────
   TOXICITY DETECTOR (all labels)
───────────────────────────────────────────────────────────────────────────── */

type ToxicLabel = 'threatening' | 'severely_toxic' | 'obscene' | 'identity_attack' | 'insult' | 'toxic' | null;

interface ToxicResult {
    label: ToxicLabel;
    score: number;
    flags: string[];
}

const TOXIC_PRIORITY = ['threatening', 'severely_toxic', 'identity_attack', 'obscene', 'insult', 'toxic'];

async function detectToxicity(text: string): Promise<ToxicResult> {
    const model = await getToxicModel();
    const res: any = await model(text, { topk: 6 });
    const labels: { label: string; score: number }[] = Array.isArray(res[0]) ? res[0] : res;

    const flags: string[] = [];
    let primaryLabel: ToxicLabel = null;
    let primaryScore = 0;

    for (const candidate of TOXIC_PRIORITY) {
        const match = labels.find(l => l.label.toLowerCase().includes(candidate));
        if (match && match.score > 0.5) {
            flags.push(candidate);
            if (!primaryLabel) { primaryLabel = candidate as ToxicLabel; primaryScore = match.score; }
        }
    }

    return { label: primaryLabel, score: primaryScore, flags };
}

/* ─────────────────────────────────────────────────────────────────────────────
   CONVERSATION CONTEXT TRACKER
   Tracks recent messages per conversation to detect escalation.
   Call contextTracker.push(conversationId, entry) in wsHandler after analyze().
───────────────────────────────────────────────────────────────────────────── */

export interface ContextEntry {
    text: string;
    emotion: string;
    severity: number;
    timestamp: number;
}

class ConversationContextTracker {
    private history = new Map<string, ContextEntry[]>();
    private readonly MAX_ENTRIES = 10;
    private readonly WINDOW_MS = 5 * 60 * 1000; // 5-minute rolling window

    push(conversationId: string, entry: ContextEntry): void {
        let entries = this.history.get(conversationId) ?? [];
        const now = Date.now();
        entries = entries.filter(e => now - e.timestamp < this.WINDOW_MS);
        entries.push(entry);
        if (entries.length > this.MAX_ENTRIES) entries.shift();
        this.history.set(conversationId, entries);
    }

    getEscalationSignal(conversationId: string): { escalating: boolean; trend: number } {
        const entries = this.history.get(conversationId) ?? [];
        if (entries.length < 3) return { escalating: false, trend: 0 };

        const recent = entries.slice(-2).map(e => e.severity);
        const earlier = entries.slice(0, -2).map(e => e.severity);
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
        const trend = Number((recentAvg - earlierAvg).toFixed(3));

        return { escalating: trend > 0.15, trend };
    }

    clear(conversationId: string): void {
        this.history.delete(conversationId);
    }
}

export const contextTracker = new ConversationContextTracker();

/* ─────────────────────────────────────────────────────────────────────────────
   EMOTION MAPPER (17 states)
───────────────────────────────────────────────────────────────────────────── */

export type Emotion =
    | 'ecstatic' | 'excited' | 'happy' | 'pleased' | 'calm'
    | 'curious' | 'neutral'
    | 'unhappy' | 'concerned' | 'frustrated' | 'angry' | 'furious'
    | 'threatening' | 'provocative' | 'dismissive' | 'passive_aggressive' | 'sarcastic';

function mapEmotion(
    label: string,
    score: number,
    toxic: ToxicResult,
    implicit: ImplicitResult,
    sarcasm: SarcasmResult,
    formatting: FormattingSignals,
    emoji: EmojiSignal,
): { emotion: Emotion; severity: number } {

    if (toxic.label === 'threatening') return { emotion: 'threatening', severity: 1.0 };
    if (toxic.label === 'severely_toxic') return { emotion: 'furious', severity: 0.95 };
    if (toxic.label === 'identity_attack') return { emotion: 'provocative', severity: 0.9 };
    if (toxic.label === 'insult') return { emotion: 'angry', severity: toxic.score };

    if (sarcasm.detected) return { emotion: 'sarcastic', severity: sarcasm.confidence * 0.8 };

    if (implicit.detected) {
        if (implicit.confidence > 0.70) return { emotion: 'provocative', severity: implicit.confidence };
        if (implicit.matchedPattern?.includes('passive')) return { emotion: 'passive_aggressive', severity: implicit.confidence };
        if (implicit.matchedPattern?.includes('dismissing')) return { emotion: 'dismissive', severity: implicit.confidence };
        return { emotion: 'dismissive', severity: implicit.confidence };
    }

    if (emoji.labelForce === 'negative' && score > 0.5)
        return { emotion: 'angry', severity: emoji.negativeScore };

    if (formatting.hasAllCaps && label !== 'positive') {
        const sev = Math.min(score + formatting.scoreMod, 1);
        return { emotion: sev > 0.85 ? 'furious' : 'angry', severity: sev };
    }

    const l = label.toLowerCase();

    if (l === 'positive') {
        if (score >= 0.97) return { emotion: 'ecstatic', severity: 0 };
        if (score >= 0.90) return { emotion: 'excited', severity: 0 };
        if (score >= 0.78) return { emotion: 'happy', severity: 0 };
        if (score >= 0.60) return { emotion: 'pleased', severity: 0 };
        return { emotion: 'calm', severity: 0 };
    }

    if (l === 'negative') {
        if (score >= 0.97) return { emotion: 'furious', severity: score };
        if (score >= 0.90) return { emotion: 'angry', severity: score };
        if (score >= 0.78) return { emotion: 'frustrated', severity: score };
        if (score >= 0.60) return { emotion: 'concerned', severity: score };
        return { emotion: 'unhappy', severity: score };
    }

    return { emotion: 'neutral', severity: 0 };
}

/* ─────────────────────────────────────────────────────────────────────────────
   CONFIDENCE SCORER
   Multiple signals agreeing = higher confidence.
───────────────────────────────────────────────────────────────────────────── */

function computeConfidence(
    sentimentScore: number,
    toxic: ToxicResult,
    implicit: ImplicitResult,
    sarcasm: SarcasmResult,
    formatting: FormattingSignals,
    emoji: EmojiSignal,
): number {
    let signals = 0;
    let total = 0;

    signals++; total += sentimentScore;
    if (toxic.label !== null) { signals++; total += toxic.score; }
    if (implicit.detected) { signals++; total += implicit.confidence; }
    if (sarcasm.detected) { signals++; total += sarcasm.confidence; }
    if (formatting.scoreMod > 0.05) { signals++; total += Math.min(formatting.scoreMod * 4, 1); }
    const emojiStr = Math.max(emoji.negativeScore, emoji.positiveScore);
    if (emojiStr > 0.5) { signals++; total += emojiStr; }

    const raw = signals > 1
        ? (total / signals) * (1 + 0.05 * (signals - 1))
        : total / signals;

    return Number(Math.min(raw, 1).toFixed(3));
}

/* ─────────────────────────────────────────────────────────────────────────────
   WORD HIGHLIGHTER
───────────────────────────────────────────────────────────────────────────── */

export interface WordResult {
    word: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    impact: number;
    toxic?: boolean;
}

export interface Span {
    words: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    start: number;
    end: number;
}

const KNOWN_TOXIC_WORDS = new Set([
    "kill", "hate", "idiot", "stupid", "ass", "dumb", "loser", "pathetic",
    "worthless", "useless", "disgusting", "moron", "freak", "ugly",
    "shut", "die", "trash", "scum", "pig", "creep", "jerk",
]);

async function highlightWords(
    classifier: any,
    text: string,
    baseScore: number,
    baseLabel: string,
): Promise<{ words: WordResult[]; spans: Span[] }> {
    const tokens = text.split(' ');
    if (tokens.length === 0) return { words: [], spans: [] };

    const variants = tokens.map((_, i) => tokens.filter((__, idx) => idx !== i).join(' '));
    const results: any[] = await Promise.all(variants.map(v => classifier(v)));

    const wordResults: any[] = tokens.map((word, i) => {
        const diff = baseScore - results[i][0].score;
        const lowerWord = word.toLowerCase().replace(/[^a-z]/g, '');
        const isToxic = KNOWN_TOXIC_WORDS.has(lowerWord);

        let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
        if (isToxic) {
            sentiment = 'negative';
        } else if (Math.abs(diff) > 0.06) {
            sentiment = baseLabel === 'positive' ? 'positive' : 'negative';
        }

        return { word, sentiment, impact: Number(diff.toFixed(3)), ...(isToxic && { toxic: true }) };
    });

    const spans: Span[] = [];
    let i = 0;
    while (i < wordResults.length) {
        const s = wordResults[i].sentiment;
        if (s === 'neutral') { i++; continue; }
        let j = i;
        while (j < wordResults.length && wordResults[j].sentiment === s) j++;
        spans.push({
            words: wordResults.slice(i, j).map(w => w.word).join(' '),
            sentiment: s,
            start: i,
            end: j - 1,
        });
        i = j;
    }

    return { words: wordResults, spans };
}

/* ─────────────────────────────────────────────────────────────────────────────
   WARNING BUILDER
   Tiered warnings: critical → warning → suggestion → null.
───────────────────────────────────────────────────────────────────────────── */

export type WarningSeverity = 'critical' | 'warning' | 'suggestion' | null;

export interface WarningResult {
    message: string | null;
    severity: WarningSeverity;
    shouldBlock: boolean;
}

function buildWarning(
    emotion: Emotion,
    toxic: ToxicResult,
    implicit: ImplicitResult,
    sarcasm: SarcasmResult,
    formatting: FormattingSignals,
    escalating: boolean,
): WarningResult {
    if (toxic.flags.includes('threatening') || toxic.flags.includes('severely_toxic')) {
        return {
            message: 'This message contains threatening or severely harmful language. Please reconsider before sending.',
            severity: 'critical',
            shouldBlock: true,
        };
    }
    if (toxic.flags.includes('identity_attack')) {
        return {
            message: "This message may be seen as an attack on someone's identity. Consider rephrasing.",
            severity: 'critical',
            shouldBlock: true,
        };
    }
    if (toxic.flags.includes('insult') || emotion === 'furious') {
        return {
            message: 'This message comes across as very aggressive. The other person may feel attacked.',
            severity: 'warning',
            shouldBlock: false,
        };
    }
    if (sarcasm.detected) {
        return {
            message: 'Your message may read as sarcastic. Make sure your tone matches your intent.',
            severity: 'warning',
            shouldBlock: false,
        };
    }
    if (implicit.detected && implicit.confidence > 0.65) {
        return {
            message: `This message may come across as ${implicit.matchedPattern ?? 'dismissive or hurtful'}.`,
            severity: 'warning',
            shouldBlock: false,
        };
    }
    if (escalating) {
        return {
            message: 'The conversation seems to be escalating. Take a breath before you send this.',
            severity: 'warning',
            shouldBlock: false,
        };
    }
    if (formatting.hasAllCaps) {
        return {
            message: 'Typing in ALL CAPS can feel like shouting. Consider turning off caps lock.',
            severity: 'suggestion',
            shouldBlock: false,
        };
    }
    if (emotion === 'angry' || emotion === 'frustrated') {
        return {
            message: `Your message reads as ${emotion}. Would you like help rephrasing it?`,
            severity: 'suggestion',
            shouldBlock: false,
        };
    }
    if (emotion === 'passive_aggressive') {
        return {
            message: 'Your message may come across as passive-aggressive. Try saying what you mean directly.',
            severity: 'suggestion',
            shouldBlock: false,
        };
    }

    return { message: null, severity: null, shouldBlock: false };
}

/* ─────────────────────────────────────────────────────────────────────────────
   ANALYSIS RESULT TYPE
───────────────────────────────────────────────────────────────────────────── */

export interface AnalysisResult {
    text: string;
    emotion: Emotion;
    severity: number;
    confidence: number;
    sentiment: { label: string; score: number };
    toxic: { detected: boolean; flags: string[] };
    implicit: { detected: boolean; confidence: number; matchedPattern: string | null };
    sarcasm: { detected: boolean; confidence: number };
    formatting: {
        hasAllCaps: boolean;
        excessiveExclamation: boolean;
        repeatedChars: boolean;
    };
    words: WordResult[];
    spans: Span[];
    warning: WarningResult;
    escalating: boolean;
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN ANALYZE FUNCTION
───────────────────────────────────────────────────────────────────────────── */

export async function analyze(
    text: string,
    conversationId?: string,
): Promise<AnalysisResult> {

    const trimmed = text?.trim() ?? '';

    if (!trimmed) {
        return {
            text,
            emotion: 'neutral',
            severity: 0,
            confidence: 0,
            sentiment: { label: 'neutral', score: 0 },
            toxic: { detected: false, flags: [] },
            implicit: { detected: false, confidence: 0, matchedPattern: null },
            sarcasm: { detected: false, confidence: 0 },
            formatting: { hasAllCaps: false, excessiveExclamation: false, repeatedChars: false },
            words: [],
            spans: [],
            warning: { message: null, severity: null, shouldBlock: false },
            escalating: false,
        };
    }

    const cached = getCached(trimmed);
    if (cached) return cached;

    const classifier = await getSentimentModel();
    const tokens = trimmed.split(' ');

    // ── Synchronous signals (no model cost) ───────────────────────────────
    const formatting = detectFormattingSignals(trimmed);
    const emoji = detectEmojiSignals(trimmed);

    // ── Parallel model inference ───────────────────────────────────────────
    const [rawSentiment, toxic, implicit] = await Promise.all([
        classifier(trimmed),
        detectToxicity(trimmed),
        detectImplicitOffense(trimmed),
    ]);

    // ── Post-process sentiment ─────────────────────────────────────────────
    let { score, label } = rawSentiment[0] as { score: number; label: string };

    ({ score, label } = applyNegation(tokens, score, label));

    score = Math.min(score + formatting.scoreMod + emoji.scoreMod, 1);
    if (formatting.labelForce) label = formatting.labelForce;
    if (emoji.labelForce) label = emoji.labelForce;

    score = boostScore(trimmed, score, label);

    // ── Sarcasm ───────────────────────────────────────────────────────────
    const sarcasm = detectSarcasm(trimmed, label, formatting, emoji);

    // ── Emotion ───────────────────────────────────────────────────────────
    const { emotion, severity } = mapEmotion(label, score, toxic, implicit, sarcasm, formatting, emoji);

    // ── Confidence ────────────────────────────────────────────────────────
    const confidence = computeConfidence(score, toxic, implicit, sarcasm, formatting, emoji);

    // ── Escalation ────────────────────────────────────────────────────────
    let escalating = false;
    if (conversationId) {
        ({ escalating } = contextTracker.getEscalationSignal(conversationId));
        contextTracker.push(conversationId, { text: trimmed, emotion, severity, timestamp: Date.now() });
    }

    // ── Warning ───────────────────────────────────────────────────────────
    const warning = buildWarning(emotion, toxic, implicit, sarcasm, formatting, escalating);

    // ── Word highlight ────────────────────────────────────────────────────
    const { words, spans } = await highlightWords(classifier, trimmed, score, label);

    const result: AnalysisResult = {
        text,
        emotion,
        severity: Number(severity.toFixed(3)),
        confidence,
        sentiment: { label, score: Number(score.toFixed(3)) },
        toxic: { detected: toxic.label !== null, flags: toxic.flags },
        implicit: { detected: implicit.detected, confidence: implicit.confidence, matchedPattern: implicit.matchedPattern },
        sarcasm: { detected: sarcasm.detected, confidence: sarcasm.confidence },
        formatting: {
            hasAllCaps: formatting.hasAllCaps,
            excessiveExclamation: formatting.excessiveExclamation,
            repeatedChars: formatting.repeatedChars,
        },
        words,
        spans,
        warning,
        escalating,
    };

    setCache(trimmed, result);

    console.log('[analyze]', JSON.stringify({
        emotion, severity: result.severity, confidence,
        sarcasm: sarcasm.detected, escalating,
        warning: warning.message, flags: toxic.flags,
    }, null, 2));

    return result;
}