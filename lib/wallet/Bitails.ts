import { BroadcastFailure, BroadcastResponse, Transaction } from '@bsv/sdk'
import { Utxo } from './types/utxo'
import { IndexerService } from './types/indexerService'

/**
 * Bitails implementation of IndexerService and Broadcaster.
 */
export default class Bitails implements IndexerService {
    URL: string
    apiKey: string

    constructor(apiKey: string = process.env.NEXT_PUBLIC_BITAILS_API_KEY ?? '') {
        this.URL = `https://api.bitails.io`
        this.apiKey = apiKey
    }

    /**
     * Broadcasts a transaction via Bitails.
     * https://docs.bitails.io/#send-raw-transaction
     *
     * @param {Transaction} tx - The transaction to be broadcasted.
     * @returns {Promise<BroadcastResponse | BroadcastFailure>} A promise that resolves to either a success or failure response.
     */
    async broadcast(tx: Transaction): Promise<BroadcastResponse | BroadcastFailure> {
        const txhex = tx.toHex()

        const requestOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ raw: txhex })
        }

        try {
            let data: any = {}

            const response = await window.fetch(`${this.URL}/tx/broadcast`, requestOptions)
            data = await response.json()

            if (data.error) {
                return {
                    code: data.error.code.toString(),
                    description: data.error.message,
                } as BroadcastFailure
            }

            if (data.txid) {
                return {
                    txid: data.txid,
                    message: data.messages
                } as BroadcastResponse
            }
        } catch (e) {
            console.error(e)
        }
        return {
            code: 'unknown',
            description: 'Unknown error',
        } as BroadcastFailure
    }

    /**
     * Fetches a raw transaction from Bitails.
     * https://docs.bitails.io/#download-transaction
     *
     * @param {string} txid - The transaction id.
     * @returns {Promise<string>} A promise that resolves to the raw transaction.
     */
    async fetchRawTx(txid: string): Promise<string> {
        const headers: Record<string, string> = {}
        if (this.apiKey) headers['apikey'] = this.apiKey

        const response = await window.fetch(`${this.URL}/download/tx/${txid}/hex`, {
          method: 'GET',
          headers,
        });
        if (!response.ok) {
          throw new Error(`Bitails failed to fetch raw transaction: ${response.statusText}`);
        }
        return (await response.text()).trim();
      }

      /**
     * Fetches UTXOs for a batch of addresses in a single request using the Bitails
     * multi-address unspent endpoint (`POST /address/unspent/multi`).
     *
     * The API returns an array of objects, one per address, each containing an
     * `unspent` array of UTXOs for that address. Addresses with no UTXOs are
     * included in the response with an empty `unspent` array. The response is
     * flattened so the caller receives a single list of UTXOs across all addresses.
     *
     * https://docs.bitails.io/#get-unspent-of-address
     *
     * @param {string[]} addresses - BSV addresses to query (sent as `{ addresses }` in POST body)
     * @returns {Promise<Utxo[]>} Flat list of UTXOs across all queried addresses
     */
      async fetchUtxosForAddress(addresses: string[]): Promise<Utxo[]> {
        const response = await window.fetch(`${this.URL}/address/unspent/multi`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addresses }),
        })

        if (response.status === 429) {
          throw new Error('Rate limited by Bitails')
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch utxos for addresses: ${response.statusText}`)
        }

        const data = await response.json()
        return data.map((item: any) => item.unspent.map((utxo: any): Utxo => ({
          address: item.address,
          txid: utxo.txid,
          vout: utxo.vout,
          satoshis: utxo.satoshis,
          height: utxo.blockheight,
        }))).flat()
      }
}