export interface SchoolFlags {
  has_shsat: boolean
  has_audition: boolean
  has_screened: boolean
  has_open: boolean
  has_borough_priority: boolean
  high_impact: boolean
  has_consortium: boolean
  has_ib: boolean
}

export interface SqrData {
  performance_score?: number
  impact_score?: number
  rating?: string
  performance_pctl?: number
  impact_pctl?: number
  year?: string
  source_url?: string
}

// One school year's Performance/Impact scores from the DOE HS School Quality
// Report results workbook (issue #292). A year the DOE didn't publish a
// numeric score for is left out of the array entirely -- never a zeroed or
// null entry.
export interface SqrHistoryEntry {
  year: string
  performance_score?: number
  performance_pctl?: number
  impact_score?: number
  impact_pctl?: number
}

export interface DoeData {
  overview: string
  language: string
  extracurriculars: string
  website: string
  phone: string
  address: string
  zip: string
  academic_opportunities?: string
  prgdesc?: string
  requirements?: Record<string, string>
  audition_information?: string[]
  interests?: string[]
  graduation_rate?: number | null
  attendance_rate?: number | null
  college_career_rate?: number | null
  subway?: string
  bus?: string
  psal_sports_boys?: string
  psal_sports_girls?: string
  psal_sports_coed?: string
  advancedplacement_courses?: string
  diplomaendorsements?: string
  neighborhood?: string
  addtl_info?: string
}

export interface SchoolProgram {
  // Compatibility fields from the older NYC-SIFT-shaped program rows.
  program?: string
  admissions_type?: string
  raw_method?: string

  // Current MySchools per-program fields.
  program_name?: string
  program_code?: string
  admissions_method?: string
  admissions_method_description?: string
  grade_span?: string
  description?: string
  seats?: Record<string, unknown>
  seats_filled_last_year?: {
    general_education?: boolean
    students_with_disabilities?: boolean
  }
  eligibility?: Record<string, unknown>
  requirements?: Record<string, unknown>
  provenance?: {
    source: 'MySchools' | string
    url: string
    fetched_at: string
    admissions_cycle?: string
  }
}

export interface School {
  dbn: string
  name: string
  borough: string
  size: string
  total_students: number | null
  applicants_per_seat: number | null
  sqr?: SqrData
  sqr_history?: SqrHistoryEntry[]
  admissions_types: string[]
  programs: SchoolProgram[]
  flags: SchoolFlags
  doe_data: DoeData
  last_verified: string
  // MySchools open-house text, school hours, and independent website
  // (issue #346). Omitted entirely when MySchools doesn't publish a value --
  // never an empty string.
  open_house?: {
    text: string
    fetched_at: string
  }
  hours?: {
    start?: string
    end?: string
  }
  school_website?: string
}

export type SectionType = 'shsat' | 'audition' | 'screened' | 'edopt' | 'lottery'

export interface SectionGroup {
  type: SectionType
  label: string
  schools: School[]
  startIndex: number // for sequential row numbering across sections
}

export interface UserInputs {
  boroughs: string[]
  interests: string[]
  sports: string[]
  shsat: boolean
  auditions: boolean
  academicRatings: ('exceptional' | 'strong' | 'above_average')[]
  iep: boolean
  size: 'small' | 'medium' | 'large' | ''
}
