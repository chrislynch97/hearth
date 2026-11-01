// Web Push only. There's deliberately no fetch handler: caching here risks showing
// a household stale budget figures, and notifications don't need it.

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
      // Full bleed: the other icons have light corners painted in, and Android shows them.
      icon: '/icons/icon-maskable-512.png',
      data: { url: message.url },
    }),
  )
})

const sameOriginPath = (url) => {
  try {
    const target = new URL(url, self.location.origin)
    return target.origin === self.location.origin ? target.pathname + target.search + target.hash : '/'
  } catch {
    return '/'
  }
}

// An open window goes through its own router: a real navigation would reload the
// page out from under whatever someone was typing.
const open = async (url) => {
  const [client] = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  if (!client) return self.clients.openWindow(url)

  await client.focus()
  client.postMessage({ type: 'hearth:open', url })
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(open(sameOriginPath(event.notification.data?.url ?? '/')))
})
