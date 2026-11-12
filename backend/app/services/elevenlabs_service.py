"""Server-side ElevenLabs calls. The API key never leaves the backend."""
from __future__ import annotations

import os

import httpx

API = "https://api.elevenlabs.io/v1"


class VoiceUnavailable(RuntimeError):
    pass


def tts_configured() -> bool:
    return bool(os.getenv("ELEVENLABS_API_KEY") and os.getenv("ELEVENLABS_VOICE_ID"))


def agent_configured() -> bool:
    return bool(os.getenv("ELEVENLABS_API_KEY") and os.getenv("ELEVENLABS_AGENT_ID"))


async def synthesize(text: str) -> bytes:
    """Text-to-speech → MP3 bytes. Raises VoiceUnavailable on any failure."""
    if not tts_configured():
        raise VoiceUnavailable("ElevenLabs TTS is not configured (set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID).")
    voice = os.environ["ELEVENLABS_VOICE_ID"]
    model = os.getenv("ELEVENLABS_TTS_MODEL", "eleven_multilingual_v2")
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(
                f"{API}/text-to-speech/{voice}",
                params={"output_format": "mp3_44100_128"},
                headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Accept": "audio/mpeg"},
                json={"text": text, "model_id": model},
            )
    except httpx.HTTPError as e:
        raise VoiceUnavailable(f"Could not reach ElevenLabs: {e.__class__.__name__}") from e
    if r.status_code != 200:
        raise VoiceUnavailable(f"ElevenLabs returned HTTP {r.status_code}")
    return r.content


async def conversation_credentials() -> dict:
    """Fetch a short-lived WebRTC conversation token for the Penny agent."""
    if not agent_configured():
        raise VoiceUnavailable("Live conversation is not configured (set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID).")
    agent = os.environ["ELEVENLABS_AGENT_ID"]
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(f"{API}/convai/conversation/token", params={"agent_id": agent},
                            headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"]})
    except httpx.HTTPError as e:
        raise VoiceUnavailable(f"Could not reach ElevenLabs: {e.__class__.__name__}") from e
    if r.status_code != 200:
        raise VoiceUnavailable(f"ElevenLabs returned HTTP {r.status_code}")
    token = r.json().get("token")
    if not token:
        raise VoiceUnavailable("ElevenLabs did not return a conversation token")
    return {"conversation_token": token, "connection_type": "webrtc"}
