import { describe, it, expect, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import Bitails from './Bitails'
import WhatsOnChain from './WhatsOnChain'
import DelegatedIndexerService from './DelegatedIndexerService'
import { SAMPLE_UTXO_RESPONSE, SAMPLE_WOC_UTXO_RESPONSE, SAMPLE_RAW_TX_HEX } from '../test-fixtures'

const BITAILS_URL = 'https://api.bitails.io'
const WOC_URL = 'https://api.whatsonchain.com'

describe('DelegatedIndexerService', () => {
  function makeService() {
    return new DelegatedIndexerService(new Bitails(), new WhatsOnChain())
  }

  describe('fetchRawTx', () => {
    it('falls back to WhatsOnChain when Bitails returns non-OK', async () => {
      server.use(
        http.get(`${BITAILS_URL}/download/tx/:txid/hex`, () =>
          new HttpResponse(null, { status: 404 })
        ),
        http.get(`${WOC_URL}/v1/bsv/main/tx/:txid/hex`, () =>
          new HttpResponse('woc-raw-tx-hex', { headers: { 'Content-Type': 'text/plain' } })
        )
      )
      const rawTx = await makeService().fetchRawTx('missing-txid')
      expect(rawTx).toBe('woc-raw-tx-hex')
    })

    it('throws when both Bitails and WhatsOnChain fail', async () => {
      server.use(
        http.get(`${BITAILS_URL}/download/tx/:txid/hex`, () =>
          new HttpResponse(null, { status: 404 })
        ),
        http.get(`${WOC_URL}/v1/bsv/main/tx/:txid/hex`, () =>
          new HttpResponse(null, { status: 404, statusText: 'Not Found' })
        )
      )
      await expect(makeService().fetchRawTx('missing-txid')).rejects.toThrow(
        'WhatsOnChain failed to fetch raw transaction'
      )
    })
  })

  describe('fetchUtxosForAddress', () => {
    it('calls onRateLimit callback on 429 and retries', async () => {
      let callCount = 0
      server.use(
        http.post(`${BITAILS_URL}/address/unspent/multi`, () => {
          callCount++
          if (callCount === 1) return new HttpResponse(null, { status: 429 })
          return HttpResponse.json(SAMPLE_UTXO_RESPONSE)
        })
      )

      const rateLimitCalls: number[] = []
      const utxos = await makeService().fetchUtxosForAddress(
        ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'],
        (attempt) => rateLimitCalls.push(attempt),
      )
      expect(rateLimitCalls).toHaveLength(1)
      expect(rateLimitCalls[0]).toBe(1)
      expect(utxos).toHaveLength(1)
    })

    it('calls onRateLimitCleared after successful retry', async () => {
      let callCount = 0
      server.use(
        http.post(`${BITAILS_URL}/address/unspent/multi`, () => {
          callCount++
          if (callCount === 1) return new HttpResponse(null, { status: 429 })
          return HttpResponse.json(SAMPLE_UTXO_RESPONSE)
        })
      )

      let cleared = false
      await makeService().fetchUtxosForAddress(
        ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'],
        undefined,
        () => { cleared = true },
      )
      expect(cleared).toBe(true)
    })

    it('falls back to WhatsOnChain after max Bitails retries exceeded', async () => {
      vi.useFakeTimers()
      server.use(
        http.post(`${BITAILS_URL}/address/unspent/multi`, () =>
          new HttpResponse(null, { status: 429 })
        ),
        http.post(`${WOC_URL}/v1/bsv/main/addresses/unspent`, () =>
          HttpResponse.json(SAMPLE_WOC_UTXO_RESPONSE)
        )
      )
      const promise = makeService().fetchUtxosForAddress(['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'])
      // Advance through all retry delays (1s, 2s, 4s, 8s, 16s)
      await vi.runAllTimersAsync()
      const utxos = await promise
      expect(utxos).toHaveLength(1)
      expect(utxos[0]).toMatchObject({ txid: 'd75485c2329a533fd06b5f55a3f21644741c0258f2974d5d989e946a0bb4357f' })
      vi.useRealTimers()
    })

    it('throws when both Bitails and WhatsOnChain fail for UTXOs', async () => {
      vi.useFakeTimers()
      server.use(
        http.post(`${BITAILS_URL}/address/unspent/multi`, () =>
          new HttpResponse(null, { status: 429 })
        ),
        http.post(`${WOC_URL}/v1/bsv/main/addresses/unspent`, () =>
          new HttpResponse(null, { status: 503, statusText: 'Service Unavailable' })
        )
      )
      const promise = makeService().fetchUtxosForAddress(['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'])
      // Attach rejection handler before advancing timers to prevent unhandled rejection
      const expectation = expect(promise).rejects.toThrow('WhatsOnChain failed to fetch UTXOs')
      await vi.runAllTimersAsync()
      await expectation
      vi.useRealTimers()
    })
  })

  describe('broadcast', () => {
    it('returns BroadcastResponse from primary on success', async () => {
      const { Transaction } = await import('@bsv/sdk')
      const tx = Transaction.fromHex(SAMPLE_RAW_TX_HEX)
      server.use(
        http.post(`${BITAILS_URL}/tx/broadcast`, () =>
          HttpResponse.json({ txid: 'primary-txid' })
        )
      )
      const result = await makeService().broadcast(tx)
      expect(result).toMatchObject({ txid: 'primary-txid' })
    })

    it('falls back to WhatsOnChain when primary returns BroadcastFailure', async () => {
      const { Transaction } = await import('@bsv/sdk')
      const tx = Transaction.fromHex(SAMPLE_RAW_TX_HEX)
      server.use(
        http.post(`${BITAILS_URL}/tx/broadcast`, () =>
          HttpResponse.json({ error: { code: 500, message: 'Bitails error' } })
        ),
        http.post(`${WOC_URL}/v1/bsv/main/tx/raw`, () =>
          new HttpResponse('"fallback-txid"', { headers: { 'Content-Type': 'text/plain' } })
        )
      )
      const result = await makeService().broadcast(tx)
      expect(result).toMatchObject({ txid: 'fallback-txid' })
    })

    it('falls back to WhatsOnChain when primary throws', async () => {
      const { Transaction } = await import('@bsv/sdk')
      const tx = Transaction.fromHex(SAMPLE_RAW_TX_HEX)
      server.use(
        http.post(`${BITAILS_URL}/tx/broadcast`, () => HttpResponse.error()),
        http.post(`${WOC_URL}/v1/bsv/main/tx/raw`, () =>
          new HttpResponse('"fallback-txid"', { headers: { 'Content-Type': 'text/plain' } })
        )
      )
      const result = await makeService().broadcast(tx)
      expect(result).toMatchObject({ txid: 'fallback-txid' })
    })
  })
})
