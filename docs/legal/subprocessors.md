# Subprocessor register

Every third party that can see data belonging to the people using this instance,
what each one holds, and where it processes it.

The point of writing it down: as soon as Hearth runs somewhere other than the
household's own hardware, other companies are handling that household's financial
data — not because anything was sent to them, but because the app lives on their
infrastructure. When someone asks "where is my data?", this is the answer, and it
should already be written.

This describes what the software does and where it's hosted. It is not legal
advice. Hearth is self-hosted and not sold; an instance running for friends and
family is not a SaaS product, but the people on it still have their finances on
someone else's computer, and they're owed a straight answer about whose.

## Scope

Two kinds of instance, and only one of them needs this:

- **LAN / own hardware** — nothing here applies. No third party touches the data,
  because there is no third party. Every integration below is off by default.
- **Hosted on a VPS** — the rows below apply, in full, from the moment the first
  other person's data is on it. Whether it's invite-only or commercial makes no
  difference to who can read the disk.

Everything below other than the VPS itself is optional. A row that says *not
enabled* is not a gap — it's the correct entry for a feature that's switched off,
and it stops the next person wondering whether it was forgotten.

## The register

| Processor | Purpose | What it can see | Region | Terms / DPA |
| --- | --- | --- | --- | --- |
| _TBD — VPS provider_ | Runs the app and the database | Everything: accounts, password hashes, TOTP secrets, the complete financial history of every household, IP addresses in the audit trail and rate limiter, container logs | _TBD_ | _TBD_ |
| _TBD — S3-compatible bucket_ | Off-site encrypted backups (`HEARTH_BACKUP_OFFSITE=s3`) | Encrypted snapshots — the same contents as the database, including password hashes and TOTP secrets. Ciphertext only; the passphrase never leaves the instance | _TBD_ | _TBD_ |
| _TBD — SMTP relay_ | Invites, address confirmation, password reset (`HEARTH_MAIL_TRANSPORT=smtp`) | Recipient email addresses, display names, and the body of those messages — which contains live invite and reset tokens | _TBD_ | _TBD_ |
| _TBD — alert webhook (ntfy or similar)_ | Backup-failure and failed-sign-in alerts (`HEARTH_ALERT_WEBHOOK`) | Event name, error text, failed-attempt counts and a timestamp. No usernames, no email addresses, no IP addresses — see below | _TBD_ | _TBD_ |
| _TBD — heartbeat monitor (Healthchecks.io or similar)_ | Dead-man's switch on the backup job (`HEARTH_BACKUP_HEARTBEAT_URL`) | That a backup ran, when, and a one-line outcome | _TBD_ | _TBD_ |
| GitHub | Release check (`HEARTH_UPDATE_CHECK`), container image pulls, in-app feedback (`HEARTH_FEEDBACK_TOKEN`) | The instance's IP address on each check or pull. Feedback submissions carry whatever the user typed, plus their display name and the page they were on — **filed into a public repository** | US | [GitHub DPA](https://github.com/customer-terms/github-data-protection-agreement) |
| Let's Encrypt | TLS certificates, via Caddy on the public compose file | The instance's hostname and the ACME contact email. Issued certificates are published in Certificate Transparency logs, so **the hostname is permanently public** | US | [Subscriber Agreement](https://letsencrypt.org/repository/) |
| _TBD — domain registrar / DNS_ | Resolves the instance's hostname | The hostname and the VPS's IP address | _TBD_ | _TBD_ |

## Notes on the rows that surprise people

**The backup bucket is the sharpest edge.** The VPS provider is obvious. The
bucket is the one that gets forgotten, and it holds a complete dump of every
household's finances plus password hashes and MFA secrets. It's encrypted before
it leaves the instance, which is why the passphrase matters more than the bucket's
own access controls — but the bucket's region is a separate decision from the
VPS's, and it defaults to `us-east-1` when `HEARTH_BACKUP_S3_REGION` is unset.

**The mail relay sees live tokens.** Invite and reset emails contain working
credentials for the duration of their validity, not just an address. A relay is
therefore a processor of more than contact details.

**The alert webhook is deliberately thin.** Alerts carry an event name, a message,
an error string and counts — never a username, email address or IP. That was a
design choice, not an accident, and it's what makes pointing it at a public ntfy
topic tolerable. If an alert ever grows a field naming a person, this row changes.

**In-app feedback goes somewhere public.** A bug report filed from inside the app
becomes an issue in a public GitHub repository, carrying the reporter's display
name. The submission form warns about this; anything user-facing that describes
data handling has to say it too.

**Let's Encrypt makes the hostname public forever.** Certificate Transparency is
the point of CT — but it means the instance's domain is enumerable by anyone
watching the logs, and cannot be un-published. Choose a hostname on that basis.

## Before the first other person's data lands

- [ ] Check each region in the provider's own console — the bucket's region, the
      relay's sending region, the monitor's probe location. Read it off the
      setting, don't infer it from the marketing page.
- [ ] Move anything US-by-default to UK/EU while it's still cheap. A bucket and a
      relay are minutes to move before there's data in them and a migration after.
- [ ] Where data does leave the UK/EU and can't move — GitHub and Let's Encrypt,
      realistically — record why it's acceptable rather than leaving it blank.
- [ ] Fill in every _TBD_ above at provisioning time, not afterwards.

## Review

Re-read this whenever an integration is turned on, moved, or replaced, and once a
year regardless. The version-controlled history of this file is the record of when
each answer was last true.
