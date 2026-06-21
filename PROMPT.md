# Walnut — Claude Code build loop prompt

Paste the block below into Claude Code as `/loop <prompt>` **after** the Next.js app is scaffolded in this directory.
It is written to be run repeatedly: each iteration makes progress, verifies, and stops only when the Definition of Done is met.

---

## THE PROMPT

You are building **Walnut**, an Intelligent NFT (INFT) on **Sui testnet**, implementing the design in `README.md`. Iterate until the Definition of Done is met. Re-read this prompt, `README.md`, and the current code at the start of every iteration, then do the next most valuable unit of work and verify it.

### Goal (success = the exit condition)
A user who **owns** the Walnut NFT can, from the running Next.js app, have the app:
1. fetch the **encrypted model weights** from **Walrus** (the blob referenced by the NFT),
2. get the AES key released by **Seal** *only because `seal_approve` confirms they own the NFT*,
3. decrypt the weights and **run real local inference** with them, producing text output.
And the negative/transfer paths hold: a **non-owner is denied** the key, and after a **Kiosk** sale the **new owner can run it** while the old owner's fresh session cannot.

### Hard constraints
- **Testnet only.** Sui testnet + Walrus testnet + Seal testnet endpoints. Never mainnet.
- **Real weights, run locally.** The "brain" is an actual small runnable model (default: **SmolLM2-135M-Instruct** GGUF, run server-side in a Next.js route/action via `node-llama-cpp`). If blob size makes the Walrus round-trip painful, fall back to an even smaller GGUF and **log the choice + size**. Do NOT substitute a hosted API for the core run path — the model must literally come out of the NFT's blob. (`OPENAI_API_KEY` exists but is NOT used for inference; only optionally to author a demo persona/system prompt.)
- **Nautilus is simulated.** No real AWS Nitro Enclave. Implement the `secure_transfer` / attestation shape so it's swappable later, but clearly label it `// SIMULATED — not a real TEE attestation`. Do not claim it is real.
- **Secrets:** read `PRIV_KEY` and any keys from `.env` (or `.env.local`). **Never** commit, print, or log them. Confirm `.env*` is gitignored.
- **Don't trust illustrative snippets.** The Move sketch and SDK calls in `README.md` are illustrative. Verify every framework signature (Sui Move stdlib, **Display V2**, **Kiosk + TransferPolicy**, `@mysten/seal`, `@mysten/walrus`, `@mysten/kiosk`, `@mysten/sui`) against the **actually installed versions** before relying on them. These APIs change often.

### Architecture to implement (map to concrete SDKs)
1. **Move package** (`AgentNFT`): fields `id, name, creator, walrus_blob_id: String, data_hash: vector<u8>, sealed_key_ref: vector<u8>, model_meta (name+format), version: u64`. Functions: `mint`, owner-only `update` (new blob_id + data_hash, bump version), `seal_approve(id, nft, ctx)` asserting the caller owns the NFT, and a **Display V2** setup so wallets render the agent card. Add **Kiosk + TransferPolicy** with a `royalty_rule` (+ `kiosk_lock_rule`). Include a `secure_transfer` entry that verifies a (simulated) enclave signature before flipping ownership — gated behind the simulated label.
2. **Deploy script** (Node, uses `PRIV_KEY`): publish the package, create the `TransferPolicy` + caps, write the resulting object/package IDs to a config the app reads. Include a **faucet/balance check** for SUI gas and **WAL** for Walrus storage, with instructions if underfunded.
3. **Mint flow** (app): take the chosen GGUF → **AES-256-GCM encrypt client/server-side** → `data_hash = sha256(plaintext)` → **Walrus `writeBlob`** → get `blobId` → **Seal encrypt** the AES key to an identity bound to the NFT → `mint` the `AgentNFT` storing `blobId`, `data_hash`, `sealed_key_ref`.
4. **Use/run flow** (app) — **the success path**: owner opens a Seal `SessionKey` → `seal_approve` passes → reconstruct AES key → Walrus `readBlob` → decrypt → load weights with `node-llama-cpp` → generate → render output in the UI. Verify `data_hash` matches.
5. **Trading flow**: place/list the NFT in a **Kiosk**, buy it (royalty auto-paid), confirm the **new owner** now passes `seal_approve` and can run the model, and the **previous owner's new session is denied**.

### UI
A minimal but real Next.js (App Router, TS) UI with `@mysten/dapp-kit`: connect wallet, Mint, "Run agent" (shows generated text), a denial demo, and a Kiosk list/buy panel. Functional over fancy.

### Each iteration: verify, don't assume
- App **builds** (`next build` / typecheck clean) and runs.
- Move package **compiles and deploys** to testnet (or the last deploy is still valid).
- A **scripted end-to-end run** prints real model output from weights pulled out of Walrus (this is the money shot — keep it as a repeatable script/test).
- The **denial path** (non-owner) fails closed, and the **post-Kiosk-sale** path lets the new owner run it.
- Summarize what changed, what's verified, and what's left.

### Definition of Done (stop the loop when ALL are true)
- [ ] Move package deployed to testnet; IDs wired into the app config.
- [ ] Mint stores real encrypted weights on Walrus + `data_hash` + Seal-sealed key on the NFT.
- [ ] **Owner runs the model from the NFT and sees real generated text** (core success).
- [ ] Non-owner is denied the key by `seal_approve`.
- [ ] NFT sells via Kiosk with enforced royalty; new owner can run it, old owner's fresh session cannot.
- [ ] `README`/notes clearly mark what is real vs. simulated (Nautilus). No secrets committed.
- [ ] A one-command repeatable demo script reproduces the end-to-end run.

### Guardrails
Testnet only · never commit/print secrets · verify SDK + Move signatures against installed versions before use · keep the simulated-TEE boundary explicit and swappable · prefer a smaller model over a broken Walrus round-trip · if blocked on a credential or funding, stop and say exactly what's needed.
