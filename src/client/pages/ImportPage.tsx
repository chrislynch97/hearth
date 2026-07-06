import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Checkbox,
  FileButton,
  Group,
  Loader,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { trpc } from '../trpc'
import { formatMoney } from '../../shared/money'
import { useMoney, useFormatDate } from '../useMoney'
import type { PreviewRow } from '../../server/routers/imports'

const STATUS_COLOR: Record<string, string> = {
  new: 'moss',
  foreign: 'apricot',
  excluded: 'gray',
  duplicate: 'gray',
  error: 'red',
}

interface Decision {
  included: boolean
  potId: string | null
}

export function ImportPage() {
  const money = useMoney()
  const fmt = useFormatDate()
  const utils = trpc.useUtils()

  const membersQuery = trpc.members.list.useQuery()
  const potsQuery = trpc.pots.list.useQuery()
  const preview = trpc.imports.preview.useMutation()
  const commit = trpc.imports.commit.useMutation()

  const members = (membersQuery.data ?? []).filter((m) => m.archivedAt === null)
  const pots = potsQuery.data ?? []
  const potData = [
    { value: '', label: 'No pot (assign later)' },
    ...pots.map((p) => ({ value: p.id, label: p.name })),
  ]

  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [csvText, setCsvText] = useState('')
  const [filename, setFilename] = useState('')
  const [decisions, setDecisions] = useState<Record<number, Decision>>({})
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null)

  useEffect(() => {
    if (members.length > 0 && !ownerId) setOwnerId(members[0]!.id)
  }, [members, ownerId])

  const data = preview.data
  // Seed per-row decisions when a preview arrives: import new + foreign by default.
  useEffect(() => {
    if (!data) return
    const seed: Record<number, Decision> = {}
    for (const r of data.rows) {
      seed[r.index] = {
        included: r.status === 'new' || r.status === 'foreign',
        potId: r.suggestedPotId,
      }
    }
    setDecisions(seed)
  }, [data])

  async function handleFile(file: File | null) {
    if (!file) return
    setResult(null)
    setFilename(file.name)
    setCsvText(await file.text())
    preview.reset()
  }

  async function runPreview() {
    if (!ownerId || !csvText) return
    setResult(null)
    await preview.mutateAsync({ ownerId, csvText })
  }

  function setDecision(index: number, patch: Partial<Decision>) {
    setDecisions((prev) => ({ ...prev, [index]: { ...prev[index]!, ...patch } }))
  }

  const includedRows = useMemo(
    () => (data?.rows ?? []).filter((r) => decisions[r.index]?.included),
    [data, decisions],
  )

  async function runCommit() {
    if (!ownerId || !data) return
    const rows = includedRows.map((r) => ({
      importRef: r.importRef,
      date: r.date,
      description: r.description,
      amount: r.amount,
      potId: decisions[r.index]?.potId ?? null,
      note: r.note || null,
      raw: r.raw,
    }))
    const res = await commit.mutateAsync({
      ownerId,
      filename: filename || null,
      totalRows: data.summary.total,
      rows,
    })
    setResult({ imported: res.imported, skipped: res.skipped })
    preview.reset()
    setCsvText('')
    setFilename('')
    await Promise.all([
      utils.spends.list.invalidate(),
      utils.reconcile.backlog.invalidate(),
      utils.dashboard.summary.invalidate(),
    ])
  }

  return (
    <Stack gap="lg" maw={960} mx="auto">
      <Title order={2}>Import from Monzo</Title>
      <Text size="sm" c="dimmed">
        Export a statement from Monzo (Statements → Download as CSV) and drop it here. You'll review
        everything before anything is saved. One export is one person's account.
      </Text>

      <Card withBorder padding="md" radius="md">
        <Group align="flex-end" gap="md" wrap="wrap">
          <Select
            label="Whose account?"
            data={members.map((m) => ({ value: m.id, label: m.displayName }))}
            value={ownerId}
            onChange={setOwnerId}
            allowDeselect={false}
            w={200}
          />
          <FileButton onChange={(f) => void handleFile(f)} accept="text/csv,.csv">
            {(props) => (
              <Button variant="default" {...props}>
                {filename || 'Choose CSV file…'}
              </Button>
            )}
          </FileButton>
          <Button onClick={() => void runPreview()} disabled={!ownerId || !csvText} loading={preview.isPending}>
            Preview
          </Button>
        </Group>
        {preview.error && (
          <Alert color="red" title="Couldn't read that file" mt="sm">
            {preview.error.message}
          </Alert>
        )}
      </Card>

      {result && (
        <Alert color="moss" variant="light" title="Import complete">
          Imported {result.imported} transaction{result.imported === 1 ? '' : 's'}
          {result.skipped > 0 ? `, skipped ${result.skipped}` : ''}. They're on the Spending register,
          ready to reconcile.
        </Alert>
      )}

      {preview.isPending && (
        <Center>
          <Loader size="sm" />
        </Center>
      )}

      {data && (
        <>
          <Group gap="xs">
            <Badge color="moss" variant="light">
              {data.summary.new} new
            </Badge>
            <Badge color="apricot" variant="light">
              {data.summary.foreign} foreign
            </Badge>
            <Badge color="gray" variant="light">
              {data.summary.excluded} internal
            </Badge>
            <Badge color="gray" variant="light">
              {data.summary.duplicate} duplicate
            </Badge>
            {data.summary.error > 0 && (
              <Badge color="red" variant="light">
                {data.summary.error} error
              </Badge>
            )}
          </Group>

          <Card withBorder padding="md" radius="md">
            <Table.ScrollContainer minWidth={760}>
              <Table verticalSpacing="xs" horizontalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={40} />
                    <Table.Th style={{ whiteSpace: 'nowrap' }}>Date</Table.Th>
                    <Table.Th>Description</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Amount</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Pot</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.rows.map((r: PreviewRow) => {
                    const decision = decisions[r.index]
                    const importable = r.status === 'new' || r.status === 'foreign' || r.status === 'excluded'
                    return (
                      <Table.Tr key={r.index} style={{ opacity: decision?.included ? 1 : 0.55 }}>
                        <Table.Td>
                          <Checkbox
                            checked={decision?.included ?? false}
                            disabled={!importable}
                            onChange={(e) => setDecision(r.index, { included: e.currentTarget.checked })}
                            aria-label={`Include ${r.description}`}
                          />
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" style={{ whiteSpace: 'nowrap' }}>{r.date ? fmt(r.date) : '—'}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{r.description}</Text>
                          {r.error && (
                            <Text size="xs" c="red">
                              {r.error}
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          <Text size="sm" c={r.amount < 0 ? 'moss' : undefined}>
                            {r.amount < 0 ? '+' : ''}
                            {formatMoney(Math.abs(r.amount), money)}
                          </Text>
                          {r.foreign && (
                            <Text size="xs" c="dimmed">
                              {r.currency}
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Badge size="sm" variant="light" color={STATUS_COLOR[r.status]}>
                            {r.status === 'excluded' ? 'internal' : r.status}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          {importable ? (
                            <Select
                              size="xs"
                              w={170}
                              data={potData}
                              value={decision?.potId ?? ''}
                              onChange={(v) => setDecision(r.index, { potId: v || null })}
                              disabled={!decision?.included}
                            />
                          ) : (
                            <Text size="xs" c="dimmed">
                              —
                            </Text>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    )
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>

          {commit.error && (
            <Alert color="red" title="Import failed">
              {commit.error.message}
            </Alert>
          )}

          <Group justify="flex-end">
            <Text size="sm" c="dimmed">
              {includedRows.length} selected
            </Text>
            <Button
              onClick={() => void runCommit()}
              disabled={includedRows.length === 0}
              loading={commit.isPending}
            >
              Import {includedRows.length} transaction{includedRows.length === 1 ? '' : 's'}
            </Button>
          </Group>
        </>
      )}
    </Stack>
  )
}
