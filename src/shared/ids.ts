import { v7 as uuidv7 } from 'uuid'

/** Sortable UUIDv7 primary key. */
export const newId = (): string => uuidv7()
