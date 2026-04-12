const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed } = require('../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('economy')
        .setDescription(' Système d\'économie et classement')
        .addSubcommand(sub => sub.setName('menu').setDescription(' Ouvrir le menu économique interactif'))
        .addSubcommand(sub =>
            sub.setName('send')
                .setDescription(' Donner des pièces à un autre utilisateur')
                .addUserOption(opt => opt.setName('target').setDescription('Le destinataire').setRequired(true))
                .addIntegerOption(opt => opt.setName('montant').setDescription('Le montant à envoyer').setRequired(true).setMinValue(1))
        ),

    async execute(interaction, bot) {
        let subcommand = null;
        try {
            subcommand = interaction.options.getSubcommand();
        } catch (e) {
            // C'est probablement un bouton
            subcommand = 'menu';
        }

        if (subcommand === 'menu') {
            const embed = createEmbed({
                title: 'Banque VodsInvite',
                description: 'Bienvenue dans votre espace financier. Utilisez les boutons ci-dessous pour gérer vos avoirs.',
                color: 0x27ae60,
                thumbnail: interaction.user.displayAvatarURL({ dynamic: true })
            });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('economy_balance').setLabel('Mon Solde').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('economy_leaderboard').setLabel('Classement').setStyle(ButtonStyle.Secondary)
            );

            if (interaction.isButton()) {
                await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
            } else {
                await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
            }
        } else if (subcommand === 'send') {
            const target = interaction.options.getUser('target');
            const amount = interaction.options.getInteger('montant');

            if (target.bot) return interaction.reply({ content: ' Vous ne pouvez pas envoyer de l\'argent à un bot.', flags: 64 });
            if (target.id === interaction.user.id) return interaction.reply({ content: ' Vous ne pouvez pas vous envoyer de l\'argent.', flags: 64 });

            const userCoins = await bot.db.getCoins(interaction.user.id, interaction.guildId);
            if (userCoins.coins < amount) return interaction.reply({ content: ` Solde insuffisant (**${userCoins.coins}** pièces).`, flags: 64 });

            await bot.db.addCoins(interaction.user.id, interaction.guildId, -amount);
            await bot.db.addCoins(target.id, interaction.guildId, amount);

            const embed = createEmbed({
                title: '💸 Transfert Réussi',
                description: `Vous avez envoyé **${amount.toLocaleString()}** pièces à <@${target.id}>.`,
                color: 0x2ecc71
            });
            await interaction.reply({ embeds: [embed] });
        }
    },

    async handleInteraction(interaction, bot, action) {
        const guildId = interaction.guild.id;

        if (action === 'menu') {
            return this.execute(interaction, bot);
        } else if (action === 'balance') {
            const userData = await bot.db.getCoins(interaction.user.id, guildId);
            const coins = userData.coins;
            const settings = await bot.db.getGuildSettings(guildId);
            const coinsGoal = settings.coins_goal;

            const embed = createEmbed({
                title: 'Détails du Compte',
                description: `Statistiques bancaires pour **${interaction.user.username}**.`,
                color: 0x2ecc71,
                fields: [
                    { name: ' Solde Actuel', value: `\`${coins.toLocaleString()}\` pièces`, inline: true },
                    { name: ' Objectif Serveur', value: `\`${coinsGoal.toLocaleString()}\` pièces`, inline: true },
                    { name: '` Remplissage', value: `\`${coinsGoal > 0 ? Math.round((coins / coinsGoal) * 100) : 0}%\``, inline: true }
                ]
            });

            await interaction.reply({ embeds: [embed], flags: 64 });
        } else if (action.startsWith('leaderboard')) {
            let page = 1;
            if (action.includes('-')) {
                page = parseInt(action.split('-')[1]) || 1;
            }

            const limit = 10;
            const offset = (page - 1) * limit;

            const leaderboard = await bot.db.getLeaderboard(guildId, limit, offset);
            const totalUsers = await bot.db.getUserCount(guildId);

            if (leaderboard.length === 0 && page === 1) {
                return interaction.reply({ content: ' Le classement est vide.', flags: 64 });
            }

            const description = leaderboard.map((user, index) => {
                const globalIndex = offset + index;
                const rank = globalIndex === 0 ? '' : globalIndex === 1 ? '' : globalIndex === 2 ? '' : `**#${globalIndex + 1}**`;
                return `${rank} <@${user.user_id}> ⬢ \`${user.coins.toLocaleString()}\` pièces`;
            }).join('\n');

            const embed = createEmbed({
                title: '  Classement Global',
                description: description || 'Aucun joueur sur cette page.',
                color: 0xf1c40f,
                footer: { text: `Page ${page} ⬢ Total: ${totalUsers} joueurs` }
            });

            const maxPages = Math.ceil(totalUsers / limit);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`economy_leaderboard-${page - 1}`)
                    .setLabel(' Précédent')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page <= 1),
                new ButtonBuilder()
                    .setCustomId(`economy_leaderboard-${page + 1}`)
                    .setLabel('Suivant ')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page >= maxPages || maxPages === 0)
            );

            if (interaction.isButton() && action.includes('-')) {
                await interaction.update({ embeds: [embed], components: [row] });
            } else {
                await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
            }
        }
    }
};

