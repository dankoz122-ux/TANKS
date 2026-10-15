
import * as THREE from 'three';
import { createTank as createT90 } from './tanks/t90.js';
import { createTank as createAbrams } from './tanks/abrams.js';
import { createTank as createLeopard } from './tanks/leopard.js';
import { createTank as createMerkava } from './tanks/merkava.js';
import { createXrayPanel } from './xray.js';
import { SHELLS, analyzeHit, buildXrayInfo, MODULE_RU } from './ballistics.js';
import { initBuilder } from './builder.js';
import { createPreview } from './preview.js';
import { createMultiplayer } from './mp.js';
import { customFactory } from './custom.js';
import { layoutSolidAt, ARENA, MAP_INFO, buildLayout } from './shared/world.js';
const canvas=document.querySelector('#view');const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
const scene=new THREE.Scene();scene.background=new THREE.Color('#7e948d');scene.fog=new THREE.Fog('#879b91',90,330);const camera=new THREE.PerspectiveCamera(57,innerWidth/innerHeight,.1,600);camera.position.set(0,7,13);
scene.add(new THREE.HemisphereLight(0xdce8dd,0x394436,2.1));const sun=new THREE.DirectionalLight(0xffedcf,3);sun.position.set(-40,60,20);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-80;sun.shadow.camera.right=80;sun.shadow.camera.top=80;sun.shadow.camera.bottom=-80;scene.add(sun);
const mat=(color,roughness=.86,metalness=.12)=>new THREE.MeshStandardMaterial({color,roughness,metalness});const green=mat('#59684b'),green2=mat('#718060'),dark=mat('#252b25'),rubber=mat('#1c211d'),steel=mat('#89918a',.42,.7),glass=mat('#243e3c',.28,.25),targetMat=mat('#c7bda3');
const ground=new THREE.Mesh(new THREE.PlaneGeometry(700,700),mat('#64705b'));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
// terrain details
for(let i=0;i<260;i++){let x=(Math.random()-.5)*360,z=(Math.random()-.5)*360;if(Math.abs(x)<14&&Math.abs(z)<22)continue;let m=new THREE.Mesh(new THREE.CircleGeometry(.15+Math.random()*.7,5),mat(Math.random()>.5?'#707b62':'#56634f'));m.rotation.x=-Math.PI/2;m.position.set(x,.012,z);m.receiveShadow=true;scene.add(m)}
const grid=new THREE.GridHelper(600,120,'#a7b4a1','#89998a');grid.position.y=.025;grid.material.transparent=true;grid.material.opacity=.12;scene.add(grid);
// target lanes and cover blocks
for(let z=-70;z<=-25;z+=15){let b=new THREE.Mesh(new THREE.BoxGeometry(5,.35,1.5),mat('#737b68'));b.position.set(15,.17,z);b.castShadow=true;b.receiveShadow=true;scene.add(b)}
const tank=new THREE.Group();scene.add(tank);
tank.scale.set(.88,.84,.88);tank.position.set(0,0,6);
// Player vehicle geometry comes from the separate per-tank modules. The combat systems keep using these live pivots.
let activeVehicleModel=null,hull=null,turret=null,gunPivot=null,barrel=null,muzzle=null,muzzleGlow=null;
const vehicleFactories={t90:createT90,abrams:createAbrams,leopard:createLeopard,merkava:createMerkava};
function mountVehicleModel(type){
  if(activeVehicleModel?.root){tank.remove(activeVehicleModel.root);}
  const factory=vehicleFactories[type]||createT90;
  activeVehicleModel=factory(THREE,mat);
  activeVehicleModel.root.name='vehicle-model-'+type;
  tank.add(activeVehicleModel.root);
  hull=activeVehicleModel.hull;turret=activeVehicleModel.turret;gunPivot=activeVehicleModel.gun;
  barrel=activeVehicleModel.barrel||null;muzzle=activeVehicleModel.muzzle||null;muzzleGlow=activeVehicleModel.muzzleGlow||null;
  if(!muzzle){muzzle=new THREE.Object3D();muzzle.position.set(0,0,-3.8);gunPivot.add(muzzle);}
  if(!muzzleGlow){muzzleGlow=new THREE.Mesh(new THREE.SphereGeometry(.25,8,6),new THREE.MeshBasicMaterial({color:'#ffb35c',transparent:true,opacity:0,depthWrite:false}));muzzleGlow.position.copy(muzzle.position);gunPivot.add(muzzleGlow);}
  tank.updateMatrixWorld(true);
}
// targets
const targets=[];const botTypes=['abrams','t90','leopard','merkava'];
const TANK_NAMES={t90:'Т-90М «Прорыв»',abrams:'M1A2 Abrams',leopard:'Leopard 2A7',merkava:'Merkava Mk.3'};let customTitle='Своя машина';
const maxShells=()=>activeVehicleModel?.traits?.ammo||24;
const xr=createXrayPanel(vehicleFactories);
function targetStates(t){return {engine:t.engine,ammo:t.ammo,crew:t.crew,gun:t.gunHp,fuel:t.fuel,track:t.track};}
function playerStates(){return {engine:modules.engine,ammo:modules.ammo,crew:modules.crew,gun:modules.gun,track:modules.track};}
function trackUpdate(model,dt,v,w){if(!model||!model.update)return;const b=1.45*.88;model.update(dt,(v-w*b)/.88,(v+w*b)/.88);}
// Каждый бот — настоящая модель танка со своими бронёй, модулями и особенностями.
function makeTarget(x,z,paint,type){
 type=type||botTypes[targets.length%botTypes.length];
 const g=new THREE.Group(),model=vehicleFactories[type](THREE);
 g.add(model.root);g.scale.setScalar(.88);g.position.set(x,0,z);g.rotation.y=Math.PI;scene.add(g);
 const target={group:g,model,type,hp:100,crew:100,ammo:100,engine:100,fuel:100,gunHp:100,track:100,alive:true,outline:new THREE.Object3D(),botTurret:model.turret,homeX:x,homeZ:z,phase:Math.random()*6.28,fireTimer:2+Math.random()*4,waypoint:0,aimTime:0,moveSpeed:1.25+Math.random()*.35,curSpeed:0,curYaw:0,botName:'BOT-'+String(targets.length+1).padStart(2,'0')+' · '+(TANK_NAMES[type]||type)};
 targets.push(target);return g}
