import { Broadcaster } from '@bsv/sdk'
import { Utxo } from './utxo'

export interface IndexerService extends Broadcaster {
  fetchRawTx(txid: string): Promise<string>
  fetchUtxosForAddress(
    addresses: string[],
    onRateLimit?: (attempt: number, delayMs: number) => void,
    onRateLimitCleared?: () => void,
  ): Promise<Utxo[]>
}
