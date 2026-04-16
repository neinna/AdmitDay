'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePostHog } from 'posthog-js/react'
import Footer from '@/components/Footer'

const BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island']
const INTERESTS = ['STEM', 'Arts', 'Languages', 'Career & Technical', 'Other']
const SPORTS = ['Soccer', 'Tennis', 'Softball', 'Basketball', 'Track & Field', 'Volleyball', 'Baseball']

const FORM_KEY = 'hs_nav_form'
const PARAMS_KEY = 'hs_nav_last_params'

interface SavedForm {
  boroughs: string[]
  interests: string[]
  sports: string[]
  shsat: boolean
  auditions: boolean
  academicRatings: string[]
  iep: string
  size: string
}

export default function HomePage() {
  const router = useRouter()
  const posthog = usePostHog()

  const [boroughs, setBoroughs] = useState<string[]>([])
  const [interests, setInterests] = useState<string[]>([])
  const [sports, setSports] = useState<string[]>([])
  const [shsat, setShsat] = useState<boolean>(false)
  const [auditions, setAuditions] = useState<boolean>(false)
  const [academicRatings, setAcademicRatings] = useState<string[]>([])
  const [iep, setIep] = useState<'gened' | 'iep'>('gened')
  const [size, setSize] = useState<'small' | 'medium' | 'large' | ''>('')
  const [errors, setErrors] = useState<string[]>([])

  // Restore previous selections from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FORM_KEY)
      if (!raw) return
      const saved: SavedForm = JSON.parse(raw)
      if (Array.isArray(saved.boroughs)) setBoroughs(saved.boroughs)
      if (Array.isArray(saved.interests)) setInterests(saved.interests)
      if (Array.isArray(saved.sports)) setSports(saved.sports)
      if (typeof saved.shsat === 'boolean') setShsat(saved.shsat)
      if (typeof saved.auditions === 'boolean') setAuditions(saved.auditions)
      if (Array.isArray(saved.academicRatings)) setAcademicRatings(saved.academicRatings)
      if (saved.iep === 'iep' || saved.iep === 'gened') setIep(saved.iep)
      if (['small', 'medium', 'large'].includes(saved.size))
        setSize(saved.size as 'small' | 'medium' | 'large')
    } catch {
      // ignore corrupt data
    }
  }, [])

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((i) => i !== value) : [...list, value])
  }

  function toggleBorough(value: string) {
    setBoroughs(prev =>
      prev.includes(value) ? prev.filter(b => b !== value) : [...prev, value]
    )
  }

  function toggleAcademicRating(value: string) {
    setAcademicRatings(prev =>
      prev.includes(value) ? prev.filter(r => r !== value) : [...prev, value]
    )
  }

  function validate(): boolean {
    const errs: string[] = []
    if (boroughs.length === 0) errs.push('Please select at least one borough.')
    if (academicRatings.length === 0) errs.push('Please select an academic rating.')
    if (!size) errs.push('Please select a school size preference.')
    setErrors(errs)
    return errs.length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    posthog?.capture('form_submitted', {
      boroughs,
      interests,
      sports,
      shsat,
      auditions,
      academic_ratings: academicRatings,
      iep,
      size,
    })

    const params = new URLSearchParams({
      interests: interests.join(','),
      sports: sports.join(','),
      shsat: String(shsat),
      auditions: String(auditions),
      iep: String(iep === 'iep'),
      size,
    })
    params.set('borough', boroughs.join(','))
    params.set('academicRatings', academicRatings.join(','))

    // Persist form state and last params for nav bar + restore
    try {
      localStorage.setItem(
        FORM_KEY,
        JSON.stringify({ boroughs, interests, sports, shsat, auditions, academicRatings, iep, size })
      )
      localStorage.setItem(PARAMS_KEY, params.toString())
    } catch {
      // ignore
    }

    router.push(`/list?${params.toString()}`)
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Find the Right High School</h1>
          <p className="mt-1.5 text-gray-500 text-sm">
            Set your criteria. Get a matched list of NYC public high schools.
          </p>
        </div>

        {/* Validation notice */}
        {errors.length > 0 && (
          <div
            className="mb-6 px-4 py-3 rounded-md border"
            style={{ backgroundColor: '#FEF3C7', borderColor: '#FCD34D', color: '#92400E' }}
          >
            {errors.map((err, i) => (
              <p key={i} className="text-sm">
                {err}
              </p>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-7">
          {/* Borough */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700">Borough</label>
              <button
                type="button"
                onClick={() => setBoroughs([...BOROUGHS])}
                className="text-xs text-blue-600 hover:underline"
              >
                Select all
              </button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {BOROUGHS.map(b => (
                <label key={b} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={boroughs.includes(b)}
                    onChange={() => toggleBorough(b)}
                  />
                  {b}
                </label>
              ))}
            </div>
          </div>

          {/* Interests */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Interests{' '}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((interest) => (
                <button
                  key={interest}
                  type="button"
                  onClick={() => toggle(interests, setInterests, interest)}
                  className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                    interests.includes(interest)
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                  }`}
                >
                  {interest}
                </button>
              ))}
            </div>
          </div>

          {/* Sports */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Top sports at the school{' '}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {SPORTS.map((sport) => (
                <button
                  key={sport}
                  type="button"
                  onClick={() => toggle(sports, setSports, sport)}
                  className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                    sports.includes(sport)
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                  }`}
                >
                  {sport}
                </button>
              ))}
            </div>
          </div>

          {/* SHSAT */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Is your student willing to take the SHSAT?
            </label>
            <div className="flex gap-5">
              {(
                [
                  { value: true, label: 'Yes' },
                  { value: false, label: 'No' },
                ] as const
              ).map((opt) => (
                <label key={String(opt.value)} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="shsat"
                    checked={shsat === opt.value}
                    onChange={() => setShsat(opt.value)}
                    className="accent-gray-900"
                  />
                  <span className="text-sm text-gray-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Auditions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Is your student willing to audition or submit a portfolio?
            </label>
            <div className="flex gap-5">
              {(
                [
                  { value: true, label: 'Yes' },
                  { value: false, label: 'No' },
                ] as const
              ).map((opt) => (
                <label key={String(opt.value)} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="auditions"
                    checked={auditions === opt.value}
                    onChange={() => setAuditions(opt.value)}
                    className="accent-gray-900"
                  />
                  <span className="text-sm text-gray-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Academic Rating */}
          <div>
            <label className="text-sm font-medium text-gray-700">Academic Rating</label>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
              {[
                { value: 'exceptional', label: 'Exceptional' },
                { value: 'strong', label: 'Strong' },
                { value: 'above_average', label: 'Above Average' },
              ].map(({ value, label }) => (
                <label key={value} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={academicRatings.includes(value)}
                    onChange={() => toggleAcademicRating(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* IEP */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              IEP or General Education
            </label>
            <div className="flex gap-5">
              {(
                [
                  { value: 'gened', label: 'General Education' },
                  { value: 'iep', label: 'IEP' },
                ] as const
              ).map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="iep"
                    value={opt.value}
                    checked={iep === opt.value}
                    onChange={() => setIep(opt.value)}
                    className="accent-gray-900"
                  />
                  <span className="text-sm text-gray-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* School Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              School size preference
            </label>
            <div className="space-y-2">
              {(
                [
                  { value: 'small', label: 'Small', helper: 'under 400 students' },
                  { value: 'medium', label: 'Medium', helper: '400–1,200 students' },
                  { value: 'large', label: 'Large', helper: 'over 1,200 students' },
                ] as const
              ).map((opt) => (
                <label key={opt.value} className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="size"
                    value={opt.value}
                    checked={size === opt.value}
                    onChange={() => setSize(opt.value)}
                    className="mt-0.5 accent-gray-900"
                  />
                  <span className="text-sm">
                    <span className="font-medium text-gray-800">{opt.label}</span>
                    <span className="text-gray-500"> — {opt.helper}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-gray-900 text-white py-3 px-4 rounded-md text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            Find schools &rarr;
          </button>
        </form>

        {/* Locked save banner */}
        <div className="mt-4">
          <span
            aria-label="Save your HS guardrails — Season Pass coming soon"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 border border-gray-200 bg-gray-50 rounded-md cursor-not-allowed select-none"
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>Save your HS guardrails</span>
            <span className="text-xs text-gray-400 font-normal">— Season Pass <span className="italic">coming soon</span></span>
          </span>
        </div>
      </div>
      <Footer />
    </main>
  )
}
