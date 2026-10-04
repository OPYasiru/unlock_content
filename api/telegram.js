export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(200).send('Post Bot Running');

    const BOT_TOKEN = "8715294684:AAFdq0e3SFZBeKj9i9o1s2D8nDN410csq5U"; // @HotLanka_Bot
    const MAIN_CHANNEL_ID = "-1003920624467"; 
    const ADMIN_USER_ID = 5411921025; 
    const BASE_URL = "https://unlockcontent.vercel.app";
    const DEFAULT_BANNER = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80";

    const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    async function kvSet(key, value) {
        if (KV_URL) await fetch(KV_URL, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(["SET", key, value]) });
    }
    async function kvGet(key) {
        if (!KV_URL) return null;
        try { const resp = await fetch(KV_URL, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(["GET", key]) }); return (await resp.json()).result; } catch (e) { return null; }
    }

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

        if (chatId !== ADMIN_USER_ID) return res.status(200).json({ ok: true });

        // 1. Video එකෙන් හෝ Photo එකෙන් Thumbnail එකක් ආවොත් ඒක Redis එකේ Save කිරීම
        let currentThumb = null;
        if (msg.video) {
            currentThumb = (msg.video.thumbnail && msg.video.thumbnail.file_id) || (msg.video.thumb && msg.video.thumb.file_id);
        } else if (msg.photo) {
            currentThumb = msg.photo[msg.photo.length - 1].file_id;
        }

        if (currentThumb) {
            await kvSet("last_thumb_id", currentThumb);
        }

        // 2. FileStore Bot ගේ ලින්ක් එක අඳුනාගැනීම
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

            // අලුතින් ආපු thumb එකක් නැත්නම් Database (Redis) එකේ තියෙන අන්තිම thumb එක ගැනීම
            let thumbId = currentThumb || (await kvGet("last_thumb_id"));

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

            // Thumbnail නැත්නම් පමණක් Default Banner එක දැමීම
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

        // වීඩියෝවක් / පින්තූරයක් ලින්ක් එකක් නැතුව ආවොත් Thumbnail එක විතරක් Save කරගෙන ඉන්නවා
        if (currentThumb && !match) {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: "🖼 <b>Thumbnail එක Save කරගත්තා!</b> දැන් FileStore Bot ගෙන් ආපු Link එක එවන්න.",
                    parse_mode: 'HTML'
                })
            });
            return res.status(200).json({ ok: true });
        }

    } catch (err) {}
    return res.status(200).json({ ok: true });
}
