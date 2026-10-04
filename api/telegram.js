export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(200).send('Bot is running');
    }

    // Configuration from your settings
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
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML' })
        });
    }

    const message = req.body.message;
    if (!message) return res.status(200).send('No message');

    const chatId = message.chat.id;

    // Check admin access
    if (message.from.id !== ADMIN_USER_ID) {
        await sendMsg(chatId, "Access denied. Admin only.");
        return res.status(200).send('Unauthorized');
    }

    // 1. Text commands (/start or link directly)
    if (message.text) {
        const text = message.text.trim();

        if (text.startsWith('/start')) {
            await sendMsg(chatId, "Send a photo with the link in caption, or forward the video with link.");
            return res.status(200).json({ status: 'ok' });
        }
    }

    // 2. Photo, Video, or Document with Caption
    if ((message.photo || message.video || message.document) && message.caption) {
        const captionText = message.caption.trim();

        let startCode = "";
        if (captionText.includes("start=")) {
            startCode = captionText.split("start=")[1].split("&")[0].split(" ")[0];
        } else {
            startCode = captionText;
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
                    reply_markup: inlineKeyboard
                })
            });

            const resData = await postResponse.json();
            if (resData.ok) {
                await sendMsg(chatId, "Success! Post published to channel.");
            } else {
                await sendMsg(chatId, `Error: ${resData.description}`);
            }
        } else {
            await sendMsg(chatId, "No thumbnail found. Please send with an image.");
        }

        return res.status(200).json({ status: 'ok' });
    }

    await sendMsg(chatId, "Please send media with your link in the caption.");
    return res.status(200).json({ status: 'ok' });
}
