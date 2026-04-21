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
    school.doe_data?.language
      ? `Languages offered: ${school.doe_data.language}`
      : null,
    school.doe_data?.extracurriculars
      ? `Extracurriculars: ${String(school.doe_data.extracurriculars).slice(0, 400)}`
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
      'You are a helpful NYC high school admissions assistant. Respond with only a valid JSON object — no markdown, no explanation, no code fences. The JSON must have exactly two fields:\n' +
      '- "title": a 4-6 word summary of what makes this school distinctive (e.g., "Elite academics, competitive SHSAT" or "Arts focus, open lottery")\n' +
      '- "rationale": 2-3 short sentences (under 80 words total) describing what makes this school stand out. First sentence: describe the school\'s academic focus, curriculum, or culture. Then use the language and extracurricular data to give concrete details with counts and examples (e.g., "Offers 7 languages including Japanese and Latin. 190+ clubs spanning robotics, debate, and theater."). Do NOT repeat the user\'s filter selections (academic level, size preference, borough) — they already know what they picked. Focus on what makes THIS school interesting.\n' +
      'Example: {"title":"Elite STEM, highly competitive","rationale":"Rigorous STEM-focused curriculum for top performers. Offers 7 languages including Japanese and Latin. 190+ student-run clubs spanning robotics, debate, and theater."}',
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
