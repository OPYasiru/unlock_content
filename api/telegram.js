export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(200).send('Bot is running');
    }

    const BOT_TOKEN = "8715294684:AAFdqe3SFZBeKj9i9o1s2D8nDN410csq5U";
    const CHANNEL_ID = "-1003920624467";
    const ADMIN_USER_ID = 5411921025;
    const BASE_URL = "https://unlockcontent.vercel.app";

    // 🔴 Photo එකක් නැතිව Message එක Forward කරද්දී පෝස්ට් එකට වැටෙන Default Image එක
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
        const message = req.body.message;
        if (!message) return res.status(200).send('No message');

        const chatId = message.chat.id;

        // Admin Verification
        if (message.from.id !== ADMIN_USER_ID) {
            await sendMsg(chatId, "Access denied. Admin only.");
            return res.status(200).send('Unauthorized');
        }

        // /start command එක
        if (message.text && (message.text === '/start' || message.text === '/help')) {
            await sendMsg(chatId, "<b>Hot Lanka Bot Ready!</b>\n\nFileStore Bot එවපු Message එක මේකට <b>Forward</b> කරන්න විතරයි තියෙන්නේ.");
            return res.status(200).json({ status: 'ok' });
        }

        // Text එකක් හෝ Forward කරපු Message එකක් හෝ Media Caption එකක් ආ විට
        const rawContent = message.text || message.caption || "";

        // FileStore link එකෙන් start code එක Extract කර ගැනීම
        if (rawContent.includes("start=")) {
            const startCode = rawContent.split("start=")[1].split("&")[0].split(/\s+/)[0].trim();
            const token = scramble(startCode);
            const targetLink = `${BASE_URL}/?t=${token}`;

            // Buttons දෙක
            const inlineKeyboard = {
                inline_keyboard: [
                    [
                        { text: "👁 Watch", url: targetLink },
                        { text: "⬇️ Download", url: targetLink }
                    ]
                ]
            };

            // Image එකක් තිබේ නම් එය ගනී, නැතිනම් Default Banner එක යොදාගනී
            let photoToSend = DEFAULT_BANNER;
            if (message.photo) {
                photoToSend = message.photo[message.photo.length - 1].file_id;
            } else if (message.video && message.video.thumbnail) {
                photoToSend = message.video.thumbnail.file_id;
            }

            const defaultCaption = "🔥 Hot Lanka New Update!\n⏳ Link will expire soon, download now!";

            // Channel එකට Photo එකක් ලෙස Post කිරීම
            const postResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: CHANNEL_ID,
                    photo: photoToSend,
                    caption: defaultCaption,
                    reply_markup: inlineKeyboard
                })
            });

            const resData = await postResponse.json();
            if (resData.ok) {
                await sendMsg(chatId, "✅ <b>Post එක සාර්ථකව Hot Lanka Channel එකට පළ විය!</b>");
            } else {
                await sendMsg(chatId, `❌ Error: ${resData.description}`);
            }

            return res.status(200).json({ status: 'ok' });
        }

        await sendMsg(chatId, "⚠️ එවූ පණිවිඩයේ FileStore Link එකක් (start=...) හමු නොවීය.");

    } catch (err) {
        console.error("Handler error:", err);
    }

    return res.status(200).json({ status: 'ok' });
}
