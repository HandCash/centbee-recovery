import { http, HttpResponse } from 'msw'
import { SAMPLE_UTXO_RESPONSE, SAMPLE_RAW_TX_HEX } from '../test-fixtures'

const BITAILS_URL = 'https://api.bitails.io'
const WOC_URL = 'https://api.whatsonchain.com'

export const handlers = [
  // POST /address/unspent/multi — returns empty UTXOs for queried addresses by default.
  // Tests that need specific UTXO results should use server.use() to override this handler.
  http.post(`${BITAILS_URL}/address/unspent/multi`, async ({ request }) => {
    const body = await request.json() as { addresses: string[] }
    return HttpResponse.json(
      body.addresses.map(address => ({ address, unspent: [] }))
    )
  }),

  // GET /download/tx/:txid/hex — returns raw tx hex
  http.get(`${BITAILS_URL}/download/tx/:txid/hex`, () => {
    return new HttpResponse(SAMPLE_RAW_TX_HEX, {
      headers: { 'Content-Type': 'text/plain' },
    })
  }),

  // POST /tx/broadcast — returns txid on success
  http.post(`${BITAILS_URL}/tx/broadcast`, () => {
    return HttpResponse.json({ txid: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' })
  }),

  // GET WhatsOnChain fallback
  http.get(`${WOC_URL}/v1/bsv/main/tx/:txid/hex`, ({ params }) => {
    return new HttpResponse(SAMPLE_RAW_TX_HEX, {
      headers: { 'Content-Type': 'text/plain' },
    })
  }),
]

// Override handlers for specific test scenarios
export const errorHandlers = {
  // 429 rate-limit on UTXO fetch
  rateLimitUtxo: http.post(`${BITAILS_URL}/address/unspent/multi`, () => {
    return new HttpResponse(null, { status: 429 })
  }),

  // 500 server error on UTXO fetch
  serverErrorUtxo: http.post(`${BITAILS_URL}/address/unspent/multi`, () => {
    return new HttpResponse(null, { status: 500, statusText: 'Internal Server Error' })
  }),

  // 404 on raw tx fetch from Bitails (triggers WoC fallback)
  bitailsTxNotFound: http.get(`${BITAILS_URL}/download/tx/:txid/hex`, () => {
    return new HttpResponse(null, { status: 404 })
  }),

  // Broadcast failure
  broadcastFailure: http.post(`${BITAILS_URL}/tx/broadcast`, () => {
    return HttpResponse.json({ error: { code: 257, message: 'Transaction already known' } })
  }),
}
