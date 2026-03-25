// Test fixtures — all data is synthetic and safe for use in tests.
// These mnemonics are NOT real wallets. Do not use for real funds.

export const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

export const TEST_PIN = '1234'

// A minimal valid UTXO batch response matching the Bitails /address/unspent/multi format
export const SAMPLE_UTXO_RESPONSE = [
  {
    address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    unspent: [
      {
        txid: 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
        vout: 0,
        satoshis: 100000,
        blockheight: 700000,
      },
    ],
  },
  {
    address: '12cbQLTFMXRnSzktFkuoG3eHoMeFtpTu3S',
    unspent: [],
  },
]

// Minimal raw transaction hex (coinbase tx from block 0 — publicly known)
export const SAMPLE_RAW_TX_HEX =
  '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff4d04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73ffffffff0100f2052a01000000434104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac00000000'

export const SAMPLE_TXID = 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899'

// A minimal valid UTXO batch response matching the WhatsOnChain /addresses/unspent format
export const SAMPLE_WOC_UTXO_RESPONSE = [
  {
    address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    result: [
      {
        tx_hash: 'd75485c2329a533fd06b5f55a3f21644741c0258f2974d5d989e946a0bb4357f',
        tx_pos: 0,
        value: 100000,
        height: 700000,
      },
    ],
    error: '',
  },
  {
    address: '12cbQLTFMXRnSzktFkuoG3eHoMeFtpTu3S',
    result: [],
    error: '',
  },
]
