/**
 * Detects the language of a BIP39 mnemonic phrase.
 *
 * Language detection strategy:
 * - CJK Unified Ideographs (\u4e00–\u9fff) → Chinese Simplified
 * - Hiragana (\u3041–\u3096) → Japanese
 * - Latin scripts: majority-vote each word against English, French, Italian,
 *   and Spanish wordlists. The language with the most matching words wins;
 *   English wins ties and is the final fallback.
 *
 * Majority voting is required because some words (e.g. "abandon") appear in
 * multiple BIP39 wordlists. A genuine French/Italian/Spanish mnemonic will
 * have more words matching its own wordlist than any other.
 *
 * Source: BIP39 Standard (https://github.com/trezor/python-mnemonic)
 */

import { Mnemonic } from '@bsv/sdk'
import { frenchWordList } from './wordlists/french'
import { italianWordList } from './wordlists/italian'
import { spanishWordList } from './wordlists/spanish'

export type MnemonicLanguage = 'english' | 'chinese-simplified' | 'french' | 'italian' | 'japanese' | 'spanish'

// Build word sets at module load time for O(1) per-word lookup.
// English wordlist is sourced from the SDK's default Mnemonic wordlist.
const englishSet = new Set(new Mnemonic().Wordlist.value)
const frenchSet = new Set(frenchWordList.value)
const italianSet = new Set(italianWordList.value)
const spanishSet = new Set(spanishWordList.value)

/**
 * Detects the language of a mnemonic phrase.
 *
 * For non-Latin scripts, detection is based on Unicode character ranges.
 * For Latin scripts, each word votes for the language(s) whose wordlist
 * contains it; the language with the most votes wins. English wins ties.
 *
 * @param mnemonic - The mnemonic phrase to analyze (space-separated words)
 * @returns The detected language, or 'english' as default
 */
export function detectMnemonicLanguage(mnemonic: string): MnemonicLanguage {
  if (!mnemonic || typeof mnemonic !== 'string') {
    return 'english'
  }

  // CJK Unified Ideographs → Chinese Simplified
  if (/[\u4e00-\u9fff]/.test(mnemonic)) {
    return 'chinese-simplified'
  }

  // Hiragana → Japanese
  if (/[\u3041-\u3096]/.test(mnemonic)) {
    return 'japanese'
  }

  // Latin scripts: majority vote across all four language wordlists
  const words = mnemonic.trim().toLowerCase().split(/\s+/)
  let en = 0, fr = 0, it = 0, es = 0
  for (const word of words) {
    if (englishSet.has(word)) en++
    if (frenchSet.has(word)) fr++
    if (italianSet.has(word)) it++
    if (spanishSet.has(word)) es++
  }

  const max = Math.max(en, fr, it, es)
  // English wins ties — only return a non-English language if it strictly leads
  if (fr === max && fr > en) return 'french'
  if (it === max && it > en) return 'italian'
  if (es === max && es > en) return 'spanish'
  return 'english'
}
