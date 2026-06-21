// THE MONEY SHOT: as the NFT owner, pull the encrypted weights from Walrus, get the AES
// key from Seal (only because seal_approve confirms ownership), decrypt, verify data_hash,
// and run real local inference — the model literally comes out of the NFT.
// Usage: node scripts/run-agent.mjs [nftId] "<prompt>"
import { loadEnv, loadConfig, keypairFromPrivKey } from './lib/env.mjs';
import { walrusClient } from './lib/walrus.mjs';
import { sealClient } from './lib/seal.mjs';
import { runAgent } from './lib/run.mjs';

const env = loadEnv();
const cfg = loadConfig();
const signer = keypairFromPrivKey(env.PRIV_KEY);
const nftId = process.argv[2] && process.argv[2].startsWith('0x') ? process.argv[2] : cfg.demoNftId;
const userPrompt = process.argv.find((a, i) => i >= 2 && !a.startsWith('0x')) || 'In two sentences, introduce yourself.';

if (!nftId) throw new Error('No nftId (pass one or run mint-model.mjs first)');
console.log(`Owner ${signer.getPublicKey().toSuiAddress().slice(0, 10)}… running AgentNFT ${nftId.slice(0, 12)}…`);
console.log(`Prompt: "${userPrompt}"\n`);

const t0 = Date.now();
const { agent, text, brainBytes } = await runAgent({
  cfg, signer, walrus: walrusClient(), seal: sealClient(), nftId,
  systemPrompt: 'You are Walnut, a concise research assistant living inside an NFT.',
  userPrompt,
});
console.log('=== AGENT OUTPUT ===');
console.log(text);
console.log('====================');
console.log(`model: ${agent.modelName} (${agent.modelFormat}), v${agent.version}, brain ${(brainBytes / 1e6).toFixed(1)}MB decrypted from Walrus`);
console.log(`total ${((Date.now() - t0) / 1000).toFixed(0)}s`);
