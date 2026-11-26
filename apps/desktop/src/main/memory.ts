import type { Contact } from '@kaizer/core'
import { dataPath, readJson, writeJson } from './store'

export const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9@ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// ---- Memoria clave-valor ----
const memFile = (): string => dataPath('memory.json')

export function remember(key: string, value: string): void {
  const mem = readJson<Record<string, string>>(memFile(), {})
  mem[key.trim()] = value
  writeJson(memFile(), mem)
}

export function recall(query: string): { key: string; value: string }[] {
  const mem = readJson<Record<string, string>>(memFile(), {})
  const q = normalize(query)
  return Object.entries(mem)
    .filter(([k, v]) => normalize(k).includes(q) || normalize(v).includes(q))
    .map(([key, value]) => ({ key, value }))
}

export function getMemory(key: string): string | undefined {
  const mem = readJson<Record<string, string>>(memFile(), {})
  const n = normalize(key)
  const hit = Object.keys(mem).find((k) => normalize(k) === n)
  return hit ? mem[hit] : undefined
}

// ---- Contactos ----
const contactsFile = (): string => dataPath('contacts.json')

export function listContacts(): Contact[] {
  return readJson<Contact[]>(contactsFile(), [])
}

export function saveContact(c: Contact): Contact[] {
  const list = listContacts()
  const n = normalize(c.name)
  const clean: Contact = {
    name: c.name.trim(),
    phone: c.phone.trim(),
    aliases: c.aliases.map((a) => a.trim()).filter(Boolean)
  }
  const i = list.findIndex((x) => normalize(x.name) === n)
  if (i >= 0) list[i] = clean
  else list.push(clean)
  writeJson(contactsFile(), list)
  return list
}

/** Agrega o actualiza el teléfono conservando los alias existentes. */
export function addContactQuick(name: string, phone: string): Contact[] {
  const n = normalize(name)
  const prev = listContacts().find((x) => normalize(x.name) === n)
  return saveContact({ name, phone, aliases: prev?.aliases ?? [] })
}

export function removeContact(name: string): Contact[] {
  const n = normalize(name)
  const list = listContacts().filter((x) => normalize(x.name) !== n)
  writeJson(contactsFile(), list)
  return list
}

/** Resuelve nombre o alias a un contacto; si ya es un número, lo devuelve como tal. */
export function resolveContact(query: string): { name: string; phone: string } | null {
  const digits = query.replace(/[^\d]/g, '')
  if (digits.length >= 8 && /^[+\d\s()-]+$/.test(query)) return { name: query, phone: digits }
  const q = normalize(query)
  if (!q) return null
  const list = listContacts()
  const hit =
    list.find((c) => normalize(c.name) === q || c.aliases.some((a) => normalize(a) === q)) ??
    list.find((c) => normalize(c.name).includes(q) || c.aliases.some((a) => normalize(a).includes(q)))
  return hit ? { name: hit.name, phone: hit.phone } : null
}
