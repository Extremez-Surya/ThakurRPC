import axios from "axios";

export default {
  name: "randomdata",
  aliases: ["random", "rdata", "rd"],
  description: "Generate various types of random data",
  usage: "randomdata <type> [options]",
  category: "fun",
  cooldown: 3,

  async execute(client, message, args) {
    const type = args[0]?.toLowerCase();

    if (!type) {
      const helpText = `🎲 **Random Data Generator**
Available data types:
• \`user\` - Random user profile
• \`address\` - Random address
• \`bank\` - Random bank details
• \`card\` - Random credit card
• \`company\` - Random company details
• \`device\` - Random device info
• \`food\` - Random food item
• \`ipv4\` - Random IPv4 address
• \`ipv6\` - Random IPv6 address
• \`phone\` - Random phone number
• \`vehicle\` - Random vehicle info
• \`blood\` - Random blood type info
• \`commerce\` - Random product info

Use: \`${client.prefix}randomdata <type>\` to generate random data
Example: \`${client.prefix}randomdata user\``;

      return message.channel.send(helpText);
    }

    const baseUrl = "https://random-data-api.com/api/v2";
    const endpoints = {
      user: "users",
      address: "addresses",
      bank: "banks",
      card: "credit_cards",
      company: "companies",
      device: "devices",
      food: "foods",
      phone: "phones",
      vehicle: "vehicles",
      blood: "blood_types",
      commerce: "commerce",
    };

    const endpoint = endpoints[type];
    if (!endpoint) {
      return message.channel.send(
        `❌ Invalid data type! Use \`${client.prefix}randomdata\` to see available types.`
      );
    }

    try {
      const response = await axios.get(`${baseUrl}/${endpoint}`);
      const data = response.data;

      // Format the data nicely
      const formatted = this.formatData(data);
      const emoji = this.getEmoji(type);

      await message.channel.send(
        `${emoji} **Random ${
          type.charAt(0).toUpperCase() + type.slice(1)
        }:**\n${formatted}`
      );
    } catch (error) {
      const fallbackData = generateLocalRandomData(type);
      if (!fallbackData) {
        await message.channel.send(`❌ Failed to generate random ${type} data`);
        return;
      }

      if (type === "ipv4" || type === "ipv6") {
        await message.channel.send(
          `🌐 **Random ${type.toUpperCase()}:** \`${fallbackData}\``
        );
        return;
      }

      await message.channel.send(
        `${this.getEmoji(type)} **Random ${
          type.charAt(0).toUpperCase() + type.slice(1)
        }:**\n${this.formatData(fallbackData)}`
      );
    }
  },

  formatData(data) {
    const result = [];
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "object" && value !== null) {
        const nested = this.formatData(value);
        result.push(
          `**${key
            .replace(/_/g, " ")
            .replace(/\b\w/g, (l) => l.toUpperCase())}:**\n${nested}`
        );
      } else if (Array.isArray(value)) {
        const items = value.join(", ");
        result.push(
          `**${key
            .replace(/_/g, " ")
            .replace(/\b\w/g, (l) => l.toUpperCase())}:** ${items}`
        );
      } else {
        result.push(
          `**${key
            .replace(/_/g, " ")
            .replace(/\b\w/g, (l) => l.toUpperCase())}:** ${value}`
        );
      }
    }
    return result.join("\n");
  },

  getEmoji(type) {
    const emojis = {
      user: "👤",
      address: "📍",
      bank: "🏦",
      card: "💳",
      company: "🏢",
      device: "📱",
      food: "🍔",
      ipv4: "🌐",
      ipv6: "🌐",
      phone: "📞",
      vehicle: "🚗",
      blood: "🩸",
      commerce: "🛍️",
    };
    return emojis[type] || "🎲";
  },
};

function generateLocalCardData() {
  const firstNames = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Avery"];
  const lastNames = ["Smith", "Johnson", "Brown", "Wilson", "Davis", "Miller"];
  const issuers = ["Visa", "Mastercard", "American Express", "Discover"];
  const banks = ["Chase", "Bank of America", "Wells Fargo", "Citibank", "Capital One"];

  const issuer = pickRandom(issuers);
  const bank = pickRandom(banks);
  const firstName = pickRandom(firstNames);
  const lastName = pickRandom(lastNames);
  const accountNumber = generateLuhnCardNumber(issuer);
  const expiryMonth = String(randomInt(1, 12)).padStart(2, "0");
  const expiryYear = String(new Date().getFullYear() + randomInt(1, 5));

  return {
    card_number: accountNumber,
    card_type: issuer,
    cardholder_name: `${firstName} ${lastName}`,
    expiration_date: `${expiryMonth}/${expiryYear.slice(-2)}`,
    cvv: String(randomInt(100, 999)),
    bank_name: bank,
    iban: `GB${randomInt(10, 99)}VEXIL${randomInt(10000000, 99999999)}`,
    credit_card_limit: `$${randomInt(1000, 15000).toLocaleString()}`,
  };
}

