// Owner run-flow: pull encrypted weights from Walrus, get the key from Seal (gated by
// ownership), decrypt, verify data_hash, then run local inference with node-llama-cpp.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { suiClient, ROOT } from './env.mjs';
import { readBlob } from './walrus.mjs';
import { nftSealIdHex, makeSessionKey, sealApproveTxBytes, sealDecryptKey } from './seal.mjs';
import { aesDecrypt, sha256, toHex } from './crypto.mjs';
import { runInference, runInferenceCached } from './infer.mjs';

export async function loadAgent(nftId) {
  const obj = await suiClient().getObject({ id: nftId, options: { showContent: true } });
  const f = obj.data?.content?.fields;
  if (!f) throw new Error(`AgentNFT ${nftId} not found`);
  return {
    name: f.name,
    creator: f.creator,
    owner: f.owner,
    nonce: Uint8Array.from(f.nonce),
    blobId: f.walrus_blob_id,
    dataHash: Uint8Array.from(f.data_hash),
    sealedKey: Uint8Array.from(f.sealed_key_ref),
    modelName: f.model_name,
    modelFormat: f.model_format,
    version: f.version,
  };
}

// Recover the decrypted brain bytes for `nftId` as `signer` (must be current owner).
export async function decryptBrain({ cfg, signer, walrus, seal, nftId }) {
  const a = await loadAgent(nftId);
  const idHex = nftSealIdHex(a.creator, a.nonce);
  const sk = await makeSessionKey(cfg.packageId, signer);
  const txBytes = await sealApproveTxBytes(cfg.packageId, idHex, nftId);
  const aesKey = await sealDecryptKey(seal, a.sealedKey, sk, txBytes); // throws if not owner
  const encrypted = await readBlob(walrus, a.blobId);
  const brain = aesDecrypt(encrypted, aesKey);
  const ok = toHex(sha256(brain)) === toHex(a.dataHash);
  if (!ok) throw new Error('data_hash mismatch — blob integrity failed');
  return { agent: a, brain };
}

// Full run: decrypt brain -> temp GGUF -> inference.
export async function runAgent({ cfg, signer, walrus, seal, nftId, systemPrompt, userPrompt, cached = false }) {
  const { agent, brain } = await decryptBrain({ cfg, signer, walrus, seal, nftId });
  const tmp = join(ROOT, 'models', `.brain-${nftId.slice(0, 10)}.${agent.modelFormat}`);
  writeFileSync(tmp, brain);
  const run = cached ? runInferenceCached : runInference;
  const text = await run({ modelPath: tmp, systemPrompt, userPrompt });
  return { agent, text, brainBytes: brain.length };
}
