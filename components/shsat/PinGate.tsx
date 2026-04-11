'use client'

import { useEffect, useState } from 'react'

interface PinGateProps {
  kid: string
  children: React.ReactNode
}

type Mode = 'loading' | 'create' | 'verify' | 'unlocked'

export default function PinGate({ kid, children }: PinGateProps) {
  const [mode, setMode] = useState<Mode>('loading')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const sessionKey = `shsat_pin_${kid}`

  useEffect(() => {
    // If PIN already verified this session, skip gate
    if (sessionStorage.getItem(sessionKey)) {
      setMode('unlocked')
      return
    }
    // Check if kid has a PIN set
    fetch(`/api/shsat/pin?kid=${kid}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setMode(data.hasPIN ? 'verify' : 'create')
        } else {
          setMode('verify')
        }
      })
      .catch(() => setMode('verify'))
  }, [kid, sessionKey])

  function handlePinInput(value: string) {
    // Only allow up to 4 digits
    if (/^\d{0,4}$/.test(value)) setPin(value)
  }

  function handleConfirmInput(value: string) {
    if (/^\d{0,4}$/.test(value)) setConfirmPin(value)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (pin.length !== 4) return setError('PIN must be exactly 4 digits.')
    if (pin !== confirmPin) return setError('PINs do not match.')
    setSubmitting(true)
    try {
      const res = await fetch('/api/shsat/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kid, action: 'create', pin }),
      })
      const data = await res.json()
      if (data.ok) {
        sessionStorage.setItem(sessionKey, pin)
        setMode('unlocked')
      } else {
        setError(data.error || 'Failed to create PIN.')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (pin.length !== 4) return setError('PIN must be exactly 4 digits.')
    setSubmitting(true)
    try {
      const res = await fetch('/api/shsat/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kid, action: 'verify', pin }),
      })
      const data = await res.json()
      if (data.ok) {
        sessionStorage.setItem(sessionKey, pin)
        setMode('unlocked')
      } else {
        setError('Incorrect PIN. Please try again.')
        setPin('')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (mode === 'loading') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading…</div>
      </div>
    )
  }

  if (mode === 'unlocked') {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-sm shadow-xl">
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">🔒</div>
          <h2 className="text-white text-xl font-bold">
            {mode === 'create' ? 'Create a PIN' : 'Enter PIN'}
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            {mode === 'create'
              ? 'Set a 4-digit PIN to protect your results.'
              : 'Enter your 4-digit PIN to view results.'}
          </p>
        </div>

        <form onSubmit={mode === 'create' ? handleCreate : handleVerify} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => handlePinInput(e.target.value)}
              placeholder="••••"
              className="w-full bg-gray-700 text-white text-center text-2xl tracking-[0.5em] rounded-lg px-4 py-3 border border-gray-600 focus:outline-none focus:border-indigo-500"
              autoFocus
            />
          </div>

          {mode === 'create' && (
            <div>
              <label className="block text-sm text-gray-300 mb-1">Confirm PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => handleConfirmInput(e.target.value)}
                placeholder="••••"
                className="w-full bg-gray-700 text-white text-center text-2xl tracking-[0.5em] rounded-lg px-4 py-3 border border-gray-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting || pin.length !== 4 || (mode === 'create' && confirmPin.length !== 4)}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-3 transition-colors"
          >
            {submitting ? 'Please wait…' : mode === 'create' ? 'Set PIN' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  )
}
