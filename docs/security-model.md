# Security Model

This document describes the security boundaries of the Centbee Recovery tool, what threats it is designed to handle, and what it is not designed to protect against.

---

## Core guarantee

**Keys never leave the browser.**

All cryptographic operations — key derivation, address generation, transaction signing — run inside your browser using `@bsv/sdk`. The signed transaction hex is the only thing transmitted to an external service (Bitails). Your mnemonic and PIN are never sent anywhere.

This is verifiable: the app has no backend API routes. There is no server to receive credentials.

---

## What the app protects against

| Threat | How it is mitigated |
|---|---|
| Mnemonic exfiltration via the server | There is no server. All logic runs client-side via Next.js `'use client'` components. |
| PIN exfiltration | PIN is used only in-browser to call `mnemonic.toSeed(pin)`. It is never serialised into any network request. |
| Sending to the wrong address | The destination address field is shown prominently before sending; the app shows the final transaction ID after broadcast so you can verify on a block explorer. |
| Invalid mnemonic silently accepted | `WalletClient.validateMnemonic()` checks against the BIP39 wordlist for the selected language before the form proceeds. An invalid phrase is rejected with an inline error. |

---

## Trust boundaries

### Bitails

The app relies on [Bitails](https://docs.bitails.io) for three operations:

1. **UTXO discovery** — `POST /address/unspent/multi`
2. **Raw transaction download** — `GET /download/tx/:txid/hex`
3. **Transaction broadcast** — `POST /tx/broadcast`

**What you are trusting Bitails to do correctly:**
- Return all unspent outputs for your addresses (a malicious or buggy API could omit UTXOs, causing you to miss funds).
- Return correct raw transaction hex (incorrect data would cause signing to fail or produce an invalid transaction).
- Broadcast your transaction faithfully to the BSV network.

**What Bitails cannot do:**
- Learn your mnemonic or PIN — these are never transmitted.
- Steal your funds — transactions are signed before broadcast; the signature is valid only for the specific destination address you entered.
- Produce a different destination — the transaction is built and signed client-side with your chosen address locked in.

### WhatsOnChain (fallback)

If Bitails returns a non-200 response for a raw transaction download, the app falls back to WhatsOnChain (`https://api.whatsonchain.com`). The same trust applies: raw transaction hex is verified implicitly when `@bsv/sdk` parses it into a `Transaction` object — a corrupted hex would produce a parse error rather than a silently bad transaction.

---

## localStorage

Your mnemonic and PIN are persisted in `localStorage` under the keys `wallet_mnemonic` and `wallet_pin` so you do not have to re-enter them after a page refresh.

**Risks:**
- Any JavaScript running on `localhost:3000` can read localStorage. In practice this is only the app itself, but browser extensions with broad permissions can also access it.
- If you are using a shared machine, another user with access to your browser profile can read localStorage.

**Mitigations:**
- Run the app in a standard browser window (not a profile shared with others).
- Clear localStorage as soon as you have finished sweeping funds:
  1. Open DevTools (`F12`) → Application → Local Storage → `http://localhost:3000`
  2. Delete `wallet_mnemonic` and `wallet_pin`.
  3. Alternatively, click **Reset** on the `/start` page or clear all site data for `localhost` in browser settings.

---

## Derived public keys on the /start page

The `/start` page displays the derived **extended public keys** for the receive chain (`m/44'/0/0`) and change chain (`m/44'/0/1`) as soon as a valid mnemonic and PIN are entered. These are computed locally in the browser and never transmitted.

Displaying the public keys allows you to verify that your mnemonic and PIN are correct before running the full scan. An xpub does not expose your private keys.

---

## Running offline

For high-value recoveries you may want to run the app in an offline-capable mode to eliminate network-based attack surface. The practical limitation is that UTXO discovery and broadcast require Bitails. A fully offline workflow is not currently supported.

If your concern is key exposure rather than broadcast, you can:

1. Run `npm run build && npm start` (or `npm run dev`) on an air-gapped machine.
2. Use browser DevTools to inspect all outgoing network requests before submitting your credentials — you will see only requests to `api.bitails.io` and `api.whatsonchain.com`.

---

## Deployment considerations

This tool is intended to be run **locally** (`localhost`). If you deploy it to a public URL:

- Anyone who visits that URL and enters their credentials is trusting the deployment operator not to have modified the JavaScript.
- There is no mechanism for visitors to verify that the deployed code matches the open-source repository without checking source maps or auditing the bundle.

**Recommendation**: use the tool only at `localhost`. If you share it with others, instruct them to clone and run it themselves.

---

## Responsible disclosure

If you find a security vulnerability, open a private security advisory on the GitHub repository at `HandCash/centbee-recovery` rather than filing a public issue.
