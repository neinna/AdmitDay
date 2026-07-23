import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request)
  if (!rl.ok) {
    return Response.json(
      { error: "You're sending requests too quickly — please wait a moment and try again." },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

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
    school.doe_data?.psal_sports_boys
      ? `PSAL sports (boys): ${school.doe_data.psal_sports_boys}`
      : null,
    school.doe_data?.psal_sports_girls
      ? `PSAL sports (girls): ${school.doe_data.psal_sports_girls}`
      : null,
    school.doe_data?.psal_sports_coed
      ? `PSAL sports (coed): ${school.doe_data.psal_sports_coed}`
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
    userInputs.sports?.length
      ? `Sports filters selected: ${userInputs.sports.join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    system:
      'You are a helpful NYC high school admissions assistant. Respond with only a valid JSON object — no markdown, no explanation, no code fences. The JSON must have exactly two fields:\n' +
      '- "title": a 4-6 word summary of what makes this school distinctive (e.g., "Elite STEM, highly competitive" or "Arts focus, open lottery")\n' +
      '- "rationale": 2-3 short sentences (under 80 words total) describing what makes this school stand out. First sentence: describe the school\'s academic focus, curriculum, or culture based on available data. Then use the language and extracurricular data to give concrete details with counts and examples (e.g., "Offers 7 languages including Japanese and Latin. 190+ clubs spanning robotics, debate, and theater."). If the user selected sports, mention whether this school offers those specific sports (e.g., "Soccer offered through PSAL" or "Soccer not offered"). Do NOT repeat academic scores or applicants per seat — these are already shown on the card. Do NOT repeat the user\'s filter selections (academic level, size preference, borough). Focus on what makes THIS school interesting.\n' +
      'Example: {"title":"Elite STEM, highly competitive","rationale":"Rigorous STEM-focused curriculum for top performers with strong humanities offerings. Offers 7 languages including Japanese and Latin. 190+ student-run clubs spanning robotics, debate, and theater. Soccer offered through PSAL."}',
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
