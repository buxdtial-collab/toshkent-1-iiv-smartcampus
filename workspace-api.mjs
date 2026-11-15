import {validateArrivalPosition} from './public/campus-location.js';
import {saveTeacherRoster} from './teacher-roster.mjs';
import {educationStatus} from './public/profile-model.js';
import {courseNumber} from './public/year-model.js';
import {planScheduleImport} from './public/schedule-model.js';
import {token,validateRecord,permitted,kinds} from './security.mjs';
import {visibleRecord,editableRecord,normalizeSchoolRecord,arrivalSummary,dateParts,tuition} from './public/workspace-model.js';

export async function initializeWorkspace(pool){await pool.query(`
 CREATE TABLE IF NOT EXISTS campus_assignments(id text PRIMARY KEY,teacher_id text NOT NULL REFERENCES campus_users(id),group_id text NOT NULL REFERENCES campus_records(id) ON DELETE CASCADE,subject text NOT NULL,UNIQUE(teacher_id,group_id,subject));
 CREATE TABLE IF NOT EXISTS campus_curricula(id text PRIMARY KEY,title text NOT NULL,year text NOT NULL,name text NOT NULL,mime text NOT NULL,bytes bytea NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
 ALTER TABLE campus_users ADD COLUMN IF NOT EXISTS payment_amount integer NOT NULL DEFAULT 0;
 ALTER TABLE campus_users ADD COLUMN IF NOT EXISTS payment_approved_at timestamptz;
 UPDATE campus_users SET payment_amount=400000,payment_approved_at=COALESCE(payment_approved_at,created_at) WHERE role='teacher' AND payment_approved=true AND payment_amount=0;
 `)}
