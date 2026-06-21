# Walnut — Claude Code build loop prompt (Walrus-only storage)

Paste the block below into Claude Code as `/loop <prompt>` **after** the Next.js app is scaffolded in this directory.
It is written to be run repeatedly: each iteration makes progress, verifies, and stops only when the Definition of Done is met.

**This revision: store EVERYTHING on Walrus. The model never lives in the repo or in any persistent local store.**

---

## THE PROMPT

You are building **Walnut**, an Intelligent NFT (INFT) on **Sui testnet**, implementing the design in `README.md`. Iterate until the Definition of Done is met. Re-read this prompt, `README.md`, and the current code at the start of every iteration, then do the next most valuable unit of work and verify it.

### Goal (success = the exit condition)
A user who **owns** the Walnut NFT can, from the running Next.js app, have the app:
1. fetch the **encrypted model weights** from **Walrus** (the blob referenced by the NFT) — Walrus is the ONLY place the model is stored,
2. get the AES key released by **Seal** *only because `seal_approve` confirms they own the NFT*,
3. decrypt the weights and **run real inference** with them, producing text output.
And the negative/transfer paths hold: a **non-owner is denied** the key, and after a **Kiosk** sale the **new owner can run it** while the old owner's fresh session cannot.

### Hard constraints
- **Testnet only.** Sui testnet + Walrus testnet + Seal testnet endpoints. Never mainnet.
- **Walrus is the single source of truth for the model. Nothing persists on local disk.**
  - The "brain" is an actual small runnable model (default: **SmolLM2-135M-Instruct** GGUF). It is AES-256-GCM encrypted and stored **only on Walrus**.
  - **The repo MUST NOT contain any model files**, and there is **no persistent local model cache** (no committed/gitignored `models/` copy that the app depends on as a source of truth).
  - **Minting** sources the base model **transiently**: stream it (e.g. from Hugging Face) to an **OS temp file** (`os.tmpdir()`), encrypt, upload to Walrus, then **delete the temp file**.
  - **Running** must fetch the encrypted blob from Walrus every time, decrypt it in memory, and — because `node-llama-cpp`/llama.cpp can only load a GGUF **by file path** (there is no in-memory load API) — write the decrypted bytes to a **unique ephemeral file in `os.tmpdir()`**, load it, generate, and **delete that temp file in a `finally` block** immediately after the run. The decrypted brain is **never** persisted in the repo or a managed local directory.
  - Do NOT substitute a hosted API for the core run path — the model must literally come out of the NFT's Walrus blob on every run. (`OPENAI_API_KEY` exists but is NOT used for inference; only optionally to author a demo persona/system prompt.)
  - If blob size makes the Walrus round-trip painful, fall back to an even smaller GGUF and **log the choice + size** — but it still lives only on Walrus.
- **Nautilus is simulated.** No real AWS Nitro Enclave. Implement the `secure_transfer` / attestation shape so it's swappable later, but clearly label it `// SIMULATED — not a real TEE attestation`. Do not claim it is real.
- **Secrets:** read `PRIV_KEY` and any keys from `.env` (or `.env.local`). **Never** commit, print, or log them. Confirm `.env*` is gitignored.
- **Don't trust illustrative snippets.** The Move sketch and SDK calls in `README.md` are illustrative. Verify every framework signature (Sui Move stdlib, **Display V2**, **Kiosk + TransferPolicy**, `@mysten/seal`, `@mysten/walrus`, `@mysten/kiosk`, `@mysten/sui`) against the **actually installed versions** before relying on them. These APIs change often.
- **Read the official docs for the latest, correct implementation.** Before writing or fixing any Sui-, Walrus-, Seal-, or Kiosk-related code, **fetch and consult the live documentation** (use the WebFetch/WebSearch tools) rather than relying on memory or the README snippets:
  - **Sui (Move, SDK, Kiosk, TransferPolicy, Display, zkLogin, deploy/CLI):** https://docs.sui.io/
  - **Walrus (blob storage, `writeBlob`/`readBlob`, upload relay, Quilt, epochs, WAL funding, HTTP API, testnet endpoints):** https://docs.wal.app/
  Walrus's docs site (`docs.wal.app`) also links the **Seal** docs and SDK usage — follow those for `SealClient`, `seal_approve` policy patterns, `SessionKey`, and threshold/key-server config. Treat these docs as the source of truth; when an installed SDK version disagrees with the docs, prefer the installed version's actual types and note the discrepancy. Re-check the relevant doc page whenever an API call fails or behaves unexpectedly.

