import test from 'node:test';
import assert from 'node:assert/strict';
import {teacherData,planTeacherImport,parseTeacherCSV,rowsToTeachers,teacherAccessLabel} from '../public/teacher-roster-model.js';
import {saveTeacherRoster,handleTeacherRoster,rosterRevision,accessRequests} from '../teacher-roster.mjs';
import {handleMembers} from '../members-api.mjs';
import {canEnter} from '../access-policy.mjs';
import {createDemo} from '../public/demo.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const person=(name='Sinov O‘qituvchi',email='newteacher@example.test')=>({name,email,phone:'+998900000001',detail:'Matematika',extra:''});
function database(){
 let db={records:[],users:[],sessions:[],audit:[]},backup,failOn='';const calls=[];
 const result=rows=>({rows:structuredClone(rows),rowCount:rows.length});
 const client={release(){},async query(sql,args=[]){calls.push({sql,args});if(failOn&&sql.startsWith(failOn))throw Error('Injected database failure');
  if(sql==='BEGIN'){backup=structuredClone(db);return result([]);}if(sql==='ROLLBACK'){db=backup;return result([]);}if(sql==='COMMIT'){backup=null;return result([]);}if(sql.includes('pg_advisory'))return result([]);
  if(sql.startsWith('SELECT * FROM campus_records WHERE kind='))return result(db.records);
  if(sql.startsWith('SELECT * FROM campus_records WHERE id='))return result(db.records.filter(r=>r.id===args[0]));
  if(sql.startsWith('SELECT id FROM campus_records'))return result(db.records.filter(r=>r.data.teacherAccountId===args[0]&&r.id!==args[1]));
  if(sql.startsWith('SELECT r.id'))return result(db.records.filter(r=>!r.data.teacherAccountId).map(r=>({id:r.id,...r.data})));
  if(sql.startsWith('INSERT INTO campus_records')){db.records.push({id:args[0],kind:'teachers',data:args[1]});return result([]);}
  if(sql.startsWith('UPDATE campus_records')){db.records.find(r=>r.id===args[1]).data=args[0];return result([]);}
  if(sql.startsWith('DELETE FROM campus_records')){db.records=db.records.filter(r=>r.id!==args[0]);return result([]);}
  if(sql.startsWith('SELECT * FROM campus_users'))return result(db.users.filter(u=>u.email===args[0]));
  if(sql.startsWith('INSERT INTO campus_users')){const [id,email,name,permissions,invite_hash,role,payment_approved,payment_amount]=args;const account={id,email,name,permissions:JSON.parse(permissions),invite_hash,role,payment_approved,payment_amount,active:true,password_hash:null};const old=db.users.find(u=>u.email===email);if(old)Object.assign(old,account);else db.users.push(account);return result([]);}
  if(sql.startsWith('UPDATE campus_users SET permissions')){const u=db.users.find(u=>u.id===args[1]);u.permissions=JSON.parse(args[0]);u.active=true;return result([u]);}
  if(sql.startsWith('UPDATE campus_users SET active=false')){const u=db.users.find(u=>u.id===args[0]);if(u){u.active=false;u.invite_hash=null;}return result(u?[u]:[]);}
  if(sql.startsWith('UPDATE campus_users SET payment_approved')){const u=db.users.find(u=>u.id===args[0]&&u.role==='teacher');if(u)Object.assign(u,{active:true,payment_approved:true,payment_amount:400000});return result(u?[u]:[]);}
  if(sql.startsWith('DELETE FROM campus_sessions')){db.sessions=db.sessions.filter(s=>s.user_id!==args[0]);return result([]);}
  if(sql.startsWith('INSERT INTO campus_audit')){db.audit.push(args);return result([]);}
  throw Error('Unmocked: '+sql);
 }};
 return {pool:{query:(...args)=>client.query(...args),connect:async()=>client},calls,get db(){return db},inject:s=>failOn=s};
}
test('CSV supports Uzbek headers, BOM, quoted punctuation, semicolon and tab files',()=>{
 const rows=rowsToTeachers(parseTeacherCSV('\uFEFFF.I.Sh.;O‘qitadigan fan;Elektron pochta;Telefon;Izoh\r\n"Sinov, O‘qituvchi";Matematika;TEST@example.test;+998900000001;"Ikki\nqator"'));
 assert.equal(rows[0].name,'Sinov, O‘qituvchi');assert.equal(teacherData(rows[0],fail).email,'test@example.test');assert.equal(rows[0].extra,'Ikki\nqator');
 assert.equal(rowsToTeachers(parseTeacherCSV('ФИО\tПредмет\tEmail\nПример\tМатематика\ta@example.test'))[0].name,'Пример');
 assert.throws(()=>parseTeacherCSV('F.I.Sh.\n"broken'),/yopilmagan/);
 assert.throws(()=>rowsToTeachers([['Fan'],['Math']]),/F.I.Sh/);
});
test('imports validate every row, skip repeats and never accept account/permission fields',()=>{
 const existing=[{kind:'teachers',data:person()}];
 assert.equal(planTeacherImport([person()],existing,fail).added.length,0);
 const p=planTeacherImport([person(),person('Different','second@example.test'),person('Different','SECOND@example.test')],existing,fail);assert.equal(p.added.length,1);assert.equal(p.duplicates.length,2);
 for(const field of ['role','active','permissions','paymentApproved','payment_approved','password_hash','teacherAccountId'])assert.throws(()=>teacherData({...person(),[field]:'forged'},fail),{status:403});
 assert.throws(()=>planTeacherImport([person(),person('Bad','invalid-email')],[],fail),/2-qator/);
 assert.throws(()=>planTeacherImport(Array.from({length:301},()=>person()),[],fail),/300/);
});
test('zavuch import is atomic and idempotent, stores profiles without creating accounts',async()=>{
 const m=database(),u={id:'z',role:'zavuch'};
 const out=await saveTeacherRoster({u,pool:m.pool,b:{rows:[person(),person('Two','two@example.test')]},fail});assert.equal(out.added,2);assert.equal(m.db.users.length,0);
 assert.equal(m.calls.some(c=>/INSERT INTO campus_users|UPDATE campus_users/.test(c.sql)),false);
 assert.equal((await saveTeacherRoster({u,pool:m.pool,b:{rows:[person()]},fail})).duplicates,1);
 const before=structuredClone(m.db);m.inject('INSERT INTO campus_audit');await assert.rejects(saveTeacherRoster({u,pool:m.pool,b:{rows:[person('Three','three@example.test')]},fail}),/Injected/);assert.deepEqual(m.db,before);
});
test('zavuch and teacher cannot invoke any account approval or invite route, even crafted HTTP bodies',async()=>{
 const pool={query(){throw Error('Unauthorized DB read')},connect(){throw Error('Unauthorized DB write')}};
 for(const role of ['zavuch','teacher'])for(const path of ['/api/members','/api/access-requests'])for(const method of ['GET','POST'])for(const action of [undefined,'approve_payment','permissions','revoke'])await assert.rejects(handleMembers({path,req:{method},u:{role,active:true},pool,body:async()=>({action,paymentApproved:true,role:'admin'}),fail}),{status:403});
 for(const role of ['admin','teacher'])await assert.rejects(handleTeacherRoster({path:'/api/teacher-roster',req:{method:'POST'},u:{role,active:true},pool,body:async()=>({rows:[person()]}),fail}),{status:403});
});
test('admin approves payment and links a request atomically; request alone never grants login',async()=>{
 const m=database();m.db.records.push({id:'r',kind:'teachers',data:person()});const u={id:'a',role:'admin',active:true,email:'owner@example.test'};let response;
 const b={name:person().name,email:person().email,role:'teacher',rosterId:'r',rosterRevision:rosterRevision(person())};
 const base={path:'/api/members',req:{method:'POST'},u,pool:m.pool,body:async()=>b,json:(res,status,out)=>response=out,fail};
 await assert.rejects(handleMembers(base),{status:403});assert.equal(m.db.users.length,0);
 b.paymentApproved=true;await handleMembers(base);assert.ok(response.invite);assert.notEqual(response.invite,m.db.users[0].invite_hash);assert.equal(m.db.users[0].payment_amount,400000);assert.equal(m.db.records[0].data.teacherAccountId,m.db.users[0].id);
 assert.equal((await accessRequests(m.pool)).length,0);assert.equal(canEnter(m.db.users[0]),true);
});
test('stale profile review and failed linkage roll back account creation',async()=>{
 const m=database();m.db.records.push({id:'r',kind:'teachers',data:person()});const u={id:'a',role:'admin',active:true,email:'owner@example.test'};
 const b={...person(),role:'teacher',rosterId:'r',rosterRevision:'stale',paymentApproved:true};const base={path:'/api/members',req:{method:'POST'},u,pool:m.pool,body:async()=>b,json(){},fail};
 await assert.rejects(handleMembers(base),{status:409});assert.equal(m.db.users.length,0);
 b.rosterRevision=rosterRevision(person());m.inject('UPDATE campus_records');await assert.rejects(handleMembers(base),/Injected/);assert.equal(m.db.users.length,0);assert.equal(m.db.records[0].data.teacherAccountId,undefined);
});
test('unpaid teachers cannot enter or be restored; zavuch remains free and paid teachers pay only once',async()=>{
 const m=database(),teacher={id:'t',name:'Teacher',email:'teacher@example.test',role:'teacher',active:false,payment_approved:false,payment_amount:0};m.db.users.push(teacher);
 const b={name:teacher.name,email:teacher.email,action:'permissions'},base={path:'/api/members',req:{method:'POST'},u:{role:'admin',active:true,email:'admin@example.test'},pool:m.pool,body:async()=>b,json(){},fail};
 await assert.rejects(handleMembers(base),{status:403});assert.equal(m.db.users[0].active,false);
 Object.assign(m.db.users[0],{payment_approved:true,payment_amount:400000});await handleMembers(base);assert.equal(canEnter(m.db.users[0]),true);
 assert.equal(canEnter({...teacher,active:true,payment_approved:true,payment_amount:1}),false);assert.equal(canEnter({role:'outsider',active:true,payment_approved:true,payment_amount:400000}),false);assert.equal(canEnter({role:'zavuch',active:true}),true);
});
test('linked teacher profile cannot be rebound or deleted by zavuch; academic edits preserve account',async()=>{
 const m=database(),u={id:'z',role:'zavuch'};m.db.records.push({id:'r',kind:'teachers',data:{...person(),teacherAccountId:'t'}});
 await assert.rejects(saveTeacherRoster({u,pool:m.pool,b:{id:'r',data:{...person(),teacherAccountId:'other'}},fail}),{status:403});
 await assert.rejects(saveTeacherRoster({u,pool:m.pool,b:{id:'r',action:'delete'},fail}),{status:403});
 await saveTeacherRoster({u,pool:m.pool,b:{id:'r',data:{...person(),detail:'Fizika'}},fail});assert.equal(m.db.records[0].data.teacherAccountId,'t');assert.equal(m.db.records[0].data.detail,'Fizika');
});
test('demo imports are isolated, preserve login restrictions, and teacher has no access-management module',async()=>{
 const z=createDemo('zavuch',{storage:null,transport(){throw Error('Live write')}}),t=createDemo('teacher',{storage:null});
 assert.equal((await z.api('teacher-roster',{rows:[person()]})).added,1);assert.equal((await z.api('teacher-roster',{rows:[person()]})).duplicates,1);
 assert.equal((await t.api('records')).records.some(r=>r.data.email===person().email),false);
 await assert.rejects(t.api('teacher-roster',{rows:[person()]}),{status:403});await assert.rejects(z.api('members',{role:'teacher',paymentApproved:true}),{status:403});
 assert.equal((await t.api('me')).permissions.includes('accessstatus'),false);assert.equal(teacherAccessLabel(null),'Administrator ruxsati kutilmoqda');
});
