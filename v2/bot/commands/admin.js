const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const { createEmbed } = require('../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('"️ Configuration système')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub => sub.setName('panel').setDescription(' Ouvrir le panneau d\'administration'))
        .addSubcommand(sub => sub.setName('add-coins')
            .setDescription(' Ajouter des pièces à un utilisateur')
            .addUserOption(opt => opt.setName('target').setDescription('L\'utilisateur').setRequired(true))
            .addIntegerOption(opt => opt.setName('amount').setDescription('Montant de pièces').setRequired(true).setMinValue(1)))
        .addSubcommand(sub => sub.setName('remove-coins')
            .setDescription(' Retirer des pièces à un utilisateur')
            .addUserOption(opt => opt.setName('target').setDescription('L\'utilisateur').setRequired(true))
            .addIntegerOption(opt => opt.setName('amount').setDescription('Montant de pièces').setRequired(true).setMinValue(1)))
        .addSubcommand(sub => sub.setName('challenge-add')
            .setDescription('  Créer un défi d\'invitation pour les teams'))
        .addSubcommand(sub => sub.setName('send-explanation')
            .setDescription(' Envoyer l\'embed d\'explication complet dans le salon #invitation')),

    async execute(interaction, bot) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'add-coins') {
            const target = interaction.options.getUser('target');
            const amount = interaction.options.getInteger('amount');
            await bot.db.addCoins(target.id, interaction.guildId, amount);
            return interaction.reply({ content: ` **${amount}** pièces ajoutées à **${target.username}**.`, flags: 64 });
        }

        if (subcommand === 'remove-coins') {
            const target = interaction.options.getUser('target');
            const amount = interaction.options.getInteger('amount');
            await bot.db.removeCoins(target.id, interaction.guildId, amount);
            return interaction.reply({ content: ` **${amount}** pièces retirées à **${target.username}**.`, flags: 64 });
        }

        if (subcommand === 'challenge-add') {
            const modal = new ModalBuilder()
                .setCustomId('admin_submit-challenge')
                .setTitle('Nouveau Défi de Team');

            const descInput = new TextInputBuilder()
                .setCustomId('challenge_desc')
                .setLabel('Description du défi')
                .setPlaceholder('Ex: Première équipe à 50 invites')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const targetInput = new TextInputBuilder()
                .setCustomId('challenge_target')
                .setLabel('Objectif (invites)')
                .setPlaceholder('Ex: 50')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const rewardInput = new TextInputBuilder()
                .setCustomId('challenge_reward')
                .setLabel('Récompense (pièces)')
                .setPlaceholder('Ex: 500')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(descInput),
                new ActionRowBuilder().addComponents(targetInput),
                new ActionRowBuilder().addComponents(rewardInput)
            );
            return interaction.showModal(modal);
        }

        if (subcommand === 'send-explanation') {
            const invitationChannelId = '1310942203937292318';
            const channel = interaction.guild.channels.cache.get(invitationChannelId);

            if (!channel) {
                return interaction.reply({ content: `❌ Salon <#${invitationChannelId}> introuvable !`, flags: 64 });
            }

            const embed = createEmbed({
                title: '🚀 Gagnez des Récompenses avec vos Invitations !',
                description: 'Bienvenue dans le système de parrainage de **VodsInvite**. Invitez vos amis et débloquez des avantages exclusifs !',
                color: 0xff4757, // Rouge premium
                thumbnail: interaction.guild.iconURL({ dynamic: true }),
                fields: [
                    {
                        name: '🔗 Comment Inviter ?',
                        value: '1. Faites un clic droit sur le serveur\n2. Cliquez sur **"Inviter des gens"**\n3. Réglez le lien sur **"N\'expire jamais"**\n4. Envoyez-le à vos amis !'
                    },
                    {
                        name: '💰 Gains & Récompenses',
                        value: '• **20 pièces** par membre invité (validé après 2 mins).\n• **Bonus Team** : Jusqu\'à +20% de gains.\n• **Rôles Multiplicateurs** : Plus vous avez de pièces, plus vous gagnez !'
                    },
                    {
                        name: '📊 Commandes Utiles',
                        value: '• `/invites stats` : Voir vos statistiques personnelles.\n• `/economy menu` : Voir votre solde et la boutique.\n• `/team help` : Tout savoir sur le système de clans.'
                    },
                    {
                        name: '⚠️ Règles Importantes',
                        value: '• Les comptes "Fake" ou "Alt" sont automatiquement détectés.\n• Si un membre quitte, ses pièces sont retirées.\n• Le spam d\'invitations est strictement interdit.'
                    }
                ],
                footer: { text: 'VodsInvite - Système d\'Invitation Automatisé' }
            });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('invites_stats').setLabel('Mes Stats').setStyle(ButtonStyle.Primary).setEmoji('📊'),
                new ButtonBuilder().setCustomId('economy_menu').setLabel('Ma Boutique').setStyle(ButtonStyle.Success).setEmoji('💰')
            );

            await channel.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: `✅ Embed d\'explication envoyé dans <#${invitationChannelId}> !`, flags: 64 });
        }

        const embed = createEmbed({
            title: 'Panneau de Configuration VodsInvite',
            description: 'Utilisez les boutons ci-dessous pour modifier les paramètres globaux du bot.',
            color: 0x34495e,
            fields: [
                { name: '"️ Paramètres', value: 'Coins Goal, Rôles Admin, etc.', inline: true },
                { name: ' Rôles', value: 'Paliers de récompenses.', inline: true },
                { name: ': Sécurité', value: 'Anti-Alt ( compte), etc.', inline: true },
                { name: ' Logs', value: 'Salon de notifications.', inline: true }
            ]
        });

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('admin_open-setup').setLabel('Général').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('admin_open-roles').setLabel('Rôles').setStyle(ButtonStyle.Primary)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('admin_open-security').setLabel('Sécurité').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('admin_open-logs').setLabel('Logs').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('admin_open-welcome').setLabel('Accueil').setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [embed], components: [row1, row2], flags: 64 });
    },

    async handleInteraction(interaction, bot, action) {
        if (action === 'open-setup') {
            const modal = new ModalBuilder()
                .setCustomId('admin_submit-setup')
                .setTitle('Configuration Générale');

            const goalInput = new TextInputBuilder()
                .setCustomId('coins_goal')
                .setLabel('Objectif de pièces total')
                .setPlaceholder('Ex: 5000')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const adminRoleInput = new TextInputBuilder()
                .setCustomId('admin_roles')
                .setLabel('IDs des Rôles Admin (séparés par virgule)')
                .setPlaceholder('Ex: 119864..., 119865...')
                .setStyle(TextInputStyle.Short)
                .setRequired(false);

            modal.addComponents(new ActionRowBuilder().addComponents(goalInput), new ActionRowBuilder().addComponents(adminRoleInput));
            await interaction.showModal(modal);
        } else if (action === 'open-roles') {
            const settings = await bot.db.getGuildSettings(interaction.guildId);
            const roles = settings.reward_roles ? JSON.parse(settings.reward_roles) : {};


            const modal = new ModalBuilder()
                .setCustomId('admin_submit-roles')
                .setTitle('Configuration des Palliers');

            const bronzeInput = new TextInputBuilder().setCustomId('bronze').setLabel('ID Rôle Bronze (100+)').setValue(roles.bronze || '').setStyle(TextInputStyle.Short).setRequired(true);
            const silverInput = new TextInputBuilder().setCustomId('silver').setLabel('ID Rôle Silver (500+)').setValue(roles.silver || '').setStyle(TextInputStyle.Short).setRequired(true);
            const goldInput = new TextInputBuilder().setCustomId('gold').setLabel('ID Rôle Gold (1000+)').setValue(roles.gold || '').setStyle(TextInputStyle.Short).setRequired(true);
            const platinumInput = new TextInputBuilder().setCustomId('platinum').setLabel('ID Rôle Platinum (1500+)').setValue(roles.platinum || '').setStyle(TextInputStyle.Short).setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(bronzeInput),
                new ActionRowBuilder().addComponents(silverInput),
                new ActionRowBuilder().addComponents(goldInput),
                new ActionRowBuilder().addComponents(platinumInput)
            );
            await interaction.showModal(modal);
        } else if (action === 'open-security') {
            const settings = await bot.db.getGuildSettings(interaction.guildId);
            const modal = new ModalBuilder()
                .setCustomId('admin_submit-security')
                .setTitle('Sécurité & Anti-Alt');

            const ageInput = new TextInputBuilder()
                .setCustomId('min_account_age')
                .setLabel(' minimum du compte (jours)')
                .setPlaceholder('Ex: 7 (0 pour désactiver)')
                .setValue((settings.min_account_age || 0).toString())
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(ageInput));
            await interaction.showModal(modal);
        } else if (action === 'open-logs') {
            const settings = await bot.db.getGuildSettings(interaction.guildId);
            const modal = new ModalBuilder()
                .setCustomId('admin_submit-logs')
                .setTitle('Configuration des Logs');

            const logChannelInput = new TextInputBuilder()
                .setCustomId('log_channel_id')
                .setLabel('ID du salon de logs')
                .setPlaceholder('Collez l\'ID du salon')
                .setValue(settings.log_channel_id || '')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(logChannelInput));
            await interaction.showModal(modal);
        } else if (action === 'open-welcome') {
            const settings = await bot.db.getGuildSettings(interaction.guildId);
            const welcome = settings.welcome_message ? JSON.parse(settings.welcome_message) : {};

            const modal = new ModalBuilder()
                .setCustomId('admin_submit-welcome')
                .setTitle('Message d\'Accueil');

            const titleInput = new TextInputBuilder()
                .setCustomId('welcome_title')
                .setLabel('Titre de l\'embed')
                .setValue(welcome.title || ' Bienvenue !')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const descInput = new TextInputBuilder()
                .setCustomId('welcome_description')
                .setLabel('Description')
                .setPlaceholder('Utilisez {user} pour mentionner le membre.')
                .setValue(welcome.description || 'Ravi de vous voir ici, {user} !')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(titleInput),
                new ActionRowBuilder().addComponents(descInput)
            );
            await interaction.showModal(modal);
        }
    },

    async handleModal(interaction, bot, action) {
        const guildId = interaction.guild.id;

        if (action === 'submit-setup') {
            const goal = parseInt(interaction.fields.getTextInputValue('coins_goal'));
            const roleId = interaction.fields.getTextInputValue('admin_role_id');

            if (isNaN(goal)) return interaction.reply({ content: ' L\'objectif de pièces doit être un nombre.', flags: 64 });

            const settings = await bot.db.getGuildSettings(guildId);
            await bot.db.setGuildSettings(guildId, { ...settings, coins_goal: goal, admin_roles: roleId ? [roleId] : [] });
            await interaction.reply({ content: ' Configuration générale mise à jour !', flags: 64 });
        } else if (action === 'submit-roles') {
            const rolesInput = {
                bronze: interaction.fields.getTextInputValue('bronze'),
                silver: interaction.fields.getTextInputValue('silver'),
                gold: interaction.fields.getTextInputValue('gold'),
                platinum: interaction.fields.getTextInputValue('platinum')
            };

            const settings = await bot.db.getGuildSettings(guildId);
            await bot.db.setGuildSettings(guildId, { ...settings, reward_roles: JSON.stringify(rolesInput) });
            await interaction.reply({ content: ' Palliers de rôles mis à jour !', flags: 64 });
        } else if (action === 'submit-security') {
            const age = parseInt(interaction.fields.getTextInputValue('min_account_age'));
            if (isNaN(age)) return interaction.reply({ content: ' L\'âge doit être un nombre.', flags: 64 });

            const settings = await bot.db.getGuildSettings(guildId);
            await bot.db.setGuildSettings(guildId, { ...settings, min_account_age: age });
            await interaction.reply({ content: ` Sécurité mise à jour :  min. de **${age}** jours.`, flags: 64 });
        } else if (action === 'submit-logs') {
            const channelId = interaction.fields.getTextInputValue('log_channel_id');
            const channel = interaction.guild.channels.cache.get(channelId);

            if (!channel) return interaction.reply({ content: ' ID de salon invalide ou salon introuvable.', flags: 64 });

            const settings = await bot.db.getGuildSettings(guildId);
            await bot.db.setGuildSettings(guildId, { ...settings, log_channel_id: channelId });
            await interaction.reply({ content: ` Salon de logs configuré sur <#${channelId}>.`, flags: 64 });
        } else if (action === 'submit-welcome') {
            const welcome = {
                title: interaction.fields.getTextInputValue('welcome_title'),
                description: interaction.fields.getTextInputValue('welcome_description')
            };

            const settings = await bot.db.getGuildSettings(guildId);
            await bot.db.setGuildSettings(guildId, { ...settings, welcome_message: JSON.stringify(welcome) });
            await interaction.reply({ content: ' Message d\'accueil mis à jour !', flags: 64 });
        } else if (action === 'submit-challenge') {
            const desc = interaction.fields.getTextInputValue('challenge_desc');
            const target = parseInt(interaction.fields.getTextInputValue('challenge_target'));
            const reward = parseInt(interaction.fields.getTextInputValue('challenge_reward'));

            if (isNaN(target) || isNaN(reward)) return interaction.reply({ content: ' L\'objectif et la récompense doivent être des nombres.', flags: 64 });

            await bot.db.addChallenge(guildId, desc, target, reward);
            await interaction.reply({ content: ` Nouveau défi créé : **${desc}** (Objectif: ${target} invites, Récompense: ${reward} pièces).`, flags: 64 });
        }
    }
};

