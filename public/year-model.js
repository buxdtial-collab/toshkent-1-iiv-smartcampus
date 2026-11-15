import {educationStatus} from './profile-model.js';
import {visibleRecord,studentGroup} from './workspace-model.js';
export function localDay(date=new Date()){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);return ['year','month','day'].map(k=>p.find(v=>v.type===k).value).join('-');}
export function academicYear(date=new Date()){const d=localDay(date),y=Number(d.slice(0,4))-(d.slice(5)<'09-02'?1:0);return `${y}-${y+1}`;}
export function nextYear(year){const y=Number(year.slice(0,4))+1;return `${y}-${y+1}`;}
export function dueYearEvent(state,date=new Date()){
 const today=localDay(date),end=state.active_year.slice(5);
 if(state.phase==='preparation')return today>=state.starts_on?'start':null;
 return today>=end+'-07-01'?'archive':null;
}
export function courseNumber(value){const s=String(value??'').trim().toLowerCase();return /^(1|2)(?:\s*[-–]?\s*(?:kurs|bosqich))?$/.exec(s)?.[1]||'';}
export function groupCourse(group){return courseNumber(group?.data?.course)||courseNumber(group?.data?.detail);}
export function promoteRecords(records,year){
 const result=records.filter(r=>r.kind==='teachers').map(r=>structuredClone(r)),pending=[];let promoted=0,graduated=0;
 const keptGroups=new Map();
 for(const group of records.filter(r=>r.kind==='groups'&&groupCourse(r)==='1')){const g=structuredClone(group);Object.assign(g.data,{course:'2',detail:'2-kurs',promotedFromYear:year});keptGroups.set(g.id,g);}
 for(const student of records.filter(r=>r.kind==='students')){
  const status=educationStatus(student.data);
  if(status==='expelled')continue;
  const group=records.find(g=>g.id===studentGroup(student,records)&&g.kind==='groups');
  const explicit=courseNumber(student.data.course),gc=groupCourse(group),course=explicit||gc;
  if(!course||(status==='studying'&&explicit&&gc&&explicit!==gc)||(status==='studying'&&course==='1'&&!group)){pending.push({student:structuredClone(student),group:group?structuredClone(group):null});continue;}
  const r=structuredClone(student);
  if(['retained','academic_leave'].includes(status)){Object.assign(r.data,{course,educationStatus:status,previousGroup:group?.data.name||r.data.previousGroup||r.data.detail,detail:course+'-kurs · '+(status==='retained'?'Kursda qoldirildi':'Akademik ta’til'),active:status==='retained'});delete r.data.groupId;result.push(r);continue;}
  if(course==='1'&&status!=='graduated'){
   Object.assign(r.data,{course:'2',promotedFromYear:year,educationStatus:'studying'});
   if(!keptGroups.has(group.id)){const g=structuredClone(group);Object.assign(g.data,{course:'2',detail:'2-kurs',promotedFromYear:year});keptGroups.set(g.id,g);}
   result.push(r);promoted++;
  }else{
   r.kind='graduates';Object.assign(r.data,{educationStatus:'graduated',course:'2',graduationYear:year.slice(5),previousGroup:group?.data.name||r.data.detail,detail:year.slice(5)+' / '+(group?.data.name||r.data.detail),active:false});delete r.data.groupId;result.push(r);graduated++;
  }
 }
 result.push(...keptGroups.values());return {records:result,pending,promoted,graduated};
}
export function archiveCounts(s){return {students:s.records.filter(r=>r.kind==='students').length,groups:s.records.filter(r=>r.kind==='groups').length,schedule:s.records.filter(r=>r.kind==='schedule').length,attendance:s.records.filter(r=>r.kind==='attendance').length,grades:s.records.filter(r=>r.kind==='grades').length,programs:s.programs.length,lessons:s.lessons.length};}
export function scopedArchive(s,u){
 if(!['teacher','zavuch'].includes(u.role))throw Object.assign(Error('Arxiv o‘quv kabinetlari uchun.'),{status:403});
 if(u.role==='zavuch')return structuredClone(s);
 const assignments=s.assignments.filter(a=>a.teacherId===u.id),programs=s.programs.filter(p=>p.owner_id===u.id),ids=new Set(programs.map(p=>p.id));
 return {...s,records:s.records.filter(r=>visibleRecord(u,r,assignments,s.records)),assignments,programs,lessons:s.lessons.filter(l=>ids.has(l.program_id)),files:(s.files||[]).filter(f=>f.kind==='curriculum'||f.kind==='source'&&f.owner_id===u.id),sources:(s.sources||[]).filter(f=>f.owner_id===u.id),imports:[]};
}
