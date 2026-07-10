/**
 * READY EVENT HANDLER
 *
 * This event handler is triggered when the Discord client is fully initialized
 * and ready to start operating. It handles:
 * - Displaying startup information and system details
 * - Setting the user's Discord status
 * - Configuring Rich Presence (custom activity status)
 * - Initializing relationship tracking and debugging features
 * - Final startup confirmation and ready state logging
 *
 * This is a one-time event that fires only once per bot session when the
 * connection to Discord is established and all initial data is loaded.
 *
 * @module events/ready
 * @author faiz4sure
 */

import chalk from "chalk";
import axios from "axios";
import { log } from "../utils/functions.js";
import RpcManager from "../utils/RpcManager.js";
import { RichPresence } from "discord.js-selfbot-v13";
import { fileURLToPath } from "url";
import path from "path";

// Get current directory path for ES modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function normalizeCustomStatusEntries(customStatus) {
  if (!customStatus || typeof customStatus !== "object") {
    return [];
  }

  const normalizeEmoji = (entry = {}) => {
    if (typeof entry?.emoji === "string") {
      const customEmojiMatch = entry.emoji.trim().match(/^<a?:(.+?):(\d+)>$/);
      if (customEmojiMatch) {
        return {
          emoji_name: customEmojiMatch[1].trim(),
          emoji_id: customEmojiMatch[2].trim(),
        };
      }
    }

    let normalized = {
      emoji_name:
        typeof entry?.emoji_name === "string" ? entry.emoji_name.trim() : "",
      emoji_id:
        typeof entry?.emoji_id === "string" ? entry.emoji_id.trim() : "",
    };

    // Discord custom emoji names are typically alphanumeric/underscore.
    // If emoji_name looks like a unicode emoji, force emoji_id to empty.
    // Sending unicode emoji + custom emoji id together can make the payload invalid.
    if (
      normalized.emoji_name &&
      !/^[a-zA-Z0-9_]+$/.test(normalized.emoji_name)
    ) {
      normalized.emoji_id = "";
    }

    return normalized;
  };

  if (
    Array.isArray(customStatus.statuses) &&
    customStatus.statuses.length > 0
  ) {
    return customStatus.statuses
      .map((entry) => ({
        text: typeof entry?.text === "string" ? entry.text.trim() : "",
        ...normalizeEmoji(entry),
      }))
      .filter((entry) => entry.text || entry.emoji_name || entry.emoji_id);
  }

  if (Array.isArray(customStatus.texts) && customStatus.texts.length > 0) {
    return customStatus.texts
      .map((text) => ({
        text: String(text).trim(),
        ...normalizeEmoji(customStatus),
      }))
      .filter((entry) => entry.text);
  }

  if (typeof customStatus.text === "string" && customStatus.text.trim()) {
    return [
      {
        text: customStatus.text.trim(),
        ...normalizeEmoji(customStatus),
      },
    ];
  }

  return [];
}

