import { Message, ChannelType, EmbedBuilder } from "discord.js";
import crypto from "crypto";
import { firestoreDB } from "../../../config/db/firebase.js";
import { LoggingUtilities } from "../../../utils/logging/LoggingUtilities.js";

/**
 * Secret key for API signature generation.
 * Used in conjunction with the game's signing algorithm.
 * @constant {string}
 */
const SECRET = process.env.KS_CLIENT_SECRET_PUB;

/**
 * Utility Functions
 * @namespace RegisterUtilities
 */

/**
 * Gets the current timestamp in milliseconds.
 * Used for API request signatures to ensure uniqueness.
 * @returns {number} Current Unix timestamp in milliseconds
 *
 * @example
 * // Returns: 1640995200000
 */
export function currentTimestampMs(): number {
  return Date.now();
}

/**
 * Generates an MD5 signature for API payloads following the game's authentication protocol.
 *
 * This function replicates the Python signing logic used by the KingShot game API:
 * 1. Sorts payload keys alphabetically
 * 2. Joins key-value pairs with "=" into a string
 * 3. Concatenates all pairs with "&"
 * 4. Appends the SECRET key
 * 5. Generates MD5 hash of the resulting string
 *
 * @param {Record<string, any>} payload - The payload object to sign
 * @returns {string} MD5 hex digest of the signed payload
 *
 * @example
 * // Input: { fid: 41579499, time: 1640995200000 }
 * // Returns: "d41d8cd98f00b204e9800998ecf8427e"
 *
 * @throws {Error} If MD5 hash generation fails
 */
export function signPayload(payload: Record<string, any>): string {
  // Sort keys alphabetically to ensure consistent ordering
  const keys = Object.keys(payload).sort();
  const parts: string[] = [];

  for (const key of keys) {
    let value = payload[key];
    // Stringify objects for consistent hashing
    if (typeof value === "object") value = JSON.stringify(value);
    parts.push(`${key}=${value}`);
  }

  // Recreate the signing algorithm: join with "&" and append secret
  const baseString = parts.join("&") + SECRET;
  return crypto.createHash("md5").update(baseString, "utf8").digest("hex");
}

/**
 * Maps numeric stove levels to display-friendly format with tier groupings.
 *
 * KingShot uses stove levels 1-34 as direct numbers, then groups 35+ into tiers (TG1-TG5).
 * This function converts the numeric stove level to the appropriate display format.
 *
 * @param {number} stoveLv - Numeric stove level from the game API
 * @returns {string} Formatted stove level for display
 *
 * @example
 * // Input: 25 → Returns: "25"
 * // Input: 38 → Returns: "TG1"
 * // Input: 55 → Returns: "TG5"
 */
export function mapStoveLevel(stoveLv: number): string {
  if (stoveLv >= 1 && stoveLv <= 34) return stoveLv.toString();
  if (stoveLv >= 35 && stoveLv <= 39) return "TG1";
  if (stoveLv >= 40 && stoveLv <= 44) return "TG2";
  if (stoveLv >= 45 && stoveLv <= 49) return "TG3";
  if (stoveLv >= 50 && stoveLv <= 54) return "TG4";
  if (stoveLv >= 55) return "TG5";
  return stoveLv.toString(); // fallback for unexpected values
}

/**
 * Register command for linking Discord users with their KingShot game accounts.
 *
 * This command validates a governor ID through the game API, stores the account
 * information in Firestore, and enables the user for future gift code redemptions.
 *
 * @module RegisterCommand
 * @type {Command}
 *
 * @example
 * // User types "!register 41579499"
 * // Bot validates with KingShot API, stores data, and sends confirmation embed
 *
 * @see {@link signPayload} - For API authentication
 * @see {@link mapStoveLevel} - For stove level formatting
 * @see {@link firestoreDB} - For Firestore database interaction
 */
