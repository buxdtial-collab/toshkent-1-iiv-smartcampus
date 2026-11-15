import {Paragraph,TextRun,ImageRun,Table,TableRow,TableCell,WidthType,AlignmentType,BorderStyle,VerticalAlign,TableLayoutType} from 'docx';
import {coverBackground} from './cover-art.mjs';

const clearBorder={style:BorderStyle.NONE,size:0,color:'FFFFFF'};
const borders=Object.fromEntries(['top','bottom','left','right','insideHorizontal','insideVertical'].map(k=>[k,clearBorder]));
const paragraph=(text,{size=24,bold=false,after=80,before=0,alignment=AlignmentType.CENTER,keepNext=false}={})=>new Paragraph({alignment,keepNext,spacing:{before,after,line:276},children:[new TextRun({text:String(text??''),font:'Times New Roman',size,bold,color:'000000'})]});

// A shared table row keeps each pair aligned even when a role or name wraps.
export function approvalRow(plan){
 const rows=[
  ['KELISHILDI','TASDIQLAYMAN',true],
  ['Toshkent 1-son IIV akademik litseyi','Toshkent 1-son IIV akademik litseyi'],
  ['O‘quv ishlari bo‘yicha\ndirektor o‘rinbosari','Direktori'],
  [plan.deputy||'________________',plan.director||'________________',true],
  ['Imzo: __________________','Imzo: __________________'],
  ['«___» ____________ 20___ yil','«___» ____________ 20___ yil']
 ];
 return new Table({width:{size:100,type:WidthType.PERCENTAGE},columnWidths:[4853,4853],layout:TableLayoutType.FIXED,borders,rows:rows.map(([left,right,bold],index)=>new TableRow({cantSplit:true,children:[left,right].map(text=>new TableCell({width:{size:4853,type:WidthType.DXA},borders,verticalAlign:VerticalAlign.TOP,margins:{top:0,bottom:0,left:120,right:120},children:[new Paragraph({keepNext:index<rows.length-1,spacing:{before:0,after:70,line:250},children:String(text).split('\n').map((line,i)=>new TextRun({text:line,break:i?1:0,font:'Times New Roman',size:22,bold:!!bold,color:'000000'}))})]}))}))});
}

export async function programCover(plan,hours){
 const art=await coverBackground(plan.subject,plan.coverTheme);
 const subject=String(plan.subject||'').toUpperCase();
 return {
  properties:{page:{size:{width:11906,height:16838},margin:{top:900,right:1100,bottom:900,left:1100,footer:650}}},
  children:[
   new Paragraph({spacing:{after:0,line:1},children:[new ImageRun({type:'png',data:art,transformation:{width:794,height:1123},floating:{horizontalPosition:{relative:'page',offset:0},verticalPosition:{relative:'page',offset:0},behindDocument:true,allowOverlap:true,wrap:{type:'none'}},altText:{title:'Fanga mos ishchi dastur muqovasi',description:'Kitob va fanga mos akademik tasvir'}})]}),
   paragraph('O‘ZBEKISTON RESPUBLIKASI',{size:24,bold:true,after:30}),
   paragraph('ICHKI ISHLAR VAZIRLIGI',{size:24,bold:true,after:30}),
   paragraph('TOSHKENT 1-SON IIV AKADEMIK LITSEYI',{size:26,bold:true,after:220}),
   approvalRow(plan),
   paragraph(subject,{size:subject.length>100?26:subject.length>55?30:36,bold:true,before:260,after:130}),
   paragraph('ISHCHI O‘QUV DASTURI',{size:30,bold:true,after:170}),
   paragraph('Ta’lim yo‘nalishi: '+plan.direction,{size:22,after:45}),
   paragraph('Kurs: '+plan.course+'   ·   Guruhlar: '+plan.groups,{size:22,after:45}),
   paragraph('O‘quv yili: '+plan.year+'   ·   Auditoriya: '+hours+' soat',{size:22,after:45}),
   paragraph('Ishlab chiquvchi: '+plan.teacher,{size:22,after:0}),
   paragraph('Toshkent — '+String(plan.year||'').split(/[/-]/)[0],{size:22,before:150,after:0})
  ]
 };
}
