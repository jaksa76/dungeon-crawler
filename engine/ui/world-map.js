export function renderWorldMap(map, travel) {
  const canvas = document.createElement('div');
  canvas.className = 'rpg-world-map';
  const image = document.createElement('img');
  image.src = map.image;
  image.alt = '';
  canvas.append(image);
  const status = document.createElement('p');
  status.className = 'rpg-map-error';
  status.setAttribute('role', 'status');
  status.hidden = true;
  status.textContent = 'The route could not be opened. Try again.';

  const markers = [];
  let travelling = false;
  for (const { id, name, x, y, here } of map.locations) {
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'rpg-map-marker';
    marker.textContent = name;
    marker.style.left = `${x}%`;
    marker.style.top = `${y}%`;
    marker.disabled = here;
    if (here) {
      marker.setAttribute('aria-current', 'location');
      marker.setAttribute('aria-label', `${name}, current location`);
    }
    marker.addEventListener('click', async () => {
      if (travelling) return;
      travelling = true;
      status.hidden = true;
      for (const { button } of markers) button.disabled = true;
      try { status.hidden = await travel(id); }
      finally {
        travelling = false;
        for (const { button, current } of markers) button.disabled = current;
        if (!status.hidden) marker.focus();
      }
    });
    markers.push({ button: marker, current: here });
    canvas.append(marker);
  }
  canvas.append(status);
  return canvas;
}
