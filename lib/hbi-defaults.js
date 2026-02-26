export const HBI_COLORS = {
  background: '#0a0a12',
  fog: '#0a0a12',
  key: '#4488ff',
  fill: '#ff6633',
  rim: '#ffffff',
  watermark: '#ffffff',
};

export const HBI_LIGHTING = {
  key: { color: HBI_COLORS.key, intensity: 2.0, position: [3, 4, 2], castShadow: true },
  fill: { color: HBI_COLORS.fill, intensity: 0.8, position: [-3, 2, -1], castShadow: true },
  rim: { color: HBI_COLORS.rim, intensity: 1.5, position: [0, 3, -3], castShadow: true },
  shadowMapSize: 2048,
};

export const HBI_POST = {
  bloom: {
    strength: 0.8,
    radius: 0.4,
    threshold: 0.2,
  },
  grain: {
    intensity: 0.08,
    speed: 1.0,
  },
  vignette: {
    strength: 0.15,
    falloff: 0.55,
  },
  dof: {
    focusDistance: 8.0,
    aperture: 0.025,
    maxBlur: 0.015,
  },
  anamorphic: {
    intensity: 0.2,
    threshold: 0.85,
    stretch: 1.8,
  },
  letterbox: {
    enabled: true,
    height: 0.09,
    color: '#000000',
  },
};

export const HBI_CAMERA = {
  sensorWidthMm: 36,
  lensPresets: {
    '24mm': { focalLength: 24, fov: 73.74, dof: { aperture: 0.018, maxBlur: 0.01 } },
    '35mm': { focalLength: 35, fov: 54.43, dof: { aperture: 0.022, maxBlur: 0.012 } },
    '50mm': { focalLength: 50, fov: 39.6, dof: { aperture: 0.03, maxBlur: 0.015 } },
    '85mm': { focalLength: 85, fov: 23.91, dof: { aperture: 0.04, maxBlur: 0.02 } },
  },
};

export const HBI_BRAND = {
  name: 'HEARTBREAK INK',
  watermarkOpacity: 0.3,
  fontFamily: 'monospace',
};

export const HBI_EASING = {
  linear: (t) => t,
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

export const HBI_DEFAULTS = {
  colors: HBI_COLORS,
  lighting: HBI_LIGHTING,
  post: HBI_POST,
  camera: HBI_CAMERA,
  brand: HBI_BRAND,
  easing: HBI_EASING,
};
