// Вращающееся 3D-превью танка на стартовом экране (тот же WebGL-рендерер, отдельный вьюпорт).
import * as THREE from 'three';

export function createPreview(el, factories) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1.6, .1, 100);
  scene.add(new THREE.HemisphereLight(0xdce8dd, 0x2d3a2d, 2.2));
  const sun = new THREE.DirectionalLight(0xffedcf, 3); sun.position.set(-6, 10, 5); scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(5.2, 48), new THREE.MeshStandardMaterial({ color: '#2a3a2e', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(5.0, 5.12, 64), new THREE.MeshBasicMaterial({ color: 0x7fa27f, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .01; scene.add(ring);
  const holder = new THREE.Group(); scene.add(holder);
  const cache = new Map(); let current = null, az = .5, visible = true;

  return {
    setType(type) {
      const f = factories[type]; if (!f) return null;
      if (current) holder.remove(current.root);
      if (!cache.has(type)) cache.set(type, f(THREE));
      current = cache.get(type); holder.add(current.root);
      return current;
    },
    hide() { visible = false; },
    frame(dt, renderer) {
      if (!visible || !current) return;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      az += dt * .35;
      current.update?.(dt, 1.8, 1.8);
      const D = 9.2, pr = renderer.getPixelRatio(), main = renderer.domElement;
      const cw = Math.min(Math.round(r.width), Math.floor(main.width / pr)), ch = Math.min(Math.round(r.height), Math.floor(main.height / pr));
      camera.position.set(Math.sin(az) * D, 3.6, Math.cos(az) * D); camera.lookAt(0, .9, 0);
      camera.aspect = cw / ch; camera.updateProjectionMatrix();
      renderer.setViewport(0, 0, cw, ch); renderer.setScissor(0, 0, cw, ch); renderer.setScissorTest(true);
      renderer.setClearColor(0x0c140f, 1); renderer.clear(true, true, false);
      const ac = renderer.autoClear; renderer.autoClear = false;
      renderer.render(scene, camera);
      renderer.autoClear = ac; renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
      const w = Math.round(cw * pr), h = Math.round(ch * pr);
      if (el.width !== w || el.height !== h) { el.width = w; el.height = h; }
      el.getContext('2d').drawImage(main, 0, main.height - h, w, h, 0, 0, w, h);
    }
  };
}
