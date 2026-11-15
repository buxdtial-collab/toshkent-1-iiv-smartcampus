export const teacherModules=['preparation','schedule','attendance','grades','arrivals','monthly','students','groups','announcements','accessstatus','curricula'];
export const tuition={amount:400000,currency:'UZS',frequency:'once'};
export function dateParts(now=new Date()){
 const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const get=k=>p.find(x=>x.type===k).value;return {date:['year','month','day'].map(get).join('-'),time:['hour','minute'].map(get).join(':')};
}
export function studentGroup(row,records){
 if(row?.kind!=='students')return '';
 if(row.data.groupId)return row.data.groupId;
 const found=records.filter(r=>r.kind==='groups'&&r.data.name===row.data.detail);return found.length===1?found[0].id:'';
}
export function assigned(user,groupId,subject,assignments){return assignments.some(a=>a.teacherId===user.id&&a.groupId===groupId&&(!subject||a.subject===subject))}
export function visibleRecord(user,row,assignments,records){
 if(user.role==='zavuch')return true;if(user.role!=='teacher')return false;
 const d=row.data||{};
 if(row.kind==='groups')return assigned(user,row.id,null,assignments);
 if(row.kind==='students')return assigned(user,studentGroup(row,records),null,assignments);
 if(row.kind==='announcements')return !d.groupId||assigned(user,d.groupId,null,assignments);
 if(row.kind==='arrivals')return d.teacherId===user.id;
 if(['schedule','attendance','grades'].includes(row.kind))return typeof d.subject==='string'&&Boolean(d.subject)&&d.teacherId===user.id&&assigned(user,d.groupId,d.subject,assignments);
 return false;
}
export function editableRecord(user,row,assignments,records){return user.role==='zavuch'||(user.role==='teacher'&&['attendance','grades'].includes(row.kind)&&visibleRecord(user,row,assignments,records))}
export function normalizeSchoolRecord(user,kind,input,records,assignments,fail){
 const d={...input};
 if(user.role!=='zavuch'&&!['attendance','grades'].includes(kind))fail('Bu bo‘lim faqat ko‘rish uchun',403);
 const group=records.find(r=>r.id===d.groupId&&r.kind==='groups');
 if(kind==='students'&&d.groupId){if(!group)fail('Guruhni tanlang');d.detail=group.data.name;}
 if(kind==='announcements'&&d.groupId&&!group)fail('Guruhni tanlang');
 if(['schedule','attendance','grades'].includes(kind)){
  // Legacy three-column imports stay visible only to the zavuch until explicitly assigned.
  if(user.role==='zavuch'&&!d.groupId&&!d.teacherId&&!d.studentId)return d;
  if(!group)fail('Guruhni tanlang');
  if(user.role==='teacher')d.teacherId=user.id;
  if(!(kind==='schedule'&&user.role==='zavuch'&&!d.teacherId)&&!assignments.some(a=>a.teacherId===d.teacherId&&a.groupId===d.groupId&&a.subject===d.subject))fail('Fan va guruh o‘qituvchiga biriktirilmagan',403);
  if(kind==='schedule'){
   if(!/^[1-6]$/.test(d.weekday||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.startTime||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.endTime||'')||d.endTime<=d.startTime)fail('Hafta kuni va dars vaqtini tekshiring');
   d.name=d.subject;d.detail=group.data.name+' / '+['','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba'][Number(d.weekday)];d.extra=d.startTime+'–'+d.endTime+' / '+(d.room||'');
  }else{
   const student=records.find(r=>r.id===d.studentId&&r.kind==='students');
   if(!student||studentGroup(student,records)!==d.groupId)fail('O‘quvchi ushbu guruhga tegishli emas',403);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date||'')||Number.isNaN(Date.parse(d.date))||new Date(d.date).toISOString().slice(0,10)!==d.date)fail('Sanani tekshiring');
   d.name=student.data.name;
   if(kind==='attendance'){if(!['Keldi','Kelmadi','Sababli'].includes(d.status))fail('Davomat holatini tanlang');d.detail=d.date+' / '+group.data.name;d.extra=d.status;}
   else{if(!/^[1-5]$/.test(d.value||''))fail('Baho 1 dan 5 gacha bo‘lsin');d.detail=group.data.name+' / '+d.subject;d.extra=d.value+' / '+d.date;}
  }
 }
 return d;
}
export function arrivalSummary(records,month){
 const rows=records.filter(r=>r.kind==='arrivals'&&(r.data.date||r.data.detail||'').startsWith(month)).map(r=>{const d=r.data;let minutes=0;if(d.startTime&&d.endTime){const val=s=>Number(s.slice(0,2))*60+Number(s.slice(3,5));minutes=Math.max(0,val(d.endTime)-val(d.startTime));}return {date:d.date||d.detail,start:d.startTime||'',end:d.endTime||'',minutes};}).sort((a,b)=>a.date.localeCompare(b.date));
 return {rows,days:rows.length,minutes:rows.reduce((s,r)=>s+r.minutes,0)};
}
