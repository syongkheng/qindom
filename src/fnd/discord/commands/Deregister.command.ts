import { Message, ChannelType, EmbedBuilder } from "discord.js";
import { firestoreDB } from "../../../config/db/firebase";
import { LoggingUtilities } from "../../../utils/logging/LoggingUtilities";
import { toMessage } from "../../../utils/errorUtils";

const ALLOWED_ADMIN_IDS = ["340529865952460800"];

async function clearReaction(message: Message, emoji: string): Promise<void> {
  try {
    const reaction = message.reactions.cache.get(emoji);
    if (reaction) await reaction.remove();
  } catch {
    // Non-critical
  }
}

export const deregisterCommand = {
  name: "deregister",
  description: "Remove your governor from the gift code redemption list.",

  execute: async (message: Message, args: string[]): Promise<void> => {
    if (!message.channel.isTextBased() || message.channel.type !== ChannelType.GuildText) return;

    const governorId = args[0];

    if (!governorId || !/^\d+$/.test(governorId)) {
      await message.reply("❌ Please provide a valid numeric governor ID.\nUsage: `!deregister <governorId>`");
      return;
    }

    LoggingUtilities.service.info(
      "Fndiscord.Bot.DeregisterCommand",
      `Deregister requested for governor ${governorId} by ${message.author.tag}`
    );

    await message.react("⏳");

    try {
      const isAdmin = ALLOWED_ADMIN_IDS.includes(message.author.id);
      const collectionRef = firestoreDB.collection(governorId);
      const snapshot = await collectionRef.get();

      // Governor not registered
      if (snapshot.empty) {
        await message.reply(`❌ Governor **${governorId}** is not registered.`);
        await clearReaction(message, "⏳");
        await message.react("❌");
        return;
      }

      // Admins can remove any governor; regular users only their own
      const authorizedDocs = snapshot.docs.filter(
        (doc) => isAdmin || doc.data().registeredBy === message.author.id
      );

      if (authorizedDocs.length === 0) {
        await message.reply("⛔ You are not authorized to deregister this governor.");
        await clearReaction(message, "⏳");
        await message.react("❌");
        return;
      }

      // Resolve governor nickname from the latest doc
      const latestDoc = snapshot.docs.sort((a, b) => {
        const aTime = new Date(a.data().registeredAt ?? 0).getTime();
        const bTime = new Date(b.data().registeredAt ?? 0).getTime();
        return bTime - aTime;
      })[0];
      const nickname = latestDoc.data().nickname ?? governorId;

      // Batch-delete all registration docs for this governor
      const batch = firestoreDB.batch();
      for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
      }
      await batch.commit();

      LoggingUtilities.service.info(
        "Fndiscord.Bot.DeregisterCommand",
        `Deregistered ${nickname} (${governorId}) — ${snapshot.docs.length} doc(s) removed by ${message.author.tag}`
      );

      const embed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle("🗑️ Deregistered")
        .setDescription(`**${nickname}** (\`${governorId}\`) has been removed from the redemption list.`)
        .addFields(
          { name: "Records removed", value: `${snapshot.docs.length}`, inline: true },
          { name: "Removed by", value: message.author.username, inline: true }
        )
        .setFooter({ text: "You can re-register at any time using !register" })
        .setTimestamp();

      await message.channel.send({ embeds: [embed] });

      await clearReaction(message, "⏳");
      await message.react("✅");
    } catch (error) {
      LoggingUtilities.service.error(
        "Fndiscord.Bot.DeregisterCommand",
        `Error deregistering governor ${governorId}: ${toMessage(error)}`
      );

      await clearReaction(message, "⏳");
      try { await message.react("❌"); } catch { /* non-critical */ }

      await message.reply("❌ An error occurred while deregistering. Please try again.");
    }
  },
};
