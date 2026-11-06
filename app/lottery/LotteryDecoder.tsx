'use client'

import { useState } from 'react'
import { DOE_RANDOM_NUMBERS_URL, LOTTERY_MAX, parseLottery, percentLower } from '@/lib/lottery'

/**
 * P1.2: paste a lottery number, see where it sits. Everything happens in this
 * component's state: the number is never sent to a server, stored, put in the
 * URL, or passed to analytics.
 */
export default function LotteryDecoder() {
  const [input, setInput] = useState('')
  const result = input.trim() === '' ? null : parseLottery(input)

  return (
    <div className="max-w-[680px]">
      <label htmlFor="lottery-number" className="block text-[13px] text-faint mb-2">
        Lottery number, from MySchools
      </label>
      <input
        id="lottery-number"
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        placeholder="3f2a9c… (32 characters, or just the first 2)"
        className="w-full font-mono text-[15px] text-ink border border-rule px-3 py-[10px] focus:outline-none focus:border-ink"
      />
      <p className="text-[12.5px] text-faint mt-2">Stays in your browser. Never sent or saved.</p>

      {result && !result.ok && <p className="text-[13.5px] text-ink-2 mt-4">{result.error}</p>}

      {result && result.ok && (
        <div className="mt-6 border-t border-rule pt-5">
          <p className="font-mono text-[13px] text-faint">
            First two characters: <span className="text-ink">{result.prefix}</span>
          </p>
          <p className="font-display font-bold text-[34px] leading-none tracking-[-0.03em] text-ink mt-3">
            {result.value} <span className="text-[18px] font-normal text-muted">of {LOTTERY_MAX}</span>
          </p>
          <div
            className="relative h-[6px] bg-surface-2 mt-4"
            role="img"
            aria-label={`${result.value} on a scale from 0, best, to ${LOTTERY_MAX}`}
          >
            <span
              className="absolute top-[-3px] w-[3px] h-[12px] bg-accent"
              style={{ left: `${(result.value / LOTTERY_MAX) * 100}%` }}
            />
          </div>
          <div className="flex justify-between font-mono text-[11px] text-faint mt-1">
            <span>0 · best</span>
            <span>{LOTTERY_MAX}</span>
          </div>
          <p className="text-[15px] text-ink-2 mt-4">
            About {percentLower(result.value)}% of numbers start lower than yours.
          </p>
        </div>
      )}

      <div className="mt-8 flex flex-col gap-[10px] text-[14px] text-ink-2 leading-[1.55]">
        <p>
          The DOE gives each applicant a random number for each admissions process. Lower numbers go first. Your
          first two characters place you among all applicants to within about half a percent.
        </p>
        <p>
          This shows where your number sits. It doesn&rsquo;t predict an offer: each program&rsquo;s method,
          priority groups and seats decide that.
        </p>
        <p>
          Source:{' '}
          <a href={DOE_RANDOM_NUMBERS_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
            NYC DOE, Random Numbers in Admissions
          </a>
        </p>
      </div>
    </div>
  )
}
