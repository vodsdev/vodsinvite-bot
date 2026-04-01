const fs = require('fs');
const path = require('path');

function cleanEmojis(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            cleanEmojis(fullPath);
        } else if (fullPath.endsWith('.js')) {
            let content = fs.readFileSync(fullPath, 'utf8');

            // Remove corrupted .setEmoji('...') calls
            // Example: .setEmoji('a"️')
            content = content.replace(/\.setEmoji\(['"`].*?\uFFFD.*?['"`]\)/g, '');

            // Clean up standalone \uFFFD in descriptions/titles
            content = content.replace(/\uFFFD[^\s'"`,;:]*/g, '');

            fs.writeFileSync(fullPath, content, 'utf8');
            console.log('Fixed emojis in:', fullPath);
        }
    }
}

cleanEmojis(path.join(__dirname, 'bot', 'commands'));
cleanEmojis(path.join(__dirname, 'bot', 'utils'));
console.log('Done!');
