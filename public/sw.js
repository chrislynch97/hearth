// Web Push only. There's deliberately no fetch handler: caching here risks showing
// a household stale budget figures, and notifications don't need it.

// Without this an already-open page stays uncontrolled, and a tap can't navigate it.
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Always show something: Safari revokes permission after a silent push.
self.addEventListener('push', (event) => {
  let message = {}
  try {
    message = event.data?.json() ?? {}
  } catch {
    // An unreadable payload still has to show, per the above.
  }

  event.waitUntil(
    self.registration.showNotification(message.title || 'Hearth', {
      body: message.body,
      icon: '/icons/icon-192.png',
      data: { url: message.url },
    }),
  )
})

const sameOriginPath = (url) => {
  try {
    const target = new URL(url, self.location.origin)
    return target.origin === self.location.origin ? target.href : '/'
  } catch {
    return '/'
  }
}

const open = async (url) => {
  const [client] = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  if (!client) return self.clients.openWindow(url)

  await client.focus()
  return client.navigate(url).catch(() => self.clients.openWindow(url))
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(open(sameOriginPath(event.notification.data?.url ?? '/')))
})
