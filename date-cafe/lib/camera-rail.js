import * as THREE from 'three';

function smooth01(t) {
  return t * t * (3 - 2 * t);
}

const _aPos = new THREE.Vector3();
const _bPos = new THREE.Vector3();
const _aTarget = new THREE.Vector3();
const _bTarget = new THREE.Vector3();
const _outPos = new THREE.Vector3();
const _outTarget = new THREE.Vector3();

function lerpPose(a, b, t, out = {}) {
  const s = smooth01(THREE.MathUtils.clamp(t, 0, 1));
  _aPos.fromArray(a.position);
  _bPos.fromArray(b.position);
  _aTarget.fromArray(a.target);
  _bTarget.fromArray(b.target);

  _outPos.copy(_aPos).lerp(_bPos, s);
  _outTarget.copy(_aTarget).lerp(_bTarget, s);

  out.position = _outPos;
  out.target = _outTarget;
  out.fov = THREE.MathUtils.lerp(a.fov, b.fov, s);
  return out;
}

export function createCameraRail(camera, shots) {
  if (!Array.isArray(shots) || shots.length < 2) {
    throw new Error('createCameraRail requires >= 2 shots');
  }
  shots.forEach((s, i) => {
    if (!(s?.duration > 0)) throw new Error(`Shot ${i} duration must be > 0`);
    if (!Array.isArray(s.position) || s.position.length !== 3) throw new Error(`Shot ${i} invalid position`);
    if (!Array.isArray(s.target) || s.target.length !== 3) throw new Error(`Shot ${i} invalid target`);
    if (!Number.isFinite(s.fov)) throw new Error(`Shot ${i} invalid fov`);
  });

  const duration = shots.reduce((acc, s) => acc + s.duration, 0);
  let lastFov = NaN;

  function getShotIndex(time) {
    let acc = 0;
    for (let i = 0; i < shots.length; i++) {
      const d = shots[i].duration;
      if (time < acc + d) return { i, local: (time - acc) / d };
      acc += d;
    }
    return { i: shots.length - 1, local: 1 };
  }

  return {
    duration,
    update(tSeconds) {
      if (!Number.isFinite(tSeconds)) return;
      const t = ((tSeconds % duration) + duration) % duration;
      const { i, local } = getShotIndex(t);
      const a = shots[i];
      const b = shots[(i + 1) % shots.length];
      const pose = lerpPose(a, b, local);

      camera.position.copy(pose.position);
      camera.lookAt(pose.target);
      if (pose.fov !== lastFov) {
        camera.fov = pose.fov;
        camera.updateProjectionMatrix();
        lastFov = pose.fov;
      }
    }
  };
}
