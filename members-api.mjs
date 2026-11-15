import {canManageAccess,hasPaidTuition} from './access-policy.mjs';
import {token,digest,safeEmail,kinds} from './security.mjs';
import {teacherModules,tuition} from './public/workspace-model.js';
import {rosterLock,rosterRevision,accessRequests} from './teacher-roster.mjs';
export async function handleMembers({path,req,res,u,pool,body,json,fail}){
 if(!['/api/members','/api/access-requests'].includes(path))return false;
 if(!canManageAccess(u))fail('Kirishga faqat texnik administrator ruxsat beradi',403);
 if(path==='/api/access-requests'){if(req.method!=='GET')fail('Topilmadi',404);json(res,200,{requests:await accessRequests(pool)});return true;}
 if(req.method==='GET'){json(res,200,{members:(await pool.query("SELECT id,email,name,role,permissions,active,payment_approved,payment_amount,payment_approved_at,password_hash IS NOT NULL AS activated FROM campus_users WHERE role IN ('zavuch','teacher') ORDER BY created_at")).rows});return true;}
 if(req.method!=='POST')fail('Topilmadi',404);
 const b=await body(req),client=await pool.connect();
 try{
  await client.query('BEGIN');
  // Same order as academic writes: year first, then roster. Account/profile linking cannot race rollover/import.
  await client.query('SELECT pg_advisory_xact_lock_shared(716002)');
  await client.query('SELECT pg_advisory_xact_lock($1)',[rosterLock]);
  const audit=(action,detail)=>client.query('INSERT INTO campus_audit(user_id,action,detail) VALUES($1,$2,$3)',[u.id,action,detail]);
  let result={ok:true};
  if(b.action==='approve_payment'){
   const r=await client.query("UPDATE campus_users SET payment_approved=true,active=true,payment_amount=400000,payment_approved_at=COALESCE(payment_approved_at,now()) WHERE id=$1 AND role='teacher' RETURNING id",[b.id]);if(!r.rowCount)fail('Hisob topilmadi',404);await audit('payment_approved','Bir martalik 400 000 so‘m to‘lov va kirish administrator tomonidan tasdiqlandi');
  }else if(b.action==='revoke'){
   const r=await client.query("UPDATE campus_users SET active=false,invite_hash=NULL,invite_expires=NULL WHERE id=$1 AND role IN ('zavuch','teacher') RETURNING id",[b.id]);if(!r.rowCount)fail('Hisob topilmadi',404);await client.query('DELETE FROM campus_sessions WHERE user_id=$1',[b.id]);await audit('revoke','Foydalanuvchining kirish huquqi bekor qilindi');
  }else{
   if(b.action&&b.action!=='permissions')fail('Amalni tekshiring');
   if(!safeEmail(b.email)||typeof b.name!=='string'||!b.name.trim()||b.name.length>150)fail('Ism va emailni tekshiring');
   const email=b.email.trim().toLowerCase(),existing=(await client.query('SELECT * FROM campus_users WHERE email=$1 FOR UPDATE',[email])).rows[0];
   if(existing?.role==='admin'||email===u.email)fail('Administrator hisobini o‘zgartirish mumkin emas',403);
   if(b.action==='permissions'){
    if(!existing)fail('Hisob topilmadi',404);
    if(existing.role==='teacher'&&!hasPaidTuition(existing))fail('Avval bir martalik 400 000 so‘m to‘lovni tasdiqlang',403);
    await client.query("UPDATE campus_users SET permissions=$1,active=true WHERE id=$2 AND role IN ('zavuch','teacher')",[JSON.stringify(existing.role==='teacher'?teacherModules:kinds),existing.id]);await audit('permissions','Kirish administrator tomonidan tiklandi');
   }else{
    if(!['teacher','zavuch'].includes(b.role))fail('Hisob turini tanlang');const role=b.role;
    if(existing&&existing.role!==role)fail('Mavjud hisob turini bu yerda o‘zgartirish mumkin emas',409);
    const paid=role==='teacher'&&(hasPaidTuition(existing)||b.paymentApproved===true);
    if(role==='teacher'&&!paid)fail('Bir martalik 400 000 so‘m to‘lovni tekshirib tasdiqlang',403);
    let profile;
    if(b.rosterId){
     if(role!=='teacher')fail('Ro‘yxatdagi hisob turi — o‘qituvchi');
     profile=(await client.query("SELECT * FROM campus_records WHERE id=$1 AND kind='teachers' FOR UPDATE",[b.rosterId])).rows[0];
     if(!profile)fail('O‘qituvchi ro‘yxatdan olib tashlangan. Ro‘yxatni yangilang.',409);
     if(b.rosterRevision!==rosterRevision(profile.data)||profile.data.teacherAccountId)fail('O‘qituvchi ma’lumoti o‘zgargan. Ro‘yxatni yangilang.',409);
     if(email!==String(profile.data.email||'').toLowerCase()||b.name.trim()!==profile.data.name)fail('Ro‘yxatdagi F.I.Sh. va emailni tekshiring',409);
    }
    const invite=token(),id=existing?.id||token(),permissions=role==='teacher'?teacherModules:kinds;
    await client.query("INSERT INTO campus_users(id,email,name,role,permissions,invite_hash,invite_expires,payment_approved,payment_amount,payment_approved_at) VALUES($1,$2,$3,$6,$4,$5,now()+interval '48 hours',$7,$8,CASE WHEN $7 THEN now() ELSE NULL END) ON CONFLICT(email) DO UPDATE SET name=excluded.name,permissions=excluded.permissions,invite_hash=excluded.invite_hash,invite_expires=excluded.invite_expires,active=true,payment_approved=excluded.payment_approved,payment_amount=excluded.payment_amount,payment_approved_at=COALESCE(campus_users.payment_approved_at,excluded.payment_approved_at),password_hash=NULL",[id,email,b.name.trim(),JSON.stringify(permissions),digest(invite),role,paid,paid?tuition.amount:0]);
    if(profile){const linked=(await client.query("SELECT id FROM campus_records WHERE kind='teachers' AND data->>'teacherAccountId'=$1 AND id<>$2",[id,profile.id])).rows;if(linked.length)fail('Bu hisob boshqa o‘qituvchi ma’lumotiga bog‘langan',409);await client.query('UPDATE campus_records SET data=$1,updated_at=now() WHERE id=$2',[{...profile.data,teacherAccountId:id},profile.id]);}
    if(existing)await client.query('DELETE FROM campus_sessions WHERE user_id=$1',[existing.id]);
    await audit('invite','Foydalanuvchi taklifi administrator tomonidan tayyorlandi');result.invite=invite;
   }
  }
  await client.query('COMMIT');json(res,200,result);return true;
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
