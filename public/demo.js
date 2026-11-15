import {validateArrivalPosition} from './campus-location.js';
import {teacherData,planTeacherImport,sameTeacher} from './teacher-roster-model.js';
import {academicYear,localDay,dueYearEvent,nextYear,promoteRecords,scopedArchive,archiveCounts} from './year-model.js';
import {planScheduleImport,scheduleRevision} from './schedule-model.js';
import {validateProfile,educationStatuses,educationStatus} from './profile-model.js';
import {generateLesson,sourceStamp,validateLesson} from './lesson-model.js';
import {teacherModules,visibleRecord,editableRecord,normalizeSchoolRecord,arrivalSummary,dateParts,tuition} from './workspace-model.js';
const modules = ['students','staff','groups','schedule','attendance','preparation','teachers','grades','arrivals','monthly','graduates','rooms','assignments','announcements','curricula'];
const clone = value => structuredClone(value);
const fail = (message, status = 400) => { throw Object.assign(Error(message), { status }); };

export function demoRole(search) {
  const role = new URLSearchParams(search).get('demo');
  return ['zavuch', 'teacher'].includes(role) ? role : null;
}
export function seedDemo(role, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Tashkent', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(date);
  const day = ['year','month','day'].map(k => parts.find(p => p.type === k).value).join('-');
  const year = Number(day.slice(0,4)) - (Number(day.slice(5,7)) < 9 ? 1 : 0);
  const user = { id:'demo-'+role, role, name:role === 'zavuch' ? 'Namuna zavuch' : 'Namuna o‘qituvchi', email:role+'@example.test' };
  let i = 0;
  const row = (kind, name, detail, extra) => ({ id:'demo-row-'+(++i), kind, data:{name,detail,extra}, updated_at:date.toISOString() });
  const records = [
    row('teachers','Namuna o‘qituvchi','Matematika','Sinov yozuvi'),
    row('staff','Namuna xodim','Uslubchi','Sinov yozuvi'),
    row('groups','101','1-kurs','Namuna guruh rahbari'),
    row('groups','102','1-kurs','Namuna guruh rahbari'),
    row('students','Namuna o‘quvchi 01','101','Sinov yozuvi'),
    row('students','Namuna o‘quvchi 02','101','Sinov yozuvi'),
    row('students','Namuna o‘quvchi 03','102','Sinov yozuvi'),
    row('attendance','Namuna o‘quvchi 01',day+' / 101','Keldi'),
    row('attendance','Namuna o‘quvchi 02',day+' / 101','Sababli'),
    row('attendance','Namuna o‘quvchi 03',day+' / 102','Kelmadi'),
    row('schedule','Matematika','101 / Dushanba','09:00 / 12-xona'),
    row('grades','Namuna o‘quvchi 01','101 / Matematika','5 / '+day),
    row('arrivals','Namuna o‘qituvchi',day,'08:00 / 16:00'),
    row('graduates','Namuna bitiruvchi',String(year)+' / 201','Sinov natijasi'),
    row('rooms','12-xona','30 o‘rin / fan xonasi','Namuna mas’ul'),
    row('announcements','Haftalik uslubiy yig‘ilish','Dars jadvali va ishchi dasturlarni tekshirib chiqing.',day)
  ];
  const groups=records.filter(r=>r.kind==='groups');
  const assignments=groups.map((g,i)=>({id:'demo-assignment-'+i,teacherId:'demo-teacher',groupId:g.id,subject:'Matematika'}));
  for(const r of records){
    if(r.kind==='teachers')Object.assign(r.data,{teacherAccountId:'demo-teacher',email:'teacher@example.test'});
    if(r.kind==='students')r.data.groupId=groups.find(g=>g.data.name===r.data.detail)?.id;
    if(r.kind==='schedule')Object.assign(r.data,{teacherId:'demo-teacher',groupId:groups[0].id,subject:'Matematika',weekday:'1',startTime:'09:00',endTime:'10:20',room:'12-xona'});
    if(['attendance','grades'].includes(r.kind)){const student=records.find(x=>x.kind==='students'&&x.data.name===r.data.name);Object.assign(r.data,{teacherId:'demo-teacher',groupId:student?.data.groupId,studentId:student?.id,subject:'Matematika',date:day});if(r.kind==='attendance')r.data.status=r.data.extra;else r.data.value='5';}
    if(r.kind==='arrivals'){const yesterday=dateParts(new Date(date.getTime()-86400000)).date;Object.assign(r.data,{teacherId:'demo-teacher',date:yesterday,detail:yesterday,startTime:'08:00',endTime:'16:00'});}
  }
  records.push(row('schedule','Matematika','102 / Chorshanba','10:30–11:50 / 12-xona'));
  Object.assign(records.at(-1).data,{teacherId:'demo-teacher',groupId:groups[1].id,subject:'Matematika',weekday:'3',startTime:'10:30',endTime:'11:50',room:'12-xona'});
  const data = {
    subject:'Matematika — sinov dasturi', teacher:user.name, direction:'Namuna', course:'1', groups:'101', year:year+'/'+(year+1), department:'Aniq fanlar',
    director:'Namuna direktor', deputy:'Namuna o‘quv ishlari bo‘yicha o‘rinbosar', departmentHead:'Namuna kafedra mudiri', departmentDecision:'Sinov rekviziti', councilDecision:'Sinov rekviziti',
    plannedHours:4, sourceName:'Namoyish uchun kiritilgan ikki mavzuli namuna', sourceId:'demo-sample-source', reviewed:true,
    aim:'Tenglamalarni yechish bosqichlarini o‘rganish. Bu platformani tekshirish uchun qisqa namuna.',
    tasks:'Tenglamaning yechimini aniqlash va tekshirish; misollarni mustaqil bajarish.',
    outcomes:'O‘quvchi chiziqli tenglamani yechadi va javobni o‘rniga qo‘yib tekshiradi.',
    independent:'Uchta chiziqli tenglama tuzish va yechish.', resources:'Doska, daftar va mashqlar to‘plami.',
    assessment:'Yechish ketma-ketligi, javobning aniqligi va tekshirish bosqichi baholanadi.',
    literature:'Namoyish uchun kiritilgan mashqlar. Rasmiy namunaviy dastur o‘rnini bosmaydi.',
    digital:'Elektron jadval yordamida natijalarni tekshirish va foydalanilgan manbani ko‘rsatish.',
    topics:[
      {title:'Chiziqli tenglamalar',type:'Nazariy',hours:2,selfHours:1,content:'Tenglama, ildiz va teng kuchli almashtirishlar. 2x + 3 = 11 misolini yechish.',homework:'Uchta tenglama yechish.',independentTask:'Yechimni tekshirish.',reference:'Sinov mashqlar to‘plami',date:day,note:'Namoyish'},
      {title:'Tenglamalarga doir masalalar',type:'Amaliy',hours:2,selfHours:1,content:'Masala shartidan tenglama tuzish, yechish va javobni izohlash.',homework:'Ikkita matnli masala yechish.',independentTask:'Mustaqil masala tuzish.',reference:'Sinov mashqlar to‘plami',date:'',note:'Namoyish'}
    ]
  };
  return { activeYear:academicYear(date),yearPhase:'active',startsOn:academicYear(date).slice(0,4)+'-09-02',archives:[],pending:[],archiveFiles:{},user, records, assignments,teachers:[{id:'demo-teacher',name:'Namuna o‘qituvchi'}],curricula:[], programs:[{id:'demo-program',owner_id:user.id,owner_name:user.name,data,updated_at:date.toISOString()}], audit:[] };
}
export function demoMonthly(records, month, group = '') {
  const summary = new Map(); let undated = 0;
  for (const {data} of [...records].filter(r=>r.kind==='attendance').sort((a,b)=>a.updated_at.localeCompare(b.updated_at)||a.id.localeCompare(b.id))) {
    const date = String(data.detail||'').match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
    if (!date) { undated++; continue; }
    if (!date.startsWith(month)) continue;
    const g = data.detail.replace(date,'').replace(/^[\s/|,;-]+|[\s/|,;-]+$/g,'');
    if (group && g !== group) continue;
    const key = JSON.stringify([data.name,g]);
    const r = summary.get(key) || {name:data.name,group:g,days:new Map()};
    r.days.set(date,String(data.extra||'').trim().toLowerCase()); summary.set(key,r);
  }
  const rows = [...summary.values()].map(r=>({name:r.name,group:r.group,present:[...r.days.values()].filter(s=>/^keldi\b/.test(s)).length,absent:[...r.days.values()].filter(s=>/^kelmadi\b/.test(s)).length,excused:[...r.days.values()].filter(s=>/^sababli\b/.test(s)).length,other:[...r.days.values()].filter(s=>!/^(keldi|kelmadi|sababli)\b/.test(s)).length}));
  return {rows,undated};
}
async function transport(action, data, binary = false) {
  // No live API fallback and no session cookies in preview requests.
  if (!['upload','validate','export','lesson-export'].includes(action)) fail('Topilmadi',404);
  const r = await fetch('/api/demo/'+action,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  if (!r.ok) { const e = await r.json(); fail(e.error,r.status); }
  return binary ? r.blob() : r.json();
}
export function createDemo(role, options = {}) {
  if (!['zavuch','teacher'].includes(role)) return null;
  let storage = options.storage;
  if (storage === undefined) { try { storage = globalThis.sessionStorage; } catch { storage = null; } }
  const key = 'campus-demo-v2-'+role, request = options.transport || transport;
  const now=options.now||(()=>new Date());const initial = seedDemo(role,now()); let data = clone(initial);
  try { const saved = JSON.parse(storage?.getItem(key)||'null'); if (saved && Array.isArray(saved.records) && Array.isArray(saved.programs) && Array.isArray(saved.audit)) data={...initial,...saved,user:initial.user}; } catch {}
  const save = () => { try { storage?.setItem(key,JSON.stringify(data)); } catch { /* In-memory preview remains usable if storage is full. */ } };
  const log = (action, detail) => { data.audit.unshift({action,detail,name:data.user.name,created_at:new Date().toISOString()}); data.audit=data.audit.slice(0,100); save(); };
  const advance=()=>{
   for(let i=0;i<40;i++){
    const event=dueYearEvent({active_year:data.activeYear,phase:data.yearPhase,starts_on:data.startsOn},now());if(!event)return;
    if(event==='start'){data.yearPhase='active';save();continue;}
    const year=data.activeYear,promotion=promoteRecords(data.records,year),fileRows=[...Object.entries(data.sourceFiles||{}).map(([id,f])=>({...f,id:'source:'+id,kind:'source',owner_id:data.user.id})),...(data.scheduleImports||[]).map(f=>({...f,id:'schedule:'+f.id,kind:'schedule'}))];
    const lessons=Object.entries(data.lessons||{}).flatMap(([program_id,items])=>Object.entries(items).map(([i,l])=>({program_id,topic_index:Number(i),source_hash:l.hash,data:clone(l.data)})));
    const snapshot={year,records:clone(data.records),assignments:clone(data.assignments),programs:clone(data.programs),lessons,files:fileRows.map(({base64,...f})=>f)};
    data.archives.push({year,next_year:nextYear(year),archived_at:now().toISOString(),snapshot});data.archiveFiles[year]=fileRows;
    data.pending.push(...promotion.pending.map(item=>({id:year+':'+item.student.id,year,data:item})));
    data.records=promotion.records;data.assignments=[];data.programs=[];data.lessons={};data.sources={};data.sourceFiles={};data.scheduleImports=[];data.activeYear=nextYear(year);data.yearPhase='preparation';data.startsOn=data.activeYear.slice(0,4)+'-09-02';save();
   }
   fail('Yillarni tekshirish chegarasi oshdi');
  };
  return {
    role,
    reset() { data=clone(initial); save(); },
    async api(path, b) {
      advance();const [route, qs=''] = path.split('?');
      if (route==='status' && !b) return {setup:false};
      if (route==='me' && !b) return {academicYear:data.activeYear,yearPhase:data.yearPhase,user:clone(data.user),permissions:role==='zavuch'?[...modules]:[...teacherModules]};
      if(route==='years'&&!b)return {activeYear:data.activeYear,phase:data.yearPhase,startsOn:data.startsOn,archives:data.archives.map(({snapshot,...a})=>a),pending:role==='zavuch'?clone(data.pending):[]};
      if(route==='years/placement'&&b){if(role!=='zavuch')fail('Faqat zavuch uchun',403);if(b.year!==data.activeYear)fail('O‘quv yili o‘zgargan',409);if(!Object.hasOwn(educationStatuses,b.status)||!['1','2'].includes(b.course))fail('Holat va kursni tanlang');const item=data.pending.find(i=>i.id===b.id);if(!item)fail('Topilmadi',404);if(b.status!=='expelled'){const r=clone(item.data.student);r.kind=b.status==='graduated'?'graduates':'students';Object.assign(r.data,{educationStatus:b.status,course:b.course,active:['studying','retained'].includes(b.status),previousGroup:item.data.group?.data.name||r.data.detail,detail:b.course+'-kurs · guruhga biriktirilmagan'});delete r.data.groupId;data.records.push(r);}data.pending=data.pending.filter(i=>i!==item);save();return {ok:true};}
      if(route.startsWith('years')){if(b)fail('Arxiv faqat ko‘rish uchun',405);const year=route.slice(6),a=data.archives.find(a=>a.year===year);if(!a)fail('Arxiv topilmadi',404);const s=scopedArchive(a.snapshot,data.user);return {...clone(s),counts:archiveCounts(s),archivedAt:a.archived_at};}
      if(route==='teacher-roster'&&b){if(role!=='zavuch')fail('Ro‘yxat faqat zavuch uchun',403);if(b.id){const old=data.records.find(r=>r.kind==='teachers'&&r.id===b.id);if(!old)fail('O‘qituvchi topilmadi',404);if(b.action==='delete'){if(old.data.teacherAccountId)fail('Kirishni administrator boshqaradi',403);data.records=data.records.filter(r=>r!==old);}else{const next=teacherData(b.data,fail);if(data.records.some(r=>r.kind==='teachers'&&r!==old&&sameTeacher(r.data,next)))fail('Bu o‘qituvchi ro‘yxatda mavjud',409);old.data={...old.data,...next};}save();return {ok:true,added:0,duplicates:0};}const plan=planTeacherImport(b.rows||[b.data],data.records,fail);data.records.push(...plan.added.map(d=>({id:'demo-'+crypto.randomUUID(),kind:'teachers',data:d,updated_at:new Date().toISOString()})));log('save','O‘qituvchilar ro‘yxati');return {ok:true,added:plan.added.length,duplicates:plan.duplicates.length};}
      if(route==='assignments'&&!b)return {assignments:clone(data.assignments.filter(a=>role==='zavuch'||a.teacherId===data.user.id)),teachers:role==='zavuch'?clone(data.teachers):[]};
      if(route==='assignments'&&b){if(role!=='zavuch')fail('Faqat zavuch uchun',403);if(b.action==='delete')data.assignments=data.assignments.filter(a=>a.id!==b.id);else{if(!data.teachers.some(t=>t.id===b.teacherId)||!data.records.some(r=>r.kind==='groups'&&r.id===b.groupId)||typeof b.subject!=='string'||!b.subject.trim())fail('Fan, guruh va o‘qituvchini tanlang');if(!data.assignments.some(a=>a.teacherId===b.teacherId&&a.groupId===b.groupId&&a.subject===b.subject.trim()))data.assignments.push({id:'demo-'+crypto.randomUUID(),teacherId:b.teacherId,groupId:b.groupId,subject:b.subject.trim()});}log('save','Dars biriktirildi');return {ok:true};}
      if(route==='curricula'&&!b)return {curricula:[]};
      if(route==='my-access'&&!b&&role==='teacher')return {active:true,approved:true,tuition};
      if(route==='my-monthly'&&!b&&role==='teacher'){const q=new URLSearchParams(qs);return arrivalSummary(data.records.filter(r=>r.data.teacherId===data.user.id),q.get('month')||'');}
      if(route==='arrivals/check'&&b&&role==='teacher'){if(data.yearPhase!=='active')fail('Yangi o‘quv yili 2-sentabrda boshlanadi.',409);const locationCheck=validateArrivalPosition(b.position);const {date,time}=dateParts(),old=data.records.find(r=>r.kind==='arrivals'&&r.data.teacherId===data.user.id&&r.data.date===date&&r.data.arrivalLocation);if(b.action==='in'){if(!old)data.records.unshift({id:'demo-'+crypto.randomUUID(),kind:'arrivals',updated_at:new Date().toISOString(),data:{teacherId:data.user.id,name:data.user.name,detail:date,extra:time+' / ',date,startTime:time,endTime:'',arrivalLocation:locationCheck}});}else if(b.action==='out'){if(!old||old.data.endTime)fail('Kelish belgilanmagan yoki ketish allaqachon belgilangan');old.data.endTime=time;old.data.extra=old.data.startTime+' / '+time;old.data.departureLocation=locationCheck;}else fail('Amalni tanlang');log('save','Kelish-ketish');return {ok:true};}
      if(route==='schedule-imports'){if(role!=='zavuch')fail('Faqat zavuch uchun',403);data.scheduleImports||=[];if(!b)return {imports:clone(data.scheduleImports.map(({base64,extracted,...i})=>i)),revision:scheduleRevision(data.records)};if(data.scheduleImports.some(i=>i.id===b.importId))return {ok:true,repeated:true,added:0};if(b.revision!==scheduleRevision(data.records))fail('Jadval o‘zgargan. Joriy holatni yangilang.',409);const p=planScheduleImport(b,data.records,data.teachers,data.assignments,fail);if(p.createdGroup)data.records.push(p.group);data.records=data.records.filter(r=>!p.removeIds.includes(r.id));data.records.push(...p.added.map(r=>({...r,updated_at:new Date().toISOString()})));data.assignments.push(...p.links);data.scheduleImports.push({id:b.importId,group_name:p.group.data.name,group_id:p.group.id,name:b.name,base64:b.base64,row_count:p.added.length,created_at:new Date().toISOString()});log('save','Jadval yuklandi');return {ok:true,groupId:p.group.id,createdGroup:p.createdGroup,added:p.added.length,duplicates:p.duplicateCount,pending:p.pending.length};}
      if (route==='records' && !b) return {records:clone(data.records.filter(r=>visibleRecord(data.user,r,data.assignments,data.records)))};
      if (route==='records' && b) {
        if(b.kind==='arrivals')fail('Kelish-ketish faqat o‘qituvchining «Keldim» va «Ketdim» tugmalari orqali GPS hududida qayd etiladi.',403);
        if(b.kind==='teachers')return this.api('teacher-roster',b);
        if(data.yearPhase!=='active'&&['attendance','grades'].includes(b.kind))fail('Yangi o‘quv yili 2-sentabrda boshlanadi.',409);
        if (!modules.includes(b.kind) || ['preparation','monthly','assignments','curricula'].includes(b.kind)||(role==='teacher'&&!['attendance','grades'].includes(b.kind))) fail('Bu bo‘limga ruxsat berilmagan',403);
        const old = b.id && data.records.find(r=>r.id===b.id && r.kind===b.kind);
        if (b.id && (!old||!editableRecord(data.user,old,data.assignments,data.records))) fail('Yozuvga ruxsat yo‘q',403);
        if (b.action==='delete') data.records=data.records.filter(r=>r!==old);
        else {
          if(['students','graduates','teachers'].includes(b.kind))b={...b,data:{...old?.data,...b.data}};if(b.kind==='schedule'&&b.data.groupId){const group=data.records.find(r=>r.id===b.data.groupId);const plan=planScheduleImport({groupId:group.id,groupName:group.data.name,rows:[{teacherName:'',teacherId:'',room:'',part:'',...b.data}],reviewed:true},data.records.filter(r=>r!==old),data.teachers,data.assignments,fail);if(!plan.added.length)fail('Bu dars mavjud');data.assignments.push(...plan.links);b={...b,data:plan.added[0].data};}b={...b,data:normalizeSchoolRecord(data.user,b.kind,b.data,data.records,data.assignments,fail)};validateProfile(b.data,fail);
          if (!b.data || typeof b.data.name!=='string' || !b.data.name.trim() || ['name','detail','extra'].some(k=>typeof b.data[k]!=='string'||b.data[k].length>250)) fail('Maydonlarni tekshiring');
          let kind=b.kind;if(['students','graduates'].includes(kind)){const status=educationStatus(b.data,kind);b.data.educationStatus=status;b.data.active=['studying','retained'].includes(status);kind=status==='graduated'?'graduates':'students';}const r={id:old?.id||'demo-'+crypto.randomUUID(),kind,data:clone(b.data),updated_at:new Date().toISOString()};
          if (old) data.records.splice(data.records.indexOf(old),1,r); else data.records.unshift(r);
        }
        log(b.action==='delete'?'delete':'save',b.kind+': '+(b.data?.name||old?.data.name||'')); return {ok:true};
      }
      if (route==='audit' && !b && role==='zavuch') return {audit:clone(data.audit)};
      if (route==='monthly' && !b && role==='zavuch') {
        const q=new URLSearchParams(qs); return demoMonthly(data.records,q.get('month')||'',q.get('group')||'');
      }
      const lm=route.match(/^preparation\/([^/]+)\/lessons(?:\/(generate|\d+))?$/);
      if(lm){const program=data.programs.find(p=>p.id===lm[1]);if(!program)fail('Dastur topilmadi',404);data.lessons||={};const saved=data.lessons[program.id]||={};const plan=program.data;
       if(!lm[2]&&!b)return {lessons:plan.topics.map((t,i)=>({index:i,title:t.title,data:clone(saved[i]?.data||null),hash:sourceStamp(plan,i),stale:!!saved[i]&&saved[i].hash!==sourceStamp(plan,i)}))};
       if(lm[2]==='generate'&&b){if(!plan.sourceId)fail('Avval namunaviy dastur faylini yuklang');if(b.replaceIndex!==undefined&&(!Number.isInteger(b.replaceIndex)||!plan.topics[b.replaceIndex]))fail('Mavzuni tanlang');for(const [i,t]of plan.topics.entries()){if(b.replaceIndex!==undefined?i===b.replaceIndex:!saved[i])saved[i]={data:generateLesson(plan,i,data.sources?.[plan.sourceId]||''),hash:sourceStamp(plan,i)};}save();return {ok:true};}
       const i=Number(lm[2]);if(b&&Number.isInteger(i)&&plan.topics[i]){if(b.hash!==sourceStamp(plan,i))fail('Dastur o‘zgargan. Mavzular ro‘yxatini yangilang.',409);const errors=validateLesson(b.data);if(errors.length)fail(errors.join('; '));saved[i]={data:clone(b.data),hash:b.hash};save();return {ok:true};}fail('Topilmadi',404);
      }
      if (route==='preparation' && !b) return {programs:clone(data.programs)};
      if (route==='preparation/upload' && b) {const result=await request('upload',b);data.sources||={};data.sources[result.id]=result.text;data.sourceFiles||={};data.sourceFiles[result.id]={name:b.name,base64:b.base64};save();return result;}
      if (route==='preparation' && b) {
        const old=b.id && data.programs.find(p=>p.id===b.id);
        if (b.id && !old) fail('Dastur topilmadi',404);
        await request('validate',{data:b.data});
        const p={id:old?.id||'demo-'+crypto.randomUUID(),owner_id:data.user.id,owner_name:data.user.name,data:clone(b.data),updated_at:new Date().toISOString()};
        if (old) data.programs.splice(data.programs.indexOf(old),1,p); else data.programs.unshift(p);
        log('save',b.data.subject); return {ok:true,id:p.id};
      }
      fail('Bu amal namoyish rejimida mavjud emas',403);
    },
    async archiveDownload(path){
      const m=path.match(/^years\/(\d{4}-\d{4})\/(export|files|programs)(?:\/([^/]+))?(?:\/(program|calendar|lessons))?(?:\/(\d+))?$/),a=m&&data.archives.find(a=>a.year===m[1]);if(!a)fail('Arxiv topilmadi',404);const s=scopedArchive(a.snapshot,data.user);
      if(m[2]==='export')return new Blob([JSON.stringify(s,null,2)],{type:'application/json'});
      if(m[2]==='files'){const id=decodeURIComponent(m[3]);if(!s.files.some(f=>f.id===id))fail('Fayl topilmadi',404);const f=data.archiveFiles[m[1]].find(f=>f.id===id);return new Blob([Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0))]);}
      const p=s.programs.find(p=>p.id===m[3]);if(!p)fail('Dastur topilmadi',404);
      if(m[4]==='lessons'){const l=s.lessons.find(l=>l.program_id===p.id&&l.topic_index===Number(m[5]));if(!l)fail('Dars hujjati topilmadi',404);return request('lesson-export',{data:p.data,index:Number(m[5]),lesson:l.data,format:'bundle'},true);}
      return request('export',{data:p.data,format:m[4]},true);
    },
    async scheduleFile(id){if(role!=='zavuch')fail('Faqat zavuch uchun',403);const f=data.scheduleImports?.find(f=>f.id===id);if(!f)fail('Fayl topilmadi',404);return {name:f.name,blob:new Blob([Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0))])};},
    async downloadLesson(id,index,format){const p=data.programs.find(p=>p.id===id),r=data.lessons?.[id]?.[index];if(!p||!r)fail('Hujjat topilmadi',404);if(r.hash!==sourceStamp(p.data,index))fail('Mavzu o‘zgargan. Hujjatni ochib moslashtiring va saqlang.',409);return request('lesson-export',{data:p.data,index,lesson:r.data,format},true);},
    async download(id, format) {
      const p=data.programs.find(p=>p.id===id); if (!p) fail('Dastur topilmadi',404);
      return request('export',{data:p.data,format},true);
    }
  };
}
