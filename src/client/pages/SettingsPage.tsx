import { useEffect, useRef, useState } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Code,
  CopyButton,
  Divider,
  Group,
  Loader,
  Modal,
  NumberInput,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { trpc } from '../trpc'
import type { Household } from '../../server/db/schema'
import { useFormatDate } from '../useMoney'
import { downloadBlob, downloadJson, toCsv } from '../csv'
import { zipStore } from '../zip'
import { MIN_PASSWORD_LENGTH, validatePassword } from '../../shared/password-policy'
import { formatMoney } from '../../shared/money'

// ---------------------------------------------------------------------------
// General household settings
// ---------------------------------------------------------------------------

// Thousands/decimal separator presets. Stored as two explicit characters on the
// household so a Euro household can pick the German 1.234,56 shape; the key here
// is only for the Settings dropdown.
const NUMBER_FORMATS = [
  { value: 'comma_dot', group: ',', decimal: '.', label: '1,234.56' },
  { value: 'dot_comma', group: '.', decimal: ',', label: '1.234,56' },
  { value: 'space_comma', group: ' ', decimal: ',', label: '1 234,56' },
  { value: 'none_dot', group: '', decimal: '.', label: '1234.56' },
] as const

function numberFormatKey(group: string, decimal: string): string {
  return (
    NUMBER_FORMATS.find((f) => f.group === group && f.decimal === decimal)?.value ?? 'comma_dot'
  )
}

/** A ms epoch → local `YYYY-MM-DD`, so it can be fed to the household useFormatDate
 *  (en-CA renders the ISO shape in the local timezone). */
function msToLocalIso(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA')
}

// The editable household fields as one object, so seeding from the query is a
// single assignment (no per-field copy line to forget) and adding a field can't
// silently render blank or get wiped on save.
interface GeneralForm {
  displayName: string
  currencySymbol: string
  startDay: number | string
  jointBasis: string
  incomeBasis: string
  decimalPlaces: number | string
  symbolPosition: string
  numberFormat: string
  weekStart: string
  dateFormat: string
  emergencyMonths: number | string
}

function generalFormFrom(hh: Household): GeneralForm {
  return {
    displayName: hh.displayName,
    currencySymbol: hh.currencySymbol,
    startDay: hh.budgetPeriodStartDay,
    jointBasis: hh.jointContributionBasis,
    incomeBasis: hh.incomeBasisDefault,
    decimalPlaces: hh.currencyDecimalPlaces,
    symbolPosition: hh.currencySymbolPosition,
    numberFormat: numberFormatKey(hh.currencyGroupSeparator, hh.currencyDecimalSeparator),
    weekStart: hh.weekStart,
    dateFormat: hh.dateFormat,
    emergencyMonths: hh.emergencyFundMonths,
  }
}

