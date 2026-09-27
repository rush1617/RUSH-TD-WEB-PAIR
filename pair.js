import express from "express";
import fs from "fs";
import pino from "pino";
import {
    makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import pn from "awesome-phonenumber";
import { upload } from "./mega.js";

const router = express.Router();

function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
    } catch (e) {
        console.error("Error removing file:", e);
    }
}

function getMegaFileId(url) {
    try {
        const match = url.match(/\/file\/([^#]+#[^\/]+)/);
        return match ? match[1] : null;
    } catch (error) {
        return null;
    }
}

router.get("/", async (req, res) => {
    let num = req.query.number;
    if (!num) {
        return res.status(400).send({ code: "Phone number is required." });
    }

    let dirs = "./" + num.replace(/[^0-9]/g, "");
    await removeFile(dirs);

    num = num.replace(/[^0-9]/g, "");

    const phone = pn("+" + num);
    if (!phone.isValid()) {
        if (!res.headersSent) {
            return res.status(400).send({
                code: "Invalid phone number. Please enter your full international number without + or spaces.",
            });
        }
        return;
    }
    num = phone.getNumber("e164").replace("+", "");

    async function initiateSession() {
        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            const { version } = await fetchLatestBaileysVersion();
            let KnightBot = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(
                        state.keys,
                        pino({ level: "fatal" }).child({ level: "fatal" }),
                    ),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: ["Ubuntu", "Chrome", "20.0.04"],
                markOnlineOnConnect: false,
                generateHighQualityLinkPreview: false,
                defaultQueryTimeoutMs: 60000,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
            });

            KnightBot.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === "open") {
                    console.log("✅ Connected successfully!");
                    console.log("📱 Uploading session to MEGA...");

                    try {
                        const credsPath = dirs + "/creds.json";
                        const megaUrl = await upload(
                            credsPath,
                            `creds_${num}_${Date.now()}.json`,
                        );
                        const megaFileId = getMegaFileId(megaUrl);

                        if (megaFileId) {
                            console.log("✅ Session uploaded to MEGA. File ID:", megaFileId);

                            const userJid = jidNormalizedUser(num + "@s.whatsapp.net");

                            await KnightBot.sendMessage(userJid, {
                                image: { url: "https://github.com/rush1617/RUSH-TD/blob/main/images/Alive.png?raw=true" },
                                caption:
                                    `╔════◉🟢 *𝗥𝗨𝗦𝗛-𝗧𝗗* ◉════╗\n` +
                                    `║  𝙷𝚎𝚢 𝙳𝚞𝚍𝚎,                     ║\n` +
                                    `║  ``𝚈𝚘𝚞𝚛 𝚂𝚎𝚜𝚜𝚒𝚘𝚗 𝙸𝚍 𝙷𝚎𝚛𝚎💬    ║\n` +
                                    `╚═══════════════════╝\n` +
                                    `┌──────── ⋆⋅☆⋅⋆ ────────┐\n` +
                                    `🚀 Powered By\n` +
                                    `*RAMESH DISSANAYAKA* 🔥\n` +
                                    `└──────── ⋆⋅☆⋅⋆ ────────┘\n`,
                            });
                            await KnightBot.sendMessage(userJid, {
                                text: `${megaFileId}`,
                            });
                            console.log("📄 MEGA file ID sent successfully");
                        } else {
                            console.log("❌ Failed to upload to MEGA");
                        }

                        console.log("🧹 Cleaning up session...");
                        await delay(1000);
                        removeFile(dirs);
                        console.log("✅ Session cleaned up successfully");
                    } catch (error) {
                        console.error("❌ Error uploading to MEGA:", error);
                        removeFile(dirs);
                    }
                }

                if (connection === "close") {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    if (statusCode === 401) {
                        console.log("❌ Logged out from WhatsApp.");
                    } else {
                        console.log("🔁 Connection closed — session ended.");
                    }
                }
            });

            if (!KnightBot.authState.creds.registered) {
                await delay(2000);
                num = num.replace(/[^\d+]/g, "");
                if (num.startsWith("+")) num = num.substring(1);

                try {
                    let code = await KnightBot.requestPairingCode(num);
                    code = code?.match(/.{1,4}/g)?.join("-") || code;
                    if (!res.headersSent) {
                        console.log({ num, code });
                        return res.send({ code });
                    }
                } catch (error) {
                    console.error("Error requesting pairing code:", error);
                    if (!res.headersSent) {
                        return res.status(503).send({
                            code: "Failed to get pairing code. Please check your phone number and try again.",
                        });
                    }
                }
            }

            KnightBot.ev.on("creds.update", saveCreds);
        } catch (err) {
            console.error("Error initializing session:", err);
            if (!res.headersSent) {
                res.status(503).send({ code: "Service Unavailable" });
            }
        }
    }

    await initiateSession();
});

process.on("uncaughtException", (err) => {
    let e = String(err);
    if (
        e.includes("conflict") ||
        e.includes("not-authorized") ||
        e.includes("Socket connection timeout") ||
        e.includes("rate-overlimit") ||
        e.includes("Connection Closed") ||
        e.includes("Timed Out") ||
        e.includes("Value not found") ||
        e.includes("Stream Errored") ||
        e.includes("statusCode: 515") ||
        e.includes("statusCode: 503")
    ) return;
    console.log("Caught exception: ", err);
});

export default router;
