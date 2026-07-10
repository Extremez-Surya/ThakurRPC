import axios from "axios";

export default {
  name: "latestcrypto",
  aliases: ["price", "cryptoprice", "cryptoinfo", "crypto"],
  description: "Get latest cryptocurrency price info",
  usage: "latestcrypto <currency>",
  category: "general",
  type: "both",
  permissions: ["SendMessages"],
  cooldown: 5,

  async execute(client, message, args) {
    const currency = args[0]?.trim();

    if (!currency) {
      return message.channel.send(
        "❌ Please provide a cryptocurrency name!\n" +
          `**Usage:** \`${client.prefix}price <currency>\`\n` +
          "**Examples:**\n" +
          `• \`${client.prefix}price bitcoin\`\n` +
          `• \`${client.prefix}price ethereum\`\n` +
          `• \`${client.prefix}price litecoin\`\n` +
          `• \`${client.prefix}price solana\``
      );
    }

    const statusMsg = await message.channel.send(
      `🔍 **Fetching ${currency} data...**`
    );

    try {
      const coinId = await resolveCoinGeckoId(currency);

      if (!coinId) {
        await statusMsg.edit(
          `❌ **Failed to fetch crypto data!**\n**Reason:** Cryptocurrency not found. Please check the spelling.\n\n**Popular cryptocurrencies:**\n• bitcoin, ethereum, litecoin, solana\n• cardano, polkadot, chainlink, dogecoin\n• binancecoin, ripple, avalanche-2`
        );
        return;
      }

      const response = await axios.get(
        `https://api.coingecko.com/api/v3/coins/${coinId}`,
        {
          timeout: 10000,
        }
      );

      if (response.status === 200) {
        const data = response.data;

        // Format the price change with appropriate emoji
        const priceChange = data.market_data.price_change_percentage_24h;
        const changeEmoji = priceChange >= 0 ? "📈" : "📉";
        const changeColor = priceChange >= 0 ? "+" : "";

        const info = {
          Name: data.name,
          Symbol: data.symbol.toUpperCase(),
          "Current Price": `$${data.market_data.current_price.usd.toLocaleString(
            "en-US",
            { minimumFractionDigits: 2, maximumFractionDigits: 8 }
          )}`,
          "24h High": `$${data.market_data.high_24h.usd.toLocaleString(
            "en-US",
            { minimumFractionDigits: 2, maximumFractionDigits: 8 }
          )}`,
          "24h Low": `$${data.market_data.low_24h.usd.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 8,
          })}`,
          "24h Change": `${changeEmoji} ${changeColor}${priceChange.toFixed(
            2
          )}%`,
          "Market Cap": `$${data.market_data.market_cap.usd.toLocaleString(
            "en-US"
          )}`,
          "Market Rank": `#${data.market_cap_rank || "N/A"}`,
          "Total Volume": `$${data.market_data.total_volume.usd.toLocaleString(
            "en-US"
          )}`,
        };

        let output = "**🪙 Crypto Information:**\n";
        for (const [key, value] of Object.entries(info)) {
          output += `**${key}:** ${value}\n`;
        }

        // Add last updated info
        const lastUpdated = new Date(data.last_updated).toLocaleString();
        output += `\n*Last updated: ${lastUpdated}*`;
        output += `\n*Data provided by CoinGecko*`;

        await statusMsg.edit(output);
      } else {
        await statusMsg.edit("❌ Cryptocurrency not found!");
      }
    } catch (error) {
      console.error("Crypto API error:", error);

      let errorMessage = "❌ **Failed to fetch crypto data!**\n";

      if (error.response?.status === 404) {
        errorMessage +=
          "**Reason:** Cryptocurrency not found. Please check the spelling.\n\n";
        errorMessage += "**Popular cryptocurrencies:**\n";
        errorMessage += "• bitcoin, ethereum, litecoin, solana\n";
        errorMessage += "• cardano, polkadot, chainlink, dogecoin\n";
        errorMessage += "• binancecoin, ripple, avalanche-2";
      } else if (error.response?.status === 429) {
        errorMessage +=
          "**Reason:** Rate limit exceeded. Please wait a moment and try again.";
      } else if (error.code === "ECONNABORTED") {
        errorMessage += "**Reason:** Request timed out. The API might be busy.";
      } else {
        errorMessage += `**Reason:** ${
          error.message || "Unknown error occurred"
        }`;
      }

      await statusMsg.edit(errorMessage);
    }
  },
};

async function resolveCoinGeckoId(query) {
  const normalized = String(query).trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const aliasMap = {
    btc: "bitcoin",
    eth: "ethereum",
    ltc: "litecoin",
    xrp: "ripple",
    bch: "bitcoin-cash",
    ada: "cardano",
    doge: "dogecoin",
    sol: "solana",
    avax: "avalanche-2",
    matic: "polygon-ecosystem-token",
    usdt: "tether",
    usdc: "usd-coin",
    shib: "shiba-inu",
    dot: "polkadot",
    link: "chainlink",
    bnb: "binancecoin",
  };

  if (aliasMap[normalized]) {
    return aliasMap[normalized];
  }

  try {
    await axios.get(`https://api.coingecko.com/api/v3/coins/${normalized}`, {
      timeout: 10000,
    });
    return normalized;
  } catch {
    // Fall through to search.
  }

  try {
    const searchResponse = await axios.get(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(normalized)}`,
      {
        timeout: 10000,
      }
    );

    const coins = searchResponse.data?.coins || [];
    if (coins.length === 0) {
      return null;
    }

    const exactMatch =
      coins.find((coin) => coin.id?.toLowerCase() === normalized) ||
      coins.find((coin) => coin.symbol?.toLowerCase() === normalized) ||
      coins.find((coin) => coin.name?.toLowerCase() === normalized);

    return exactMatch?.id || coins[0].id || null;
  } catch {
    return null;
  }
}
