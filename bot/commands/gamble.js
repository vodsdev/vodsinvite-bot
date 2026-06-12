const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { createEmbed } = require('../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gamble')
        .setDescription(' Jouez vos pièces et tentez de multiplier vos gains !')
        .addSubcommand(sub =>
            sub.setName('coinflip')
                .setDescription('Pile ou Face ! Doublez votre mise.')
                .addIntegerOption(opt => opt.setName('mise').setDescription('Montant à parier').setRequired(true).setMinValue(10))
                .addStringOption(opt => opt.setName('choix').setDescription('Choisissez Pile ou Face').setRequired(true)
                    .addChoices({ name: 'Pile', value: 'pile' }, { name: 'Face', value: 'face' }))
        )
        .addSubcommand(sub =>
            sub.setName('crash')
                .setDescription('Le multiplicateur monte... Encaisserez-vous avant le crash ?')
                .addIntegerOption(opt => opt.setName('mise').setDescription('Montant à parier').setRequired(true).setMinValue(10))
        )
        .addSubcommand(sub =>
            sub.setName('blackjack')
                .setDescription('Battez le bot au Blackjack !')
                .addIntegerOption(opt => opt.setName('mise').setDescription('Montant à parier').setRequired(true).setMinValue(50))
        )
        .addSubcommand(sub =>
            sub.setName('roulette')
                .setDescription('Misez sur une couleur ou un nombre !')
                .addIntegerOption(opt => opt.setName('mise').setDescription('Montant à parier').setRequired(true).setMinValue(10))
                .addStringOption(opt => opt.setName('pari').setDescription('Couleur (red, black, green) ou Nombre (0-36)').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('slots')
                .setDescription('Tentez le Jackpot aux machines à sous !')
                .addIntegerOption(opt => opt.setName('mise').setDescription('Montant à parier').setRequired(true).setMinValue(10))
        ),

    async execute(interaction, bot) {
        const subcommand = interaction.options.getSubcommand();
        const mise = interaction.options.getInteger('mise');
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        // Vérifier le solde
        const userData = await bot.db.getCoins(userId, guildId);
        if (userData.coins < mise) {
            return interaction.reply({ content: ` Vous n'avez pas assez de pièces (**${userData.coins}** possédées).`, flags: 64 });
        }

        if (subcommand === 'coinflip') {
            await this.handleCoinflip(interaction, bot, mise);
        } else if (subcommand === 'crash') {
            await this.handleCrash(interaction, bot, mise);
        } else if (subcommand === 'blackjack') {
            await this.handleBlackjack(interaction, bot, mise);
        } else if (subcommand === 'roulette') {
            await this.handleRoulette(interaction, bot, mise);
        } else if (subcommand === 'slots') {
            await this.handleSlots(interaction, bot, mise);
        }
    },

    async handleCoinflip(interaction, bot, mise) {
        const choix = interaction.options.getString('choix');
        const resultat = Math.random() < 0.5 ? 'pile' : 'face';
        const gagne = choix === resultat;

        // Quête : Jouer 5 fois au Coinflip
        await bot.handleQuestProgress(interaction.user.id, interaction.guildId, 'coinflip', 1);

        if (gagne) {
            await bot.db.addCoins(interaction.user.id, interaction.guildId, mise);
            const embed = createEmbed({
                title: '🪙 Coinflip : GAGNÉ !',
                description: `La pièce est tombée sur **${resultat.toUpperCase()}**.\nVous gagnez **${mise * 2}** pièces !`,
                color: 0x2ecc71
            });
            await interaction.reply({ embeds: [embed], flags: 64 });
        } else {
            await bot.db.addCoins(interaction.user.id, interaction.guildId, -mise);
            const embed = createEmbed({
                title: '🪙 Coinflip : PERDU',
                description: `La pièce est tombée sur **${resultat.toUpperCase()}**.\nVous avez perdu vos **${mise}** pièces.`,
                color: 0xe74c3c
            });
            await interaction.reply({ embeds: [embed], flags: 64 });
        }

        // --- Intégration Team Wager ---
        const team = await bot.db.getTeamByMember(interaction.user.id, interaction.guildId);
        if (team) {
            await bot.db.addWagerToTeamMember(team.id, interaction.user.id, mise);
        }
    },

    async handleCrash(interaction, bot, mise) {
        // Crash est un jeu en temps réel, on va simuler l'affichage
        // Pour éviter de surcharger Discord API, on fait une seule réponse après simulation ou on utilise des boutons
        await bot.db.addCoins(interaction.user.id, interaction.guildId, -mise); // On retire la mise au début

        const crashPoint = this.generateCrashPoint();
        let currentMultiplier = 1.0;

            const embed = createEmbed({
                title: '🚀 Crash - C\'est parti !',
                description: `💰 Mise : **${mise}** pièces\n📈 Multiplicateur actuel : **1.00x**`,
                color: 0x3498db
            });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('crash_cashout').setLabel('CASH OUT').setStyle(ButtonStyle.Success)
        );

        await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
        const responseMessage = await interaction.fetchReply();

        const collector = responseMessage.createMessageComponentCollector({ time: 30000 });
        let cashedOut = false;

        const interval = setInterval(async () => {
            if (cashedOut) return;

            currentMultiplier += 0.1 + (currentMultiplier * 0.05); // Accélération

            if (currentMultiplier >= crashPoint) {
                cashedOut = true;
                clearInterval(interval);
                collector.stop();

                const crashEmbed = createEmbed({
                    title: '💥 CRASH !',
                    description: `Le jeu a crashé à **${crashPoint.toFixed(2)}x**.\n\n❌ Vous avez perdu vos **${mise}** pièces.`,
                    color: 0xe74c3c
                });
                await interaction.editReply({ embeds: [crashEmbed], components: [] });
                return;
            }

            const updateEmbed = createEmbed({
                title: ' Crash - En montée...',
                description: `Mise : **${mise}** pièces\nMultiplicateur actuel : **${currentMultiplier.toFixed(2)}x**`,
                color: 0x3498db
            });
            await interaction.editReply({ embeds: [updateEmbed] }).catch(() => { });
        }, 1500);

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) return i.reply({ content: 'Pas ton jeu !', flags: 64 });

            cashedOut = true;
            clearInterval(interval);
            collector.stop();

            const gain = Math.floor(mise * currentMultiplier);
            await bot.db.addCoins(interaction.user.id, interaction.guildId, gain);

            // Quête : Gagner 500 pièces avec le Crash
            await bot.handleQuestProgress(interaction.user.id, interaction.guildId, 'crash_win', gain);

            const winEmbed = createEmbed({
                title: '💰 CASH OUT !',
                description: `✅ Vous avez encaissé à **${currentMultiplier.toFixed(2)}x**.\n💎 Total gagné : **${gain}** pièces !`,
                color: 0x2ecc71
            });
            await i.update({ embeds: [winEmbed], components: [] });

            // --- Intégration Team Wager ---
            const team = await bot.db.getTeamByMember(interaction.user.id, interaction.guildId);
            if (team) {
                await bot.db.addWagerToTeamMember(team.id, interaction.user.id, mise);
            }
        });
    },

    generateCrashPoint() {
        // Logique Crash classique : rare mais gros multiplicateurs possibles
        const e = Math.E;
        const r = Math.random();
        return Math.max(1.0, 0.99 / (1 - r));
    },

    async handleBlackjack(interaction, bot, mise) {
        // Pour le Blackjack, on va faire une version simplifiée pour le moment
        await bot.db.addCoins(interaction.user.id, interaction.guildId, -mise);

        const drawCard = () => Math.floor(Math.random() * 10) + 2;
        let playerHand = [drawCard(), drawCard()];
        let dealerHand = [drawCard()];

        const getSum = (hand) => hand.reduce((a, b) => a + b, 0);

        const buildEmbed = (status = 'En cours') => {
            return createEmbed({
                title: `🃏 Blackjack - ${status}`,
                description: `💰 Mise : **${mise}** pièces`,
                fields: [
                    { name: 'Votre Main', value: `${playerHand.join(', ')} (Total: **${getSum(playerHand)}**)`, inline: true },
                    { name: 'Main du Croupier', value: `${dealerHand.join(', ')} (Total: **${getSum(dealerHand)}**)`, inline: true }
                ],
                color: status === 'Gagné' ? 0x2ecc71 : (status === 'Perdu' ? 0xe74c3c : 0x34495e)
            });
        };

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bj_hit').setLabel('Tirer').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('bj_stand').setLabel('Rester').setStyle(ButtonStyle.Secondary)
        );
        await interaction.reply({ embeds: [buildEmbed()], components: [row], flags: 64 });
        const responseMessage = await interaction.fetchReply();

        const collector = responseMessage.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) return i.reply({ content: 'Pas ton jeu !', flags: 64 });

            if (i.customId === 'bj_hit') {
                playerHand.push(drawCard());
                const sum = getSum(playerHand);

                if (sum > 21) {
                    collector.stop();
                    await i.update({ embeds: [buildEmbed('Perdu')], components: [] });
                } else {
                    await i.update({ embeds: [buildEmbed()] });
                }
            } else if (i.customId === 'bj_stand') {
                collector.stop();
                // Dealer joue
                while (getSum(dealerHand) < 17) {
                    dealerHand.push(drawCard());
                }

                const pSum = getSum(playerHand);
                const dSum = getSum(dealerHand);

                let result = '';
                if (dSum > 21 || pSum > dSum) {
                    result = 'Gagné';
                    await bot.db.addCoins(interaction.user.id, interaction.guildId, mise * 2);
                } else if (pSum === dSum) {
                    result = '';
                    await bot.db.addCoins(interaction.user.id, interaction.guildId, mise);
                } else {
                    result = 'Perdu';
                }

                await i.update({ embeds: [buildEmbed(result)], components: [] });

                // --- Intégration Team Wager ---
                const team = await bot.db.getTeamByMember(interaction.user.id, interaction.guildId);
                if (team) {
                    await bot.db.addWagerToTeamMember(team.id, interaction.user.id, mise);
                }
            }
        });
    },

    async handleRoulette(interaction, bot, mise) {
        const pari = interaction.options.getString('pari').toLowerCase();
        const number = Math.floor(Math.random() * 37);
        const color = number === 0 ? 'green' : (number % 2 === 0 ? 'black' : 'red');
        
        let gagne = false;
        let multiplicateur = 0;

        if (pari === color) {
            gagne = true;
            multiplicateur = color === 'green' ? 14 : 2;
        } else if (parseInt(pari) === number) {
            gagne = true;
            multiplicateur = 35;
        }

        if (gagne) {
            const gain = mise * (multiplicateur - 1);
            await bot.db.addCoins(interaction.user.id, interaction.guildId, gain);
            const embed = createEmbed({
                title: '🎡 Roulette : GAGNÉ !',
                description: `La bille s'est arrêtée sur **${number} (${color.toUpperCase()})**.\n\n✅ Vous gagnez **${mise * multiplicateur}** pièces !`,
                color: 0x2ecc71
            });
            await interaction.reply({ embeds: [embed], flags: 64 });
        } else {
            await bot.db.addCoins(interaction.user.id, interaction.guildId, -mise);
            const embed = createEmbed({
                title: '🎡 Roulette : PERDU',
                description: `La bille s'est arrêtée sur **${number} (${color.toUpperCase()})**.\n\n❌ Vous avez perdu vos **${mise}** pièces.`,
                color: 0xe74c3c
            });
            await interaction.reply({ embeds: [embed], flags: 64 });
        }
    },

    async handleSlots(interaction, bot, mise) {
        const emojis = ['🍒', '🍋', '🍇', '💎', '🔔', '7️⃣'];
        const reel1 = emojis[Math.floor(Math.random() * emojis.length)];
        const reel2 = emojis[Math.floor(Math.random() * emojis.length)];
        const reel3 = emojis[Math.floor(Math.random() * emojis.length)];

        let multiplicateur = 0;
        if (reel1 === reel2 && reel2 === reel3) {
            multiplicateur = reel1 === '7️⃣' ? 50 : (reel1 === '💎' ? 25 : 10);
        } else if (reel1 === reel2 || reel2 === reel3 || reel1 === reel3) {
            multiplicateur = 2;
        }

        if (multiplicateur > 0) {
            const gain = mise * (multiplicateur - 1);
            await bot.db.addCoins(interaction.user.id, interaction.guildId, gain);
            const embed = createEmbed({
                title: '🎰 Machines à Sous : JACKPOT !',
                description: `[ ${reel1} | ${reel2} | ${reel3} ]\n\n✅ Magnifique ! Vous gagnez **${mise * multiplicateur}** pièces !`,
                color: 0xf1c40f
            });
            await interaction.reply({ embeds: [embed], flags: 64 });
        } else {
            await bot.db.addCoins(interaction.user.id, interaction.guildId, -mise);
            const embed = createEmbed({
                title: '🎰 Machines à Sous',
                description: `[ ${reel1} | ${reel2} | ${reel3} ]\n\n❌ Pas de chance cette fois. Vous perdez **${mise}** pièces.`,
                color: 0xe74c3c
            });
            await interaction.reply({ embeds: [embed], flags: 64 });
        }
    }
};

