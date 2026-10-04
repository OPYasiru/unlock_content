export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(200).send('Bot is running');

    const BOT_TOKEN = "8715294684:AAFdq0e3SFZBeKj9i9o1s2D8nDN410csq5U";
    const CHANNEL_ID = "-1003920624467";
    const ADMIN_USER_ID = 5411921025;
    const BASE_URL = "https://unlockcontent.vercel.app";
    const DEFAULT_BANNER = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80";

    const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

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
        } catch (e) { console.error(e); }
    }

    // KV එකේ Thumbnail ID එක Save කිරීම
    async function saveLatestThumbnail(fileId) {
        if (!KV_URL || !KV_TOKEN) return;
        try {
            await fetch(KV_URL, {
                method: 'POST',
                headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(["SET", "latest_thumbnail_id", fileId])
            });
        } catch (e) { console.error("KV Set Error:", e); }
    }

    // KV එකෙන් Thumbnail ID එක ගැනීම
    async function getLatestThumbnail() {
        if (!KV_URL || !KV_TOKEN) return null;
        try {
            const resp = await fetch(KV_URL, {
                method: 'POST',
                headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(["GET", "latest_thumbnail_id"])
            });
            const data = await resp.json();
            return data.result;
        } catch (e) { return null; }
    }

    try {
        const body = req.body;
        if (!body) return res.status(200).json({ ok: true });

        // 1. FileStore DB එකට Video එක වැටෙන විට ID එක Cache කිරීම
        if (body.channel_post) {
            const post = body.channel_post;
            let thumbId = null;

            if (post.video && post.video.thumbnail) thumbId = post.video.thumbnail.file_id;
            else if (post.document && post.document.thumbnail) thumbId = post.document.thumbnail.file_id;
            else if (post.photo) thumbId = post.photo[post.photo.length - 1].file_id;

            if (thumbId) await saveLatestThumbnail(thumbId);
            return res.status(200).json({ ok: true });
        }

        // 2. ලින්ක් එක Forward කළ විට
        if (body.message) {
            const msg = body.message;
            const chatId = msg.chat.id;

            if (msg.from && msg.from.id !== ADMIN_USER_ID) return res.status(200).json({ ok: true });

            const textContent = msg.text || msg.caption || "";

            if (textContent.includes("start=")) {
                const startCode = textContent.split("start=")[1].split("&")[0].split(/\s+/)[0].trim();
                const token = scramble(startCode);
                const targetLink = `${BASE_URL}/?t=${token}`;

                const inlineKeyboard = {
                    inline_keyboard: [
                        [{ text: "👁 Watch", url: targetLink }, { text: "⬇️ Download", url: targetLink }]
                    ]
                };

                const captionText = "🔥 Hot Lanka New Update!\n⏳ Link will expire soon, download now!";
                const thumbFileId = await getLatestThumbnail();

                let postRes;

                // Thumbnail එක Download කර Upload කිරීම
                if (thumbFileId) {
                    try {
                        const getFileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${thumbFileId}`);
                        const fileData = await getFileRes.json();
                        
                        if (fileData.ok && fileData.result.file_path) {
                            const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
                            const imageRes = await fetch(fileUrl);
                            const imageBlob = await imageRes.blob(); // Vercel එක ඇතුළට Download කරගනී

                            const formData = new FormData();
                            formData.append('chat_id', CHANNEL_ID);
                            formData.append('photo', imageBlob, 'thumb.jpg');
                            formData.append('caption', captionText);
                            formData.append('reply_markup', JSON.stringify(inlineKeyboard));

                            // File එකක් විදියට Telegram එකට Upload කිරීම
                            postRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                                method: 'POST',
                                body: formData
                            });
                        }
                    } catch (uploadErr) {
                        console.error("Upload Error:", uploadErr);
                    }
                }

                // යම් දෝෂයක් ආවොත් පමණක් Default Banner එක දැමීම
                if (!postRes || !postRes.ok) {
                    postRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: CHANNEL_ID,
                            photo: DEFAULT_BANNER,
                            caption: captionText,
                            reply_markup: inlineKeyboard
                        })
                    });
                }

                const resJson = await postRes.json();
                if (resJson.ok) {
                    await sendMsg(chatId, "✅ <b>Post එක සාර්ථකව Video Thumbnail එක සමඟින් පළ විය!</b>");
                } else {
                    await sendMsg(chatId, `❌ Error: ${resJson.description}`);
                }

                return res.status(200).json({ ok: true });
            }
        }
    } catch (err) {
        console.error("Handler error:", err);
    }
    return res.status(200).json({ ok: true });
}
