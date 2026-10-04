export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(200).send('Bot Running');

    const BOT_TOKEN = "8715294684:AAG-avmObwlmLRFVK8LTtpcUbaZtwX_g4g4"; // Post Bot Token
    const MAIN_CHANNEL_ID = "-1003920624467"; // Main Channel
    const DB_CHANNEL_ID = "-1004365559436"; // FileStore DB Channel
    const ADMIN_USER_ID = 5411921025; 
    const BASE_URL = "https://unlockcontent.vercel.app";
    const DEFAULT_BANNER = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80";

    // Upstash Redis Setup
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

    // Token Scrambler for WebApp
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
        // 1. AUTO THUMBNAIL CAPTURE (DB එකට එන ඕනෑම Post එකකින්)
        // ==============================================================
        const post = body.channel_post || body.message;
        if (post && String(post.chat.id) === DB_CHANNEL_ID) {
            let thumb = null;

            // Video එකකින් Thumbnail එක ගැනීම
            if (post.video) {
                if (post.video.thumbnail) thumb = post.video.thumbnail.file_id;
                else if (post.video.thumb) thumb = post.video.thumb.file_id;
            }
            // Document එකක් ලෙස Forward වී ඇත්නම් Thumbnail එක ගැනීම
            else if (post.document) {
                if (post.document.thumbnail) thumb = post.document.thumbnail.file_id;
                else if (post.document.thumb) thumb = post.document.thumb.file_id;
            }
            // Animation / GIF හෝ Photo නම්
            else if (post.animation && post.animation.thumbnail) {
                thumb = post.animation.thumbnail.file_id;
            } else if (post.photo && post.photo.length > 0) {
                thumb = post.photo[post.photo.length - 1].file_id;
            }

            // Thumbnail එක ලැබුණොත් Redis එකේ Auto Save කරනවා
            if (thumb) {
                await kvSet("latest_thumbnail_id", thumb);
            }
            return res.status(200).json({ ok: true });
        }

        // ==============================================================
        // 2. AUTO POST GENERATOR (Admin ලින්ක් එක එවූ සැනින්)
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

            // Redis එකේ Save වී ඇති Thumbnail එක කෙලින්ම ලබා ගැනීම
            let thumbId = await kvGet("latest_thumbnail_id");

            let postRes;
            // Thumbnail එක තිබේ නම් එයින් කෙලින්ම Post කිරීම
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

            // නොලැබුණහොත් පමණක් Default Banner එක යොදා ගැනීම
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

            // සාර්ථක පණිවිඩය Admin වෙත
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
