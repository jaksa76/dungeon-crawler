# Local image generation (ComfyUI + SDXL)

Asset generation can run locally on the dev machine (NVIDIA RTX 4060, 8 GB VRAM)
instead of through ChatGPT. This is what the depth/edge-conditioned painting in
[visual-direction-plan.md](visual-direction-plan.md) (option 5) needs: ChatGPT can't
take ControlNet or inpainting input, ComfyUI can.

Nothing here lives in the repo. The tools and the ~7 GB of models are installed
outside it, so they stay out of git.

## What is installed

| What | Where |
|---|---|
| comfy-cli 1.25.0 (own venv) | `C:\Users\Jaksa\comfy\cli-venv` |
| ComfyUI + ComfyUI-Manager (own `.venv`, PyTorch 2.14.1+cu130) | `C:\Users\Jaksa\comfy\ComfyUI` |
| Checkpoint: SDXL base 1.0 (6.6 GB) | `ComfyUI\models\checkpoints\sd_xl_base_1.0.safetensors` |
| LoRA: `nerijs/pixel-art-xl` (163 MB) | `ComfyUI\models\loras\pixel-art-xl.safetensors` |

Both models come from Hugging Face. Outputs are written to `ComfyUI\output\`.

## Running it

```
C:\Users\Jaksa\comfy\cli-venv\Scripts\comfy.exe --workspace=C:\Users\Jaksa\comfy\ComfyUI launch
```

or directly:

```
cd C:\Users\Jaksa\comfy\ComfyUI
.\.venv\Scripts\python.exe main.py --listen 127.0.0.1 --port 8188
```

The web UI is at http://127.0.0.1:8188. Add `-- --lowvram` (comfy-cli) or `--lowvram`
(direct) if a larger model runs out of memory; plain SDXL at 1024×1024 does not need it.

## Driving it from scripts

ComfyUI has an HTTP API: `POST /prompt` with a workflow in API format, then poll
`GET /history/<prompt_id>` until it appears. Scripts are preferred over an MCP
server — they are re-runnable and can be committed. (An MCP wrapper would still need
the same workflow JSON, so it saves little.)

## First test

Prompt: the cobblestone texture from [art-prompts.md](art-prompts.md) prefixed with
"pixel art, hi-bit pixel art", with the pixel-art LoRA at strength 1.0, SDXL base,
1024×1024, 25 steps, Euler, CFG 7, and a negative prompt of
"3d render, photo, realistic, blurry, smooth gradients, text, watermark, dramatic
lighting, shadows, perspective".

Result:

- Runs in **~22 s** on the 8 GB card with default memory settings.
- Looks right for the style: chunky pixels, muted grey-purple palette, flat lighting,
  small moss patches.
- Not right for the content: it produced a rectangular **brick wall**, not irregular
  rounded cobblestones.
- **Tiling was not checked.**

## Known gaps and next steps

| Need | Approach |
|---|---|
| Seamless textures | A seamless-tile node or circular padding in the sampler; verify by tiling 2×2. |
| Correct shapes (cobblestones) | Prompt tuning, or img2img / ControlNet from a rough layout. |
| Transparent sprites | Generate on a flat background, then remove it (rembg or a ComfyUI node). |
| Consistent style across assets | IP-Adapter with `concept-toonish.png`, or a fixed prompt preamble + seed discipline. |
| Depth/edge-conditioned painting (option 5) | SDXL depth and canny ControlNets; not installed yet. |
| Better quality / larger models | Flux GGUF Q4 (~7 GB) fits tightly and is slower; needs the ComfyUI-GGUF node. |

Planned: a reusable `tools/gen_texture.py` taking prompt, seed and size as arguments.
