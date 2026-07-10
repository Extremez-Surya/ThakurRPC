import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function isDiscordUrl(url) {
  if (!url || typeof url !== "string") return false;
  return url.includes("cdn.discordapp.com") || url.includes("media.discordapp.net");
}

export class RpcManager {
  constructor() {
    this.rpcConfig = null;
    this.lastUpdate = 0;
    this.updateQueue = [];
    this.rateLimitWindow = 20000;
    this.maxUpdates = 5;
    this.configPath = path.join(__dirname, "../rpc.yml");
    this.isInitialized = false;
    this.applicationAssets = new Map();
    this.assetCacheTimer = null;
    this.streamingRotationTimer = null;
    this.streamingRotationIndex = 0;
    this.streamingRotationSignature = null;
    this.lastPresencePayload = null;
  }
  startAssetCacheCleaner() {
    if (this.assetCacheTimer) return;

    this.assetCacheTimer = setInterval(
      () => {
        this.clearAssetCache();
      },
      60 * 60 * 1000,
    );
  }

  async initialize() {
    if (this.isInitialized) {
      return this.rpcConfig;
    }

    try {
      if (fs.existsSync(this.configPath)) {
        const fileContents = fs.readFileSync(this.configPath, "utf8");
        this.rpcConfig = yaml.load(fileContents);
        this.isInitialized = true;
        this.startAssetCacheCleaner();
        return this.rpcConfig;
      } else {
        this.rpcConfig = this.getDefaultConfig();
        await this.saveConfig(this.rpcConfig);
        this.isInitialized = true;
        this.startAssetCacheCleaner();
        return this.rpcConfig;
      }
    } catch (error) {
      this.rpcConfig = this.getDefaultConfig();
      this.isInitialized = true;
      this.startAssetCacheCleaner();
      return this.rpcConfig;
    }
  }

  async loadConfig() {
    return this.initialize();
  }

  updateConfig(newConfig) {
    this.rpcConfig = newConfig;
  }

  async saveConfig(config) {
    try {
      const yamlStr = yaml.dump(config, { indent: 2 });
      fs.writeFileSync(this.configPath, yamlStr, "utf8");
      this.rpcConfig = config;
      return true;
    } catch (error) {
      return false;
    }
  }

  canUpdate() {
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastUpdate;

    this.updateQueue = this.updateQueue.filter(
      (timestamp) => now - timestamp < this.rateLimitWindow,
    );

    return this.updateQueue.length < this.maxUpdates;
  }

  getCurrentConfig() {
    return this.rpcConfig;
  }

