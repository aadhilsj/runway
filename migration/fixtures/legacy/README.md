# Legacy fixtures

This directory separates safe, reviewable structure from private production data.

- `sanitized-structure.json` is committed. It contains invented identifiers, dates, labels, and amounts and exists only to describe the legacy aggregate shape.
- `raw/` is ignored by Git. It contains the encrypted full export, a local plaintext recovery copy, and checksum manifest for both production rows.
- `.runway-private-backups/` is also ignored. It contains the private decryption key and passphrase. The encrypted export is not recoverable without those files.

Never copy a production user ID, account name, transaction description, balance, or event into the sanitized fixture.
