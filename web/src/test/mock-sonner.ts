import { vi } from 'vitest'

/**
 * A `sonner` module for `vi.mock('sonner', async () => (await import('@/test/mock-sonner')).sonnerModuleMock())`:
 * `toast` is callable (the plain `toast('…', options)` form) and carries the typed variants and `dismiss`.
 */
export function sonnerModuleMock() {
  const toast = Object.assign(vi.fn(), {
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
  })
  return { toast }
}
