import { pipeline } from '@xenova/transformers';

let toxicModel: any;
let emotionModel: any;
let sentimentModel: any;
let intentEmbedder: any;

// 🧠 very small moderation model (~30-40MB)
export async function getToxicModel() {
  if (!toxicModel) {
    console.log("Loading LIGHT toxic model...");
    toxicModel = await pipeline(
      'text-classification',
      'Xenova/distilbert-base-uncased-finetuned-sst-2-english'
    );
  }
  return toxicModel;
}

// 🧠 small emotion understanding
export async function getEmotionModel() {
  if (!emotionModel) {
    console.log("Loading LIGHT emotion model...");
    emotionModel = await pipeline(
      'text-classification',
      'Xenova/distilroberta-base-go_emotions'
    );
  }
  return emotionModel;
}

// 🧠 fast sentiment tone
export async function getSentimentModel() {
  if (!sentimentModel) {
    console.log("Loading LIGHT sentiment model...");
    sentimentModel = await pipeline(
      'text-classification',
      'Xenova/distilbert-base-uncased-finetuned-sst-2-english'
    );
  }
  return sentimentModel;
}

// 🧠 tiny embeddings for intent similarity
export async function getIntentEmbedder() {
  if (!intentEmbedder) {
    console.log("Loading LIGHT embedder...");
    intentEmbedder = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    );
  }
  return intentEmbedder;
}
