import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

// Expose the bundled Capacitor proxy to the existing single-page application.
window.FurnitureSpeechRecognition = SpeechRecognition;
window.FurnitureSecureStorage = SecureStorage;
