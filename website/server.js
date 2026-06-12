const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const { config } = require('dotenv');
const Database = require('../bot/database');

config();

const app = express();
const db = new Database();

// Configuration EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Stratégie Discord
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: `${process.env.WEBSITE_URL}/auth/discord/callback`,
    scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Routes
app.get('/', async (req, res) => {
    res.render('index', { user: req.user });
});

app.get('/dashboard', ensureAuthenticated, async (req, res) => {
    try {
        const userGuilds = req.user.guilds.filter(guild =>
            (guild.permissions & 0x20) === 0x20 // Gérer le serveur
        );

        res.render('dashboard', {
            user: req.user,
            guilds: userGuilds
        });
    } catch (error) {
        console.error('Erreur dashboard:', error);
        res.status(500).render('error', { error: 'Erreur interne' });
    }
});

app.get('/leaderboard/:guildId?', async (req, res) => {
    try {
        const guildId = req.params.guildId;
        let leaderboard = [];

        if (guildId) {
            leaderboard = await db.getLeaderboard(guildId, 20);
        }

        res.render('leaderboard', {
            user: req.user,
            leaderboard,
            guildId
        });
    } catch (error) {
        console.error('Erreur leaderboard:', error);
        res.status(500).render('error', { error: 'Erreur interne' });
    }
});

// API de Sécurité (Clé d'API)
const API_KEY = process.env.INTERNAL_API_KEY || 'vods_secret_key_2026';

function ensureApiKey(req, res, next) {
    const key = req.headers['x-api-key'];
    if (key && key === API_KEY) return next();
    res.status(401).json({ error: 'Clé d\'API invalide ou manquante' });
}

// API d'Interconnexion Économie (Cachée)
app.get('/api/internal/balance/:guildId/:userId', ensureApiKey, async (req, res) => {
    try {
        const { guildId, userId } = req.params;
        const userData = await db.getCoins(userId, guildId);
        res.json({
            user_id: userId,
            guild_id: guildId,
            coins: userData.coins || 0,
            streak: userData.daily_streak || 0,
            last_daily: userData.last_daily
        });
    } catch (error) {
        res.status(500).json({ error: 'Erreur lors de la récupération du solde' });
    }
});

app.post('/api/internal/balance/update', ensureApiKey, async (req, res) => {
    try {
        const { userId, guildId, amount, reason } = req.body;
        if (!userId || !guildId || amount === undefined) {
            return res.status(400).json({ error: 'Paramètres manquants' });
        }

        await db.addCoins(userId, guildId, amount);
        console.log(`[API INTERNAL] ${amount} pièces ajoutées à ${userId} (${guildId}). Raison: ${reason || 'Non spécifiée'}`);
        
        const newData = await db.getCoins(userId, guildId);
        res.json({ success: true, new_balance: newData.coins });
    } catch (error) {
        res.status(500).json({ error: 'Erreur lors de la mise à jour du solde' });
    }
});

// API Publique (Dashboard)
app.get('/api/user/stats', ensureAuthenticated, async (req, res) => {
    try {
        const { guildId } = req.query;
        if (!guildId) return res.status(400).json({ error: 'Guild ID requis' });

        const coins = await db.getCoins(req.user.id, guildId);
        const inviteCount = await db.getUserInviteCount(req.user.id, guildId);
        const settings = await db.getGuildSettings(guildId);

        res.json({
            coins,
            inviteCount,
            coinsGoal: settings.coins_goal,
            progress: Math.round((coins / settings.coins_goal) * 100)
        });
    } catch (error) {
        console.error('Erreur API stats:', error);
        res.status(500).json({ error: 'Erreur interne' });
    }
});

app.get('/api/guild/:guildId/leaderboard', async (req, res) => {
    try {
        const leaderboard = await db.getLeaderboard(req.params.guildId, 50);
        res.json(leaderboard);
    } catch (error) {
        console.error('Erreur API leaderboard:', error);
        res.status(500).json({ error: 'Erreur interne' });
    }
});

// Authentification
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback',
    passport.authenticate('discord', { failureRedirect: '/' }),
    (req, res) => res.redirect('/dashboard')
);
app.get('/logout', (req, res) => {
    req.logout(() => res.redirect('/'));
});

// Middleware d'authentification
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect('/auth/discord');
}

// Initialisation
async function startServer() {
    await db.init();

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🌐 Site web démarré sur le port ${PORT}`);
    });
}

startServer();
