import { Message, ChannelType, EmbedBuilder } from "discord.js";
import crypto from "crypto";
import { firestoreDB } from "../../../config/db/firebase";
import { LoggingUtilities } from "../../../utils/LoggingUtilities";

const SECRET = "mN4!pQs6JrYwV9";

// Get current timestamp in ms
function currentTimestampMs(): number {
  return Date.now();
}

// Generate MD5 sign (Python logic converted)
export function signPayload(payload: Record<string, any>): string {
  const keys = Object.keys(payload).sort();
  const parts: string[] = [];

  for (const key of keys) {
    let value = payload[key];
    if (typeof value === "object") value = JSON.stringify(value);
    parts.push(`${key}=${value}`);
  }

  const baseString = parts.join("&") + SECRET;
  return crypto.createHash("md5").update(baseString, "utf8").digest("hex");
}

export const registerCommand = {
  name: "register",
  description: "Register your governor ID for auto redeeming gift codes.",
  execute: async (message: Message, args: string[], commands?: Map<string, any>) => {
    if (!message.channel.isTextBased() || message.channel.type !== ChannelType.GuildText) return;

    LoggingUtilities.service.info(
      `Fndiscord.Bot.RegisterCommand`,
      `Executing register command for ${message.author.tag} in channel ${message.channel.id}`
    );

    LoggingUtilities.service.debug("Fndiscord.Bot.RegisterCommand", `Command arguments: ${JSON.stringify(args)}`);

    // ------------------
    // Validate input
    // ------------------

    const userInput = args[0];

    if (!userInput) {
      LoggingUtilities.service.error(
        "Fndiscord.Bot.RegisterCommand",
        `No governor ID provided by ${message.author.tag}`
      );
      return await message.channel.send("❌ You must provide a governor ID. Example: `!register 41579499`");
    }

    if (isNaN(Number(userInput))) {
      LoggingUtilities.service.error(
        "Fndiscord.Bot.RegisterCommand",
        `Invalid governor ID provided by ${message.author.tag}: ${userInput}`
      );
      return await message.channel.send("❌ Invalid governor ID. It must be a numeric value.");
    }

    // ------------------
    // Build payload
    // ------------------
    const payload: Record<string, any> = {
      fid: Number(userInput),
      time: currentTimestampMs(),
    };
    payload.sign = signPayload(payload);

    // ------------------
    // Send POST request
    // ------------------
    let serverResponse: any;
    try {
      const formData = new URLSearchParams();
      formData.append("fid", payload.fid.toString());
      formData.append("time", payload.time.toString());
      formData.append("sign", payload.sign);

      LoggingUtilities.service.debug(
        "Fndiscord.Bot.RegisterCommand",
        `Sending payload to server: ${JSON.stringify(payload)}`
      );

      const response = await fetch("https://kingshot-giftcode.centurygame.com/api/player", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      serverResponse = await response.json();

      if (serverResponse.code !== 0 || !serverResponse.data) {
        LoggingUtilities.service.error(
          "Fndiscord.Bot.RegisterCommand",
          `Server returned error for ${message.author.tag}: ${JSON.stringify(serverResponse)}`
        );
        return await message.channel.send(`❌ Server returned an error: ${serverResponse.msg || "Unknown error"}`);
      }
    } catch (err) {
      LoggingUtilities.service.error(
        "Fndiscord.Bot.RegisterCommand",
        `Failed to send payload for ${message.author.tag}: ${err}`
      );
      console.error(err);
      return await message.channel.send("❌ Failed to send payload to the server.");
    }

    // ------------------
    // Store response.data in Firestore with timestamp
    // ------------------
    try {
      const data = serverResponse.data;
      const collectionRef = firestoreDB.collection(userInput); // Collection = governor ID
      const docId = data.nickname || Date.now().toString(); // Document = nickname

      LoggingUtilities.service.debug(
        "Fndiscord.Bot.RegisterCommand",
        `Storing registration data for ${message.author.tag} in Firestore under collection ${userInput}, doc ${docId}`
      );

      await collectionRef.doc(docId).set({
        ...data,
        registeredBy: message.author.id,
        registeredAt: new Date().toISOString(), // <-- Timestamp here
      });
    } catch (err) {
      LoggingUtilities.service.error(
        "Fndiscord.Bot.RegisterCommand",
        `Failed to store data in Firestore for ${message.author.tag}: ${err}`
      );
      return await message.channel.send("❌ Failed to store data in Firestore.");
    }

    // ------------------
    // Send confirmation embed
    // ------------------
    const embed = new EmbedBuilder()
      .setColor(0x00ff99)
      .setTitle("✅ Registration Successful")
      .setDescription(
        `Hello, **${message.author.username}**! Your governor ID \`${userInput}\` has been registered.\n\n` +
          `**Payload Request:**\n` +
          "```json\n" +
          JSON.stringify(payload, null, 2) +
          "\n```"
      )
      .setFooter({ text: `Requested by ${message.author.username}` })
      .setTimestamp();

    embed.addFields(
      { name: "Name", value: JSON.stringify(serverResponse.data.nickname.replace(/"/g, "")) || "N/A", inline: true },
      { name: "Governor ID", value: JSON.stringify(serverResponse.data.fid), inline: true },
      { name: "Kingdom ID", value: JSON.stringify(serverResponse.data.kid), inline: true }
    );

    embed.addFields({ name: "Level", value: mapStoveLevel(serverResponse.data.stove_lv), inline: true });

    embed.setImage(serverResponse.data.avatar_image);

    await message.channel.send({ embeds: [embed] });
  },
};

export function mapStoveLevel(stoveLv: number): string {
  if (stoveLv >= 1 && stoveLv <= 34) return stoveLv.toString(); // leave it as-is
  if (stoveLv >= 35 && stoveLv <= 39) return "TG1";
  if (stoveLv >= 40 && stoveLv <= 44) return "TG2";
  if (stoveLv >= 45 && stoveLv <= 49) return "TG3";
  if (stoveLv >= 50 && stoveLv <= 54) return "TG4";
  if (stoveLv >= 55) return "TG5";
  return stoveLv.toString(); // fallback
}
