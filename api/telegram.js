export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(200).send('Bot is running');
    }

    const BOT_TOKEN = "8715294684:AAFdqe3SFZBeKj9i9o1s2D8nDN410csq5U";
    const CHANNEL_ID = "-1003920624467";
    const ADMIN_USER_ID = 5411921025;
    const BASE_URL = "https://unlockcontent.vercel.app";

    // 🔴 Default Caption එක (ඔයාට කැමති default text එක මෙතැනට දෙන්න පුළුවන්)
    const DEFAULT_CAPTION = "🔥 Hot Lanka New Update!\n⏳ Link will expire soon, download now!";

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

    if (message.from.id !== ADMIN_USER_ID) {
        await sendMsg(chatId, "Access denied. Admin only.");
        return res.status(200).send('Unauthorized');
    }

    // 1. Text Commands
    if (message.text) {
        const text = message.text.trim();

        if (text.startsWith('/start') || text.startsWith('/help')) {
            const helpMsg = `<b>Hot Lanka Auto Post Bot</b>\n\n` +
                `<b>How to post:</b>\n` +
                `1. Send photo/video with FileStore link.\n` +
                `2. To add custom caption, write your text and add link at the end.\n\n` +
                `<b>Example:</b>\n` +
                `<code>Ape aluthma video eka https://t.me/FileStoreSl_bot?start=DW5...</code>`;
            await sendMsg(chatId, helpMsg);
            return res.status(200).json({ status: 'ok' });
        }
    }

    // 2. Media Upload (Photo, Video, Document)
    if ((message.photo || message.video || message.document) && message.caption) {
        const fullCaption = message.caption.trim();

        // Regex මගින් Telegram bot link එක හෝ start code එක හඳුනා ගැනීම
        const linkMatch = fullCaption.match(/(?:https?:\/\/t\.me\/[^\s]+start=([^\s&]+)|start=([^\s&]+))/i);
        
        let startCode = "";
        let finalCaption = DEFAULT_CAPTION; // Default text එක මුලින්ම තෝරා ගනී

        if (linkMatch) {
            startCode = linkMatch[1] || linkMatch[2];
            // Link එක අයින් කර ඉතිරි text එකක් ඇත්නම් එය Custom Caption එක ලෙස ගනී
            const customText = fullCaption.replace(linkMatch[0], '').trim();
            if (customText.length > 0) {
                finalCaption = customText;
            }
        } else {
            // ලින්ක් එකක් නැතිව කෙලින්ම code එකක් පමණක් එවුවහොත්
            const parts = fullCaption.split(/\s+/);
            startCode = parts[parts.length - 1];
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
                await sendMsg(chatId, "✅ Post published successfully with caption!");
            } else {
                await sendMsg(chatId, `❌ Error: ${resData.description}`);
            }
        } else {
            await sendMsg(chatId, "⚠️ No thumbnail found. Please send with an image.");
        }

        return res.status(200).json({ status: 'ok' });
    }

    await sendMsg(chatId, "Please send media with your link in the caption.");
    return res.status(200).json({ status: 'ok' });
}
