import { Message, ChannelType, EmbedBuilder } from "discord.js";
import { LoggingUtilities } from "../../../utils/LoggingUtilities";
import { firestoreDB } from "../../../config/db/firebase";
import { currentTimestampMs, mapStoveLevel, signPayload } from "./Register.command";
import { toMessage } from "../../../utils/errorUtils";

const MAX_HISTORY = 5;

export async function getStalkSummary(governorId: string) {
  const governorRef = firestoreDB.collection("stalk").doc(governorId);
  const timestampCollections = await governorRef.listCollections();
  const stalkCount = timestampCollections.length;

  // Fetch all result docs in parallel
  const snapshots = await Promise.all(
    timestampCollections.map((col) => col.doc("result").get())
  );

  // Deduplicate by nickname, keeping latest timestamp
  const latestByUsername = new Map<string, { timestamp: number; username: string; kid: number; stove_lv: number }>();

  for (let i = 0; i < timestampCollections.length; i++) {
    const snapshot = snapshots[i];
    if (!snapshot.exists) continue;

    const data = snapshot.data();
    const playerData = data?.response?.data;
    if (!playerData?.nickname) continue;

    const timestamp = Number(timestampCollections[i].id);
    const username = playerData.nickname;
    const existing = latestByUsername.get(username);

    if (!existing || timestamp > existing.timestamp) {
      latestByUsername.set(username, { timestamp, username, kid: playerData.kid, stove_lv: playerData.stove_lv });
    }
  }

  return {
    stalkCount,
    latestPerUser: Array.from(latestByUsername.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_HISTORY),
  };
}

function formatUtcDate(timestamp: number): string {
  const d = new Date(timestamp);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hours = String(d.getUTCHours()).padStart(2, "0");
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
}

export const stalkCommand = {
  name: "stalk",
  description: "Stalks a governor to get basic information.",

  execute: async (message: Message, args: string[]): Promise<void> => {
    if (!message.channel.isTextBased() || message.channel.type !== ChannelType.GuildText) return;

    const governorId = args[0];

    if (!governorId || !/^\d+$/.test(governorId)) {
      await message.reply("❌ Please provide a valid numeric governor ID.\nUsage: `!stalk <governorId>`");
      return;
    }

    LoggingUtilities.service.info(
      "Fndiscord.Bot.StalkCommand",
      `Executing stalk command for governor ${governorId} by ${message.author.tag}`
    );

    await message.react("⏳");

    try {
      const payload: Record<string, any> = {
        fid: Number(governorId),
        time: currentTimestampMs(),
      };
      payload.sign = signPayload(payload);

      const formData = new URLSearchParams();
      formData.append("fid", payload.fid.toString());
      formData.append("time", payload.time.toString());
      formData.append("sign", payload.sign);

      const response = await fetch("https://kingshot-giftcode.centurygame.com/api/player", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      const serverResponse = await response.json();
      const playerData = serverResponse?.data;

      // Only store and count successful responses
      if (serverResponse?.code === 0 && playerData) {
        const timestamp = Date.now().toString();
        await firestoreDB.collection("stalk").doc(governorId).collection(timestamp).doc("result").set({
          governorId,
          requestedBy: message.author.id,
          requestedAt: new Date(),
          response: serverResponse,
        });
        LoggingUtilities.service.info("Fndiscord.Bot.StalkCommand", `Stalk result stored for governor ${governorId}`);
      }

      const stats = await getStalkSummary(governorId);

      const embed = new EmbedBuilder()
        .setColor(serverResponse?.code === 0 ? 0x00ff99 : 0xff4444)
        .setTitle("🕵️ Stalk Result")
        .setFooter({ text: `Requested by ${message.author.username}` })
        .setTimestamp();

      if (serverResponse?.code !== 0 || !playerData) {
        embed
          .setDescription(`❌ Could not retrieve data for governor **${governorId}**.`)
          .addFields({ name: "Reason", value: serverResponse?.msg ?? "Unknown error", inline: false });
      } else {
        embed
          .setDescription(`Governor **${governorId}** — **${playerData.nickname}**`)
          .addFields(
            { name: "Kingdom", value: `${playerData.kid}`, inline: true },
            { name: "Level", value: mapStoveLevel(playerData.stove_lv), inline: true },
            { name: "Times Stalked", value: `${stats.stalkCount}`, inline: true }
          );

        if (playerData.avatar_image) {
          embed.setThumbnail(playerData.avatar_image);
        }

        if (stats.latestPerUser.length > 0) {
          const historyLines = stats.latestPerUser.map(
            (entry) =>
              `\`${formatUtcDate(entry.timestamp)}\` **${entry.username}** · TC ${mapStoveLevel(entry.stove_lv)} · Server ${entry.kid}`
          );
          embed.addFields({
            name: `📋 Name History (last ${stats.latestPerUser.length})`,
            value: historyLines.join("\n"),
            inline: false,
          });
        }
      }

      await message.channel.send({ embeds: [embed] });

      try {
        const pending = message.reactions.cache.get("⏳");
        if (pending) await pending.remove();
        await message.react(serverResponse?.code === 0 ? "✅" : "❌");
      } catch {
        // Reaction cleanup is non-critical
      }
    } catch (error) {
      LoggingUtilities.service.error(
        "Fndiscord.Bot.StalkCommand",
        `Error stalking governor ${governorId}: ${toMessage(error)}`
      );

      try {
        const pending = message.reactions.cache.get("⏳");
        if (pending) await pending.remove();
        await message.react("❌");
      } catch {
        // Reaction cleanup is non-critical
      }

      await message.reply("❌ An error occurred while stalking the governor.");
    }
  },
};
