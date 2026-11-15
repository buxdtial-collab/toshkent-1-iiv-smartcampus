export const teacherColumns={name:'F.I.Sh.',detail:'O‘qitadigan fan',email:'Elektron pochta',phone:'Telefon',extra:'Izoh'};
export const teacherLimit=300;
const clean=s=>String(s??'').trim();
const nameKey=s=>clean(s).normalize('NFKC').toLocaleLowerCase('uz').replace(/[‘’ʻʼ`]/g,"'").replace(/\s+/g,' ');
const emailKey=s=>clean(s).toLowerCase();
export function teacherData(input,fail){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('O‘qituvchi ma’lumotlarini tekshiring');
 for(const key of ['role','permissions','active','paymentApproved','payment_approved','password','password_hash','invite','invite_hash','teacherAccountId'])if(Object.hasOwn(input,key))fail('Hisob va kirish huquqini faqat administrator boshqaradi',403);
 const d={};for(const key of Object.keys(teacherColumns)){if(input[key]!==undefined&&typeof input[key]!=='string')fail('Matn maydonlarini tekshiring');d[key]=clean(input[key]);if(d[key].length>(key==='name'?150:key==='phone'?100:250))fail(teacherColumns[key]+' juda uzun');}
 if(!d.name)fail('F.I.Sh. kiritilishi shart');d.email=emailKey(d.email);if(d.email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email))fail('Elektron pochtani tekshiring');return d;
}
export function sameTeacher(a,b){return a.email&&b.email?emailKey(a.email)===emailKey(b.email):nameKey(a.name)===nameKey(b.name);}
export function planTeacherImport(rows,records,fail){
 if(!Array.isArray(rows)||!rows.length||rows.length>teacherLimit)fail('1 dan '+teacherLimit+' tagacha o‘qituvchi kiriting');
 const added=[],duplicates=[];
 for(const [i,input]of rows.entries()){
  let d;try{d=teacherData(input,fail)}catch(e){e.message=(i+1)+'-qator: '+e.message;throw e;}
  const match=[...records.filter(r=>r.kind==='teachers').map(r=>r.data),...added].find(old=>sameTeacher(old,d));
  if(match){duplicates.push({row:i+1,name:d.name});continue;}added.push(d);
 }
 return {added,duplicates};
}
export function parseTeacherCSV(text){
 if(typeof text!=='string'||text.length>2000000)throw Error('CSV fayli 2 MB dan oshmasin');
 text=text.replace(/^\uFEFF/,'');let delimiter='';const sep=text.match(/^sep=([,;\t])\r?\n/i);if(sep){delimiter=sep[1];text=text.slice(sep[0].length);}
 if(!delimiter){const first=text.split(/\r?\n/)[0];delimiter=[';',',','\t'].sort((a,b)=>first.split(b).length-first.split(a).length)[0];}
 const rows=[];let row=[],cell='',quoted=false,closed=false;
 const pushCell=()=>{row.push(cell);cell='';closed=false;if(row.length>30)throw Error('Jadvalda 30 tadan ortiq ustun bor');};
 const pushRow=()=>{pushCell();if(row.some(x=>x.trim()))rows.push(row);row=[];if(rows.length>teacherLimit+1)throw Error('Bir faylda 300 tagacha o‘qituvchi bo‘lsin');};
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
 else if(c==='"'){if(cell||closed)throw Error('CSV qo‘shtirnoqlarini tekshiring');quoted=true;}
 else if(c===delimiter)pushCell();else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;pushRow();}
 else if(closed&&!/\s/.test(c))throw Error('CSV qatorini tekshiring');else if(!closed)cell+=c;
 if(cell.length>2000)throw Error('Jadval katagi juda uzun');}
 if(quoted)throw Error('CSV qo‘shtirnog‘i yopilmagan');if(cell||row.length)pushRow();return rows;
}
export function rowsToTeachers(rows){
 if(!Array.isArray(rows)||rows.length<2)throw Error('Birinchi qatorda ustun nomlari, keyingi qatorda o‘qituvchi ma’lumoti bo‘lsin');
 const key=s=>clean(s).toLowerCase().replace(/[^a-zа-яё0-9]/g,'');
 const aliases={name:['fish','fio','fullname','name','фиш','фио','familiyasiismisharifi','familiyasiismiotasiningsharifi'],detail:['oqitadiganfan','oqitadiganfankafedra','fan','subject','kafedra','предмет'],email:['elektronpochta','email','почта','электроннаяпочта'],phone:['telefon','tel','phone','телефон'],extra:['izoh','note','примечание']};
 const headers=rows[0].map(key),mapping={};for(const [field,names]of Object.entries(aliases)){const found=headers.flatMap((h,i)=>names.includes(h)?[i]:[]);if(found.length>1)throw Error(teacherColumns[field]+' ustuni takrorlangan');if(found.length)mapping[field]=found[0];}
 if(mapping.name===undefined)throw Error('F.I.Sh. ustuni topilmadi. Namuna faylidan foydalaning');
 const result=rows.slice(1).filter(row=>row.some(v=>clean(v))).map(row=>Object.fromEntries(Object.keys(teacherColumns).map(field=>[field,mapping[field]===undefined?'':clean(row[mapping[field]])])));
 if(!result.length||result.length>teacherLimit)throw Error('1 dan 300 tagacha o‘qituvchi bo‘lsin');return result;
}
export function teacherAccessLabel(account){if(!account)return 'Administrator ruxsati kutilmoqda';if(account.accessEnabled===false||account.active===false)return 'Kirish yopiq';if(account.activated===false)return 'Faollashtirish kutilmoqda';return 'Kirish ochiq';}
