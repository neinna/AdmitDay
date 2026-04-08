'use client'

import Link from 'next/link'
import { usePostHog } from 'posthog-js/react'

interface Props {
  href: string
}

export default function ViewRequirementsLink({ href }: Props) {
  const posthog = usePostHog()

  return (
    <Link
      href={href}
      className="text-sm font-medium text-gray-900 underline hover:no-underline whitespace-nowrap"
      onClick={() => posthog?.capture('view_requirements_clicked')}
    >
      View requirements checklist &rarr;
    </Link>
  )
}
