export const meta={
  id:'leopard',name:'Leopard 2A7',
  description:'Low-poly модель по референсу: плоская угловатая башня, длинные клиновидные щеки, боковые модули и семь катков'
};

export function createTank(T,mat){
  const p={
    hull:new T.MeshStandardMaterial({color:'#6e7e5c',roughness:.92,flatShading:true}),
    hullTop:new T.MeshStandardMaterial({color:'#7d8b69',roughness:.91,flatShading:true}),
    armor:new T.MeshStandardMaterial({color:'#929c7c',roughness:.90,flatShading:true}),
    armorSide:new T.MeshStandardMaterial({color:'#667654',roughness:.93,flatShading:true}),
    turret:new T.MeshStandardMaterial({color:'#7f8d69',roughness:.9,flatShading:true,side:T.DoubleSide}),
    turretLight:new T.MeshStandardMaterial({color:'#a3ad8c',roughness:.9,flatShading:true}),
    turretShade:new T.MeshStandardMaterial({color:'#6a7858',roughness:.92,flatShading:true}),
    track:new T.MeshStandardMaterial({color:'#242720',roughness:.98}),
    trackPad:new T.MeshStandardMaterial({color:'#3b4033',roughness:.98}),
    wheel:new T.MeshStandardMaterial({color:'#45483b',roughness:.96}),
    hub:new T.MeshStandardMaterial({color:'#7f8871',roughness:.7,metalness:.2}),
    metal:new T.MeshStandardMaterial({color:'#8a927e',roughness:.58,metalness:.25}),
    barrel:new T.MeshStandardMaterial({color:'#526449',roughness:.84,flatShading:true}),
    dark:new T.MeshStandardMaterial({color:'#232820',roughness:.84}),
    optic:new T.MeshStandardMaterial({color:'#19312a',roughness:.3,metalness:.12}),
    lens:new T.MeshStandardMaterial({color:'#477d70',roughness:.3,metalness:.16})
  };
  const root=new T.Group();root.name='Leopard_2A7';
  const hull=new T.Group();hull.name='leopard-hull';root.add(hull);
  const add=(geo,material,pos,rot=[0,0,0],parent=hull)=>{const mesh=new T.Mesh(geo,material);mesh.position.set(...pos);mesh.rotation.set(...rot);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;};
  const box=(w,h,d,material,pos,rot=[0,0,0],parent=hull)=>add(new T.BoxGeometry(w,h,d),material,pos,rot,parent);
  const cyl=(rTop,rBottom,h,segments,material,pos,rot=[0,0,0],parent=hull)=>add(new T.CylinderGeometry(rTop,rBottom,h,segments),material,pos,rot,parent);
  function loft(stations,material,parent,name){
    const v=[],idx=[],N=6;
    for(const [z,bw,sw,tw,by,sy,ty] of stations)v.push(-bw,by,z,bw,by,z,sw,sy,z,tw,ty,z,-tw,ty,z,-sw,sy,z);
    for(let i=0;i<stations.length-1;i++){const a=i*N,b=(i+1)*N;for(let j=0;j<N;j++){const k=(j+1)%N;idx.push(a+j,a+k,b+k,a+j,b+k,b+j);}}
    for(let j=1;j<N-1;j++){idx.push(0,j,j+1);const last=(stations.length-1)*N;idx.push(last,last+j+1,last+j);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();const m=material.clone();m.side=T.DoubleSide;m.flatShading=true;const mesh=add(g,m,[0,0,0],[0,0,0],parent);mesh.name=name;return mesh;
  }
  function prismX(points,thickness,centerX,material,parent,name){
    const v=[],idx=[],n=points.length;for(const x of [centerX-thickness/2,centerX+thickness/2])for(const [y,z] of points)v.push(x,y,z);
    for(let j=1;j<n-1;j++)idx.push(0,j,j+1,n,n+j+1,n+j);
    for(let j=0;j<n;j++){const k=(j+1)%n;idx.push(j,k,n+k,j,n+k,n+j);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();const m=material.clone();m.side=T.DoubleSide;m.flatShading=true;return add(g,m,[0,0,0],[0,0,0],parent).name=name;
  }
  function trackLoop(side){
    const s=new T.Shape();s.moveTo(-2.08,.17);s.lineTo(2.08,.17);s.quadraticCurveTo(2.40,.17,2.42,.50);s.lineTo(2.42,.72);s.quadraticCurveTo(2.40,1.04,2.08,1.04);s.lineTo(-2.08,1.04);s.quadraticCurveTo(-2.40,1.04,-2.42,.72);s.lineTo(-2.42,.50);s.quadraticCurveTo(-2.40,.17,-2.08,.17);s.closePath();
    const g=new T.ExtrudeGeometry(s,{depth:.19,bevelEnabled:false,steps:1,curveSegments:6});g.computeVertexNormals();const loop=add(g,p.track,[side*1.43,0,0],[0,side*Math.PI/2,0],hull);loop.name=`leopard-track-loop-${side}`;
    for(let i=0;i<29;i++){const z=-2.08+i*.148;box(.035,.052,.118,p.trackPad,[side*1.635,.145,z]);box(.035,.052,.118,p.trackPad,[side*1.635,1.065,z]);}
    for(const end of [-1,1])for(let i=0;i<5;i++){const a=-.8+i*.4;box(.035,.12,.13,p.trackPad,[side*1.635,.60+a*.18,end*2.22],[end*.12,0,0]);}
    for(let i=0;i<7;i++){
      const z=-2.00+i*.66;const wheel=cyl(.282,.282,.19,18,p.wheel,[side*1.565,.59,z],[0,0,Math.PI/2]);wheel.userData.rollingWheel=true;wheel.name=`leopard-roadwheel-${side}-${i}`;
      cyl(.17,.17,.202,16,p.hub,[side*1.675,.59,z],[0,0,Math.PI/2]);cyl(.07,.07,.21,12,p.dark,[side*1.686,.59,z],[0,0,Math.PI/2]);
      for(let b=0;b<8;b++){const a=b*Math.PI/4;cyl(.016,.016,.214,6,p.metal,[side*1.69,.59+Math.sin(a)*.112,z+Math.cos(a)*.112],[0,0,Math.PI/2]);}
    }
    for(const z of [-2.24,2.24]){cyl(.22,.22,.19,16,p.wheel,[side*1.565,.59,z],[0,0,Math.PI/2]);cyl(.115,.115,.205,12,p.hub,[side*1.68,.59,z],[0,0,Math.PI/2]);}
  }

  // Longer Leopard chassis: blunt clipped rear, long sloped glacis and a nearly level top deck.
  loft([
    [-2.72,1.03,1.08,.97,.50,.82,1.12],
    [-2.38,1.21,1.30,1.23,.49,.95,1.42],
    [-1.98,1.33,1.38,1.37,.48,1.00,1.61],
    [-1.45,1.37,1.40,1.39,.48,1.02,1.64],
    [ 1.56,1.35,1.38,1.34,.50,1.00,1.59],
    [ 2.14,1.27,1.28,1.21,.53,.97,1.43],
    [ 2.50,1.10,1.13,1.06,.59,.91,1.19]
  ],p.hull,hull,'leopard-main-hull');
  box(2.30,.09,.78,p.hullTop,[0,1.37,-2.05],[-.22,0,0]);
  box(2.38,.12,.18,p.armorSide,[0,1.07,-2.51],[-.04,0,0]);
  box(2.06,.09,.60,p.hullTop,[0,1.35,2.00],[.09,0,0]);
  // Large rectangular engine grille field and several visible crosswise louvers.
  box(1.90,.055,.72,p.armorSide,[0,1.48,1.91],[.08,0,0]);
  for(let i=0;i<7;i++){const x=-.78+i*.26;box(.17,.035,.50,p.dark,[x,1.515,1.89],[.08,0,0]);for(let j=0;j<4;j++)box(.022,.018,.44,p.metal,[x-.05+j*.034,1.538,1.89],[.08,0,0]);}
  // Separate seven long side-skirt panels with narrow vertical gaps like the reference sheet.
  for(const side of [-1,1]){
    box(.17,.10,4.58,p.armorSide,[side*1.44,1.10,.0]);
    for(let i=0;i<7;i++){
      const z=-1.80+i*.56;
      box(.14,.42,.495,i%2?p.armor:p.armorSide,[side*1.47,.88,z],[0,side*(i===0||i===6?.025:0),0]);
      box(.014,.35,.022,p.dark,[side*1.545,.88,z+.251]);
      box(.05,.075,.18,p.armorSide,[side*1.54,1.14,z]);
    }
    box(.22,.15,.40,p.armor,[side*1.40,.76,-2.34],[0,side*.09,side*.10]);
    box(.18,.14,.34,p.armorSide,[side*1.42,.79,2.31],[0,-side*.06,-side*.07]);
    trackLoop(side);
  }
  // Headlights and rear tools are attached to the hull, never to the rotating turret.
  for(const side of [-1,1]){
    box(.19,.11,.12,p.dark,[side*.91,1.24,-2.39]);box(.12,.07,.04,p.lens,[side*.91,1.25,-2.45]);
    box(.18,.10,.30,p.armorSide,[side*1.02,1.28,2.28],[0,side*.12,0]);
  }

  const turret=new T.Group();turret.name='leopard-turret';turret.position.set(0,1.48,-.10);root.add(turret);
  // Distinct flatter Leopard turret, with long low nose and planar shoulders instead of the Abrams' taller rounded wedge.
  loft([
    [-1.52,.61,.55,.43,.055,.18,.40],
    [-1.28,.77,.70,.56,.04,.28,.61],
    [-.98,.94,.86,.72,.03,.39,.83],
    [-.62,1.025,.97,.87,.02,.49,.99],
    [-.16,1.04,1.00,.91,.02,.53,1.055],
    [ .35,1.02,.97,.88,.02,.51,1.02],
    [ .78,.96,.88,.78,.02,.42,.87],
    [1.10,.84,.75,.65,.02,.31,.68],
    [1.36,.71,.62,.53,.02,.24,.53],
    [1.48,.64,.56,.48,.02,.20,.45]
  ],p.turret,turret,'leopard-turret-shell');
  // Angular front cheek modules follow the wedge and remain flush with the main body.
  const cheek=[[.14,-1.40],[.42,-1.26],[.72,-.99],[.91,-.62],[.86,-.28],[.58,-.08],[.28,-.32]];
  for(const side of [-1,1]){
    prismX(cheek,.085,side*.92,p.turretShade,turret,`leopard-front-cheek-${side}`);
    prismX([[.34,-1.13],[.62,-.93],[.79,-.63],[.72,-.39],[.47,-.31]],.045,side*.984,p.armor,turret,`leopard-cheek-inset-${side}`);
    // Low side armor packages along the rear half, separate from the shell.
    box(.075,.32,.56,p.armorSide,[side*.91,.27,.25],[0,side*.04,0],turret);
    box(.075,.26,.48,p.turretShade,[side*.85,.22,.78],[0,side*-.04,0],turret);
    box(.065,.07,.63,p.armor,[side*.78,.83,.46],[0,side*.03,0],turret);
  }
  // Rectangular bustle is an integral low assembly, visibly separated by a narrow shadow seam.
  box(1.40,.28,.43,p.turretShade,[0,.285,1.02],[0,0,0],turret);
  box(1.18,.13,.035,p.dark,[0,.28,1.24],[0,0,0],turret);
  for(let i=0;i<6;i++)box(.12,.10,.03,p.armorSide,[-.52+i*.208,.29,1.258],[0,0,0],turret);
  // Functional pivot and long straight gun; the muzzle remains a child of the elevation group.
  const gun=new T.Group();gun.name='leopard-gun-pivot';gun.position.set(0,.53,-1.02);turret.add(gun);
  cyl(.28,.33,.41,16,p.turretShade,[0,0,-.035],[Math.PI/2,0,0],gun);
  cyl(.22,.25,.19,16,p.dark,[0,0,-.27],[Math.PI/2,0,0],gun);
  const barrel=add(new T.CylinderGeometry(.09,.125,3.82,18),p.barrel,[0,0,-1.97],[Math.PI/2,0,0],gun);barrel.name='leopard-main-barrel';
  cyl(.14,.14,.13,16,p.dark,[0,0,-3.82],[Math.PI/2,0,0],gun);
  cyl(.125,.125,.11,16,p.dark,[0,0,-3.98],[Math.PI/2,0,0],gun);
  // Low, individually mounted roof equipment: commander hatch, gunner sight, panoramic unit and smoke launchers.
  cyl(.22,.25,.085,16,p.turretShade,[-.52,.965,.22],[0,0,0],turret);
  cyl(.19,.21,.065,16,p.turretLight,[.48,.985,.45],[0,0,0],turret);
  box(.27,.15,.22,p.turretLight,[-.52,1.025,.22],[0,0,0],turret);
  box(.25,.11,.24,p.dark,[.48,1.075,.45],[0,0,0],turret);
  box(.17,.085,.14,p.optic,[.48,1.13,.44],[0,0,0],turret);
  box(.13,.05,.035,p.lens,[.48,1.13,.315],[0,0,0],turret);
  box(.23,.12,.18,p.armorSide,[-.02,1.01,-.02],[0,0,0],turret);
  box(.12,.07,.11,p.dark,[-.02,1.10,-.02],[0,0,0],turret);
  // Compact launcher tubes at the rear roof corners, aimed slightly outward.
  for(const side of [-1,1])for(let i=0;i<3;i++){
    const tube=cyl(.048,.048,.17,8,p.dark,[side*.70,.76,.68+i*.13],[Math.PI/2,0,side*.12],turret);tube.name=`leopard-smoke-launcher-${side}-${i}`;
  }
  cyl(.014,.014,.47,6,p.dark,[-.83,.94,.88],[0,0,0],turret);
  const muzzle=new T.Object3D();muzzle.position.set(0,0,-4.08);gun.add(muzzle);
  const muzzleGlow=new T.Mesh(new T.SphereGeometry(.23,8,6),new T.MeshBasicMaterial({color:'#ffb35c',transparent:true,opacity:0,depthWrite:false}));muzzleGlow.position.copy(muzzle.position);gun.add(muzzleGlow);
  root.userData.modelId='leopard';
  return {root,turret,gun,hull,barrel,muzzle,muzzleGlow,modules:{engine:[0,.90,1.65],radiator:[0,1.53,1.89],track:[1.52,.60,0],ammo:[0,1.56,.94],gun:[0,1.74,-.90]}};
}
