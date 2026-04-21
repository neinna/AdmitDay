const EXTRAS_SKIP =
  /^(Attendance|Punctuality|Course Grades|Standardized Test Scores|Geographic|Zoned|Initial filter|NYSESLAT|Demonstrated Interest|Please note)/i

export function getExtrasCallout(requirements: Record<string, string>): string | undefined {
  const labels: string[] = []
  for (const value of Object.values(requirements)) {
    if (EXTRAS_SKIP.test(value)) continue
    if (/interview/i.test(value)) labels.push('interview')
    else if (/writing exercise|writing sample|essay|written/i.test(value)) labels.push('written assessment')
    else if (/portfolio/i.test(value)) labels.push('portfolio')
    else if (/on-site|on site/i.test(value)) labels.push('on-site assessment')
    else if (/audition/i.test(value)) labels.push('audition')
    else if (/honors|accelerated/i.test(value)) labels.push('honors coursework')
    else if (/test|assessment|talent|special/i.test(value)) labels.push('additional assessment')
  }
  const unique = labels.filter((v, i, a) => a.indexOf(v) === i)
  if (unique.length === 0) return undefined
  return `Requires ${unique.join(' and ')}`
}
