/**
 * voice.js — Web Speech API 語音識別
 */

export class VoiceRecorder {
  constructor({ onResult, onInterim, onStart, onEnd, onError }) {
    this.onResult = onResult;
    this.onInterim = onInterim;
    this.onStart = onStart;
    this.onEnd = onEnd;
    this.onError = onError;
    this.recognition = null;
    this.isRecording = false;
    this.finalText = '';
    this._init();
  }

  _init() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      this.supported = false;
      return;
    }
    this.supported = true;

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = localStorage.getItem('voice_lang') || 'zh-TW';
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.isRecording = true;
      this.onStart?.();
    };

    this.recognition.onend = () => {
      this.isRecording = false;
      this.onEnd?.(this.finalText);
    };

    this.recognition.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          this.finalText += text;
        } else {
          interim += text;
        }
      }
      this.onInterim?.(interim);
      this.onResult?.(this.finalText, interim);
    };

    this.recognition.onerror = (e) => {
      this.isRecording = false;
      if (e.error === 'no-speech') return; // 靜音時忽略

      const errorMap = {
        'not-allowed':      '🎙️ 麥克風權限被拒絕，請到手機「設置 → 瀏覽器 → 麥克風」開啟權限後重試。',
        'permission-denied':'🎙️ 麥克風權限被拒絕，請到手機「設置 → 瀏覽器 → 麥克風」開啟權限後重試。',
        'network':          '📡 語音識別需要網路連線，請確認已連接網路後再試。',
        'aborted':          '語音識別已中止，請重新點擊麥克風開始錄音。',
        'audio-capture':    '🎙️ 無法讀取麥克風，請確認其他 App 沒有佔用麥克風。',
        'service-not-allowed': '⚠️ 此瀏覽器不允許語音識別服務，建議改用 Chrome 瀏覽器。',
        'bad-grammar':      '語音識別語法設置錯誤，請重試。',
        'language-not-supported': '當前語言不受支持，請到「⚙️ 設置 → 語音識別語言」更換語言。',
      };

      const msg = errorMap[e.error] || `語音識別出現錯誤（${e.error}），請重試。`;
      this.onError?.(msg);
    };
  }

  start() {
    if (!this.supported) {
      this.onError?.('⚠️ 此瀏覽器不支援語音識別功能。\n建議使用手機的 Chrome 瀏覽器，或者直接在下方文字框手動輸入內容。');
      return;
    }
    this.finalText = '';
    try {
      this.recognition.start();
    } catch (e) {
      // 已在錄音中
    }
  }

  stop() {
    if (this.recognition && this.isRecording) {
      this.recognition.stop();
    }
  }

  toggle() {
    if (this.isRecording) {
      this.stop();
    } else {
      this.start();
    }
  }

  setLanguage(lang) {
    if (this.recognition) {
      this.recognition.lang = lang;
      localStorage.setItem('voice_lang', lang);
    }
  }
}
