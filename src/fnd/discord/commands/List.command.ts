import { Message, ChannelType, EmbedBuilder } from "discord.js";
import { firestoreDB } from "../../../config/db/firebase";
import { mapStoveLevel } from "./Register.command";
import { LoggingUtilities } from "../../../utils/LoggingUtilities";

export const listCommand = {
  name: "list",
  description: "List all registered users",
  execute: async (message: Message) => {
    if (!message.channel.isTextBased() || message.channel.type !== ChannelType.GuildText) return;

    LoggingUtilities.service.info(
      `Fndiscord.Bot.ListCommand`,
      `Executing list command for ${message.author.tag} in channel ${message.channel.id}`
    );

    try {
      // Get all collections (each = governor ID)
      const collections = await firestoreDB.listCollections();

      if (collections.length === 0) {
        return await message.channel.send("📭 No registrations found.");
      }

      const fields: { name: string; value: string; inline?: boolean }[] = [];

      for (const collection of collections) {
        // Get most recently registered document
        const snapshot = await collection.orderBy("registeredAt", "desc").limit(1).get();

        if (snapshot.empty) continue;

        const doc = snapshot.docs[0];
        const data = doc.data();

        const nickname = data.nickname ?? "Unknown";
        const registeredAt = data.registeredAt
          ? `<t:${Math.floor(new Date(data.registeredAt).getTime() / 1000)}:R>`
          : "Unknown";

        fields.push({
          name: `👤 ${nickname} [${data.kid}] [${mapStoveLevel(data.stove_lv)}]`,
          value: `${collection.id}\n` + `🕒 **Registered:** ${registeredAt}`,
          inline: false,
        });
      }

      LoggingUtilities.service.debug(
        "Fndiscord.Bot.ListCommand",
        `Compiled registration list with ${fields.length} entries`
      );

      const embed = new EmbedBuilder()
        .setTitle("📋 Registered Users")
        .setColor(0x00ff99)
        .setDescription("Latest registered user per governor ID")
        .addFields(fields)
        .setFooter({ text: `Requested by ${message.author.username}` })
        .setTimestamp();

      await message.channel.send({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      await message.channel.send("❌ Failed to retrieve registrations.");
    }
  },
};
