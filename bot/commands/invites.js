const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed } = require('../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invites')
        .setDescription(' Système d\'invitations')
        .addSubcommand(sub => sub.setName('menu').setDescription(' Ouvrir le menu d\'invitation interactif')),

    async execute(interaction, bot) {
        const embed = createEmbed({
            title: 'Gestionnaire d\'Invitations',
            description: 'Invitez vos amis et suivez vos performances en temps réel.\n\n💡 **Comment ça marche ?**\nCréez simplement un lien d\'invitation via Discord (Clic droit sur le serveur -> Inviter des gens). Tout lien que **vous** créez est automatiquement reconnu par le bot !',
            color: 0x3498db,
            thumbnail: interaction.guild.iconURL({ dynamic: true })
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('invites_stats').setLabel('Mes Stats').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('invites_help').setLabel('Aide').setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
    },

    async handleInteraction(interaction, bot, action) {
        const guildId = interaction.guild.id;

        if (action === 'stats') {
            const invites = await bot.db.getInviteStats(interaction.user.id, guildId);
            const total = invites.length;
            const valid = invites.filter(i => !i.has_left).length;
            const left = total - valid;

            const retentionRate = total > 0 ? Math.round((valid / total) * 100) : 0;

            const now = Date.now();
            const oneDay = 24 * 60 * 60 * 1000;

            let today = 0;
            let last7DaysCount = 0;

            let dailyCounts = [0, 0, 0, 0, 0, 0, 0];

            invites.forEach(inv => {
                const inviteDate = new Date(inv.created_at).getTime();
                const diffDays = Math.floor((now - inviteDate) / oneDay);

                if (diffDays === 0) today++;
                if (diffDays < 7) {
                    last7DaysCount++;
                    dailyCounts[6 - diffDays]++;
                }
            });

            const chars = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
            const maxVal = Math.max(...dailyCounts, 1);
            const sparkline = dailyCounts.map(count => {
                const index = Math.floor((count / maxVal) * (chars.length - 1));
                return chars[index];
            }).join('');

            const userData = await bot.db.getCoins(interaction.user.id, guildId);
            const coins = userData.coins;

            const embed = createEmbed({
                title: ' Statistiques d\'Invitations',
                description: `Aperçu des performances de <@${interaction.user.id}>\n\n**Tendance (7 derniers jours)**\n\`${sparkline}\``,
                color: 0x9b59b6,
                thumbnail: interaction.user.displayAvatarURL({ dynamic: true }),
                fields: [
                    { name: '📈 Rétention', value: `\`${retentionRate}%\` (${valid} valides / ${left} partis)`, inline: true },
                    { name: '📅 Aujourd\'hui', value: `\`+${today}\` membres`, inline: true },
                    { name: '🗓️ 7 Derniers Jours', value: `\`+${last7DaysCount}\` membres`, inline: true },
                    { name: '💰 Total Pièces', value: `\`${coins.toLocaleString()}\` pièces`, inline: true }
                ]
            });

            await interaction.reply({ embeds: [embed], flags: 64 });
        } else if (action === 'help') {
            const embed = createEmbed({
                title: '❓ Aide - Système d\'Invitations',
                description: 'Voici comment fonctionne notre système de parrainage :\n\n⭐ **Nouveau :** Plus besoin de créer de lien via le bot ! Utilisez n\'importe quel lien d\'invitation que vous générez via Discord.\n\n📈 **Stats :** Cliquez sur le bouton "Mes Stats" pour voir votre progression.\n📧 **DMs :** Envoyez le mot **LIEN** au bot en privé pour recevoir un rappel sur la méthode d\'invitation.',
                color: 0x3498db
            });
            await interaction.reply({ embeds: [embed], flags: 64 });
        }
    }
};

