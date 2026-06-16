import { Message, ChannelType, EmbedBuilder } from "discord.js";
import axios from "axios";
import { LoggingUtilities } from "../../../utils/logging/LoggingUtilities.js";

/**
 * Ping command for testing server connectivity and API health.
 *
 * This command performs a network request to a designated API endpoint
 * and displays the response in a formatted embed, serving as both a
 * connectivity test and API status check for monitoring purposes.
 *
 * @module PingCommand
 * @type {Command}
 *
 * @example
 * // User types "!ping"
 * // Bot responds with an embed showing API response data or error message
 *
 * @see {@link axios} - For HTTP request handling
 * @see {@link LoggingUtilities} - For structured logging
 */
export const pingCommand = {
  /** Command trigger that users will type (e.g., "!ping") */
  name: "ping",

  /** Brief description shown in help commands */
  description: "Check server connectivity",

  /**
   * Executes the ping command, testing connectivity to the configured API endpoint.
   *
   * This function performs the following operations:
   * 1. Validates the execution context is a guild text channel
   * 2. Sends an HTTP GET request to the connectivity endpoint
   * 3. Formats the API response into a readable JSON embed field
   * 4. Sends the result as an embed or error message to Discord
   *
   * @async
   * @param {Message} message - The Discord message object that triggered the command
   * @param {string[]} args - Command arguments (unused in this implementation)
   * @returns {Promise<void>} Resolves when the connectivity check completes and response is sent
   *
   * @throws {Error} If HTTP request fails, logs error and sends user-friendly message
   *
   * @example
   * // Example successful embed output:
   * // Title: 🏓 Pong!
   * // Description: Performing Connectivity Check:
   * // Field:
   * //   Response:
   * //   ```json
   * //   {"status": "ok", "timestamp": "2024-01-01T12:00:00Z"}
   * //   ```
   *
   * @example
   * // Example error output:
   * // Message: "❌ Failed to contact server."
   */
  execute: async (message: Message, args: string[]): Promise<void> => {
    // Validate command execution context - only allow in guild text channels
    if (!message.channel.isTextBased() || message.channel.type !== ChannelType.GuildText) {
      return;
    }

    // Log command execution for monitoring and audit trail
    LoggingUtilities.service.info(
      `Fndiscord.Bot.PingCommand`,
      `Executing ping command for ${message.author.tag} in channel ${message.channel.id}`
    );

    try {
      /**
       * API endpoint for connectivity testing
       * @constant {string}
       */
      const CONNECTIVITY_ENDPOINT = "https://api.awense.com/connectivity";

      // Perform HTTP GET request to check API connectivity
      const response = await axios.get(CONNECTIVITY_ENDPOINT);

      /**
       * Discord embed field value maximum character limit
       * We use 1000 characters (with 24 characters reserved for code block formatting)
       * @constant {number}
       */
      const MAX_FIELD_LENGTH = 1000;

      // Format the API response as JSON with syntax highlighting
      const jsonString = JSON.stringify(response.data, null, 2);
      const formattedJson =
        jsonString.length > MAX_FIELD_LENGTH
          ? jsonString.substring(0, MAX_FIELD_LENGTH) + "...\n// Response truncated due to length"
          : jsonString;

      // Create and configure the response embed
      const embed = new EmbedBuilder()
        .setTitle("🏓 Pong!")
        .setColor(0x00ff99) // Consistent green-teal brand color
        .setDescription("Performing Connectivity Check:")
        .addFields([
          {
            name: "Response",
            // Display JSON in code block with json language tag for syntax highlighting
            value: "```json\n" + formattedJson + "\n```",
            inline: false,
          },
        ])
        .setFooter({ text: `Requested by ${message.author.username}` })
        .setTimestamp(); // Add current timestamp for context

      // Send the embed to the Discord channel
      await message.channel.send({ embeds: [embed] });

      // Log successful ping for monitoring
      LoggingUtilities.service.debug(
        `Fndiscord.Bot.PingCommand`,
        `Successfully pinged API endpoint: ${CONNECTIVITY_ENDPOINT}`
      );
    } catch (err) {
      // Comprehensive error handling for network/API failures
      LoggingUtilities.service.error(`Fndiscord.Bot.PingCommand`, `Failed to contact server: ${err}`);

      // Send user-friendly error message
      await message.channel.send("❌ Failed to contact server.");
    }
  },
};
