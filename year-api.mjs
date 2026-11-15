import {academicYear,nextYear,localDay,dueYearEvent,promoteRecords,archiveCounts,scopedArchive} from './public/year-model.js';
import {buildDocument} from './syllabus-docx.mjs';
import {validatePlan} from './syllabus-model.mjs';
import {lessonExport,sendLessonExport} from './lesson-docx.mjs';
import {lessonHash} from './lesson-api.mjs';
import {validateLesson} from './public/lesson-model.js';
import {educationStatuses} from './public/profile-model.js';

// The same lock covers every academic write and the complete year transition.
export const yearLock=716002;
export async function initializeYears(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS campus_year_state(id boolean PRIMARY KEY DEFAULT true CHECK(id),active_year text NOT NULL,phase text NOT NULL DEFAULT 'active',starts_on text NOT NULL,opened_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS campus_year_archives(year text PRIMARY KEY,next_year text NOT NULL,snapshot jsonb NOT NULL,counts jsonb NOT NULL,archived_at timestamptz NOT NULL DEFAULT now(),archived_by text REFERENCES campus_users(id));
    CREATE TABLE IF NOT EXISTS campus_archive_files(year text NOT NULL REFERENCES campus_year_archives(year),id text NOT NULL,kind text NOT NULL,name text NOT NULL,mime text NOT NULL,bytes bytea NOT NULL,owner_id text,PRIMARY KEY(year,id));
    CREATE TABLE IF NOT EXISTS campus_year_pending(id text PRIMARY KEY,year text NOT NULL REFERENCES campus_year_archives(year),data jsonb NOT NULL);`);
  await pool.query('INSERT INTO campus_year_state(id,active_year,starts_on) VALUES(true,$1,$2) ON CONFLICT(id) DO NOTHING',[academicYear(),academicYear().slice(0,4)+'-09-02']);
}
export async function yearState(pool){return (await pool.query('SELECT active_year,phase,starts_on FROM campus_year_state WHERE id=true')).rows[0];}
export async function currentYear(pool){return (await yearState(pool)).active_year;}
export function isAcademicWrite(path,method){return method==='POST'&&(['/api/teacher-roster','/api/records','/api/assignments','/api/arrivals/check','/api/curricula','/api/schedule-imports'].includes(path)||path.startsWith('/api/preparation'));}
export async function guardAcademicWrite({req,path,pool,fail}){
  if(!isAcademicWrite(path,req.method))return null;
  const client=await pool.connect();let locked=false;
  const release=async()=>{try{if(locked){locked=false;await client.query('SELECT pg_advisory_unlock_shared($1)',[yearLock]);}}catch(e){client.release(e);return;}client.release();};
  try{
    await client.query('SELECT pg_advisory_lock_shared($1)',[yearLock]);locked=true;
    const state=await yearState(client);
    if(req.headers['x-campus-year']!==state.active_year)fail('O‘quv yili o‘zgargan yoki sahifa eskirgan. Sahifani yangilab, qayta kiriting.',409);
    // Reuse this connection so concurrent writers cannot exhaust the pool while holding locks.
    const db={query:(...args)=>client.query(...args),connect:async()=>({query:(...args)=>client.query(...args),release(){}})};
    return {pool:db,release,phase:state.phase};
  }catch(e){await release();throw e;}
}
async function snapshotYear(client,year){
  const records=(await client.query('SELECT * FROM campus_records ORDER BY id')).rows;
  const assignments=(await client.query('SELECT id,teacher_id AS "teacherId",group_id AS "groupId",subject FROM campus_assignments ORDER BY id')).rows;
  const programs=(await client.query('SELECT p.*,u.name AS owner_name FROM campus_programs p JOIN campus_users u ON u.id=p.owner_id ORDER BY p.id')).rows;
  const lessons=(await client.query('SELECT * FROM campus_lesson_materials ORDER BY program_id,topic_index')).rows;
  const files=(await client.query(`SELECT 'source:'||id AS id,'source' AS kind,name,'application/octet-stream' AS mime,owner_id FROM campus_sources
    UNION ALL SELECT 'schedule:'||id,'schedule',name,mime,NULL FROM campus_schedule_imports
    UNION ALL SELECT 'curriculum:'||id,'curriculum',name,mime,NULL FROM campus_curricula WHERE replace(year,'/','-')=$1`,[year])).rows;
  const sources=(await client.query('SELECT id,owner_id,name,extracted,created_at FROM campus_sources ORDER BY id')).rows;
  const imports=(await client.query('SELECT id,group_id,name,mime,extracted,row_count,created_by,created_at FROM campus_schedule_imports ORDER BY id')).rows;
  const curricula=(await client.query("SELECT id,title,year,name,mime,created_at FROM campus_curricula WHERE replace(year,'/','-')=$1",[year])).rows;
  return {version:1,year,records,assignments,programs,lessons,files,sources,imports,curricula};
}
export async function runYearLifecycle(pool,date=new Date()){
 const events=[];
 for(let attempt=0;attempt<40;attempt++){
  const client=await pool.connect();
  try{
   await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock($1)',[yearLock]);
   const state=await yearState(client),event=dueYearEvent(state,date);
   if(!event){await client.query('COMMIT');return events;}
   if(event==='start'){
    await client.query("UPDATE campus_year_state SET phase='active',opened_at=now() WHERE id=true");
    await client.query("INSERT INTO campus_audit(user_id,action,detail) VALUES(NULL,'year_start',$1)",[state.active_year+' o‘quv yili 2-sentabr sanasi bo‘yicha avtomatik ochildi']);
    events.push({event,year:state.active_year});await client.query('COMMIT');continue;
   }
   const current=state.active_year,following=nextYear(current),snapshot=await snapshotYear(client,current),counts=archiveCounts(snapshot),promotion=promoteRecords(snapshot.records,current);
   counts.promoted=promotion.promoted;counts.graduated=promotion.graduated;counts.pending=promotion.pending.length;
   await client.query('INSERT INTO campus_year_archives(year,next_year,snapshot,counts,archived_by) VALUES($1,$2,$3,$4,NULL)',[current,following,JSON.stringify(snapshot),JSON.stringify(counts)]);
   await client.query(`INSERT INTO campus_archive_files(year,id,kind,name,mime,bytes,owner_id)
     SELECT $1,'source:'||id,'source',name,'application/octet-stream',bytes,owner_id FROM campus_sources
     UNION ALL SELECT $1,'schedule:'||id,'schedule',name,mime,bytes,NULL FROM campus_schedule_imports
     UNION ALL SELECT $1,'curriculum:'||id,'curriculum',name,mime,bytes,NULL FROM campus_curricula WHERE replace(year,'/','-')=$1`,[current]);
   for(const item of promotion.pending)await client.query('INSERT INTO campus_year_pending(id,year,data) VALUES($1,$2,$3)',[current+':'+item.student.id,current,JSON.stringify(item)]);
   await client.query('DELETE FROM campus_schedule_imports');
   await client.query('DELETE FROM campus_assignments');
   await client.query('DELETE FROM campus_lesson_materials');
   await client.query('DELETE FROM campus_programs');
   await client.query('DELETE FROM campus_sources');
   await client.query('DELETE FROM campus_records');
   await client.query("INSERT INTO campus_records(id,kind,data) SELECT x.id,x.kind,x.data FROM jsonb_to_recordset($1::jsonb) AS x(id text,kind text,data jsonb)",[JSON.stringify(promotion.records)]);
   // Published plans are year-specific; future-year plans remain available for preparation.
   await client.query("DELETE FROM campus_curricula WHERE replace(year,'/','-')=$1",[current]);
   await client.query("UPDATE campus_year_state SET active_year=$1,phase='preparation',starts_on=$2 WHERE id=true",[following,following.slice(0,4)+'-09-02']);
   await client.query("INSERT INTO campus_audit(user_id,action,detail) VALUES(NULL,'year_archive',$1)",[current+' avtomatik arxivlandi; '+promotion.promoted+' o‘quvchi 2-kursga, '+promotion.graduated+' o‘quvchi bitiruvchiga o‘tkazildi; '+promotion.pending.length+' kurs tekshiruvi kutilmoqda']);
   await client.query('COMMIT');events.push({event,year:current,counts});
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }
 throw Error('Academic year catch-up limit reached');
}
export function lifecycleRunner(pool){let checked='',running=null;return async(date=new Date())=>{const day=localDay(date);if(checked===day)return;if(running){await running;return;}running=runYearLifecycle(pool,date).then(events=>{checked=day;for(const e of events)console.log('Academic lifecycle:',e.event,e.year);}).finally(()=>{running=null;});await running;};}
export async function handleYears({path,req,res,u,pool,body,json,fail}){
  if(path!=='/api/years'&&!path.startsWith('/api/years/'))return false;
  if(!['zavuch','teacher'].includes(u.role))fail('Arxiv o‘quv kabinetlari uchun.',403);
  if(path==='/api/years/placement'&&req.method==='POST'){
    if(u.role!=='zavuch')fail('Faqat zavuch uchun.',403);
    const b=await body(req);if(!Object.hasOwn(educationStatuses,b.status)||!['1','2'].includes(b.course)||typeof b.id!=='string')fail('Holat va kursni tanlang');
    const client=await pool.connect();
    try{
      await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock($1)',[yearLock]);
      if(await currentYear(client)!==b.year)fail('O‘quv yili o‘zgargan. Sahifani yangilang.',409);
      const item=(await client.query('SELECT * FROM campus_year_pending WHERE id=$1 FOR UPDATE',[b.id])).rows[0];if(!item)fail('Tekshiruv yozuvi topilmadi yoki allaqachon bajarilgan.',409);
      if(b.status!=='expelled'){
        const student=item.data.student,data={...student.data,educationStatus:b.status,course:b.course,active:['studying','retained'].includes(b.status),previousGroup:item.data.group?.data.name||student.data.previousGroup||student.data.detail,detail:b.course+'-kurs · guruhga biriktirilmagan'};delete data.groupId;
        if(b.status==='graduated'){data.graduationYear=item.year.slice(5);data.detail=data.graduationYear+' / '+data.previousGroup;}
        await client.query('INSERT INTO campus_records(id,kind,data) VALUES($1,$2,$3)',[student.id,b.status==='graduated'?'graduates':'students',data]);
      }
      await client.query('DELETE FROM campus_year_pending WHERE id=$1',[b.id]);
      await client.query("INSERT INTO campus_audit(user_id,action,detail) VALUES($1,'student_status',$2)",[u.id,b.id+': '+b.status]);
      await client.query('COMMIT');json(res,200,{ok:true});return true;
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }
  if(path==='/api/years'){
    if(req.method==='POST')fail('O‘quv yili 1-iyul va 2-sentabr sanalarida avtomatik almashadi.',405);
    if(req.method!=='GET')fail('Arxiv faqat ko‘rish uchun.',405);
    const archives=(await pool.query('SELECT year,next_year,archived_at FROM campus_year_archives ORDER BY year DESC')).rows;
    const state=await yearState(pool);const pending=u.role==='zavuch'?(await pool.query('SELECT id,year,data FROM campus_year_pending ORDER BY year,id')).rows:[];json(res,200,{activeYear:state.active_year,phase:state.phase,startsOn:state.starts_on,archives,pending});return true;
  }
  if(req.method!=='GET')fail('Arxiv faqat ko‘rish va yuklab olish uchun.',405);
  const m=path.match(/^\/api\/years\/(\d{4}-\d{4})(?:\/(export|files|programs)(?:\/([^/]+))?(?:\/(program|calendar|lessons))?(?:\/(\d+))?)?$/);
  if(!m)fail('Topilmadi',404);
  const row=(await pool.query('SELECT year,archived_at,snapshot FROM campus_year_archives WHERE year=$1',[m[1]])).rows[0];if(!row)fail('Arxiv topilmadi',404);
  const snapshot=scopedArchive(row.snapshot,u);
  if(!m[2]){json(res,200,{...snapshot,archivedAt:row.archived_at,counts:archiveCounts(snapshot)});return true;}
  if(m[2]==='export'&&!m[3]){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="SmartCampus_${m[1]}_arxiv.json"`,'Cache-Control':'no-store'});res.end(JSON.stringify(snapshot,null,2));return true;}
  if(m[2]==='files'&&m[3]&&!m[4]){
    const id=decodeURIComponent(m[3]);if(!snapshot.files.some(f=>f.id===id))fail('Fayl topilmadi',404);
    const file=(await pool.query('SELECT name,mime,bytes FROM campus_archive_files WHERE year=$1 AND id=$2',[m[1],id])).rows[0];if(!file)fail('Fayl topilmadi',404);
    res.writeHead(200,{'Content-Type':file.mime,'Content-Disposition':`attachment; filename="archive_file"; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'no-store'});res.end(file.bytes);return true;
  }
  if(m[2]==='programs'&&m[3]){
    const program=snapshot.programs.find(p=>p.id===m[3]);if(!program)fail('Dastur topilmadi',404);
    if(['program','calendar'].includes(m[4])&&!m[5]){const errors=validatePlan(program.data,true);if(errors.length)fail(errors.join('; '));const bytes=await buildDocument(program.data,m[4]);res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','Content-Disposition':`attachment; filename="${m[1]}_${m[4]}.docx"`,'Cache-Control':'no-store'});res.end(bytes);return true;}
    if(m[4]==='lessons'&&m[5]!==undefined){const index=Number(m[5]),lesson=snapshot.lessons.find(l=>l.program_id===program.id&&l.topic_index===index);if(!lesson||!program.data.topics[index])fail('Dars hujjati topilmadi',404);if(lesson.source_hash!==lessonHash(program.data,index))fail('Hujjat arxivlangan dastur bilan mos emas. Saqlangan nusxasini arxiv eksportidan ko‘rish mumkin.',409);const errors=validateLesson(lesson.data);if(errors.length)fail(errors.join('; '));sendLessonExport(res,await lessonExport(program.data,index,lesson.data,'bundle'));return true;}
  }
  fail('Topilmadi',404);
}
