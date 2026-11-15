import {token,digest} from './security.mjs';
import {teacherData,planTeacherImport,sameTeacher} from './public/teacher-roster-model.js';
export const rosterLock=716003;
export const rosterRevision=d=>digest(JSON.stringify([d.name,d.email||'',d.phone||'',d.teacherAccountId||'']));
export async function saveTeacherRoster({u,pool,b,fail}){
 if(u.role!=='zavuch')fail('O‘qituvchilar ro‘yxatini faqat zavuch kiritadi',403);
 const client=await pool.connect();
 try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock($1)',[rosterLock]);
  const records=(await client.query("SELECT * FROM campus_records WHERE kind='teachers' ORDER BY id FOR UPDATE")).rows;
  let added=0,duplicates=0;
  if(b.id){
   const old=records.find(r=>r.id===b.id);if(!old)fail('O‘qituvchi topilmadi',404);
   if(b.action==='delete'){if(old.data.teacherAccountId)fail('Hisobga bog‘langan o‘qituvchini o‘chirish mumkin emas. Kirishni administrator boshqaradi.',403);await client.query("DELETE FROM campus_records WHERE id=$1 AND kind='teachers'",[old.id]);}
   else{const data=teacherData(b.data,fail);if(records.some(r=>r.id!==old.id&&sameTeacher(r.data,data)))fail('Bu o‘qituvchi ro‘yxatda mavjud',409);await client.query('UPDATE campus_records SET data=$1,updated_at=now() WHERE id=$2',[{...old.data,...data},old.id]);}
  }else{
   if(b.action==='delete')fail('O‘qituvchini tanlang');
   const plan=planTeacherImport(b.rows||[b.data],records,fail);duplicates=plan.duplicates.length;
   for(const d of plan.added)await client.query("INSERT INTO campus_records(id,kind,data) VALUES($1,'teachers',$2)",[token(),d]);added=plan.added.length;
  }
  await client.query("INSERT INTO campus_audit(user_id,action,detail) VALUES($1,'save',$2)",[u.id,b.id?'O‘qituvchi ro‘yxati yangilandi':'O‘qituvchilar ro‘yxati: '+added+' ta qo‘shildi']);
  await client.query('COMMIT');return {ok:true,added,duplicates};
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
export async function handleTeacherRoster({path,req,res,u,pool,body,json,fail}){
 if(path!=='/api/teacher-roster')return false;if(u.role!=='zavuch')fail('O‘qituvchilar ro‘yxatini faqat zavuch kiritadi',403);
 if(req.method!=='POST')fail('Topilmadi',404);json(res,200,await saveTeacherRoster({u,pool,b:await body(req),fail}));return true;
}
export async function accessRequests(pool){
 // The technical administrator receives only identity/contact fields needed to grant access.
 return (await pool.query(`SELECT r.id,r.data->>'name' AS name,r.data->>'email' AS email,r.data->>'phone' AS phone,r.data->>'teacherAccountId' AS "teacherAccountId" FROM campus_records r WHERE r.kind='teachers' AND COALESCE(r.data->>'teacherAccountId','')='' ORDER BY r.data->>'name',r.id`)).rows.map(r=>({id:r.id,name:r.name,email:r.email||'',phone:r.phone||'',revision:rosterRevision(r)}));
}
