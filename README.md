# Centbee Recovery

A browser-based BSV (Bitcoin SV) wallet recovery tool. Enter your Centbee 12-word recovery phrase and 4-digit PIN, and the app will find your unspent funds on the blockchain and sweep them to any BSV address you control.

No backend. No custody. Keys never leave your browser.

---

## Table of Contents

- [Who This Is For](#who-this-is-for)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Key Modules](#key-modules)
- [Multi-Language Mnemonic Support](#multi-language-mnemonic-support)
- [Security Model](#security-model)
- [Development Reference](#development-reference)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [Further Reading](#further-reading)
- [Disclaimer](#disclaimer)

---

## Who This Is For

This tool is for anyone who has a **Centbee wallet backup** (12-word phrase + PIN) and needs to recover or migrate their BSV funds — without the Centbee app.

Common use cases:

- The Centbee app is unavailable or you have lost access to your device.
- You want to move your BSV to a different wallet (HandCash, Electrum SV, etc.).
- You want to verify which addresses your Centbee wallet owned.

---

## Quick Start

### Prerequisites

- **Node.js 18 or 20** — [download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- Your **12-word Centbee recovery phrase** and **4-digit PIN**

Verify your installation:

```bash
node -v
npm -v
```

### Install and run

```bash
# 1. Clone or download the project
git clone https://github.com/HandCash/centbee-recovery.git
cd centbee-recovery

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

Open **http://localhost:3000** in your browser.

### Recover your funds

1. Navigate to **http://localhost:3000/start**
2. Enter your 12-word recovery phrase and your 4-digit PIN.
3. Click **Restore** — you will be redirected to the wallet page.
4. The app scans the blockchain for your funds. This takes a moment.
5. Once scanning is complete, enter a destination BSV address and click **Send All**.
6. Your funds will be swept to the destination in a single transaction.

> **Important**: Always verify the destination address before sending. Transactions on the BSV blockchain are irreversible.

---

## How It Works

### 1. Key derivation

Your 12-word phrase is a standard **BIP39 mnemonic**. Combined with your PIN (used as the BIP39 passphrase), it produces a deterministic seed:

```
seed = mnemonic.toSeed(pin)
```

From that seed, an **HD (hierarchical deterministic) private key** tree is derived following the **BIP44** path scheme:

```
m / 44' / 0 / chain / index
```

- `chain = 0` — external (receiving) addresses
- `chain = 1` — internal (change) addresses
- `index` — sequential address index (0, 1, 2, …)

> Note: Centbee uses coin type `0` (not the BSV-assigned `236'`). This is accounted for in the derivation path. See [Adapting for Other Wallets](./docs/adapting-for-other-wallets.md) if you need to adjust this.

### 2. Address scanning

The app does not know in advance which addresses were used in your Centbee wallet. It uses a **gap limit scan** to discover them:

1. Derive a batch of 25 addresses at a time for the external chain.
2. Ask the Bitails API: "Which of these addresses have unspent outputs?"
3. Record any UTXOs found. Reset a consecutive-empty counter if UTXOs were found.
4. If 3,500 consecutive addresses return no UTXOs, stop scanning that chain.
5. Repeat for the internal (change) chain.

The gap limit of 3,500 is intentionally large to handle edge cases where Centbee skipped many address indices.

### 3. Sweep transaction

Once all UTXOs are found, **Send All** builds a single transaction:

- **Inputs**: every discovered UTXO
- **Output**: your destination address, receiving the total balance minus fees

Fees are calculated at **100 sat/byte** using P2PKH size estimates (148 bytes/input, 34 bytes/output, 10 bytes overhead). The transaction is then signed with the private keys derived from your phrase + PIN, and broadcast via Bitails.

Raw transaction data for each UTXO's source transaction is fetched from Bitails (with a WhatsOnChain fallback) and cached in memory to avoid re-fetching during signing.

---

## Architecture

```
Browser
  |
  |-- /start (app/start/page.tsx)
  |     Collects mnemonic + PIN, validates, stores in localStorage,
  |     calls importWallet(), redirects to /
  |
  |-- / (app/components/Wallet.tsx)
        Calls syncWallet() on load, displays balance + UTXO list,
        calls wallet.sendAll() on "Send All"
        |
        |-- WalletClient (lib/wallet/walletClient.ts)
        |     HD key derivation, address generation, transaction building + signing
        |     Singleton exposed via importWallet() / getWallet()
        |
        |-- syncWallet() (lib/wallet/walletClient.ts)
        |     Gap-limit scanner — iterates BIP44 paths, calls Bitails in batches
        |
        |-- Bitails (lib/wallet/Bitails.ts)
        |     Wraps https://api.bitails.io
        |     fetchUtxosForAddress() — POST /address/unspent/multi
        |     fetchRawTx()           — GET  /download/tx/:txid/hex (+ WoC fallback)
        |     broadcast()            — POST /tx/broadcast
        |
        |-- WalletCache (lib/wallet/walletCache.ts)
              In-memory cache: txid -> Transaction object
              Prevents redundant raw-tx fetches during signing
```

**Data flow for Send All:**

```
syncWallet()
  -> derives addresses in batches
  -> Bitails.fetchUtxosForAddress() per batch
  -> collects UTXOs with derivation paths

wallet.sendAll(utxos, destination)
  -> for each UTXO: Bitails.fetchRawTx() (or cache hit)
  -> builds Transaction with P2PKH inputs + single change output
  -> tx.fee() calculates exact fee via SatoshisPerKilobyte
  -> tx.sign() signs each input with the derived private key
  -> tx.broadcast(bitails) broadcasts via POST /tx/broadcast
```

---

## Key Modules

### `lib/wallet/walletClient.ts`

The core of the application. Contains:

| Export                                         | Description                                            |
| ---------------------------------------------- | ------------------------------------------------------ |
| `WalletClient` class                           | HD wallet — key derivation, sendAll()                  |
| `importWallet(mnemonic, pin, language?)`       | Creates the module-level singleton from a phrase + PIN |
| `getWallet()`                                  | Returns the current singleton (or null)                |
| `clearWallet()`                                | Nulls the singleton (use when switching wallets)       |
| `syncWallet(gapLimit, batchSize, onProgress?)` | Gap-limit scanner; reports progress via callback       |
| `SyncProgress` interface                       | Progress event shape emitted during scanning           |

The `syncWallet` function accepts an `onProgress` callback that the UI uses to display live scan progress, log entries, and rate-limit warnings.

### `lib/wallet/Bitails.ts`

Wraps the [Bitails API](https://docs.bitails.io) and implements the `@bsv/sdk` `Broadcaster` interface.

| Method                              | API endpoint                  | Notes                                                 |
| ----------------------------------- | ----------------------------- | ----------------------------------------------------- |
| `fetchUtxosForAddress(addresses[])` | `POST /address/unspent/multi` | Exponential backoff on HTTP 429                       |
| `fetchRawTx(txid)`                  | `GET /download/tx/:txid/hex`  | Falls back to WhatsOnChain if Bitails returns non-200 |
| `broadcast(tx)`                     | `POST /tx/broadcast`          | Returns `BroadcastResponse` or `BroadcastFailure`     |

Rate limiting is handled with exponential backoff (5 retries, starting at 1s, doubling each attempt). A 200ms delay is also inserted between every batch request during scanning.

### `lib/wallet/walletCache.ts`

A simple in-memory Map from `txid` to `Transaction`. Used by `sendAll()` so that if two UTXOs share the same source transaction (which is common with BSV), the raw hex is only fetched once.

### `lib/wallet/detectMnemonicLanguage.ts`

Detects the script of a mnemonic using Unicode character ranges:

- CJK Ideographs (`\u4e00–\u9fff`) → Chinese Simplified
- Hiragana (`\u3041–\u3096`) → Japanese
- Everything else → English (default)

Latin-script languages (French, Italian, Spanish) cannot be auto-detected and require explicit language selection in the UI.

### `lib/wallet/types/utxo.ts`

The `Utxo` type shared across the application:

```typescript
interface Utxo {
  address: string
  txid: string
  vout: number
  satoshis: number
  height: number
  derivationPath?: string   // set by syncWallet(); required for signing
}
```

---

## Multi-Language Mnemonic Support

The tool supports BIP39 mnemonics in six languages:

| Language           | Auto-detected?       | Notes                                  |
| ------------------ | -------------------- | -------------------------------------- |
| English            | Yes (default)        | Uses `@bsv/sdk` built-in wordlist      |
| Chinese Simplified | Yes                  | Detected via CJK Unicode range         |
| Japanese           | Yes                  | Detected via Hiragana Unicode range    |
| French             | No — select manually | Latin script; needs explicit selection |
| Italian            | No — select manually | Latin script; needs explicit selection |
| Spanish            | No — select manually | Latin script; needs explicit selection |

Wordlists for non-English languages live in `lib/wallet/wordlists/`. If a language cannot be auto-detected, the `/start` page provides a language selector.

> See [docs/multi-language-support.md](./docs/multi-language-support.md) for the full implementation details and how to add a new language.

---

## Security Model

**Keys never leave the browser.** This is a client-side-only application — there is no backend API involved in key operations.

| Concern             | Detail                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key derivation      | Happens in-browser using `@bsv/sdk`. The PIN and mnemonic are never transmitted to any server.                                                                |
| Transaction signing | Also in-browser. The signed transaction hex is the only thing sent to Bitails.                                                                                |
| localStorage        | Mnemonic and PIN are stored under `wallet_mnemonic` and `wallet_pin` so the wallet survives a page refresh. **Clear these after use.**                        |
| Third-party trust   | UTXO data, raw transaction hex, and broadcast rely entirely on Bitails. The app has no ability to verify the completeness or honesty of the data it receives. |
| Network             | Run the app locally over localhost. Do not expose it over a network or deploy it to a public host with someone else's mnemonic.                               |

**Clearing saved credentials:**

1. Open DevTools (`F12`) → Application → Local Storage → `http://localhost:3000`
2. Delete `wallet_mnemonic` and `wallet_pin`.
3. Reload — you will be redirected to `/start`.

> A dedicated security analysis can be found in [docs/security-model.md](./docs/security-model.md).

---

## Development Reference

### Commands

| Command                | Description                                            |
| ---------------------- | ------------------------------------------------------ |
| `npm run dev`          | Start the Next.js dev server at http://localhost:3000  |
| `npm run build`        | Build for production                                   |
| `npm start`            | Start the production build                             |
| `npm run lint`         | Run ESLint                                             |
| `npm run lint:fix`     | Run ESLint with auto-fix                               |
| `npm run typecheck`    | TypeScript check without emitting files                |
| `npm run format:write` | Reformat all `.ts`, `.tsx`, `.mdx` files with Prettier |
| `npm run format:check` | Check formatting without writing                       |
| `npm test`             | Run all unit and integration tests                     |
| `npm run test:watch`   | Run tests in watch mode                                |
| `npm run test:coverage`| Run tests with coverage report                         |
| `npm run test:e2e`     | Run Playwright end-to-end tests                        |

For full details on the test setup, fixtures, and how to write new tests, see [docs/TESTING.md](./docs/TESTING.md).

### Tech stack

| Layer           | Technology                      |
| --------------- | ------------------------------- |
| Framework       | Next.js 13 (App Router)         |
| Language        | TypeScript 4.9                  |
| Wallet / crypto | `@bsv/sdk` ^1.3                 |
| UI components   | Radix UI primitives + shadcn/ui |
| Styling         | Tailwind CSS 3                  |
| Toasts          | Sonner                          |
| Linting         | ESLint + `eslint-config-next`   |
| Formatting      | Prettier                        |

### Environment variables

| Variable                      | Default      | Purpose                                                                   |
| ----------------------------- | ------------ | ------------------------------------------------------------------------- |
| `NEXT_PUBLIC_BITAILS_API_KEY` | `""` (empty) | Optional Bitails API key. Authenticated requests have higher rate limits. |

Create a `.env.local` file in the project root to set this:

```
NEXT_PUBLIC_BITAILS_API_KEY=your_key_here
```

---

## Project Structure

```
centbee-recovery/
  app/
    layout.tsx               # Root layout (theme provider, fonts)
    page.tsx                 # Root — redirects to /start or /
    start/
      page.tsx               # /start — mnemonic + PIN import form
    components/
      Wallet.tsx             # / — main wallet UI (sync, balance, send)
  components/
    ui/                      # shadcn/ui primitives (button, input, card, …)
    theme-provider.tsx
    theme-toggle.tsx
  lib/
    utils.ts                 # Tailwind class merge utility
    wallet/
      walletClient.ts        # HD wallet, syncWallet(), sendAll()
      Bitails.ts             # Bitails API wrapper + WoC fallback
      walletCache.ts         # In-memory raw-tx cache
      detectMnemonicLanguage.ts
      types/
        utxo.ts
      wordlists/
        chinese-simplified.ts
        french.ts
        italian.ts
        japanese.ts
        spanish.ts
  docs/
    adapting-for-other-wallets.md
    fork-workflow.md
    troubleshooting.md
    multi-language-support.md  # stub — see below
    security-model.md          # stub — see below
    api-providers.md           # stub — see below
  styles/
    globals.css
```

---

## Contributing

This project is maintained at `HandCash/centbee-recovery`. Contributors work from a personal fork and open pull requests to the upstream repository.

See [docs/fork-workflow.md](./docs/fork-workflow.md) for the full workflow, including:

- Setting up the `upstream` remote
- Branching from `upstream/master`
- Keeping your fork in sync
- Post-merge cleanup

Quick reference:

```bash
# Set up upstream (one time)
git remote add upstream https://github.com/HandCash/centbee-recovery.git

# Start a feature
git fetch upstream
git checkout master && git merge upstream/master
git checkout -b feature/my-feature

# Push and open a PR
git push -u origin feature/my-feature
gh pr create --repo HandCash/centbee-recovery
```

---

## Further Reading

Existing documentation:

| Document                                                                   | Description                                                                                                                 |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [docs/troubleshooting.md](./docs/troubleshooting.md)                       | Common issues: zero balance, scan gaps, broadcast failures, rate limits, localStorage problems                              |
| [docs/adapting-for-other-wallets.md](./docs/adapting-for-other-wallets.md) | How to change derivation paths, passphrase scheme, API provider, gap limit, and fee rate to support non-Centbee BSV wallets |
| [docs/fork-workflow.md](./docs/fork-workflow.md)                           | Git workflow for contributors working from a personal fork                                                                  |

| [docs/security-model.md](./docs/security-model.md)                 | Threat model, localStorage risks, trust boundaries, deployment guidance                                                                                                                     |
| [docs/multi-language-support.md](./docs/multi-language-support.md) | Language detection, wordlist format, adding a new BIP39 language                                                                                                                            |
| [docs/api-providers.md](./docs/api-providers.md)                   | Bitails + WhatsOnChain endpoints, rate limiting, swapping in a different indexer                                                                                                            |
| [docs/TESTING.md](./docs/TESTING.md)                               | Test setup, MSW mocking, fixtures, coverage thresholds, and how to write new tests                                                                                                          |

---

## Disclaimer

**This software is provided "as is", without warranty of any kind.**

There are no guarantees regarding correctness, reliability, or fitness for a particular purpose. Use it at your own risk. The authors and contributors are not responsible for any loss of funds, missed recovery, or other damages arising from the use of this software.

Always verify the destination address before sending. Transactions on the BSV network are irreversible. If in doubt, test with a small amount first.

---

Licensed under the [MIT License](https://opensource.org/licenses/MIT).
