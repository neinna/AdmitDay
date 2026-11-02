import { nearestStations } from '@/lib/school-list-utils'

jest.mock('@/data/nyc-subway-stations.json', () => ({
  __esModule: true,
  default: [
    { id: 'a', name: 'Alpha', lat: 40.7, lng: -74.0 },
    { id: 'b', name: 'Beta', lat: 40.705, lng: -74.0 },
    { id: 'c', name: 'Gamma', lat: 40.71, lng: -74.0 },
    { id: 'd', name: 'Beta', lat: 40.7, lng: -74.002 },
    { id: 'e', name: 'Far', lat: 41.5, lng: -74.0 },
  ],
}))

const point = { lat: 40.7, lng: -74.0 }

describe('nearestStations', () => {
  it('returns the closest stations in order', () => {
    const r = nearestStations(point, 3)
    expect(r.map((s) => s.name)).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(r[0].miles).toBeLessThan(r[1].miles)
  })
  it('respects limit and maxMiles', () => {
    expect(nearestStations(point, 1).map((s) => s.name)).toEqual(['Alpha'])
    expect(nearestStations(point, 5, 0.5).map((s) => s.name)).toEqual(['Alpha', 'Beta'])
  })
  it('drops duplicate names, keeping the closest', () => {
    const r = nearestStations(point, 5)
    expect(r.filter((s) => s.name === 'Beta')).toHaveLength(1)
    expect(r.find((s) => s.name === 'Beta')!.miles).toBeLessThan(0.25)
  })
  it('returns [] far from any station', () => {
    expect(nearestStations({ lat: 43, lng: -70 })).toEqual([])
  })
})
