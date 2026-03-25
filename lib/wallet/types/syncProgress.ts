export interface SyncProgress {
  message: string
  /** Total UTXOs found so far */
  utxosFound: number
  /** Total satoshis found so far */
  totalSatoshis: number
  /** Total addresses checked so far */
  totalAddressesScanned: number
  /** Set after each batch completes — accumulate these in the UI for a scan log */
  logEntry?: string
  /** True while waiting on a 429 retry */
  rateLimited?: boolean
}
