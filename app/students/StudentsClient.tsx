'use client'

import { useState } from 'react'
import Link from 'next/link'
import { SignInButton } from '@clerk/nextjs'
import AuthControls from '@/components/AuthControls'
import SiteNav from '@/components/SiteNav'
import { Button, Eyebrow } from '@/components/ui'
import { LOTTERY_MAX, parseLottery, percentLower } from '@/lib/lottery'
import {
  BOROUGHS,
  DISTRICTS,
  LABEL_MAX,
  boroughName,
  geoPriorityGroups,
  type Borough,
  type Student,
} from '@/lib/students'

interface Props {
  signedIn: boolean
  initialStudent: Student | null
}

function Header() {
  return (
    <header className="flex items-center justify-between px-5 min-[900px]:px-9 py-[18px] border-b border-rule">
      <Link href="/" aria-label="AdmitDay home" className="flex items-center gap-[9px]">
        <span className="w-[9px] h-[9px] bg-accent inline-block" />
        <div className="flex items-baseline">
          <span className="font-display font-bold text-[21px] text-ink tracking-[-0.035em]">Admit</span>
          <span className="font-wordmark italic text-[24px] text-accent ml-[3px] tracking-[-0.01em]">Day</span>
        </div>
      </Link>
      <div className="flex items-center gap-7">
        <SiteNav active="students" />
        <AuthControls />
      </div>
    </header>
  )
}

const H1 = 'font-display font-bold text-[30px] min-[700px]:text-[40px] leading-[1.04] tracking-[-0.038em] text-ink'

