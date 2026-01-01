import { ChannelType, Client, GatewayIntentBits, Message } from "discord.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { LoggingUtilities } from "../../utils/LoggingUtilities";
dotenv.config();

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const ALLOWED_CHANNEL_IDS = ["1456263588267294788", "1456198333197586607"];

// Command type
type Command = {
  name: string;
  description: string;
  execute: (message: Message, args: string[], commands?: Map<string, Command>) => Promise<void>;
};

export async function startDiscordBot() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  });

  LoggingUtilities.service.info(`Fndiscord.Bot`, `Starting Discord bot...`);
  
  // Load commands dynamically
  const commands = new Map<string, Command>();
  const commandsPath = path.join(__dirname, "commands");
  const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".ts") || file.endsWith(".js"));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const commandModule = await import(filePath); // dynamic import
    const command: Command = commandModule[Object.keys(commandModule)[0]]; // works now
    if (!command || !command.name) continue; // skip invalid
    commands.set(command.name, command);
  }

  client.once("clientReady", () => {
    LoggingUtilities.service.info(`Fndiscord.Bot`, `Discord bot logged in as ${client.user?.tag}`);
  });

  client.on("messageCreate", async (message: Message) => {
    if (message.author.bot) return;

    const prefix = "!";
    if (!message.content.startsWith(prefix)) return;

    const [commandName, ...args] = message.content.slice(prefix.length).trim().split(/ +/);
    const command = commands.get(commandName.toLowerCase());
    if (!command) return;
    LoggingUtilities.service.info(
      `Fndiscord.Bot`,
      `Message: ${message.content} from ${message.author.tag} from channel ${message.channel.id}`
    );

    if (!ALLOWED_CHANNEL_IDS.includes(message.channel.id) && message.channel.type === ChannelType.GuildText) {
      LoggingUtilities.service.error(`Fndiscord.Bot`, `Unauthorized channel usage`);
      await message.channel.send("⛔ This command cannot be used in this channel.");
      return;
    }

    try {
      // Pass all commands to help command for dynamic listing
      LoggingUtilities.service.info(`Fndiscord.Bot`, `Executing command ${commandName} from ${message.author.tag}`);
      await command.execute(message, args, commands);
    } catch (err) {
      console.error(err);
      if (message.channel.isTextBased() && message.channel.type === ChannelType.GuildText) {
        LoggingUtilities.service.error(
          `Fndiscord.Bot`,
          `Error executing command ${commandName} from ${message.author.tag} in channel ${message.channel.id}`
        );
        await message.channel.send("❌ There was an error executing that command.");
      }
    }
  });

  client.login(BOT_TOKEN);
}
