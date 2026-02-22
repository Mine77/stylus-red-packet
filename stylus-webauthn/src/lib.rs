//! Stylus WebAuthn verifier (minimal, passkey-focused).
//!
//! This contract verifies a WebAuthn assertion produced by a passkey using
//! ECDSA P-256 (ES256). The verification input is:
//!
//!     signed_message_hash = SHA-256(authenticator_data || client_data_hash)
//!
//! The hash is computed off-chain to keep the contract small.

#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
extern crate alloc;

use p256::ecdsa::{signature::hazmat::PrehashVerifier, Signature, VerifyingKey};
use stylus_sdk::abi::Bytes;
use stylus_sdk::alloy_primitives::B256;
use stylus_sdk::prelude::*;

/// The minimum length of authenticator data for an assertion:
/// 32 bytes RP ID hash + 1 byte flags + 4 bytes sign counter.
const MIN_AUTH_DATA_LEN: usize = 37;

sol_storage! {
    /// Persistent storage for the WebAuthn verifier.
    #[entrypoint]
    pub struct WebAuthnVerifier {
        /// Whether the contract has been initialized.
        bool initialized;
        /// SHA-256 hash of the RP ID (e.g. "example.com").
        bytes32 rp_id_hash;
    }
}

impl WebAuthnVerifier {
    /// Builds the uncompressed SEC1 public key bytes from coordinates.
    fn sec1_uncompressed_pubkey(pubkey_x: B256, pubkey_y: B256) -> [u8; 65] {
        let mut key = [0u8; 65];
        // 0x04 means "uncompressed" in SEC1 encoding.
        key[0] = 0x04;
        key[1..33].copy_from_slice(pubkey_x.as_slice());
        key[33..65].copy_from_slice(pubkey_y.as_slice());
        key
    }
}

#[public]
impl WebAuthnVerifier {
    /// Initializes the contract with an RP ID hash.
    ///
    /// Returns `false` if already initialized.
    pub fn initialize(&mut self, rp_id_hash: B256) -> bool {
        if self.initialized.get() {
            return false;
        }
        self.rp_id_hash.set(rp_id_hash);

        self.initialized.set(true);
        true
    }

    /// Verifies a WebAuthn assertion signature.
    ///
    /// Inputs:
    /// - `authenticator_data`: raw bytes from `authenticatorData` (at least 37 bytes).
    /// - `signed_message_hash`: SHA-256(authenticator_data || client_data_hash).
    /// - `signature`: raw ECDSA signature bytes (64 bytes, r||s).
    /// - `pubkey_x`, `pubkey_y`: P-256 public key coordinates.
    pub fn verify(
        &self,
        authenticator_data: Bytes,
        signed_message_hash: B256,
        signature: Bytes,
        pubkey_x: B256,
        pubkey_y: B256,
    ) -> bool {
        if !self.initialized.get() {
            return false;
        }

        let auth_bytes = authenticator_data.as_ref();
        if auth_bytes.len() < MIN_AUTH_DATA_LEN {
            return false;
        }

        // Check RP ID hash matches what we expect on-chain.
        let rp_id_hash = B256::from_slice(&auth_bytes[0..32]);
        if rp_id_hash != self.rp_id_hash.get() {
            return false;
        }

        // Parse the public key from the provided coordinates.
        let verifying_key = match VerifyingKey::from_sec1_bytes(&Self::sec1_uncompressed_pubkey(
            pubkey_x, pubkey_y,
        )) {
            Ok(key) => key,
            Err(_) => return false,
        };

        // Expect a raw 64-byte signature (r||s).
        let sig_bytes = signature.as_ref();
        if sig_bytes.len() != 64 {
            return false;
        }
        let signature = match Signature::from_slice(sig_bytes) {
            Ok(sig) => sig,
            Err(_) => return false,
        };

        verifying_key
            .verify_prehash(signed_message_hash.as_slice(), &signature)
            .is_ok()
    }

    /// Returns whether the contract has been initialized.
    pub fn initialized(&self) -> bool {
        self.initialized.get()
    }

    /// Returns the stored RP ID hash.
    pub fn rp_id_hash(&self) -> B256 {
        self.rp_id_hash.get()
    }
}
