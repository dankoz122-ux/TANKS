export const meta={id:'merkava',name:'Merkava Mk.3',description:'Индивидуальная геометрия корпуса и башни'};
export function createTank(T,mat){
  const paint={
    hull:new T.MeshStandardMaterial({color:'#59674a',roughness:.9}),
    turret:new T.MeshStandardMaterial({color:'#687653',roughness:.88}),
    armor:new T.MeshStandardMaterial({color:'#778565',roughness:.9}),
    track:new T.MeshStandardMaterial({color:'#242820',roughness:.98}),
    wheel:new T.MeshStandardMaterial({color:'#363d31',roughness:.95}),
    metal:new T.MeshStandardMaterial({color:'#929687',roughness:.55,metalness:.35}),
    barrel:new T.MeshStandardMaterial({color:'#596b4b',roughness:.8}),
    dark:new T.MeshStandardMaterial({color:'#252b25',roughness:.8}),
    optic:new T.MeshStandardMaterial({color:'#263f3b',roughness:.35,metalness:.2})
  };
  const root=new T.Group(), hull=new T.Group(); root.add(hull);
  const add=(geo,material,pos,rot=[0,0,0],parent=hull)=>{const m=new T.Mesh(geo,material);m.position.set(...pos);m.rotation.set(...rot);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
  // Hull: dedicated proportions for this vehicle
  add(new T.BoxGeometry(2.86,0.82,4.7),paint.hull,[0,1.0,0]);
  // Sloped front and rear deck plates are part-specific, and kept flush with the hull.
  add(new T.BoxGeometry(2.6026,.22,.86),paint.armor,[0,1.37,-1.72],[-.22,0,0]);
  add(new T.BoxGeometry(2.6312,.24,.72),paint.hull,[0,1.30,1.72],[.08,0,0]);
  // Wide Merkava track runs with six large rollers and separately modelled side armour segments.
  for(const side of [-1,1]){
    add(new T.BoxGeometry(0.36,.68,4.75),paint.track,[side*1.53,.63,0]);
    for(let i=0;i<6;i++){
      const z=-2.025+i*.81;
      const roadWheel=add(new T.CylinderGeometry(.30,.30,.13,14),paint.wheel,[side*1.5453,.57,z],[0,0,Math.PI/2]);roadWheel.userData.rollingWheel=true;
      add(new T.CylinderGeometry(.105,.105,.145,12),paint.metal,[side*1.62945,.57,z],[0,0,Math.PI/2]);
      add(new T.BoxGeometry(.13,.37,.69),i%2?paint.hull:paint.armor,[side*1.59,.91,z],[0,side*.01,0]);
      add(new T.BoxGeometry(.025,.30,.02),paint.dark,[side*1.66,.91,z+.345]);
    }
    add(new T.BoxGeometry(.24,.30,.38),paint.armor,[side*1.54,.83,-2.27],[0,side*.06,-.08]);
    add(new T.BoxGeometry(.21,.25,.42),paint.hull,[side*1.54,.80,2.32],[0,-side*.05,.04]);
  }
  // Distinct forward power-pack housing and radiator grille (Merkava's engine area is toward the bow).
  add(new T.BoxGeometry(2.44,.27,.40),paint.armor,[0,1.40,-1.98],[-.20,0,0]);
  add(new T.BoxGeometry(2.12,.18,.07),paint.dark,[0,1.36,-2.18],[-.20,0,0]);
  for(let i=0;i<9;i++)add(new T.BoxGeometry(.035,.135,.035),paint.metal,[-.91+i*.228,1.36,-2.225],[-.20,0,0]);
  // Rear stowage rack: low support rails and a few separate storage boxes, not a single floating block.
  add(new T.BoxGeometry(1.72,.09,.10),paint.metal,[0,1.43,2.14]);
  for(const side of [-1,0,1])add(new T.BoxGeometry(.48,.28,.36),paint.armor,[side*.54,1.48,2.20],[0,side*.05,0]);
  // Unique turret shell: custom faceted mesh with varying width/height at each longitudinal station.
  const turret=new T.Group();turret.position.set(0,1.48,-.12);root.add(turret);
  const stations=[[-1.02, 0.84, 0.72, 1.02], [-0.62, 1.08, 0.92, 1.02], [0.3, 1.12, 0.96, 0.98], [1.16, 1.05, 0.88, 0.88]];
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
  // Broad, faceted cheek pieces and low rear turret bustle; these are specific to the Merkava silhouette.
  for(const side of [-1,1]){
    add(new T.BoxGeometry(.52,.38,.18),paint.armor,[side*.68,.35,-.84],[.04,side*.12,0],turret);
    add(new T.BoxGeometry(.43,.28,.09),paint.hull,[side*.68,.35,-.95],[.04,side*.12,0],turret);
    for(let i=0;i<3;i++)add(new T.CylinderGeometry(.05,.05,.18,8),paint.dark,[side*.92,.55,.28+i*.15],[Math.PI/2,0,side*.18],turret);
  }
  add(new T.BoxGeometry(1.452,.24,.44),paint.armor,[0,.26,.91],[0,0,0],turret);
  add(new T.BoxGeometry(1.18,.06,.04),paint.dark,[0,.28,1.14],[0,0,0],turret);
  // Gun mount and barrel: pivot is separate so elevation remains controllable.
  const gun=new T.Group();gun.position.set(0,0.25,-.82);turret.add(gun);
  add(new T.CylinderGeometry(.23,.27,.42,14),paint.armor,[0,0,-.04],[Math.PI/2,0,0],gun);
  const barrel=add(new T.CylinderGeometry(.095,.125,3.5,14),paint.barrel,[0,0,-1.97],[Math.PI/2,0,0],gun);
  // Muzzle collar is small and flush.
  const muzzlePart=add(new T.CylinderGeometry(.13,.13,.12,14),paint.dark,[0,0,-3.72],[Math.PI/2,0,0],gun);
  // Roof details are seated on the roof and only spawned for this vehicle.
  add(new T.CylinderGeometry(.22,.24,.12,14),paint.armor,[-.53,1.09,.12],[0,0,0],turret);
  add(new T.BoxGeometry(.22,.10,.18),paint.optic,[.50,1.09,.04],[0,0,0],turret);
  
  const muzzle=new T.Object3D();muzzle.position.set(0,0,-3.810);gun.add(muzzle);
  const muzzleGlow=new T.Mesh(new T.SphereGeometry(.25,8,6),new T.MeshBasicMaterial({color:'#ffb35c',transparent:true,opacity:0,depthWrite:false}));muzzleGlow.position.copy(muzzle.position);gun.add(muzzleGlow);
  return {root,turret,gun,hull,barrel,muzzle,muzzleGlow,modules:{engine:[0,.94,-1.76],radiator:[0,1.34,-2.22],track:[1.53,.6,0],ammo:[0,1.55,.72],gun:[0,1.7,-.8]}};
}
