// Minimal ComfyUI HTTP client (no dependencies). See docs/local-image-generation.md.
//
//   const png = await generate(img2img({ guide: 'guide.png', prompt: '...' }), { files: { 'guide.png': buffer } });
//
// ComfyUI must already be running (default http://127.0.0.1:8188, or set COMFY_URL).
export const COMFY_URL = process.env.COMFY_URL || 'http://127.0.0.1:8188';

async function call(route, init) {
  const res = await fetch(COMFY_URL + route, init);
  if (!res.ok) throw new Error(`ComfyUI ${route} -> HTTP ${res.status}: ${(await res.text()).slice(0, 600)}`);
  return res;
}

// Put an image in ComfyUI's input folder so a LoadImage node can use it. Returns its name there.
export async function upload(name, data) {
  const form = new FormData();
  form.append('image', new Blob([data], { type: 'image/png' }), name);
  form.append('overwrite', 'true');
  return (await (await call('/upload/image', { method: 'POST', body: form })).json()).name;
}

// Queue an API-format workflow. Returns the prompt id.
export async function queue(workflow, clientId = 'dungeon-crawler') {
  const res = await fetch(COMFY_URL + '/prompt', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`ComfyUI rejected the workflow: ${JSON.stringify(body.node_errors && Object.keys(body.node_errors).length ? body.node_errors : body.error).slice(0, 800)}`);
  return body.prompt_id;
}

// Poll /history until the prompt finishes. Returns its outputs ({ nodeId: { images: [...] } }).
export async function waitFor(id, { timeout = 15 * 60e3, interval = 1000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const entry = (await (await call(`/history/${id}`)).json())[id];
    if (entry?.status?.status_str === 'error') {
      const err = entry.status.messages?.find((m) => m[0] === 'execution_error')?.[1];
      throw new Error(`ComfyUI failed in ${err?.node_type}: ${err?.exception_message?.trim() || 'unknown error'}`);
    }
    if (entry?.status?.completed) return entry.outputs;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`ComfyUI did not finish within ${timeout / 1000}s`);
}

export async function view({ filename, subfolder = '', type = 'output' }) {
  const q = new URLSearchParams({ filename, subfolder, type });
  return Buffer.from(await (await call(`/view?${q}`)).arrayBuffer());
}

// Upload `files` ({ name: Buffer }), run the workflow, return the first image any node produced (a PNG Buffer).
export async function generate(workflow, { files = {}, onQueued } = {}) {
  for (const [name, data] of Object.entries(files)) await upload(name, data);
  const id = await queue(workflow);
  onQueued?.(id);
  const outputs = await waitFor(id);
  const image = Object.values(outputs).flatMap((o) => o.images || [])[0];
  if (!image) throw new Error('ComfyUI finished without producing an image');
  return view(image);
}
