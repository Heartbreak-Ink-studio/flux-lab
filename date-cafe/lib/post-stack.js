import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';

export function createPostStack({ renderer, scene, camera, width, height, bloom = 0.36, aperture = 0.008, maxBlur = 0.004, focus = 2.8 }) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), bloom, 0.25, 0.88);
  composer.addPass(bloomPass);

  const dof = new BokehPass(scene, camera, {
    focus,
    aperture,
    maxblur: maxBlur,
    width,
    height
  });
  composer.addPass(dof);

  return {
    composer,
    bloomPass,
    dofPass: dof,
    setSize(w, h) {
      composer.setSize(w, h);
      if (dof.materialBokeh) {
        dof.uniforms["textureWidth"].value = w;
        dof.uniforms["textureHeight"].value = h;
      }
    },
    render() {
      composer.render();
    }
  };
}
