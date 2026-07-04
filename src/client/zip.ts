/** Minimal ZIP writer (store method, no compression) so we can bundle one CSV
 *  per table into a single download without a third-party dependency. */

export interface ZipEntry {
  name: string
  data: Uint8Array
}

/** Standard CRC-32 (IEEE 802.3), as required by the ZIP local/central headers. */
export function crc32(bytes: Uint8Array): number {
  let crc = ~0
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]!
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (~crc) >>> 0
}

const u16 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff])
const u32 = (n: number) =>
  new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff])

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

// Fixed DOS timestamp (1980-01-01 00:00) — deterministic, and avoids the
// "invalid date" warning some extractors emit for an all-zero date field.
const DOS_TIME = 0
const DOS_DATE = 0x21

/** Build a ZIP archive (stored, uncompressed) from the given entries. */
export function zipStore(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder()
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const size = entry.data.length

    const local = concat([
      u32(0x04034b50), // local file header signature
      u16(20), // version needed
      u16(0), // flags
      u16(0), // method: store
      u16(DOS_TIME),
      u16(DOS_DATE),
      u32(crc),
      u32(size), // compressed size
      u32(size), // uncompressed size
      u16(nameBytes.length),
      u16(0), // extra length
      nameBytes,
      entry.data,
    ])
    localParts.push(local)

    centralParts.push(
      concat([
        u32(0x02014b50), // central directory header signature
        u16(20), // version made by
        u16(20), // version needed
        u16(0), // flags
        u16(0), // method
        u16(DOS_TIME),
        u16(DOS_DATE),
        u32(crc),
        u32(size),
        u32(size),
        u16(nameBytes.length),
        u16(0), // extra length
        u16(0), // comment length
        u16(0), // disk number start
        u16(0), // internal attrs
        u32(0), // external attrs
        u32(offset), // local header offset
        nameBytes,
      ]),
    )
    offset += local.length
  }

  const central = concat(centralParts)
  const end = concat([
    u32(0x06054b50), // end of central directory signature
    u16(0), // disk number
    u16(0), // central dir start disk
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(offset), // central dir offset
    u16(0), // comment length
  ])

  return new Blob([...localParts, central, end] as BlobPart[], { type: 'application/zip' })
}
