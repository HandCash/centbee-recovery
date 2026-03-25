import React from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { vi } from 'vitest'

// Wrapper with any providers the app requires
function AllProviders({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

const customRender = (ui: React.ReactElement, options?: Omit<RenderOptions, 'wrapper'>) =>
  render(ui, { wrapper: AllProviders, ...options })

export * from '@testing-library/react'
export { customRender as render }

// localStorage helpers
export function mockLocalStorage(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial }
  const mock = {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]) }),
    length: 0,
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  }
  Object.defineProperty(window, 'localStorage', { value: mock, writable: true })
  return mock
}

export function clearLocalStorageMock() {
  vi.restoreAllMocks()
}
