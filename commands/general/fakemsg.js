import axios from "axios";

let emojiPropertyRegex = null;
let sharpLib = undefined;
let resvgCtor = undefined;
const emojiImageCache = new Map();
let emojiSequenceRegex = null;

async function getSharp() {
  if (sharpLib !== undefined) {
    return sharpLib;
  }

  try {
    const mod = await import("sharp");
    sharpLib = mod.default || mod;
  } catch {
    sharpLib = null;
  }

  return sharpLib;
}

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

function isExtendedPictographic(character) {
  if (emojiPropertyRegex === null) {
    try {
      // Build at runtime to avoid syntax errors on older Node versions.
      emojiPropertyRegex = new RegExp("\\p{Extended_Pictographic}", "u");
    } catch {
      emojiPropertyRegex = false;
    }
  }

  if (!emojiPropertyRegex) {
    return false;
  }

  return emojiPropertyRegex.test(character);
}

function getEmojiSequenceRegex() {
  if (emojiSequenceRegex !== null) {
    return emojiSequenceRegex;
  }

  try {
    emojiSequenceRegex = new RegExp(
      "\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?)*",
      "u",
    );
  } catch {
    emojiSequenceRegex = false;
  }

  return emojiSequenceRegex;
}

function isEmojiGrapheme(grapheme) {
  const emojiRegex = getEmojiSequenceRegex();
  if (!emojiRegex) {
    return Array.from(grapheme).some((char) => isExtendedPictographic(char));
  }

  return emojiRegex.test(grapheme);
}

function splitGraphemes(text) {
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
    return Array.from(segmenter.segment(String(text)), (entry) => entry.segment);
  }

  return Array.from(String(text));
}

function normalizeDecorativeGrapheme(grapheme) {
  const value = String(grapheme);

  // Normalize all non-emoji text graphemes so hosts without specialized fonts
  // still show readable base characters instead of tofu boxes.
  try {
    return value.normalize("NFKC").replace(/[\u200B-\u200F\uFE00-\uFE0F\u2060\uFEFF]/g, "");
  } catch {
    return value;
  }
}

function toTwemojiCodepoint(grapheme) {
  const codepoints = [];
  for (const symbol of Array.from(grapheme)) {
    const cp = symbol.codePointAt(0);
    // Twemoji asset names usually omit the emoji variation selector.
    if (cp === 0xfe0f) continue;
    codepoints.push(cp.toString(16));
  }

  return codepoints.join("-");
}

async function getEmojiDataUrl(grapheme) {
  const directEmojiUrls = [
    `https://emojicdn.elk.sh/${encodeURIComponent(grapheme)}?style=twitter`,
    `https://emojicdn.elk.sh/${encodeURIComponent(grapheme)}?style=google`,
    `https://emojicdn.elk.sh/${encodeURIComponent(grapheme)}?style=apple`,
    `https://emojiapi.dev/api/v1/${encodeURIComponent(grapheme)}/64.png`,
  ];

  for (const url of directEmojiUrls) {
    const dataUrl = await fetchImageAsDataUrl(url);
    if (dataUrl) {
      return dataUrl;
    }
  }

  const key = toTwemojiCodepoint(grapheme);
  if (!key) {
    return null;
  }

  if (emojiImageCache.has(key)) {
    return emojiImageCache.get(key);
  }

  const emojiUrls = [
    `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${key}.png`,
    `https://unpkg.com/twemoji@14.0.2/assets/72x72/${key}.png`,
    `https://raw.githubusercontent.com/twitter/twemoji/v14.0.2/assets/72x72/${key}.png`,
    `https://twemoji.maxcdn.com/v/latest/72x72/${key}.png`,
    `https://cdn.jsdelivr.net/npm/openmoji@14.0.0/color/72x72/${key.toUpperCase()}.png`,
    `https://openmoji.org/data/color/svg/${key.toUpperCase()}.svg`,
  ];

  for (const url of emojiUrls) {
    const dataUrl = await fetchImageAsDataUrl(url);
    if (dataUrl) {
      emojiImageCache.set(key, dataUrl);
      return dataUrl;
    }
  }

  try {
    emojiImageCache.set(key, null);
    return null;
  } catch {
    return null;
  }
}

