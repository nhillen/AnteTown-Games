import { render, screen, fireEvent } from '@testing-library/react'
import { describe, test, expect } from 'vitest'
import App from '../App'

const renderApp = () => render(<App />)

describe('App Component', () => {
  test('renders main heading', async () => {
    renderApp()
    expect(await screen.findByText(/Pirate Plunder/)).toBeInTheDocument()
  })

  test('renders connection status', async () => {
    renderApp()
    expect(await screen.findByText(/Disconnected/)).toBeInTheDocument()
  })

  test('renders join lobby section', async () => {
    renderApp()
    expect(await screen.findByPlaceholderText('Enter your name')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Join Lobby' })).toBeInTheDocument()
  })

  test('renders lobby section', async () => {
    renderApp()
    expect(await screen.findByText('+ AI Player')).toBeInTheDocument()
    expect(await screen.findByText('Fill to 4')).toBeInTheDocument()
  })

  test('renders table section', async () => {
    renderApp()
    expect(await screen.findByText('Waiting for players...')).toBeInTheDocument()
  })

  test('allows entering player name', async () => {
    renderApp()
    const nameInput = (await screen.findByPlaceholderText('Enter your name')) as HTMLInputElement
    
    fireEvent.change(nameInput, { target: { value: 'TestPlayer' } })
    expect(nameInput.value).toBe('TestPlayer')
  })

  test('join button is present after render', async () => {
    renderApp()
    const nameInput = await screen.findByPlaceholderText('Enter your name')
    const joinButton = await screen.findByRole('button', { name: 'Join Lobby' })
    
    fireEvent.change(nameInput, { target: { value: 'TestPlayer' } })
    fireEvent.click(joinButton)
    
    expect(joinButton).toBeInTheDocument()
  })
})
