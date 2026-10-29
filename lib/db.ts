import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

// Same result shape @vercel/postgres returned, so callers keep reading .rows and .rowCount.
export type QueryResult<Row = Record<string, any>> = { rows: Row[]; rowCount: number | null }

// Created on the first query, not at import: `next build` imports route modules
// with no POSTGRES_URL, and neon() throws when the URL is missing.
let client: NeonQueryFunction<false, true> | undefined

function db(): NeonQueryFunction<false, true> {
  client ??= neon(process.env.POSTGRES_URL ?? '', { fullResults: true })
  return client
}

export async function sql<Row = Record<string, any>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<QueryResult<Row>> {
  const result = await db()(strings, ...values)
  return { rows: result.rows as Row[], rowCount: result.rowCount }
}

sql.query = async <Row = Record<string, any>>(text: string, params?: unknown[]): Promise<QueryResult<Row>> => {
  const result = await db().query(text, params)
  return { rows: result.rows as Row[], rowCount: result.rowCount }
}