### Architecture to implement (map to concrete SDKs)
1. **Move package** (`AgentNFT`): fields `id, name, creator, owner, nonce, walrus_blob_id: String, data_hash: vector<u8>, sealed_key_ref: vector<u8>, model_name, model_format, version: u64`. Functions: `mint`, owner-only `update` (new blob_id + data_hash, bump version), `claim_ownership`/`walnut_transfer` to keep `owner` current, `seal_approve(id, nft, ctx)` asserting `nft.owner == ctx.sender()`, and a **Display V2** setup so wallets render the agent card. Add **Kiosk + TransferPolicy** with a `royalty_rule`. Include a `secure_transfer` entry that verifies a (simulated) enclave signature before flipping ownership — gated behind the simulated label.
2. **Deploy script** (Node, uses `PRIV_KEY`): publish the package, create the `TransferPolicy` + caps, write the resulting object/package IDs to a config the app reads. Include a **faucet/balance check** for SUI gas and **WAL** for Walrus storage, with instructions if underfunded.
3. **Mint flow**: stream the base GGUF to an OS **temp** file → **AES-256-GCM encrypt** → `data_hash = sha256(plaintext)` → **Walrus `writeBlob`** (via the upload relay for large blobs) → get `blobId` → **Seal encrypt** the AES key to an identity bound to the NFT → `mint` the `AgentNFT` storing `blobId`, `data_hash`, `sealed_key_ref` → **delete the temp file**.
4. **Use/run flow** — **the success path**: owner opens a Seal `SessionKey` → `seal_approve` passes → reconstruct AES key → Walrus `readBlob` → decrypt in memory → verify `data_hash` → write to a **unique `os.tmpdir()` temp file** → load with `node-llama-cpp` → generate → render output → **`unlink` the temp file in `finally`**. No persistent local copy.
5. **Trading flow**: place/list the NFT in a **Kiosk**, buy it (royalty auto-paid), buyer calls `claim_ownership`, confirm the **new owner** now passes `seal_approve` and can run the model, and the **previous owner's new session is denied**.

### UI
A minimal but real Next.js (TS) UI with `@mysten/dapp-kit`: connect wallet, view the agent card, **Run agent** (shows generated text), a denial demo, your owned Walnut NFTs, and a Kiosk/royalty panel. Because `node-llama-cpp` and the Walrus/Seal decrypt run in Node, the heavy work happens in server API routes that pull the model from Walrus and use only an ephemeral temp file (deleted after each run). Functional over fancy.

### Each iteration: verify, don't assume
- App **builds** (`next build` / typecheck clean) and runs.
- Move package **compiles and deploys** to testnet (or the last deploy is still valid).
- A **scripted end-to-end run** prints real model output from weights pulled out of **Walrus** (the money shot) — and leaves **no model file behind** (assert the repo has no model files and the temp file was deleted).
- The **denial path** (non-owner) fails closed, and the **post-Kiosk-sale** path lets the new owner run it.
- Summarize what changed, what's verified, and what's left.

### Definition of Done (stop the loop when ALL are true)
- [ ] Move package deployed to testnet; IDs wired into the app config.
- [ ] Mint stores real encrypted weights **only on Walrus** + `data_hash` + Seal-sealed key on the NFT; the base model is sourced transiently and the temp file is deleted.
- [ ] **Owner runs the model from the NFT and sees real generated text** (core success), with the model fetched from Walrus each run.
- [ ] **No persistent local model storage:** the repo contains no model files, and the decrypted brain exists only in an `os.tmpdir()` temp file that is deleted immediately after each run.
- [ ] Non-owner is denied the key by `seal_approve`.
- [ ] NFT sells via Kiosk with enforced royalty; new owner can run it, old owner's fresh session cannot.
- [ ] `README`/notes clearly mark what is real vs. simulated (Nautilus) and state the Walrus-only storage model. No secrets committed.
- [ ] A one-command repeatable demo script reproduces the end-to-end run.

### Guardrails
Testnet only · never commit/print secrets · **never persist the model or decrypted brain to the repo or a managed local dir — Walrus only, ephemeral OS temp deleted in `finally`** · verify SDK + Move signatures against installed versions before use · keep the simulated-TEE boundary explicit and swappable · prefer a smaller model over a broken Walrus round-trip · if blocked on a credential or funding, stop and say exactly what's needed.
