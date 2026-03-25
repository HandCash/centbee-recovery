# API Providers

The recovery tool uses two external BSV blockchain APIs: **Bitails** as the primary provider for UTXO discovery, raw transaction fetching, and broadcast, and **WhatsOnChain** as a fallback for raw transaction fetching only.

This document covers the API endpoints used, rate limiting behaviour, and how to swap in a different indexer.

---

## Bitails (primary)

**Base URL**: `https://api.bitails.io`
**Documentation**: https://docs.bitails.io
**Authentication**: Optional API key (`apikey` request header). Unauthenticated requests are subject to lower rate limits.

### Endpoints used

#### `POST /address/unspent/multi`

Used by: `Bitails.fetchUtxosForAddress()`

Fetches unspent outputs for a batch of addresses in a single request. The app sends batches of 25 addresses at a time.

Request:
```json
{
  "addresses": ["1A1zP1...", "1BoatS...", "..."]
}
```

Response (array of per-address results):
```json
[
  {
    "address": "1A1zP1...",
    "unspent": [
      { "txid": "abc123...", "vout": 0, "satoshis": 5000, "blockheight": 700000 }
    ]
  },
  {
    "address": "1BoatS...",
    "unspent": []
  }
]
```

Addresses with no UTXOs are included in the response with an empty `unspent` array. The response is flattened to a single `Utxo[]` list.

#### `GET /download/tx/:txid/hex`

Used by: `Bitails.fetchRawTx()`

Returns the raw transaction as a hex string. Required before signing: `@bsv/sdk` needs the full source transaction to construct unlocking scripts.

If the response is not `ok`, the app falls back to WhatsOnChain (see below).

#### `POST /tx/broadcast`

Used by: `Bitails.broadcast()`

Broadcasts a signed transaction.

Request:
```json
{ "raw": "<hex-encoded signed transaction>" }
```

Success response:
```json
{ "txid": "def456..." }
```

Error response:
```json
{ "error": { "code": 64, "message": "..." } }
```

The `Bitails` class implements the `@bsv/sdk` `Broadcaster` interface, so the return type is `BroadcastResponse | BroadcastFailure`.

---

### Rate limiting

Bitails applies HTTP 429 responses when request volume is too high. The app handles this with:

1. **Inter-batch delay**: A 200ms sleep (`BATCH_REQUEST_DELAY_MS`) is inserted between every address-batch request during scanning.
2. **Exponential backoff on 429**: If a 429 is received, `fetchUtxosForAddress` retries up to 5 times with delays of 1s, 2s, 4s, 8s, 16s.
3. **Rate limit callbacks**: `syncWallet` surfaces rate limit events to the UI via the `onProgress` callback so the user sees a message while waiting.

Using an API key removes or substantially raises rate limits. Set `NEXT_PUBLIC_BITAILS_API_KEY` in `.env.local`:

```
NEXT_PUBLIC_BITAILS_API_KEY=your_key_here
```

The API key is sent as an `apikey` header on raw transaction download requests (the only endpoint that accepts it in the current implementation).

---

## WhatsOnChain (raw transaction fallback)

**Base URL**: `https://api.whatsonchain.com/v1/bsv/main`
**Documentation**: https://docs.whatsonchain.com
**Authentication**: None (for public endpoints)

#### `GET /tx/:txid/hex`

Used as a fallback in `Bitails.fetchRawTx()` when the Bitails raw transaction endpoint returns a non-200 response.

```typescript
const wocResponse = await window.fetch(
  `https://api.whatsonchain.com/v1/bsv/main/tx/${txid}/hex`
)
```

WhatsOnChain is not used for UTXO discovery or broadcast. It is purely a data source for raw transaction hex when Bitails lacks or fails to serve a particular transaction.

---

## Swapping in a different indexer

The `Bitails` class in `lib/wallet/Bitails.ts` is the only file that interacts with external APIs (aside from the WoC fallback). To replace Bitails with a different BSV indexer:

### Option A: Full replacement (new class)

1. Create a new file, e.g. `lib/wallet/WhatsOnChain.ts`, implementing the same three methods:

```typescript
import { BroadcastFailure, BroadcastResponse, Transaction, Broadcaster } from '@bsv/sdk'
import { Utxo } from './types/utxo'

export default class WhatsOnChain implements Broadcaster {
  async fetchUtxosForAddress(addresses: string[]): Promise<Utxo[]> {
    // implement using your indexer's UTXO endpoint
  }

  async fetchRawTx(txid: string): Promise<string> {
    // implement using your indexer's raw tx endpoint
  }

  async broadcast(tx: Transaction): Promise<BroadcastResponse | BroadcastFailure> {
    // implement using your indexer's broadcast endpoint
  }
}
```

2. In `lib/wallet/walletClient.ts`, replace the `Bitails` import and constructor call:

```typescript
// Before
import Bitails from './Bitails'
this.bitails = new Bitails()

// After
import WhatsOnChain from './WhatsOnChain'
this.bitails = new WhatsOnChain()
```

The rest of the app is decoupled from the specific provider.

### Option B: WhatsOnChain as a full replacement

WhatsOnChain provides the endpoints needed for all three operations:

| Operation | WoC endpoint |
|---|---|
| UTXO discovery | `POST /addresses/unspent` (bulk unspent) |
| Raw transaction | `GET /tx/:txid/hex` |
| Broadcast | `POST /tx/raw` |

Implementing a `WhatsOnChain` class that wraps these endpoints would make the tool fully independent of Bitails. The main difference to account for in `fetchUtxosForAddress` is the response shape, which differs from Bitails.

### What the rest of the app expects

The provider object must satisfy:

```typescript
interface WalletApiProvider extends Broadcaster {
  fetchUtxosForAddress(
    addresses: string[],
    onRateLimit?: (attempt: number, delayMs: number) => void,
    onRateLimitCleared?: () => void,
  ): Promise<Utxo[]>

  fetchRawTx(txid: string): Promise<string>

  // broadcast(tx) is from the @bsv/sdk Broadcaster interface
}
```

The `onRateLimit` and `onRateLimitCleared` callbacks are optional — they exist so `syncWallet` can surface rate limit events to the UI. A simple implementation can ignore them.

---

## Using a local indexer

If you are running a local BSV node or indexer (e.g. [KNIME](https://github.com/bitcoin-sv/block-headers-client) or a custom ElectrumX instance), you can point the provider at `localhost` by constructing the class with a configurable base URL.

The `Bitails` class constructor accepts nothing at the moment (the base URL is hardcoded). Refactoring it to accept a `baseUrl` parameter would allow pointing at any compatible API without changing the rest of the code.
