import { describe, it, expect, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import WhatsOnChain from './WhatsOnChain'
import { SAMPLE_WOC_UTXO_RESPONSE } from '../test-fixtures'

const WOC_URL = 'https://api.whatsonchain.com/v1/bsv/main'

describe('WhatsOnChain', () => {
  let woc: WhatsOnChain

  woc = new WhatsOnChain()

  describe('fetchRawTx', () => {
    it('returns raw tx hex on success', async () => {
      server.use(
        http.get(`${WOC_URL}/tx/:txid/hex`, () =>
          new HttpResponse('  aabbccddeeff  ', { headers: { 'Content-Type': 'text/plain' } })
        )
      )
      const result = await woc.fetchRawTx('aabbcc')
      expect(result).toBe('aabbccddeeff')
    })

    it('throws when API returns non-OK', async () => {
      server.use(
        http.get(`${WOC_URL}/tx/:txid/hex`, () =>
          new HttpResponse(null, { status: 404, statusText: 'Not Found' })
        )
      )
      await expect(woc.fetchRawTx('missing')).rejects.toThrow(
        'WhatsOnChain failed to fetch raw transaction'
      )
    })
  })

  describe('fetchUtxosForAddress', () => {
    it('returns mapped UTXOs on success', async () => {
      server.use(
        http.post(`${WOC_URL}/addresses/unspent`, () =>
          HttpResponse.json(SAMPLE_WOC_UTXO_RESPONSE)
        )
      )
      const utxos = await woc.fetchUtxosForAddress([
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        '12cbQLTFMXRnSzktFkuoG3eHoMeFtpTu3S',
      ])
      expect(utxos).toHaveLength(1)
      expect(utxos[0]).toMatchObject({
        address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        txid: 'd75485c2329a533fd06b5f55a3f21644741c0258f2974d5d989e946a0bb4357f',
        vout: 0,
        satoshis: 100000,
        height: 700000,
      })
    })

    it('throws when API returns non-OK', async () => {
      server.use(
        http.post(`${WOC_URL}/addresses/unspent`, () =>
          new HttpResponse(null, { status: 503, statusText: 'Service Unavailable' })
        )
      )
      await expect(
        woc.fetchUtxosForAddress(['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'])
      ).rejects.toThrow('WhatsOnChain failed to fetch UTXOs')
    })

    it('handles null entries in response without throwing', async () => {
      server.use(
        http.post(`${WOC_URL}/addresses/unspent`, () =>
          HttpResponse.json([
            null,
            {
              address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
              result: [
                { tx_hash: 'aabb', tx_pos: 0, value: 5000, height: 800000 },
              ],
              error: '',
            },
            null,
          ])
        )
      )
      const utxos = await woc.fetchUtxosForAddress(['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'])
      expect(utxos).toHaveLength(1)
      expect(utxos[0]).toMatchObject({ address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', satoshis: 5000 })
    })

    it('splits >20 addresses into multiple requests with correct chunk sizes', async () => {
      const requestBodies: string[][] = []
      server.use(
        http.post(`${WOC_URL}/addresses/unspent`, async ({ request }) => {
          const body = await request.json() as { addresses: string[] }
          requestBodies.push(body.addresses)
          return HttpResponse.json([])
        })
      )

      const addresses = Array.from({ length: 25 }, (_, i) => `addr${i}`)
      await woc.fetchUtxosForAddress(addresses)

      expect(requestBodies).toHaveLength(2)
      expect(requestBodies[0]).toHaveLength(20)
      expect(requestBodies[1]).toHaveLength(5)
    })

    it('sends exactly 1 request for exactly 20 addresses', async () => {
      const handler = vi.fn(() => HttpResponse.json([]))
      server.use(http.post(`${WOC_URL}/addresses/unspent`, handler))

      const addresses = Array.from({ length: 20 }, (_, i) => `addr${i}`)
      await woc.fetchUtxosForAddress(addresses)

      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('returns empty array for empty input without making requests', async () => {
      const handler = vi.fn(() => HttpResponse.json([]))
      server.use(http.post(`${WOC_URL}/addresses/unspent`, handler))

      const utxos = await woc.fetchUtxosForAddress([])

      expect(utxos).toEqual([])
      expect(handler).not.toHaveBeenCalled()
    })

    it('returns empty array when API response is not an array', async () => {
      server.use(
        http.post(`${WOC_URL}/addresses/unspent`, () =>
          HttpResponse.json({ error: 'unexpected format' })
        )
      )
      const utxos = await woc.fetchUtxosForAddress(['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'])
      expect(utxos).toEqual([])
    })
  })

  describe('broadcast', () => {
    it('returns BroadcastResponse with txid on success', async () => {
      const { Transaction } = await import('@bsv/sdk')
      const { SAMPLE_RAW_TX_HEX } = await import('../test-fixtures')
      const tx = Transaction.fromHex(SAMPLE_RAW_TX_HEX)
      server.use(
        http.post(`${WOC_URL}/tx/raw`, () =>
          new HttpResponse('"abc123txid"', { headers: { 'Content-Type': 'text/plain' } })
        )
      )
      const result = await woc.broadcast(tx)
      expect(result).toMatchObject({ txid: 'abc123txid' })
    })

    it('returns BroadcastFailure on non-OK response', async () => {
      const { Transaction } = await import('@bsv/sdk')
      const { SAMPLE_RAW_TX_HEX } = await import('../test-fixtures')
      const tx = Transaction.fromHex(SAMPLE_RAW_TX_HEX)
      server.use(
        http.post(`${WOC_URL}/tx/raw`, () =>
          new HttpResponse('Transaction already in mempool', { status: 400 })
        )
      )
      const result = await woc.broadcast(tx)
      expect(result).toMatchObject({ code: '400', description: 'Transaction already in mempool' })
    })

    it('returns BroadcastFailure on network error', async () => {
      const { Transaction } = await import('@bsv/sdk')
      const { SAMPLE_RAW_TX_HEX } = await import('../test-fixtures')
      const tx = Transaction.fromHex(SAMPLE_RAW_TX_HEX)
      server.use(
        http.post(`${WOC_URL}/tx/raw`, () => HttpResponse.error())
      )
      const result = await woc.broadcast(tx)
      expect(result).toMatchObject({ code: 'unknown' })
    })
  })
})
