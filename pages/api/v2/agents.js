// GET /api/v2/agents?address=0x... — config-brain AgentNFTs owned by an address.
import { suiClient, loadConfigV2 } from "@/scripts/lib/env.mjs";

export default async function handler(req, res) {
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: "address required" });
  const c = loadConfigV2();
  try {
    const r = await suiClient().getOwnedObjects({
      owner: address,
      filter: { StructType: c.agentType },
      options: { showContent: true },
    });
    const agents = (r.data || []).map((o) => {
      const f = o.data?.content?.fields || {};
      return {
        id: f.id?.id || o.data?.objectId,
        name: f.name,
        modelId: f.model_id,
        owner: f.owner,
        version: Number(f.version),
        blobId: f.walrus_blob_id,
      };
    });
    res.json({ agents });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
