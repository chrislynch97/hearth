import { useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Divider,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { trpc } from '../trpc'
import type { Category, Member, Pot } from '../../server/db/schema'

// ---------------------------------------------------------------------------
// Categories panel
// ---------------------------------------------------------------------------

function CategoryRow({ category }: { category: Category }) {
  const utils = trpc.useUtils()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const update = trpc.categories.update.useMutation()
  const archive = trpc.categories.archive.useMutation()

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === category.name) {
      setEditing(false)
      setName(category.name)
      return
    }
    await update.mutateAsync({ id: category.id, name: trimmed })
    await utils.categories.list.invalidate()
    setEditing(false)
  }

  async function handleArchive() {
    await archive.mutateAsync({ id: category.id })
    await utils.categories.list.invalidate()
    await utils.pots.list.invalidate()
    setConfirmArchive(false)
  }

  return (
    <>
      <Group justify="space-between" px="xs" py={6} wrap="nowrap">
        {editing ? (
          <Group gap="xs" style={{ flex: 1 }} wrap="nowrap">
            <TextInput
              size="xs"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSave()
                if (e.key === 'Escape') {
                  setName(category.name)
                  setEditing(false)
                }
              }}
              autoFocus
              style={{ flex: 1 }}
            />
            <Button size="xs" onClick={() => void handleSave()} loading={update.isPending}>
              Save
            </Button>
            <Button
              size="xs"
              variant="default"
              onClick={() => {
                setName(category.name)
                setEditing(false)
              }}
            >
              Cancel
            </Button>
          </Group>
        ) : (
          <>
            <Text size="sm" fw={500}>
              {category.name}
            </Text>
            <Group gap={4}>
              <ActionIcon
                variant="subtle"
                size="sm"
                aria-label={`Rename ${category.name}`}
                onClick={() => setEditing(true)}
              >
                ✎
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                aria-label={`Archive ${category.name}`}
                onClick={() => setConfirmArchive(true)}
              >
                ×
              </ActionIcon>
            </Group>
          </>
        )}
      </Group>
      <Modal
        opened={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title="Archive category?"
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            Archive <strong>{category.name}</strong>? Pots in this category will become
            uncategorised.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmArchive(false)}>
              Cancel
            </Button>
            <Button color="red" onClick={() => void handleArchive()} loading={archive.isPending}>
              Archive
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}

function CategoriesPanel({ categories, isLoading }: { categories: Category[]; isLoading: boolean }) {
  const utils = trpc.useUtils()
  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState('')
  const create = trpc.categories.create.useMutation()

  async function handleAdd() {
    const trimmed = newName.trim()
    if (!trimmed) {
      setAddError('Please enter a name.')
      return
    }
    setAddError('')
    await create.mutateAsync({ name: trimmed })
    await utils.categories.list.invalidate()
    setNewName('')
  }

  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Title order={4}>Categories</Title>
        {isLoading && (
          <Center>
            <Loader size="sm" />
          </Center>
        )}
        {!isLoading && categories.length === 0 && (
          <Text size="sm" c="dimmed">
            No categories yet — add one below.
          </Text>
        )}
        <Stack gap={2}>
          {categories.map((c) => (
            <CategoryRow key={c.id} category={c} />
          ))}
        </Stack>
        <Divider />
        <Group gap="sm" align="flex-end">
          <TextInput
            label="Add category"
            placeholder="e.g. Household"
            value={newName}
            onChange={(e) => {
              setNewName(e.currentTarget.value)
              setAddError('')
            }}
            error={addError || (create.error?.message ?? undefined)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAdd()
            }}
            style={{ flex: 1 }}
          />
          <Button onClick={() => void handleAdd()} loading={create.isPending}>
            Add
          </Button>
        </Group>
      </Stack>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Pots panel
// ---------------------------------------------------------------------------

interface PotRowProps {
  pot: Pot
  members: Member[]
  categories: Category[]
}

