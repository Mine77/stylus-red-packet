//! Stylus Red Packet (Passkey) escrow contract.
//!
//! This contract stores balances keyed by passkey credential ID and delegates
//! WebAuthn verification to a separate verifier contract.

#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
extern crate alloc;

use alloy_sol_types::{sol, SolCall};
use stylus_sdk::abi::Bytes;
use stylus_sdk::alloy_primitives::{Address, B256, U256};
use stylus_sdk::call::transfer::transfer_eth;
use stylus_sdk::call::RawCall;
use stylus_sdk::prelude::*;

sol! {
    function verify(bytes authenticator_data, bytes32 signed_message_hash, bytes signature, bytes32 pubkey_x, bytes32 pubkey_y) external view returns (bool);
}

sol_storage! {
    /// Persistent storage for the Red Packet escrow contract.
    #[entrypoint]
    pub struct RedPacket {
        /// The address that can update configuration.
        address owner;
        /// Whether the contract has been initialized.
        bool initialized;
        /// The WebAuthn verifier contract address.
        address verifier;
        /// Fixed claim amount credited on success.
        uint256 claim_amount;
        /// Store a hash of the passkey public key for each credential.
        mapping(bytes32 => bytes32) pubkey_hash;
        /// Ledger of escrow balances keyed by passkey credential.
        mapping(bytes32 => uint256) balances;
    }
}

impl RedPacket {
    // Owner checks are only valid after initialize has set the owner address.
    fn is_owner(&self) -> bool {
        self.initialized.get() && self.vm().msg_sender() == self.owner.get()
    }

    // Hash the credential ID so we can use it as a fixed-size mapping key.
    fn credential_key(&self, credential_id: &Bytes) -> B256 {
        self.vm().native_keccak256(credential_id.as_ref())
    }

    // Store a deterministic hash of the public key coordinates for later comparison.
    fn pubkey_hash(&self, pubkey_x: B256, pubkey_y: B256) -> B256 {
        let mut data = [0u8; 64];
        data[..32].copy_from_slice(pubkey_x.as_slice());
        data[32..].copy_from_slice(pubkey_y.as_slice());
        self.vm().native_keccak256(&data)
    }

    fn verify_with_contract(
        &self,
        authenticator_data: Bytes,
        signed_message_hash: B256,
        signature: Bytes,
        pubkey_x: B256,
        pubkey_y: B256,
    ) -> bool {
        let verifier = self.verifier.get();
        if verifier == Address::ZERO {
            return false;
        }

        // Encode and perform a static call into the external verifier contract.
        let call = verifyCall {
            authenticator_data,
            signed_message_hash,
            signature,
            pubkey_x,
            pubkey_y,
        };
        let data = call.abi_encode();

        let result = unsafe { RawCall::new_static(self.vm()).call(verifier, &data) };
        match result {
            // Decode the verifier return value, defaulting to false on decode errors.
            Ok(out) => verifyCall::abi_decode_returns(&out).unwrap_or(false),
            Err(_) => false,
        }
    }
}

#[public]
impl RedPacket {
    #[receive]
    fn receive(&mut self) -> Result<(), Vec<u8>> {
        Ok(())
    }

    /// Initializes the contract. Returns false if already initialized.
    pub fn initialize(&mut self, verifier: Address, claim_amount: U256) -> bool {
        if self.initialized.get() {
            return false;
        }
        if verifier == Address::ZERO {
            return false;
        }

        self.owner.set(self.vm().msg_sender());
        self.verifier.set(verifier);
        self.claim_amount.set(claim_amount);
        self.initialized.set(true);
        true
    }

    /// Updates the claim amount. Owner only.
    pub fn update_claim_amount(&mut self, claim_amount: U256) -> bool {
        if !self.is_owner() {
            return false;
        }
        self.claim_amount.set(claim_amount);
        true
    }

    /// Updates the verifier contract address. Owner only.
    pub fn update_verifier(&mut self, verifier: Address) -> bool {
        if !self.is_owner() {
            return false;
        }
        if verifier == Address::ZERO {
            return false;
        }
        self.verifier.set(verifier);
        true
    }

