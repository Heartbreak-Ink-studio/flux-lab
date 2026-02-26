import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { HBI_POST } from './hbi-defaults.js';

const GrainVignetteGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    grainIntensity: { value: HBI_POST.grain.intensity },
    vignetteStrength: { value: HBI_POST.vignette.strength },
    vignetteFalloff: { value: HBI_POST.vignette.falloff },
    exposure: { value: 1.0 },
    contrast: { value: 1.0 },
    saturation: { value: 1.0 },
    tint: { value: new THREE.Color('#ffffff') },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float grainIntensity;
    uniform float vignetteStrength;
    uniform float vignetteFalloff;
    uniform float exposure;
    uniform float contrast;
    uniform float saturation;
    uniform vec3 tint;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 345.45));
      p += dot(p, p + 34.345);
      return fract(p.x * p.y);
    }

    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * exposure;

      float gray = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(gray), col, saturation);
      col = (col - 0.5) * contrast + 0.5;
      col *= tint;

      float grain = hash(vUv + time * 0.01) - 0.5;
      col += grain * grainIntensity;

      vec2 centerUv = vUv * 2.0 - 1.0;
      float vig = smoothstep(vignetteFalloff, 1.0, dot(centerUv, centerUv));
      col *= (1.0 - vignetteStrength * vig);

      gl_FragColor = vec4(col, c.a);
    }
  `,
};

const AnamorphicShader = {
  uniforms: {
    tDiffuse: { value: null },
    intensity: { value: HBI_POST.anamorphic.intensity },
    threshold: { value: HBI_POST.anamorphic.threshold },
    stretch: { value: HBI_POST.anamorphic.stretch },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float intensity;
    uniform float threshold;
    uniform float stretch;

    void main() {
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      float luma = dot(base, vec3(0.2126,0.7152,0.0722));

      vec3 streak = vec3(0.0);
      if (luma > threshold) {
        for (int i = -6; i <= 6; i++) {
          float fi = float(i);
          vec2 o = vec2(fi / 1200.0 * stretch, 0.0);
          streak += texture2D(tDiffuse, vUv + o).rgb;
        }
        streak /= 13.0;
      }

      gl_FragColor = vec4(base + streak * intensity, 1.0);
    }
  `,
};

const DOFShader = {
  uniforms: {
    tDiffuse: { value: null },
    focusDistance: { value: HBI_POST.dof.focusDistance },
    aperture: { value: HBI_POST.dof.aperture },
    maxBlur: { value: HBI_POST.dof.maxBlur },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000.0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float focusDistance;
    uniform float aperture;
    uniform float maxBlur;

    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      float pseudoDepth = abs(vUv.y - 0.5) * 20.0;
      float coc = clamp(abs(pseudoDepth - focusDistance) * aperture, 0.0, maxBlur);

      vec3 blur = vec3(0.0);
      blur += texture2D(tDiffuse, vUv + vec2( coc, 0.0)).rgb;
      blur += texture2D(tDiffuse, vUv + vec2(-coc, 0.0)).rgb;
      blur += texture2D(tDiffuse, vUv + vec2(0.0,  coc)).rgb;
      blur += texture2D(tDiffuse, vUv + vec2(0.0, -coc)).rgb;
      blur *= 0.25;

      gl_FragColor = vec4(mix(base.rgb, blur, clamp(coc * 40.0, 0.0, 1.0)), base.a);
    }
  `,
};

const LetterboxShader = {
  uniforms: {
    tDiffuse: { value: null },
    bars: { value: HBI_POST.letterbox.height },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float bars;

    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      if (vUv.y < bars || vUv.y > (1.0 - bars)) c = vec4(0.0,0.0,0.0,1.0);
      gl_FragColor = c;
    }
  `,
};

export class PostStack {
  constructor(renderer, scene, camera, {
    width = window.innerWidth,
    height = window.innerHeight,
    defaults = HBI_POST,
  } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.composer = new EffectComposer(renderer);
    this.composer.setSize(width, height);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), defaults.bloom.strength, defaults.bloom.radius, defaults.bloom.threshold);
    this.composer.addPass(this.bloomPass);

    this.dofPass = new ShaderPass(DOFShader);
    this.composer.addPass(this.dofPass);

    this.anamorphicPass = new ShaderPass(AnamorphicShader);
    this.composer.addPass(this.anamorphicPass);

    this.gradePass = new ShaderPass(GrainVignetteGradeShader);
    this.composer.addPass(this.gradePass);

    this.letterboxPass = new ShaderPass(LetterboxShader);
    this.letterboxPass.enabled = !!defaults.letterbox.enabled;
    this.composer.addPass(this.letterboxPass);
  }

  setSize(width, height) {
    this.composer.setSize(width, height);
  }

  setDOF({ focusDistance, aperture, maxBlur } = {}) {
    if (focusDistance != null) this.dofPass.uniforms.focusDistance.value = focusDistance;
    if (aperture != null) this.dofPass.uniforms.aperture.value = aperture;
    if (maxBlur != null) this.dofPass.uniforms.maxBlur.value = maxBlur;
  }

  setGrading({ exposure, contrast, saturation, tint } = {}) {
    if (exposure != null) this.gradePass.uniforms.exposure.value = exposure;
    if (contrast != null) this.gradePass.uniforms.contrast.value = contrast;
    if (saturation != null) this.gradePass.uniforms.saturation.value = saturation;
    if (tint != null) this.gradePass.uniforms.tint.value.set(tint);
  }

  setBloom({ strength, radius, threshold } = {}) {
    if (strength != null) this.bloomPass.strength = strength;
    if (radius != null) this.bloomPass.radius = radius;
    if (threshold != null) this.bloomPass.threshold = threshold;
  }

  setAnamorphic({ intensity, threshold, stretch } = {}) {
    if (intensity != null) this.anamorphicPass.uniforms.intensity.value = intensity;
    if (threshold != null) this.anamorphicPass.uniforms.threshold.value = threshold;
    if (stretch != null) this.anamorphicPass.uniforms.stretch.value = stretch;
  }

  setLetterbox({ enabled, height } = {}) {
    if (enabled != null) this.letterboxPass.enabled = enabled;
    if (height != null) this.letterboxPass.uniforms.bars.value = height;
  }

  render(deltaSec = 0.016, elapsedSec = 0) {
    this.gradePass.uniforms.time.value = elapsedSec;
    this.composer.render(deltaSec);
  }
}
