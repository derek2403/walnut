// Publish the Walnut Move package to testnet (signed by PRIV_KEY), register the
// SIMULATED Nautilus enclave key, and write walnut.config.json (IDs, no secrets).
// The enclave secret key is written to .walnut-enclave.json (gitignored).
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { loadEnv, keypairFromPrivKey, suiClient, NETWORK, ROOT } from './lib/env.mjs';

const env = loadEnv();
const kp = keypairFromPrivKey(env.PRIV_KEY);
const address = kp.getPublicKey().toSuiAddress();
const client = suiClient();

console.log(`Publishing Walnut package as ${address} on ${NETWORK} ...`);

// 1. Build bytecode
const pkgPath = join(ROOT, 'move', 'walnut');
const build = JSON.parse(
  execSync(`sui move build --dump-bytecode-as-base64 --path ${pkgPath}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
);

// 2. Publish
const pubTx = new Transaction();
const [upgradeCap] = pubTx.publish({ modules: build.modules, dependencies: build.dependencies });
pubTx.transferObjects([upgradeCap], address);

const pubRes = await client.signAndExecuteTransaction({
  signer: kp,
  transaction: pubTx,
  options: { showObjectChanges: true, showEffects: true },
});
await client.waitForTransaction({ digest: pubRes.digest });
if (pubRes.effects?.status?.status !== 'success') {
  throw new Error(`Publish failed: ${JSON.stringify(pubRes.effects?.status)}`);
}

const changes = pubRes.objectChanges ?? [];
const packageId = changes.find((c) => c.type === 'published')?.packageId;
const findObj = (suffix) =>
  changes.find((c) => c.type === 'created' && typeof c.objectType === 'string' && c.objectType.endsWith(suffix))
    ?.objectId;

const ids = {
  network: NETWORK,
  packageId,
  module: 'walnut',
  publisherAddress: address,
  adminCapId: findObj('::walnut::AdminCap'),
  enclaveRegistryId: findObj('::walnut::EnclaveRegistry'),
  publisherId: findObj('::package::Publisher'),
  displayId: changes.find((c) => c.type === 'created' && (c.objectType || '').includes('::display::Display<'))?.objectId,
  upgradeCapId: findObj('::package::UpgradeCap'),
  agentType: `${packageId}::walnut::AgentNFT`,
  publishDigest: pubRes.digest,
};
console.log('Published:', JSON.stringify(ids, null, 2));

// 3. Generate + register the SIMULATED enclave ed25519 key
const enclaveKp = Ed25519Keypair.generate();
const enclavePub = Array.from(enclaveKp.getPublicKey().toRawBytes());

const regTx = new Transaction();
regTx.moveCall({
  target: `${packageId}::walnut::register_enclave`,
  arguments: [
    regTx.object(ids.adminCapId),
    regTx.object(ids.enclaveRegistryId),
    regTx.pure.vector('u8', enclavePub),
  ],
});
const regRes = await client.signAndExecuteTransaction({ signer: kp, transaction: regTx, options: { showEffects: true } });
await client.waitForTransaction({ digest: regRes.digest });
console.log('register_enclave:', regRes.effects?.status?.status);

// 4. Persist config (committable) + enclave secret (gitignored)
ids.enclavePubkey = enclaveKp.getPublicKey().toBase64();
writeFileSync(join(ROOT, 'walnut.config.json'), JSON.stringify(ids, null, 2) + '\n');
writeFileSync(
  join(ROOT, '.walnut-enclave.json'),
  JSON.stringify({ secretKey: enclaveKp.getSecretKey(), publicKeyBase64: enclaveKp.getPublicKey().toBase64() }, null, 2) + '\n',
);
console.log('\n✓ Wrote walnut.config.json and .walnut-enclave.json');
