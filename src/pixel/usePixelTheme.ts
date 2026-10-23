import { useSyncExternalStore } from 'react'

function currentTheme() {
  if (typeof document === 'undefined') return false
  const explicit = document.documentElement.dataset.theme
  return explicit ? explicit === 'dark' : document.documentElement.classList.contains('dark')
}

function subscribeTheme(callback: () => void) {
  const observer = new MutationObserver(callback)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
  return () => observer.disconnect()
}

const noSubscription = () => () => {}
const lightServerTheme = () => false

export function usePixelTheme(explicit?: boolean) {
  const theme = useSyncExternalStore(explicit === undefined ? subscribeTheme : noSubscription, currentTheme, lightServerTheme)
  return explicit ?? theme
}
