# Troubleshooting

This guide covers common problems when using the recovery tool to retrieve BSV funds from a Centbee wallet.

---

## No UTXOs found / balance shows 0

**Most likely cause: wrong PIN or wrong mnemonic.**

The PIN is used as a BIP39 passphrase (`mnemonic.toSeed(pin)`). Even a single wrong digit produces a completely different set of addresses — the app will scan them all and find nothing.

Things to check:

- **PIN**: Must be the exact 4-digit PIN you used in Centbee. A PIN of `0042` is different from `42`.
- **Word order**: All 12 words must be in the exact order shown in the Centbee app at the time of backup. A single transposition means a different wallet.
- **Spelling**: Each word must be a valid BIP39 English word, spelled correctly. The `/start` page validates the mnemonic before accepting it, so if it accepted your phrase, the words themselves are valid — but verify the order.
- **Already swept**: If you or someone else previously used this tool (or another wallet) to send all funds, the balance will be 0. Check the derived addresses on a block explorer to confirm transaction history.
- **Different app**: If the wallet was not a standard Centbee BIP44 wallet (e.g. an early version or a different app), the derivation path may differ. See [Adapting for Other Wallets](./adapting-for-other-wallets.md) for how paths can be changed.

---

## Sync stops early / only some UTXOs found

The scanner works in batches of 25 addresses. It stops a chain (external or change) as soon as an entire batch of 25 returns no UTXOs.

This means if your Centbee wallet had a large gap — more than 25 consecutive addresses with no activity — some UTXOs may be missed.

**Workaround**: This is not currently configurable in the UI. If you suspect a large gap, you can modify `syncWallet` in `lib/wallet/walletClient.ts` and increase the `gapLimit` default from 25 to a higher value (e.g. 100).

---

## Broadcast failure

If "Send All" fails to broadcast, possible causes:

- **Bitails API is down**: The tool relies entirely on `https://api.bitails.io`. If the API is unavailable, you cannot fetch UTXOs or broadcast. Wait and try again, or check the Bitails service status.
- **Dust threshold**: BSV nodes reject outputs below the dust threshold (~546 satoshis). If your total balance minus the fee is below this threshold, the broadcast will fail. This typically only happens with very small balances.
- **Fee too low**: Fees are calculated at 100 sat/byte, which is well above the standard minimum. This should not normally cause rejections, but some miners may apply stricter policies.
- **Transaction already broadcast**: If you refreshed mid-send, the transaction may have already been broadcast but the UI did not confirm. Check the derived addresses on a block explorer before trying again.

---

## Rate limiting from Bitails

The sync process sends one batch request every 200ms. Bitails may throttle requests if many batches are sent in quick succession (e.g. when scanning a wallet with deep address usage across both chains).

If you receive network errors or empty responses mid-sync, wait 30–60 seconds and refresh the page to re-sync.

---

## App won't load / blank page

- **localStorage unavailable**: The app stores your mnemonic and PIN in `localStorage` and reads them on load. If your browser blocks `localStorage` (e.g. in private/incognito mode with strict settings, or with a content-blocking extension), the app may behave unexpectedly or fail silently.
  
  - Use a standard browser window, not private/incognito mode.
  - Disable content blockers for `localhost`.

- **Build error**: Run `npm run dev` in the project directory and check the terminal for errors. If there is a build failure, the page will be blank.

---

## How to clear saved wallet state

Your mnemonic and PIN are stored in the browser's `localStorage` under the keys `wallet_mnemonic` and `wallet_pin`. To clear them:

1. Open browser DevTools (`F12` or right-click → Inspect).
2. Go to **Application** → **Local Storage** → `http://localhost:3000`.
3. Delete the `wallet_mnemonic` and `wallet_pin` entries.
4. Reload the page — you will be redirected to `/start`.

Alternatively, clearing all site data for `localhost` in your browser settings achieves the same result.

---

## Sending to a wrong address

There is no undo. Once a transaction is broadcast to the BSV network, it cannot be reversed. Always double-check the destination address before clicking "Send All".
