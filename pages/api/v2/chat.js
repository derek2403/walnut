// POST /api/v2/chat { nftId, message, token? } — forwards to the Nautilus TEE gateway.
// Inference happens INSIDE the enclave (decrypt config brain -> run model -> sign). If the
// enclave isn't deployed yet, returns a clear `pending` status (no faking).
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { nftId, message, token } = req.body || {};
  const teeUrl = process.env.NEXT_PUBLIC_TEE_URL || process.env.TEE_URL;
  if (!teeUrl) {
    return res.json({
      pending: true,
      note: "Chat runs inside the Nautilus enclave. Deploy it (SETUP_NAUTILUS.md → build the walnut EIF + register), then set TEE_URL in .env.local.",
    });
  }
  if (!nftId || !message) return res.status(400).json({ error: "nftId and message required" });
  // Health-probe the enclave to tell "not reachable" from "reachable but chat not wired yet".
  let attested = false;
  try {
    const h = await fetch(`${teeUrl}/get_attestation`, { signal: AbortSignal.timeout(8000) });
    attested = h.ok;
  } catch { /* unreachable */ }
  try {
    const r = await fetch(`${teeUrl}/process_data`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ payload: { op: "chat", nftId, message } }),
      signal: AbortSignal.timeout(60000),
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    if (data && (data.response || data.reply)) return res.json(data);
    // Reachable enclave, but the Walnut chat logic (process_data op:chat) isn't deployed yet.
    return res.json({
      pending: true,
      note: attested
        ? "Enclave is live & attested, but the Walnut chat logic (process_data op:chat → config-brain decrypt + inference) isn't deployed in this EIF yet. Rebuild with the real process_data."
        : `Enclave at ${teeUrl} not reachable (check the instance is running + expose_enclave.sh + the IP).`,
      enclaveStatus: r.status,
    });
  } catch (e) {
    return res.json({ pending: true, note: `Enclave at ${teeUrl} not reachable: ${String(e?.message || e)}` });
  }
}
