# Testing Guide

## Running Tests

```bash
npm run test              # Run all tests once
npm run test:watch        # Watch mode during development
npm run test:coverage     # Generate coverage report (HTML + text)
npm run test:ui           # @vitest/ui interactive dashboard
npm run test:e2e          # Run Playwright E2E tests (requires running dev server)
npm run test:e2e:debug    # Playwright debug mode
```

## Test Organisation

Tests are co-located with source files using the `.spec.ts` / `.spec.tsx` suffix:

```
lib/wallet/
├── walletClient.ts
├── walletClient.spec.ts       ← unit tests
├── Bitails.ts
├── Bitails.spec.ts            ← unit tests
├── walletCache.ts
└── walletCache.spec.ts        ← unit tests

app/components/
├── Wallet.tsx
└── Wallet.spec.tsx            ← component tests

app/start/
├── page.tsx
└── page.spec.tsx              ← component tests

__tests__/integration/
├── wallet-sync.spec.ts        ← cross-module integration tests
└── transaction-fee.spec.ts    ← fee calculation tests

e2e/
└── wallet-flow.spec.ts        ← Playwright E2E tests
```

## MSW Mocking

All external API calls are intercepted by [Mock Service Worker (MSW)](https://mswjs.io/) during tests. No real network requests are made.

**Default handlers** (`lib/mocks/handlers.ts`):

| Endpoint | Mock response |
|----------|--------------|
| `POST https://api.bitails.io/address/unspent/multi` | Returns empty UTXO list for every queried address |
| `GET https://api.bitails.io/download/tx/:txid/hex` | Returns `SAMPLE_RAW_TX_HEX` |
| `POST https://api.bitails.io/tx/broadcast` | Returns `{ txid: "abcdef..." }` |
| `GET https://api.whatsonchain.com/v1/bsv/main/tx/:txid/hex` | Returns `SAMPLE_RAW_TX_HEX` |

The default UTXO handler returns empty arrays so tests are silent by default. Override it when a test needs to simulate found funds.

**Overriding handlers in a test**:

```ts
import { http, HttpResponse } from 'msw'
import { server } from '../../lib/mocks/server'

it('returns UTXOs when funds are found', async () => {
  server.use(
    http.post('https://api.bitails.io/address/unspent/multi', async ({ request }) => {
      const body = await request.json() as { addresses: string[] }
      return HttpResponse.json(
        body.addresses.map((address, i) => ({
          address,
          unspent: i === 0 ? [{ txid: 'aabbcc', vout: 0, satoshis: 100000, blockheight: 700000 }] : [],
        }))
      )
    })
  )
  // ... test code
})
```

Handlers reset automatically after each test (`afterEach(() => server.resetHandlers())`).

**Pre-built error scenarios** from `lib/mocks/handlers.ts`:

```ts
import { errorHandlers } from '../../lib/mocks/handlers'

server.use(errorHandlers.rateLimitUtxo)      // 429 on UTXO fetch
server.use(errorHandlers.serverErrorUtxo)    // 500 on UTXO fetch
server.use(errorHandlers.bitailsTxNotFound)  // 404 on raw tx (triggers WoC fallback)
server.use(errorHandlers.broadcastFailure)   // broadcast returns error body
```

**Fake timers for retry/backoff tests**:

Bitails uses exponential backoff (up to 5 retries, starting at 1s). Use `vi.useFakeTimers()` to avoid real waits:

```ts
it('throws after max retries', async () => {
  vi.useFakeTimers()
  server.use(errorHandlers.rateLimitUtxo)
  const bitails = new Bitails()
  const promise = bitails.fetchUtxosForAddress(['1A1...'])
  // Attach rejection handler BEFORE advancing timers — otherwise Vitest
  // sees an unhandled rejection and fails the test.
  const expectation = expect(promise).rejects.toThrow('Rate limited by Bitails after max retries')
  await vi.runAllTimersAsync()
  await expectation
  vi.useRealTimers()
})
```

## Test Fixtures

Reusable test data lives in `lib/test-fixtures.ts`:

```ts
import { TEST_MNEMONIC, TEST_PIN, SAMPLE_UTXO_RESPONSE, SAMPLE_RAW_TX_HEX } from '../test-fixtures'
```

**Important**: `TEST_MNEMONIC` is the BIP39 all-zeros mnemonic (`abandon × 11 + about`). It is a well-known test vector — never use it for real funds.

## Component Testing Patterns

### Mocking Next.js navigation

```ts
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}))
```

### Mocking localStorage

```ts
import { mockLocalStorage } from '../../lib/test-utils'

beforeEach(() => {
  mockLocalStorage({ wallet_mnemonic: TEST_MNEMONIC, wallet_pin: TEST_PIN })
})
```

### Mocking wallet functions

```ts
vi.mock('../../lib/wallet/walletClient', () => ({
  WalletClient: {
    validateMnemonic: vi.fn().mockReturnValue(true),
  },
  importWallet: vi.fn(),
  syncWallet: vi.fn().mockResolvedValue([]),
}))
```

## Coverage Targets

Coverage is collected over `lib/wallet/**` and `app/components/**` (wordlists and type files are excluded). Global thresholds enforced on every run:

| Metric | Threshold |
|--------|-----------|
| Lines | 80% |
| Statements | 80% |
| Functions | 70% |
| Branches | 70% |

Thresholds are configured in `vitest.config.ts`. The build fails if any threshold is not met.

View the full report after running `npm run test:coverage` — open `coverage/index.html` in your browser.

## Writing New Tests

1. Create `<source-file>.spec.ts` next to the file you're testing.
2. Import from `../../lib/test-utils` for React component tests.
3. Use MSW `server.use(...)` to override API responses for specific scenarios.
4. Use fixtures from `lib/test-fixtures.ts` for consistent test data.
5. Always call `clearWallet()` in `afterEach` if your test uses the wallet singleton.

## CI/CD

Tests run automatically on every pull request and push to `main`/`master`/`develop` via GitHub Actions (`.github/workflows/test.yml`). The pipeline:

1. Type-checks TypeScript
2. Runs ESLint
3. Runs all unit + integration tests with coverage
4. Uploads coverage report as an artifact
5. Builds the Next.js app to verify no build-time errors

PRs are blocked from merging if any step fails.
