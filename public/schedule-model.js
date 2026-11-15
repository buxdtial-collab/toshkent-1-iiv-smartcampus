export const days=['','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba'];
export const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[‘’ʻʼ`']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const aliases=[[],['dushanba','душанба','понедельник','monday'],['seshanba','сешанба','вторник','tuesday'],['chorshanba','чоршанба','среда','wednesday'],['payshanba','пайшанба','четверг','thursday'],['juma','жума','пятница','friday'],['shanba','шанба','суббота','saturday']];
export const weekday=s=>{const i=aliases.findIndex(a=>a.includes(norm(s)));return i>0?String(i):''};
export function dayFromText(s){for(let d=1;d<=6;d++)if(aliases[d].some(a=>norm(s).split(' ').includes(a)))return String(d);return '';}
export function inferGroup(text,name=''){const s=String(text||'').slice(0,12000);const a=s.match(/(?:guruh|гуруҳ|группа)\s*(?:nomi|№|raqami)?\s*[:№.-]?\s*([\p{L}\p{N}]+(?:[-/][\p{L}\p{N}]+){0,3})/iu),b=s.match(/\b([\d]{1,3}(?:[-/][\p{L}\p{N}]+){0,3})\s*[-–]?\s*(?:guruh|гуруҳ|группа)/iu);const value=b?.[1]||a?.[1];if(value&&!/^(?:jadval|dars|nomi|uchun|raqami)$/i.test(value))return value;return String(name).replace(/\.[^.]+$/,'').match(/(?:^|[ _])([1-9]\d{1,2}(?:-[\p{L}\p{N}]{1,5})?)(?:[ _.-]|$)/u)?.[1]||'';}
export function groupKey(s){return String(s||'').normalize('NFKC').toLowerCase().replace(/[–—]/g,'-').replace(/\s*[-]?\s*(?:guruh|гуруҳ|группа)$/u,'').replace(/\s+/g,'');}
export function teacherMatch(name,teachers){const n=norm(name);if(!n)return '';const exact=teachers.filter(t=>norm(t.name)===n);return exact.length===1?exact[0].id:'';}
const timePattern=/\b([0-2]?\d)[:.\u2236]([0-5]\d)\s*[-–—−]\s*([0-2]?\d)[:.\u2236]([0-5]\d)\b/;
export function times(s){const m=String(s).match(timePattern);return m?{startTime:m[1].padStart(2,'0')+':'+m[2],endTime:m[3].padStart(2,'0')+':'+m[4]}:{startTime:'',endTime:''};}
export function wordLines(words){const sorted=words.filter(w=>w.text?.trim()&&Number.isFinite(w.x)&&Number.isFinite(w.y)).sort((a,b)=>a.y-b.y||a.x-b.x),lines=[];for(const w of sorted){let l=lines.slice(-5).find(l=>Math.abs(l.y-w.y)<=Math.max(3,Math.min(l.h,w.h||10)*.6));if(!l){l={y:w.y,h:w.h||10,words:[]};lines.push(l)}l.words.push(w)}return lines.sort((a,b)=>a.y-b.y).map(l=>({...l,words:l.words.sort((a,b)=>a.x-b.x),text:l.words.sort((a,b)=>a.x-b.x).map(w=>w.text).join(' ')}));}
function contentRow(text,teachers){let subject=text.trim(),teacherName='',room='';for(const t of [...teachers].sort((a,b)=>b.name.length-a.name.length)){if(norm(subject).includes(norm(t.name))){const escaped=t.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const m=subject.match(new RegExp(escaped,'iu'));if(m){teacherName=t.name;subject=subject.replace(m[0],'');break}}}
 const rm=subject.match(/(?:xona|хона|каб(?:инет)?)[. :№-]*([\p{L}\d-]+)/iu)||subject.match(/\b([\d]{1,3}[A-ZА-Я]?)\s*[-–]?\s*(?:xona|хона)/iu);if(rm){room=rm[1];subject=subject.replace(rm[0],'')}
 if(!teacherName){const tm=subject.match(/(?:[A-ZА-ЯЎҚҒҲ][a-zа-яўқғҳ’']+\s+[A-ZА-ЯЎҚҒҲ]\.\s*(?:[A-ZА-ЯЎҚҒҲ]\.)?|[A-ZА-ЯЎҚҒҲ]\.\s*(?:[A-ZА-ЯЎҚҒҲ]\.\s*)?[A-ZА-ЯЎҚҒҲ][a-zа-яўқғҳ’']+)/u);if(tm){teacherName=tm[0];subject=subject.replace(tm[0],'')}}
 return {subject:subject.replace(/^[\s|;:,-]+|[\s|;:,-]+$/g,'').slice(0,150),teacherName:teacherName.slice(0,150),teacherId:teacherMatch(teacherName,teachers),room:room.slice(0,80)};
}
const blank={weekday:'',slot:'',startTime:'',endTime:'',subject:'',teacherName:'',teacherId:'',room:'',part:''};
export function extractSchedule(pages,teachers=[]){const rows=[],warnings=[];let inheritedDay='';
 for(const page of pages){const lines=wordLines(page.words||[]);if(!lines.length)continue;
 const headers=lines.map(l=>({...l,dayWords:l.words.filter(w=>dayFromText(w.text))})).find(l=>new Set(l.dayWords.map(w=>dayFromText(w.text))).size>=2);
 if(headers){const cols=headers.dayWords.map(w=>({day:dayFromText(w.text),x:w.x+(w.w||0)/2})).filter((v,i,a)=>a.findIndex(x=>x.day===v.day)===i).sort((a,b)=>a.x-b.x);const spacing=cols.length>1?(cols.at(-1).x-cols[0].x)/(cols.length-1):100;const startX=cols[0].x-spacing/2;
  const anchors=lines.filter(l=>l.y>headers.y+headers.h&&l.words.some(w=>w.x<startX)&&((times(l.text).startTime)||/^\s*[1-9]\d?\s/.test(l.text))).map(l=>({y:l.y,h:l.h,time:times(l.text),slot:l.text.match(/^\s*(\d{1,2})(?:\s|[.)])/u)?.[1]||''}));
  for(const [i,a]of anchors.entries()){const end=anchors[i+1]?.y-a.h*.5||page.height||Infinity;for(const [j,col]of cols.entries()){const left=j?(cols[j-1].x+col.x)/2:startX,right=j<cols.length-1?(col.x+cols[j+1].x)/2:col.x+spacing/2;const ws=(page.words||[]).filter(w=>w.x+(w.w||0)/2>=left&&w.x+(w.w||0)/2<right&&w.y>=a.y-a.h*.5&&w.y<end);const text=wordLines(ws).map(l=>l.text).join('\n').trim();if(!text||/^[-–—.\s]+$/.test(text))continue;rows.push({...blank,...contentRow(text,teachers),...a.time,slot:a.slot,weekday:col.day,raw:text.slice(0,1000)});}}
  if(anchors.length)continue;
 }
 // A row table with labelled subject/teacher/room columns.
 const header=lines.find(l=>/(?:\bfan\b|предмет)/iu.test(l.text)&&/(?:vaqt|время|soat)/iu.test(l.text));let columns;
 if(header){columns={};for(const w of header.words){if(/^(fan|предмет)$/iu.test(w.text))columns.subject=w.x;if(/qituvchi|қитувчи|преподаватель|учитель/iu.test(w.text))columns.teacherName=w.x;if(/^(xona|хона|каб.*)$/iu.test(w.text))columns.room=w.x;}}
 for(const [i,l]of lines.entries()){const d=dayFromText(l.text);if(d)inheritedDay=d;const time=times(l.text);if(!time.startTime)continue;let text=l.text.replace(timePattern,'').replace(/^\s*\d{1,2}[.)]?\s+/,'');for(const a of aliases.flat())text=text.replace(new RegExp('\\b'+a+'\\b','iu'),'');let values=contentRow(text,teachers);
  if(columns?.subject!==undefined&&l.y>header.y){const fields=Object.entries(columns).sort((a,b)=>a[1]-b[1]);values={...values,...Object.fromEntries(fields.map(([key,x],j)=>[key,l.words.filter(w=>w.x>=x-5&&w.x<(fields[j+1]?.[1]??Infinity)-5).map(w=>w.text).join(' ')]))};values.teacherId=teacherMatch(values.teacherName,teachers);}
  rows.push({...blank,...values,...time,weekday:inheritedDay,slot:l.text.match(/^\s*(\d{1,2})(?:\s|[.)])/)?.[1]||'',raw:l.text.slice(0,1000)});
 }
 }
 if(!rows.length)warnings.push('Jadval kataklari aniqlanmadi. Asl faylga qarab qatorlarni qo‘shing.');
 if(rows.some(r=>!r.weekday||!r.startTime||!r.endTime))warnings.push('Kun yoki vaqt aniqlanmagan qatorlarni to‘ldiring.');
 if(rows.some(r=>!r.teacherId))warnings.push('O‘qituvchi hisobiga biriktirilmagan darslar zavuchga ko‘rinadi. Hisobni tanlang yoki keyin biriktiring.');
 const text=pages.map(p=>wordLines(p.words||[]).map(l=>l.text).join('\n')).join('\n\n');return {rows:rows.slice(0,100),text:text.slice(0,150000),warnings};
}
export function scheduleRevision(records){return JSON.stringify(records.filter(r=>['schedule','groups'].includes(r.kind)).map(r=>[r.id,r.updated_at,r.data]).sort((a,b)=>a[0].localeCompare(b[0])));}
export function planScheduleImport(input,records,teachers,assignments,fail,id=()=>crypto.randomUUID()){
 if(input.reviewed!==true)fail('Ajratilgan guruh va darslar tekshirilganini belgilang');
 if(typeof input.groupName!=='string'||!input.groupName.trim()||input.groupName.length>80||!['1','2','3',''].includes(input.course||''))fail('Guruh nomi va kursni tekshiring');
 const key=groupKey(input.groupName),matches=records.filter(r=>r.kind==='groups'&&groupKey(r.data.name)===key);let group;
 if(input.groupId){group=records.find(r=>r.kind==='groups'&&r.id===input.groupId);if(!group||groupKey(group.data.name)!==key)fail('Tanlangan guruh va nom mos emas');}else{if(matches.length>1)fail('Bir xil nomli guruhlar bor. Mavjud guruhni ro‘yxatdan tanlang');group=matches[0];}
 const createdGroup=!group;group||={id:id(),kind:'groups',data:{name:input.groupName.trim(),detail:input.course||'',extra:''}};
 if(!Array.isArray(input.rows)||!input.rows.length||input.rows.length>100)fail('1–100 ta dars kiriting');
 const removeIds=input.replaceGroup===true?records.filter(r=>r.kind==='schedule'&&r.data.groupId===group.id).map(r=>r.id):[];
 const existing=records.filter(r=>r.kind==='schedule'&&!removeIds.includes(r.id)),added=[],links=[],pending=[];let duplicateCount=0;
 for(const [i,r]of input.rows.entries()){const label=(i+1)+'-qator: ';if(!r||typeof r!=='object')fail(label+'darsni tekshiring');for(const k of ['weekday','startTime','endTime','subject','teacherName','teacherId','room','part'])if(typeof r[k]!=='string'||r[k].length>(k==='subject'||k==='teacherName'?150:80))fail(label+'maydonlarni tekshiring');if(!/^[1-6]$/.test(r.weekday)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.endTime)||r.endTime<=r.startTime||!r.subject.trim()||!['','1','2'].includes(r.part))fail(label+'fan, hafta kuni, bo‘linish yoki vaqtni tekshiring');
  const teacher=teachers.find(t=>t.id===r.teacherId);if(r.teacherId&&!teacher)fail(label+'o‘qituvchi hisobi topilmadi');const d={groupId:group.id,teacherId:teacher?.id||'',teacherName:teacher?.name||r.teacherName.trim(),subject:r.subject.trim(),weekday:r.weekday,startTime:r.startTime,endTime:r.endTime,room:r.room.trim(),part:r.part,name:r.subject.trim(),detail:group.data.name+' / '+days[Number(r.weekday)],extra:r.startTime+'–'+r.endTime+' / '+r.room.trim()};
  const same=x=>['groupId','teacherId','subject','weekday','startTime','endTime','room','part','teacherName'].every(k=>norm(x[k]||'')===norm(d[k]||''));if([...existing,...added].some(x=>same(x.data))){duplicateCount++;continue}
  const conflict=[...existing,...added].find(x=>{const a=x.data;if(a.weekday!==d.weekday||!a.startTime||a.endTime<=d.startTime||d.endTime<=a.startTime)return false;return (a.groupId===d.groupId&&!(a.part&&d.part&&a.part!==d.part))||(d.teacherId&&a.teacherId===d.teacherId)||(d.room&&norm(a.room)===norm(d.room));});if(conflict)fail(label+'vaqt to‘qnashuvi: '+conflict.data.name+' ('+conflict.data.detail+', '+conflict.data.startTime+'–'+conflict.data.endTime+'). Avvalgi jadvalni tekshiring.');
  added.push({id:id(),kind:'schedule',data:d});if(!teacher)pending.push(i+1);else if(![...assignments,...links].some(a=>a.teacherId===teacher.id&&a.groupId===group.id&&a.subject===d.subject))links.push({id:id(),teacherId:teacher.id,groupId:group.id,subject:d.subject});
 }
 return {group,createdGroup,added,links,removeIds,duplicateCount,pending};
}
