type Socket = { request(uri:string, payload?:unknown):Promise<any> };
/** Writes only the two settings categories exposed by the original remote, after TV pairing. */
export async function runLunaThroughAlert(_call:unknown, socket:Socket, uri:string, params:{category:string;settings:Record<string,string>}) {
 if(uri!=='com.webos.settingsservice/setSystemSettings'||!['picture','sound'].includes(params.category))throw Error('فئة إعدادات غير مسموحة.');
 const luna='luna://'+uri;
 const created=await socket.request('ssap://system.notifications/createAlert',{
  message:'FLIX: تحديث إعدادات التلفزيون',buttons:[{label:'تطبيق',onClick:luna,params}],onclose:{uri:luna,params},onfail:{uri:luna,params}
 });
 if(!created?.alertId)throw Error('التلفزيون لم يمنح صلاحية تعديل الإعدادات. أعد طلب الإذن من لوحة الصورة.');
 await socket.request('ssap://system.notifications/closeAlert',{alertId:created.alertId});
}
