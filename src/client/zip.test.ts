import { describe, it, expect } from 'vitest'
import { crc32, zipStore } from './zip'

describe('crc32', () => {
  it('matches the standard check value for "123456789"', () => {
    const bytes = new TextEncoder().encode('123456789')
    expect(crc32(bytes) >>> 0).toBe(0xcbf43926)
  })
})

describe('zipStore', () => {
  it('produces a zip blob with the PK signature and EOCD record', async () => {
    const blob = zipStore([
      { name: 'a.csv', data: new TextEncoder().encode('x,y\n1,2\n') },
      { name: 'b.csv', data: new TextEncoder().encode('n\n7\n') },
    ])
    const bytes = new Uint8Array(await blob.arrayBuffer())
    // Local file header magic "PK\x03\x04"
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x50, 0x4b, 0x03, 0x04])
    // End-of-central-directory magic "PK\x05\x06" appears near the end
    const tail = bytes.slice(-22)
    expect([tail[0], tail[1], tail[2], tail[3]]).toEqual([0x50, 0x4b, 0x05, 0x06])
    // Two entries recorded in the EOCD
    expect(tail[10]).toBe(2)
  })
})