async function fetchImageAsDataUrl(url) {
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 6000,
      maxRedirects: 5,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      validateStatus: (status) => status >= 200 && status < 300,
    });

    const contentType = response.headers?.["content-type"] || "image/png";
    return `data:${contentType};base64,${Buffer.from(response.data).toString("base64")}`;
  } catch {
    return null;
  }
}

export default {
  name: "fakemsg",
  description: "Send a fake message.",
  aliases: ["fake"],
  usage: "@user|userId <text>",
  category: "general",
  type: "both",
  permissions: ["SendMessages", "AttachFiles"],
  cooldown: 5,

  execute: async (client, message, args) => {
    const mentionFromMessage = message.mentions.users.first();
    let user = mentionFromMessage || null;
    let textArgs = [...args];

    // Fallback 1: parse mention directly from raw content.
    let parsedUserId = null;
    const rawMentionMatch = message.content.match(/<@!?(\d{17,20})>/);
    if (rawMentionMatch) {
      parsedUserId = rawMentionMatch[1];
      textArgs = textArgs.filter((token) => token !== rawMentionMatch[0]);
    }

    // Fallback 2: parse mention/id from first arg token.
    if (!parsedUserId && textArgs.length > 0) {
      const firstArg = String(textArgs[0]);
      const argMentionMatch = firstArg.match(/^<@!?(\d{17,20})>$/);

      if (argMentionMatch) {
        parsedUserId = argMentionMatch[1];
        textArgs = textArgs.slice(1);
      } else if (/^\d{17,20}$/.test(firstArg)) {
        parsedUserId = firstArg;
        textArgs = textArgs.slice(1);
      }
    }

    if (!user && parsedUserId) {
      try {
        user = await client.users.fetch(parsedUserId);
      } catch {
        user = null;
      }
    }

    // Final fallback for mention token when user object exists from cache.
    if (textArgs.length > 0 && /^<@!?\d{17,20}>$/.test(textArgs[0])) {
      textArgs = textArgs.slice(1);
    }

    const rawText = textArgs.join(" ").trim();

    if (!user || !rawText) {
      return message.channel.send(
        "> ❌ Please mention a user or provide a user ID and message.\nUsage: `fakemsg @user <message>` or `fakemsg <userId> <message>`",
      );
    }

    const member = await resolveMentionedMember(message, user);
    const displayName =
      member?.displayName ||
      user.globalName ||
      user.displayName ||
      user.username;
    const timestamp = formatDiscordTime(message.createdAt || new Date());
    const textTokens = parseMessageTokens(rawText, message);

    try {
      const svg = await buildDiscordLikeCard({
        displayName,
        timestamp,
        textTokens,
      });

      const ResvgCtor = await getResvgCtor();
      if (!ResvgCtor) {
        return message.channel.send(
          "> ❌ Failed to send fake message: rendering engine unavailable on this host.",
        );
      }

      const cardBase = new ResvgCtor(svg, {
        fitTo: { mode: "original" },
        font: {
          loadSystemFonts: true,
          defaultFontFamily: "Segoe UI Emoji",
        },
      })
        .render()
        .asPng();

      let renderedImage = cardBase;
      const sharp = await getSharp();

      // Keep fakemsg usable even if sharp is not available in the host runtime.
      if (sharp) {
        try {
          const avatarUrl = user.displayAvatarURL({
            dynamic: false,
            extension: "png",
            size: 128,
          });
          const avatarResponse = await axios.get(avatarUrl, {
            responseType: "arraybuffer",
          });

          if (avatarResponse.status === 200) {
            const avatarBuffer = Buffer.from(avatarResponse.data);
            renderedImage = await sharp(cardBase)
              .composite([
                {
                  input: await createCircularAvatar(sharp, avatarBuffer, 42),
                  left: 14,
                  top: 14,
                },
              ])
              .png()
              .toBuffer();
          }
        } catch {
          // Use the base rendered card if avatar compositing fails.
          renderedImage = cardBase;
        }
      }

      await message.channel.send({
        files: [
          {
            attachment: renderedImage,
            name: "fakemsg.png",
          },
        ],
      });
    } catch (error) {
      message.channel.send(
        `> ❌ Failed to send fake message: ${error.message}`,
      );
    }
  },
};

