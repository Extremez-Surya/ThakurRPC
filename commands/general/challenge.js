import { log } from "../../utils/functions.js";
import axios from "axios"; // Replaced node-fetch with axios

let resvgCtor = undefined;

async function getResvgCtor() {
  if (resvgCtor !== undefined) {
    return resvgCtor;
  }

  try {
    const mod = await import("@resvg/resvg-js");
    resvgCtor = mod.Resvg;
  } catch {
    resvgCtor = null;
  }

  return resvgCtor;
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildChallengeSvg() {
  const title = "Random Challenge";
  const prompt = pickRandom([
    "Do 20 push-ups",
    "Drink a full glass of water",
    "Send a kind message to someone",
    "Write down 3 goals for today",
    "Take a 5 minute walk",
    "Clean up your desk",
    "Read 5 pages of a book",
    "Learn one new word",
  ]);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="360" viewBox="0 0 900 360">
    <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#15171c" />
            <stop offset="100%" stop-color="#23262d" />
        </linearGradient>
        <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#7c3aed" />
            <stop offset="100%" stop-color="#06b6d4" />
        </linearGradient>
    </defs>
    <rect width="900" height="360" rx="28" fill="url(#bg)" />
    <circle cx="790" cy="70" r="120" fill="#7c3aed" opacity="0.12" />
    <circle cx="110" cy="290" r="140" fill="#06b6d4" opacity="0.10" />
    <rect x="40" y="40" width="820" height="280" rx="22" fill="#111318" stroke="#343844" stroke-width="2" />
    <rect x="40" y="40" width="820" height="8" rx="4" fill="url(#accent)" />
    <text x="80" y="120" fill="#f8fafc" font-family="Segoe UI, Arial, sans-serif" font-size="46" font-weight="700">${escapeXml(title)}</text>
    <text x="80" y="180" fill="#cbd5e1" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="500">${escapeXml(prompt)}</text>
    <text x="80" y="245" fill="#94a3b8" font-family="Segoe UI, Arial, sans-serif" font-size="20">Use this as a quick daily challenge</text>
    <text x="80" y="285" fill="#7dd3fc" font-family="Segoe UI, Arial, sans-serif" font-size="18">Generated locally when the remote API is unavailable</text>
</svg>`;
}

export default {
  name: "challenge",
  description: "Get a random challenge image.",
  aliases: ["chal"],
  usage: "",
  category: "general",
  type: "both",
  permissions: ["SendMessages", "AttachFiles"], // Added AttachFiles permission
  cooldown: 5,

  execute: async (client, message, args) => {
    try {
      let imageUrl = null;

      try {
        const response = await axios.get(
          "https://api.alexflipnote.dev/challenge",
        ); // Using axios instead of fetch
        if (response.status === 200 && response.data?.file) {
          imageUrl = response.data.file;
        }
      } catch {
        // Fall back to a locally generated image.
      }

      if (imageUrl) {
        return message.channel.send(imageUrl);
      }

      const ResvgCtor = await getResvgCtor();
      if (!ResvgCtor) {
        return message.channel.send(
          "> ❌ Failed to get challenge picture: remote API is unavailable and the local renderer is missing.",
        );
      }

      const svg = buildChallengeSvg();
      const imageBuffer = new ResvgCtor(svg, {
        fitTo: { mode: "original" },
      })
        .render()
        .asPng();

      return message.channel.send({
        files: [
          {
            attachment: imageBuffer,
            name: "challenge.png",
          },
        ],
      });
    } catch (error) {
      log(`Error fetching challenge image: ${error.message}`, "error");
      message.channel.send(
        `> ❌ Failed to get challenge picture: ${error.message}`,
      ); // Improved error message
    }
  },
};
