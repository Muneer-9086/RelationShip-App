import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));


function toFileURL(p: string) {
  return pathToFileURL(p).href;
}

export const MODEL_PATHS = {
  sentiment: "./ai/.cache/models/Xenova/distilbert-base-uncased-finetuned-sst-2-english",
  emotion: "./ai/.cache/models/Xenova/twitter-roberta-base-sentiment-latest",
};

