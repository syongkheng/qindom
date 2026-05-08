import { ChannelType, Client, GatewayIntentBits, Message } from "discord.js";
import fs from "fs";
import path from "path";
import { LoggingUtilities } from "../../utils/logging/LoggingUtilities";

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

// Allowed Channel IDs
const ALLOWED_CHANNEL_IDS = [
  "1456263588267294788", // PRD -- FND Legends #secretary
  "1456198333197586607", // DEV -- [Fnd] Kingshot 236 #debug-discord-dumps
];

/**
 * Represents a Discord bot command with its metadata and execution logic
 * @interface Command
 */
type Command = {
  /** The primary command trigger (e.g., 'help') */
  name: string;
  /** Brief description shown in help commands */
  description: string;
  /**
   * Executes the command logic
   * @param {Message} message - The triggering Discord message
   * @param {string[]} args - Parsed command arguments
   * @param {Map<string, Command>} [commands] - Map of all loaded commands (for help command)
   */
  execute: (message: Message, args: string[], commands?: Map<string, Command>) => Promise<void>;
};

/**
 * Starts and configures the Discord bot with event handlers and command loading.
 * Loads command modules dynamically from the ./commands directory and sets up
 * message filtering for allowed channels only.
 *
 * @async
 * @returns {Promise<void>} Resolves when the bot is successfully logged in
 * @throws {Error} If the bot token is missing or login fails
 */
export async function startDiscordBot(): Promise<void> {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  });

  LoggingUtilities.service.info(`Fndiscord.Bot`, `Starting Discord bot...`);

  // Load commands dynamically based on files in ./commands directory
  const commands = new Map<string, Command>();
  const commandsPath = path.join(__dirname, "commands");
  const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".ts") || file.endsWith(".js"));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    // Dynamic import
    const commandModule = await import(filePath);
    // Extract the default export or first export - command files should export a single Command object
    const command: Command = commandModule[Object.keys(commandModule)[0]];
    // Skip invalid commands
    if (!command || !command.name) continue;
    commands.set(command.name, command);
  }

  /**
   * Event: Client Ready
   */
  client.once("clientReady", () => {
    LoggingUtilities.service.info(`Fndiscord.Bot`, `Discord bot logged in as ${client.user?.tag}`);
  });

  /**
   * Event: Message Create
   */
  client.on("messageCreate", async (message: Message) => {
    // Ignore messages from other bots to prevent infinite loops and self-triggering
    if (message.author.bot) return;

    const prefix = "!"; // Command prefix
    if (!message.content.startsWith(prefix)) return;

    const [commandName, ...args] = message.content.slice(prefix.length).trim().split(/ +/); // Parse command and args
    const command = commands.get(commandName.toLowerCase()); // Lowercase for case-insensitivity
    if (!command) return;

    LoggingUtilities.service.info(
      `Fndiscord.Bot`,
      `Message: ${message.content} from ${message.author.tag} from channel ${message.channel.id}`
    );

    // Check if command is allowed in this channel
    if (!ALLOWED_CHANNEL_IDS.includes(message.channel.id) && message.channel.type === ChannelType.GuildText) {
      LoggingUtilities.service.error(`Fndiscord.Bot`, `Unauthorized channel usage`);
      await message.channel.send("⛔ This command cannot be used in this channel.");
      return;
    }

    try {
      // Pass all commands to help command for dynamic listing
      LoggingUtilities.service.info(`Fndiscord.Bot`, `Executing command ${commandName} from ${message.author.tag}`);

      // Execute command
      await command.execute(message, args, commands);
    } catch (err) {
      if (message.channel.isTextBased() && message.channel.type === ChannelType.GuildText) {
        LoggingUtilities.service.error(
          `Fndiscord.Bot`,
          `Error executing command ${commandName} from ${message.author.tag} in channel ${message.channel.id}`
        );
        await message.channel.send("❌ There was an error executing that command.");
      }
    }
  });

  await client.login(BOT_TOKEN);
}
