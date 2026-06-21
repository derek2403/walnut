// GET /api/agent — public config + the demo AgentNFT card.
import { loadConfig } from "@/scripts/lib/env.mjs";
import { loadAgent } from "@/scripts/lib/run.mjs";

export default async function handler(req, res) {
  const cfg = loadConfig();
  const config = {
    network: cfg.network,
    packageId: cfg.packageId,
    agentType: cfg.agentType,
    demoNftId: cfg.demoNftId,
    transferPolicyId: cfg.transferPolicyId,
    royaltyBps: cfg.royaltyBps,
    enclaveRegistryId: cfg.enclaveRegistryId,
    ownerAddress: cfg.publisherAddress,
  };
  let agent = null;
  try {
    if (cfg.demoNftId) {
      const a = await loadAgent(cfg.demoNftId);
      agent = {
        id: cfg.demoNftId,
        name: a.name,
        model: a.modelName,
        format: a.modelFormat,
        version: Number(a.version),
        blobId: a.blobId,
        owner: a.owner,
      };
    }
  } catch (e) {
    config.agentError = String(e?.message || e);
  }
  res.json({ config, agent });
}
