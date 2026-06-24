// POST /api/v2/mint { name, modelId, systemPrompt, persona?, owner? }
// Server encrypts the config brain -> Walrus -> Seal -> mints an AgentNFT and transfers it
// to `owner` (the connected wallet). The server (PRIV_KEY) pays Walrus/gas; the user OWNS it.
import { loadEnv, loadConfigV2, keypairFromPrivKey } from "@/scripts/lib/env.mjs";
import { walrusClient } from "@/scripts/lib/walrus.mjs";
import { sealClient } from "@/scripts/lib/seal.mjs";
import { mintAgentV2 } from "@/scripts/lib/walnut-v2.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { name = "Agent", modelId = "smollm2-135m", systemPrompt = "", persona = "", owner } = req.body || {};
  if (!systemPrompt) return res.status(400).json({ error: "systemPrompt required" });
  try {
    const cfg = loadConfigV2();
    const signer = keypairFromPrivKey(loadEnv().PRIV_KEY);
    const brain = { systemPrompt, persona, memory: [], modelId };
    const t0 = Date.now();
    const m = await mintAgentV2({
      cfg, signer, walrus: walrusClient(), seal: sealClient(),
      name, modelId, brain, ownerAddress: owner, epochs: 5,
    });
    res.json({ nftId: m.nftId, blobId: m.blobId, owner: owner || signer.getPublicKey().toSuiAddress(), ms: Date.now() - t0 });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
