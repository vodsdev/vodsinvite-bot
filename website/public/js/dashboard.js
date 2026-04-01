class Dashboard {
    constructor() {
        this.currentGuildId = null;
        this.init();
    }

    init() {
        const guildSelect = document.getElementById('guild-select');
        if (guildSelect) {
            guildSelect.addEventListener('change', (e) => {
                this.currentGuildId = e.target.value;
                this.loadStats();
            });
        }
    }

    async loadStats() {
        if (!this.currentGuildId) {
            document.getElementById('stats-container').style.display = 'none';
            return;
        }

        try {
            const response = await fetch(`/api/user/stats?guildId=${this.currentGuildId}`);
            const data = await response.json();

            if (response.ok) {
                this.updateStats(data);
                document.getElementById('stats-container').style.display = 'block';
            } else {
                alert('Erreur: ' + data.error);
            }
        } catch (error) {
            console.error('Erreur chargement stats:', error);
            alert('Erreur lors du chargement des statistiques');
        }
    }

    updateStats(data) {
        document.getElementById('coins-value').textContent = data.coins;
        document.getElementById('invites-value').textContent = data.inviteCount;
        document.getElementById('progress-value').textContent = data.progress + '%';
        document.getElementById('goal-value').textContent = data.coinsGoal;

        const progressFill = document.getElementById('progress-fill');
        progressFill.style.width = Math.min(data.progress, 100) + '%';
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    new Dashboard();
});
