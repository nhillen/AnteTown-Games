import '@testing-library/jest-dom'
import { beforeEach, vi } from 'vitest'


// Mock Socket.io for tests
const mockSocket = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  emit: vi.fn(),
  on: vi.fn(),
  removeAllListeners: vi.fn(),
}

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}))

// Silence noisy console errors during fetch mocks
vi.spyOn(console, 'error').mockImplementation(() => {})

// Mock fetch for backend calls the app performs on load
const defaultUser = {
  id: 'test-user',
  name: 'Test User',
  email: 'test@example.com',
  bankroll: 1000,
  cosmetics: {},
  unlockedCosmetics: [],
  totalGamesPlayed: 0,
  totalWinnings: 0,
  isAdmin: false,
}

const createJsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input.toString()

  if (url.endsWith('/auth/user')) {
    return createJsonResponse(defaultUser)
  }

  if (url.endsWith('/auth/logout')) {
    return createJsonResponse({ status: 'ok' })
  }

  if (url.endsWith('/auth/profile')) {
    return createJsonResponse({ ...defaultUser, ...(init?.body ? JSON.parse(init.body as string) : {}) })
  }

  if (url.endsWith('/auth/purchase-cosmetic')) {
    return createJsonResponse(defaultUser)
  }

  if (url.endsWith('/api/dice-collections')) {
    return createJsonResponse({ collections: [] })
  }

  return createJsonResponse({})
})

vi.stubGlobal('fetch', fetchMock)

beforeEach(() => {
  fetchMock.mockClear()
})

// Mock environment variables
vi.stubEnv('VITE_BACKEND_URL', 'http://localhost:3001')
