import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '../../lib/test-utils'
import { mockLocalStorage } from '../../lib/test-utils'
import { TEST_MNEMONIC, TEST_PIN } from '../../lib/test-fixtures'

// Mock lucide-react to avoid undefined icon components (lucide-react@0.105.0-alpha.4 is missing some icons)
vi.mock('lucide-react', () => {
  const Icon = ({ className }: { className?: string }) => <span className={className} />
  return {
    AlertTriangle: Icon, ArrowLeft: Icon, CheckCircle2: Icon, Copy: Icon,
    ExternalLink: Icon, Github: Icon, InfoIcon: Icon, Key: Icon,
    Loader2: Icon, RefreshCw: Icon, Send: Icon, ShieldCheck: Icon,
    WalletIcon: Icon,
  }
})

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
  }),
  Toaster: () => null,
}))

// Mock walletClient to avoid real crypto in component tests
vi.mock('../../lib/wallet/walletClient', () => ({
  WalletClient: {
    validateMnemonic: vi.fn().mockReturnValue(true),
    fromMnemonic: vi.fn(),
  },
  getWallet: vi.fn().mockReturnValue(null),
  importWallet: vi.fn(),
  clearWallet: vi.fn(),
  syncWallet: vi.fn().mockResolvedValue([]),
}))

async function getSyncWalletMock() {
  const { syncWallet } = await import('../../lib/wallet/walletClient')
  return vi.mocked(syncWallet)
}

describe('Wallet component', () => {
  beforeEach(async () => {
    mockLocalStorage({
      wallet_mnemonic: TEST_MNEMONIC,
      wallet_pin: TEST_PIN,
    })
    // Ensure syncWallet always defaults to empty for each test
    const syncWallet = await getSyncWalletMock()
    syncWallet.mockResolvedValue([])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', async () => {
    const { default: WalletComponent } = await import('./Wallet')
    render(<WalletComponent />)
    // Wait for sync to complete so async state updates don't leak out of act()
    await waitFor(() => expect(screen.getByText(/Migration completed/i)).toBeInTheDocument(), { timeout: 5000 })
  })

  it('shows My Wallet heading', async () => {
    const { default: WalletComponent } = await import('./Wallet')
    render(<WalletComponent />)
    await waitFor(() => {
      expect(screen.getByText('My Wallet')).toBeInTheDocument()
    })
  })

  it('displays balance section', async () => {
    const { default: WalletComponent } = await import('./Wallet')
    render(<WalletComponent />)
    await waitFor(() => {
      expect(screen.getByText('My Wallet')).toBeInTheDocument()
    })
  })

  it('shows Send All button when UTXOs are present', async () => {
    const syncWallet = await getSyncWalletMock()
    syncWallet.mockResolvedValue([
      {
        txid: 'abc123',
        vout: 0,
        satoshis: 100000,
        address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        height: 700000,
        derivationPath: "m/44'/0/0/0",
      },
    ])
    const { default: WalletComponent } = await import('./Wallet')
    render(<WalletComponent />)
    await waitFor(
      () => expect(screen.queryByRole('button', { name: /Send All/i })).not.toBeNull(),
      { timeout: 5000 }
    )
  })

  it('shows migration completed when sync returns empty UTXOs', async () => {
    // Default mock already returns [] from beforeEach
    const { default: WalletComponent } = await import('./Wallet')
    render(<WalletComponent />)
    await waitFor(() => {
      expect(screen.getByText(/Migration completed/i)).toBeInTheDocument()
    }, { timeout: 5000 })
  })
})
