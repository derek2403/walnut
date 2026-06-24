// v2 TRADING TEST: sell a config-brain agent via Kiosk (enforced royalty), prove access
// follows ownership — the BUYER can decrypt the config brain, the SELLER is locked out.
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { loadEnv, loadConfigV2, keypairFromPrivKey, suiClient } from './lib/env.mjs';
import { walrusClient, readBlob } from './lib/walrus.mjs';
import { sealClient, nftSealIdHex, makeSessionKey, sealApproveTxBytes, sealDecryptKey } from './lib/seal.mjs';
import { mintAgentV2, loadAgentV2 } from './lib/walnut-v2.mjs';
import { listForSale, buyAndClaim, fundAddress } from './lib/trade.mjs';
import { aesDecrypt } from './lib/crypto.mjs';

const env = loadEnv();
const cfg = loadConfigV2();
const seller = keypairFromPrivKey(env.PRIV_KEY);
const client = suiClient();
const walrus = walrusClient();
const PRICE = 100_000_000n; // 0.1 SUI

const gate = async (nftId, idHex, sender) => {
  const tx = new Transaction();
  tx.moveCall({ target: `${cfg.packageId}::walnut::seal_approve`, arguments: [tx.pure.vector('u8', Array.from(Buffer.from(idHex, 'hex'))), tx.object(nftId)] });
  return (await client.devInspectTransactionBlock({ sender, transactionBlock: tx })).effects?.status?.status;
};

console.log('Minting a config-brain agent to sell...');
const brain = { systemPrompt: 'You are a tradeable Walnut agent.', persona: '', memory: [], modelId: 'smollm2-135m' };
const m = await mintAgentV2({ cfg, signer: seller, walrus, seal: sealClient(), name: 'For Sale', modelId: 'smollm2-135m', brain, epochs: 3 });
const idHex = nftSealIdHex(m.creator, m.nonce);
console.log('NFT:', m.nftId);

const buyer = Ed25519Keypair.generate();
const buyerAddr = buyer.getPublicKey().toSuiAddress();
await fundAddress({ from: seller, toAddr: buyerAddr, mist: 300_000_000n });
console.log('Funded buyer', buyerAddr.slice(0, 10) + '…');

const preSeller = await gate(m.nftId, idHex, seller.getPublicKey().toSuiAddress());
const preBuyer = await gate(m.nftId, idHex, buyerAddr);
console.log(`pre-sale gate: seller=${preSeller} buyer=${preBuyer}`);

console.log('Listing @ 0.1 SUI + buyer purchases (royalty enforced) + claims...');
const sellerKioskId = await listForSale({ cfg, seller, nftId: m.nftId, price: PRICE });
const spent = await buyAndClaim({ cfg, buyer, nftId: m.nftId, price: PRICE, sellerKioskId });
const a = await loadAgentV2(m.nftId);
console.log(`buyer spent ${(spent / 1e9).toFixed(4)} SUI; owner now = ${a.owner === buyerAddr ? 'BUYER ✓' : a.owner}`);

const postSeller = await gate(m.nftId, idHex, seller.getPublicKey().toSuiAddress());
const postBuyer = await gate(m.nftId, idHex, buyerAddr);
console.log(`post-sale gate: seller=${postSeller} buyer=${postBuyer}`);

// buyer decrypts the config brain
const buyerSk = await makeSessionKey(cfg.packageId, buyer);
const buyerTx = await sealApproveTxBytes(cfg.packageId, idHex, m.nftId);
const aesKey = await sealDecryptKey(sealClient(), a.sealedKey, buyerSk, buyerTx);
const decrypted = JSON.parse(aesDecrypt(await readBlob(walrus, a.blobId), aesKey).toString());
const buyerReads = !!decrypted.systemPrompt;

let sellerDenied = false;
try {
  const sk = await makeSessionKey(cfg.packageId, seller);
  const tx = await sealApproveTxBytes(cfg.packageId, idHex, m.nftId);
  await sealDecryptKey(sealClient(), a.sealedKey, sk, tx);
} catch { sellerDenied = true; }

console.log('\n=== RESULT ===');
const pass = a.owner === buyerAddr && postBuyer === 'success' && postSeller === 'failure' && spent > Number(PRICE) && buyerReads && sellerDenied;
console.log('owner flipped to buyer:', a.owner === buyerAddr ? 'PASS' : 'FAIL');
console.log('gate flipped (buyer=success, seller=failure):', postBuyer === 'success' && postSeller === 'failure' ? 'PASS' : 'FAIL');
console.log('royalty paid (spent > price):', spent > Number(PRICE) ? 'PASS' : 'FAIL');
console.log('buyer decrypts config brain:', buyerReads ? 'PASS' : 'FAIL');
console.log('seller locked out:', sellerDenied ? 'PASS' : 'FAIL');
if (!pass) process.exit(1);
console.log('\n✓ v2 Kiosk sale + royalty + access-follows-ownership VERIFIED.');
