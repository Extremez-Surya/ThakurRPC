export default {
    name: 'banner',
    description: "Displays a user's or server's banner.",
    aliases: ['b'],
    usage: '[user mention/id | server]',
    category: 'general',
    type: 'both',
    permissions: ['SendMessages'],    cooldown: 3,
    async execute(client, message, args) {
        try {
            let targetUser = null;
            let targetGuild = null;
            let bannerName = "";

            const sendUsageError = (text) => {
                return message.channel.send(`> ❌ **Error:** ${text} Usage: \`${client.prefix}banner [user mention/id | server]\``);
            };

            if (args.length > 0) {
                const arg = args[0].toLowerCase();
                if (arg === 'server' || arg === 'guild') {
                    if (message.guild) {
                        targetGuild = message.guild;
                        bannerName = `${message.guild.name}'s`;
                    } else {
                        return message.channel.send('> ❌ **Error:** This command can only fetch server banners in a guild channel.');
                    }
                } else {
                    // Try to find a mentioned user first.
                    const mentionedUser = message.mentions.users.first();
                    if (mentionedUser) {
                        targetUser = mentionedUser;
                        bannerName = `${targetUser.username}'s`;
                    } else {
                        // Try to find user by ID and fetch a full profile if possible.
                        const userId = args[0].replace(/[^0-9]/g, '');
                        if (userId) {
                            const fetchedUser = await client.users.fetch(userId).catch(() => null);
                            const cachedUser = client.users.cache.get(userId);
                            targetUser = fetchedUser || cachedUser || null;

                            if (targetUser) {
                                bannerName = `${targetUser.username ?? 'User'}'s`;
                            } else {
                                return sendUsageError('Could not find that user. Please mention the user instead.');
                            }
                        } else {
                            targetUser = message.author;
                            bannerName = "Your";
                        }
                    }
                }
            } else {
                targetUser = message.author;
                bannerName = "Your";
            }

            let bannerURL = null;
            if (targetGuild) {
                bannerURL = targetGuild.bannerURL({ size: 1024 });
            } else if (targetUser) {
                const targetMember = message.guild?.members.cache.get(targetUser.id) || null;
                bannerURL = await resolveBannerURL(targetUser, targetMember, client, message.guild);
            }

            if (!bannerURL) {
                let infoMessage = `> ℹ️ **Info:** ${bannerName} doesn't have a banner.`;
                if (targetUser) {
                    infoMessage += `\n> (Users need Discord Nitro to set a banner.)`;
                } else if (targetGuild) {
                    infoMessage += `\n> (Servers need a certain boost level to set a banner.)`;
                }
                return message.channel.send(infoMessage);
            }

            const payload = {
                embeds: [{
                    color: 0x2b2d31,
                    title: `${bannerName} Banner`,
                    url: bannerURL,
                    image: { url: bannerURL },
                    description: `[Download Link](${bannerURL})`,
                }],
            };

            await message.channel.send(payload).catch(async () => {
                await message.channel.send(`> **${bannerName} Banner**\n> ${bannerURL}\n> [Download Link](${bannerURL})`);
            });
        } catch (error) {
            const userFacingError = error?.message === 'USER_BANNER_NOT_FETCHED'
                ? 'Failed to fetch banner because Discord did not return banner data for that user. Please mention the user again or try a different account.'
                : `Failed to fetch banner: ${error.message}`;

            return message.channel.send(`> ❌ **Error:** ${userFacingError}`);
        }
    },
};

async function fetchUserWithBanner(user, client) {
    if (!user) {
        return null;
    }

    if (typeof user.fetch === 'function') {
        return await user.fetch(true).catch(() => user);
    }

    if (typeof client?.users?.fetch === 'function') {
        return await client.users.fetch(user.id, { force: true }).catch(() => user);
    }

    return user;
}

async function resolveBannerURL(user, member, client, guild = null) {
    if (guild?.members?.fetch && user?.id) {
        try {
            const fetchedMember = await guild.members.fetch({ user: user.id, force: true }).catch(() => null);
            if (fetchedMember && typeof fetchedMember.displayBannerURL === 'function') {
                const memberBannerURL = fetchedMember.displayBannerURL({ size: 1024 });
                if (memberBannerURL) {
                    return memberBannerURL;
                }
            }
        } catch {
            // Fall through to user/profile fetch.
        }
    }

    const fetchedUser = await fetchUserWithBanner(user, client);
    if (!fetchedUser) {
        return null;
    }

    const profileBannerURL = await fetchProfileBannerURL(fetchedUser, guild?.id).catch(() => null);
    if (profileBannerURL) {
        return profileBannerURL;
    }

    if (typeof fetchedUser.bannerURL === 'function') {
        try {
            return fetchedUser.bannerURL({ size: 1024, dynamic: true });
        } catch (error) {
            if (error?.message !== 'USER_BANNER_NOT_FETCHED' && error?.code !== 'USER_BANNER_NOT_FETCHED') {
                throw error;
            }

            try {
                const refetchedUser = await fetchedUser.fetch(true).catch(() => null);
                if (refetchedUser && typeof refetchedUser.bannerURL === 'function') {
                    return refetchedUser.bannerURL({ size: 1024, dynamic: true });
                }
            } catch {
                return null;
            }

            return null;
        }
    }

    return null;
}

async function fetchProfileBannerURL(user, guildId = null) {
    if (!user || typeof user.getProfile !== 'function' || typeof user.client?.rest?.cdn?.Banner !== 'function') {
        return null;
    }

    const profile = await user.getProfile(guildId).catch(() => null);
    if (!profile) {
        return null;
    }

    const bannerHash =
        profile.guild_member_profile?.banner ||
        profile.user_profile?.banner ||
        profile.user?.banner ||
        null;

    if (!bannerHash) {
        return null;
    }

    return user.client.rest.cdn.Banner(user.id, bannerHash, undefined, 1024, true);
}