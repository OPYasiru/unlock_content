export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(200).send('Bot is running');

    const BOT_TOKEN = "8715294684:AAG-avmObwlmLRFVK8LTtpcUbaZtwX_g4g4";
    const CHANNEL_ID = "-1003920624467";
    const ADMIN_USER_ID = 5411921025;
    const CHANNEL_ID = "-1003920624467"; // Main Channel ID
    const VIP_CHANNEL_ID = "-1004316350899"; // VIP Channel ID
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

    async function kvSet(key, value) {
        if (!KV_URL || !KV_TOKEN) return;
        try {
            await fetch(KV_URL, {
                method: 'POST',
                headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(["SET", key, value])
            });
        } catch (e) { console.error("KV Set Error:", e); }
    }

    async function kvGet(key) {
        if (!KV_URL || !KV_TOKEN) return null;
        try {
            const resp = await fetch(KV_URL, {
                method: 'POST',
                headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(["GET", key])
            });
            const data = await resp.json();
            return data.result;
        } catch (e) { return null; }
    }

    try {
        const body = req.body;
        if (!body) return res.status(200).json({ ok: true });

        if (body.channel_post) {
            const post = body.channel_post;
            let thumbId = null;

            if (post.video && post.video.thumbnail) thumbId = post.video.thumbnail.file_id;
            else if (post.document && post.document.thumbnail) thumbId = post.document.thumbnail.file_id;
            else if (post.photo) thumbId = post.photo[post.photo.length - 1].file_id;

            if (thumbId) await kvSet("latest_thumbnail_id", thumbId);
            return res.status(200).json({ ok: true });
        }

        if (body.message) {
            const msg = body.message;
            const chatId = msg.chat.id;

            if (msg.from && msg.from.id !== ADMIN_USER_ID) return res.status(200).json({ ok: true });

            const textContent = msg.text || msg.caption || "";

            if (textContent.startsWith('/settext ')) {
                const newText = textContent.replace('/settext ', '').trim();
                await kvSet("default_caption", newText);
                await sendMsg(chatId, `✅ <b>Default text updated successfully:</b>\n\n${newText}`);
                return res.status(200).json({ ok: true });
            }

            if (textContent.startsWith('/start') || textContent.startsWith('/help')) {
                await sendMsg(chatId, "<b>Hot Lanka Bot Active!</b>\n\n- Forward a FileStore link to create a post with default text.\n- Use <code>/settext [your text]</code> to change the default caption.\n- To use a custom caption for a single post, type your text and paste the link at the end of it.");
                return res.status(200).json({ ok: true });
            }

            if (textContent.includes("start=")) {
                const startCode = textContent.split("start=")[1].split("&")[0].split(/\s+/)[0].trim();
                const token = scramble(startCode);
                const targetLink = `${BASE_URL}/?t=${token}`;

                const inlineKeyboard = {
                    inline_keyboard: [
                        [{ text: "👁 Watch", url: targetLink }, { text: "⬇️ Download", url: targetLink }]
                    ]
                };

                let finalCaption = await kvGet("default_caption");
                if (!finalCaption) {
                    finalCaption = "<blockquote>🔥 Hot Lanka New Update! ❞</blockquote>\n<blockquote>⏳ Link will expire soon, download now! ❞</blockquote>";
                }

                if (!textContent.includes("Here is your universal link:") && !textContent.includes("Note:The same content")) {
                    const customText = textContent.replace(/https?:\/\/[^\s]+/g, '').trim();
                    if (customText.length > 0) {
                        finalCaption = customText;
                    }
                }

                const thumbFileId = await kvGet("latest_thumbnail_id");
                let postRes;

                if (thumbFileId) {
                    try {
                        const getFileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${thumbFileId}`);
                        const fileData = await getFileRes.json();
                        
                        if (fileData.ok && fileData.result.file_path) {
                            const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
                            const imageRes = await fetch(fileUrl);
                            const imageBlob = await imageRes.blob();

                            const formData = new FormData();
                            formData.append('chat_id', CHANNEL_ID);
                            formData.append('photo', imageBlob, 'thumb.jpg');
                            formData.append('caption', finalCaption);
                            formData.append('parse_mode', 'HTML'); // මෙතැනට HTML parsing එකතු කළා
                            formData.append('reply_markup', JSON.stringify(inlineKeyboard));

                            postRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                                method: 'POST',
                                body: formData
                            });
                            

                        }
                    } catch (uploadErr) {
                        console.error("Upload Error:", uploadErr);
                    }
                }

                if (!postRes || !postRes.ok) {
                    postRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: CHANNEL_ID,
                            photo: DEFAULT_BANNER,
                            caption: finalCaption,
                            parse_mode: 'HTML', // මෙතැනටත් HTML parsing එකතු කළා
                            reply_markup: inlineKeyboard
                        })
                    });
                }

                const resJson = await postRes.json();
                if (resJson.ok) {
                    await sendMsg(chatId, "✅ <b>Post published successfully!</b>");
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
