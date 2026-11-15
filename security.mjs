import {teacherModules} from './public/workspace-model.js';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const derive=promisify(scrypt);
export const kinds=['students','staff','groups','schedule','attendance','preparation','teachers','grades','arrivals','monthly','graduates','rooms','announcements','assignments','curricula'];
export const token=()=>randomBytes(32).toString('base64url');
export const digest=s=>createHash('sha256').update(String(s)).digest('hex');
export function equal(a,b){return timingSafeEqual(Buffer.from(digest(a)),Buffer.from(digest(b)))}
export function validPassword(p){return typeof p==='string'&&p.length>=12&&p.length<=128&&/[A-Z]/.test(p)&&/[0-9]/.test(p)&&/[^A-Za-z0-9]/.test(p)}
export async function hashPassword(p){const salt=randomBytes(16).toString('hex');return salt+':'+Buffer.from(await derive(p,salt,64)).toString('hex')}
export async function checkPassword(p,hash){if(typeof p!=='string'||p.length>128||!hash)return false;const [salt,key]=hash.split(':');if(!salt||!key)return false;return equal(Buffer.from(await derive(p,salt,64)).toString('hex'),key)}
export function permitted(u,kind){return kinds.includes(kind)&&(u.role==='zavuch'||(u.role==='teacher'&&teacherModules.includes(kind)))}
export function validateRecord(data){if(!data||typeof data!=='object')return null;const result={};for(const key of ['name','detail','extra']){if(typeof data[key]!=='string'||data[key].length>250)return null;result[key]=data[key].trim()}for(const key of ['groupId','teacherId','studentId','subject','date','weekday','startTime','endTime','room','status','value']){if(data[key]!==undefined){if(typeof data[key]!=='string'||data[key].length>250)return null;result[key]=data[key].trim()}}return result.name?result:null}
export function safeEmail(e){return typeof e==='string'&&e.length<255&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)}