async function resolveMentionedMember(message, user) {
  if (!message.guild || !user) {
    return null;
  }

  const cachedMember = message.guild.members.cache.get(user.id);
  if (cachedMember) {
    return cachedMember;
  }

  try {
    return await message.guild.members.fetch(user.id);
  } catch {
    return null;
  }
}

async function buildDiscordLikeCard({ displayName, timestamp, textTokens }) {
  const safeTimestamp = escapeXml(timestamp);
  const width = 360;
  const nameX = 68;
  const nameY = 32;
  const bodyFont =
    "Segoe UI, Segoe UI Emoji, Noto Color Emoji, Apple Color Emoji, Twemoji Mozilla, Arial Unicode MS, sans-serif";
  const displayNameLayout = await renderDisplayNameGlyphs(displayName, nameX, nameY);
  const estimatedNameWidth = displayNameLayout.width;
  const estimatedTimestampWidth = estimateTextWidth(timestamp, 12, false);
  const timestampGap = 14;
  const rightPadding = 16;
  const maxTimestampX = width - rightPadding - estimatedTimestampWidth;
  const timestampX = Math.min(
    maxTimestampX,
    nameX + estimatedNameWidth + timestampGap,
  );
  const timestampY = 32;

  const messageLayout = renderMessageTokens(textTokens, nameX, 58, bodyFont);
  const height = Math.max(92, messageLayout.height + 18);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#36393f" />
  ${displayNameLayout.svg}
    <text x="${timestampX}" y="${timestampY}" fill="#72767d" font-family="${bodyFont}" font-size="12" font-weight="500">${safeTimestamp}</text>
  ${messageLayout.svg}
</svg>`;
}

async function renderDisplayNameGlyphs(text, x, baselineY) {
  const segments = splitDisplayNameSegments(text);
  const fontSize = 22;
  const emojiSize = 22;
  const yEmoji = baselineY - emojiSize + 2;

  let cursorX = x;
  const parts = [];

  for (const segment of segments) {
    if (segment.type === "discord_custom_emoji") {
      const ext = segment.animated ? "gif" : "png";
      const customEmojiUrl = `https://cdn.discordapp.com/emojis/${segment.id}.${ext}?size=64&quality=lossless`;
      const dataUrl = await fetchImageAsDataUrl(customEmojiUrl);
      const width = emojiSize;

      if (dataUrl) {
        parts.push(
          `<image x="${cursorX}" y="${yEmoji}" width="${emojiSize}" height="${emojiSize}" href="${dataUrl}" />`,
        );
        cursorX += width;
        continue;
      }

      // If CDN fetch fails, render the readable fallback token text.
      const fallback = `:${segment.name}:`;
      parts.push(
        `<text x="${cursorX}" y="${baselineY}" fill="#ffffff" font-family="Segoe UI, Arial Unicode MS, sans-serif" font-size="${fontSize}" font-style="normal" font-weight="400">${escapeXml(fallback)}</text>`,
      );
      cursorX += estimateTextWidth(fallback, fontSize, true);
      continue;
    }

    const graphemes = splitGraphemes(segment.value);
    for (const grapheme of graphemes) {
      if (isEmojiGrapheme(grapheme)) {
      const dataUrl = await getEmojiDataUrl(grapheme);
      const width = Math.max(emojiSize, estimateTextWidth(grapheme, fontSize, true));

      if (dataUrl) {
        parts.push(
          `<image x="${cursorX}" y="${yEmoji}" width="${emojiSize}" height="${emojiSize}" href="${dataUrl}" />`,
        );
      } else {
        // If image fetch fails, avoid tofu boxes by skipping the emoji glyph.
        // This keeps the display name readable on locked-down hosts.
        parts.push(
          `<text x="${cursorX}" y="${baselineY}" fill="#ffffff" font-family="Segoe UI, Arial Unicode MS, sans-serif" font-size="${fontSize}" font-style="normal" font-weight="400"></text>`,
        );
      }

      cursorX += width;
      continue;
      }

      const safeGrapheme = normalizeDecorativeGrapheme(grapheme);

      parts.push(
        `<text x="${cursorX}" y="${baselineY}" fill="#ffffff" font-family="Segoe UI, Arial Unicode MS, sans-serif" font-size="${fontSize}" font-style="normal" font-weight="400">${escapeXml(safeGrapheme)}</text>`,
      );
      cursorX += estimateTextWidth(safeGrapheme, fontSize, true);
    }
  }

  return {
    svg: parts.join(""),
    width: Math.max(0, cursorX - x),
  };
}

