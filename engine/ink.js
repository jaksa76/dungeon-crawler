import * as THREE from 'three';

// Hand-drawn ink outlines traced from a height map.
//
// The outline is the contour where height == `level` (the foot of each stone's
// bevel). Its width is measured in *screen* pixels via fwidth(), so it reads as a
// pen stroke of constant thickness at any distance, rather than a texture detail
// that grows up close and turns to noise far away. Where the stones become too
// small on screen to outline cleanly, the lines fade out.
//
// Works on any material that has a bumpMap (the height map).

export function addInkLines(material, {
  color = '#140a10',
  strength = 0.85,
  level = 0.3,      // height of the contour (0 = mortar, 1 = stone top): on the rim, inside the painted mortar
  width = 0.6,      // half-width in screen pixels
  fadeNear = 14,    // texels per screen pixel where lines start to fade...
  fadeFar = 30,     // ...and where they are gone
} = {}) {
  const uniforms = {
    uInkColor: { value: new THREE.Color(color) },
    uInkStrength: { value: strength },
    uInkLevel: { value: level },
    uInkWidth: { value: width },
    uInkFade: { value: new THREE.Vector2(fadeNear, fadeFar) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uInkColor;
        uniform float uInkStrength, uInkLevel, uInkWidth;
        uniform vec2 uInkFade;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float h = texture2D(bumpMap, vBumpMapUv).r;
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
