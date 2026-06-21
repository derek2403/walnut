// Kiosk trading helpers: list an AgentNFT for sale, and buy+claim it.
import { KioskClient, KioskTransaction, testnetRules } from '@mysten/kiosk';
import { Transaction } from '@mysten/sui/transactions';
import { suiClient, NETWORK } from './env.mjs';

function kc() {
  return new KioskClient({ client: suiClient(), network: NETWORK, rules: testnetRules });
}
async function exec(signer, tx, label) {
  const c = suiClient();
  const r = await c.signAndExecuteTransaction({ signer, transaction: tx, options: { showObjectChanges: true, showEffects: true } });
  await c.waitForTransaction({ digest: r.digest });
  if (r.effects?.status?.status !== 'success') throw new Error(`${label} failed: ${JSON.stringify(r.effects?.status)}`);
  return r;
}

// Seller lists `nftId` in a new Kiosk at `price` (bigint MIST). Returns sellerKioskId.
export async function listForSale({ cfg, seller, nftId, price }) {
  const tx = new Transaction();
  const ktx = new KioskTransaction({ transaction: tx, kioskClient: kc() });
  ktx.create();
  ktx.placeAndList({ itemType: cfg.agentType, item: nftId, price });
  ktx.shareAndTransferCap(seller.getPublicKey().toSuiAddress());
  ktx.finalize();
  const r = await exec(seller, tx, 'list');
  return (r.objectChanges ?? []).find(
    (c) => c.type === 'created' && (c.objectType || '').includes('::kiosk::Kiosk') && !(c.objectType || '').includes('Cap'),
  )?.objectId;
}

// Buyer purchases (royalty auto-resolved), takes the item to plain ownership, and
// calls claim_ownership so seal_approve follows. Returns the buyer's SUI spent (MIST).
export async function buyAndClaim({ cfg, buyer, nftId, price, sellerKioskId }) {
  const c = suiClient();
  const buyerAddr = buyer.getPublicKey().toSuiAddress();
  const before = Number((await c.getBalance({ owner: buyerAddr })).totalBalance);
  const tx = new Transaction();
  const bktx = new KioskTransaction({ transaction: tx, kioskClient: kc() });
  bktx.create();
  await bktx.purchaseAndResolve({ itemType: cfg.agentType, itemId: nftId, price, sellerKiosk: sellerKioskId });
  const item = bktx.take({ itemType: cfg.agentType, itemId: nftId });
  tx.moveCall({ target: `${cfg.packageId}::walnut::claim_ownership`, arguments: [item] });
  tx.transferObjects([item], buyerAddr);
  bktx.shareAndTransferCap(buyerAddr);
  bktx.finalize();
  await exec(buyer, tx, 'purchase');
  const after = Number((await c.getBalance({ owner: buyerAddr })).totalBalance);
  return before - after;
}

// Send `mist` SUI from `from` to `toAddr` (for funding a demo buyer).
export async function fundAddress({ from, toAddr, mist }) {
  const tx = new Transaction();
  const [c] = tx.splitCoins(tx.gas, [BigInt(mist)]);
  tx.transferObjects([c], toAddr);
  await exec(from, tx, 'fund');
}
