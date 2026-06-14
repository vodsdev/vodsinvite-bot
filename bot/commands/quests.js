const { SlashCommandBuilder } = require('discord.js');
const { createEmbed } = require('../utils/embeds');

const QUEST_TYPES = [
    { type: 'invite', target: 3, label: 'Inviter 3 membres', desc: 'Développez la communauté !' },
    { type: 'coinflip', target: 5, label: 'Jouer 5 fois au Coinflip', desc: 'Tentez votre chance à pile ou face.' },
    { type: 'crash_win', target: 500, label: 'Gagner 500 pièces au Crash', desc: 'Encaissez au bon moment.' },
    { type: 'messages', target: 50, label: 'Envoyer 50 messages', desc: 'Participez à la discussion globale.' },
    { type: 'voice', target: 30, label: 'Passer 30 min en vocal', desc: 'Rejoignez un salon vocal.' }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quests')
        .setDescription(' Voir et accomplir votre quête quotidienne.'),

    async execute(interaction, bot) {
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        let quests = await bot.db.getUserQuests(userId, guildId);

        // Si aucune quête pour aujourd'hui, on en assigne une aléatoirement
        if (quests.length === 0) {
            const randomQuest = QUEST_TYPES[Math.floor(Math.random() * QUEST_TYPES.length)];
            await bot.db.createQuest(userId, guildId, randomQuest.type, randomQuest.target);
            quests = await bot.db.getUserQuests(userId, guildId);
        }

        const quest = quests[0]; // On s'occupe d'une seule quête par jour pour simplifier
        if (!quest) return interaction.reply({ content: ' Erreur de génération des quêtes.', flags: 64 });

        const questInfo = QUEST_TYPES.find(q => q.type === quest.type) || { label: quest.type, desc: 'Objectif quotidien' };

        let progressPercent = Math.min(100, Math.round((quest.progress / quest.target) * 100));
        let progressBar = '';
        const totalBlocks = 10;
        const filledBlocks = Math.floor(progressPercent / 10);

        for (let i = 0; i < totalBlocks; i++) {
            progressBar += i < filledBlocks ? '▰' : '▱';
        }

        const status = quest.is_completed ? ' **Terminée**' : '⏳ **En cours**';

        const embed = createEmbed({
            title: '🏆 Quête Quotidienne',
            description: `**Objectif :** ${questInfo.label}\n*${questInfo.desc}*\n\n**Progression :** \`${quest.progress} / ${quest.target}\`\n\`${progressBar}\` ${progressPercent}%\n\n**Statut :** ${status}`,
            color: quest.is_completed ? 0x2ecc71 : 0x3498db,
            thumbnail: interaction.user.displayAvatarURL()
        });

        await interaction.reply({ embeds: [embed], flags: 64 });
    }
};

