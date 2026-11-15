import test from 'node:test';
import assert from 'node:assert/strict';
import {localDay,academicYear,dueYearEvent,promoteRecords,scopedArchive} from '../public/year-model.js';
import {educationStatus,educationStatuses} from '../public/profile-model.js';
import {validateRecord} from '../security.mjs';
import {runYearLifecycle,guardAcademicWrite,handleYears,yearLock} from '../year-api.mjs';
import {handleWorkspace} from '../workspace-api.mjs';
import {normalizeSchoolRecord} from '../public/workspace-model.js';
import {seedDemo,createDemo} from '../public/demo.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const r=(id,kind,data)=>({id,kind,data:{name:id,detail:'',extra:'',...data}});
function fixtures(){return [r('g1','groups',{name:'101',detail:'1-kurs'}),r('g2','groups',{name:'201',detail:'2-kurs'}),r('t','teachers'),r('staff','staff'),r('room','rooms'),r('a','students',{groupId:'g1'}),r('b','students',{groupId:'g2'}),r('expelled','students',{groupId:'g1',educationStatus:'expelled'}),r('leave','students',{groupId:'g1',educationStatus:'academic_leave'}),r('repeat','students',{groupId:'g2',educationStatus:'retained'}),r('unknown','students'),r('grade','grades'),r('arrival','arrivals')];}
test('Uzbekistan boundaries are July 1 and September 2, including UTC date offsets',()=>{
 const active={active_year:'2026-2027',phase:'active',starts_on:'2026-09-02'};
 assert.equal(localDay(new Date('2027-06-30T19:00:00Z')),'2027-07-01');
 assert.equal(dueYearEvent(active,new Date('2027-06-30T18:59:59Z')),null);
 assert.equal(dueYearEvent(active,new Date('2027-06-30T19:00:00Z')),'archive');
 const prep={active_year:'2027-2028',phase:'preparation',starts_on:'2027-09-02'};
 assert.equal(dueYearEvent(prep,new Date('2027-09-01T18:59:59Z')),null);
 assert.equal(dueYearEvent(prep,new Date('2027-09-01T19:00:00Z')),'start');
 assert.equal(academicYear(new Date('2026-09-01T12:00:00Z')),'2025-2026');
 assert.equal(academicYear(new Date('2026-09-02T12:00:00Z')),'2026-2027');
});
test('only studying students advance; expelled excluded, leave/repeat keep course, unknown queued and original snapshot intact',()=>{
 const original=fixtures(),before=structuredClone(original),p=promoteRecords(original,'2026-2027'),find=id=>p.records.find(r=>r.id===id);
 assert.deepEqual(original,before);assert.equal(p.promoted,1);assert.equal(p.graduated,1);
 assert.equal(find('a').data.course,'2');assert.equal(find('g1').data.detail,'2-kurs');
 assert.equal(find('b').kind,'graduates');assert.equal(find('b').data.graduationYear,'2027');assert.equal(find('b').data.educationStatus,'graduated');
 assert.equal(find('expelled'),undefined);assert.equal(find('leave').data.course,'1');assert.equal(find('leave').data.educationStatus,'academic_leave');assert.equal(find('leave').data.groupId,undefined);
 assert.equal(find('repeat').kind,'students');assert.equal(find('repeat').data.course,'2');assert.equal(find('repeat').data.educationStatus,'retained');
 for(const id of ['staff','room','grade','arrival','g2'])assert.equal(find(id),undefined);
 assert.ok(find('t'));assert.equal(p.pending[0].student.id,'unknown');
 const p2=promoteRecords(p.records,'2027-2028');assert.equal(p2.records.find(r=>r.id==='a').kind,'graduates');assert.equal(p2.records.find(r=>r.id==='repeat').kind,'students');
});
function mockDB(){
 let db={state:{active_year:'2026-2027',phase:'active',starts_on:'2026-09-02'},records:fixtures(),assignments:[{id:'as',teacherId:'teacher',groupId:'g1',subject:'Math'}],programs:[{id:'p',owner_id:'teacher',data:{subject:'Math'}}],lessons:[{program_id:'p',topic_index:0,data:{notes:'original'}}],sources:[{id:'s',owner_id:'teacher',name:'sample.pdf',bytes:'original file',extracted:'text'}],imports:[{id:'i',group_id:'g1',name:'schedule.jpg',mime:'image/jpeg',bytes:'original schedule'}],curricula:[],archives:[],files:[],pending:[],audit:[]};
 let backup,releaseCount=0;const calls=[];let injected='';
 const client={async query(sql,args=[]){calls.push(sql);if(injected&&sql.startsWith(injected))throw Error('injected failure');
  if(sql==='BEGIN'){backup=structuredClone(db);return {rows:[]};}if(sql==='COMMIT'){backup=null;return {rows:[]};}if(sql==='ROLLBACK'){if(backup)db=backup;backup=null;return {rows:[]};}
  if(sql.includes('pg_advisory'))return {rows:[]};
  if(sql.startsWith('SELECT active_year'))return {rows:[structuredClone(db.state)]};
  if(sql.startsWith('SELECT * FROM campus_records'))return {rows:structuredClone(db.records)};
  if(sql.startsWith('SELECT id,teacher_id'))return {rows:structuredClone(db.assignments)};
  if(sql.startsWith('SELECT p.*,u.name'))return {rows:structuredClone(db.programs)};
  if(sql.startsWith('SELECT * FROM campus_lesson_materials'))return {rows:structuredClone(db.lessons)};
  if(sql.startsWith("SELECT 'source:'"))return {rows:[...db.sources.map(f=>({id:'source:'+f.id,kind:'source',name:f.name,owner_id:f.owner_id})),...db.imports.map(f=>({id:'schedule:'+f.id,kind:'schedule',name:f.name}))]};
  if(sql.startsWith('SELECT id,owner_id,name'))return {rows:db.sources.map(({bytes,...f})=>f)};
  if(sql.startsWith('SELECT id,group_id,name'))return {rows:db.imports.map(({bytes,...f})=>f)};
  if(sql.startsWith('SELECT id,title,year'))return {rows:db.curricula};
  if(sql.startsWith('INSERT INTO campus_year_archives')){if(db.archives.some(a=>a.year===args[0]))throw Error('duplicate archive');db.archives.push({year:args[0],next_year:args[1],snapshot:JSON.parse(args[2]),counts:JSON.parse(args[3])});return {rows:[]};}
  if(sql.startsWith('INSERT INTO campus_archive_files')){db.files.push(...db.sources.map(f=>({...f,id:'source:'+f.id,year:args[0]})),...db.imports.map(f=>({...f,id:'schedule:'+f.id,year:args[0]})));return {rows:[]};}
  if(sql.startsWith('INSERT INTO campus_year_pending')){db.pending.push({id:args[0],year:args[1],data:JSON.parse(args[2])});return {rows:[]};}
  const tables={campus_schedule_imports:'imports',campus_assignments:'assignments',campus_lesson_materials:'lessons',campus_programs:'programs',campus_sources:'sources',campus_records:'records',campus_curricula:'curricula'};
  if(sql.startsWith('DELETE FROM ')){db[tables[sql.split(' ')[2]]]=[];return {rows:[]};}
  if(sql.startsWith('INSERT INTO campus_records')){db.records=JSON.parse(args[0]);return {rows:[]};}
  if(sql.startsWith('UPDATE campus_year_state SET active_year')){db.state={active_year:args[0],phase:'preparation',starts_on:args[1]};return {rows:[]};}
  if(sql.startsWith("UPDATE campus_year_state SET phase='active'")){db.state.phase='active';return {rows:[]};}
  if(sql.startsWith('INSERT INTO campus_audit')){db.audit.push(args);return {rows:[]};}
  throw Error('Unmocked query: '+sql);
 },release(){releaseCount++;}};
 return {pool:{query:(...args)=>client.query(...args),connect:async()=>client},calls,get db(){return db},get releases(){return releaseCount},inject(prefix){injected=prefix;}};
}
test('scheduled archive atomically preserves files and snapshot, promotes once, opens on September 2 without clearing summer work',async()=>{
 const m=mockDB();assert.deepEqual(await runYearLifecycle(m.pool,new Date('2027-06-30T18:59:00Z')),[]);
 const before=structuredClone(m.db);const events=await runYearLifecycle(m.pool,new Date('2027-07-01T00:00:00Z'));
 assert.equal(events[0].event,'archive');assert.equal(m.db.archives.length,1);assert.equal(m.db.state.phase,'preparation');assert.equal(m.db.state.active_year,'2027-2028');
 assert.deepEqual(m.db.archives[0].snapshot.records,before.records);assert.equal(m.db.archives[0].snapshot.sources[0].extracted,'text');assert.equal(m.db.files[0].bytes,'original file');assert.equal(m.db.files[1].bytes,'original schedule');assert.equal(m.db.pending.length,1);
 const saved=structuredClone(m.db);assert.deepEqual(await runYearLifecycle(m.pool,new Date('2027-07-01T12:00:00Z')),[]);assert.deepEqual(m.db,saved);
 m.db.records.push(r('summer','schedule'));await runYearLifecycle(m.pool,new Date('2027-09-02T00:00:00Z'));assert.equal(m.db.state.phase,'active');assert.ok(m.db.records.find(r=>r.id==='summer'));assert.equal(m.db.archives.length,1);
 assert.equal(m.calls.some(q=>/DELETE FROM campus_users|UPDATE campus_users/.test(q)),false);
});
test('failure rolls back snapshot and rollover; delayed startup catches up July and September in order',async()=>{
 const m=mockDB(),before=structuredClone(m.db);m.inject('INSERT INTO campus_records');await assert.rejects(runYearLifecycle(m.pool,new Date('2027-07-01T00:00:00Z')),/injected/);assert.deepEqual(m.db,before);assert.equal(m.calls.at(-1),'ROLLBACK');assert.equal(m.releases,1);
 m.inject('');const events=await runYearLifecycle(m.pool,new Date('2027-10-05T00:00:00Z'));assert.deepEqual(events.map(e=>e.event),['archive','start']);assert.equal(m.db.state.phase,'active');assert.equal(m.db.archives.length,1);
});
test('old browser writes fail and shared lock releases, successful guard reuses one client',async()=>{
 const m=mockDB();await assert.rejects(guardAcademicWrite({req:{method:'POST',headers:{'x-campus-year':'2025-2026'}},path:'/api/records',pool:m.pool,fail}),{status:409});assert.equal(m.calls.at(-1),'SELECT pg_advisory_unlock_shared($1)');assert.equal(m.releases,1);
 const g=await guardAcademicWrite({req:{method:'POST',headers:{'x-campus-year':'2026-2027'}},path:'/api/records',pool:m.pool,fail});await g.pool.query('SELECT active_year FROM campus_year_state');const nested=await g.pool.connect();nested.release();assert.equal(m.releases,1);await g.release();assert.equal(m.releases,2);
 assert.equal(await guardAcademicWrite({req:{method:'POST'},path:'/api/login',pool:m.pool,fail}),null);
});
test('archive scope uses historical assignments, hides other teachers sources and programs, rejects archive writes/admin access',async()=>{
 const d=seedDemo('teacher'),s={year:'2026-2027',records:d.records,assignments:d.assignments,programs:[...d.programs,{id:'foreign',owner_id:'other'}],lessons:[],sources:[{owner_id:'other',extracted:'private'},{owner_id:d.user.id,extracted:'own'}],imports:[{extracted:'all groups'}],files:[{id:'own',kind:'source',owner_id:d.user.id},{id:'foreign',kind:'source',owner_id:'other'},{id:'sched',kind:'schedule'},{id:'plan',kind:'curriculum'}]};
 const scoped=scopedArchive(s,d.user);assert.equal(scoped.programs.length,1);assert.equal(scoped.sources.length,1);assert.deepEqual(scoped.imports,[]);assert.deepEqual(scoped.files.map(f=>f.id),['own','plan']);assert.ok(scoped.records.length);assert.throws(()=>scopedArchive(s,{role:'admin'}),{status:403});
 const base={path:'/api/years/2026-2027',req:{method:'POST'},u:{role:'teacher'},pool:{query(){throw Error('must not query')}},fail};await assert.rejects(handleYears(base),{status:405});await assert.rejects(handleYears({...base,u:{role:'admin'},req:{method:'GET'}}),{status:403});
});
test('five statuses persist and excluded/leave/graduate students cannot receive grades or attendance',()=>{
 for(const status of Object.keys(educationStatuses)){const data=validateRecord({name:'Student',detail:'101',extra:'',educationStatus:status,course:'1'});assert.equal(data.educationStatus,status);}
 assert.equal(validateRecord({name:'s',detail:'',extra:'',educationStatus:'admin'}),null);
 const d=seedDemo('teacher'),student=d.records.find(r=>r.kind==='students'),a=d.assignments[0];
 for(const status of ['expelled','academic_leave','graduated']){student.data.educationStatus=status;assert.throws(()=>normalizeSchoolRecord(d.user,'grades',{groupId:a.groupId,subject:a.subject,studentId:student.id,date:'2026-11-15',value:'5'},d.records,d.assignments,fail),{status:403});}
});
test('status buttons server path is zavuch-only and graduation moves full profile without losing family fields',async()=>{
 const d=seedDemo('zavuch'),old=d.records.find(r=>r.kind==='students');old.data.fatherName='Preserved parent';let update;
 const pool={query:async(sql,args)=>{if(sql.startsWith('SELECT * FROM campus_records'))return {rows:d.records};if(sql.startsWith('SELECT id,teacher_id'))return {rows:d.assignments};if(sql.startsWith('UPDATE campus_records'))update=args;return {rows:[],rowCount:1};}};
 const base={path:'/api/records',req:{method:'POST'},res:{},u:d.user,pool,body:async()=>({id:old.id,kind:'students',data:{educationStatus:'graduated'}}),json(){},fail,audit:async()=>{}};
 await handleWorkspace(base);assert.equal(update[2],'graduates');assert.equal(update[0].fatherName,'Preserved parent');assert.equal(update[0].active,false);
 await assert.rejects(handleWorkspace({...base,u:{id:'demo-teacher',role:'teacher'}}),{status:403});
});
test('demo yearly transitions and archive downloads stay isolated and read only',async()=>{
 let date=new Date('2027-06-30T12:00:00Z');const demo=createDemo('zavuch',{storage:null,now:()=>date,transport:()=>{throw Error('No live request')}});
 const before=(await demo.api('records')).records,dateYear=(await demo.api('me')).academicYear;
 date=new Date('2027-07-01T00:00:00Z');const y=await demo.api('years');assert.equal(y.phase,'preparation');assert.equal(y.archives.length,1);
 const a=await demo.api('years/'+dateYear);assert.deepEqual(a.records,before);const downloaded=JSON.parse(await (await demo.archiveDownload('years/'+dateYear+'/export')).text());assert.deepEqual(downloaded.records,before);
 await assert.rejects(demo.api('years/'+dateYear,{records:[]}),{status:405});assert.equal((await demo.api('years')).archives.length,1);
 date=new Date('2027-09-02T00:00:00Z');assert.equal((await demo.api('years')).phase,'active');
});
