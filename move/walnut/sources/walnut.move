// Walnut — an Intelligent NFT (INFT) for Sui.
//
// The agent's "brain" (a real model: weights + prompt) is AES-256-GCM encrypted
// client-side, stored on Walrus, and its AES key is threshold-encrypted with Seal
// to an identity bound to THIS NFT. Decryption follows ownership: only the current
// owner can pass `&AgentNFT` into `seal_approve`, so only they can fetch the key.
//
// Seal access control: the testnet Seal key servers evaluate `seal_approve` via
// dev_inspect, which does NOT enforce owned-object ownership (a non-owner can still
// pass someone else's object as a read-only input). It DOES, however, set `ctx.sender()`
// to the SessionKey-certified caller. So we gate on `nft.owner == ctx.sender()`, where
// `owner` is kept current by `claim_ownership` / `walnut_transfer` (real txs, which the
// MoveVM only lets the actual holder execute). This is the README's "Layer 1" guarantee:
// access follows ownership; a prior owner loses FUTURE reads once the new owner claims.
module walnut::walnut;

use std::string::{Self, String};
use sui::address;
use sui::display;
use sui::ed25519;
use sui::package;

// === Errors ===
const EBadSealId: u64 = 1;
const EBadEnclaveProof: u64 = 2;
const ENotOwner: u64 = 3;

// === One-time witness ===
public struct WALNUT has drop {}

// === The INFT ===
public struct AgentNFT has key, store {
    id: UID,
    name: String,
    creator: address,           // the original minter (part of the Seal identity)
    owner: address,             // current owner; checked by seal_approve (kept current
                                // by claim_ownership / walnut_transfer)
    nonce: vector<u8>,          // random; with `creator` forms a unique Seal key id
    walrus_blob_id: String,     // the encrypted brain on Walrus (the "encryptedURI")
    data_hash: vector<u8>,      // sha256 commitment to the PLAINTEXT brain
    sealed_key_ref: vector<u8>, // Seal-encrypted AES key (the sealed object bytes)
    model_name: String,         // e.g. "SmolLM2-135M-Instruct"
    model_format: String,       // e.g. "gguf"
    version: u64,               // bumped on every update() — the agent evolves
}

// Admin capability (holds the right to register the simulated enclave key).
public struct AdminCap has key, store { id: UID }

// SIMULATED Nautilus oracle: a shared object holding the enclave's ed25519 pubkey.
// In production this pubkey would be bound to verified PCRs via sui::nitro_attestation.
public struct EnclaveRegistry has key {
    id: UID,
    pubkey: vector<u8>, // ed25519 public key of the (simulated) re-encryption enclave
    set: bool,
}

// === Events ===
public struct Minted has copy, drop { id: ID, creator: address, version: u64 }
public struct Updated has copy, drop { id: ID, version: u64 }
public struct SecureTransferred has copy, drop { id: ID, to: address, version: u64 }

// === Init: Publisher + Display + Admin + (empty) enclave registry ===
fun init(otw: WALNUT, ctx: &mut TxContext) {
    let publisher = package::claim(otw, ctx);

    let mut disp = display::new<AgentNFT>(&publisher, ctx);
    disp.add(b"name".to_string(), b"{name}".to_string());
    disp.add(
        b"description".to_string(),
        b"Walnut INFT - an owned, encrypted AI agent. Decryption follows ownership.".to_string(),
    );
    disp.add(b"model".to_string(), b"{model_name} ({model_format})".to_string());
    disp.add(b"walrus_blob_id".to_string(), b"{walrus_blob_id}".to_string());
    disp.add(b"version".to_string(), b"{version}".to_string());
    disp.add(
        b"image_url".to_string(),
        b"https://walrus.tech/assets/walnut-inft.png".to_string(),
    );
    disp.update_version();

    let registry = EnclaveRegistry { id: object::new(ctx), pubkey: vector[], set: false };
    let admin = AdminCap { id: object::new(ctx) };

    transfer::public_transfer(publisher, ctx.sender());
    transfer::public_transfer(disp, ctx.sender());
    transfer::public_transfer(admin, ctx.sender());
    transfer::share_object(registry);
}

// === Seal identity ===
// key id = bcs(creator) || nonce  (matches what the client passes to SealClient.encrypt)
public fun seal_id(creator: address, nonce: vector<u8>): vector<u8> {
    let mut blob = address::to_bytes(creator);
    blob.append(nonce);
    blob
}

fun nft_seal_id(nft: &AgentNFT): vector<u8> {
    seal_id(nft.creator, nft.nonce)
}

/// Seal policy (evaluated by the key servers via dev_inspect):
///  - `id` must match THIS NFT's identity, so one NFT can't unlock another's key.
///  - `nft.owner` must equal the certified caller `ctx.sender()` — this is the
///    ownership gate (object ownership itself is NOT enforced under dev_inspect).
entry fun seal_approve(id: vector<u8>, nft: &AgentNFT, ctx: &TxContext) {
    assert!(id == nft_seal_id(nft), EBadSealId);
    assert!(nft.owner == ctx.sender(), ENotOwner);
}