function generateLocalRandomData(type) {
  switch (type) {
    case "user":
      return {
        id: randomInt(100000, 999999),
        uid: randomHex(16),
        password: randomPassword(),
        first_name: pickRandom(FIRST_NAMES),
        last_name: pickRandom(LAST_NAMES),
        username: `${pickRandom(FIRST_NAMES).toLowerCase()}${randomInt(10, 99)}`,
        email: `${randomUsername()}@${pickRandom(MAIL_DOMAINS)}`,
        avatar: "https://i.pravatar.cc/300",
        gender: pickRandom(["Male", "Female"]),
        phone_number: randomPhoneNumber(),
        date_of_birth: randomDateString(18, 60),
      };
    case "address":
      return {
        city: pickRandom(CITIES),
        street_name: pickRandom(STREET_NAMES),
        street_address: `${randomInt(10, 9999)} ${pickRandom(STREET_NAMES)} St`,
        secondary_address: `Apt ${randomInt(1, 999)}`,
        country: pickRandom(COUNTRIES),
        state: pickRandom(STATES),
        postal_code: String(randomInt(10000, 99999)),
        latitude: randomFloat(-90, 90),
        longitude: randomFloat(-180, 180),
      };
    case "bank":
      return {
        account_number: String(randomInt(10000000, 99999999)),
        iban: `GB${randomInt(10, 99)}VEXIL${randomInt(10000000, 99999999)}`,
        bank_name: pickRandom(BANKS),
        routing_number: String(randomInt(100000000, 999999999)),
        swift_bic: `${pickRandom(["CHAS", "BOFA", "WELS", "CITI", "CAPL"])}US33`,
      };
    case "card":
      return generateLocalCardData();
    case "company":
      return {
        name: `${pickRandom(COMPANY_PREFIXES)} ${pickRandom(COMPANY_SUFFIXES)}`,
        industry: pickRandom(INDUSTRIES),
        business_slogan: pickRandom(SLOGANS),
        company_type: pickRandom(["LLC", "Inc.", "Ltd.", "GmbH"]),
        employee_count: String(randomInt(5, 5000)),
        address: generateLocalRandomData("address"),
      };
    case "device":
      return {
        brand: pickRandom(DEVICE_BRANDS),
        model: `${pickRandom(DEVICE_MODELS)} ${randomInt(1, 20)}`,
        os: pickRandom(OPERATING_SYSTEMS),
        platform: pickRandom(["desktop", "mobile", "tablet"]),
        serial_number: randomHex(12).toUpperCase(),
        screen_size: `${randomInt(5, 17)}.${randomInt(0, 9)}"`,
      };
    case "food":
      return {
        dish: pickRandom(FOODS),
        ingredient: pickRandom(INGREDIENTS),
        measurement: `${randomInt(1, 500)} g`,
        spice_level: pickRandom(["mild", "medium", "hot"]),
        cuisine: pickRandom(CUISINES),
      };
    case "phone":
      return {
        phone_number: randomPhoneNumber(),
        international_code: "+1",
        country_code: "US",
      };
    case "vehicle":
      return {
        make_and_model: `${pickRandom(VEHICLE_MAKES)} ${pickRandom(VEHICLE_MODELS)}`,
        color: pickRandom(COLORS),
        vin: randomHex(17).toUpperCase(),
        transmission: pickRandom(["Manual", "Automatic"]),
        drive_type: pickRandom(["FWD", "RWD", "AWD"]),
        fuel_type: pickRandom(["Gasoline", "Diesel", "Electric", "Hybrid"]),
      };
    case "blood":
      return {
        type: pickRandom(BLOOD_TYPES),
        rhesus: pickRandom(["positive", "negative"]),
      };
    case "commerce":
      return {
        product_name: `${pickRandom(PRODUCT_ADJECTIVES)} ${pickRandom(PRODUCT_NOUNS)}`,
        material: pickRandom(MATERIALS),
        price: `$${randomInt(5, 999)}.${String(randomInt(0, 99)).padStart(2, "0")}`,
        department: pickRandom(DEPARTMENTS),
        upc: String(randomInt(100000000000, 999999999999)),
      };
    case "ipv4":
      return randomIpv4();
    case "ipv6":
      return randomIpv6();
    default:
      return null;
  }
}

