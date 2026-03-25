import { describe, it, expect } from 'vitest'

// Fee model constants (mirror values from walletClient.ts)
const FEE_RATE_IN_SATOSHIS_PER_BYTE = 100
const FEE_PER_P2PKH_INPUT = 148
const FEE_PER_P2PKH_OUTPUT = 34
const FEE_OVERHEAD = 10

function calculateFee(inputCount: number, outputCount: number): number {
  return (
    (inputCount * FEE_PER_P2PKH_INPUT + outputCount * FEE_PER_P2PKH_OUTPUT + FEE_OVERHEAD) *
    FEE_RATE_IN_SATOSHIS_PER_BYTE
  )
}

describe('Transaction fee calculation (100 sat/byte P2PKH model)', () => {
  it('calculates fee for 1 input, 1 output', () => {
    // (1*148 + 1*34 + 10) * 100 = 192 * 100 = 19200
    const fee = calculateFee(1, 1)
    expect(fee).toBe(19200)
  })

  it('calculates fee for 2 inputs, 2 outputs', () => {
    // (2*148 + 2*34 + 10) * 100 = 374 * 100 = 37400
    const fee = calculateFee(2, 2)
    expect(fee).toBe(37400)
  })

  it('calculates fee for 5 inputs, 1 output (sweep)', () => {
    // (5*148 + 1*34 + 10) * 100 = 784 * 100 = 78400
    const fee = calculateFee(5, 1)
    expect(fee).toBe(78400)
  })

  it('fee increases linearly with inputs', () => {
    const fee1 = calculateFee(1, 1)
    const fee2 = calculateFee(2, 1)
    expect(fee2 - fee1).toBe(FEE_PER_P2PKH_INPUT * FEE_RATE_IN_SATOSHIS_PER_BYTE)
  })

  it('fee increases linearly with outputs', () => {
    const fee1 = calculateFee(1, 1)
    const fee2 = calculateFee(1, 2)
    expect(fee2 - fee1).toBe(FEE_PER_P2PKH_OUTPUT * FEE_RATE_IN_SATOSHIS_PER_BYTE)
  })

  it('minimum fee for 1 input/1 output is 19200 satoshis', () => {
    expect(calculateFee(1, 1)).toBe(19200)
  })

  it('WalletClient.sendAll rejects when balance does not exceed fee', async () => {
    const { WalletClient } = await import('../../lib/wallet/walletClient')
    const { TEST_MNEMONIC, TEST_PIN } = await import('../../lib/test-fixtures')
    const wallet = WalletClient.fromMnemonic(TEST_MNEMONIC, TEST_PIN)

    const utxos = [
      {
        txid: 'abc',
        vout: 0,
        satoshis: 100, // way too small to cover fee
        address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        height: 700000,
        derivationPath: "m/44'/0/0/0",
      },
    ]

    await expect(
      wallet.sendAll(utxos, '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')
    ).rejects.toThrow('Insufficient funds')
  })

  it('WalletClient.sendAll rejects when no UTXOs provided', async () => {
    const { WalletClient } = await import('../../lib/wallet/walletClient')
    const { TEST_MNEMONIC, TEST_PIN } = await import('../../lib/test-fixtures')
    const wallet = WalletClient.fromMnemonic(TEST_MNEMONIC, TEST_PIN)
    await expect(wallet.sendAll([], '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).rejects.toThrow('No UTXOs provided')
  })
})
