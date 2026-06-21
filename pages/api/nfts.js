// GET /api/nfts?address=0x... — AgentNFTs owned by an address.
import { suiClient, loadConfig } from "@/scripts/lib/env.mjs";

export default async function handler(req, res) {
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: "address required" });
  const cfg = loadConfig();
  try {
    const r = await suiClient().getOwnedObjects({
      owner: address,
      filter: { StructType: cfg.agentType },
      options: { showContent: true },
    });
    const nfts = (r.data || []).map((o) => {
      const f = o.data?.content?.fields || {};
      return {
        id: f.id?.id || o.data?.objectId,
        name: f.name,
        model: f.model_name,
        version: Number(f.version),
        blobId: f.walrus_blob_id,
        owner: f.owner,
      };
    });
    res.json({ nfts });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
