export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(200).send('Post Bot Running');

    const BOT_TOKEN = "8715294684:AAFdq0e3SFZBeKj9i9o1s2D8nDN410csq5U"; // @HotLanka_Bot
    const MAIN_CHANNEL_ID = "-1003920624467"; // ප්‍රධාන චැනල් එක
    const ADMIN_USER_ID = 5411921025; // ඔයාගේ ID එක
    const BASE_URL = "https://unlockcontent.vercel.app";
    const DEFAULT_BANNER = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80";

    // Compact Scrambler (WebApp එකට ගැළපෙන Token Scrambler එක)
    const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
    const SHIFT = 27;
    function scramble(str) {
        return str.split('').map(c => {
            let idx = CHARS.indexOf(c);
            if (idx === -1) return c;
            return CHARS[(idx + SHIFT) % CHARS.length];
        }).join('');
    }

    try {
        const body = req.body;
        if (!body || !body.message) return res.status(200).json({ ok: true });

        const msg = body.message;
        const chatId = msg.chat.id;
        const text = msg.text || msg.caption || "";

        // Admin ට පමණක් ඉඩ දීම
        if (chatId !== ADMIN_USER_ID) return res.status(200).json({ ok: true });

        // FileStore Bot ගෙන් එන ලින්ක් එක අඳුනාගැනීම (t.me/...start=XXXX)
        const match = text.match(/(?:start=|send\s+)([A-Za-z0-9_-]+)/);

        if (match) {
            const rawCode = match[1];
            const scrambled = scramble(rawCode);
            const targetLink = `${BASE_URL}/?t=${scrambled}`;

            const finalCaption = "<blockquote>🔥 Hot Lanka New Update! ❞</blockquote>\n<blockquote>⏳ Link will expire soon, download now! ❞</blockquote>";
            const inlineKeyboard = { 
                inline_keyboard: [ 
                    [{ text: "👁 Watch", url: targetLink }, { text: "⬇️ Download", url: targetLink }] 
                ] 
            };

            // Thumbnail එක සොයා ගැනීම (Video / Photo / Document)
            let thumbId = null;
            if (msg.video) {
                thumbId = (msg.video.thumbnail && msg.video.thumbnail.file_id) || (msg.video.thumb && msg.video.thumb.file_id);
            } else if (msg.document) {
                thumbId = (msg.document.thumbnail && msg.document.thumbnail.file_id) || (msg.document.thumb && msg.document.thumb.file_id);
            } else if (msg.photo) {
                thumbId = msg.photo[msg.photo.length - 1].file_id;
            }

            let postRes;
            // 1. Thumbnail එකක් තිබේ නම් එයින් Post කිරීම
            if (thumbId) {
                postRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: MAIN_CHANNEL_ID,
                        photo: thumbId,
                        caption: finalCaption,
                        parse_mode: 'HTML',
                        reply_markup: inlineKeyboard
                    })
                }).then(r => r.json());
            }

            // 2. Thumbnail එකක් නැතිනම් Default Banner එක යොදා ගැනීම
            if (!postRes || !postRes.ok) {
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: MAIN_CHANNEL_ID,
                        photo: DEFAULT_BANNER,
                        caption: finalCaption,
                        parse_mode: 'HTML',
                        reply_markup: inlineKeyboard
                    })
                });
            }

            // Admin වෙත Confirmation එක යැවීම
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: `✅ <b>Post එක සාර්ථකව පළ කළා!</b>\n\n🔗 <b>Monetag Link:</b> <code>${targetLink}</code>`,
                    parse_mode: 'HTML'
                })
            });

            return res.status(200).json({ ok: true });
        }

        if (text === '/start') {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: "👋 <b>Hot Lanka Post Bot!</b>\n\nFileStore Bot ගෙන් ලැබෙන ලින්ක් එක (හෝ Video එක Caption එකේ ලින්ක් එක සහිතව) මෙතනට එවන්න.",
                    parse_mode: 'HTML'
                })
            });
        }

    } catch (err) {}
    return res.status(200).json({ ok: true });
}