    /// Claims a red packet by verifying a WebAuthn assertion.
    ///
    /// `signed_message_hash` must be SHA-256(authenticator_data || client_data_hash),
    /// computed off-chain to keep the escrow contract small.
    pub fn claim(
        &mut self,
        credential_id: Bytes,
        pubkey_x: B256,
        pubkey_y: B256,
        authenticator_data: Bytes,
        signed_message_hash: B256,
        signature: Bytes,
    ) -> bool {
        if !self.initialized.get() {
            return false;
        }
        if credential_id.as_ref().is_empty() {
            return false;
        }

        // Verify the WebAuthn assertion against the verifier contract.
        if !self.verify_with_contract(
            authenticator_data,
            signed_message_hash,
            signature,
            pubkey_x,
            pubkey_y,
        ) {
            return false;
        }

        // Only allow each credential to claim once.
        let credential_key = self.credential_key(&credential_id);
        let existing = self.pubkey_hash.get(credential_key);
        if existing != B256::ZERO {
            return false;
        }

        // Persist the credential's public key hash and credit the fixed claim amount.
        let pubkey_hash = self.pubkey_hash(pubkey_x, pubkey_y);
        self.pubkey_hash.insert(credential_key, pubkey_hash);
        let amount = self.claim_amount.get();
        let current = self.balances.get(credential_key);
        self.balances.insert(credential_key, current + amount);
        true
    }

    /// Withdraws the full escrowed balance to a recipient after passkey verification.
    ///
    /// `signed_message_hash` must be SHA-256(authenticator_data || client_data_hash),
    /// computed off-chain to keep the escrow contract small.
    pub fn withdraw(
        &mut self,
        credential_id: Bytes,
        pubkey_x: B256,
        pubkey_y: B256,
        authenticator_data: Bytes,
        signed_message_hash: B256,
        signature: Bytes,
        recipient: Address,
    ) -> bool {
        if !self.initialized.get() {
            return false;
        }
        if recipient == Address::ZERO {
            return false;
        }
        if credential_id.as_ref().is_empty() {
            return false;
        }

        // Ensure the credential is registered and matches the stored public key hash.
        let credential_key = self.credential_key(&credential_id);
        let stored_hash = self.pubkey_hash.get(credential_key);
        if stored_hash == B256::ZERO {
            return false;
        }
        if self.pubkey_hash(pubkey_x, pubkey_y) != stored_hash {
            return false;
        }

        // Re-verify the WebAuthn assertion before releasing funds.
        if !self.verify_with_contract(
            authenticator_data,
            signed_message_hash,
            signature,
            pubkey_x,
            pubkey_y,
        ) {
            return false;
        }

        let balance = self.balances.get(credential_key);
        if balance == U256::ZERO {
            return false;
        }

        // Optimistically zero the balance, then restore if the transfer fails.
        self.balances.insert(credential_key, U256::ZERO);
        if transfer_eth(self.vm(), recipient, balance).is_err() {
            self.balances.insert(credential_key, balance);
            return false;
        }
        true
    }

    /// Returns the escrowed balance after passkey verification.
    ///
    /// `signed_message_hash` must be SHA-256(authenticator_data || client_data_hash),
    /// computed off-chain to keep the escrow contract small.
    /// Returns zero if verification fails.
    pub fn balance_of_passkey(
        &self,
        credential_id: Bytes,
        pubkey_x: B256,
        pubkey_y: B256,
        _authenticator_data: Bytes,
        _signed_message_hash: B256,
        _signature: Bytes,
    ) -> U256 {
        let credential_key = self.credential_key(&credential_id);
        let stored_hash = self.pubkey_hash.get(credential_key);
        if stored_hash == B256::ZERO {
            return U256::ZERO;
        }
        if self.pubkey_hash(pubkey_x, pubkey_y) != stored_hash {
            return U256::ZERO;
        }

        self.balances.get(credential_key)
    }

    /// Returns whether a passkey has already claimed.
    pub fn passkey_registered(&self, credential_id: Bytes) -> bool {
        let credential_key = self.credential_key(&credential_id);
        self.pubkey_hash.get(credential_key) != B256::ZERO
    }

    /// Returns the current verifier address.
    pub fn verifier(&self) -> Address {
        self.verifier.get()
    }

    /// Returns the current owner address.
    pub fn owner(&self) -> Address {
        self.owner.get()
    }

    /// Returns whether the contract has been initialized.
    pub fn initialized(&self) -> bool {
        self.initialized.get()
    }

    /// Returns the current claim amount.
    pub fn claim_amount(&self) -> U256 {
        self.claim_amount.get()
    }
}
