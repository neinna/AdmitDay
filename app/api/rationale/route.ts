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
    `Home borough: ${userInputs.borough}`,
    `Interests: ${userInputs.interests?.length ? userInputs.interests.join(', ') : 'not specified'}`,
    `Academic level: ${userInputs.academicLevel}`,
    `Willing to take SHSAT: ${userInputs.shsat ? 'Yes' : 'No'}`,
    `Willing to audition: ${userInputs.auditions ? 'Yes' : 'No'}`,
    `IEP: ${userInputs.iep ? 'Yes' : 'No'}`,
    `Size preference: ${userInputs.size}`,
  ].join('\n')

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 100,
    system:
      'You are a helpful NYC high school admissions assistant. Generate a 1-2 sentence rationale explaining why this school might be a good fit for this student. Be specific — cite the school\'s admissions type and any relevant features from the overview. Do not use language like "you will get in" or "guaranteed". Do not guarantee admission. End by naming the admissions type. Keep it under 60 words.',
    messages: [
      {
        role: 'user',
        content: `${schoolCtx}\n\nStudent profile:\n${studentCtx}\n\nWrite a 1-2 sentence match rationale.`,
      },
    ],
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
