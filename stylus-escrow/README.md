# Stylus Escrow Contract

A minimal escrow contract that stores balances per passkey credential and
delegates WebAuthn verification to a separate verifier contract.

## Key Methods

- `initialize(verifier, claim_amount)`
- `update_verifier(verifier)`
- `claim(credential_id, pubkey_x, pubkey_y, authenticator_data, signed_message_hash, signature)`
- `withdraw(credential_id, pubkey_x, pubkey_y, authenticator_data, signed_message_hash, signature, recipient)`
- `balance_of_passkey(credential_id, pubkey_x, pubkey_y, authenticator_data, signed_message_hash, signature)`
- `passkey_registered(credential_id)`

## Notes

- `signed_message_hash` must be SHA-256(authenticator_data || client_data_hash),
  computed off-chain to keep the escrow contract small.
- `claim` registers the passkey (via a pubkey hash) and credits an escrowed
  balance keyed by the credential.
- `withdraw` transfers the full escrowed balance to the recipient address.
- The verifier contract performs the P-256 signature verification.
