// ComfyUI workflows in API format (the JSON that POST /prompt takes).

export const CHECKPOINT = 'sd_xl_base_1.0.safetensors';
export const PIXEL_LORA = 'pixel-art-xl.safetensors';
// SDXL union ControlNet (xinsir, promax) and IP-Adapter Plus with its CLIP-ViT-H image encoder.
export const CONTROLNET = 'controlnet-union-sdxl-1.0-promax.safetensors';
export const IPADAPTER = { model: 'ip-adapter-plus_sdxl_vit-h.safetensors', clipVision: 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors' };
// Flux dev, 4-bit GGUF (needs the ComfyUI-GGUF custom node), with its text encoders and VAE.
export const FLUX = { unet: 'flux1-dev-Q4_K_S.gguf', t5: 't5xxl_fp8_e4m3fn.safetensors', clipL: 'clip_l.safetensors', vae: 'ae.safetensors' };

const hex = (s) => parseInt(s.replace('#', ''), 16);

// Stamp the flat colours of the guide that must not change back over `image`, so a keyed
// background stays exactly keyed: each colour ('#ff00ff') marks the guide pixels having that
// exact colour. Returns the output reference of the last stamp.
function stamp(g, image, guide, size, keep) {
  let result = image;
  keep.forEach((colour, i) => {
    g[`mask${i}`] = { class_type: 'ImageColorToMask', inputs: { image: guide, color: hex(colour) } };
    g[`flat${i}`] = { class_type: 'EmptyImage', inputs: { width: size.w, height: size.h, batch_size: 1, color: hex(colour) } };
    g[`stamp${i}`] = {
      class_type: 'ImageCompositeMasked',
      inputs: { destination: result, source: [`flat${i}`, 0], x: 0, y: 0, resize_source: false, mask: [`mask${i}`, 0] },
    };
    result = [`stamp${i}`, 0];
  });
  return result;
}

// Blur `image` by radius `r` (0 = leave it). Returns the output reference to use instead.
function blurred(g, image, r) {
  if (!r) return image;
  g.initBlur = { class_type: 'ImageBlur', inputs: { image, blur_radius: r, sigma: Math.min(10, r / 2) } }; // the node caps sigma at 10
  return ['initBlur', 0];
}

// SDXL image-to-image over a guide sheet: encode the guide, resample it at `denoise`
// (0 = unchanged, 1 = ignore the guide), decode, then stamp the `keep` colours back.
//
//   guide     name of an image already uploaded to ComfyUI (see client.upload)
//   size      { w, h } of the guide
//   lora      strength of the pixel-art LoRA, or 0/null for none
//
// Two optional add-ons let a high `denoise` keep the layout and the look (both off by default;
// without them the graph is the plain one above). With either on, the VAE runs tiled so a
// 1536x1024 sheet fits in 8 GB.
//
//   controlnet  { strength, start, end, low, high, blur, type, image }: the guide's edges (canny,
//               after an optional blur of radius `blur` to drop pixel noise) steer the sampler
//               through the SDXL union ControlNet, so the outlines survive. With `image` (an
//               uploaded name) that picture is the control image instead, e.g. a depth ramp with
//               type 'depth'. Core nodes only.
//   ipadapter   { ref, weight, start, end, weightType }: the image `ref` (uploaded to ComfyUI)
//               sets the style via IP-Adapter Plus (needs the ComfyUI_IPAdapter_plus node).
//   initBlur    blur radius applied to the guide before it is encoded, so only its coarse layout
//               (where things are, light and dark) is kept and none of its texture. Use with a
//               high `denoise` to paint a picture whose composition comes from the guide.
export function img2img({ guide, size, prompt, negative = '', seed = 1, denoise = 0.55, steps = 30, cfg = 6.5,
  lora = 0, checkpoint = CHECKPOINT, sampler = 'dpmpp_2m', scheduler = 'karras', keep = ['#ff00ff', '#202020'],
  controlnet = null, ipadapter = null, initBlur = 0, tiled = !!(controlnet || ipadapter) }) {
  const g = {
    ckpt: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: checkpoint } },
    guide: { class_type: 'LoadImage', inputs: { image: guide } },
  };
  let model = ['ckpt', 0], clip = ['ckpt', 1];
  if (lora) {
    g.lora = { class_type: 'LoraLoader', inputs: { model, clip, lora_name: PIXEL_LORA, strength_model: lora, strength_clip: lora } };
    model = ['lora', 0]; clip = ['lora', 1];
  }
  if (ipadapter) {
    g.ipModel = { class_type: 'IPAdapterModelLoader', inputs: { ipadapter_file: IPADAPTER.model } };
    g.ipVision = { class_type: 'CLIPVisionLoader', inputs: { clip_name: IPADAPTER.clipVision } };
    g.ipRef = { class_type: 'LoadImage', inputs: { image: ipadapter.ref } };
    g.ip = {
      class_type: 'IPAdapterAdvanced',
      inputs: {
        model, ipadapter: ['ipModel', 0], clip_vision: ['ipVision', 0], image: ['ipRef', 0], weight: ipadapter.weight ?? 0.6,
        weight_type: ipadapter.weightType ?? 'style transfer', combine_embeds: 'concat', start_at: ipadapter.start ?? 0, end_at: ipadapter.end ?? 1,
        embeds_scaling: 'V only',
      },
    };
    model = ['ip', 0];
  }
  g.pos = { class_type: 'CLIPTextEncode', inputs: { clip, text: prompt } };
  g.neg = { class_type: 'CLIPTextEncode', inputs: { clip, text: negative } };
  let positive = ['pos', 0], negative_ = ['neg', 0];
  if (controlnet) {
    let control;
    if (controlnet.image) {
      g.ctrl = { class_type: 'LoadImage', inputs: { image: controlnet.image } };
      control = ['ctrl', 0];
    } else {
      let edges = ['guide', 0];
      if (controlnet.blur) {
        g.blur = { class_type: 'ImageBlur', inputs: { image: edges, blur_radius: controlnet.blur, sigma: controlnet.sigma ?? Math.min(10, controlnet.blur / 2) } };
        edges = ['blur', 0];
      }
      g.edges = { class_type: 'Canny', inputs: { image: edges, low_threshold: controlnet.low ?? 0.3, high_threshold: controlnet.high ?? 0.6 } };
      control = ['edges', 0];
    }
    g.cn ={ class_type: 'ControlNetLoader', inputs: { control_net_name: CONTROLNET } };
    g.cnType = { class_type: 'SetUnionControlNetType', inputs: { control_net: ['cn', 0], type: controlnet.type ?? 'canny/lineart/anime_lineart/mlsd' } };
    g.cnApply = {
      class_type: 'ControlNetApplyAdvanced',
      inputs: {
        positive, negative: negative_, control_net: ['cnType', 0], image: control, vae: ['ckpt', 2],
        strength: controlnet.strength ?? 0.8, start_percent: controlnet.start ?? 0, end_percent: controlnet.end ?? 1,
      },
    };
    positive = ['cnApply', 0]; negative_ = ['cnApply', 1];
  }
  const tiles = { tile_size: 512, overlap: 64, temporal_size: 64, temporal_overlap: 8 };
  const init = blurred(g, ['guide', 0], initBlur);
  g.latent = tiled
    ? { class_type: 'VAEEncodeTiled', inputs: { pixels: init, vae: ['ckpt', 2], ...tiles } }
    : { class_type: 'VAEEncode', inputs: { pixels: init, vae: ['ckpt', 2] } };
  g.sample = {
    class_type: 'KSampler',
    inputs: { model, positive, negative: negative_, latent_image: ['latent', 0], seed, steps, cfg, sampler_name: sampler, scheduler, denoise },
  };
  g.decode = tiled
    ? { class_type: 'VAEDecodeTiled', inputs: { samples: ['sample', 0], vae: ['ckpt', 2], ...tiles } }
    : { class_type: 'VAEDecode', inputs: { samples: ['sample', 0], vae: ['ckpt', 2] } };
  g.out = { class_type: 'PreviewImage', inputs: { images: stamp(g, ['decode', 0], ['guide', 0], size, keep) } };
  return g;
}

