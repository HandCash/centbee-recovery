# Multi-Language Mnemonic Support

The recovery tool supports BIP39 mnemonics in six languages. This document explains how language detection works, how wordlists are structured, how the UI handles language selection, and how to add a new language.

---

## Supported languages

| Language           | BIP39 script   | Auto-detected? | Wordlist file                              |
|--------------------|----------------|----------------|--------------------------------------------|
| English            | Latin (ASCII)  | Yes (default)  | Built into `@bsv/sdk`                      |
| Chinese Simplified | CJK Ideographs | Yes            | `lib/wallet/wordlists/chinese-simplified.ts` |
| Japanese           | Hiragana       | Yes            | `lib/wallet/wordlists/japanese.ts`         |
| French             | Latin          | No             | `lib/wallet/wordlists/french.ts`           |
| Italian            | Latin          | No             | `lib/wallet/wordlists/italian.ts`          |
| Spanish            | Latin          | No             | `lib/wallet/wordlists/spanish.ts`          |

---

## Language detection

**File**: `lib/wallet/detectMnemonicLanguage.ts`

Language detection uses Unicode character ranges to identify the script of the mnemonic:

```typescript
// CJK Unified Ideographs → Chinese Simplified
if (/[\u4e00-\u9fff]/.test(mnemonic)) return 'chinese-simplified'

// Hiragana → Japanese
if (/[\u3041-\u3096]/.test(mnemonic)) return 'japanese'

// Default fallback for all Latin scripts
return 'english'
```

**Why Latin languages cannot be auto-detected:**

French, Italian, and Spanish all use the Latin alphabet. Distinguishing between them requires checking each word against a wordlist — which is itself language-specific. Auto-detection would therefore require loading all three wordlists, checking each one, and ranking by match count. This adds complexity and bundle size for limited practical benefit: a user entering a French mnemonic knows it is French. The UI provides an explicit language selector instead.

---

## Wordlist format

Each non-English wordlist is a TypeScript file that exports a `string[]` of exactly 2048 BIP39 words:

```typescript
// lib/wallet/wordlists/french.ts
export const frenchWordList: string[] = [
  'abaisser',
  'abandon',
  'abdiquer',
  // … 2045 more words
]
```

The array order matters: each word's position in the list corresponds to its 11-bit index in the BIP39 encoding scheme. The wordlists must match the official BIP39 wordlists from the [trezor/python-mnemonic](https://github.com/trezor/python-mnemonic) reference implementation exactly.

---

## How wordlists are used

**File**: `lib/wallet/walletClient.ts`

The `getWordlist()` helper selects the correct wordlist for a given language:

```typescript
function getWordlist(mnemonic: string, language?: MnemonicLanguage) {
  const lang = language ?? detectMnemonicLanguage(mnemonic)
  switch (lang) {
    case 'chinese-simplified': return chineseSimplifiedWordList
    case 'french':             return frenchWordList
    case 'italian':            return italianWordList
    case 'japanese':           return japaneseWordList
    case 'spanish':            return spanishWordList
    default:                   return undefined // undefined = use SDK default (English)
  }
}
```

When `undefined` is returned, `Mnemonic.fromString()` is used, which calls the `@bsv/sdk` built-in English wordlist. For all other languages, a custom `Mnemonic` instance is constructed with the wordlist explicitly passed:

```typescript
const mnemonic = wordlist
  ? new Mnemonic(mnemonicString, undefined, wordlist)
  : Mnemonic.fromString(mnemonicString)
```

The same wordlist selection logic applies in `validateMnemonic()` — validation checks the phrase against the correct wordlist for the detected or specified language.

---

## UI language selector

**File**: `app/start/page.tsx`

The `/start` page includes a `<select>` element listing all six languages. Selecting a language:

1. Clears the recovery phrase field (with a confirmation prompt if non-empty, since a phrase valid in one language may be invalid in another).
2. Updates placeholder text, hint text, and input normalisation behaviour.

Latin-script languages (French, Italian, Spanish) are lowercased as the user types:

```typescript
const normalized = (language !== 'chinese-simplified' && language !== 'japanese')
  ? value.toLowerCase()
  : value
```

This prevents case mismatches against the BIP39 wordlists, which are all lowercase.

---

## Adding a new language

To add support for another BIP39 language (e.g. Korean, Czech, Portuguese):

### 1. Get the official wordlist

Download the wordlist from the [trezor/python-mnemonic](https://github.com/trezor/python-mnemonic/tree/master/src/mnemonic/wordlist) repository. Use the `.txt` file — each line is one word, 2048 words total.

### 2. Create the wordlist file

Create `lib/wallet/wordlists/<language>.ts`:

```typescript
export const koreanWordList: string[] = [
  '가격',
  '가끔',
  // … 2046 more words
]
```

Ensure the array has exactly 2048 entries and matches the reference wordlist order precisely.

### 3. Add the language to the type and detection

In `lib/wallet/detectMnemonicLanguage.ts`, add the new language to the `MnemonicLanguage` type:

```typescript
export type MnemonicLanguage =
  | 'english'
  | 'chinese-simplified'
  | 'french'
  | 'italian'
  | 'japanese'
  | 'spanish'
  | 'korean'  // add here
```

If the language uses a distinct Unicode script (e.g. Korean uses Hangul: `\uAC00–\uD7A3`), add an auto-detection rule in `detectMnemonicLanguage()`:

```typescript
if (/[\uAC00-\uD7A3]/.test(mnemonic)) return 'korean'
```

### 4. Register the wordlist in walletClient.ts

Import the new wordlist and add a `case` in `getWordlist()`:

```typescript
import { koreanWordList } from './wordlists/korean'

// In getWordlist():
case 'korean': return koreanWordList
```

### 5. Add to the UI language selector

In `app/start/page.tsx`, add an entry to `LANGUAGE_CONFIG` and to the `<select>` options:

```typescript
korean: {
  label: '한국어 (Korean)',
  placeholder: 'e.g. 가격 가끔 가난 가능 가득 가르침 …',
  hint: '12 Korean words separated by spaces',
  example: '가격 가끔 가난…',
},
```

And add the `<option>`:

```tsx
<option value="korean">한국어 (Korean)</option>
```

### 6. Handle normalisation (if needed)

Korean words in BIP39 are already in a consistent Unicode normalisation form (NFC). If your language has accents or diacritics that might vary in normalisation (e.g. composed vs. decomposed forms), consider adding a `normalize('NFC')` call in `handleMnemonicChange` for that language.

---

## Bundle size note

Each wordlist adds roughly 20–30 KB to the JavaScript bundle (2048 short strings). All five non-English wordlists are currently imported statically. For large numbers of languages, consider dynamic imports (`import()`) keyed on the selected language to load only the needed wordlist on demand.