function restoreTargetVisual(t){t.botTurret.visible=true;t.botTurret.rotation.set(0,0,0);t.fuel=100;t.gunHp=100;t.curSpeed=0;t.curYaw=0;}
makeTarget(0,-58,null,'abrams');makeTarget(-12,-92,null,'t90');makeTarget(16,-125,null,'leopard');
// Impact decals and atmospheric effects
const impactMarks=[];
function clearImpactMarks(){while(impactMarks.length){const m=impactMarks.pop();m.parent?.remove(m);m.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(x=>x.dispose());else o.material?.dispose()})}}
function addImpactMark(point,normal,penetrated,targetGroup,struckObject=null){
 // Декаль закрепляется на конкретной поверхности танка, поэтому не зависает в воздухе и движется вместе с башней/корпусом.
 const visuals=[];if(struckObject&&struckObject.isMesh&&!struckObject.userData.hitCollider&&!struckObject.userData.internalHit&&struckObject.visible)visuals.push(struckObject);else targetGroup.traverse(o=>{if(o.isMesh&&!o.userData.hitCollider&&!o.userData.internalHit&&o.visible&&!o.isInstancedMesh)visuals.push(o)});
 let chosen=null,surfacePoint=point.clone(),surfaceNormal=normal.clone();
 if(visuals.length){let best=Infinity;for(const obj of visuals){obj.updateMatrixWorld(true);const lp=obj.worldToLocal(point.clone());const box=obj.geometry?.boundingBox;if(!box)obj.geometry?.computeBoundingBox();const b=obj.geometry?.boundingBox;if(!b)continue;const clamped=lp.clone().clamp(b.min,b.max);const wp=obj.localToWorld(clamped.clone());const d=wp.distanceToSquared(point);if(d<best){best=d;chosen=obj;surfacePoint=wp;}}
  if(chosen){const q=chosen.getWorldQuaternion(new THREE.Quaternion());surfaceNormal=normal.clone().normalize();const localN=surfaceNormal.clone().applyQuaternion(q.clone().invert()).normalize();surfaceNormal=localN.applyQuaternion(q).normalize();}
 }
 const parent=chosen||targetGroup;parent.updateMatrixWorld(true);const localPoint=parent.worldToLocal(surfacePoint.clone());const localNormal=normal.clone().normalize().applyQuaternion(parent.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
 const group=new THREE.Group();group.position.copy(localPoint).addScaledVector(localNormal,.012);group.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),localNormal);parent.add(group);
 const r=penetrated?.16:.21;const hole=new THREE.Mesh(new THREE.CircleGeometry(r,14),new THREE.MeshBasicMaterial({color:penetrated?'#11110f':'#282821',side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3}));hole.position.z=.003;group.add(hole);
 const rim=new THREE.Mesh(new THREE.TorusGeometry(r*1.12,.025,5,16),new THREE.MeshStandardMaterial({color:penetrated?'#8a7960':'#aaa087',roughness:1}));rim.position.z=.006;group.add(rim);
 if(penetrated){const inner=new THREE.Mesh(new THREE.CircleGeometry(r*.48,12),new THREE.MeshBasicMaterial({color:'#050505',side:THREE.DoubleSide}));inner.position.z=.008;group.add(inner);}
 impactMarks.push(group);
 while(impactMarks.length>110){const old=impactMarks.shift();old.parent?.remove(old);old.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose()})}
}
let effectsLevel='normal',soundEnabled=true,audioCtx=null;function playSound(freq=110,duration=.12,kind='sawtooth',volume=.035){if(!soundEnabled)return;try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=kind;o.frequency.setValueAtTime(freq,audioCtx.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(35,freq*.42),audioCtx.currentTime+duration);g.gain.setValueAtTime(volume,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration)}catch(e){}}
function dustPuff(){const pos=tank.localToWorld(new THREE.Vector3((Math.random()-.5)*2,.12,2.35));const m=new THREE.Mesh(new THREE.SphereGeometry(.12+Math.random()*.18,6,5),new THREE.MeshBasicMaterial({color:'#b4ad91',transparent:true,opacity:.23,depthWrite:false}));m.position.copy(pos);m.userData.v=new THREE.Vector3((Math.random()-.5)*.45,.22,Math.random()*.6);m.userData.life=.45+Math.random()*.5;scene.add(m);fx.push(m)}
function burst(point,color='#ffb86a',count=12){count=Math.min(count*(effectsLevel==='low'?.45:effectsLevel==='high'?1.8:1),effectsLevel==='high'?100:55);for(let i=0;i<count;i++){const particle=new THREE.Mesh(new THREE.SphereGeometry(.035+Math.random()*.06,5,5),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9}));particle.position.copy(point);particle.userData.v=new THREE.Vector3((Math.random()-.5)*3,Math.random()*2,(Math.random()-.5)*3);particle.userData.life=.25+Math.random()*.45;scene.add(particle);fx.push(particle)}}const fx=[];
// HUD state
let mpOn=false,playerDead=false,mpRoom=null;const modules={engine:100,track:100,gun:100,crew:100,ammo:100,optics:100};let shells=24,shellType=0,reloading=false,shotCooldown=0,velocity=0,turn=0,turretYaw=0,gunPitch=0,aimX=0,aimY=0,camYaw=0,camPitch=.2,hitFlash=0,mode='drive',opticMode=false,selectedTank='t90';let vehicleExtras=null;const shellTypes=SHELLS;
const keys={};let editorTransformMode='move',editorAxis='x';
let reloadRemaining=0, pointerLocked=false, opticBeforePointer=false;let steeringResponse=0;
const DRIVE_TUNING={maxForward:15.2,maxReverse:5.2,accel:2.25,brake:4.1,steerRateLow:0.72,steerRateHigh:0.34,steerResponse:2.0};
const reloadTime=()=>activeVehicleModel?.traits?.reload||5.8;
function toggleOptic(){opticMode=!opticMode;document.body.classList.toggle('optic-on',opticMode);notify(opticMode?'Оптика включена · ПКМ для выхода':'Общий обзор')}
function requestAimLock(){if(!builderOpen&&canvas.requestPointerLock&&!pointerLocked){canvas.requestPointerLock();}}
document.addEventListener('pointerlockchange',()=>{pointerLocked=document.pointerLockElement===canvas;document.body.classList.toggle('pointer-locked',pointerLocked);if(pointerLocked){notify('Прицел захвачен · Esc освобождает курсор')} });
addEventListener('keydown',e=>{const k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k)&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))e.preventDefault();keys[k]=true;keys[e.code.toLowerCase()]=true;if(e.code==='Space'&&!builderOpen)fire();if(k==='r'&&!builderOpen)reload();if(k==='v'&&!builderOpen)toggleOptic();if(k==='x'&&!builderOpen){shellType=(shellType+1)%shellTypes.length;updateHUD();notify('Боеприпас: '+shellTypes[shellType].name)}});
addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false;keys[e.code.toLowerCase()]=false;});addEventListener('blur',()=>{for(const k in keys)keys[k]=false;joy.x=0;joy.y=0;});
let dragging=false,lastX=0,lastY=0,dragStartX=0,dragStartY=0;canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{if(builderOpen)return;if(e.pointerType==='mouse'){if(e.button===0){if(!pointerLocked){requestAimLock();fire()}else fire();}else if(e.button===2)toggleOptic();}else{dragging=true;lastX=dragStartX=e.clientX;lastY=dragStartY=e.clientY;canvas.setPointerCapture(e.pointerId)}});
canvas.addEventListener('pointerup',()=>{dragging=false});canvas.addEventListener('pointercancel',()=>dragging=false);
function aimByMouse(dx,dy){const sensitivity=opticMode?.00105:.00165;camYaw=THREE.MathUtils.clamp(camYaw-dx*sensitivity,-2.85,2.85);camPitch=THREE.MathUtils.clamp(camPitch-dy*sensitivity,-.22,.36);}
canvas.addEventListener('pointermove',e=>{if(builderOpen)return;if(!pointerLocked&&dragging&&e.pointerType!=='mouse'){let dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;aimByMouse(dx,dy)}});
addEventListener('mousemove',e=>{if(pointerLocked)aimByMouse(e.movementX,e.movementY)});
function notify(s){const el=document.querySelector('#toast');el.textContent=s;el.classList.add('show');clearTimeout(notify.t);notify.t=setTimeout(()=>el.classList.remove('show'),1800)}
function setModule(k,v){modules[k]=Math.max(0,Math.min(100,v));const text=document.querySelector('#'+k+'Text');if(text)text.textContent=Math.round(modules[k])+'%';const bar=document.querySelector('#'+k+'Bar i');if(bar)bar.style.width=modules[k]+'%';if(xr&&xr.self)xr.self.setStates(playerStates());if(modules[k]===0 && (k==='ammo'||k==='crew'))document.querySelector('#condition').textContent='УНИЧТОЖЕН';}
function updateHUD(){document.querySelector('#speed').textContent=Math.round(Math.abs(velocity)*3.6)+' км/ч';document.querySelector('#distance').textContent=Math.round((targets.some(t=>t.alive)?Math.min(...targets.filter(t=>t.alive).map(t=>tank.position.distanceTo(t.group.position))):0))+' м';document.querySelector('#ammoText').textContent=(shells>0?'ГОТОВ':'ПУСТО')+' · '+shells+' ост.'+(reloading?' · '+Math.max(0,reloadRemaining).toFixed(1)+'с':'');document.querySelector('#shellName').textContent=shellTypes[shellType].name;document.querySelector('#angle').textContent=Math.round(Math.abs(gunPitch)*180/Math.PI)+'°';document.querySelector('#armorValue').textContent='зависит от угла';}
// Ballistic, game-only projectile model inspired by vehicle-builder sims: travel time, gravity, drag, impact angle, ricochet and per-part armor values.
const liveProjectiles=[];
function spawnProjectile(){
 if(reloading||shotCooldown>0||playerDead)return;
 if(mp.active&&!mp.alive)return;
 if(shells<=0){notify('Боекомплект пуст');return}
 shells--;shotsFired++;shotCooldown=.25;playSound(95,.24,'sawtooth',.055);updateHUD();updateScore();
 tank.updateMatrixWorld(true);const origin=muzzle.getWorldPosition(new THREE.Vector3());
 const dir=new THREE.Vector3(0,0,-1).applyQuaternion(gunPivot.getWorldQuaternion(new THREE.Quaternion())).normalize();
 const shell=shellTypes[shellType];const speed=shell.speed;const sid=mp.active?mp.nextSid():0;if(mp.active)mp.sendFire(sid,origin,dir,shellType);
 const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.42,7),new THREE.MeshBasicMaterial({color:shellType===2?'#d5a76c':'#e9d5a1'}));
 mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);mesh.position.copy(origin);scene.add(mesh);
 const tracer=new THREE.Mesh(new THREE.SphereGeometry(.055,6,5),new THREE.MeshBasicMaterial({color:'#ffcf82'}));tracer.position.copy(origin);scene.add(tracer);
 liveProjectiles.push({mesh,tracer,sid,pos:origin.clone(),vel:dir.multiplyScalar(speed),life:5,shellType,penetration:shell.penetration*shell.energy*(activeVehicleModel?.traits?.penMul||1),previous:origin.clone()});
 burst(origin,'#ffdb8a',effectsLevel==='high'?14:7);const flash=new THREE.PointLight('#ffbb71',12,9);flash.position.copy(origin);scene.add(flash);setTimeout(()=>scene.remove(flash),70);
 document.querySelector('#lastResult').textContent='СНАРЯД В ПОЛЁТЕ';document.querySelector('#lastResult').style.color='#e9d5a1';
 if(shells>0){reloading=true;reloadRemaining=reloadTime();notify('Перезарядка · '+reloadRemaining.toFixed(1)+' с');}else{reloading=false;reloadRemaining=0;notify('Боекомплект израсходован');}
}
function zoneLabel(res){const f={F:'лоб',S:'борт',R:'корма'}[res.face];if(res.key==='roof')return 'крыша';if(res.zone==='track')return 'гусеница';return (f||'')+' '+(res.zone==='turret'?'башни':'корпуса');}
function damageBot(t,res,shell){
 const tr=t.model.traits||{};let text='',cookoff=null;if(!res.penetrates)return {text:'',destroyed:false,cookoff:null};
 const m=res.module,he=shell.he;
 if(res.zone==='track'){t.track=Math.max(0,t.track-(he?18:42));text='ходовая часть';}
 else if(he){t.hp=Math.max(0,t.hp-12);if(m==='crew')t.crew=Math.max(0,t.crew-10);text=m?MODULE_RU[m]+' (осколки)':'внешнее повреждение';}
 else if(m==='engine'){t.engine=Math.max(0,t.engine-45);text='двигатель';}
 else if(m==='ammo'){t.ammo=Math.max(0,t.ammo-70);text='боекомплект';}
 else if(m==='crew'){t.crew=Math.max(0,t.crew-38);text='экипаж';}
 else if(m==='gun'){t.gunHp=Math.max(0,t.gunHp-55);t.hp=Math.max(0,t.hp-10);text='орудие';}
 else if(m==='fuel'){t.fuel=Math.max(0,t.fuel-55);t.engine=Math.max(0,t.engine-12);text='топливо';}
 else{t.hp=Math.max(0,t.hp-10);text='пробитие без поражения модулей';}
 if(t.ammo<=0){if(tr.cookoff==='safe')t.gunHp=0;else cookoff=(res.moduleId==='ammoH'&&tr.cookoff==='blowout')?'catastrophic':tr.cookoff;}
 const destroyed=t.crew<=0||t.hp<=0||!!cookoff;
 return {text,destroyed,cookoff};
}
function destroyBot(t,point,cookoff,remote){
 if(!remote){score+=100;updateScore()}t.alive=false;t.group.rotation.z=.35;t.group.position.y=-.2;burst(point,'#ff7b35',effectsLevel==='high'?75:42);
 if(!cookoff){if(!remote)notify('ЦЕЛЬ УНИЧТОЖЕНА');return}
 t.group.updateMatrixWorld(true);const blast=t.group.localToWorld(new THREE.Vector3(0,1.6,0));burst(blast,'#ffd27a',effectsLevel==='high'?95:55);
 const fireball=new THREE.Mesh(new THREE.SphereGeometry(cookoff==='catastrophic'?2.2:1.5,12,10),new THREE.MeshBasicMaterial({color:'#ff682b',transparent:true,opacity:.82,depthWrite:false}));fireball.position.copy(blast);scene.add(fireball);fx.push(fireball);fireball.userData.v=new THREE.Vector3(0,.8,0);fireball.userData.life=1.1;fireball.userData.explosion=true;
 if(cookoff==='catastrophic'){const tur=t.botTurret;const detached=tur.clone(true);detached.position.copy(blast);detached.scale.setScalar(t.group.scale.x*t.model.root.scale.x);detached.rotation.set(-.6,t.group.rotation.y,.45);tur.visible=false;scene.add(detached);detached.userData.detachedTurret=true;detached.userData.v=new THREE.Vector3((Math.random()-.5)*4,5,(Math.random()-.5)*4);detached.userData.life=2.5;fx.push(detached);notify('ДЕТОНАЦИЯ БОЕКОМПЛЕКТА · БАШНЯ СОРВАНА');}
 else notify('БК ВОСПЛАМЕНИЛСЯ · вышибные панели сработали, башня уцелела');
}
function resolveProjectileImpact(hit,projectile,dir){
 const shell=shellTypes[projectile.shellType],obj=hit.object,point=hit.point.clone();
 const target=targets.find(t=>{let found=false;t.group.traverse(o=>{if(o===obj)found=true});return found});
 if(!target&&(obj.userData.cover||mapObjects.includes(obj))){if(obj.userData.cover){if(mpOn){if(projectile.sid)mp.sendCover(projectile.sid,obj.userData.id)}else{removeCover(obj.userData.id);score+=5;updateScore();notify('Укрытие разрушено')}}else{notify('Снаряд остановлен препятствием')}burst(point,'#b6a17b',effectsLevel==='high'?30:16);playSound(180,.12,'triangle',.025);document.querySelector('#lastResult').textContent=obj.userData.cover?'УКРЫТИЕ РАЗРУШЕНО':'ПРЕПЯТСТВИЕ';return}
 if(!target)return;
 if(target.net){resolveOnlineHit(target,hit,projectile,dir,shell);return}
 shotsHit++;score+=10;updateScore();hitHistory.unshift({name:target.botName||'ЦЕЛЬ',time:new Date().toLocaleTimeString(),zone:obj.userData.zone||'корпус'});if(hitHistory.length>12)hitHistory.pop();
 const res=analyzeHit({vehicle:target.model,hit,dir,shell,penetration:projectile.penetration});
 document.querySelector('#angle').textContent=Math.round(res.angle)+'°';document.querySelector('#armorValue').textContent=Math.round(res.effective)+' мм*';
 addImpactMark(point,res.normalWorld,res.penetrates,target.group,obj);burst(point,res.penetrates?'#ffb96b':'#d8d5a5',res.penetrates?24:12);playSound(res.penetrates?155:230,.09,'triangle',.03);
 const dmg=damageBot(target,res,shell);const lbl=zoneLabel(res);
 if(res.penetrates){
  document.querySelector('#lastResult').textContent='ПРОБИТИЕ';document.querySelector('#lastResult').style.color='#b7d87b';
  if(dmg.destroyed)destroyBot(target,point,dmg.cookoff);
  else if(target.track<=0)notify('Ходовая повреждена — цель обездвижена');else if(target.engine<=0)notify('Двигатель поражён — цель обездвижена');else if(target.gunHp<=0)notify('Орудие выведено из строя');else notify('Пробитие: '+dmg.text);
 }else{document.querySelector('#lastResult').textContent=res.ricochet?'РИКОШЕТ':'НЕ ПРОБИЛ';document.querySelector('#lastResult').style.color='#ffbd70';notify(res.ricochet?'Рикошет — слишком острый угол':'Броня не пробита')}
 xr.show(buildXrayInfo({vehicle:target.model,type:target.type,res,hit,dir,states:targetStates(target),turretYaw:target.botTurret.rotation.y,gunPitch:0,destroyed:dmg.destroyed,cookoff:dmg.cookoff,
  title:(TANK_NAMES[target.type]||target.type)+' · '+(res.ricochet?'рикошет':res.penetrates?dmg.text:'броня удержала'),
  sub:`Попадание: ${lbl}. Угол встречи ${Math.round(res.angle)}°, эффективная броня ≈${Math.round(res.effective)} мм против ${Math.round(projectile.penetration)} мм.`+(res.penetrates?(res.module?' Снаряд достиг модуля: '+MODULE_RU[res.module]+'.':' Внутри корпуса снаряд не задел модулей.'):'')+(dmg.cookoff?' '+(target.model.traits.label||''):'')}));
 document.querySelector('#hitmarker').style.opacity='1';setTimeout(()=>document.querySelector('#hitmarker').style.opacity='0',220);openComponents(false);
}
function resolveOnlineHit(target,hit,projectile,dir,shell){
 const obj=hit.object,point=hit.point.clone();shotsHit++;
 const res=analyzeHit({vehicle:target.model,hit,dir,shell,penetration:projectile.penetration});
 document.querySelector('#angle').textContent=Math.round(res.angle)+'°';document.querySelector('#armorValue').textContent=Math.round(res.effective)+' мм*';
 addImpactMark(point,res.normalWorld,res.penetrates,target.group,obj);impactFx(point,res.penetrates);
 document.querySelector('#hitmarker').style.opacity='1';setTimeout(()=>document.querySelector('#hitmarker').style.opacity='0',220);
 if(mp.isFriend(target)){notify('Огонь по своим — урон не засчитан');return}
 document.querySelector('#lastResult').textContent=res.penetrates?'ПРОБИТИЕ':res.ricochet?'РИКОШЕТ':'НЕ ПРОБИЛ';document.querySelector('#lastResult').style.color=res.penetrates?'#b7d87b':'#ffbd70';
 const xi=buildXrayInfo({vehicle:target.model,type:target.type,res,hit,dir,states:{},turretYaw:target.botTurret.rotation.y,gunPitch:target.model.gun?.rotation.x||0});
 mp.sendHit(projectile.sid,target,{zone:res.zone,key:res.key,face:res.face,module:res.module,moduleId:res.moduleId,penetrates:res.penetrates,ricochet:res.ricochet,angle:res.angle,effective:res.effective},{pointL:xi.pointL,dirL:xi.dirL,normalL:xi.normalL,pathLen:xi.pathLen,turretYaw:xi.turretYaw,gunPitch:xi.gunPitch});
}
function impactFx(p,pen){burst(p,pen?'#ffb96b':'#d8d5a5',pen?24:12);playSound(pen?155:230,.09,'triangle',.03)}
function showImpact(m,type,name,shooter){
 if(!m.xi||!m.xi.pointL)return;const r=m.r,st=m.st,lbl=zoneLabel({face:r.face,key:r.key,zone:r.zone});
 xr.show({type,pointL:m.xi.pointL,dirL:m.xi.dirL,normalL:m.xi.normalL,penetrates:r.penetrates,ricochet:r.ricochet,pathLen:m.xi.pathLen||0,hitModule:r.moduleId,moduleKind:r.module,destroyed:m.destroyed,cookoff:m.cookoff,states:{engine:st.engine,ammo:st.ammo,crew:st.crew,gun:st.gun,fuel:st.fuel,track:st.track},turretYaw:m.xi.turretYaw||0,gunPitch:m.xi.gunPitch||0,
  title:name+' · '+(r.ricochet?'рикошет':r.penetrates?m.text:'броня удержала'),
  sub:`Стрелял: ${shooter}. Попадание: ${lbl}. Угол встречи ${Math.round(r.angle)}°, эффективная броня ≈${Math.round(r.effective)} мм против ${m.pen} мм.`+(r.penetrates?(r.module?' Снаряд достиг модуля: '+MODULE_RU[r.module]+'.':' Внутри корпуса снаряд не задел модулей.'):'')});
}
function updateProjectiles(dt){
 const selfCols=[];if(mpOn)tank.traverse(o=>{if(o.isMesh&&o.userData.hitCollider)selfCols.push(o)});const hittables=[];targets.filter(t=>t.alive).forEach(t=>t.group.traverse(o=>{if(o.isMesh&&o.userData.hitCollider)hittables.push(o)}));coverObjects.forEach(o=>hittables.push(o));mapObjects.forEach(o=>{if(o.userData.solid!==false)hittables.push(o)});
 for(let i=liveProjectiles.length-1;i>=0;i--){const p=liveProjectiles[i];p.life-=dt;p.previous.copy(p.pos);p.vel.y-=9.81*dt;p.vel.multiplyScalar(1-.008*dt);p.pos.addScaledVector(p.vel,dt);
  const segment=p.pos.clone().sub(p.previous),distance=segment.length();let hit=null;if(distance>0){const ray=new THREE.Raycaster(p.previous,segment.normalize(),0,distance);const hits=ray.intersectObjects(p.remote?hittables.concat(selfCols):hittables,false);if(hits.length)hit=hits[0]}
  p.mesh.position.copy(p.pos);p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),p.vel.clone().normalize());p.tracer.position.copy(p.pos);
  if(hit){if(p.remote)burst(hit.point,'#d8d5a5',8);else resolveProjectileImpact(hit,p,p.vel.clone().normalize());scene.remove(p.mesh,p.tracer);p.mesh.geometry.dispose();p.mesh.material.dispose();p.tracer.geometry.dispose();p.tracer.material.dispose();liveProjectiles.splice(i,1)}else if(p.life<=0||p.pos.y<-.5||p.pos.distanceTo(p.previous)>30){scene.remove(p.mesh,p.tracer);p.mesh.geometry.dispose();p.mesh.material.dispose();p.tracer.geometry.dispose();p.tracer.material.dispose();liveProjectiles.splice(i,1)}
 }
}
function fire(){spawnProjectile();}
function reload(){if(reloading){notify('Перезарядка уже идёт');return}if(shells<=0){notify('Боекомплект пуст');return}reloading=true;reloadRemaining=reloadTime();notify('Заряжание · '+reloadRemaining.toFixed(1)+' с')}
function openComponents(show=true){if(show&&xr)xr.showSelf(selectedTank,playerStates(),turretYaw);const names=[['engine','Двигатель'],['track','Ходовая часть'],['gun','Орудие и привод'],['crew','Экипаж'],['ammo','Боекомплект'],['optics','Приборы наблюдения']];const el=document.querySelector('#componentList');el.innerHTML='';names.forEach(([k,n])=>{let v=modules[k],state=v>75?'НОРМА':v>0?'ПОВРЕЖДЁН':'ОТКАЗ';let c=document.createElement('div');c.className='component';c.innerHTML=`<span>${n}<div class="bar ${v<40?'red':''}" style="width:110px"><i style="width:${v}%;background:${v>75?'#b7d87b':v>0?'#ffbd70':'#ed785e'}"></i></div></span><b class="state ${v>75?'ok':v>0?'damaged':'destroyed'}">${state}</b>`;el.appendChild(c)});if(show)document.querySelector('#modal').classList.add('show')}
function setMode(m){mode=m;document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));document.querySelector(m==='drive'?'#tabDrive':m==='armor'?'#tabArmor':'#tabSystem').classList.add('active');if(m==='armor'){openComponents(true)}else if(m==='system'){document.querySelector('#modalTitle').textContent='СИСТЕМЫ И ПОВРЕЖДЕНИЯ';openComponents(true)}else{document.querySelector('#modal').classList.remove('show')}}
document.querySelector('#fireBtn').onclick=fire;document.querySelector('#fireTouch').onclick=fire;document.querySelector('#reloadTouch').onclick=reload;document.querySelector('#opticTouch').onclick=toggleOptic;document.querySelector('#cameraTouch').onclick=toggleOptic;document.querySelector('#shellTouch').onclick=()=>{shellType=(shellType+1)%shellTypes.length;updateHUD();notify('Боеприпас: '+shellTypes[shellType].name)};document.querySelector('#shellBtn').onclick=()=>{shellType=(shellType+1)%shellTypes.length;updateHUD();notify('Выбран тип: '+shellTypes[shellType].name)};document.querySelector('#xrayBtn').onclick=()=>{document.querySelector('#modalTitle').textContent='ВНУТРЕННЕЕ УСТРОЙСТВО · '+(TANK_NAMES[selectedTank]||customTitle);openComponents(true)};document.querySelector('#closeModal').onclick=()=>document.querySelector('#modal').classList.remove('show');document.querySelector('#tabDrive').onclick=()=>setMode('drive');document.querySelector('#tabArmor').onclick=()=>setMode('armor');document.querySelector('#tabSystem').onclick=()=>setMode('system');function openTankPicker(){if(mpOn){notify('Смена техники — только вне онлайн-комнаты');return}document.querySelector('#tankModal').classList.add('show')}
function applyTank(type){
 if(mpOn&&type!==selectedTank){notify('Техника меняется только вне онлайн-комнаты');return}
 selectedTank=vehicleFactories[type]?type:'t90';
 mountVehicleModel(selectedTank);
 turretYaw=0;gunPitch=0;turret.rotation.y=0;gunPivot.rotation.x=0;
 const nm=TANK_NAMES[selectedTank]||customTitle;
 document.querySelector('#tankName').textContent=nm;
 document.querySelector('#tankSelectBtn').textContent=nm;
 document.querySelector('#tankModal').classList.remove('show');
 shells=maxShells();reloading=false;reloadRemaining=0;
 updateHUD();notify('Выбран танк: '+nm+' · '+(activeVehicleModel.traits?.label||''));
}
document.querySelector('#tankSelectBtn').onclick=openTankPicker;document.querySelector('#tankTouch').onclick=openTankPicker;document.querySelector('#closeTankModal').onclick=()=>document.querySelector('#tankModal').classList.remove('show');document.querySelectorAll('[data-tank]').forEach(b=>b.onclick=()=>applyTank(b.dataset.tank));