function PotRow({ pot, members, categories }: PotRowProps) {
  const utils = trpc.useUtils()
  const [editing, setEditing] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)

  const [name, setName] = useState(pot.name)
  const [ownerId, setOwnerId] = useState<string>(pot.ownerId)
  const [categoryId, setCategoryId] = useState<string | null>(pot.categoryId)
  const [isDrawdown, setIsDrawdown] = useState(pot.isDrawdown === 1)
  const [note, setNote] = useState(pot.note ?? '')

  const update = trpc.pots.update.useMutation()
  const archive = trpc.pots.archive.useMutation()

  const owner = members.find((m) => m.id === pot.ownerId)

  const memberOptions = members.map((m) => ({ value: m.id, label: m.displayName }))
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))

  function resetEdits() {
    setName(pot.name)
    setOwnerId(pot.ownerId)
    setCategoryId(pot.categoryId)
    setIsDrawdown(pot.isDrawdown === 1)
    setNote(pot.note ?? '')
  }

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) return
    await update.mutateAsync({
      id: pot.id,
      name: trimmed,
      ownerId,
      categoryId: categoryId,
      isDrawdown,
      note: note.trim(),
    })
    await utils.pots.list.invalidate()
    setEditing(false)
  }

  async function handleArchive() {
    await archive.mutateAsync({ id: pot.id })
    await utils.pots.list.invalidate()
    setConfirmArchive(false)
  }

  if (editing) {
    return (
      <Card withBorder padding="sm">
        <Stack gap="xs">
          <TextInput
            label="Name"
            size="xs"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            autoFocus
          />
          <Group grow>
            <Select
              label="Owner"
              size="xs"
              data={memberOptions}
              value={ownerId}
              onChange={(v) => setOwnerId(v ?? pot.ownerId)}
              allowDeselect={false}
            />
            <Select
              label="Category"
              size="xs"
              data={categoryOptions}
              value={categoryId}
              onChange={(v) => setCategoryId(v)}
              clearable
              placeholder="Uncategorised"
            />
          </Group>
          <Switch
            label="Savings / drawdown pot"
            size="sm"
            checked={isDrawdown}
            onChange={(e) => setIsDrawdown(e.currentTarget.checked)}
          />
          <TextInput
            label="Note"
            size="xs"
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
          />
          {update.error && (
            <Alert color="red" title="Error">
              {update.error.message}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button
              size="xs"
              variant="default"
              onClick={() => {
                resetEdits()
                setEditing(false)
              }}
            >
              Cancel
            </Button>
            <Button size="xs" onClick={() => void handleSave()} loading={update.isPending}>
              Save
            </Button>
          </Group>
        </Stack>
      </Card>
    )
  }

  return (
    <>
      <Group
        justify="space-between"
        px="xs"
        py={6}
        wrap="nowrap"
        style={{
          borderRadius: 6,
          background: 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))',
        }}
      >
        <Group gap="xs" wrap="wrap">
          <Text size="sm" fw={500}>
            {pot.name}
          </Text>
          {owner && (
            <Badge
              size="sm"
              variant="light"
              color={owner.color ?? undefined}
              style={
                owner.color
                  ? {
                      backgroundColor: owner.color + '22',
                      color: owner.color,
                      borderColor: owner.color + '55',
                    }
                  : undefined
              }
            >
              {owner.displayName}
            </Badge>
          )}
          {pot.isDrawdown === 1 && (
            <Badge size="sm" color="grape" variant="light">
              savings
            </Badge>
          )}
          {pot.note && (
            <Text size="xs" c="dimmed">
              {pot.note}
            </Text>
          )}
        </Group>
        <Group gap={4}>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={`Edit ${pot.name}`}
            onClick={() => setEditing(true)}
          >
            ✎
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="red"
            size="sm"
            aria-label={`Archive ${pot.name}`}
            onClick={() => setConfirmArchive(true)}
          >
            ×
          </ActionIcon>
        </Group>
      </Group>
      <Modal
        opened={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title="Archive pot?"
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            Archive <strong>{pot.name}</strong>? This can't be undone from here.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmArchive(false)}>
              Cancel
            </Button>
            <Button color="red" onClick={() => void handleArchive()} loading={archive.isPending}>
              Archive
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}

interface AddPotFormProps {
  members: Member[]
  categories: Category[]
}

function AddPotForm({ members, categories }: AddPotFormProps) {
  const utils = trpc.useUtils()
  const create = trpc.pots.create.useMutation()

  const [name, setName] = useState('')
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [isDrawdown, setIsDrawdown] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const memberOptions = members.map((m) => ({ value: m.id, label: m.displayName }))
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))

  async function handleAdd() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Please enter a pot name.')
      return
    }
    if (!ownerId) {
      setError('Please choose an owner.')
      return
    }
    setError('')
    await create.mutateAsync({
      name: trimmed,
      ownerId,
      categoryId: categoryId ?? undefined,
      isDrawdown,
      note: note.trim() || undefined,
    })
    await utils.pots.list.invalidate()
    setName('')
    setCategoryId(null)
    setIsDrawdown(false)
    setNote('')
  }

  return (
    <Stack gap="sm">
      <Divider label="Add a pot" labelPosition="left" />
      <Group grow align="flex-end">
        <TextInput
          label="Name"
          placeholder="e.g. Holiday fund"
          value={name}
          onChange={(e) => {
            setName(e.currentTarget.value)
            setError('')
          }}
        />
        <Select
          label="Owner"
          placeholder="Choose owner"
          data={memberOptions}
          value={ownerId}
          onChange={(v) => {
            setOwnerId(v)
            setError('')
          }}
        />
        <Select
          label="Category"
          placeholder="Uncategorised"
          data={categoryOptions}
          value={categoryId}
          onChange={setCategoryId}
          clearable
        />
      </Group>
      <Group align="flex-end" justify="space-between">
        <TextInput
          label="Note (optional)"
          placeholder="Optional note"
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Switch
          label="Savings / drawdown pot"
          checked={isDrawdown}
          onChange={(e) => setIsDrawdown(e.currentTarget.checked)}
          ml="md"
        />
        <Button onClick={() => void handleAdd()} loading={create.isPending} ml="md">
          Add pot
        </Button>
      </Group>
      {(error || create.error) && (
        <Alert color="red" title="Error">
          {error || create.error?.message}
        </Alert>
      )}
    </Stack>
  )
}

