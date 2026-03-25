'use client'

import { HD, Mnemonic, Transaction, P2PKH, SatoshisPerKilobyte } from '@bsv/sdk'
import Bitails from './Bitails'
import WhatsOnChain from './WhatsOnChain'
import DelegatedIndexerService from './DelegatedIndexerService'
import { IndexerService } from './types/indexerService'
import { WalletCache } from './walletCache'
import { Utxo } from './types/utxo'
import { SyncProgress } from './types/syncProgress'
import { detectMnemonicLanguage, MnemonicLanguage } from './detectMnemonicLanguage'
import { chineseSimplifiedWordList } from './wordlists/chinese-simplified'
import { frenchWordList } from './wordlists/french'
import { italianWordList } from './wordlists/italian'
import { japaneseWordList } from './wordlists/japanese'
import { spanishWordList } from './wordlists/spanish'

const FEE_RATE_IN_SATOSHIS_PER_BYTE = 100
const FEE_PER_P2PKH_INPUT = 148
const FEE_PER_P2PKH_OUTPUT = 34
const FEE_OVERHEAD = 10
// Courtesy delay between address-batch requests to avoid hammering the Bitails API
const BATCH_REQUEST_DELAY_MS = 200

/**
 * Returns the appropriate wordlist for a given language.
 * If no language is provided, auto-detects from the mnemonic content.
 * Returns undefined for English (uses the SDK's built-in default wordlist).
 */
function getWordlist(mnemonic: string, language?: MnemonicLanguage) {
  const lang = language ?? detectMnemonicLanguage(mnemonic)
  switch (lang) {
    case 'chinese-simplified': return chineseSimplifiedWordList
    case 'french': return frenchWordList
    case 'italian': return italianWordList
    case 'japanese': return japaneseWordList
    case 'spanish': return spanishWordList
    default: return undefined // undefined = use SDK default (English)
  }
}

export class WalletClient {
  private hdPrivateKey: HD
  private mnemonic: string
  private cache: WalletCache
  private indexer: IndexerService

  private constructor(hdPrivateKey: HD, mnemonic: string) {
    this.hdPrivateKey = hdPrivateKey
    this.mnemonic = mnemonic
    this.cache = new WalletCache()
    this.indexer = new DelegatedIndexerService(new Bitails(), new WhatsOnChain())
  }

  static createNew(): WalletClient {
    const mnemonic = Mnemonic.fromRandom()
    const hdPrivateKey = HD.fromSeed(mnemonic.toSeed())
    return new WalletClient(hdPrivateKey, mnemonic.toString())
  }

  static fromMnemonic(mnemonicString: string, pin: string, language?: MnemonicLanguage): WalletClient {
    if (!WalletClient.validateMnemonic(mnemonicString, language)) {
      throw new Error('Invalid mnemonic')
    }
    const wordlist = getWordlist(mnemonicString, language)
    const mnemonic = wordlist
      ? new Mnemonic(mnemonicString, undefined, wordlist)
      : Mnemonic.fromString(mnemonicString)
    const hdPrivateKey = HD.fromSeed(mnemonic.toSeed(pin))
    return new WalletClient(hdPrivateKey, mnemonicString)
  }

  static validateMnemonic(mnemonic: string, language?: MnemonicLanguage): boolean {
    try {
      const wordlist = getWordlist(mnemonic, language)
      const m = wordlist
        ? new Mnemonic(mnemonic, undefined, wordlist)
        : new Mnemonic(mnemonic)
      return m.isValid()
    } catch {
      return false
    }
  }

  deriveChild(path: string): HD {
    return this.hdPrivateKey.derive(path)
  }

  getMnemonic(): string {
    return this.mnemonic
  }

  getXpub(): string {
    return this.hdPrivateKey.toPublic().toString()
  }

  async fetchUtxosForAddress(
    addresses: string[],
    onRateLimit?: (attempt: number, delayMs: number) => void,
    onRateLimitCleared?: () => void,
  ): Promise<Utxo[]> {
    return this.indexer.fetchUtxosForAddress(addresses, onRateLimit, onRateLimitCleared)
  }

