const { REST, Routes } = require('discord.js');
const { clientId, token } = require('../config');

async function registerCommands(client, commands) {
    const rest = new REST({ version: '10' }).setToken(token);
    const commandsData = Array.from(commands.values()).map(command => command.data.toJSON());

    try {
        console.log('🗑️ Nettoyage des commandes par serveur (pour éviter les doublons)...');
        const guilds = client.guilds.cache;
        for (const [guildId, guild] of guilds) {
            try {
                await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
            } catch (err) { }
        }

        console.log('🔄 Enregistrement des commandes globales...');
        await rest.put(Routes.applicationCommands(clientId), { body: commandsData });
        console.log(`✅ ${commandsData.length} commandes enregistrées parfaitement.`);
    } catch (error) {
        console.error('❌ Erreur enregistrement commandes:', error);
    }
}

function formatNumber(number) {
    return new Intl.NumberFormat('fr-FR').format(number);
}

function hasAdminPermission(member, guildSettings) {
    return member.permissions.has('ADMINISTRATOR') ||
        member.roles.cache.some(role => guildSettings.admin_roles.includes(role.id)) ||
        member.id === member.guild.ownerId;
}

module.exports = {
    registerCommands,
    formatNumber,
    hasAdminPermission
};
