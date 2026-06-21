// Walnut end-to-end demo (one command). Reproduces the whole story on a fresh agent:
//   1. MINT   a real model (GGUF) as an encrypted INFT (Walrus + Seal + Sui)
//   2. RUN    owner pulls weights out of the NFT and generates text
//   3. DENY   a non-owner is refused the key by seal_approve
//   4. SELL   via Kiosk with enforced 5% royalty; buyer claims ownership
//   5. RUN    the NEW owner runs the same model
//   6. DENY   the previous owner is now locked out
//
// Usage: node scripts/demo.mjs [modelPath] [--reuse <nftId>]
import { readFileSync } from 'node:fs';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { loadEnv, loadConfig, keypairFromPrivKey, suiClient } from './lib/env.mjs';
import { walrusClient } from './lib/walrus.mjs';
import { sealClient, nftSealIdHex, makeSessionKey, sealApproveTxBytes, sealDecryptKey } from './lib/seal.mjs';
import { mintAgent } from './lib/walnut.mjs';
import { loadAgent, runAgent } from './lib/run.mjs';
import { listForSale, buyAndClaim, fundAddress } from './lib/trade.mjs';
import { resolveModelSource, cleanupTemp, DEFAULT_MODEL } from './lib/model-source.mjs';
import { toHex } from './lib/crypto.mjs';

const args = process.argv.slice(2);
const reuseIdx = args.indexOf('--reuse');
const reuseNftId = reuseIdx >= 0 ? args[reuseIdx + 1] : null;
const explicitModelPath = args.find((a) => a.endsWith('.gguf')) || null;

const env = loadEnv();
const cfg = loadConfig();
const seller = keypairFromPrivKey(env.PRIV_KEY);
const sellerAddr = seller.getPublicKey().toSuiAddress();
const client = suiClient();
const walrus = walrusClient();
const results = {};
const hr = (t) => console.log(`\n${'='.repeat(60)}\n${t}\n${'='.repeat(60)}`);

const gate = async (nftId, idHex, sender) => {
  const tx = new Transaction();
  tx.moveCall({ target: `${cfg.packageId}::walnut::seal_approve`, arguments: [tx.pure.vector('u8', Array.from(Buffer.from(idHex, 'hex'))), tx.object(nftId)] });
  return (await client.devInspectTransactionBlock({ sender, transactionBlock: tx })).effects?.status?.status;
};
const decryptDenied = async (signer, nftId, idHex, sealedKey) => {
  try {
    const sk = await makeSessionKey(cfg.packageId, signer);
    const tx = await sealApproveTxBytes(cfg.packageId, idHex, nftId);
    await sealDecryptKey(sealClient(), sealedKey, sk, tx);
    return false;
  } catch { return true; }
};

// 1. MINT
hr('1. MINT — a real model becomes an encrypted, owned INFT');
let nftId, idHex, aesKey;
if (reuseNftId) {
  nftId = reuseNftId;
  const a = await loadAgent(nftId);
  idHex = nftSealIdHex(a.creator, a.nonce);
  console.log(`Reusing AgentNFT ${nftId} (${a.modelName})`);
} else {
  const src = await resolveModelSource(explicitModelPath); // OS temp download, not local repo
  try {
    const brain = readFileSync(src.path);
    console.log(`Brain: ${DEFAULT_MODEL.name} (${(brain.length / 1e6).toFixed(1)} MB) → encrypt → Walrus → Seal → mint`);
    const m = await mintAgent({ cfg, signer: seller, walrus, seal: sealClient(), name: 'Research Assistant', brain, modelName: DEFAULT_MODEL.name, modelFormat: DEFAULT_MODEL.format, epochs: 10 });
    ({ nftId, idHex, aesKey } = m);
    console.log(`Minted ${nftId}  blobId ${m.blobId} (model now lives ONLY on Walrus)`);
  } finally {
    cleanupTemp(src.path, src.temp);
  }
}

// 2. RUN as owner
hr('2. RUN — the OWNER pulls weights from the NFT and generates text');
const r1 = await runAgent({ cfg, signer: seller, walrus, seal: sealClient(), nftId, systemPrompt: 'You are Walnut, a concise research assistant inside an NFT.', userPrompt: 'In one sentence, what makes you special?' });
console.log('🧠', r1.text.trim());
results.ownerRun = !!r1.text;

// 3. DENY a stranger
hr('3. DENY — a non-owner is refused by seal_approve');
const stranger = Ed25519Keypair.generate();
const a0 = await loadAgent(nftId);
const strangerGate = await gate(nftId, idHex, stranger.getPublicKey().toSuiAddress());
const strangerDenied = await decryptDenied(stranger, nftId, idHex, a0.sealedKey);
console.log(`stranger devInspect gate = ${strangerGate}; Seal decrypt denied = ${strangerDenied}`);
results.strangerDenied = strangerGate === 'failure' && strangerDenied;

// 4. SELL via Kiosk
hr('4. SELL — Kiosk sale @ 0.1 SUI with enforced 5% royalty');
const buyer = Ed25519Keypair.generate();
const buyerAddr = buyer.getPublicKey().toSuiAddress();
await fundAddress({ from: seller, toAddr: buyerAddr, mist: 300_000_000n });
const PRICE = 100_000_000n;
const sellerKioskId = await listForSale({ cfg, seller, nftId, price: PRICE });
const spent = await buyAndClaim({ cfg, buyer, nftId, price: PRICE, sellerKioskId });
const a1 = await loadAgent(nftId);
console.log(`buyer spent ${(spent / 1e9).toFixed(4)} SUI; on-chain owner = ${a1.owner === buyerAddr ? 'BUYER ✓' : a1.owner}`);
results.sold = a1.owner === buyerAddr && spent > Number(PRICE); // paid more than price => royalty+gas

// 5. RUN as new owner
hr('5. RUN — the NEW owner runs the same model');
const r2 = await runAgent({ cfg, signer: buyer, walrus, seal: sealClient(), nftId, systemPrompt: 'You are Walnut, now owned by a new keeper.', userPrompt: 'Greet your new owner in one sentence.' });
console.log('🧠', r2.text.trim());
results.buyerRun = !!r2.text;

// 6. DENY the previous owner
hr('6. DENY — the previous owner is now locked out');
const sellerGate = await gate(nftId, idHex, sellerAddr);
const sellerDenied = await decryptDenied(seller, nftId, idHex, a1.sealedKey);
console.log(`previous-owner devInspect gate = ${sellerGate}; Seal decrypt denied = ${sellerDenied}`);
results.sellerLockedOut = sellerGate === 'failure' && sellerDenied;

// Summary
hr('RESULT');
const checks = [
  ['owner runs model from NFT', results.ownerRun],
  ['non-owner denied', results.strangerDenied],
  ['Kiosk sale w/ enforced royalty', results.sold],
  ['new owner runs model', results.buyerRun],
  ['previous owner locked out', results.sellerLockedOut],
];
for (const [k, v] of checks) console.log(`  ${v ? '✓' : '✗'} ${k}`);
const allPass = checks.every(([, v]) => v);
console.log(allPass ? '\n✅ WALNUT END-TO-END DEMO PASSED' : '\n❌ some checks failed');
if (!allPass) process.exit(1);
