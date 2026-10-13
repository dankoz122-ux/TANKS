export const meta={
  id:'abrams',name:'M1A2 Abrams',
  description:'Low-poly модель по референсу: широкая клиновидная башня, отдельные щеки, кормовая ниша, семь катков и раздельные траки'
};

export function createTank(T,mat){
  const p={
    hull:new T.MeshStandardMaterial({color:'#a69b78',roughness:.92,flatShading:true}),
    hullTop:new T.MeshStandardMaterial({color:'#b4aa88',roughness:.91,flatShading:true}),
    armor:new T.MeshStandardMaterial({color:'#d0c6a5',roughness:.90,flatShading:true}),
    armorShade:new T.MeshStandardMaterial({color:'#918667',roughness:.93,flatShading:true}),
    turret:new T.MeshStandardMaterial({color:'#c4ba98',roughness:.9,flatShading:true,side:T.DoubleSide}),
    turretLight:new T.MeshStandardMaterial({color:'#d8cfb1',roughness:.9,flatShading:true}),
    turretSide:new T.MeshStandardMaterial({color:'#aaa080',roughness:.92,flatShading:true}),
    track:new T.MeshStandardMaterial({color:'#252622',roughness:.98}),
    trackPad:new T.MeshStandardMaterial({color:'#393a34',roughness:.98}),
    wheel:new T.MeshStandardMaterial({color:'#494940',roughness:.96}),
    hub:new T.MeshStandardMaterial({color:'#777566',roughness:.7,metalness:.2}),
    metal:new T.MeshStandardMaterial({color:'#777566',roughness:.58,metalness:.25}),
    barrel:new T.MeshStandardMaterial({color:'#68684f',roughness:.84,flatShading:true}),
    dark:new T.MeshStandardMaterial({color:'#252620',roughness:.84}),
    optic:new T.MeshStandardMaterial({color:'#182a26',roughness:.3,metalness:.12}),
    lens:new T.MeshStandardMaterial({color:'#426b63',roughness:.3,metalness:.16})
  };
  const root=new T.Group();root.name='M1A2_Abrams';
  const hull=new T.Group();hull.name='abrams-hull';root.add(hull);
  const add=(geo,material,pos,rot=[0,0,0],parent=hull)=>{
    const mesh=new T.Mesh(geo,material);mesh.position.set(...pos);mesh.rotation.set(...rot);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  };
  const box=(w,h,d,material,pos,rot=[0,0,0],parent=hull)=>add(new T.BoxGeometry(w,h,d),material,pos,rot,parent);
  const cyl=(rTop,rBottom,h,segments,material,pos,rot=[0,0,0],parent=hull)=>add(new T.CylinderGeometry(rTop,rBottom,h,segments),material,pos,rot,parent);

  // Closed six-sided cross-section loft: sloped lower hull sides and clipped glacis are real mesh faces, not stacked boxes.
  function loft(stations,material,parent,name){
    const v=[],idx=[],N=6;
    for(const [z,bw,sw,tw,by,sy,ty] of stations){
      v.push(-bw,by,z, bw,by,z, sw,sy,z, tw,ty,z, -tw,ty,z, -sw,sy,z);
    }
    for(let i=0;i<stations.length-1;i++){
      const a=i*N,b=(i+1)*N;
      for(let j=0;j<N;j++){const j2=(j+1)%N;idx.push(a+j,a+j2,b+j2,a+j,b+j2,b+j);}
    }
    for(let j=1;j<N-1;j++){idx.push(0,j,j+1);const last=(stations.length-1)*N;idx.push(last,last+j+1,last+j);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();
    const m=material.clone();m.side=T.DoubleSide;m.flatShading=true;
    const mesh=add(g,m,[0,0,0],[0,0,0],parent);mesh.name=name;return mesh;
  }
  function prismX(points,thickness,centerX,material,parent,name){
    const v=[],idx=[],n=points.length;
    for(const x of [centerX-thickness/2,centerX+thickness/2])for(const [y,z] of points)v.push(x,y,z);
    for(let j=1;j<n-1;j++){idx.push(0,j,j+1,n,n+j+1,n+j);}
    for(let j=0;j<n;j++){const k=(j+1)%n;idx.push(j,k,n+k,j,n+k,n+j);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();
    const m=material.clone();m.side=T.DoubleSide;m.flatShading=true;
    return add(g,m,[0,0,0],[0,0,0],parent).name=name;
  }
  function trackLoop(side){
    const s=new T.Shape();
    s.moveTo(-2.02,.17);s.lineTo(2.02,.17);s.quadraticCurveTo(2.37,.17,2.40,.52);s.lineTo(2.40,.71);s.quadraticCurveTo(2.37,1.05,2.02,1.05);s.lineTo(-2.02,1.05);s.quadraticCurveTo(-2.37,1.05,-2.40,.71);s.lineTo(-2.40,.52);s.quadraticCurveTo(-2.37,.17,-2.02,.17);s.closePath();
    const g=new T.ExtrudeGeometry(s,{depth:.19,bevelEnabled:false,steps:1,curveSegments:6});g.computeVertexNormals();
    const m=add(g,p.track,[side*1.43,0,0],[0,side*Math.PI/2,0],hull);m.name=side<0?'left-track-loop':'right-track-loop';
    // Draw the cleats as separate link pads around the top and bottom straight runs and around both ends.
    for(let i=0;i<27;i++){
      const z=-2.04+i*.157;
      box(.035,.055,.125,p.trackPad,[side*1.635,.145,z],[0,0,0]);
      box(.035,.055,.125,p.trackPad,[side*1.635,1.075,z],[0,0,0]);
    }
    for(const end of [-1,1])for(let i=0;i<5;i++){
      const a=(-.9+i*.45)*end;const z=end*2.20;
      box(.035,.12,.13,p.trackPad,[side*1.635,.60+a*.20,z],[end*.15,0,0]);
    }
    for(let i=0;i<7;i++){
      const z=-1.96+i*.653;
      const wheel=cyl(.286,.286,.19,18,p.wheel,[side*1.565,.59,z],[0,0,Math.PI/2]);wheel.userData.rollingWheel=true;wheel.name=`abrams-roadwheel-${side}-${i}`;
      cyl(.17,.17,.202,16,p.hub,[side*1.675,.59,z],[0,0,Math.PI/2]);
      cyl(.075,.075,.21,12,p.dark,[side*1.686,.59,z],[0,0,Math.PI/2]);
      for(let b=0;b<8;b++){const a=b*Math.PI/4;cyl(.018,.018,.214,6,p.metal,[side*1.69,.59+Math.sin(a)*.115,z+Math.cos(a)*.115],[0,0,Math.PI/2]);}
    }
    // Front idler and rear sprocket are distinct from the seven road wheels.
    for(const z of [-2.22,2.22]){
      cyl(.23,.23,.19,16,p.wheel,[side*1.565,.59,z],[0,0,Math.PI/2]);
      cyl(.12,.12,.205,12,p.hub,[side*1.68,.59,z],[0,0,Math.PI/2]);
    }
  }

  // Abrams hull profile: broad, flat-sided tub with a visibly sloped bow and compact clipped rear.
  loft([
    [-2.67,1.05,1.10,.97,.50,.82,1.15],
    [-2.34,1.22,1.31,1.24,.49,.96,1.43],
    [-1.90,1.34,1.39,1.38,.48,1.02,1.60],
    [-1.30,1.37,1.40,1.39,.48,1.02,1.63],
    [ 1.48,1.36,1.38,1.35,.50,1.00,1.58],
    [ 2.08,1.28,1.29,1.22,.53,.98,1.46],
    [ 2.48,1.12,1.15,1.08,.58,.91,1.20]
  ],p.hull,hull,'abrams-main-hull');
  // Raised glacis and front edge follow the underlying nose slope.
  box(2.30,.095,.76,p.hullTop,[0,1.365,-2.02],[-.22,0,0]);
  box(2.42,.12,.20,p.armorShade,[0,1.07,-2.47],[-.04,0,0]);
  box(2.06,.09,.58,p.hullTop,[0,1.345,1.99],[.10,0,0]);
  // Driver roof details and rear engine deck grilles.
  box(.64,.055,.46,p.armorShade,[-.69,1.48,-1.78],[-.20,0,0]);
  box(.64,.055,.46,p.armorShade,[.69,1.48,-1.78],[-.20,0,0]);
  for(let i=0;i<5;i++){
    const x=-.82+i*.41;box(.28,.045,.42,p.dark,[x,1.51,1.82],[.08,0,0]);
    for(let j=0;j<4;j++)box(.025,.018,.34,p.metal,[x-.105+j*.07,1.538,1.82],[.08,0,0]);
  }
  // Wide fenders and seven individually segmented side skirts.
  for(const side of [-1,1]){
    box(.18,.11,4.53,p.armorShade,[side*1.44,1.10,.02]);
    for(let i=0;i<7;i++){
      const z=-1.79+i*.555;
      box(.13,.43,.49,i%2?p.armor:p.hullTop,[side*1.46,.88,z],[0,side*(i===0||i===6?.025:0),0]);
      box(.012,.35,.025,p.dark,[side*1.53,.88,z+.248]);
    }
    box(.22,.15,.42,p.armor,[side*1.40,.76,-2.31],[0,side*.10,side*.11]);
    box(.18,.14,.34,p.armorShade,[side*1.42,.79,2.28],[0,-side*.07,-side*.08]);
    trackLoop(side);
  }
  // Hull lamps, tow points and tail lights.
  for(const side of [-1,1]){
    box(.19,.11,.12,p.dark,[side*.91,1.24,-2.37]);box(.12,.07,.04,p.lens,[side*.91,1.25,-2.43]);
    box(.13,.10,.24,p.armorShade,[side*1.02,1.28,2.28],[0,side*.12,0]);
    box(.08,.075,.05,p.dark,[side*.83,.96,2.47]);
  }

  // Turret is its own rotating assembly. Its shell is a closed low-poly mesh with the broad wedge and clipped bustle visible in the supplied sheet.
  const turret=new T.Group();turret.name='abrams-turret';turret.position.set(0,1.48,-.10);root.add(turret);
  loft([
    [-1.48,.62,.57,.43,.06,.20,.46],
    [-1.22,.80,.74,.61,.04,.33,.76],
    [-.88,.98,.92,.80,.03,.49,1.01],
    [-.42,1.045,1.02,.93,.02,.57,1.13],
    [ .30,1.04,1.00,.91,.02,.56,1.11],
    [ .72,.99,.93,.83,.02,.48,.98],
    [1.04,.88,.80,.70,.02,.38,.80],
    [1.30,.75,.68,.58,.02,.29,.61],
    [1.43,.67,.60,.53,.02,.24,.51]
  ],p.turret,turret,'abrams-turret-shell');
  // Large faceted front cheeks: separate tapered plates which lie against the shell, not floating cubes.
  const cheek=[ [.13,-1.34],[.53,-1.15],[.82,-.88],[.98,-.48],[.91,-.12],[.60,.00],[.25,-.22] ];
  for(const side of [-1,1]){
    prismX(cheek,.105,side*.91,p.turretSide,turret,`abrams-turret-cheek-${side}`);
    prismX([[.22,-.97],[.59,-.82],[.80,-.53],[.73,-.24],[.39,-.18]],.06,side*1.005,p.armor,turret,`abrams-cheek-face-${side}`);
    // Side modular fittings follow the turret's long side plane.
    box(.075,.30,.48,p.turretSide,[side*.925,.35,.38],[0,side*.04,0],turret);
    box(.09,.20,.31,p.armorShade,[side*.91,.22,.88],[0,side*-.05,0],turret);
    box(.06,.08,.64,p.armor,[side*.79,.90,.48],[0,side*.03,0],turret);
  }
  // Long, low rear bustle with a dark inset seam; the whole assembly is attached to the turret.
  box(1.38,.31,.42,p.turretSide,[0,.31,1.03],[0,0,0],turret);
  box(1.14,.16,.035,p.dark,[0,.30,1.245],[0,0,0],turret);
  for(let i=0;i<6;i++)box(.12,.115,.035,p.armorShade,[-.53+i*.212,.31,1.265],[0,0,0],turret);
  // Gun mount / barrel remain independently elevating.
  const gun=new T.Group();gun.name='abrams-gun-pivot';gun.position.set(0,.57,-1.03);turret.add(gun);
  cyl(.30,.36,.42,16,p.turretSide,[0,0,-.035],[Math.PI/2,0,0],gun);
  cyl(.235,.27,.20,16,p.dark,[0,0,-.29],[Math.PI/2,0,0],gun);
  const barrel=add(new T.CylinderGeometry(.095,.135,3.85,18),p.barrel,[0,0,-1.99],[Math.PI/2,0,0],gun);barrel.name='abrams-main-barrel';
  cyl(.15,.15,.14,16,p.dark,[0,0,-3.83],[Math.PI/2,0,0],gun);
  cyl(.135,.135,.12,16,p.dark,[0,0,-4.00],[Math.PI/2,0,0],gun);
  // Low roof fittings, correctly seated on top surface.
  cyl(.245,.27,.095,16,p.turretSide,[-.52,1.005,.20],[0,0,0],turret);
  cyl(.205,.23,.075,16,p.turretLight,[.50,1.02,.46],[0,0,0],turret);
  cyl(.12,.13,.04,12,p.dark,[-.52,1.063,.20],[0,0,0],turret);
  // Compact rectangular commander's cupola and gunner's sight.
  box(.34,.17,.28,p.turretLight,[-.52,1.11,.20],[0,0,0],turret);
  box(.25,.12,.25,p.dark,[.50,1.12,.46],[0,0,0],turret);
  box(.17,.095,.14,p.optic,[.50,1.18,.45],[0,0,0],turret);
  box(.13,.055,.04,p.lens,[.50,1.18,.305],[0,0,0],turret);
  box(.23,.13,.18,p.turretSide,[-.02,1.035,-.06],[0,0,0],turret);
  box(.12,.08,.12,p.dark,[-.02,1.135,-.06],[0,0,0],turret);
  cyl(.015,.015,.48,6,p.dark,[-.83,.99,.88],[0,0,0],turret);
  for(let i=0;i<3;i++)box(.09,.035,.12,p.dark,[.65+i*.105,.86,.75],[0,0,0],turret);
  const muzzle=new T.Object3D();muzzle.position.set(0,0,-4.10);gun.add(muzzle);
  const muzzleGlow=new T.Mesh(new T.SphereGeometry(.23,8,6),new T.MeshBasicMaterial({color:'#ffb35c',transparent:true,opacity:0,depthWrite:false}));muzzleGlow.position.copy(muzzle.position);gun.add(muzzleGlow);
  root.userData.modelId='abrams';
  return {root,turret,gun,hull,barrel,muzzle,muzzleGlow,modules:{engine:[0,.90,1.65],radiator:[0,1.53,1.82],track:[1.52,.60,0],ammo:[0,1.60,.95],gun:[0,1.78,-.92]}};
}
