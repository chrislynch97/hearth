# What happens to your data on this instance

If someone has invited you onto their Hearth, this is what you're agreeing to.
Read it before you accept, not after.

No law forces this page to exist. Running a budgeting app for your own household
is personal and household activity, which sits outside data-protection law
entirely — so this is not a statutory privacy notice and there is nothing here
you have to sign. It exists because you are about to put your income and your
spending on someone else's computer, and you should hear the awkward parts from
the person who runs it rather than work them out later.

It is also not legal advice. If this instance ever stops being friends and
family, this page gets replaced by a real privacy policy that has to answer the
same questions in more words.

> **Operators:** there are three blanks below — where it's hosted, where the
> backups go, and how to reach you. Fill them in before you send this to anyone.
> A notice with `___` left in it is worse than no notice.

## The short version

Your pay, your bills and your spending go onto a computer that someone you know
rents from a hosting company. They can read all of it, they hold the backups,
and they will give it back or delete it if you ask. It's one person's home
project, not a company with a support desk.

## What's stored

- **Your budgeting data** — income and payslip detail line by line (gross, tax,
  National Insurance, pension, anything else on the slip), bills and what they
  cost, pots, savings, account balances, and every spend recorded against you
  with its date, amount and description.
- **Bank statement lines, if you import them** — a CSV import brings the bank's
  own wording across as-is. That is a list of who you paid and when, which says
  rather more about you than a monthly total does. Nothing is fetched from your
  bank; imports only ever contain what you upload.
- **Your login** — your name, your username, and a hash of your password (never
  the password itself). If you turn on two-factor, its secret and your unused
  recovery codes.
- **Your email address**, if this instance uses email — for the invite, for
  confirming the address, and for password resets. Optional; some instances run
  without it.
- **A record of activity** — who changed what and when in the household's audit
  trail, plus the browser and IP address each of your sign-ins came from, kept
  against the session so you can spot one that isn't yours.

## Where it lives

- **Hosted on** `___` (provider), in `___` (region). One server, one database,
  every household on it.
- **Backed up to** `___` (target), in `___` (region), encrypted before it
  leaves the server.

The database itself is not encrypted at rest. Anyone with the server's disk —
the hosting provider included — can read it without a password. The full list of
companies that can touch it in some form is in
[subprocessors.md](subprocessors.md).

## Who can see it

A household's data is genuinely shared. Your spending sits in the same records
as everyone else's, and everyone in the household sees the lot; roles change
what you can *change*, not what you can *see*.

| Role | What they can do |
| --- | --- |
| **Owner** | Everything in the household, including exporting all of it or deleting it outright |
| **Admin** | Household settings, and inviting or removing people |
| **Member** | Add and edit budgeting data |
| **Viewer** | Read it, change nothing |

**The person who runs the instance can see everything.** Not as a role you can
see on a screen — they have the database, the server it runs on and the backup
passphrase. They can export any household, wipe any household, and read yours
without anyone being told. Nobody audits them, and no setting exists that would
stop them. That is the deal with running on someone else's box; it is stated
here so you don't discover it later.

Whether the instance is reachable from the internet at all, and who else can
reach it, is a decision the operator has made — ask them.

## How long it's kept

- **While you're here** — indefinitely. Budgeting history is the point of the
  app, so nothing ages out on its own.
- **Backups** — the most recent snapshots are kept and older ones are deleted
  automatically. The default is 14, which is a fortnight of daily backups; ask
  the operator what this instance uses.
- **If you leave** — deleting your account removes your login, your address and
  your sessions immediately. Your budgeting history stays with the household,
  because it is entangled with everyone else's; the entries keep your name but
  stop being linked to any account. Deleting the whole household removes the lot.
- **After a deletion** — copies survive in backups until they roll off on the
  schedule above. Nothing goes back into the live app from them.

## What you can ask for

- **A copy of everything** — the household owner can download the household as a
  single JSON file from **Settings → Household → Your data**. It restores into
  another Hearth, so it's your data to take elsewhere, not just to look at.
- **Deletion** — your account, from **Settings → Account**; the whole household,
  by its owner, from the same **Your data** screen.
- **Anything you can't reach yourself** — ask `___` (contact). If you can't sign
  in any more, that's the only route, and it still works.

The mechanics of both, and what erasure does and doesn't reach, are in
[data-rights.md](data-rights.md).

## What isn't promised

One person runs this in their spare time. There is no uptime commitment, no
on-call rota and no support queue. It can be down for a weekend because they
were away. Backups run and can be restored, but the honest summary is that the
whole thing depends on one person continuing to care.

Keep anything you'd be upset to lose somewhere else as well.

## References

- Exercising access, portability and erasure — [data-rights.md](data-rights.md)
- Third parties that can see the data — [subprocessors.md](subprocessors.md)
- What happens if it leaks — [breach-runbook.md](breach-runbook.md)
- Roles, invites and instance-owner scope —
  [docs/deployment.md](../deployment.md#https--security)
