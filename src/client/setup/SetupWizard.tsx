import { useRef, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Select,
  Stack,
  Stepper,
  Text,
  TextInput,
  Title,
  ActionIcon,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { trpc } from '../trpc'
import { CURRENCIES, findCurrency } from './currencies'
import { LOCALES } from './locales'

// ---------------------------------------------------------------------------
// Step 1 – Household
// ---------------------------------------------------------------------------

interface HouseholdStepProps {
  initialName: string
  initialCurrencyCode: string
  initialLocale: string
  onNext: () => void
}

function HouseholdStep({ initialName, initialCurrencyCode, initialLocale, onNext }: HouseholdStepProps) {
  const [name, setName] = useState(initialName)
  const [currencyCode, setCurrencyCode] = useState(initialCurrencyCode)
  const [locale, setLocale] = useState(initialLocale)
  const updateHousehold = trpc.household.update.useMutation()

  const currencyOptions = CURRENCIES.map((c) => ({ value: c.code, label: c.label }))

  async function handleNext() {
    const preset = findCurrency(currencyCode)
    await updateHousehold.mutateAsync({
      displayName: name.trim() || 'My Household',
      currencyCode,
      currencySymbol: preset?.symbol ?? '£',
      currencyDecimalPlaces: preset?.decimalPlaces ?? 2,
      locale,
    })
    onNext()
  }

  return (
    <Stack gap="md" maw={480}>
      <Title order={3}>About your household</Title>
      <TextInput
        label="Household name"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        placeholder="My Household"
      />
      <Select
        label="Currency"
        data={currencyOptions}
        value={currencyCode}
        searchable
        onChange={(v) => setCurrencyCode(v ?? 'GBP')}
        allowDeselect={false}
      />
      <Select
        label="Region"
        description="Sets how dates are shown (numeric day/month order and month names)."
        data={LOCALES}
        value={locale}
        searchable
        onChange={(v) => setLocale(v ?? 'en-GB')}
        allowDeselect={false}
      />
      {updateHousehold.error && (
        <Alert color="red" title="Error">
          {updateHousehold.error.message}
        </Alert>
      )}
      <Group>
        <Button onClick={() => void handleNext()} loading={updateHousehold.isPending}>
          Next
        </Button>
      </Group>
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// Step 2 – Members
// ---------------------------------------------------------------------------

interface MembersStepProps {
  onNext: () => void
  onBack: () => void
}

function MembersStep({ onNext, onBack }: MembersStepProps) {
  const utils = trpc.useUtils()
  const { data: members, isLoading } = trpc.members.list.useQuery()
  const addPerson = trpc.members.addPerson.useMutation()
  const archive = trpc.members.archive.useMutation()
  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState('')

  const activeMembers = (members ?? []).filter((m) => m.archivedAt === null)
  const hasActivePerson = activeMembers.some((m) => m.kind === 'person')

  async function handleAdd() {
    const trimmed = newName.trim()
    if (!trimmed) {
      setAddError('Please enter a name.')
      return
    }
    setAddError('')
    await addPerson.mutateAsync({ displayName: trimmed })
    await utils.members.list.invalidate()
    setNewName('')
  }

  async function handleArchive(id: string) {
    await archive.mutateAsync({ id })
    await utils.members.list.invalidate()
  }

  return (
    <Stack gap="md" maw={480}>
      <Title order={3}>Household members</Title>
      <Text size="sm" c="dimmed">
        Add the people in your household. The joint member represents shared finances and cannot be
        removed.
      </Text>
      {isLoading && (
        <Center>
          <Loader size="sm" />
        </Center>
      )}
      <Stack gap="xs">
        {activeMembers.map((m) => (
          <Group key={m.id} justify="space-between" px="xs" py={6} style={{ borderRadius: 6, background: 'light-dark(var(--mantine-color-sand-0), var(--mantine-color-dark-6))' }}>
            <Group gap="xs">
              {m.color ? (
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    backgroundColor: m.color,
                    flexShrink: 0,
                  }}
                />
              ) : null}
              <Text size="sm" fw={500}>
                {m.displayName}
              </Text>
              {m.kind === 'joint' && (
                <Badge size="xs" color="sand" variant="light">
                  joint
                </Badge>
              )}
            </Group>
            {m.kind === 'person' && (
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                aria-label={`Remove ${m.displayName}`}
                onClick={() => void handleArchive(m.id)}
                loading={archive.isPending}
              >
                ×
              </ActionIcon>
            )}
          </Group>
        ))}
      </Stack>
      <Group gap="sm" align="flex-end">
        <TextInput
          label="Add person"
          value={newName}
          onChange={(e) => {
            setNewName(e.currentTarget.value)
            setAddError('')
          }}
          placeholder="Name"
          error={addError || (addPerson.error?.message ?? undefined)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleAdd()
          }}
          style={{ flex: 1 }}
        />
        <Button
          onClick={() => void handleAdd()}
          loading={addPerson.isPending}
          mb={addError || addPerson.error ? 18 : 0}
        >
          Add
        </Button>
      </Group>
      <Group>
        <Button variant="default" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!hasActivePerson}>
          Next
        </Button>
      </Group>
      {!hasActivePerson && (
        <Text size="xs" c="red">
          Add at least one person before continuing.
        </Text>
      )}
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// Step 3 – Finish
// ---------------------------------------------------------------------------

interface FinishStepProps {
  onBack: () => void
}

function FinishStep({ onBack }: FinishStepProps) {
  const utils = trpc.useUtils()
  const { data: members } = trpc.members.list.useQuery()
  // Read the (possibly just-renamed) household name from live data rather than a
  // stale prop threaded down from the wizard's initial props.
  const { data: context } = trpc.bootstrap.context.useQuery()
  const householdName = context?.household?.displayName ?? 'Your household'
  const completeSetup = trpc.household.completeSetup.useMutation()
  const [error, setError] = useState('')

  const activeMembers = (members ?? []).filter((m) => m.archivedAt === null)
  const people = activeMembers.filter((m) => m.kind === 'person')

  async function handleFinish() {
    setError('')
    try {
      await completeSetup.mutateAsync()
      await utils.bootstrap.context.invalidate()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Setup could not be completed.'
      setError(message)
    }
  }

  return (
    <Stack gap="md" maw={480}>
      <Title order={3}>Ready to go!</Title>
      <Text>
        <strong>{householdName}</strong> is configured with {people.length} person
        {people.length === 1 ? '' : 's'}.
      </Text>
      <Stack gap="xs">
        {activeMembers.map((m) => (
          <Group key={m.id} gap="xs">
            {m.color ? (
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: m.color,
                  flexShrink: 0,
                }}
              />
            ) : null}
            <Text size="sm">
              {m.displayName}
              {m.kind === 'joint' ? ' (joint)' : ''}
            </Text>
          </Group>
        ))}
      </Stack>
      {error && (
        <Alert color="red" title="Setup incomplete">
          {error} — please go back and add at least one person.
        </Alert>
      )}
      <Group>
        <Button variant="default" onClick={onBack}>
          Back
        </Button>
        <Button
          onClick={() => void handleFinish()}
          loading={completeSetup.isPending}
          disabled={completeSetup.isPending}
        >
          Finish setup
        </Button>
      </Group>
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// Restore from backup (skips the wizard entirely)
// ---------------------------------------------------------------------------

function RestoreBackupControl() {
  const utils = trpc.useUtils()
  const importMut = trpc.data.import.useMutation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')

  async function handleFile(file: File) {
    setError('')
    try {
      const parsed = JSON.parse(await file.text())
      await importMut.mutateAsync(parsed)
      await utils.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed — is this a valid Hearth backup?')
    }
  }

  return (
    <Stack gap={4} align="flex-end">
      <Button
        variant="subtle"
        size="xs"
        loading={importMut.isPending}
        onClick={() => fileRef.current?.click()}
      >
        Restore from backup
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0]
          if (file) void handleFile(file)
          e.currentTarget.value = ''
        }}
      />
      {error && (
        <Text size="xs" c="red" ta="right">
          {error}
        </Text>
      )}
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// SetupWizard
// ---------------------------------------------------------------------------

interface SetupWizardProps {
  householdName: string
  currencyCode: string
  locale: string
}

export function SetupWizard({ householdName, currencyCode, locale }: SetupWizardProps) {
  const [active, setActive] = useState(0)
  const isMobile = useMediaQuery('(max-width: 48em)')

  return (
    <Stack gap="xl" maw={640} mx="auto" mt="xl" px="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Title order={2}>Set up Hearth</Title>
        <RestoreBackupControl />
      </Group>
      <Stepper active={active} allowNextStepsSelect={false} orientation={isMobile ? 'vertical' : 'horizontal'}>
        <Stepper.Step label="Household" description="Name & currency">
          <HouseholdStep
            initialName={householdName}
            initialCurrencyCode={currencyCode}
            initialLocale={locale}
            onNext={() => setActive(1)}
          />
        </Stepper.Step>
        <Stepper.Step label="Members" description="Who lives here?">
          <MembersStep onNext={() => setActive(2)} onBack={() => setActive(0)} />
        </Stepper.Step>
        <Stepper.Step label="Finish" description="Complete setup">
          <FinishStep onBack={() => setActive(1)} />
        </Stepper.Step>
      </Stepper>
    </Stack>
  )
}
