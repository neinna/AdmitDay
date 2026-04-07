import schoolsData from '../schools.json'

describe('schools.json', () => {
  it('loads and is an array', () => {
    expect(Array.isArray(schoolsData)).toBe(true)
  })

  it('has at least 100 schools', () => {
    expect(schoolsData.length).toBeGreaterThan(100)
  })

  it('each school has a name field', () => {
    schoolsData.forEach((school: any) => {
      expect(school).toHaveProperty('name')
    })
  })
})
