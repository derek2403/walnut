// Exchange testnet SUI -> WAL for the PRIV_KEY address (funds Walrus storage).
// Usage: node scripts/get-wal.mjs [suiAmount]   (default 1 SUI)
import { Transaction } from '@mysten/sui/transactions';
import { loadEnv, keypairFromPrivKey, suiClient } from './lib/env.mjs';

const EXCHANGE_PKG = '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f';
const EXCHANGE_OBJ = '0xf4d164ea2def5fe07dc573992a029e010dba09b1a8dcbc44c5c2e79567f39073';

const suiAmount = Number(process.argv[2] || '1');
const amountMist = BigInt(Math.floor(suiAmount * 1e9));

const env = loadEnv();
const kp = keypairFromPrivKey(env.PRIV_KEY);
const address = kp.getPublicKey().toSuiAddress();
const client = suiClient();

console.log(`Exchanging ${suiAmount} SUI -> WAL for ${address} ...`);

const tx = new Transaction();
const [coin] = tx.splitCoins(tx.gas, [amountMist]);
const walCoin = tx.moveCall({
  target: `${EXCHANGE_PKG}::wal_exchange::exchange_for_wal`,
  arguments: [tx.object(EXCHANGE_OBJ), coin, tx.pure.u64(amountMist)],
});
// returned WAL coin + the (now-empty) SUI coin back to self
tx.transferObjects([walCoin, coin], address);

const res = await client.signAndExecuteTransaction({
  signer: kp,
  transaction: tx,
  options: { showEffects: true },
});
await client.waitForTransaction({ digest: res.digest });
console.log('digest:', res.digest, '| status:', res.effects?.status?.status);

const WAL = '0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL';
const wal = await client.getBalance({ owner: address, coinType: WAL });
console.log(`WAL balance now: ${Number(wal.totalBalance) / 1e9} WAL`);
