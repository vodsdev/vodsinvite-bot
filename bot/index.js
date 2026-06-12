const { Client, GatewayIntentBits, Partials, Collection, ActivityType } = require('discord.js');
const { config } = require('dotenv');
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const i18n = require('i18n');
const Database = require('./database');
const { registerCommands } = require('./utils/helpers');

// Configuration
config({ path: path.join(__dirname, '../.env') });

// Configuration des logs
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'bot/logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'bot/logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Configuration i18n
i18n.configure({
    locales: ['fr', 'en'],
    directory: path.join(__dirname, 'locales'),
    defaultLocale: 'fr',
    objectNotation: true
});

class InviteBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildInvites,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildPresences,
                GatewayIntentBits.DirectMessages
            ],
            partials: [Partials.Channel, Partials.Message]
        });

        this.db = new Database();
        this.commands = new Collection();
        this.inviteCache = new Map();
        this.vanityCache = new Map(); // Nouveau: Cache pour les Vanity URLs
        this.cooldowns = new Collection();

        const PQueue = require('p-queue').default || require('p-queue');
        this.queue = new PQueue({ concurrency: 1 });

        this.init();
    }

    async init() {
        try {
            // Initialisation de la base de données
            await this.db.init();

            // Chargement des commandes
            await this.loadCommands();

            // �0vénements
            this.setupEvents();

            // Tracking Vocal
            this.setupVoiceTracking();

            // Connexion
            await this.client.login(process.env.DISCORD_TOKEN);

        } catch (error) {
            logger.error('Erreur initialisation bot:', error);
            process.exit(1);
        }
    }

    async loadCommands() {
        const commandsPath = path.join(__dirname, 'commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const command = require(path.join(commandsPath, file));
            this.commands.set(command.data.name, command);
        }

        logger.info(`${this.commands.size} commandes chargées`);
    }

    setupEvents() {
        this.client.once('clientReady', () => this.onReady());
        this.client.on('guildCreate', (guild) => this.onGuildCreate(guild));
        this.client.on('guildMemberAdd', (member) => this.onGuildMemberAdd(member));
        this.client.on('guildMemberRemove', (member) => this.onGuildMemberRemove(member));
        this.client.on('interactionCreate', (interaction) => this.onInteractionCreate(interaction));
        this.client.on('inviteCreate', (invite) => this.onInviteCreate(invite));
        this.client.on('inviteDelete', (invite) => this.onInviteDelete(invite));
        this.client.on('messageCreate', (message) => this.onMessageCreate(message));
    }

    async onReady() {
        logger.info(`✅ Bot connecté en tant que ${this.client.user.tag}`);

        // Diagnostic : Liste des serveurs
        const guilds = this.client.guilds.cache;
        logger.info(`Le bot est présent sur ${guilds.size} serveurs :`);
        guilds.forEach(guild => {
            logger.info(` - ${guild.name} (ID: ${guild.id})`);
        });

        // Statut du bot (invisible)
        this.client.user.setStatus('invisible');
        this.client.user.setActivity({
            name: '📊 /invites - Rejoins l\'aventure !',
            type: ActivityType.Watching
        });

        // Cache des invitations
        await this.cacheInvites();

        // Synchronisation des commandes (Global + Guilde principale pour mise à jour immédiate)
        const mainGuildId = '1198646731760488638';
        await registerCommands(this.client, this.commands, mainGuildId);
        await registerCommands(this.client, this.commands);

        // Envoi de l'embed de statut à l'ID spécifique
        this.sendStatusEmbed('1149699145842565243');

        // Sauvegarde quotidienne
        require('node-cron').schedule('0 0 * * *', () => this.db.backup());

        // Vérification des rôles expirés (toutes les heures)
        require('node-cron').schedule('0 * * * *', () => this.checkExpiredRoles());

        // Reset des quêtes (chaque jour à minuit)
        require('node-cron').schedule('0 0 * * *', () => this.db.resetDailyQuests());
        this.checkExpiredRoles(); // Exécuter une fois au démarrage

        logger.info('🚀 Bot complètement initialisé');
    }

    async checkExpiredRoles() {
        try {
            const expired = await this.db.getExpiredRoles();
            for (const entry of expired) {
                const guild = this.client.guilds.cache.get(entry.guild_id);
                if (!guild) continue;

                const member = await guild.members.fetch(entry.user_id).catch(() => null);
                if (member) {
                    await member.roles.remove(entry.role_id).catch(() => { });
                    try {
                        const embed = require('./utils/embeds').createEmbed({
                            title: 'Rôle Expiré',
                            description: `Votre rôle de récompense sur **${guild.name}** a expiré.`,
                            color: 0xff4757,
                            fields: [
                                { name: '�x� Conseil', value: 'Continuez d\'inviter des membres pour débloquer à nouveau des paliers !' }
                            ]
                        });
                        await member.send({ embeds: [embed] });
                    } catch (e) { }
                }
                await this.db.removeTempRole(entry.user_id, entry.guild_id, entry.role_id);
                logger.info(`Rôle expiré retiré pour ${entry.user_id} sur ${entry.guild_id}`);
            }
        } catch (error) {
            logger.error('Erreur vérification rôles expirés:', error);
        }
    }

    async cacheInvites() {
        for (const [guildId, guild] of this.client.guilds.cache) {
            try {
                const invites = await guild.invites.fetch();
                this.inviteCache.set(guildId, new Map(invites.map(invite => [invite.code, invite])));
                
                // Cache Vanity URL if exists
                if (guild.features.includes('VANITY_URL')) {
                    const vanity = await guild.fetchVanityData().catch(() => null);
                    if (vanity) {
                        this.vanityCache.set(guildId, vanity.uses);
                        logger.info(`Cached Vanity URL for ${guild.name}: ${vanity.uses} uses`);
                    }
                }
                
                logger.info(`Cached ${invites.size} invites for ${guild.name}`);
            } catch (error) {
                logger.error(`Erreur cache invitations ${guild.name}:`, error);
            }
        }
    }

    async onGuildCreate(guild) {
        logger.info(`Nouveau serveur: ${guild.name} (${guild.id})`);

        // Configuration initiale
        await this.db.setGuildSettings(guild.id, {
            coins_goal: parseInt(process.env.DEFAULT_COINS_GOAL) || 1000,
            language: 'fr',
            admin_roles: [process.env.ADMIN_ROLE_NAME || 'AdminBot']
        });

        // Message de bienvenue
        const owner = await guild.fetchOwner();
        try {
            const welcomeEmbed = {
                color: 0x00ff00,
                title: '�x9 Merci de m\'avoir ajouté !',
                description: 'Je suis un bot de gestion d\'invitations avec système de récompenses.',
                fields: [
                    {
                        name: '�xa� Premières étapes',
                        value: '1. Utilisez `/setup` pour configurer le bot\n2. Configurez les rôles avec `/set-roles`\n3. Commencez à inviter !'
                    },
                    {
                        name: '�xR� Site Web',
                        value: `[Accéder au tableau de bord](${process.env.WEBSITE_URL})`
                    }
                ],
                timestamp: new Date()
            };

            await owner.send({ embeds: [welcomeEmbed] });
        } catch (error) {
            logger.error('Impossible d\'envoyer le message de bienvenue:', error);
        }
    }

    async onGuildMemberAdd(member) {
        await this.queue.add(async () => {
            try {
                const guild = member.guild;
                
                // Délai pour laisser le temps à l'API Discord de synchroniser les compteurs
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                const newInvites = await guild.invites.fetch();
                const oldInvites = this.inviteCache.get(guild.id);

                let inviter = null;
                let usedInvite = null;
                let isVanity = false;

                logger.info(`[TRACKING] Nouveau membre : ${member.user.tag} (${member.id})`);
                
                if (oldInvites) {
                    logger.info(`[TRACKING] Comparaison: ${oldInvites.size} anciennes vs ${newInvites.size} nouvelles`);
                    
                    for (const [code, invite] of newInvites) {
                        const oldInvite = oldInvites.get(code);
                        const oldUses = oldInvite ? oldInvite.uses : 0;
                        
                        if (invite.uses > oldUses) {
                            usedInvite = invite;
                            inviter = invite.inviter;
                            logger.info(`[TRACKING] Invitation trouvée : ${code} (${oldUses} -> ${invite.uses}) par ${inviter ? inviter.tag : 'Inconnu'}`);
                            break;
                        }
                    }

                    // Si pas trouvé, vérifier Vanity URL
                    if (!usedInvite && guild.features.includes('VANITY_URL')) {
                        const newVanity = await guild.fetchVanityData().catch(() => null);
                        const oldVanityUses = this.vanityCache.get(guild.id) || 0;
                        
                        if (newVanity && newVanity.uses > oldVanityUses) {
                            isVanity = true;
                            this.vanityCache.set(guild.id, newVanity.uses);
                            logger.info(`[TRACKING] Join via Vanity URL detected (${oldVanityUses} -> ${newVanity.uses})`);
                        }
                    }

                    // Si toujours pas trouvé, vérifier si une NOUVELLE invitation a été créée
                    if (!usedInvite && !isVanity && newInvites.size > oldInvites.size) {
                        for (const [code, invite] of newInvites) {
                            if (!oldInvites.has(code) && invite.uses > 0) {
                                usedInvite = invite;
                                inviter = invite.inviter;
                                logger.info(`[TRACKING] Nouvelle invitation détectée et utilisée : ${code} (1 utilisation) par ${inviter ? inviter.tag : 'Inconnu'}`);
                                break;
                            }
                        }
                    }
                } else {
                    logger.warn(`[TRACKING] Pas de cache pour ${guild.id}`);
                }

                // Mettre à jour le cache immédiatement après la détection
                this.inviteCache.set(guild.id, new Map(newInvites.map(invite => [invite.code, invite])));

                // Message public de bienvenue (Salon spécifique)
                const settings = await this.db.getGuildSettings(guild.id);
                const { createEmbed } = require('./utils/embeds');
                const welcomeData = settings.welcome_message ? JSON.parse(settings.welcome_message) : null;
                const welcomeEmbed = createEmbed({
                    title: welcomeData?.title || '�x9 Bienvenue !',
                    description: (welcomeData?.description || 'Ravi de vous voir ici, {user} !').replace('{user}', member.user.toString()),
                    color: 0x2ecc71,
                    thumbnail: member.user.displayAvatarURL()
                });

                const invitationChannelId = '1310942203937292318';
                const channel = guild.channels.cache.get(invitationChannelId) || guild.systemChannel || guild.channels.cache.find(c => c.type === 0);
                if (channel) {
                    await channel.send({ embeds: [welcomeEmbed] }).catch(() => { });
                }

                if (inviter && inviter.id !== member.id) {
                    logger.info(`Inviteur détecté: ${inviter.tag} (ID: ${inviter.id}) pour ${member.user.tag}`);

                    // Anti-Alt & Anti-Fake Check
                    const settings = await this.db.getGuildSettings(guild.id);
                    const accountAgeDays = Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24));

                    if (settings.min_account_age > 0 && accountAgeDays < settings.min_account_age) {
                        logger.info(`Anti-Alt: ${member.user.tag} ignoré (Compte trop jeune: ${accountAgeDays} jours)`);
                        this.logToGuild(guild.id, `�x:�️ **Anti-Alt** : \`${member.user.tag}\` ignoré car son compte a moins de **${settings.min_account_age}** jours.`);
                        this.logToGuild(guild.id, `x:️ **Anti-Alt** : \`${member.user.tag}\` ignoré car son compte a moins de **${settings.min_account_age}** jours.`);
                    } else {
                        // Vérifier si c'est un re-join
                        const history = await this.db.getUserHistory(member.id, guild.id);
                        if (history) {
                            logger.info(`Re-join: ${member.user.tag} ignoré (Déjà venu)`);
                            this.logToGuild(guild.id, `x  **Re-join** : \`${member.user.tag}\` est revenu, aucune pièce n'a été attribuée.`);
                        } else {
                            // Reward immediately (Zero Delay)
                            await this.handleInviteReward(member, inviter, usedInvite);
                            await this.db.addUserHistory(member.id, guild.id);
                        }
                    }
                } else {
                    const reason = isVanity ? 'Vanity URL' : (newInvites.size === oldInvites.size ? 'Aucun changement de compteur' : 'Méthode inconnue');
                    logger.info(`[TRACKING] Aucun inviteur récompensable pour ${member.user.tag} (${reason})`);
                }

                // Envoyer message de bienvenue
                await this.sendWelcomeMessage(member, inviter);

            } catch (error) {
                logger.error('Erreur guildMemberAdd:', error);
            }
        });
    }

    async handleInviteReward(member, inviter, invite) {
        const guildId = member.guild.id;
        logger.info(`Attribution de récompense à ${inviter.tag} sur ${guildId}`);

        const team = await this.db.getTeamByMember(inviter.id, guildId);

        let coinsEarned = 20;
        if (team && team.level >= 5) {
            coinsEarned = Math.round(coinsEarned * 1.10); // +10% bonus
        }

        // Ajouter des pièces à l'inviteur
        await this.db.addCoins(inviter.id, guildId, coinsEarned);
        logger.info(`Pièces ajoutées: ${coinsEarned} à ${inviter.id} (Bonus Team: ${team && team.level >= 5})`);

        // Gérer les quêtes quotidiennes (Invites)
        await this.handleQuestProgress(inviter.id, guildId, 'invite', 1);

        // Gérer les succès (Premier Invite)
        await this.checkAchievement(inviter.id, guildId, 'first_invite', '�x�& Premier de cordée', 'Vous avez invité votre premier membre !');

        // Custom Invite Log Embed (Violet & Premium)
        const currentInviteCount = await this.db.getUserInviteCount(inviter.id, guildId) + 1;
        const inviterData = await this.db.getCoins(inviter.id, guildId);
        
        const logEmbed = require('./utils/embeds').createEmbed({
            title: '✨ Nouvelle Arrivée !',
            description: `Bienvenue <@${member.id}> sur **AI-Vods-Off** !\n\nVous avez été invité par <@${inviter.id}> qui détient désormais **${currentInviteCount}** invitations et possède actuellement **${(inviterData.coins + coinsEarned).toLocaleString()}** pièces. 💜`,
            color: 0x9b59b6, // Violet premium
            thumbnail: member.user.displayAvatarURL({ dynamic: true }),
            footer: { text: `Discord ID: ${member.id}` }
        });
        
        // Envoi dans le salon spécifique (si configuré) ou salon système
        const settings = await this.db.getGuildSettings(guildId);
        const invitationChannelId = '1310942203937292318';
        const channel = member.guild.channels.cache.get(invitationChannelId) || member.guild.channels.cache.get(settings.log_channel_id);
        
        if (channel) {
            await channel.send({ embeds: [logEmbed] }).catch(() => { });
        } else {
            this.logEmbedToGuild(guildId, logEmbed);
        }

        // Gérer les défis de team
        if (team) {
            const activeChallenges = await this.db.getActiveChallenges(guildId);
            for (const challenge of activeChallenges) {
                await this.db.incrementChallengeProgress(team.id, challenge.id);

                // Vérifier si le défi est complété
                const progress = await this.db.getTeamChallengeProgress(team.id);
                const currentChallenge = progress.find(p => p.challenge_id === challenge.id); // Changed from p.id to p.challenge_id

                if (currentChallenge && currentChallenge.invite_count >= challenge.target_invites) {
                    await this.db.completeChallenge(challenge.id);
                    await this.db.addCoinsToTeam(team.id, challenge.reward_coins);

                    this.logToGuild(guildId, `🏆 **Défi Complété** ! La team **${team.name}** a remporté le défi : *${challenge.description}* !`);
                    this.logToGuild(guildId, `💰 Récompense de **${challenge.reward_coins}** pièces ajoutée au wager de la team.`);
                }
            }
        }

        // Mettre à jour le wager de la team si présent
        if (team) {
            await this.db.addWagerToTeamMember(team.id, inviter.id, coinsEarned);

            // Ajouter de l'XP à la team
            const newLevel = await this.db.addTeamXP(team.id, 10); // 10 XP par invite
            if (newLevel) {
                this.logToGuild(guildId, `🎊 **LEVEL UP** ! La team **${team.name}** a atteint le **Niveau ${newLevel}** !`);

                // Bonus de niveau (Optionnel: débloquer des choses selon le niveau)
                if (newLevel === 3) {
                    try {
                        const guild = this.client.guilds.cache.get(guildId);
                        const parentChannel = guild.channels.cache.get(team.channel_id)?.parentId;

                        const members = await this.db.getTeamMembers(team.id);
                        const overwrites = [
                            { id: guild.id, deny: ['ViewChannel'] }
                        ];
                        for (const m of members) {
                            overwrites.push({ id: m.user_id, allow: ['ViewChannel', 'Connect', 'Speak'] });
                        }

                        const voiceChannel = await guild.channels.create({
                            name: `🔊 ${team.name}`,
                            type: 2, // GUILD_VOICE
                            parent: parentChannel,
                            permissionOverwrites: overwrites
                        });

                        await this.db.run('UPDATE teams SET voice_channel_id = ? WHERE id = ?', [voiceChannel.id, team.id]);
                        this.logToGuild(guildId, `🎙️ Un salon vocal privé a été débloqué pour la team **${team.name}** !`);
                    } catch (e) {
                        logger.error('Erreur création salon vocal team:', e);
                    }
                }

                if (newLevel === 5) {
                    this.logToGuild(guildId, `⚡ **Bonus de Team** : Les membres de **${team.name}** gagnent maintenant **+10%** de pièces sur les invitations et le temps vocal !`);
                }

                if (newLevel === 10) {
                    this.logToGuild(guildId, `👑 **Consécration** : Les membres de **${team.name}** portent désormais fièrement le tag de leur team !`);
                    try {
                        const guild = this.client.guilds.cache.get(guildId);
                        const members = await this.db.getTeamMembers(team.id);
                        const tag = `[${team.name}] `;
                        for (const m of members) {
                            const discordMember = await guild.members.fetch(m.user_id).catch(() => null);
                            if (discordMember && !discordMember.user.bot && discordMember.id !== guild.ownerId) {
                                if (!discordMember.displayName.startsWith(tag)) {
                                    await discordMember.setNickname((tag + discordMember.displayName).substring(0, 32)).catch(() => { });
                                }
                            }
                        }
                    } catch (e) {
                        logger.error('Erreur tag nickname:', e);
                    }
                }
            }
        }

        // Enregistrer l'invitation
        await this.db.addInvite({
            guild_id: guildId,
            inviter_id: inviter.id,
            invited_id: member.id,
            invite_code: invite.code,
            coins_earned: coinsEarned
        });

        // Notification DM de récompense
        try {
            const rewardEmbed = require('./utils/embeds').createEmbed({
                title: 'Récompense d\'Invitation',
                description: `Félicitations ! Vous avez gagné **${coinsEarned}** pièces car **${member.user.username}** a rejoint le serveur.`,
                color: 0x2ecc71,
                fields: [
                    { name: '👤 Membre', value: member.user.tag, inline: true },
                    { name: '🔑 Code utilisé', value: `\`${invite.code}\``, inline: true }
                ]
            });
            await inviter.send({ embeds: [rewardEmbed] });
        } catch (e) { }

        // Vérifier les bonus
        const inviteCount = await this.db.getUserInviteCount(inviter.id, guildId);
        let bonus = 0;

        if (inviteCount === 5) {
            bonus = 50;
            await this.db.addCoins(inviter.id, guildId, bonus);
        } else if (inviteCount === 10) {
            bonus = 100;
            await this.db.addCoins(inviter.id, guildId, bonus);
        }

        // Mettre à jour les rôles
        await this.updateRewardRoles(inviter, guildId);

        // Log
        logger.info(`${inviter.tag} a gagné ${coinsEarned + bonus} pièces pour l'invitation de ${member.user.tag}`);
    }

    async updateRewardRoles(user, guildId) {
        const coins = await this.db.getCoins(user.id, guildId);
        const guild = this.client.guilds.cache.get(guildId);
        const member = await guild.members.fetch(user.id).catch(() => null);

        if (!member) return;

        const roles = await this.db.getRewardRoles(guildId);
        const userRoles = member.roles.cache;

        // Déterminer le pallier et la durée (7j, 14j, 28j, 56j)
        let roleToAdd = null;
        let durationDays = 0;

        if (coins >= 1500) {
            roleToAdd = roles.platinum;
            durationDays = 56;
        } else if (coins >= 1000) {
            roleToAdd = roles.gold;
            durationDays = 28;
        } else if (coins >= 500) {
            roleToAdd = roles.silver;
            durationDays = 14;
        } else if (coins >= 100) {
            roleToAdd = roles.bronze;
            durationDays = 7;
        }

        if (roleToAdd && guild.roles.cache.has(roleToAdd)) {
            // Si l'utilisateur n'a pas déjà ce rôle ou si l'on veut rafraîchir la durée
            if (!userRoles.has(roleToAdd)) {
                // Retirer les autres rôles de récompense
                for (const rId of Object.values(roles)) {
                    if (userRoles.has(rId) && rId !== roleToAdd) {
                        await member.roles.remove(rId).catch(() => { });
                        await this.db.removeTempRole(user.id, guildId, rId);
                    }
                }

                await member.roles.add(roleToAdd).catch(() => { });
                logger.info(`Rôle ${roleToAdd} attribué à ${user.tag}`);
            }

            // Mettre à jour (ou rafraîchir) la date d'expiration
            const expiresAt = Math.floor(Date.now() / 1000) + (durationDays * 24 * 60 * 60);
            await this.db.addTempRole(user.id, guildId, roleToAdd, expiresAt);
        }
    }

    async sendWelcomeMessage(member, inviter) {
        try {
            const guild = member.guild;
            const { createEmbed } = require('./utils/embeds');

            const welcomeEmbed = createEmbed({
                title: `�xRx Bienvenue sur ${guild.name} !`,
                description: `Salut ${member.user.username} ! On est ravis de t'avoir parmi nous.${inviter ? `\n\n�x Tu as été invité par **${inviter.username}**.` : ''}`,
                color: 0x5865F2,
                thumbnail: guild.iconURL({ dynamic: true }),
                fields: [
                    { name: '�x� Comment commencer ?', value: 'Rendez-vous dans <#1310942203937292318> et utilise les commandes ci-dessous.' },
                    { name: '�x� Gains d\'invitations', value: '`/invites menu` � Crée ton lien perso et gagne **20 pièces** par membre invité.' },
                    { name: '�x�  Compétition Teams', value: '`/team create` � Crée ton clan ou rejoins-en un pour gagner des bonus.' },
                    { name: '�x` Tes Stats', value: '`/economy menu` � Vérifie ton solde et le classement général.' },
                    { name: '� Aide', value: '`/utils help` � Menu d\'aide complet avec toutes les commandes.' }
                ],
                footer: { text: guild.name + ' ⬢ Bonne chance !' }
            });

            await member.send({ embeds: [welcomeEmbed] });
        } catch (error) {
            if (error.code !== 50007) {
                logger.error('Erreur envoi message bienvenue:', error);
            }
        }
    }

    async onGuildMemberRemove(member) {
        const guildId = member.guild.id;
        const invite = await this.db.getInviteByInvited(member.id, guildId);

        await this.db.markInviteLeft(member.id, guildId);
        logger.info(`${member.user.tag} a quitté ${member.guild.name}`);

        if (invite && !invite.has_left) {
            const inviter = await this.client.users.fetch(invite.inviter_id).catch(() => null);
            if (inviter) {
                // Remove coins
                await this.db.run('UPDATE users SET coins = MAX(0, coins - ?) WHERE user_id = ? AND guild_id = ?', [invite.coins_earned, inviter.id, guildId]);

                const inviteCount = await this.db.getUserInviteCount(inviter.id, guildId);

                const logEmbed = require('./utils/embeds').createEmbed({
                    title: '�x� Départ d\'un membre',
                    description: `<@${member.id}> (${member.user.username}) a quitté le serveur. Il avait été invité par <@${inviter.id}> a maintenant **${inviteCount}** invitations.\n\n${invite.coins_earned} crédits retirés à ${inviter.username}`,
                    color: 0xff4757
                });
                this.logEmbedToGuild(guildId, logEmbed);
            }
        }
    }

    async onMessageCreate(message) {
        if (message.author.bot) return;

        // --- Gestion des DMs pour le mot-clé "LIEN" ---
        if (!message.guild) {
            if (message.content.trim().toUpperCase() === 'LIEN') {
                try {
                    const embed = require('./utils/embeds').createEmbed({
                        title: '🔗 Comment avoir votre lien ?',
                        description: `Le système est désormais **automatique** ! 🚀\n\n1. Allez sur le serveur.\n2. Faites un clic droit (ou clic long sur mobile).\n3. Cliquez sur **"Inviter des gens"**.\n4. Créez un lien (idéalement sans expiration).\n\n**Tout lien que vous créez est automatiquement lié à votre compte !**`,
                        color: 0x3498db
                    });
                    await message.author.send({ embeds: [embed] });
                } catch (err) {
                    logger.error("Erreur renvoi lien DM:", err);
                }
            }
            return; // On ne traite pas le reste (quêtes, auto-delete, etc.) pour les DMs
        }

        // Auto-delete messages in the restricted channel except those from the bot itself
        const restrictedChannelId = '1310942203937292318';
        if (message.channel.id === restrictedChannelId) {
            if (message.author.id !== this.client.user.id) {
                await message.delete().catch(() => { });
            }
        }

        // Track messages quest
        await this.handleQuestProgress(message.author.id, message.guild.id, 'messages', 1);
    }

    async onInteractionCreate(interaction) {
        // Restriction par salon (sauf pour les composants depuis les team channels)
        const restrictedChannelId = '1310942203937292318';

        if (interaction.isChatInputCommand() || interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
            const channel = interaction.channel;
            const isTeamChannel = channel && channel.name && channel.name.startsWith('team-');

            // On autorise les DMs (guildId est null) ET on ignore les restrictions pour les team channels
            if (interaction.guildId && interaction.channelId !== restrictedChannelId && !isTeamChannel) {
                return interaction.reply({
                    content: `�R Cette interface ne peut être utilisée que dans le salon <#${restrictedChannelId}>.`,
                    flags: 64
                });
            }
        }

        if (interaction.isChatInputCommand()) {
            await this.handleCommand(interaction);
        } else if (interaction.isButton() || interaction.isStringSelectMenu()) {
            await this.handleComponent(interaction);
        } else if (interaction.isModalSubmit()) {
            await this.handleModal(interaction);
        }
    }

    async handleCommand(interaction) {
        const command = this.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction, this);
        } catch (error) {
            this.handleError(interaction, error, `commande ${interaction.commandName}`);
        }
    }

    async handleComponent(interaction) {
        // Logique de routage pour les composants
        const customId = interaction.customId;

        // Gestion spéciale du sélecteur de statut (sans fichier de commande dédié)
        if (customId.startsWith('status-select_')) {
            const action = customId.split('_')[1];
            const { PresenceUpdateStatus } = require('discord.js');
            const statuses = {
                'online': PresenceUpdateStatus.Online,
                'idle': PresenceUpdateStatus.Idle,
                'dnd': PresenceUpdateStatus.DoNotDisturb,
                'invisible': PresenceUpdateStatus.Invisible
            };

            const newStatus = statuses[action];
            if (newStatus) {
                this.client.user.setStatus(newStatus);
                return interaction.reply({ content: `�S& Statut mis à jour : **${action.toUpperCase()}**`, flags: 64 });
            }
        }

        const [commandName, action] = customId.split('_');
        const command = this.commands.get(commandName);

        if (command && command.handleInteraction) {
            try {
                await command.handleInteraction(interaction, this, action);
            } catch (error) {
                this.handleError(interaction, error, `composant ${interaction.customId}`);
            }
        }
    }

    async handleModal(interaction) {
        const [commandName, action] = interaction.customId.split('_');
        const command = this.commands.get(commandName);

        if (command && command.handleModal) {
            try {
                await command.handleModal(interaction, this, action);
            } catch (error) {
                this.handleError(interaction, error, `modal ${interaction.customId}`);
            }
        }
    }

    handleError(interaction, error, context) {
        logger.error(`Erreur ${context}:`, error);

        const errorEmbed = {
            color: 0xff4757,
            title: '�S� Une erreur est survenue',
            description: 'Le bot a rencontré une erreur imprévue lors de cette opération.',
            timestamp: new Date()
        };

        const responseMethod = interaction.replied || interaction.deferred ? 'followUp' : 'reply';
        interaction[responseMethod]({ embeds: [errorEmbed], flags: 64 }).catch(() => { });
    }

    async onInviteCreate(invite) {
        await this.cacheInvites();
    }

    async onInviteDelete(invite) {
        await this.cacheInvites();
    }

    async sendStatusEmbed(userId) {
        try {
            const user = await this.client.users.fetch(userId).catch(() => null);
            if (!user) return logger.error(`Utilisateur ${userId} introuvable pour l'envoi du statut.`);

            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const { createEmbed } = require('./utils/embeds');

            const embed = createEmbed({
                title: '✨ Panneau de Contrôle du Statut',
                description: 'Utilisez les boutons ci-dessous pour changer la visibilité du bot en temps réel.',
                color: 0x5865F2
            });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('status-select_online').setLabel('En ligne').setStyle(ButtonStyle.Success).setEmoji('🟢'),
                new ButtonBuilder().setCustomId('status-select_idle').setLabel('Absent').setStyle(ButtonStyle.Secondary).setEmoji('🟡'),
                new ButtonBuilder().setCustomId('status-select_dnd').setLabel('Ne pas déranger').setStyle(ButtonStyle.Danger).setEmoji('🔴'),
                new ButtonBuilder().setCustomId('status-select_invisible').setLabel('Invisible').setStyle(ButtonStyle.Primary).setEmoji('⚪')
            );

            await user.send({ embeds: [embed], components: [row] }).catch((e) => {
                logger.error(`Impossible d'envoyer l'embed de statut au DM de ${userId}:`, e);
            });
        } catch (error) {
            logger.error('Erreur sendStatusEmbed:', error);
        }
    }

    async logToGuild(guildId, message) {
        try {
            const settings = await this.db.getGuildSettings(guildId);
            if (!settings.log_channel_id) return;

            const guild = this.client.guilds.cache.get(guildId);
            if (!guild) return;

            const channel = guild.channels.cache.get(settings.log_channel_id);
            if (!channel) return;

            const { createEmbed } = require('./utils/embeds');
            const embed = createEmbed({
                description: message,
                color: 0x3498db,
                timestamp: true
            });

            await channel.send({ embeds: [embed] }).catch(() => { });
        } catch (error) {
            logger.error('Erreur logToGuild:', error);
        }
    }

    async logEmbedToGuild(guildId, embed) {
        try {
            const settings = await this.db.getGuildSettings(guildId);
            if (!settings.log_channel_id) return;

            const guild = this.client.guilds.cache.get(guildId);
            if (!guild) return;

            const channel = guild.channels.cache.get(settings.log_channel_id);
            if (!channel) return;

            await channel.send({ embeds: [embed] }).catch(() => { });
        } catch (error) {
            logger.error('Erreur logEmbedToGuild:', error);
        }
    }

    setupVoiceTracking() {
        // Vérifier toutes les 5 minutes
        setInterval(async () => {
            for (const [guildId, guild] of this.client.guilds.cache) {
                for (const [memberId, member] of guild.members.cache) {
                    if (member.user.bot) continue;

                    const voiceState = member.voice;
                    if (voiceState.channel && !voiceState.mute && !voiceState.deaf) {
                        // Ajouter 5 minutes d'activité
                        await this.db.addVoiceTime(memberId, guildId, 5);
                        await this.handleQuestProgress(memberId, guildId, 'voice', 5);

                        // Récompense : 5 pièces toutes les 15 minutes (on donne 1 ou 2 pièces par 5 min)
                        let reward = 2;
                        const team = await this.db.getTeamByMember(memberId, guildId);
                        if (team && team.level >= 5) {
                            reward = Math.ceil(reward * 1.10); // Passe à 3 avec l'arrondi au supérieur
                        }
                        await this.db.addCoins(memberId, guildId, reward);
                        logger.info(`Vocal Reward: ${reward} pièces pour ${member.user.tag} (${guild.name})`);
                    }
                }
            }
            // Vérifier la fin de saison toutes les 5 minutes
            await this.checkSeasonEnd();
        }, 5 * 60 * 1000);
    }

    async handleQuestProgress(userId, guildId, type, amount) {
        const justCompleted = await this.db.updateQuestProgress(userId, guildId, type, amount);
        if (justCompleted) {
            const reward = 150; // Bonus quête
            await this.db.addCoins(userId, guildId, reward);
            this.logToGuild(guildId, `�x}� **Quête Complétée** : <@${userId}> a terminé sa quête quotidienne de type **${type}** ! (+${reward} pièces)`);

            const guild = this.client.guilds.cache.get(guildId);
            if (guild) {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member) {
                    member.send(`�x}� Bravo ! Tu as terminé ta quête quotidienne et gagné **${reward}** pièces !`).catch(() => { });
                }
            }
        }
    }

    async checkAchievement(userId, guildId, id, name, desc) {
        const has = await this.db.hasAchievement(userId, guildId, id);
        if (!has) {
            await this.db.addAchievement(userId, guildId, id);
            this.logToGuild(guildId, `�x�  **Succès Débloqué** : <@${userId}> a obtenu le badge **${name}** ! (*${desc}*)`);

            const member = await this.client.guilds.cache.get(guildId).members.fetch(userId).catch(() => null);
            if (member) {
                const { createEmbed } = require('./utils/embeds');
                const embed = createEmbed({
                    title: `�x�  Succès Débloqué : ${name}`,
                    description: desc,
                    color: 0xf1c40f
                });
                member.send({ embeds: [embed] }).catch(() => { });
            }
        }
    }

    async checkSeasonEnd() {
        const expiredSeasons = await this.db.getExpiredSeasons();
        for (const season of expiredSeasons) {
            const guildId = season.guild_id;
            const leaderboard = await this.db.getSeasonLeaderboard(guildId, season.start_at, season.end_at);

            if (leaderboard.length > 0) {
                const winner = leaderboard[0];
                const members = await this.db.getTeamMembers(winner.id);

                if (members.length > 0) {
                    const prizePerMember = Math.floor(season.prize_coins / members.length);
                    for (const m of members) {
                        await this.db.addCoins(m.user_id, guildId, prizePerMember);
                    }

                    // Annoncer le vainqueur
                    const invitationChannelId = '1310942203937292318';
                    const guild = this.client.guilds.cache.get(guildId);
                    if (guild) {
                        const channel = guild.channels.cache.get(invitationChannelId);
                        if (channel) {
                            const { createEmbed } = require('./utils/embeds');
                            const embed = createEmbed({
                                title: `🎊 FÉLICITATIONS : Fin de la Saison ${season.name} !`,
                                description: `La compétition est terminée ! La team **${winner.name}** l\'emporte avec **${winner.invite_count}** invitations !`,
                                color: 0x9b59b6,
                                fields: [
                                    { name: '🏆 Vainqueur', value: `Team **${winner.name}**`, inline: true },
                                    { name: '💰 Prix Remporté', value: `${season.prize_coins.toLocaleString()} pièces`, inline: true },
                                    { name: '💸 Distribution', value: `Chaque membre de la team (${members.length}) a reçu **${prizePerMember.toLocaleString()}** pièces !`, inline: false }
                                ],
                                footer: { text: 'Préparez-vous pour la prochaine saison !' }
                            });
                            await channel.send({ content: '@everyone', embeds: [embed] }).catch(() => { });
                        }
                    }
                }
            }
            // Marquer comme terminée
            await this.db.endSeason(season.id);
            logger.info(`Saison ${season.name} terminée pour le serveur ${guildId}`);
        }
    }
}

// Démarrage du bot
const bot = new InviteBot();
module.exports = bot;

