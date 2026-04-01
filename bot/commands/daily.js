const { SlashCommandBuilder } = require('discord.js');
const { createEmbed } = require('../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription(' Récupérez votre récompense quotidienne de pièces !'),

    async execute(interaction, bot) {
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        const userData = await bot.db.getCoins(userId, guildId);
        const now = new Date();
        const lastDaily = userData.last_daily ? new Date(userData.last_daily) : null;
        let streak = userData.daily_streak || 0;

        // Vérifier si 24h se sont écoulées
        if (lastDaily && (now - lastDaily) < 24 * 60 * 60 * 1000) {
            const remaining = 24 * 60 * 60 * 1000 - (now - lastDaily);
            const hours = Math.floor(remaining / (1000 * 60 * 60));
            const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

            return interaction.reply({
                content: `⏳ Vous avez déjà récupéré votre récompense ! Revenez dans **${hours}h ${minutes}m**.`,
                flags: 64
            });
        }

        // Vérifier si la série est rompue (> 48h)
        if (lastDaily && (now - lastDaily) > 48 * 60 * 60 * 1000) {
            streak = 0;
        }

        // Incrementer la série
        streak += 1;
        if (streak > 7) streak = 7; // Cap à 7 jours ou on recommence au jour 1 ? Le cap est mieux pour récompenser l'assiduité.

        // Calculer la récompense
        let dailyReward = 100;
        if (streak === 2) dailyReward = 150;
        if (streak === 3) dailyReward = 200;
        if (streak === 4) dailyReward = 250;
        if (streak === 5) dailyReward = 300;
        if (streak === 6) dailyReward = 350;
        if (streak === 7) dailyReward = 1000;

        await bot.db.addCoins(userId, guildId, dailyReward);
        await bot.db.updateLastDaily(userId, guildId, streak);

        const embed = createEmbed({
            title: ' Récompense Quotidienne',
            description: `Félicitations ! Vous avez reçu **${dailyReward}** pièces.\n Série actuelle : **${streak}** jour(s)`,
            color: 0xf1c40f,
            thumbnail: interaction.user.displayAvatarURL(),
            footer: { text: streak === 7 ? "Vous avez atteint la récompense maximale !" : `Revenez demain avant 48h pour ne pas perdre votre série !` }
        });

        await interaction.reply({ embeds: [embed], flags: 64 });
    }
};