export const registerCommand = {
  /** Command trigger that users will type (e.g., "!register 41579499") */
  name: "register",

  /** Brief description shown in help commands */
  description: "Register your governor ID for auto redeeming gift codes.",

  /**
   * Executes the registration command to link a Discord user with their KingShot account.
   *
   * This function performs the following operations:
   * 1. Validates the execution context and governor ID format
   * 2. Constructs and signs the authentication payload
   * 3. Verifies the governor ID with the KingShot API
   * 4. Stores verified account data in Firestore
   * 5. Sends a confirmation embed with account details
   *
   * @async
   * @param {Message} message - The Discord message that triggered the command
   * @param {string[]} args - Command arguments [0] should contain the governor ID
   * @param {Map<string, any>} [commands] - Map of all registered commands (unused in this command)
   * @returns {Promise<void>} Resolves when registration completes or fails
   *
   * @throws {Error} Various errors during validation, API calls, or database operations
   *
   * @example
   * // Successful registration flow:
   * // 1. User: !register 41579499
   * // 2. Bot: [Validates with KingShot API]
   * // 3. Bot: [Stores data in Firestore]
   * // 4. Bot: Sends embed with account details
   *
   * @example
   * // Error scenarios:
   * // 1. Missing governor ID: "❌ You must provide a governor ID. Example: `!register 41579499`"
   * // 2. Invalid format: "❌ Invalid governor ID. It must be a numeric value."
   * // 3. API error: "❌ Server returned an error: [error message]"
   */
  execute: async (message: Message, args: string[], commands?: Map<string, any>): Promise<void> => {
    // Validate command execution context - only allow in guild text channels
    if (!message.channel.isTextBased() || message.channel.type !== ChannelType.GuildText) {
      return;
    }

    // Log command execution for monitoring and audit trail
    LoggingUtilities.service.info(
      `Fndiscord.Bot.RegisterCommand`,
      `Executing register command for ${message.author.tag} in channel ${message.channel.id}`
    );

    // Debug logging for troubleshooting input issues
    LoggingUtilities.service.debug("Fndiscord.Bot.RegisterCommand", `Command arguments: ${JSON.stringify(args)}`);

    /**
     * Registration Process Phase 1: Input Validation
     * ----------------------------------------------
     */

    const userInput = args[0];

    // Check if governor ID was provided
    if (!userInput) {
      LoggingUtilities.service.error(
        "Fndiscord.Bot.RegisterCommand",
        `No governor ID provided by ${message.author.tag}`
      );
      await message.channel.send("❌ You must provide a governor ID. Example: `!register 41579499`");
      return;
    }

    // Validate that governor ID is numeric
    if (isNaN(Number(userInput))) {
      LoggingUtilities.service.error(
        "Fndiscord.Bot.RegisterCommand",
        `Invalid governor ID provided by ${message.author.tag}: ${userInput}`
      );
      await message.channel.send("❌ Invalid governor ID. It must be a numeric value.");
      return;
    }

    /**
     * Registration Process Phase 2: Payload Construction
     * --------------------------------------------------
     */

    const payload: Record<string, any> = {
      fid: Number(userInput), // Governor ID (FID = Governor ID in KingShot)
      time: currentTimestampMs(), // Current timestamp for request uniqueness
    };

    // Generate signature using the game's authentication algorithm
    payload.sign = signPayload(payload);

    /**
     * Registration Process Phase 3: API Verification
     * ----------------------------------------------
     */

    let serverResponse: any;
    try {
      // Convert payload to URL-encoded form data for API submission
      const formData = new URLSearchParams();
      formData.append("fid", payload.fid.toString());
      formData.append("time", payload.time.toString());
      formData.append("sign", payload.sign);

      LoggingUtilities.service.debug(
        "Fndiscord.Bot.RegisterCommand",
        `Sending payload to server: ${JSON.stringify(payload)}`
      );

      // Verify governor ID with KingShot API
      const response = await fetch("https://kingshot-giftcode.centurygame.com/api/player", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      serverResponse = await response.json();

      // Check if API returned an error or invalid data
      if (serverResponse.code !== 0 || !serverResponse.data) {
        LoggingUtilities.service.error(
          "Fndiscord.Bot.RegisterCommand",
          `Server returned error for ${message.author.tag}: ${JSON.stringify(serverResponse)}`
        );
        await message.channel.send(`❌ Server returned an error: ${serverResponse.msg || "Unknown error"}`);
        return;
      }
    } catch (err) {
      // Handle network or API errors
      LoggingUtilities.service.error(
        "Fndiscord.Bot.RegisterCommand",
        `Failed to send payload for ${message.author.tag}: ${err}`
      );
      await message.channel.send("❌ Failed to send payload to the server.");
      return;
    }

    /**
     * Registration Process Phase 4: Data Storage
     * ------------------------------------------
     */

    try {
      const data = serverResponse.data;

      /**
       * Firestore structure:
       * - Collection: Governor ID (e.g., "41579499")
       * - Document: Player nickname or timestamp
       * - Fields: Player data + registration metadata
       */
      const collectionRef = firestoreDB.collection(userInput);
      const docId = data.nickname || Date.now().toString();

      LoggingUtilities.service.debug(
        "Fndiscord.Bot.RegisterCommand",
        `Storing registration data for ${message.author.tag} in Firestore under collection ${userInput}, doc ${docId}`
      );

      // Store player data with registration metadata
      await collectionRef.doc(docId).set({
        ...data, // Original API response data
        registeredBy: message.author.id, // Discord user who registered
        registeredAt: new Date().toISOString(), // Registration timestamp
      });
    } catch (err) {
      // Handle Firestore storage errors
      LoggingUtilities.service.error(
        "Fndiscord.Bot.RegisterCommand",
        `Failed to store data in Firestore for ${message.author.tag}: ${err}`
      );
      await message.channel.send("❌ Failed to store data in Firestore.");
      return;
    }

    /**
     * Registration Process Phase 5: Confirmation
     * ------------------------------------------
     */

    // Create confirmation embed with account details
    const embed = new EmbedBuilder()
      .setColor(0x00ff99) // Consistent green-teal brand color
      .setTitle("✅ Registration Successful")
      .setDescription(
        `Hello, **${message.author.username}**! Your governor ID \`${userInput}\` has been registered.\n\n` +
          `**Payload Request:**\n` +
          "```json\n" +
          JSON.stringify(payload, null, 2) +
          "\n```"
      )
      .setFooter({ text: `Requested by ${message.author.username}` })
      .setTimestamp(); // Add current timestamp for context

    // Add basic account information fields
    embed.addFields(
      {
        name: "Name",
        value: JSON.stringify(serverResponse.data.nickname.replace(/"/g, "")) || "N/A",
        inline: true,
      },
      {
        name: "Governor ID",
        value: JSON.stringify(serverResponse.data.fid),
        inline: true,
      },
      {
        name: "Kingdom ID",
        value: JSON.stringify(serverResponse.data.kid),
        inline: true,
      }
    );

    // Add stove level with formatted display
    embed.addFields({
      name: "Level",
      value: mapStoveLevel(serverResponse.data.stove_lv),
      inline: true,
    });

    // Add player avatar image if available
    if (serverResponse.data.avatar_image) {
      embed.setImage(serverResponse.data.avatar_image);
    }

    // Send the confirmation embed
    await message.channel.send({ embeds: [embed] });
  },
};
