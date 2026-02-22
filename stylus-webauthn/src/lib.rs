//! Stylus WebAuthn verifier (minimal, demo-focused).
//!
//! This contract verifies a WebAuthn assertion produced by a passkey using
//! ECDSA P-256 (a.k.a. ES256). The verification input is:
//!
//!     authenticator_data || client_data_hash
//!
//! The contract keeps the public key and RP ID hash on-chain and returns `true`
//! when the signature is valid and the authenticator data passes basic checks.
//!
//! IMPORTANT: This is a simplified demo contract. It intentionally omits many
//! production-grade checks (challenge binding, origin validation, sign count
//! monotonicity, etc.). Those checks should be enforced off-chain or added
//! carefully if you want full security.

#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
extern crate alloc;

use alloc::vec::Vec;
use p256::ecdsa::{signature::Verifier, Signature, VerifyingKey};
use stylus_sdk::abi::Bytes;
use stylus_sdk::alloy_primitives::{Address, B256};
use stylus_sdk::prelude::*;

/// The minimum length of authenticator data for an assertion:
/// 32 bytes RP ID hash + 1 byte flags + 4 bytes sign counter.
const MIN_AUTH_DATA_LEN: usize = 37;

/// User presence (UP) flag defined by WebAuthn.
const FLAG_UP: u8 = 0x01;

sol_storage! {
    /// Persistent storage for the WebAuthn verifier.
    #[entrypoint]
    pub struct WebAuthnVerifier {
        /// The address that is allowed to update configuration.
        address owner;
        /// Whether the contract has been initialized.
        bool initialized;
        /// X coordinate of the P-256 public key.
        bytes32 pubkey_x;
        /// Y coordinate of the P-256 public key.
        bytes32 pubkey_y;
        /// SHA-256 hash of the RP ID (e.g. "example.com").
        bytes32 rp_id_hash;
        /// Required authenticator flags (bitmask). Set to 0 to disable checking.
        uint8 required_flags;
    }
}

impl WebAuthnVerifier {
    /// Returns true when the caller is the stored owner.
    fn is_owner(&self) -> bool {
        self.initialized.get() && self.vm().msg_sender() == self.owner.get()
    }

    /// Builds the uncompressed SEC1 public key bytes from storage.
    fn sec1_uncompressed_pubkey(&self) -> [u8; 65] {
        let mut key = [0u8; 65];
        // 0x04 means "uncompressed" in SEC1 encoding.
        key[0] = 0x04;
        key[1..33].copy_from_slice(self.pubkey_x.get().as_slice());
        key[33..65].copy_from_slice(self.pubkey_y.get().as_slice());
        key
    }
}

#[public]
impl WebAuthnVerifier {
    /// Initializes the contract with a public key and RP ID hash.
    ///
    /// Returns `false` if already initialized.
    pub fn initialize(
        &mut self,
        pubkey_x: B256,
        pubkey_y: B256,
        rp_id_hash: B256,
        required_flags: u8,
    ) -> bool {
        if self.initialized.get() {
            return false;
        }

        // Store the first caller as owner for future updates.
        self.owner.set(self.vm().msg_sender());
        self.pubkey_x.set(pubkey_x);
        self.pubkey_y.set(pubkey_y);
        self.rp_id_hash.set(rp_id_hash);

        // If the caller passes 0, default to checking User Presence (UP).
        let flags = if required_flags == 0 { FLAG_UP } else { required_flags };
        self.required_flags.set(flags);

        self.initialized.set(true);
        true
    }

    /// Updates the stored public key. Owner only.
    pub fn update_pubkey(&mut self, pubkey_x: B256, pubkey_y: B256) -> bool {
        if !self.is_owner() {
            return false;
        }

        self.pubkey_x.set(pubkey_x);
        self.pubkey_y.set(pubkey_y);
        true
    }

    /// Updates the RP ID hash. Owner only.
    pub fn update_rp_id_hash(&mut self, rp_id_hash: B256) -> bool {
        if !self.is_owner() {
            return false;
        }

        self.rp_id_hash.set(rp_id_hash);
        true
    }

    /// Updates required authenticator flags. Owner only.
    pub fn update_required_flags(&mut self, required_flags: u8) -> bool {
        if !self.is_owner() {
            return false;
        }

        self.required_flags.set(required_flags);
        true
    }

    /// Verifies a WebAuthn assertion signature.
    ///
    /// Inputs:
    /// - `authenticator_data`: raw bytes from `authenticatorData` (at least 37 bytes).
    /// - `client_data_hash`: SHA-256 hash of `clientDataJSON` (computed off-chain).
    /// - `signature`: raw ECDSA signature bytes (64 bytes, r||s).
    ///
    /// Notes:
    /// - WebAuthn signatures are DER-encoded by default; parse them into 64 bytes
    ///   off-chain before calling this method.
    /// - This function performs only minimal checks for demo purposes.
    pub fn verify(
        &self,
        authenticator_data: Bytes,
        client_data_hash: B256,
        signature: Bytes,
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

        // Check required flags (e.g. User Presence / User Verification).
        let flags = auth_bytes[32];
        let required = self.required_flags.get();
        if required != 0 && (flags & required) != required {
            return false;
        }

        // Build the signed message: authenticator_data || client_data_hash.
        let mut signed_data = Vec::with_capacity(auth_bytes.len() + 32);
        signed_data.extend_from_slice(auth_bytes);
        signed_data.extend_from_slice(client_data_hash.as_slice());

        // Parse the public key from storage.
        let verifying_key = match VerifyingKey::from_sec1_bytes(&self.sec1_uncompressed_pubkey()) {
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

        // Verify ES256 signature. The verifier hashes with SHA-256 internally.
        verifying_key.verify(&signed_data, &signature).is_ok()
    }

    /// Returns the current owner address.
    pub fn owner(&self) -> Address {
        self.owner.get()
    }

    /// Returns whether the contract has been initialized.
    pub fn initialized(&self) -> bool {
        self.initialized.get()
    }

    /// Returns the stored public key coordinates.
    pub fn public_key(&self) -> (B256, B256) {
        (self.pubkey_x.get(), self.pubkey_y.get())
    }

    /// Returns the stored RP ID hash.
    pub fn rp_id_hash(&self) -> B256 {
        self.rp_id_hash.get()
    }

    /// Returns the required flags bitmask.
    pub fn required_flags(&self) -> u8 {
        self.required_flags.get()
    }
}
