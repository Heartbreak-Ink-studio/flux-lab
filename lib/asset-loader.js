import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const DEFAULT_MANIFEST_PATH = './assets/manifest.json';

export class AssetLoader {
  constructor({ manifestPath = DEFAULT_MANIFEST_PATH, loadingManager = null } = {}) {
    this.manifestPath = manifestPath;
    this.manifest = null;
    this.cache = new Map();

    this.manager = loadingManager || new THREE.LoadingManager();
    this.gltfLoader = new GLTFLoader(this.manager);
    this.rgbeLoader = new RGBELoader(this.manager);
    this.textureLoader = new THREE.TextureLoader(this.manager);
  }

  async loadManifest(force = false) {
    if (this.manifest && !force) return this.manifest;

    const res = await fetch(this.manifestPath);
    if (!res.ok) throw new Error(`Failed to load manifest: ${res.status} ${res.statusText}`);

    const data = await res.json();
    this.validateManifest(data);
    this.manifest = data;
    return this.manifest;
  }

  validateManifest(manifest) {
    if (!manifest || !Array.isArray(manifest.assets)) {
      throw new Error('Invalid manifest: expected { assets: [] }');
    }

    const seen = new Set();
    for (const a of manifest.assets) {
      if (!a.name || !a.type || !a.url) {
        throw new Error('Invalid asset entry: requires name, type, url');
      }
      if (seen.has(a.name)) throw new Error(`Duplicate asset name in manifest: ${a.name}`);
      seen.add(a.name);
    }
  }

  getAssetMeta(name) {
    if (!this.manifest) throw new Error('Manifest not loaded. Call loadManifest() first.');
    const entry = this.manifest.assets.find((a) => a.name === name);
    if (!entry) throw new Error(`Asset not found in manifest: ${name}`);
    return entry;
  }

  async loadAsset(name, { clone = true } = {}) {
    await this.loadManifest();

    if (this.cache.has(name)) {
      const cached = this.cache.get(name);
      return clone ? this.cloneLoadedAsset(cached) : cached;
    }

    const meta = this.getAssetMeta(name);
    const loaded = await this.loadByType(meta);
    this.cache.set(name, loaded);

    return clone ? this.cloneLoadedAsset(loaded) : loaded;
  }

  async loadByType(meta) {
    switch (meta.type) {
      case 'character-gltf':
      case 'environment-gltf':
      case 'animation-gltf':
        return this.loadGLTF(meta.url);

      case 'hdri':
        return this.loadHDRI(meta.url);

      case 'pbr-texture-set':
        return this.loadPBRTextureSet(meta);

      default:
        throw new Error(`Unsupported asset type: ${meta.type} (${meta.name})`);
    }
  }

  loadGLTF(url) {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(url, resolve, undefined, reject);
    });
  }

  loadHDRI(url) {
    return new Promise((resolve, reject) => {
      this.rgbeLoader.load(
        url,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          resolve(texture);
        },
        undefined,
        reject
      );
    });
  }

  async loadPBRTextureSet(meta) {
    const textures = {};
    const set = meta.textures || {};

    const jobs = Object.entries(set).map(async ([slot, path]) => {
      const tex = await new Promise((resolve, reject) => {
        this.textureLoader.load(path, resolve, undefined, reject);
      });

      if (slot === 'albedo' || slot === 'baseColor' || slot === 'map') {
        tex.colorSpace = THREE.SRGBColorSpace;
      }

      if (['normal', 'roughness', 'metalness', 'ao'].includes(slot)) {
        tex.colorSpace = THREE.NoColorSpace;
      }

      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      textures[slot] = tex;
    });

    await Promise.all(jobs);
    return {
      type: 'pbr-texture-set',
      name: meta.name,
      textures,
      materialParams: {
        map: textures.albedo || textures.baseColor || textures.map || null,
        normalMap: textures.normal || null,
        roughnessMap: textures.roughness || null,
        metalnessMap: textures.metalness || null,
        aoMap: textures.ao || null,
      },
    };
  }

  cloneLoadedAsset(asset) {
    if (asset?.scene?.clone) {
      const cloned = {
        ...asset,
        scene: asset.scene.clone(true),
      };
      if (asset.animations) cloned.animations = [...asset.animations];
      return cloned;
    }

    if (asset?.isTexture) return asset.clone();

    if (asset?.type === 'pbr-texture-set') {
      return {
        ...asset,
        textures: Object.fromEntries(
          Object.entries(asset.textures).map(([k, v]) => [k, v.clone()])
        ),
      };
    }

    return asset;
  }
}

const defaultLoader = new AssetLoader();

export async function loadAsset(name, options = {}) {
  return defaultLoader.loadAsset(name, options);
}

export async function loadManifest(path = DEFAULT_MANIFEST_PATH, force = false) {
  if (path !== defaultLoader.manifestPath) {
    defaultLoader.manifestPath = path;
    defaultLoader.manifest = null;
  }
  return defaultLoader.loadManifest(force);
}