// === Mint ===
public fun mint(
    name: vector<u8>,
    nonce: vector<u8>,
    walrus_blob_id: vector<u8>,
    data_hash: vector<u8>,
    sealed_key_ref: vector<u8>,
    model_name: vector<u8>,
    model_format: vector<u8>,
    ctx: &mut TxContext,
): AgentNFT {
    let nft = AgentNFT {
        id: object::new(ctx),
        name: string::utf8(name),
        creator: ctx.sender(),
        owner: ctx.sender(),
        nonce,
        walrus_blob_id: string::utf8(walrus_blob_id),
        data_hash,
        sealed_key_ref,
        model_name: string::utf8(model_name),
        model_format: string::utf8(model_format),
        version: 1,
    };
    sui::event::emit(Minted { id: object::id(&nft), creator: nft.creator, version: 1 });
    nft
}

entry fun mint_to_sender(
    name: vector<u8>,
    nonce: vector<u8>,
    walrus_blob_id: vector<u8>,
    data_hash: vector<u8>,
    sealed_key_ref: vector<u8>,
    model_name: vector<u8>,
    model_format: vector<u8>,
    ctx: &mut TxContext,
) {
    let nft = mint(name, nonce, walrus_blob_id, data_hash, sealed_key_ref, model_name, model_format, ctx);
    transfer::public_transfer(nft, ctx.sender());
}

// === Ownership tracking ===
// Sync the `owner` field to the current holder. The MoveVM only lets the actual
// holder pass `&mut nft` in a real transaction, so this can't be spoofed. Call this
// after acquiring the NFT (e.g. right after a Kiosk purchase) so seal_approve follows.
entry fun claim_ownership(nft: &mut AgentNFT, ctx: &TxContext) {
    nft.owner = ctx.sender();
}

/// Simple transfer that keeps `owner` in sync in one step.
entry fun walnut_transfer(mut nft: AgentNFT, to: address) {
    nft.owner = to;
    transfer::public_transfer(nft, to);
}

// === Update (the agent learns) ===
// Owner-only is enforced by MoveVM (must own `nft` to pass &mut).
entry fun update(nft: &mut AgentNFT, new_blob_id: vector<u8>, new_hash: vector<u8>, new_sealed_key: vector<u8>) {
    nft.walrus_blob_id = string::utf8(new_blob_id);
    nft.data_hash = new_hash;
    nft.sealed_key_ref = new_sealed_key;
    nft.version = nft.version + 1;
    sui::event::emit(Updated { id: object::id(nft), version: nft.version });
}

// === Simulated Nautilus oracle ===
public fun register_enclave(_admin: &AdminCap, registry: &mut EnclaveRegistry, pubkey: vector<u8>) {
    registry.pubkey = pubkey;
    registry.set = true;
}

/// Strict ERC-7857-style transfer: only flips ownership after the (SIMULATED) enclave
/// attests it re-encrypted the brain to `to`. The enclave signs
/// msg = data_hash || sealed_key || bcs(to); Move verifies with ed25519.
/// NOTE: SIMULATED — a real implementation would verify a Nautilus Nitro attestation
/// (sui::nitro_attestation) binding `pubkey` to the enclave's measured PCRs.
entry fun secure_transfer(
    registry: &EnclaveRegistry,
    mut nft: AgentNFT,
    to: address,
    new_blob_id: vector<u8>,
    new_hash: vector<u8>,
    new_sealed_key: vector<u8>,
    sig: vector<u8>,
) {
    assert!(registry.set, EBadEnclaveProof);
    let mut msg = new_hash;
    msg.append(new_sealed_key);
    msg.append(address::to_bytes(to));
    assert!(ed25519::ed25519_verify(&sig, &registry.pubkey, &msg), EBadEnclaveProof);

    nft.walrus_blob_id = string::utf8(new_blob_id);
    nft.data_hash = new_hash;
    nft.sealed_key_ref = new_sealed_key;
    nft.owner = to;
    nft.version = nft.version + 1;
    sui::event::emit(SecureTransferred { id: object::id(&nft), to, version: nft.version });
    transfer::public_transfer(nft, to);
}

// === Read-only getters (used by the app / tests) ===
public fun version(nft: &AgentNFT): u64 { nft.version }
public fun creator(nft: &AgentNFT): address { nft.creator }
public fun owner(nft: &AgentNFT): address { nft.owner }
public fun nonce(nft: &AgentNFT): vector<u8> { nft.nonce }
public fun walrus_blob_id(nft: &AgentNFT): String { nft.walrus_blob_id }
public fun data_hash(nft: &AgentNFT): vector<u8> { nft.data_hash }
public fun sealed_key_ref(nft: &AgentNFT): vector<u8> { nft.sealed_key_ref }
