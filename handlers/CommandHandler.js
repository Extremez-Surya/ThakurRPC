/**
 * COMMAND HANDLER
 *
 * This module handles the loading, registration, and execution of all bot commands.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";
import { log, parseArgs, formatTime, loadAllowedUsers } from "../utils/functions.js";

// Get current file path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load and register all commands from the commands directory
 */
export async function loadCommands(client) {
  try {
    if (!client.commands) client.commands = new Map();
    const commandsDir = path.join(__dirname, "..", "commands");
    const commandFiles = getCommandFiles(commandsDir);

    log(`Loading ${commandFiles.length} commands...`, "info");

    let loadedCount = 0;
    const categories = new Map();

    for (const filePath of commandFiles) {
      try {
        const command = await import(`file://${filePath}`);
        if (!command.default || !command.default.name || !command.default.execute) continue;

        const pathParts = filePath.split(path.sep);
        const categoryIndex = pathParts.indexOf("commands") + 1;
        const category = pathParts[categoryIndex] || "general";

        command.default.category = category;
        client.commands.set(command.default.name, command.default);

        if (!categories.has(category)) categories.set(category, 0);
        categories.set(category, categories.get(category) + 1);

        loadedCount++;
      } catch (error) {
        log(`Error loading command file ${path.basename(filePath)}: ${error.message}`, "error");
      }
    }

    log(`Successfully loaded ${loadedCount} commands in ${categories.size} categories`, "success");

    client.on("messageCreate", async (message) => {
      if (message.author.bot) return;

      const prefix = client.prefix || "Og";
      const hasPrefix = message.content.startsWith(prefix);
      
      // Detailed console logging for debugging command triggers on Render
      if (hasPrefix) {
        log(`[COMMAND REQUEST] Incoming potential command from ${message.author.tag} (${message.author.id}): "${message.content}"`, "info");
      }

      if (!client.noprefix && !hasPrefix) return;

      const allowedUsers = loadAllowedUsers();
      const allAllowed = [...allowedUsers, ...(client.config?.selfbot?.allowed_users || [])];
      
      const isOwner = message.author.id === client.user.id;
      const isAuthorized = isOwner || allAllowed.includes(message.author.id);

      if (!isAuthorized) {
        if (hasPrefix) {
          log(`[COMMAND BLOCKED] User ${message.author.tag} (${message.author.id}) is not authorized.`, "warn");
        }
        return;
      }

      let content = hasPrefix ? message.content.slice(prefix.length).trim() : message.content.trim();
      const args = parseArgs(content);
      if (args.length === 0) {
        if (hasPrefix) {
          log(`[COMMAND SKIPPED] Empty command body after prefix.`, "info");
        }
        return;
      }
      
      const commandName = args.shift().toLowerCase();
      const command = client.commands.get(commandName) || [...client.commands.values()].find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

      if (!command) {
        if (hasPrefix) {
          log(`[COMMAND NOT FOUND] Command "${commandName}" not found.`, "warn");
        }
        return;
      }

      if (command.ownerOnly && !isOwner) {
        log(`[COMMAND BLOCKED] Command "${command.name}" is owner-only, but was requested by allowed user ${message.author.tag}.`, "warn");
        return message.channel.send(`> ❌ **Error:** This command is restricted to the selfbot owner.`);
      }

      if (!client.cooldowns.has(command.name)) client.cooldowns.set(command.name, new Map());
      const now = Date.now();
      const timestamps = client.cooldowns.get(command.name);
      const cooldownAmount = (command.cooldown || 3) * 1000;

      if (timestamps.has(message.author.id)) {
        const expirationTime = timestamps.get(message.author.id) + cooldownAmount;
        if (now < expirationTime) return;
      }

      timestamps.set(message.author.id, now);
      setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

      try {
        const { canExecuteCommand } = await import("../utils/commandHandler.js");
        const { canExecute, reason } = canExecuteCommand(command, message, client);
        if (!canExecute) return message.channel.send(`> ❌ **Error:** ${reason}`);

        if (command.category === "nsfw") {
          const { loadConfig } = await import("../utils/functions.js");
          const config = loadConfig();
          if (!config.nsfw || config.nsfw.enabled === false) return message.channel.send("> ❌ **NSFW commands are disabled.**");
        }

        await command.execute(client, message, args);
      } catch (error) {
        log(`Error executing ${command.name}: ${error.message}`, "error");
      }
    });

    return loadedCount;
  } catch (error) {
    log(`Error loading commands: ${error.message}`, "error");
    return 0;
  }
}

function getCommandFiles(directory, files = []) {
  const items = fs.readdirSync(directory, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(directory, item.name);
    if (item.isDirectory()) getCommandFiles(fullPath, files);
    else if (item.name.endsWith(".js")) files.push(fullPath);
  }
  return files;
}
