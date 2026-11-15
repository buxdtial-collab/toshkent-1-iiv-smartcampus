import mammoth from 'mammoth';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

export async function extractSource(b, fail) {
  if (!b || typeof b.name !== 'string' || b.name.length > 200 || !/\.(docx|pdf)$/i.test(b.name) || typeof b.base64 !== 'string' || b.base64.length > 7000000) fail('PDF yoki DOCX fayli 5 MB gacha bo‘lsin');
  const bytes = Buffer.from(b.base64, 'base64');
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) fail('Fayl hajmini tekshiring');
  let text;
  try {
    if (/\.pdf$/i.test(b.name)) {
      if (bytes.subarray(0, 4).toString() !== '%PDF') fail('PDF fayl noto‘g‘ri');
      text = (await pdfParse(bytes, { max: 150 })).text;
    } else {
      if (bytes[0] !== 80 || bytes[1] !== 75) fail('DOCX fayl noto‘g‘ri');
      text = (await mammoth.extractRawText({ buffer: bytes }, { externalFileAccess: false })).value;
    }
  } catch (e) {
    if (e.status) throw e;
    fail('Fayldagi matn o‘qilmadi. Matnli PDF yoki DOCX yuklang.');
  }
  if (!text || text.trim().length < 30) fail('Skanerlangan PDF matni ajratilmadi. Matnli PDF yoki Word nusxasini yuklang.');
  return { bytes, text: text.slice(0, 200000) };
}
