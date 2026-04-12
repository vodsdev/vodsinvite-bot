const { config } = require('dotenv');
const path = require('path');
config({ path: path.join(__dirname, '../.env') });

console.log('--- DEBUG ENV ---');
const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.log('ERROR: DISCORD_TOKEN is missing or undefined.');
} else {
    console.log('TOKEN FOUND (partial):', token.substring(0, 5) + '...' + token.substring(token.length - 5));
    console.log('TOKEN LENGTH:', token.length);
}
console.log('-----------------');