document.querySelector('#resetBtn').onclick=()=>{if(mpOn)return;clearImpactMarks();score=0;shotsFired=0;shotsHit=0;updateScore();targets.forEach(t=>{t.hp=100;t.crew=100;t.ammo=100;t.engine=100;t.track=100;t.alive=true;t.group.visible=true;t.group.position.set(t.homeX,0,t.homeZ);t.group.rotation.set(0,Math.PI,0);restoreTargetVisual(t);t.fireTimer=2+Math.random()*3;t.aimTime=0});modules.engine=modules.track=modules.gun=modules.crew=modules.ammo=modules.optics=100;document.querySelector('#hitXray').classList.remove('show');roundLeft=roundSeconds;roundActive=false;document.querySelector('#roundText').textContent='1 · 03:00';targets.forEach(t=>{t.group.visible=true;t.group.position.set(t.homeX,0,t.homeZ);t.group.rotation.set(0,Math.PI,0);t.group.traverse(o=>{if(o.userData.hitCollider)o.visible=true})});Object.keys(modules).forEach(k=>modules[k]=100);shells=maxShells();reloading=false;reloadRemaining=0;shotCooldown=0;velocity=0;tank.position.set(0,0,6);document.querySelector('#condition').textContent='БОЕГОТОВ';updateHUD();['engine','track','gun'].forEach(k=>setModule(k,100));openComponents(false);notify('Полигон сброшен')};
// mobile virtual joystick
const pad=document.querySelector('#touchpad'),stick=document.querySelector('#stick');let joy={x:0,y:0};function joyMove(e){const r=pad.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=e.clientX-cx,dy=e.clientY-cy,len=Math.hypot(dx,dy),max=Math.max(16,Math.min(r.width,r.height)*.34);if(len>max){dx*=max/len;dy*=max/len}const baseX=(r.width-stick.offsetWidth)/2,baseY=(r.height-stick.offsetHeight)/2;stick.style.left=(baseX+dx)+'px';stick.style.top=(baseY+dy)+'px';joy.x=dx/max;joy.y=dy/max}pad.addEventListener('pointerdown',e=>{e.preventDefault();pad.setPointerCapture(e.pointerId);joyMove(e)});pad.addEventListener('pointermove',e=>{if(pad.hasPointerCapture(e.pointerId)||e.buttons)joyMove(e)});pad.addEventListener('pointerup',()=>{joy={x:0,y:0};stick.style.left=((pad.clientWidth-stick.offsetWidth)/2)+'px';stick.style.top=((pad.clientHeight-stick.offsetHeight)/2)+'px'});pad.addEventListener('pointercancel',()=>{joy={x:0,y:0};});
// Collision helpers: solid map geometry, cover and other vehicles block hull movement.
function circleHitsBox(x,z,r,obj){if(!obj||!obj.geometry||!obj.geometry.boundingBox)return false;obj.updateMatrixWorld(true);const p=obj.worldToLocal(new THREE.Vector3(x,0,z));const b=obj.geometry.boundingBox;const qx=THREE.MathUtils.clamp(p.x,b.min.x,b.max.x),qz=THREE.MathUtils.clamp(p.z,b.min.z,b.max.z);return (p.x-qx)**2+(p.z-qz)**2<r*r;}
function solidAt(x,z,who=null){const r=who==='player'?2.15:1.75;if(layoutSolidAt(curLayout,deadCovers,x,z,r))return true;for(const b of targets){if(!b.alive||b.group===who?.group)continue;if(Math.hypot(x-b.group.position.x,z-b.group.position.z)<r+2.1)return true;}if(who!=='player'&&Math.hypot(x-tank.position.x,z-tank.position.z)<r+2.15)return true;return false;}
function tryMoveVehicle(obj,dx,dz,who){const ox=obj.position.x,oz=obj.position.z;obj.position.x+=dx;if(solidAt(obj.position.x,obj.position.z,who))obj.position.x=ox;obj.position.z+=dz;if(solidAt(obj.position.x,obj.position.z,who))obj.position.z=oz;}
let botsEnabled=false;let botClock=0;let score=0,shotsFired=0,shotsHit=0;let botDifficulty='normal';let gameMode='range',roundSeconds=180,roundLeft=180,roundActive=false,roundWins=0,roundLosses=0,roundClock=0,coverObjects=[],damagePuffs=[];let qualityLevel='normal',dustClock=0,smokeClock=0;const hitHistory=[];let mapObjects=[];let mapRoundIndex=0;
const botButton=document.querySelector('#botsBtn');
function setBots(on){botsEnabled=on;botButton.textContent='БОТЫ: '+(botsEnabled?'ВКЛ':'ВЫКЛ');notify(botsEnabled?'Боты включены: патруль, разворот корпуса и отдельное наведение башни':'Боты отключены');}
botButton.onclick=()=>setBots(!botsEnabled);
const settingsModal=document.querySelector('#gameSettingsModal');document.querySelector('#gameSettingsBtn').onclick=()=>settingsModal.classList.add('show');document.querySelector('#settingsTouch').onclick=()=>settingsModal.classList.add('show');document.querySelector('#closeGameSettings').onclick=()=>settingsModal.classList.remove('show');
function spawnCovers(){}
function syncTargetCount(){const n=Number(document.querySelector('#botCount').value);while(targets.length<n){const i=targets.length;makeTarget((i%2?1:-1)*(12+Math.floor(i/2)*5),-70-i*18,['#777d6a','#8a806a','#6f776d','#85765f','#66786a','#8b8873'][i%6]);}targets.forEach((t,i)=>{t.alive=i<n;t.group.visible=i<n;if(i<n){t.hp=t.crew=t.ammo=t.engine=t.track=100;t.group.position.set(t.homeX,0,t.homeZ);t.group.rotation.set(0,Math.PI,0);restoreTargetVisual(t);t.fireTimer=2+Math.random()*3;t.aimTime=0;}})}
let curLayout={map:'range',seed:1,objects:[]},deadCovers=new Set();const coverById=new Map();
const arenaBorder=new THREE.Group();(function(){const{x0,x1,z0,z1}=ARENA,pts=[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];for(let i=0;i<4;i++){const a=pts[i],b=pts[(i+1)%4],len=Math.hypot(b[0]-a[0],b[1]-a[1]);const w=new THREE.Mesh(new THREE.PlaneGeometry(len,9),new THREE.MeshBasicMaterial({color:'#ff5a3c',transparent:true,opacity:.10,side:THREE.DoubleSide,depthWrite:false}));w.position.set((a[0]+b[0])/2,4.5,(a[1]+b[1])/2);w.rotation.y=Math.atan2(-(b[1]-a[1]),b[0]-a[0]);arenaBorder.add(w)}})();scene.add(arenaBorder);
function applyLayout(layout,dead){
 for(const o of mapObjects){scene.remove(o);o.geometry?.dispose();if(o.material&&!Array.isArray(o.material))o.material.dispose()}mapObjects=[];
 for(const o of coverObjects){scene.remove(o);o.geometry?.dispose();o.material?.dispose()}coverObjects=[];coverById.clear();
 curLayout=layout;deadCovers=new Set(dead||[]);
 if(!mpOn&&document.querySelector('#coverToggle').value==='off')for(const o of layout.objects)if(o.cover)deadCovers.add(o.id);
 const info=MAP_INFO[layout.map]||MAP_INFO.range;scene.background.set(info.bg);scene.fog.color.set(info.fog);ground.material.color.set(info.ground);
 for(const o of layout.objects){
  if(o.cover&&deadCovers.has(o.id))continue;
  const geo=o.kind==='box'?new THREE.BoxGeometry(...o.sz):o.kind==='dode'?new THREE.DodecahedronGeometry(o.sz[0],0):new THREE.CylinderGeometry(o.sz[0],o.sz[1],o.sz[2],8);
  const m=new THREE.Mesh(geo,mat(o.color,.92,.08));m.position.set(o.x,o.y,o.z);m.rotation.y=o.rot;m.castShadow=true;m.receiveShadow=true;m.userData.solid=true;m.userData.id=o.id;m.geometry.computeBoundingBox();scene.add(m);
  if(o.cover){m.userData.cover=true;coverObjects.push(m);coverById.set(o.id,m)}else mapObjects.push(m);
 }
}
function removeCover(id){const m=coverById.get(id);deadCovers.add(id);if(!m)return;burst(m.position.clone().setY(.8),'#b6a17b',14);scene.remove(m);coverObjects=coverObjects.filter(o=>o!==m);coverById.delete(id);m.geometry?.dispose();m.material?.dispose()}
function buildSelectedMap(){applyLayout(buildLayout(document.querySelector('#mapSelect').value,(Math.random()*4294967295)>>>0))}
function resetBotsForRound(){const n=Number(document.querySelector('#botCount').value);const map=document.querySelector('#mapSelect').value;const spawnSets={range:[[-12,-62],[12,-84],[-18,-108],[20,-125],[-30,-78],[30,-98]],desert:[[-35,-55],[34,-72],[-20,-105],[42,-125],[-45,-130],[8,-145]],dusk:[[-24,-45],[25,-60],[-38,-90],[40,-100],[-12,-132],[17,-145]]};const spots=spawnSets[map]||spawnSets.range;targets.forEach((t,i)=>{t.alive=i<n;t.group.visible=i<n;t.group.rotation.set(0,Math.PI,0);t.group.position.set(...[spots[i%spots.length][0],0,spots[i%spots.length][1]]);t.homeX=t.group.position.x;t.homeZ=t.group.position.z;t.hp=t.crew=t.ammo=t.engine=t.track=100;t.fireTimer=1+Math.random()*2;t.aimTime=0;t.moveSpeed=1.25+Math.random()*.35;restoreTargetVisual(t);t.group.traverse(o=>{if(o.userData.hitCollider)o.visible=true});});}
function startRound(){if(mpOn){effectsLevel=document.querySelector('#effectsLevel').value;soundEnabled=document.querySelector('#soundToggle').value==='on';qualityLevel=document.querySelector('#quality').value;renderer.setPixelRatio(Math.min(devicePixelRatio,qualityLevel==='low'?1:qualityLevel==='normal'?1.5:2));settingsModal.classList.remove('show');notify('Настройки графики применены (карта и режим задаются комнатой)');return}const map=document.querySelector('#mapSelect').value;buildSelectedMap();gameMode=document.querySelector('#gameMode').value;botDifficulty=document.querySelector('#difficulty').value;roundSeconds=Number(document.querySelector('#roundLength').value);roundLeft=roundSeconds;effectsLevel=document.querySelector('#effectsLevel').value;soundEnabled=document.querySelector('#soundToggle').value==='on';qualityLevel=document.querySelector('#quality').value;renderer.setPixelRatio(Math.min(devicePixelRatio,qualityLevel==='low'?1:qualityLevel==='normal'?1.5:2));syncTargetCount();resetBotsForRound();spawnCovers();roundActive=gameMode!=='range';roundClock=0;document.querySelector('#roundText').textContent='1 · '+String(Math.floor(roundLeft/60)).padStart(2,'0')+':'+String(Math.floor(roundLeft%60)).padStart(2,'0');setBots(gameMode!=='range');settingsModal.classList.remove('show');document.querySelector('#roundBanner').textContent=gameMode==='team'?'КОМАНДНЫЙ РЕЖИМ · ИГРОВАЯ СИМУЛЯЦИЯ':gameMode==='survival'?'РЕЖИМ ВЫЖИВАНИЯ':'РАУНД НАЧАЛСЯ';document.querySelector('#roundBanner').classList.add('show');setTimeout(()=>document.querySelector('#roundBanner').classList.remove('show'),2200);notify('Режим применён · сложность: '+({easy:'лёгкая',normal:'обычная',hard:'сложная'}[botDifficulty]));}
document.querySelector('#startRoundBtn').onclick=startRound;document.querySelector('#respawnBtn').onclick=()=>{if(mpOn){mp.suicide();return}tank.position.set(0,0,6);tank.rotation.set(0,0,0);velocity=0;shells=maxShells();reloading=false;reloadRemaining=0;shotCooldown=0;Object.keys(modules).forEach(k=>setModule(k,100));document.querySelector('#condition').textContent='БОЕГОТОВ';updateHUD();notify('Игрок возрождён · БК пополнен')};document.querySelector('#statsBtn').onclick=()=>{document.querySelector('#statsContent').innerHTML=`<div class="component"><span>Очки</span><b>${score}</b></div><div class="component"><span>Выстрелы</span><b>${shotsFired}</b></div><div class="component"><span>Попадания</span><b>${shotsHit}</b></div><div class="component"><span>Точность</span><b>${shotsFired?Math.round(shotsHit/shotsFired*100):0}%</b></div><div class="component"><span>Раунды выиграны</span><b>${roundWins}</b></div><div class="component"><span>Раунды проиграны</span><b>${roundLosses}</b></div>${hitHistory.length?'<div class="component"><span>Последние попадания</span><b>'+hitHistory.map(h=>h.time+' · '+h.name+' · '+h.zone).join('<br>')+'</b></div>':''}`;document.querySelector('#statsModal').classList.add('show')};document.querySelector('#closeStats').onclick=()=>document.querySelector('#statsModal').classList.remove('show');