function GeneralSection() {
  const utils = trpc.useUtils()
  const ctx = trpc.bootstrap.context.useQuery()
  const update = trpc.household.update.useMutation()
  const rescale = trpc.data.rescaleCurrency.useMutation()
  const hh = ctx.data?.household

  // One form object seeded from the household once it loads. `null` until then,
  // so fields never flash blank defaults over real data.
  const [form, setForm] = useState<GeneralForm | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (hh) setForm((prev) => prev ?? generalFormFrom(hh))
  }, [hh])

  const set = <K extends keyof GeneralForm>(key: K, value: GeneralForm[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f))

  const selectedFormat = NUMBER_FORMATS.find((f) => f.value === form?.numberFormat) ?? NUMBER_FORMATS[0]

  async function handleSave() {
    if (!form) return
    await update.mutateAsync({
      displayName: form.displayName.trim() || undefined,
      currencySymbol: form.currencySymbol || undefined,
      currencySymbolPosition: form.symbolPosition as 'prefix' | 'suffix',
      currencyGroupSeparator: selectedFormat.group,
      currencyDecimalSeparator: selectedFormat.decimal,
      budgetPeriodStartDay: Number(form.startDay),
      jointContributionBasis: form.jointBasis as 'equal' | 'income_proportional' | 'custom',
      incomeBasisDefault: form.incomeBasis as 'regular_net' | 'latest_payslip' | 'rolling_12m',
      weekStart: form.weekStart as 'monday' | 'sunday',
      dateFormat: form.dateFormat as 'iso' | 'numeric' | 'medium' | 'long',
      emergencyFundMonths: Number(form.emergencyMonths),
    })
    // Currency decimal-places change rescales every money column, so it goes
    // through the dedicated endpoint.
    if (hh && Number(form.decimalPlaces) !== hh.currencyDecimalPlaces) {
      await rescale.mutateAsync({ decimalPlaces: Number(form.decimalPlaces) })
    }
    await utils.invalidate()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!form) {
    return (
      <Card withBorder padding="md" radius="md">
        <Loader size="sm" />
      </Card>
    )
  }

  return (
    <Card withBorder padding="md" radius="md">
      <Title order={4} mb="sm">
        General
      </Title>
      <Stack gap="sm">
        <Group grow>
          <TextInput label="Household name" value={form.displayName} onChange={(e) => set('displayName', e.currentTarget.value)} />
          <TextInput label="Currency symbol" value={form.currencySymbol} onChange={(e) => set('currencySymbol', e.currentTarget.value)} w={120} />
        </Group>
        <Group grow>
          <NumberInput
            label="Budget period starts on day"
            min={1}
            max={28}
            value={form.startDay}
            onChange={(v) => set('startDay', v)}
          />
          <NumberInput
            label="Currency decimal places"
            description="Changing this rescales all stored amounts"
            min={0}
            max={4}
            value={form.decimalPlaces}
            onChange={(v) => set('decimalPlaces', v)}
          />
        </Group>
        <Group grow align="flex-end">
          <Select
            label="Currency symbol position"
            data={[
              { value: 'prefix', label: `Before (${form.currencySymbol || '£'}100)` },
              { value: 'suffix', label: `After (100 ${form.currencySymbol || '£'})` },
            ]}
            value={form.symbolPosition}
            onChange={(v) => set('symbolPosition', v ?? 'prefix')}
            allowDeselect={false}
          />
          <Select
            label="Number format"
            data={NUMBER_FORMATS.map((f) => ({ value: f.value, label: f.label }))}
            value={form.numberFormat}
            onChange={(v) => set('numberFormat', v ?? 'comma_dot')}
            allowDeselect={false}
          />
        </Group>
        <Text size="xs" c="dimmed">
          Preview:{' '}
          <Text span ff="monospace" fz="sm" fw={500}>
            {formatMoney(123456, {
              symbol: form.currencySymbol || '£',
              decimalPlaces: Number(form.decimalPlaces) || 0,
              symbolPosition: form.symbolPosition as 'prefix' | 'suffix',
              groupSeparator: selectedFormat.group,
              decimalSeparator: selectedFormat.decimal,
            })}
          </Text>
        </Text>
        <Group grow>
          <Select
            label="Joint contribution basis"
            data={[
              { value: 'equal', label: 'Equal' },
              { value: 'income_proportional', label: 'Income proportional' },
              { value: 'custom', label: 'Custom weights' },
            ]}
            value={form.jointBasis}
            onChange={(v) => set('jointBasis', v ?? 'equal')}
            allowDeselect={false}
          />
          <Select
            label="Income basis"
            data={[
              { value: 'regular_net', label: 'Regular net (salary)' },
              { value: 'latest_payslip', label: 'Latest payslip' },
              { value: 'rolling_12m', label: 'Rolling 12 months' },
            ]}
            value={form.incomeBasis}
            onChange={(v) => set('incomeBasis', v ?? 'regular_net')}
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
            value={form.weekStart}
            onChange={(v) => set('weekStart', v ?? 'monday')}
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
            value={form.dateFormat}
            onChange={(v) => set('dateFormat', v ?? 'medium')}
            allowDeselect={false}
          />
        </Group>
        <Group grow>
          <NumberInput
            label="Emergency fund (months of bills)"
            description="Target cushion shown on the Funding page — typically 3–6 months."
            min={0}
            max={24}
            value={form.emergencyMonths}
            onChange={(v) => set('emergencyMonths', v)}
          />
          <div />
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
  const linkUser = trpc.members.linkUser.useMutation()

  const me = trpc.users.me.useQuery()
  const isAdmin = me.data?.role === 'admin' || me.data?.role === 'owner'
  // Accounts to map members onto (admin-only endpoint).
  const accounts = trpc.access.list.useQuery(undefined, { enabled: isAdmin })

  const members = (membersQuery.data ?? []).filter((m) => m.archivedAt === null)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const accountOptions = [
    { value: '', label: '— no account —' },
    ...(accounts.data ?? []).map((a) => ({ value: a.userId, label: `${a.displayName} (@${a.username})` })),
  ]

  async function refresh() {
    await Promise.all([
      utils.members.list.invalidate(),
      utils.bootstrap.context.invalidate(),
      utils.users.me.invalidate(),
    ])
  }

  async function handleLink(memberId: string, userId: string) {
    await linkUser.mutateAsync({ memberId, userId: userId || null })
    await refresh()
  }

  async function handleAdd() {
    if (!newName.trim()) return
    await addPerson.mutateAsync({ displayName: newName.trim() })
    await refresh()
    setNewName('')
  }

  async function handleRename(id: string) {
    if (editName.trim()) {
      const target = members.find((m) => m.id === id)
      await updateMember.mutateAsync({ id, expectedUpdatedAt: target?.updatedAt, displayName: editName.trim() })
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
          <div key={m.id}>
          <Group justify="space-between" px="xs" py={4}>
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
          {isAdmin && m.kind === 'person' && editingId !== m.id && (
            <Group gap="xs" px="xs" pb={6} wrap="nowrap">
              <Text size="xs" c="dimmed" w={58} style={{ flexShrink: 0 }}>
                Account
              </Text>
              <Select
                size="xs"
                data={accountOptions}
                value={m.userId ?? ''}
                allowDeselect={false}
                placeholder="— no account —"
                onChange={(v) => void handleLink(m.id, v ?? '')}
                style={{ flex: 1, maxWidth: 260 }}
              />
            </Group>
          )}
          </div>
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
  const fmt = useFormatDate()
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
                ? ` Last: ${fmt(msToLocalIso(hh.backupLastAt))} ${new Date(hh.backupLastAt).toLocaleTimeString()}.`
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

  return (
    <Card withBorder padding="md" radius="md">
      <Title order={4} mb="sm">
        Security
      </Title>
      <Text size="xs" c="dimmed" mb="sm">
        Your account password. While it&apos;s unset the app is open on your network; setting one turns on
        login (anyone you invite signs in with their own account). For internet exposure, also put it
        behind a reverse proxy or Tailscale.
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
            {/* Render the server-generated SVG as an image (a data URI) rather than
                injecting raw HTML, so it can't introduce markup into the page. */}
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(enroll.qrSvg)}`}
              alt="Two-factor authentication QR code"
              width={200}
              height={200}
              style={{ flexShrink: 0 }}
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
// Account (the current user)
// ---------------------------------------------------------------------------

interface AccountForm {
  username: string
  displayName: string
  email: string
}

function AccountSection() {
  const utils = trpc.useUtils()
  const me = trpc.users.me.useQuery()
  const update = trpc.users.updateProfile.useMutation()

  // One seeded form object (see GeneralSection) — no per-field copy line.
  const [form, setForm] = useState<AccountForm | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const d = me.data
    if (d) setForm((prev) => prev ?? { username: d.username, displayName: d.displayName, email: d.email ?? '' })
  }, [me.data])

  const set = <K extends keyof AccountForm>(key: K, value: AccountForm[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f))

  if (!form) return null

  async function handleSave() {
    if (!form) return
    setError('')
    try {
      await update.mutateAsync({
        username: form.username.trim(),
        displayName: form.displayName.trim(),
        email: form.email.trim() || null,
      })
      await Promise.all([utils.users.me.invalidate(), utils.auth.status.invalidate()])
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your profile.')
    }
  }

  return (
    <Card withBorder padding="md" radius="md">
      <Title order={4} mb="sm">
        Your account
      </Title>
      <Stack gap="sm">
        <Group grow>
          <TextInput label="Name" value={form.displayName} onChange={(e) => set('displayName', e.currentTarget.value)} />
          <TextInput label="Username" value={form.username} onChange={(e) => set('username', e.currentTarget.value)} />
        </Group>
        <TextInput
          label="Email"
          description="Optional — only used for invitations and (later) password reset."
          value={form.email}
          onChange={(e) => set('email', e.currentTarget.value)}
          type="email"
        />
        {error && (
          <Alert color="red" title="Error">
            {error}
          </Alert>
        )}
        <Group justify="flex-end">
          {saved && (
            <Text size="sm" c="dimmed">
              Saved ✓
            </Text>
          )}
          <Button onClick={() => void handleSave()} loading={update.isPending}>
            Save
          </Button>
        </Group>
      </Stack>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Households & people you share with (switcher + invitations)
// ---------------------------------------------------------------------------

/** The people with accepted access to the active household: change a role,
 *  reset a locked-out member's password, or revoke access. Admin+ only; the
 *  server enforces that only owners touch owners/admins. */
function AccessList({ isOwner }: { isOwner: boolean }) {
  const utils = trpc.useUtils()
  const list = trpc.access.list.useQuery()
  const setRole = trpc.access.setRole.useMutation()
  const remove = trpc.access.remove.useMutation()
  const resetPassword = trpc.access.resetPassword.useMutation()

  const [pendingRemove, setPendingRemove] = useState<string | null>(null)
  const [resetFor, setResetFor] = useState<{ userId: string; name: string } | null>(null)
  const [newPw, setNewPw] = useState('')
  const [resetMsg, setResetMsg] = useState('')
  const [error, setError] = useState('')

  const roleOptions = [
    { value: 'viewer', label: 'Viewer' },
    { value: 'member', label: 'Member' },
    ...(isOwner
      ? [
          { value: 'admin', label: 'Admin' },
          { value: 'owner', label: 'Owner' },
        ]
      : []),
  ]

  async function changeRole(userId: string, role: string) {
    setError('')
    try {
      await setRole.mutateAsync({ userId, role: role as 'owner' | 'admin' | 'member' | 'viewer' })
      await utils.access.list.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the role.')
    }
  }

  async function confirmRemove(userId: string) {
    setError('')
    try {
      await remove.mutateAsync({ userId })
      setPendingRemove(null)
      await utils.access.list.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove access.')
    }
  }

  async function submitReset() {
    if (!resetFor) return
    setError('')
    const weak = validatePassword(newPw)
    if (weak) return setError(weak)
    try {
      await resetPassword.mutateAsync({ userId: resetFor.userId, newPassword: newPw })
      setResetMsg(`Password reset for ${resetFor.name}. Share it with them; they'll be signed out.`)
      setResetFor(null)
      setNewPw('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset the password.')
    }
  }

  const rows = list.data ?? []

  return (
    <>
      <Divider label="People with access" labelPosition="left" />
      {error && (
        <Alert color="red" title="Error">
          {error}
        </Alert>
      )}
      {resetMsg && (
        <Alert color="moss" variant="light" withCloseButton onClose={() => setResetMsg('')}>
          {resetMsg}
        </Alert>
      )}
      <Stack gap={6}>
        {rows.map((r) => {
          const elevated = r.role === 'admin' || r.role === 'owner'
          const canManage = !r.isYou && (elevated ? isOwner : true)
          return (
            <Group key={r.userId} justify="space-between" wrap="nowrap" px="xs" py={4}>
              <div style={{ minWidth: 0 }}>
                <Text size="sm" truncate>
                  {r.displayName}
                  {r.isYou && (
                    <Text span size="xs" c="dimmed">
                      {' '}
                      (you)
                    </Text>
                  )}
                </Text>
                <Text size="xs" c="dimmed" truncate>
                  @{r.username} · {r.role}
                  {r.mfaEnabled ? ' · 2FA on' : ''}
                </Text>
              </div>
              {canManage ? (
                <Group gap={6} wrap="nowrap">
                  <Select
                    size="xs"
                    w={116}
                    data={roleOptions}
                    value={r.role}
                    allowDeselect={false}
                    onChange={(v) => v && v !== r.role && void changeRole(r.userId, v)}
                  />
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={() => {
                      setResetMsg('')
                      setResetFor({ userId: r.userId, name: r.displayName })
                    }}
                  >
                    Reset password
                  </Button>
                  {pendingRemove === r.userId ? (
                    <Button
                      size="compact-xs"
                      color="red"
                      loading={remove.isPending}
                      onClick={() => void confirmRemove(r.userId)}
                    >
                      Confirm
                    </Button>
                  ) : (
                    <Button size="compact-xs" variant="subtle" color="red" onClick={() => setPendingRemove(r.userId)}>
                      Remove
                    </Button>
                  )}
                </Group>
              ) : (
                !r.isYou && (
                  <Text size="xs" c="dimmed">
                    owner-managed
                  </Text>
                )
              )}
            </Group>
          )
        })}
      </Stack>

      <Modal opened={resetFor !== null} onClose={() => setResetFor(null)} title={`Reset password — ${resetFor?.name ?? ''}`} size="sm">
        <Stack gap="sm">
          <Text size="xs" c="dimmed">
            Set a new password for this member, then share it with them out-of-band. They&apos;ll be signed out of any
            active sessions.
          </Text>
          <PasswordInput
            label="New password"
            value={newPw}
            onChange={(e) => setNewPw(e.currentTarget.value)}
            description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setResetFor(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submitReset()} loading={resetPassword.isPending}>
              Reset password
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}

function HouseholdAccessSection() {
  const utils = trpc.useUtils()
  const me = trpc.users.me.useQuery()
  const fmt = useFormatDate()
  const switchHousehold = trpc.users.switchHousehold.useMutation()

  const role = me.data?.role ?? null
  const isAdmin = role === 'admin' || role === 'owner'
  const isOwner = role === 'owner'
  const memberships = me.data?.memberships ?? []

  const invites = trpc.invitations.list.useQuery(undefined, { enabled: isAdmin })
  const createInvite = trpc.invitations.create.useMutation()
  const revoke = trpc.invitations.revoke.useMutation()

  const [inviteRole, setInviteRole] = useState('member')
  const [link, setLink] = useState('')
  const [error, setError] = useState('')

  if (!me.data) return null

  async function handleSwitch(householdId: string) {
    if (householdId === me.data?.activeHouseholdId) return
    await switchHousehold.mutateAsync({ householdId })
    // Active household changed — everything is scoped to it, so refetch all.
    await utils.invalidate()
    window.location.reload()
  }

  async function handleCreateInvite() {
    setError('')
    try {
      const res = await createInvite.mutateAsync({ role: inviteRole as 'admin' | 'member' | 'viewer' })
      setLink(`${window.location.origin}/invite/${res.token}`)
      await utils.invitations.list.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the invitation.')
    }
  }

  const inviteRoleOptions = [
    { value: 'viewer', label: 'Viewer (read-only)' },
    { value: 'member', label: 'Member (can edit)' },
    ...(isOwner ? [{ value: 'admin', label: 'Admin (can manage & invite)' }] : []),
  ]

  return (
    <Card withBorder padding="md" radius="md">
      <Title order={4} mb="sm">
        Households &amp; access
      </Title>
      <Stack gap="sm">
        {memberships.length > 1 && (
          <Select
            label="Active household"
            description="Switch which household you're viewing."
            data={memberships.map((m) => ({ value: m.householdId, label: `${m.householdName} · ${m.role}` }))}
            value={me.data.activeHouseholdId}
            onChange={(v) => v && void handleSwitch(v)}
            allowDeselect={false}
          />
        )}

        {!isAdmin && (
          <Text size="sm" c="dimmed">
            You&apos;re a {role} of this household. Ask an admin to invite others.
          </Text>
        )}

        {isAdmin && (
          <>
            <AccessList isOwner={isOwner} />
            <Divider label="Invite someone" labelPosition="left" />
            <Group align="flex-end">
              <Select
                label="Role"
                data={inviteRoleOptions}
                value={inviteRole}
                onChange={(v) => setInviteRole(v ?? 'member')}
                allowDeselect={false}
                w={220}
              />
              <Button onClick={() => void handleCreateInvite()} loading={createInvite.isPending}>
                Create invite link
              </Button>
            </Group>
            {error && (
              <Alert color="red" title="Error">
                {error}
              </Alert>
            )}
            {link && (
              <Alert color="moss" variant="light" title="Invite link — share it with the person you're inviting">
                <Group gap="xs" wrap="nowrap">
                  <Code fz="xs" style={{ overflowX: 'auto', flex: 1 }}>
                    {link}
                  </Code>
                  <CopyButton value={link}>
                    {({ copied, copy }) => (
                      <Button size="compact-sm" variant="default" onClick={copy}>
                        {copied ? 'Copied' : 'Copy'}
                      </Button>
                    )}
                  </CopyButton>
                </Group>
                <Text size="xs" c="dimmed" mt={4}>
                  The link works once and expires in 7 days.
                </Text>
              </Alert>
            )}

            {(invites.data?.length ?? 0) > 0 && (
              <>
                <Divider label="Pending invitations" labelPosition="left" />
                <Stack gap={4}>
                  {invites.data?.map((inv) => (
                    <Group key={inv.id} justify="space-between" px="xs" py={4}>
                      <Text size="sm">
                        {inv.email ?? 'Invite link'}{' '}
                        <Text span size="xs" c="dimmed">
                          · {inv.role} · expires {fmt(msToLocalIso(inv.expiresAt))}
                        </Text>
                      </Text>
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color="red"
                        loading={revoke.isPending}
                        onClick={async () => {
                          await revoke.mutateAsync({ id: inv.id })
                          await utils.invitations.list.invalidate()
                        }}
                      >
                        Revoke
                      </Button>
                    </Group>
                  ))}
                </Stack>
              </>
            )}
          </>
        )}
      </Stack>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Instance-wide registration toggle (System scope). Moved out of the household
// access section — it governs the whole instance, not one household.
// ---------------------------------------------------------------------------

function RegistrationSection() {
  const utils = trpc.useUtils()
  const regOpen = trpc.auth.registrationOpen.useQuery()
  const setRegOpen = trpc.auth.setRegistrationOpen.useMutation()
  return (
    <Card withBorder padding="md" radius="md">
      <Title order={4} mb="sm">
        Registration
      </Title>
      <Switch
        label="Allow anyone to register"
        description="Instance-wide: when on, the sign-in screen lets new people create their own account and household. Leave off to stay invite-only."
        checked={regOpen.data?.allowOpenRegistration ?? false}
        onChange={async (e) => {
          await setRegOpen.mutateAsync({ open: e.currentTarget.checked })
          await utils.auth.registrationOpen.invalidate()
        }}
      />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Settings, split by authorization scope (see issue #16):
//   /settings/account  — the signed-in user (any role)
//   /settings/household — the active household (edits gated by role)
//   /settings/system   — the whole instance (instance owner only)
// The section components are reused as-is; these pages just group them.
// ---------------------------------------------------------------------------

export function AccountSettingsPage() {
  return (
    <Stack gap="lg">
      <AccountSection />
      <SecuritySection />
      <MfaSection />
    </Stack>
  )
}

export function HouseholdSettingsPage() {
  return (
    <Stack gap="lg">
      <GeneralSection />
      <MembersSection />
      <HouseholdAccessSection />
    </Stack>
  )
}

export function SystemSettingsPage() {
  const me = trpc.users.me.useQuery()
  // Instance-owner only. While loading, hold; if not permitted, bounce to Account
  // rather than render an empty page (the server also gates each endpoint).
  if (me.isLoading) return <Loader size="sm" />
  if (!me.data?.isInstanceOwner) return <Navigate to="/settings/account" replace />
  return (
    <Stack gap="lg">
      <RegistrationSection />
      <DataSection />
      <AboutSection />
    </Stack>
  )
}

/** Shared chrome for the settings sub-pages: a title + a tab bar that only shows
 *  the tabs the current user may use, with the active page's content below. */
export function SettingsLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const me = trpc.users.me.useQuery()
  const isInstanceOwner = me.data?.isInstanceOwner ?? false

  // Which sub-route are we on? (…/settings/<tab>)
  const active = location.pathname.split('/')[2] ?? 'account'

  return (
    <Stack gap="lg" maw={760} mx="auto">
      <Title order={2}>Settings</Title>
      <Tabs value={active} onChange={(v) => v && navigate(`/settings/${v}`)}>
        <Tabs.List>
          <Tabs.Tab value="account">Account</Tabs.Tab>
          <Tabs.Tab value="household">Household</Tabs.Tab>
          {isInstanceOwner && <Tabs.Tab value="system">System</Tabs.Tab>}
        </Tabs.List>
      </Tabs>
      <Outlet />
    </Stack>
  )
}

/** `/settings` → the first sub-route the user can see (always Account). */
export function SettingsIndexRedirect() {
  return <Navigate to="/settings/account" replace />
}
