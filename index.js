const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
} = require("discord.js");
const { exec, spawn } = require("child_process");
const { existsSync, mkdirSync, unlinkSync, writeFileSync, readFileSync } = require("fs");
const os = require("os");
const path = require("path");
require("dotenv").config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

const prefix = "!";
const botsFolder = path.join(__dirname, "Index");
const planosFile = path.join(__dirname, "planos.json");
let botProcesses = {};

// Função para carregar planos
function carregarPlanos() {
    if (!existsSync(planosFile)) {
        writeFileSync(planosFile, JSON.stringify({ usuarios: {} }, null, 4));
    }
    return JSON.parse(readFileSync(planosFile, "utf8"));
}

// Função para salvar planos
function salvarPlanos(data) {
    writeFileSync(planosFile, JSON.stringify(data, null, 4));
}

// Função de autenticação e autorização
async function autenticarUsuario(message) {
    const planos = carregarPlanos();
    if (!planos.usuarios[message.author.id]) {
        const embed = new EmbedBuilder()
            .setColor("Yellow")
            .setTitle("🔒 Autorização Necessária")
            .setDescription(
                `Você precisa autorizar o bot antes de criar ou gerenciar seus bots.\n\n[🔗 Autorizar Bot](https://discord.com/oauth2/authorize?client_id=SEU_CLIENT_ID&response_type=code&redirect_uri=URL_REDIRECT&scope=guilds+email+identify+openid+gdm.join)`
            )
            .setFooter({ text: "Sistema de Autorização" });
        await message.reply({ embeds: [embed] });
        return false;
    }
    return true;
}

// Inicialização do bot principal
client.once("ready", () => {
    console.log(`🤖 Bot principal conectado como ${client.user.tag}!`);
});

client.on("messageCreate", async (message) => {
    if (!message.content.startsWith(prefix) || message.author.bot) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Comando: Upload de Bot (u)
    if (command === "u") {
        if (!(await autenticarUsuario(message))) return;

        const botName = args[0];
        if (!botName) return message.reply("❌ Por favor, forneça um nome para o bot.");

        const guild = message.guild;
        if (!guild) return message.reply("❌ Este comando só pode ser usado em servidores.");

        const ticketChannel = await guild.channels.create({
            name: `bot-${message.author.username}`,
            type: 0, // Texto
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: message.author.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            ],
        });

        const embed = new EmbedBuilder()
            .setColor("Blue")
            .setTitle("📥 Ticket para Criação de Bot")
            .setDescription("Envie o arquivo do bot (ZIP ou JS) neste canal.")
            .setFooter({ text: "Envie o arquivo dentro de 5 minutos." });

        ticketChannel.send({ embeds: [embed] });

        const collector = ticketChannel.createMessageCollector({ time: 300000 });

        collector.on("collect", async (msg) => {
            if (msg.author.id !== message.author.id || !msg.attachments.size) return;

            const attachment = msg.attachments.first();
            const botFolder = path.join(botsFolder, `${message.author.id}-${botName}`);
            if (!existsSync(botsFolder)) mkdirSync(botsFolder);
            if (!existsSync(botFolder)) mkdirSync(botFolder);

            const filePath = path.join(botFolder, attachment.name);

            const file = require("fs").createWriteStream(filePath);
            require("https").get(attachment.url, async (response) => {
                if (response.statusCode !== 200) {
                    return ticketChannel.send("❌ Erro ao baixar o arquivo.");
                }
                response.pipe(file);
                file.on("finish", async () => {
                    file.close();
                    if (attachment.name.endsWith(".zip")) {
                        const unzipper = require("unzipper");
                        try {
                            const directory = await unzipper.Open.file(filePath);
                            await directory.extract({ path: botFolder, concurrency: 5 });
                            unlinkSync(filePath);
                        } catch (err) {
                            return ticketChannel.send(`❌ Erro ao descompactar o arquivo: ${err.message}`);
                        }
                    }
                    ticketChannel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor("Green")
                                .setTitle("✅ Bot criado com sucesso")
                                .setDescription(`O bot '${botName}' foi configurado e salvo.`),
                        ],
                    });
                    setTimeout(() => ticketChannel.delete(), 5000);
                    collector.stop();
                });
            });
        });

        collector.on("end", () => {
            if (ticketChannel) setTimeout(() => ticketChannel.delete(), 5000);
        });
    }

    // Comando: Iniciar Bot (s)
    else if (command === "s") {
        if (!(await autenticarUsuario(message))) return;

        const botName = args[0];
        if (!botName) return message.reply("❌ Por favor, forneça o nome do bot para iniciar.");

        const botFolder = path.join(botsFolder, `${message.author.id}-${botName}`);
        const botMainFile = path.join(botFolder, "index.js");
        if (!existsSync(botMainFile)) return message.reply("❌ Bot não encontrado.");

        const botProcess = spawn("node", [botMainFile], { cwd: botFolder });
        botProcesses[botName] = botProcess;
        botProcess.on("close", () => delete botProcesses[botName]);

        message.reply(`✅ Bot '${botName}' iniciado.`);
    }

    // Comando: Parar Bot (p)
    else if (command === "p") {
        if (!(await autenticarUsuario(message))) return;

        const botName = args[0];
        if (!botProcesses[botName]) return message.reply("❌ Bot não está em execução.");

        botProcesses[botName].kill();
        delete botProcesses[botName];

        message.reply(`✅ Bot '${botName}' parado.`);
    }

    // Comando: Informações do Bot (i)
    else if (command === "i") {
        const totalMemory = os.totalmem() / 1024 / 1024;
        const freeMemory = os.freemem() / 1024 / 1024;
        const usedMemory = totalMemory - freeMemory;

        const infoEmbed = new EmbedBuilder()
            .setColor("Blue")
            .setTitle("📊 Informações do Bot")
            .addFields(
                { name: "🤖 Nome", value: client.user.username, inline: true },
                { name: "🔰 ID", value: client.user.id, inline: true },
                { name: "💾 Memória Usada", value: `${usedMemory.toFixed(2)} MB`, inline: true },
                { name: "💻 Sistema Operacional", value: `${os.type()} ${os.release()}`, inline: true }
            );
        message.reply({ embeds: [infoEmbed] });
    }
});

// Login do Bot
client.login("MTIyNzMzODY1MTM2NTgwNjE1MQ.Gkvy0H.s-vAxK55SvgDLp64R4Ckwic6dMg6hFr55pStRc");