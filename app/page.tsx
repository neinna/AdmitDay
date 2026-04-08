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
  borough: string
  commute: string
  interests: string[]
  sports: string[]
  shsat: boolean
  auditions: boolean
  academicLevel: string
  iep: string
  size: string
}

export default function HomePage() {
  const router = useRouter()
  const posthog = usePostHog()

  const [borough, setBorough] = useState('All Boroughs')
  const [commute, setCommute] = useState<'short' | 'flexible'>('flexible')
  const [interests, setInterests] = useState<string[]>([])
  const [sports, setSports] = useState<string[]>([])
  const [shsat, setShsat] = useState<boolean>(false)
  const [auditions, setAuditions] = useState<boolean>(false)
  const [academicLevel, setAcademicLevel] = useState<'low' | 'medium' | 'high' | ''>('')
  const [iep, setIep] = useState<'gened' | 'iep'>('gened')
  const [size, setSize] = useState<'small' | 'medium' | 'large' | ''>('')
  const [errors, setErrors] = useState<string[]>([])

  // Restore previous selections from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FORM_KEY)
      if (!raw) return
      const saved: SavedForm = JSON.parse(raw)
      if (saved.borough) setBorough(saved.borough)
      if (saved.commute === 'short' || saved.commute === 'flexible') setCommute(saved.commute)
      if (Array.isArray(saved.interests)) setInterests(saved.interests)
      if (Array.isArray(saved.sports)) setSports(saved.sports)
      if (typeof saved.shsat === 'boolean') setShsat(saved.shsat)
      if (typeof saved.auditions === 'boolean') setAuditions(saved.auditions)
      if (['low', 'medium', 'high'].includes(saved.academicLevel))
        setAcademicLevel(saved.academicLevel as 'low' | 'medium' | 'high')
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

  function validate(): boolean {
    const errs: string[] = []
    if (!academicLevel) errs.push('Please select an academic level.')
    if (!size) errs.push('Please select a school size preference.')
    setErrors(errs)
    return errs.length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    posthog?.capture('form_submitted', {
      borough,
      commute,
      interests,
      sports,
      shsat,
      auditions,
      academic_level: academicLevel,
      iep,
      size,
    })

    const params = new URLSearchParams({
      borough,
      commute,
      interests: interests.join(','),
      sports: sports.join(','),
      shsat: String(shsat),
      auditions: String(auditions),
      level: academicLevel,
      iep: String(iep === 'iep'),
      size,
    })

    // Persist form state and last params for nav bar + restore
    try {
      localStorage.setItem(
        FORM_KEY,
        JSON.stringify({ borough, commute, interests, sports, shsat, auditions, academicLevel, iep, size })
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
          <h1 className="text-2xl font-bold text-gray-900">Find the right high school</h1>
          <p className="mt-1.5 text-gray-500 text-sm">
            Answer a few questions and we&apos;ll match NYC public high schools to your student&apos;s profile.
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
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Borough</label>
            <select
              value={borough}
              onChange={(e) => setBorough(e.target.value)}
              className="block w-full border border-gray-300 rounded-md px-3 py-2 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            >
              <option value="All Boroughs">All Boroughs</option>
              {BOROUGHS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Commute preference */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Commute preference
            </label>
            <div className="space-y-2">
              {(
                [
                  { value: 'flexible', label: 'Flexible — willing to travel to any borough' },
                  { value: 'short', label: 'Short — prefer under 45 min (same borough)' },
                ] as const
              ).map((opt) => (
                <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="commute"
                    value={opt.value}
                    checked={commute === opt.value}
                    onChange={() => setCommute(opt.value)}
                    className="accent-gray-900"
                  />
                  <span className="text-sm text-gray-700">{opt.label}</span>
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

          {/* Academic Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Academic level
            </label>
            <div className="space-y-2">
              {(
                [
                  { value: 'low', label: 'Low', helper: 'screened groups 4–5' },
                  { value: 'medium', label: 'Medium', helper: 'screened group 3' },
                  { value: 'high', label: 'High', helper: 'screened groups 1–2' },
                ] as const
              ).map((opt) => (
                <label key={opt.value} className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="level"
                    value={opt.value}
                    checked={academicLevel === opt.value}
                    onChange={() => setAcademicLevel(opt.value)}
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
