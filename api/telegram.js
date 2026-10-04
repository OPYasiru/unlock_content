export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(200).send('Bot is running');
    }

    const BOT_TOKEN = "8715294684:AAFdq0e3SFZBeKj9i9o1s2D8nDN410csq5U";
    const CHANNEL_ID = "-1003920624467";
    const ADMIN_USER_ID = 5411921025;
    const BASE_URL = "https://unlockcontent.vercel.app";
    const DEFAULT_BANNER = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80";

    const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
    const SHIFT = 27;

    function scramble(str) {
        return str.split('').map(c => {
            let idx = CHARS.indexOf(c);
            if (idx === -1) return c;
            return CHARS[(idx + SHIFT) % CHARS.length];
        }).join('');
    }

    async function sendMsg(chatId, text) {
        try {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML' })
            });
        } catch (e) {
            console.error(e);
        }
    }

    try {
        const body = req.body;
        if (!body || !body.message) {
            return res.status(200).json({ ok: true });
        }

        const msg = body.message;
        const chatId = msg.chat.id;

        // Admin Security Check
        if (msg.from && msg.from.id !== ADMIN_USER_ID) {
            await sendMsg(chatId, "Access denied. Admin only.");
            return res.status(200).json({ ok: true });
        }

        // Text & Start Command
        const textContent = msg.text || msg.caption || "";

        if (textContent.startsWith('/start') || textContent.startsWith('/help')) {
            await sendMsg(chatId, "<b>Hot Lanka Bot Active!</b>\n\nFileStore Bot එකෙන් ආපු Message එක කෙලින්ම මේකට <b>Forward</b> කරන්න.");
            return res.status(200).json({ ok: true });
        }

        // Start code එක හඳුනා ගැනීම
        if (textContent.includes("start=")) {
            const startCode = textContent.split("start=")[1].split("&")[0].split(/\s+/)[0].trim();
            const token = scramble(startCode);
            const targetLink = `${BASE_URL}/?t=${token}`;

            const inlineKeyboard = {
                inline_keyboard: [
                    [
                        { text: "👁 Watch", url: targetLink },
                        { text: "⬇️ Download", url: targetLink }
                    ]
                ]
            };

            let photoToSend = DEFAULT_BANNER;
            if (msg.photo) {
                photoToSend = msg.photo[msg.photo.length - 1].file_id;
            }

            const postRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: CHANNEL_ID,
                    photo: photoToSend,
                    caption: "🔥 Hot Lanka New Update!\n⏳ Link will expire soon, download now!",
                    reply_markup: inlineKeyboard
                })
            });

            const resJson = await postRes.json();
            if (resJson.ok) {
                await sendMsg(chatId, "✅ <b>Post එක සාර්ථකව Hot Lanka Channel එකට පළ විය!</b>");
            } else {
                await sendMsg(chatId, `❌ Telegram Error: ${resJson.description}`);
            }

            return res.status(200).json({ ok: true });
        }

        await sendMsg(chatId, "⚠️️ කරුණාකර FileStore ලින්ක් එක සහිත පණිවිඩය එවන්න.");

    } catch (err) {
        console.error("Internal Error:", err);
    }

    return res.status(200).json({ ok: true });
}
