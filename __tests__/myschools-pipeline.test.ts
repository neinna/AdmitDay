import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'

describe('MySchools program pipeline', () => {
  const buildSource = fs.readFileSync(path.join(__dirname, '../build_school_data.py'), 'utf-8')
  const refreshSource = fs.readFileSync(path.join(__dirname, '../scripts/refresh-data.ts'), 'utf-8')
  const seedSource = fs.readFileSync(path.join(__dirname, '../scripts/seed-schools.ts'), 'utf-8')
  const embedSource = fs.readFileSync(path.join(__dirname, '../scripts/embed-schools.ts'), 'utf-8')
  const vpsRefreshSource = fs.readFileSync(path.join(__dirname, '../scripts/vps-data-refresh.sh'), 'utf-8')

  it('keeps workflow YAML parseable', () => {
    const result = spawnSync(
      'ruby',
      [
        '-e',
        "require 'yaml'; ARGV.each { |f| YAML.load_file(f) }",
        '.github/workflows/ci.yml',
      ],
      { cwd: path.join(__dirname, '..'), encoding: 'utf-8' }
    )

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
  })

  it('keeps the VPS refresh runner shell-parseable', () => {
    const result = spawnSync('bash', ['-n', 'scripts/vps-data-refresh.sh'], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf-8',
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
  })

  it('uses the MySchools scraper for per-program data during the build step', () => {
    expect(buildSource).toContain('scrape_school_programs')
    expect(buildSource).toContain('fetch_myschools_program_detail')
    expect(buildSource).toContain('MYSCHOOLS_CACHE_DIR')
    expect(buildSource).toContain('ADMITDAY_SCHOOLS_OUTPUT')
  })

  it('keeps old program fields only as compatibility aliases', () => {
    expect(buildSource).toContain('program["program"] = program.get("program_name")')
    expect(buildSource).toContain('program["admissions_type"] = method')
  })

  it('requires MySchools program validation in the production refresh path', () => {
    expect(refreshSource).toContain('requireMySchoolsPrograms: true')
  })

  it('includes current program data in RAG chunks', () => {
    expect(embedSource).toContain('chunkType: "programs"')
    expect(embedSource).toContain('Seats and demand:')
    expect(embedSource).toContain('Requirements:')
    expect(embedSource).toContain('program_codes')
  })

  it('runs refresh PR creation from the VPS without GitHub app secrets', () => {
    expect(vpsRefreshSource).toContain('APP_ENV_FILE="${APP_ENV_FILE:-$APP_DIR/.env.local}"')
    expect(vpsRefreshSource).toContain('ROOT_ENV_FILE="${ROOT_ENV_FILE:-/root/.env.local}"')
    expect(vpsRefreshSource).toContain('AGENT_ENV_FILE="${AGENT_ENV_FILE:-/root/.env.agents}"')
    expect(vpsRefreshSource).toContain('load_env_file "$APP_ENV_FILE"\nload_env_file "$ROOT_ENV_FILE"\nload_env_file "$AGENT_ENV_FILE"')
    expect(vpsRefreshSource).toContain('require_env OPENAI_API_KEY')
    expect(vpsRefreshSource).toContain('ADMITDAY_SKIP_POSTGRES_SEED=1 npm run refresh:data')
    expect(vpsRefreshSource).toContain('git add schools.json data/school-embeddings.json')
    expect(vpsRefreshSource).toContain('gh workflow run ci.yml --repo "$REPO" --ref "$BRANCH"')
    expect(vpsRefreshSource).toContain('gh pr create')
  })

  it('lets the VPS runner merge only validated data refresh PRs', () => {
    expect(vpsRefreshSource).toContain('merge_refresh_pr')
    expect(vpsRefreshSource).toContain('assert_refresh_pr_files')
    expect(vpsRefreshSource).toContain('assert_refresh_ci_green')
    expect(vpsRefreshSource).toContain('EXPECTED_DATA_FILES="data/school-embeddings.json\nschools.json"')
    expect(vpsRefreshSource).toContain('gh pr merge "$BRANCH"')
  })

  it('seeds Postgres from the VPS after refreshed tracked data lands on main', () => {
    expect(vpsRefreshSource).toContain('apply_merged_data')
    expect(vpsRefreshSource).toContain('require_env POSTGRES_URL')
    expect(vpsRefreshSource).toContain('git pull --ff-only origin main')
    expect(vpsRefreshSource).toContain('scripts/seed-schools.ts')
  })

  it('can seed from root schools.json in clean CI checkouts', () => {
    expect(seedSource).toContain('data/schools.json')
    expect(seedSource).toContain('schools.json')
    expect(seedSource).toContain('fs.existsSync(dataSchoolsPath) ? dataSchoolsPath : rootSchoolsPath')
  })
})
