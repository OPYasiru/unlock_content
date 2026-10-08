import os
import re
import requests
import json
import asyncio
import subprocess
from PIL import Image
from pyrogram import Client
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

# ================= CONFIGURATION =================
API_ID = 30345187
API_HASH = "b1d1c146f1ec4d51fbae1ca15acd51e7"
SESSION_STRING = "BQHPB-MAgIhaOR78QXklUqSgZ73tcDi1KNewbXzuFZDkz656r4EysakVhPL3zxA6LUotYiFXx7Djs6JjqKBgUls7yzUsZivXKL2dbhbfhr5BZlCfvJ5rUpU5nhPK8pLpz-VcZimrPEiyc-UiGsOS7UK7JOI8865tjv8fIYJT7tlMUlhJtyIdnKwmpjNvSiXM5NkU-iNGV1AKrVrOjV0DkeDb3gcEbhvhO3gelgQ9B1UDSTxgap3C2BAyyCifVLzc8NmqMIMI1dKSs4B2NQqXj6SjbxWsaLOB3GWKrCzul1wx1xT_1UHDqb3DAzA8xz0Bpirl8MXaQ82hgc1RdlMiXW3X4HmZFwAAAAFCk1yBAA"

FILE_STORE_BOT = "FileStoreSL_bot"
POST_BOT = "HotLanka_Bot"
# =================================================

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Client(
    "permanent_session",
    api_id=API_ID,
    api_hash=API_HASH,
    session_string=SESSION_STRING,
    workers=8,
    max_concurrent_transmissions=8
)

