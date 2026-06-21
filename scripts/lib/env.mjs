// Minimal .env.local loader + Sui keypair/client helpers for Walnut scripts.
// Never logs secret values.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// NOTE: @mysten/sui v2 renamed SuiClient -> SuiJsonRpcClient (from /jsonRpc) and
// getFullnodeUrl -> getJsonRpcFullnodeUrl. Verified against installed v2.19.0.
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1';
import { Secp256r1Keypair } from '@mysten/sui/keypairs/secp256r1';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

// Anchor on cwd (repo root) so the same libs work from CLI scripts AND Next.js API
// routes (where bundling changes import.meta.url). Both run with cwd = repo root.
const ROOT = process.cwd();

export function loadEnv(file = '.env.local') {
  const env = {};
  let raw;
  try {
    raw = readFileSync(join(ROOT, file), 'utf8');
  } catch {
    return env;
  }
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
  return env;
}

// Build an Ed25519/Secp256k1/Secp256r1 keypair from a `suiprivkey1...` string.
export function keypairFromPrivKey(privKey) {
  if (!privKey) throw new Error('PRIV_KEY missing from .env.local');
  const { scheme, secretKey } = decodeSuiPrivateKey(privKey.trim());
  switch (scheme) {
    case 'ED25519':
      return Ed25519Keypair.fromSecretKey(secretKey);
    case 'Secp256k1':
      return Secp256k1Keypair.fromSecretKey(secretKey);
    case 'Secp256r1':
      return Secp256r1Keypair.fromSecretKey(secretKey);
    default:
      throw new Error(`Unsupported key scheme: ${scheme}`);
  }
}

export const NETWORK = process.env.SUI_NETWORK || 'testnet';

export function loadConfig() {
  return JSON.parse(readFileSync(join(ROOT, 'walnut.config.json'), 'utf8'));
}

export function suiClient() {
  return new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(NETWORK) });
}

export { ROOT };
