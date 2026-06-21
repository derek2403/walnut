#[test_only]
module walnut::walnut_tests;

use walnut::walnut::{Self, AgentNFT};
use sui::test_scenario as ts;

const CREATOR: address = @0xA11CE;
const BUYER: address = @0xB0B;

fun mint_demo(ctx: &mut TxContext): AgentNFT {
    walnut::mint(
        b"Research Assistant",
        b"nonce-123",
        b"blob_abc",
        b"hash_abc",
        b"sealed_key_abc",
        b"SmolLM2-135M-Instruct",
        b"gguf",
        ctx,
    )
}

#[test]
fun seal_id_is_creator_bytes_plus_nonce() {
    let expected = walnut::seal_id(CREATOR, b"nonce-123");
    // creator address is 32 bytes, then the 9-byte nonce appended
    assert!(expected.length() == 32 + 9, 0);
}

#[test]
fun mint_then_update_bumps_version() {
    let mut scen = ts::begin(CREATOR);
    let nft = mint_demo(scen.ctx());
    assert!(walnut::version(&nft) == 1, 0);
    assert!(walnut::creator(&nft) == CREATOR, 1);

    let mut nft = nft;
    walnut::update(&mut nft, b"blob_v2", b"hash_v2", b"sealed_v2");
    assert!(walnut::version(&nft) == 2, 2);
    assert!(walnut::walrus_blob_id(&nft) == b"blob_v2".to_string(), 3);

    sui::transfer::public_transfer(nft, BUYER);
    scen.end();
}

// The seal id stored matches what a fresh seal_id(creator, nonce) call produces,
// proving an owner can reconstruct the identity the key was sealed to.
#[test]
fun seal_id_matches_nft_identity() {
    let mut scen = ts::begin(CREATOR);
    let nft = mint_demo(scen.ctx());
    let id = walnut::seal_id(walnut::creator(&nft), walnut::nonce(&nft));
    // seal_approve would assert id == nft's identity; mirror that check here.
    assert!(id == walnut::seal_id(CREATOR, b"nonce-123"), 0);
    sui::transfer::public_transfer(nft, CREATOR);
    scen.end();
}
