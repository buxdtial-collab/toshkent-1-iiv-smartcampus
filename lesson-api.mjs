import {createHash} from 'node:crypto';
import {mayRead,mayWrite,validatePlan} from './syllabus-model.mjs';
import {generateLesson,sourceStamp,validateLesson} from './public/lesson-model.js';
import {lessonExport,sendLessonExport} from './lesson-docx.mjs';
export const lessonHash=(plan,index)=>createHash('sha256').update(sourceStamp(plan,index)).digest('hex');
export async function initializeLessons(pool){await pool.query(`CREATE TABLE IF NOT EXISTS campus_lesson_materials(program_id text NOT NULL REFERENCES campus_programs(id) ON DELETE CASCADE,topic_index integer NOT NULL CHECK(topic_index>=0),source_hash text NOT NULL,data jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(program_id,topic_index))`)}
export async function handleLessons({path,req,res,u,pool,body,json,fail,audit}){
 const m=path.match(/^\/api\/preparation\/([^/]+)\/lessons(?:\/(generate|\d+)(?:\/(notes|map|plan|bundle))?)?$/);if(!m)return false;
 if(!['teacher','zavuch'].includes(u.role))fail('Bu bo‘limga ruxsat berilmagan',403);
 const row=(await pool.query('SELECT * FROM campus_programs WHERE id=$1',[m[1]])).rows[0];if(!row||!mayRead(u,row))fail('Dastur topilmadi',404);
 const plan=row.data,index=m[2]&&m[2]!=='generate'?Number(m[2]):null;
 if(index!==null&&!plan.topics?.[index])fail('Mavzu topilmadi',404);
 if(req.method==='POST'&&!mayWrite(u,row))fail('Tahrirlash huquqi yo‘q',403);
 if(req.method==='POST'&&m[2]==='generate'&&!m[3]){
  const b=await body(req);const errors=validatePlan(plan);if(errors.length)fail(errors.join('; '));
  if(!plan.sourceId)fail('Avval namunaviy dastur faylini yuklang');
  const source=(await pool.query('SELECT owner_id,extracted FROM campus_sources WHERE id=$1',[plan.sourceId])).rows[0];
  if(!source||(source.owner_id!==u.id&&u.role!=='zavuch'))fail('Manba fayliga ruxsat yo‘q',403);
  const replace=b.replaceIndex!==undefined;if(replace&&(!Number.isInteger(b.replaceIndex)||!plan.topics[b.replaceIndex]))fail('Mavzuni tanlang');
  const items=plan.topics.flatMap((t,i)=>!replace||i===b.replaceIndex?[{topic_index:i,source_hash:lessonHash(plan,i),data:generateLesson(plan,i,source.extracted)}]:[]);
  await pool.query(`INSERT INTO campus_lesson_materials(program_id,topic_index,source_hash,data) SELECT $1,x.topic_index,x.source_hash,x.data FROM jsonb_to_recordset($2::jsonb) AS x(topic_index integer,source_hash text,data jsonb) WHERE EXISTS(SELECT 1 FROM campus_programs WHERE id=$1 AND data=$3::jsonb) ON CONFLICT(program_id,topic_index) ${replace?'DO UPDATE SET source_hash=excluded.source_hash,data=excluded.data,updated_at=now()':'DO NOTHING'}`,[row.id,JSON.stringify(items),JSON.stringify(plan)]);
  await audit(u,'program_save',plan.subject+': mavzular uchun dars hujjatlari');json(res,200,{ok:true});return true;
 }
 const rows=(await pool.query('SELECT * FROM campus_lesson_materials WHERE program_id=$1 ORDER BY topic_index',[row.id])).rows;
 if(req.method==='GET'&&!m[2]){json(res,200,{lessons:plan.topics.map((t,i)=>{const r=rows.find(r=>r.topic_index===i);return {index:i,title:t.title,data:r?.data||null,hash:lessonHash(plan,i),stale:!!r&&r.source_hash!==lessonHash(plan,i)}})});return true;}
 const current=rows.find(r=>r.topic_index===index);
 if(req.method==='POST'&&index!==null&&!m[3]){const b=await body(req);if(b.hash!==lessonHash(plan,index))fail('Dastur o‘zgargan. Mavzular ro‘yxatini yangilang.',409);const errors=validateLesson(b.data);if(errors.length)fail(errors.join('; '));
 const saved=await pool.query(`INSERT INTO campus_lesson_materials(program_id,topic_index,source_hash,data) SELECT $1,$2,$3,$4 WHERE EXISTS(SELECT 1 FROM campus_programs WHERE id=$1 AND data=$5::jsonb) ON CONFLICT(program_id,topic_index) DO UPDATE SET source_hash=excluded.source_hash,data=excluded.data,updated_at=now()`,[row.id,index,b.hash,b.data,JSON.stringify(plan)]);if(!saved.rowCount)fail('Dastur o‘zgargan. Ro‘yxatni yangilang.',409);await audit(u,'program_save',plan.subject+': '+plan.topics[index].title);json(res,200,{ok:true});return true;}
 if(req.method==='GET'&&index!==null&&m[3]){if(!current)fail('Avval dars hujjatlarini tayyorlang',404);if(current.source_hash!==lessonHash(plan,index))fail('Mavzu o‘zgargan. Hujjatni ochib moslashtiring va saqlang.',409);const errors=validateLesson(current.data);if(errors.length)fail(errors.join('; '));sendLessonExport(res,await lessonExport(plan,index,current.data,m[3]));return true;}
 fail('Topilmadi',404);
}
