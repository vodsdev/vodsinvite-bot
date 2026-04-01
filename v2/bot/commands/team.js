const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType } = require('discord.js');
const { createEmbed } = require('../utils/embeds');

const TEAM_CATEGORY_ID = '1479669599267192892';
const MAX_TEAM_MEMBERS = 15;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('team')
        .setDescription('  Système de Team et Compétition')
        .addSubcommand(sub =>
            sub.setName('create')
                .setDescription(' " Créer une nouvelle team (max 15 membres)')
                .addStringOption(opt => opt.setName('name').setDescription('Nom de la team (sans espaces)').setRequired(true))
                .addStringOption(opt => opt.setName('password').setDescription('Mot de passe de la team').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('join')
                .setDescription(' Rejoindre une team existante')
                .addStringOption(opt => opt.setName('name').setDescription('Nom exact de la team').setRequired(true))
                .addStringOption(opt => opt.setName('password').setDescription('Mot de passe').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('info')
                .setDescription('` Voir les informations de votre team')
        )
        .addSubcommand(sub => sub.setName('challenges').setDescription('  Voir les défis de team actifs'))
        .addSubcommand(sub =>
            sub.setName('members')
                .setDescription(' Voir les statistiques de tous les membres de la team')
        )
        .addSubcommand(sub =>
            sub.setName('kick')
                .setDescription(' Exclure un membre de la team (Admin team uniquement)')
                .addUserOption(opt => opt.setName('target').setDescription('Membre à exclure').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('delete')
                .setDescription(' Supprimer votre team et son salon (Admin team uniquement)')
        )
        .addSubcommand(sub =>
            sub.setName('leaderboard')
                .setDescription(' Classement des meilleures teams par wager')
        )
        .addSubcommand(sub =>
            sub.setName('check-teams')
                .setDescription(' [Admin] Voir toutes les teams actives du serveur')
        )
        .addSubcommand(sub =>
            sub.setName('stat-team')
                .setDescription(' Voir les stats détaillées d\'une team spécifique')
                .addStringOption(opt => opt.setName('name').setDescription('Nom de la team').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('leave')
                .setDescription(' Quitter votre team actuelle')
        )
        .addSubcommand(sub =>
            sub.setName('set-password')
                .setDescription(' [Admin Team] Changer le mot de passe de la team')
                .addStringOption(opt => opt.setName('new_password').setDescription('Nouveau mot de passe').setRequired(true))
        ),

    async execute(interaction, bot) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'challenges') {
            const userTeam = await bot.db.getTeamByMember(interaction.user.id, interaction.guildId);
            if (!userTeam) return interaction.reply({ content: ' Vous devez faire partie d\'une team pour voir les défis.', flags: 64 });

            const challenges = await bot.db.getTeamChallengeProgress(userTeam.id);
            if (challenges.length === 0) return interaction.reply({ content: ' Aucun défi actif pour le moment.', flags: 64 });

            const embed = createEmbed({
                title: `  Défis de Team : ${userTeam.name}`,
                description: 'Travaillez ensemble pour atteindre ces objectifs !',
                color: 0xf1c40f,
                fields: challenges.map(c => ({
                    name: ` ${c.description}`,
                    value: ` Progression: \`${c.invite_count || 0}/${c.target_invites}\` invites\n Récompense: \`${c.reward_coins}\` pièces`
                }))
            });

            return interaction.reply({ embeds: [embed], flags: 64 });
        }
        const guildId = interaction.guild.id;

        //  CREATE 
        if (subcommand === 'create') {
            const existingTeam = await bot.db.getTeamByMember(interaction.user.id, guildId);
            if (existingTeam) return interaction.reply({ content: ' Vous êtes déjà dans une team. Quittez-la d\'abord.', flags: 64 });

            const rawName = interaction.options.getString('name').replace(/\s+/g, '-').toLowerCase();
            const password = interaction.options.getString('password');

            const teamCheck = await bot.db.getTeamByName(guildId, rawName);
            if (teamCheck) return interaction.reply({ content: ` Le nom **${rawName}** est déjà utilisé.`, flags: 64 });

            try {
                const category = interaction.guild.channels.cache.get(TEAM_CATEGORY_ID);
                const channelOptions = {
                    name: `team-${rawName}`,
                    type: ChannelType.GuildText,
                    parent: category || undefined,
                    permissionOverwrites: [
                        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                        { id: bot.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
                    ]
                };

                const channel = await interaction.guild.channels.create(channelOptions);
                const result = await bot.db.createTeam(guildId, rawName, password, interaction.user.id, channel.id);
                const teamId = result.lastID;
                await bot.db.addTeamMember(teamId, interaction.user.id);

                // Message de bienvenue dans le salon de la team
                const welcomeEmbed = createEmbed({
                    title: `  Team ${rawName} créée !`,
                    description: `Bienvenue dans votre salon privé ! Partagez le mot de passe à vos futurs membres pour qu'ils rejoignent avec \`/team join\`.`,
                    color: 0x2ecc71,
                    fields: [
                        { name: ' Admin', value: `<@${interaction.user.id}>`, inline: true },
                        { name: ' Mot de passe', value: `\`${password}\``, inline: true },
                        { name: ' Membres max', value: `\`${MAX_TEAM_MEMBERS}\``, inline: true }
                    ]
                });
                await channel.send({ embeds: [welcomeEmbed] });

                const embed = createEmbed({
                    title: ' Team Créée !',
                    description: `La team **${rawName}** est prête à conquérir le serveur !`,
                    color: 0x2ecc71,
                    fields: [
                        { name: ' Salon privé', value: `<#${channel.id}>` },
                        { name: ' Mot de passe', value: `||${password}||` },
                        { name: ' Limite', value: `${MAX_TEAM_MEMBERS} membres maximum` }
                    ]
                });
                await interaction.reply({ embeds: [embed], flags: 64 });

            } catch (error) {
                console.error(error);
                await interaction.reply({ content: ' Erreur lors de la création. Vérifiez mes permissions sur la catégorie.', flags: 64 });
            }

            //  JOIN 
        } else if (subcommand === 'join') {
            const existingTeam = await bot.db.getTeamByMember(interaction.user.id, guildId);
            if (existingTeam) return interaction.reply({ content: ' Vous êtes déjà dans une team.', flags: 64 });

            const name = interaction.options.getString('name').toLowerCase();
            const password = interaction.options.getString('password');

            const team = await bot.db.getTeamByName(guildId, name);
            if (!team || team.password !== password) {
                return interaction.reply({ content: ' Team introuvable ou mot de passe incorrect.', flags: 64 });
            }

            const currentMembers = await bot.db.getTeamMembers(team.id);
            if (currentMembers.length >= MAX_TEAM_MEMBERS) {
                return interaction.reply({ content: ` Cette team est complète ! Maximum **${MAX_TEAM_MEMBERS} membres** autorisés.`, flags: 64 });
            }

            await bot.db.addTeamMember(team.id, interaction.user.id);

            const channel = interaction.guild.channels.cache.get(team.channel_id);
            if (channel) {
                await channel.permissionOverwrites.edit(interaction.user.id, {
                    ViewChannel: true, SendMessages: true, ReadMessageHistory: true
                });
                channel.send(` <@${interaction.user.id}> a rejoint la team ! (${currentMembers.length + 1}/${MAX_TEAM_MEMBERS})`);
                // Add to voice if level >= 3
                if (team.voice_channel_id) {
                    const voiceChannel = interaction.guild.channels.cache.get(team.voice_channel_id);
                    if (voiceChannel) {
                        await voiceChannel.permissionOverwrites.create(interaction.user.id, { ViewChannel: true, Connect: true, Speak: true }).catch(() => { });
                    }
                }

                // Add tag if level >= 10
                const member = interaction.guild.members.cache.get(interaction.user.id);
                if (team.level >= 10 && member && member.id !== interaction.guild.ownerId) {
                    const tag = `[${team.name}] `;
                    if (!member.displayName.startsWith(tag)) {
                        await member.setNickname((tag + member.displayName).substring(0, 32)).catch(() => { });
                    }
                }
            }

            await interaction.reply({ content: ` Vous avez rejoint la team **${name}** ! Salon : <#${team.channel_id}>`, flags: 64 });

            //  INFO 
        } else if (subcommand === 'info') {
            const team = await bot.db.getTeamByMember(interaction.user.id, guildId);
            if (!team) return interaction.reply({ content: ' Vous n\'êtes dans aucune team.', flags: 64 });

            const members = await bot.db.getTeamMembers(team.id);
            const admin = await bot.client.users.fetch(team.admin_id).catch(() => null);

            const embed = createEmbed({
                title: `🏰 Team : ${team.name}`,
                description: `Classement en compétition sur **${interaction.guild.name}**`,
                color: 0x3498db,
                fields: [
                    { name: '👑 Admin', value: admin ? `<@${admin.id}>` : 'Inconnu', inline: true },
                    { name: '💰 Wager Total', value: `\`${team.total_wager.toLocaleString()}\` pièces`, inline: true },
                    { name: '👥 Membres', value: `\`${members.length}/10\``, inline: true },
                    { name: '💬 Salon Privé', value: `<#${team.channel_id}>`, inline: true },
                    { name: '📅 Création', value: `<t:${Math.floor(new Date(team.created_at).getTime() / 1000)}:R>`, inline: true }
                ]
            });
            await interaction.reply({ embeds: [embed] });

            //  MEMBERS 
        } else if (subcommand === 'members') {
            const team = await bot.db.getTeamByMember(interaction.user.id, guildId);
            if (!team) return interaction.reply({ content: ' Vous n\'êtes dans aucune team.', flags: 64 });

            const members = await bot.db.getTeamMembers(team.id);
            members.sort((a, b) => b.user_wager - a.user_wager);

            const lines = await Promise.all(members.map(async (m, i) => {
                const user = await bot.client.users.fetch(m.user_id).catch(() => null);
                const isAdmin = m.user_id === team.admin_id;
                const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
                const eligible = m.user_wager >= 150 ? '✅' : '⏳';
                return `${rank} ${user ? user.username : 'Inconnu'}${isAdmin ? ' 👑' : ''} ⬢ \`${m.user_wager}\` pts ${eligible}`;
            }));

            const embed = createEmbed({
                title: `👥 Membres ⬢ Team ${team.name}`,
                description: lines.join('\n') || 'Aucun membre.',
                color: 0x9b59b6,
                footer: { text: '✅ = éligible récompense (150+ pts) | 👑 = Admin' }
            });
            await interaction.reply({ embeds: [embed] });

            //  LEAVE
        } else if (subcommand === 'leave') {
            const team = await bot.db.getTeamByMember(interaction.user.id, guildId);
            if (!team) return interaction.reply({ content: ' Vous n\'êtes dans aucune team.', flags: 64 });

            if (team.admin_id === interaction.user.id) {
                return interaction.reply({ content: ' En tant qu\'admin, vous ne pouvez pas quitter. Utilisez `/team delete` pour dissoudre la team.', flags: 64 });
            }

            await bot.db.removeTeamMember(team.id, interaction.user.id);
            
            // Retirer permissions channels
            const channel = interaction.guild.channels.cache.get(team.channel_id);
            if (channel) await channel.permissionOverwrites.delete(interaction.user.id).catch(() => { });
            
            if (team.voice_channel_id) {
                const voice = interaction.guild.channels.cache.get(team.voice_channel_id);
                if (voice) await voice.permissionOverwrites.delete(interaction.user.id).catch(() => { });
            }

            // Retirer tag
            const member = interaction.guild.members.cache.get(interaction.user.id);
            if (team.level >= 10 && member && member.id !== interaction.guild.ownerId) {
                const tag = `[${team.name}] `;
                if (member.displayName.startsWith(tag)) {
                    await member.setNickname(member.displayName.replace(tag, '')).catch(() => { });
                }
            }

            await interaction.reply({ content: ` Vous avez quitté la team **${team.name}**.`, flags: 64 });

            //  SET-PASSWORD
        } else if (subcommand === 'set-password') {
            const team = await bot.db.getTeamByMember(interaction.user.id, guildId);
            if (!team || team.admin_id !== interaction.user.id) {
                return interaction.reply({ content: ' Seul l\'admin de la team peut changer le mot de passe.', flags: 64 });
            }

            const newPassword = interaction.options.getString('new_password');
            await bot.db.run('UPDATE teams SET password = ? WHERE id = ?', [newPassword, team.id]);

            await interaction.reply({ content: `✅ Mot de passe mis à jour : ||${newPassword}||`, flags: 64 });


            //  KICK 
        } else if (subcommand === 'kick') {
            const team = await bot.db.getTeamByMember(interaction.user.id, guildId);
            if (!team || team.admin_id !== interaction.user.id) {
                return interaction.reply({ content: ' Seul l\'admin de la team peut exclure des membres.', flags: 64 });
            }

            const target = interaction.options.getUser('target');
            if (target.id === interaction.user.id) {
                return interaction.reply({ content: ' Vous ne pouvez pas vous exclure vous-même. Utilisez `/team delete` pour dissoudre la team.', flags: 64 });
            }

            const isMember = (await bot.db.getTeamMembers(team.id)).some(m => m.user_id === target.id);
            if (!isMember) return interaction.reply({ content: ' Cet utilisateur n\'est pas dans votre team.', flags: 64 });

            await bot.db.removeTeamMember(team.id, target.id);

            // Retirer permissions vocal
            if (team.voice_channel_id) {
                const voiceChannel = interaction.guild.channels.cache.get(team.voice_channel_id);
                if (voiceChannel) {
                    await voiceChannel.permissionOverwrites.delete(target.id).catch(() => { });
                }
            }

            // Retirer tag
            const targetMember = interaction.guild.members.cache.get(target.id);
            if (team.level >= 10 && targetMember && targetMember.id !== interaction.guild.ownerId) {
                const tag = `[${team.name}] `;
                if (targetMember.displayName.startsWith(tag)) {
                    await targetMember.setNickname(targetMember.displayName.replace(tag, '')).catch(() => { });
                }
            }

            const channel = interaction.guild.channels.cache.get(team.channel_id);
            if (channel) await channel.permissionOverwrites.delete(target.id).catch(() => { });

            try {
                await target.send(` Vous avez été exclu de la team **${team.name}** sur **${interaction.guild.name}**.`);
            } catch (e) { }

            await interaction.reply({ content: ` **${target.username}** a été exclu de la team.`, flags: 64 });

            //  DELETE 
        } else if (subcommand === 'delete') {
            const team = await bot.db.getTeamByMember(interaction.user.id, guildId);
            if (!team || team.admin_id !== interaction.user.id) {
                return interaction.reply({ content: ' Seul l\'admin de la team peut la supprimer.', flags: 64 });
            }

            // Supprimer le salon
            const channel = interaction.guild.channels.cache.get(team.channel_id);
            if (channel) await channel.delete('Team dissoute').catch(() => { });

            // Supprimer de la DB (cascade supprime les membres)
            await bot.db.deleteTeam(team.id);

            await interaction.reply({ content: ` La team **${team.name}** a été dissoute et son salon supprimé.`, flags: 64 });

            //  LEADERBOARD 
        } else if (subcommand === 'leaderboard') {
            await this.handleInteraction(interaction, bot, 'leaderboard');

            //  CHECK-TEAMS (Admin) 
        } else if (subcommand === 'check-teams') {
            await interaction.deferReply({ flags: 64 });
            const settings = await bot.db.getGuildSettings(guildId);
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                interaction.member.roles.cache.some(r => (settings.admin_roles || []).includes(r.id));
            if (!isAdmin) return interaction.editReply({ content: ' Réservé aux administrateurs.' });

            const allTeams = await bot.db.all(
                'SELECT * FROM teams WHERE guild_id = ? ORDER BY total_wager DESC',
                [guildId]
            );
            if (allTeams.length === 0) return interaction.editReply({ content: ' Aucune team sur ce serveur.' });

            const lines = await Promise.all(allTeams.map(async (t, i) => {
                const admin = await bot.client.users.fetch(t.admin_id).catch(() => null);
                const members = await bot.db.getTeamMembers(t.id);
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**#${i + 1}**`;
                return `${medal} **${t.name}**  ${members.length}/${MAX_TEAM_MEMBERS} membres ⬢ \`${t.total_wager}\` pts ⬢ Admin: ${admin ? admin.username : 'Inconnu'} ⬢ <#${t.channel_id}>`;
            }));

            const embed = createEmbed({
                title: ` Toutes les Teams  ${interaction.guild.name}`,
                description: lines.join('\n'),
                color: 0x2c3e50,
                footer: { text: `${allTeams.length} team(s) au total` }
            });
            await interaction.editReply({ embeds: [embed] });

            //  STAT-TEAM 
        } else if (subcommand === 'stat-team') {
            const name = interaction.options.getString('name').toLowerCase();
            const team = await bot.db.getTeamByName(guildId, name);
            if (!team) return interaction.reply({ content: ` Aucune team nommée **${name}** trouvée.`, flags: 64 });

            const members = await bot.db.getTeamMembers(team.id);
            const admin = await bot.client.users.fetch(team.admin_id).catch(() => null);
            members.sort((a, b) => b.user_wager - a.user_wager);

            const memberLines = await Promise.all(members.map(async (m, i) => {
                const user = await bot.client.users.fetch(m.user_id).catch(() => null);
                const isAdmin = m.user_id === team.admin_id;
                const rank = i === 0 ? '' : i === 1 ? '' : i === 2 ? '' : `#${i + 1}`;
                const eligible = m.user_wager >= 150 ? '' : '⏳';
                return `${rank} ${user ? user.username : 'Inconnu'}${isAdmin ? ' ' : ''}  \`${m.user_wager}\` pts ${eligible}`;
            }));

            const eligibleCount = members.filter(m => m.user_wager >= 150).length;

            const embed = createEmbed({
                title: ` Stats  Team ${team.name}`,
                description: memberLines.join('\n') || 'Aucun membre.',
                color: 0x8e44ad,
                fields: [
                    { name: ' Admin', value: admin ? `<@${admin.id}>` : 'Inconnu', inline: true },
                    { name: ' Wager Total', value: `\`${team.total_wager.toLocaleString()}\` pts`, inline: true },
                    { name: ' Effectif', value: `\`${members.length}/${MAX_TEAM_MEMBERS}\``, inline: true },
                    { name: '  (', value: `\`${eligibleCount}\` membres`, inline: true },
                    { name: ' Salon', value: `<#${team.channel_id}>`, inline: true },
                    { name: ' Création', value: `<t:${Math.floor(new Date(team.created_at).getTime() / 1000)}:R>`, inline: true }
                ],
                footer: { text: ' = éligible récompense ( pts) |  = Admin' }
            });
            await interaction.reply({ embeds: [embed], flags: 64 });
        }
    },

    async handleInteraction(interaction, bot, action) {
        const guildId = interaction.guildId || interaction.guild.id;

        if (action.startsWith('leaderboard')) {
            let page = 1;
            if (action.includes('-')) {
                page = parseInt(action.split('-')[1]) || 1;
            }

            const limit = 10;
            const offset = (page - 1) * limit;

            const topTeams = await bot.db.getTopTeams(guildId, limit, offset);
            const totalTeams = await bot.db.getTeamCount(guildId);

            if (topTeams.length === 0 && page === 1) {
                return interaction.reply({ content: ' Aucune team créée sur ce serveur.', flags: 64 });
            }

            const lines = topTeams.map((t, i) => {
                const globalIndex = offset + i;
                const medal = globalIndex === 0 ? '' : globalIndex === 1 ? '' : globalIndex === 2 ? '' : `**#${globalIndex + 1}**`;
                return `${medal} **${t.name}**  \`${t.total_wager.toLocaleString()}\` pièces`;
            });

            const maxPages = Math.ceil(totalTeams / limit);
            const embed = createEmbed({
                title: ' Classement Global des Teams',
                description: lines.join('\n') || 'Aucune team sur cette page.',
                color: 0xf39c12,
                footer: { text: `Page ${page} ⬢ Total: ${totalTeams} teams` }
            });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`team_leaderboard-${page - 1}`)
                    .setLabel(' Précédent')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page <= 1),
                new ButtonBuilder()
                    .setCustomId(`team_leaderboard-${page + 1}`)
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