function updateScore(){if(mpOn)return;const e=document.querySelector('#scoreText');if(e)e.textContent=score+' / '+shotsHit;}
function botHitsPlayer(b,start,end){
 const dir=end.clone().sub(start).normalize();tank.updateMatrixWorld(true);
 const cols=[];tank.traverse(o=>{if(o.userData.hitCollider)cols.push(o)});
 const hit=new THREE.Raycaster(start,dir,0,start.distanceTo(end)+8).intersectObjects(cols,false)[0];
 burst(end,'#ff8059',effectsLevel==='high'?20:9);playSound(62,.18,'triangle',.025);
 if(!hit){notify('Бот промахнулся');return}
 const pen=({easy:560,normal:650,hard:740})[botDifficulty]||650,shell={kind:0,he:false};
 const res=analyzeHit({vehicle:activeVehicleModel,hit,dir,shell,penetration:pen});let text='';
 if(!res.penetrates){notify(res.ricochet?'Рикошет от вашей брони':'Ваша броня выдержала попадание ('+zoneLabel(res)+')');text=res.ricochet?'рикошет':'броня удержала';}
 else{const m=res.module;const take=(k,v)=>setModule(k,modules[k]-v);
  if(res.zone==='track'||m==='track'){take('track',26);text='ходовая часть';}
  else if(m==='engine'){take('engine',24);text='двигатель';}
  else if(m==='fuel'){take('engine',14);text='топливо';}
  else if(m==='gun'){take('gun',24);text='орудие';}
  else if(m==='crew'){take('crew',28);text='экипаж';}
  else if(m==='ammo'){take('ammo',28);text='боекомплект';if(modules.ammo<=0){modules.crew=Math.max(0,modules.crew-30);document.querySelector('#condition').textContent='БК ПОВРЕЖДЁН';}}
  else{take('optics',14);text='приборы наблюдения';}
  if(modules.engine<=0||modules.track<=0)velocity=0;if(modules.gun<=0)shotCooldown=Math.max(shotCooldown,1.2);
  notify('Попадание по вам: '+text);}
 xr.show(buildXrayInfo({vehicle:activeVehicleModel,type:selectedTank,res,hit,dir,states:playerStates(),turretYaw,gunPitch,destroyed:modules.crew<=0,cookoff:null,
  title:'ПО ВАМ · '+text,sub:`Попадание: ${zoneLabel(res)}. Угол ${Math.round(res.angle)}°, эффективная броня ≈${Math.round(res.effective)} мм против ${pen} мм.`}));
}
function botFire(b,dist){
 if(b.gunHp<=0)return;b.model.root.updateMatrixWorld(true);const start=b.model.muzzle.getWorldPosition(new THREE.Vector3());const end=tank.position.clone().add(new THREE.Vector3(0,1.15,0));
 // Bot must rotate its turret toward the player, settle its aim, and have clear line of sight.
 const dx=tank.position.x-b.group.position.x,dz=tank.position.z-b.group.position.z;const desired=Math.atan2(-dx,-dz);const rel=THREE.MathUtils.euclideanModulo(desired-b.group.rotation.y+Math.PI,Math.PI*2)-Math.PI;const aimError=Math.abs(THREE.MathUtils.euclideanModulo(desired-(b.group.rotation.y+b.botTurret.rotation.y)+Math.PI,Math.PI*2)-Math.PI);
 if(Math.abs(rel)>1.0||aimError>.16||b.aimTime<1.05)return;
 const rayDir=end.clone().sub(start),rayLen=rayDir.length();rayDir.normalize();const blocks=[...mapObjects,...coverObjects];if(blocks.length){const rc=new THREE.Raycaster(start,rayDir,0,rayLen);if(rc.intersectObjects(blocks,false).length)return;}
 const points=[start,end],geo=new THREE.BufferGeometry().setFromPoints(points),line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:'#ff9b70',transparent:true,opacity:.72}));scene.add(line);setTimeout(()=>{scene.remove(line);geo.dispose();line.material.dispose()},140);
 const base=botDifficulty==='easy'?.25:botDifficulty==='hard'?.52:.38;const chance=Math.min(.58,Math.max(.08,base-dist/280))*(b.aimTime>2?1:.62);
 if(Math.random()<chance)botHitsPlayer(b,start,end);
}
function updateMinimap(){const c=document.querySelector('#minimapCanvas');if(!c)return;const ctx=c.getContext('2d'),w=c.width,h=c.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='#142018';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#415440';ctx.lineWidth=1;for(let i=12;i<w;i+=18){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,h);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(w,i);ctx.stroke()}const scale=.62;function dot(x,z,color,r){const px=w/2+(x-tank.position.x)*scale,py=h/2+(z-tank.position.z)*scale;if(px>-5&&py>-5&&px<w+5&&py<h+5){ctx.fillStyle=color;ctx.beginPath();ctx.arc(px,py,r,0,Math.PI*2);ctx.fill()}}dot(tank.position.x,tank.position.z,'#d9f2a5',4);for(const b of targets)if(b.alive&&b.group.visible)dot(b.group.position.x,b.group.position.z,mpOn?(mp.isFriend(b)?'#63b0ff':'#ff6f5e'):botsEnabled?'#f08c6a':'#a9b3a0',3)}
function updateGunReticle(muzzleWorld,gunWorldQ){
 // War Thunder-like aiming: the sight stays at screen centre; turret and gun slew toward it with inertia.
 const el=document.querySelector(".crosshair");
 el.style.left="50%";el.style.top="50%";el.style.opacity=".96";
}
document.querySelector('#multiplayerBtn')?.addEventListener('click',()=>{settingsModal.classList.remove('show');mp.openLobby()});document.querySelector('#onlineBtn')?.addEventListener('click',()=>mp.openLobby());
let last=performance.now();function animate(now){requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.04);last=now;if(builderOpen){builder.frame(dt);return;}mp.update(dt);updateProjectiles(dt);shotCooldown=Math.max(0,shotCooldown-dt);if(reloading){reloadRemaining=Math.max(0,reloadRemaining-dt);if(reloadRemaining<=0){reloading=false;notify('Орудие заряжено');}}botClock+=dt;if(botsEnabled){for(const b of targets){if(!b.alive||b.track<=0||b.engine<=0)continue;
 b.curSpeed=0;b.curYaw=0;const px=tank.position.x,pz=tank.position.z,dx=px-b.group.position.x,dz=pz-b.group.position.z,dist=Math.hypot(dx,dz)||1;
 // Four-point patrol route. Chassis faces the direction it actually travels: no sideways sliding.
 const patrol=[[-5,0],[4,-4],[5,5],[-4,4]],wp=patrol[b.waypoint%patrol.length],tx=b.homeX+wp[0],tz=b.homeZ+wp[1];let mx=tx-b.group.position.x,mz=tz-b.group.position.z,md=Math.hypot(mx,mz);
 if(md<1.15){b.waypoint=(b.waypoint+1)%patrol.length;mx=tx-b.group.position.x;mz=tz-b.group.position.z;md=Math.hypot(mx,mz)||1;}
 if(dist<28){mx=dx;mz=dz;md=dist;}else if(dist>70){/* keep patrolling instead of chasing across the whole map */}
 if(md>.01){const desiredYaw=Math.atan2(-mx,-mz);let yawDelta=THREE.MathUtils.euclideanModulo(desiredYaw-b.group.rotation.y+Math.PI,Math.PI*2)-Math.PI;const dyaw=THREE.MathUtils.clamp(yawDelta,-1.05*dt,1.05*dt);b.group.rotation.y+=dyaw;b.curYaw=dyaw/dt;const facing=Math.cos(yawDelta);if(Math.abs(yawDelta)<.22){const speed=b.moveSpeed*(dist<18?.35:1);b.curSpeed=speed;tryMoveVehicle(b.group,-Math.sin(b.group.rotation.y)*speed*dt,-Math.cos(b.group.rotation.y)*speed*dt,b);}}
 const aimYaw=Math.atan2(-dx,-dz),relYaw=THREE.MathUtils.euclideanModulo(aimYaw-b.group.rotation.y+Math.PI,Math.PI*2)-Math.PI;if(b.botTurret){const ty=b.botTurret.rotation.y;let dty=THREE.MathUtils.euclideanModulo(relYaw-ty+Math.PI,Math.PI*2)-Math.PI;b.botTurret.rotation.y+=THREE.MathUtils.clamp(dty,-.85*dt,.85*dt);const remainingAim=Math.abs(THREE.MathUtils.euclideanModulo(relYaw-b.botTurret.rotation.y+Math.PI,Math.PI*2)-Math.PI);if(remainingAim<.16)b.aimTime+=dt;else b.aimTime=Math.max(0,b.aimTime-dt*.7);}
 b.fireTimer-=dt;if(b.fireTimer<=0&&dist<80){b.fireTimer=(botDifficulty==='hard'?3.5:botDifficulty==='easy'?7:5)+Math.random()*2.5;botFire(b,dist);}
 }}if(roundActive){roundLeft=Math.max(0,roundLeft-dt);const rem=Math.ceil(roundLeft);document.querySelector('#roundText').textContent=Math.floor(rem/60)+':'+String(rem%60).padStart(2,'0');const alive=targets.filter(t=>t.alive).length;if((gameMode!=='survival'&&alive===0)||roundLeft<=0){roundActive=false;if(alive===0)roundWins++;else roundLosses++;document.querySelector('#roundBanner').textContent='РАУНД ЗАВЕРШЁН · '+(alive===0?'ПОБЕДА':'ВРЕМЯ ВЫШЛО');document.querySelector('#roundBanner').classList.add('show');setTimeout(()=>document.querySelector('#roundBanner').classList.remove('show'),3000);setBots(false);}}dustClock+=dt;smokeClock+=dt;if(Math.abs(velocity)>.8&&dustClock>.09){dustClock=0;if(effectsLevel!=='low')dustPuff()}if(smokeClock>.55){smokeClock=0;for(const b of targets){if(b.alive&&b.engine<45){const pt=b.group.localToWorld(new THREE.Vector3(.4,1.2,b.type==='merkava'?-1.5:1.5));const m=new THREE.Mesh(new THREE.SphereGeometry(.10+Math.random()*.08,5,4),new THREE.MeshBasicMaterial({color:b.engine<15?'#ff632b':'#3b403b',transparent:true,opacity:b.engine<15?.7:.32,depthWrite:false}));m.position.copy(pt);m.userData.v=new THREE.Vector3((Math.random()-.5)*.25,.35,(Math.random()-.5)*.25);m.userData.life=.8+Math.random()*.5;scene.add(m);fx.push(m)}}}trackUpdate(activeVehicleModel,dt,velocity,steeringResponse);for(const b of targets){if(b.alive&&botsEnabled&&b.group.visible&&b.track>0&&b.engine>0)trackUpdate(b.model,dt,b.curSpeed,b.curYaw)}for(let i=fx.length-1;i>=0;i--){const p=fx[i];p.userData.life-=dt;p.position.addScaledVector(p.userData.v||new THREE.Vector3(),dt);if(p.userData.explosion){p.material.opacity=Math.max(0,p.userData.life*.75);p.scale.multiplyScalar(1+dt*2.8)}else if(p.userData.detachedTurret){p.userData.v.y-=9*dt;p.rotation.x+=dt*1.8;p.rotation.z+=dt*1.2}else{p.userData.v.y-=2.8*dt;p.material.opacity=Math.max(0,p.userData.life*1.8);p.scale.multiplyScalar(1+dt*1.5)}if(p.userData.life<=0){scene.remove(p);p.traverse?.(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose()});if(p.geometry)p.geometry.dispose();if(p.material)p.material.dispose();fx.splice(i,1)}}const held=(...names)=>names.some(n=>keys[n]===true);let f=(builderOpen||playerDead)?0:(held('w','arrowup','keyw')?1:0)+(held('s','arrowdown','keys')?-1:0)-joy.y;let steer=(builderOpen||playerDead)?0:(held('a','arrowleft','keya')?1:0)+(held('d','arrowright','keyd')?-1:0)-joy.x;f=THREE.MathUtils.clamp(f,-1,1);steer=THREE.MathUtils.clamp(steer,-1,1);const engineFactor=modules.engine>0?(.35+.65*modules.engine/100):0;const trackFactor=modules.track<20?.35:modules.track<45?.62:1;const maxForward=(activeVehicleModel?.traits?.maxSpeed||DRIVE_TUNING.maxForward)*engineFactor*trackFactor;const maxReverse=DRIVE_TUNING.maxReverse*engineFactor*trackFactor;const targetVelocity=f>=0?f*maxForward:f*maxReverse;const accel=Math.abs(targetVelocity)<Math.abs(velocity)?DRIVE_TUNING.brake:DRIVE_TUNING.accel;velocity+=THREE.MathUtils.clamp(targetVelocity-velocity,-accel*dt,accel*dt);if(Math.abs(velocity)<.025&&f===0)velocity=0;const speedRatio=Math.min(1,Math.abs(velocity)/DRIVE_TUNING.maxForward);const desiredSteering=steer*(DRIVE_TUNING.steerRateLow-(DRIVE_TUNING.steerRateLow-DRIVE_TUNING.steerRateHigh)*speedRatio);steeringResponse=THREE.MathUtils.damp(steeringResponse,desiredSteering,DRIVE_TUNING.steerResponse,dt);tank.rotation.y+=steeringResponse*dt;tryMoveVehicle(tank,-Math.sin(tank.rotation.y)*velocity*dt,-Math.cos(tank.rotation.y)*velocity*dt,'player');if(modules.track<40)velocity*=.997;// Gunner-style controls: camera azimuth/elevation drives turret and gun with realistic slew limits.
