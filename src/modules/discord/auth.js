const state = require('./state');

function discordWhiteListCheck(member) {
    if (!member) return false;
    const cfg = state.config.discord_setting;
    if (Array.isArray(cfg.whitelist_members) && cfg.whitelist_members.includes(member.id)) {
        return true;
    }
    if (member.roles && member.roles.cache && Array.isArray(cfg.whitelist_roles)) {
        if (member.roles.cache.some(role => cfg.whitelist_roles.includes(role.id))) {
            return true;
        }
    }
    return false;
}

function isOwner(userId) {
    if (!userId) return false;
    const owners = state.config.discord_setting.owners;
    if (typeof owners === 'string') return owners === userId;
    if (Array.isArray(owners)) return owners.includes(userId);
    return false;
}

async function noPermissionReply(interaction) {
    await interaction.reply({
        content: `You don't have permission to do this`,
        ephemeral: true,
    });
}

async function notImplementedReply(interaction) {
    await interaction.reply({
        content: 'Not Implemented',
        ephemeral: true,
    });
}

module.exports = { discordWhiteListCheck, isOwner, noPermissionReply, notImplementedReply };
