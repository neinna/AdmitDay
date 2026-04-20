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

  const academicLevelMap: Record<string, string> = {
    exceptional: 'Student is a strong academic performer',
    strong: 'Student has solid grades',
    above_average: 'Student has average to above-average grades',
  }
  const academicDesc = userInputs.academicRatings?.length
    ? userInputs.academicRatings.map((r: string) => academicLevelMap[r] ?? r).join('; ')
    : 'not specified'

  const studentCtx = [
    `Home borough: ${userInputs.boroughs?.join(', ') || 'not specified'}`,
    `Interests: ${userInputs.interests?.length ? userInputs.interests.join(', ') : 'not specified'}`,
    `Academic level: ${academicDesc}`,
    `Willing to take SHSAT: ${userInputs.shsat ? 'Yes' : 'No'}`,
    `Willing to audition: ${userInputs.auditions ? 'Yes' : 'No'}`,
    `IEP: ${userInputs.iep ? 'Yes' : 'No'}`,
    `Size preference: ${userInputs.size}`,
  ].join('\n')

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    system:
      'You are a NYC high school admissions advisor writing a brief match summary for a parent reviewing their child\'s school list.\n\n' +
      'Rules:\n' +
      '- Do not restate the admissions type, academic score, or applicants per seat — those are already shown on the card\n' +
      '- Do not say anything implying guaranteed admission\n' +
      '- Focus on why this school fits this specific student: their interests, size preference, and academic level\n' +
      '- If the school has a distinctive program, culture, or strength mentioned in the overview, lead with that\n' +
      '- Be specific and human, not generic\n' +
      '- 2 sentences max, under 50 words total\n\n' +
      'Respond with only a valid JSON object with exactly two fields:\n' +
      '- "title": 4-6 words summarizing the fit (e.g. "Strong STEM, matches your interests" or "Small school, arts focus")\n' +
      '- "rationale": 1-2 sentences on why this school fits this student specifically\n\n' +
      'No markdown, no code fences, no explanation outside the JSON.',
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
