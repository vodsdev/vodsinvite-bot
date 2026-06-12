const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
    constructor() {
        this.db = null;
        this.dbPath = path.join(__dirname, 'database.sqlite');
    }

    async init() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    reject(err);
                } else {
                    this.createTables()
                        .then(() => this.applyMigrations())
                        .then(resolve)
                        .catch(reject);
                }
            });
        });
    }

    async createTables() {
        const queries = [
            `CREATE TABLE IF NOT EXISTS users (
                user_id TEXT,
                guild_id TEXT,
                coins INTEGER DEFAULT 0,
                joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_daily DATETIME,
                daily_streak INTEGER DEFAULT 0,
                voice_minutes INTEGER DEFAULT 0,
                PRIMARY KEY(user_id, guild_id)
            )`,

            `CREATE TABLE IF NOT EXISTS invites(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                inviter_id TEXT,
                invited_id TEXT,
                invite_code TEXT,
                coins_earned INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                has_left BOOLEAN DEFAULT FALSE
            )`,

            `CREATE TABLE IF NOT EXISTS guild_settings(
                guild_id TEXT PRIMARY KEY,
                coins_goal INTEGER DEFAULT 1000,
                language TEXT DEFAULT 'fr',
                admin_roles TEXT DEFAULT '[]',
                reward_roles TEXT DEFAULT '{}',
                dm_template TEXT DEFAULT '{}',
                log_channel_id TEXT,
                min_account_age INTEGER DEFAULT 0,
                welcome_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            `CREATE TABLE IF NOT EXISTS team_challenges(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                description TEXT,
                target_invites INTEGER,
                reward_coins INTEGER,
                is_active BOOLEAN DEFAULT TRUE,
                completed_at DATETIME
            )`,

            `CREATE TABLE IF NOT EXISTS user_history(
                user_id TEXT,
                guild_id TEXT,
                has_joined BOOLEAN DEFAULT TRUE,
                last_joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(user_id, guild_id)
            )`,

            `CREATE TABLE IF NOT EXISTS team_challenge_progress(
                team_id INTEGER,
                challenge_id INTEGER,
                invite_count INTEGER DEFAULT 0,
                PRIMARY KEY(team_id, challenge_id),
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(challenge_id) REFERENCES team_challenges(id) ON DELETE CASCADE
            )`,

            `CREATE TABLE IF NOT EXISTS user_invites(
                user_id TEXT,
                guild_id TEXT,
                invite_code TEXT UNIQUE,
                uses INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(user_id, guild_id, invite_code)
            )`,

            `CREATE TABLE IF NOT EXISTS temp_roles(
                user_id TEXT,
                guild_id TEXT,
                role_id TEXT,
                expires_at DATETIME,
                PRIMARY KEY(user_id, guild_id, role_id)
            )`,

            `CREATE TABLE IF NOT EXISTS teams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                name TEXT,
                password TEXT,
                admin_id TEXT,
                channel_id TEXT,
                total_wager INTEGER DEFAULT 0,
                xp INTEGER DEFAULT 0,
                level INTEGER DEFAULT 1,
                voice_channel_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(guild_id, name)
            )`,

            `CREATE TABLE IF NOT EXISTS team_members (
                team_id INTEGER,
                user_id TEXT,
                user_wager INTEGER DEFAULT 0,
                joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (team_id, user_id),
                FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
            )`,

            `CREATE TABLE IF NOT EXISTS daily_quests (
                user_id TEXT,
                guild_id TEXT,
                type TEXT,
                target INTEGER,
                progress INTEGER DEFAULT 0,
                is_completed BOOLEAN DEFAULT FALSE,
                reset_at DATETIME,
                PRIMARY KEY(user_id, guild_id, type)
            )`,

            `CREATE TABLE IF NOT EXISTS user_achievements (
                user_id TEXT,
                guild_id TEXT,
                achievement_id TEXT,
                unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(user_id, guild_id, achievement_id)
            )`,

            `CREATE TABLE IF NOT EXISTS seasons (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                name TEXT,
                start_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                end_at DATETIME,
                prize_coins INTEGER,
                is_active BOOLEAN DEFAULT TRUE
            )`
        ];

        for (const query of queries) {
            await this.run(query);
        }
    }

    async applyMigrations() {
        const columns = [
            { table: 'guild_settings', column: 'log_channel_id', type: 'TEXT' },
            { table: 'guild_settings', column: 'min_account_age', type: 'INTEGER DEFAULT 0' },
            { table: 'guild_settings', column: 'welcome_message', type: 'TEXT' },
            { table: 'users', column: 'last_daily', type: 'DATETIME' },
            { table: 'users', column: 'daily_streak', type: 'INTEGER DEFAULT 0' },
            { table: 'users', column: 'voice_minutes', type: 'INTEGER DEFAULT 0' },
            { table: 'teams', column: 'xp', type: 'INTEGER DEFAULT 0' },
            { table: 'teams', column: 'level', type: 'INTEGER DEFAULT 1' },
            { table: 'teams', column: 'voice_channel_id', type: 'TEXT' },
            { table: 'teams', column: 'guild_id', type: 'TEXT' },
            { table: 'teams', column: 'name', type: 'TEXT' },
            { table: 'teams', column: 'password', type: 'TEXT' },
            { table: 'teams', column: 'admin_id', type: 'TEXT' },
            { table: 'teams', column: 'channel_id', type: 'TEXT' }
        ];

        for (const col of columns) {
            try {
                // SQLite doesn't have "IF NOT EXISTS" for ADD COLUMN, so we try and ignore errors
                await this.run(`ALTER TABLE ${col.table} ADD COLUMN ${col.column} ${col.type}`);
                console.log(`✅ Migration: Colonne ${col.column} ajoutée à ${col.table}`);
            } catch (err) {
                // Erreur attendue si la colonne existe déjà
            }
        }
    }

    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // Méthodes Economie
    async addCoins(userId, guildId, amount) {
        await this.run(
            `INSERT INTO users (user_id, guild_id, coins)
VALUES (?, ?, ?)
ON CONFLICT(user_id, guild_id)
DO UPDATE SET coins = coins + ?`,
            [userId, guildId, amount, amount]
        );
    }

    async removeCoins(userId, guildId, amount) {
        await this.run(
            'UPDATE users SET coins = MAX(0, coins - ?) WHERE user_id = ? AND guild_id = ?',
            [amount, userId, guildId]
        );
    }

    async getCoins(userId, guildId) {
        const row = await this.get(
            'SELECT coins, last_daily, daily_streak, voice_minutes FROM users WHERE user_id = ? AND guild_id = ?',
            [userId, guildId]
        );
        return row || { coins: 0, last_daily: null, daily_streak: 0, voice_minutes: 0 };
    }

    async updateLastDaily(userId, guildId, newStreak) {
        await this.run(
            'UPDATE users SET last_daily = CURRENT_TIMESTAMP, daily_streak = ? WHERE user_id = ? AND guild_id = ?',
            [newStreak, userId, guildId]
        );
    }

    async addVoiceTime(userId, guildId, minutes) {
        await this.run(
            `INSERT INTO users (user_id, guild_id, voice_minutes)
             VALUES (?, ?, ?)
             ON CONFLICT(user_id, guild_id) DO UPDATE SET voice_minutes = voice_minutes + ?`,
            [userId, guildId, minutes, minutes]
        );
    }

    // Méthodes invitations
    async addInvite(invite) {
        await this.run(
            `INSERT INTO invites (guild_id, inviter_id, invited_id, invite_code, coins_earned)
VALUES (?, ?, ?, ?, ?)`,
            [invite.guild_id, invite.inviter_id, invite.invited_id, invite.invite_code, invite.coins_earned]
        );
    }

    async getUserInviteCount(userId, guildId) {
        const row = await this.get(
            `SELECT COUNT(*) as count FROM invites
WHERE inviter_id = ? AND guild_id = ? AND has_left = FALSE`,
            [userId, guildId]
        );
        return row ? row.count : 0;
    }

    async markInviteLeft(userId, guildId) {
        await this.run(
            'UPDATE invites SET has_left = TRUE WHERE invited_id = ? AND guild_id = ?',
            [userId, guildId]
        );
    }

    async getInviteByInvited(userId, guildId) {
        return await this.get(
            'SELECT * FROM invites WHERE invited_id = ? AND guild_id = ? ORDER BY created_at DESC LIMIT 1',
            [userId, guildId]
        );
    }

    async getInviteStats(userId, guildId) {
        return await this.all(
            'SELECT created_at, has_left FROM invites WHERE inviter_id = ? AND guild_id = ?',
            [userId, guildId]
        );
    }

    async getUserInviteCode(userId, guildId) {
        const row = await this.get(
            'SELECT invite_code FROM user_invites WHERE user_id = ? AND guild_id = ?',
            [userId, guildId]
        );
        return row ? row.invite_code : null;
    }

    // Méthodes paramètres guilde
    async setGuildSettings(guildId, settings) {
        await this.run(
            `INSERT OR REPLACE INTO guild_settings
(guild_id, coins_goal, language, admin_roles, reward_roles, dm_template, log_channel_id, min_account_age, welcome_message)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                guildId,
                settings.coins_goal,
                settings.language,
                JSON.stringify(settings.admin_roles || []),
                JSON.stringify(settings.reward_roles || {}),
                JSON.stringify(settings.dm_template || {}),
                settings.log_channel_id || null,
                settings.min_account_age || 0,
                settings.welcome_message || null
            ]
        );
    }

    async getTeamByMember(userId, guildId) {
        return await this.get(
            `SELECT t.* FROM teams t
             JOIN team_members tm ON t.id = tm.team_id
             WHERE tm.user_id = ? AND t.guild_id = ?`,
            [userId, guildId]
        );
    }

    async getTeamByName(guildId, name) {
        return await this.get('SELECT * FROM teams WHERE guild_id = ? AND name = ?', [guildId, name]);
    }

    async getTeamMembers(teamId) {
        return await this.all('SELECT * FROM team_members WHERE team_id = ?', [teamId]);
    }

    async addTeamMember(teamId, userId) {
        await this.run('INSERT OR IGNORE INTO team_members (team_id, user_id) VALUES (?, ?)', [teamId, userId]);
    }

    async removeTeamMember(teamId, userId) {
        await this.run('DELETE FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, userId]);
    }

    async createTeam(guildId, name, password, adminId, channelId) {
        return await this.run(
            'INSERT INTO teams (guild_id, name, password, admin_id, channel_id) VALUES (?, ?, ?, ?, ?)',
            [guildId, name, password, adminId, channelId]
        );
    }

    async deleteTeam(teamId) {
        await this.run('DELETE FROM teams WHERE id = ?', [teamId]);
    }

    async getTopTeams(guildId, limit = 10, offset = 0) {
        return await this.all(
            'SELECT * FROM teams WHERE guild_id = ? ORDER BY total_wager DESC LIMIT ? OFFSET ?',
            [guildId, limit, offset]
        );
    }

    async getTeamCount(guildId) {
        const row = await this.get('SELECT COUNT(*) as count FROM teams WHERE guild_id = ?', [guildId]);
        return row ? row.count : 0;
    }

    async getLeaderboard(guildId, limit = 10, offset = 0) {
        return await this.all(
            'SELECT * FROM users WHERE guild_id = ? ORDER BY coins DESC LIMIT ? OFFSET ?',
            [guildId, limit, offset]
        );
    }

    async getUserCount(guildId) {
        const row = await this.get('SELECT COUNT(*) as count FROM users WHERE guild_id = ? AND coins > 0', [guildId]);
        return row ? row.count : 0;
    }

    async getRewardRoles(guildId) {
        const settings = await this.getGuildSettings(guildId);
        return settings.reward_roles ? JSON.parse(settings.reward_roles) : {};
    }

    async getUserHistory(userId, guildId) {
        return await this.get('SELECT * FROM user_history WHERE user_id = ? AND guild_id = ?', [userId, guildId]);
    }

    async addUserHistory(userId, guildId) {
        await this.run('INSERT OR IGNORE INTO user_history (user_id, guild_id) VALUES (?, ?)', [userId, guildId]);
    }

    async getGuildSettings(guildId) {
        const row = await this.get(
            'SELECT * FROM guild_settings WHERE guild_id = ?',
            [guildId]
        );
        return row || {
            coins_goal: 1000,
            language: 'fr',
            admin_roles: '[]',
            reward_roles: '{}',
            dm_template: '{}',
            log_channel_id: null,
            min_account_age: 0,
            welcome_message: null
        };
    }

    // Méthodes temporaires roles
    async addTempRole(userId, guildId, roleId, durationMs) {
        const expiresAt = new Date(Date.now() + durationMs).toISOString();
        await this.run(
            `INSERT OR REPLACE INTO temp_roles (user_id, guild_id, role_id, expires_at)
VALUES (?, ?, ?, ?)`,
            [userId, guildId, roleId, expiresAt]
        );
    }

    async getExpiredRoles() {
        return await this.all(
            'SELECT * FROM temp_roles WHERE expires_at <= CURRENT_TIMESTAMP'
        );
    }

    async removeTempRole(userId, guildId, roleId) {
        await this.run(
            'DELETE FROM temp_roles WHERE user_id = ? AND guild_id = ? AND role_id = ?',
            [userId, guildId, roleId]
        );
    }

    // Méthodes Défis
    async addChallenge(guildId, description, target, reward) {
        await this.run(
            'INSERT INTO team_challenges (guild_id, description, target_invites, reward_coins) VALUES (?, ?, ?, ?)',
            [guildId, description, target, reward]
        );
    }

    async getActiveChallenges(guildId) {
        return await this.all(
            'SELECT * FROM team_challenges WHERE guild_id = ? AND is_active = TRUE',
            [guildId]
        );
    }

    // Méthodes Teams (simplifiées)
    async getTeamByChannel(channelId) {
        return await this.get('SELECT * FROM teams WHERE channel_id = ?', [channelId]);
    }

    async addTeamXP(teamId, amount) {
        // Ajouter l'XP
        await this.run('UPDATE teams SET xp = xp + ? WHERE id = ?', [amount, teamId]);

        // Vérifier le level up (formule simple : level * 100 XP)
        const team = await this.get('SELECT level, xp FROM teams WHERE id = ?', [teamId]);
        const nextLevelXP = team.level * 100;

        if (team.xp >= nextLevelXP) {
            await this.run('UPDATE teams SET level = level + 1, xp = xp - ? WHERE id = ?', [nextLevelXP, teamId]);
            return team.level + 1;
        }
        return null;
    }

    async updateTeamWager(teamId, amount) {
        await this.run('UPDATE teams SET total_wager = total_wager + ? WHERE id = ?', [amount, teamId]);
        // Chaque pari donne aussi un peu d'XP à la team
        await this.addTeamXP(teamId, Math.max(1, Math.floor(amount / 10)));
    }

    async addWagerToTeamMember(teamId, userId, amount) {
        await this.run(
            'UPDATE team_members SET user_wager = user_wager + ? WHERE team_id = ? AND user_id = ?',
            [amount, teamId, userId]
        );
        await this.updateTeamWager(teamId, amount);
    }

    async incrementChallengeProgress(teamId, challengeId) {
        await this.run(
            `INSERT INTO team_challenge_progress (team_id, challenge_id, invite_count)
             VALUES (?, ?, 1)
             ON CONFLICT(team_id, challenge_id) DO UPDATE SET invite_count = invite_count + 1`,
            [teamId, challengeId]
        );
    }

    async addChallenge(guildId, description, target, reward) {
        return await this.run(
            'INSERT INTO team_challenges (guild_id, description, target_invites, reward_coins) VALUES (?, ?, ?, ?)',
            [guildId, description, target, reward]
        );
    }

    async getActiveChallenges(guildId) {
        return await this.all(
            'SELECT * FROM team_challenges WHERE guild_id = ? AND is_active = TRUE',
            [guildId]
        );
    }

    async incrementChallengeProgress(teamId, challengeId) {
        await this.run(
            `INSERT INTO team_challenge_progress (team_id, challenge_id, invite_count)
             VALUES (?, ?, 1)
             ON CONFLICT(team_id, challenge_id) DO UPDATE SET invite_count = invite_count + 1`,
            [teamId, challengeId]
        );
    }

    async getTeamChallengeProgress(teamId) {
        return await this.all(
            'SELECT * FROM team_challenge_progress WHERE team_id = ?',
            [teamId]
        );
    }

    async completeChallenge(challengeId) {
        await this.run(
            'UPDATE team_challenges SET is_active = FALSE, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
            [challengeId]
        );
    }

    async addCoinsToTeam(teamId, amount) {
        await this.run('UPDATE teams SET total_wager = total_wager + ? WHERE id = ?', [amount, teamId]);
    }

    // Méthodes Quêtes & Succès
    async getUserQuests(userId, guildId) {
        return await this.all(
            'SELECT * FROM daily_quests WHERE user_id = ? AND guild_id = ?',
            [userId, guildId]
        );
    }

    async updateQuestProgress(userId, guildId, type, amount) {
        await this.run(
            `UPDATE daily_quests SET progress = progress + ?
             WHERE user_id = ? AND guild_id = ? AND type = ? AND is_completed = FALSE`,
            [amount, userId, guildId, type]
        );

        // Vérifier si complétée
        const quest = await this.get(
            'SELECT * FROM daily_quests WHERE user_id = ? AND guild_id = ? AND type = ?',
            [userId, guildId, type]
        );

        if (quest && quest.progress >= quest.target && !quest.is_completed) {
            await this.run(
                'UPDATE daily_quests SET is_completed = TRUE WHERE user_id = ? AND guild_id = ? AND type = ?',
                [userId, guildId, type]
            );
            return true; // Juste complétée
        }
        return false;
    }

    async resetDailyQuests() {
        await this.run('DELETE FROM daily_quests WHERE reset_at <= CURRENT_TIMESTAMP');
    }

    async createQuest(userId, guildId, type, target) {
        const resetAt = new Date();
        resetAt.setHours(24, 0, 0, 0); // Reset à minuit demain
        await this.run(
            `INSERT OR IGNORE INTO daily_quests (user_id, guild_id, type, target, reset_at)
             VALUES (?, ?, ?, ?, ?)`,
            [userId, guildId, type, target, resetAt.toISOString()]
        );
    }

    async addAchievement(userId, guildId, achievementId) {
        await this.run(
            'INSERT OR IGNORE INTO user_achievements (user_id, guild_id, achievement_id) VALUES (?, ?, ?)',
            [userId, guildId, achievementId]
        );
    }

    async hasAchievement(userId, guildId, achievementId) {
        const row = await this.get(
            'SELECT * FROM user_achievements WHERE user_id = ? AND guild_id = ? AND achievement_id = ?',
            [userId, guildId, achievementId]
        );
        return !!row;
    }

    async getDailyStats(guildId) {
        return await this.all(
            `SELECT date(created_at) as date, COUNT(*) as count
             FROM invites
             WHERE guild_id = ? AND created_at >= date('now', '-7 days')
             GROUP BY date(created_at)
             ORDER BY date ASC`,
            [guildId]
        );
    }

    // Backup
    async backup() {
        const backupPath = path.join(__dirname, `backup_${Date.now()}.sqlite`);
        fs.copyFileSync(this.dbPath, backupPath);
        logger.info(`Sauvegarde de la base de données effectuée : ${backupPath}`);
    }

    // Méthodes Saisons
    async startSeason(guildId, name, durationDays, prize) {
        // Désactiver les anciennes saisons
        await this.run('UPDATE seasons SET is_active = FALSE WHERE guild_id = ?', [guildId]);

        const endAt = new Date();
        endAt.setDate(endAt.getDate() + durationDays);

        return await this.run(
            'INSERT INTO seasons (guild_id, name, end_at, prize_coins) VALUES (?, ?, ?, ?)',
            [guildId, name, endAt.toISOString(), prize]
        );
    }

    async getActiveSeason(guildId) {
        return await this.get(
            'SELECT * FROM seasons WHERE guild_id = ? AND is_active = TRUE AND end_at > CURRENT_TIMESTAMP',
            [guildId]
        );
    }

    async getSeasonLeaderboard(guildId, startAt, endAt) {
        return await this.all(
            `SELECT t.name, t.id, COUNT(i.id) as invite_count
             FROM teams t
             JOIN team_members tm ON t.id = tm.team_id
             JOIN invites i ON tm.user_id = i.inviter_id
             WHERE i.guild_id = ? AND i.created_at BETWEEN ? AND ? AND i.has_left = FALSE
             GROUP BY t.id
             ORDER BY invite_count DESC`,
            [guildId, startAt, endAt]
        );
    }

    async endSeason(seasonId) {
        await this.run('UPDATE seasons SET is_active = FALSE WHERE id = ?', [seasonId]);
    }

    async getExpiredSeasons() {
        return await this.all(
            'SELECT * FROM seasons WHERE is_active = TRUE AND end_at <= CURRENT_TIMESTAMP'
        );
    }
}

module.exports = Database;
