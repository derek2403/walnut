// Seal helpers: seal the AES key to the NFT identity, and decrypt gated by seal_approve.
import { SealClient, SessionKey } from '@mysten/seal';
import { Transaction } from '@mysten/sui/transactions';
import { suiClient } from './env.mjs';

// Mysten Labs Open-mode testnet key servers (from seal-docs Pricing#verified-key-servers).
export const SEAL_TESTNET_SERVERS = [
  { objectId: '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75', weight: 1 },
  { objectId: '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8', weight: 1 },
];
export const SEAL_THRESHOLD = 2;

export function sealClient() {
  return new SealClient({
    suiClient: suiClient(),
    serverConfigs: SEAL_TESTNET_SERVERS,
    verifyKeyServers: false,
  });
}

// The Seal identity bound to an NFT = bcs(creator) || nonce, as a hex string.
// MUST match Move walnut::seal_id (address bytes || nonce).
export function nftSealIdHex(creatorAddress, nonce) {
  const addr = Buffer.from(creatorAddress.replace(/^0x/, ''), 'hex'); // 32 bytes
  return Buffer.concat([addr, Buffer.from(nonce)]).toString('hex');
}

// Seal-encrypt the AES key to the NFT identity. Returns the sealed bytes (sealed_key_ref).
export async function sealEncryptKey(client, packageId, idHex, aesKey) {
  const { encryptedObject } = await client.encrypt({
    threshold: SEAL_THRESHOLD,
    packageId,
    id: idHex,
    data: new Uint8Array(aesKey),
  });
  return new Uint8Array(encryptedObject);
}

// Build a SessionKey for `signer` and sign its personal message.
export async function makeSessionKey(packageId, signer, ttlMin = 10) {
  const sk = await SessionKey.create({
    address: signer.getPublicKey().toSuiAddress(),
    packageId,
    ttlMin,
    suiClient: suiClient(),
  });
  const { signature } = await signer.signPersonalMessage(sk.getPersonalMessage());
  await sk.setPersonalMessageSignature(signature);
  return sk;
}

// Build the seal_approve transaction-kind bytes for this NFT + identity.
export async function sealApproveTxBytes(packageId, idHex, nftId) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::walnut::seal_approve`,
    arguments: [tx.pure.vector('u8', Array.from(Buffer.from(idHex, 'hex'))), tx.object(nftId)],
  });
  return await tx.build({ client: suiClient(), onlyTransactionKind: true });
}

// Decrypt the sealed AES key — succeeds only if seal_approve passes for the session signer.
export async function sealDecryptKey(client, sealedBytes, sessionKey, txBytes) {
  const dec = await client.decrypt({ data: new Uint8Array(sealedBytes), sessionKey, txBytes });
  return Buffer.from(dec);
}