const FIRST_NAMES = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Avery", "Sam", "Riley"];
const LAST_NAMES = ["Smith", "Johnson", "Brown", "Wilson", "Davis", "Miller", "Moore", "Taylor"];
const MAIL_DOMAINS = ["gmail.com", "outlook.com", "yahoo.com", "proton.me", "example.com"];
const CITIES = ["New York", "Los Angeles", "Chicago", "Houston", "Miami", "Seattle"];
const STREET_NAMES = ["Oak", "Maple", "Cedar", "Pine", "Elm", "Sunset"];
const COUNTRIES = ["United States", "Canada", "United Kingdom", "Australia", "Germany"];
const STATES = ["California", "Texas", "Florida", "New York", "Washington"];
const BANKS = ["Chase", "Bank of America", "Wells Fargo", "Citibank", "Capital One"];
const COMPANY_PREFIXES = ["Blue", "Prime", "Nova", "Vertex", "Summit", "Pulse"];
const COMPANY_SUFFIXES = ["Labs", "Systems", "Studios", "Holdings", "Dynamics", "Works"];
const INDUSTRIES = ["Technology", "Finance", "Retail", "Healthcare", "Logistics"];
const SLOGANS = ["Built for speed", "Smarter every day", "Simple, fast, reliable", "Designed to scale"];
const DEVICE_BRANDS = ["Apple", "Samsung", "Google", "Dell", "Lenovo", "HP"];
const DEVICE_MODELS = ["Pro", "Air", "Max", "Ultra", "Edge", "Flex"];
const OPERATING_SYSTEMS = ["Windows 11", "macOS 15", "Android 15", "iOS 18", "Ubuntu 24.04"];
const FOODS = ["Burger", "Pizza", "Sushi", "Taco", "Pasta", "Salad"];
const INGREDIENTS = ["Tomato", "Cheese", "Chicken", "Basil", "Rice", "Beef"];
const CUISINES = ["American", "Italian", "Japanese", "Mexican", "Indian"];
const VEHICLE_MAKES = ["Toyota", "Honda", "Ford", "BMW", "Tesla", "Hyundai"];
const VEHICLE_MODELS = ["Civic", "Corolla", "Model 3", "Accord", "Mustang", "Elantra"];
const COLORS = ["Red", "Blue", "Black", "White", "Silver", "Green"];
const BLOOD_TYPES = ["A", "B", "AB", "O"];
const PRODUCT_ADJECTIVES = ["Portable", "Premium", "Smart", "Compact", "Wireless"];
const PRODUCT_NOUNS = ["Speaker", "Bottle", "Notebook", "Lamp", "Headset", "Backpack"];
const MATERIALS = ["Plastic", "Steel", "Cotton", "Wood", "Leather"];
const DEPARTMENTS = ["Home", "Electronics", "Outdoors", "Office", "Apparel"];

function randomUsername() {
  return `${pickRandom(FIRST_NAMES).toLowerCase()}${pickRandom(LAST_NAMES).toLowerCase()}${randomInt(10, 99)}`;
}

function randomPassword() {
  return `${randomHex(4)}-${randomHex(4)}-${randomHex(4)}`;
}

function randomPhoneNumber() {
  return `+1 (${randomInt(200, 999)}) ${randomInt(200, 999)}-${String(randomInt(0, 9999)).padStart(4, "0")}`;
}

function randomDateString(minAge, maxAge) {
  const now = new Date();
  const age = randomInt(minAge, maxAge);
  const year = now.getFullYear() - age;
  const month = String(randomInt(1, 12)).padStart(2, "0");
  const day = String(randomInt(1, 28)).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function randomHex(length) {
  const chars = "0123456789abcdef";
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += chars[randomInt(0, chars.length - 1)];
  }
  return value;
}

function randomFloat(min, max) {
  return (Math.random() * (max - min) + min).toFixed(4);
}

function randomIpv4() {
  return `${randomInt(1, 223)}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`;
}

function randomIpv6() {
  const segments = [];
  for (let index = 0; index < 8; index += 1) {
    segments.push(randomHex(4));
  }
  return segments.join(":");
}

function generateLuhnCardNumber(issuer) {
  const prefixMap = {
    Visa: [4],
    Mastercard: [5, randomInt(1, 5)],
    "American Express": [3, 4],
    Discover: [6, 0, 1, 1],
  };

  const prefix = prefixMap[issuer] || [4];
  const targetLength = issuer === "American Express" ? 15 : 16;
  const digits = [...prefix];

  while (digits.length < targetLength - 1) {
    digits.push(randomInt(0, 9));
  }

  const checkDigit = computeLuhnCheckDigit(digits);
  digits.push(checkDigit);

  return digits.join("");
}

function computeLuhnCheckDigit(digits) {
  let sum = 0;
  let shouldDouble = true;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = Number(digits[index]);
    if (shouldDouble) {
      value *= 2;
      if (value > 9) {
        value -= 9;
      }
    }
    sum += value;
    shouldDouble = !shouldDouble;
  }

  return (10 - (sum % 10)) % 10;
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
