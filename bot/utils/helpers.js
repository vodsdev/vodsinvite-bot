const { REST, Routes } = require('discord.js');
// Suppression de l'import config qui peut poser problème si le fichier n'est pas à jour
const clientId = process.env.DISCORD_CLIENT_ID;
const token = process.env.DISCORD_TOKEN;

async function registerCommands(client, commands, guildId = null) {
    const rest = new REST({ version: '10' }).setToken(token);
    const commandsData = Array.from(commands.values()).map(command => command.data.toJSON());

    try {
        if (guildId) {
            console.log(`🔄 Enregistrement des commandes pour le serveur ${guildId}...`);
            await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandsData });
        } else {
            console.log('🔄 Enregistrement des commandes globales...');
            await rest.put(Routes.applicationCommands(clientId), { body: commandsData });
        }
        console.log(`✅ ${commandsData.length} commandes enregistrées.`);
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
