import { Message, ChannelType, EmbedBuilder } from "discord.js";
import axios from "axios";
import { firestoreDB as db } from "../../../config/db/firebase";
import { signPayload } from "./Register.command";
import { LoggingUtilities } from "../../../utils/LoggingUtilities";

const ALLOWED_REDEEMER_IDS = [
  "340529865952460800",
  // add more IDs here if needed
];

/**
 * Helper: sleep for given milliseconds
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helper: get a random integer between min and max (inclusive)
 */
function randomDelay(minMs: number, maxMs: number) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

async function postForm(url: string, payload: Record<string, any>) {
  const sign = signPayload(payload);
  return axios.post(url, new URLSearchParams({ ...payload, sign }), { timeout: 10_000 });
}

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
    LoggingUtilities.service.info(
      "Fndiscord.Bot.RedeemCommand",
      `Redeeming gift code ${giftCode} for ${nickname} (FID: ${fid})`
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
      formData: { fid, cdk: giftCode, captcha_code: "", time },
    });

    if (redeemRes?.data?.code === 0) return `✅ **${nickname}**: Redeemed`;
    return `⚠️ **${nickname}**: ${redeemRes?.data?.msg ?? "Failed"}`;
  } catch (err: any) {
    console.error("Redeem error:", err?.response?.data || err);
    await redemptionRef.set({
      giftCode,
      redeemedAt: new Date(),
      responseCode: -1,
      responseMsg: "Request failed",
    });
    return `❌ **${nickname}**: Request failed`;
  }
}

function chunkArray<T>(arr: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    chunks.push(arr.slice(i, i + chunkSize));
  }
  return chunks;
}

export const redeemCommand = {
  name: "redeem",
  description: "Redeem a gift code for all registered governors",

  execute: async (message: Message, args: string[]) => {
    if (!message.channel.isTextBased() || message.channel.type !== ChannelType.GuildText) return;

    LoggingUtilities.service.info(
      "Fndiscord.Bot.RedeemCommand",
      `Executing redeem command for ${message.author.tag} in channel ${message.channel.id}`
    );

    if (!ALLOWED_REDEEMER_IDS.includes(message.author.id)) {
      LoggingUtilities.service.error(
        "Fndiscord.Bot.RedeemCommand",
        `Unauthorized redeem attempt by ${message.author.tag} (${message.author.id})`
      );
      await message.channel.send("⛔ You are not authorized to use this command.");
      return;
    }

    const giftCode = args[0];
    if (!giftCode) {
      LoggingUtilities.service.error("Fndiscord.Bot.RedeemCommand", `No gift code provided by ${message.author.tag}`);
      await message.channel.send("❌ Usage: `!redeem <giftcode>`");
      return;
    }

    LoggingUtilities.service.info(
      "Fndiscord.Bot.RedeemCommand",
      `Starting redemption for gift code ${giftCode} as requested by ${message.author.tag}`
    );
    await message.channel.send(
      `🔄 Starting redemption for gift code: **${giftCode}**. Processing all governors, please wait...`
    );

    const results: string[] = [];
    const collections = await db.listCollections();
    let processedCount = 0;

    for (const collection of collections) {
      const snapshot = await collection.get();

      for (const doc of snapshot.docs) {
        const redemptions = await doc.ref.collection("redemptions").doc(giftCode.replace(/\//g, "_")).get();

        const data = doc.data();
        const lastAttempt = redemptions.exists ? redemptions.data() : null;
        if (lastAttempt && (lastAttempt.responseCode === 0 || lastAttempt.responseMsg === "RECEIVED.")) {
          LoggingUtilities.service.info(
            "Fndiscord.Bot.RedeemCommand",
            `Skipping ${data.nickname} - already redeemed ${giftCode} successfully`
          );
          results.push(`⏭️ **${data.nickname ?? "Unknown"}**: Already redeemed`);
          continue;
        }

        LoggingUtilities.service.info(
          "Fndiscord.Bot.RedeemCommand",
          `Redeeming ${giftCode} for governor ${data.nickname} (FID: ${data.fid})`
        );

        const result = await redeemForGovernor(giftCode, doc.ref, data);
        results.push(result);

        // ⏱ Add random delay between 0.5s - 1s
        const delayMs = randomDelay(500, 1000);
        LoggingUtilities.service.debug("Fndiscord.Bot.RedeemCommand", `Waiting ${delayMs}ms before next redemption...`);
        await sleep(delayMs);
      }
    }

    // Send results in chunks of 10 per embed
    const chunks = chunkArray(results, 10);
    for (const chunk of chunks) {
      const embed = new EmbedBuilder()
        .setTitle("🎁 Gift Code Redemption")
        .setColor(0x00ff99)
        .addFields({
          name: "Results",
          value: chunk.join("\n") || "No registered governors",
        })
        .setFooter({ text: `Requested by ${message.author.username}` })
        .setTimestamp();
      await message.channel.send({ embeds: [embed] });
    }

    LoggingUtilities.service.info(
      "Fndiscord.Bot.RedeemCommand",
      `Finished redemption for gift code ${giftCode}. Total governors processed: ${processedCount}`
    );
  },
};
