// v2 mint: the brain is the CONFIG (system prompt + persona + memory + model_id), NOT weights.
// Encrypt the config JSON -> Walrus -> Seal the AES key to the NFT identity -> mint AgentNFT.
import { randomBytes } from 'node:crypto';
import { Transaction } from '@mysten/sui/transactions';
import { suiClient } from './env.mjs';
import { newAesKey, aesEncrypt, sha256 } from './crypto.mjs';
import { writeEncryptedBlob } from './walrus.mjs';
import { nftSealIdHex, sealEncryptKey } from './seal.mjs';

const u8 = (b) => Array.from(Buffer.from(b));

// brain = { systemPrompt, persona?, memory?, modelId }. The signer pays (Walrus/gas); the
// agent is minted then transferred to `ownerAddress` (default = signer) so any connected
// wallet can OWN the agent while the server does the heavy Walrus/Seal lifting.
// Returns mint details incl. nftId.
export async function mintAgentV2({ cfg, signer, walrus, seal, name, modelId, brain, ownerAddress, epochs = 5 }) {
  const creator = signer.getPublicKey().toSuiAddress();
  const to = ownerAddress || creator;
  const aesKey = newAesKey();
  const nonce = randomBytes(16);
  const plaintext = Buffer.from(JSON.stringify(brain));
  const dataHash = sha256(plaintext);
  const encrypted = aesEncrypt(plaintext, aesKey);

  const { blobId } = await writeEncryptedBlob(walrus, encrypted, signer, epochs);
  const idHex = nftSealIdHex(creator, nonce);
  const sealed = await sealEncryptKey(seal, cfg.packageId, idHex, aesKey);

  const tx = new Transaction();
  const nft = tx.moveCall({
    target: `${cfg.packageId}::walnut::mint`,
    arguments: [
      tx.pure.vector('u8', u8(name)),
      tx.pure.vector('u8', u8(modelId)),
      tx.pure.vector('u8', Array.from(nonce)),
      tx.pure.vector('u8', u8(blobId)),
      tx.pure.vector('u8', Array.from(dataHash)),
      tx.pure.vector('u8', Array.from(sealed)),
    ],
  });
  tx.moveCall({ target: `${cfg.packageId}::walnut::walnut_transfer`, arguments: [nft, tx.pure.address(to)] });
  const client = suiClient();
  const res = await client.signAndExecuteTransaction({
    signer, transaction: tx, options: { showObjectChanges: true, showEffects: true },
  });
  await client.waitForTransaction({ digest: res.digest });
  if (res.effects?.status?.status !== 'success') throw new Error(`mint failed: ${JSON.stringify(res.effects?.status)}`);
  const nftId = (res.objectChanges ?? []).find(
    (c) => c.type === 'created' && (c.objectType || '').endsWith('::walnut::AgentNFT'),
  )?.objectId;
  return { nftId, idHex, aesKey, nonce, dataHash, blobId, creator, digest: res.digest };
}

// Prepare a mint WITHOUT signing it: encrypt the config brain, upload the ciphertext to Walrus
// (storage paid by `signer` = deployer/PRIV_KEY), and Seal-seal the AES key to `ownerAddress`
// (the connected wallet). Returns the args the WALLET will pass to mint_to_sender — so the
// user signs the actual on-chain mint and becomes creator + owner. PRIV_KEY never mints.
export async function prepareMintV2({ cfg, signer, walrus, seal, modelId, brain, ownerAddress, epochs = 5 }) {
  const aesKey = newAesKey();
  const nonce = randomBytes(16);
  const plaintext = Buffer.from(JSON.stringify(brain));
  const dataHash = sha256(plaintext);
  const encrypted = aesEncrypt(plaintext, aesKey);
  const { blobId } = await writeEncryptedBlob(walrus, encrypted, signer, epochs); // storage subsidy
  const idHex = nftSealIdHex(ownerAddress, nonce); // sealed to the connected wallet (= future owner)
  const sealed = await sealEncryptKey(seal, cfg.packageId, idHex, aesKey);
  return {
    nonceHex: Buffer.from(nonce).toString('hex'),
    blobId,
    dataHashHex: Buffer.from(dataHash).toString('hex'),
    sealedKeyB64: Buffer.from(sealed).toString('base64'),
  };
}

// Load an AgentNFT v2 (config-brain fields).
export async function loadAgentV2(nftId) {
  const obj = await suiClient().getObject({ id: nftId, options: { showContent: true } });
  const f = obj.data?.content?.fields;
  if (!f) throw new Error(`AgentNFT ${nftId} not found`);
  return {
    name: f.name, creator: f.creator, owner: f.owner, modelId: f.model_id,
    nonce: Uint8Array.from(f.nonce), blobId: f.walrus_blob_id,
    dataHash: Uint8Array.from(f.data_hash), sealedKey: Uint8Array.from(f.sealed_key_ref),
    version: Number(f.version),
  };
}
