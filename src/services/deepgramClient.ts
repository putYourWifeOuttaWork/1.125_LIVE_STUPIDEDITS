import { supabase } from '../lib/supabaseClient';

export type TranscriptCallback = (transcript: string, isFinal: boolean) => void;

export class DeepgramClient {
  private ws: WebSocket | null = null;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private onTranscript: TranscriptCallback;
  private onError: (error: string) => void;

  constructor(onTranscript: TranscriptCallback, onError: (error: string) => void) {
    this.onTranscript = onTranscript;
    this.onError = onError;
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  async start(): Promise<void> {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deepgram-token`;
      const res = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) throw new Error('Failed to get Deepgram token');
      const { key } = await res.json();

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });

      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      const wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&interim_results=true&endpointing=300&encoding=linear16&sample_rate=16000&channels=1`;

      this.ws = new WebSocket(wsUrl, ['token', key]);

      this.ws.onopen = () => {
        this.processor!.onaudioprocess = (e) => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            const input = e.inputBuffer.getChannelData(0);
            const pcm16 = new Int16Array(input.length);
            for (let i = 0; i < input.length; i++) {
              const s = Math.max(-1, Math.min(1, input[i]));
              pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            this.ws.send(pcm16.buffer);
          }
        };
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.channel?.alternatives?.[0]) {
            const alt = data.channel.alternatives[0];
            const transcript = alt.transcript || '';
            if (transcript) {
              this.onTranscript(transcript, data.is_final === true);
            }
          }
        } catch {
          // ignore parse errors
        }
      };

      this.ws.onerror = () => {
        this.onError('WebSocket connection error');
      };

      this.ws.onclose = () => {
        // cleanup handled in stop()
      };
    } catch (err) {
      this.onError(err instanceof Error ? err.message : 'Failed to start recording');
      this.stop();
    }
  }

  stop(): void {
    if (this.processor) {
      this.processor.onaudioprocess = null;
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.analyser) {
      this.analyser.disconnect();
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
      this.analyser = null;
    }

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'CloseStream' }));
      }
      this.ws.close();
      this.ws = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
  }
}
