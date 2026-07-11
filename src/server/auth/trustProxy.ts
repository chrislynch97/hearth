/** Parse HEARTH_TRUST_PROXY into a Fastify `trustProxy` value.
 *
 *  Fastify's `trustProxy: true` trusts the *left-most* X-Forwarded-For entry —
 *  which is entirely client-controlled, so an attacker can spoof any IP and slip
 *  the login rate limiter. Instead we trust a bounded hop count (the number of
 *  proxies actually in front of us) or an explicit list of proxy IPs/CIDRs, so
 *  only the address our own trusted proxy appended is honoured.
 *
 *  Accepted values:
 *    unset / "" / "0" / "false"  → false  (directly exposed; use req.socket IP)
 *    "true"                      → 1       (legacy boolean → trust exactly one hop)
 *    a positive integer "N"      → N       (trust N proxy hops; single proxy = 1)
 *    a comma-separated CIDR/IP list        → that list (trust only those proxies)
 */
export function parseTrustProxy(raw: string | undefined): boolean | number | string[] {
  const v = (raw ?? '').trim()
  if (v === '' || v === '0' || v.toLowerCase() === 'false') return false
  if (v.toLowerCase() === 'true') return 1
  if (/^\d+$/.test(v)) return Number(v)
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
