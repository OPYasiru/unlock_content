export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(200).send('Bot is running');
    }

    const BOT_TOKEN = "8715294684:AAFdqe3SFZBeKj9i9o1s2D8nDN410csq5U";
    const CHANNEL_ID = "-1003920624467";
    const ADMIN_USER_ID = 5411921025;
    const BASE_URL = "https://unlockcontent.vercel.app";

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
        const message = req.body.message;
        if (!message) return res.status(200).send('No message');

        const chatId = message.chat.id;

        // Admin verification
        if (message.from.id !== ADMIN_USER_ID) {
            await sendMsg(chatId, "Access denied. Admin only.");
            return res.status(200).send('Unauthorized');
        }

        // 1. Text Messages (/start or text)
        if (message.text) {
            const text = message.text.trim();
            if (text.startsWith('/start') || text.startsWith('/help')) {
                await sendMsg(chatId, "<b>Hot Lanka Bot Active!</b>\n\nPlease send a <b>Photo</b> with the FileStore link in the caption.");
                return res.status(200).json({ status: 'ok' });
            } else {
                await sendMsg(chatId, "⚠️ Please send a <b>Photo</b> with the link in its caption to create a channel post.");
                return res.status(200).json({ status: 'ok' });
            }
        }

        // 2. Photo or Media with Caption
        if ((message.photo || message.video || message.document) && message.caption) {
            const fullCaption = message.caption.trim();

            let startCode = "";
            let finalCaption = "🔥 Hot Lanka New Update!\n⏳ Download now before it expires!";

            // Extract start code
            if (fullCaption.includes("start=")) {
                const parts = fullCaption.split("start=");
                startCode = parts[1].split("&")[0].split(" ")[0].trim();
                const customText = parts[0].replace(/https?:\/\/t\.me\/[^\s]+/g, '').trim();
                if (customText.length > 0) {
                    finalCaption = customText;
                }
            } else {
                const parts = fullCaption.split(/\s+/);
                startCode = parts[parts.length - 1].trim();
                const customText = parts.slice(0, -1).join(' ').trim();
                if (customText.length > 0) {
                    finalCaption = customText;
                }
            }

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

            let photoToSend = null;
            if (message.photo) {
                photoToSend = message.photo[message.photo.length - 1].file_id;
            } else if (message.video && message.video.thumbnail) {
                photoToSend = message.video.thumbnail.file_id;
            } else if (message.document && message.document.thumbnail) {
                photoToSend = message.document.thumbnail.file_id;
            }

            if (photoToSend) {
                const postResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: CHANNEL_ID,
                        photo: photoToSend,
                        caption: finalCaption,
                        reply_markup: inlineKeyboard
                    })
                });

                const resData = await postResponse.json();
                if (resData.ok) {
                    await sendMsg(chatId, "✅ Post published successfully to Channel!");
                } else {
                    await sendMsg(chatId, `❌ Error: ${resData.description}`);
                }
            } else {
                await sendMsg(chatId, "⚠️ Could not extract thumbnail. Please upload an image directly.");
            }

            return res.status(200).json({ status: 'ok' });
        }

    } catch (err) {
        console.error("Handler error:", err);
    }

    return res.status(200).json({ status: 'ok' });
}
