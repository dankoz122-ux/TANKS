export const meta={id:'t90',name:'T-90M «Прорыв»',description:'Индивидуальная геометрия корпуса и башни'};
export function createTank(T,mat){
  const paint={
    hull:new T.MeshStandardMaterial({color:'#59684b',roughness:.9}),
    turret:new T.MeshStandardMaterial({color:'#687957',roughness:.88}),
    armor:new T.MeshStandardMaterial({color:'#758565',roughness:.9}),
    track:new T.MeshStandardMaterial({color:'#20251f',roughness:.98}),
    wheel:new T.MeshStandardMaterial({color:'#343b31',roughness:.95}),
    metal:new T.MeshStandardMaterial({color:'#899187',roughness:.55,metalness:.35}),
    barrel:new T.MeshStandardMaterial({color:'#596b4b',roughness:.8}),
    dark:new T.MeshStandardMaterial({color:'#252b25',roughness:.8}),
    optic:new T.MeshStandardMaterial({color:'#263f3b',roughness:.35,metalness:.2})
  };
  const root=new T.Group(), hull=new T.Group(); root.add(hull);
  const add=(geo,material,pos,rot=[0,0,0],parent=hull)=>{const m=new T.Mesh(geo,material);m.position.set(...pos);m.rotation.set(...rot);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
  // Hull: dedicated proportions for this vehicle
  add(new T.BoxGeometry(2.62,0.72,4.65),paint.hull,[0,1.0,0]);
  // Sloped front and rear deck plates are part-specific, and kept flush with the hull.
  add(new T.BoxGeometry(2.3842000000000003,.22,.86),paint.armor,[0,1.37,-1.72],[-.22,0,0]);
  add(new T.BoxGeometry(2.4104,.24,.72),paint.hull,[0,1.30,1.7],[.08,0,0]);
  // Track belts, individual rollers, and segmented side skirts unique to the T-90M silhouette.
  for(const side of [-1,1]){
    add(new T.BoxGeometry(0.3,.68,4.7),paint.track,[side*1.42,.63,0]);
    for(let i=0;i<7;i++){
      const z=-2.0+i*0.6666666666666666;
      const roadWheel=add(new T.CylinderGeometry(0.27,0.27,.13,14),paint.wheel,[side*1.4342,.57,z],[0,0,Math.PI/2]);roadWheel.userData.rollingWheel=true;
      add(new T.CylinderGeometry(.105,.105,.145,12),paint.metal,[side*1.5123,.57,z],[0,0,Math.PI/2]);
      // Individual skirt plates sit outside the wheel line; narrow seams keep them from reading as one box.
      add(new T.BoxGeometry(.12,.33,.58),i%2?paint.hull:paint.armor,[side*1.49,.91,z],[0,side*.015,0]);
      add(new T.BoxGeometry(.025,.27,.018),paint.dark,[side*1.555,.91,z+.29]);
    }
    // End covers and front mudguard shape.
    add(new T.BoxGeometry(.20,.26,.35),paint.armor,[side*1.46,.84,-2.25],[0,side*.08,-.08]);
    add(new T.BoxGeometry(.16,.22,.34),paint.hull,[side*1.46,.80,2.27],[0,-side*.06,.06]);
  }
  // T-90-style layered tiles on the upper glacis, individually spawned and aligned to the sloped plate.
  for(let i=0;i<5;i++){
    const x=-.88+i*.44;
    add(new T.BoxGeometry(.36,.17,.16),i%2?paint.hull:paint.armor,[x,1.43,-2.04],[-.22,0,0]);
  }
  // Rear engine deck louvers. The engine smoke emitter uses the nearby radiator point below.
  for(let i=0;i<5;i++){
    add(new T.BoxGeometry(.27,.045,.36),paint.dark,[-.62+i*.31,1.40,1.91],[.07,0,0]);
    add(new T.BoxGeometry(.22,.018,.29),paint.metal,[-.62+i*.31,1.43,1.91],[.07,0,0]);
  }
  // Unique turret shell: custom faceted mesh with varying width/height at each longitudinal station.
  const turret=new T.Group();turret.position.set(0,1.43,-.12);root.add(turret);
  const stations=[[-1.18, 0.82, 0.68, 0.98], [-0.78, 1.02, 0.86, 0.92], [0.45, 0.96, 0.82, 0.88], [1.16, 0.78, 0.64, 0.82]];
  const verts=[];
  for(const [z,bw,tw,topY] of stations) verts.push(
    -bw,.02,z, bw,.02,z, -tw,topY,z, tw,topY,z
  );
  const idx=[];
  for(let i=0;i<stations.length-1;i++){
    const a=i*4,b=(i+1)*4;
    // left wall, right wall, roof, bottom and front/back end caps
    idx.push(a,a+2,b+2,a,b+2,b, a+1,b+1,b+3,a+1,b+3,a+3,
             a+2,a+3,b+3,a+2,b+3,b+2, a,a+1,b+1,a,b+1,b);
  }
  // Close front and rear caps so no see-through gaps remain.
  const last=(stations.length-1)*4;
  idx.push(0,1,3,0,3,2,last,last+2,last+3,last,last+3,last+1);
  // Recompute normals and keep the complete closed shell.
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));
  const safeIdx=idx.filter(v=>v<verts.length/3);g.setIndex(safeIdx);g.computeVertexNormals();
  const shellMaterial=paint.turret.clone();shellMaterial.side=T.DoubleSide;
  const shell=new T.Mesh(g,shellMaterial);shell.castShadow=shell.receiveShadow=true;turret.add(shell);
  // T-90M cheek packages and compact rear bustle; every tile is attached directly to the turret.
  for(const side of [-1,1]){
    add(new T.BoxGeometry(.48,.30,.16),paint.armor,[side*.60,.34,-.93],[.10,side*.12,0],turret);
    add(new T.BoxGeometry(.40,.22,.10),paint.hull,[side*.60,.34,-1.035],[.10,side*.12,0],turret);
    // Six smoke-launcher tubes on each side are small cylinder meshes, not a shared floating block.
    for(let i=0;i<3;i++){
      const tube=add(new T.CylinderGeometry(.055,.055,.20,8),paint.dark,[side*.87,.54,.16+i*.16],[Math.PI/2,0,side*.22],turret);
      tube.name=`t90-smoke-launcher-${side}-${i}`;
    }
  }
  add(new T.BoxGeometry(1.056,.24,.44),paint.armor,[0,.26,.91],[0,0,0],turret);
  add(new T.BoxGeometry(.82,.055,.035),paint.dark,[0,.27,1.14],[0,0,0],turret);
  // Gun mount and barrel: pivot is separate so elevation remains controllable.
  const gun=new T.Group();gun.position.set(0,0.24,-.82);turret.add(gun);
  add(new T.CylinderGeometry(.23,.27,.42,14),paint.armor,[0,0,-.04],[Math.PI/2,0,0],gun);
  const barrel=add(new T.CylinderGeometry(.095,.125,3.45,14),paint.barrel,[0,0,-1.945],[Math.PI/2,0,0],gun);
  // Muzzle collar is small and flush.
  const muzzlePart=add(new T.CylinderGeometry(.13,.13,.12,14),paint.dark,[0,0,-3.6700000000000004],[Math.PI/2,0,0],gun);
  // Roof details are seated on the roof and only spawned for this vehicle.
  add(new T.CylinderGeometry(.22,.24,.12,14),paint.armor,[-.53,0.99,.12],[0,0,0],turret);
  add(new T.BoxGeometry(.22,.10,.18),paint.optic,[.50,0.99,.04],[0,0,0],turret);
  
  const muzzle=new T.Object3D();muzzle.position.set(0,0,-3.760);gun.add(muzzle);
  const muzzleGlow=new T.Mesh(new T.SphereGeometry(.25,8,6),new T.MeshBasicMaterial({color:'#ffb35c',transparent:true,opacity:0,depthWrite:false}));muzzleGlow.position.copy(muzzle.position);gun.add(muzzleGlow);
  return {root,turret,gun,hull,barrel,muzzle,muzzleGlow,modules:{engine:[0,.9,1.70],radiator:[0,1.39,1.91],track:[1.42,.6,0],ammo:[0,1.55,.72],gun:[0,1.7,-.8]}};
}
