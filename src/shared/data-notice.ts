/** The one-paragraph household data notice shown to someone before they accept an
 *  invitation (#229), and a link to the full page.
 *
 *  Lives in shared so the invite email and the accept-invite screen say the same
 *  thing: mail is optional, so the screen is the only copy every invitee sees.
 *  It states what is true of every instance — where it's hosted and who to ask
 *  are the operator's blanks to fill in, and the full page asks for them.
 */

export const DATA_NOTICE_URL = 'https://github.com/chrislynch97/hearth/blob/main/docs/legal/household-notice.md'

export const DATA_NOTICE_TEXT =
  'Hearth holds your pay, your bills and your spending — plus your bank statement lines if you import them — on a server someone you know runs, and in its backups. Everyone in the household sees it, and whoever runs the instance can read, export or delete any of it. You can ask for a copy or for it to be deleted at any time.'
