const modules = ['students','staff','groups','schedule','attendance','preparation','teachers','grades','arrivals','monthly','graduates','rooms'];
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
  const records = role === 'teacher' ? [] : [
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
    row('rooms','12-xona','30 o‘rin / fan xonasi','Namuna mas’ul')
  ];
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
  return { user, records, programs:[{id:'demo-program',owner_id:user.id,owner_name:user.name,data,updated_at:date.toISOString()}], audit:[] };
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
  if (!['upload','validate','export'].includes(action)) fail('Topilmadi',404);
  const r = await fetch('/api/demo/'+action,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  if (!r.ok) { const e = await r.json(); fail(e.error,r.status); }
  return binary ? r.blob() : r.json();
}
export function createDemo(role, options = {}) {
  if (!['zavuch','teacher'].includes(role)) return null;
  let storage = options.storage;
  if (storage === undefined) { try { storage = globalThis.sessionStorage; } catch { storage = null; } }
  const key = 'campus-demo-v1-'+role, request = options.transport || transport;
  const initial = seedDemo(role); let data = clone(initial);
  try { const saved = JSON.parse(storage?.getItem(key)||'null'); if (saved && Array.isArray(saved.records) && Array.isArray(saved.programs) && Array.isArray(saved.audit)) data={...saved,user:initial.user}; } catch {}
  const save = () => { try { storage?.setItem(key,JSON.stringify(data)); } catch { /* In-memory preview remains usable if storage is full. */ } };
  const log = (action, detail) => { data.audit.unshift({action,detail,name:data.user.name,created_at:new Date().toISOString()}); data.audit=data.audit.slice(0,100); save(); };
  return {
    role,
    reset() { data=clone(initial); save(); },
    async api(path, b) {
      const [route, qs=''] = path.split('?');
      if (route==='status' && !b) return {setup:false};
      if (route==='me' && !b) return {user:clone(data.user),permissions:role==='zavuch'?[...modules]:['preparation']};
      if (route==='records' && !b) return {records:role==='zavuch'?clone(data.records):[]};
      if (route==='records' && b) {
        if (role!=='zavuch' || !modules.includes(b.kind) || ['preparation','monthly'].includes(b.kind)) fail('Bu bo‘limga ruxsat berilmagan',403);
        const old = b.id && data.records.find(r=>r.id===b.id && r.kind===b.kind);
        if (b.id && !old) fail('Yozuv topilmadi',404);
        if (b.action==='delete') data.records=data.records.filter(r=>r!==old);
        else {
          if (!b.data || typeof b.data.name!=='string' || !b.data.name.trim() || ['name','detail','extra'].some(k=>typeof b.data[k]!=='string'||b.data[k].length>250)) fail('Maydonlarni tekshiring');
          const r={id:old?.id||'demo-'+crypto.randomUUID(),kind:b.kind,data:clone(b.data),updated_at:new Date().toISOString()};
          if (old) data.records.splice(data.records.indexOf(old),1,r); else data.records.unshift(r);
        }
        log(b.action==='delete'?'delete':'save',b.kind+': '+(b.data?.name||old?.data.name||'')); return {ok:true};
      }
      if (route==='audit' && !b && role==='zavuch') return {audit:clone(data.audit)};
      if (route==='monthly' && !b && role==='zavuch') {
        const q=new URLSearchParams(qs); return demoMonthly(data.records,q.get('month')||'',q.get('group')||'');
      }
      if (route==='preparation' && !b) return {programs:clone(data.programs)};
      if (route==='preparation/upload' && b) return request('upload',b);
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
    async download(id, format) {
      const p=data.programs.find(p=>p.id===id); if (!p) fail('Dastur topilmadi',404);
      return request('export',{data:p.data,format},true);
    }
  };
}
