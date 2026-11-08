// Minimal ComfyUI client plus the workflow for one view. ComfyUI must be running (COMFY_URL, default 127.0.0.1:8188).
export const COMFY_URL = process.env.COMFY_URL || 'http://127.0.0.1:8188';

async function call(route, init) {
  const res = await fetch(COMFY_URL + route, init);
  if (!res.ok) throw new Error(`ComfyUI ${route} -> HTTP ${res.status}: ${(await res.text()).slice(0, 600)}`);
  return res;
}

export async function upload(name, data) {
  const form = new FormData();
  form.append('image', new Blob([data], { type: 'image/png' }), name);
  form.append('overwrite', 'true');
  return (await (await call('/upload/image', { method: 'POST', body: form })).json()).name;
}

export async function run(workflow, { timeout = 20 * 60e3 } = {}) {
  const res = await fetch(COMFY_URL + '/prompt', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: 'views' }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`ComfyUI rejected the workflow: ${JSON.stringify(body.node_errors && Object.keys(body.node_errors).length ? body.node_errors : body.error).slice(0, 1200)}`);
  const id = body.prompt_id, t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const entry = (await (await call(`/history/${id}`)).json())[id];
    if (entry?.status?.status_str === 'error') {
      const err = entry.status.messages?.find((m) => m[0] === 'execution_error')?.[1];
      throw new Error(`ComfyUI failed in ${err?.node_type}: ${err?.exception_message?.trim() || 'unknown error'}`);
    }
    if (entry?.status?.completed) {
      const image = Object.values(entry.outputs).flatMap((o) => o.images || [])[0];
      if (!image) throw new Error('no image produced');
      const q = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder || '', type: image.type || 'output' });
      return Buffer.from(await (await call(`/view?${q}`)).arrayBuffer());
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('ComfyUI timed out');
}

export const CHECKPOINT = 'sd_xl_base_1.0.safetensors';
export const PIXEL_LORA = 'pixel-art-xl.safetensors';
export const CONTROLNET = 'controlnet-union-sdxl-1.0-promax.safetensors';
export const IPADAPTER = { model: 'ip-adapter-plus_sdxl_vit-h.safetensors', clipVision: 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors' };

// Text to image, steered by a depth map (soft), region prompts (masks) and a style reference.
//   regions: [{ text, mask }]  mask = name of an uploaded image (white = where it applies)
export function viewWorkflow({
  size, prompt, negative, regions = [], depth, styleRef, seed = 1, steps = 30, cfg = 6.5,
  lora = 1.0, depthStrength = 0.5, depthEnd = 0.55, styleWeight = 0.45, regionStrength = 1.0,
  sampler = 'dpmpp_2m', scheduler = 'karras',
}) {
  const g = {
    ckpt: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CHECKPOINT } },
    lora: { class_type: 'LoraLoader', inputs: { model: ['ckpt', 0], clip: ['ckpt', 1], lora_name: PIXEL_LORA, strength_model: lora, strength_clip: lora } },
  };
  let model = ['lora', 0];
  const clip = ['lora', 1];
  if (styleRef) {
    g.ipModel = { class_type: 'IPAdapterModelLoader', inputs: { ipadapter_file: IPADAPTER.model } };
    g.ipVision = { class_type: 'CLIPVisionLoader', inputs: { clip_name: IPADAPTER.clipVision } };
    g.ipRef = { class_type: 'LoadImage', inputs: { image: styleRef } };
    g.ip = {
      class_type: 'IPAdapterAdvanced',
      inputs: { model, ipadapter: ['ipModel', 0], clip_vision: ['ipVision', 0], image: ['ipRef', 0], weight: styleWeight, weight_type: 'style transfer', combine_embeds: 'concat', start_at: 0, end_at: 1, embeds_scaling: 'V only' },
    };
    model = ['ip', 0];
  }
  g.pos = { class_type: 'CLIPTextEncode', inputs: { clip, text: prompt } };
  g.neg = { class_type: 'CLIPTextEncode', inputs: { clip, text: negative } };
  let positive = ['pos', 0];
  regions.forEach((r, i) => {
    g[`rt${i}`] = { class_type: 'CLIPTextEncode', inputs: { clip, text: `${r.text}, ${prompt.split(',').slice(0, 3).join(',')}` } };
    g[`rm${i}`] = { class_type: 'LoadImageMask', inputs: { image: r.mask, channel: 'red' } };
    g[`rc${i}`] = { class_type: 'ConditioningSetMask', inputs: { conditioning: [`rt${i}`, 0], mask: [`rm${i}`, 0], strength: regionStrength, set_cond_area: 'default' } };
    g[`rj${i}`] = { class_type: 'ConditioningCombine', inputs: { conditioning_1: positive, conditioning_2: [`rc${i}`, 0] } };
    positive = [`rj${i}`, 0];
  });
  let negative_ = ['neg', 0];
  if (depth) {
    g.depth = { class_type: 'LoadImage', inputs: { image: depth } };
    g.cn = { class_type: 'ControlNetLoader', inputs: { control_net_name: CONTROLNET } };
    g.cnType = { class_type: 'SetUnionControlNetType', inputs: { control_net: ['cn', 0], type: 'depth' } };
    g.cnApply = {
      class_type: 'ControlNetApplyAdvanced',
      inputs: { positive, negative: negative_, control_net: ['cnType', 0], image: ['depth', 0], vae: ['ckpt', 2], strength: depthStrength, start_percent: 0, end_percent: depthEnd },
    };
    positive = ['cnApply', 0]; negative_ = ['cnApply', 1];
  }
  g.latent = { class_type: 'EmptyLatentImage', inputs: { width: size.w, height: size.h, batch_size: 1 } };
  g.sample = {
    class_type: 'KSampler',
    inputs: { model, positive, negative: negative_, latent_image: ['latent', 0], seed, steps, cfg, sampler_name: sampler, scheduler, denoise: 1 },
  };
  g.decode = { class_type: 'VAEDecodeTiled', inputs: { samples: ['sample', 0], vae: ['ckpt', 2], tile_size: 512, overlap: 64, temporal_size: 64, temporal_overlap: 8 } };
  g.out = { class_type: 'PreviewImage', inputs: { images: ['decode', 0] } };
  return g;
}
