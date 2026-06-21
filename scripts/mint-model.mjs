// Mint an AgentNFT whose brain IS a real GGUF model. Saves the nftId into walnut.config.json
// under demoNftId so run-agent.mjs / demo.mjs can reuse it (avoids re-uploading 145MB).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv, loadConfig, keypairFromPrivKey, ROOT } from './lib/env.mjs';
import { walrusClient } from './lib/walrus.mjs';
import { sealClient } from './lib/seal.mjs';
import { mintAgent } from './lib/walnut.mjs';

const modelPath = process.argv[2] || join(ROOT, 'models', 'SmolLM2-135M-Instruct-Q8_0.gguf');
const name = process.argv[3] || 'Research Assistant';

const env = loadEnv();
const cfg = loadConfig();
const signer = keypairFromPrivKey(env.PRIV_KEY);

const brain = readFileSync(modelPath);
console.log(`Brain: ${modelPath} (${(brain.length / 1e6).toFixed(1)} MB)`);
console.log('Encrypting + uploading to Walrus + sealing key + minting (large upload, be patient)...');

const t0 = Date.now();
const m = await mintAgent({
  cfg, signer, walrus: walrusClient(), seal: sealClient(),
  name, brain, modelName: 'SmolLM2-135M-Instruct', modelFormat: 'gguf', epochs: 10,
});
console.log(`\n✓ Minted AgentNFT ${m.nftId} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`  blobId: ${m.blobId}`);

cfg.demoNftId = m.nftId;
writeFileSync(join(ROOT, 'walnut.config.json'), JSON.stringify(cfg, null, 2) + '\n');
console.log('  saved demoNftId to walnut.config.json');
