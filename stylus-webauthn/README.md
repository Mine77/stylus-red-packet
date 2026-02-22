# Stylus WebAuthn Verifier Contract

A minimal verifier that checks WebAuthn (passkey) assertions using ECDSA P-256.
The verifier stores only the RP ID hash and validates a signature against a
caller-provided public key.

## Key Methods

- `initialize(rp_id_hash)`
- `verify(authenticator_data, signed_message_hash, signature, pubkey_x, pubkey_y)`

## Notes

- `signed_message_hash` must be SHA-256(authenticator_data || client_data_hash),
  computed off-chain to keep the contract small.
- `signature` must be raw 64-byte ECDSA signature (r||s).
