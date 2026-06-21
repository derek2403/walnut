// Walrus testnet client helpers (write/read the encrypted brain blob).
import { WalrusClient } from '@mysten/walrus';
import { suiClient, NETWORK } from './env.mjs';

// Use the testnet upload relay — direct-to-node writes are unreliable for larger blobs.
const TESTNET_UPLOAD_RELAY = 'https://upload-relay.testnet.walrus.space';

export function walrusClient() {
  return new WalrusClient({
    network: NETWORK,
    suiClient: suiClient(),
    uploadRelay: {
      host: TESTNET_UPLOAD_RELAY,
      sendTip: { max: 1_000_000 },
      timeout: 600_000, // 10 min — default is 30s, too short for ~145MB model blobs
    },
  });
}

// Write an encrypted blob; returns { blobId, blobObjectId }.
export async function writeEncryptedBlob(client, bytes, signer, epochs = 5) {
  const res = await client.writeBlob({
    blob: new Uint8Array(bytes),
    deletable: true,
    epochs,
    signer,
    signal: AbortSignal.timeout(600_000), // 10 min for large blobs
    onStep: (step) => console.log(`  [walrus] ${step?.type ?? step}`),
  });
  return { blobId: res.blobId, blobObjectId: res.blobObject?.id?.id ?? res.blobObject?.id };
}

export async function readBlob(client, blobId) {
  const bytes = await client.readBlob({ blobId });
  return Buffer.from(bytes);
}
