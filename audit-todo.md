# App Audit — Issues & Recommendations

Generated from codebase audit. Check off items as they are resolved.

---

## Critical

- [x] 1. **GitHub URL mismatch** — `config/site.ts:8` points to `HandCash/centbee-recovery` but all inline links in `app/start/page.tsx` and `app/components/Wallet.tsx` point to `Gamaroff/centbee-recovery`. One is wrong.

---

## High Priority

- [x] 2. **Dual fee calculation** — `lib/wallet/walletClient.ts:115–146` — Fees are computed twice: manually via `estimatedSize * FEE_RATE_IN_SATOSHIS_PER_BYTE` and again via `tx.fee(new SatoshisPerKilobyte(100 * 1000))`. The SDK may produce a different result than the manual estimate, causing incorrect output amounts or broadcast failures. Only one method should be authoritative.

- [x] 3. **Unused `walletCache` singleton** — `lib/wallet/walletCache.ts:19` — `export const walletCache = new WalletCache()` is exported but never imported or used anywhere. Remove or document it.

- [x] 4. **Balance update inconsistency** — `app/components/Wallet.tsx:38–44` — Balance is set twice: once per-batch via the progress callback (`setSatoshisBalance(progress.totalSatoshis)`) and again after sync completes from the returned UTXO array. If these diverge, the displayed balance flickers or shows an incorrect final value.

---

## Medium Priority

- [x] 5. **`useCallback` stale closure** — `app/components/Wallet.tsx:24–59` — `syncWalletStatus` references `isSyncing` state but has an empty dependency array `[]`, capturing a stale value after the first render. Add `isSyncing` to the dependency array or remove the guard if redundant.

- [x] 6. **Mnemonic stored to `localStorage` without trim** — `app/start/page.tsx:106` — Validation uses `mnemonic.trim()` but `localStorage.setItem('wallet_mnemonic', mnemonic)` stores the untrimmed value. Leading/trailing whitespace will cause validation failures on next load.

- [x] 7. **`Bitails` network parameter unused** — `lib/wallet/Bitails.ts:16–18` — Constructor accepts `network: 'main' | 'test'` but all API URLs are hardcoded to `https://api.bitails.io`. Either wire it up or remove the parameter.

- [x] 8. **Gap limit vs batch size confusion in docs** — `lib/wallet/walletClient.ts:177–210` — Comment says "derives addresses in batches of `gapLimit` (default 25)" but `gapLimit = 1000` and `batchSize = 25` are separate constants. The comment conflates them.

- [x] 9. **No destination address validation before send** — `app/components/Wallet.tsx:82–104` — `sendAll()` calls `wallet.sendAll(utxos, destinationAddress)` without validating the address format first. An invalid address will surface as a cryptic SDK error during signing/broadcasting.

---

## Low Priority

- [x] 10. **`console.log(utxos)` left in production code** — `app/components/Wallet.tsx:42` — Remove before release.

- [x] 11. **Hardcoded sync parameters in component** — `app/components/Wallet.tsx:33` — `syncWallet(3500, 25, ...)` uses magic numbers. Extract to named constants.

- [x] 12. **Unused `ArrowDown` import** — `app/start/page.tsx:11` — `ArrowDown` is imported from `lucide-react` but never used.

- [x] 13. **Language toggle silently clears mnemonic input** — `app/start/page.tsx:223–234` — Switching the language selector calls `setMnemonic('')` with no warning. If the user has typed a mnemonic and changes language accidentally, all input is lost.

- [x] 14. **Generic error toast** — `app/start/page.tsx:111–114` — "Invalid parameters" gives no actionable information. Surface the actual SDK error message instead.

- [x] 15. **Non-null assertion on `utxo.derivationPath`** — `lib/wallet/walletClient.ts:136` — `utxo.derivationPath!` will throw an opaque runtime error if a UTXO lacks a derivation path. Validate before the signing loop.

- [x] 16. **Magic number: 200ms batch delay** — `lib/wallet/walletClient.ts:247` — `setTimeout(resolve, 200)` has no comment explaining the purpose (rate limiting? API courtesy?). Extract to a named constant with a brief explanation.

- [x] 17. **`tsconfig.json` missing test file exclusions** — Test files (`*.test.ts`, `*.spec.ts`) should be excluded from compilation but `tsconfig.json` does not exclude them.

- [x] 18. **Font subsets don't include CJK characters** — `lib/fonts.ts` — Only `subsets: ["latin"]` is loaded. Chinese mnemonic words fall back to system fonts, which may render inconsistently across devices.

- [x] 19. **`<html lang="en">` hardcoded** — `app/layout.tsx` — Minor accessibility concern; the `lang` attribute never reflects Chinese input. Acceptable if the UI stays in English, but worth noting.

- [x] 20. **Cloudinary remote image pattern configured but unused** — `next.config.mjs` — `remotePatterns: [{ hostname: 'res.cloudinary.com' }]` is configured but no Cloudinary images are used anywhere. Remove unnecessary config noise.
