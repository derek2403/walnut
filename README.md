# # 🌰 Walnut — the Intelligent NFT for Sui
### *Own the brain, not just the picture.*

> AI agents are becoming **valuable, private, evolving assets** — a tuned system prompt, a persona, months of memory, sometimes the weights themselves. But you can't *own* that today. A normal NFT points at **public** JSON; the moment you make the agent tradeable you either **expose its intelligence** to everyone or hand it to a **custodian**. **Walnut is an Intelligent NFT (INFT): the agent's private brain is encrypted on Walrus, sealed to whoever owns the token, re-encrypted to the new owner by a Nautilus TEE on every transfer, and run with on-chain provenance — so you can own, sell, license, and *evolve* a real agent, not a pointer to a JPEG.**

**Sui Overflow** · built end-to-end on the **Sui stack** — **Walrus** · **Seal** · **Nautilus** · **Sui Move / Kiosk** · **zkLogin** · **native USDC**
*Fits the **AI**, **Programmable Storage (Walrus)**, and **Payments** tracks — map these to the live Overflow track names.*

*(**Walnut** = a hard **shell** (Seal encryption) around a valuable **kernel** (the agent's intelligence), stored on **Walrus**.)*

---

## 1. The Problem

An AI agent's value lives in things you **cannot put on-chain in the clear**: its system prompt, its persona, its accumulated memory, its fine-tuned weights. Today you get to pick exactly one bad option:

- **Public NFT** — mint the agent as an ordinary NFT and its "metadata" (the brain) is **readable by anyone** with the link. You've sold a copy to the whole world the instant you list it.
- **Custodial** — keep the brain on a company server and sell a *receipt*. Now a platform can read it, clone it, censor it, or vanish. You don't own anything you can hold.
- **Pointer rot** — even "real" NFT metadata is just a mutable URL. You own a token that points at JSON someone else can change or take down. **You own the pointer, not the data.**

There is **no way to truly own a private, transferable, evolving agent.** ERC-7857 (0G Labs) named this problem on Ethereum. **Walnut answers it natively on Sui** — where the storage layer (Walrus), the encryption/access layer (Seal), and the verifiable-compute layer (Nautilus) already exist as first-class, mainnet-live infrastructure.

---

## 2. What is an INFT?

> An **Intelligent NFT** is an NFT where the *metadata is an actual AI agent* — model reference, system prompt, persona, memory — and that intelligence is **encrypted, owned, and transferable**, not public.

ERC-7857 ("AI Agents NFT with Private Metadata", a **Draft** Ethereum ERC by 0G Labs) defines the semantics:

| Requirement | What it means |
|---|---|
| **Encrypted, private metadata** | on-chain you store only `{ dataHash, sealedKey, encryptedURI }`; the plaintext brain never touches the chain |
| **Verifiable ownership of the *data*** | a commitment to the *actual plaintext*, not just a URL — prove you hold the brain, not a link |
| **Secure transfer via an oracle** | on transfer, a **TEE/ZKP oracle re-encrypts** the brain to the new owner and submits a proof the contract verifies *before* ownership flips |
| **Authorized usage without transfer** | `authorizeUsage` — let someone **run** the agent without giving them the agent or its plaintext |
| **Clone** | duplicate the (re-encrypted) intelligence into a new token while keeping the original |
| **Dynamic metadata** | `update` — the agent **learns and evolves** post-mint |

ERC-7857 is an **EVM** interface. **Walnut does not port the Solidity** — it **reproduces the semantics in Move** using Sui-native primitives. There is no canonical Sui INFT standard yet; **Walnut defines one.**

---

## 3. Why Sui (this is the whole pitch)

The reason Walnut belongs on Sui and not on an EVM is that **every hard part of ERC-7857 is already a shipped Sui primitive**:

- **Walrus** — decentralized, content-addressed blob storage (mainnet since Mar 2025). The encrypted brain lives here; the blob ID is a hash, so integrity is verifiable by re-derivation. Stores anything from a 2 KB prompt to **13.3 GiB** of weights.
- **Seal** — identity-based **threshold** encryption whose decryption is gated by an **on-chain Move policy** (mainnet; the decentralized 5-of-8 MPC key-server committee went **live June 18, 2026**). This is the magic: **decryption follows token ownership** by re-evaluating chain state at access time.
- **Nautilus** — verifiable TEE compute (AWS Nitro Enclaves) whose attestations are **verified on-chain by native Move** (`sui::nitro_attestation`, mainnet since Jun 2025). This is the ERC-7857 **oracle**: re-encrypt on transfer, and run the agent with provable provenance.
- **Sui object model** — an NFT is a **first-class owned object**, not a row in a ledger contract. **No `approve` / `setApprovalForAll` / allowance** surface — the #1 NFT-drain vector simply doesn't exist. Ownership is *true*.
- **Kiosk + TransferPolicy** — **enforced creator royalties** on every trade, at the protocol level.
- **zkLogin + native Circle USDC** — OAuth onboarding and real money, no bridge.

On Ethereum, ERC-7857 has to *invent* the oracle, the storage, and the access layer. On Sui, Walnut **composes** them.

---

## 4. How It Works (the flow)

```
1. MINT      Creator logs in (zkLogin). The agent becomes a first-class Sui object:
             AgentNFT { id, name, walrus_blob_id, data_hash, sealed_key_ref, version }.
             No ERC-721 ledger, no approvals — only the owner's signed tx can move it.

2. STORE     The agent's brain (prompt + persona + memory, optionally chunked weights) is
             AES-256-GCM encrypted CLIENT-SIDE and written to WALRUS → a content-addressed
             blobId (a hash) + a certified on-chain Blob object. data_hash commits to the
             plaintext, so the stored ciphertext is verifiable by re-derivation.
             ⚠ Walrus blobs are PUBLIC — privacy comes ENTIRELY from the encryption.

3. SEAL      The AES key is threshold-encrypted with SEAL to an identity bound to the NFT.
             A Move `seal_approve` policy releases key shares ONLY IF the caller currently
             OWNS the Walnut object. Ciphertext on Walrus, tiny sealed key on Sui.

4. USE       To run the agent, a NAUTILUS enclave (or the owner) opens a Seal SessionKey,
             passes the ownership policy, reconstructs the key, fetches + decrypts the blob
             INSIDE the TEE, runs inference, and signs the output. Move verifies the enclave
             signature → on-chain PROOF "this came from THIS exact agent" — weights never leak.

5. UPDATE    The agent learns: owner writes a new (deletable) Walrus blob, calls update() to
             set the new blob_id + data_hash and bump version. Access still follows ownership.

6. AUTHORIZE Owner grants a usage capability (or extends the policy to a Sealed-Executor
             enclave) so a renter can RUN the agent — never receiving the object or plaintext.
             Revocable.

7. TRANSFER  Sold via Kiosk → royalty enforced → ownership flips. The NEW owner now passes
             seal_approve automatically; the old owner loses FUTURE decryptions. For the strict
             ERC-7857 guarantee, a NAUTILUS enclave (the oracle) re-encrypts the brain to the
             new owner and emits an attestation Move verifies BEFORE finalizing the transfer.
```

---

## 5. The Sui Stack (what each piece actually does)

| Layer | Sui primitive | Role in Walnut | Real surface |
|---|---|---|---|
| **Storage** | **Walrus** | holds the encrypted brain (prompt, memory, weights) | `client.walrus.writeBlob({ blob, epochs, signer })` → `blobId` · `readBlob({ blobId })` · `PUT/GET /v1/blobs` · Quilt for many small memory files |
| **Encryption / access** | **Seal** | gates decryption to the **current token owner** | `SealClient.encrypt({ threshold, packageId, id, data })` · Move `entry fun seal_approve(id, /* owns this NFT? */)` · `SessionKey.create` · `client.decrypt` |
| **Oracle / compute** | **Nautilus** | re-encrypt on transfer · run the agent verifiably | `register_enclave<T>(config, attestation_doc)` (once) → `enclave::verify_signature` (per call) · native `sui::nitro_attestation::load_nitro_attestation` |
| **Asset** | **Sui Move object** | the INFT itself + evolving memory | `AgentNFT has key, store { id: UID, ... }` · `dynamic_field` / `Table` for growing memory · `transfer::public_transfer` |
| **Rendering** | **Display (V2)** | wallets show the agent card, live version/stats | `display_registry` / `DisplayCap<AgentNFT>` (reads dynamic fields) |
| **Trading** | **Kiosk + TransferPolicy** | enforced creator royalty on every resale | `transfer_policy::new<AgentNFT>` + `royalty_rule` + `kiosk_lock_rule` · `@mysten/kiosk` SDK |
| **Identity** | **zkLogin** | OAuth → Sui address onboarding | `@mysten/enoki` (salt + proving + sponsored gas) — *not* proof-of-personhood (see §10) |
| **Payments** | **native USDC** | buy / license / escrow | `Coin<USDC>` (`0xdba34672…::usdc::USDC`) in a Move shared-object escrow — **not** x402 (see §10) |

---

## 6. ERC-7857 → Sui mapping

Every ERC-7857 requirement, mapped to a concrete Sui solution, tagged by how solid it is today.
**✅ = mainnet-live primitives · 🔵 = buildable integration of live primitives.**

| ERC-7857 requirement | Walnut on Sui | Status |
|---|---|---|
| Encrypted metadata on-chain = `{dataHash, sealedKey, encryptedURI}` | AES-256-GCM ciphertext on **Walrus**; object stores `walrus_blob_id` + `data_hash` + Seal `sealed_key_ref` | ✅ |
| Verifiable ownership of the **data**, not a pointer | Walrus blobId is a content hash (re-hashed on read) + on-chain `data_hash`; optional **Nautilus** attestation of plaintext knowledge | 🔵 |
| Secure transfer w/ oracle re-encryption + verified proof | **(A)** Seal access follows ownership — new owner decrypts, no re-encryption. **(B)** strict: **Nautilus** TEE re-encrypts + `enclave::verify_signature` before ownership flips | 🔵 |
| Sealed key to recipient | Seal IBE seals the key to an identity gated by **ownership** of the NFT (= the recipient, post-transfer) | 🔵 |
| `authorizeUsage` / delegate without transfer | a Move **capability object** or a `seal_approve` allowlist → a **Sealed-Executor** Nautilus enclave runs inference; user never sees the object or plaintext | 🔵 |
| `clone` | a Move `clone()` mints a new `AgentNFT`, re-keys the blob under a new identity/policy | 🔵 |
| Dynamic / updatable metadata | owner-only `update()` → new Walrus blob + `data_hash`, bump `version`; live memory in **dynamic fields**; **Display V2** renders it | ✅ |
| Oracle types `{TEE, ZKP}` | **TEE via Nautilus**, attestation verified on-chain by native `sui::nitro_attestation` (no production ZKP-oracle path on Sui) | 🔵 |
| Standalone, chain-agnostic interface (not ERC-721) | a fresh **Move INFT module**, `key + store`, zero approval surface | ✅ |
| *(implied)* enforced creator royalties | **Kiosk + TransferPolicy** (`royalty_rule` + `kiosk_lock_rule`) | ✅ |

---

## 7. The heart: secure transfer (Seal + Nautilus)

INFTs live or die on one question — **when you sell the agent, does the buyer get the brain and does the seller lose it?** Walnut answers in two layers:

**Layer 1 — Seal makes access *follow ownership* (the elegant part).**
The brain's key is sealed to an identity bound to the NFT, and the `seal_approve` Move policy is simply *"does the caller own this object right now?"* Seal's key servers re-evaluate **live chain state** at decryption time. So a plain object transfer means **the new owner can decrypt and the old owner can't** — **with no re-encryption and no re-upload of the (possibly multi-GB) blob.** This is *cleaner* than ERC-7857's mandatory per-transfer oracle dance.

**Layer 2 — Nautilus is the ERC-7857 oracle (the rigorous part).**
Layer 1 alone has a subtlety: Seal revokes only *future* decryptions — a previous owner who already decrypted the brain keeps that copy. For the strict ERC-7857 guarantee (**prior owner can never read post-transfer state, + a proof of correct re-key**), Walnut routes the transfer through a **Nautilus enclave**: it decrypts inside the TEE, generates a **fresh** key, re-encrypts the blob, re-seals to the new owner, recomputes `data_hash`, and emits an **ed25519 attestation** that the Move contract verifies (`enclave::verify_signature`, against PCRs registered once via `register_enclave`) **before** finalizing ownership.

> **Two modes, by choice:** **Seal-native** (instant, cheap, ownership-following) for most agents; **Nautilus re-encryption** (full ERC-7857 integrity + proof) for high-value ones. Same object, a policy toggle.

The same Nautilus enclave also gives **verifiable execution**: run the agent inside the TEE, sign the output, and the chain can prove *"this output came from this exact, unmodified agent build"* — without ever revealing the weights or prompt.

---

## 8. Architecture

```
  Creator ── zkLogin (OAuth → Sui addr) ──▶ MINT AgentNFT (Move object, no approvals)
                                                   │
   brain {prompt · persona · memory · weights}     │
        │ AES-256-GCM encrypt (client-side)        ▼
        ▼                              ┌── WALRUS ──┐  content-addressed blobId + data_hash
  ciphertext blob ────────────────────▶│  (public) │  (encryption = the only privacy)
                                        └─────┬─────┘
        AES key                               │
        │ SEAL threshold-encrypt              │ on-chain: walrus_blob_id, data_hash,
        ▼  to identity bound to the NFT       │           sealed_key_ref, version
  ┌── SEAL key servers (t-of-n, 5/8 MPC) ──┐  │
  │  release key share IFF seal_approve:   │  ▼
  │  "caller OWNS this Walnut object" ─────┼─▶ SUI AgentNFT  (dynamic fields = live memory)
  └────────────────────────────────────────┘  │
                                               ▼
  USE / RUN ──▶ NAUTILUS enclave: fetch key (attested) → decrypt INSIDE TEE → infer →
               sign output → Move enclave::verify_signature → on-chain provenance
                                               │
  TRANSFER ──▶ Kiosk (royalty enforced) ──▶ ownership flips ──▶ Seal access follows owner
            └▶ (strict) NAUTILUS re-encrypts to new owner + attests ──▶ Move verifies ──▶ flip
                                               │
  PAY ──▶ native Coin<USDC> Move transfer / shared-object escrow (settle / slash)
```

---

## 9. Data model (Move sketch)

> Illustrative — not yet a deployed package. Verify framework signatures (Display V2, Kiosk) against the current `sui-framework` before building.

```move
public struct AgentNFT has key, store {
    id: UID,
    name: String,
    walrus_blob_id: String,   // the encrypted brain on Walrus (the "encryptedURI")
    data_hash: vector<u8>,    // commitment to the PLAINTEXT (verifiable ownership of data)
    sealed_key_ref: vector<u8>, // Seal-encrypted AES key reference
    version: u64,             // bumped on every update() — the agent evolves
    // live, growing memory attached as dynamic fields (gas only when touched):
    //   dynamic_field::add(&mut self.id, b"memory", slice)
}

/// Seal policy: release the decryption key ONLY to the current owner of this NFT.
entry fun seal_approve(id: vector<u8>, nft: &AgentNFT, ctx: &TxContext) {
    assert!(is_owner(nft, tx_context::sender(ctx)), ENotOwner);
    // (Seal key servers dry-run this against latest chain state at fetch_key time)
}

/// Owner-only: the agent learns. New encrypted blob → new hash → bump version.
entry fun update(nft: &mut AgentNFT, new_blob_id: String, new_hash: vector<u8>) { /* ... */ }

/// Strict ERC-7857 transfer: only flips ownership after the Nautilus enclave attests
/// it re-encrypted the brain to `to`.
entry fun secure_transfer(nft: AgentNFT, to: address, enclave: &Enclave<WALNUT>,
                          payload: vector<u8>, sig: vector<u8>, ts: u64) {
    assert!(enclave::verify_signature(enclave, INTENT_REENCRYPT, ts, payload, sig), EBadProof);
    /* update data_hash + sealed_key_ref from payload, then transfer::public_transfer(nft, to) */
}
```

---

## 10. Trust & limits (what Walnut does **not** claim)

We're explicit about the trust model — at a hackathon, honesty *is* the differentiator.

- **Walrus blobs are public.** Privacy comes **entirely** from client-side encryption + Seal. Encryption also doesn't hide blob *size* (pad if sensitive).
- **Seal-native transfer revokes only *future* reads.** A prior owner who already decrypted keeps that plaintext. True ERC-7857 "previous owner can never read again" requires the **Nautilus re-encryption** path (§7, Layer 2).
- **Nautilus is hardware attestation, not zk soundness.** It proves *"this exact code ran unmodified in a real AWS Nitro Enclave"* — you trust AWS's hardware/PKI, not a math proof. And the reference enclave template is **unaudited / "evaluation only."**
- **Secret weights weaken reproducible builds.** If the agent's source must stay private, users can't re-derive the enclave's PCRs — they trust the operator's claimed build. A real tension for private INFTs.
- **zkLogin is *not* proof-of-personhood.** One person can mint unlimited Sui addresses. If Walnut ever needs anti-sybil (e.g. a marketplace of agents), that comes from an **external credential** (World ID recorded as a Sui object) or **economic staking** — not from zkLogin.
- **No x402 on Sui.** x402 isn't on Coinbase CDP's supported-network list; its gasless leg leans on EVM EIP-3009. Walnut uses **direct Move USDC transfers + object-gating** instead.
- **Walrus availability is bounded by paid epochs.** A lapsed/un-renewed blob = a permanently un-decryptable agent. Storage lifecycle must be tied to ownership + auto-renewal.
- **We are not "first agent NFT on Sui."** ConvictionFi, Walrus-Agents, and Talus predate us — but they store agent data **in the clear**. Walnut's claim is **private, ownership-following, transferable intelligence**.

---

## 11. Prior art & what Walnut adds

| Project | What it does | What it's missing |
|---|---|---|
| **ERC-7857 / 0G** | the INFT standard (encrypted metadata + oracle re-encryption) | EVM / 0G-chain only — **not on Sui** |
| **ConvictionFi** (Sui Overflow '25) | mints a DeFAI agent as an NFT, params on Walrus | metadata is **plaintext/public**, no Seal |
| **Walrus-Agents** | agents as NFTs, weights on Walrus | training-focused; **no private transferable brain** |
| **Talus / Nexus** | agents as on-chain Move objects | workflow objects, **not encrypted-metadata INFTs** |
| **Atoma / Nautilus** | TEE inference / verifiable compute | the **compute layer** an INFT calls, not the NFT |

> **Walnut's wedge:** the first **ERC-7857-equivalent INFT on Sui** — a reusable **Move INFT standard** where the agent's **private** intelligence is **Seal-gated on Walrus**, **follows ownership**, can be **re-encrypted by a Nautilus oracle on transfer**, **rented without transfer**, **cloned**, and **evolved**. All the pieces are live; **nobody has wired them into one transferable, private, intelligent asset.**

---

## 12. Demo (≤ 3 min)

1. **Mint** an agent (a tuned "research assistant") → it's a Sui object you own; its brain is encrypted on Walrus, key sealed to the token.
2. **Run it** → output is produced inside a Nautilus enclave and the chain verifies the provenance signature — *the weights never appear*.
3. **Try to read the brain without owning it** → Seal refuses to release the key (show the `seal_approve` denial). Buy the NFT via Kiosk (royalty auto-paid) → **now** decryption succeeds. *Ownership = access.*
4. **Evolve it** → `update()` writes new memory, bumps `version`, the wallet card reflects it live.
5. **Strict transfer** → Nautilus re-encrypts to the new owner and the Move contract verifies the attestation before ownership flips → the seller is cryptographically locked out of future state.

---

## 13. Tech Stack

| Layer | Tool |
|---|---|
| Storage | **Walrus** (`@mysten/walrus`) — encrypted brain + evolving memory (Quilt for small files) |
| Encryption / access control | **Seal** (`@mysten/seal`) — threshold IBE, `seal_approve` ownership policy |
| Verifiable compute / oracle | **Nautilus** (AWS Nitro Enclaves) + native `sui::nitro_attestation` |
| Asset + logic | **Sui Move** — `AgentNFT` object, dynamic fields, capabilities; **Display V2** |
| Trading + royalties | **Kiosk + TransferPolicy** (`@mysten/kiosk`) |
| Identity / onboarding | **zkLogin** + **Enoki** (sponsored gas) |
| Payments | **native Circle USDC** (`Coin<USDC>`) + Move shared-object escrow |
| App | Next.js + `@mysten/sui` + `@mysten/dapp-kit` |

---

## 14. Roadmap

- **MVP (hackathon):** mint → Walrus store → Seal ownership-gating → Kiosk transfer → verifiable inference in a Nautilus enclave. *(Seal-native transfer; one demo agent.)*
- **Strict ERC-7857 transfer** — the full Nautilus re-encryption oracle (decrypt → fresh key → re-encrypt → re-seal → attest → verify) with PCR/freshness checks.
- **`authorizeUsage` / rent-without-transfer** — Sealed-Executor enclave + revocable usage capabilities → an **agent rental market**.
- **`clone`** — sell a copy of an agent's intelligence while keeping the original.
- **Programmable storage lifecycle** — auto-renew Walrus epochs from royalty income so an owned agent never expires.
- **Anti-sybil layer** (if a marketplace lands) — external personhood credential as a Sui object, or staking.
- **Compose with Atoma** for decentralized private inference at scale.

---

## 15. One-liner

> **Walnut is the Intelligent NFT for Sui — an AI agent whose private brain is encrypted on Walrus, sealed by Seal to whoever owns the token, re-encrypted to the new owner by a Nautilus TEE on transfer, and run with on-chain provenance — so for the first time you can truly own, sell, license, and evolve an agent instead of a pointer to public JSON.**

---

<sub>Built on the Sui stack: Walrus · Seal · Nautilus · Sui Move (Kiosk) · zkLogin · native USDC. Walnut adapts the *semantics* of ERC-7857 (a Draft Ethereum ERC by 0G Labs) into a new Move INFT interface — it does not port the Solidity, and no canonical Sui INFT standard exists yet.</sub>

---

## 16. Implementation status (this repo) — what's real vs. simulated

This repo contains a **working testnet MVP**, verified end-to-end against live Sui testnet + Walrus + Seal. The brain is a **real model** (`SmolLM2-135M-Instruct`, Q8_0 GGUF, ~145 MB) that is encrypted and stored **only on Walrus**, sealed to the NFT, and **run with `node-llama-cpp`** — the model literally comes out of the NFT's Walrus blob on every run. No hosted API is used for inference.

**Walrus is the single source of truth for the model — nothing persists on local disk.** The repo contains no model files. Minting streams the base model to an OS temp file, encrypts + uploads it to Walrus, then deletes the temp. Running fetches the encrypted blob from Walrus, decrypts in memory, and (because `node-llama-cpp`/llama.cpp loads a GGUF only by file path) writes it to a unique `os.tmpdir()` temp file that is **deleted in a `finally` block immediately after inference**.

**✅ Real & verified** (each backed by a script under `scripts/`):
- **Move package** `walnut::walnut` deployed to testnet (`AgentNFT`, `mint`, `update`, `seal_approve`, `claim_ownership`, `walnut_transfer`, Display V2). IDs in `walnut.config.json`.
- **Encrypt → Walrus → Seal → mint**: base model sourced transiently (streamed to OS temp, deleted after upload), AES-256-GCM encrypted, `data_hash = sha256(plaintext)`, blob written via the Walrus upload relay, AES key threshold-sealed (2-of-2 Mysten Open key servers).
- **Owner runs the model** from the NFT (`scripts/run-agent.mjs`): Seal releases the key → Walrus `readBlob` → decrypt → verify hash → `node-llama-cpp` generates text.
- **Non-owner denied** by `seal_approve` (incl. an authoritative `devInspect` gate proof).
- **Kiosk sale with enforced 5% royalty** + access-follows-ownership: buyer claims ownership → buyer runs the model → seller is locked out.
- **One-command demo**: `node scripts/demo.mjs` runs mint → run → deny → sell → new-owner run → previous-owner denied.

**⚠️ Simulated / deviations (honest notes):**
- **Nautilus is SIMULATED.** `secure_transfer` verifies an `ed25519` signature from a key registered in `EnclaveRegistry` — it is **not** a real AWS Nitro attestation (no `sui::nitro_attestation`, no PCRs). Clearly labeled in the Move source.
- **Access gate uses a stored `owner` field, not raw object ownership.** The README's "Layer 1" pitch assumed Seal key servers enforce owned-object ownership during policy evaluation. In practice the **testnet key servers evaluate `seal_approve` via `dev_inspect`, which does *not* enforce object ownership** — but it *does* set a trustworthy `ctx.sender()` (proven by the SessionKey). So the policy gates on `nft.owner == ctx.sender()`, kept current by `claim_ownership` / `walnut_transfer` (real txs only the holder can run). Consequence: a plain `public_transfer` that bypasses these leaves the `owner` field stale until the new owner calls `claim_ownership` — which only they can. This matches the README's stated Layer-1 limitation (a prior owner loses *future* reads once the new owner claims; the strict guarantee needs the Nautilus path).
- **`kiosk_lock_rule` omitted** (royalty rule only) so a buyer can take the item to plain ownership and run it simply; enforcing all resales-in-kiosk is a future add.
- **zkLogin / native USDC** are not wired in this MVP (the trading demo uses SUI).

### Run it
```bash
node scripts/check-env.mjs     # verify PRIV_KEY address is funded (SUI + WAL)
node scripts/get-wal.mjs 1     # (if needed) exchange 1 SUI -> WAL for Walrus storage
node scripts/deploy.mjs        # publish package + register simulated enclave -> walnut.config.json
node scripts/setup-policy.mjs  # create TransferPolicy<AgentNFT> + 5% royalty rule
node scripts/mint-model.mjs    # stream model -> encrypt -> Walrus -> mint (no local copy kept)
node scripts/run-agent.mjs "your prompt"   # owner runs the model from the NFT
node scripts/demo.mjs          # full end-to-end story (mint → run → deny → sell → run → deny)
```

### Web app
```bash
npm run dev        # http://localhost:3000
```
A minimal Next.js + `@mysten/dapp-kit` UI: connect wallet, view the demo agent card, **Run the agent** (shows generated text), a **non-owner denial** demo, your owned Walnut NFTs, and the Kiosk/royalty panel. Because `node-llama-cpp` and the Walrus/Seal decrypt must run in Node, the heavy work happens in server API routes (`pages/api/run.js` etc.) — the model literally comes out of the NFT's Walrus blob on each run.

Secrets (`PRIV_KEY`, enclave/buyer keys) live in `.env.local` / `.walnut-*.json` and are gitignored; `walnut.config.json` holds only public object IDs.
