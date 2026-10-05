export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(200).send('Bot is running');

    const BOT_TOKEN = "8715294684:AAG-avmObwlmLRFVK8LTtpcUbaZtwX_g4g4";
    const CHANNEL_ID = "-1003920624467"; // Main Channel ID
    const VIP_CHANNEL_ID = "-1004316350899"; // VIP Channel ID
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

        // 1. DB Channel එකට Video හෝ Post එකක් වැටුණු විට ක්‍රියාත්මක වීම
        if (body.channel_post) {
            const post = body.channel_post;
            let thumbId = null;

            if (post.video && post.video.thumbnail) thumbId = post.video.thumbnail.file_id;
            else if (post.document && post.document.thumbnail) thumbId = post.document.thumbnail.file_id;
            else if (post.photo) thumbId = post.photo[post.photo.length - 1].file_id;

            if (thumbId) await kvSet("latest_thumbnail_id", thumbId);

            try {
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/copyMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: VIP_CHANNEL_ID,
                        from_chat_id: post.chat.id,
                        message_id: post.message_id
                    })
                });
            } catch (vipErr) {
                console.error("VIP Copy Error:", vipErr);
            }

            return res.status(200).json({ ok: true });
        }

        // 2. Admin පණිවිඩ එවන විට ක්‍රියාත්මක වීම
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
                await sendMsg(chatId, "<b>Hot Lanka Bot Active!</b>\n\n- Forward a FileStore link to create a post.\n- Or send a Photo with Caption to post a custom image.");
                return res.status(200).json({ ok: true });
            }

            // Link එකක් හඳුනාගත් විට
            if (textContent.includes("start=")) {
                const startCode = textContent.split("start=")[1].split("&")[0].split(/\s+/)[0].trim();
                const token = scramble(startCode);
                const targetLink = `${BASE_URL}/?t=${token}`;

                const inlineKeyboard = {
                    inline_keyboard: [
                        [{ text: "👁 Watch", url: targetLink }, { text: "⬇️ Download", url: targetLink }]
                    ]
                };

                let defaultCaption = await kvGet("default_caption");
                if (!defaultCaption) {
                    defaultCaption = "<blockquote>🔥 Hot Lanka New Update! ❞</blockquote>\n<blockquote>⏳ Link will expire soon, download now! ❞</blockquote>";
                }

                // Custom Caption එක වෙන් කර ගැනීම
                let customText = textContent
                    .replace(/https?:\/\/[^\s]+/g, '')
                    .replace("Here is your universal link:", '')
                    .replace("Note:The same content can be accessed by any of your clones by replacing the bot username in the link. The link creator (you) must be a moderator in those clones, Those clones must also be connected to the same source channel. To know more click here", '')
                    .replace("Note:The same content can be accessed by...", '')
                    .trim();

                let finalCaption = defaultCaption;
                if (customText.length > 0) {
                    finalCaption = `<b>${customText}</b>\n\n${defaultCaption}`;
                }

                let postRes = null;

                // A. පරිශීලකයා අලුතින් Photo එකක් එවා ඇත්නම් (Direct Photo File ID භාවිතය)
                if (msg.photo && msg.photo.length > 0) {
                    const customPhotoId = msg.photo[msg.photo.length - 1].file_id;
                    postRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: CHANNEL_ID,
                            photo: customPhotoId,
                            caption: finalCaption,
                            parse_mode: 'HTML',
                            reply_markup: inlineKeyboard
                        })
                    });
                } else {
                    // B. Link එක පමණක් Forward කර ඇත්නම් DB Thumbnail එක Download කර Upload කිරීම
                    const thumbFileId = await kvGet("latest_thumbnail_id");
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
                                formData.append('parse_mode', 'HTML');
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
                }

                // C. Thumbnail හෝ Photo කිසිවක් නැතිනම් Default Banner එක යැවීම
                if (!postRes || !postRes.ok) {
                    postRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: CHANNEL_ID,
                            photo: DEFAULT_BANNER,
                            caption: finalCaption,
                            parse_mode: 'HTML',
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
