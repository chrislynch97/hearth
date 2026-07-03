import { useEffect, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Divider,
  Group,
  Modal,
  NumberInput,
  PasswordInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { trpc } from '../trpc'
import { downloadJson } from '../csv'

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
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!hh) return
    setDisplayName(hh.displayName)
    setCurrencySymbol(hh.currencySymbol)
    setStartDay(hh.budgetPeriodStartDay)
    setJointBasis(hh.jointContributionBasis)
    setIncomeBasis(hh.incomeBasisDefault)
    setDecimalPlaces(hh.currencyDecimalPlaces)
  }, [hh])

  async function handleSave() {
    await update.mutateAsync({
      displayName: displayName.trim() || undefined,
      currencySymbol: currencySymbol || undefined,
      budgetPeriodStartDay: Number(startDay),
      jointContributionBasis: jointBasis as 'equal' | 'income_proportional' | 'custom',
      incomeBasisDefault: incomeBasis as 'regular_net' | 'latest_payslip' | 'rolling_12m',
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
  const importMut = trpc.data.import.useMutation()
  const resetMut = trpc.data.reset.useMutation()
  const fileRef = useRef<HTMLInputElement>(null)

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  async function handleExport() {
    setError('')
    const data = await utils.data.export.fetch()
    const stamp = new Date().toISOString().slice(0, 10)
    downloadJson(`hearth-backup-${stamp}.json`, data)
    setMessage('Backup downloaded.')
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
        <Group justify="space-between">
          <div>
            <Text size="sm" fw={500}>
              Backup
            </Text>
            <Text size="xs" c="dimmed">
              Download all your data as a JSON file — the portable backup format.
            </Text>
          </div>
          <Button variant="default" onClick={() => void handleExport()}>
            Download backup
          </Button>
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
            Reset…
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
    if (next.length < 1) return setError('Enter a new password.')
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
      <DataSection />
      <AboutSection />
    </Stack>
  )
}
