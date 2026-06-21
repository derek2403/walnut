// POST /api/run  { prompt, as: "owner"|"stranger", nftId? }
// owner   -> server (PRIV_KEY) pulls weights from the NFT and runs node-llama-cpp.
// stranger-> a throwaway key is refused by seal_approve (the denial demo).
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { loadEnv, loadConfig, keypairFromPrivKey } from "@/scripts/lib/env.mjs";
import { walrusClient } from "@/scripts/lib/walrus.mjs";
import { sealClient, nftSealIdHex, makeSessionKey, sealApproveTxBytes, sealDecryptKey } from "@/scripts/lib/seal.mjs";
import { runAgent, loadAgent } from "@/scripts/lib/run.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { prompt = "Introduce yourself in one sentence.", as = "owner", nftId: bodyNft } = req.body || {};
  const cfg = loadConfig();
  const nftId = bodyNft || cfg.demoNftId;
  if (!nftId) return res.status(400).json({ error: "no nftId / demoNftId configured" });

  try {
    if (as === "stranger") {
      const stranger = Ed25519Keypair.generate();
      const a = await loadAgent(nftId);
      const idHex = nftSealIdHex(a.creator, a.nonce);
      try {
        const sk = await makeSessionKey(cfg.packageId, stranger);
        const tx = await sealApproveTxBytes(cfg.packageId, idHex, nftId);
        await sealDecryptKey(sealClient(), a.sealedKey, sk, tx);
        return res.json({ denied: false, note: "UNEXPECTED: stranger decrypted" });
      } catch (e) {
        return res.json({ denied: true, reason: e?.constructor?.name || "denied", strangerAddress: stranger.getPublicKey().toSuiAddress() });
      }
    }

    const env = loadEnv();
    const signer = keypairFromPrivKey(env.PRIV_KEY);
    const t0 = Date.now();
    const out = await runAgent({
      cfg, signer, walrus: walrusClient(), seal: sealClient(), nftId,
      systemPrompt: "You are Walnut, a concise research assistant living inside an NFT.",
      userPrompt: prompt,
    });
    return res.json({
      text: out.text,
      model: out.agent.modelName,
      version: Number(out.agent.version),
      brainBytes: out.brainBytes,
      ms: Date.now() - t0,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