function PotsPanel({
  pots,
  categories,
  members,
  isLoading,
}: {
  pots: Pot[]
  categories: Category[]
  members: Member[]
  isLoading: boolean
}) {
  const groups = new Map<string | null, Pot[]>()
  for (const c of categories) groups.set(c.id, [])
  groups.set(null, [])
  for (const p of pots) {
    const key = p.categoryId && groups.has(p.categoryId) ? p.categoryId : null
    groups.get(key)!.push(p)
  }

  const orderedCategoryIds = categories.map((c) => c.id)

  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Title order={4}>Pots</Title>
        {isLoading && (
          <Center>
            <Loader size="sm" />
          </Center>
        )}
        {!isLoading && pots.length === 0 && (
          <Text size="sm" c="dimmed">
            No pots yet — add one below.
          </Text>
        )}
        <Stack gap="md">
          {orderedCategoryIds.map((catId) => {
            const items = groups.get(catId) ?? []
            if (items.length === 0) return null
            const category = categories.find((c) => c.id === catId)
            return (
              <Stack key={catId} gap={4}>
                <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                  {category?.name}
                </Text>
                <Stack gap={2}>
                  {items.map((p) => (
                    <PotRow key={p.id} pot={p} members={members} categories={categories} />
                  ))}
                </Stack>
              </Stack>
            )
          })}
          {(groups.get(null) ?? []).length > 0 && (
            <Stack gap={4}>
              <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                Uncategorised
              </Text>
              <Stack gap={2}>
                {(groups.get(null) ?? []).map((p) => (
                  <PotRow key={p.id} pot={p} members={members} categories={categories} />
                ))}
              </Stack>
            </Stack>
          )}
        </Stack>
        <AddPotForm members={members} categories={categories} />
      </Stack>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// PotsPage
// ---------------------------------------------------------------------------

export function PotsPage() {
  const categoriesQuery = trpc.categories.list.useQuery()
  const potsQuery = trpc.pots.list.useQuery()
  const membersQuery = trpc.members.list.useQuery()

  const categories = categoriesQuery.data ?? []
  const pots = potsQuery.data ?? []
  const members = (membersQuery.data ?? []).filter((m) => m.archivedAt === null)

  return (
    <Stack gap="lg" maw={900} mx="auto" mt="xl">
      <Title order={2}>Pots &amp; Categories</Title>
      <CategoriesPanel categories={categories} isLoading={categoriesQuery.isLoading} />
      <PotsPanel
        pots={pots}
        categories={categories}
        members={members}
        isLoading={potsQuery.isLoading || membersQuery.isLoading}
      />
    </Stack>
  )
}
