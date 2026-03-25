import { setupServer } from 'msw/node'
import { handlers } from './handlers'

// Set up MSW server with default handlers
export const server = setupServer(...handlers)
