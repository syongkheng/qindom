import { Message, ChannelType, EmbedBuilder } from "discord.js";
import axios from "axios";
import { firestoreDB as db } from "../../../config/db/firebase";
import { signPayload } from "./Register.command";
import { LoggingUtilities } from "../../../utils/LoggingUtilities";
import { toMessage } from "../../../utils/errorUtils";

const ALLOWED_REDEEMER_IDS = ["340529865952460800", "383607274624778241"];
const EMBED_BATCH_SIZE = 10;
const MIN_DELAY_MS = 800;
const MAX_DELAY_MS = 1200;
const RETRY_DELAY_MS = 3000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const randomDelay = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

async function postForm(url: string, payload: Record<string, any>): Promise<any> {
  const sign = signPayload(payload);
  return axios.post(
    url,
    new URLSearchParams({ ...payload, sign }),
    { timeout: 10_000 }
  );
}

type RedeemOutcome = "redeemed" | "failed" | "skipped" | "errored";

interface RedeemResult {
  line: string;
  outcome: RedeemOutcome;
}

async function redeemForGovernor(
  giftCode: string,
  docRef: FirebaseFirestore.DocumentReference,
  data: any,
  attempt = 1
): Promise<RedeemResult> {
  const fid = data.fid;
  const nickname = data.nickname ?? "Unknown";
  const redemptionRef = docRef.collection("redemptions").doc(giftCode.replace(/\//g, "_"));

  try {
    const time = Date.now();

    LoggingUtilities.service.info(
      "Fndiscord.Bot.RedeemCommand",
      `Redeeming ${giftCode} for ${nickname} (FID: ${fid}), attempt ${attempt}`
    );

    await postForm("https://kingshot-giftcode.centurygame.com/api/player", { fid, time });

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
    });

    if (redeemRes?.data?.code === 0) {
      LoggingUtilities.service.info("Fndiscord.Bot.RedeemCommand", `Success for ${nickname} (${fid})`);
      return { line: `✅ **${nickname}**: Redeemed`, outcome: "redeemed" };
    }

    LoggingUtilities.service.warn("Fndiscord.Bot.RedeemCommand", `Failed for ${nickname}: ${redeemRes?.data?.msg}`);
    return { line: `⚠️ **${nickname}**: ${redeemRes?.data?.msg ?? "Failed"}`, outcome: "failed" };
  } catch (err) {
    if (attempt === 1) {
      LoggingUtilities.service.warn(
        "Fndiscord.Bot.RedeemCommand",
        `Transient error for ${nickname}, retrying in ${RETRY_DELAY_MS}ms: ${toMessage(err)}`
      );
      await sleep(RETRY_DELAY_MS);
      return redeemForGovernor(giftCode, docRef, data, 2);
    }

    LoggingUtilities.service.error(
      "Fndiscord.Bot.RedeemCommand",
      `Error redeeming ${giftCode} for ${nickname} after retry: ${toMessage(err)}`
    );

    await redemptionRef.set({
      giftCode,
      redeemedAt: new Date(),
      responseCode: -1,
      responseMsg: "Request failed",
    });

    return { line: `❌ **${nickname}**: Request failed`, outcome: "errored" };
  }
}

async function sendBatchEmbed(
  message: Message,
  giftCode: string,
  batch: string[],
  processed: number,
  total: number
): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle("🎁 Gift Code Redemption")
    .setColor(0x00ff99)
    .setDescription(`**${giftCode}**\nProgress: ${processed}/${total}`)
    .addFields({ name: "Results", value: batch.join("\n").slice(0, 1024) })
    .setFooter({ text: `Requested by ${message.author.username}` })
    .setTimestamp();

  if (message.channel.type === ChannelType.GuildText) {
    await message.channel.send({ embeds: [embed] });
  }
}

async function sendSummaryEmbed(
  message: Message,
  giftCode: string,
  counts: { redeemed: number; failed: number; skipped: number; errored: number },
  total: number
): Promise<void> {
  const color =
    counts.errored > 0 ? 0xff4444 :
    counts.failed > 0 ? 0xffaa00 :
    0x00ff99;

  const embed = new EmbedBuilder()
    .setTitle("🏁 Redemption Complete")
    .setColor(color)
    .setDescription(`**${giftCode}** — ${total} governor${total !== 1 ? "s" : ""} processed`)
    .addFields(
      { name: "✅ Redeemed", value: `${counts.redeemed}`, inline: true },
      { name: "⚠️ Failed", value: `${counts.failed}`, inline: true },
      { name: "⏭️ Skipped", value: `${counts.skipped}`, inline: true },
      { name: "❌ Errored", value: `${counts.errored}`, inline: true }
    )
    .setFooter({ text: `Requested by ${message.author.username}` })
    .setTimestamp();

  if (message.channel.type === ChannelType.GuildText) {
    await message.channel.send({ embeds: [embed] });
  }
}

