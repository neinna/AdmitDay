import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  const { school, userInputs } = await request.json()

  const schoolCtx = [
    `School: ${school.name} (${school.borough})`,
    `Size: ${school.size}`,
    `Admissions types: ${school.admissions_types?.join(', ') || 'unknown'}`,
    school.doe_data?.overview
      ? `Overview: ${String(school.doe_data.overview).slice(0, 300)}`
      : null,
    school.academic_score_pct != null
      ? `Academic score: ${school.academic_score_pct}%`
      : null,
    school.applicants_per_seat != null
      ? `Applicants per seat: ${school.applicants_per_seat}`
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  const studentCtx = [
    `Home borough: ${userInputs.boroughs?.join(', ') || 'not specified'}`,
    `Interests: ${userInputs.interests?.length ? userInputs.interests.join(', ') : 'not specified'}`,
    `Academic ratings: ${userInputs.academicRatings?.join(', ') || 'not specified'}`,
    `Willing to take SHSAT: ${userInputs.shsat ? 'Yes' : 'No'}`,
    `Willing to audition: ${userInputs.auditions ? 'Yes' : 'No'}`,
    `IEP: ${userInputs.iep ? 'Yes' : 'No'}`,
    `Size preference: ${userInputs.size}`,
  ].join('\n')

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    system:
      'You are a helpful NYC high school admissions assistant. Respond with only a valid JSON object — no markdown, no explanation, no code fences. The JSON must have exactly two fields:\n' +
      '- "title": a 4-6 word bold summary of why this school fits the student (e.g. "Strong arts, low competition" or "STEM focus, open admissions")\n' +
      '- "rationale": 1-2 sentences under 60 words explaining why this school might be a good fit. Be specific — cite the admissions type and relevant features. Do not use language like "you will get in" or "guaranteed". End by naming the admissions type.\n' +
      'Example output: {"title":"Low competition, open admissions","rationale":"This school uses open lottery admissions, so every student has an equal chance. Its strong STEM programs align with the student\'s interests. Admissions type: Open."}',
    messages: [
      {
        role: 'user',
        content: `${schoolCtx}\n\nStudent profile:\n${studentCtx}\n\nReturn the JSON object.`,
      },
    ],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : '{}'

  let parsed: { title: string; rationale: string }
  try {
    parsed = JSON.parse(raw)
  } catch {
    // If Claude returned something unexpected, surface it as rationale only
    parsed = { title: '', rationale: raw.slice(0, 200) }
  }

  return Response.json({
    title: parsed.title ?? '',
    rationale: parsed.rationale ?? '',
  })
}
