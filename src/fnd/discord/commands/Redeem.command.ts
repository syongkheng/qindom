import { Message, ChannelType, EmbedBuilder, TextChannel } from "discord.js";
import axios from "axios";
import crypto from "crypto";
import { firestoreDB as db } from "../../../config/db/firebase";
import { IRequestLogContext } from "../../../models/IRequestLogContext";
import { signPayload } from "./Register.command";
import { LoggingUtilities } from "../../../utils/logging/LoggingUtilities";
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
  redemptionId: string,
  attempt = 1
): Promise<RedeemResult> {
  const fid = data.fid;
  const nickname = data.nickname ?? "Unknown";
  const redemptionRef = docRef.collection("redemptions").doc(giftCode.replace(/\//g, "_"));

  try {
    const time = Date.now();

    if (process.env.NODE_ENV !== "prd") {
      const mockOutcomes: Array<{ line: string; outcome: RedeemOutcome }> = [
        { line: `✅ **${nickname}**: [DEV] Mocked — redeemed`, outcome: "redeemed" },
        { line: `⚠️ **${nickname}**: [DEV] Mocked — already used`, outcome: "failed" },
        { line: `❌ **${nickname}**: [DEV] Mocked — request failed`, outcome: "errored" },
      ];
      return mockOutcomes[Number(fid) % 3];
    }

    LoggingUtilities.service.info(
      "Fndiscord.Bot.RedeemCommand",
      `[${redemptionId}] Redeeming ${giftCode} for ${nickname} (FID: ${fid}), attempt ${attempt}`
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
      LoggingUtilities.service.info("Fndiscord.Bot.RedeemCommand", `[${redemptionId}] Success for ${nickname} (${fid})`);
      return { line: `✅ **${nickname}**: Redeemed`, outcome: "redeemed" };
    }

    LoggingUtilities.service.warn("Fndiscord.Bot.RedeemCommand", `[${redemptionId}] Failed for ${nickname}: ${redeemRes?.data?.msg}`);
    return { line: `⚠️ **${nickname}**: ${redeemRes?.data?.msg ?? "Failed"}`, outcome: "failed" };
  } catch (err) {
    if (attempt === 1) {
      LoggingUtilities.service.warn(
        "Fndiscord.Bot.RedeemCommand",
        `[${redemptionId}] Transient error for ${nickname}, retrying in ${RETRY_DELAY_MS}ms: ${toMessage(err)}`
      );
      await sleep(RETRY_DELAY_MS);
      return redeemForGovernor(giftCode, docRef, data, redemptionId, 2);
    }

    LoggingUtilities.service.error(
      "Fndiscord.Bot.RedeemCommand",
      `[${redemptionId}] Error redeeming ${giftCode} for ${nickname} after retry: ${toMessage(err)}`
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
  channel: TextChannel,
  giftCode: string,
  batch: string[],
  processed: number,
  total: number,
  triggeredBy: string
): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle("🎁 Gift Code Redemption")
    .setColor(0x00ff99)
    .setDescription(`**${giftCode}**\nProgress: ${processed}/${total}`)
    .addFields({ name: "Results", value: batch.join("\n").slice(0, 1024) })
    .setFooter({ text: `Requested by ${triggeredBy}` })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

async function sendSummaryEmbed(
  channel: TextChannel,
  giftCode: string,
  counts: { redeemed: number; failed: number; skipped: number; errored: number },
  total: number,
  triggeredBy: string
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
    .setFooter({ text: `Requested by ${triggeredBy}` })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

export async function executeRedemption(
  giftCode: string,
  channel: TextChannel,
  triggeredBy: string
): Promise<void> {
  const redemptionId = "disc_" + crypto.randomUUID().replace(/-/g, "").substring(0, 5);

  const collections = await db.listCollections();
  const governorCollections = collections.filter((c) => c.id && /^\d+$/.test(c.id));
  const total = governorCollections.length;

  const logCtx: IRequestLogContext = {
    requestId: redemptionId,
    startTime: Date.now(),
    protocol: "DISCORD",
    method: "Redeem",
    path: giftCode,
    ip: triggeredBy,
    payload: { governors: total },
    events: [],
  };

  LoggingUtilities.service.info(
    "Fndiscord.Bot.RedeemCommand",
    `[${redemptionId}] Starting redemption for ${giftCode} across ${total} governor${total !== 1 ? "s" : ""}`
  );

  await channel.send(
    `🔄 Starting redemption for **${giftCode}** across **${total}** governor${total !== 1 ? "s" : ""}...`
  );

  let processed = 0;
  let batchResults: string[] = [];
  const counts = { redeemed: 0, failed: 0, skipped: 0, errored: 0 };

  for (const collection of governorCollections) {
    const snapshot = await collection.orderBy("registeredAt", "desc").limit(1).get();

    if (snapshot.empty) continue;

    const doc = snapshot.docs[0];
    const data = doc.data();
    const fid = data.fid;
    const nickname = data.nickname ?? "Unknown";
    processed++;

    const redemptionDoc = await doc.ref.collection("redemptions").doc(giftCode.replace(/\//g, "_")).get();
    const lastAttempt = redemptionDoc.exists ? redemptionDoc.data() : null;

    if (lastAttempt && lastAttempt.responseCode === 0) {
      LoggingUtilities.service.info("Fndiscord.Bot.RedeemCommand", `[${redemptionId}] Skipping ${nickname} — already redeemed`);
      const skipLine = `⏭️ **${nickname}**: Already redeemed`;
      batchResults.push(skipLine);
      counts.skipped++;
      LoggingUtilities.request.branch(logCtx, "DISCORD", `${nickname} (${fid})`, skipLine, 0);
    } else {
      const govStart = Date.now();
      const result = await redeemForGovernor(giftCode, doc.ref, data, redemptionId);
      const govDuration = Date.now() - govStart;
      batchResults.push(result.line);
      counts[result.outcome]++;
      LoggingUtilities.request.branch(logCtx, "DISCORD", `${nickname} (${fid})`, result.line, govDuration);
      const delay = randomDelay(MIN_DELAY_MS, MAX_DELAY_MS);
      LoggingUtilities.service.debug("Fndiscord.Bot.RedeemCommand", `[${redemptionId}] Sleeping ${delay}ms`);
      await sleep(delay);
    }

    if (batchResults.length >= EMBED_BATCH_SIZE) {
      await sendBatchEmbed(channel, giftCode, batchResults, processed, total, triggeredBy);
      batchResults = [];
    }
  }

  if (batchResults.length > 0) {
    await sendBatchEmbed(channel, giftCode, batchResults, processed, total, triggeredBy);
  }

  await sendSummaryEmbed(channel, giftCode, counts, processed, triggeredBy);

  LoggingUtilities.request.response(logCtx, counts.errored > 0 ? 1 : 0, counts);
  LoggingUtilities.request.flush(logCtx);

  LoggingUtilities.service.info(
    "Fndiscord.Bot.RedeemCommand",
    `[${redemptionId}] Redemption complete for ${giftCode}. Processed ${processed} governors. ${JSON.stringify(counts)}`
  );
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

    await message.react("⏳");

    await executeRedemption(giftCode, message.channel as TextChannel, message.author.username);

    try {
      const pending = message.reactions.cache.get("⏳");
      if (pending) await pending.remove();
      await message.react("✅");
    } catch {
      // Reaction cleanup is non-critical — bot may lack permission
    }
  },
};
