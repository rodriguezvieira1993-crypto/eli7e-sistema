// Ejecutar una vez en el servidor para generar VAPID keys:
// node server/generateVapidKeys.js
// Luego copiar los valores a las variables de entorno en Easypanel

const webpush = require('web-push');
const keys = webpush.generateVAPIDKeys();

console.log('\n🔑 VAPID Keys generadas para Eli7e Push Notifications\n');
console.log('Agrega estas variables de entorno en Easypanel:\n');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_EMAIL=mailto:admin@eli7e.com`);
console.log('\n');