async function applyCustomStatus(client, entry) {
  const apiVersion = client.config.api?.version || "v9";

  await axios.patch(
    `https://discord.com/api/${apiVersion}/users/@me/settings`,
    {
      custom_status: {
        text: entry.text || null,
        emoji_name: entry.emoji_name || null,
        emoji_id: entry.emoji_id || null,
        expires_at: null,
      },
    },
    {
      headers: {
        Authorization: client.token,
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    },
  );
}

function getRetryDelayMs(error, fallbackMs = 60000) {
  const headers = error?.response?.headers || {};
  const retryAfterRaw =
    headers["retry-after"] ?? headers["x-ratelimit-reset-after"];

  if (retryAfterRaw !== undefined && retryAfterRaw !== null) {
    const parsed = Number(retryAfterRaw);
    if (!Number.isNaN(parsed) && parsed > 0) {
      // Discord may send retry-after in seconds (can be fractional).
      return Math.ceil(parsed * 1000);
    }
  }

  return fallbackMs;
}

export default {
  name: "ready",
  once: true,

  /**
   * Handle the ready event when the Discord client is fully initialized
   *
   * @async
   * @function execute
   * @param {Client} client - Discord.js client instance
   * @description Executes when the bot successfully connects to Discord and is
   *              ready to start processing events and commands. Sets up the
   *              final configuration, displays startup information, and
   *              initializes Rich Presence features.
   */
  execute: async (client) => {
    // Display visual separator for clean startup output
    console.log(chalk.cyan("─".repeat(50)));

    // Display essential bot information
    log(`Logged in as ${chalk.cyan(client.user.tag)}`, "success");
    log(`User ID: ${chalk.cyan(client.user.id)}`, "info");
    log(`Prefix: ${chalk.cyan(client.prefix)}`, "info");
    log(`Status: ${chalk.cyan(client.config.selfbot.status)}`, "info");

    // Display helpful usage information
    console.log("");
    log(
      `Use ${chalk.cyan(
        `${client.prefix}help`,
      )} to get info about available commands`,
      "info",
    );

    // Display system environment information
    console.log("");
    log("System Information:", "info");
    console.log(
      `  ${chalk.yellow("•")} ${chalk.yellow("Node.js")}: ${chalk.green(
        process.version,
      )}`,
    );
    console.log(
      `  ${chalk.yellow("•")} ${chalk.yellow("Platform")}: ${chalk.green(
        process.platform,
      )}`,
    );

    // Display closing separator
    console.log(chalk.cyan("─".repeat(50)));

    // Set the user's Discord status as configured
    client.user.setStatus(client.config.selfbot.status);

    // Apply a Discord custom status if one is configured
    const customStatus = client.config.selfbot.custom_status;
    if (customStatus && customStatus.enabled) {
      try {
        const customStatusTexts = normalizeCustomStatusEntries(customStatus);
        const configuredIntervalMs =
          Number(customStatus.rotation_interval_ms) || 5000;
        const safeBaseIntervalMs = Math.max(configuredIntervalMs, 15000);

        if (customStatusTexts.length > 0) {
          let currentIndex = 0;
          let nextDelayMs = safeBaseIntervalMs;

          if (client.customStatusRotationTimer) {
            clearTimeout(client.customStatusRotationTimer);
          }

          try {
            await applyCustomStatus(client, customStatusTexts[currentIndex]);
          } catch (error) {
            if (error?.response?.status === 429) {
              nextDelayMs = getRetryDelayMs(error, 60000);
              log(`Custom status rotation rate limited on startup. Waiting ${nextDelayMs / 1000}s.`, "warn");
            } else {
              log(
                `Failed to apply initial custom status: ${error.message}`,
                "warn",
              );
            }
          }

          if (customStatusTexts.length > 1) {
            const scheduleNext = () => {
              if (client.customStatusRotationTimer) {
                clearTimeout(client.customStatusRotationTimer);
              }

              client.customStatusRotationTimer = setTimeout(async () => {
                try {
                  currentIndex = (currentIndex + 1) % customStatusTexts.length;
                  await applyCustomStatus(
                    client,
                    customStatusTexts[currentIndex],
                  );

                  // Reset to baseline after a successful request.
                  nextDelayMs = safeBaseIntervalMs;
                } catch (error) {
                  if (error?.response?.status === 429) {
                    nextDelayMs = getRetryDelayMs(error, 60000);
                    log(`Custom status rotation rate limited. Retrying in ${nextDelayMs / 1000}s.`, "warn");
                  } else {
                    log(
                      `Failed to rotate custom status: ${error.message}`,
                      "warn",
                    );
                    nextDelayMs = safeBaseIntervalMs;
                  }
                } finally {
                  scheduleNext();
                }
              }, nextDelayMs);
            };

            scheduleNext();
          }
        }

        log("Custom status applied successfully", "success");
      } catch (error) {
        log(`Failed to apply custom status: ${error.message}`, "warn");
      }
    }

    // Initialize Rich Presence system
    log("Initializing Rich Presence system...", "info");

    try {
      // Load RPC configuration from file (initial load)
      const rpcConfig = await RpcManager.loadConfig();

      if (rpcConfig && rpcConfig.rpc && rpcConfig.rpc.enabled) {
        // Update presence with loaded configuration
        const success = await RpcManager.updatePresence(client);
        if (success) {
          log("Rich Presence initialized successfully", "success");
        } else {
          log("Failed to initialize Rich Presence", "warn");
        }
      } else {
        log("Rich Presence is disabled in configuration", "info");
        // Clear any existing activity for clean startup
        client.user.setActivity(null);
      }

      // Attach RPC manager to client for command access
      client.rpcManager = RpcManager;

      // Log asset information if debug mode is enabled
      if (client.config.debug_mode && client.config.debug_mode.enabled) {
        const currentConfig = RpcManager.getCurrentConfig();
        if (
          currentConfig &&
          currentConfig.rpc &&
          currentConfig.rpc.default &&
          currentConfig.rpc.default.assets
        ) {
          const assets = currentConfig.rpc.default.assets;
          log(
            `RPC Assets configured - Large: ${assets.large_image || "none"}, Small: ${assets.small_image || "none"}`,
            "debug",
          );
        }
      }
    } catch (error) {
      log(`Error during RPC initialization: ${error.message}`, "error");
      // Fallback to clearing activity
      client.user.setActivity(null);
    }

    log("Bot status set and RPC system ready.", "info");

    // Debug relationship information if debug mode is enabled
    if (client.config.debug_mode && client.config.debug_mode.enabled) {
      // Log relationship manager info
      log("Relationship Manager Information:", "debug");

      // Check if relationships are available
      if (client.relationships) {
        const friends = client.relationships.cache.filter(
          (r) => r.type === "FRIEND",
        ).size;
        const blocked = client.relationships.cache.filter(
          (r) => r.type === "BLOCKED",
        ).size;
        const incoming = client.relationships.cache.filter(
          (r) => r.type === "INCOMING_REQUEST",
        ).size;
        const outgoing = client.relationships.cache.filter(
          (r) => r.type === "OUTGOING_REQUEST",
        ).size;

        log(`Friends: ${chalk.green(friends)}`, "debug");
        log(`Blocked: ${chalk.red(blocked)}`, "debug");
        log(`Incoming Requests: ${chalk.yellow(incoming)}`, "debug");
        log(`Outgoing Requests: ${chalk.yellow(outgoing)}`, "debug");

        // Register additional event listeners for debugging
        client.on("relationshipAdd", (relationship) => {
          if (client.config.debug_mode.enabled) {
            const relationshipType =
              typeof relationship === "string" ? "unknown" : relationship.type;
            const userId =
              typeof relationship === "string" ? relationship : relationship.id;
            log(
              `[DEBUG] relationshipAdd event fired: ${relationshipType} - ${userId}`,
              "debug",
            );
          }
        });

        client.on("relationshipRemove", (relationship) => {
          if (client.config.debug_mode.enabled) {
            const relationshipType =
              typeof relationship === "string" ? "unknown" : relationship.type;
            const userId =
              typeof relationship === "string" ? relationship : relationship.id;
            log(
              `[DEBUG] relationshipRemove event fired: ${relationshipType} - ${userId}`,
              "debug",
            );
          }
        });

        client.on("presenceUpdate", (oldPresence, newPresence) => {
          if (client.config.debug_mode.enabled && newPresence.user) {
            const isFriend =
              client.relationships.cache.has(newPresence.user.id) &&
              client.relationships.cache.get(newPresence.user.id).type ===
                "FRIEND";

            if (isFriend) {
              log(
                `[DEBUG] presenceUpdate event fired for friend: ${newPresence.user.tag}`,
                "debug",
              );
            }
          }
        });

        client.on("userUpdate", (oldUser, newUser) => {
          if (client.config.debug_mode.enabled) {
            const isFriend =
              client.relationships.cache.has(newUser.id) &&
              client.relationships.cache.get(newUser.id).type === "FRIEND";

            if (isFriend) {
              log(
                `[DEBUG] userUpdate event fired for friend: ${newUser.tag}`,
                "debug",
              );
            }
          }
        });
      } else {
        log("Relationship manager is not available!", "warn");
      }
    }

    log(`Vexil is ready with ${client.commands.size} commands`, "success");
  },
};
