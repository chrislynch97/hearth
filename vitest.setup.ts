import '@testing-library/jest-dom/vitest'

// jsdom implements neither ResizeObserver nor IntersectionObserver; Radix parts
// construct them on mount.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, 'ResizeObserver', { writable: true, value: NoopObserver })
Object.defineProperty(window, 'IntersectionObserver', { writable: true, value: NoopObserver })

// jsdom does not implement window.matchMedia; `useColorScheme` and `useMediaQuery` need it.
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