function splitDisplayNameSegments(text) {
  const segments = [];
  const pattern = /<(?:(a):)?([a-zA-Z0-9_]{2,32}):(\d{17,20})>/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const matchStart = match.index;
    if (matchStart > lastIndex) {
      segments.push({
        type: "text",
        value: text.slice(lastIndex, matchStart),
      });
    }

    segments.push({
      type: "discord_custom_emoji",
      animated: Boolean(match[1]),
      name: match[2],
      id: match[3],
    });

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }

  return segments.length ? segments : [{ type: "text", value: text }];
}

async function createCircularAvatar(sharp, avatarBuffer, size) {
  const squareAvatar = await sharp(avatarBuffer)
    .resize(size, size, { fit: "cover" })
    .png()
    .toBuffer();

  const circleMask = Buffer.from(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
          <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white" />
        </svg>`,
  );

  return sharp(squareAvatar)
    .composite([{ input: circleMask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

function formatDiscordTime(date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function parseMessageTokens(text, message) {
  const tokens = [];
  const parts = String(text)
    .split(/(\n|<@!?[0-9]{17,19}>|\s+)/g)
    .filter(Boolean);

  for (const part of parts) {
    if (part === "\n") {
      tokens.push({ type: "newline" });
      continue;
    }

    if (/^\s+$/.test(part)) {
      tokens.push({ type: "space", value: " " });
      continue;
    }

    const mentionMatch = part.match(/^<@!?([0-9]{17,19})>$/);
    if (mentionMatch) {
      const userId = mentionMatch[1];
      const member = message.guild?.members.cache.get(userId);
      const user = message.client.users.cache.get(userId);
      const displayName =
        member?.displayName ||
        user?.globalName ||
        user?.displayName ||
        user?.username ||
        `user-${userId}`;
      tokens.push({ type: "mention", value: `@${displayName}` });
      continue;
    }

    tokens.push({ type: "text", value: part });
  }

  return tokens;
}

function renderMessageTokens(tokens, startX, startY, fontFamily) {
  const parts = [];
  let x = startX;
  let y = startY;
  const lineHeight = 24;
  const maxWidth = 340;

  for (const token of tokens) {
    if (token.type === "newline") {
      x = startX;
      y += lineHeight;
      continue;
    }

    if (token.type === "space") {
      // Keep a visible gap between words across different host font renderers.
      x += Math.max(8, estimateTextWidth(" ", 20, false));
      continue;
    }

    const tokenWidth = estimateTextWidth(token.value, 20, false);

    if (x !== startX && x + tokenWidth > maxWidth) {
      x = startX;
      y += lineHeight;
    }

    if (token.type === "mention") {
      const pillWidth = Math.max(46, tokenWidth + 16);
      parts.push(
        `<rect x="${x - 3}" y="${y - 18}" rx="6" ry="6" width="${pillWidth}" height="22" fill="#5865F2" />`,
        `<text x="${x}" y="${y}" fill="#ffffff" font-family="${fontFamily}" font-size="20" font-weight="600">${escapeXml(token.value)}</text>`,
      );
      x += pillWidth + 6;
      continue;
    }

    parts.push(
      `<text x="${x}" y="${y}" fill="#dcddde" font-family="${fontFamily}" font-size="20" font-weight="400">${escapeXml(token.value)}</text>`,
    );
    x += tokenWidth + 2;
  }

  return {
    svg: parts.join(""),
    height: y + 14,
  };
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function estimateTextWidth(text, fontSize, isHeader = false) {
  const characters = Array.from(String(text));
  const baseRatio = isHeader ? 0.6 : 0.56;

  return characters.reduce((total, character) => {
    if (/\s/.test(character)) {
      return total + fontSize * 0.4;
    }

    if (
      /[\u1100-\u11FF\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(
        character,
      )
    ) {
      return total + fontSize * 0.9;
    }

    if (isExtendedPictographic(character)) {
      return total + fontSize * 0.95;
    }

    if (/[^\x00-\x7F]/.test(character)) {
      return total + fontSize * 0.7;
    }

    return total + fontSize * baseRatio;
  }, 0);
}