const turretLimit=2.75;const desiredTurret=THREE.MathUtils.clamp(camYaw,-turretLimit,turretLimit);if(modules.gun<45)camYaw*=.985;if(modules.optics<35)camYaw*=.992;const turretRate=(activeVehicleModel?.traits?.turretRate||0.68)*(modules.gun<=0?.12:modules.gun<40?.45:1);let td=THREE.MathUtils.euclideanModulo(desiredTurret-turretYaw+Math.PI,Math.PI*2)-Math.PI;turretYaw+=THREE.MathUtils.clamp(td,-turretRate*dt,turretRate*dt);const desiredPitch=THREE.MathUtils.clamp(camPitch,-(activeVehicleModel?.traits?.gunDepress??.16),activeVehicleModel?.traits?.gunElev??.30);const gunRate=(activeVehicleModel?.traits?.gunRate||0.38)*(modules.gun<=0?.1:modules.gun<40?.45:1);gunPitch+=THREE.MathUtils.clamp(desiredPitch-gunPitch,-gunRate*dt,gunRate*dt);turret.rotation.y=turretYaw;gunPivot.rotation.x=gunPitch;tank.updateMatrixWorld(true);const muzzleWorld=new THREE.Vector3();muzzle.getWorldPosition(muzzleWorld);const gunWorldQ=gunPivot.getWorldQuaternion(new THREE.Quaternion());const worldAimYaw=tank.rotation.y+camYaw;const aimDir=new THREE.Vector3(-Math.sin(worldAimYaw)*Math.cos(camPitch),Math.sin(camPitch),-Math.cos(worldAimYaw)*Math.cos(camPitch)).normalize();if(opticMode){const eye=gunPivot.localToWorld(new THREE.Vector3(0,.24,.72));camera.position.copy(eye);camera.lookAt(eye.clone().addScaledVector(aimDir,100));camera.fov=16;}else{const focus=tank.position.clone().add(new THREE.Vector3(0,1.55,0));const dist=THREE.MathUtils.clamp(11+Math.abs(camPitch)*2,9,15);const orbitYaw=worldAimYaw;const desired=new THREE.Vector3(focus.x+Math.sin(orbitYaw)*dist,focus.y+2.35+camPitch*3,focus.z+Math.cos(orbitYaw)*dist);camera.position.lerp(desired,1-Math.pow(.001,dt));camera.lookAt(camera.position.clone().addScaledVector(aimDir,100));camera.fov=57;}camera.updateProjectionMatrix();updateGunReticle(muzzleWorld,gunWorldQ);tank.visible=!opticMode;updateHUD();updateMinimap();xr.update(dt);xr.render(renderer);preview.frame(dt,renderer);renderer.render(scene,camera)}requestAnimationFrame(animate);addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});updateHUD();openComponents(false);applyTank('t90');

