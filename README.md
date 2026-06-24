# # 🌰 Walnut — the Intelligent NFT for Sui
### *Own the brain, not just the picture.*

> AI agents are becoming **valuable, private, evolving assets** — a tuned system prompt, a persona, months of memory, sometimes the weights themselves. But you can't *own* that today. A normal NFT points at **public** JSON; the moment you make the agent tradeable you either **expose its intelligence** to everyone or hand it to a **custodian**. **Walnut is an Intelligent NFT (INFT): the agent's private brain is encrypted on Walrus, sealed to whoever owns the token, re-encrypted to the new owner by a Nautilus TEE on every transfer, and run with on-chain provenance — so you can own, sell, license, and *evolve* a real agent, not a pointer to a JPEG.**

**Sui Overflow** · built end-to-end on the **Sui stack** — **Walrus** · **Seal** · **Nautilus** · **Sui Move / Kiosk** · **zkLogin** · **native USDC**

*(**Walnut** = a hard **shell** (Seal encryption) around a valuable **kernel** (the agent's intelligence), stored on **Walrus**.)*

---

## 1. The Problem

An AI agent's value lives in things you **cannot put on-chain in the clear**: its system prompt, its persona, its accumulated memory, its fine-tuned weights. Today you get to pick exactly one bad option:

- **Public NFT** — mint the agent as an ordinary NFT and its "metadata" (the brain) is **readable by anyone** with the link. You've sold a copy to the whole world the instant you list it.
- **Custodial** — keep the brain on a company server and sell a *receipt*. Now a platform can read it, clone it, censor it, or vanish. You don't own anything you can hold.
- **Pointer rot** — even "real" NFT metadata is just a mutable URL. You own a token that points at JSON someone else can change or take down. **You own the pointer, not the data.**

There is **no way to truly own a private, transferable, evolving agent.** ERC-7857 named this problem on Ethereum. **Walnut answers it natively on Sui** — where the storage layer (Walrus), the encryption/access layer (Seal), and the verifiable-compute layer (Nautilus) already exist as first-class, mainnet-live infrastructure.

---

## 2. What is an INFT?

> An **Intelligent NFT** is an NFT where the *metadata is an actual AI agent* — model reference, system prompt, persona, memory — and that intelligence is **encrypted, owned, and transferable**, not public.

ERC-7857 ("AI Agents NFT with Private Metadata", a **Draft** Ethereum ERC) defines the semantics:

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

> **Walnut is the Intelligent NFT for Sui — pick a hosted model, give it a private system prompt + persona, and mint it as an agent you truly own. The brain is encrypted on Walrus and sealed by Seal to the token holder; you *talk to your NFT* through an owner-gated AWS Nitro (Nautilus) TEE that decrypts and runs it without ever leaking the prompt; and you can list, sell, and re-own agents on a Kiosk marketplace with enforced royalties — re-encrypted to the buyer by the TEE on transfer.**

---

<sub>Built on the Sui stack: Walrus · Seal · Nautilus · Sui Move (Kiosk) · zkLogin · native USDC. Walnut adapts the *semantics* of ERC-7857 (a Draft Ethereum ERC) into a new Move INFT interface — it does not port the Solidity, and no canonical Sui INFT standard exists yet.</sub>

---

## 16. Final outcome (v2) — what Walnut is

Walnut is an **ERC-7857-style Intelligent NFT on Sui** — fully Sui-native, no EVM dependencies. An agent's **private brain = its config** (system prompt + persona + memory), encrypted on **Walrus** and **Seal**-sealed to the token owner. The **model is hosted and runs inside a real AWS Nitro Enclave (Nautilus)**, so the prompt is decrypted and executed in a TEE and never leaks. Agents are **minted, used, and traded** by anyone.

### What a user can do
1. **Mint** — pick a hosted model from a dropdown, write a system prompt/persona, and mint. The app encrypts the config → Walrus → seals the key (Seal) → `mint`s the `AgentNFT`. (zkLogin/Enoki optional for wallet-less onboarding.)
2. **Use (talk to your NFT)** — chat with your agent in the web UI, *or* hit its API directly. Every NFT is an addressable agent endpoint.
3. **Trade** — list an agent at a price on the **Kiosk marketplace**; buying transfers ownership (royalty auto-paid) and access follows the new owner.

### "Talk to your NFT" — the mechanism
Each NFT exposes an owner-gated API. Prove ownership once (wallet signs a challenge → short-lived token), then chat:
```bash
# one-time: prove ownership → TEE-issued bearer token
curl -X POST $TEE/v1/auth/challenge -d '{"nftId":"0xAGENT","address":"0xYOU"}'   # → nonce
# sign nonce with your Sui wallet →
curl -X POST $TEE/v1/auth/verify    -d '{"nftId":"0xAGENT","signature":"..."}'    # → token

# use it (repeatable) — this runs inside the enclave
curl -X POST $TEE/v1/agents/0xAGENT/chat -H "Authorization: Bearer <token>" \
     -d '{"message":"summarize this..."}'   # → enclave-signed reply
```
Inside the enclave: verify the token + re-check on-chain ownership → fetch the Seal key (Seal-Nautilus pattern) → **decrypt the system prompt in-TEE** → run the hosted model → return a reply **signed by the enclave key**. The plaintext prompt never leaves the TEE. `authorize_usage` issues time-boxed **renter tokens** (rent without transfer); the NFT page also shows a copy-paste curl snippet.

### On-chain vs off-chain
| On-chain (Sui) | Off-chain |
|---|---|
| `AgentNFT { owner, creator, model_id, walrus_blob_id, data_hash, sealed_key_ref, version }` | encrypted **config brain** on **Walrus** |
| Move pkg: `mint · update · authorize_usage · secure_transfer(…proof) · clone` | hosted **model weights** (baked into the enclave image) |
| **`enclave` registry** — real `sui::nitro_attestation` + pinned PCRs | **Seal** key servers (owner-gated key release) |
| `enclave::verify_signature` gating transfer/clone/receipts | the **Nitro Enclave** (decrypt + infer + re-encrypt; signs outputs) |
| **Kiosk + TransferPolicy** + royalty + listings | gateway on the parent EC2 (REST + token auth); plaintext prompt (TEE-only) |

### Real Nautilus (no simulation)
Built as a Nautilus app from the `seal-example` template: `move/enclave` (stock) + `move/walnut` (`seal_policy.move` + `walnut.move`) + `src/nautilus-server/src/apps/walnut` (`process_data` with `op:chat`/`op:reencrypt`, the Seal key-load handshake, `IntentMessage` signing). The enclave is built reproducibly (stable PCRs), registered on-chain via a **genuine attestation** (`update_pcrs` + `register_enclave`), and only outputs from that exact attested build are accepted on-chain. On transfer/clone, the TEE re-encrypts the brain to the new owner and `secure_transfer` verifies the attestation before ownership flips (strict ERC-7857).

### Status
- ✅ **Live & verified on testnet (foundations):** Move `AgentNFT` + `seal_approve` ownership gate, Walrus encrypt/store, Seal owner-gated decrypt (+ non-owner denial), Kiosk sale with enforced royalty where access follows ownership.
- 🔧 **Being built (v2):** config-brain refactor, the real Nautilus `walnut` enclave app (from `seal-example`), the gateway + talk-to-your-NFT flow, `authorize_usage`/`clone`, and the mint/chat/marketplace UI. Build plan in **`PROMPT.md`**.
- 🧰 **Your setup (AWS, manual):** provision the Nitro instance, build the EIF, register the real attestation — runbook in **`SETUP_NAUTILUS.md`**.

### Honest limits
- **Nitro Enclaves have no GPU** ⇒ in-TEE inference is **small CPU models** (SmolLM2-135M-class). Large *private* models would need a TEE-GPU provider (NVIDIA confidential computing), which isn't natively attestable on Sui — documented as an upgrade path.
- Walrus blobs are public — privacy is entirely from encryption + Seal. Storage lifecycle is bounded by paid epochs.
- zkLogin / native USDC are optional add-ons, not core to the MVP.

Secrets (`PRIV_KEY`, keys) live in `.env.local` / gitignored files; `walnut.config.json` holds only public object IDs.
