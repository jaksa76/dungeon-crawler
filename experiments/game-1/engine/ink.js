import * as THREE from 'three';

// Hand-drawn ink outlines traced from a height map.
//
// The outline is the contour where height == `level` (the foot of each stone's
// bevel). Its width is measured in *screen* pixels via fwidth(), so it reads as a
// pen stroke of constant thickness at any distance, rather than a texture detail
// that grows up close and turns to noise far away. Where the stones become too
// small on screen to outline cleanly, the lines fade out.
//
// The gaps below the contour are also darkened.
//
// Works on any material that has a bumpMap (the height map).

export function addInkLines(material, {
  color = '#140a10',
  strength = 0.95,
  level = 0.3,      // height of the contour (0 = mortar, 1 = stone top): on the rim, inside the painted mortar
  width = 1.1,      // half-width in screen pixels
  fadeNear = 10,    // texels per screen pixel where lines start to fade...
  fadeFar = 24,     // ...and where they are gone
  gap = 0.7,        // how much to darken the gaps below the contour (0 = not at all, 1 = black)
} = {}) {
  const uniforms = {
    uInkColor: { value: new THREE.Color(color) },
    uInkStrength: { value: strength },
    uInkLevel: { value: level },
    uInkWidth: { value: width },
    uInkFade: { value: new THREE.Vector2(fadeNear, fadeFar) },
    uInkGap: { value: gap },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uInkColor;
        uniform float uInkStrength, uInkLevel, uInkWidth, uInkGap;
        uniform vec2 uInkFade;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float h = texture2D(bumpMap, vBumpMapUv).r;
          // Darken the gaps between stones (below the contour).
          diffuseColor.rgb *= 1.0 - uInkGap * (1.0 - smoothstep(0.0, uInkLevel, h));
          float fw = max(fwidth(h), 1e-4);
          float ink = 1.0 - smoothstep(0.0, fw * uInkWidth * 2.0, abs(h - uInkLevel));
          vec2 texelsPerPixel = fwidth(vBumpMapUv * vec2(textureSize(bumpMap, 0)));
          ink *= 1.0 - smoothstep(uInkFade.x, uInkFade.y, max(texelsPerPixel.x, texelsPerPixel.y));
          diffuseColor.rgb = mix(diffuseColor.rgb, uInkColor, ink * uInkStrength);
        }`);
  };
  material.customProgramCacheKey = () => 'ink';
  return uniforms;
}