// Flux image-to-image, same idea. Flux has no negative prompt and uses a guidance value
// instead of cfg (the sampler runs at cfg 1), and it needs a higher `denoise` than SDXL for
// the same amount of change. The VAE is tiled to fit a 1536x1024 sheet in 8 GB.
// A `unet` that ends in .gguf is loaded with the ComfyUI-GGUF node.
export function fluxImg2img({ guide, size, prompt, seed = 1, denoise = 0.7, steps = 28, guidance = 3.5,
  unet = FLUX.unet, sampler = 'euler', scheduler = 'simple', keep = ['#ff00ff', '#202020'], initBlur = 0 }) {
  const tiles = { tile_size: 512, overlap: 64, temporal_size: 64, temporal_overlap: 8 };
  const g = {
    unet: unet.endsWith('.gguf')
      ? { class_type: 'UnetLoaderGGUF', inputs: { unet_name: unet } }
      : { class_type: 'UNETLoader', inputs: { unet_name: unet, weight_dtype: 'default' } },
    clip: { class_type: 'DualCLIPLoader', inputs: { clip_name1: FLUX.t5, clip_name2: FLUX.clipL, type: 'flux', device: 'default' } },
    vae: { class_type: 'VAELoader', inputs: { vae_name: FLUX.vae } },
    guide: { class_type: 'LoadImage', inputs: { image: guide } },
    text: { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: prompt } },
  };
  g.pos = { class_type: 'FluxGuidance', inputs: { conditioning: ['text', 0], guidance } };
  g.neg = { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['text', 0] } };
  g.latent = { class_type: 'VAEEncodeTiled', inputs: { pixels: blurred(g, ['guide', 0], initBlur), vae: ['vae', 0], ...tiles } };
  g.sample = {
    class_type: 'KSampler',
    inputs: { model: ['unet', 0], positive: ['pos', 0], negative: ['neg', 0], latent_image: ['latent', 0], seed, steps, cfg: 1, sampler_name: sampler, scheduler, denoise },
  };
  g.decode = { class_type: 'VAEDecodeTiled', inputs: { samples: ['sample', 0], vae: ['vae', 0], ...tiles } };
  g.out = { class_type: 'PreviewImage', inputs: { images: stamp(g, ['decode', 0], ['guide', 0], size, keep) } };
  return g;
}
