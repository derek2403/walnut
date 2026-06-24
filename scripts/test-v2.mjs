// v2 CRUX: prove the config-brain INFT works on the deployed Nautilus-era contracts.
//   - mint an agent whose brain is a system prompt (config), encrypted on Walrus
//   - owner opens a SessionKey, seal_approve passes, decrypts the config in the clear
//   - a non-owner is denied (devInspect gate proof + Seal decrypt denial)
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { loadEnv, loadConfigV2, keypairFromPrivKey, suiClient } from './lib/env.mjs';
import { walrusClient, readBlob } from './lib/walrus.mjs';
import { sealClient, nftSealIdHex, makeSessionKey, sealApproveTxBytes, sealDecryptKey } from './lib/seal.mjs';
import { mintAgentV2, loadAgentV2 } from './lib/walnut-v2.mjs';
import { aesDecrypt, sha256, toHex } from './lib/crypto.mjs';

const env = loadEnv();
const cfg = loadConfigV2();
const owner = keypairFromPrivKey(env.PRIV_KEY);
const walrus = walrusClient();
const seal = sealClient();

console.log('Minting a config-brain agent on the v2 package', cfg.packageId.slice(0, 12) + '…');
const brain = {
  systemPrompt: 'You are Walnut, a concise research assistant. Be precise and cite sources.',
  persona: 'curious, rigorous, friendly',
  memory: [],
  modelId: 'smollm2-135m',
};
const m = await mintAgentV2({ cfg, signer: owner, walrus, seal, name: 'Research Assistant', modelId: 'smollm2-135m', brain, epochs: 3 });
console.log('Minted AgentNFT', m.nftId, '| blobId', m.blobId);

// Authoritative on-chain gate proof (the exact logic the Seal key servers run via dev_inspect)
const gate = async (sender) => {
  const tx = new Transaction();
  tx.moveCall({ target: `${cfg.packageId}::walnut::seal_approve`, arguments: [tx.pure.vector('u8', Array.from(Buffer.from(m.idHex, 'hex'))), tx.object(m.nftId)] });
  return (await suiClient().devInspectTransactionBlock({ sender, transactionBlock: tx })).effects?.status?.status;
};
const stranger = Ed25519Keypair.generate();
const gOwner = await gate(m.creator);
const gStranger = await gate(stranger.getPublicKey().toSuiAddress());
console.log(`\n[devInspect seal_approve] owner=${gOwner} stranger=${gStranger}`);

// OWNER decrypts the config brain
const a = await loadAgentV2(m.nftId);
const sk = await makeSessionKey(cfg.packageId, owner);
const txBytes = await sealApproveTxBytes(cfg.packageId, m.idHex, m.nftId);
const aesKey = await sealDecryptKey(seal, a.sealedKey, sk, txBytes);
const encrypted = await readBlob(walrus, a.blobId);
const decrypted = aesDecrypt(encrypted, aesKey);
const cfgBrain = JSON.parse(decrypted.toString());
const hashOk = toHex(sha256(decrypted)) === toHex(a.dataHash);
console.log('\n[OWNER] decrypted system prompt:', JSON.stringify(cfgBrain.systemPrompt));
console.log('[OWNER] data_hash matches:', hashOk);

// NON-OWNER denied (fresh client, no shared cache)
let denied = false;
try {
  const s2 = sealClient();
  const sk2 = await makeSessionKey(cfg.packageId, stranger);
  const tx2 = await sealApproveTxBytes(cfg.packageId, m.idHex, m.nftId);
  await sealDecryptKey(s2, a.sealedKey, sk2, tx2);
} catch { denied = true; }

console.log('\n=== RESULT ===');
const pass = gOwner === 'success' && gStranger === 'failure' && hashOk && cfgBrain.systemPrompt && denied;
console.log('gate owner=success/stranger=failure:', gOwner === 'success' && gStranger === 'failure' ? 'PASS' : 'FAIL');
console.log('owner decrypts config brain + hash ok:', hashOk ? 'PASS' : 'FAIL');
console.log('non-owner denied:', denied ? 'PASS' : 'FAIL');
if (!pass) process.exit(1);
console.log('\n✓ v2 config-brain INFT verified on the Nautilus-era contracts.');
