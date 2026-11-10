// Render HUD art at a small logical resolution, then let CSS enlarge its pixels.
// Controls remain native buttons at their full touch-target size.
export function pixelSkin(root) {
  const frame = new Image();
  const ready = new Promise((resolve, reject) => {
    frame.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      c.getContext('2d').drawImage(frame, 0, 0, 64, 64);
      document.documentElement.style.setProperty('--rpg-panel', `url("${c.toDataURL()}")`);
      resolve();
    };
    frame.onerror = () => reject(new Error('Could not load the HUD panel artwork.'));
  });
  frame.src = new URL('./assets/panel-stone.png', import.meta.url).href;

  function rasterize(svg) {
    if (svg.dataset.rasterizing) return;
    svg.dataset.rasterizing = 'true';
    const source = svg.cloneNode(true);
    source.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    source.setAttribute('width', '12'); source.setAttribute('height', '12');
    source.style.transform = ''; source.style.color = '#efd7aa';
    source.setAttribute('fill', '#efd7aa');
    const image = new Image();
    image.onload = () => {
      const c = document.createElement('canvas'); c.className = 'rpg-control-icon';
      c.width = c.height = 12; c.style.transform = svg.style.transform;
      c.setAttribute('aria-hidden', 'true');
      const g = c.getContext('2d'); g.drawImage(image, 0, 0, 12, 12);
      const pixels = g.getImageData(0, 0, 12, 12);
      for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = pixels.data[i] >= 128 ? 255 : 0;
      g.putImageData(pixels, 0, 0); svg.replaceWith(c);
    };
    image.src = `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(source))}`;
  }
  // Touch controls move between the rails and bottom pad on rotation. Fullscreen
  // also replaces its icon when toggled, so rasterize new SVGs as they arrive.
  const observer = new MutationObserver(() => root.querySelectorAll('svg').forEach(rasterize));
  observer.observe(root, { childList: true, subtree: true });
  root.querySelectorAll('svg').forEach(rasterize);
  return ready;
}
