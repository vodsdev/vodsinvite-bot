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
        // On ne cape plus la série à 7 pour permettre le bonus récurrent tous les 7 jours
        // Mais on limite le multiplicateur de base pour éviter l'inflation infinie après 30 jours
        const effectiveStreak = Math.min(streak, 30);
        let dailyReward = 100 + (effectiveStreak * 50) + (Math.pow(effectiveStreak, 2) * 5);

        // Calculer la récompense (Base 100 + bonus exponentiel)
        // Formule: 100 + (streak * 50) + (streak^2 * 10)
        // Bonus spécial tous les 7 jours
        if (streak % 7 === 0) {
            dailyReward += 500 + (streak * 10); // Bonus croissant tous les 7 jours
        }
        
        dailyReward = Math.floor(dailyReward);

        await bot.db.addCoins(userId, guildId, dailyReward);
        await bot.db.updateLastDaily(userId, guildId, streak);

        const embed = createEmbed({
            title: '🎁 Récompense Quotidienne',
            description: `Félicitations ! Vous avez reçu **${dailyReward}** pièces.\n\n🔥 Série actuelle : **${streak}** jour(s)`,
            color: 0xf1c40f,
            thumbnail: interaction.user.displayAvatarURL({ dynamic: true }),
            footer: { text: streak === 7 ? "🏆 Vous avez atteint la récompense maximale !" : `📅 Revenez demain pour augmenter votre série !` }
        });

        await interaction.reply({ embeds: [embed], flags: 64 });
    }
};

