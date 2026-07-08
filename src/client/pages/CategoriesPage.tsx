import { useState } from 'react'
import {
  ActionIcon,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { trpc } from '../trpc'
import type { Category } from '../../server/db/schema'

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
              <ActionIcon variant="subtle" size="sm" aria-label={`Rename ${category.name}`} onClick={() => setEditing(true)}>
                ✎
              </ActionIcon>
              <ActionIcon variant="subtle" color="red" size="sm" aria-label={`Archive ${category.name}`} onClick={() => setConfirmArchive(true)}>
                ×
              </ActionIcon>
            </Group>
          </>
        )}
      </Group>
      <Modal opened={confirmArchive} onClose={() => setConfirmArchive(false)} title="Archive category?" size="sm">
        <Stack gap="md">
          <Text size="sm">
            Archive <strong>{category.name}</strong>? Pots in this category will become uncategorised.
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

function CategoryFormModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const utils = trpc.useUtils()
  const create = trpc.categories.create.useMutation()
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  async function handleAdd() {
    const trimmed = name.trim()
    if (!trimmed) return setError('Please enter a name.')
    setError('')
    await create.mutateAsync({ name: trimmed })
    await utils.categories.list.invalidate()
    onClose()
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Add category" size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleAdd()
        }}
      >
        <Stack gap="sm">
          <TextInput
            label="Name"
            placeholder="e.g. Household"
            value={name}
            onChange={(e) => {
              setName(e.currentTarget.value)
              setError('')
            }}
            error={error || (create.error?.message ?? undefined)}
            autoFocus
          />
          <Group justify="flex-end">
            <Button type="button" variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Add category
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}

export function CategoriesPage() {
  const categoriesQuery = trpc.categories.list.useQuery()
  const categories = categoriesQuery.data ?? []
  const [formOpened, setFormOpened] = useState(false)

  return (
    <Stack gap="lg" maw={700} mx="auto">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Title order={2}>Categories</Title>
          <Text size="sm" c="dimmed">
            Categories group your pots and bills across the household (e.g. Housing, Food, Subscriptions).
          </Text>
        </div>
        <Button onClick={() => setFormOpened(true)} style={{ flexShrink: 0 }}>
          Add category
        </Button>
      </Group>
      <Card withBorder padding="md">
        <Stack gap="sm">
          {categoriesQuery.isLoading && (
            <Center>
              <Loader size="sm" />
            </Center>
          )}
          {!categoriesQuery.isLoading && categories.length === 0 && (
            <Text size="sm" c="dimmed">
              No categories yet — add one to get started.
            </Text>
          )}
          <Stack gap={2}>
            {categories.map((c) => (
              <CategoryRow key={c.id} category={c} />
            ))}
          </Stack>
        </Stack>
      </Card>
      {formOpened && <CategoryFormModal opened={formOpened} onClose={() => setFormOpened(false)} />}
    </Stack>
  )
}
