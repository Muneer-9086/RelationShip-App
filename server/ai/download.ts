import './hf-fetch-fix.ts';
import {
  pipeline,
  env,
  type PipelineType,
  type TextClassificationPipeline,
  type FeatureExtractionPipeline
} from '@xenova/transformers';

// ---------------- ENV CONFIG ----------------
env.allowRemoteModels = true;
env.allowLocalModels = true;
env.cacheDir = './.cache/models';
env.useBrowserCache = false;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.simd = false;


// ---------------- MODEL HOLDERS ----------------
let toxicModel: TextClassificationPipeline | null = null;
let emotionModel: TextClassificationPipeline | null = null;
let sentimentModel: TextClassificationPipeline | null = null;
let intentEmbedder: FeatureExtractionPipeline | null = null;


// prevents double loading in parallel requests
const loaders: {
  sst2: Promise<TextClassificationPipeline> | null;
  emotion: Promise<TextClassificationPipeline> | null;
  embedder: Promise<FeatureExtractionPipeline> | null;
} = {
  sst2: null,
  emotion: null,
  embedder: null,
};


// ---------------- Shared SST2 ----------------
async function loadSST2(): Promise<TextClassificationPipeline> {
  if (!loaders.sst2) {
    console.log("📦 Downloading SST2 sentiment/toxicity model (~25MB)...");
    loaders.sst2 = pipeline(
      'text-classification',
      'Xenova/distilbert-base-uncased-finetuned-sst-2-english'
    ) as Promise<TextClassificationPipeline>;
  }
  return loaders.sst2;
}


// ---------------- Public getters ----------------
export async function getToxicModel(): Promise<TextClassificationPipeline> {
  if (!toxicModel) toxicModel = await loadSST2();
  return toxicModel;
}

export async function getSentimentModel(): Promise<TextClassificationPipeline> {
  if (!sentimentModel) sentimentModel = await loadSST2();
  return sentimentModel;
}

export async function getEmotionModel(): Promise<TextClassificationPipeline> {
  if (!emotionModel) {
    if (!loaders.emotion) {
      console.log("📦 Downloading Emotion model (~7MB stable)...");
      loaders.emotion = pipeline(
        'text-classification',
        'Xenova/twitter-roberta-base-sentiment-latest'
      ) as Promise<TextClassificationPipeline>;
    }
    emotionModel = await loaders.emotion;
  }
  return emotionModel;
}


export async function getIntentEmbedder(): Promise<FeatureExtractionPipeline> {
  if (!intentEmbedder) {
    if (!loaders.embedder) {
      console.log("📦 Downloading MiniLM embedding model (~23MB)...");
      loaders.embedder = pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2'
      ) as Promise<FeatureExtractionPipeline>;
    }
    intentEmbedder = await loaders.embedder;
  }
  return intentEmbedder;
}


// ---------------- PRELOAD EVERYTHING ----------------
export async function preloadModels(): Promise<void> {
  console.log("\n🚀 AI Model Warmup Started...\n");

  const start = Date.now();

  await Promise.all([
    getEmotionModel(),
  ]);

  const time = ((Date.now() - start) / 1000).toFixed(2);

  console.log(`\n✅ All AI models ready in ${time}s`);
  console.log("🔥 Server is fully warmed up\n");
}
