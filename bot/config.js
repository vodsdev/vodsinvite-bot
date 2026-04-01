const { config } = require('dotenv');
const path = require('path');
config({ path: path.join(__dirname, '../.env') });

module.exports = {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    websiteUrl: process.env.WEBSITE_URL,
    defaultCoinsGoal: parseInt(process.env.DEFAULT_COINS_GOAL) || 1000,
    adminRoleName: process.env.ADMIN_ROLE_NAME || 'AdminBot'
};
