// // Fix HuggingFace downloads in Bun
// const originalFetch = globalThis.fetch;

// const HF_TOKEN=


// globalThis.fetch = async (url: any, options: any = {}) => {
//   options.headers = {
//     ...(options.headers || {}),
//     "User-Agent": "node",
//     "Accept": "*/*",
//     "Connection": "keep-alive",
//     ...(HF_TOKEN
//       ? { Authorization: `Bearer ${HF_TOKEN}` }
//       : {}),
//   };

//   return originalFetch(url, options);
// };

// console.log("HuggingFace authenticated fetch enabled");


// hf-fetch-fix.ts
// Bun + Transformers.js stable HF download patch

const HF_TOKEN ='';

// Required browser globals
(globalThis as any).self = globalThis;
(globalThis as any).window = globalThis;


// Keep original fetch safely
const _fetch: typeof fetch = globalThis.fetch.bind(globalThis);

// Override using defineProperty (important for Bun)
Object.defineProperty(globalThis, "fetch", {
  value: async (input: any | URL, init: RequestInit = {}) => {

    const headers = new Headers(init.headers || {});

    if (!headers.has("User-Agent")) headers.set("User-Agent", "node");
    if (!headers.has("Accept")) headers.set("Accept", "*/*");
    if (!headers.has("Connection")) headers.set("Connection", "keep-alive");

    // CRITICAL for safetensors chunk loading
    if (!headers.has("Range")) headers.set("Range", "bytes=0-");

    if (HF_TOKEN && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${HF_TOKEN}`);
    }

    init.headers = headers;

    return _fetch(input, init);
  }
});

console.log("🧠 HuggingFace Bun fetch patched");
