import { BlockList, isIPv4 } from 'node:net'

/** Where a reverse proxy or tunnel sits relative to Hearth: the same host
 *  (loopback) or a private network such as the Docker bridge. */
const PRIVATE = new BlockList()
PRIVATE.addSubnet('127.0.0.0', 8)
PRIVATE.addSubnet('10.0.0.0', 8)
PRIVATE.addSubnet('172.16.0.0', 12)
PRIVATE.addSubnet('192.168.0.0', 16)
PRIVATE.addSubnet('169.254.0.0', 16)
PRIVATE.addAddress('::1', 'ipv6')
PRIVATE.addSubnet('fc00::', 7, 'ipv6')
PRIVATE.addSubnet('fe80::', 10, 'ipv6')

export function isPrivateAddress(address: string): boolean {
  // A dual-stack socket reports IPv4 peers as `::ffff:a.b.c.d`.
  const v4 = address.startsWith('::ffff:') ? address.slice(7) : address
  if (isIPv4(v4)) return PRIVATE.check(v4, 'ipv4')
  try {
    return PRIVATE.check(address, 'ipv6')
  } catch {
    return false
  }
}

export type TrustProxy = false | string[] | ((address: string, hop: number) => boolean)

/** Parse HEARTH_TRUST_PROXY into a Fastify `trustProxy` value.
 *
 *  Fastify's `trustProxy: true` trusts the *left-most* X-Forwarded-For entry —
 *  which is entirely client-controlled, so an attacker can spoof any IP and slip
 *  the login rate limiter. Instead we trust a bounded hop count (the number of
 *  proxies actually in front of us) or an explicit list of proxy IPs/CIDRs, so
 *  only the address our own trusted proxy appended is honoured.
 *
 *  A hop count is a trust function, not a number: Fastify ≥5.12 fails a numeric
 *  `trustProxy` closed, since it can't tell a proxy from a direct client. Each
 *  counted hop must also be a private/loopback address, which is what tells them apart.
 *
 *  Accepted values:
 *    unset / "" / "0" / "false"  → false  (directly exposed; use req.socket IP)
 *    "true"                      → 1 hop  (legacy boolean → trust exactly one hop)
 *    a positive integer "N"      → N hops (trust N private-address proxies; single proxy = 1)
 *    a comma-separated CIDR/IP list       → that list (trust only those proxies)
 */
export function parseTrustProxy(raw: string | undefined): TrustProxy {
  const v = (raw ?? '').trim()
  if (v === '' || v === '0' || v.toLowerCase() === 'false') return false
  if (v.toLowerCase() === 'true') return trustHops(1)
  if (/^\d+$/.test(v)) return trustHops(Number(v))
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function trustHops(hops: number) {
  return (address: string, hop: number) => hop < hops && isPrivateAddress(address)
}
