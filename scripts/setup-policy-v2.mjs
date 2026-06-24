// Create a TransferPolicy<v2 AgentNFT> with a 5% royalty rule, signed by PRIV_KEY (which now
// owns the v2 Publisher). Saves transferPolicyId/cap into walnut.v2.config.json.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { KioskClient, TransferPolicyTransaction, testnetRules } from '@mysten/kiosk';
import { Transaction } from '@mysten/sui/transactions';
import { loadEnv, loadConfigV2, keypairFromPrivKey, suiClient, NETWORK, ROOT } from './lib/env.mjs';

const env = loadEnv();
const cfg = loadConfigV2();
const signer = keypairFromPrivKey(env.PRIV_KEY);
const address = signer.getPublicKey().toSuiAddress();
const client = suiClient();
const kioskClient = new KioskClient({ client, network: NETWORK, rules: testnetRules });

const tx = new Transaction();
const tpTx = new TransferPolicyTransaction({ kioskClient, transaction: tx });
await tpTx.create({ type: cfg.agentType, publisher: cfg.publisherId });
tpTx.addRoyaltyRule(500, 0); // 5%
tpTx.shareAndTransferCap(address);

const res = await client.signAndExecuteTransaction({ signer, transaction: tx, options: { showObjectChanges: true, showEffects: true } });
await client.waitForTransaction({ digest: res.digest });
if (res.effects?.status?.status !== 'success') throw new Error(`policy failed: ${JSON.stringify(res.effects?.status)}`);

const ch = res.objectChanges ?? [];
const policyId = ch.find((c) => c.type === 'created' && (c.objectType || '').includes('::transfer_policy::TransferPolicy<'))?.objectId;
const policyCapId = ch.find((c) => c.type === 'created' && (c.objectType || '').includes('::transfer_policy::TransferPolicyCap<'))?.objectId;

const full = JSON.parse((await import('node:fs')).readFileSync(join(ROOT, 'walnut.v2.config.json'), 'utf8'));
full.transferPolicyId = policyId;
full.transferPolicyCapId = policyCapId;
full.royaltyBps = 500;
writeFileSync(join(ROOT, 'walnut.v2.config.json'), JSON.stringify(full, null, 2) + '\n');
console.log('✓ v2 TransferPolicy + 5% royalty created');
console.log('  policyId:', policyId);
console.log('  policyCapId:', policyCapId);
