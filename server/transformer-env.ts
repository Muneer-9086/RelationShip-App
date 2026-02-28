import path from "path";
import { fileURLToPath } from "url";
import { env } from "@xenova/transformers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// where models are stored
env.cacheDir = path.join(__dirname, "./ai/.cache/models");

// allow reading local models
env.allowLocalModels = true;

// 🚨 IMPORTANT: disable internet
env.allowRemoteModels = false;

env.useBrowserCache = false;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.simd = false;

console.log("Transformers running in OFFLINE mode");