// Мастерская (Sprocket-подобный конструктор) — отдельный модуль builder.js со своей сценой.
let builderOpen=false;
const builder=initBuilder({THREE,renderer,canvas,notify,
 onOpen(){builderOpen=true;opticMode=false;document.body.classList.remove('optic-on');document.body.classList.add('builder-on');if(document.pointerLockElement)document.exitPointerLock();xr.hide();},
 onClose(){builderOpen=false;document.body.classList.remove('builder-on');notify('Возврат в симулятор');},
 onUse(factory,title){vehicleFactories.custom=factory;customTitle=title||'Своя машина';xr.invalidate('custom');applyTank('custom');}
});
document.querySelector('#openBuilderBtn').onclick=()=>{if(mpOn){notify('Мастерская недоступна в онлайн-комнате — выйдите из неё');return}builder.open()};
// First-start flow: let the player set a nickname and choose one of the independent model files.
let startTankChoice='t90';
const preview=createPreview(document.querySelector('#startPreview'),vehicleFactories);
function showSpecs(type){
 const m=preview.setType(type);if(!m)return;const t=m.traits||{},d=m.dims||{};
 const row=(a,b)=>`<div class="spec"><span>${a}</span><b>${b}</b></div>`;
 document.querySelector('#startSpecs').innerHTML=row('Макс. скорость',Math.round((t.maxSpeed||15)*3.6)+' км/ч')+row('Перезарядка',(t.reload||5).toFixed(1)+' с'+(t.loader==='carousel'?' · автомат':' · заряжающий'))+row('Боекомплект',(t.ammo||24)+' выстр.')+row('Склонение / возвышение','−'+Math.round((t.gunDepress||.16)*57.3)+'° / +'+Math.round((t.gunElev||.3)*57.3)+'°')+row('Габариты',(d.hullL||'—')+' × '+(d.width||'—')+' м')+`<div class="spec-note">${t.label||''}</div>`;
}
document.querySelectorAll('[data-start-tank]').forEach(btn=>btn.addEventListener('click',()=>{
 startTankChoice=btn.dataset.startTank;
 document.querySelectorAll('[data-start-tank]').forEach(b=>b.classList.toggle('active',b===btn));
 showSpecs(startTankChoice);
}));
showSpecs(startTankChoice);
function enterWorld(online){
 const input=document.querySelector('#playerNick');
 const nickname=(input.value||'').trim().slice(0,24);
 if(!nickname){input.focus();input.setCustomValidity('Введи никнейм');input.reportValidity();return;}
 input.setCustomValidity('');
 applyTank(startTankChoice);
 document.querySelector('.brand small').textContent='ИГРОК · '+nickname;
 document.querySelector('#startScreen').classList.add('hidden');preview.hide();
 if(online)mp.openLobby();else notify('Добро пожаловать, '+nickname);
}
document.querySelector('#enterGameBtn').addEventListener('click',()=>enterWorld(false));
document.querySelector('#playOnlineBtn')?.addEventListener('click',()=>enterWorld(true));

