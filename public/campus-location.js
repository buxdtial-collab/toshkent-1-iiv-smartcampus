// Attendance boundary center corrected by the platform owner.
export const campusLocation=Object.freeze({
 address:'Toshkent shahri, Mirzo Ulug‘bek tumani, Qorasuv-6 mavzesi, Gyote ko‘chasi, 54-uy',
 latitude:41.316702,longitude:69.349730,radiusMeters:250,maxAccuracyMeters:100,maxAgeMs:120000,
 mapsUrl:'https://www.google.com/maps/search/?api=1&query=41.316702,69.349730'
});
const error=(message,status=400)=>{throw Object.assign(Error(message),{status})};
export function campusDistance(latitude,longitude){
 const rad=x=>x*Math.PI/180,dLat=rad(latitude-campusLocation.latitude),dLon=rad(longitude-campusLocation.longitude);
 const a=Math.sin(dLat/2)**2+Math.cos(rad(campusLocation.latitude))*Math.cos(rad(latitude))*Math.sin(dLon/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)));
}
export function validateArrivalPosition(position,now=Date.now()){
 if(!position||typeof position!=='object'||!['latitude','longitude','accuracy','timestamp'].every(k=>typeof position[k]==='number'&&Number.isFinite(position[k])))error('Joylashuv aniqlanmadi. GPS va brauzerning joylashuv ruxsatini yoqing.');
 const {latitude,longitude,accuracy,timestamp}=position;
 if(Math.abs(latitude)>90||Math.abs(longitude)>180||accuracy<0)error('Joylashuv ma’lumotlari noto‘g‘ri. Qayta urinib ko‘ring.');
 if(now-timestamp>campusLocation.maxAgeMs||timestamp-now>30000)error('Joylashuv ma’lumoti eskirgan. Tugmani qayta bosing.');
 if(accuracy>campusLocation.maxAccuracyMeters)error('GPS aniqligi yetarli emas. Ochiqroq joyda yoki telefon orqali qayta urinib ko‘ring.');
 const distance=campusDistance(latitude,longitude);
 if(distance>campusLocation.radiusMeters)error(`Siz litsey markazidan taxminan ${Math.round(distance)} metr uzoqdasiz. Belgilash faqat ${campusLocation.radiusMeters} metr radius ichida mumkin.`,403);
 // Keep verification metadata only; do not retain the person's raw coordinates.
 return {distanceMeters:Math.round(distance),accuracyMeters:Math.round(accuracy),checkedAt:new Date(now).toISOString()};
}
export function requestArrivalPosition(geolocation=globalThis.navigator?.geolocation){
 return new Promise((resolve,reject)=>{
  if(!geolocation){reject(Error('Bu qurilmada joylashuv aniqlanmayapti. Telefon brauzerida ochib ko‘ring.'));return;}
  geolocation.getCurrentPosition(position=>{
   const result={latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,timestamp:position.timestamp};
   try{validateArrivalPosition(result);resolve(result)}catch(e){reject(e)}
  },e=>reject(Error(e.code===1?'Joylashuvga ruxsat berilmadi. Brauzer sozlamasida ushbu sayt uchun joylashuvni yoqing.':e.code===3?'Joylashuvni aniqlash vaqti tugadi. GPSni yoqib, qayta urinib ko‘ring.':'Joylashuv aniqlanmadi. GPSni yoqib, ochiqroq joyda qayta urinib ko‘ring.')),
  {enableHighAccuracy:true,timeout:20000,maximumAge:0});
 });
}
