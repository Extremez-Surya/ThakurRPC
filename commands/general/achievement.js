import { log } from "../../utils/functions.js";
import axios from "axios";
import fs from "fs";

let achievementIconsCache = null;

const FALLBACK_ACHIEVEMENT_ICONS = {
  1: "Grass block",
  2: "Diamond",
  3: "Diamond sword",
  4: "Creeper",
  5: "Pig",
  6: "TNT",
  7: "Cookie",
  8: "Heart",
  9: "Bed",
  10: "Cake",
  11: "Sign",
  12: "Rail",
  13: "Crafting bench",
  14: "Redstone",
  15: "Fire",
  16: "Cobweb",
  17: "Chest",
  18: "Furnace",
  19: "Book",
  20: "Stone block",
  21: "Wooden plank block",
  22: "Iron ingot",
  23: "Gold ingot",
  24: "Wooden door",
  25: "Iron Door",
  26: "Diamond chestplate",
  27: "Flint and steel",
  28: "Glass bottle",
  29: "Splash potion",
  30: "Creeper spawnegg",
  31: "Coal",
  32: "Iron sword",
  33: "Bow",
  34: "Arrow",
  35: "Iron chestplate",
  36: "Bucket",
  37: "Bucket with water",
  38: "Bucket with lava",
  39: "Bucket with milk",
  40: "Diamond boots",
  41: "Wooden hoe",
  42: "Bread",
  43: "Wooden sword",
  44: "Bone",
  45: "Oak log",
};

export default {
  name: "achievement",
  description: "Create a custom Minecraft achievement image.",
  aliases: ["mcachievement"],
  usage: "<icon> <text>",
  category: "general",
  type: "both",
  permissions: ["SendMessages", "AttachFiles"], // Added AttachFiles permission
  cooldown: 60,

  execute: async (client, message, args) => {
    if (!args.length) {
      return message.channel.send(
        "> ❌ Please provide text for the achievement.\nUsage: `achievement <icon> <text>`",
      );
    }

    const givenIcon = args.length > 1 ? args[0] : null;
    const text = args.length > 1 ? args.slice(1).join(" ") : args.join(" ");

    if (!text) {
      return message.channel.send(
        "> ❌ Please provide text for the achievement.\nUsage: `achievement <icon> <text>`",
      );
    }

    try {
      const icons = await loadAchievementIcons();
      const iconId = resolveAchievementIconId(givenIcon, icons) || "1";

      const achievementUrl = `https://api.alexflipnote.dev/achievement?text=${encodeURIComponent(text)}&icon=${iconId}`;
      const achievementResponse = await axios.get(achievementUrl, {
        responseType: "arraybuffer",
      }); // Using axios with responseType
      if (achievementResponse.status !== 200)
        throw new Error("Failed to generate achievement.");

      const buffer = Buffer.from(achievementResponse.data); // Convert response to buffer
      const filePath = "./achievement.png";
      fs.writeFileSync(filePath, buffer);

      await message.channel.send({ files: [filePath] });
      fs.unlinkSync(filePath); // Clean up after sending
    } catch (error) {
      log(`Error generating achievement: ${error.message}`, "error");
      message.channel.send(
        `> ❌ Failed to generate achievement: ${error.message}`,
      ); // Improved error message
    }
  },
};

async function loadAchievementIcons() {
  if (achievementIconsCache) {
    return achievementIconsCache;
  }

  try {
    const response = await axios.get(
      "https://api.alexflipnote.dev/achievement",
    );
    if (response.status === 200 && response.data?.icons) {
      achievementIconsCache = response.data.icons;
      return achievementIconsCache;
    }
  } catch {
    // Fall back to the bundled icon list below.
  }

  achievementIconsCache = FALLBACK_ACHIEVEMENT_ICONS;
  return achievementIconsCache;
}

function resolveAchievementIconId(givenIcon, icons) {
  if (!givenIcon) {
    return null;
  }

  const raw = String(givenIcon).trim();
  if (!raw) {
    return null;
  }

  if (/^\d+$/.test(raw) && icons[raw]) {
    return raw;
  }

  const normalized = normalizeIconName(raw);

  for (const [id, name] of Object.entries(icons)) {
    if (normalizeIconName(name) === normalized) {
      return id;
    }
  }

  const aliasMap = {
    crown: "23",
    gold: "23",
    trophy: "10",
    cake: "10",
    heart: "8",
    love: "8",
    laugh: "7",
    lol: "7",
    cookie: "7",
    pig: "5",
    creeper: "4",
    diamond: "2",
    sword: "3",
    bed: "9",
    fire: "15",
    chest: "17",
    book: "19",
    coal: "31",
    bread: "42",
    log: "45",
  };

  return aliasMap[normalized] || null;
}

function normalizeIconName(value) {
  return String(value)
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/[^a-z0-9]+/g, "");
}
