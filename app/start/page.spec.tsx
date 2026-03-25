import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../lib/test-utils'
import { mockLocalStorage } from '../../lib/test-utils'
import { TEST_MNEMONIC, TEST_PIN } from '../../lib/test-fixtures'
import userEvent from '@testing-library/user-event'

// Mock Next.js navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

// Mock sonner
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
  }),
  Toaster: () => null,
}))

// Mock walletClient
vi.mock('../../lib/wallet/walletClient', () => ({
  WalletClient: {
    validateMnemonic: vi.fn().mockReturnValue(true),
    fromMnemonic: vi.fn().mockReturnValue({
      deriveChild: vi.fn().mockReturnValue({
        toPublic: vi.fn().mockReturnValue({ toString: vi.fn().mockReturnValue('xpub-mock') }),
      }),
    }),
  },
  importWallet: vi.fn().mockResolvedValue({}),
}))

describe('StartPage', () => {
  beforeEach(() => {
    mockLocalStorage({})
    mockPush.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', async () => {
    const { default: StartPage } = await import('./page')
    render(<StartPage />)
    expect(document.body).toBeTruthy()
  })

  it('shows recover wallet heading', async () => {
    const { default: StartPage } = await import('./page')
    render(<StartPage />)
    expect(screen.getByText(/Recover your wallet/i)).toBeInTheDocument()
  })

  it('shows recovery phrase textarea', async () => {
    const { default: StartPage } = await import('./page')
    render(<StartPage />)
    expect(screen.getByPlaceholderText(/e\.g\. abandon ability/i)).toBeInTheDocument()
  })

  it('shows PIN input field', async () => {
    const { default: StartPage } = await import('./page')
    render(<StartPage />)
    expect(screen.getByPlaceholderText(/4-digit PIN/i)).toBeInTheDocument()
  })

  it('shows Restore wallet button', async () => {
    const { default: StartPage } = await import('./page')
    render(<StartPage />)
    expect(screen.getByRole('button', { name: /Restore wallet/i })).toBeInTheDocument()
  })

  it('stores credentials in localStorage and redirects on valid import', async () => {
    const ls = mockLocalStorage({})
    const { default: StartPage } = await import('./page')
    const { WalletClient } = await import('../../lib/wallet/walletClient')
    vi.mocked(WalletClient.validateMnemonic).mockReturnValue(true)

    render(<StartPage />)

    const textarea = screen.getByPlaceholderText(/e\.g\. abandon ability/i)
    const pinInput = screen.getByPlaceholderText(/4-digit PIN/i)
    const submitBtn = screen.getByRole('button', { name: /Restore wallet/i })

    await userEvent.type(textarea, TEST_MNEMONIC)
    await userEvent.type(pinInput, TEST_PIN)
    await userEvent.click(submitBtn)

    await waitFor(() => {
      expect(ls.setItem).toHaveBeenCalledWith('wallet_mnemonic', expect.any(String))
      expect(ls.setItem).toHaveBeenCalledWith('wallet_pin', TEST_PIN)
      expect(mockPush).toHaveBeenCalledWith('/')
    })
  })

  it('shows error for invalid mnemonic', async () => {
    const { default: StartPage } = await import('./page')
    const { WalletClient } = await import('../../lib/wallet/walletClient')
    vi.mocked(WalletClient.validateMnemonic).mockReturnValue(false)

    render(<StartPage />)

    const pinInput = screen.getByPlaceholderText(/4-digit PIN/i)
    const submitBtn = screen.getByRole('button', { name: /Restore wallet/i })

    await userEvent.type(pinInput, TEST_PIN)
    await userEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText(/Invalid recovery phrase/i)).toBeInTheDocument()
    })
  })

  it('shows Reset button', async () => {
    const { default: StartPage } = await import('./page')
    render(<StartPage />)
    expect(screen.getByRole('button', { name: /Reset/i })).toBeInTheDocument()
  })
})
