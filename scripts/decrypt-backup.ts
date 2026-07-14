// Decrypt an encrypted Hearth backup (`*.json.enc`) back to portable JSON (#39, #46).
// Works for both off-site copies and the local `<data>/backups` snapshots produced
// when HEARTH_BACKUP_PASSPHRASE is set — they share the same AES-256-GCM envelope.
//
//   HEARTH_BACKUP_PASSPHRASE=... npm run backup:decrypt -- <in.json.enc> [out.json]
//
// The passphrase is read from HEARTH_BACKUP_PASSPHRASE (the same value used to
// encrypt the backups). With no <out.json>, writes alongside the input
// with the `.enc` suffix stripped. The resulting JSON is a normal Hearth snapshot,
// restorable via Settings → Data → Import.
import { readFileSync, writeFileSync } from 'node:fs'
import { decryptSnapshot } from '../src/server/backup/encrypt'

const [input, output] = process.argv.slice(2)
if (!input) {
  console.error('Usage: npm run backup:decrypt -- <in.json.enc> [out.json]')
  process.exit(1)
}

const passphrase = process.env.HEARTH_BACKUP_PASSPHRASE
if (!passphrase) {
  console.error('Set HEARTH_BACKUP_PASSPHRASE to the passphrase used for the off-site backups.')
  process.exit(1)
}

const out = output ?? (input.endsWith('.enc') ? input.slice(0, -'.enc'.length) : `${input}.json`)
const json = decryptSnapshot(readFileSync(input), passphrase)
writeFileSync(out, json)
console.log(`Decrypted ${input} → ${out}`)