export default function StudentsClient({ signedIn, initialStudent }: Props) {
  const [student, setStudent] = useState<Student | null>(initialStudent)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!signedIn) {
    return (
      <div>
        <Header />
        <div className="px-5 min-[900px]:px-9 py-14">
          <h1 className={H1}>Students</h1>
          <p className="mt-5 text-[15px] text-muted">
            <SignInButton mode="modal">
              <button type="button" className="text-accent underline underline-offset-[3px]">Sign in</button>
            </SignInButton>{' '}
            to add a student.
          </p>
        </div>
      </div>
    )
  }

  async function save(next: Student) {
    setError(null)
    const res = await fetch('/api/students', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    }).catch(() => null)
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => ({})) : {}
      setError(body.error ?? 'Couldn’t save. Try again.')
      return
    }
    const data = await res.json()
    setStudent(data.student)
    setEditing(false)
  }

  async function remove() {
    setError(null)
    const res = await fetch('/api/students', { method: 'DELETE' }).catch(() => null)
    if (!res || !res.ok) {
      setError('Couldn’t delete. Try again.')
      return
    }
    setStudent(null)
    setEditing(false)
  }

  return (
    <div>
      <Header />
      <div className="px-5 min-[900px]:px-9 pt-[30px] pb-6 border-b border-rule">
        <h1 className={H1}>Students</h1>
      </div>
      <div className="px-5 min-[900px]:px-9 py-8 grid grid-cols-1 min-[900px]:grid-cols-[280px_1fr] gap-8 items-start">
        <div className="border border-rule p-5">
          <Button
            type="button"
            className="w-full"
            disabled={!!student || editing}
            onClick={() => setEditing(true)}
          >
            Add student
          </Button>
          {student && <p className="text-[12.5px] text-faint mt-3">One student per account for now.</p>}
        </div>

        <div className="flex flex-col gap-6">
          {error && <p className="text-[13.5px] text-ink-2">{error}</p>}
          {editing ? (
            <StudentForm initial={student} onSave={save} onCancel={() => setEditing(false)} />
          ) : student ? (
            <StudentCard student={student} onEdit={() => setEditing(true)} onDelete={remove} />
          ) : (
            <p className="text-[15px] text-muted">
              Add a student to see which borough priorities apply and where their lottery number sits.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function placeLine(borough: Borough | null, district: number | null): string | null {
  if (!borough) return null
  return district ? `${boroughName(borough)} · District ${district}` : boroughName(borough)
}

export function StudentCard({
  student,
  onEdit,
  onDelete,
}: {
  student: Student
  onEdit: () => void
  onDelete: () => void
}) {
  const home = placeLine(student.home_borough, student.home_district)
  const school = placeLine(student.school_borough, student.school_district)
  return (
    <div className="border border-rule p-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-display font-bold text-[26px] tracking-[-0.02em] text-ink">{student.label}</h2>
        <div className="flex gap-4 text-[13px]">
          <button type="button" onClick={onEdit} className="text-muted hover:text-ink">Edit</button>
          <button type="button" onClick={onDelete} className="text-muted hover:text-ink">Delete</button>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-[110px_1fr] gap-y-2 text-[14px]">
        <dt className="text-faint">Lives in</dt>
        <dd className="text-ink-2">{home}</dd>
        {school && (
          <>
            <dt className="text-faint">School in</dt>
            <dd className="text-ink-2">{school}</dd>
          </>
        )}
        {student.lottery !== null && (
          <>
            <dt className="text-faint">Lottery</dt>
            <dd className="text-ink-2">
              <span className="font-mono">{student.lottery}</span>
              <span className="text-faint"> of {LOTTERY_MAX}</span>
              <span title="Share of all lottery numbers that start lower (better)">
                {' '}· {percentLower(student.lottery)}% start lower
              </span>
            </dd>
          </>
        )}
      </dl>
      <div className="mt-5 border-t border-rule-light pt-4">
        <Eyebrow>Priority groups that can apply</Eyebrow>
        <ul className="mt-2 text-[14px] text-ink-2">
          {geoPriorityGroups(student).map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

const FIELD = 'w-full text-[14.5px] text-ink border border-rule px-3 py-[9px] bg-white focus:outline-none focus:border-ink'
const LABEL = 'block text-[13px] text-faint mb-1'

function StudentForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Student | null
  onSave: (s: Student) => void
  onCancel: () => void
}) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [homeBorough, setHomeBorough] = useState<Borough | ''>(initial?.home_borough ?? '')
  const [homeDistrict, setHomeDistrict] = useState(initial?.home_district ? String(initial.home_district) : '')
  const [schoolBorough, setSchoolBorough] = useState<Borough | ''>(initial?.school_borough ?? '')
  const [schoolDistrict, setSchoolDistrict] = useState(initial?.school_district ? String(initial.school_district) : '')
  // The lottery field holds whatever the parent types; only its first two
  // characters, as 0-255, ever leave the browser.
  const [lotteryInput, setLotteryInput] = useState(
    initial?.lottery != null ? initial.lottery.toString(16).padStart(2, '0') : ''
  )
  const [formError, setFormError] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return setFormError('Add a label, like “Kid 1”.')
    if (!homeBorough) return setFormError('Pick the borough they live in.')
    let lottery: number | null = null
    if (lotteryInput.trim()) {
      const p = parseLottery(lotteryInput)
      if (!p.ok) return setFormError(p.error)
      lottery = p.value
    }
    onSave({
      label: label.trim(),
      home_borough: homeBorough,
      home_district: homeDistrict ? Number(homeDistrict) : null,
      school_borough: schoolBorough || null,
      school_district: schoolBorough && schoolDistrict ? Number(schoolDistrict) : null,
      lottery,
    })
  }

  return (
    <form onSubmit={submit} className="border border-rule p-6 flex flex-col gap-4 max-w-[560px]">
      <div>
        <label htmlFor="student-label" className={LABEL}>Label (not a name)</label>
        <input
          id="student-label"
          value={label}
          maxLength={LABEL_MAX}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Kid 1"
          autoComplete="off"
          className={FIELD}
        />
      </div>
      <BoroughDistrict
        idPrefix="home"
        legend="Lives in"
        borough={homeBorough}
        district={homeDistrict}
        onBorough={(b) => { setHomeBorough(b); setHomeDistrict('') }}
        onDistrict={setHomeDistrict}
      />
      <BoroughDistrict
        idPrefix="school"
        legend="Current school is in"
        borough={schoolBorough}
        district={schoolDistrict}
        onBorough={(b) => { setSchoolBorough(b); setSchoolDistrict('') }}
        onDistrict={setSchoolDistrict}
        optional
      />
      <div>
        <label htmlFor="student-lottery" className={LABEL}>Lottery number, first 2 characters</label>
        <input
          id="student-lottery"
          value={lotteryInput}
          onChange={(e) => setLotteryInput(e.target.value)}
          placeholder="3f"
          autoComplete="off"
          spellCheck={false}
          className={`${FIELD} font-mono`}
        />
        <p className="text-[12.5px] text-faint mt-1">
          Pasting the whole number is fine: only the first 2 characters are saved.{' '}
          <Link href="/lottery" className="underline hover:text-ink">What it means</Link>
        </p>
      </div>
      {formError && <p className="text-[13.5px] text-ink-2">{formError}</p>}
      <div className="flex gap-3">
        <Button type="submit">Save</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}

function BoroughDistrict({
  idPrefix,
  legend,
  borough,
  district,
  onBorough,
  onDistrict,
  optional = false,
}: {
  idPrefix: string
  legend: string
  borough: Borough | ''
  district: string
  onBorough: (b: Borough | '') => void
  onDistrict: (d: string) => void
  optional?: boolean
}) {
  return (
    <fieldset className="grid grid-cols-2 gap-3">
      <legend className={LABEL}>{legend}{optional ? ' (optional)' : ''}</legend>
      <select
        id={`${idPrefix}-borough`}
        aria-label={`${legend}: borough`}
        value={borough}
        onChange={(e) => onBorough(e.target.value as Borough | '')}
        className={FIELD}
      >
        <option value="">Borough</option>
        {BOROUGHS.map((b) => (
          <option key={b.code} value={b.code}>{b.name}</option>
        ))}
      </select>
      <select
        id={`${idPrefix}-district`}
        aria-label={`${legend}: district`}
        value={district}
        onChange={(e) => onDistrict(e.target.value)}
        disabled={!borough}
        className={FIELD}
      >
        <option value="">District (optional)</option>
        {borough &&
          DISTRICTS[borough].map((d) => (
            <option key={d} value={d}>District {d}</option>
          ))}
      </select>
    </fieldset>
  )
}
