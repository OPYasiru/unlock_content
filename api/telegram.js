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

        // Admin ට පමණක් අවසර දීම
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

            let thumbId = null;

            // 1. DB චැනල් එකට අන්තිමට ආපු Message එක අරගෙන Thumbnail එක ගැනීම
            // (DB එකට dummy message එකක් යවා එහි ID එකෙන් අන්තිම Message එක සොයාගැනීම)
            try {
                const probeRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: DB_CHANNEL_ID, text: "🔍" })
                }).then(r => r.json());

                if (probeRes.ok) {
                    const latestId = probeRes.result.message_id;
                    // යවපු probe message එක වහාම මකා දැමීම
                    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chat_id: DB_CHANNEL_ID, message_id: latestId })
                    });

                    // ඊට කලින් DB එකට වැටුණු අන්තිම වීඩියෝ 5 පරීක්ෂා කර Thumbnail එක සොයාගැනීම
                    for (let checkId = latestId - 1; checkId >= latestId - 5; checkId--) {
                        const copyRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/copyMessage`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ chat_id: ADMIN_USER_ID, from_chat_id: DB_CHANNEL_ID, message_id: checkId })
                        }).then(r => r.json());

                        if (copyRes.ok) {
                            const copiedMsgId = copyRes.result.message_id;

                            // Message විස්තර බලා Thumbnail එක ගැනීම සඳහා Forward කිරීම
                            const fwd = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/forwardMessage`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ chat_id: ADMIN_USER_ID, from_chat_id: DB_CHANNEL_ID, message_id: checkId })
                            }).then(r => r.json());

                            if (fwd.ok) {
                                const fMsg = fwd.result;
                                if (fMsg.video) thumbId = (fMsg.video.thumbnail && fMsg.video.thumbnail.file_id) || (fMsg.video.thumb && fMsg.video.thumb.file_id);
                                else if (fMsg.document) thumbId = (fMsg.document.thumbnail && fMsg.document.thumbnail.file_id) || (fMsg.document.thumb && fMsg.document.thumb.file_id);
                                else if (fMsg.photo) thumbId = fMsg.photo[fMsg.photo.length - 1].file_id;

                                // එවපු මැසේජ් ක්ෂණිකව මකා දැමීම
                                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: ADMIN_USER_ID, message_id: fMsg.message_id }) });
                            }

                            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: ADMIN_USER_ID, message_id: copiedMsgId }) });

                            if (thumbId) break; // Thumbnail එක හමුවූ පසු loop එක නවත්වන්න
                        }
                    }
                }
            } catch (e) {}

            let postRes;
            // 2. DB එකෙන් හමුවූ Thumbnail එකෙන් Main Channel එකට පෝස්ට් කිරීම
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

            // 3. යම් හෙයකින් Thumbnail එකක් නැතිනම් පමණක් Default Banner එක යොදා ගැනීම
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

            // Admin ට Confirmation ලින්ක් එක එවන්න
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
