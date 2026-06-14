const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { createEmbed } = require('../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('utils')
        .setDescription('🛠️ Commandes utilitaires et aide')
        .addSubcommand(sub => sub.setName('help').setDescription('  Menu d\'aide interactif'))
        .addSubcommand(sub => sub.setName('server-info').setDescription(' Informations sur le serveur'))
        .addSubcommand(sub => sub.setName('user-info').setDescription(' Informations utilisateur').addUserOption(opt => opt.setName('target').setDescription('Cible')))
        .addSubcommand(sub => sub.setName('ping').setDescription(' Vérifier la latence du bot')),

    async execute(interaction, bot) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'help') {
            await this.sendHelpMenu(interaction);
        } else if (subcommand === 'server-info') {
            const { guild } = interaction;
            const embed = createEmbed({
                title: `🌐 Infos Serveur : ${guild.name}`,
                thumbnail: guild.iconURL({ dynamic: true }),
                color: 0x5865F2,
                fields: [
                    { name: ' Propriétaire', value: `<@${guild.ownerId}>`, inline: true },
                    { name: ' Membres', value: `\`${guild.memberCount}\``, inline: true },
                    { name: ' Création', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }
                ]
            });
            await interaction.reply({ embeds: [embed], flags: 64 });
        } else if (subcommand === 'user-info') {
            const user = interaction.options.getUser('target') || interaction.user;
            const member = await interaction.guild.members.fetch(user.id);
            const embed = createEmbed({
                title: `👤 Profil : ${user.username}`,
                thumbnail: user.displayAvatarURL({ dynamic: true }),
                color: 0x5865F2,
                fields: [
                    { name: '🆔 ID', value: `\`${user.id}\``, inline: true },
                    { name: ' Rejoint', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
                    { name: ' Rôle+', value: member.roles.highest.toString(), inline: true }
                ]
            });
            await interaction.reply({ embeds: [embed], flags: 64 });
        } else if (subcommand === 'ping') {
            const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true, flags: 64 });
            const embed = createEmbed({
                title: '🏓 Pong !',
                description: `Latence du Bot : **${sent.createdTimestamp - interaction.createdTimestamp}ms**\nLatence API : **${Math.round(bot.client.ws.ping)}ms**`,
                color: 0x5865F2
            });
            await interaction.editReply({ content: null, embeds: [embed] });
        }
    },

    async sendHelpMenu(interaction) {
        const embed = createEmbed({
            title: '❓ Centre d\'Aide VodsInvite',
            description: 'Bienvenue dans le menu d\'aide. Utilisez le menu déroulant ci-dessous pour explorer les différentes catégories de commandes.',
            color: 0xFFD700,
            fields: [
                { name: ' Instructions', value: 'Chaque catégorie contient des outils spécifiques pour gérer ou suivre les invitations.' }
            ],
            footer: { text: 'Sélectionnez une catégorie ci-dessous' }
        });

        const select = new StringSelectMenuBuilder()
            .setCustomId('utils_help-menu')
            .setPlaceholder('Choisir une catégorie...')
            .addOptions(
                new StringSelectMenuOptionBuilder().setLabel('Economie').setValue('economy').setDescription('Solde, classement et gains'),
                new StringSelectMenuOptionBuilder().setLabel('Invitations').setValue('invites').setDescription('Création et statistiques'),
                new StringSelectMenuOptionBuilder().setLabel('Administration').setValue('admin').setDescription('Configuration et rôles'),
                new StringSelectMenuOptionBuilder().setLabel('Teams').setValue('teams').setDescription('Compétition et clans'),
                new StringSelectMenuOptionBuilder().setLabel('Utilitaires').setValue('utils').setDescription('Infos serveur et utilisateur')
            );

        const row = new ActionRowBuilder().addComponents(select);
        await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
    },

    async handleInteraction(interaction, bot, action) {
        if (action === 'help-menu') {
            const category = interaction.values[0];
            let title, description, fields;

            switch (category) {
                case 'economy':
                    title = '💰 Commandes Économie';
                    description = 'Gérez vos gains liés aux invitations.';
                    fields = [
                        { name: '`/economy balance`', value: 'Affiche votre solde et votre progression.' },
                        { name: '`/economy leaderboard`', value: 'Affiche les 10 meilleurs inviteurs.' }
                    ];
                    break;
                case 'invites':
                    title = '📨 Commandes Invitations';
                    description = 'Outils pour inviter et suivre vos statistiques.';
                    fields = [
                        { name: '`/invites create`', value: 'Génère un lien d\'invitation unique.' },
                        { name: '`/invites stats`', value: 'Affiche le détail de vos invitations réussies.' }
                    ];
                    break;
                case 'admin':
                    title = '⚙️ Commandes Administration';
                    description = 'Réservé aux administrateurs du serveur.';
                    fields = [
                        { name: '`/admin setup`', value: 'Ouvre le panneau de configuration interactif.' },
                        { name: '`/admin set-roles`', value: 'Définit les rôles de récompense.' }
                    ];
                    break;
                case 'teams':
                    title = '🛡️ Commandes Teams';
                    description = 'Rejoignez ou créez un clan pour gagner des bonus.';
                    fields = [
                        { name: '`/team create`', value: 'Crée une team et son salon privé.' },
                        { name: '`/team join`', value: 'Rejoint une team avec mot de passe.' },
                        { name: '`/team info`', value: 'Affiche les stats de votre team.' },
                        { name: '`/team kick`', value: 'Exclure un membre (Admin seul).' }
                    ];
                    break;
                case 'utils':
                    title = ' Commandes Utilitaires';
                    description = 'Informations générales sur le serveur et les membres.';
                    fields = [
                        { name: '`/utils help`', value: 'Affiche ce menu d\'aide.' },
                        { name: '`/utils server-info`', value: 'Affiche les détails du serveur.' },
                        { name: '`/utils user-info`', value: 'Affiche les détails d\'un membre.' },
                        { name: '`/utils ping`', value: 'Vérifie la latence du bot.' }
                    ];
                    break;
            }

            const embed = createEmbed({ title, description, fields, color: 0x5865F2 });
            await interaction.update({ embeds: [embed] });
        }
    }
};