  async fetchAssetsViaAPI(applicationId) {
    try {
      const apiUrl = `https://discord.com/api/v9/oauth2/applications/${applicationId}/assets`;

      const fetch = await import("node-fetch");
      const response = await fetch.default(apiUrl, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const assets = await response.json();
      const assetMap = new Map();

      if (assets && Array.isArray(assets)) {
        assets.forEach((asset) => {
          if (asset.name && asset.id) {
            assetMap.set(asset.name.toLowerCase(), asset.id);
          }
        });
      }

      return assetMap;
    } catch (error) {
      return new Map();
    }
  }

  async fetchApplicationAssets(client, applicationId) {
    try {
      if (!applicationId) {
        throw new Error("Application ID is required to fetch assets");
      }

      const cacheKey = `${applicationId}_assets`;
      if (this.applicationAssets.has(cacheKey)) {
        return this.applicationAssets.get(cacheKey);
      }

      const apiAssets = await this.fetchAssetsViaAPI(applicationId);

      if (apiAssets.size > 0) {
        this.applicationAssets.set(cacheKey, apiAssets);
        return apiAssets;
      }

      return new Map();
    } catch (error) {
      return new Map();
    }
  }

  resolveAsset(assetInput, assetMap) {
    if (!assetInput) return null;

    if (/^\d+$/.test(assetInput)) {
      return assetInput;
    }

    if (assetInput.includes("cdn.discordapp.com") || assetInput.includes("media.discordapp.net")) {
      return assetInput;
    }

    if (
      assetInput.startsWith("http://") ||
      assetInput.startsWith("https://") ||
      assetInput.startsWith("mp:")
    ) {
      return assetInput;
    }

    const assetName = assetInput.toLowerCase();
    if (assetMap.has(assetName)) {
      const assetId = assetMap.get(assetName);
      return assetId;
    }

    return assetInput;
  }

  isAssetURL(assetInput) {
    if (!assetInput) return false;

    return (
      assetInput.startsWith("http://") ||
      assetInput.startsWith("https://") ||
      assetInput.startsWith("mp:") ||
      assetInput.includes("cdn.discordapp.com") ||
      /^\d+$/.test(assetInput)
    );
  }

  async updatePresence(client, customConfig = null, options = {}) {
    if (!this.canUpdate()) {
      return false;
    }


    try {
      const config = customConfig || this.rpcConfig;
      if (!config || !config.rpc || !config.rpc.enabled) {
        this.clearStreamingRotation();
        return false;
      }

      const rpcData = config.rpc.default || {};
      // Removed invalid reference to `entry` (it is not defined here)
      const applicationId = config.rpc.application_id || "1466796395112566876";
      const streamingStatuses = this.getStreamingStatuses(rpcData);

      const assetMap = await this.ensureAssetsFetched(client, applicationId);

      const { RichPresence } = await import("discord.js-selfbot-v13");

      const presenceEntries = [
        {
          type: rpcData.type || "PLAYING",
          name: rpcData.name || "Vexil Selfbot",
          details: rpcData.details || "",
          state: rpcData.state || "",
          url: rpcData.url || "",
          timestamps: rpcData.timestamps || null,
          party: rpcData.party || null,
          assets: rpcData.assets || null,
          buttons: rpcData.buttons || [],
        },
      ];

      this.clearStreamingRotation();

      const activities = await Promise.all(
        presenceEntries.filter(Boolean).map(async (entry) => {
          let externalAssets = [];

          if (entry.assets) {
            const urls = [];

            if (
              entry.assets.large_image &&
              entry.assets.large_image.startsWith("http") &&
              !isDiscordUrl(entry.assets.large_image)
            ) {
              urls.push(entry.assets.large_image);
            }

            if (
              entry.assets.small_image &&
              entry.assets.small_image.startsWith("http") &&
              !isDiscordUrl(entry.assets.small_image)
            ) {
              urls.push(entry.assets.small_image);
            }

            if (urls.length) {
              try {
                externalAssets = await RichPresence.getExternal(
                  client,
                  applicationId,
                  ...urls,
                );


              } catch (err) {
                console.error("[RPC] getExternal Error:", err);
              }
            }
          }

          const rpc = new RichPresence(client)
            .setApplicationId(applicationId)
            .setType(this.getActivityType(entry.type || "STREAMING"))
            .setName(entry.name || rpcData.name || "Vexil Selfbot")
            .setDetails(entry.details || "")
            .setState(entry.state || "");



          if ((entry.type || "STREAMING") === "STREAMING") {
            rpc.setURL(entry.url || "https://www.twitch.tv/directory");
          }

          if (entry.timestamps) {
            if (entry.timestamps.start) {
              rpc.setStartTimestamp(new Date(entry.timestamps.start));
            }
            if (entry.timestamps.end) {
              rpc.setEndTimestamp(new Date(entry.timestamps.end));
            }
          }

          if (entry.party && entry.party.current && entry.party.max) {
            rpc.setParty({
              id: entry.party.id || this.generateUUID(),
              current: entry.party.current,
              max: entry.party.max,
            });
          }

          if (entry.assets) {
            let index = 0;

            // Large Image
            if (entry.assets.large_image) {
              if (
                entry.assets.large_image.startsWith("http") &&
                !isDiscordUrl(entry.assets.large_image)
              ) {
                rpc.setAssetsLargeImage(
                  externalAssets[index++]?.external_asset_path ??
                    entry.assets.large_image,
                );
              } else {
                rpc.setAssetsLargeImage(
                  this.resolveAsset(entry.assets.large_image, assetMap),
                );
              }

              if (entry.assets.large_text) {
                rpc.setAssetsLargeText(entry.assets.large_text);
              }
            }

            // Small Image
            if (entry.assets.small_image) {
              if (
                entry.assets.small_image.startsWith("http") &&
                !isDiscordUrl(entry.assets.small_image)
              ) {
                rpc.setAssetsSmallImage(
                  externalAssets[index++]?.external_asset_path ??
                    entry.assets.small_image,
                );
              } else {
                rpc.setAssetsSmallImage(
                  this.resolveAsset(entry.assets.small_image, assetMap),
                );
              }

              if (entry.assets.small_text) {
                rpc.setAssetsSmallText(entry.assets.small_text);
              }
            }
          }

          if (Array.isArray(entry.buttons) && entry.buttons.length > 0) {
            entry.buttons.slice(0, 2).forEach((btn) => {
              rpc.addButton(btn.label, btn.url);
            });
          }

          return rpc;
        }),
      );

      await client.user.setPresence({
        activities,
        status: client.config.selfbot.status || "dnd",
        afk: false,
      });

      this.lastUpdate = Date.now();
      this.updateQueue.push(this.lastUpdate);

      this.lastPresencePayload = {
        config,
        applicationId,
      };

      return true;
    } catch (error) {
      return false;
    }
  }

  getActivityType(type) {
    const types = {
      PLAYING: 0,
      STREAMING: 1,
      LISTENING: 2,
      WATCHING: 3,
      COMPETING: 5,
    };
    return types[type] || 0;
  }

  generateUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      },
    );
  }

  // processImageAsset(imageInput) {

  //   if (/^\d+$/.test(imageInput)) {
  //     return imageInput;
  //   }

  //   if (imageInput.includes("cdn.discordapp.com")) {
  //     try {
  //       const parsed = new URL(imageInput);
  //       parsed.search = "";
  //       parsed.hash = "";
  //       return parsed.toString();
  //     } catch {
  //       const pathMatch = imageInput.match(/cdn\.discordapp\.com\/[^?#]+/);
  //       if (pathMatch) {
  //         return `https://${pathMatch[0]}`;
  //       }
  //     }
  //   }

  //   if (imageInput.startsWith("http://") || imageInput.startsWith("https://")) {
  //     return imageInput;
  //   }

  //   if (imageInput.startsWith("mp:")) {
  //     return imageInput;
  //   }

  //   return imageInput;
  // }

  clearAssetCache() {
    this.applicationAssets.clear();
  }

  clearStreamingRotation() {
    if (this.streamingRotationTimer) {
      clearInterval(this.streamingRotationTimer);
      this.streamingRotationTimer = null;
    }

    this.streamingRotationIndex = 0;
    this.streamingRotationSignature = null;
    this.lastPresencePayload = null;
  }

  getStreamingStatuses(rpcData) {
    if (!rpcData || !Array.isArray(rpcData.streaming_statuses)) {
      return [];
    }

    return rpcData.streaming_statuses
      .map((status, index) =>
        this.normalizeStreamingStatus(rpcData, status, index),
      )
      .filter(Boolean);
  }

  normalizeStreamingStatus(rpcData, status, index) {
    if (!status) {
      return null;
    }

    if (typeof status === "string") {
      return {
        type: "STREAMING",
        name: status.trim() || rpcData.name || `Streaming ${index + 1}`,
        details: rpcData.details || "",
        state: rpcData.state || "",
        url: rpcData.url || "https://www.twitch.tv/directory",
        timestamps: rpcData.timestamps || null,
        party: rpcData.party || null,
        assets: rpcData.assets || null,
        buttons: rpcData.buttons || [],
      };
    }

    if (typeof status !== "object") {
      return null;
    }

    return {
      type:
        typeof status.type === "string" && status.type.trim()
          ? status.type.trim().toUpperCase()
          : "STREAMING",
      name: status.name || rpcData.name || `Streaming ${index + 1}`,
      details: status.details ?? rpcData.details ?? "",
      state: status.state ?? rpcData.state ?? "",
      url: status.url ?? rpcData.url ?? "https://www.twitch.tv/directory",
      timestamps: status.timestamps || rpcData.timestamps || null,
      party: status.party || rpcData.party || null,
      assets: status.assets || rpcData.assets || null,
      buttons: Array.isArray(status.buttons)
        ? status.buttons
        : rpcData.buttons || [],
    };
  }

  getRotationInterval(rpcData, config = null) {
    const configured = Number(
      rpcData?.rotation_interval_ms ??
        config?.rpc?.rotation_interval_ms ??
        30000,
    );

    if (Number.isFinite(configured) && configured >= 30000) {
      return configured;
    }

    return 30000;
  }

  rotateEntries(entries, rotationIndex = 0) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return [];
    }

    const safeIndex = rotationIndex % entries.length;
    return entries.slice(safeIndex).concat(entries.slice(0, safeIndex));
  }

  ensureStreamingRotation(client, config) {
    this.clearStreamingRotation();
  }

  async forceReload() {
    try {
      this.clearStreamingRotation();
      this.clearAssetCache();
      this.isInitialized = false;
      const config = await this.initialize();
      return config;
    } catch (error) {
      return this.rpcConfig;
    }
  }

  async ensureAssetsFetched(client, applicationId) {
    try {
      const cacheKey = `${applicationId}_assets`;

      if (this.applicationAssets.has(cacheKey)) {
        return this.applicationAssets.get(cacheKey);
      }

      return await this.fetchApplicationAssets(client, applicationId);
    } catch (error) {
      return new Map();
    }
  }

  getDefaultConfig() {
    return {
      rpc: {
        enabled: true,
        application_id: "1466796395112566876",
        rotation_interval_ms: 30000,
        default: {
          type: "PLAYING",
          name: "Vexil Selfbot",
          details: "Summoning Silence",
          state: "github.com/faiz4sure",
          url: "",
          streaming_statuses: [
            {
              name: "Vexil Selfbot",
              details: "𝓘 𝓐𝓭𝓸𝓻𝓮 𝔂𝓸𝓾 𝒏𝒊𝒏𝒊 💝",
              state: "discord.gg/adoreme",
              url: "https://www.twitch.tv/thakur",
            },
            {
              name: "Vexil Selfbot",
              type: "COMPETING",
              details: "out of my league",
              state: "I adore you nini 💝",
              url: "https://www.twitch.tv/thakur",
            },
            {
              name: "Vexil Selfbot",
              details: "Watching the leaderboard",
              state: "You are my world",
              url: "https://www.twitch.tv/thakur",
            },
          ],
          party: {
            current: 1,
            max: 1,
            id: "",
          },
          timestamps: {
            start: null,
            end: null,
          },
          assets: {
            large_image: "vexil",
            large_text: "Vexil Selfbot",
            small_image: "thunder",
            small_text: "github.com/faiz4sure",
          },
          buttons: [
            {
              label: "GitHub",
              url: "https://github.com/faiz4sure/Vexil",
            },
            {
              label: "Support",
              url: "https://discord.gg/b3hZG4R7Mf",
            },
          ],
        },
      },
    };
  }
}

// Export singleton instance
export default new RpcManager();
