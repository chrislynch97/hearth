import type { DB } from '../db/client'
import { db } from '../db/client'

export interface Context {
  db: DB
}

export function createContext(): Context {
  return { db }
}
