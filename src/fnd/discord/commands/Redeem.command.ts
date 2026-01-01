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
 * Helper: safely post form data
 */
async function postForm(url: string, payload: Record<string, any>) {
  const sign = signPayload(payload);

  return axios.post(
    url,
    new URLSearchParams({
      ...payload,
      sign,
    }),
    { timeout: 10_000 }
  );
}

/**
 * Redeem gift code for a single governor
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

    // 🔁 Refresh player info
    LoggingUtilities.service.info(
      "Fndiscord.Bot.RedeemCommand",
      `Refreshing player info for ${nickname} (FID: ${fid}) before redeeming ${giftCode}`
    );
    await postForm("https://kingshot-giftcode.centurygame.com/api/player", { fid, time });

    // 🎁 Redeem gift code
    LoggingUtilities.service.info(
      "Fndiscord.Bot.RedeemCommand",
      `Redeeming gift code ${giftCode} for ${nickname} (FID: ${fid})`
    );
    const redeemRes = await postForm("https://kingshot-giftcode.centurygame.com/api/gift_code", {
      fid,
      cdk: giftCode,
      captcha_code: "",
      time,
    });

    // 💾 Persist redemption (Firestore-safe)
    await redemptionRef.set({
      giftCode,
      redeemedAt: new Date(),
      responseCode: redeemRes?.data?.code ?? -1,
      responseMsg: redeemRes?.data?.msg ?? "Unknown response",
    });

    if (redeemRes?.data?.code === 0) {
      LoggingUtilities.service.info(
        "Fndiscord.Bot.RedeemCommand",
        `Successfully redeemed ${giftCode} for ${nickname} (FID: ${fid})`
      );
      return `✅ **${nickname}**: Redeemed`;
    }

    LoggingUtilities.service.warn(
      "Fndiscord.Bot.RedeemCommand",
      `Failed to redeem ${giftCode} for ${nickname} (FID: ${fid}): ${redeemRes?.data?.msg ?? "Unknown error"}`
    );
    return `⚠️ **${nickname}**: ${redeemRes?.data?.msg ?? "Failed"}`;
  } catch (err: any) {
    console.error("Redeem error:", err?.response?.data || err);

    // Persist failure
    await redemptionRef.set({
      giftCode,
      redeemedAt: new Date(),
      responseCode: -1,
      responseMsg: "Request failed",
    });

    LoggingUtilities.service.error(
      "Fndiscord.Bot.RedeemCommand",
      `Error redeeming ${giftCode} for ${nickname} (FID: ${fid}): ${err?.message || err}`
    );

    return `❌ **${nickname}**: Request failed`;
  }
}

export const redeemCommand = {
  name: "redeem",
  description: "Redeem a gift code for all registered governors",

  execute: async (message: Message, args: string[]) => {
    if (!message.channel.isTextBased() || message.channel.type !== ChannelType.GuildText) return;

    LoggingUtilities.service.info(
      `Fndiscord.Bot.RedeemCommand`,
      `Executing redeem command for ${message.author.tag} in channel ${message.channel.id}`
    );

    // 🔐 Authorization check
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
    await message.channel.send(`🔄 Starting redemption for gift code: **${giftCode}**, may take a while...`);

    const embed = new EmbedBuilder()
      .setTitle("🎁 Gift Code Redemption")
      .setColor(0x00ff99)
      .setDescription(`Redeeming gift code: **${giftCode}**`)
      .setFooter({ text: `Requested by ${message.author.username}` })
      .setTimestamp();

    const results: string[] = [];

    // 🔥 Iterate all governor collections
    const collections = await db.listCollections();

    for (const collection of collections) {
      const snapshot = await collection.get();

      for (const doc of snapshot.docs) {
        const redemptions = await doc.ref.collection("redemptions").doc(giftCode.replace(/\//g, "_")).get();

        // Only retry if:
        // 1. Never redeemed
        // 2. Last attempt was unsuccessful
        const data = doc.data();
        const lastAttempt = redemptions.exists ? redemptions.data() : null;
        if (lastAttempt && (lastAttempt.responseCode === 0 || lastAttempt.responseMsg === "RECEIVED.")) {
          LoggingUtilities.service.info(
            "Fndiscord.Bot.RedeemCommand",
            `Skipping ${data.nickname} - already redeemed ${giftCode} successfully  - ${lastAttempt.responseCode}`
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
      }
    }

    // 📄 Embed field (Discord limit 1024)
    embed.addFields({
      name: "Results",
      value: results.join("\n").slice(0, 1024) || "No registered governors",
    });

    await message.channel.send({ embeds: [embed] });
  },
};
