// GET /api/v2/config — public v2 ids + hosted model list + TEE gateway url (if deployed).
import { loadConfigV2 } from "@/scripts/lib/env.mjs";

export default function handler(req, res) {
  const c = loadConfigV2();
  res.json({
    network: c.network,
    walnutPackageId: c.walnutPackageId,
    enclavePackageId: c.enclavePackageId,
    agentType: c.agentType,
    enclaveConfigId: c.enclaveConfigId,
    enclaveObjectId: c.enclaveObjectId && c.enclaveObjectId.startsWith("0x") ? c.enclaveObjectId : null,
    transferPolicyId: c.transferPolicyId || null,
    teeUrl: process.env.NEXT_PUBLIC_TEE_URL || process.env.TEE_URL || null,
    models: [
      { id: "smollm2-135m", name: "SmolLM2-135M-Instruct" },
      { id: "qwen2.5-0.5b", name: "Qwen2.5-0.5B-Instruct" },
    ],
  });
}
