import { Message, ChannelType, EmbedBuilder } from "discord.js";
import axios from "axios";
import { firestoreDB as db } from "../../../config/db/firebase";
import { signPayload } from "./Register.command";
import { LoggingUtilities } from "../../../utils/LoggingUtilities";

/**
 * Configuration
 */
const ALLOWED_REDEEMER_IDS = ["340529865952460800"];
const EMBED_BATCH_SIZE = 10;
const MIN_DELAY_MS = 800;
const MAX_DELAY_MS = 1200;

/**
 * Utilities
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randomDelay = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * HTTP helper
 */
async function postForm(url: string, payload: Record<string, any>) {
  const sign = signPayload(payload);
  return axios.post(url, new URLSearchParams({ ...payload, sign }), { timeout: 10_000 });
}

/**
 * Redeem logic for a single governor
 */
async function redeemForGovernor(
  giftCode: string,
  docRef: FirebaseFirestore.DocumentReference,
  data: any
): Promise<string> {
  const fid = data.fid;
  const nickname = data.nickname ?? "Unknown";
  const redemptionRef = docRef.collection("redemptions").doc(giftCode.replace(/\//g, "_"));

  try {
    const time = Date.now();

    LoggingUtilities.service.info("Fndiscord.Bot.RedeemCommand", `Redeeming ${giftCode} for ${nickname} (FID: ${fid})`);

    // Refresh player
    await postForm("https://kingshot-giftcode.centurygame.com/api/player", { fid, time });

    // Redeem
    const redeemRes = await postForm("https://kingshot-giftcode.centurygame.com/api/gift_code", {
      fid,
      cdk: giftCode,
      captcha_code: "",
      time,
    });

    await redemptionRef.set({
      giftCode,
      redeemedAt: new Date(),
      responseCode: redeemRes?.data?.code ?? -1,
      responseMsg: redeemRes?.data?.msg ?? "Unknown response",
      formData: { fid, cdk: giftCode, captcha_code: "", time },
    });

    if (redeemRes?.data?.code === 0) {
      LoggingUtilities.service.info("Fndiscord.Bot.RedeemCommand", `Success for ${nickname} (${fid})`);
      return `✅ **${nickname}**: Redeemed`;
    }

    LoggingUtilities.service.warn("Fndiscord.Bot.RedeemCommand", `Failed for ${nickname}: ${redeemRes?.data?.msg}`);
    return `⚠️ **${nickname}**: ${redeemRes?.data?.msg ?? "Failed"}`;
  } catch (err: any) {
    LoggingUtilities.service.error(
      "Fndiscord.Bot.RedeemCommand",
      `Error redeeming ${giftCode} for ${nickname}: ${err?.message || err}`
    );

    await redemptionRef.set({
      giftCode,
      redeemedAt: new Date(),
      responseCode: -1,
      responseMsg: "Request failed",
    });

    return `❌ **${nickname}**: Request failed`;
  }
}

/**
 * Send embed batch
 */
async function sendBatchEmbed(message: Message, giftCode: string, batch: string[], processed: number, total: number) {
  const embed = new EmbedBuilder()
    .setTitle(`🎁 Gift Code Redemption`)
    .setColor(0x00ff99)
    .setDescription(`**${giftCode}**\nProgress: ${processed}/${total}`)
    .addFields({ name: "Results", value: batch.join("\n").slice(0, 1024) })
    .setFooter({ text: `Requested by ${message.author.username}` })
    .setTimestamp();

  if (message.channel.type === ChannelType.GuildText) await message.channel.send({ embeds: [embed] });
}

/**
 * Command
 */
export const redeemCommand = {
  name: "redeem",
  description: "Redeem a gift code for all registered governors only for Awense.",

  execute: async (message: Message, args: string[]) => {
    if (!message.channel.isTextBased() || message.channel.type !== ChannelType.GuildText) return;

    LoggingUtilities.service.info(
      "Fndiscord.Bot.RedeemCommand",
      `Command invoked by ${message.author.tag} in ${message.channel.id}`
    );

    if (!ALLOWED_REDEEMER_IDS.includes(message.author.id)) {
      LoggingUtilities.service.warn("Fndiscord.Bot.RedeemCommand", `Unauthorized user ${message.author.tag}`);
      await message.channel.send("⛔ You are not authorized to use this command.");
      return;
    }

    const giftCode = args[0];
    if (!giftCode) {
      await message.channel.send("❌ Usage: `!redeem <giftcode>`");
      return;
    }

    await message.channel.send(`🔄 Starting redemption for **${giftCode}**. This may take a while...`);

    const collections = await db.listCollections();

    let totalGovernors = 0;
    collections.forEach((c) => (totalGovernors += c.id ? 1 : 0));

    let processed = 0;
    let batchResults: string[] = [];

    for (const collection of collections) {
      const snapshot = await collection.get();

      for (const doc of snapshot.docs) {
        processed++;

        const redemptionDoc = await doc.ref.collection("redemptions").doc(giftCode.replace(/\//g, "_")).get();

        const data = doc.data();
        const lastAttempt = redemptionDoc.exists ? redemptionDoc.data() : null;

        if (lastAttempt && lastAttempt.responseCode === 0) {
          LoggingUtilities.service.info("Fndiscord.Bot.RedeemCommand", `Skipping ${data.nickname} - already redeemed`);
          batchResults.push(`⏭️ **${data.nickname ?? "Unknown"}**: Already redeemed`);
        } else {
          const result = await redeemForGovernor(giftCode, doc.ref, data);
          batchResults.push(result);
        }

        // ⏱ Rate-limit protection
        const delay = randomDelay(MIN_DELAY_MS, MAX_DELAY_MS);
        LoggingUtilities.service.debug("Fndiscord.Bot.RedeemCommand", `Sleeping ${delay}ms`);
        await sleep(delay);

        // 🚀 Send embed every batch
        if (batchResults.length >= EMBED_BATCH_SIZE) {
          await sendBatchEmbed(message, giftCode, batchResults, processed, totalGovernors);
          batchResults = [];
        }
      }
    }

    // Final remainder
    if (batchResults.length > 0) {
      await sendBatchEmbed(message, giftCode, batchResults, processed, totalGovernors);
    }

    LoggingUtilities.service.info(
      "Fndiscord.Bot.RedeemCommand",
      `Redemption completed for ${giftCode}. Processed ${processed} governors`
    );
  },
};
