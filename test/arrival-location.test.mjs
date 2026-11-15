import test from 'node:test';
import assert from 'node:assert/strict';
import {campusLocation,campusDistance,validateArrivalPosition,requestArrivalPosition} from '../public/campus-location.js';
import {handleWorkspace} from '../workspace-api.mjs';
import {visibleRecord} from '../public/workspace-model.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const position=(meters=0,now=Date.now())=>({latitude:campusLocation.latitude+meters/6371000*180/Math.PI,longitude:campusLocation.longitude,accuracy:8,timestamp:now});
test('owner supplied center and 150m boundary are enforced without expanding for accuracy',()=>{
 assert.equal(campusLocation.latitude,41.316944);assert.equal(campusLocation.longitude,69.349938);assert.equal(campusLocation.radiusMeters,150);
 const now=Date.now();assert.equal(campusDistance(campusLocation.latitude,campusLocation.longitude),0);
 assert.equal(validateArrivalPosition(position(149.99,now),now).distanceMeters,150);
 assert.throws(()=>validateArrivalPosition({...position(150.01,now),accuracy:1},now),{status:403});
 assert.throws(()=>validateArrivalPosition({...position(200,now),distanceMeters:0,radiusMeters:1000},now),{status:403});
});
test('missing, malformed, stale and inaccurate positions cannot pass',()=>{
 const now=Date.now(),p=position(0,now);
 for(const bad of [null,{}, {...p,latitude:'41.316944'},{...p,latitude:NaN},{...p,longitude:Infinity},{...p,latitude:91},{...p,longitude:181},{...p,accuracy:-1},{...p,accuracy:101},{...p,timestamp:now-120001},{...p,timestamp:now+30001}])assert.throws(()=>validateArrivalPosition(bad,now),{status:400});
 assert.deepEqual(Object.keys(validateArrivalPosition(p,now)),['distanceMeters','accuracyMeters','checkedAt']);
});
test('browser location is a fresh one-shot request and handles permission denial',async()=>{
 let options;const p=position();const result=await requestArrivalPosition({getCurrentPosition(success,failure,o){options=o;success({coords:p,timestamp:p.timestamp});}});
 assert.deepEqual(result,p);assert.deepEqual(options,{enableHighAccuracy:true,timeout:20000,maximumAge:0});
 await assert.rejects(requestArrivalPosition(null),/Telefon brauzerida/);
 for(const [code,pattern] of [[1,/ruxsat berilmadi/],[2,/Joylashuv aniqlanmadi/],[3,/vaqti tugadi/]])await assert.rejects(requestArrivalPosition({getCurrentPosition(success,failure){failure({code});}}),pattern);
 await assert.rejects(requestArrivalPosition({getCurrentPosition(success){const p=position(200);success({coords:p,timestamp:p.timestamp});}}),{status:403});
});
function fixture(){
 const writes=[];let payload;const pool={query:async(sql,args)=>{writes.push({sql,args});return {rows:[{id:'own'}],rowCount:1}}};
 const base={path:'/api/arrivals/check',req:{method:'POST'},res:{},u:{id:'teacher-a',name:'Teacher A',role:'teacher'},pool,body:async()=>({action:'in',position:position()}),json:(res,status,data)=>{payload=data},fail,audit:async()=>{}};
 return {base,writes,result:()=>payload};
}
test('real arrival route rejects missing/outside GPS for both actions before any write',async()=>{
 const f=fixture();for(const action of ['in','out'])for(const p of [undefined,position(200),{...position(),accuracy:200}]){
  await assert.rejects(handleWorkspace({...f.base,body:async()=>({action,position:p,demo:true,skipLocation:true})}));
 }assert.deepEqual(f.writes,[]);
 for(const role of ['admin','zavuch'])await assert.rejects(handleWorkspace({...f.base,u:{role}}),{status:403});
 await assert.rejects(handleWorkspace({...f.base,yearPhase:'preparation'}),{status:409});assert.deepEqual(f.writes,[]);
});
test('accepted arrival and departure use session identity, server time and only reduced GPS metadata',async()=>{
 const f=fixture();const p=position(90);
 await handleWorkspace({...f.base,body:async()=>({action:'in',position:p,teacherId:'foreign',name:'forged',date:'2000-01-01',startTime:'00:00'})});
 assert.equal(f.result().ok,true);const {args}=f.writes[0],data=args[1];assert.ok(args[0].startsWith('arrival:teacher-a:'));assert.equal(data.teacherId,'teacher-a');assert.equal(data.name,'Teacher A');assert.notEqual(data.date,'2000-01-01');assert.equal(data.arrivalLocation.distanceMeters,90);assert.equal('latitude' in data.arrivalLocation,false);
 await handleWorkspace({...f.base,body:async()=>({action:'out',position:p,teacherId:'foreign'})});
 const out=f.writes[1];assert.match(out.sql,/departureLocation/);assert.match(out.sql,/COALESCE\(data->>'endTime',''\)=''/);assert.ok(out.args[0].startsWith('arrival:teacher-a:'));assert.equal(JSON.parse(out.args[2]).distanceMeters,90);assert.equal(out.args[2].includes('latitude'),false);
 const record={kind:'arrivals',data};assert.equal(visibleRecord(f.base.u,record,[],[]),true);assert.equal(visibleRecord({id:'foreign',role:'teacher'},record,[],[]),false);
});
