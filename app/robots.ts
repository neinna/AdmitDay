import type { MetadataRoute } from 'next'

// Generates /robots.txt. Public product is crawlable; the family SHSAT tool is not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: ['/shsat'],
    },
  }
}
