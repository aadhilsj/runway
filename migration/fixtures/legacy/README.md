# Legacy fixtures

This directory separates safe, reviewable structure from private production data.

- `sanitized-structure.json` is committed. It contains invented identifiers, dates, labels, amounts, events, scenarios, templates, and buckets used by the Phase 3 test suite.
- `raw/` is ignored by Git. It contains the encrypted full export, a local plaintext recovery copy, and checksum manifest for both production rows.
- `.runway-private-backups/` is also ignored. It contains the private decryption key and passphrase. The encrypted export is not recoverable without those files.

Never copy a production user ID, account name, transaction description, balance, or event into the sanitized fixture.
