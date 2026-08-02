# Breach runbook

What to do in the first hours after Hearth, or the box it runs on, leaks
personal data.

Written for the operator, in the imperative, on the assumption that the person
reading it is stressed and possibly not the person who wrote it. Follow it in
order. The decisions that need a clear head — what counts as a breach, where the
evidence is, which credentials matter — are made here, in advance, so that they
don't have to be made at 2am.

This is not legal advice. It describes what the software records and what the
operator can do about it; whether a given incident is legally notifiable is a
judgement, and [Decide and notify](#4-decide-and-notify) is where it gets made.

## Contact card

Fill these in before you need them. An empty line here is the thing that costs
an hour.

| | |
| --- | --- |
| **Controller** (who is responsible for this instance) | _name, email, phone_ |
| **Second pair of eyes** (who you call before deciding) | _name, phone_ |
| **ICO breach report** | <https://ico.org.uk/for-organisations/report-a-breach/> |
| **ICO helpline** | 0303 123 1113 (Mon–Fri, business hours) |
| **Hosting provider** — support / abuse | _provider, account id, support URL_ |
| **Object store** (off-site backups) — support | _provider, bucket, support URL_ |
| **Domain registrar / DNS** | _registrar, account_ |
| **Where the credentials live** | `.env` beside the compose file on the host, plus your password manager — full list in [Rotate](#rotate-credentials) |
| **Where you write the timeline** | _a file, a note, a private issue — decide now_ |

## 1. What counts

A personal data breach is any **loss of confidentiality, integrity or
availability** of personal data — not just theft. Hearth holds a household's
complete financial history plus names, usernames, email addresses, password
hashes and two-factor secrets, so most of these land on the serious end.

Treat each of these as a breach and start the clock:

- **A backup left somewhere it shouldn't be** — a snapshot copied to a laptop, a
  cloud drive, a chat message. A snapshot contains password hashes and TOTP
  secrets, and is plaintext unless `HEARTH_BACKUP_PASSPHRASE` is set.
- **The backup passphrase leaks** — pasted into the wrong window, committed,
  found in a shell history, or held by someone who has left. On its own this is
  only a breach if someone could also reach the encrypted files; assume they can
  if the two ever travelled together.
- **An off-site bucket becomes public**, or its access key leaks. The key alone
  reads every snapshot in the bucket.
- **A session token or invite link leaks.** An unexpired invite link *is* a
  credential for 7 days: whoever holds it can create an account in that
  household.
- **An email goes to the wrong recipient** carrying personal data — an export, a
  reset link, an invite naming somebody.
- **One household's data becomes visible to another** — a tenancy bug, a bad
  restore, a member left with access they should have lost. Personal data
  reaching the wrong *user* is as much a breach as it reaching a stranger.
- **A lost or stolen device** holding an export, a database copy, a signed-in
  browser, or an SSH key to the host.
- **Host compromise** — anything that suggests someone else has had shell on the
  box, root in the container, or the database volume. The database is not
  encrypted at rest, so host access is total access.
- **Data destroyed or made unavailable** with no usable backup — ransomware, a
  botched restore, a volume deleted. Availability counts too.
- **An unnoticed public exposure** — the instance reachable from the internet
  without `HEARTH_PUBLIC=1`, open registration left on, or the owner password
  removed.

**What does not count**, so a false alarm doesn't burn the clock:

- A burst of failed logins that never succeeded. The `auth_failures` alert fires
  at 10 in an hour by design; someone rattling the door is not someone through
  it. Check whether any `login` entry follows the `login_failed` ones — if none
  does, this is noise, and worth writing down but nothing more.
- A member seeing their own household's data, whatever their role. Shared
  finances are the product.
- An outage with the data intact — a container that won't start, an expired
  certificate, a full disk. Availability restored within your normal recovery
  time from an intact backup is an incident, not a breach.
- A vulnerability report against the Hearth codebase with no sign of exploitation
  on your instance. That's [SECURITY.md](../../SECURITY.md) and a patch, not
  this document. Log it, patch it, and only come back here if the audit trail
  shows it was actually used.
- A backup that fails, provided a previous good one still exists.
- Demo mode. It is deterministic fake data.

If you are not sure, treat it as a breach and downgrade later. The record of a
careful assessment that concluded "no risk" is worth having; a clock that
started late is not recoverable.

## 2. Where the evidence is

Read this section **before** touching anything. Several of these have short
retention or die on restart, and the order in
[Immediate actions](#3-immediate-actions-in-order) exists because of it.

| Source | Where | How long it lasts |
| --- | --- | --- |
| **Audit trail** | **Settings → Security** | Kept forever by default (`auditRetentionDays` = 0). If your household has set a retention window, an hourly job **hard-deletes** anything older unless "archive before pruning" is on. **Not included in backup snapshots** — there is no second copy anywhere. |
| **Your sessions** | **Settings → Account → Sessions** — IP and user agent per session | Rows are purged hourly once expired: 14 days idle, 90 days absolute. Each person sees only their own. |
| **`auth_failures` alert** | Container log, plus `HEARTH_ALERT_WEBHOOK` if set | Whatever the alert target keeps. ntfy's default retention is on the order of hours to days — treat it as the first thing to lose. |
| **Container log** | `docker compose logs hearth` — one line per request: method, URL, status, client IP. No bodies, cookies or tokens | Capped at 10 MB × 3 per service in the shipped compose files. On a busy instance that can be hours. **Rotates away, and a `docker compose down` takes it.** |
| **Caddy access log** | `docker compose logs caddy` on the public VPS deploy | Same cap, same fragility. |
| **Object store access log** | The provider's console (R2 / B2 / S3) | Provider-defined, and usually **off until you turn it on**. Turn it on now, not during an incident. |
| **Uptime / heartbeat history** | Healthchecks.io (`HEARTH_BACKUP_HEARTBEAT_URL`) | Provider-side, months. Useful for "when did it stop / restart". |
| **Backup snapshots** | `<data>/backups`, plus the off-site target | The most recent 14 (`HEARTH_BACKUP_KEEP`). Also *evidence*: a snapshot shows what the data looked like on a given day. |
| **Host / provider logs** | SSH auth log, the provider's console login history | Host-defined; the provider's is usually longer than yours. |

**What the audit trail records**, so you know what you can prove: `login`,
`login_failed`, `logout`, `password_changed`, `password_reset`,
`password_reset_requested`, `password_removed`, `mfa_enroll_started`,
`mfa_enabled`, `mfa_disabled`, `sessions_revoked`, `invite_created`,
`invite_emailed`, `invite_revoked`, `invite_accepted`, `email_verification_sent`,
`email_verified`, `role_changed`, `access_removed`, `account_deleted`,
`household_erased`, `registration_changed`, `restored_from_offsite`,
`update_applied` and `update_settings_changed` — each with who, when and from
where. Every create, update, archive and delete of household data is there too.

It records that a link was sent, never the link. Tokens ride in the URL's
`#fragment`, which browsers never send to a server, so no log holds one — with
one exception: invites shared in the older `/invite/<token>` form may sit in a
proxy access log.

## 3. Immediate actions, in order

### Preserve evidence

**First, before restarting, redeploying or rebuilding anything.** A restart
loses the container log; `docker compose down` loses it for certain.

```bash
mkdir -p ~/incident-$(date +%F) && cd ~/incident-$(date +%F)
docker compose logs --no-color --timestamps > containers.log
docker compose ps > containers-state.txt
docker compose config > compose-resolved.txt   # redact secrets before sharing
cp ../hearth/.env env.snapshot                 # contains secrets — keep it sealed
```

Then, from the app: export the audit trail (**Settings → Security**) and take a
backup (**Settings → Data**) so you have the state as-found. Copy the whole
directory off the host — the box is the thing you may need to rebuild.

If the audit trail has a retention window set, **turn it off now**
(**Settings → Security → retention**) so the hourly pruner can't delete the
range you're investigating while you work.

### Contain

Do the smallest thing that stops the bleeding, in this order:

1. **Consider taking it offline.** If someone is actively in, `docker compose
   stop` beats a tidy investigation. Availability is recoverable; the data isn't.
2. **End sessions.** Four levers, and they are not equivalent. There is no
   single "sign everyone out" button, so know which you're reaching for:
   - **Each person, for themselves** — **Settings → Account → Sessions → sign
     out everywhere**. Nobody, not even the owner, can revoke another person's
     sessions from the UI directly.
   - **An admin, for one member** — **Settings → Households & access → reset
     password**. This ends that member's sessions. It is **refused** for someone
     who belongs to more than one household; they must reset their own, or lose
     access (**revoke access** ends their sessions too).
   - **The owner account** — `reset-owner-password` on the box. It resets the
     password, clears MFA and ends every session the owner had.
   - **Everyone at once**, with an external Postgres. Everyone signs in again,
     which is the point:

     ```bash
     docker compose exec db psql -U hearth -d hearth -c 'delete from session;'
     ```

     On the embedded PGlite database there is no SQL prompt to do this from, so
     the only route is the per-account ones above, one person at a time
     ([#248](https://github.com/chrislynch97/hearth/issues/248), and
     [#249](https://github.com/chrislynch97/hearth/issues/249) for the missing
     admin lever). Know that before an incident rather than during one.

3. **Revoke every pending invite** (**Settings → Households & access**). An
   unexpired link is a live credential.
4. **Rotate credentials** — the list below.
5. **Force password changes** where credentials may be implicated, and get MFA
   on for anyone without it.
6. **Close the hole** if you know it — the public bucket, the exposed port, the
   open registration toggle, the unpatched version.

### Rotate credentials

Everything here lives in the `.env` beside your compose file on the host unless
noted. Rotate the ones the incident could plausibly have reached; when in doubt,
rotate. Restart the stack afterwards and confirm a backup still runs.

| Credential | What it opens | Rotate where |
| --- | --- | --- |
| `HEARTH_BACKUP_PASSPHRASE` | Every encrypted snapshot, local and off-site | Change it, then **write a fresh backup** — old snapshots stay readable with the old passphrase, so delete or re-encrypt them. Keep the new one in your password manager, never beside the backups. |
| `HEARTH_BACKUP_S3_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` | Read and write on the whole bucket | The object store's console. Delete the old key, don't just add a new one. |
| `HEARTH_BACKUP_WEBHOOK_URL` / `_AUTH` | Wherever snapshots are POSTed | The receiving service |
| `HEARTH_SMTP_USER` / `HEARTH_SMTP_PASS` | Sending mail as you — resets, invites | The mail provider |
| `HEARTH_ALERT_WEBHOOK` | Your alert stream. An ntfy topic is a bearer secret: anyone who knows it can read and post | Pick a new random topic |
| `HEARTH_BACKUP_HEARTBEAT_URL` | Faking or suppressing backup alerts | Healthchecks.io — new check UUID |
| `HEARTH_UPDATE_TOKEN` | Triggering an update on the host | Regenerate; update the host-side updater too |
| `HEARTH_FEEDBACK_TOKEN` | A GitHub token that can file issues as you | GitHub → Developer settings |
| `POSTGRES_PASSWORD` / `DATABASE_URL` | The database itself | The Postgres server, then the compose env |
| **SSH keys / host access** | Everything | Rotate the key, review `authorized_keys`, check for keys you didn't add |
| **Provider console login** | The machine, its snapshots, its DNS | The provider — password *and* 2FA, and review active sessions |
| **Registrar / DNS** | Redirecting your domain | The registrar |
| **User passwords and MFA** | Individual accounts | Per person; admin reset for anyone locked out |

`ACME_EMAIL` and `HEARTH_DOMAIN` are not secrets. The database is not encrypted
at rest, so if the host or the volume is in play, treat **every** password hash
and TOTP secret it holds as exposed and reset them all.

### Assess scope

Write down, as specifically as the evidence supports:

- **Which households.** By name, from **Settings → Households & access**.
- **How many people**, and their contact details. You will need these to notify.
- **Which categories of data.** Be honest and specific: financial records
  (balances, income, bills, spending), names, usernames, email addresses,
  password hashes, two-factor secrets. Financial data raises the risk rating; so
  does anything that lets someone take over an account elsewhere.
- **Whether the data was encrypted**, and whether the key travelled with it. An
  encrypted snapshot with the passphrase held separately is a materially
  different incident from one without.
- **What was actually accessed** versus what was merely reachable. Say which is
  which. "We cannot rule out" is an acceptable and often correct answer.
- **Whether it is still happening.**

### Record the timeline

One file, appended to as you go, from the first line onwards:

- **When it happened** (as best you can tell) and **when you became aware** —
  the two are different, and the second is the one that matters.
- What you found, and where you found it.
- Every action you took, with a timestamp — including the ones that turned out to
  be wrong.
- Who you talked to, and when.

**The 72-hour clock runs from awareness, not from the incident.** Awareness is
the moment you had a reasonable degree of certainty that a breach had occurred —
not the moment you finished investigating it. If you are reading this page
because something happened, that moment has probably already passed; write down
your best estimate of it now, before the day blurs.

## 4. Decide and notify

### Does this instance have to report at all?

Purely personal or household activity falls outside UK GDPR entirely. A Hearth
instance holding **only your own household's** data is that. Once you host other
households — friends, family, anyone who isn't you — the exemption becomes
doubtful, and it is not a question worth resolving in the middle of an incident.
**Assume it applies**, run the risk test below, and use the ICO helpline if you
genuinely can't tell. Nobody has ever been criticised for reporting something
they didn't have to.

### The risk test

Two thresholds, and they're different:

- **Risk to individuals → tell the ICO within 72 hours of awareness.** The bar
  is low. Financial data plus identifiers clears it easily.
- **High risk to individuals → also tell the affected people, without undue
  delay.** Ask what could actually happen to them: financial loss, fraud, an
  account takeover elsewhere because a password was reused, a relationship or
  safety consequence from someone seeing their spending. If the data was strongly
  encrypted and the key is demonstrably not in play, the risk to individuals may
  be low even though the breach was real — say why, in writing.

**The controller makes the call** — the person named at the top of this
document. Get a second opinion before deciding *not* to report. Record the
decision and the reasoning either way; an unreported breach with a written
assessment behind it is a defensible position, and an unreported breach with
nothing behind it is not.

If you miss 72 hours, report anyway, late, with the reason for the delay. Late
is far better than never.

### Reporting to the ICO

Report at <https://ico.org.uk/for-organisations/report-a-breach/>. You do not
need complete information — report on what you have and supply the rest in
phases. Have ready:

- What happened, and when you became aware.
- Categories of data, and approximate numbers of people and records.
- The likely consequences.
- What you have done to contain it and to mitigate harm.
- Your contact details as controller.

**Record the reference number here and in your timeline.**

### Telling the people affected

Direct and plain. No hedging, no PR voice, no "we take security seriously".

> **Subject: Security incident affecting your Hearth data**
>
> Hi <name>,
>
> I'm writing to tell you about a security incident affecting the Hearth
> instance that holds your household's budgeting data.
>
> **What happened.** On <date> I discovered that <plain description of the
> incident>. I became aware of it on <date/time>.
>
> **What data was involved.** <Specifically: e.g. your household's spending,
> income and bills; your name, username and email address; the hash of your
> password; your two-factor secret.> <And, if applicable: the data was
> encrypted, and I have no reason to believe the key was exposed.>
>
> **What I've done.** <Contained it: sessions ended, credentials rotated, hole
> closed.> <Reported to the ICO on <date>, reference <ref>.>
>
> **What you should do.**
> - Sign in and set a new password. If you used that password anywhere else,
>   change it there too — that's the most likely way this reaches you.
> - Turn on two-factor authentication if you haven't (Settings → Two-factor
>   authentication).
> - <If financial detail was exposed: watch for anyone contacting you who seems
>   to know your finances. I will never email you asking for your password.>
>
> **Questions.** Reply to this address, or call me on <number>. You can also
> complain to the ICO: <https://ico.org.uk/make-a-complaint/>.
>
> I'm sorry. <Name>

Tell people even when you've concluded you don't legally have to, if the data
was theirs and they'd want to know. This is a service you run for people who
trust you, not a compliance exercise.

## 5. Afterwards

- **Write the post-incident note** while it's fresh — what happened, what you
  found, what you did, what you'd do differently. Keep it with the timeline.
- **File the remedial issues** as real issues, not intentions. If the fix is in
  Hearth itself, it's a code change like any other; if it's in how you run it,
  it belongs in [deployment.md](../deployment.md).
- **Update this runbook.** Every step that was wrong, slow, or missing gets
  corrected now. That's the main thing you get out of an incident.
- **Turn the audit retention window back on** if you disabled it, and restore
  anything else you loosened.
- **Check the alert that should have caught it.** If nothing fired, work out
  what would have, and set it up.

## Tabletop: the backup passphrase leaks

Walk this through once a year, on paper, out loud. It takes twenty minutes and
it is the only way to find out whether the page above is followable.

**The scenario.** You're helping someone debug a restore over a screen share.
Two days later you realise the terminal had `HEARTH_BACKUP_PASSPHRASE` in the
scrollback, and the same session had an off-site backup file open in a browser
tab. You become aware at 21:40 on a Thursday.

Work through it:

1. **Does it count?** Yes — the passphrase is what stands between an off-site
   snapshot and its contents, and the snapshot holds every household's financial
   records, password hashes and TOTP secrets. Section 1, second and third
   bullets.
2. **When did the clock start?** 21:40 Thursday, not the call two days earlier.
   72 hours takes you to 21:40 Sunday. Write both down.
3. **What's the evidence, and what's already gone?** The object store's access
   log answers the only question that matters — was anything downloaded, and from
   where. Is that log even on? If it isn't, you cannot answer it, and the
   assessment becomes "cannot rule out". The recording of the call, if there is
   one, is evidence too. The container log is irrelevant here and will have
   rotated anyway.
4. **Contain.** Rotate the passphrase. Then confront the awkward part: the old
   snapshots are still decryptable with the old passphrase, so rotating alone
   fixes nothing. Delete them from the bucket, or download, re-encrypt and
   replace them — and know which one you'd do, and whether you'd still have a
   restorable backup halfway through. Rotate the S3 key while you're there.
5. **Scope.** Every household in the snapshot, which is all of them. Every
   category of data. Names and email addresses from the members list.
6. **Decide.** Risk to individuals: yes, if anyone could have used it. High risk:
   probably, given financial data and password hashes — unless the access log
   proves nothing was fetched. So: ICO within 72 hours, and probably a message to
   everyone. Who's your second opinion, and are they reachable on a Thursday
   night?
7. **Notify.** Draft the email from the template. Do you have current addresses
   for everyone, including the member who left in March?

**What this exercise usually finds:** the object store's access log was never
turned on, and there's no written answer for what to do about snapshots that are
already encrypted with a leaked key. Fix both before you need them.

## References

- Data rights, retention and what erasure reaches — [data-rights.md](data-rights.md)
- Backups, alerting, logging and the security notes — [deployment.md](../deployment.md)
- Reporting a vulnerability *in Hearth* — [SECURITY.md](../../SECURITY.md)
- Audit trail: [#35](https://github.com/chrislynch97/hearth/issues/35),
  [#49](https://github.com/chrislynch97/hearth/issues/49) ·
  Retention: [#41](https://github.com/chrislynch97/hearth/issues/41) ·
  Alerting: [#57](https://github.com/chrislynch97/hearth/issues/57) ·
  Session revocation: [#50](https://github.com/chrislynch97/hearth/issues/50)

ICO registration, a privacy policy and terms of service were tracked in
#222–#225 and are closed — they bite once Hearth is charging people or open to
strangers, and it is neither. This document deliberately isn't: a lost backup or
a leaked passphrase is just as possible on an invite-only instance, and the value
here is the pre-written procedure rather than the notification.