const assignmentRows=async(pool,u)=>(await pool.query('SELECT id,teacher_id AS "teacherId",group_id AS "groupId",subject FROM campus_assignments'+(u.role==='teacher'?' WHERE teacher_id=$1':''),u.role==='teacher'?[u.id]:[])).rows;
export async function handleWorkspace({path,req,res,u,pool,body,json,fail,audit,yearPhase='active'}){
 const supported=['/api/assignments','/api/records','/api/my-monthly','/api/arrivals/check','/api/my-access','/api/curricula'];
 if(!supported.includes(path)&&!path.startsWith('/api/curricula/'))return false;
 if(path==='/api/my-access'&&req.method==='GET'){if(u.role!=='teacher')fail('Faqat o‘qituvchining o‘z holati',403);json(res,200,{active:u.active,approved:u.payment_approved,approvedAt:u.payment_approved_at,tuition});return true;}
 if(path.startsWith('/api/curricula')){
  if(req.method==='GET'&&path==='/api/curricula'){json(res,200,{curricula:(await pool.query('SELECT id,title,year,name,created_at FROM campus_curricula ORDER BY created_at DESC')).rows});return true;}
  if(req.method==='GET'){
   const id=path.slice('/api/curricula/'.length);const row=(await pool.query('SELECT * FROM campus_curricula WHERE id=$1',[id])).rows[0];if(!row)fail('Fayl topilmadi',404);
   res.writeHead(200,{'Content-Type':row.mime,'Content-Disposition':`attachment; filename="Ishchi_oquv_reja.${row.name.split('.').at(-1).toLowerCase()}"; filename*=UTF-8''${encodeURIComponent(row.name)}`,'Cache-Control':'no-store'});res.end(row.bytes);return true;
  }
  if(path!=='/api/curricula'||req.method!=='POST')fail('Topilmadi',404);
  if(u.role!=='admin')fail('Ishchi o‘quv rejani faqat platforma egasi joylashtiradi',403);
  const b=await body(req);if(b.action==='delete'){await pool.query('DELETE FROM campus_curricula WHERE id=$1',[String(b.id)]);json(res,200,{ok:true});return true;}
  if(typeof b.title!=='string'||!b.title.trim()||b.title.length>200||typeof b.year!=='string'||!/^\d{4}[-/]\d{4}$/.test(b.year)||typeof b.name!=='string'||b.name.length>200||/[\r\n]/.test(b.name)||!(/\.(pdf|docx|xlsx)$/i.test(b.name))||typeof b.base64!=='string'||b.base64.length>7000000)fail('Nomi, o‘quv yili va PDF, DOCX yoki XLSX faylini tekshiring');
  const bytes=Buffer.from(b.base64,'base64'),ext=b.name.split('.').at(-1).toLowerCase();if(!bytes.length||bytes.length>5*1024*1024||(ext==='pdf'?bytes.subarray(0,4).toString()!=='%PDF':bytes[0]!==80||bytes[1]!==75))fail('Fayl 5 MB gacha va tanlangan turga mos bo‘lsin');
  const mime={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}[ext];
  await pool.query('INSERT INTO campus_curricula(id,title,year,name,mime,bytes) VALUES($1,$2,$3,$4,$5,$6)',[token(),b.title.trim(),b.year,b.name,mime,bytes]);json(res,200,{ok:true});return true;
 }
 if(u.role==='admin')fail('O‘quv ma’lumotlari zavuch kabinetida',403);
 if(path==='/api/assignments'){
  if(req.method==='GET'){const assignments=await assignmentRows(pool,u);const teachers=u.role==='zavuch'?(await pool.query("SELECT id,name,email,active,(active AND payment_approved AND payment_amount=400000) AS \"accessEnabled\",password_hash IS NOT NULL AS activated FROM campus_users WHERE role='teacher' ORDER BY name")).rows:[];json(res,200,{assignments,teachers});return true;}
  if(req.method==='POST'){
   if(u.role!=='zavuch')fail('Guruh va fanni faqat zavuch biriktiradi',403);const b=await body(req);
   if(b.action==='delete'){await pool.query('DELETE FROM campus_assignments WHERE id=$1',[String(b.id)]);await audit(u,'assignment','Dars biriktirishi olib tashlandi');json(res,200,{ok:true});return true;}
   if(typeof b.subject!=='string'||!b.subject.trim()||b.subject.length>150)fail('Fan nomini kiriting');
   if(!(await pool.query("SELECT id FROM campus_users WHERE id=$1 AND role='teacher'",[b.teacherId])).rowCount||!(await pool.query("SELECT id FROM campus_records WHERE id=$1 AND kind='groups'",[b.groupId])).rowCount)fail('O‘qituvchi va guruhni tanlang');
   await pool.query('INSERT INTO campus_assignments(id,teacher_id,group_id,subject) VALUES($1,$2,$3,$4) ON CONFLICT(teacher_id,group_id,subject) DO NOTHING',[token(),b.teacherId,b.groupId,b.subject.trim()]);await audit(u,'assignment',b.subject.trim());json(res,200,{ok:true});return true;
  }
 }
 if(path==='/api/arrivals/check'&&req.method==='POST'){
  if(u.role!=='teacher')fail('O‘qituvchi uchun',403);if(yearPhase!=='active')fail('Yangi o‘quv yili 2-sentabrda boshlanadi.',409);const b=await body(req),locationCheck=validateArrivalPosition(b.position),{date,time}=dateParts(),id='arrival:'+u.id+':'+date;
  if(b.action==='in'){const data={teacherId:u.id,name:u.name,detail:date,extra:time+' / ',date,startTime:time,endTime:'',arrivalLocation:locationCheck};await pool.query("INSERT INTO campus_records(id,kind,data) VALUES($1,'arrivals',$2) ON CONFLICT(id) DO NOTHING",[id,data]);}
  else if(b.action==='out'){const result=await pool.query("UPDATE campus_records SET data=jsonb_set(jsonb_set(data,'{endTime}',to_jsonb($2::text)),'{extra}',to_jsonb((data->>'startTime')||' / '||$2)) || jsonb_build_object('departureLocation',$3::jsonb),updated_at=now() WHERE id=$1 AND COALESCE(data->>'endTime','')='' RETURNING id",[id,time,JSON.stringify(locationCheck)]);if(!result.rowCount)fail('Bugun kelish belgilanmagan yoki ketish allaqachon belgilangan');}
  else fail('Amalni tanlang');await audit(u,'arrival',date+' '+time);json(res,200,{ok:true});return true;
 }
 if(path==='/api/my-monthly'&&req.method==='GET'){
  if(u.role!=='teacher')fail('O‘qituvchi uchun',403);const month=new URL(req.url,'http://local').searchParams.get('month')||'';if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))fail('Oyni tanlang');
  const rows=(await pool.query("SELECT * FROM campus_records WHERE kind='arrivals' AND data->>'teacherId'=$1",[u.id])).rows;json(res,200,arrivalSummary(rows,month));return true;
 }
 if(path==='/api/records'){
  const records=(await pool.query('SELECT * FROM campus_records ORDER BY updated_at DESC,id DESC')).rows,assignments=await assignmentRows(pool,u);
  if(req.method==='GET'){json(res,200,{records:records.filter(r=>visibleRecord(u,r,assignments,records))});return true;}
  if(req.method==='POST'){
   const b=await body(req);if(b.kind==='teachers'){json(res,200,await saveTeacherRoster({u,pool,b,fail}));return true;}if(yearPhase!=='active'&&['attendance','grades'].includes(b.kind))fail('Yangi o‘quv yili 2-sentabrda boshlanadi.',409);if(!kinds.includes(b.kind)||['preparation','monthly','curricula','assignments','accessstatus'].includes(b.kind)||!permitted(u,b.kind))fail('Bu bo‘limga ruxsat yo‘q',403);
   const old=b.id?records.find(r=>r.id===b.id&&r.kind===b.kind):null;
   if(b.id&&(!old||!editableRecord(u,old,assignments,records)))fail('Bu yozuvga ruxsat yo‘q',403);
   if(u.role==='teacher'&&!['attendance','grades'].includes(b.kind))fail('Faqat davomat va baho kiritish mumkin',403);
   if(b.action==='delete'){if(!old)fail('Yozuv topilmadi',404);await pool.query('DELETE FROM campus_records WHERE id=$1',[old.id]);}
   else{
    let input=['students','graduates','teachers'].includes(b.kind)?{...old?.data,...b.data}:b.data;
    if(b.kind==='schedule'&&u.role==='zavuch'&&input.groupId){const group=records.find(r=>r.id===input.groupId&&r.kind==='groups');if(!group)fail('Guruhni tanlang');const teachers=(await pool.query("SELECT id,name FROM campus_users WHERE role='teacher'")).rows;const preview=planScheduleImport({groupId:group.id,groupName:group.data.name,rows:[{teacherName:'',teacherId:'',room:'',part:'',...input}],reviewed:true},records.filter(r=>r.id!==old?.id),teachers,assignments,fail,token);if(!preview.added.length)fail('Bu dars jadvalda allaqachon bor');input=preview.added[0].data;for(const a of preview.links)await pool.query('INSERT INTO campus_assignments(id,teacher_id,group_id,subject) VALUES($1,$2,$3,$4) ON CONFLICT(teacher_id,group_id,subject) DO NOTHING',[a.id,a.teacherId,a.groupId,a.subject]);assignments.push(...preview.links);}
    if(b.kind==='teachers'&&input.teacherAccountId&&!(await pool.query("SELECT id FROM campus_users WHERE id=$1 AND role='teacher'",[input.teacherAccountId])).rowCount)fail('O‘qituvchi hisobini tanlang');
    if(b.kind==='groups'){const c=courseNumber(input.detail);if(!c)fail('Guruh kursini 1 yoki 2 deb belgilang');input.course=c;}
    let targetKind=b.kind;
    if(['students','graduates'].includes(b.kind)){
      const status=educationStatus(input,b.kind);input.educationStatus=status;input.active=['studying','retained'].includes(status);
      if(status==='graduated'){targetKind='graduates';input.previousGroup=input.previousGroup||input.detail;input.graduationYear=input.graduationYear||new Intl.DateTimeFormat('en',{timeZone:'Asia/Tashkent',year:'numeric'}).format(new Date());}
      else {targetKind='students';if(b.kind==='graduates'&&!records.some(g=>g.id===input.groupId&&g.kind==='groups'))fail('Avval joriy guruhni tanlang');}
    }
    const data=validateRecord(normalizeSchoolRecord(u,targetKind,input,records,assignments,fail));if(!data)fail('Maydonlarni tekshiring');
    if(old)await pool.query('UPDATE campus_records SET data=$1,kind=$3,updated_at=now() WHERE id=$2',[data,old.id,targetKind]);else await pool.query('INSERT INTO campus_records(id,kind,data) VALUES($1,$2,$3)',[token(),targetKind,data]);
    if(old&&['students','graduates'].includes(b.kind)&&educationStatus(old.data,old.kind)!==data.educationStatus)await audit(u,'student_status',old.id+': '+educationStatus(old.data,old.kind)+' → '+data.educationStatus);
   }
   await audit(u,b.action==='delete'?'delete':'save',b.kind);json(res,200,{ok:true});return true;
  }
 }
 fail('Topilmadi',404);
}
