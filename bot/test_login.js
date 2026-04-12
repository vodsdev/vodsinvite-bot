const { Client, GatewayIntentBits } = require('discord.js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

console.log('--- TESTING LOGIN (FIXED PATH) ---');
const token = process.env.DISCORD_TOKEN;

if (!token) {
    console.log('FAILURE: Token not found in .env');
    process.exit(1);
}

console.log('Testing Token:', token.substring(0, 5) + '...' + token.substring(token.length - 5));

client.login(token)
    .then(() => {
        console.log('SUCCESS: Token is valid! Logged in as:', client.user.tag);
        process.exit(0);
    })
    .catch(err => {
        console.log('FAILURE: Token is invalid!');
        console.log('Error Message:', err.message);
        process.exit(1);
    });
