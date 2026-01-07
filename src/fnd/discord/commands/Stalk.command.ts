import { Message, ChannelType, EmbedBuilder } from "discord.js";
import { LoggingUtilities } from "../../../utils/LoggingUtilities";
import { firestoreDB } from "../../../config/db/firebase";
import { currentTimestampMs, mapStoveLevel, signPayload } from "./Register.command";

export async function getStalkSummary(governorId: string) {
  const governorRef = firestoreDB.collection("stalk").doc(governorId);

  // 1️⃣ Each subcollection represents ONE stalk attempt
  const timestampCollections = await governorRef.listCollections();
  const stalkCount = timestampCollections.length;

  // 2️⃣ Deduplicate by username, keeping latest
  const latestByUsername = new Map<
    string,
    {
      timestamp: number;
      username: string;
      kid: number;
      stove_lv: number;
    }
  >();

  for (const timestampCollection of timestampCollections) {
    const snapshot = await timestampCollection.doc("result").get();
    if (!snapshot.exists) continue;

    const data = snapshot.data();
    const playerData = data?.response?.data;
    if (!playerData?.nickname) continue;

    const timestamp = Number(timestampCollection.id);
    const username = playerData.nickname;

    const existing = latestByUsername.get(username);
    if (!existing || timestamp > existing.timestamp) {
      latestByUsername.set(username, {
        timestamp,
        username,
        kid: playerData.kid,
        stove_lv: playerData.stove_lv,
      });
    }
  }

  return {
    stalkCount,
    latestPerUser: Array.from(latestByUsername.values()).sort((a, b) => b.timestamp - a.timestamp),
  };
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

    try {
      const payload: Record<string, any> = {
        fid: Number(governorId), // Governor ID (FID = Governor ID in KingShot)
        time: currentTimestampMs(), // Current timestamp for request uniqueness
      };

      // Generate signature using the game's authentication algorithm
      payload.sign = signPayload(payload);
      /** Step 1: Prepare payload */

      const formData = new URLSearchParams();
      formData.append("fid", payload.fid.toString());
      formData.append("time", payload.time.toString());
      formData.append("sign", payload.sign);

      LoggingUtilities.service.debug(
        "Fndiscord.Bot.StalkCommand",
        `Sending payload to server: ${JSON.stringify(payload)}`
      );

      /** Step 2: Call KingShot API */
      const response = await fetch("https://kingshot-giftcode.centurygame.com/api/player", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      const serverResponse = await response.json();

      /** Step 3: Store result in Firestore */
      const timestamp = Date.now().toString();

      await firestoreDB.collection("stalk").doc(governorId).collection(timestamp).doc("result").set({
        governorId,
        requestedBy: message.author.id,
        requestedAt: new Date(),
        response: serverResponse,
      });

      LoggingUtilities.service.info("Fndiscord.Bot.StalkCommand", `Stalk result stored for governor ${governorId}`);

      const stats = await getStalkSummary(governorId);

      /** Step 4: Send embed response */
      const embed = new EmbedBuilder()
        .setColor(0x00ff99)
        .setTitle("🕵️ Stalk Result")
        .setDescription(`Governor ID **${governorId}** stalked successfully.`)
        .addFields(
          { name: "Status", value: serverResponse?.code === 0 ? "✅ Success" : "❌ Failed", inline: true },
          { name: "Message", value: serverResponse?.msg ?? "No message", inline: true },
          { name: "Stalk count", value: stats.stalkCount.toString(), inline: true }
        )
        .setFooter({ text: `Requested by ${message.author.username}` })
        .setTimestamp();

      if (stats.latestPerUser.length > 0) {
        for (let i = 0; i < stats.latestPerUser.length; i++) {
          const latest = stats.latestPerUser[i];
          embed.addFields({
            name: new Date(latest.timestamp).toLocaleString(),
            value: `${latest.username} TC: (${mapStoveLevel(latest.stove_lv)}) Server: ${latest.kid}`,
            inline: false,
          });
        }
      }

      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      LoggingUtilities.service.error("Fndiscord.Bot.StalkCommand", `Error stalking governor ${governorId}: ${error}`);

      await message.reply("❌ An error occurred while stalking the governor.");
    }
  },
};
