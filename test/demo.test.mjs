import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemo,demoRole,seedDemo,demoMonthly} from '../public/demo.js';
import {validatePlan} from '../syllabus-model.mjs';
import {handleDemo,validateDemoPlan} from '../demo-http.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)}};

test('only explicit zavuch and teacher demo URLs select a preview',()=>{
  assert.equal(demoRole('?demo=zavuch'),'zavuch'); assert.equal(demoRole('?demo=teacher'),'teacher');
  assert.equal(demoRole('?role=zavuch'),null); assert.equal(demoRole('?demo=admin'),null); assert.equal(createDemo('admin'),null);
});
test('demo edits stay per role and cannot authorize users or enter live APIs',async()=>{
  const storage=memory(),calls=[];
  const transport=async(...args)=>{calls.push(args);return {ok:true}};
  const z=createDemo('zavuch',{storage,transport}),t=createDemo('teacher',{storage,transport});
  await z.api('records',{kind:'students',data:{name:'Only in preview',detail:'101',extra:''}});
  assert.ok((await createDemo('zavuch',{storage,transport}).api('records')).records.some(r=>r.data.name==='Only in preview'));
  assert.equal((await t.api('records')).records.some(r=>r.data.name==='Only in preview'),false);
  assert.ok((await t.api('records')).records.some(r=>r.kind==='schedule'));
  assert.ok((await t.api('me')).permissions.includes('groups'));
  for(const path of ['members','technical','login','setup','activate','logout','demo/anything']) await assert.rejects(z.api(path,{}),{status:403});
  await assert.rejects(t.api('records',{kind:'students',data:{name:'x',detail:'',extra:''}}),{status:403});
  await assert.rejects(t.api('monthly?month=2026-11'),{status:403});
  assert.deepEqual(calls,[]);
  z.reset();assert.equal((await z.api('records')).records.some(r=>r.data.name==='Only in preview'),false);
});
test('sample programs export with valid hours and preview save uses only validation utility',async()=>{
  for(const role of ['teacher','zavuch'])assert.deepEqual(validatePlan(seedDemo(role).programs[0].data,true),[]);
  const calls=[];const d=createDemo('teacher',{storage:null,transport:async(action,b,binary)=>{calls.push(action);return binary?new Blob(['docx']):{ok:true}}});
  const data=seedDemo('teacher').programs[0].data;
  await d.api('preparation',{id:'demo-program',data});await d.download('demo-program','program');
  assert.deepEqual(calls,['validate','export']);
  await assert.rejects(d.download('live-id','program'),{status:404});
});
test('demo attendance respects selected month/group and latest daily status',()=>{
  const {records}=seedDemo('zavuch',new Date('2026-11-15T12:00:00Z'));
  let r=demoMonthly(records,'2026-11','101');assert.equal(r.rows.length,2);assert.equal(r.rows[0].present,1);
  records.push({id:'new',kind:'attendance',updated_at:'2026-11-16T00:00:00Z',data:{name:'Namuna o‘quvchi 01',detail:'2026-11-15 / 101',extra:'Kelmadi'}});
  r=demoMonthly(records,'2026-11','101');assert.equal(r.rows[0].present,0);assert.equal(r.rows[0].absent,1);
  assert.deepEqual(demoMonthly(records,'2026-10').rows,[]);
});
test('public helper cannot resolve real records, accounts, or unsupported methods',async()=>{
  assert.equal(await handleDemo({path:'/api/records'}),false);
  assert.equal(await handleDemo({path:'/api/preparation/demo-program/program'}),false);
  await assert.rejects(handleDemo({path:'/api/demo/members',req:{method:'POST'},fail}),{status:404});
  await assert.rejects(handleDemo({path:'/api/demo/export',req:{method:'GET'},fail}),{status:404});
  assert.throws(()=>validateDemoPlan({topics:[null]},true,fail),{status:400});
});
test('stateless export produces DOCX without sessions and requires complete reviewed data',async()=>{
  const req={method:'POST',headers:{},socket:{remoteAddress:'127.0.0.1'}};
  let status,headers,bytes;
  const res={writeHead:(s,h)=>{status=s;headers=h},end:b=>{bytes=b}};
  const data=seedDemo('teacher').programs[0].data;
  await handleDemo({path:'/api/demo/export',req,res,body:async()=>({data,format:'calendar'}),fail});
  assert.equal(status,200);assert.equal(headers['Set-Cookie'],undefined);
  assert.match(headers['Content-Disposition'],/Namoyish_calendar.docx/);assert.equal(bytes.subarray(0,2).toString(),'PK');
  await assert.rejects(handleDemo({path:'/api/demo/export',req,res,body:async()=>({data:{...data,reviewed:false},format:'calendar'}),fail}),{status:400});
});