export const redeemCommand = {
  name: "redeem",
  description: "Redeem a gift code for all registered governors only for Awense/Ipuda.",

  execute: async (message: Message, args: string[]): Promise<void> => {
    if (!message.channel.isTextBased() || message.channel.type !== ChannelType.GuildText) return;

    LoggingUtilities.service.info(
      "Fndiscord.Bot.RedeemCommand",
      `Command invoked by ${message.author.tag} in ${message.channel.id}`
    );

    // Authorization check
    if (!ALLOWED_REDEEMER_IDS.includes(message.author.id)) {
      LoggingUtilities.service.warn("Fndiscord.Bot.RedeemCommand", `Unauthorized user ${message.author.tag}`);
      await message.channel.send("⛔ You are not authorized to use this command.");
      return;
    }

    // Validate gift code
    const giftCode = args[0];
    if (!giftCode) {
      await message.channel.send("❌ Usage: `!redeem <giftcode>`");
      return;
    }

    // Acknowledge instantly with a reaction so the user knows the bot received the command
    await message.react("⏳");

    // Fetch all governor collections
    const collections = await db.listCollections();
    const governorCollections = collections.filter((c) => c.id && /^\d+$/.test(c.id));
    const total = governorCollections.length;

    await message.channel.send(
      `🔄 Starting redemption for **${giftCode}** across **${total}** governor${total !== 1 ? "s" : ""}...`
    );

    let processed = 0;
    let batchResults: string[] = [];
    const counts = { redeemed: 0, failed: 0, skipped: 0, errored: 0 };

    for (const collection of governorCollections) {
      // Only process the latest registration doc per governor
      const snapshot = await collection.orderBy("registeredAt", "desc").limit(1).get();

      if (snapshot.empty) continue;

      const doc = snapshot.docs[0];
      const data = doc.data();
      processed++;

      // Check for a prior successful redemption in Firestore
      const redemptionDoc = await doc.ref.collection("redemptions").doc(giftCode.replace(/\//g, "_")).get();
      const lastAttempt = redemptionDoc.exists ? redemptionDoc.data() : null;

      if (lastAttempt && lastAttempt.responseCode === 0) {
        LoggingUtilities.service.info("Fndiscord.Bot.RedeemCommand", `Skipping ${data.nickname} — already redeemed`);
        batchResults.push(`⏭️ **${data.nickname ?? "Unknown"}**: Already redeemed`);
        counts.skipped++;
        // No sleep — no API call was made
      } else {
        const result = await redeemForGovernor(giftCode, doc.ref, data);
        batchResults.push(result.line);
        counts[result.outcome]++;
        // Rate-limit only after actual API calls
        const delay = randomDelay(MIN_DELAY_MS, MAX_DELAY_MS);
        LoggingUtilities.service.debug("Fndiscord.Bot.RedeemCommand", `Sleeping ${delay}ms`);
        await sleep(delay);
      }

      if (batchResults.length >= EMBED_BATCH_SIZE) {
        await sendBatchEmbed(message, giftCode, batchResults, processed, total);
        batchResults = [];
      }
    }

    // Flush any remaining results
    if (batchResults.length > 0) {
      await sendBatchEmbed(message, giftCode, batchResults, processed, total);
    }

    // Send final summary embed
    await sendSummaryEmbed(message, giftCode, counts, processed);

    // Swap ⏳ reaction for ✅ on the original command message
    try {
      const pending = message.reactions.cache.get("⏳");
      if (pending) await pending.remove();
      await message.react("✅");
    } catch {
      // Reaction cleanup is non-critical — bot may lack permission
    }

    LoggingUtilities.service.info(
      "Fndiscord.Bot.RedeemCommand",
      `Redemption complete for ${giftCode}. Processed ${processed} governors. ${JSON.stringify(counts)}`
    );
  },
};
