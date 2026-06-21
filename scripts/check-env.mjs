// Verify PRIV_KEY -> address, network, and balances (SUI gas + WAL for Walrus).
// Prints address + balances only; never the secret.
import { loadEnv, keypairFromPrivKey, suiClient, NETWORK } from './lib/env.mjs';

const WAL_TESTNET = '0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL';

const env = loadEnv();
const kp = keypairFromPrivKey(env.PRIV_KEY);
const address = kp.getPublicKey().toSuiAddress();
const client = suiClient();

console.log(`Network:  ${NETWORK}`);
console.log(`Address:  ${address}`);
console.log(`OPENAI_API_KEY present: ${env.OPENAI_API_KEY ? 'yes' : 'no'}`);

const sui = await client.getBalance({ owner: address });
const suiAmt = Number(sui.totalBalance) / 1e9;
console.log(`SUI:      ${suiAmt} SUI (${sui.totalBalance} MIST)`);

let walAmt = 0;
try {
  const wal = await client.getBalance({ owner: address, coinType: WAL_TESTNET });
  walAmt = Number(wal.totalBalance) / 1e9;
  console.log(`WAL:      ${walAmt} WAL (${wal.totalBalance})`);
} catch (e) {
  console.log(`WAL:      unknown (${e.message})`);
}

console.log('---');
if (suiAmt < 0.5) {
  console.log(`⚠ Low SUI. Fund via: sui client faucet --address ${address}`);
  console.log(`  or curl the testnet faucet at https://faucet.sui.io`);
}
if (walAmt < 0.5) {
  console.log(`⚠ Low WAL. Get WAL via:  walrus get-wal  (exchanges testnet SUI for WAL)`);
}
if (suiAmt >= 0.5 && walAmt >= 0.5) {
  console.log('✓ Funded for deploy + Walrus storage.');
}
