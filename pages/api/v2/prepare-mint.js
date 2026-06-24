// POST /api/v2/prepare-mint { name, modelId, systemPrompt, persona?, owner }
// Server-side: encrypt the config brain -> Walrus (storage paid by deployer) -> Seal the AES key
// to the connected wallet. Returns mint args; the WALLET signs the actual mint (no server mint).
import { loadEnv, loadConfigV2, keypairFromPrivKey } from "@/scripts/lib/env.mjs";
import { walrusClient } from "@/scripts/lib/walrus.mjs";
import { sealClient } from "@/scripts/lib/seal.mjs";
import { prepareMintV2 } from "@/scripts/lib/walnut-v2.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { name = "Agent", modelId = "smollm2-135m", systemPrompt = "", persona = "", owner } = req.body || {};
  if (!systemPrompt) return res.status(400).json({ error: "systemPrompt required" });
  if (!owner) return res.status(400).json({ error: "owner (connected wallet) required" });
  try {
    const cfg = loadConfigV2();
    const signer = keypairFromPrivKey(loadEnv().PRIV_KEY); // pays Walrus storage only
    const brain = { systemPrompt, persona, memory: [], modelId };
    const prep = await prepareMintV2({ cfg, signer, walrus: walrusClient(), seal: sealClient(), modelId, brain, ownerAddress: owner });
    res.json({ name, modelId, packageId: cfg.walnutPackageId, ...prep });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