// ───── Мультиплеер ─────
const mp=createMultiplayer({THREE,scene,targets,vehicleFactories,customFactory,xr,notify,trackUpdate,makeTarget,applyLayout,removeCover,showImpact,impactFx,
 getNick:()=>(document.querySelector('#playerNick').value||'').trim()||'Танкист',
 getLoadout:()=>({tank:selectedTank,design:selectedTank==='custom'?activeVehicleModel.design:null,traits:selectedTank==='custom'?activeVehicleModel.traits:null,label:TANK_NAMES[selectedTank]||customTitle}),
 getSelf:()=>({x:tank.position.x,z:tank.position.z,yaw:tank.rotation.y,ty:turretYaw,gp:gunPitch,v:velocity,w:steeringResponse}),
 setSelfPose(x,z,yaw){tank.position.x=x;tank.position.z=z;velocity=0},
 selfRoot:()=>activeVehicleModel.root,selfType:()=>selectedTank,
 setShells(n){shells=n;updateHUD()},
 setSelfStates(st){for(const k of ['engine','track','gun','crew','ammo','optics'])if(st[k]!==undefined)setModule(k,st[k]);if(xr.self)xr.self.setStates(playerStates())},
 hitFlash:()=>{hitFlash=1},scorePing(){document.querySelector('#hitmarker').style.opacity='1';setTimeout(()=>document.querySelector('#hitmarker').style.opacity='0',300)},
 setScoreText:t=>{document.querySelector('#scoreText').textContent=t},setRoundText:t=>{document.querySelector('#roundText').textContent=t},
 selfRespawn(x,z,yaw,st,n,silent){
  tank.position.set(x,0,z);tank.rotation.set(0,yaw,0);velocity=0;steeringResponse=0;turretYaw=0;camYaw=0;gunPitch=0;turret.visible=true;turret.rotation.y=0;gunPivot.rotation.x=0;
  playerDead=false;for(const k of ['engine','track','gun','crew','ammo','optics'])setModule(k,st[k]??100);shells=n;reloading=false;reloadRemaining=0;shotCooldown=0;
  document.querySelector('#condition').textContent='БОЕГОТОВ';updateHUD();if(!silent)notify('Возрождение · БК пополнен');
 },
 selfDie(cookoff,silent){playerDead=true;velocity=0;opticMode=false;document.body.classList.remove('optic-on');document.querySelector('#condition').textContent='УНИЧТОЖЕН';
  if(silent){tank.rotation.z=.35;tank.position.y=-.2;return}
  destroyBot({group:tank,botTurret:turret,model:activeVehicleModel,alive:true},tank.position.clone().setY(1.2),cookoff,true);},
 destroyRemote(t,cookoff){t.group.updateMatrixWorld(true);destroyBot(t,t.group.position.clone().setY(1.2),cookoff,true)},
 reviveRemote(t,x,z,yaw){t.group.position.set(x,0,z);t.group.rotation.set(0,yaw,0);restoreTargetVisual(t)},
 remoteShot(m,rt){
  const shell=shellTypes[m.s]||shellTypes[0],origin=new THREE.Vector3(...m.o),dir=new THREE.Vector3(...m.d).normalize();
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.42,7),new THREE.MeshBasicMaterial({color:m.s===2?'#d5a76c':'#e9d5a1'}));mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);mesh.position.copy(origin);scene.add(mesh);
  const tracer=new THREE.Mesh(new THREE.SphereGeometry(.055,6,5),new THREE.MeshBasicMaterial({color:'#ffcf82'}));tracer.position.copy(origin);scene.add(tracer);
  liveProjectiles.push({mesh,tracer,remote:true,pos:origin.clone(),vel:dir.multiplyScalar(shell.speed),life:5,shellType:m.s,penetration:0,previous:origin.clone()});
  burst(origin,'#ffdb8a',effectsLevel==='high'?10:5);const d=origin.distanceTo(tank.position);playSound(95,.24,'sawtooth',Math.max(.004,.05/(1+d/35)));
 },
 setMpActive(on,room){
  mpOn=on;mpRoom=room;botsEnabled=false;roundActive=false;botButton.disabled=on;botButton.textContent='БОТЫ: ВЫКЛ';
  document.querySelector('#roundBanner').classList.remove('show');
  if(on){for(const t of targets)if(!t.net){t.alive=false;t.group.visible=false}clearImpactMarks();document.querySelector('#hitXray').classList.remove('show')}
  else{playerDead=false;tank.rotation.set(0,0,0);tank.position.set(0,0,6);velocity=0;turret.visible=true;Object.keys(modules).forEach(k=>setModule(k,100));shells=maxShells();reloading=false;document.querySelector('#condition').textContent='БОЕГОТОВ';
   applyLayout(buildLayout('range',(Math.random()*4294967295)>>>0));syncTargetCount();resetBotsForRound();updateHUD();document.querySelector('#roundText').textContent='1 · 03:00';}
 }
});
applyLayout(buildLayout('range',20260101));
