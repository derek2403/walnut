// Create a TransferPolicy<AgentNFT> with an enforced creator royalty rule (5%).
// (Lock rule intentionally omitted so a buyer can take the item to plain ownership and
//  run it via seal_approve(&AgentNFT); enforcing all resales-in-kiosk is a future add.)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { KioskClient, TransferPolicyTransaction, testnetRules } from '@mysten/kiosk';
import { Transaction } from '@mysten/sui/transactions';
import { loadEnv, loadConfig, keypairFromPrivKey, suiClient, NETWORK, ROOT } from './lib/env.mjs';

const env = loadEnv();
const cfg = loadConfig();
const signer = keypairFromPrivKey(env.PRIV_KEY);
const address = signer.getPublicKey().toSuiAddress();
const client = suiClient();

const kioskClient = new KioskClient({ client, network: NETWORK, rules: testnetRules });

const tx = new Transaction();
const tpTx = new TransferPolicyTransaction({ kioskClient, transaction: tx });
await tpTx.create({ type: cfg.agentType, publisher: cfg.publisherId });
tpTx.addRoyaltyRule(500, 0); // 5% (500 bps), min 0
tpTx.shareAndTransferCap(address);

const res = await client.signAndExecuteTransaction({
  signer, transaction: tx, options: { showObjectChanges: true, showEffects: true },
});
await client.waitForTransaction({ digest: res.digest });
if (res.effects?.status?.status !== 'success') throw new Error(`policy failed: ${JSON.stringify(res.effects?.status)}`);

const changes = res.objectChanges ?? [];
const policyId = changes.find((c) => c.type === 'created' && (c.objectType || '').includes('::transfer_policy::TransferPolicy<'))?.objectId;
const policyCapId = changes.find((c) => c.type === 'created' && (c.objectType || '').includes('::transfer_policy::TransferPolicyCap<'))?.objectId;

cfg.transferPolicyId = policyId;
cfg.transferPolicyCapId = policyCapId;
cfg.royaltyBps = 500;
writeFileSync(join(ROOT, 'walnut.config.json'), JSON.stringify(cfg, null, 2) + '\n');
console.log('✓ TransferPolicy created with 5% royalty rule');
console.log('  policyId:', policyId);
console.log('  policyCapId:', policyCapId);
console.log('  digest:', res.digest);
