import {campusLocation} from '../public/campus-location.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleRecord,editableRecord,normalizeSchoolRecord,studentGroup,tuition} from '../public/workspace-model.js';
import {handleWorkspace} from '../workspace-api.mjs';
import {seedDemo,createDemo} from '../public/demo.js';
import {hasPaidTuition,canEnter,canManageAccess} from '../access-policy.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};

test('teachers only see assigned groups, students and their own subject records',()=>{
 const state=seedDemo('teacher'),u=state.user,{records,assignments}=state;
 const own=records.find(r=>r.kind==='grades');
 assert.equal(visibleRecord(u,own,assignments,records),true);
 assert.equal(visibleRecord(u,{...own,data:{...own.data,teacherId:'another'}},assignments,records),false);
 assert.equal(visibleRecord(u,{...own,data:{...own.data,subject:'Fizika'}},assignments,records),false);
 assert.equal(visibleRecord(u,{...own,data:{...own.data,subject:''}},assignments,records),false);
 assert.equal(visibleRecord(u,own,[],records),false);
 const group=records.find(r=>r.kind==='groups'),student=records.find(r=>r.kind==='students');
 assert.equal(visibleRecord(u,group,assignments,records),true);assert.equal(visibleRecord(u,student,assignments,records),true);
 assert.equal(editableRecord(u,student,assignments,records),false);
 assert.equal(visibleRecord({id:'admin',role:'admin'},own,assignments,records),false);
});
test('legacy students match exact unique group names, not substrings',()=>{
 const records=[{id:'g1',kind:'groups',data:{name:'101'}},{id:'g2',kind:'groups',data:{name:'1010'}}];
 assert.equal(studentGroup({kind:'students',data:{detail:'101'}},records),'g1');
 assert.equal(studentGroup({kind:'students',data:{detail:'10'}},records),'');
 assert.equal(studentGroup({kind:'students',data:{detail:'101'}},[...records,{id:'g3',kind:'groups',data:{name:'101'}}]),'');
});
test('grade and attendance writes derive teacher and student identities and validate scope',()=>{
 const {user,records,assignments}=seedDemo('teacher'),student=records.find(r=>r.kind==='students'),a=assignments[0];
 const input={groupId:a.groupId,teacherId:'forged',studentId:student.id,subject:a.subject,date:'2026-11-15',name:'forged student',value:'5',status:'Keldi'};
 const d=normalizeSchoolRecord(user,'grades',input,records,assignments,fail);
 assert.equal(d.teacherId,user.id);assert.equal(d.name,student.data.name);assert.equal(d.extra,'5 / 2026-11-15');
 for(const data of [{...input,studentId:'foreign'},{...input,groupId:assignments[1].groupId},{...input,subject:'Fizika'}])assert.throws(()=>normalizeSchoolRecord(user,'attendance',data,records,assignments,fail),{status:403});
 assert.throws(()=>normalizeSchoolRecord(user,'grades',{...input,value:'6'},records,assignments,fail),{status:400});
 assert.throws(()=>normalizeSchoolRecord(user,'attendance',{...input,date:'2026-02-31'},records,assignments,fail),{status:400});
 assert.throws(()=>normalizeSchoolRecord(user,'schedule',input,records,assignments,fail),{status:403});
});
test('workspace HTTP routes enforce teacher isolation and refuse account escalation',async()=>{
 const state=seedDemo('teacher'),{user:u,records,assignments}=state;
 const foreign={id:'foreign',kind:'grades',data:{...records.find(r=>r.kind==='grades').data,teacherId:'another'}};
 const writes=[];const pool={query:async(sql,args=[])=>{if(sql.startsWith('SELECT * FROM campus_records'))return {rows:[...records,foreign]};if(sql.startsWith('SELECT id,teacher_id'))return {rows:assignments};writes.push({sql,args});return {rows:[],rowCount:0}}};
 let payload;const base={u,pool,req:{method:'GET'},res:{},json:(res,status,data)=>{payload=data},fail,audit:async()=>{}};
 await handleWorkspace({...base,path:'/api/records'});assert.ok(payload.records.length);assert.equal(payload.records.some(r=>r.id==='foreign'),false);
 await assert.rejects(handleWorkspace({...base,path:'/api/records',req:{method:'POST'},body:async()=>({kind:'grades',id:'foreign',action:'delete'})}),{status:403});
 await assert.rejects(handleWorkspace({...base,path:'/api/assignments',req:{method:'POST'},body:async()=>({teacherId:u.id,groupId:'g',subject:'x'})}),{status:403});
 await assert.rejects(handleWorkspace({...base,path:'/api/my-access',u:{id:'z',role:'zavuch'}}),{status:403});
 assert.deepEqual(writes,[]);
});
test('curricula can be published only by the platform owner, then downloaded by school users',async()=>{
 const writes=[];let result,headers,download;const pool={query:async(sql,args)=>{writes.push({sql,args});if(sql.startsWith('SELECT * FROM campus_curricula'))return {rows:[{name:'Reja.pdf',mime:'application/pdf',bytes:Buffer.from('%PDF-test')}]};return {rows:[],rowCount:1}}};
 const base={path:'/api/curricula',req:{method:'POST'},res:{},pool,body:async()=>({title:'Ishchi reja',year:'2026/2027',name:'Reja.pdf',base64:Buffer.from('%PDF-test').toString('base64')}),json:(res,status,v)=>result=v,fail};
 for(const role of ['teacher','zavuch'])await assert.rejects(handleWorkspace({...base,u:{role}}),{status:403});assert.equal(writes.length,0);
 await handleWorkspace({...base,u:{role:'admin'}});assert.equal(result.ok,true);assert.equal(writes.length,1);
 await handleWorkspace({...base,path:'/api/curricula/file-id',req:{method:'GET'},u:{role:'teacher'},res:{writeHead:(s,h)=>headers=h,end:b=>download=b}});
 assert.equal(headers['Content-Type'],'application/pdf');assert.equal(download.toString(),'%PDF-test');
});
test('one-time payment survives access suspension while active access stays blocked',()=>{
 assert.deepEqual(tuition,{amount:400000,currency:'UZS',frequency:'once'});
 const user={role:'teacher',active:false,payment_approved:true,payment_amount:400000};
 assert.equal(hasPaidTuition(user),true);assert.equal(canEnter(user),false);assert.equal(canEnter({...user,active:true}),true);
 assert.equal(hasPaidTuition({role:'zavuch',active:true,payment_approved:true,payment_amount:0}),false);
 assert.equal(canManageAccess({role:'zavuch',active:true}),false);
});
test('teacher demo can enter attendance and own check-in without live API calls',async()=>{
 const demo=createDemo('teacher',{storage:null,transport:()=>{throw Error('Live request should not occur')}});
 const {records}=await demo.api('records'),student=records.find(r=>r.kind==='students'),{assignments}=await demo.api('assignments'),a=assignments[0];
 await demo.api('records',{kind:'attendance',data:{groupId:a.groupId,studentId:student.id,subject:a.subject,date:'2026-11-15',status:'Keldi'}});
 const position={latitude:campusLocation.latitude,longitude:campusLocation.longitude,accuracy:5,timestamp:Date.now()};await demo.api('arrivals/check',{action:'in',position});await demo.api('arrivals/check',{action:'out',position});
 await assert.rejects(demo.api('assignments',{teacherId:'demo-teacher',groupId:'x',subject:'x'}),{status:403});
 assert.ok((await demo.api('my-access')).approved);
});
