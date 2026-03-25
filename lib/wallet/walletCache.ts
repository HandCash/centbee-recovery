import { Transaction } from "@bsv/sdk";

export class WalletCache {
    private cache: Map<string, any> = new Map();

    getTransactionById(txid: string): Transaction | undefined {
        const rawTx = this.cache.get(txid);
        if (!rawTx) {
            return undefined;
        }
        return Transaction.fromHex(rawTx);
    }

    setTransaction(transaction: Transaction) {
        this.cache.set(transaction.id('hex'), transaction.toHex());
    }
}