  /**
   * Builds, signs, and broadcasts a "sweep" transaction that spends all provided UTXOs
   * to a single destination address.
   *
   * Fee is calculated manually before signing:
   *   fee = (inputs × 148 + outputs × 34 + 10) × 100 sat/byte
   *
   * The source transaction for each UTXO is required by @bsv/sdk to construct the
   * unlocking script. It is fetched from Bitails and cached to avoid redundant requests.
   *
   * Throws if:
   * - No UTXOs are provided
   * - Total input value is less than the estimated fee (balance too low to cover fees)
   *
   * @param utxos - UTXOs to spend, each must have a `derivationPath` set
   * @param destinationAddress - BSV address to receive all funds minus fee
   * @returns The broadcast transaction ID (hex)
   */
  async sendAll(utxos: Utxo[], destinationAddress: string): Promise<string> {
    if (!utxos.length) {
      throw new Error('No UTXOs provided')
    }

    const totalInputInSatoshis = utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0)
    const totalOutputs = 1

    // Conservative early-exit guard only — actual fee is determined by the SDK below via tx.fee()
    const estimatedFee =
      (utxos.length * FEE_PER_P2PKH_INPUT + totalOutputs * FEE_PER_P2PKH_OUTPUT + FEE_OVERHEAD) *
      FEE_RATE_IN_SATOSHIS_PER_BYTE

    if (totalInputInSatoshis <= estimatedFee) {
      throw new Error(`Insufficient funds: balance (${totalInputInSatoshis} satoshis) does not exceed estimated fee (${estimatedFee} satoshis)`)
    }

    // Create transaction
    const tx = new Transaction()

    // Add inputs
    for (const utxo of utxos) {
      if (!utxo.derivationPath) {
        throw new Error(`UTXO ${utxo.txid}:${utxo.vout} is missing a derivation path and cannot be signed`)
      }
      let sourceTransaction = this.cache.getTransactionById(utxo.txid)
      if (!sourceTransaction) {
        const rawTx = await this.indexer.fetchRawTx(utxo.txid)
        sourceTransaction = Transaction.fromHex(rawTx)
        this.cache.setTransaction(sourceTransaction)
      }
      tx.addInput({
        sourceTransaction,
        sourceOutputIndex: utxo.vout,
        unlockingScriptTemplate: new P2PKH().unlock(this.hdPrivateKey.derive(utxo.derivationPath).privKey),
      })
    }

    // Add outputs
    tx.addOutput({
      lockingScript: new P2PKH().lock(destinationAddress),
      change: true,
    })

    await tx.fee(new SatoshisPerKilobyte(FEE_RATE_IN_SATOSHIS_PER_BYTE * 1000))
    await tx.sign()
    const broadcastResult = await tx.broadcast(this.indexer)
    if ('code' in broadcastResult) {
      throw new Error(`Broadcast failed: ${broadcastResult.description}`)
    }
    return tx.id('hex')
  }
}

// Create a singleton instance for the client-side wallet
let walletInstance: WalletClient | null = null

export function getWallet(): WalletClient | null {
  return walletInstance
}

export function createWallet(): WalletClient {
  walletInstance = WalletClient.createNew()
  return walletInstance
}

export function importWallet(mnemonic: string, pin: string, language?: MnemonicLanguage): WalletClient {
  walletInstance = WalletClient.fromMnemonic(mnemonic, pin, language)
  return walletInstance
}

export function clearWallet(): void {
  walletInstance = null
}

/**
 * Scans the blockchain for UTXOs belonging to the current wallet singleton.
 *
 * Addresses are derived for both the external chain (chain 0, receiving addresses)
 * and the internal chain (chain 1, change addresses), following the BIP44 path
 * `m/44'/0/${chain}/${index}`.
 *
 * Scanning works in two nested levels:
 * - `batchSize` (default 25): how many addresses are queried per API request.
 * - `gapLimit` (default 3500): the maximum number of consecutive unused addresses
 *   to tolerate before stopping. Scanning stops on a chain as soon as `gapLimit`
 *   addresses in a row return no UTXOs. Funds beyond that gap will be missed.
 *
 * A 200ms delay is inserted between batch requests to avoid rate-limiting by Bitails.
 *
 * @param gapLimit - Max consecutive unused addresses before stopping (default: 3500)
 * @param batchSize - Number of addresses per API request (default: 25)
 * @returns All discovered UTXOs with their derivation paths attached
 * @throws If no wallet singleton exists (call `importWallet` first)
 */
