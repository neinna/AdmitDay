export interface SchoolFlags {
  has_shsat: boolean
  has_audition: boolean
  has_screened: boolean
  has_open: boolean
  has_borough_priority: boolean
  is_hidden_gem: boolean
}

export interface DoeData {
  overview: string
  language: string
  extracurriculars: string
  website: string
  phone: string
  address: string
  zip: string
}

export interface SchoolProgram {
  program: string
  admissions_type: string
}

export interface School {
  dbn: string
  name: string
  borough: string
  size: string
  total_students: number | null
  applicants_per_seat: number | null
  academic_score_pct: number | null
  survey_score_pct: number | null
  admissions_types: string[]
  programs: SchoolProgram[]
  flags: SchoolFlags
  doe_data: DoeData
  sift_url: string
  last_verified: string
}

export interface UserInputs {
  borough: string
  commute: 'short' | 'flexible'
  interests: string[]
  sports: string[]
  shsat: boolean
  auditions: boolean
  academicLevel: 'low' | 'medium' | 'high'
  iep: boolean
  size: 'small' | 'medium' | 'large'
}
