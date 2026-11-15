import test from 'node:test';
import assert from 'node:assert/strict';
import {campusLocation,campusDistance,validateArrivalPosition,requestArrivalPosition} from '../public/campus-location.js';
import {handleWorkspace} from '../workspace-api.mjs';
import {visibleRecord} from '../public/workspace-model.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const position=(meters=0,now=Date.now())=>({latitude:campusLocation.latitude+meters/6371000*180/Math.PI,longitude:campusLocation.longitude,accuracy:8,timestamp:now});
test('owner supplied center and 250m boundary are enforced without expanding for accuracy',()=>{
 assert.equal(campusLocation.latitude,41.316702);assert.equal(campusLocation.longitude,69.349730);assert.equal(campusLocation.radiusMeters,250);
 const now=Date.now();assert.equal(campusDistance(campusLocation.latitude,campusLocation.longitude),0);
 assert.equal(validateArrivalPosition(position(249.99,now),now).distanceMeters,250);
 assert.throws(()=>validateArrivalPosition({...position(250.01,now),accuracy:1},now),{status:403});
 assert.throws(()=>validateArrivalPosition({...position(300,now),distanceMeters:0,radiusMeters:1000},now),{status:403});
});
test('missing, malformed, stale and inaccurate positions cannot pass',()=>{
 const now=Date.now(),p=position(0,now);
 for(const bad of [null,{}, {...p,latitude:'41.316702'},{...p,latitude:NaN},{...p,longitude:Infinity},{...p,latitude:91},{...p,longitude:181},{...p,accuracy:-1},{...p,accuracy:101},{...p,timestamp:now-120001},{...p,timestamp:now+30001}])assert.throws(()=>validateArrivalPosition(bad,now),{status:400});
 assert.deepEqual(Object.keys(validateArrivalPosition(p,now)),['distanceMeters','accuracyMeters','checkedAt']);
});
test('browser location is a fresh one-shot request and handles permission denial',async()=>{
 let options;const p=position();const result=await requestArrivalPosition({getCurrentPosition(success,failure,o){options=o;success({coords:p,timestamp:p.timestamp});}});
 assert.deepEqual(result,p);assert.deepEqual(options,{enableHighAccuracy:true,timeout:20000,maximumAge:0});
 await assert.rejects(requestArrivalPosition(null),/Telefon brauzerida/);
 for(const [code,pattern] of [[1,/ruxsat berilmadi/],[2,/Joylashuv aniqlanmadi/],[3,/vaqti tugadi/]])await assert.rejects(requestArrivalPosition({getCurrentPosition(success,failure){failure({code});}}),pattern);
 await assert.rejects(requestArrivalPosition({getCurrentPosition(success){const p=position(300);success({coords:p,timestamp:p.timestamp});}}),{status:403});
});
function fixture(){
 const writes=[];let payload;const pool={query:async(sql,args)=>{writes.push({sql,args});return {rows:[{id:'own'}],rowCount:1}}};
 const base={path:'/api/arrivals/check',req:{method:'POST'},res:{},u:{id:'teacher-a',name:'Teacher A',role:'teacher'},pool,body:async()=>({action:'in',position:position()}),json:(res,status,data)=>{payload=data},fail,audit:async()=>{}};
 return {base,writes,result:()=>payload};
}
test('real arrival route rejects missing/outside GPS for both actions before any write',async()=>{
 const f=fixture();for(const action of ['in','out'])for(const p of [undefined,position(300),{...position(),accuracy:200}]){
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

import {createDemo,seedDemo} from '../public/demo.js';
import {dateParts} from '../public/workspace-model.js';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('passwordless demo rejects outside and missing GPS without adding or completing a mark',async()=>{
 const demo=createDemo('teacher',{storage:null,transport:()=>{throw Error('No live requests')}});
 const before=(await demo.api('records')).records;
 for(const action of ['in','out'])for(const p of [undefined,position(500)])await assert.rejects(demo.api('arrivals/check',{action,position:p}));
 assert.deepEqual((await demo.api('records')).records,before);
 await demo.api('arrivals/check',{action:'in',position:position(50)});
 const afterIn=(await demo.api('records')).records;
 await assert.rejects(demo.api('arrivals/check',{action:'out',position:position(500)}),/Siz GPS zonasida emassiz/);
 assert.deepEqual((await demo.api('records')).records,afterIn);
 await demo.api('arrivals/check',{action:'out',position:position(50)});
 const own=(await demo.api('records')).records.find(r=>r.kind==='arrivals'&&r.data.date===dateParts().date&&r.data.arrivalLocation);
 assert.ok(own.data.departureLocation);assert.equal(own.data.arrivalLocation.distanceMeters,50);
});
test('old GPS-free demo marks remain labeled history and do not block a valid new check-in',async()=>{
 const state=seedDemo('teacher'),today=dateParts().date;
 state.records.push({id:'old-unverified',kind:'arrivals',data:{teacherId:state.user.id,name:state.user.name,date:today,detail:today,startTime:'08:00',endTime:'09:00',extra:'08:00 / 09:00'}});
 const storage={getItem:()=>JSON.stringify(state),setItem(){}};
 const demo=createDemo('teacher',{storage});
 await assert.rejects(demo.api('arrivals/check',{action:'out',position:position()}),/Kelish belgilanmagan/);
 await demo.api('arrivals/check',{action:'in',position:position()});
 const rows=(await demo.api('records')).records.filter(r=>r.kind==='arrivals'&&r.data.date===today);
 assert.equal(rows.length,2);assert.ok(rows.some(r=>r.id==='old-unverified'&&!r.data.arrivalLocation));assert.ok(rows.some(r=>r.data.arrivalLocation&&!r.data.endTime));
});
test('zavuch and teacher cannot bypass GPS with generic record create, update or delete in live or demo',async()=>{
 const writes=[];const old={id:'old',kind:'arrivals',data:{teacherId:'teacher',name:'Teacher',date:dateParts().date,detail:dateParts().date,extra:''}};
 const pool={query:async(sql,args)=>{if(sql.startsWith('SELECT'))return {rows:sql.startsWith('SELECT * FROM campus_records')?[old]:[],rowCount:0};writes.push({sql,args});return {rows:[],rowCount:0}}};
 for(const role of ['zavuch','teacher']){
  const demo=createDemo(role,{storage:null});const before=(await demo.api('records')).records;
  for(const action of [undefined,'save','delete']){
   const b={kind:'arrivals',action,id:action?'old':undefined,data:old.data};
   await assert.rejects(handleWorkspace({path:'/api/records',req:{method:'POST'},res:{},u:{id:'teacher',role},pool,body:async()=>b,json(){},fail,audit:async()=>{}}),{status:403});
   await assert.rejects(demo.api('records',b),{status:403});
  }
  assert.deepEqual((await demo.api('records')).records,before);
 }assert.deepEqual(writes,[]);
});
test('demo check-in button requests GPS and displays a persistent error instead of submitting outside',async()=>{
 const source=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replace(/^import .*$/gm,'').replace(/^load\(\);$/m,'');
 const nodes=new Map();const node=k=>{if(!nodes.has(k))nodes.set(k,{innerHTML:'',textContent:'',disabled:false,className:''});return nodes.get(k)};
 let locationRequests=0,posts=0;
 const demo=createDemo('teacher',{storage:null});const api=demo.api.bind(demo);demo.api=async(path,b)=>{if(path==='arrivals/check'&&b)posts++;return api(path,b)};
 const context=vm.createContext({createDemo:()=>demo,demoRole:()=> 'teacher',campusLocation,dateParts,requestArrivalPosition:async()=>{locationRequests++;throw Error('Siz GPS zonasida emassiz.');},location:{search:'?demo=teacher'},document:{querySelector:node},URLSearchParams,Intl,Date,setTimeout:()=>0,clearTimeout(){}});
 vm.runInContext(source,context);
 await vm.runInContext("(async()=>{state=await demo.api('me');records=(await demo.api('records')).records;page='arrivals';myArrivals();await document.querySelector('#checkin').onclick();})()",context);
 assert.equal(locationRequests,1);assert.equal(posts,0);assert.match(node('#page').innerHTML,/role="alert">Siz GPS zonasida emassiz/);assert.equal(vm.runInContext('arrivalBusy',context),false);
});
