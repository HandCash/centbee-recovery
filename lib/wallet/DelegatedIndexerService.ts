import { BroadcastFailure, BroadcastResponse, Transaction } from '@bsv/sdk'
import { Utxo } from './types/utxo'
import { IndexerService } from './types/indexerService'

/**
 * Composes a primary and fallback IndexerService.
 *
 * - fetchRawTx: tries primary, falls back to secondary on failure
 * - fetchUtxosForAddress: delegates to primary with exponential backoff on 429 rate limits
 * - broadcast: tries primary, falls back to secondary on failure or broadcast failure
 */
export default class DelegatedIndexerService implements IndexerService {
    constructor(
        private readonly primary: IndexerService,
        private readonly fallback: IndexerService,
    ) {}

    async fetchRawTx(txid: string): Promise<string> {
        try {
            return await this.primary.fetchRawTx(txid)
        } catch {
            return await this.fallback.fetchRawTx(txid)
        }
    }

    async fetchUtxosForAddress(
        addresses: string[],
        onRateLimit?: (attempt: number, delayMs: number) => void,
        onRateLimitCleared?: () => void,
    ): Promise<Utxo[]> {
        const maxRetries = 5
        let delay = 1000

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const utxos = await this.primary.fetchUtxosForAddress(addresses)
                if (attempt > 0) onRateLimitCleared?.()
                return utxos
            } catch (e: any) {
                const isRateLimited = e?.message?.includes('Rate limited')
                if (!isRateLimited) return await this.fallback.fetchUtxosForAddress(addresses)
                if (attempt === maxRetries) return await this.fallback.fetchUtxosForAddress(addresses)

                onRateLimit?.(attempt + 1, delay)
                await new Promise(resolve => setTimeout(resolve, delay))
                delay *= 2
            }
        }
        // Unreachable: loop always returns or throws before exhausting retries
        return await this.fallback.fetchUtxosForAddress(addresses)
    }

    async broadcast(tx: Transaction): Promise<BroadcastResponse | BroadcastFailure> {
        try {
            const result = await this.primary.broadcast(tx)
            if ('txid' in result) return result
            return await this.fallback.broadcast(tx)
        } catch {
            return await this.fallback.broadcast(tx)
        }
    }
}
