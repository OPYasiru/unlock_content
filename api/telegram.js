export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(200).send('Bot is running');
    }

    // 🔴 ඔබගේ තොරතුරු මෙතැනට ඇතුළත් කරන්න
    const BOT_TOKEN = "8715294684:AAFdq0e3SFZBeKj9i9o1s2D8nDN410csq5U";
    const CHANNEL_ID = "-1003920624467"; // හෝ Channel ID එක (-100xxxxxxx)
    const ADMIN_USER_ID = 5411921025; // ඔබගේ Telegram User ID එක
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

    // අනවශ්‍ය අයගෙන් එන මැසේජ් වැළැක්වීම
    if (message.from.id !== ADMIN_USER_ID) {
        await sendMsg(chatId, "⛔ ඔබට මෙම Bot භාවිතා කිරීමට අවසර නැත.");
        return res.status(200).send('Unauthorized');
    }

    // 1. Text Commands හැසිරවීම (/start, /help)
    if (message.text) {
        const text = message.text.trim();

        if (text.startsWith('/start') || text.startsWith('/help')) {
            const helpText = `👋 <b>Hot Lanka Auto-Post Bot සක්‍රීයයි!</b>\n\n` +
                `<b>භාවිතා කරන ආකාරය:</b>\n` +
                `1. පෝස්ට් එකට අවශ්‍ය Photo එකක් Attach කරන්න.\n` +
                `2. එහි Caption එකට FileStore link එක (හෝ Code එක) දමා Send කරන්න.\n\n` +
                `<i>Bot විසින් ස්වයංක්‍රීයව ලින්ක් එක Encrypt කර Channel එකට Post කරනු ඇත.</i>`;
            await sendMsg(chatId, helpText);
            return res.status(200).json({ status: 'ok' });
        }
    }

    // 2. Photo එකක් Caption එකක් සමඟ එවීම
    if (message.photo && message.caption) {
        const fileId = message.photo[message.photo.length - 1].file_id;
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

        const postResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHANNEL_ID,
                photo: fileId,
                reply_markup: inlineKeyboard
            })
        });

        const resData = await postResponse.json();

        if (resData.ok) {
            await sendMsg(chatId, "✅ <b>Post එක සාර්ථකව Hot Lanka Channel එකට පළ විය!</b>");
        } else {
            await sendMsg(chatId, `❌ <b>Error:</b> ${resData.description}\n(Bot චැනල් එකේ Admin දැයි පරීක්ෂා කරන්න)`);
        }

        return res.status(200).json({ status: 'ok' });
    }

    // වෙනත් ඕනෑම පණිවිඩයක් ආ විට
    await sendMsg(chatId, "⚠️️ කරුණාකර Photo එකක් තෝරා එහි Caption එකට Link/Code එක දමා එවන්න.");
    return res.status(200).json({ status: 'ok' });
}