def extract_video_metadata_and_thumb(video_path):
    duration = 0
    width = 1280
    height = 720
    video_thumb_path = "video_cover_thumb.jpg"

    try:
        probe_cmd = f'ffprobe -v quiet -print_format json -show_streams -show_format "{video_path}"'
        output = subprocess.check_output(probe_cmd, shell=True).decode()
        data = json.loads(output)
        if "format" in data and "duration" in data["format"]:
            duration = int(float(data["format"]["duration"]))
        for stream in data.get("streams", []):
            if stream.get("codec_type") == "video":
                width = int(stream.get("width", 1280))
                height = int(stream.get("height", 720))
                if duration == 0 and "duration" in stream:
                    duration = int(float(stream["duration"]))
                break
    except Exception:
        pass

    try:
        thumb_time = "00:00:02" if duration >= 2 else "00:00:01"
        thumb_cmd = f'ffmpeg -ss {thumb_time} -i "{video_path}" -vframes 1 -q:v 2 "{video_thumb_path}" -y'
        subprocess.run(thumb_cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if not os.path.exists(video_thumb_path):
            video_thumb_path = None
    except Exception:
        video_thumb_path = None

    return duration, width, height, video_thumb_path

def download_cloudflare_image(image_url, output_path):
    raw_path = "raw_downloaded_img"
    clean_url = image_url.replace("https://", "").replace("http://", "")
    proxy_urls = [
        f"https://images.weserv.nl/?url={clean_url}&default={image_url}",
        f"https://i0.wp.com/{clean_url}"
    ]
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36"}

    for p_url in proxy_urls:
        try:
            r = requests.get(p_url, headers=headers, timeout=12)
            if r.status_code == 200 and len(r.content) > 2000:
                with open(raw_path, "wb") as f:
                    f.write(r.content)
                with Image.open(raw_path) as im:
                    im.convert("RGB").save(output_path, "JPEG", quality=95)
                if os.path.exists(raw_path):
                    os.remove(raw_path)
                return True
        except Exception:
            continue

    if os.path.exists(raw_path):
        os.remove(raw_path)
    return False

async def workflow_stream(video_url: str, image_url: str):
    temp_video = "cloud_video.mp4"
    post_photo = "post_photo.jpg"

    def sse(msg, progress=None):
        return f"data: {json.dumps({'message': msg, 'progress': progress})}\n\n"

    try:
        yield sse("🚀 වීඩියෝව Server එක වෙත බාගත වෙමින් පවතී...", 10)
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        with requests.get(video_url, headers=headers, stream=True) as response:
            response.raise_for_status()
            with open(temp_video, "wb") as f:
                for chunk in response.iter_content(chunk_size=10 * 1024 * 1024):
                    if chunk:
                        f.write(chunk)

        file_size = os.path.getsize(temp_video) / (1024 * 1024)
        yield sse(f"✅ වීඩියෝව බාගත විය ({file_size:.2f} MB)", 30)

        yield sse("⏱️ වීඩියෝ Cover සහ Length Metadata සකසමින් පවතී...", 40)
        duration, width, height, video_thumb = extract_video_metadata_and_thumb(temp_video)

        yield sse("🖼️ Post Bot සඳහා Thumbnail එක බාගත කරමින් පවතී...", 50)
        has_img = download_cloudflare_image(image_url, post_photo)
        if not has_img and video_thumb and os.path.exists(video_thumb):
            Image.open(video_thumb).save(post_photo, "JPEG")

        yield sse(f"🤖 @{FILE_STORE_BOT} වෙත /universal_link යවමින් පවතී...", 60)

        async with client:
            cmd_msg = await client.send_message(FILE_STORE_BOT, "/universal_link")
            await asyncio.sleep(2)

            yield sse("🔘 'Single Message Link' බොත්තම ඔබමින් පවතී...", 70)
            button_clicked = False
            async for msg in client.get_chat_history(FILE_STORE_BOT, limit=3):
                if msg.reply_markup and msg.reply_markup.inline_keyboard:
                    for row in msg.reply_markup.inline_keyboard:
                        for btn in row:
                            if "Single" in btn.text:
                                try:
                                    await msg.click(btn.text)
                                except Exception:
                                    pass
                                button_clicked = True
                                break
                        if button_clicked:
                            break
                if button_clicked:
                    break

            await asyncio.sleep(1.5)

            yield sse("⚡ වීඩියෝව 'HotLanka' Caption සහිතව Bot වෙත Upload කරමින් පවතී...", 80)
            await client.send_video(
                chat_id=FILE_STORE_BOT,
                video=temp_video,
                caption="HotLanka",
                duration=duration,
                width=width,
                height=height,
                thumb=video_thumb,
                supports_streaming=True
            )

            yield sse("⏳ File Store Link එක ලැබෙන තුරු රැඳී සිටී...", 90)
            extracted_link = None
            for _ in range(25):
                await asyncio.sleep(2)
                async for reply in client.get_chat_history(FILE_STORE_BOT, limit=3):
                    if reply.text and reply.id > cmd_msg.id:
                        links = re.findall(r'https://t\.me/[^\s]+', reply.text)
                        if links:
                            extracted_link = links[0]
                            break
                if extracted_link:
                    break

            if extracted_link:
                yield sse(f"🔗 ලින්ක් එක: {extracted_link}", 95)
                yield sse(f"🚀 @{POST_BOT} වෙත Photo + Caption පළ කරමින් පවතී...", 98)
                await client.send_photo(
                    chat_id=POST_BOT,
                    photo=post_photo,
                    caption=extracted_link
                )
                yield sse("🎉 සාර්ථකයි! Channel එකට Post එක සම්පූර්ණයෙන්ම පළ විය!", 100)
            else:
                yield sse("❌ Bot සබැඳිය ලබාගැනීමට නොහැකි විය.", 100)

    except Exception as e:
        yield sse(f"❌ Error: {str(e)}", 100)
    finally:
        if os.path.exists(temp_video):
            os.remove(temp_video)
        if video_thumb and os.path.exists(video_thumb):
            os.remove(video_thumb)
        if os.path.exists(post_photo):
            os.remove(post_photo)

@app.get("/stream_upload")
async def stream_upload_endpoint(video_url: str, image_url: str):
    return StreamingResponse(workflow_stream(video_url, image_url), media_type="text/event-stream")