import {parseTeacherCSV} from './teacher-roster-model.js';
const maxFile=2*1024*1024,maxXML=3*1024*1024;
let zipPromise;
export async function loadZip(){
 if(globalThis.JSZip)return globalThis.JSZip;
 if(!zipPromise)zipPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/vendor/jszip.min.js';script.onload=()=>globalThis.JSZip?resolve(globalThis.JSZip):reject(Error('Excel o‘qish vositasi yuklanmadi'));script.onerror=()=>{zipPromise=null;script.remove();reject(Error('Excel o‘qish vositasi yuklanmadi. Qayta urinib ko‘ring.'))};document.head.appendChild(script);});return zipPromise;
}
const nodes=(el,name)=>Array.from(el.getElementsByTagNameNS('*',name));
function xml(text,Parser){if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('Excel XML mazmuni qo‘llab-quvvatlanmaydi');const d=new Parser().parseFromString(text,'application/xml');if(nodes(d,'parsererror').length)throw Error('Excel fayli buzilgan');return d;}
async function zipText(zip,path,budget,required=true){
 const f=zip.file(path);if(!f){if(required)throw Error('Excel tarkibida kerakli varaq topilmadi');return '';}
 return new Promise((resolve,reject)=>{let size=0,done=false,chunks=[];const stream=f.internalStream('uint8array');stream.on('data',chunk=>{if(done)return;size+=chunk.length;budget.bytes+=chunk.length;if(size>maxXML||budget.bytes>8*1024*1024){done=true;stream.pause();chunks=[];reject(Error('Excel jadvali juda katta. Faqat ro‘yxatni alohida faylga saqlang.'));return;}chunks.push(chunk);}).on('error',e=>{if(!done){done=true;reject(e);}}).on('end',()=>{if(done)return;done=true;const all=new Uint8Array(size);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}try{resolve(new TextDecoder('utf-8',{fatal:true}).decode(all));}catch(e){reject(Error('Excel matnini o‘qib bo‘lmadi'));}}).resume();});
}
export async function readTeacherWorkbook(bytes,Zip,Parser=globalThis.DOMParser){
 if(!Parser)throw Error('Brauzerda Excel o‘qish vositasi mavjud emas');if(bytes.byteLength>maxFile)throw Error('Fayl 2 MB dan oshmasin');
 const zip=await Zip.loadAsync(bytes);if(Object.keys(zip.files).length>500)throw Error('Excel fayli juda murakkab. Ro‘yxatni alohida saqlang.');const budget={bytes:0};
 const workbook=xml(await zipText(zip,'xl/workbook.xml',budget),Parser),rels=xml(await zipText(zip,'xl/_rels/workbook.xml.rels',budget),Parser),shared=await zipText(zip,'xl/sharedStrings.xml',budget,false);
 const strings=shared?nodes(xml(shared,Parser),'si').map(si=>nodes(si,'t').map(t=>t.textContent).join('')):[];
 const sheets=nodes(workbook,'sheet');if(!sheets.length||sheets.length>20)throw Error('Excel faylida 1–20 ta varaq bo‘lsin');
 const result=[];
 for(const sheet of sheets){
  const rid=sheet.getAttribute('r:id')||sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
  const rel=nodes(rels,'Relationship').find(r=>r.getAttribute('Id')===rid);if(!rel||rel.getAttribute('TargetMode')==='External')throw Error('Excel varag‘i fayl ichida bo‘lishi kerak');
  const target=rel.getAttribute('Target')||'',path=target.startsWith('/')?target.slice(1):'xl/'+target;
  if(!/^xl\/worksheets\/[A-Za-z0-9_.-]+\.xml$/.test(path))throw Error('Excel varag‘i manzili qo‘llab-quvvatlanmaydi');
  const doc=xml(await zipText(zip,path,budget),Parser),rows=[];
  for(const row of nodes(doc,'row')){
   const values=[];
   for(const cell of nodes(row,'c')){
    const address=(cell.getAttribute('r')||'').match(/^([A-Z]+)\d+$/);if(!address)throw Error('Excel katak manzilini tekshiring');
    let col=0;for(const c of address[1])col=col*26+c.charCodeAt(0)-64;if(col>30)throw Error('Ro‘yxatda 30 tadan ortiq ustun bo‘lmasin');
    if(nodes(cell,'f').length)throw Error('Excelda formulalar bor. Natijalarni oddiy qiymat sifatida saqlang.');
    const type=cell.getAttribute('t'),raw=nodes(cell,'v')[0]?.textContent||'';
    let value=type==='inlineStr'?nodes(cell,'t').map(t=>t.textContent).join(''):type==='s'?strings[Number(raw)]:raw;
    if(value===undefined)throw Error('Excel matni topilmadi');if(value.length>2000)throw Error('Excel katagidagi matn juda uzun');values[col-1]=value;
   }
   if(values.some(v=>String(v||'').trim()))rows.push(Array.from({length:values.length},(_,i)=>values[i]||''));
   if(rows.length>301)throw Error('Bir varaqda 300 tagacha o‘qituvchi bo‘lsin');
  }
  if(rows.length)result.push({name:sheet.getAttribute('name')||'Varaq',rows});
 }
 if(!result.length)throw Error('Excel fayli bo‘sh');return result;
}
export async function readTeacherFile(file){
 if(!file||file.size>maxFile||!file.size)throw Error('Fayl 2 MB gacha bo‘lsin');
 if(/\.csv$/i.test(file.name))return [{name:'CSV',rows:parseTeacherCSV(await file.text())}];
 if(/\.xlsx$/i.test(file.name))return readTeacherWorkbook(await file.arrayBuffer(),await loadZip());
 throw Error('Excel (.xlsx) yoki CSV faylini tanlang');
}
