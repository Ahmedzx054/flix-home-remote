import {unzipSync,strFromU8} from 'fflate';
import {XMLParser} from 'fast-xml-parser';
// Read bounded manifest/signature metadata only. The television verifies the actual signature.
export function validateWgt(bytes:Uint8Array,appId:string){
 let files:Record<string,Uint8Array>;
 try{files=unzipSync(bytes,{filter:f=>['config.xml','author-signature.xml','signature1.xml'].includes(f.name)&&f.originalSize<=65536});}catch{throw new Error('تعذر قراءة حزمة WGT.');}
 if(!files['config.xml']||!files['author-signature.xml']||!files['signature1.xml'])throw new Error('WGT تحتاج config.xml وتوقيع المؤلف والموزّع؛ وقّعها بشهادة Samsung التي تسمح بهذا التلفزيون.');
 const xml=strFromU8(files['config.xml']);if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('ملف تعريف WGT غير صالح.');
 const manifest=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'',removeNSPrefix:true}).parse(xml);
 const actual=manifest?.widget?.application;if(!actual?.id||actual.id!==appId||actual.package!==appId.split('.')[0])throw new Error('معرف التطبيق لا يطابق config.xml في WGT.');
 return {appId:actual.id,packageId:actual.package};
}
