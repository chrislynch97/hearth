import '@testing-library/jest-dom/vitest'

// jsdom implements neither ResizeObserver nor IntersectionObserver; several
// Mantine components (ScrollArea, Select's dropdown) construct one on mount.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, 'ResizeObserver', { writable: true, value: NoopObserver })
Object.defineProperty(window, 'IntersectionObserver', { writable: true, value: NoopObserver })

// jsdom does not implement window.matchMedia; Mantine's MantineProvider requires it.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})
