import { BroadcastFailure, BroadcastResponse, Transaction } from '@bsv/sdk'
import { Utxo } from './types/utxo'
import { IndexerService } from './types/indexerService'

/**
 * WhatsOnChain implementation of IndexerService.
 * Supports raw transaction fetching, broadcasting, and bulk UTXO fetching.
 */
export default class WhatsOnChain implements IndexerService {
    readonly URL = 'https://api.whatsonchain.com/v1/bsv/main'

    async fetchRawTx(txid: string): Promise<string> {
        const response = await window.fetch(`${this.URL}/tx/${txid}/hex`, {
            method: 'GET',
        })
        if (!response.ok) {
            throw new Error(`WhatsOnChain failed to fetch raw transaction: ${response.statusText}`)
        }
        return (await response.text()).trim()
    }

    // WoC bulk endpoint supports max 20 addresses per request and returns max 20 UTXOs
    // per address with no pagination support. Addresses with >20 UTXOs will be truncated.
    private static readonly MAX_ADDRESSES_PER_REQUEST = 20

    async fetchUtxosForAddress(addresses: string[]): Promise<Utxo[]> {
        const allUtxos: Utxo[] = []
        for (let i = 0; i < addresses.length; i += WhatsOnChain.MAX_ADDRESSES_PER_REQUEST) {
            const chunk = addresses.slice(i, i + WhatsOnChain.MAX_ADDRESSES_PER_REQUEST)
            const utxos = await this.fetchChunk(chunk)
            allUtxos.push(...utxos)
        }
        return allUtxos
    }

    private async fetchChunk(addresses: string[]): Promise<Utxo[]> {
        const response = await window.fetch(`${this.URL}/addresses/unspent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ addresses }),
        })

        if (!response.ok) {
            throw new Error(`WhatsOnChain failed to fetch UTXOs: ${response.statusText}`)
        }

        const data = await response.json()
        if (!Array.isArray(data)) return []
        return data
            .filter((item: any) => item !== null)
            .flatMap((item: any) =>
                (item.result ?? []).map((utxo: any): Utxo => ({
                    address: item.address,
                    txid: utxo.tx_hash,
                    vout: utxo.tx_pos,
                    satoshis: utxo.value,
                    height: utxo.height,
                }))
            )
    }

    async broadcast(tx: Transaction): Promise<BroadcastResponse | BroadcastFailure> {
        const txhex = tx.toHex()

        try {
            const response = await window.fetch(`${this.URL}/tx/raw`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ txhex }),
            })

            const text = (await response.text()).trim()

            if (!response.ok) {
                return { code: response.status.toString(), description: text } as BroadcastFailure
            }

            return { txid: text.replace(/"/g, ''), message: 'broadcast successful' } as BroadcastResponse
        } catch (e: any) {
            return { code: 'unknown', description: e?.message ?? 'Unknown error' } as BroadcastFailure
        }
    }
}
