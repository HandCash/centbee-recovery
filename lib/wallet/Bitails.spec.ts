import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import Bitails from './Bitails'
import { SAMPLE_UTXO_RESPONSE, SAMPLE_RAW_TX_HEX } from '../test-fixtures'
import { Transaction } from '@bsv/sdk'

const BITAILS_URL = 'https://api.bitails.io'

describe('Bitails', () => {
  let bitails: Bitails

  beforeEach(() => {
    bitails = new Bitails()
  })

  describe('fetchUtxosForAddress', () => {
    it('returns flattened UTXOs for multiple addresses', async () => {
      server.use(
        http.post(`${BITAILS_URL}/address/unspent/multi`, () =>
          HttpResponse.json(SAMPLE_UTXO_RESPONSE)
        )
      )
      const addresses = [
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        '12cbQLTFMXRnSzktFkuoG3eHoMeFtpTu3S',
      ]
      const utxos = await bitails.fetchUtxosForAddress(addresses)
      // SAMPLE_UTXO_RESPONSE has 1 UTXO in first address, 0 in second
      expect(utxos).toHaveLength(1)
      expect(utxos[0].txid).toBe(SAMPLE_UTXO_RESPONSE[0].unspent[0].txid)
      expect(utxos[0].satoshis).toBe(100000)
      expect(utxos[0].address).toBe('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')
    })

    it('returns empty array when no UTXOs found', async () => {
      server.use(
        http.post(`${BITAILS_URL}/address/unspent/multi`, () =>
          HttpResponse.json([{ address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', unspent: [] }])
        )
      )
      const utxos = await bitails.fetchUtxosForAddress(['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'])
      expect(utxos).toHaveLength(0)
    })

    it('throws on 429 rate limit', async () => {
      server.use(
        http.post(`${BITAILS_URL}/address/unspent/multi`, () =>
          new HttpResponse(null, { status: 429 })
        )
      )
      await expect(
        bitails.fetchUtxosForAddress(['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'])
      ).rejects.toThrow('Rate limited by Bitails')
    })

    it('throws on non-429 API error', async () => {
      server.use(
        http.post(`${BITAILS_URL}/address/unspent/multi`, () =>
          new HttpResponse(null, { status: 500, statusText: 'Internal Server Error' })
        )
      )
      await expect(
        bitails.fetchUtxosForAddress(['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'])
      ).rejects.toThrow('Failed to fetch utxos for addresses')
    })
  })

  describe('fetchRawTx', () => {
    it('fetches raw tx hex from Bitails', async () => {
      const txid = 'aabbcc'
      const rawTx = await bitails.fetchRawTx(txid)
      expect(rawTx).toBe(SAMPLE_RAW_TX_HEX)
    })

    it('throws when Bitails returns non-OK', async () => {
      server.use(
        http.get(`${BITAILS_URL}/download/tx/:txid/hex`, () =>
          new HttpResponse(null, { status: 404, statusText: 'Not Found' })
        )
      )
      await expect(bitails.fetchRawTx('missing-txid')).rejects.toThrow('Bitails failed to fetch raw transaction')
    })
  })

  describe('broadcast', () => {
    it('returns BroadcastResponse on success', async () => {
      const tx = Transaction.fromHex(SAMPLE_RAW_TX_HEX)
      const result = await bitails.broadcast(tx)
      expect('txid' in result).toBe(true)
      if ('txid' in result) {
        expect(result.txid).toMatch(/^[0-9a-f]+$/i)
      }
    })

    it('returns BroadcastFailure on API error response', async () => {
      server.use(
        http.post(`${BITAILS_URL}/tx/broadcast`, () =>
          HttpResponse.json({ error: { code: 257, message: 'Transaction already known' } })
        )
      )
      const tx = Transaction.fromHex(SAMPLE_RAW_TX_HEX)
      const result = await bitails.broadcast(tx)
      expect('code' in result).toBe(true)
      if ('code' in result) {
        expect(result.description).toBe('Transaction already known')
      }
    })
  })
})
