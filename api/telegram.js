export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(200).send('Bot is running');

    const BOT_TOKEN = "8715294684:AAG-avmObwlmLRFVK8LTtpcUbaZtwX_g4g4"; // ඔයාගේ අලුත් Post Bot Token එක
    const MAIN_CHANNEL_ID = "-1003920624467"; // ප්‍රධාන චැනල් එක
    const DB_CHANNEL_ID = "-1004365559436"; // FileStore DB චැනල් එක
    const ADMIN_USER_ID = 5411921025; // ඔයාගේ ID එක
    const BASE_URL = "https://unlockcontent.vercel.app";
    const DEFAULT_BANNER = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80";

    // Upstash Redis සම්බන්ධතාවය
    const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    async function kvSet(key, value) {
        if (!KV_URL) return;
        await fetch(KV_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(["SET", key, value])
        });
    }

    async function kvGet(key) {
        if (!KV_URL) return null;
        try {
            const resp = await fetch(KV_URL, {
                method: 'POST',
                headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(["GET", key])
            });
            const data = await resp.json();
            return data.result;
        } catch (e) {
            return null;
        }
    }

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
        if (!body) return res.status(200).json({ ok: true });

        // ==============================================================
        // 1. FileStore DB එකට අලුතින් Video එකක් වැටුණු විට Thumbnail එක Redis හි Save වීම
        // ==============================================================
        const channelPost = body.channel_post;
        if (channelPost && String(channelPost.chat.id) === DB_CHANNEL_ID) {
            let thumb = null;
            if (channelPost.video && (channelPost.video.thumbnail || channelPost.video.thumb)) {
                thumb = (channelPost.video.thumbnail && channelPost.video.thumbnail.file_id) || (channelPost.video.thumb && channelPost.video.thumb.file_id);
            } else if (channelPost.document && (channelPost.document.thumbnail || channelPost.document.thumb)) {
                thumb = (channelPost.document.thumbnail && channelPost.document.thumbnail.file_id) || (channelPost.document.thumb && channelPost.document.thumb.file_id);
            } else if (channelPost.photo && channelPost.photo.length > 0) {
                thumb = channelPost.photo[channelPost.photo.length - 1].file_id;
            }

            if (thumb) {
                await kvSet("latest_thumbnail_id", thumb);
            }
            return res.status(200).json({ ok: true });
        }

        // ==============================================================
        // 2. Admin විසින් Post Bot වෙත Link එක එවූ විට Post එක පළ වීම
        // ==============================================================
        const msg = body.message;
        if (!msg) return res.status(200).json({ ok: true });

        const chatId = msg.chat.id;
        const text = msg.text || msg.caption || "";

        if (chatId !== ADMIN_USER_ID) return res.status(200).json({ ok: true });

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

            // Upstash Redis එකේ ඇති Thumbnail එක ලබා ගැනීම
            let thumbId = await kvGet("latest_thumbnail_id");

            let postRes;
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

            // කිසිම Thumbnail එකක් නොලැබුණහොත් Default Banner එක යොදා ගැනීම
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

            // Post වූ පසු Thumbnail එක Redis වෙතින් ඉවත් කිරීම (ඊළඟ එකට පැටලෙන්නේ නැති වීමට)
            await kvSet("latest_thumbnail_id", null);

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
