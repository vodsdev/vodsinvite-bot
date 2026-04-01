const { EmbedBuilder } = require('discord.js');

function createEmbed({ title, description, color = 0x5865F2, fields, footer, thumbnail, timestamp = true, image }) {
    const embed = new EmbedBuilder();

    if (title) embed.setTitle(`✨ ${title}`);
    if (description) embed.setDescription(description);
    embed.setColor(color);
    if (fields) embed.addFields(fields);
    if (footer) embed.setFooter(footer);
    if (thumbnail) embed.setThumbnail(thumbnail);
    if (image) embed.setImage(image);
    if (timestamp) embed.setTimestamp();

    return embed;
}

module.exports = {
    createEmbed
};
