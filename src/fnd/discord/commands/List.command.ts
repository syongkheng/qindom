import { Message, ChannelType, EmbedBuilder } from "discord.js";
import { firestoreDB } from "../../../config/db/firebase.js";
import { mapStoveLevel } from "./Register.command.js";
import { LoggingUtilities } from "../../../utils/logging/LoggingUtilities.js";

/**
 * Command for listing all registered users (governors) from Firebase Firestore.
 *
 * This command queries all Firestore collections (each representing a governor),
 * retrieves their latest registration data, and displays it in formatted Discord embeds.
 * It handles large datasets by paginating results to comply with Discord's embed field limits.
 *
 * @module ListCommand
 * @type {Command}
 *
 * @example
 * // User types "!list"
 * // Bot responds with one or more embeds showing registered governors
 * // Each embed shows governor details including nickname, KID, stove level, and registration time
 *
 * @see {@link Register.command} - For the mapStoveLevel utility
 * @see {@link firestoreDB} - For Firestore database connection
 */
export const listCommand = {
  /** Command trigger that users will type (e.g., "!list") */
  name: "list",

  /** Brief description shown in help commands */
  description: "List all registered users",

  /**
   * Executes the list command, fetching and displaying registered governors from Firestore.
   *
   * This function performs the following operations:
   * 1. Validates the execution context is a guild text channel
   * 2. Lists all Firestore collections (each representing a governor)
   * 3. For each collection, retrieves the most recent registration document
   * 4. Formats the data into Discord embed fields
   * 5. Paginates results into multiple embeds if necessary (max 20 fields per embed)
   * 6. Sends the formatted embeds to the channel
   *
   * @async
   * @param {Message} message - The Discord message object that triggered the command
   * @param {string[]} args - Command arguments (unused in this implementation)
   * @returns {Promise<void>} Resolves when all registration data has been fetched and displayed
   *
   * @throws {Error} If Firestore query fails, logs error and sends user-friendly message
   *
   * @example
   * // Example embed output structure:
   * // Title: 📋 Registered Users
   * // Description: Total governors: 25, Latest registered user per governor ID
   * // Fields (example entry):
   * //   👤 JohnDoe [KID_123] [Stove Level 4]
   * //   Governor ID: abc123
   * //   🕒 Registered: 2 hours ago
   */
  execute: async (message: Message): Promise<void> => {
    // Validate command execution context - only allow in guild text channels
    if (!message.channel.isTextBased() || message.channel.type !== ChannelType.GuildText) {
      return;
    }

    // Log command execution for monitoring and audit trail
    LoggingUtilities.service.info(
      "Fndiscord.Bot.ListCommand",
      `Executing list command for ${message.author.tag} in channel ${message.channel.id}`
    );

    try {
      // Retrieve all collection references from Firestore
      // Each collection represents a governor with multiple registration documents
      const collections = await firestoreDB.listCollections();

      // Early return if no governors are registered
      if (collections.length === 0) {
        await message.channel.send("📭 No registrations found.");
        return;
      }

      /** @type {Array<{name: string, value: string, inline?: boolean}>} */
      const fields: { name: string; value: string; inline?: boolean }[] = [];

      // Process each governor collection to get their latest registration
      for (const collection of collections) {
        // Query the most recent registration document by registration timestamp
        const snapshot = await collection.orderBy("registeredAt", "desc").limit(1).get();

        // Skip collections without registration documents
        if (snapshot.empty) continue;

        const doc = snapshot.docs[0];
        const data = doc.data();

        // Extract governor details with fallback values
        const nickname = data.nickname ?? "Unknown";
        const registeredAt = data.registeredAt
          ? // Convert Firestore timestamp to Discord's relative time format
            `<t:${Math.floor(new Date(data.registeredAt).getTime() / 1000)}:R>`
          : "Unknown";

        // Format the governor information into an embed field
        fields.push({
          name: `👤 ${nickname} [${data.kid}] [${mapStoveLevel(data.stove_lv)}]`,
          value: `${collection.id}\n🕒 **Registered:** ${registeredAt}`,
          inline: false, // Stack fields vertically for better readability
        });
      }

      // Debug log for tracking data compilation
      LoggingUtilities.service.debug(
        "Fndiscord.Bot.ListCommand",
        `Compiled registration list with ${fields.length} entries`
      );

      // Check if any valid registrations were found after processing
      if (fields.length === 0) {
        await message.channel.send("📭 No registrations found.");
        return;
      }

      /**
       * Discord embed field limit: Maximum 25 fields per embed
       * We use 20 for safety and better visual appearance
       * @constant {number}
       */
      const chunkSize = 20;

      // Split fields into chunks and create embeds for each chunk
      for (let i = 0; i < fields.length; i += chunkSize) {
        const chunk = fields.slice(i, i + chunkSize);

        const embed = new EmbedBuilder()
          .setTitle("📋 Registered Users")
          .setColor(0x00ff99) // Consistent green-teal brand color
          .setFooter({ text: `Requested by ${message.author.username}` })
          .setTimestamp(); // Add current timestamp for context

        // Add summary description only to the first embed
        if (i === 0) {
          embed.setDescription(`Total governors: **${fields.length}**\n` + `Latest registered user per governor ID`);
        }

        // Add the chunk of fields to the embed
        embed.addFields(chunk);

        // Send the embed to the Discord channel
        await message.channel.send({ embeds: [embed] });
      }

      // Log successful completion
      LoggingUtilities.service.info(
        "Fndiscord.Bot.ListCommand",
        `Finished sending registration list for ${fields.length} governors`
      );
    } catch (err) {
      // Comprehensive error handling for Firestore failures
      LoggingUtilities.service.error("Fndiscord.Bot.ListCommand", `Failed to retrieve registrations: ${err}`);

      // Send user-friendly error message
      await message.channel.send("❌ Failed to retrieve registrations.");
    }
  },
};
