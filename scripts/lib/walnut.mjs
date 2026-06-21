// Mint an AgentNFT: encrypt brain -> Walrus -> Seal-encrypt key -> mint on chain.
import { randomBytes } from 'node:crypto';
import { Transaction } from '@mysten/sui/transactions';
import { suiClient } from './env.mjs';
import { newAesKey, aesEncrypt, sha256 } from './crypto.mjs';
import { writeEncryptedBlob } from './walrus.mjs';
import { nftSealIdHex, sealEncryptKey } from './seal.mjs';

const u8 = (b) => Array.from(Buffer.from(b));

// brain: Buffer (the plaintext model brain). Returns mint details incl. nftId.
export async function mintAgent({ cfg, signer, walrus, seal, name, brain, modelName, modelFormat, epochs = 5 }) {
  const creator = signer.getPublicKey().toSuiAddress();
  const aesKey = newAesKey();
  const nonce = randomBytes(16);
  const dataHash = sha256(brain);
  const encrypted = aesEncrypt(brain, aesKey);

  const { blobId } = await writeEncryptedBlob(walrus, encrypted, signer, epochs);
  const idHex = nftSealIdHex(creator, nonce);
  const sealed = await sealEncryptKey(seal, cfg.packageId, idHex, aesKey);

  const tx = new Transaction();
  tx.moveCall({
    target: `${cfg.packageId}::walnut::mint_to_sender`,
    arguments: [
      tx.pure.vector('u8', u8(name)),
      tx.pure.vector('u8', Array.from(nonce)),
      tx.pure.vector('u8', u8(blobId)),
      tx.pure.vector('u8', Array.from(dataHash)),
      tx.pure.vector('u8', Array.from(sealed)),
      tx.pure.vector('u8', u8(modelName)),
      tx.pure.vector('u8', u8(modelFormat)),
    ],
  });
  const client = suiClient();
  const res = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showObjectChanges: true, showEffects: true },
  });
  await client.waitForTransaction({ digest: res.digest });
  if (res.effects?.status?.status !== 'success') {
    throw new Error(`mint failed: ${JSON.stringify(res.effects?.status)}`);
  }
  const nftId = (res.objectChanges ?? []).find(
    (c) => c.type === 'created' && (c.objectType || '').endsWith('::walnut::AgentNFT'),
  )?.objectId;

  return { nftId, idHex, aesKey, nonce, dataHash, blobId, digest: res.digest, creator };
}
