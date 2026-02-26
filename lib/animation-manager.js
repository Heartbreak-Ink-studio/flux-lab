import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class AnimationManager {
  constructor(characterRoot, { loadingManager = null } = {}) {
    this.characterRoot = characterRoot;
    this.mixer = new THREE.AnimationMixer(characterRoot);
    this.loader = new GLTFLoader(loadingManager || undefined);

    this.actions = new Map();
    this.clips = new Map();
    this.events = new Map();

    this.current = null;
    this.previous = null;
  }

  async loadClips(clipManifest = []) {
    const jobs = clipManifest.map(async (item) => {
      const gltf = await this._loadGLTF(item.url);
      const clip = gltf.animations[0];
      if (!clip) throw new Error(`No animation clip in ${item.url}`);

      const clipName = item.name || clip.name;
      this.clips.set(clipName, clip);

      const action = this.mixer.clipAction(clip, this.characterRoot);
      action.enabled = true;
      action.clampWhenFinished = item.clampWhenFinished ?? false;
      action.loop = item.loopOnce ? THREE.LoopOnce : THREE.LoopRepeat;
      this.actions.set(clipName, action);

      if (Array.isArray(item.markers)) {
        this.events.set(clipName, item.markers.slice());
      }
    });

    await Promise.all(jobs);
    return this;
  }

  defineMarkers(state, markers = []) {
    this.events.set(state, markers);
  }

  play(state, { reset = true, fadeIn = 0.0, timeScale = 1 } = {}) {
    const action = this.actions.get(state);
    if (!action) throw new Error(`Unknown animation state: ${state}`);

    if (this.current && this.current !== state) {
      const currentAction = this.actions.get(this.current);
      currentAction?.stop();
    }

    if (reset) action.reset();
    action.timeScale = timeScale;
    action.enabled = true;
    if (fadeIn > 0) action.fadeIn(fadeIn);
    action.play();

    this.previous = this.current;
    this.current = state;
    return action;
  }

  crossfadeTo(state, duration = 0.5, { warp = false } = {}) {
    const next = this.actions.get(state);
    if (!next) throw new Error(`Unknown animation state: ${state}`);

    if (!this.current) {
      this.play(state, { fadeIn: duration });
      return;
    }

    const from = this.actions.get(this.current);
    next.reset();
    next.play();

    from?.crossFadeTo(next, duration, warp);

    this.previous = this.current;
    this.current = state;
  }

  update(deltaSec, emit = null) {
    const prevTimes = new Map();
    if (emit) {
      for (const [state, action] of this.actions.entries()) {
        prevTimes.set(state, action.time);
      }
    }

    this.mixer.update(deltaSec);

    if (!emit) return;

    for (const [state, markers] of this.events.entries()) {
      const action = this.actions.get(state);
      if (!action || !action.isRunning()) continue;

      const prev = prevTimes.get(state) ?? 0;
      const curr = action.time;
      const clip = this.clips.get(state);
      const duration = clip?.duration || 0;

      for (const marker of markers) {
        const t = marker.time ?? 0;

        const crossed = curr >= prev
          ? (t >= prev && t < curr)
          : (t >= prev && t <= duration) || (t >= 0 && t < curr);

        if (crossed) {
          emit({
            type: marker.type || 'marker',
            state,
            marker,
            actionTime: curr,
          });
        }
      }
    }
  }

  getState() {
    return this.current;
  }

  hasState(state) {
    return this.actions.has(state);
  }

  _loadGLTF(url) {
    return new Promise((resolve, reject) => {
      this.loader.load(url, resolve, undefined, reject);
    });
  }
}
