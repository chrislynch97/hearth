import { appVersion } from './version'
import { RateLimiter } from './auth/rateLimit'

// In-app bug/feedback submission (issue #86): let a signed-in household member
// file a GitHub issue without leaving the app. Off unless a token is configured;
// the target repo defaults to upstream but can be overridden so a self-hoster
// can point reports at their own fork.

const DEFAULT_REPO = 'chrislynch97/hearth'

export interface FeedbackConfig {
  /** Whether the feature is usable (a GitHub token is configured). */
  enabled: boolean
  /** owner/repo reports are filed against — shown in the UI so people know where
   *  a submission goes. */
  repo: string
}

const token = (): string => process.env.HEARTH_FEEDBACK_TOKEN?.trim() || ''

export const feedbackRepo = (): string => process.env.HEARTH_FEEDBACK_REPO?.trim() || DEFAULT_REPO

/** The feature's public config: never leaks the token, only whether it's set. */
export const feedbackConfig = (): FeedbackConfig => ({
  enabled: token().length > 0,
  repo: feedbackRepo(),
})

export type FeedbackKind = 'bug' | 'idea'

// GitHub label per kind. `bug` and `enhancement` are the stock labels every repo
// ships with, so nothing needs pre-creating; an unknown label would be created
// on the fly by the API anyway.
const LABEL: Record<FeedbackKind, string> = { bug: 'bug', idea: 'enhancement' }

export interface SubmitFeedbackInput {
  kind: FeedbackKind
  title: string
  description: string
  /** Client route the report was filed from, for triage context. */
  route?: string
  /** Who filed it (display name), for follow-up. */
  submittedBy?: string
}

export interface SubmitFeedbackResult {
  url: string
  number: number
}

// Throttle so a bored viewer can't spam the tracker: a signed-in user gets a
// handful of reports per window, then waits. Keyed by user id (see router).
export const feedbackLimiter = new RateLimiter('feedback', {
  windowMs: 10 * 60_000,
  maxAttempts: 6,
  blockMs: 10 * 60_000,
})

/** The issue body: the user's own text, then an auto-attached context footer
 *  (version, page, reporter) to speed triage. */
const buildBody = (input: SubmitFeedbackInput): string => {
  const lines = [input.description.trim(), '', '---', `- App version: ${appVersion()}`]
  if (input.route) lines.push(`- Page: ${input.route}`)
  if (input.submittedBy) lines.push(`- Reported by: ${input.submittedBy}`)
  lines.push('- Filed from: in-app feedback')
  return lines.join('\n')
}

/** Create a GitHub issue from a feedback submission. Throws on a non-2xx GitHub
 *  response so the caller can surface a clean error. */
export async function submitFeedback(input: SubmitFeedbackInput): Promise<SubmitFeedbackResult> {
  const authToken = token()
  if (!authToken) throw new Error('Feedback is not configured on this instance.')

  const res = await fetch(`https://api.github.com/repos/${feedbackRepo()}/issues`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'hearth-feedback',
    },
    body: JSON.stringify({
      title: input.title.trim(),
      body: buildBody(input),
      labels: [LABEL[input.kind]],
    }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) throw new Error(`GitHub rejected the report (${res.status}).`)

  const issue = (await res.json()) as { html_url?: string; number?: number }
  return {
    url: issue.html_url ?? `https://github.com/${feedbackRepo()}/issues`,
    number: issue.number ?? 0,
  }
}
