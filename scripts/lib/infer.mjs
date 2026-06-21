// Local inference with node-llama-cpp: load a GGUF from a file path and generate.
// The model file is the decrypted brain pulled out of the NFT's Walrus blob.
import { getLlama, LlamaChatSession } from 'node-llama-cpp';

let _llama;
async function llama() {
  _llama ||= await getLlama();
  return _llama;
}

export async function runInference({ modelPath, systemPrompt, userPrompt, maxTokens = 128 }) {
  const l = await llama();
  const model = await l.loadModel({ modelPath });
  const context = await model.createContext({ contextSize: 2048 });
  const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
    systemPrompt: systemPrompt || 'You are a helpful assistant.',
  });
  const text = await session.prompt(userPrompt, { maxTokens, temperature: 0.7 });
  await context.dispose();
  await model.dispose();
  return text;
}

// Cached variant: keep the loaded model in memory keyed by path so repeated runs
// (e.g. from the web UI) skip the ~30s cold model load.
const _models = new Map();
export async function runInferenceCached({ modelPath, systemPrompt, userPrompt, maxTokens = 128 }) {
  const l = await llama();
  let model = _models.get(modelPath);
  if (!model) {
    model = await l.loadModel({ modelPath });
    _models.set(modelPath, model);
  }
  const context = await model.createContext({ contextSize: 2048 });
  const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
    systemPrompt: systemPrompt || 'You are a helpful assistant.',
  });
  const text = await session.prompt(userPrompt, { maxTokens, temperature: 0.7 });
  await context.dispose();
  return text;
}
