// Pages cannot erase the browser's entire HTTP cache. Refresh this game's loaded
// resources with cache:'reload' before navigating to a unique document URL.
export async function reloadFresh() {
  const root = new URL('../', import.meta.url);
  const belongsToGame = value => {
    const url = new URL(value, location.href);
    return url.origin === root.origin && url.pathname.startsWith(root.pathname);
  };
  const resources = [...new Set(performance.getEntriesByType('resource')
    .map(entry => entry.name).filter(belongsToGame))];

  // Clear persistent application caches, including a future offline version.
  // Storage or worker access can be unavailable in private browsing.
  if ('serviceWorker' in navigator) {
    await navigator.serviceWorker.getRegistrations().then(registrations =>
      Promise.allSettled(registrations.filter(worker => belongsToGame(worker.scope))
        .map(worker => worker.unregister()))).catch(() => {});
  }
  if ('caches' in window) {
    await caches.keys().then(names => Promise.allSettled(names.map(async name => {
      const cache = await caches.open(name);
      const requests = await cache.keys();
      await Promise.all(requests.filter(request => belongsToGame(request.url))
        .map(request => cache.delete(request)));
      if (!(await cache.keys()).length) await caches.delete(name);
    }))).catch(() => {});
  }

  // Bound parallel requests so hundreds of scene images don't flood the server.
  let next = 0;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  await Promise.all(Array.from({ length: Math.min(6, resources.length) }, async () => {
    while (next < resources.length && !controller.signal.aborted) {
      const url = resources[next++];
      try {
        const response = await fetch(url, { cache: 'reload', signal: controller.signal });
        await response.arrayBuffer();
      } catch { /* A failed refresh must not prevent the page from reloading. */ }
    }
  }));
  clearTimeout(timeout);

  const url = new URL(location.href);
  url.searchParams.set('_reload', Date.now().toString());
  location.replace(url.href);
}
