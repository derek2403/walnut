// Mint an AgentNFT whose brain IS a real GGUF model, stored ONLY on Walrus.
// The base model is streamed to an OS temp file, encrypted, uploaded, then deleted —
// nothing about the model persists on local disk. Saves nftId -> walnut.config.json.
// Usage: node scripts/mint-model.mjs [localModelPath] [name]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv, loadConfig, keypairFromPrivKey, ROOT } from './lib/env.mjs';
import { walrusClient } from './lib/walrus.mjs';
import { sealClient } from './lib/seal.mjs';
import { mintAgent } from './lib/walnut.mjs';
import { resolveModelSource, cleanupTemp, DEFAULT_MODEL } from './lib/model-source.mjs';

const explicitPath = process.argv[2];
const name = process.argv[3] || 'Research Assistant';

const env = loadEnv();
const cfg = loadConfig();
const signer = keypairFromPrivKey(env.PRIV_KEY);

console.log('Sourcing base model (transient — not stored locally)...');
const { path, temp } = await resolveModelSource(explicitPath);
try {
  const brain = readFileSync(path);
  console.log(`Brain: ${DEFAULT_MODEL.name} (${(brain.length / 1e6).toFixed(1)} MB)${temp ? ' [downloaded to OS temp]' : ` [from ${path}]`}`);
  console.log('Encrypting + uploading to Walrus + sealing key + minting (large upload, be patient)...');

  const t0 = Date.now();
  const m = await mintAgent({
    cfg, signer, walrus: walrusClient(), seal: sealClient(),
    name, brain, modelName: DEFAULT_MODEL.name, modelFormat: DEFAULT_MODEL.format, epochs: 10,
  });
  console.log(`\n✓ Minted AgentNFT ${m.nftId} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(`  blobId: ${m.blobId} (the model now lives ONLY on Walrus)`);

  cfg.demoNftId = m.nftId;
  writeFileSync(join(ROOT, 'walnut.config.json'), JSON.stringify(cfg, null, 2) + '\n');
  console.log('  saved demoNftId to walnut.config.json');
} finally {
  cleanupTemp(path, temp);
  if (temp) console.log('  deleted temp model file (Walrus is the only copy)');
}
