# Walnut v2 — Claude Code build loop prompt (real Nautilus TEE · ERC-7857 on Sui)

Paste the block below into Claude Code as `/loop <prompt>`. It rebuilds Walnut as a true
ERC-7857-style **Intelligent NFT on Sui**: the agent's **config brain** (system prompt +
persona + memory) is encrypted on **Walrus** and sealed by **Seal** to the owner; the model
is **hosted and run inside a real AWS Nitro Enclave (Nautilus)**; trading is via **Kiosk**.

> This supersedes the previous "weights-as-the-blob" design. Reuse the existing Walrus/Seal/
> Kiosk/Move scaffolding where possible, but the brain is now the encrypted CONFIG, not weights.

---

## THE PROMPT

You are building **Walnut v2**, an ERC-7857-equivalent Intelligent NFT (INFT) on **Sui testnet**,
following the semantics of **0G's ERC-7857** and using **Sui Nautilus** for the TEE oracle.
Iterate until the Definition of Done for the current phase is met, then move to the next phase.
Re-read this prompt, `README.md`, and the current code at the start of every iteration.

### Required reading before writing code (fetch live; don't trust memory)
- **Sui Nautilus** — follow the official guide **exactly**: https://docs.sui.io/sui-stack/nautilus/using-nautilus (plus What is Nautilus / Customizing / Weather-Oracle / Encrypt-Enclave-Secrets-with-Seal). **Build Walnut as a Nautilus app inside the MystenLabs `nautilus` repo template** — do NOT invent a custom enclave/`nitro-cli` flow. The full AWS runbook is `SETUP_NAUTILUS.md` (already in this repo) and must stay in sync with what you build.
- **Base the Walnut app on the repo's `seal-example`** (NOT weather-example) — it is the canonical **Seal-inside-the-enclave** pattern, which is exactly Walnut's need (decrypt the agent's config brain in-TEE). Study and mirror, in the cloned repo at `~/Developer/nautilus`:
  - `src/nautilus-server/src/apps/seal-example/` → `mod.rs` (`process_data` + `IntentScope` + `to_signed_response` enclave signing), `endpoints.rs` (`init_seal_key_load` / `complete_seal_key_load` / secret provisioning — the Seal key-load handshake), `types.rs`, `seal_config.yaml`, `allowed_endpoints.yaml`.
  - `move/seal-policy/sources/` → `seal_policy.move` (the Seal access policy the enclave satisfies to decrypt) + `weather.move` (the app module pattern with OTW + `enclave::verify_signature`).
- **0G ERC-7857** (interface + flow you are mirroring): https://docs.0g.ai/developer-hub/building-on-0g/inft/erc7857 and https://eips.ethereum.org/EIPS/eip-7857
- **Walrus**: https://docs.wal.app/  · **Seal**: linked from the Walrus docs (`SealClient`, `seal_approve`, `SessionKey`, Seal-Nautilus secret pattern).
- **Sui Kiosk/TransferPolicy**: https://docs.sui.io/ . Verify every SDK/Move signature against the **installed versions** before relying on it.

### Hard constraints (non-negotiable, keep everything real & legit)
- **Testnet only.** Never mainnet.
- **On-chain vs off-chain, strictly:**
  - **On-chain (Sui):** the `AgentNFT` object (`owner, creator, model_id, walrus_blob_id, data_hash, sealed_key_ref, version, usage_policy`), the Move package, the **`enclave` registry** (real attestation verification), the **Kiosk + TransferPolicy** marketplace, ERC-7857 entry fns, and enclave-signed provenance receipts.
  - **Off-chain:** the encrypted **config brain** on Walrus; the **hosted model weights** (inside the enclave image); the **Seal** key servers; the **AWS Nitro Enclave** (inference + re-encryption); the gateway/parent EC2 (REST API + token auth); the plaintext system prompt (only ever inside the enclave).
- **Config brain, not weights.** The encrypted blob = `{ systemPrompt, persona, memory, modelId }` (small). The model is selected by `model_id` from a fixed hosted list and runs in the enclave. Do NOT store model weights on Walrus.
- **Real Nautilus, real attestation.** Use the native `sui::nitro_attestation` + the `enclave` Move package. `register_enclave` must verify a genuine AWS Nitro attestation document and pin PCRs; `enclave::verify_signature` must gate `secure_transfer` and provenance receipts. No fake/simulated attestation, no hardcoded "trusted" key that bypasses attestation. If the real attestation can't be produced yet (no running enclave), STOP at that step and mark it a manual runbook checkpoint — do not stub it as if real.
- **Nitro reality:** Nitro Enclaves have **no GPU**, no direct internet (only `vsock` to the parent), no persistent disk. ⇒ inference is **CPU-only, small models** (default `SmolLM2-135M-Instruct` GGUF; optionally add `Qwen2.5-0.5B/1.5B`). The enclave reaches Walrus/Seal/Sui **only through a vsock proxy on the parent**. Bundle model weights into the enclave image (reproducible build ⇒ stable PCRs).
- **Secrets:** read keys from `.env.local` (`PRIV_KEY`, optional `ENOKI_API_KEY`). Never commit/print/log secrets. Confirm `.env*` and enclave/key material are gitignored.

### ERC-7857 semantics to implement in Move (mirror 0G, adapt to Sui objects)
- `mint(model_id, name, walrus_blob_id, data_hash, sealed_key_ref)` → owned `AgentNFT`.
- `update(nft, new_blob_id, new_hash, new_sealed_key)` — owner evolves memory; bump `version`.
- `authorize_usage(nft, executor, expiry)` — grant a **usage capability** (or extend the Seal/enclave policy) so a renter can RUN the agent without receiving the object or plaintext. Revocable.
- `transfer` (strict ERC-7857): `secure_transfer(nft, to, new_blob_id, new_hash, new_sealed_key, attestation_or_sig)` — only flips ownership **after** `enclave::verify_signature` confirms the enclave re-encrypted the brain to `to` and recomputed `data_hash`. Also keep a Seal-native `claim_ownership` path for the fast Layer-1 case.
- `clone(nft, to, sealed_key, proof)` — enclave re-keys the brain into a NEW `AgentNFT` for `to`, original retained.
- **Marketplace**: Kiosk + TransferPolicy + `royalty_rule`; list at a price, buy (royalty auto-paid), then finalize via either Seal-native claim or strict `secure_transfer`.

### The TEE oracle (Nautilus app `walnut`, based on `seal-example`) — structure & behavior
Create the app `walnut` by copying `seal-example`'s structure and replacing its logic:
- `move/enclave/` — stock Nautilus enclave package (config, PCRs, pubkey registration, `enclave::verify_signature`). **Unmodified.**
- `move/walnut/sources/` — `seal_policy.move` (Seal access policy: release the config-brain key to the **owner** or an **authorized executor enclave**, mirroring `seal-example`'s `seal_policy.move`) + `walnut.move` (the `AgentNFT` app: module `walnut`, OTW `WALNUT`, ERC-7857 fns, consuming `enclave::verify_signature` for `secure_transfer`/`clone`/receipts).
- `src/nautilus-server/src/apps/walnut/` — mirror seal-example's files:
  - `endpoints.rs` — the Seal key-load handshake (`init_seal_key_load` / `complete_seal_key_load`) so the enclave can fetch + hold the decryption key inside the TEE.
  - `mod.rs` — the customizable **`process_data`** (template keeps `health_check` + `get_attestation` unmodified), reusing seal-example's `IntentScope` + `to_signed_response` enclave-signing. `process_data` multiplexes by payload `op`:
    1. `op:"chat"` — verify the caller's TEE token + re-check on-chain that `owner` holds `nftId`; **decrypt the config brain in-enclave** (via the loaded Seal key); run the `model_id` small model (CPU, baked into the image); return the reply as a **signed `IntentMessage`**.
    2. `op:"reencrypt"` — decrypt → fresh key → re-encrypt → re-seal to the new owner → recompute `data_hash` → return a signed payload for `secure_transfer`.
  - `types.rs`, `seal_config.yaml`, `allowed_endpoints.yaml` — pin the Sui testnet fullnode, the Walrus aggregator/upload-relay, and both Mysten Seal testnet key servers (the enclave reaches them only via the parent's HTTP forwarding; updating this file requires re-running `configure_enclave.sh`).
Provisioning/build/register use the template scripts exactly: `configure_enclave.sh walnut` → (on EC2) `make ENCLAVE_APP=walnut && make run` → `sh expose_enclave.sh` → `update_pcrs` + `register_enclave.sh` (see `SETUP_NAUTILUS.md`).
The **parent EC2** also runs Walnut's public **gateway** (`/v1/auth/challenge`, `/v1/auth/verify` wallet-sig→bearer token, `/v1/agents/{nftId}/chat`) which forwards to the enclave's `process_data`.

### "Talk to your NFT" UX (must implement)
- Challenge → wallet-sign → TEE bearer token → `POST /v1/agents/{nftId}/chat`. Same flow powers the web chat box.
- Each NFT page shows a **ready-to-paste curl/API snippet**.
- `authorize_usage` issues a renter token (time-boxed, revocable) → rental without transfer.

### Phases (each phase: build → verify what's verifiable → summarize → next)
- **Phase 0 — Nautilus scaffold.** The `nautilus` repo is already cloned at `~/Developer/nautilus`; `SETUP_NAUTILUS.md` documents the official AWS flow (keep it in sync). Scaffold the `walnut` app by **copying `seal-example`** → `src/nautilus-server/src/apps/walnut/{mod.rs,endpoints.rs,types.rs,seal_config.yaml,allowed_endpoints.yaml}`, and **copying `move/seal-policy`** → `move/walnut/` (`seal_policy.move` + `walnut.move`). Wire it into the server's app registry like the other apps. Every AWS step is a **manual checkpoint** for the user.
- **Phase 1 — Move contracts.** `AgentNFT` (config-brain fields) + `seal_approve(owner-gated)` + `update` + `authorize_usage` + `clone` + `secure_transfer` (real `enclave::verify_signature`) + the `enclave` registry (real `sui::nitro_attestation`) + Kiosk/TransferPolicy/royalty. Compile + unit-test + deploy to testnet; write IDs to `walnut.config.json`.
- **Phase 2 — Enclave app + gateway.** Starting from the copied `seal-example`: keep the Seal key-load handshake (`endpoints.rs`) + `IntentMessage`/`to_signed_response` signing; implement Walnut's `process_data` (`op:chat` + `op:reencrypt`) in `apps/walnut/mod.rs`; set `allowed_endpoints.yaml` (Sui fullnode + Walrus + Seal key servers); bake the small model into the image (reproducible build → stable PCRs). Build/run/register via the template scripts (`configure_enclave.sh walnut`, `make ENCLAVE_APP=walnut && make run`, `expose_enclave.sh`, `update_pcrs`, `register_enclave.sh`). Build the parent **gateway** (token auth → forwards to `process_data`). Live verification of `process_data`/attestation = **manual on the user's Nitro box**.
- **Phase 3 — Off-chain glue.** Walrus config-brain encrypt/upload on mint; Seal sealing to the NFT identity; the Seal-Nautilus authorized-executor wiring so the enclave can fetch keys for an owner-proven request.
- **Phase 4 — UI (Next.js + dapp-kit).** (1) **Mint**: pick a hosted model + write a system prompt/persona → encrypt → Walrus → Seal → mint (zkLogin/Enoki optional). (2) **Use**: per-agent chat box + copy-paste curl/API panel. (3) **Marketplace**: grid of listed agents with prices, list/sell, buy (royalty enforced) → access follows the new owner.

### Each iteration: verify, don't assume
- App **builds** (`next build`) and Move **compiles/deploys**.
- The verifiable end-to-end (no real TEE needed): mint a config-brain agent → owner-gated Seal decrypt works → non-owner denied → Kiosk sale flips access. Keep this as a repeatable script.
- TEE-dependent paths (`/chat`, real attestation, `secure_transfer` with a real proof): exercised against the **user's running enclave**; until then, clearly labeled as pending manual verification — never faked.
- Summarize what changed, what's verified on-chain/off-chain, and what's pending the AWS box.

### Definition of Done (stop when ALL true)
- [ ] Contracts deployed: ERC-7857 entry fns + real `enclave`-attestation registry + Kiosk/royalty; IDs in `walnut.config.json`.
- [ ] Mint stores the **encrypted config brain** on Walrus + `data_hash` + Seal-sealed key; **no weights on Walrus, nothing model-related persisted in the repo**.
- [ ] Owner-gated Seal decrypt verified; non-owner denied (devInspect proof + Seal denial).
- [ ] Real Nautilus enclave deployed by the user; **`register_enclave` verified a genuine attestation on-chain**; `/v1/agents/{id}/chat` returns an enclave-signed reply for the owner and refuses non-owners; **`authorize_usage` lets a renter chat without transfer**.
- [ ] Kiosk marketplace: list at price → buy (royalty enforced) → new owner can chat, old owner cannot; strict `secure_transfer` verifies a real enclave proof.
- [ ] `clone` produces a re-keyed agent for a new owner.
- [ ] `README.md` updated to the v2 architecture with an honest on-chain/off-chain + real-vs-pending table; `SETUP_NAUTILUS.md` runbook complete. No secrets committed.

### Guardrails
Testnet only · never fake the attestation or bypass `enclave::verify_signature` · keep on-chain/off-chain split exactly as specified · config brain only (no weights on Walrus) · small in-enclave CPU models (Nitro has no GPU) · verify SDK/Move signatures against installed versions · if blocked on AWS/credentials, STOP and state exactly what's needed.
