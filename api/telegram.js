export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(200).send('Post Bot Running');

    const BOT_TOKEN = "8715294684:AAFdq0e3SFZBeKj9i9o1s2D8nDN410csq5U"; // @HotLanka_Bot
    const MAIN_CHANNEL_ID = "-1003920624467"; // ප්‍රධාන චැනල් එක
    const DB_CHANNEL_ID = "-1004365559436"; // FileStore DB චැනල් එක
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

        // FileStore Bot ගෙන් එන ලින්ක් එක අඳුනාගැනීම (t.me/...start=XXXX හෝ batch code)
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

            let thumbId = null;

            // 1. ලින්ක් එකෙන් Message ID එක වෙන්කර ගැනීම (Single file code එකක් නම්)
            let dbMsgId = null;
            try {
                // FileStore bot generate කරන code එක Base64 decode කර ID එක ගැනීම
                const decoded = Buffer.from(rawCode, 'base64').toString('utf-8');
                const idMatch = decoded.match(/\d+/);
                if (idMatch) dbMsgId = parseInt(idMatch[0]);
            } catch (e) {}

            // 2. DB චැනල් එකේ ඇති Message එකෙන් Thumbnail එක ලබා ගැනීම
            if (dbMsgId) {
                try {
                    // අදාළ Message එක DB එකෙන් Admin ට forward කර තොරතුරු ලබාගැනීම
                    const fwdRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/forwardMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chat_id: ADMIN_USER_ID, from_chat_id: DB_CHANNEL_ID, message_id: dbMsgId })
                    }).then(r => r.json());

                    if (fwdRes.ok) {
                        const fwdMsg = fwdRes.result;
                        if (fwdMsg.video) thumbId = (fwdMsg.video.thumbnail && fwdMsg.video.thumbnail.file_id) || (fwdMsg.video.thumb && fwdMsg.video.thumb.file_id);
                        else if (fwdMsg.document) thumbId = (fwdMsg.document.thumbnail && fwdMsg.document.thumbnail.file_id) || (fwdMsg.document.thumb && fwdMsg.document.thumb.file_id);
                        else if (fwdMsg.photo) thumbId = fwdMsg.photo[fwdMsg.photo.length - 1].file_id;

                        // Forward කළ මැසේජ් එක Admin චැට් එකෙන් ක්ෂණිකව මකා දැමීම
                        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ chat_id: ADMIN_USER_ID, message_id: fwdMsg.message_id })
                        });
                    }
                } catch (e) {}
            }

            let postRes;
            // 3. Thumbnail එක ලැබුණේ නම් එයින් Post එක පළ කිරීම
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

            // 4. Thumbnail එකක් නොලැබුණහොත් පමණක් Default Banner එක යෙදීම
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

            // Confirmation message එක එවන්න
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

    } catch (err) {}
    return res.status(200).json({ ok: true });
}
