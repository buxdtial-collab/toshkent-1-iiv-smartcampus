import {readFile} from 'node:fs/promises';
export function vendorFile(path){
 const fixed={'/vendor/ocr/tesseract.min.js':['tesseract.js/dist/tesseract.min.js','text/javascript'],'/vendor/ocr/worker.min.js':['tesseract.js/dist/worker.min.js','text/javascript'],'/vendor/pdfjs/pdf.mjs':['pdfjs-dist/build/pdf.mjs','text/javascript'],'/vendor/pdfjs/pdf.worker.mjs':['pdfjs-dist/build/pdf.worker.mjs','text/javascript']};
 if(fixed[path])return fixed[path];
 let m=path.match(/^\/vendor\/ocr\/core\/(tesseract-core(?:-(?:simd|relaxedsimd))?(?:-lstm)?\.wasm(?:\.js)?)$/);if(m)return ['tesseract.js-core/'+m[1],m[1].endsWith('.js')?'text/javascript':'application/wasm'];
 m=path.match(/^\/vendor\/ocr\/lang\/(eng|rus)\.traineddata\.gz$/);if(m)return [`@tesseract.js-data/${m[1]}/4.0.0_best_int/${m[1]}.traineddata.gz`,'application/octet-stream'];
 m=path.match(/^\/vendor\/pdfjs\/(cmaps|standard_fonts|wasm)\/([A-Za-z0-9_.-]+)$/);if(m&&!m[2].includes('..'))return ['pdfjs-dist/'+m[1]+'/'+m[2],m[2].endsWith('.wasm')?'application/wasm':'application/octet-stream'];return null;
}
export async function serveVendor(path,res){if(!path.startsWith('/vendor/'))return false;const file=vendorFile(path);if(!file){res.writeHead(404);res.end();return true}try{const data=await readFile(new URL('node_modules/'+file[0],import.meta.url));res.writeHead(200,{'Content-Type':file[1],'Cache-Control':'public, max-age=86400'});res.end(data)}catch{res.writeHead(503,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('Fayl o‘qish vositasi hozir mavjud emas. Qayta urinib ko‘ring.')}return true}
