import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  WalletClient,
  importWallet,
  getWallet,
  clearWallet,
  createWallet,
  syncWallet,
} from './walletClient'
import { TEST_MNEMONIC, TEST_PIN } from '../test-fixtures'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'

describe('WalletClient', () => {
  afterEach(() => {
    clearWallet()
    vi.restoreAllMocks()
  })

  describe('validateMnemonic', () => {
    it('returns true for valid English mnemonic', () => {
      expect(WalletClient.validateMnemonic(TEST_MNEMONIC)).toBe(true)
    })

    it('returns false for invalid mnemonic', () => {
      expect(WalletClient.validateMnemonic('invalid mnemonic phrase')).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(WalletClient.validateMnemonic('')).toBe(false)
    })

    it('returns false for mnemonic with wrong words', () => {
      expect(WalletClient.validateMnemonic('notaword notaword notaword notaword notaword notaword notaword notaword notaword notaword notaword notaword')).toBe(false)
    })
  })

  describe('fromMnemonic', () => {
    it('creates wallet from valid mnemonic and PIN', () => {
      const wallet = WalletClient.fromMnemonic(TEST_MNEMONIC, TEST_PIN)
      expect(wallet).toBeInstanceOf(WalletClient)
    })

    it('throws on invalid mnemonic', () => {
      expect(() => WalletClient.fromMnemonic('bad mnemonic', TEST_PIN)).toThrow('Invalid mnemonic')
    })

    it('produces the same keys for same mnemonic + PIN combination', () => {
      const wallet1 = WalletClient.fromMnemonic(TEST_MNEMONIC, TEST_PIN)
      const wallet2 = WalletClient.fromMnemonic(TEST_MNEMONIC, TEST_PIN)
      expect(wallet1.getXpub()).toBe(wallet2.getXpub())
    })

    it('produces different keys for same mnemonic with different PINs', () => {
      const wallet1 = WalletClient.fromMnemonic(TEST_MNEMONIC, '1234')
      const wallet2 = WalletClient.fromMnemonic(TEST_MNEMONIC, '5678')
      expect(wallet1.getXpub()).not.toBe(wallet2.getXpub())
    })

    it('returns the stored mnemonic string', () => {
      const wallet = WalletClient.fromMnemonic(TEST_MNEMONIC, TEST_PIN)
      expect(wallet.getMnemonic()).toBe(TEST_MNEMONIC)
    })
  })

  describe('deriveChild', () => {
    it('derives external chain address at index 0', () => {
      const wallet = WalletClient.fromMnemonic(TEST_MNEMONIC, TEST_PIN)
      const child = wallet.deriveChild("m/44'/0/0/0")
      expect(child).toBeDefined()
      expect(child.pubKey).toBeDefined()
    })

    it('derives change chain address at index 0', () => {
      const wallet = WalletClient.fromMnemonic(TEST_MNEMONIC, TEST_PIN)
      const child = wallet.deriveChild("m/44'/0/1/0")
      expect(child).toBeDefined()
    })

    it('derives different addresses for different indices', () => {
      const wallet = WalletClient.fromMnemonic(TEST_MNEMONIC, TEST_PIN)
      const child0 = wallet.deriveChild("m/44'/0/0/0")
      const child1 = wallet.deriveChild("m/44'/0/0/1")
      expect(child0.pubKey.toString()).not.toBe(child1.pubKey.toString())
    })
  })

  describe('singleton functions', () => {
    it('getWallet returns null initially', () => {
      expect(getWallet()).toBeNull()
    })

    it('importWallet sets singleton', () => {
      importWallet(TEST_MNEMONIC, TEST_PIN)
      expect(getWallet()).not.toBeNull()
    })

    it('clearWallet removes singleton', () => {
      importWallet(TEST_MNEMONIC, TEST_PIN)
      clearWallet()
      expect(getWallet()).toBeNull()
    })

    it('createWallet creates a new random wallet', () => {
      const wallet = createWallet()
      expect(wallet).toBeDefined()
      expect(getWallet()).toBe(wallet)
    })
  })

  describe('syncWallet', () => {
    it('throws when no wallet and no localStorage', async () => {
      vi.spyOn(localStorage, 'getItem').mockReturnValue(null)
      await expect(syncWallet(25, 25)).rejects.toThrow('Wallet not found')
    })

    it('rehydrates wallet from localStorage if singleton missing', async () => {
      localStorage.setItem('wallet_mnemonic', TEST_MNEMONIC)
      localStorage.setItem('wallet_pin', TEST_PIN)
      // Use very small gap limit so test finishes fast
      const utxos = await syncWallet(25, 25)
      expect(Array.isArray(utxos)).toBe(true)
      localStorage.clear()
    })

    it('calls onProgress with scan updates', async () => {
      importWallet(TEST_MNEMONIC, TEST_PIN)
      const progressEvents: string[] = []
      await syncWallet(25, 25, (p) => progressEvents.push(p.message))
      expect(progressEvents.length).toBeGreaterThan(0)
    })

    it('returns UTXOs when API finds funds', async () => {
      importWallet(TEST_MNEMONIC, TEST_PIN)
      let callCount = 0
      server.use(
        http.post('https://api.bitails.io/address/unspent/multi', async ({ request }) => {
          const body = await (request.json() as Promise<{ addresses: string[] }>)
          callCount++
          return HttpResponse.json(
            body.addresses.map((address, i) => ({
              address,
              unspent:
                callCount === 1 && i === 0
                  ? [{ txid: 'aabbcc', vout: 0, satoshis: 100000, blockheight: 700000 }]
                  : [],
            }))
          )
        })
      )
      const utxos = await syncWallet(25, 25)
      expect(utxos.length).toBeGreaterThan(0)
    })
  })
})
