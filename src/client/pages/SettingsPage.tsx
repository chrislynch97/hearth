import { useEffect, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Code,
  CopyButton,
  Divider,
  Group,
  Modal,
  NumberInput,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { trpc } from '../trpc'
import { downloadBlob, downloadJson, toCsv } from '../csv'
import { zipStore } from '../zip'
import { MIN_PASSWORD_LENGTH, validatePassword } from '../../shared/password-policy'

// ---------------------------------------------------------------------------
// General household settings
// ---------------------------------------------------------------------------

function GeneralSection() {
  const utils = trpc.useUtils()
  const ctx = trpc.bootstrap.context.useQuery()
  const update = trpc.household.update.useMutation()
  const rescale = trpc.data.rescaleCurrency.useMutation()
  const hh = ctx.data?.household

  const [displayName, setDisplayName] = useState('')
  const [currencySymbol, setCurrencySymbol] = useState('')
  const [startDay, setStartDay] = useState<number | string>(1)
  const [jointBasis, setJointBasis] = useState('equal')
  const [incomeBasis, setIncomeBasis] = useState('regular_net')
  const [decimalPlaces, setDecimalPlaces] = useState<number | string>(2)
  const [weekStart, setWeekStart] = useState('monday')
  const [dateFormat, setDateFormat] = useState('medium')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!hh) return
    setDisplayName(hh.displayName)
    setCurrencySymbol(hh.currencySymbol)
    setStartDay(hh.budgetPeriodStartDay)
    setJointBasis(hh.jointContributionBasis)
    setIncomeBasis(hh.incomeBasisDefault)
    setDecimalPlaces(hh.currencyDecimalPlaces)
    setWeekStart(hh.weekStart)
    setDateFormat(hh.dateFormat)
  }, [hh])

  async function handleSave() {
    await update.mutateAsync({
      displayName: displayName.trim() || undefined,
      currencySymbol: currencySymbol || undefined,
      budgetPeriodStartDay: Number(startDay),
      jointContributionBasis: jointBasis as 'equal' | 'income_proportional' | 'custom',
      incomeBasisDefault: incomeBasis as 'regular_net' | 'latest_payslip' | 'rolling_12m',
      weekStart: weekStart as 'monday' | 'sunday',
      dateFormat: dateFormat as 'iso' | 'numeric' | 'medium' | 'long',
    })
    // Currency decimal-places change rescales every money column, so it goes
    // through the dedicated endpoint.
    if (hh && Number(decimalPlaces) !== hh.currencyDecimalPlaces) {
      await rescale.mutateAsync({ decimalPlaces: Number(decimalPlaces) })
    }
    await utils.invalidate()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Card withBorder padding="md" radius="md">
      <Title order={4} mb="sm">
        General
      </Title>
      <Stack gap="sm">
        <Group grow>
          <TextInput label="Household name" value={displayName} onChange={(e) => setDisplayName(e.currentTarget.value)} />
          <TextInput label="Currency symbol" value={currencySymbol} onChange={(e) => setCurrencySymbol(e.currentTarget.value)} w={120} />
        </Group>
        <Group grow>
          <NumberInput
            label="Budget period starts on day"
            min={1}
            max={28}
            value={startDay}
            onChange={setStartDay}
          />
          <NumberInput
            label="Currency decimal places"
            description="Changing this rescales all stored amounts"
            min={0}
            max={4}
            value={decimalPlaces}
            onChange={setDecimalPlaces}
          />
        </Group>
        <Group grow>
          <Select
            label="Joint contribution basis"
            data={[
              { value: 'equal', label: 'Equal' },
              { value: 'income_proportional', label: 'Income proportional' },
              { value: 'custom', label: 'Custom weights' },
            ]}
            value={jointBasis}
            onChange={(v) => setJointBasis(v ?? 'equal')}
            allowDeselect={false}
          />
          <Select
            label="Income basis"
            data={[
              { value: 'regular_net', label: 'Regular net (salary)' },
              { value: 'latest_payslip', label: 'Latest payslip' },
              { value: 'rolling_12m', label: 'Rolling 12 months' },
            ]}
            value={incomeBasis}
            onChange={(v) => setIncomeBasis(v ?? 'regular_net')}
            allowDeselect={false}
          />
        </Group>
        <Group grow>
          <Select
            label="Week starts on"
            data={[
              { value: 'monday', label: 'Monday' },
              { value: 'sunday', label: 'Sunday' },
            ]}
            value={weekStart}
            onChange={(v) => setWeekStart(v ?? 'monday')}
            allowDeselect={false}
          />
          <Select
            label="Date format"
            data={[
              { value: 'medium', label: 'Medium (4 Jul 2026)' },
              { value: 'long', label: 'Long (4 July 2026)' },
              { value: 'numeric', label: 'Numeric (04/07/2026)' },
              { value: 'iso', label: 'ISO (2026-07-04)' },
            ]}
            value={dateFormat}
            onChange={(v) => setDateFormat(v ?? 'medium')}
            allowDeselect={false}
          />
        </Group>
        {(update.error || rescale.error) && (
          <Alert color="red" title="Error">
            {update.error?.message || rescale.error?.message}
          </Alert>
        )}
        <Group justify="flex-end">
          {saved && (
            <Text size="sm" c="dimmed">
              Saved ✓
            </Text>
          )}
          <Button onClick={() => void handleSave()} loading={update.isPending || rescale.isPending}>
            Save changes
          </Button>
        </Group>
      </Stack>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

function MembersSection() {
  const utils = trpc.useUtils()
  const membersQuery = trpc.members.list.useQuery()
  const addPerson = trpc.members.addPerson.useMutation()
  const updateMember = trpc.members.update.useMutation()
  const archive = trpc.members.archive.useMutation()

  const members = (membersQuery.data ?? []).filter((m) => m.archivedAt === null)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  async function refresh() {
    await Promise.all([utils.members.list.invalidate(), utils.bootstrap.context.invalidate()])
  }

  async function handleAdd() {
    if (!newName.trim()) return
    await addPerson.mutateAsync({ displayName: newName.trim() })
    await refresh()
    setNewName('')
  }

  async function handleRename(id: string) {
    if (editName.trim()) {
      await updateMember.mutateAsync({ id, displayName: editName.trim() })
      await refresh()
    }
    setEditingId(null)
  }

  return (
    <Card withBorder padding="md" radius="md">
      <Title order={4} mb="sm">
        Members
      </Title>
      <Stack gap={4}>
        {members.map((m) => (
          <Group key={m.id} justify="space-between" px="xs" py={4}>
            {editingId === m.id ? (
              <Group gap="xs" style={{ flex: 1 }}>
                <TextInput
                  size="xs"
                  value={editName}
                  onChange={(e) => setEditName(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void handleRename(m.id)}
                  autoFocus
                  style={{ flex: 1 }}
                />
                <Button size="xs" onClick={() => void handleRename(m.id)}>
                  Save
                </Button>
              </Group>
            ) : (
              <>
                <Text size="sm">
                  {m.displayName}
                  {m.kind === 'joint' && (
                    <Text span size="xs" c="dimmed">
                      {' '}
                      · joint
                    </Text>
                  )}
                </Text>
                <Group gap={4}>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    aria-label={`Rename ${m.displayName}`}
                    onClick={() => {
                      setEditingId(m.id)
                      setEditName(m.displayName)
                    }}
                  >
                    ✎
                  </ActionIcon>
                  {m.kind !== 'joint' && (
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      aria-label={`Archive ${m.displayName}`}
                      onClick={async () => {
                        await archive.mutateAsync({ id: m.id })
                        await refresh()
                      }}
                    >
                      ×
                    </ActionIcon>
                  )}
                </Group>
              </>
            )}
          </Group>
        ))}
      </Stack>
      <Divider my="sm" />
      <Group align="flex-end">
        <TextInput
          label="Add person"
          placeholder="Name"
          value={newName}
          onChange={(e) => setNewName(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleAdd()}
          style={{ flex: 1 }}
        />
        <Button onClick={() => void handleAdd()} loading={addPerson.isPending}>
          Add
        </Button>
      </Group>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Data portability
// ---------------------------------------------------------------------------

function DataSection() {
  const utils = trpc.useUtils()
  const ctx = trpc.bootstrap.context.useQuery()
  const importMut = trpc.data.import.useMutation()
  const resetMut = trpc.data.reset.useMutation()
  const updateHousehold = trpc.household.update.useMutation()
  const backupNow = trpc.data.backupNow.useMutation()
  const fileRef = useRef<HTMLInputElement>(null)

  const hh = ctx.data?.household
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  async function setFrequency(frequency: 'off' | 'daily' | 'weekly') {
    await updateHousehold.mutateAsync({ backupFrequency: frequency })
    await utils.bootstrap.context.invalidate()
  }

  async function handleBackupNow() {
    setError('')
    const result = await backupNow.mutateAsync()
    await utils.bootstrap.context.invalidate()
    setMessage(`Backup written to ${result.file}`)
  }

  async function handleExport() {
    setError('')
    const data = await utils.data.export.fetch()
    // Date + time (to the second) so multiple backups on the same day don't collide
    // and sort chronologically. e.g. hearth-backup-2026-07-07-143005.json
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '-').replace(/:/g, '')
    downloadJson(`hearth-backup-${stamp}.json`, data)
    setMessage('Backup downloaded.')
  }

  async function handleExportCsv() {
    setError('')
    const snapshot = await utils.data.export.fetch()
    const entries = Object.entries(snapshot.tables)
      .filter(([, rows]) => rows.length > 0)
      .map(([name, rows]) => {
        const cols = Object.keys(rows[0] ?? {})
        const table: Array<Array<string | number>> = [
          cols,
          ...rows.map((row) =>
            cols.map((c) => {
              const v = row[c]
              if (v === null || v === undefined) return ''
              return typeof v === 'object' ? JSON.stringify(v) : (v as string | number)
            }),
          ),
        ]
        return { name: `${name}.csv`, data: new TextEncoder().encode(toCsv(table)) }
      })
    if (entries.length === 0) {
      setError('No data to export yet.')
      return
    }
    const stamp = new Date().toISOString().slice(0, 10)
    downloadBlob(`hearth-csv-${stamp}.zip`, zipStore(entries))
    setMessage(`Exported ${entries.length} tables as CSV.`)
  }

  async function handleImportFile(file: File) {
    setError('')
    setMessage('')
    try {
      const parsed = JSON.parse(await file.text())
      await importMut.mutateAsync(parsed)
      await utils.invalidate()
      setMessage('Data restored from backup.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed — is this a valid Hearth backup?')
    }
  }

  async function handleReset() {
    setConfirmReset(false)
    await resetMut.mutateAsync()
    // Fresh household → app returns to the setup wizard.
    window.location.href = '/'
  }

  return (
    <Card withBorder padding="md" radius="md">
      <Title order={4} mb="sm">
        Data
      </Title>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-end">
          <div>
            <Text size="sm" fw={500}>
              Automatic backups
            </Text>
            <Text size="xs" c="dimmed">
              Written to a{' '}
              <Text span ff="monospace" fz="xs">
                backups/
              </Text>{' '}
              folder next to your database (last 14 kept).
              {hh?.backupLastAt
                ? ` Last: ${new Date(hh.backupLastAt).toLocaleString()}.`
                : ' None yet.'}
            </Text>
          </div>
          <Group gap="sm" align="flex-end">
            <Select
              label="Frequency"
              size="xs"
              w={110}
              data={[
                { value: 'off', label: 'Off' },
                { value: 'daily', label: 'Daily' },
                { value: 'weekly', label: 'Weekly' },
              ]}
              value={hh?.backupFrequency ?? 'off'}
              onChange={(v) => void setFrequency((v as 'off' | 'daily' | 'weekly') ?? 'off')}
              allowDeselect={false}
            />
            <Button size="xs" variant="default" loading={backupNow.isPending} onClick={() => void handleBackupNow()}>
              Back up now
            </Button>
          </Group>
        </Group>
        <Divider />
        <Group justify="space-between">
          <div>
            <Text size="sm" fw={500}>
              Download backup
            </Text>
            <Text size="xs" c="dimmed">
              JSON is the portable backup format (used by Restore). CSV gives one file
              per table, zipped — handy for spreadsheets.
            </Text>
          </div>
          <Group gap="sm">
            <Button variant="default" onClick={() => void handleExportCsv()}>
              Download CSV
            </Button>
            <Button variant="default" onClick={() => void handleExport()}>
              Download JSON
            </Button>
          </Group>
        </Group>
        <Divider />
        <Group justify="space-between">
          <div>
            <Text size="sm" fw={500}>
              Restore
            </Text>
            <Text size="xs" c="dimmed">
              Replace all current data with a backup file. This cannot be undone.
            </Text>
          </div>
          <Button variant="default" loading={importMut.isPending} onClick={() => fileRef.current?.click()}>
            Restore from file
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0]
              if (file) void handleImportFile(file)
              e.currentTarget.value = ''
            }}
          />
        </Group>
        <Divider />
        <Group justify="space-between">
          <div>
            <Text size="sm" fw={500} c="red">
              Reset all data
            </Text>
            <Text size="xs" c="dimmed">
              Wipe everything and start fresh from the setup wizard.
            </Text>
          </div>
          <Button color="red" variant="light" onClick={() => setConfirmReset(true)}>
            Reset
          </Button>
        </Group>
        {message && (
          <Alert color="moss" variant="light">
            {message}
          </Alert>
        )}
        {error && (
          <Alert color="red" title="Error">
            {error}
          </Alert>
        )}
      </Stack>

      <Modal opened={confirmReset} onClose={() => setConfirmReset(false)} title="Reset all data?" size="sm">
        <Stack gap="md">
          <Text size="sm">
            This permanently deletes every member, pot, outgoing, spend, payslip and raise, and returns
            to the setup wizard. Consider downloading a backup first.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button color="red" loading={resetMut.isPending} onClick={() => void handleReset()}>
              Reset everything
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Security (optional shared password)
// ---------------------------------------------------------------------------

function SecuritySection() {
  const utils = trpc.useUtils()
  const statusQuery = trpc.auth.status.useQuery()
  const setPassword = trpc.auth.setPassword.useMutation()
  const clearPassword = trpc.auth.clearPassword.useMutation()
  const logout = trpc.auth.logout.useMutation()

  const passwordSet = statusQuery.data?.passwordSet ?? false

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function reset() {
    setCurrent('')
    setNext('')
    setConfirm('')
  }

  async function handleSet() {
    setError('')
    setMessage('')
    const weak = validatePassword(next)
    if (weak) return setError(weak)
    if (next !== confirm) return setError('Passwords do not match.')
    try {
      await setPassword.mutateAsync({ currentPassword: current || undefined, newPassword: next })
      await utils.auth.status.invalidate()
      setMessage(passwordSet ? 'Password changed.' : 'Password set.')
      reset()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update password.')
    }
  }

  async function handleClear() {
    setError('')
    setMessage('')
    try {
      await clearPassword.mutateAsync({ currentPassword: current })
      await utils.auth.status.invalidate()
      setMessage('Password removed.')
      reset()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove password.')
    }
  }

  async function handleLogout() {
    await logout.mutateAsync()
    await utils.auth.status.invalidate()
  }

  return (
    <Card withBorder padding="md" radius="md">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Security</Title>
        {passwordSet && (
          <Button size="xs" variant="default" onClick={() => void handleLogout()}>
            Log out
          </Button>
        )}
      </Group>
      <Text size="xs" c="dimmed" mb="sm">
        An optional single password for everyone who opens this household. For internet exposure, put
        it behind a reverse proxy or Tailscale.
      </Text>
      <Stack gap="sm">
        {passwordSet && (
          <PasswordInput
            label="Current password"
            value={current}
            onChange={(e) => setCurrent(e.currentTarget.value)}
          />
        )}
        <Group grow>
          <PasswordInput
            label={passwordSet ? 'New password' : 'Password'}
            description={`At least ${MIN_PASSWORD_LENGTH} characters`}
            value={next}
            onChange={(e) => setNext(e.currentTarget.value)}
          />
          <PasswordInput label="Confirm" value={confirm} onChange={(e) => setConfirm(e.currentTarget.value)} />
        </Group>
        {message && (
          <Alert color="moss" variant="light">
            {message}
          </Alert>
        )}
        {error && (
          <Alert color="red" title="Error">
            {error}
          </Alert>
        )}
        <Group justify="flex-end" gap="sm">
          {passwordSet && (
            <Button
              variant="light"
              color="red"
              loading={clearPassword.isPending}
              onClick={() => void handleClear()}
            >
              Remove password
            </Button>
          )}
          <Button loading={setPassword.isPending} onClick={() => void handleSet()}>
            {passwordSet ? 'Change password' : 'Set password'}
          </Button>
        </Group>
      </Stack>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Two-factor authentication (TOTP)
// ---------------------------------------------------------------------------

function MfaSection() {
  const utils = trpc.useUtils()
  const statusQuery = trpc.auth.status.useQuery()
  const enrollMfa = trpc.auth.enrollMfa.useMutation()
  const confirmMfa = trpc.auth.confirmMfa.useMutation()
  const disableMfa = trpc.auth.disableMfa.useMutation()

  const passwordSet = statusQuery.data?.passwordSet ?? false
  const mfaEnabled = statusQuery.data?.mfaEnabled ?? false

  const [enroll, setEnroll] = useState<{ secret: string; qrSvg: string } | null>(null)
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [disableOpen, setDisableOpen] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')
  const [error, setError] = useState('')

  async function handleEnable() {
    setError('')
    try {
      const result = await enrollMfa.mutateAsync()
      setEnroll({ secret: result.secret, qrSvg: result.qrSvg })
      setCode('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start enrolment.')
    }
  }

  async function handleConfirm() {
    setError('')
    try {
      const result = await confirmMfa.mutateAsync({ code: code.trim() })
      setRecoveryCodes(result.recoveryCodes)
      setEnroll(null)
      await utils.auth.status.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not verify the code.')
    }
  }

  async function handleDisable() {
    setError('')
    try {
      await disableMfa.mutateAsync({ currentPassword: disablePassword })
      setDisableOpen(false)
      setDisablePassword('')
      await utils.auth.status.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not disable two-factor.')
    }
  }

  function finishRecovery() {
    setRecoveryCodes(null)
    setCode('')
  }

  return (
    <Card withBorder padding="md" radius="md">
      <Title order={4} mb="sm">
        Two-factor authentication
      </Title>
      <Text size="xs" c="dimmed" mb="sm">
        An extra one-time code from an authenticator app (Google Authenticator, 1Password, Aegis…) on top of
        the password. Strongly recommended if this instance is reachable from the internet.
      </Text>

      {!passwordSet && (
        <Text size="sm" c="dimmed">
          Set a password above first — two-factor builds on it.
        </Text>
      )}

      {/* Recovery codes, shown once after enabling. */}
      {passwordSet && recoveryCodes && (
        <Stack gap="sm">
          <Alert color="moss" variant="light" title="Two-factor is on — save your recovery codes">
            Each code works once if you lose access to your authenticator. Store them somewhere safe; you
            won&apos;t see them again.
          </Alert>
          <SimpleGrid cols={2} spacing="xs">
            {recoveryCodes.map((c) => (
              <Code key={c} fz="sm" p={6}>
                {c}
              </Code>
            ))}
          </SimpleGrid>
          <Group justify="flex-end" gap="sm">
            <CopyButton value={recoveryCodes.join('\n')}>
              {({ copied, copy }) => (
                <Button variant="default" onClick={copy}>
                  {copied ? 'Copied' : 'Copy codes'}
                </Button>
              )}
            </CopyButton>
            <Button
              variant="default"
              onClick={() =>
                downloadBlob(
                  'hearth-recovery-codes.txt',
                  new Blob([recoveryCodes.join('\n') + '\n'], { type: 'text/plain' }),
                )
              }
            >
              Download
            </Button>
            <Button onClick={finishRecovery}>I&apos;ve saved these</Button>
          </Group>
        </Stack>
      )}

      {/* Enrolment: QR + manual secret + confirmation code. */}
      {passwordSet && !recoveryCodes && enroll && (
        <Stack gap="sm">
          <Text size="sm">Scan this with your authenticator app, then enter the 6-digit code it shows.</Text>
          <Group align="flex-start" gap="lg">
            <div
              style={{ width: 200, height: 200, flexShrink: 0 }}
              // The SVG is generated server-side from our own otpauth URL — no user input.
              dangerouslySetInnerHTML={{ __html: enroll.qrSvg }}
            />
            <Stack gap="xs" style={{ flex: 1 }}>
              <Text size="xs" c="dimmed">
                Can&apos;t scan? Enter this key manually:
              </Text>
              <Group gap="xs">
                <Code fz="sm">{enroll.secret}</Code>
                <CopyButton value={enroll.secret}>
                  {({ copied, copy }) => (
                    <Button size="compact-xs" variant="subtle" onClick={copy}>
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  )}
                </CopyButton>
              </Group>
              <TextInput
                label="Verification code"
                value={code}
                onChange={(e) => setCode(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleConfirm()}
                inputMode="numeric"
                maw={160}
                autoFocus
              />
            </Stack>
          </Group>
          {error && (
            <Alert color="red" title="Error">
              {error}
            </Alert>
          )}
          <Group justify="flex-end" gap="sm">
            <Button
              variant="default"
              onClick={() => {
                setEnroll(null)
                setError('')
              }}
            >
              Cancel
            </Button>
            <Button loading={confirmMfa.isPending} onClick={() => void handleConfirm()}>
              Verify &amp; enable
            </Button>
          </Group>
        </Stack>
      )}

      {/* Steady state: on/off toggle. */}
      {passwordSet && !recoveryCodes && !enroll && (
        <Group justify="space-between">
          <Text size="sm">
            {mfaEnabled ? 'Two-factor authentication is on.' : 'Two-factor authentication is off.'}
          </Text>
          {mfaEnabled ? (
            <Button variant="light" color="red" onClick={() => setDisableOpen(true)}>
              Disable
            </Button>
          ) : (
            <Button loading={enrollMfa.isPending} onClick={() => void handleEnable()}>
              Enable two-factor
            </Button>
          )}
        </Group>
      )}

      {passwordSet && !recoveryCodes && !enroll && error && (
        <Alert color="red" title="Error" mt="sm">
          {error}
        </Alert>
      )}

      <Modal opened={disableOpen} onClose={() => setDisableOpen(false)} title="Disable two-factor?" size="sm">
        <Stack gap="md">
          <Text size="sm">Enter your password to turn off two-factor authentication.</Text>
          <PasswordInput
            label="Password"
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleDisable()}
            autoFocus
          />
          {error && (
            <Alert color="red" title="Error">
              {error}
            </Alert>
          )}
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setDisableOpen(false)}>
              Cancel
            </Button>
            <Button color="red" loading={disableMfa.isPending} onClick={() => void handleDisable()}>
              Disable
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------

function AboutSection() {
  const statsQuery = trpc.data.stats.useQuery()
  const stats = statsQuery.data
  if (!stats) return null
  const entries = Object.entries(stats.counts).filter(([, n]) => n > 0)
  return (
    <Card withBorder padding="md" radius="md">
      <Title order={4} mb="sm">
        About
      </Title>
      <Text size="sm" c="dimmed" mb="sm">
        Database: {stats.databaseUrl}
      </Text>
      <Table verticalSpacing={4}>
        <Table.Tbody>
          {entries.map(([name, count]) => (
            <Table.Tr key={name}>
              <Table.Td>{name}</Table.Td>
              <Table.Td ta="right">{count}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// SettingsPage
// ---------------------------------------------------------------------------

export function SettingsPage() {
  return (
    <Stack gap="lg" maw={760} mx="auto">
      <Title order={2}>Settings</Title>
      <GeneralSection />
      <MembersSection />
      <SecuritySection />
      <MfaSection />
      <DataSection />
      <AboutSection />
    </Stack>
  )
}
