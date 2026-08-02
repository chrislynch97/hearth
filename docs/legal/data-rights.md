# Data rights: access, portability and erasure

How someone whose data is in a Hearth instance exercises their rights over it,
and what the operator does when a request arrives.

Two audiences, deliberately in one document:

- **If your data is in Hearth**, the first two sections tell you what you can do
  and how.
- **If you run the instance**, the rest is the procedure you follow — you are the
  controller for the data your users put in it, and these are your obligations,
  not a courtesy.

This describes what the software does and the process around it. It is not legal
advice. The privacy policy ([#222](https://github.com/chrislynch97/hearth/issues/222))
must link here, and its retention section must match the windows stated below.

## Who can ask for what

| Who | What they can exercise |
| --- | --- |
| A **household owner** | Access, portability and erasure over that household's data — the budgeting records, the member list, and who has access |
| **Any account holder** | Access to, correction of, and erasure of *their own account* — name, username, email address, sessions |
| An **admin, member or viewer** | Nothing over the household as a whole. They can see it and (depending on role) edit it, but taking it out or destroying it is the owner's decision |

A household's data is genuinely shared: one person's spending sits in the same
records as everyone else's. That's why household-level erasure is the owner's
call and not any member's, and why a member who wants out is handled by deleting
their account rather than the household.

An owner or admin removing someone's access (**Settings → Households & access**)
does the same thing when that was the person's last household: the account goes
with the membership, because an account belonging to nothing can neither sign in
nor be given a household back.

## Doing it in the app

**Access and portability** — **Settings → Household → Your data → Download my
data**. Available to the household owner. You get a single JSON file containing
that household's members, pots, outgoings, spending, payslips, raises, accounts
and the list of people with access. Passwords and two-factor secrets are never
included. The file is **unencrypted**, so treat it like a bank statement: it is
the whole household's financial history in plain text.

The file is the same format the instance-wide backup uses, so it can be restored
into another Hearth instance — that's what makes it portability and not just a
download.

**Erasure** — **Settings → Household → Your data → Delete**. Household owner
only. You type the household's name to confirm, and everything under it goes:
every member, pot, outgoing, spend, payslip, raise and account, everyone's access
to it, any pending invitations, and that household's audit trail. If you belong
to another household you stay signed in and land there; if it was your only one
you are signed out.

**Accounts left belonging to no household go with it** — including yours, if this
was your only one. The confirmation dialog says how many before you commit. Such
an account is a dead end rather than a spare login: it can't sign in, and nothing
can give it a household back, because accepting an invitation always creates a
new account. Leaving them behind is how an instance quietly accumulates email
addresses and password hashes belonging to people who have gone.

**The primary household can't be erased this way.** It is the instance's own
household — deleting it would take the instance with it — so the app refuses and
points at **Settings → System → Reset all data**, which wipes the whole instance
and returns it to the setup wizard. Self-hosters wanting to erase everything
should use that, or simply delete the database volume.

**Your own account** — **Settings → Account** to correct your name or email, and
**Settings → Account → Sessions** to end sessions.

**Deleting your account** — **Settings → Account → Delete your account**.
Available to anyone signed in. It asks for your password, and for a code from
your authenticator if you have two-factor on: the same bar as changing your
username, because a stolen session must not be able to erase you. What goes is
your login — name, username, email address, password hash and two-factor secret
— and every session you have open.

Two cases are refused, and the app says which:

- **You're the only owner of a household other people are still in.** Somebody
  has to be left holding it, so make someone else an owner (**Settings →
  Households & access**) or erase the household first.
- **You're the instance owner.** That account is what the instance
  authenticates against; removing it means taking the instance down, not
  pressing a button. Export the data and stand up a new instance instead.

A household **nobody else belongs to** is deleted along with your account.
Leaving it would strand a household's financial records where no one can ever
reach — or erase — them, because there would be no one left who could sign in to
it or invite anyone in.

Your **budgeting history in households other people are still in stays put**:
spends, payslips, pots and outgoings are the household's records, not yours
alone, and they would take other people's data with them. The participant they
were filed under stops being linked to any account, keeping its name.

## If you can't sign in

Someone who has lost access — a former member, or anyone whose account was
removed — can't use the in-app route, and the right doesn't disappear because
the button is out of reach. Contact the operator of the instance directly.

Usually there is nothing left to erase: losing your last household deletes the
account with it. The exception is an instance that predates that behaviour, or
one restored from an older snapshot. Such an account is refused at the sign-in
screen with a message saying so, and there is no in-app route to it — nobody can
sign in as it and it belongs to no household anyone administers. The operator
deletes the row from the database directly (`delete from "user" where …`); it
cannot be turned back into a working account, so deletion is the only answer.

> **Operators: put your contact address here** before publishing this file with
> your service, and use the same address in the privacy policy. For the hosted
> service this is the address in the privacy policy; for a self-hosted instance
> it is whoever runs the box.

Verify who you're talking to before acting on a request from outside the app —
proportionately, not obstructively. Matching the request to an email address
already on the account is usually enough. Do not demand ID documents as a
reflex; collecting more personal data to service a data-rights request is its own
problem.

## The operator's procedure

**You have one calendar month** from receiving the request to respond. That's the
UK GDPR deadline, and it runs from the day the request arrives, however it
arrives — email, a message, a note in an issue. It can be extended by two further
months for genuinely complex or numerous requests, but you must tell the person
within the first month that you're extending, and why. There is no fee for a
normal request.

On receiving one:

1. **Log it** — the date it arrived, who from, what they asked for. The clock
   starts on arrival, not on the day you get to it.
2. **Confirm receipt** to the requester, and say what you'll do and by when.
3. **Identify the data** — which household(s) and which account. If the requester
   can do it themselves in-app, say so and point them at the sections above;
   that's a valid way to satisfy access and portability, and it's faster for
   them.
4. **Act.** For access/portability, produce the household export (or the account
   fields) and send it over a channel the requester chose. For erasure, run the
   deletion and confirm what was deleted.
5. **Tell them what erasure didn't reach** — the backup caveat below, in plain
   words. Saying nothing about it is the mistake worth avoiding.
6. **Record the outcome** and the date you responded.

If you refuse a request — you may, for instance, decline erasure where you have
an overriding legal obligation to keep something — tell the person why, and tell
them they can complain to the ICO. Don't leave a refusal unexplained.

## What erasure actually reaches

Be precise about this with requesters. Three different fates:

**Live data — gone immediately.** Deleting a household cascades through every
table in the database: its members, budgeting records, memberships, invitations,
sessions and its own audit trail. There is no soft delete, no tombstone, and
nothing recoverable through the app afterwards.

**Backups — a copy survives until it rolls off.** Retention is a *snapshot count*,
not a time window: the most recent **14** snapshots are kept by default
(`HEARTH_BACKUP_KEEP`), and the same count is applied off-site for targets that
can be enumerated and pruned. With daily backups that is about a fortnight; with
weekly backups the same 14 snapshots cover about three months. Older snapshots
are pruned automatically as new ones are written. Off-site copies are always
encrypted (a passphrase is mandatory to enable them); the local copy is encrypted
only when `HEARTH_BACKUP_PASSPHRASE` is set, so set it.

This covers **accounts** as well as households: a deleted login's username, email
address and password hash sit in every snapshot taken before the deletion, and
age out on the same schedule. Say so when you confirm an erasure.

Deleting a household does **not** reach back into snapshots already written —
scrubbing an individual out of an encrypted backup set means restoring, editing
and re-encrypting every snapshot, which risks the backups themselves. The
accepted practice is to leave them to age out and to say so. So: **erased data
disappears from the live system immediately and from backups within the retention
window above.** Backups are never used to resurrect an erased household; the only
thing that touches them is a whole-instance restore after a disaster, and if one
ever runs after an erasure, re-run the erasure.

If your instance keeps more snapshots than the default, or writes them somewhere
with its own retention rules (an S3 lifecycle policy, say), state *that* window
instead — the number in the privacy policy has to be the number your instance
actually uses.

**The erasure record — deliberately kept.** One audit entry is written when a
household is erased (`household_erased`), and it is recorded against the
**primary** household rather than the one being deleted — an entry on the deleted
household would vanish in the same cascade. It holds the erased household's id,
who did it and when. It does not hold any of the household's data. This is kept
on purpose: without it there is no evidence the erasure happened, which is a
problem for the person who asked for it as much as for the operator.

A deleted **account** gets the same treatment (`account_deleted`, also on the
primary household) with one difference: it names nobody. No actor, no username,
no address — only a one-way reference derived from the account id, enough to tie
the entries about one deletion together and useless for anything else. An entry
that recorded who was erased would keep exactly what the erasure was for.

## References

- Privacy policy — [#222](https://github.com/chrislynch97/hearth/issues/222) (must link here)
- ICO registration — [#225](https://github.com/chrislynch97/hearth/issues/225)
- Breach-notification runbook — [#227](https://github.com/chrislynch97/hearth/issues/227)
- Backup configuration and retention — [docs/deployment.md](../deployment.md)