export type { SyncProgress }

export async function syncWallet(
  gapLimit = 3500,
  batchSize = 25,
  onProgress?: (progress: SyncProgress) => void,
): Promise<Utxo[]> {
  const results: Utxo[] = []
  let totalAddressesScanned = 0

  let walletOrNull = getWallet()
  if (!walletOrNull) {
    const storedMnemonic = localStorage.getItem('wallet_mnemonic')
    const storedPin = localStorage.getItem('wallet_pin')
    if (storedMnemonic && storedPin) {
      walletOrNull = importWallet(storedMnemonic, storedPin)
    } else {
      throw new Error('Wallet not found')
    }
  }
  const wallet: WalletClient = walletOrNull

  const chainLabels: Record<number, string> = { 0: 'receive', 1: 'change' }

  for (const chain of [0, 1]) {
    let childIndex = 0
    const derivationPaths: Record<string, string> = {}
    let consecutiveEmpty = 0

    while (consecutiveEmpty < gapLimit) {
      const startIndex = childIndex
      const endIndex = childIndex + batchSize - 1

      onProgress?.({
        message: `Scanning ${chainLabels[chain]} addresses ${startIndex}–${endIndex} (m/44'/0/${chain}/${startIndex} … m/44'/0/${chain}/${endIndex})…`,
        utxosFound: results.length,
        totalSatoshis: results.reduce((s, u) => s + u.satoshis, 0),
        totalAddressesScanned,
      })

      const addresses = Array.from({ length: batchSize }, (_, i) => {
        const path = `m/44'/0/${chain}/${childIndex + i}`
        const child = wallet.deriveChild(path)
        const address = child.pubKey.toAddress().toString()
        derivationPaths[address] = path
        return address
      })
      childIndex += batchSize

      await new Promise(resolve => setTimeout(resolve, BATCH_REQUEST_DELAY_MS))
      const utxos = await wallet.fetchUtxosForAddress(
        addresses,
        (attempt, delayMs) => {
          onProgress?.({
            message: `Rate limited — retrying in ${delayMs / 1000}s (attempt ${attempt} of 5)…`,
            utxosFound: results.length,
            totalSatoshis: results.reduce((s, u) => s + u.satoshis, 0),
            totalAddressesScanned,
            rateLimited: true,
          })
        },
        () => {
          onProgress?.({
            message: 'Rate limit cleared, continuing scan…',
            utxosFound: results.length,
            totalSatoshis: results.reduce((s, u) => s + u.satoshis, 0),
            totalAddressesScanned,
            rateLimited: false,
          })
        },
      )

      const addressesWithUtxos = new Set(utxos.map(u => u.address))
      for (const addr of addresses) {
        if (addressesWithUtxos.has(addr)) {
          consecutiveEmpty = 0
        } else {
          consecutiveEmpty++
        }
      }

      for (const utxo of utxos) {
        results.push({
          ...utxo,
          derivationPath: derivationPaths[utxo.address],
        })
      }

      totalAddressesScanned += batchSize

      const logEntry = utxos.length > 0
        ? `✓ ${chainLabels[chain]} [${startIndex}–${endIndex}]: ${utxos.length} UTXO${utxos.length !== 1 ? 's' : ''} found (gap reset)`
        : `– ${chainLabels[chain]} [${startIndex}–${endIndex}]: empty (${consecutiveEmpty}/${gapLimit} gap)`

      onProgress?.({
        message: utxos.length > 0
          ? `Found ${utxos.length} UTXO${utxos.length !== 1 ? 's' : ''}, continuing…`
          : `No UTXOs in ${chainLabels[chain]} batch (${consecutiveEmpty}/${gapLimit} consecutive empty)`,
        utxosFound: results.length,
        totalSatoshis: results.reduce((s, u) => s + u.satoshis, 0),
        totalAddressesScanned,
        logEntry,
      })
    }
  }

  onProgress?.({
    message: 'Scan complete',
    utxosFound: results.length,
    totalSatoshis: results.reduce((s, u) => s + u.satoshis, 0),
    totalAddressesScanned,
    logEntry: `Done — ${totalAddressesScanned} addresses scanned, ${results.length} UTXO${results.length !== 1 ? 's' : ''} found`,
  })
  return results
}