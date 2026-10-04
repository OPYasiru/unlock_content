export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(200).send('Bot is running');
    }

    // 🔴 ඔබගේ තොරතුරු මෙතැනට ඇතුළත් කරන්න
    const BOT_TOKEN = "8715294684:AAFdq0e3SFZBeKj9i9o1s2D8nDN410csq5U";
    const CHANNEL_ID = "-1004365559436"; // හෝ Channel ID එක (-100xxxxxxx)
    const ADMIN_USER_ID = 5411921025; // ඔබගේ Telegram User ID එක (ආරක්ෂාව සඳහා)
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

    const message = req.body.message;
    if (!message || message.from.id !== ADMIN_USER_ID) {
        return res.status(200).send('Unauthorized or Invalid');
    }

    // 1. Photo එකක් සහ Caption එකක් ඇති විට
    if (message.photo && message.caption) {
        const fileId = message.photo[message.photo.length - 1].file_id;
        const captionText = message.caption.trim();

        // Caption එකෙන් start code එක වෙන් කර ගැනීම
        let startCode = "";
        if (captionText.includes("start=")) {
            startCode = captionText.split("start=")[1].split("&")[0].split(" ")[0];
        } else {
            startCode = captionText;
        }

        const token = scramble(startCode);
        const targetLink = `${BASE_URL}/?t=${token}`;

        // Buttons දෙක එක පේළියට (Row 1) සකස් කිරීම
        const inlineKeyboard = {
            inline_keyboard: [
                [
                    { text: "👁 Watch", url: targetLink },
                    { text: "⬇️ Download", url: targetLink }
                ]
            ]
        };

        // Telegram SendPhoto API එකට යැවීම
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHANNEL_ID,
                photo: fileId,
                reply_markup: inlineKeyboard
            })
        });

        // Admin හට සාර්ථක වූ බව දැන්වීම
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: ADMIN_USER_ID,
                text: "✅ Post එක සාර්ථකව Hot Lanka Channel එකට පළ විය!"
            })
        });
    }

    return res.status(200).json({ status: 'ok' });
}
