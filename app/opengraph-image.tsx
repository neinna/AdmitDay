import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'AdmitDay'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 80,
          background: '#FFFFFF',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 36, height: 36, background: '#1D4ED8', marginRight: 24 }} />
          <div style={{ fontSize: 88, fontWeight: 700, color: '#111111' }}>AdmitDay</div>
        </div>
        <div style={{ marginTop: 32, fontSize: 36, color: '#555555' }}>
          Find NYC public high schools that match your student&apos;s profile.
        </div>
      </div>
    ),
    { ...size }
  )
}
