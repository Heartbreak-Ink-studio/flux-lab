import * as THREE from 'three';
import { HBI_CAMERA, HBI_EASING } from './hbi-defaults.js';

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function hashNoise(t, seed = 1) {
  const x = Math.sin((t + seed) * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

const OPERATOR_PROFILES = {
  dolly: { posAmp: 0.01, rotAmp: 0.002, freq: 0.7 },
  shoulder: { posAmp: 0.045, rotAmp: 0.012, freq: 1.8 },
  crane: { posAmp: 0.015, rotAmp: 0.003, freq: 0.5 },
};

export class CameraRail {
  constructor(camera, {
    closed = false,
    curveType = 'catmullrom',
    tension = 0.5,
    profile = 'dolly',
  } = {}) {
    this.camera = camera;
    this.closed = closed;
    this.curveType = curveType;
    this.tension = tension;

    this.controlPoints = [];
    this.curve = null;

    this.operatorProfile = profile;
    this.focusTarget = null;
    this.focusPoint = new THREE.Vector3(0, 1.5, 0);

    this.sequence = [];
    this.sequenceStart = 0;
    this.sequenceDuration = 0;

    this.currentDOF = {
      focusDistance: 8,
      aperture: 0.025,
      maxBlur: 0.015,
    };
  }

  setControlPoints(points = []) {
    this.controlPoints = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    this.curve = new THREE.CatmullRomCurve3(this.controlPoints, this.closed, this.curveType, this.tension);
    return this;
  }

  setLens(preset = '35mm') {
    const p = HBI_CAMERA.lensPresets[preset] || HBI_CAMERA.lensPresets['35mm'];
    this.camera.fov = p.fov;
    this.camera.updateProjectionMatrix();
    this.currentDOF.aperture = p.dof.aperture;
    this.currentDOF.maxBlur = p.dof.maxBlur;
    return p;
  }

  setOperatorProfile(profile = 'dolly') {
    this.operatorProfile = OPERATOR_PROFILES[profile] ? profile : 'dolly';
  }

  setFocusTarget(object3D) {
    this.focusTarget = object3D;
  }

  setFocusPoint(point) {
    this.focusTarget = null;
    this.focusPoint.copy(point.isVector3 ? point : new THREE.Vector3(...point));
  }

  getFocusPoint() {
    if (this.focusTarget) {
      const out = new THREE.Vector3();
      this.focusTarget.getWorldPosition(out);
      return out;
    }
    return this.focusPoint.clone();
  }

  setSequence(shots = [], startTime = 0) {
    this.sequence = shots;
    this.sequenceStart = startTime;
    this.sequenceDuration = shots.reduce((acc, s) => acc + (s.duration || 0), 0);
    return this;
  }

  getShotAtTime(nowSec) {
    if (!this.sequence.length) return null;

    let t = Math.max(0, nowSec - this.sequenceStart);
    for (const shot of this.sequence) {
      const d = shot.duration || 0;
      if (t <= d) {
        const localT = d > 0 ? t / d : 1;
        return { shot, localT: clamp01(localT) };
      }
      t -= d;
    }

    const last = this.sequence[this.sequence.length - 1];
    return { shot: last, localT: 1 };
  }

  evaluateCurve(t) {
    if (!this.curve) throw new Error('CameraRail has no curve. Call setControlPoints first.');

    const p = this.curve.getPointAt(clamp01(t));
    const tangent = this.curve.getTangentAt(clamp01(Math.min(t + 0.001, 1)));
    return { p, tangent };
  }

  applyOperatorNoise(timeSec, profileName = this.operatorProfile) {
    const profile = OPERATOR_PROFILES[profileName] || OPERATOR_PROFILES.dolly;
    const f = profile.freq;

    const nx = hashNoise(timeSec * f, 1.1) * profile.posAmp;
    const ny = hashNoise(timeSec * f, 2.2) * profile.posAmp * 0.6;
    const nz = hashNoise(timeSec * f, 3.3) * profile.posAmp;

    const rx = hashNoise(timeSec * f, 4.4) * profile.rotAmp;
    const ry = hashNoise(timeSec * f, 5.5) * profile.rotAmp;

    this.camera.position.add(new THREE.Vector3(nx, ny, nz));
    this.camera.rotation.x += rx;
    this.camera.rotation.y += ry;
  }

  update(timeSec, postStack = null) {
    if (!this.curve && !this.sequence.length) return;

    let normalizedT = 0;
    let lens = null;
    let profile = this.operatorProfile;
    let easing = HBI_EASING.easeInOutSine;
    let shotDOF = null;

    const shotCtx = this.getShotAtTime(timeSec);
    if (shotCtx) {
      const { shot, localT } = shotCtx;
      const easeFn = typeof shot.easing === 'function'
        ? shot.easing
        : HBI_EASING[shot.easing] || easing;

      const eased = clamp01(easeFn(localT));
      const from = shot.from ?? 0;
      const to = shot.to ?? 1;
      normalizedT = THREE.MathUtils.lerp(from, to, eased);

      if (shot.lens) lens = this.setLens(shot.lens);
      if (shot.operator) profile = shot.operator;
      if (shot.focusPoint) this.setFocusPoint(shot.focusPoint);
      shotDOF = shot.dof || null;

      if (postStack && shot.grading) {
        postStack.setGrading(shot.grading);
      }
    }

    const { p } = this.evaluateCurve(normalizedT);
    this.camera.position.copy(p);

    const focus = this.getFocusPoint();
    this.camera.lookAt(focus);

    const dist = this.camera.position.distanceTo(focus);
    this.currentDOF.focusDistance = dist;

    if (lens?.dof) {
      this.currentDOF.aperture = lens.dof.aperture;
      this.currentDOF.maxBlur = lens.dof.maxBlur;
    }
    if (shotDOF) {
      this.currentDOF = { ...this.currentDOF, ...shotDOF };
    }

    this.applyOperatorNoise(timeSec, profile);

    if (postStack?.setDOF) {
      postStack.setDOF(this.currentDOF);
    }
  }
}

export const LensPresets = HBI_CAMERA.lensPresets;
export const OperatorProfiles = OPERATOR_PROFILES;
