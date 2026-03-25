import { describe, it, expect, beforeEach } from 'vitest'
import { WalletCache } from './walletCache'
import { Transaction } from '@bsv/sdk'
import { SAMPLE_RAW_TX_HEX } from '../test-fixtures'

describe('WalletCache', () => {
  let cache: WalletCache

  beforeEach(() => {
    cache = new WalletCache()
  })

  describe('getTransactionById', () => {
    it('returns undefined for unknown txid', () => {
      const result = cache.getTransactionById('nonexistent')
      expect(result).toBeUndefined()
    })

    it('returns stored transaction by txid', () => {
      const tx = Transaction.fromHex(SAMPLE_RAW_TX_HEX)
      cache.setTransaction(tx)
      const txid = tx.id('hex')
      const retrieved = cache.getTransactionById(txid)
      expect(retrieved).toBeDefined()
      expect(retrieved!.id('hex')).toBe(txid)
    })
  })

  describe('setTransaction', () => {
    it('stores transaction and makes it retrievable', () => {
      const tx = Transaction.fromHex(SAMPLE_RAW_TX_HEX)
      const txid = tx.id('hex')
      cache.setTransaction(tx)
      expect(cache.getTransactionById(txid)).toBeDefined()
    })

    it('is idempotent when storing the same transaction twice', () => {
      const tx = Transaction.fromHex(SAMPLE_RAW_TX_HEX)
      cache.setTransaction(tx)
      cache.setTransaction(tx)
      const txid = tx.id('hex')
      expect(cache.getTransactionById(txid)).toBeDefined()
    })

    it('does not make unrelated txids retrievable', () => {
      const tx = Transaction.fromHex(SAMPLE_RAW_TX_HEX)
      cache.setTransaction(tx)
      expect(cache.getTransactionById('other-txid')).toBeUndefined()
    })
  })
})
