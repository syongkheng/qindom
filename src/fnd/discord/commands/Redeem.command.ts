import { Message, ChannelType, EmbedBuilder } from "discord.js";
import axios from "axios";
import { firestoreDB as db } from "../../../config/db/firebase";
import { signPayload } from "./Register.command";
import { LoggingUtilities } from "../../../utils/LoggingUtilities";

/**
 * Redeem command for batch gift code redemption across all registered governors.
 *
 * This command performs mass gift code redemption through the KingShot game API
 * for all registered governors in the Firebase database. It features rate limiting,
 * duplicate prevention, progress tracking, and detailed result reporting.
 *
 * WARNING: This command requires authorized user permissions due to its
 *          ability to perform actions across all registered accounts.
 *
 * @module RedeemCommand
 * @type {Command}
 *
 * @example
 * // Authorized user types "!redeem GIFT-CODE-123"
 * // Bot responds with progress updates and final results for all governors
 *
 * @see {@link Register.command} - For signPayload utility and registration structure
 * @see {@link firestoreDB} - For Firestore database interaction
 * @see {@link axios} - For HTTP requests to game API
 */

/**
 * Configuration constants for the redeem command
 * @namespace RedeemConfiguration
 */

/**
 * Discord user IDs authorized to execute the redeem command
 * @constant {string[]}
 */
const ALLOWED_REDEEMER_IDS = ["340529865952460800"];

/**
 * Number of redemption results to batch per embed message
 * Discord embed field values have a 1024 character limit
 * @constant {number}
 */
const EMBED_BATCH_SIZE = 10;

/**
 * Minimum delay between API calls in milliseconds for rate limiting
 * @constant {number}
 */
const MIN_DELAY_MS = 800;

/**
 * Maximum delay between API calls in milliseconds for rate limiting
 * @constant {number}
 */
const MAX_DELAY_MS = 1200;

/**
 * Utility functions for the redeem command
 * @namespace RedeemUtilities
 */

/**
 * Pauses execution for the specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>} Resolves after the specified time
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Generates a random delay between min and max values
 * @param {number} min - Minimum delay in milliseconds
 * @param {number} max - Maximum delay in milliseconds
 * @returns {number} Random delay within the specified range
 */
const randomDelay = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Sends a POST request with form-encoded data and signature
 * @async
 * @param {string} url - API endpoint URL
 * @param {Record<string, any>} payload - Request payload data
 * @returns {Promise<any>} Axios response object
 * @throws {Error} If request times out or fails
 *
 * @example
 * // Example payload: { fid: "12345", cdk: "GIFT123", time: 1640995200000 }
 */
async function postForm(url: string, payload: Record<string, any>): Promise<any> {
  const sign = signPayload(payload);
  return axios.post(
    url,
    new URLSearchParams({ ...payload, sign }),
    { timeout: 10_000 } // 10 second timeout
  );
}

/**
 * Redeem logic for a single governor's gift code
 * @async
 * @param {string} giftCode - The gift code to redeem
 * @param {FirebaseFirestore.DocumentReference} docRef - Firestore document reference for the governor
 * @param {any} data - Governor's registration data
 * @returns {Promise<string>} Formatted result message for this governor
 *
 * @example
 * // Returns: "✅ **JohnDoe**: Redeemed"
 * // Or: "⚠️ **JohnDoe**: Invalid gift code"
 * // Or: "❌ **JohnDoe**: Request failed"
 */
