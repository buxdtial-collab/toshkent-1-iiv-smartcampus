import {extractTopicDrafts,validateLesson} from './public/lesson-model.js';
import {lessonExport,sendLessonExport} from './lesson-docx.mjs';
import { randomUUID } from 'node:crypto';
import { validatePlan, suggestTopics, extractSections } from './syllabus-model.mjs';
import { buildDocument } from './syllabus-docx.mjs';

// Stateless preview utilities: this module never receives a pool, session or user.
const limits = new Map();
let uploadsInProgress = 0;
function allow(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',').at(-1).trim();
  const now = Date.now();
  for (const [key, value] of limits) if (value.until < now) limits.delete(key);
  const item = limits.get(ip) || { count: 0, until: now + 900000 };
  if (limits.size >= 10000 && !limits.has(ip)) return false;
  limits.set(ip, item);
  return ++item.count <= 60;
}
export function validateDemoPlan(data, complete, fail) {
  if (!data || typeof data !== 'object' || JSON.stringify(data).length > 2000000 || !Array.isArray(data.topics) || data.topics.some(t => !t || typeof t !== 'object')) fail('Dastur maydonlarini tekshiring');
  for (const key of ['director', 'deputy', 'departmentHead', 'departmentDecision', 'councilDecision', 'sourceId']) {
    if (data[key] !== undefined && (typeof data[key] !== 'string' || data[key].length > 500)) fail('Dastur maydonlarini tekshiring');
  }
  const draftErrors = validatePlan(data, false);
  if (draftErrors.length) fail(draftErrors.join('; '));
  const errors = complete ? validatePlan(data, true) : [];
  if (errors.length) fail(errors.join('; '));
}
export async function handleDemo({ path, req, res, body, json, fail }) {
  if (!path.startsWith('/api/demo/')) return false;
  if (req.method !== 'POST' || !['/api/demo/upload', '/api/demo/validate', '/api/demo/export', '/api/demo/lesson-export'].includes(path)) fail('Topilmadi', 404);
  if (!allow(req)) fail('Sinov so‘rovlari ko‘p. 15 daqiqadan so‘ng qayta urinib ko‘ring.', 429);
  const b = await body(req);
  if (path === '/api/demo/upload') {
    if (uploadsInProgress >= 2) fail('Fayllar qayta ishlanmoqda. Birozdan so‘ng qayta urinib ko‘ring.', 503);
    uploadsInProgress++;
    try {
      const { extractSource } = await import('./syllabus-source.mjs');
      const { text } = await extractSource(b, fail);
      json(res, 200, { id: 'demo-' + randomUUID(), name: b.name, text, topics: suggestTopics(text), topicDrafts: extractTopicDrafts(text), sections: extractSections(text) });
    } finally { uploadsInProgress--; }
    return true;
  }
  validateDemoPlan(b?.data, path === '/api/demo/export', fail);
  if(path==='/api/demo/lesson-export'){if(!Number.isInteger(b.index)||!b.data.topics[b.index]||!['notes','map','plan','bundle'].includes(b.format))fail('Mavzu va hujjat turini tanlang');const errors=validateLesson(b.lesson);if(errors.length)fail(errors.join('; '));sendLessonExport(res,await lessonExport(b.data,b.index,b.lesson,b.format,{demo:true}));return true;}
  if (path === '/api/demo/validate') { json(res, 200, { ok: true }); return true; }
  if (!['program', 'calendar'].includes(b.format)) fail('Hujjat turini tanlang');
  const data = { ...b.data, subject: 'NAMOYISH — ' + b.data.subject, sourceName: 'SINOV HUJJATI. ' + b.data.sourceName };
  const bytes = await buildDocument(data, b.format);
  res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': `attachment; filename="Namoyish_${b.format}.docx"`, 'Cache-Control': 'no-store' });
  res.end(bytes);
  return true;
}
