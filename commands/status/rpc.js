export default {
  name: "rpc",
  description:
    "Manages the bot's Rich Presence with comprehensive customization",
  aliases: ["richpresence", "presence"],
  usage:
    "<enable|disable|setType|setURL|setState|setName|setDetails|setParty|setStartTimestamp|setEndTimestamp|setLargeImage|setLargeText|setSmallImage|setSmallText|addButton|clearButtons|view|reset>",
  category: "status",
  type: "both",
  permissions: ["SendMessages"],
  cooldown: 3,
  async execute(client, message, args) {
    try {
      if (!client.rpcManager) {
        return message.channel.send(
          "> ❌ **Error:** RPC system not initialized. Please restart the bot.",
        );
      }
      const subcommand = args[0] ? args[0].toLowerCase() : null;
      if (!subcommand) {
        return this.showHelp(message, client);
      }
      switch (subcommand) {
        case "enable":
          return await this.enableRPC(client, message);
        case "disable":
          return await this.disableRPC(client, message);
        case "settype":
          return await this.setType(client, message, args.slice(1));
        case "seturl":
          return await this.setURL(client, message, args.slice(1));
        case "setstate":
          return await this.setState(client, message, args.slice(1));
        case "setname":
          return await this.setName(client, message, args.slice(1));
        case "setdetails":
          return await this.setDetails(client, message, args.slice(1));
        case "setparty":
          return await this.setParty(client, message, args.slice(1));
        case "setstarttimestamp":
          return await this.setStartTimestamp(client, message, args.slice(1));
        case "setendtimestamp":
          return await this.setEndTimestamp(client, message, args.slice(1));
        case "setlargeimage":
          return await this.setLargeImage(client, message, args.slice(1));
        case "setlargetext":
          return await this.setLargeText(client, message, args.slice(1));
        case "setsmallimage":
          return await this.setSmallImage(client, message, args.slice(1));
        case "setsmalltext":
          return await this.setSmallText(client, message, args.slice(1));
        case "addbutton":
          return await this.addButton(client, message, args.slice(1));
        case "clearbuttons":
          return await this.clearButtons(client, message);
        case "view":
          return await this.viewConfig(client, message);
        case "reset":
          return await this.resetConfig(client, message);
        default:
          return message.channel.send(
            `> ❌ **Unknown subcommand:** \`${subcommand}\`\n${this.getUsage()}`,
          );
      }
    } catch (error) {
      return message.channel.send(`> ❌ **Error:** ${error.message}`);
    }
  },
  showHelp(message, client) {
    const helpText = `> **⚡ Rich Presence Commands**>> **Usage:** \`${client.prefix}rpc <subcommand> [args]\`>> **Available Commands:**> • \`enable\` - Enable Rich Presence> • \`disable\` - Disable Rich Presence> • \`setType <type>\` - Set activity type (PLAYING, STREAMING, LISTENING, WATCHING, COMPETING)> • \`setURL <url>\` - Set streaming URL (only for STREAMING type)> • \`setState <state>\` - Set activity state text> • \`setName <name>\` - Set activity name> • \`setDetails <details>\` - Set activity details> • \`setParty <current> <max>\` - Set party size (e.g., \`1 5\`)> • \`setStartTimestamp <timestamp>\` - Set start time (ms or date)> • \`setEndTimestamp <timestamp>\` - Set end time (ms or date)> • \`setLargeImage <image>\` - Set large image asset> • \`setLargeText <text>\` - Set large image hover text> • \`setSmallImage <image>\` - Set small image asset> • \`setSmallText <text>\` - Set small image hover text> • \`addButton <label> <url>\` - Add a button (max 2)> • \`clearButtons\` - Clear all buttons> • \`view\` - View current configuration> • \`reset\` - Reset to default configuration>`;
    return message.channel.send(helpText);
  },
  getUsage() {
    return `Usage: \`+rpc <enable|disable|setType|setURL|setState|setName|setDetails|setParty|setStartTimestamp|setEndTimestamp|setLargeImage|setLargeText|setSmallImage|setSmallText|addButton|clearButtons|view|reset>\``;
  },
  async enableRPC(client, message) {
    const config =
      client.rpcManager.getCurrentConfig() || this.getDefaultConfig();
    config.rpc.enabled = true;
    client.rpcManager.updateConfig(config);
    const success = await client.rpcManager.updatePresence(client);
    return message.channel.send(
      success
        ? "> ✅ **Rich Presence enabled successfully!**"
        : "> ⚠️ **Rich Presence enabled but failed to update.**",
    );
  },
  async disableRPC(client, message) {
    const config =
      client.rpcManager.getCurrentConfig() || this.getDefaultConfig();
    config.rpc.enabled = false;
    client.rpcManager.updateConfig(config);
    if (client.rpcManager.clearStreamingRotation) {
      client.rpcManager.clearStreamingRotation();
    }
    await client.user.setActivity(null);
    return message.channel.send(
      "> ✅ **Rich Presence disabled successfully!**",
    );
  },
  async setType(client, message, args) {
    if (!args[0])
      return message.channel.send(
        "> ❌ **Please specify an activity type.**\nValid types: `PLAYING`, `STREAMING`, `LISTENING`, `WATCHING`, `COMPETING`",
      );
    const validTypes = [
      "PLAYING",
      "STREAMING",
      "LISTENING",
      "WATCHING",
      "COMPETING",
    ];
    const type = args[0].toUpperCase();
    if (!validTypes.includes(type))
      return message.channel.send(
        `> ❌ **Invalid type.**\nValid types: ${validTypes.join(", ")}`,
      );
    const config =
      client.rpcManager.getCurrentConfig() || this.getDefaultConfig();
    config.rpc.default.type = type;
    if (type === "STREAMING" && !config.rpc.default.url)
      config.rpc.default.url = "https://www.twitch.tv/directory";
    client.rpcManager.updateConfig(config);
    const success = await client.rpcManager.updatePresence(client);
    return message.channel.send(
      success
        ? `> ✅ **Activity type set to \`${type}\`**`
        : "> ❌ **Failed to update configuration.**",
    );
  },
  async setURL(client, message, args) {
    if (!args[0]) return message.channel.send("> ❌ **Please specify a URL.**");
    const url = args.join(" ");
    if (!url.startsWith("http://") && !url.startsWith("https://"))
      return message.channel.send(
        "> ❌ **Invalid URL format.** Must start with http:// or https://",
      );
    const config =
      client.rpcManager.getCurrentConfig() || this.getDefaultConfig();
    if (config.rpc.default.type !== "STREAMING")
      return message.channel.send(
        "> ⚠️ **Warning:** URL will only work when activity type is set to `STREAMING`.",
      );
    config.rpc.default.url = url;
    client.rpcManager.updateConfig(config);
    const success = await client.rpcManager.updatePresence(client);
    return message.channel.send(
      success
        ? `> ✅ **Streaming URL set to \`${url}\`**`
        : "> ❌ **Failed to update configuration.**",
    );
  },
  async setState(client, message, args) {
    if (!args[0])
      return message.channel.send("> ❌ **Please specify a state text.**");
    const state = args.join(" ");
    if (state.length > 128)
      return message.channel.send(
        "> ❌ **State text too long.** Maximum 128 characters.",
      );
    const config =
      client.rpcManager.getCurrentConfig() || this.getDefaultConfig();
    config.rpc.default.state = state;
    client.rpcManager.updateConfig(config);
    const success = await client.rpcManager.updatePresence(client);
    return message.channel.send(
      success
        ? `> ✅ **State set to: \`${state}\`**`
        : "> ❌ **Failed to update configuration.**",
    );
  },
  async setName(client, message, args) {
    if (!args[0])
      return message.channel.send("> ❌ **Please specify an activity name.**");
    const name = args.join(" ");
    if (name.length > 128)
      return message.channel.send(
        "> ❌ **Name too long.** Maximum 128 characters.",
      );
    const config =
      client.rpcManager.getCurrentConfig() || this.getDefaultConfig();
    config.rpc.default.name = name;
    client.rpcManager.updateConfig(config);
    const success = await client.rpcManager.updatePresence(client);
    return message.channel.send(
      success
        ? `> ✅ **Activity name set to: \`${name}\`**`
        : "> ❌ **Failed to update configuration.**",
    );
  },
  async setDetails(client, message, args) {
    if (!args[0])
      return message.channel.send("> ❌ **Please specify details text.**");
    const details = args.join(" ");
    if (details.length > 128)
      return message.channel.send(
        "> ❌ **Details too long.** Maximum 128 characters.",
      );
    const config =
      client.rpcManager.getCurrentConfig() || this.getDefaultConfig();
    config.rpc.default.details = details;
    client.rpcManager.updateConfig(config);
    const success = await client.rpcManager.updatePresence(client);
    return message.channel.send(
      success
        ? `> ✅ **Details set to: \`${details}\`**`
        : "> ❌ **Failed to update configuration.**",
    );
  },
  async setParty(client, message, args) {
    if (args.length < 2)
      return message.channel.send(
        "> ❌ **Usage:** `+rpc setParty <current> <max>`\nExample: `+rpc setParty 1 9`",
      );
    const current = parseInt(args[0], 10);
    const max = parseInt(args[1], 10);
    if (
      Number.isNaN(current) ||
      Number.isNaN(max) ||
      current < 1 ||
      max < 1 ||
      current > max
    ) {
      return message.channel.send("> ❌ **Invalid party values.**");
    }
    const config =
      client.rpcManager.getCurrentConfig() || this.getDefaultConfig();
    config.rpc.default.party = {
      current,
      max,
      id: client.rpcManager.generateUUID(),
    };
    client.rpcManager.updateConfig(config);
    const success = await client.rpcManager.updatePresence(client);
    return message.channel.send(
      success
        ? `> ✅ **Party set to ${current}/${max}**`
        : "> ❌ **Failed to update configuration.**",
    );
  },
  async setStartTimestamp(client, message, args) {
    if (!args[0])
      return message.channel.send(
        "> ❌ **Please specify a timestamp.**\nExamples:\n• Unix timestamp: `1640995200000`\n• Relative time: `+1h` (1 hour from now)\n• `now` for current time",
      );
    const timestamp = this.parseTimestamp(args.join(" "));
    if (timestamp === null)
      return message.channel.send(
        "> ❌ **Invalid timestamp format.**\nUse Unix timestamp (ms), relative time (+1h, +30m), or 'now'",
      );
    const config =
      client.rpcManager.getCurrentConfig() || this.getDefaultConfig();
    config.rpc.default.timestamps = config.rpc.default.timestamps || {};
    config.rpc.default.timestamps.start = timestamp;
    client.rpcManager.updateConfig(config);
    const success = await client.rpcManager.updatePresence(client);
    return message.channel.send(
      success
        ? `> ✅ **Start timestamp set to: ${new Date(timestamp).toLocaleString()}**`
        : "> ❌ **Failed to update configuration.**",
    );
  },
  async setEndTimestamp(client, message, args) {
    if (!args[0])
      return message.channel.send(
        "> ❌ **Please specify a timestamp.**\nExamples:\n• Unix timestamp: `1640995200000`\n• Relative time: `+1h` (1 hour from now)\n• Duration: `30m` (30 minutes from start)",
      );
    const timestamp = this.parseTimestamp(args.join(" "));
    if (timestamp === null)
      return message.channel.send(
        "> ❌ **Invalid timestamp format.**\nUse Unix timestamp (ms), relative time (+1h, +30m), or duration (30m)",
      );
    const config =
      client.rpcManager.getCurrentConfig() || this.getDefaultConfig();
    config.rpc.default.timestamps = config.rpc.default.timestamps || {};
    config.rpc.default.timestamps.end = timestamp;
    client.rpcManager.updateConfig(config);
    const success = await client.rpcManager.updatePresence(client);
    return message.channel.send(
      success
        ? `> ✅ **End timestamp set to: ${new Date(timestamp).toLocaleString()}**`
        : "> ❌ **Failed to update configuration.**",
    );
  },
  async viewConfig(client, message) {
    const config =
      (await client.rpcManager.loadConfig()) || this.getDefaultConfig();
    const defaultConfig = config.rpc.default || {};
    let viewText = `> **📊 Current RPC Configuration**\n>\n> **Status:** ${config.rpc.enabled ? "✅ Enabled" : "❌ Disabled"}\n>\n> **Activity Settings:**`;
    if (defaultConfig.type)
      viewText += `\n> • **Type:** \`${defaultConfig.type}\``;
    if (defaultConfig.name)
      viewText += `\n> • **Name:** \`${defaultConfig.name}\``;
    if (defaultConfig.details)
      viewText += `\n> • **Details:** \`${defaultConfig.details}\``;
    if (defaultConfig.state)
      viewText += `\n> • **State:** \`${defaultConfig.state}\``;
    if (defaultConfig.url)
      viewText += `\n> • **URL:** \`${defaultConfig.url}\``;
    if (config.rpc.rotation_interval_ms)
      viewText += `\n> • **Rotation Interval:** ${config.rpc.rotation_interval_ms}ms`;
    if (
      Array.isArray(defaultConfig.streaming_statuses) &&
      defaultConfig.streaming_statuses.length > 0
    ) {
      viewText += `\n>\n> **Streaming Cards:**`;
      defaultConfig.streaming_statuses.forEach((status, index) => {
        const type = status.type ? ` • ${status.type}` : "";
        const details = status.details ? ` • ${status.details}` : "";
        const state = status.state ? ` • ${status.state}` : "";
        viewText += `\n> ${index + 1}. **${status.name || `Streaming ${index + 1}`}**${type}${details}${state}`;
      });
    }
    if (
      defaultConfig.party &&
      defaultConfig.party.current &&
      defaultConfig.party.max
    )
      viewText += `\n> • **Party:** ${defaultConfig.party.current}/${defaultConfig.party.max}`;
    if (defaultConfig.timestamps?.start)
      viewText += `\n> • **Start:** ${new Date(defaultConfig.timestamps.start).toLocaleString()}`;
    if (defaultConfig.timestamps?.end)
      viewText += `\n> • **End:** ${new Date(defaultConfig.timestamps.end).toLocaleString()}`;
    if (defaultConfig.assets) {
      viewText += `\n>\n> **Assets:**`;
      if (defaultConfig.assets.large_image)
        viewText += `\n> • **Large Image:** \`${defaultConfig.assets.large_image}\``;
      if (defaultConfig.assets.large_text)
        viewText += `\n> • **Large Text:** \`${defaultConfig.assets.large_text}\``;
      if (defaultConfig.assets.small_image)
        viewText += `\n> • **Small Image:** \`${defaultConfig.assets.small_image}\``;
      if (defaultConfig.assets.small_text)
        viewText += `\n> • **Small Text:** \`${defaultConfig.assets.small_text}\``;
    }
    if (defaultConfig.buttons && defaultConfig.buttons.length > 0) {
      viewText += `\n>\n> **Buttons:**`;
      defaultConfig.buttons.forEach((btn, index) => {
        viewText += `\n> ${index + 1}. **${btn.label}** → ${btn.url}`;
      });
    } else {
      viewText += `\n>\n> **Buttons:** None`;
    }
    return message.channel.send(viewText);
  },
  async resetConfig(client, message) {
    try {
      await client.rpcManager.forceReload();
      const freshConfig = await client.rpcManager.loadConfig();
      const applicationId =
        freshConfig.rpc.application_id || "1466796395112566876";
      await client.rpcManager.ensureAssetsFetched(client, applicationId);
      client.rpcManager.updateConfig(freshConfig);
      const success = await client.rpcManager.updatePresence(client);
      return message.channel.send(
        success
          ? "> ✅ **RPC configuration reset to file defaults!**"
          : "> ❌ **Failed to reset configuration during presence update.**",
      );
    } catch (error) {
      return message.channel.send(
        `> ❌ **Error during reset:** ${error.message}`,
      );
    }
  },
  async setLargeImage(client, message, args) {
    if (!args[0])
      return message.channel.send(
        "> ❌ **Please specify a large image asset name, ID or URL.**",
      );
    const image = args.join(" ");
    try {
      const config =
        client.rpcManager.getCurrentConfig() || this.getDefaultConfig();
      const applicationId = config.rpc.application_id || "1466796395112566876";
      await client.rpcManager.ensureAssetsFetched(client, applicationId);
      config.rpc.default.assets = config.rpc.default.assets || {};
      config.rpc.default.assets.large_image = image;
      client.rpcManager.updateConfig(config);
      const success = await client.rpcManager.updatePresence(client);
      return message.channel.send(
        success
          ? `> ✅ **Large image set to: \`${image}\`**`
          : "> ❌ **Failed to update configuration.**",
      );
    } catch (error) {
      return message.channel.send(`> ❌ **Error:** ${error.message}`);
    }
  },
  async setLargeText(client, message, args) {
    if (!args[0])
      return message.channel.send(
        "> ❌ **Please specify hover text for the large image.**",
      );
    const text = args.join(" ");
    if (text.length > 128)
      return message.channel.send(
        "> ❌ **Text too long.** Maximum 128 characters.",
      );
    const config =
      client.rpcManager.getCurrentConfig() || this.getDefaultConfig();
    config.rpc.default.assets = config.rpc.default.assets || {};
    config.rpc.default.assets.large_text = text;
    client.rpcManager.updateConfig(config);
    const success = await client.rpcManager.updatePresence(client);
    return message.channel.send(
      success
        ? `> ✅ **Large image hover text set to: \`${text}\`**`
        : "> ❌ **Failed to update configuration.**",
    );
  },
  async setSmallImage(client, message, args) {
    if (!args[0])
      return message.channel.send(
        "> ❌ **Please specify a small image asset name, ID or URL.**",
      );
    const image = args.join(" ");
    try {
      const config =
        client.rpcManager.getCurrentConfig() || this.getDefaultConfig();
      const applicationId = config.rpc.application_id || "1466796395112566876";
      await client.rpcManager.ensureAssetsFetched(client, applicationId);
      config.rpc.default.assets = config.rpc.default.assets || {};
      config.rpc.default.assets.small_image = image;
      client.rpcManager.updateConfig(config);
      const success = await client.rpcManager.updatePresence(client);
      return message.channel.send(
        success
          ? `> ✅ **Small image set to: \`${image}\`**`
          : "> ❌ **Failed to update configuration.**",
      );
    } catch (error) {
      return message.channel.send(`> ❌ **Error:** ${error.message}`);
    }
  },
  async setSmallText(client, message, args) {
    if (!args[0])
      return message.channel.send(
        "> ❌ **Please specify hover text for the small image.**",
      );
    const text = args.join(" ");
    if (text.length > 128)
      return message.channel.send(
        "> ❌ **Text too long.** Maximum 128 characters.",
      );
    const config =
      client.rpcManager.getCurrentConfig() || this.getDefaultConfig();
    config.rpc.default.assets = config.rpc.default.assets || {};
    config.rpc.default.assets.small_text = text;
    client.rpcManager.updateConfig(config);
    const success = await client.rpcManager.updatePresence(client);
    return message.channel.send(
      success
        ? `> ✅ **Small image hover text set to: \`${text}\`**`
        : "> ❌ **Failed to update configuration.**",
    );
  },
  async addButton(client, message, args) {
    if (args.length < 2)
      return message.channel.send(
        "> ❌ **Usage:** `+rpc addButton <label> <url>`",
      );
    let urlIndex = -1;
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith("http://") || args[i].startsWith("https://")) {
        urlIndex = i;
        break;
      }
    }
    if (urlIndex <= 0)
      return message.channel.send(
        "> ❌ **Please provide a button label before the URL.**",
      );
    const label = args.slice(0, urlIndex).join(" ");
    const url = args.slice(urlIndex).join(" ");
    if (label.length > 32)
      return message.channel.send(
        "> ❌ **Button label too long.** Maximum 32 characters.",
      );
    if (!url.startsWith("http://") && !url.startsWith("https://"))
      return message.channel.send(
        "> ❌ **Invalid URL format.** Must start with http:// or https://",
      );
    const config =
      client.rpcManager.getCurrentConfig() || this.getDefaultConfig();
    config.rpc.default.buttons = config.rpc.default.buttons || [];
    if (config.rpc.default.buttons.length >= 2)
      return message.channel.send(
        "> ⚠️ **Maximum 2 buttons allowed.** Use `+rpc clearButtons` first.",
      );
    config.rpc.default.buttons.push({ label, url });
    client.rpcManager.updateConfig(config);
    const success = await client.rpcManager.updatePresence(client);
    return message.channel.send(
      success
        ? `> ✅ **Button added: \`${label}\` → \`${url}\`**`
        : "> ❌ **Failed to update configuration.**",
    );
  },
  async clearButtons(client, message) {
    const config =
      client.rpcManager.getCurrentConfig() || this.getDefaultConfig();
    config.rpc.default.buttons = [];
    client.rpcManager.updateConfig(config);
    const success = await client.rpcManager.updatePresence(client);
    return message.channel.send(
      success
        ? "> ✅ **All buttons cleared!**"
        : "> ❌ **Failed to update configuration.**",
    );
  },
  getDefaultConfig() {
    return {
      rpc: {
        enabled: true,
        application_id: "1466796395112566876",
        rotation_interval_ms: 30000,
        default: {
          type: "STREAMING",
          name: "Vexil Selfbot",
          details: "𝐓𝐡𝐚𝐤𝐮𝐫𝐎𝐧𝐓𝐨𝐩 💝",
          state: "discord.gg/adoreme",
          url: "https://www.twitch.tv/thakur",
          streaming_statuses: [
            {
              name: "",
              details: "𝐓𝐡𝐚𝐤𝐮𝐫𝐎𝐧𝐓𝐨𝐩 💝",
              state: "discord.gg/adoreme",
              url: "https://www.twitch.tv/thakur",
            },
          ],
          party: { current: 1, max: 1, id: "" },
          timestamps: { start: null, end: null },
          assets: {
            large_image: "",
            large_text: "",
            small_image: "",
            small_text: "",
          },
          buttons: [
            { label: "GitHub", url: "https://github.com/faiz4sure/Vexil" },
            { label: "Support", url: "https://discord.gg/b3hZG4R7Mf" },
          ],
          platform: "desktop",
        },
        rate_limits: { max_updates: 5, time_window: 20 },
        external_assets: {
          enabled: true,
          cache_duration: 3600,
          max_file_size: 5242880,
        },
        debug: { enabled: false, log_updates: false, log_assets: false },
      },
    };
  },
  parseTimestamp(input) {
    if (input.toLowerCase() === "now") return Date.now();
    const relativeMatch = input.match(/^\+(\d+)([hms])$/i);
    if (relativeMatch) {
      const [, amount, unit] = relativeMatch;
      const multiplier = { h: 60 * 60 * 1000, m: 60 * 1000, s: 1000 }[
        unit.toLowerCase()
      ];
      return Date.now() + parseInt(amount, 10) * multiplier;
    }
    const durationMatch = input.match(/^(\d+)([hms])$/i);
    if (durationMatch) {
      const [, amount, unit] = durationMatch;
      const multiplier = { h: 60 * 60 * 1000, m: 60 * 1000, s: 1000 }[
        unit.toLowerCase()
      ];
      return Date.now() + parseInt(amount, 10) * multiplier;
    }
    const timestamp = parseInt(input, 10);
    if (!Number.isNaN(timestamp) && timestamp > 0) return timestamp;
    return null;
  },
};
