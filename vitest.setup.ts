import '@testing-library/jest-dom'
import { server } from './lib/mocks/server'
import { beforeAll, afterEach, afterAll } from 'vitest'

// Start MSW server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))

// Reset handlers after each test to avoid state leakage
afterEach(() => server.resetHandlers())

// Close server when done
afterAll(() => server.close())
