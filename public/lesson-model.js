export const lessonFormats={notes:'Konspekt',map:'Texnologik xarita',plan:'Dars ishlanmasi'};
export const lessonFields={objectives:'Dars maqsadi va kutiladigan natijalar',outline:'Mavzu rejasi',notes:'Konspektning asosiy matni',terms:'Tayanch tushunchalar',questions:'Mustahkamlash savollari',practice:'Amaliy topshiriq',homework:'Uyga vazifa va mustaqil ish',resources:'Foydalanilgan manbalar va jihozlar',methods:'Dars metodlari',assessment:'Baholash mezonlari',summary:'Yakunlash va refleksiya'};
const clean=s=>String(s||'').replace(/\u0000/g,'').trim();
const normal=s=>clean(s).toLocaleLowerCase().replace(/[‘’ʻʼ`']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function heading(line){
 const m=clean(line).match(/^(?:(?:\d+(?:\.\d+)*\s*[-–.]?\s*)?(?:mavzu|мавзу)(?:\s*\d+(?:\.\d+)*)?\s*[:.\-–]\s*|\d+(?:\.\d+)*[.)]\s+)(.{5,300})$/iu);
 if(!m)return null;
 const title=m[1].replace(/\s*[-–—(]?\s*\d+(?:[.,]\d+)?\s*(?:soat|соат)\)?\s*$/iu,'').trim();
 if(/^(?:jami|mundarija|adabiyot|foydalanilgan|baholash|maqsad|vazifalar|ta[’‘']?lim natij|mustaqil ish|titul)/iu.test(title)||title.length<5)return null;
 return title;
}
export function extractTopicDrafts(text){
 const blocks=[];let current=null;
 for(const line of String(text||'').slice(0,200000).split(/\r?\n/)){
  const title=heading(line);
  if(title){current={title,content:''};blocks.push(current);continue;}
  if(/^(?:\d+[.)]?\s*)?(?:asosiy (?:va qo[‘’']shimcha )?adabiyotlar|foydalanilgan adabiyotlar|adabiyotlar ro[‘’']yxati|baholash mezonlari|mustaqil ishlar|jami soat)/iu.test(clean(line))){current=null;continue;}
  if(current&&current.content.length<12000)current.content+=(current.content?'\n':'')+line;
 }
 const unique=new Map();
 for(const b of blocks){b.content=clean(b.content).replace(/\n{3,}/g,'\n\n').slice(0,12000);const key=normal(b.title),old=unique.get(key);if(!old||b.content.length>old.content.length)unique.set(key,b);}
 return [...unique.values()].slice(0,300);
}
export function sourceStamp(plan,index){const t=plan.topics[index];return JSON.stringify([plan.subject,plan.teacher,plan.groups,plan.year,plan.course,plan.sourceId,plan.sourceName,plan.resources,plan.assessment,t?.title,t?.type,t?.hours,t?.content,t?.homework,t?.independentTask,t?.reference,t?.date]);}
export function allocateMinutes(total,weights){
 const sum=weights.reduce((a,b)=>a+b,0),raw=weights.map(w=>w*total/sum),parts=raw.map(Math.floor);let remaining=total-parts.reduce((a,b)=>a+b,0);
 const order=raw.map((v,i)=>({i,rem:v-parts[i]})).sort((a,b)=>b.rem-a.rem||a.i-b.i);
 for(let i=0;i<remaining;i++)parts[order[i%order.length].i]++;return parts;
}
export function generateLesson(plan,index,sourceText='',duration=80){
 const topic=plan.topics?.[index];if(!topic)throw Error('Mavzu topilmadi');
 const block=extractTopicDrafts(sourceText).find(b=>normal(b.title)===normal(topic.title));
 const own=clean(topic.content),notes=(own&&block?.content?.startsWith(own)?block.content:own||block?.content||'').slice(0,20000);
 const segments=notes.split(/(?:\n+|(?<=[.!?;])\s+)/u).map(clean).filter(s=>s.length>12).slice(0,7);
 const outline=segments.length?segments.slice(0,5).map((s,i)=>(i+1)+'. '+(s.length>180?s.slice(0,177)+'…':s)).join('\n'):'1. '+topic.title+' mavzusining asosiy tushunchalari\n2. Mavzuga doir topshiriqlar\n3. Natijalarni muhokama qilish';
 const terms=[...new Set(topic.title.split(/[,;:]+|\s+va\s+/iu).map(clean).filter(s=>s.length>2))].slice(0,5);
 const title=clean(topic.title),minutes=Number.isInteger(Number(duration))&&Number(duration)>=20&&Number(duration)<=240?Number(duration):80;
 const methods={Nazariy:'Izohli bayon, savol-javob, juftlikda tushuntirish, yakuniy refleksiya.',Amaliy:'Namuna bo‘yicha mashq, mustaqil bajarish, juftlikda tekshirish va tahlil.',Laboratoriya:'Yo‘riqnoma bilan ishlash, kuzatish, natijalarni qayd etish va tahlil.',Seminar:'Muammoli savol, kichik guruh muhokamasi, taqdimot va dalillash.'}[topic.type]||'Savol-javob, mustaqil topshiriq va refleksiya.';
 const times=allocateMinutes(minutes,topic.type==='Nazariy'?[5,10,5,35,25,15,5]:topic.type==='Seminar'?[5,10,5,20,40,15,5]:[5,10,5,20,45,10,5]);
 const questions=[`«${title}» mavzusining asosiy fikri nimadan iborat?`,...terms.slice(0,3).map(t=>`«${t}» tushunchasini berilgan matn asosida izohlang va misol keltiring.`),'Topshiriqni bajarishda qaysi bosqich yoki dalil muhim? Javobingizni asoslang.'].join('\n');
 const practice=clean(topic.independentTask)||clean(topic.homework)||`«${title}» mavzusi bo‘yicha berilgan matndan asosiy fikrlarni ajrating. Ularni izohlovchi misol tayyorlang va xulosangizni guruhga tushuntiring.`;
 const stages=[
  ['Tashkiliy qism','Davomat va tayyorgarlikni tekshiradi; mavzuni e’lon qiladi.','Ish joyini va o‘quv vositalarini tayyorlaydi.','Tashkiliy suhbat','Tayyorgarlik kuzatiladi.'],
  ['Avvalgi bilimlarni faollashtirish',`«${title}» mavzusiga bog‘liq oldingi bilimlar yuzasidan savollar beradi.`,'Bilimlarini esga oladi, qisqa javob va taxminlarini aytadi.','Savol-javob','Boshlang‘ich tushunchalar aniqlanadi.'],
  ['Maqsad va natijalarni belgilash','Dars maqsadi, topshiriqlar va baholash mezonlarini tushuntiradi.','Kutiladigan natijalarni aniqlashtiradi va savollar beradi.','Yo‘naltiruvchi suhbat','Topshiriq sharti tushunilganligi tekshiriladi.'],
  ['Asosiy mazmun bilan ishlash',notes?`Konspektdagi mazmunni reja bo‘yicha tushuntiradi. Tayanch yo‘nalish: ${segments[0]?.slice(0,220).replace(/[.!?]+$/,'')||title}.`:'Mavzuga tegishli nazariy matn kiritilgach, mazmunni reja asosida tushuntiradi.','Tayanch fikrlarni yozib oladi, savollar beradi va tushunchalarni izohlaydi.',methods,'Qisqa tushuntirish va savollarga javoblar kuzatiladi.'],
  ['Amaliy faoliyat va mustahkamlash',`Topshiriq beradi: ${practice.slice(0,500)}`,'Topshiriqni bajaradi, natijani taqdim etadi va javobini asoslaydi.',topic.type==='Laboratoriya'?'Yo‘riqnoma asosida kuzatish va qayd etish':'Mustaqil yoki juftlikda ishlash','Bajarish ketma-ketligi va natijaning asoslanganligi tekshiriladi.'],
  ['Baholash va qayta aloqa','Mustahkamlash savollari orqali natijalarni tekshiradi; mezonlar bo‘yicha fikr bildiradi.','Javob beradi, xatolarni tahlil qiladi va o‘z ishini baholaydi.','Mezonli baholash va savol-javob','Mazmun, dalil, topshiriqning bajarilishi va mustaqillik hisobga olinadi.'],
  ['Yakun va uyga vazifa','Asosiy fikrlarni umumlashtiradi va uyga vazifani tushuntiradi.','Xulosa qiladi, vazifani qayd etadi va noaniq joylarni so‘raydi.','Refleksiya','Bir asosiy xulosa va keyingi vazifa aniqlashtiriladi.']
 ].map((r,i)=>({title:r[0],minutes:times[i],teacher:r[1],student:r[2],method:r[3],assessment:r[4]}));
 const result={version:1,minutes,reviewed:false,objectives:`O‘quvchi «${title}» mavzusidagi asosiy tushunchalarni izohlaydi; berilgan topshiriqni bajaradi; javobini matn yoki bajarilgan ish natijasi bilan asoslaydi.`,outline,notes,terms:terms.join('; '),questions,practice,homework:[clean(topic.homework),clean(topic.independentTask)].filter(Boolean).join('\n')||`«${title}» mavzusi bo‘yicha qisqa xulosa va bitta misol tayyorlash.`,resources:[clean(topic.reference)||clean(plan.sourceName),clean(plan.resources)].filter(Boolean).join('\n'),methods,assessment:clean(plan.assessment)||'Mazmunni to‘g‘ri tushuntirish; javobni dalillash; topshiriqni to‘liq bajarish; mustaqil xulosa chiqarish. Baholash litseyda amaldagi mezonlarga moslashtiriladi.',summary:'Bugun o‘rgangan bitta asosiy fikringizni ayting. Qaysi savol ochiq qoldi? Keyingi mashg‘ulotgacha nimani mustahkamlaysiz?',stages};for(const k of Object.keys(lessonFields))result[k]=result[k].slice(0,k==='notes'?20000:6000);return result;
}
export function validateLesson(d){
 const errors=[];if(!d||typeof d!=='object')return ['Dars hujjatlari kiritilmagan'];
 if(!Number.isInteger(d.minutes)||d.minutes<20||d.minutes>240)errors.push('Dars davomiyligi 20–240 daqiqa bo‘lsin');
 for(const k of Object.keys(lessonFields)){if(typeof d[k]!=='string'||d[k].length>(k==='notes'?20000:6000))errors.push(k+' maydonini tekshiring');}
 if(typeof d.reviewed!=='boolean')errors.push('Tekshirish holatini belgilang');
 if(d.reviewed&&(typeof d.notes!=='string'||d.notes.trim().length<60))errors.push('Tekshirilgan hujjat uchun mavzuning batafsil konspekt matnini kiriting');
 if(!Array.isArray(d.stages)||d.stages.length<1||d.stages.length>12)errors.push('Texnologik xaritada 1–12 ta bosqich bo‘lsin');
 else{for(const [i,r]of d.stages.entries()){if(!r||!Number.isInteger(r.minutes)||r.minutes<0||r.minutes>240){errors.push((i+1)+'-bosqich vaqtini tekshiring');continue;}for(const k of ['title','teacher','student','method','assessment'])if(typeof r[k]!=='string'||!r[k].trim()||r[k].length>2000)errors.push((i+1)+'-bosqich '+k+' maydonini tekshiring');}if(d.stages.reduce((n,r)=>n+(Number(r?.minutes)||0),0)!==d.minutes)errors.push('Bosqichlar vaqti jami dars davomiyligiga teng bo‘lsin');}
 return errors;
}