async function redeemForGovernor(
  giftCode: string,
  docRef: FirebaseFirestore.DocumentReference,
  data: any
): Promise<string> {
  const fid = data.fid;
  const nickname = data.nickname ?? "Unknown";

  // Create a sanitized document ID for the redemption record
  const redemptionRef = docRef.collection("redemptions").doc(giftCode.replace(/\//g, "_"));

  try {
    const time = Date.now();

    LoggingUtilities.service.info("Fndiscord.Bot.RedeemCommand", `Redeeming ${giftCode} for ${nickname} (FID: ${fid})`);

    // Step 1: Refresh player session before redemption
    await postForm("https://kingshot-giftcode.centurygame.com/api/player", { fid, time });

    // Step 2: Redeem the gift code
    const redeemRes = await postForm("https://kingshot-giftcode.centurygame.com/api/gift_code", {
      fid,
      cdk: giftCode,
      captcha_code: "",
      time,
    });

    // Step 3: Record redemption attempt in Firestore
    await redemptionRef.set({
      giftCode,
      redeemedAt: new Date(),
      responseCode: redeemRes?.data?.code ?? -1,
      responseMsg: redeemRes?.data?.msg ?? "Unknown response",
      formData: { fid, cdk: giftCode, captcha_code: "", time },
    });

    // Step 4: Interpret response
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

    // Record failure in Firestore
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
 * Sends a batch of redemption results as a Discord embed
 * @async
 * @param {Message} message - Original Discord message that triggered the command
 * @param {string} giftCode - The gift code being redeemed
 * @param {string[]} batch - Array of result messages for this batch
 * @param {number} processed - Number of governors processed so far
 * @param {number} total - Total number of governors to process
 * @returns {Promise<void>} Resolves when embed is sent
 */
async function sendBatchEmbed(
  message: Message,
  giftCode: string,
  batch: string[],
  processed: number,
  total: number
): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle(`🎁 Gift Code Redemption`)
    .setColor(0x00ff99) // Consistent green-teal brand color
    .setDescription(`**${giftCode}**\nProgress: ${processed}/${total}`)
    .addFields({
      name: "Results",
      value: batch.join("\n").slice(0, 1024), // Respect Discord field value limit
    })
    .setFooter({ text: `Requested by ${message.author.username}` })
    .setTimestamp(); // Add current timestamp for context

  if (message.channel.type === ChannelType.GuildText) {
    await message.channel.send({ embeds: [embed] });
  }
}

/**
 * Main redeem command object
 * @type {Command}
 */
export const redeemCommand = {
  /** Command trigger that users will type (e.g., "!redeem GIFT123") */
  name: "redeem",

  /** Brief description shown in help commands */
  description: "Redeem a gift code for all registered governors only for Awense.",

  /**
   * Executes the mass redemption command for a gift code across all registered governors.
   *
   * This function performs the following operations:
   * 1. Validates user authorization against ALLOWED_REDEEMER_IDS
   * 2. Validates the gift code argument is provided
   * 3. Fetches all governor collections from Firestore
   * 4. Processes each governor with rate limiting and duplicate prevention
   * 5. Sends progress updates in batches via Discord embeds
   * 6. Records all attempts in Firestore for audit trail
   *
   * @async
   * @param {Message} message - The Discord message that triggered the command
   * @param {string[]} args - Command arguments [0] should contain the gift code
   * @returns {Promise<void>} Resolves when all governors have been processed
   *
   * @throws {Error} If API calls fail, errors are logged and user receives status updates
   *
   * @example
   * // Command flow example:
   * // 1. User: !redeem NEWYEAR2024
   * // 2. Bot: "🔄 Starting redemption for **NEWYEAR2024**. This may take a while..."
   * // 3. Bot: [Sends progress embeds every 10 governors]
   * // 4. Bot: [Final embed with all results]
   *
   * @example
   * // Error scenarios:
   * // 1. Unauthorized user: "⛔ You are not authorized to use this command."
   * // 2. Missing gift code: "❌ Usage: !redeem <giftcode>"
   */
  execute: async (message: Message, args: string[]): Promise<void> => {
    // Validate command execution context - only allow in guild text channels
    if (!message.channel.isTextBased() || message.channel.type !== ChannelType.GuildText) {
      return;
    }

    LoggingUtilities.service.info(
      "Fndiscord.Bot.RedeemCommand",
      `Command invoked by ${message.author.tag} in ${message.channel.id}`
    );

    // Step 1: Authorization check
    if (!ALLOWED_REDEEMER_IDS.includes(message.author.id)) {
      LoggingUtilities.service.warn("Fndiscord.Bot.RedeemCommand", `Unauthorized user ${message.author.tag}`);
      await message.channel.send("⛔ You are not authorized to use this command.");
      return;
    }

    // Step 2: Validate gift code argument
    const giftCode = args[0];
    if (!giftCode) {
      await message.channel.send("❌ Usage: `!redeem <giftcode>`");
      return;
    }

    // Step 3: Send initial progress message
    await message.channel.send(`🔄 Starting redemption for **${giftCode}**. This may take a while...`);

    // Step 4: Fetch all governor collections
    const collections = await db.listCollections();

    const collectionsThatStartsWithNumeric = collections.filter((c) => {
      return c.id && /^\d+$/.test(c.id);
    });

    // Calculate total governors for progress tracking
    let totalGovernors = collectionsThatStartsWithNumeric.length;


    // Step 5: Process each governor
    let processed = 0;
    let batchResults: string[] = [];

    for (const collection of collectionsThatStartsWithNumeric) {
      const snapshot = await collection.get();

      for (const doc of snapshot.docs) {
        processed++;

        // Check if this gift code was already redeemed for this governor
        const redemptionDoc = await doc.ref.collection("redemptions").doc(giftCode.replace(/\//g, "_")).get();

        const data = doc.data();
        const lastAttempt = redemptionDoc.exists ? redemptionDoc.data() : null;

        if (lastAttempt && lastAttempt.responseCode === 0) {
          // Skip already successful redemptions
          LoggingUtilities.service.info("Fndiscord.Bot.RedeemCommand", `Skipping ${data.nickname} - already redeemed`);
          batchResults.push(`⏭️ **${data.nickname ?? "Unknown"}**: Already redeemed`);
        } else {
          // Attempt redemption
          const result = await redeemForGovernor(giftCode, doc.ref, data);
          batchResults.push(result);
        }

        // Step 6: Rate limiting between API calls
        const delay = randomDelay(MIN_DELAY_MS, MAX_DELAY_MS);
        LoggingUtilities.service.debug("Fndiscord.Bot.RedeemCommand", `Sleeping ${delay}ms`);
        await sleep(delay);

        // Step 7: Send progress embed when batch is full
        if (batchResults.length >= EMBED_BATCH_SIZE) {
          await sendBatchEmbed(message, giftCode, batchResults, processed, totalGovernors);
          batchResults = []; // Reset batch
        }
      }
    }

    // Step 8: Send final batch if any remain
    if (batchResults.length > 0) {
      await sendBatchEmbed(message, giftCode, batchResults, processed, totalGovernors);
    }

    // Step 9: Log completion
    LoggingUtilities.service.info(
      "Fndiscord.Bot.RedeemCommand",
      `Redemption completed for ${giftCode}. Processed ${processed} governors`
    );
  },
};
