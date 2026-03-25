# Adapting for Other BSV Wallets

This tool was built for Centbee, but the core pattern — derive BIP44 addresses, scan for UTXOs, sweep to a destination — applies to any BIP39/BIP44 BSV wallet. This document explains the four things you would need to change to adapt it.

---

## 1. Derivation path

**File**: `lib/wallet/walletClient.ts`, inside `syncWallet` (~line 147)

```typescript
const path = `m/44'/0/${chain}/${childIndex + i}`
```

BIP44 paths follow the structure `m/purpose'/coin_type'/account'/change/index`. This tool hardcodes:

- `purpose = 44'` (BIP44)
- `coin_type = 0` (BSV uses 0, same as Bitcoin — note: no hardening here, which is non-standard)
- `account = 0` (first account)
- `change` = 0 (external/receiving) or 1 (internal/change), iterated by the loop
- `index` = sequential address index within the batch

Common variations in other wallets:

| Wallet type | Typical path |
|---|---|
| Standard BIP44 | `m/44'/236'/0'/0/n` (coin type 236 for BSV) |
| Centbee (this tool) | `m/44'/0/0/n` and `m/44'/0/1/n` |
| Legacy/custom | Varies — check the wallet's source or documentation |

To change the path, update the template string in `syncWallet`. If the wallet only used one chain (no change addresses), remove the `for (const chain of [0, 1])` loop.

---

## 2. Passphrase scheme

**File**: `lib/wallet/walletClient.ts`, `fromMnemonic` method (~line 38)

```typescript
const hdPrivateKey = HD.fromSeed(mnemonic.toSeed(pin))
```

The PIN is passed directly as the BIP39 passphrase. `mnemonic.toSeed(passphrase)` is the standard way to apply an optional password on top of the mnemonic.

Common variations:

- **No passphrase**: `mnemonic.toSeed('')` — leave the PIN field blank when using the app, or change this line to pass an empty string.
- **Full passphrase (not a PIN)**: Some wallets allow an arbitrary string. The field in the UI is labelled "PIN" but there is no length restriction in the code — any string works.
- **No passphrase support at all**: Some wallets ignore the passphrase field. Use an empty string.

---

## 3. Indexer / API

**File**: `lib/wallet/Bitails.ts`

The `Bitails` class implements three methods used by the rest of the app:

| Method | Purpose |
|---|---|
| `fetchUtxosForAddress(addresses)` | Returns unspent outputs for a batch of addresses |
| `fetchRawTx(txid)` | Returns the raw transaction hex for a given txid |
| `broadcast(tx)` | Broadcasts a signed transaction |

`Bitails` implements the `@bsv/sdk` `Broadcaster` interface, so `broadcast` must conform to that interface (return `BroadcastResponse | BroadcastFailure`).

To swap in a different indexer (e.g. WhatsOnChain):

1. Create a new class (e.g. `WhatsOnChain.ts`) that implements the same three methods.
2. In `walletClient.ts`, replace `new Bitails('main')` (appears twice) with `new WhatsOnChain('main')`.

The `fetchUtxosForAddress` response mapping (lines 108–114 in `Bitails.ts`) is specific to Bitails' response format — you will need to adjust this for your indexer's response shape.

---

## 4. Gap limit and fee rate

**File**: `lib/wallet/walletClient.ts`, constants at the top of the file (~lines 8–11)

```typescript
const FEE_RATE_IN_SATOSHIS_PER_BYTE = 100
const FEE_PER_P2PKH_INPUT = 148
const FEE_PER_P2PKH_OUTPUT = 34
const FEE_OVERHEAD = 10
```

And the `syncWallet` default parameter (~line 133):

```typescript
export async function syncWallet(gapLimit = 25): Promise<Utxo[]>
```

- **Gap limit**: Controls how many consecutive address indices with no UTXOs are checked before the scanner stops. 25 is conservative. Wallets with heavy use (many addresses) may need 50–100 to avoid missing funds.
- **Fee rate**: 100 sat/byte is well above the BSV minimum. Lower it to reduce fees on large transactions, but go below ~1 sat/byte at your own risk.
- **Input/output byte sizes**: 148 bytes per P2PKH input and 34 bytes per P2PKH output are standard estimates. These do not need to change for P2PKH wallets, but would need adjustment for non-standard script types.
